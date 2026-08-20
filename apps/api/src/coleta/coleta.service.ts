import { Injectable, ForbiddenException } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import { COLETA_TRANSICOES } from '@saas/types'
import type {
  CriarColetaInput, AtualizarColetaInput, TransitarColetaInput, ExcluirColetaInput,
  CriarColetaCategoriaInput, AtualizarColetaCategoriaInput, ListarColetasInput,
  ColetaTransicao,
} from '@saas/types'

/**
 * Coleta e Recebimento — port fiel do `crp_coleta` do v1. A lógica de QUEM
 * faz O QUE e QUANDO mora aqui:
 *
 *  - quem: cada transição exige o papel do v1 (sub-permissão `rota` =
 *    Recepção, `arquivo` = Arquivo), validado no router e REVALIDADO aqui;
 *  - o que: as transições nomeadas de COLETA_TRANSICOES, com o destino e o
 *    texto de evento idênticos aos ASPs originais;
 *  - quando: TODA ação grava ColetaLog (evento, situação resultante, autor,
 *    timestamp) — a continuação do crpcltlog.
 *
 * Situação inicial fiel ao adm/enviar.asp: Entrega/Coleta nascem Aguardando
 * Rota; Recebimento nasce Entregue ao Arquivo (o documento já chegou).
 */

type Papeis = { rota: boolean; arquivo: boolean; admin: boolean }

