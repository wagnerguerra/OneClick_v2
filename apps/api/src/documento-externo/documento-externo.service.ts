import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarDocumentoExternoInput, AtualizarDocumentoExternoInput,
  NovaRevisaoDocumentoExternoInput, ListarDocumentosExternosInput,
} from '@saas/types'

/**
 * Documentos Externos — port do `sgq_externos` do v1, no mesmo desenho de
 * Documentos Internos / Tabelas de Registros: identidade + revisões +
 * ponteiro da vigente. Sem upload: o documento é de terceiro; o registro
 * guarda de onde ele vem (emissor) e onde mora (local/link).
 *
 * O mapa de processos é COMPARTILHADO com Documentos Internos
 * (`documento_processos`) — no v1 ambos apontam para a mesma `sgq_proc`.
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

@Injectable()
export class DocumentoExternoService {
  private async nomesPorId(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } })
    return new Map(users.map((u) => [u.id, u.name]))
  }

  async listar(input: ListarDocumentosExternosInput, empresaId?: string | null) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []
    if (input.processoId) filtros.push({ processoId: input.processoId })
    if (search) {
      filtros.push({ OR: [
        { nome: { contains: search, mode: 'insensitive' } },
        { versoes: { some: { emissor: { contains: search, mode: 'insensitive' } } } },
      ] })
    }

    const where = { empresaId: empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }
    const orderBy = sortBy ? { [sortBy]: sortDir } : { nome: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.documentoExterno.findMany({
        where, orderBy, skip, take,
        select: {
          id: true, legacyId: true, nome: true,
          processo: { select: { id: true, nome: true } },
          versaoAtual: { select: { id: true, revisao: true, dataRegistro: true, emissor: true, link: true } },
          _count: { select: { versoes: true } },
        },
      }),
      prisma.documentoExterno.count({ where }),
    ])
    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, empresaId?: string | null) {
    const d = await prisma.documentoExterno.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        processo: { select: { id: true, nome: true } },
        versaoAtual: { select: { id: true, revisao: true } },
        versoes: { orderBy: { revisao: 'desc' } },
      },
    })
    if (!d) throw new Error('Documento não encontrado.')

    // Nomes resolvidos no payload: id do v2 quando existe, resíduo do v1 senão.
    const nomes = await this.nomesPorId(d.versoes.flatMap((v) => [v.registradoPorId, v.responsavelId]))
    return {
      ...d,
      versoes: d.versoes.map((v) => ({
        ...v,
        registradoPorNome: (v.registradoPorId ? nomes.get(v.registradoPorId) : null) ?? v.registradoPorNome,
        responsavelNome: (v.responsavelId ? nomes.get(v.responsavelId) : null) ?? v.responsavelNome,
      })),
    }
  }

  /** Cria o documento já com a revisão 0 — registro sem conteúdo não existe. */
  async criar(input: CriarDocumentoExternoInput, usuarioId: string, empresaId?: string | null) {
    return prisma.$transaction(async (tx) => {
      const d = await tx.documentoExterno.create({
        data: {
          empresaId: empresaId ?? null,
          nome: input.nome.trim(),
          processoId: input.processoId || null,
        },
        select: { id: true },
      })
      const v = await tx.documentoExternoVersao.create({
        data: {
          documentoId: d.id,
          revisao: 0,
          dataRegistro: dataDeISO(input.dataRegistro),
          emissor: input.emissor?.trim() || null,
          local: input.local || null,
          link: input.link?.trim() || null,
          observacao: input.observacao || null,
          registradoPorId: usuarioId,
          responsavelId: input.responsavelId || null,
        },
        select: { id: true },
      })
      await tx.documentoExterno.update({ where: { id: d.id }, data: { versaoAtualId: v.id } })
      return d
    })
  }

  async atualizar(input: AtualizarDocumentoExternoInput, empresaId?: string | null) {
    const { id, ...campos } = input
    await this.getById(id, empresaId)
    return prisma.documentoExterno.update({
      where: { id },
      data: {
        ...(campos.nome !== undefined ? { nome: campos.nome.trim() } : {}),
        ...(campos.processoId !== undefined ? { processoId: campos.processoId || null } : {}),
      },
      select: { id: true },
    })
  }

  /** Nova revisão: numera pela última + 1 e vira a vigente, numa transação. */
  async novaRevisao(input: NovaRevisaoDocumentoExternoInput, usuarioId: string, empresaId?: string | null) {
    const d = await this.getById(input.documentoId, empresaId)
    return prisma.$transaction(async (tx) => {
      const ultima = await tx.documentoExternoVersao.findFirst({
        where: { documentoId: d.id },
        orderBy: { revisao: 'desc' },
        select: { revisao: true },
      })
      const v = await tx.documentoExternoVersao.create({
        data: {
          documentoId: d.id,
          revisao: (ultima?.revisao ?? -1) + 1,
          dataRegistro: dataDeISO(input.dataRegistro),
          emissor: input.emissor?.trim() || null,
          local: input.local || null,
          link: input.link?.trim() || null,
          observacao: input.observacao || null,
          registradoPorId: usuarioId,
          responsavelId: input.responsavelId || null,
        },
        select: { id: true, revisao: true },
      })
      await tx.documentoExterno.update({ where: { id: d.id }, data: { versaoAtualId: v.id } })
      return v
    })
  }

  async excluir(id: string, empresaId?: string | null) {
    await this.getById(id, empresaId)
    // Zera o ponteiro antes: a FK da vigente atrapalharia a ordem do cascade.
    await prisma.documentoExterno.update({ where: { id }, data: { versaoAtualId: null } })
    await prisma.documentoExterno.delete({ where: { id } })
    return { id }
  }

  /** O mapa de processos compartilhado com Documentos Internos. */
  async listarProcessos(empresaId?: string | null) {
    return prisma.documentoProcesso.findMany({
      where: { empresaId: empresaId ?? null, ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    })
  }

  async listarUsuarios(empresaId?: string | null) {
    return prisma.user.findMany({
      where: { OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true },
    })
  }
}
