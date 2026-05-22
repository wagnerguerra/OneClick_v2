import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { ListProcessoInput, CreateProcessoInput } from '@saas/types'

@Injectable()
export class ProcessoService {
  // ── Listagem paginada ──────────────────────────────────────

  async list(input: ListProcessoInput, empresaId?: string) {
    const { page, limit, search, status, clienteId, responsavelId } = input
    const skip = (page - 1) * limit

    const where: any = {}
    if (status) where.status = status
    if (clienteId) where.clienteId = clienteId
    if (responsavelId) where.responsavelId = responsavelId
    // Empresa-scoping consistente com /servicos: empresa do user OU orfas (legado)
    if (empresaId) {
      where.OR = [{ empresaId }, { empresaId: null }]
    }
    if (search) {
      const searchOr = [
        { nome: { contains: search, mode: 'insensitive' as const } },
        { cliente: { razaoSocial: { contains: search, mode: 'insensitive' as const } } },
      ]
      // Combina search com o OR de empresa quando ambos existem
      where.AND = [where.OR ? { OR: where.OR } : {}, { OR: searchOr }]
      delete where.OR
    }

    const [items, total] = await Promise.all([
      prisma.processo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { iniciadoEm: 'desc' },
        include: {
          cliente: { select: { id: true, razaoSocial: true, documento: true } },
          servicoRaiz: { select: { id: true, nome: true } },
          _count: { select: { execucoes: true } },
        },
      }),
      prisma.processo.count({ where }),
    ])

    // Enriquece com responsavel — User não tem relação Prisma com responsavelId
    // (segue padrão dos outros módulos: batch findMany IN para o avatar+nome)
    const respIds = Array.from(new Set(items.map(p => p.responsavelId).filter((u): u is string => !!u)))
    const respMap = new Map<string, { id: string; name: string; image: string | null }>()
    if (respIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: respIds } },
        select: { id: true, name: true, image: true },
      })
      for (const u of users) respMap.set(u.id, u)
    }

    // Conta execucoes concluidas por processo (pra mostrar progresso)
    // — em paralelo, usando groupBy
    const execStats = items.length > 0
      ? await prisma.servicoExecucao.groupBy({
          by: ['processoId', 'status'],
          where: { processoId: { in: items.map(p => p.id) } },
          _count: true,
        })
      : []
    const statsByProcesso = new Map<string, { total: number; concluidas: number; pendentes: number }>()
    for (const row of execStats) {
      if (!row.processoId) continue
      const s = statsByProcesso.get(row.processoId) ?? { total: 0, concluidas: 0, pendentes: 0 }
      s.total += row._count
      if (row.status === 'CONCLUIDO' || row.status === 'PULADO') s.concluidas += row._count
      else if (row.status === 'EM_ANDAMENTO' || row.status === 'AGUARDANDO_INICIO') s.pendentes += row._count
      statsByProcesso.set(row.processoId, s)
    }

    // Agregação de prazo por processo: conta atrasadas + identifica próximo prazo.
    // Considera apenas execuções EM_ANDAMENTO !pausado (AGUARDANDO_INICIO não tem
    // prazoLimite definido — só conta após gestor iniciar).
    const prazoByProcesso = new Map<string, { atrasadas: number; proximoPrazo: Date | null }>()
    if (items.length > 0) {
      const agora = new Date()
      const execsAtivas = await prisma.servicoExecucao.findMany({
        where: {
          processoId: { in: items.map(p => p.id) },
          status: 'EM_ANDAMENTO',
          pausado: false,
          prazoLimite: { not: null },
        },
        select: { processoId: true, prazoLimite: true },
      })
      for (const e of execsAtivas) {
        if (!e.processoId || !e.prazoLimite) continue
        const cur = prazoByProcesso.get(e.processoId) ?? { atrasadas: 0, proximoPrazo: null }
        if (e.prazoLimite < agora) cur.atrasadas++
        if (!cur.proximoPrazo || e.prazoLimite < cur.proximoPrazo) cur.proximoPrazo = e.prazoLimite
        prazoByProcesso.set(e.processoId, cur)
      }
    }

    return {
      data: items.map(p => ({
        ...p,
        responsavel: p.responsavelId ? respMap.get(p.responsavelId) ?? null : null,
        progresso: statsByProcesso.get(p.id) ?? { total: 0, concluidas: 0, pendentes: 0 },
        prazo: prazoByProcesso.get(p.id) ?? { atrasadas: 0, proximoPrazo: null },
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    }
  }

  // ── Detalhe ────────────────────────────────────────────────

  async getById(id: string) {
    const proc = await prisma.processo.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, razaoSocial: true, documento: true, email: true } },
        servicoRaiz: { select: { id: true, nome: true, descricao: true } },
        execucoes: {
          orderBy: { createdAt: 'asc' },
          include: {
            servico: {
              select: {
                id: true, nome: true, tipo: true,
                perguntaTexto: true, perguntaOpcoes: true, perguntaMulti: true,
              },
            },
            // Inclui encadeamento.obrigatorio — UI usa pra decidir se sucessor
            // AGUARDANDO_INICIO pode ser pulado (apenas opcionais).
            encadeamento: { select: { id: true, obrigatorio: true, iniciaAuto: true } },
            passos: {
              select: { id: true, ordem: true, passoNome: true, concluido: true, ignorado: true, obrigatorio: true },
              orderBy: { ordem: 'asc' },
            },
          },
        },
        eventos: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    })
    if (!proc) return null

    // Enriquecimento espelha o list: responsavel do processo + responsaveis das execucoes
    // (vide registry 9.3 — getById deve enriquecer identicamente ao list).
    const respIds = Array.from(new Set([
      proc.responsavelId,
      ...proc.execucoes.map(e => e.responsavelId),
    ].filter((u): u is string => !!u)))
    const respMap = new Map<string, { id: string; name: string; image: string | null }>()
    if (respIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: respIds } },
        select: { id: true, name: true, image: true },
      })
      for (const u of users) respMap.set(u.id, u)
    }

    return {
      ...proc,
      responsavel: proc.responsavelId ? respMap.get(proc.responsavelId) ?? null : null,
      execucoes: proc.execucoes.map(e => ({
        ...e,
        responsavel: e.responsavelId ? respMap.get(e.responsavelId) ?? null : null,
      })),
    }
  }

  // ── Criação manual ─────────────────────────────────────────
  // Cria o agregador Processo. A criação da execucao-raiz fica a cargo do
  // ServicoService.createExecucao (passando processoId). Em fluxos automaticos
  // (orcamento APROVADO disparando processo) — implementado na Fase 3 — o
  // OrcamentoService chama este create + cria a raiz numa unica transacao.

  async create(input: CreateProcessoInput, empresaId?: string, userId?: string) {
    const proc = await prisma.processo.create({
      data: {
        nome: input.nome,
        clienteId: input.clienteId,
        servicoRaizId: input.servicoRaizId,
        orcamentoId: input.orcamentoId || null,
        responsavelId: input.responsavelId || null,
        empresaId: empresaId || null,
      },
    })
    await this.addEvento(proc.id, userId, 'criado', `Processo "${proc.nome}" criado`)
    return proc
  }

  // ── Cancelamento manual ────────────────────────────────────

  async cancelar(id: string, motivo: string, userId?: string) {
    const proc = await prisma.processo.findUnique({ where: { id } })
    if (!proc) throw new Error('Processo não encontrado')
    if (proc.status === 'CANCELADO') throw new Error('Processo já está cancelado')
    if (proc.status === 'CONCLUIDO') throw new Error('Processo concluído não pode ser cancelado')

    const agora = new Date()
    // Cancela em cascata todas execuções que ainda não terminaram.
    // CONCLUIDO/PULADO ficam preservadas (são "fechadas" do ponto de vista do processo).
    await prisma.servicoExecucao.updateMany({
      where: {
        processoId: id,
        status: { in: ['EM_ANDAMENTO', 'AGUARDANDO_INICIO'] },
      },
      data: { status: 'CANCELADO', concluidoEm: agora },
    })

    const updated = await prisma.processo.update({
      where: { id },
      data: {
        status: 'CANCELADO',
        canceladoMotivo: motivo,
        concluidoEm: agora,
      },
    })
    await this.addEvento(id, userId, 'cancelado', `Processo cancelado: ${motivo}`)
    return updated
  }

  // ── Recálculo de status (chamado pela cascata na Fase 2) ──
  // Quando todas as execucoes do processo estao em estado terminal
  // (CONCLUIDO | PULADO | CANCELADO), o processo passa para CONCLUIDO.

  async recalcularStatus(processoId: string, userId?: string) {
    const proc = await prisma.processo.findUnique({
      where: { id: processoId },
      include: { execucoes: { select: { status: true } } },
    })
    if (!proc) return null
    if (proc.status !== 'EM_ANDAMENTO') return proc // ja finalizado/cancelado

    const TERMINAL = new Set(['CONCLUIDO', 'PULADO', 'CANCELADO'])
    const todasTerminais = proc.execucoes.length > 0
      && proc.execucoes.every(e => TERMINAL.has(e.status))
    const algumaConcluida = proc.execucoes.some(e => e.status === 'CONCLUIDO')

    if (todasTerminais && algumaConcluida) {
      const agora = new Date()
      const updated = await prisma.processo.update({
        where: { id: processoId },
        data: { status: 'CONCLUIDO', concluidoEm: agora },
      })
      await this.addEvento(processoId, userId, 'concluido', 'Todas execuções da cadeia finalizadas')
      return updated
    }
    return proc
  }

  // ── Painel operacional ─────────────────────────────────────
  /**
   * Lista todas as execuções relevantes para o painel operacional, com
   * permissão por hierarquia (mesma lógica do listMeusServicos):
   *  - master/diretor/coordenador: vê tudo da empresa
   *  - líder de área: vê execuções de colaboradores da área que lidera
   *  - demais: vê só as próprias (responsavelId === userId)
   *
   * Status retornados: EM_ANDAMENTO, AGUARDANDO_INICIO, e CONCLUIDO dos
   * últimos 7 dias (para coluna "Concluídos recentes"). Ignora CANCELADO/PULADO.
   *
   * Filtros opcionais: search (cliente/serviço), segmentos[], responsaveis[].
   */
  async painelExecucoes(
    userId: string,
    filtros: {
      search?: string
      segmentos?: string[]
      responsaveis?: string[]
    },
  ) {
    const agora = new Date()
    const limiteConcluidos = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isMaster: true, isEmpresaMaster: true, empresaId: true },
    })
    if (!user) return []

    const isPriv = user.isMaster || user.isEmpresaMaster
      || user.role === 'DIRETOR' || user.role === 'COORDENADOR'

    // Status considerados ativos no painel
    const filtroStatus: any = {
      OR: [
        { status: 'EM_ANDAMENTO' },
        { status: 'AGUARDANDO_INICIO' },
        { AND: [{ status: 'CONCLUIDO' }, { concluidoEm: { gte: limiteConcluidos } }] },
      ],
    }

    let where: any = filtroStatus

    if (isPriv) {
      // Master/Diretor/Coordenador veem tudo (com scope por empresa quando aplicável)
      if (user.empresaId) {
        where = { AND: [where, { OR: [{ empresaId: user.empresaId }, { empresaId: null }] }] }
      }
    } else {
      // Hierarquia: líder de área OU responsável direto
      const ledAreas = await prisma.area.findMany({
        where: { leaderId: userId },
        select: { id: true },
      })
      const ledAreaIds = ledAreas.map(a => a.id)

      const orClauses: any[] = [{ responsavelId: userId }]
      if (ledAreaIds.length > 0) {
        orClauses.push({ responsavel: { areaId: { in: ledAreaIds } } })
      }
      where = { AND: [where, { OR: orClauses }] }

      if (user.empresaId) {
        where = { AND: [where, { OR: [{ empresaId: user.empresaId }, { empresaId: null }] }] }
      }
    }

    // Filtros adicionais do payload
    if (filtros.responsaveis && filtros.responsaveis.length > 0) {
      where = { AND: [where, { responsavelId: { in: filtros.responsaveis } }] }
    }
    if (filtros.segmentos && filtros.segmentos.length > 0) {
      where = { AND: [where, { servico: { segmentoSlug: { in: filtros.segmentos } } }] }
    }
    if (filtros.search && filtros.search.trim()) {
      const q = filtros.search.trim()
      where = {
        AND: [
          where,
          {
            OR: [
              { servico: { nome: { contains: q, mode: 'insensitive' } } },
              { cliente: { razaoSocial: { contains: q, mode: 'insensitive' } } },
              { cliente: { documento: { contains: q.replace(/\D/g, '') } } },
            ],
          },
        ],
      }
    }

    const execs = await prisma.servicoExecucao.findMany({
      where,
      take: 500, // proteção
      include: {
        servico: { select: { id: true, nome: true, segmentoSlug: true } },
        cliente: { select: { id: true, razaoSocial: true, documento: true } },
        processo: { select: { id: true, nome: true } },
        passos: {
          select: { id: true, concluido: true, ignorado: true, obrigatorio: true },
        },
      },
      orderBy: [
        { prazoLimite: 'asc' }, // atrasados primeiro
        { iniciadoEm: 'desc' },
      ],
    })

    // Enriquecimento batch de responsável (registry §9.3)
    const respIds = Array.from(new Set(execs.map(e => e.responsavelId).filter((u): u is string => !!u)))
    const respMap = new Map<string, { id: string; name: string; image: string | null }>()
    if (respIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: respIds } },
        select: { id: true, name: true, image: true },
      })
      for (const u of users) respMap.set(u.id, u)
    }

    return execs.map(e => {
      const total = e.passos.length
      const fechados = e.passos.filter(p => p.concluido || p.ignorado).length
      return {
        id: e.id,
        status: e.status,
        prazoLimite: e.prazoLimite,
        iniciadoEm: e.iniciadoEm,
        concluidoEm: e.concluidoEm,
        pausado: e.pausado,
        servicoId: e.servicoId,
        servicoNome: e.servico.nome,
        segmentoSlug: e.servico.segmentoSlug,
        clienteId: e.clienteId,
        clienteRazaoSocial: e.cliente.razaoSocial,
        clienteDocumento: e.cliente.documento,
        processoId: e.processoId,
        processoNome: e.processo?.nome ?? null,
        responsavel: e.responsavelId ? respMap.get(e.responsavelId) ?? null : null,
        progresso: { total, fechados },
        prioridade: e.prioridade,
      }
    })
  }

  /**
   * Lista compacta de responsáveis com execuções ativas — usada para popular
   * o filtro de responsáveis no painel.
   */
  async painelResponsaveis(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isMaster: true, isEmpresaMaster: true, empresaId: true },
    })
    if (!user) return []
    const isPriv = user.isMaster || user.isEmpresaMaster
      || user.role === 'DIRETOR' || user.role === 'COORDENADOR'
    if (!isPriv) {
      // Não-privilegiado vê só ele mesmo no filtro
      return [{ id: user.id, name: 'Eu', image: null }]
    }
    // Pega responsáveis distintos com execuções ativas na empresa
    const respIds = await prisma.servicoExecucao.findMany({
      where: {
        responsavelId: { not: null },
        status: { in: ['EM_ANDAMENTO', 'AGUARDANDO_INICIO'] },
        ...(user.empresaId ? { OR: [{ empresaId: user.empresaId }, { empresaId: null }] } : {}),
      },
      select: { responsavelId: true },
      distinct: ['responsavelId'],
    })
    const ids = respIds.map(r => r.responsavelId).filter((u): u is string => !!u)
    if (ids.length === 0) return []
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, image: true },
      orderBy: { name: 'asc' },
    })
  }

  // ── Eventos (timeline) ─────────────────────────────────────

  async listEventos(processoId: string) {
    const items = await prisma.processoEvento.findMany({
      where: { processoId },
      orderBy: { createdAt: 'desc' },
    })
    const userIds = Array.from(new Set(items.map(e => e.userId).filter((u): u is string => !!u)))
    const usersMap = new Map<string, { id: string; name: string; image: string | null }>()
    if (userIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, image: true },
      })
      for (const u of users) usersMap.set(u.id, u)
    }
    return items.map(e => ({
      ...e,
      usuario: e.userId ? usersMap.get(e.userId) ?? null : null,
    }))
  }

  /** Helper interno — registra evento. Fire-and-forget (não interrompe fluxo principal). */
  async addEvento(
    processoId: string,
    userId: string | undefined,
    tipo: string,
    descricao: string,
    metadata?: Record<string, unknown>,
  ) {
    return prisma.processoEvento.create({
      data: {
        processoId,
        userId: userId || null,
        tipo,
        descricao,
        metadata: metadata ? (metadata as any) : undefined,
      },
    }).catch((e: Error) => {
      console.warn('[Processo] Falha ao registrar evento:', e.message)
    })
  }
}
