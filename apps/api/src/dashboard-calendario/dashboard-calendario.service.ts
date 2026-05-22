import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

export type PrazoTipo = 'agenda' | 'servico' | 'orcamento' | 'obrigacao'

export interface PrazoItem {
  id: string
  tipo: PrazoTipo
  titulo: string
  subtitulo?: string | null
  /** Data ISO YYYY-MM-DD do vencimento/evento */
  data: string
  /** Hora HH:mm quando aplicável (agenda) */
  horaInicio?: string | null
  /** Link interno pra abrir o item */
  link?: string | null
  /** Cor hex opcional pra customização visual */
  cor?: string | null
  /** Flag: prazo já passou */
  atrasado?: boolean
}

interface UserCtx {
  userId: string
  isMaster: boolean
  isEmpresaMaster: boolean
  empresaId?: string | null
}

function toDateOnly(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

@Injectable()
export class DashboardCalendarioService {
  /**
   * Lista todos os prazos visíveis pelo usuário num range. Agrega:
   *   - Eventos da agenda (módulo 'agenda')
   *   - Vencimentos de serviços em andamento (módulo 'meus-servicos')
   *   - Obrigações a entregar (responsável direto ou via área)
   *   - Vencimentos de orçamentos (módulo 'orcamentos' + nível gestor+)
   *
   * Filtros de permissão aplicados server-side. Master e EmpresaMaster veem
   * tudo do escopo da empresa atual.
   */
  async listPrazos(
    ctx: UserCtx,
    input: { inicio: string; fim: string },
  ): Promise<PrazoItem[]> {
    const inicio = new Date(input.inicio + 'T00:00:00')
    const fim = new Date(input.fim + 'T23:59:59')

    // Carrega user + permissões em paralelo
    const [user, permRows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { id: true, role: true, profile: true, empresaId: true, areaId: true },
      }),
      prisma.userPermission.findMany({
        where: { userId: ctx.userId },
        select: { moduleSlug: true, canRead: true },
      }),
    ])
    if (!user) return []

    const isAdmin = ctx.isMaster || ctx.isEmpresaMaster
    const can = (slug: string): boolean => {
      if (isAdmin) return true
      return permRows.some(p => p.moduleSlug === slug && p.canRead)
    }

    // Cargo/perfil privilegiado pra orçamento
    const isGestorOuAcima =
      isAdmin
      || ['GESTOR', 'COORDENADOR', 'DIRETOR'].includes(user.role as string)
      || ['GERENTE', 'ADMIN'].includes(user.profile as unknown as string)

    const empresaScope: { OR: Array<{ empresaId: string | null }> } | Record<string, never> =
      user.empresaId
        ? { OR: [{ empresaId: user.empresaId }, { empresaId: null }] }
        : {}

    // ── Disparos paralelos ──
    const tasks: Array<Promise<PrazoItem[]>> = []

    if (can('agenda')) tasks.push(this.fetchAgenda(user.id, user.empresaId, inicio, fim))
    if (can('meus-servicos')) tasks.push(this.fetchServicos(user, isAdmin, inicio, fim))
    if (can('minhas-obrigacoes') || can('meus-servicos'))
      tasks.push(this.fetchObrigacoes(user.id, user.empresaId, inicio, fim))
    if (isGestorOuAcima && can('orcamentos'))
      tasks.push(this.fetchOrcamentos(user.id, empresaScope, inicio, fim))

    const partes = await Promise.all(tasks)
    return partes.flat()
  }

  // ============================================================
  // AGENDA — eventos no range. Calendário INDIVIDUAL — só aparece se:
  //   1. user é o CRIADOR
  //   2. user é PARTICIPANTE direto (usuarioId = userId)
  //   3. evento é BROADCAST corporativo (público pra todos da empresa) —
  //      isto é: não-particular, não-tarefa, e (tipo "Comemorativa" OU
  //      sem participantes específicos). Mesma regra usada em
  //      notificarParticipantes pra decidir o que vai pro sino global.
  // ============================================================
  private async fetchAgenda(
    userId: string,
    empresaId: string | null,
    inicio: Date,
    fim: Date,
  ): Promise<PrazoItem[]> {
    const eventos = await prisma.agendaEvento.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ data: { gte: inicio, lte: fim } }, { dataFim: { gte: inicio, lte: fim } }] },
          // Visibilidade: criador, participante direto, ou broadcast corporativo
          {
            OR: [
              { criadorId: userId },
              { participantes: { some: { usuarioId: userId } } },
              // Broadcast corporativo: aberto a todos da empresa
              {
                particular: false,
                isTarefa: false,
                OR: [
                  { tipo: { nome: { contains: 'comemora', mode: 'insensitive' } } },
                  { participantes: { none: {} } },
                ],
              },
            ],
          },
          ...(empresaId
            ? [{
                OR: [
                  { criador: { empresaId } },
                  { criador: { empresaId: null } },
                ],
              }]
            : []),
        ],
      },
      include: { tipo: { select: { cor: true } } },
      take: 500,
    })

    return eventos.map(e => ({
      id: `agenda:${e.id}`,
      tipo: 'agenda' as const,
      titulo: e.titulo,
      data: toDateOnly(new Date(e.data)),
      horaInicio: e.diaInteiro ? null : e.horaInicio,
      link: `/agenda?eventoId=${e.id}`,
      cor: e.tipo?.cor ?? null,
    }))
  }

  // ============================================================
  // SERVIÇOS — execucoes em andamento com prazoLimite no range,
  // ONDE O USUÁRIO É RESPONSÁVEL DIRETO. Hierarquia/cargo não amplia
  // o escopo nesse widget (calendar do dashboard é visão pessoal).
  // ============================================================
  private async fetchServicos(
    user: { id: string; role: string | null; profile: unknown; empresaId: string | null },
    _isAdmin: boolean,
    inicio: Date,
    fim: Date,
  ): Promise<PrazoItem[]> {
    const execs = await prisma.servicoExecucao.findMany({
      where: {
        status: 'EM_ANDAMENTO',
        prazoLimite: { gte: inicio, lte: fim },
        servico: { ehObrigacaoAcessoria: false }, // obrigações vêm em fetchObrigacoes
        responsavelId: user.id,
        ...(user.empresaId ? { OR: [{ empresaId: user.empresaId }, { empresaId: null }] } : {}),
      },
      select: {
        id: true,
        prazoLimite: true,
        servico: { select: { nome: true, mininome: true } },
        cliente: { select: { razaoSocial: true } },
      },
      orderBy: { prazoLimite: 'asc' },
      take: 500,
    })

    const agora = new Date()
    return execs
      .filter(e => e.prazoLimite)
      .map(e => ({
        id: `servico:${e.id}`,
        tipo: 'servico' as const,
        titulo: e.servico.mininome ?? e.servico.nome,
        subtitulo: e.cliente?.razaoSocial ?? null,
        data: toDateOnly(e.prazoLimite!),
        link: `/meus-servicos?exec=${e.id}`,
        atrasado: e.prazoLimite! < agora,
      }))
  }

  // ============================================================
  // OBRIGAÇÕES — execucoes acessórias com prazo no range, ONDE O USUÁRIO
  // É RESPONSÁVEL DIRETO. Visão pessoal do calendário; responsabilidade
  // por área contratada NÃO é considerada aqui (use /minhas-obrigacoes pra
  // visão completa via área).
  // ============================================================
  private async fetchObrigacoes(
    userId: string,
    empresaId: string | null,
    inicio: Date,
    fim: Date,
  ): Promise<PrazoItem[]> {
    const execs = await prisma.servicoExecucao.findMany({
      where: {
        status: 'EM_ANDAMENTO',
        responsavelId: userId,
        servico: { ehObrigacaoAcessoria: true },
        ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
        OR: [
          { prazoLimite: { gte: inicio, lte: fim } },
          { acessoriasPrazo: { gte: inicio, lte: fim } },
        ],
      },
      select: {
        id: true,
        prazoLimite: true,
        acessoriasPrazo: true,
        responsavelId: true,
        clienteId: true,
        servico: { select: { nome: true, mininome: true, categoria: true, ehObrigacaoAcessoria: true } },
        cliente: { select: { razaoSocial: true } },
      },
      orderBy: [{ prazoLimite: 'asc' }, { acessoriasPrazo: 'asc' }],
      take: 800,
    })

    const agora = new Date()
    const out: PrazoItem[] = []
    for (const e of execs) {
      const prazo = e.prazoLimite ?? e.acessoriasPrazo
      if (!prazo) continue
      out.push({
        id: `obrigacao:${e.id}`,
        tipo: 'obrigacao' as const,
        titulo: e.servico.mininome ?? e.servico.nome,
        subtitulo: e.cliente?.razaoSocial ?? null,
        data: toDateOnly(prazo),
        link: `/minhas-obrigacoes?exec=${e.id}`,
        atrasado: prazo < agora,
      })
    }
    return out
  }

  // ============================================================
  // COMEMORAÇÕES — aniversários e admissões do mês
  // ============================================================
  /**
   * Lista os aniversários (data de nascimento) e aniversários de admissão dos
   * colaboradores ativos da empresa pra um mês específico. Não exige permissão
   * de módulo — é informação comemorativa, equiparada ao widget de ramais.
   */
  async listComemoracoes(
    empresaId: string | null | undefined,
    input: { ano: number; mes: number },
  ): Promise<Array<{
    id: string
    tipo: 'aniversario' | 'admissao'
    nome: string
    image: string | null
    dia: number
    /** Anos completados (admissão) ou idade no aniversário */
    anos?: number
  }>> {
    // Mês 1-12 (não 0-11 como Date.getMonth)
    const mes = Math.max(1, Math.min(12, input.mes))
    const ano = input.ano

    // Aniversariantes do mês — qualquer user ativo com dataNascimento no mês
    // Aniversariantes de admissão — qualquer user ativo (não demitido) com dataAdmissao no mês
    // Usamos $queryRaw porque Prisma não suporta EXTRACT() nativamente.
    type Row = {
      id: string
      name: string
      image: string | null
      data_nascimento: Date | null
      data_admissao: Date | null
      dia_nascimento: number | null
      dia_admissao: number | null
    }
    const empresaFilter = empresaId
      ? `AND (empresa_id = '${empresaId}' OR empresa_id IS NULL)`
      : ''
    const rows = await prisma.$queryRawUnsafe<Row[]>(`
      SELECT
        id, name, image, data_nascimento, data_admissao,
        CASE WHEN data_nascimento IS NOT NULL AND EXTRACT(MONTH FROM data_nascimento)::int = ${mes}
             THEN EXTRACT(DAY FROM data_nascimento)::int END AS dia_nascimento,
        CASE WHEN data_admissao IS NOT NULL AND EXTRACT(MONTH FROM data_admissao)::int = ${mes}
                  AND data_demissao IS NULL
             THEN EXTRACT(DAY FROM data_admissao)::int END AS dia_admissao
      FROM users
      WHERE is_active = true
        AND exibir_como_colaborador = true
        ${empresaFilter}
        AND (
          (data_nascimento IS NOT NULL AND EXTRACT(MONTH FROM data_nascimento)::int = ${mes})
          OR
          (data_admissao IS NOT NULL AND EXTRACT(MONTH FROM data_admissao)::int = ${mes} AND data_demissao IS NULL)
        )
    `)

    const out: Array<{
      id: string
      tipo: 'aniversario' | 'admissao'
      nome: string
      image: string | null
      dia: number
      anos?: number
    }> = []

    for (const r of rows) {
      if (r.dia_nascimento && r.data_nascimento) {
        const anos = ano - new Date(r.data_nascimento).getFullYear()
        out.push({
          id: `aniv:${r.id}`,
          tipo: 'aniversario',
          nome: r.name,
          image: r.image,
          dia: r.dia_nascimento,
          anos: anos > 0 && anos < 120 ? anos : undefined,
        })
      }
      if (r.dia_admissao && r.data_admissao) {
        const anos = ano - new Date(r.data_admissao).getFullYear()
        if (anos > 0) {
          out.push({
            id: `adm:${r.id}`,
            tipo: 'admissao',
            nome: r.name,
            image: r.image,
            dia: r.dia_admissao,
            anos,
          })
        }
      }
    }

    return out
  }

  // ============================================================
  // ORÇAMENTOS — calendário INDIVIDUAL: só onde user é responsável OU
  // solicitante. Status pré-conclusão com validade no range.
  // ============================================================
  private async fetchOrcamentos(
    userId: string,
    empresaScope: object,
    inicio: Date,
    fim: Date,
  ): Promise<PrazoItem[]> {
    // Apenas status "vivos" — APROVADO+ já encerraram o ciclo de validade
    const orcs = await prisma.orcamento.findMany({
      where: {
        arquivado: false,
        status: { in: ['NOVO', 'A_ENVIAR', 'ENVIADO'] },
        OR: [
          { responsavelId: userId },
          { solicitanteId: userId },
        ],
        ...empresaScope,
      },
      select: {
        id: true,
        numero: true,
        status: true,
        validadeDias: true,
        createdAt: true,
        dtEnviado: true,
        clienteId: true,
      },
      take: 500,
    })

    // Pré-filtra os que caem no range (calc local rápido)
    const agora = new Date()
    const candidatos = orcs
      .map(o => {
        const base = o.dtEnviado ?? o.createdAt
        const venc = new Date(base)
        venc.setDate(venc.getDate() + o.validadeDias)
        return { ...o, venc }
      })
      .filter(o => o.venc >= inicio && o.venc <= fim)
    if (candidatos.length === 0) return []

    // Busca os clientes em lote (Orcamento.cliente não tem relation no schema)
    const clienteIds = Array.from(new Set(candidatos.map(o => o.clienteId).filter((id): id is string => !!id)))
    const clientes = clienteIds.length
      ? await prisma.cliente.findMany({
          where: { id: { in: clienteIds } },
          select: { id: true, razaoSocial: true },
        })
      : []
    const mapaClientes = new Map(clientes.map(c => [c.id, c.razaoSocial]))

    return candidatos.map(o => ({
      id: `orcamento:${o.id}`,
      tipo: 'orcamento' as const,
      titulo: `Orçamento #${o.numero}`,
      subtitulo: (o.clienteId && mapaClientes.get(o.clienteId)) ?? null,
      data: toDateOnly(o.venc),
      link: `/orcamentos/${o.id}`,
      atrasado: o.venc < agora,
    }))
  }
}
