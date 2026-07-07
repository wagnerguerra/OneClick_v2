import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Prisma } from '@saas/db'
import {
  HELPDESK_SLA_PADRAO_HORAS,
  HELPDESK_STATUS_PAUSADOS,
  type CreateTicketInput,
  type UpdateTicketInput,
  type ListTicketInput,
  type AddMensagemInput,
  type EditMensagemInput,
  type DeleteMensagemInput,
  type HelpdeskPrioridade,
  type HelpdeskStatus,
} from '@saas/types'
import { NotificationService } from '../notification/notification.service'
import { EmailService } from '../common/email.service'
import { HelpdeskAiAgentService } from './helpdesk-ai-agent.service'

@Injectable()
export class HelpdeskService {
  constructor(
    private readonly notificationService: NotificationService,
    // Guardado pra Fase 5 (envio de e-mail em resposta pública/atribuição)
    protected readonly emailService: EmailService,
    private readonly aiAgent: HelpdeskAiAgentService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────

  /**
   * Calcula prazo absoluto de resolução a partir de agora.
   * Categoria pode sobrescrever (slaPadraoHoras) — senão usa o padrão da prioridade.
   * (Fase 7 vai permitir override por SystemConfig.)
   */
  private async calcularPrazoSla(
    prioridade: HelpdeskPrioridade,
    categoriaId: string | null | undefined,
  ): Promise<Date> {
    let horas = HELPDESK_SLA_PADRAO_HORAS[prioridade]
    if (categoriaId) {
      const cat = await prisma.helpdeskCategoria.findUnique({
        where: { id: categoriaId },
        select: { slaPadraoHoras: true },
      })
      if (cat?.slaPadraoHoras) horas = cat.slaPadraoHoras
    }
    return new Date(Date.now() + horas * 60 * 60 * 1000)
  }

  /**
   * Visibilidade do ticket por hierarquia:
   *  - Master/EmpresaMaster/DIRETOR/COORDENADOR → tudo
   *  - Solicitante → o próprio
   *  - Responsável → o próprio
   *  - Watcher → tickets onde está marcado
   *  - Agente com helpdesk.canRead + escopo de área → tickets da área
   *  - Líder da área do ticket → o próprio
   */
  async canAccess(userId: string, ticketId: string): Promise<boolean> {
    // Agentes da TI (master/empresa-master, DIRETOR/COORDENADOR, sub-perm
    // helpdesk.atuar_agente, ou pertencer à área de TI/Suporte/Tecnologia)
    // veem TODOS os tickets — consistente com o `isPriv` do list().
    // Sem essa checagem, um agente apareceria na listagem (sem filtro de escopo)
    // mas receberia FORBIDDEN ao clicar num ticket de outra área.
    if (await this.canAtuarAgente(userId)) return true

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { areaId: true },
    })
    if (!user) return false

