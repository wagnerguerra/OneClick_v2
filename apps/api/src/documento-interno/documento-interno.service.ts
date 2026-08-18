import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarDocumentoInput, AtualizarDocumentoInput, NovaRevisaoInput,
  ListarDocumentosInput, AprovarRevisaoInput, DocumentoProcessoInput, DocumentoTipoInput,
} from '@saas/types'

/**
 * Documentos Internos da Qualidade — port do `sgq_documentos` do v1.
 *
 * O documento é um registro só; as revisões penduram nele e `versaoAtualId`
 * aponta para a vigente. Publicar uma revisão nova empurra a anterior para
 * SUBSTITUIDO e move o ponteiro — as duas coisas na mesma transação, senão um
 * erro no meio deixaria o documento com duas vigentes ou nenhuma.
 *
 * Levantamento do legado: docs/migracao-documentos-internos-v1.md
 */

/** Data pura: o campo é DATE e não pode escorregar por fuso. */
function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

@Injectable()
export class DocumentoInternoService {
  // ── Leitura ───────────────────────────────────────────────

  async listar(
    input: ListarDocumentosInput,
    ctx: { empresaId?: string | null; verNaoAprovados: boolean },
  ) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []
    if (input.tipoId) filtros.push({ tipoId: input.tipoId })
    if (input.processoId) filtros.push({ processoId: input.processoId })
    if (input.situacao) filtros.push({ versaoAtual: { situacao: input.situacao } })
    if (search) filtros.push({ nome: { contains: search, mode: 'insensitive' } })

    // Quem não pode ver o que ainda não foi aprovado só enxerga documento cuja
    // versão vigente já passou pela aprovação. É o recorte do perfil `usu/` do
    // v1, que listava apenas o que estava publicado.
    if (!ctx.verNaoAprovados) {
      filtros.push({ versaoAtual: { situacao: { in: ['APROVADO', 'SUBSTITUIDO'] } } })
    }