@Injectable()
export class ColetaService {
  private async nomesPorId(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } })
    return new Map(users.map((u) => [u.id, u.name]))
  }

  private async log(coletaId: string, evento: string, usuarioId?: string | null, situacao?: string | null) {
    await prisma.coletaLog.create({
      data: { coletaId, evento, usuarioId: usuarioId ?? null, situacao: situacao ?? null },
    }).catch(() => {})
  }

  async listar(input: ListarColetasInput, ctx: { userId: string; empresaId?: string | null }) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = [{ ativo: true }]
    if (input.tipo) filtros.push({ tipo: input.tipo })
    if (input.situacao) filtros.push({ situacao: input.situacao })
    if (input.categoriaId) filtros.push({ categoriaId: input.categoriaId })
    if (input.clienteId) filtros.push({ clienteId: input.clienteId })
    if (input.somenteMinhas) filtros.push({ solicitanteId: ctx.userId })
    if (search) {
      filtros.push({ OR: [
        { descricao: { contains: search, mode: 'insensitive' } },
        { clienteNome: { contains: search, mode: 'insensitive' } },
        { contato: { contains: search, mode: 'insensitive' } },
      ] })
    }

    const where = { empresaId: ctx.empresaId ?? null, AND: filtros }
    const orderBy = sortBy ? { [sortBy]: sortDir } : [{ prioridade: 'desc' as const }, { registradoEm: 'desc' as const }]

    const [data, total] = await Promise.all([
      prisma.coleta.findMany({
        where, orderBy, skip, take,
        include: { categoria: { select: { id: true, nome: true } }, _count: { select: { logs: true } } },
      }),
      prisma.coleta.count({ where }),
    ])

    const clienteIds = [...new Set(data.map((d) => d.clienteId).filter((x): x is string => !!x))]
    const [clientes, nomes] = await Promise.all([
      clienteIds.length ? prisma.cliente.findMany({ where: { id: { in: clienteIds } }, select: { id: true, razaoSocial: true } }) : [],
      this.nomesPorId(data.map((d) => d.solicitanteId)),
    ])
    const cMap = new Map(clientes.map((c) => [c.id, c.razaoSocial]))

    const rows = data.map((d) => ({
      ...d,
      clienteNomeResolvido: d.clienteId ? cMap.get(d.clienteId) ?? d.clienteNome : d.clienteNome,
      solicitanteNomeResolvido: d.solicitanteId ? nomes.get(d.solicitanteId) ?? d.solicitanteNome : d.solicitanteNome,
    }))
    return buildPaginatedResponse(rows, total, page, limit)
  }

  async getById(id: string, papeis: Papeis, empresaId?: string | null) {
    const c = await prisma.coleta.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        categoria: { select: { id: true, nome: true, areaId: true } },
        logs: { orderBy: { criadoEm: 'desc' }, take: 200 },
      },
    })
    if (!c) throw new Error('Registro não encontrado.')
    const [cliente, nomes] = await Promise.all([
      c.clienteId ? prisma.cliente.findUnique({ where: { id: c.clienteId }, select: { id: true, razaoSocial: true } }).catch(() => null) : null,
      this.nomesPorId([c.solicitanteId, ...c.logs.map((l) => l.usuarioId)]),
    ])
    return {
      ...c,
      cliente,
      solicitanteNomeResolvido: c.solicitanteId ? nomes.get(c.solicitanteId) ?? c.solicitanteNome : c.solicitanteNome,
      // Quais transições ESTE usuário pode disparar agora — decidido aqui,
      // nunca no front (padrão de estados derivados).
      transicoesDisponiveis: this.transicoesPara(c.situacao, c.ativo, papeis),
      logs: c.logs.map((l) => ({ ...l, usuarioNomeResolvido: l.usuarioId ? nomes.get(l.usuarioId) ?? l.usuarioNome : l.usuarioNome })),
    }
  }

  /**
   * O QUE cada papel pode fazer em cada situação — o mapa dos botões que o
   * v1 espalhava pelas pastas adm/ e arq/.
   */
  private transicoesPara(situacao: string, ativo: boolean, papeis: Papeis): ColetaTransicao[] {
    if (!ativo) return []
    const out: ColetaTransicao[] = []
    const pode = (papel: 'rota' | 'arquivo') => papeis.admin || papeis[papel]

    // Recepção/rota: confirma a rota pedida, dá entrada no prédio e repassa
    // ao arquivo (documento ou só o protocolo).
    if (pode('rota')) {
      if (situacao === 'AGUARDANDO_ROTA') out.push('CONFIRMAR_ROTA')
      if (['ROTA_CONFIRMADA', 'AGUARDANDO_ROTA'].includes(situacao)) out.push('RECEBER_RECEPCAO')
      if (['NA_RECEPCAO', 'ROTA_CONFIRMADA'].includes(situacao)) out.push('ENTREGAR_ARQUIVO', 'PROTOCOLO_ENTREGUE')
    }
    // Arquivo: tria o que chegou, distribui aos setores, recolhe de volta,
    // libera retirada, encerra arquivando — e pode pedir entrega ao cliente.
    if (pode('arquivo')) {
      if (['ENTREGUE_ARQUIVO', 'NA_RECEPCAO', 'PROTOCOLO_ENTREGUE'].includes(situacao)) out.push('TRIAGEM')
      if (['EM_TRIAGEM', 'ENTREGUE_ARQUIVO', 'DEVOLVIDO_ARQUIVO'].includes(situacao)) out.push('ENTREGAR_SETOR', 'DISPONIBILIZAR_RETIRADA')
      if (['NO_SETOR', 'RETIRADA_DISPONIVEL'].includes(situacao)) out.push('DEVOLVER_ARQUIVO')
      if (['EM_TRIAGEM', 'DEVOLVIDO_ARQUIVO', 'ENTREGUE_ARQUIVO', 'PROTOCOLO_ENTREGUE', 'NO_SETOR'].includes(situacao)) out.push('ARQUIVAR_PROTOCOLO')
      if (['PROTOCOLO_ARQUIVADO', 'DEVOLVIDO_ARQUIVO', 'ENTREGUE_ARQUIVO'].includes(situacao)) out.push('SOLICITAR_ENTREGA_CLIENTE')
    }
    return [...new Set(out)]
  }

  async criar(input: CriarColetaInput, usuarioId: string, empresaId?: string | null) {
    // Fiel ao adm/enviar.asp: Recebimento já chegou → Entregue ao Arquivo.
    const situacao = input.tipo === 'RECEBIMENTO' ? 'ENTREGUE_ARQUIVO' : 'AGUARDANDO_ROTA'
    const c = await prisma.coleta.create({
      data: {
        empresaId: empresaId ?? null,
        tipo: input.tipo,
        situacao,
        categoriaId: input.categoriaId || null,
        competencia: input.competencia || null,
        prioridade: input.prioridade ?? 0,
        clienteId: input.clienteId || null,
        contato: input.contato?.trim() || null,
        solicitanteId: usuarioId,
        descricao: input.descricao || null,
      },
      select: { id: true },
    })
    await this.log(c.id, 'Registro criado', usuarioId, situacao)
    return c
  }

  async atualizar(input: AtualizarColetaInput, usuarioId: string, papeis: Papeis, empresaId?: string | null) {
    const { id, ...c } = input
    const atual = await this.getById(id, papeis, empresaId)
    // Fiel ao usu/enviar_editar.asp: o solicitante edita a própria solicitação;
    // os papéis (e o master) editam qualquer uma.
    if (!(papeis.admin || papeis.rota || papeis.arquivo || atual.solicitanteId === usuarioId)) {
      throw new ForbiddenException('Só o solicitante (ou a Recepção/Arquivo) pode editar este registro.')
    }
    await prisma.coleta.update({
      where: { id },
      data: {
        ...(c.clienteId !== undefined ? { clienteId: c.clienteId || null, clienteNome: null } : {}),
        ...(c.contato !== undefined ? { contato: c.contato?.trim() || null } : {}),
        ...(c.categoriaId !== undefined ? { categoriaId: c.categoriaId || null } : {}),
        ...(c.competencia !== undefined ? { competencia: c.competencia || null } : {}),
        ...(c.prioridade !== undefined ? { prioridade: c.prioridade } : {}),
        ...(c.descricao !== undefined ? { descricao: c.descricao || null } : {}),
      },
    })
    await this.log(id, 'Dados editados', usuarioId)
    return { id }
  }

  /** A transição — o coração do "quem faz o que e quando". */
  async transitar(input: TransitarColetaInput, usuarioId: string, papeis: Papeis, empresaId?: string | null) {
    const c = await this.getById(input.id, papeis, empresaId)
    if (!c.transicoesDisponiveis.includes(input.transicao)) {
      throw new ForbiddenException('Esta ação não está disponível para você nesta situação.')
    }
    const t = COLETA_TRANSICOES[input.transicao]
    await prisma.coleta.update({
      where: { id: c.id },
      data: {
        situacao: t.destino,
        // Fiel ao arq/solicitar_entrega.asp: pedir entrega ao cliente vira ENTREGA.
        ...(input.transicao === 'SOLICITAR_ENTREGA_CLIENTE' ? { tipo: 'ENTREGA' } : {}),
      },
    })
    await this.log(c.id, t.evento, usuarioId, t.destino)
    return { id: c.id, situacao: t.destino }
  }

  /** Soft-delete com motivo obrigatório, fiel ao modal-delete do v1. */
  async excluir(input: ExcluirColetaInput, usuarioId: string, papeis: Papeis, empresaId?: string | null) {
    const c = await this.getById(input.id, papeis, empresaId)
    if (!(papeis.admin || papeis.rota || papeis.arquivo || c.solicitanteId === usuarioId)) {
      throw new ForbiddenException('Só o solicitante (ou a Recepção/Arquivo) pode excluir este registro.')
    }
    await prisma.coleta.update({ where: { id: input.id }, data: { ativo: false, motivoExclusao: input.motivo.trim() } })
    await this.log(input.id, `Excluiu o registro: ${input.motivo.trim()}`, usuarioId)
    return { id: input.id }
  }

  // ── Categorias (cadastro) ──────────────────────────────────────

  async listarCategorias(empresaId?: string | null, apenasAtivas = true) {
    const cats = await prisma.coletaCategoria.findMany({
      where: { empresaId: empresaId ?? null, ...(apenasAtivas ? { ativo: true } : {}) },
      orderBy: { nome: 'asc' },
    })
    const areaIds = [...new Set(cats.map((c) => c.areaId).filter((x): x is string => !!x))]
    const areas = areaIds.length ? await prisma.area.findMany({ where: { id: { in: areaIds } }, select: { id: true, name: true } }) : []
    const aMap = new Map(areas.map((a) => [a.id, a.name]))
    return cats.map((c) => ({ ...c, areaNome: c.areaId ? aMap.get(c.areaId) ?? null : null }))
  }

  async criarCategoria(input: CriarColetaCategoriaInput, empresaId?: string | null) {
    return prisma.coletaCategoria.create({
      data: { empresaId: empresaId ?? null, nome: input.nome.trim(), areaId: input.areaId || null },
      select: { id: true },
    })
  }

  async atualizarCategoria(input: AtualizarColetaCategoriaInput) {
    const { id, ...c } = input
    return prisma.coletaCategoria.update({
      where: { id },
      data: {
        ...(c.nome !== undefined ? { nome: c.nome.trim() } : {}),
        ...(c.areaId !== undefined ? { areaId: c.areaId || null } : {}),
        ...(c.ativo !== undefined ? { ativo: c.ativo } : {}),
      },
      select: { id: true },
    })
  }

  // ── Apoios ─────────────────────────────────────────────────────

  async listarClientes(empresaId?: string | null) {
    return prisma.cliente.findMany({
      where: { status: { not: 'INATIVO' }, OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      orderBy: { razaoSocial: 'asc' },
      select: { id: true, razaoSocial: true, documento: true },
    })
  }

  async listarAreas(empresaId?: string | null) {
    return prisma.area.findMany({
      where: { isActive: true, OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    })
  }
}
