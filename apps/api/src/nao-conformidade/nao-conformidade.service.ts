import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarNaoConformidadeInput, AtualizarNaoConformidadeInput, RegistrarCausaNcInput,
  RegistrarFormaAvaliacaoNcInput, AvaliarNcInput, AtualizacaoSistemaNcInput, CancelarNcInput,
  CriarNcAcaoInput, AtualizarNcAcaoInput, ConcluirNcAcaoInput, CriarNcMensagemInput,
  CriarNcOrigemInput, AtualizarNcOrigemInput, ListarNaoConformidadesInput,
} from '@saas/types'

/**
 * Não Conformidades — port do `sgq_rnc` do v1. O fluxo de situações é
 * atualizado AQUI, a cada passo (registro → causa → ações → forma de
 * avaliação → avaliação final), e o front só exibe — nunca decide transição.
 * Avaliação NÃO eficaz gera reincidência automática (nova NC apontando a
 * anterior), exatamente como o v1 fazia.
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

@Injectable()
export class NaoConformidadeService {
  private async nomesPorId(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } })
    return new Map(users.map((u) => [u.id, u.name]))
  }

  private async log(ncId: string, evento: string, usuarioId?: string | null) {
    await prisma.naoConformidadeLog.create({ data: { ncId, evento, usuarioId: usuarioId ?? null } }).catch(() => {})
  }

  /** Recalcula a situação depois de mexer em ações/eficácia. Regra do v1:
   *  ações abertas = Em Tratamento; tudo concluído + forma de avaliação
   *  registrada = Aguardando Conclusão; sem ações = Aguardando Ações. */
  private async recalcularSituacao(ncId: string) {
    const nc = await prisma.naoConformidade.findUnique({
      where: { id: ncId },
      select: { situacao: true, eficaciaRegistrada: true, acoes: { select: { concluida: true } } },
    })
    if (!nc) return
    if (['FINALIZADA', 'CANCELADA', 'AGUARDANDO_CAUSA'].includes(nc.situacao)) return
    const total = nc.acoes.length
    const abertas = nc.acoes.filter((a) => !a.concluida).length
    let alvo = 'AGUARDANDO_ACOES'
    if (total > 0 && abertas > 0) alvo = 'EM_TRATAMENTO'
    if (total > 0 && abertas === 0 && nc.eficaciaRegistrada) alvo = 'AGUARDANDO_CONCLUSAO'
    if (alvo !== nc.situacao) {
      await prisma.naoConformidade.update({ where: { id: ncId }, data: { situacao: alvo } })
    }
  }

  async listar(input: ListarNaoConformidadesInput, empresaId?: string | null) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = [{ ativo: true }]
    if (input.situacao) filtros.push({ situacao: input.situacao })
    if (input.origemId) filtros.push({ origemId: input.origemId })
    if (input.areaId) filtros.push({ areaId: input.areaId })
    if (input.clienteId) filtros.push({ clienteId: input.clienteId })
    if (input.reincidencia !== undefined) filtros.push({ reincidencia: input.reincidencia })
    if (search) {
      filtros.push({ OR: [
        { detalhamento: { contains: search, mode: 'insensitive' } },
        { clienteNome: { contains: search, mode: 'insensitive' } },
      ] })
    }

    const where = { empresaId: empresaId ?? null, AND: filtros }
    const orderBy = sortBy ? { [sortBy]: sortDir } : { registradoEm: 'desc' as const }

    const [data, total] = await Promise.all([
      prisma.naoConformidade.findMany({
        where, orderBy, skip, take,
        include: {
          origem: { select: { id: true, nome: true } },
          acoes: { select: { concluida: true } },
          _count: { select: { acoes: true, reincidencias: true } },
        },
      }),
      prisma.naoConformidade.count({ where }),
    ])

    // Cliente e área em lote (FKs soltas — resolvidas por nome no payload)
    const clienteIds = [...new Set(data.map((d) => d.clienteId).filter((x): x is string => !!x))]
    const areaIds = [...new Set(data.map((d) => d.areaId).filter((x): x is string => !!x))]
    const [clientes, areas, nomes] = await Promise.all([
      clienteIds.length ? prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, razaoSocial: true } }) : [],
      areaIds.length ? prisma.area.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true } }) : [],
      this.nomesPorId(data.map((d) => d.responsavelId)),
    ])
    const cMap = new Map(clientes.map((c) => [c.id, c.razaoSocial]))
    const aMap = new Map(areas.map((a) => [a.id, a.name]))

    const rows = data.map((d) => ({
      ...d,
      acoes: undefined,
      clienteNomeResolvido: d.clienteId ? cMap.get(d.clienteId) ?? d.clienteNome : d.clienteNome,
      areaNomeResolvida: d.areaId ? aMap.get(d.areaId) ?? d.areaNome : d.areaNome,
      responsavelNomeResolvido: d.responsavelId ? nomes.get(d.responsavelId) ?? d.responsavelNome : d.responsavelNome,
      acoesAbertas: d.acoes.filter((a) => !a.concluida).length,
      acoesTotal: d._count.acoes,
      temReincidencias: d._count.reincidencias > 0,
    }))
    return buildPaginatedResponse(rows, total, page, limit)
  }

  async getById(id: string, empresaId?: string | null) {
    const nc = await prisma.naoConformidade.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        origem: { select: { id: true, nome: true } },
        ncAnterior: { select: { id: true, legacyId: true, detalhamento: true } },
        reincidencias: { select: { id: true, legacyId: true, situacao: true } },
        acoes: { orderBy: [{ concluida: 'asc' }, { prazo: 'asc' }] },
        mensagens: { orderBy: { criadoEm: 'desc' } },
        arquivos: { orderBy: { criadoEm: 'desc' } },
        logs: { orderBy: { criadoEm: 'desc' }, take: 100 },
      },
    })
    if (!nc) throw new Error('Não conformidade não encontrada.')

    const [cliente, area, ncSimilar, nomes] = await Promise.all([
      nc.clienteId ? prisma.cliente.findUnique({ where: { id: nc.clienteId }, select: { id: true, razaoSocial: true, documento: true } }).catch(() => null) : null,
      nc.areaId ? prisma.area.findUnique({ where: { id: nc.areaId }, select: { id: true, name: true } }).catch(() => null) : null,
      nc.ncSimilarId ? prisma.naoConformidade.findUnique({ where: { id: nc.ncSimilarId }, select: { id: true, legacyId: true, detalhamento: true } }).catch(() => null) : null,
      this.nomesPorId([
        nc.registradoPorId, nc.responsavelId, nc.causaPorId, nc.avaliadoPorId, nc.eficaciaResponsavelId,
        ...nc.acoes.flatMap((a) => [a.responsavelId, a.finalizadoPorId]),
        ...nc.mensagens.map((m) => m.autorId),
        ...nc.logs.map((l) => l.usuarioId),
      ]),
    ])

    const nome = (id_: string | null, residuo: string | null) => (id_ ? nomes.get(id_) ?? residuo : residuo)

    return {
      ...nc,
      cliente,
      area,
      ncSimilar,
      registradoPorNomeResolvido: nome(nc.registradoPorId, nc.registradoPorNome),
      responsavelNomeResolvido: nome(nc.responsavelId, nc.responsavelNome),
      causaPorNome: nome(nc.causaPorId, null),
      avaliadoPorNomeResolvido: nome(nc.avaliadoPorId, nc.avaliadoPorNome),
      eficaciaResponsavelNome: nome(nc.eficaciaResponsavelId, null),
      acoes: nc.acoes.map((a) => ({
        ...a,
        responsavelNomeResolvido: nome(a.responsavelId, a.responsavelNome),
        finalizadoPorNome: nome(a.finalizadoPorId, null),
      })),
      mensagens: nc.mensagens.map((m) => ({ ...m, autorNomeResolvido: nome(m.autorId, m.autorNome) })),
      logs: nc.logs.map((l) => ({ ...l, usuarioNomeResolvido: nome(l.usuarioId, l.usuarioNome) })),
    }
  }

  async criar(input: CriarNaoConformidadeInput, usuarioId: string, empresaId?: string | null) {
    const temCausa = !!input.causa?.replace(/<[^>]*>/g, '').trim()
    const nc = await prisma.naoConformidade.create({
      data: {
        empresaId: empresaId ?? null,
        situacao: temCausa ? 'AGUARDANDO_ACOES' : 'AGUARDANDO_CAUSA',
        clienteId: input.clienteId || null,
        areaId: input.areaId || null,
        processoId: input.processoId || null,
        origemId: input.origemId || null,
        registradoPorId: usuarioId,
        responsavelId: input.responsavelId || null,
        prazo: input.prazo ? dataDeISO(input.prazo) : null,
        detalhamento: input.detalhamento,
        causa: temCausa ? input.causa : null,
        causaEm: temCausa ? new Date() : null,
        causaPorId: temCausa ? usuarioId : null,
        ncSimilarId: input.ncSimilarId || null,
        ncSimilarTexto: input.ncSimilarTexto || null,
      },
      select: { id: true },
    })
    await this.log(nc.id, 'NC_REGISTRADA', usuarioId)
    return nc
  }

  async atualizar(input: AtualizarNaoConformidadeInput, usuarioId: string, empresaId?: string | null) {
    const { id, ...c } = input
    await this.getById(id, empresaId)
    await prisma.naoConformidade.update({
      where: { id },
      data: {
        ...(c.clienteId !== undefined ? { clienteId: c.clienteId || null, clienteNome: null } : {}),
        ...(c.areaId !== undefined ? { areaId: c.areaId || null, areaNome: null } : {}),
        ...(c.processoId !== undefined ? { processoId: c.processoId || null } : {}),
        ...(c.origemId !== undefined ? { origemId: c.origemId || null } : {}),
        ...(c.responsavelId !== undefined ? { responsavelId: c.responsavelId || null, responsavelNome: null } : {}),
        ...(c.prazo !== undefined ? { prazo: c.prazo ? dataDeISO(c.prazo) : null } : {}),
        ...(c.detalhamento !== undefined ? { detalhamento: c.detalhamento } : {}),
        ...(c.ncSimilarId !== undefined ? { ncSimilarId: c.ncSimilarId || null } : {}),
        ...(c.ncSimilarTexto !== undefined ? { ncSimilarTexto: c.ncSimilarTexto || null } : {}),
      },
    })
    await this.log(id, 'NC_EDITADA', usuarioId)
    return { id }
  }

  async registrarCausa(input: RegistrarCausaNcInput, usuarioId: string, empresaId?: string | null) {
    const nc = await this.getById(input.id, empresaId)
    await prisma.naoConformidade.update({
      where: { id: input.id },
      data: {
        causa: input.causa, causaEm: new Date(), causaPorId: usuarioId,
        ...(nc.situacao === 'AGUARDANDO_CAUSA' ? { situacao: 'AGUARDANDO_ACOES' } : {}),
      },
    })
    await this.log(input.id, 'CAUSA_REGISTRADA', usuarioId)
    return { id: input.id }
  }

  async registrarFormaAvaliacao(input: RegistrarFormaAvaliacaoNcInput, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.id, empresaId)
    await prisma.naoConformidade.update({
      where: { id: input.id },
      data: {
        eficaciaDetalhes: input.eficaciaDetalhes,
        eficaciaPrazo: input.eficaciaPrazo ? dataDeISO(input.eficaciaPrazo) : null,
        eficaciaResponsavelId: usuarioId,
        eficaciaRegistrada: true,
      },
    })
    await this.log(input.id, 'FORMA_AVALIACAO_REGISTRADA', usuarioId)
    await this.recalcularSituacao(input.id)
    return { id: input.id }
  }

  /** Avaliação final. NÃO eficaz → FINALIZADA + reincidência automática. */
  async avaliar(input: AvaliarNcInput, usuarioId: string, empresaId?: string | null) {
    const nc = await this.getById(input.id, empresaId)
    if (nc.situacao === 'FINALIZADA' || nc.situacao === 'CANCELADA') {
      throw new Error('Esta não conformidade já foi encerrada.')
    }
    await prisma.naoConformidade.update({
      where: { id: input.id },
      data: {
        avaliacao: input.avaliacao, eficaz: input.eficaz,
        avaliadoPorId: usuarioId, avaliadoEm: new Date(),
        situacao: 'FINALIZADA',
      },
    })
    await this.log(input.id, input.eficaz ? 'AVALIADA_EFICAZ' : 'AVALIADA_NAO_EFICAZ', usuarioId)

    let reincidenciaId: string | null = null
    if (!input.eficaz) {
      // Porta do v1: tratamento ineficaz reabre o problema numa NC nova.
      const nova = await prisma.naoConformidade.create({
        data: {
          empresaId: nc.empresaId,
          situacao: 'AGUARDANDO_CAUSA',
          tipo: nc.tipo,
          clienteId: nc.clienteId, clienteNome: nc.clienteNome,
          areaId: nc.areaId, areaNome: nc.areaNome,
          processoId: nc.processoId, origemId: nc.origemId,
          registradoPorId: usuarioId,
          responsavelId: nc.responsavelId, responsavelNome: nc.responsavelNome,
          detalhamento: nc.detalhamento,
          reincidencia: true,
          ncAnteriorId: nc.id,
        },
        select: { id: true },
      })
      reincidenciaId = nova.id
      await this.log(nova.id, 'NC_REGISTRADA_POR_REINCIDENCIA', usuarioId)
    }
    return { id: input.id, reincidenciaId }
  }

  async registrarAtualizacaoSistema(input: AtualizacaoSistemaNcInput, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.id, empresaId)
    await prisma.naoConformidade.update({
      where: { id: input.id },
      data: {
        atualizaSwot: input.atualizaSwot,
        atualizaSwotDesc: input.atualizaSwotDesc || null,
        atualizaRevisao: input.atualizaRevisao,
        atualizaRevisaoDesc: input.atualizaRevisaoDesc || null,
      },
    })
    await this.log(input.id, 'ATUALIZACAO_SISTEMA_REGISTRADA', usuarioId)
    return { id: input.id }
  }

  async cancelar(input: CancelarNcInput, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.id, empresaId)
    await prisma.naoConformidade.update({ where: { id: input.id }, data: { situacao: 'CANCELADA' } })
    await this.log(input.id, `CANCELADA: ${input.motivo}`, usuarioId)
    return { id: input.id }
  }

  /** Soft-delete, como o v1 (ativo=0). */
  async excluir(id: string, usuarioId: string, empresaId?: string | null) {
    await this.getById(id, empresaId)
    await prisma.naoConformidade.update({ where: { id }, data: { ativo: false } })
    await this.log(id, 'NC_EXCLUIDA', usuarioId)
    return { id }
  }

  // ── Plano de ação ──────────────────────────────────────────────

  async criarAcao(input: CriarNcAcaoInput, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.ncId, empresaId)
    const acao = await prisma.naoConformidadeAcao.create({
      data: {
        ncId: input.ncId, tipo: input.tipo, descricao: input.descricao,
        responsavelId: input.responsavelId || null,
        prazo: input.prazo ? dataDeISO(input.prazo) : null,
      },
      select: { id: true },
    })
    await this.log(input.ncId, 'ACAO_REGISTRADA', usuarioId)
    await this.recalcularSituacao(input.ncId)
    return acao
  }

  async atualizarAcao(input: AtualizarNcAcaoInput, usuarioId: string) {
    const { id, ...c } = input
    const acao = await prisma.naoConformidadeAcao.update({
      where: { id },
      data: {
        ...(c.tipo !== undefined ? { tipo: c.tipo } : {}),
        ...(c.descricao !== undefined ? { descricao: c.descricao } : {}),
        ...(c.responsavelId !== undefined ? { responsavelId: c.responsavelId || null, responsavelNome: null } : {}),
        ...(c.prazo !== undefined ? { prazo: c.prazo ? dataDeISO(c.prazo) : null } : {}),
      },
      select: { id: true, ncId: true },
    })
    await this.log(acao.ncId, 'ACAO_EDITADA', usuarioId)
    return acao
  }

  async concluirAcao(input: ConcluirNcAcaoInput, usuarioId: string) {
    const acao = await prisma.naoConformidadeAcao.update({
      where: { id: input.id },
      data: input.concluida
        ? { concluida: true, finalizadoEm: new Date(), finalizadoPorId: usuarioId, observacao: input.observacao || null }
        : { concluida: false, finalizadoEm: null, finalizadoPorId: null },
      select: { id: true, ncId: true },
    })
    await this.log(acao.ncId, input.concluida ? 'ACAO_CONCLUIDA' : 'ACAO_REABERTA', usuarioId)
    await this.recalcularSituacao(acao.ncId)
    return acao
  }

  async excluirAcao(id: string, usuarioId: string) {
    const acao = await prisma.naoConformidadeAcao.delete({ where: { id }, select: { ncId: true } })
    await this.log(acao.ncId, 'ACAO_EXCLUIDA', usuarioId)
    await this.recalcularSituacao(acao.ncId)
    return { id }
  }

  // ── Mensagens ──────────────────────────────────────────────────

  async criarMensagem(input: CriarNcMensagemInput, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.ncId, empresaId)
    return prisma.naoConformidadeMensagem.create({
      data: { ncId: input.ncId, texto: input.texto, autorId: usuarioId },
      select: { id: true },
    })
  }

  async excluirMensagem(id: string) {
    await prisma.naoConformidadeMensagem.delete({ where: { id } })
    return { id }
  }

  // ── Origens (cadastro) ─────────────────────────────────────────

  async listarOrigens(empresaId?: string | null, apenasAtivas = true) {
    return prisma.naoConformidadeOrigem.findMany({
      where: { empresaId: empresaId ?? null, ...(apenasAtivas ? { ativo: true } : {}) },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
  }

  async criarOrigem(input: CriarNcOrigemInput, empresaId?: string | null) {
    return prisma.naoConformidadeOrigem.create({
      data: { empresaId: empresaId ?? null, nome: input.nome.trim() },
      select: { id: true },
    })
  }

  async atualizarOrigem(input: AtualizarNcOrigemInput) {
    const { id, ...c } = input
    return prisma.naoConformidadeOrigem.update({
      where: { id },
      data: {
        ...(c.nome !== undefined ? { nome: c.nome.trim() } : {}),
        ...(c.ativo !== undefined ? { ativo: c.ativo } : {}),
        ...(c.ordem !== undefined ? { ordem: c.ordem } : {}),
      },
      select: { id: true },
    })
  }

  // ── Apoios ─────────────────────────────────────────────────────

  async listarUsuarios(empresaId?: string | null) {
    return prisma.user.findMany({
      where: { OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true },
    })
  }

  async listarAreas(empresaId?: string | null) {
    return prisma.area.findMany({
      where: { isActive: true, OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
  }

  async listarProcessos(empresaId?: string | null) {
    return prisma.documentoProcesso.findMany({
      where: { empresaId: empresaId ?? null, ativo: true },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
      select: { id: true, nome: true },
    })
  }

  async listarClientes(empresaId?: string | null) {
    return prisma.cliente.findMany({
      where: {
        status: { not: 'INATIVA' },
        OR: [{ empresaId: empresaId ?? null }, { empresaId: null }],
      },
      orderBy: { razaoSocial: 'asc' },
      select: { id: true, razaoSocial: true, documento: true },
    })
  }

  /** Busca leve de NCs para o campo "NC similar". */
  async buscarSimilares(termo: string, empresaId?: string | null) {
    return prisma.naoConformidade.findMany({
      where: {
        empresaId: empresaId ?? null, ativo: true,
        ...(termo ? { detalhamento: { contains: termo, mode: 'insensitive' } } : {}),
      },
      orderBy: { registradoEm: 'desc' },
      take: 20,
      select: { id: true, legacyId: true, detalhamento: true, situacao: true },
    })
  }
}