    const where = { empresaId: ctx.empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }
    const orderBy = sortBy ? { [sortBy]: sortDir } : { nome: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.documentoInterno.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true, legacyId: true, nome: true,
          tipo: { select: { id: true, nome: true } },
          processo: { select: { id: true, nome: true } },
          versaoAtual: {
            select: {
              id: true, revisao: true, situacao: true, dataVersao: true,
              arquivoPath: true, arquivoNome: true, aprovadoEm: true,
            },
          },
          _count: { select: { versoes: true } },
        },
      }),
      prisma.documentoInterno.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, empresaId?: string | null) {
    const d = await prisma.documentoInterno.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        tipo: { select: { id: true, nome: true } },
        processo: { select: { id: true, nome: true } },
        versaoAtual: { select: { id: true, revisao: true } },
        // Histórico completo: é o que a ISO pede e o que o v1 mostrava em
        // `versoes.asp`. Da mais nova para a mais antiga.
        versoes: {
          orderBy: { revisao: 'desc' },
          include: { elaboradores: true },
        },
        logs: { orderBy: { criadoEm: 'desc' }, take: 100 },
      },
    })
    if (!d) throw new Error('Documento não encontrado.')
    return d
  }

  /** Uma revisão específica — usado pelo download e pela tela de aprovação. */
  async getVersao(versaoId: string, empresaId?: string | null) {
    const v = await prisma.documentoInternoVersao.findFirst({
      where: { id: versaoId, documento: { empresaId: empresaId ?? null } },
      include: {
        documento: { select: { id: true, nome: true, tipo: { select: { id: true, nome: true } } } },
        elaboradores: true,
      },
    })
    if (!v) throw new Error('Revisão não encontrada.')
    return v
  }

  // ── Escrita ───────────────────────────────────────────────

  /** Cria o documento junto com a revisão 0 — documento sem arquivo não serve. */
  async criar(input: CriarDocumentoInput, usuarioId: string, empresaId?: string | null) {
    const doc = await prisma.$transaction(async (tx) => {
      const criado = await tx.documentoInterno.create({
        data: {
          empresaId: empresaId ?? null,
          nome: input.nome.trim(),
          tipoId: input.tipoId || null,
          processoId: input.processoId || null,
        },
        select: { id: true },
      })

      const versao = await tx.documentoInternoVersao.create({
        data: {
          documentoId: criado.id,
          revisao: 0,
          situacao: 'NOVO',
          dataVersao: dataDeISO(input.dataVersao),
          arquivoPath: input.arquivoPath,
          arquivoNome: input.arquivoNome || null,
          mime: input.mime || null,
          bytes: input.bytes ?? null,
          alteracao: input.alteracao || null,
          justificativa: input.justificativa || null,
          registradoPorId: usuarioId,
          elaboradores: { create: this.normalizarElaboradores(input.elaboradores) },
        },
        select: { id: true },
      })

      await tx.documentoInterno.update({
        where: { id: criado.id },
        data: { versaoAtualId: versao.id },
      })
      return criado
    })

    await this.registrarLog(doc.id, usuarioId, 'DOCUMENTO_CRIADO')
    return doc
  }

  async atualizar(input: AtualizarDocumentoInput, usuarioId: string, empresaId?: string | null) {
    const { id, ...campos } = input
    await this.exigir(id, empresaId)
    await prisma.documentoInterno.update({
      where: { id },
      data: {
        ...(campos.nome !== undefined ? { nome: campos.nome.trim() } : {}),
        ...(campos.tipoId !== undefined ? { tipoId: campos.tipoId || null } : {}),
        ...(campos.processoId !== undefined ? { processoId: campos.processoId || null } : {}),
      },
    })
    await this.registrarLog(id, usuarioId, 'DOCUMENTO_EDITADO')
    return { id }
  }

  /**
   * Publica uma revisão nova. A numeração vem daqui (última + 1), a anterior
   * vai para SUBSTITUIDO e o ponteiro da vigente muda — tudo numa transação.
   */
  async novaRevisao(input: NovaRevisaoInput, usuarioId: string, empresaId?: string | null) {
    const doc = await this.exigir(input.documentoId, empresaId)

    const versao = await prisma.$transaction(async (tx) => {
      const ultima = await tx.documentoInternoVersao.findFirst({
        where: { documentoId: doc.id },
        orderBy: { revisao: 'desc' },
        select: { id: true, revisao: true },
      })

      const nova = await tx.documentoInternoVersao.create({
        data: {
          documentoId: doc.id,
          revisao: (ultima?.revisao ?? -1) + 1,
          situacao: 'NOVO',
          dataVersao: dataDeISO(input.dataVersao),
          arquivoPath: input.arquivoPath,
          arquivoNome: input.arquivoNome || null,
          mime: input.mime || null,
          bytes: input.bytes ?? null,
          alteracao: input.alteracao || null,
          justificativa: input.justificativa || null,
          registradoPorId: usuarioId,
          elaboradores: { create: this.normalizarElaboradores(input.elaboradores) },
        },
        select: { id: true, revisao: true },
      })

      // A anterior só vira "Substituído" se estava valendo. Uma revisão
      // cancelada ou rejeitada não foi substituída — foi descartada, e
      // reescrever isso apagaria o motivo dela ter parado onde parou.
      if (ultima && doc.versaoAtualId === ultima.id) {
        await tx.documentoInternoVersao.updateMany({
          where: { id: ultima.id, situacao: { in: ['APROVADO', 'NOVO', 'EM_APROVACAO'] } },
          data: { situacao: 'SUBSTITUIDO' },
        })
      }

      await tx.documentoInterno.update({
        where: { id: doc.id },
        data: { versaoAtualId: nova.id },
      })
      return nova
    })

    await this.registrarLog(doc.id, usuarioId, 'REVISAO_PUBLICADA', `Revisão ${versao.revisao}`)
    return versao
  }

  /** Manda a revisão para aprovação — o passo que o perfil `apr/` do v1 recebia. */
  async enviarParaAprovacao(versaoId: string, usuarioId: string, empresaId?: string | null) {
    const v = await this.exigirVersao(versaoId, empresaId)
    if (v.situacao !== 'NOVO' && v.situacao !== 'REJEITADO') {
      throw new Error('Só uma revisão nova ou rejeitada pode ir para aprovação.')
    }
    await prisma.documentoInternoVersao.update({
      where: { id: versaoId },
      data: { situacao: 'EM_APROVACAO' },
    })
    await this.registrarLog(v.documentoId, usuarioId, 'REVISAO_ENVIADA_APROVACAO', `Revisão ${v.revisao}`)
    return { id: versaoId }
  }

  /**
   * Aprova ou rejeita — e AQUI fica registrado quem e quando.
   *
   * O v1 tinha o perfil de aprovador e 208 documentos "Aprovado", mas as
   * colunas `usu_aprovacao` e `dt_aprovacao` estão vazias nas 265 linhas: não
   * dava para provar quem aprovou o quê, que é o primeiro pedido da auditoria.
   */
  async aprovar(input: AprovarRevisaoInput, usuarioId: string, empresaId?: string | null) {
    const v = await this.exigirVersao(input.versaoId, empresaId)
    if (v.situacao !== 'EM_APROVACAO') throw new Error('Esta revisão não está em aprovação.')

    await prisma.documentoInternoVersao.update({
      where: { id: input.versaoId },
      data: input.aprovar
        ? { situacao: 'APROVADO', aprovadoPorId: usuarioId, aprovadoEm: new Date() }
        // Rejeição não guarda aprovador: ninguém aprovou. O motivo vai no log.
        : { situacao: 'REJEITADO', aprovadoPorId: null, aprovadoEm: null },
    })
    await this.registrarLog(
      v.documentoId, usuarioId,
      input.aprovar ? 'REVISAO_APROVADA' : 'REVISAO_REJEITADA',
      input.observacao || `Revisão ${v.revisao}`,
    )
    return { id: input.versaoId }
  }

  async cancelarRevisao(versaoId: string, usuarioId: string, empresaId?: string | null) {
    const v = await this.exigirVersao(versaoId, empresaId)
    if (v.situacao === 'APROVADO') {
      throw new Error('Revisão aprovada não se cancela — publique uma revisão nova.')
    }
    await prisma.documentoInternoVersao.update({ where: { id: versaoId }, data: { situacao: 'CANCELADO' } })
    await this.registrarLog(v.documentoId, usuarioId, 'REVISAO_CANCELADA', `Revisão ${v.revisao}`)
    return { id: versaoId }
  }

  async excluir(id: string, empresaId?: string | null) {
    await this.exigir(id, empresaId)
    // O ponteiro da vigente é FK para a versão; zerar antes evita o conflito
    // de ordem no cascade.
    await prisma.documentoInterno.update({ where: { id }, data: { versaoAtualId: null } })
    await prisma.documentoInterno.delete({ where: { id } })
    return { id }
  }

  /**
   * Usuários para o seletor de elaboradores. Endpoint próprio do módulo, e não
   * emprestado de outro: quem cadastra documento não precisa ter Orçamentos.
   */
  async listarUsuarios(empresaId?: string | null) {
    return prisma.user.findMany({
      where: empresaId ? { empresaId } : {},
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: 'asc' },
    })
  }

  // ── Tipos de documento (cadastro) ─────────────────────────

  async listarTipos(empresaId?: string | null, incluirInativos = false) {
    return prisma.documentoTipo.findMany({
      where: { empresaId: empresaId ?? null, ...(incluirInativos ? {} : { ativo: true }) },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
  }

  async criarTipo(input: DocumentoTipoInput, empresaId?: string | null) {
    return prisma.documentoTipo.create({
      data: { empresaId: empresaId ?? null, nome: input.nome.trim(), ordem: input.ordem, ativo: input.ativo },
      select: { id: true },
    })
  }

  async atualizarTipo(id: string, input: Partial<DocumentoTipoInput>, empresaId?: string | null) {
    const t = await prisma.documentoTipo.findFirst({
      where: { id, empresaId: empresaId ?? null }, select: { id: true },
    })
    if (!t) throw new Error('Tipo não encontrado.')
    return prisma.documentoTipo.update({
      where: { id },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
        ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
        ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
      },
      select: { id: true },
    })
  }

  // ── Processos (mapa da ISO) ───────────────────────────────

  async listarProcessos(empresaId?: string | null, incluirInativos = false) {
    return prisma.documentoProcesso.findMany({
      where: { empresaId: empresaId ?? null, ...(incluirInativos ? {} : { ativo: true }) },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
  }

  async criarProcesso(input: DocumentoProcessoInput, empresaId?: string | null) {
    return prisma.documentoProcesso.create({
      data: { empresaId: empresaId ?? null, nome: input.nome.trim(), ordem: input.ordem, ativo: input.ativo },
      select: { id: true },
    })
  }

  async atualizarProcesso(id: string, input: Partial<DocumentoProcessoInput>, empresaId?: string | null) {
    const p = await prisma.documentoProcesso.findFirst({
      where: { id, empresaId: empresaId ?? null }, select: { id: true },
    })
    if (!p) throw new Error('Processo não encontrado.')
    return prisma.documentoProcesso.update({
      where: { id },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome.trim() } : {}),
        ...(input.ordem !== undefined ? { ordem: input.ordem } : {}),
        ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
      },
      select: { id: true },
    })
  }

  // ── Internos ──────────────────────────────────────────────

  /**
   * Elaborador é ou usuário (por ID) ou nome solto — nunca os dois. Com ID, o
   * nome sai da relação e não vira uma segunda verdade que envelhece.
   */
  private normalizarElaboradores(lista: CriarDocumentoInput['elaboradores']) {
    const vistos = new Set<string>()
    const saida: { usuarioId: string | null; nome: string | null }[] = []
    for (const e of lista ?? []) {
      const usuarioId = e.usuarioId || null
      const nome = usuarioId ? null : (e.nome?.trim() || null)
      if (!usuarioId && !nome) continue
      const chave = usuarioId ? `u:${usuarioId}` : `n:${nome!.toLowerCase()}`
      if (vistos.has(chave)) continue
      vistos.add(chave)
      saida.push({ usuarioId, nome })
    }
    return saida
  }

  private async exigir(id: string, empresaId?: string | null) {
    const d = await prisma.documentoInterno.findFirst({
      where: { id, empresaId: empresaId ?? null },
      select: { id: true, nome: true, versaoAtualId: true },
    })
    if (!d) throw new Error('Documento não encontrado.')
    return d
  }

  private async exigirVersao(versaoId: string, empresaId?: string | null) {
    const v = await prisma.documentoInternoVersao.findFirst({
      where: { id: versaoId, documento: { empresaId: empresaId ?? null } },
      select: { id: true, documentoId: true, revisao: true, situacao: true },
    })
    if (!v) throw new Error('Revisão não encontrada.')
    return v
  }

  /** Falha de log nunca derruba a operação que a originou. */
  private async registrarLog(documentoId: string, usuarioId: string | null, evento: string, detalhe?: string) {
    await prisma.documentoInternoLog.create({
      data: { documentoId, usuarioId, evento, detalhe: detalhe ?? null },
    }).catch(() => undefined)
  }
}