    const t = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { solicitanteId: true, responsavelId: true, areaId: true, watchers: { select: { userId: true } } },
    })
    if (!t) return false
    if (t.solicitanteId === userId) return true
    if (t.responsavelId === userId) return true
    if (t.watchers.some(w => w.userId === userId)) return true

    if (t.areaId) {
      const area = await prisma.area.findUnique({
        where: { id: t.areaId },
        select: { leaderId: true },
      })
      if (area?.leaderId === userId) return true
      // Mesma área do user (qualquer agente)
      if (user.areaId === t.areaId) {
        // Tem permissão helpdesk?
        const perm = await prisma.userPermission.findFirst({
          where: { userId, moduleSlug: 'helpdesk', canRead: true },
          select: { id: true },
        })
        if (perm) return true
      }
    }
    return false
  }

  async assertCanAccess(userId: string, ticketId: string) {
    if (!(await this.canAccess(userId, ticketId))) {
      throw new Error('Você não tem acesso a este ticket.')
    }
  }

  /**
   * Verifica se o usuário pode ATUAR como agente (TI real). Critérios (qualquer um basta):
   *  1. master / empresa-master
   *  2. role DIRETOR / COORDENADOR
   *  3. sub-permissão helpdesk.atuar_agente = true (explícita)
   *  4. está em uma ÁREA de TI/Tecnologia/Suporte/Helpdesk (auto — qualquer usuário
   *     dessas áreas é considerado agente sem precisar de sub-permissão manual)
   *
   * Usar em qualquer ação restrita à TI (kanban, configurações, mover/atribuir cards).
   */
  async canAtuarAgente(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isMaster: true,
        isEmpresaMaster: true,
        role: true,
        area: { select: { name: true } },
      },
    })
    if (!user) return false
    if (user.isMaster || user.isEmpresaMaster) return true
    if (user.role === 'DIRETOR' || user.role === 'COORDENADOR') return true

    // Sub-permissão explícita
    const perm = await prisma.userPermission.findFirst({
      where: { userId, moduleSlug: 'helpdesk' },
      select: { subPermissions: true },
    })
    const sub = (perm?.subPermissions ?? {}) as Record<string, boolean>
    if (sub.atuar_agente === true) return true

    // Área do usuário pertence ao suporte/TI? (auto-agente)
    if (user.area?.name && isAreaTi(user.area.name)) return true

    return false
  }

  private async addEvento(
    ticketId: string,
    autorId: string | null,
    tipo: string,
    descricao: string,
    metadata?: Record<string, unknown>,
  ) {
    return prisma.helpdeskEvento.create({
      data: {
        ticketId,
        autorId: autorId || null,
        tipo,
        descricao,
        metadata: metadata ? (metadata as object) : undefined,
      },
    }).catch((e: Error) => {
      console.warn('[Helpdesk] Falha ao registrar evento:', e.message)
    })
  }

  // ── CRUD: Categorias ───────────────────────────────────────────

  async listCategorias(empresaId?: string | null) {
    return prisma.helpdeskCategoria.findMany({
      where: {
        ativo: true,
        ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
      },
      include: {
        area: { select: { id: true, name: true } },
        parent: { select: { id: true, nome: true } },
      },
      orderBy: [{ ordem: 'asc' }, { nome: 'asc' }],
    })
  }

  // ── CRUD: Tickets ──────────────────────────────────────────────

  async create(input: CreateTicketInput, userId: string, empresaId?: string | null) {
    // Resolve categoria → área (roteamento)
    let areaId: string | null = null
    if (input.categoriaId) {
      const cat = await prisma.helpdeskCategoria.findUnique({
        where: { id: input.categoriaId },
        select: { areaId: true },
      })
      areaId = cat?.areaId ?? null
    }

    const prazoSla = await this.calcularPrazoSla(input.prioridade, input.categoriaId)

    const ticket = await prisma.helpdeskTicket.create({
      data: {
        titulo: input.titulo,
        descricao: input.descricao,
        tipo: input.tipo,
        prioridade: input.prioridade,
        status: 'NOVO',
        categoriaId: input.categoriaId || null,
        areaId,
        tags: input.tags ?? [],
        solicitanteId: userId,
        prazoSla,
        empresaId: empresaId || null,
      },
    })

    await this.addEvento(ticket.id, userId, 'criado', `Ticket "${ticket.titulo}" criado`, {
      prioridade: input.prioridade,
      tipo: input.tipo,
    })

    // Notifica agentes da área (sino) — Fase 5 também manda e-mail
    const notificouAgentes = await this.notificarAgentesArea(ticket.id, areaId, userId, empresaId)

    // Fallback: se não há agentes da área (ex: ticket veio sem categoria via FAB
    // "Fale com a TI"), envia email pro endereço configurado em HelpdeskConfig.
    if (!notificouAgentes) {
      await this.notificarEmailFallback(ticket.id)
    }

    // Triagem IA — fire-and-forget. Não bloqueia o create (retorno em <100ms).
    // O agente classifica simples/complexo e atualiza o ticket de forma assíncrona;
    // o frontend recebe via SSE/refetch quando entra na coluna "Aguardando auditoria".
    void this.aiAgent.processarTicket(ticket.id).catch(e => {
      console.error('[Helpdesk] Triagem IA falhou:', (e as Error).message)
    })

    return ticket
  }

  /**
   * Notificação por email quando nenhum agente da área foi notificado
   * (ticket sem categoria/área — ex: FAB "Fale com a TI").
   */
  private async notificarEmailFallback(ticketId: string) {
    try {
      const cfg = await this.getConfig()
      const destinatario = cfg.emailNotificacao
      if (!destinatario) return

      const ticket = await prisma.helpdeskTicket.findUnique({
        where: { id: ticketId },
        select: {
          numero: true, titulo: true, descricao: true, tipo: true, prioridade: true, tags: true,
          solicitante: { select: { name: true, email: true } },
        },
      })
      if (!ticket) return

      const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
      const origem = ticket.tags.includes('fab-feedback') ? '🔔 Via balão "Fale com a TI"' : 'Sem categoria definida'
      const html = `
        <p>Um novo ticket foi aberto e precisa de atenção:</p>
        <p><strong>${ticketNum}</strong> — ${escapeHtml(ticket.titulo)}</p>
        <p style="font-size:12px;color:#6b7280;margin-top:4px;">
          Tipo: <strong>${ticket.tipo}</strong> · Prioridade: <strong>${ticket.prioridade}</strong> · ${origem}
        </p>
        <p style="font-size:12px;color:#6b7280;">
          Solicitante: ${ticket.solicitante ? escapeHtml(`${ticket.solicitante.name} <${ticket.solicitante.email}>`) : '—'}
        </p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">
        ${ticket.descricao}
        <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">
        <p style="font-size:11px;color:#9ca3af;">
          Para responder, abra o ticket no HelpDesk do OneClick.
        </p>`

      await this.emailService.sendMail({
        to: destinatario,
        subject: `HelpDesk ${ticketNum} — ${ticket.titulo.slice(0, 60)}`,
        html,
      })
    } catch (e) {
      console.warn('[Helpdesk] Falha no fallback email:', (e as Error).message)
    }
  }

  private async notificarAgentesArea(
    ticketId: string,
    areaId: string | null,
    solicitanteId: string,
    empresaId?: string | null,
  ): Promise<boolean> {
    if (!areaId) return false
    // Pega usuários da área com permissão helpdesk.atuar_agente
    const agentes = await prisma.user.findMany({
      where: {
        areaId,
        isActive: true,
        id: { not: solicitanteId },
        ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
      },
      select: { id: true },
    })
    if (agentes.length === 0) return false
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { numero: true, titulo: true, prioridade: true },
    })
    if (!ticket) return false
    const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
    try {
      await this.notificationService.criarParaUsers(
        agentes.map(a => a.id),
        {
          titulo: `Novo ticket ${ticketNum}`,
          mensagem: `${ticket.titulo} (${ticket.prioridade})`,
          tipo: 'info',
          link: `/helpdesk/${ticketId}`,
          origem: 'helpdesk',
          empresaId: empresaId || null,
        },
      )
      return true
    } catch (e) {
      console.warn('[Helpdesk] Falha ao notificar agentes:', (e as Error).message)
      return false
    }
  }

  /** Detalhe completo do ticket (com mensagens, anexos, eventos, watchers, autores enriquecidos). */
  async getById(id: string) {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id },
      include: {
        solicitante: { select: { id: true, name: true, email: true, image: true } },
        responsavel: { select: { id: true, name: true, email: true, image: true } },
        categoria: { include: { parent: { select: { id: true, nome: true } } } },
        area: { select: { id: true, name: true } },
        watchers: {
          include: { user: { select: { id: true, name: true, image: true } } },
        },
        mensagens: {
          include: {
            autor: { select: { id: true, name: true, image: true } },
            anexos: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        anexos: {
          where: { mensagemId: null },
          include: { autor: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        eventos: {
          include: { autor: { select: { id: true, name: true, image: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        },
      },
    })
    if (!ticket) return ticket

    // Resposta-a-mensagem (citar) — lido via SQL raw e mesclado nas mensagens.
    type RespRow = { id: string; respostaParaId: string | null; rConteudo: string | null; rInterna: boolean | null; rAutorNome: string | null; rAutorExternoNome: string | null }
    const respRows = await prisma.$queryRawUnsafe<RespRow[]>(
      `SELECT m.id, m.resposta_para_id AS "respostaParaId", r.conteudo AS "rConteudo", r.interna AS "rInterna",
              ru.name AS "rAutorNome", r.autor_externo_nome AS "rAutorExternoNome"
         FROM helpdesk_mensagens m
         LEFT JOIN helpdesk_mensagens r ON r.id = m.resposta_para_id
         LEFT JOIN users ru ON ru.id = r.autor_id
        WHERE m.ticket_id = $1 AND m.resposta_para_id IS NOT NULL`, id,
    ).catch(() => [] as RespRow[])
    const respMap = new Map(respRows.map(r => [r.id, r]))
    const mensagens = ticket.mensagens.map(m => {
      const r = respMap.get(m.id)
      return {
        ...m,
        respostaParaId: r?.respostaParaId ?? null,
        respostaPara: r?.respostaParaId
          ? { id: r.respostaParaId, conteudo: r.rConteudo ?? '', interna: !!r.rInterna, autorNome: r.rAutorNome || r.rAutorExternoNome || null }
          : null,
      }
    })
    return { ...ticket, mensagens }
  }

  /** Listagem do agente (kanban e tabela). Escopo definido por sub-permissões. */
  async list(input: ListTicketInput, userId: string, empresaId?: string | null) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isMaster: true, isEmpresaMaster: true, role: true, areaId: true },
    })
    // Privilegiado vê tudo sem filtro de escopo. Usa o mesmo critério do
    // canAtuarAgente: master/empresa-master, DIRETOR/COORDENADOR, sub-perm
    // helpdesk.atuar_agente, OU pertencer à área de TI/Suporte/Tecnologia.
    const isPriv = await this.canAtuarAgente(userId)
    console.log(`[Helpdesk.list] userId=${userId} scope=${input.scope} isPriv=${isPriv}`)

    // Where base
    const where: any = {
      arquivado: input.arquivado,
      ativo: true,
      ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
    }
    if (input.status?.length) where.status = { in: input.status }
    if (input.prioridade?.length) where.prioridade = { in: input.prioridade }
    if (input.categoriaId) where.categoriaId = input.categoriaId
    if (input.responsavelId) where.responsavelId = input.responsavelId
    if (input.search) {
      const q = input.search.trim()
      const digits = q.replace(/\D/g, '')
      const or: any[] = [
        { titulo: { contains: q, mode: 'insensitive' } },
        { descricao: { contains: q, mode: 'insensitive' } },
        { tags: { has: q.toLowerCase() } },
        // Solicitante (interno + externo) / responsável / categoria — como /crm e /orcamentos
        { solicitante: { name: { contains: q, mode: 'insensitive' } } },
        { solicitante: { email: { contains: q, mode: 'insensitive' } } },
        { solicitanteExternoNome: { contains: q, mode: 'insensitive' } },
        { solicitanteExternoEmail: { contains: q, mode: 'insensitive' } },
        { responsavel: { name: { contains: q, mode: 'insensitive' } } },
        { categoria: { nome: { contains: q, mode: 'insensitive' } } },
      ]
      // Número do ticket (#HLP0075 / 0075 / 75)
      if (digits) { const n = parseInt(digits, 10); if (!Number.isNaN(n)) or.push({ numero: { equals: n } }) }
      where.OR = or
    }

    // Escopo (a menos que privilegiado)
    if (!isPriv) {
      if (input.scope === 'MEUS') {
        where.AND = [{ OR: [{ solicitanteId: userId }, { responsavelId: userId }, { watchers: { some: { userId } } }] }]
      } else if (input.scope === 'AREA' && user?.areaId) {
        where.AND = [{ areaId: user.areaId }]
      } else if (input.scope === 'TODOS') {
        // Sem permissão? Cai pra MEUS automaticamente
        where.AND = [{ OR: [{ solicitanteId: userId }, { responsavelId: userId }] }]
      }
    }

    const [total, items] = await Promise.all([
      prisma.helpdeskTicket.count({ where }),
      prisma.helpdeskTicket.findMany({
        where,
        include: {
          solicitante: { select: { id: true, name: true, image: true } },
          responsavel: { select: { id: true, name: true, image: true } },
          categoria: { select: { id: true, nome: true, cor: true } },
          area: { select: { id: true, name: true } },
          _count: { select: { mensagens: true, anexos: true } },
          // Primeiro anexo de imagem do ticket — usado como capa do card no
          // kanban. Filtro por mimeType evita trazer PDFs/zips. Ordenado por
          // criação asc pra escolher a "primeira anexada".
          anexos: {
            where: { mimeType: { startsWith: 'image/' } },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { id: true, fileName: true, fileUrl: true, mimeType: true },
          },
          // Última mensagem PÚBLICA — pra destacar no kanban quando o
          // solicitante respondeu (bola do lado do agente).
          mensagens: {
            where: { interna: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { autorId: true },
          },
        },
        orderBy: [{ prioridade: 'desc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.limit,
        take: input.limit,
      }),
    ])

    // Converte o array `anexos` (no máx 1) em um campo `capa` opcional —
    // mais explícito na UI e evita confusão com a lista completa de anexos
    // que aparece no detalhe do ticket.
    const mapped = items.map(t => {
      const { anexos, mensagens, ...rest } = t as typeof t & {
        anexos: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string | null }>
        mensagens: Array<{ autorId: string | null }>
      }
      // Solicitante mandou a última mensagem pública ⇒ aguardando resposta do agente.
      const aguardandoResposta = !!mensagens[0] && mensagens[0].autorId === rest.solicitanteId
      return { ...rest, capa: anexos[0] ?? null, aguardandoResposta }
    })

    return {
      data: mapped,
      total,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(total / input.limit),
    }
  }

  /**
   * Relatório de tickets em aberto (nos moldes do Relatório de QA): todos os
   * tickets não concluídos/cancelados que o usuário enxerga, sem paginação,
   * ordenados por prioridade e antiguidade. Agente vê tudo do tenant; não-agente
   * vê só os próprios/responsável/watcher.
   */
  async relatorioTickets(userId: string, empresaId?: string | null) {
    const isAgente = await this.canAtuarAgente(userId)
    const where: Prisma.HelpdeskTicketWhereInput = {
      ativo: true,
      arquivado: false,
      status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      ...(empresaId ? { empresaId } : {}),
      ...(isAgente ? {} : { OR: [{ solicitanteId: userId }, { responsavelId: userId }, { watchers: { some: { userId } } }] }),
    }
    return prisma.helpdeskTicket.findMany({
      where,
      select: {
        id: true, numero: true, titulo: true, descricao: true, tipo: true,
        prioridade: true, status: true, prazoSla: true, createdAt: true,
        solicitante: { select: { name: true } },
        solicitanteExternoNome: true,
        responsavel: { select: { name: true } },
        categoria: { select: { nome: true, parent: { select: { nome: true } } } },
        _count: { select: { mensagens: true, anexos: true } },
      },
      orderBy: [{ prioridade: 'desc' }, { createdAt: 'asc' }],
      take: 500,
    })
  }

  /** Resolve numero visível (#HLPNNNN) → id, respeitando visibilidade. */
  async findByNumero(numero: number, userId: string): Promise<{ id: string } | null> {
    const ticket = await prisma.helpdeskTicket.findFirst({
      where: { numero, ativo: true },
      select: { id: true },
    })
    if (!ticket) return null
    if (!(await this.canAccess(userId, ticket.id))) return null
    return ticket
  }

  /** Atalho: tickets do solicitante logado (página /helpdesk/meus). */
  async listMeus(userId: string, opts?: { status?: HelpdeskStatus[]; incluirHistorico?: boolean }) {
    return prisma.helpdeskTicket.findMany({
      where: {
        solicitanteId: userId,
        ativo: true,
        ...(opts?.status?.length ? { status: { in: opts.status } } : {}),
        ...(opts?.incluirHistorico ? {} : { arquivado: false }),
      },
      include: {
        responsavel: { select: { id: true, name: true, image: true } },
        categoria: { select: { id: true, nome: true, cor: true } },
        _count: { select: { mensagens: true } },
      },
      orderBy: [
        { status: 'asc' }, // ordem alfabética: AGUARDANDO... > EM_ANDAMENTO > NOVO > RESOLVIDO > CONCLUIDO
        { createdAt: 'desc' },
      ],
    })
  }

  // ── Update + transição de status ───────────────────────────────

  async update(id: string, data: UpdateTicketInput, userId: string) {
    const before = await prisma.helpdeskTicket.findUnique({
      where: { id },
      select: {
        status: true, responsavelId: true, prioridade: true, categoriaId: true,
        areaId: true, prazoSla: true, pausadoEm: true, totalPausadoMs: true,
        primeiroAtendimentoEm: true, solicitanteId: true, titulo: true, descricao: true,
      },
    })
    if (!before) throw new Error('Ticket não encontrado')

    const patch: any = {}
    const eventos: Array<{ tipo: string; descricao: string; metadata?: Record<string, unknown> }> = []

    // Edição de título/descrição. Critérios distintos:
    //  - Título: pode ser editado pelo solicitante (criador) OU por quem atua
    //    como agente da TI (canAtuarAgente: master/empresa-master, DIRETOR/
    //    COORDENADOR, sub-permissão helpdesk.atuar_agente ou área de TI).
    //  - Descrição: continua restrita ao solicitante (criador).
    // Em ambos os casos o ticket não pode estar CANCELADO. Auditoria via evento.
    const querMudarTitulo = data.titulo !== undefined && data.titulo !== before.titulo
    const querMudarDescricao = data.descricao !== undefined && data.descricao !== before.descricao
    if (querMudarTitulo || querMudarDescricao) {
      const ehSolicitante = before.solicitanteId === userId
      // Resolve agente só quando necessário (edição de título por não-solicitante)
      const ehAgente = querMudarTitulo && !ehSolicitante
        ? await this.canAtuarAgente(userId)
        : false

      if (before.status === 'CANCELADO') {
        throw new Error('Ticket cancelado — edição não permitida')
      }

      if (querMudarTitulo) {
        if (!ehSolicitante && !ehAgente) {
          throw new Error('Só o criador do ticket ou um agente da TI pode editar o título')
        }
        patch.titulo = data.titulo
        eventos.push({
          tipo: 'titulo_editado',
          descricao: `Título alterado de "${before.titulo}" para "${data.titulo}"`,
          metadata: { de: before.titulo, para: data.titulo, porAgente: !ehSolicitante },
        })
      }

      if (querMudarDescricao) {
        if (!ehSolicitante) {
          throw new Error('Só o criador do ticket pode editar a descrição')
        }
        patch.descricao = data.descricao
        eventos.push({ tipo: 'descricao_editada', descricao: 'Descrição inicial editada pelo solicitante' })
      }
    }
    if (data.tipo !== undefined) patch.tipo = data.tipo
    if (data.tags !== undefined) patch.tags = data.tags
    if (data.arquivado !== undefined) {
      patch.arquivado = data.arquivado
      eventos.push({
        tipo: data.arquivado ? 'arquivado' : 'desarquivado',
        descricao: data.arquivado ? 'Ticket arquivado' : 'Ticket desarquivado',
      })
    }

    if (data.prioridade !== undefined && data.prioridade !== before.prioridade) {
      patch.prioridade = data.prioridade
      // Recalcula SLA se ainda está em aberto
      patch.prazoSla = await this.calcularPrazoSla(data.prioridade, data.categoriaId ?? before.categoriaId)
      eventos.push({
        tipo: 'prioridade_alterada',
        descricao: `Prioridade: ${before.prioridade} → ${data.prioridade}`,
      })
    }

    if (data.categoriaId !== undefined && data.categoriaId !== before.categoriaId) {
      patch.categoriaId = data.categoriaId
      // Re-roteia área se categoria mudou
      if (data.categoriaId) {
        const cat = await prisma.helpdeskCategoria.findUnique({
          where: { id: data.categoriaId },
          select: { areaId: true },
        })
        if (cat?.areaId && !data.areaId) patch.areaId = cat.areaId
      }
      eventos.push({ tipo: 'categoria_alterada', descricao: 'Categoria alterada' })
    }

    if (data.areaId !== undefined && data.areaId !== before.areaId) {
      patch.areaId = data.areaId
    }

    if (data.prazoSla !== undefined) {
      patch.prazoSla = data.prazoSla ? new Date(data.prazoSla) : null
      eventos.push({ tipo: 'prazo_alterado', descricao: 'Prazo SLA alterado' })
    }

    if (data.responsavelId !== undefined && data.responsavelId !== before.responsavelId) {
      patch.responsavelId = data.responsavelId
      const novoNome = data.responsavelId
        ? (await prisma.user.findUnique({ where: { id: data.responsavelId }, select: { name: true } }))?.name ?? '—'
        : 'Nenhum'
      eventos.push({
        tipo: 'atribuido',
        descricao: `Responsável: ${novoNome}`,
      })
      // Auto-progressão NOVO → EM_ANDAMENTO quando assumir
      if (before.status === 'NOVO' && data.responsavelId && !data.status) {
        patch.status = 'EM_ANDAMENTO'
        patch.primeiroAtendimentoEm = new Date()
        eventos.push({ tipo: 'status_alterado', descricao: 'NOVO → EM_ANDAMENTO (assumido)' })
      }
    }

    if (data.status !== undefined && data.status !== before.status) {
      patch.status = data.status
      eventos.push({
        tipo: 'status_alterado',
        descricao: `Status: ${before.status} → ${data.status}`,
      })
      // Marca primeiroAtendimentoEm na primeira saída de NOVO
      if (before.status === 'NOVO' && data.status !== 'NOVO' && !before.primeiroAtendimentoEm) {
        patch.primeiroAtendimentoEm = new Date()
      }
      // Auto-atribuição: se o ticket ainda não tinha responsável e está saindo
      // de NOVO, quem fez a alteração assume. Vale pro kanban e pra visualização
      // — ambos passam por update(). Não sobrescreve responsavelId vindo na
      // mesma requisição.
      if (
        before.status === 'NOVO'
        && data.status !== 'NOVO'
        && !before.responsavelId
        && data.responsavelId === undefined
      ) {
        patch.responsavelId = userId
        const autorNome = (await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        }))?.name ?? '—'
        eventos.push({
          tipo: 'atribuido',
          descricao: `Responsável: ${autorNome} (auto)`,
        })
      }
      // Pause/Resume SLA
      const eraPausado = HELPDESK_STATUS_PAUSADOS.includes(before.status as HelpdeskStatus)
      const ficaPausado = HELPDESK_STATUS_PAUSADOS.includes(data.status)
      if (!eraPausado && ficaPausado) {
        patch.pausadoEm = new Date()
      } else if (eraPausado && !ficaPausado) {
        // Soma tempo pausado e recalcula prazoSla pra compensar a pausa
        if (before.pausadoEm) {
          const deltaMs = Date.now() - before.pausadoEm.getTime()
          patch.totalPausadoMs = (Number(before.totalPausadoMs) || 0) + deltaMs
          patch.pausadoEm = null
          if (before.prazoSla) {
            patch.prazoSla = new Date(before.prazoSla.getTime() + deltaMs)
          }
        }
      }
      // Marca timestamps por status final
      if (data.status === 'RESOLVIDO') {
        patch.resolvidoEm = new Date()
      } else if (data.status === 'CONCLUIDO') {
        patch.concluidoEm = new Date()
      }
    }

    const updated = await prisma.helpdeskTicket.update({ where: { id }, data: patch })

    for (const ev of eventos) {
      await this.addEvento(id, userId, ev.tipo, ev.descricao, ev.metadata)
    }

    // Notificações pós-update — fire-and-forget
    void this.notifyUpdate(id, before, patch, userId)

    return updated
  }

  /**
   * Arquiva em massa todos os tickets de um status. Usado pra "limpar" a coluna
   * Cancelado/Concluído do kanban sem precisar abrir ticket por ticket. Registra
   * um HelpdeskEvento "arquivado" pra cada ticket afetado pra trilha de auditoria.
   * Retorna a contagem afetada.
   */
  async arquivarPorStatus(status: HelpdeskStatus, userId: string, empresaId?: string | null): Promise<{ count: number }> {
    const where = {
      status,
      arquivado: false,
      ...(empresaId ? { empresaId } : {}),
    }
    const ids = await prisma.helpdeskTicket.findMany({ where, select: { id: true } })
    if (ids.length === 0) return { count: 0 }

    await prisma.helpdeskTicket.updateMany({ where, data: { arquivado: true } })
    await prisma.helpdeskEvento.createMany({
      data: ids.map(t => ({
        ticketId: t.id,
        autorId: userId,
        tipo: 'arquivado',
        descricao: 'Ticket arquivado em lote',
      })),
    }).catch((e: Error) => {
      console.warn('[Helpdesk] Falha ao registrar eventos de arquivamento em lote:', e.message)
    })
    return { count: ids.length }
  }

  /**
   * Notifica eventos relevantes após update:
   *  - Atribuição → notifica novo responsável (sino + e-mail)
   *  - Mudança de status → notifica solicitante + responsável (apenas mudanças
   *    relevantes — não notifica em transições internas do agente como Aguardando→EmAndamento)
   *  - Status RESOLVIDO → e-mail ao solicitante pedindo CSAT
   */
  private async notifyUpdate(
    ticketId: string,
    before: {
      status: string; responsavelId: string | null; prioridade: string;
      categoriaId: string | null; areaId: string | null;
    },
    patch: any,
    actorId: string,
  ) {
    try {
      const t = await prisma.helpdeskTicket.findUnique({
        where: { id: ticketId },
        select: {
          id: true, numero: true, titulo: true, status: true, prioridade: true,
          empresaId: true, solicitanteId: true, responsavelId: true,
          solicitante: { select: { id: true, name: true, email: true } },
          responsavel: { select: { id: true, name: true, email: true } },
        },
      })
      if (!t) return
      const ticketNum = `#HLP${String(t.numero).padStart(4, '0')}`
      const link = `/helpdesk/${ticketId}`

      // Resolve uma vez o e-mail/nome do responsável anterior (pra notificar
      // sobre a alteração) — antes do .update() os dados eram do "before".
      const responsavelAnterior = before.responsavelId
        ? await prisma.user.findUnique({
            where: { id: before.responsavelId },
            select: { id: true, name: true, email: true },
          })
        : null

      // Helper local: envia push (sino) + e-mail pra cada destinatário único,
      // pulando o próprio actor (quem fez a alteração não se notifica).
      const notificarLote = async (
        users: Array<{ id: string; email: string | null } | null | undefined>,
        push: { titulo: string; mensagem: string; tipo: 'info' | 'success' | 'warning' | 'error' },
        email: { subject: string; html: string },
      ) => {
        const validos = users
          .filter((u): u is { id: string; email: string | null } => !!u?.id && u.id !== actorId)
          // dedup por id (caso solicitante seja também o responsável anterior, etc.)
          .filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)
        if (validos.length === 0) return
        await this.notificationService.criarParaUsers(
          validos.map(u => u.id),
          { ...push, link, origem: 'helpdesk', empresaId: t.empresaId },
        )
        for (const u of validos) {
          if (u.email) {
            void this.emailService.sendMail({ to: u.email, subject: email.subject, html: email.html })
          }
        }
      }

      // ── 1. Responsável mudou ─────────────────────────────────────
      // Destinatários: criador, responsável anterior, novo responsável.
      // Todos pulam o actor automaticamente via notificarLote.
      if (patch.responsavelId !== undefined && patch.responsavelId !== before.responsavelId) {
        const novoNome = t.responsavel?.name ?? 'Nenhum'
        const anteriorNome = responsavelAnterior?.name ?? 'Nenhum'
        const corpo = `Responsável do ticket <strong>${t.titulo}</strong>: ` +
          `<em>${anteriorNome}</em> → <strong>${novoNome}</strong>.`
        await notificarLote(
          [t.solicitante, responsavelAnterior, t.responsavel],
          {
            titulo: `${ticketNum} — responsável alterado`,
            mensagem: `${anteriorNome} → ${novoNome}`,
            tipo: 'info',
          },
          {
            subject: `HelpDesk ${ticketNum} — responsável alterado`,
            html: this.emailTpl(ticketNum, corpo, link),
          },
        )
      }

      // ── 2. Status mudou (ignorando mudanças para NOVO) ───────────
      // Regra: criador sempre; responsável atual também, se diferente do actor.
      if (patch.status && patch.status !== before.status && patch.status !== 'NOVO') {
        const statusLabel = patch.status as string
        const corpo = `Status do ticket <strong>${t.titulo}</strong> alterado para <strong>${statusLabel}</strong>.`
        await notificarLote(
          [t.solicitante, t.responsavel],
          {
            titulo: `${ticketNum} → ${statusLabel}`,
            mensagem: t.titulo,
            tipo: patch.status === 'RESOLVIDO' || patch.status === 'CONCLUIDO' ? 'success' : 'info',
          },
          {
            subject: `HelpDesk ${ticketNum} — ${statusLabel}`,
            html: this.emailTpl(ticketNum, corpo, link),
          },
        )

        // E-mail extra pro solicitante quando RESOLVIDO — pedindo CSAT.
        // Mantém comportamento existente (sobrepõe ao genérico acima — é ok,
        // são dois e-mails: "status alterado" + "avalie").
        if (patch.status === 'RESOLVIDO' && t.solicitante?.email && t.solicitante.id !== actorId) {
          void this.emailService.sendMail({
            to: t.solicitante.email,
            subject: `HelpDesk ${ticketNum} resolvido — avalie o atendimento`,
            html: this.emailTpl(
              ticketNum,
              `Seu ticket <strong>${t.titulo}</strong> foi resolvido. ` +
              `Avalie o atendimento (5 estrelas máx) para fechar o chamado. ` +
              `Após 3 dias sem resposta, fecharemos automaticamente com nota neutra.`,
              link,
            ),
          })
        }
      }
    } catch (e) {
      console.warn('[Helpdesk] Falha em notifyUpdate:', (e as Error).message)
    }
  }

  private emailTpl(ticketNum: string, corpoHtml: string, linkRel: string): string {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.oneclick.com.br'
    return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1f2937">
      <div style="border-left:4px solid #22d3ee;padding:12px 16px;background:#ecfeff;border-radius:4px">
        <h2 style="margin:0 0 4px 0;font-size:14px;color:#0e7490">HelpDesk · ${ticketNum}</h2>
      </div>
      <div style="padding:16px 0;font-size:14px;line-height:1.5">${corpoHtml}</div>
      <a href="${base}${linkRel}" style="display:inline-block;background:#22d3ee;color:white;padding:10px 16px;border-radius:4px;text-decoration:none;font-size:13px">Abrir ticket</a>
      <p style="margin-top:24px;font-size:11px;color:#9ca3af">E-mail automático. Para responder ao agente, use o link acima ou responda esta mensagem (o sistema reconhece o número do ticket no assunto).</p>
    </div>`
  }

  // ── Mensagens ──────────────────────────────────────────────────

  async addMensagem(input: AddMensagemInput, userId: string) {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: input.ticketId },
      select: {
        id: true, status: true, solicitanteId: true, responsavelId: true,
        primeiroAtendimentoEm: true,
      },
    })
    if (!ticket) throw new Error('Ticket não encontrado')

    const msg = await prisma.helpdeskMensagem.create({
      data: {
        ticketId: input.ticketId,
        autorId: userId,
        conteudo: input.conteudo,
        interna: input.interna,
      },
    })

    // Resposta a uma mensagem específica (citar) — via SQL raw (client local pode
    // estar desatualizado pelo lock de DLL; coluna existe no schema/prod).
    if (input.respostaParaId) {
      await prisma.$executeRawUnsafe(
        `UPDATE helpdesk_mensagens SET resposta_para_id = $2 WHERE id = $1 AND EXISTS (SELECT 1 FROM helpdesk_mensagens p WHERE p.id = $2 AND p.ticket_id = $3)`,
        msg.id, input.respostaParaId, input.ticketId,
      ).catch(() => { /* coluna ausente ainda */ })
    }

    await this.addEvento(
      input.ticketId,
      userId,
      input.interna ? 'nota_interna' : 'mensagem_publica',
      input.interna ? 'Nota interna adicionada' : 'Mensagem pública adicionada',
    )

    // Comportamentos automáticos em mensagem pública:
    //  - marca primeiroAtendimentoEm se for primeira resposta de agente
    if (!input.interna) {
      const patch: any = {}
      if (userId !== ticket.solicitanteId && !ticket.primeiroAtendimentoEm) {
        patch.primeiroAtendimentoEm = new Date()
      }
      if (Object.keys(patch).length) {
        await prisma.helpdeskTicket.update({ where: { id: input.ticketId }, data: patch })
      }
    }

    // Notifica o outro lado da conversa (sino + e-mail se pública)
    void this.notifyMensagem(input.ticketId, msg.id, input.interna, userId)

    return msg
  }

  /**
   * Edição de mensagem. Só o autor pode editar suas próprias mensagens,
   * desde que o ticket não esteja CANCELADO. O campo editadoEm é atualizado
   * para a UI exibir "(editada)" e fica registrado um evento na timeline
   * pra auditoria.
   */
  async editMensagem(input: EditMensagemInput, userId: string) {
    const msg = await prisma.helpdeskMensagem.findUnique({
      where: { id: input.id },
      select: {
        id: true, autorId: true, ticketId: true, interna: true,
        ticket: { select: { status: true } },
      },
    })
    if (!msg) throw new Error('Mensagem não encontrada')
    if (msg.autorId !== userId) {
      throw new Error('Só o autor pode editar a mensagem')
    }
    if (msg.ticket?.status === 'CANCELADO') {
      throw new Error('Ticket cancelado — edição não permitida')
    }
    const atualizada = await prisma.helpdeskMensagem.update({
      where: { id: input.id },
      data: { conteudo: input.conteudo, editadoEm: new Date() },
    })
    await this.addEvento(
      msg.ticketId,
      userId,
      'mensagem_editada',
      msg.interna ? 'Nota interna editada' : 'Mensagem pública editada',
      { mensagemId: msg.id },
    )
    return atualizada
  }

  /**
   * Exclusão de mensagem. Só o autor pode excluir, ticket não pode estar
   * CANCELADO. Anexos vinculados à mensagem são removidos junto na mesma
   * transação. Evento de auditoria é gravado na timeline.
   */
  async deleteMensagem(input: DeleteMensagemInput, userId: string) {
    const msg = await prisma.helpdeskMensagem.findUnique({
      where: { id: input.id },
      select: {
        id: true, autorId: true, ticketId: true, interna: true,
        ticket: { select: { status: true } },
      },
    })
    if (!msg) throw new Error('Mensagem não encontrada')
    if (msg.autorId !== userId) {
      throw new Error('Só o autor pode excluir a mensagem')
    }
    if (msg.ticket?.status === 'CANCELADO') {
      throw new Error('Ticket cancelado — exclusão não permitida')
    }
    // Remove anexos vinculados explicitamente — a FK do schema é SetNull,
    // mas anexo sem mensagem vira órfão na thread. Deletamos junto pra
    // manter a conversa coerente.
    await prisma.$transaction([
      prisma.helpdeskAnexo.deleteMany({ where: { mensagemId: input.id } }),
      prisma.helpdeskMensagem.delete({ where: { id: input.id } }),
    ])
    await this.addEvento(
      msg.ticketId,
      userId,
      'mensagem_deletada',
      msg.interna ? 'Nota interna excluída pelo autor' : 'Mensagem pública excluída pelo autor',
      { mensagemId: msg.id },
    )
    return { ok: true }
  }

  /**
   * Exclusão de anexo individual. Podem excluir: agentes da TI
   * (canAtuarAgente — master/empresa-master, DIRETOR/COORDENADOR, sub-perm
   * helpdesk.atuar_agente, área de TI) OU o solicitante (criador) do ticket.
   * Ticket não pode estar CANCELADO. Funciona tanto pra anexos standalone
   * (mensagemId=null) quanto pra anexos vinculados a uma mensagem específica.
   * Evento de auditoria é gravado.
   */
  async deleteAnexo(input: { id: string }, userId: string) {
    const anexo = await prisma.helpdeskAnexo.findUnique({
      where: { id: input.id },
      select: {
        id: true, autorId: true, ticketId: true, fileName: true,
        ticket: { select: { status: true, solicitanteId: true } },
      },
    })
    if (!anexo) throw new Error('Anexo não encontrado')
    const isAgente = await this.canAtuarAgente(userId)
    const isCriador = anexo.ticket?.solicitanteId === userId
    if (!isAgente && !isCriador) {
      throw new Error('Sem permissão para excluir o anexo')
    }
    if (anexo.ticket?.status === 'CANCELADO') {
      throw new Error('Ticket cancelado — exclusão não permitida')
    }
    await prisma.helpdeskAnexo.delete({ where: { id: input.id } })
    await this.addEvento(
      anexo.ticketId,
      userId,
      'anexo_deletado',
      `Anexo excluído: ${anexo.fileName}`,
      { anexoId: anexo.id, fileName: anexo.fileName },
    )
    return { ok: true }
  }

  private async notifyMensagem(ticketId: string, mensagemId: string, interna: boolean, autorId: string) {
    try {
      const t = await prisma.helpdeskTicket.findUnique({
        where: { id: ticketId },
        select: {
          numero: true, titulo: true, empresaId: true,
          solicitanteId: true, responsavelId: true,
          solicitante: { select: { name: true, email: true } },
          responsavel: { select: { name: true, email: true } },
          watchers: { select: { userId: true } },
        },
      })
      if (!t) return
      const ticketNum = `#HLP${String(t.numero).padStart(4, '0')}`
      const link = `/helpdesk/${ticketId}`

      // Destinatários do sino:
      //  - pública: solicitante + responsável + watchers, exceto o autor
      //  - interna: apenas responsável + watchers (NÃO o solicitante)
      const set = new Set<string>()
      if (!interna && t.solicitanteId) set.add(t.solicitanteId)
      if (t.responsavelId) set.add(t.responsavelId)
      for (const w of t.watchers) set.add(w.userId)
      set.delete(autorId)
      const dest = Array.from(set)

      if (dest.length > 0) {
        await this.notificationService.criarParaUsers(dest, {
          titulo: interna ? `Nota interna em ${ticketNum}` : `Nova resposta em ${ticketNum}`,
          mensagem: t.titulo,
          tipo: 'info',
          link,
          origem: 'helpdesk',
          empresaId: t.empresaId,
        })
      }

      // E-mail apenas em mensagem pública e quando o destinatário é o "outro lado"
      if (!interna && t.solicitante?.email && autorId !== t.solicitanteId) {
        void this.emailService.sendMail({
          to: t.solicitante.email,
          subject: `HelpDesk ${ticketNum} — nova resposta`,
          html: this.emailTpl(ticketNum, `Você recebeu uma nova mensagem no ticket <strong>${t.titulo}</strong>.`, link),
        })
      }
      if (!interna && t.responsavel?.email && autorId === t.solicitanteId) {
        void this.emailService.sendMail({
          to: t.responsavel.email,
          subject: `HelpDesk ${ticketNum} — solicitante respondeu`,
          html: this.emailTpl(ticketNum, `O solicitante respondeu o ticket <strong>${t.titulo}</strong>.`, link),
        })
      }
      void mensagemId
    } catch (e) {
      console.warn('[Helpdesk] Falha em notifyMensagem:', (e as Error).message)
    }
  }

  async listMensagens(ticketId: string) {
    return prisma.helpdeskMensagem.findMany({
      where: { ticketId },
      include: {
        autor: { select: { id: true, name: true, image: true } },
        anexos: true,
      },
      orderBy: { createdAt: 'asc' },
    })
  }

  // ── CSAT ──────────────────────────────────────────────────────

  async responderCsat(ticketId: string, nota: number, comentario: string | null, userId: string) {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { solicitanteId: true, status: true, csatRespondidoEm: true },
    })
    if (!ticket) throw new Error('Ticket não encontrado')
    if (ticket.solicitanteId !== userId) throw new Error('Apenas o solicitante pode responder a avaliação')
    if (ticket.csatRespondidoEm) throw new Error('Avaliação já registrada')
    if (ticket.status !== 'RESOLVIDO' && ticket.status !== 'CONCLUIDO') {
      throw new Error('Avaliação só disponível após resolução')
    }

    const updated = await prisma.helpdeskTicket.update({
      where: { id: ticketId },
      data: {
        csatNota: nota,
        csatComentario: comentario,
        csatRespondidoEm: new Date(),
        // Avaliar fecha o ticket definitivamente
        status: 'CONCLUIDO',
        concluidoEm: new Date(),
      },
    })

    await this.addEvento(ticketId, userId, 'csat_recebido', `Avaliação: ${nota}/5${comentario ? ' (com comentário)' : ''}`, {
      nota,
      comentario,
    })

    return updated
  }

  // ── Watchers ──────────────────────────────────────────────────

  async addWatcher(ticketId: string, watcherUserId: string) {
    return prisma.helpdeskWatcher.upsert({
      where: { ticketId_userId: { ticketId, userId: watcherUserId } },
      create: { ticketId, userId: watcherUserId },
      update: {},
    })
  }

  async removeWatcher(ticketId: string, watcherUserId: string) {
    return prisma.helpdeskWatcher.deleteMany({
      where: { ticketId, userId: watcherUserId },
    })
  }

  // ── Anexos ────────────────────────────────────────────────────

  async addAnexo(
    ticketId: string,
    autorId: string,
    file: { fileName: string; fileUrl: string; mimeType?: string | null; tamanho?: number },
    mensagemId?: string | null,
  ) {
    const anexo = await prisma.helpdeskAnexo.create({
      data: {
        ticketId,
        autorId,
        mensagemId: mensagemId || null,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        mimeType: file.mimeType ?? null,
        tamanho: file.tamanho ?? 0,
      },
    })
    await this.addEvento(ticketId, autorId, 'anexo_adicionado', `Anexo: ${file.fileName}`)
    // Anexo standalone (sem mensagem associada) notifica o outro lado por sino
    // + e-mail. Se vier junto com uma mensagem, a notifyMensagem já notifica e
    // duplicar seria ruído.
    if (!mensagemId) {
      void this.notifyAnexo(ticketId, autorId, file.fileName)
    }
    return anexo
  }

  /**
   * Notifica o "outro lado" quando um anexo é adicionado fora de uma mensagem:
   *   - TI (responsável/agente) anexa → notifica solicitante (sino + email)
   *   - Solicitante anexa → notifica responsável (ou área inteira se sem responsável)
   *                          + watchers
   */
  private async notifyAnexo(ticketId: string, autorId: string, fileName: string) {
    try {
      const t = await prisma.helpdeskTicket.findUnique({
        where: { id: ticketId },
        select: {
          numero: true, titulo: true, empresaId: true, areaId: true,
          solicitanteId: true, responsavelId: true,
          solicitante: { select: { name: true, email: true } },
          responsavel: { select: { name: true, email: true } },
          watchers: { select: { userId: true } },
        },
      })
      if (!t) return
      const ticketNum = `#HLP${String(t.numero).padStart(4, '0')}`
      const link = `/helpdesk/${ticketId}`
      const ehSolicitante = autorId === t.solicitanteId

      // Sino — quem deve ver
      const set = new Set<string>()
      if (ehSolicitante) {
        // Solicitante anexou: notifica responsável + watchers; sem responsável, área
        if (t.responsavelId) set.add(t.responsavelId)
        else if (t.areaId) {
          const agentesArea = await prisma.user.findMany({
            where: {
              areaId: t.areaId,
              isActive: true,
              id: { not: autorId },
              ...(t.empresaId ? { OR: [{ empresaId: t.empresaId }, { empresaId: null }] } : {}),
            },
            select: { id: true },
          })
          for (const a of agentesArea) set.add(a.id)
        }
        for (const w of t.watchers) set.add(w.userId)
      } else {
        // TI/agente anexou: notifica solicitante + watchers (exceto autor)
        if (t.solicitanteId) set.add(t.solicitanteId)
        for (const w of t.watchers) set.add(w.userId)
      }
      set.delete(autorId)
      const dest = Array.from(set)

      if (dest.length > 0) {
        await this.notificationService.criarParaUsers(dest, {
          titulo: `Novo anexo em ${ticketNum}`,
          mensagem: `${fileName} — ${t.titulo}`,
          tipo: 'info',
          link,
          origem: 'helpdesk',
          empresaId: t.empresaId,
        })
      }

      // E-mail pro outro lado
      const corpo = `Um novo anexo foi adicionado ao ticket <strong>${t.titulo}</strong>:<br><br><strong>📎 ${fileName}</strong>`
      if (ehSolicitante && t.responsavel?.email) {
        void this.emailService.sendMail({
          to: t.responsavel.email,
          subject: `HelpDesk ${ticketNum} — solicitante anexou um arquivo`,
          html: this.emailTpl(ticketNum, corpo, link),
        })
      } else if (!ehSolicitante && t.solicitante?.email) {
        void this.emailService.sendMail({
          to: t.solicitante.email,
          subject: `HelpDesk ${ticketNum} — novo anexo`,
          html: this.emailTpl(ticketNum, corpo, link),
        })
      }
    } catch (e) {
      console.warn('[Helpdesk] Falha em notifyAnexo:', (e as Error).message)
    }
  }

  async listAnexos(ticketId: string) {
    return prisma.helpdeskAnexo.findMany({
      where: { ticketId },
      include: { autor: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  // ── SLA scheduler — alerta e auto-fechamento ─────────────────

  /**
   * Verifica tickets próximos do SLA (75% consumido) ou já estourados e
   * notifica responsável + líder. Idempotente: marca slaAlertadoEm /
   * slaEstouradoEm pra não re-notificar.
   *
   * Auto-fecha tickets RESOLVIDOS há mais de N dias sem CSAT (CONCLUIDO).
   */
  async checkSlaERollover() {
    const agora = new Date()
    let alertados = 0
    let estourados = 0
    let auto_fechados = 0

    // 1. Tickets ativos com prazoSla próximo — alerta 75% consumido
    const ativos = await prisma.helpdeskTicket.findMany({
      where: {
        ativo: true,
        arquivado: false,
        status: { in: ['NOVO', 'EM_ANDAMENTO'] },
        prazoSla: { not: null },
        slaAlertadoEm: null,
      },
      select: {
        id: true, numero: true, titulo: true, createdAt: true, prazoSla: true,
        responsavelId: true, areaId: true, empresaId: true, prioridade: true,
      },
      take: 500,
    })

    for (const t of ativos) {
      if (!t.prazoSla) continue
      const totalMs = t.prazoSla.getTime() - t.createdAt.getTime()
      const consumidoMs = agora.getTime() - t.createdAt.getTime()
      const pct = totalMs > 0 ? consumidoMs / totalMs : 1
      const estouro = t.prazoSla.getTime() < agora.getTime()

      if (estouro) {
        // Marca slaEstouradoEm
        await prisma.helpdeskTicket.update({
          where: { id: t.id },
          data: { slaEstouradoEm: agora, slaAlertadoEm: agora },
        })
        await this.notificarSla(t, 'ESTOURADO')
        estourados++
      } else if (pct >= 0.75) {
        await prisma.helpdeskTicket.update({
          where: { id: t.id },
          data: { slaAlertadoEm: agora },
        })
        await this.notificarSla(t, 'ALERTA')
        alertados++
      }
    }

    // 2. Auto-fecha RESOLVIDOS sem CSAT há mais de 3 dias
    const limiteAutoFechamento = new Date(agora.getTime() - 3 * 24 * 60 * 60 * 1000)
    const semCsat = await prisma.helpdeskTicket.findMany({
      where: {
        status: 'RESOLVIDO',
        csatRespondidoEm: null,
        resolvidoEm: { lte: limiteAutoFechamento },
      },
      select: { id: true, numero: true, titulo: true, solicitanteId: true, empresaId: true },
      take: 200,
    })
    for (const t of semCsat) {
      await prisma.helpdeskTicket.update({
        where: { id: t.id },
        data: { status: 'CONCLUIDO', concluidoEm: agora, csatNota: 3 }, // nota neutra automática
      })
      await this.addEvento(t.id, null, 'status_alterado', 'RESOLVIDO → CONCLUIDO (auto-fechado por inatividade)')
      auto_fechados++
    }

    return { alertados, estourados, auto_fechados }
  }

  private async notificarSla(
    ticket: { id: string; numero: number; titulo: string; responsavelId: string | null; areaId: string | null; empresaId: string | null; prioridade: string },
    tipo: 'ALERTA' | 'ESTOURADO',
  ) {
    const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
    const destinatarios: string[] = []
    if (ticket.responsavelId) destinatarios.push(ticket.responsavelId)
    if (ticket.areaId) {
      const area = await prisma.area.findUnique({
        where: { id: ticket.areaId },
        select: { leaderId: true },
      })
      if (area?.leaderId && !destinatarios.includes(area.leaderId)) destinatarios.push(area.leaderId)
    }
    if (destinatarios.length === 0) return

    const link = `/helpdesk/${ticket.id}`

    // Sino
    try {
      await this.notificationService.criarParaUsers(destinatarios, {
        titulo: tipo === 'ESTOURADO'
          ? `⚠ SLA estourou no ticket ${ticketNum}`
          : `⏰ SLA próximo do limite — ${ticketNum}`,
        mensagem: `${ticket.titulo} (${ticket.prioridade})`,
        tipo: tipo === 'ESTOURADO' ? 'error' : 'warning',
        link,
        origem: 'helpdesk',
        empresaId: ticket.empresaId,
      })
    } catch (e) {
      console.warn('[Helpdesk] Falha ao notificar SLA (sino):', (e as Error).message)
    }

    // E-mail apenas para ESTOURADO — alerta de SLA é só sino (evita spam)
    if (tipo === 'ESTOURADO') {
      try {
        const users = await prisma.user.findMany({
          where: { id: { in: destinatarios } },
          select: { email: true, isActive: true },
        })
        const emails = users.filter(u => u.isActive && u.email).map(u => u.email!)
        if (emails.length > 0) {
          void this.emailService.sendMail({
            to: emails,
            subject: `⚠ SLA estourou — ${ticketNum} (${ticket.prioridade})`,
            html: this.emailTpl(
              ticketNum,
              `O SLA do ticket <strong>${ticket.titulo}</strong> foi <strong>estourado</strong>. ` +
              `Prioridade: <strong>${ticket.prioridade}</strong>. ` +
              `Ação imediata recomendada — acesse o ticket para acompanhar.`,
              link,
            ),
          })
        }
      } catch (e) {
        console.warn('[Helpdesk] Falha ao notificar SLA (e-mail):', (e as Error).message)
      }
    }
  }

  // ── Inbound de e-mail (Resend) ─────────────────────────────────
  // Endpoint público recebe payload do Resend Inbound e cria/anexa.
  // Reconhece o número do ticket no assunto (#HLP1234) pra threading.

  async processarInbound(payload: {
    from: string
    fromName?: string | null
    subject: string
    html?: string | null
    text?: string | null
    attachments?: Array<{ filename: string; content: string; contentType?: string | null }>
  }) {
    const remetente = String(payload.from).trim().toLowerCase()
    if (!remetente) throw new Error('payload sem remetente')

    // Resolve autor: user cadastrado com este e-mail?
    const user = await prisma.user.findFirst({
      where: { email: { equals: remetente, mode: 'insensitive' } },
      select: { id: true, name: true, empresaId: true },
    })

    // Detecta número do ticket no assunto: #HLP0042
    const match = /#HLP(\d+)/i.exec(payload.subject || '')
    const conteudoHtml = payload.html || (payload.text ? `<pre>${payload.text}</pre>` : '<p>(vazio)</p>')

    if (match) {
      const numero = parseInt(match[1] ?? '0', 10)
      const ticket = await prisma.helpdeskTicket.findFirst({
        where: { numero, ativo: true },
        select: { id: true, empresaId: true },
      })
      if (ticket) {
        // Reply — anexa mensagem ao ticket existente
        const msg = await prisma.helpdeskMensagem.create({
          data: {
            ticketId: ticket.id,
            autorId: user?.id ?? null,
            autorExternoEmail: user ? null : remetente,
            autorExternoNome: user ? null : (payload.fromName ?? remetente),
            conteudo: conteudoHtml,
            interna: false,
          },
        })
        await this.persistAnexos(ticket.id, msg.id, user?.id ?? null, payload.attachments)
        await this.addEvento(
          ticket.id, user?.id ?? null, 'mensagem_publica',
          `Resposta via e-mail de ${user?.name ?? remetente}`,
        )
        return { type: 'reply', ticketId: ticket.id, mensagemId: msg.id }
      }
      // Número informado mas não existe → cai pro fluxo de criação
    }

    // Criação de novo ticket
    const ticket = await prisma.helpdeskTicket.create({
      data: {
        titulo: payload.subject?.substring(0, 200) || `Solicitação de ${remetente}`,
        descricao: conteudoHtml,
        tipo: 'INCIDENTE',
        prioridade: 'MEDIA',
        status: 'NOVO',
        solicitanteId: user?.id ?? null,
        solicitanteExternoEmail: user ? null : remetente,
        solicitanteExternoNome: user ? null : (payload.fromName ?? remetente),
        prazoSla: await this.calcularPrazoSla('MEDIA', null),
        empresaId: user?.empresaId ?? null,
      },
    })
    await this.persistAnexos(ticket.id, null, user?.id ?? null, payload.attachments)
    await this.addEvento(
      ticket.id, user?.id ?? null, 'criado',
      `Ticket criado via e-mail de ${user?.name ?? remetente}`,
      { canal: 'inbound', remetente },
    )
    // Notifica agentes (área = null, sem categoria → fica visível só pra master/admin
    // até alguém categorizar)
    return { type: 'created', ticketId: ticket.id }
  }

  private async persistAnexos(
    ticketId: string,
    mensagemId: string | null,
    autorId: string | null,
    attachments?: Array<{ filename: string; content: string; contentType?: string | null }>,
  ) {
    if (!attachments?.length) return
    for (const att of attachments) {
      // MVP: armazena como data URL (base64). Em produção, fazer upload pra S3
      // e salvar URL pública. Limite de tamanho aqui é razoável: data URL pode
      // ser grande, mas o webhook do Resend já vem com tamanho máximo controlado.
      const mimeType = att.contentType || 'application/octet-stream'
      const tamanho = Math.floor((att.content?.length || 0) * 0.75) // estimativa após decode base64
      const fileUrl = `data:${mimeType};base64,${att.content}`
      await prisma.helpdeskAnexo.create({
        data: {
          ticketId,
          mensagemId,
          autorId,
          fileName: att.filename,
          fileUrl,
          mimeType,
          tamanho,
        },
      }).catch((e: Error) => {
        console.warn('[Helpdesk] Falha ao salvar anexo inbound:', e.message)
      })
    }
  }

  // ── Configurações do módulo ───────────────────────────────────
  // Persistidas em SystemConfig. Master/empresa-master editam pela pill
  // /configuracoes → Helpdesk.

  private static readonly CFG_PREFIX = 'helpdesk.'
  private static readonly CFG_AUTO_FECHAMENTO_DIAS = 'helpdesk.auto_fechamento_dias'
  private static readonly CFG_INBOUND_EMAIL = 'helpdesk.inbound_email'
  private static readonly CFG_EMAIL_NOTIFICACAO = 'helpdesk.email_notificacao'
  private static readonly DEFAULT_EMAIL_NOTIFICACAO = 'ti@central-rnc.com.br'
  // SLA por prioridade — chaves helpdesk.sla.BAIXA / MEDIA / ALTA / URGENTE

  async getConfig() {
    const cfgs = await prisma.systemConfig.findMany({
      where: { key: { startsWith: HelpdeskService.CFG_PREFIX } },
    })
    const map = new Map(cfgs.map(c => [c.key, c.value]))
    const slaPorPrioridade: Record<HelpdeskPrioridade, number> = {
      BAIXA: Number(map.get('helpdesk.sla.BAIXA') ?? HELPDESK_SLA_PADRAO_HORAS.BAIXA),
      MEDIA: Number(map.get('helpdesk.sla.MEDIA') ?? HELPDESK_SLA_PADRAO_HORAS.MEDIA),
      ALTA: Number(map.get('helpdesk.sla.ALTA') ?? HELPDESK_SLA_PADRAO_HORAS.ALTA),
      URGENTE: Number(map.get('helpdesk.sla.URGENTE') ?? HELPDESK_SLA_PADRAO_HORAS.URGENTE),
    }
    return {
      slaPorPrioridade,
      autoFechamentoDias: Number(map.get(HelpdeskService.CFG_AUTO_FECHAMENTO_DIAS) ?? 3),
      inboundEmail: map.get(HelpdeskService.CFG_INBOUND_EMAIL) ?? '',
      emailNotificacao: map.get(HelpdeskService.CFG_EMAIL_NOTIFICACAO) ?? HelpdeskService.DEFAULT_EMAIL_NOTIFICACAO,
    }
  }

  async updateConfig(input: {
    slaPorPrioridade?: Partial<Record<HelpdeskPrioridade, number>>
    autoFechamentoDias?: number
    inboundEmail?: string
    emailNotificacao?: string
  }) {
    const upserts: Array<{ key: string; value: string; label: string }> = []
    if (input.slaPorPrioridade) {
      for (const [prio, horas] of Object.entries(input.slaPorPrioridade)) {
        if (typeof horas === 'number' && horas > 0) {
          upserts.push({
            key: `helpdesk.sla.${prio}`,
            value: String(Math.max(1, Math.floor(horas))),
            label: `SLA padrão (horas) — prioridade ${prio}`,
          })
        }
      }
    }
    if (typeof input.autoFechamentoDias === 'number' && input.autoFechamentoDias > 0) {
      upserts.push({
        key: HelpdeskService.CFG_AUTO_FECHAMENTO_DIAS,
        value: String(Math.max(1, Math.floor(input.autoFechamentoDias))),
        label: 'Dias para auto-fechar RESOLVIDO sem CSAT',
      })
    }
    if (input.inboundEmail !== undefined) {
      upserts.push({
        key: HelpdeskService.CFG_INBOUND_EMAIL,
        value: String(input.inboundEmail).trim(),
        label: 'Endereço inbound para abertura de tickets por e-mail',
      })
    }
    if (input.emailNotificacao !== undefined) {
      upserts.push({
        key: HelpdeskService.CFG_EMAIL_NOTIFICACAO,
        value: String(input.emailNotificacao).trim(),
        label: 'Email pra receber notificação de tickets sem categoria/área (ex: via FAB)',
      })
    }
    for (const u of upserts) {
      await prisma.systemConfig.upsert({
        where: { key: u.key },
        update: { value: u.value, label: u.label, group: 'Helpdesk' },
        create: { key: u.key, value: u.value, label: u.label, group: 'Helpdesk' },
      })
    }
    return { ok: true, atualizados: upserts.length }
  }

  // ── Métricas — dashboard de TI ────────────────────────────────

  async getMetricas(empresaId?: string | null, periodoDias = 30) {
    const agora = new Date()
    const inicio = new Date(agora.getTime() - periodoDias * 24 * 60 * 60 * 1000)
    const baseWhere = {
      ativo: true,
      ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
    }

    const [totalAbertos, totalAtrasados, totalResolvidos, totalConcluidos, totalNoPeriodo] = await Promise.all([
      prisma.helpdeskTicket.count({ where: { ...baseWhere, status: { in: ['NOVO', 'EM_ANDAMENTO'] }, arquivado: false } }),
      prisma.helpdeskTicket.count({ where: { ...baseWhere, status: { in: ['NOVO', 'EM_ANDAMENTO'] }, prazoSla: { lt: agora } } }),
      prisma.helpdeskTicket.count({ where: { ...baseWhere, status: 'RESOLVIDO', resolvidoEm: { gte: inicio } } }),
      prisma.helpdeskTicket.count({ where: { ...baseWhere, status: 'CONCLUIDO', concluidoEm: { gte: inicio } } }),
      prisma.helpdeskTicket.count({ where: { ...baseWhere, createdAt: { gte: inicio } } }),
    ])

    // Concluídos com SLA cumprido (concluiu antes do prazo)
    const slaCumprido = await prisma.helpdeskTicket.count({
      where: {
        ...baseWhere,
        status: { in: ['RESOLVIDO', 'CONCLUIDO'] },
        concluidoEm: { gte: inicio },
        slaEstouradoEm: null,
      },
    })

    // CSAT médio últimos 30 dias
    const csatAgg = await prisma.helpdeskTicket.aggregate({
      where: {
        ...baseWhere,
        csatNota: { not: null },
        csatRespondidoEm: { gte: inicio },
      },
      _avg: { csatNota: true },
      _count: { csatNota: true },
    })

    // Tempo médio de 1ª resposta (TFR) e resolução (MTTR), em horas
    const fechados = await prisma.helpdeskTicket.findMany({
      where: {
        ...baseWhere,
        status: { in: ['RESOLVIDO', 'CONCLUIDO'] },
        createdAt: { gte: inicio },
      },
      select: { createdAt: true, primeiroAtendimentoEm: true, resolvidoEm: true },
      take: 1000,
    })
    let tfrSum = 0, tfrCount = 0, mttrSum = 0, mttrCount = 0
    for (const t of fechados) {
      if (t.primeiroAtendimentoEm) {
        tfrSum += (t.primeiroAtendimentoEm.getTime() - t.createdAt.getTime())
        tfrCount++
      }
      if (t.resolvidoEm) {
        mttrSum += (t.resolvidoEm.getTime() - t.createdAt.getTime())
        mttrCount++
      }
    }
    const tfrHoras = tfrCount > 0 ? tfrSum / tfrCount / 3600_000 : null
    const mttrHoras = mttrCount > 0 ? mttrSum / mttrCount / 3600_000 : null

    // Volume por categoria
    const porCategoria = await prisma.helpdeskTicket.groupBy({
      by: ['categoriaId'],
      where: { ...baseWhere, createdAt: { gte: inicio } },
      _count: { _all: true },
      orderBy: { _count: { categoriaId: 'desc' } },
      take: 10,
    })
    const catIds = porCategoria.map(c => c.categoriaId).filter((c): c is string => !!c)
    const catNames = catIds.length > 0 ? await prisma.helpdeskCategoria.findMany({
      where: { id: { in: catIds } },
      select: { id: true, nome: true, cor: true },
    }) : []
    const catMap = new Map(catNames.map(c => [c.id, c]))

    // Volume por agente (responsável)
    const porAgente = await prisma.helpdeskTicket.groupBy({
      by: ['responsavelId'],
      where: { ...baseWhere, createdAt: { gte: inicio }, responsavelId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { responsavelId: 'desc' } },
      take: 10,
    })
    const agentIds = porAgente.map(a => a.responsavelId).filter((a): a is string => !!a)
    const agentNames = agentIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true, image: true },
    }) : []
    const agentMap = new Map(agentNames.map(a => [a.id, a]))

    return {
      periodoDias,
      kpis: {
        totalAbertos,
        totalAtrasados,
        totalResolvidos,
        totalConcluidos,
        totalNoPeriodo,
        slaCumprimentoPct: totalConcluidos > 0 ? Math.round((slaCumprido / totalConcluidos) * 100) : null,
        csatMedio: csatAgg._avg.csatNota,
        csatRespostas: csatAgg._count.csatNota,
        tfrHoras,
        mttrHoras,
      },
      porCategoria: porCategoria.map(c => ({
        id: c.categoriaId,
        nome: c.categoriaId ? catMap.get(c.categoriaId)?.nome ?? 'Sem categoria' : 'Sem categoria',
        cor: c.categoriaId ? catMap.get(c.categoriaId)?.cor ?? null : null,
        total: c._count._all,
      })),
      porAgente: porAgente.map(a => ({
        id: a.responsavelId,
        name: a.responsavelId ? agentMap.get(a.responsavelId)?.name ?? '—' : '—',
        image: a.responsavelId ? agentMap.get(a.responsavelId)?.image ?? null : null,
        total: a._count._all,
      })),
    }
  }

  // ── Dashboard de indicadores + relatórios (painel TI) ─────────
  //
  // KPIs escolhidos a partir dos padrões de mercado (Zendesk, Freshdesk,
  // ManageEngine, InvGate): First Response Time, Resolution Time, SLA
  // compliance, CSAT, Reopen rate, volume criado/resolvido, backlog.
  // Tudo filtrado por empresaId (multi-tenant) e por intervalo de datas.

  async getDashboard(
    empresaId: string | null | undefined,
    range?: { inicio?: string | null; fim?: string | null },
  ) {
    const agora = new Date()
    // Default: últimos 30 dias. fim é exclusivo no fim do dia.
    const fim = range?.fim ? new Date(range.fim) : agora
    fim.setHours(23, 59, 59, 999)
    const inicio = range?.inicio
      ? new Date(range.inicio)
      : new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000)
    inicio.setHours(0, 0, 0, 0)

    const tenantFilter = empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}
    const baseWhere = { ativo: true, ...tenantFilter }
    // Janela do período: tickets CRIADOS dentro do intervalo
    const criadosNoPeriodo = { ...baseWhere, createdAt: { gte: inicio, lte: fim } }
    // Resolvidos dentro do intervalo (independe de quando foram criados)
    const resolvidosNoPeriodo = {
      ...baseWhere,
      resolvidoEm: { gte: inicio, lte: fim },
    }

    const [
      criados,
      resolvidos,
      backlogAbertos,
      backlogAtrasados,
    ] = await Promise.all([
      prisma.helpdeskTicket.count({ where: criadosNoPeriodo }),
      prisma.helpdeskTicket.count({ where: resolvidosNoPeriodo }),
      // Backlog = tickets ainda em aberto AGORA (não-finais, não arquivados)
      prisma.helpdeskTicket.count({
        where: { ...baseWhere, arquivado: false, status: { in: ['NOVO', 'AGUARDANDO_AUDITORIA', 'EM_ANDAMENTO'] } },
      }),
      prisma.helpdeskTicket.count({
        where: {
          ...baseWhere,
          arquivado: false,
          status: { in: ['NOVO', 'AGUARDANDO_AUDITORIA', 'EM_ANDAMENTO'] },
          prazoSla: { lt: agora },
        },
      }),
    ])

    // ── Distribuições (backlog atual por status; período por prioridade/tipo) ──
    const [porStatusRaw, porPrioridadeRaw, porTipoRaw] = await Promise.all([
      prisma.helpdeskTicket.groupBy({
        by: ['status'],
        where: { ...baseWhere, arquivado: false },
        _count: { _all: true },
      }),
      prisma.helpdeskTicket.groupBy({
        by: ['prioridade'],
        where: criadosNoPeriodo,
        _count: { _all: true },
      }),
      prisma.helpdeskTicket.groupBy({
        by: ['tipo'],
        where: criadosNoPeriodo,
        _count: { _all: true },
      }),
    ])

    // ── CSAT: média + distribuição de notas (1-5) ─────────────────
    const csatTickets = await prisma.helpdeskTicket.findMany({
      where: { ...baseWhere, csatNota: { not: null }, csatRespondidoEm: { gte: inicio, lte: fim } },
      select: { csatNota: true },
    })
    const csatDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    let csatSoma = 0
    for (const t of csatTickets) {
      const n = t.csatNota ?? 0
      if (n >= 1 && n <= 5) { csatDist[n] = (csatDist[n] ?? 0) + 1; csatSoma += n }
    }
    const csatMedio = csatTickets.length > 0 ? csatSoma / csatTickets.length : null

    // ── Tempos (TFR / MTTR) + SLA compliance dos resolvidos no período ──
    const fechados = await prisma.helpdeskTicket.findMany({
      where: resolvidosNoPeriodo,
      select: {
        createdAt: true, primeiroAtendimentoEm: true, resolvidoEm: true,
        prazoSla: true, slaEstouradoEm: true,
      },
      take: 5000,
    })
    let tfrSum = 0, tfrCount = 0, mttrSum = 0, mttrCount = 0
    let slaDentro = 0, slaTotal = 0
    for (const t of fechados) {
      if (t.primeiroAtendimentoEm) {
        tfrSum += t.primeiroAtendimentoEm.getTime() - t.createdAt.getTime()
        tfrCount++
      }
      if (t.resolvidoEm) {
        mttrSum += t.resolvidoEm.getTime() - t.createdAt.getTime()
        mttrCount++
        slaTotal++
        // Dentro do SLA = não foi marcado como estourado E resolveu antes do prazo
        const estourou = !!t.slaEstouradoEm || (t.prazoSla ? t.resolvidoEm.getTime() > t.prazoSla.getTime() : false)
        if (!estourou) slaDentro++
      }
    }
    const tfrHoras = tfrCount > 0 ? tfrSum / tfrCount / 3600_000 : null
    const mttrHoras = mttrCount > 0 ? mttrSum / mttrCount / 3600_000 : null
    const slaCumprimentoPct = slaTotal > 0 ? Math.round((slaDentro / slaTotal) * 100) : null

    // ── Taxa de reabertura ────────────────────────────────────────
    // Reabertura = evento status_alterado saindo de RESOLVIDO/CONCLUIDO de
    // volta pra um status ativo, no período. Comparamos contra os resolvidos.
    const eventosReabertura = await prisma.helpdeskEvento.findMany({
      where: {
        tipo: 'status_alterado',
        createdAt: { gte: inicio, lte: fim },
        OR: [
          { descricao: { contains: 'RESOLVIDO → NOVO' } },
          { descricao: { contains: 'RESOLVIDO → EM_ANDAMENTO' } },
          { descricao: { contains: 'CONCLUIDO → NOVO' } },
          { descricao: { contains: 'CONCLUIDO → EM_ANDAMENTO' } },
        ],
      },
      select: { ticketId: true },
    })
    const ticketsReabertos = new Set(eventosReabertura.map(e => e.ticketId)).size
    const taxaReaberturaPct = resolvidos > 0 ? Math.round((ticketsReabertos / resolvidos) * 100) : null

    // ── Série temporal: criados x resolvidos por dia ──────────────
    const [criadosRows, resolvidosRows] = await Promise.all([
      prisma.helpdeskTicket.findMany({
        where: criadosNoPeriodo,
        select: { createdAt: true },
      }),
      prisma.helpdeskTicket.findMany({
        where: resolvidosNoPeriodo,
        select: { resolvidoEm: true },
      }),
    ])
    // Agrupa por dia (YYYY-MM-DD). Se o intervalo > 90 dias, agrupa por mês.
    const spanDias = Math.ceil((fim.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000))
    const granularidade: 'dia' | 'mes' = spanDias > 92 ? 'mes' : 'dia'
    const chave = (d: Date) =>
      granularidade === 'mes'
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const serieMap = new Map<string, { criados: number; resolvidos: number }>()
    for (const r of criadosRows) {
      const k = chave(r.createdAt)
      const e = serieMap.get(k) ?? { criados: 0, resolvidos: 0 }
      e.criados++
      serieMap.set(k, e)
    }
    for (const r of resolvidosRows) {
      if (!r.resolvidoEm) continue
      const k = chave(r.resolvidoEm)
      const e = serieMap.get(k) ?? { criados: 0, resolvidos: 0 }
      e.resolvidos++
      serieMap.set(k, e)
    }
    const serie = Array.from(serieMap.entries())
      .map(([periodo, v]) => ({ periodo, ...v }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo))

    // ── Relatório por categoria (volume + %) ──────────────────────
    const porCategoria = await prisma.helpdeskTicket.groupBy({
      by: ['categoriaId'],
      where: criadosNoPeriodo,
      _count: { _all: true },
      orderBy: { _count: { categoriaId: 'desc' } },
    })
    const catIds = porCategoria.map(c => c.categoriaId).filter((c): c is string => !!c)
    const catNames = catIds.length > 0
      ? await prisma.helpdeskCategoria.findMany({ where: { id: { in: catIds } }, select: { id: true, nome: true, cor: true } })
      : []
    const catMap = new Map(catNames.map(c => [c.id, c]))

    // ── Relatório por responsável (volume + tempo médio + SLA) ────
    const porAgenteRaw = await prisma.helpdeskTicket.groupBy({
      by: ['responsavelId'],
      where: { ...resolvidosNoPeriodo, responsavelId: { not: null } },
      _count: { _all: true },
    })
    const agenteIds = porAgenteRaw.map(a => a.responsavelId).filter((a): a is string => !!a)
    const agenteRows = agenteIds.length > 0
      ? await prisma.helpdeskTicket.findMany({
          where: { ...resolvidosNoPeriodo, responsavelId: { in: agenteIds } },
          select: { responsavelId: true, createdAt: true, resolvidoEm: true, prazoSla: true, slaEstouradoEm: true },
        })
      : []
    const agStat = new Map<string, { total: number; mttrSum: number; mttrCount: number; slaDentro: number; slaTotal: number }>()
    for (const r of agenteRows) {
      if (!r.responsavelId) continue
      const s = agStat.get(r.responsavelId) ?? { total: 0, mttrSum: 0, mttrCount: 0, slaDentro: 0, slaTotal: 0 }
      s.total++
      if (r.resolvidoEm) {
        s.mttrSum += r.resolvidoEm.getTime() - r.createdAt.getTime()
        s.mttrCount++
        s.slaTotal++
        const estourou = !!r.slaEstouradoEm || (r.prazoSla ? r.resolvidoEm.getTime() > r.prazoSla.getTime() : false)
        if (!estourou) s.slaDentro++
      }
      agStat.set(r.responsavelId, s)
    }
    const agenteNames = agenteIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: agenteIds } }, select: { id: true, name: true, image: true } })
      : []
    const agenteMap = new Map(agenteNames.map(a => [a.id, a]))
    const porResponsavel = agenteIds.map(id => {
      const s = agStat.get(id)!
      const u = agenteMap.get(id)
      return {
        id,
        name: u?.name ?? '—',
        image: u?.image ?? null,
        total: s.total,
        mttrHoras: s.mttrCount > 0 ? s.mttrSum / s.mttrCount / 3600_000 : null,
        slaPct: s.slaTotal > 0 ? Math.round((s.slaDentro / s.slaTotal) * 100) : null,
      }
    }).sort((a, b) => b.total - a.total)

    // ── Lista: SLA estourados / mais antigos ainda abertos ────────
    const slaEstourados = await prisma.helpdeskTicket.findMany({
      where: {
        ...baseWhere,
        arquivado: false,
        status: { in: ['NOVO', 'AGUARDANDO_AUDITORIA', 'EM_ANDAMENTO'] },
        prazoSla: { lt: agora },
      },
      select: {
        id: true, numero: true, titulo: true, prioridade: true, status: true,
        prazoSla: true, createdAt: true,
        responsavel: { select: { name: true } },
        categoria: { select: { nome: true, cor: true } },
      },
      orderBy: { prazoSla: 'asc' },
      take: 15,
    })

    return {
      range: { inicio: inicio.toISOString(), fim: fim.toISOString() },
      granularidade,
      kpis: {
        criados,
        resolvidos,
        backlogAbertos,
        backlogAtrasados,
        slaCumprimentoPct,
        csatMedio,
        csatRespostas: csatTickets.length,
        tfrHoras,
        mttrHoras,
        taxaReaberturaPct,
        ticketsReabertos,
      },
      porStatus: porStatusRaw.map(s => ({ status: s.status, total: s._count._all })),
      porPrioridade: porPrioridadeRaw.map(p => ({ prioridade: p.prioridade, total: p._count._all })),
      porTipo: porTipoRaw.map(t => ({ tipo: t.tipo, total: t._count._all })),
      csatDist: [1, 2, 3, 4, 5].map(n => ({ nota: n, total: csatDist[n] ?? 0 })),
      serie,
      porCategoria: porCategoria.map(c => {
        const cat = c.categoriaId ? catMap.get(c.categoriaId) : null
        return {
          id: c.categoriaId,
          nome: cat?.nome ?? 'Sem categoria',
          cor: cat?.cor ?? null,
          total: c._count._all,
          pct: criados > 0 ? Math.round((c._count._all / criados) * 100) : 0,
        }
      }),
      porResponsavel,
      slaEstourados: slaEstourados.map(t => ({
        id: t.id,
        numero: t.numero,
        titulo: t.titulo,
        prioridade: t.prioridade,
        status: t.status,
        prazoSla: t.prazoSla?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        responsavel: t.responsavel?.name ?? null,
        categoria: t.categoria ? { nome: t.categoria.nome, cor: t.categoria.cor } : null,
      })),
    }
  }

  // ── Listar candidatos a responsável (escopo da área do ticket) ─

  async listAgentesAtribuiveis(ticketId: string, callerId: string) {
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { empresaId: true },
    })
    if (!ticket) return []
    void callerId

    // ATRIBUIÇÃO de responsável é mais restritiva que canAtuarAgente: aqui
    // só entram quem realmente OPERA o helpdesk no dia a dia — isMaster,
    // sub-perm explícita `atuar_agente` ou usuário de uma área de TI/Suporte.
    // DIRETOR/COORDENADOR/empresaMaster continuam VENDO todos os tickets
    // (canAtuarAgente), mas não devem aparecer como opção de responsável
    // — eles não tratam tickets, só supervisionam.
    // Isolamento multi-tenant: candidatos a responsável apenas da empresa do
    // ticket (+ contas globais sem empresa, ex.: agentes de suporte da plataforma).
    // Sem empresa no ticket → default-deny: nunca lista usuários de outro tenant.
    const where: Record<string, unknown> = {
      isActive: true,
      OR: ticket.empresaId
        ? [{ empresaId: ticket.empresaId }, { empresaId: null }]
        : [{ empresaId: null }],
    }
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        image: true,
        role: true,
        isMaster: true,
        isEmpresaMaster: true,
        area: { select: { name: true } },
        permissions: {
          where: { moduleSlug: 'helpdesk' },
          select: { subPermissions: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    const agentes = users.filter((u) => {
      if (u.isMaster) return true
      const sub = (u.permissions[0]?.subPermissions ?? {}) as Record<string, boolean>
      if (sub.atuar_agente === true) return true
      if (u.area?.name && isAreaTi(u.area.name)) return true
      return false
    })

    return agentes.map((u) => ({
      id: u.id,
      name: u.name,
      image: u.image,
      areaName: u.area?.name ?? null,
    }))
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Detecta se o nome de uma área indica "TI/Suporte" pra promover seus usuários
 * automaticamente a agentes do Helpdesk. Normaliza acentos e compara por palavras
 * exatas — evita falso-positivo (ex: área "Atividades" não casa por conter "ti").
 */
function isAreaTi(areaName: string): boolean {
  const normalizado = areaName
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  // Palavras exatas que indicam área de TI/Suporte
  const palavras = normalizado.split(/\s+/)
  const tiTokens = new Set(['ti', 'tecnologia', 'suporte', 'helpdesk', 'sistemas', 'informatica'])
  // Match se qualquer palavra da área bate com um token de TI
  return palavras.some((p) => tiTokens.has(p))
}
