import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Prisma } from '@saas/db'
import {
  HELPDESK_SLA_PADRAO_HORAS,
  HELPDESK_STATUS_PAUSADOS,
  HELPDESK_SCOPE_RANK,
  resolveHelpdeskScope,
  type CreateTicketInput,
  type UpdateTicketInput,
  type ListTicketInput,
  type AddMensagemInput,
  type EditMensagemInput,
  type DeleteMensagemInput,
  type HelpdeskPrioridade,
  type HelpdeskStatus,
  type HelpdeskScope,
  HELPDESK_STATUS_CANCELAVEL_PELO_SOLICITANTE,
  helpdeskSolicitantePodeReabrir,
  HELPDESK_STATUS_REABERTURA,
  helpdeskStatusRank,
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
    // Espelha a visibilidade do list(): o que o usuário vê na lista é o que ele
    // pode abrir. Sem isso, um ticket que aparece na listagem por escopo de área
    // (ex.: chefia) receberia FORBIDDEN ao clicar.
    const { scope, areaId } = await this.resolverEscopoEfetivo(userId)
    if (scope === 'todos') return true

    const filtro = this.filtroVisibilidade(scope, userId, areaId)
    if (filtro) {
      const visivel = await prisma.helpdeskTicket.findFirst({
        where: { id: ticketId, ...filtro },
        select: { id: true },
      })
      if (visivel) return true
    }

    // Bônus preservados do comportamento anterior, independentes do escopo:
    // líder da área do ticket, e membro da mesma área com permissão de leitura.
    const t = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { areaId: true },
    })
    if (t?.areaId) {
      const area = await prisma.area.findUnique({ where: { id: t.areaId }, select: { leaderId: true } })
      if (area?.leaderId === userId) return true
      if (areaId && areaId === t.areaId) {
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
   * Pode ATUAR como agente da TI (kanban, configurações, mover/atribuir cards,
   * notas internas). Delega para a fonte única `ehAgenteHelpdesk` — ver a doc
   * dela para os critérios. NÃO inclui mais os cargos DIRETOR/COORDENADOR.
   */
  async canAtuarAgente(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isMaster: true,
        isEmpresaMaster: true,
        area: { select: { name: true } },
        permissions: { where: { moduleSlug: 'helpdesk' }, select: { subPermissions: true } },
      },
    })
    if (!user) return false
    return ehAgenteHelpdesk({
      isMaster: user.isMaster,
      isEmpresaMaster: user.isEmpresaMaster,
      subPermissions: user.permissions[0]?.subPermissions,
      areaName: user.area?.name,
    })
  }

  /**
   * Escopo EFETIVO de visualização do usuário no HelpDesk (#HLP0139) — FONTE
   * ÚNICA, consumida por `getMeuEscopo` (UI), `list()`, `canAccess()` e
   * `relatorioTickets()`. Regra decidida:
   *   - master / empresa-master        → 'todos'  (toda a empresa)
   *   - DIRETOR / COORDENADOR (cargos) → 'area'   (a própria área — não são agentes)
   *   - agente (sub-perm / área de TI) → 'todos'
   *   - demais                         → sub-permissão de escopo (proprios/area/todos)
   * Sem área cadastrada, 'area' degrada para 'proprios'.
   */
  private async resolverEscopoEfetivo(userId: string): Promise<{ scope: HelpdeskScope; temArea: boolean; areaId: string | null }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        areaId: true, isMaster: true, isEmpresaMaster: true, role: true,
        area: { select: { name: true } },
        permissions: { where: { moduleSlug: 'helpdesk' }, select: { subPermissions: true } },
      },
    })
    const temArea = !!user?.areaId
    const sub = user?.permissions[0]?.subPermissions as Record<string, unknown> | null
    let scope: HelpdeskScope
    if (user?.isMaster || user?.isEmpresaMaster) {
      scope = 'todos'
    } else if (user?.role === 'DIRETOR' || user?.role === 'COORDENADOR') {
      scope = 'area'
    } else if (ehAgenteHelpdesk({ isMaster: user?.isMaster, isEmpresaMaster: user?.isEmpresaMaster, subPermissions: sub, areaName: user?.area?.name })) {
      scope = 'todos'
    } else {
      scope = resolveHelpdeskScope(sub)
    }
    if (scope === 'area' && !temArea) scope = 'proprios'
    return { scope, temArea, areaId: user?.areaId ?? null }
  }

  /** Endpoint tRPC — a UI usa pra saber quais opções de escopo oferecer. */
  async getMeuEscopo(userId: string): Promise<{ scope: HelpdeskScope; temArea: boolean; areaId: string | null }> {
    return this.resolverEscopoEfetivo(userId)
  }

  /**
   * Condições Prisma de visibilidade de um escopo. `null` = sem restrição
   * (scope 'todos'). Fonte única usada por `list()`, `canAccess()` e
   * `relatorioTickets()` — garante que "o que aparece na lista" == "o que dá
   * pra abrir". O escopo 'area' inclui os próprios + tickets cujo ticket.areaId
   * é a área OU cujo solicitante pertence à área (o ticket.areaId quase nunca é
   * preenchido — ver #HLP0318).
   */
  private filtroVisibilidade(scope: HelpdeskScope, userId: string, areaId: string | null): Prisma.HelpdeskTicketWhereInput | null {
    if (scope === 'todos') return null
    const meus: Prisma.HelpdeskTicketWhereInput[] = [
      { solicitanteId: userId },
      { responsavelId: userId },
      { watchers: { some: { userId } } },
    ]
    if (scope === 'area' && areaId) {
      return { OR: [...meus, { areaId }, { solicitante: { is: { areaId } } }] }
    }
    return { OR: meus }
  }

  /**
   * Lista global de agentes que podem ser RESPONSÁVEL por tickets (#HLP0139) —
   * mesmo critério do listAgentesAtribuiveis (isMaster / sub-perm atuar_agente /
   * área de TI), escopado à empresa (+ contas globais). Usado no filtro por
   * responsável da listagem.
   */
  async listAgentes(empresaId: string | null) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: empresaId ? [{ empresaId }, { empresaId: null }] : [{ empresaId: null }],
      },
      select: {
        id: true, name: true, image: true, isMaster: true, isEmpresaMaster: true,
        area: { select: { name: true } },
        permissions: { where: { moduleSlug: 'helpdesk' }, select: { subPermissions: true } },
      },
      orderBy: { name: 'asc' },
    })
    return users
      .filter((u) => ehAgenteHelpdesk({
        isMaster: u.isMaster,
        isEmpresaMaster: u.isEmpresaMaster,
        subPermissions: u.permissions[0]?.subPermissions,
        areaName: u.area?.name,
      }))
      .map((u) => ({ id: u.id, name: u.name, image: u.image, areaName: u.area?.name ?? null }))
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

    // Notificação de novo ticket (sino in-app + e-mail). Quem recebe depende da
    // config `notificarTodosAgentes` — ver o método (R1.3).
    await this.notificarNovoTicket(ticket.id, empresaId)

    // Triagem IA — fire-and-forget. Não bloqueia o create (retorno em <100ms).
    // O agente classifica simples/complexo e atualiza o ticket de forma assíncrona;
    // o frontend recebe via SSE/refetch quando entra na coluna "Aguardando auditoria".
    void this.aiAgent.processarTicket(ticket.id).catch(e => {
      console.error('[Helpdesk] Triagem IA falhou:', (e as Error).message)
    })

    return ticket
  }

  /**
   * Notificação de um novo ticket: sino (in-app) para usuários + e-mail. Quem
   * recebe depende do toggle `notificarTodosAgentes` da config (R1.3):
   *   - LIGADO:    todos os agentes do HelpDesk (sino + e-mail) + e-mail aos
   *                Destinatários adicionais.
   *   - DESLIGADO: se o ticket tem área, os membros dela (sino + e-mail); se
   *                não tem área, e-mail aos Destinatários.
   * Sempre exclui o próprio solicitante. Falhas são logadas, não propagam.
   */
  private async notificarNovoTicket(ticketId: string, empresaId?: string | null) {
    try {
      const ticket = await prisma.helpdeskTicket.findUnique({
        where: { id: ticketId },
        select: { areaId: true, solicitanteId: true, solicitante: { select: { email: true } } },
      })
      if (!ticket) return
      const cfg = await this.getConfig(empresaId ?? null)
      const solicitanteEmail = ticket.solicitante?.email?.trim().toLowerCase() ?? null

      if (cfg.notificarTodosAgentes) {
        const agentes = (await this.usuariosAgentes(empresaId ?? null)).filter(a => a.id !== ticket.solicitanteId)
        await this.sinoNovoTicket(ticketId, agentes.map(a => a.id), empresaId ?? null)
        await this.emailNovoTicket(ticketId, [...agentes.map(a => a.email), ...cfg.destinatarios], solicitanteEmail)
        return
      }

      // Toggle desligado: por área, ou (sem área) aos Destinatários.
      if (ticket.areaId) {
        const membros = await this.usuariosDaArea(ticket.areaId, ticket.solicitanteId, empresaId ?? null)
        await this.sinoNovoTicket(ticketId, membros.map(m => m.id), empresaId ?? null)
        await this.emailNovoTicket(ticketId, membros.map(m => m.email), solicitanteEmail)
      } else {
        await this.emailNovoTicket(ticketId, cfg.destinatarios, solicitanteEmail)
      }
    } catch (e) {
      console.warn('[Helpdesk] Falha ao notificar novo ticket:', (e as Error).message)
    }
  }

  /** Usuários ativos que são agentes do HelpDesk (fonte única ehAgenteHelpdesk), com e-mail. */
  private async usuariosAgentes(empresaId: string | null): Promise<Array<{ id: string; email: string | null }>> {
    const users = await prisma.user.findMany({
      where: { isActive: true, OR: empresaId ? [{ empresaId }, { empresaId: null }] : [{ empresaId: null }] },
      select: {
        id: true, email: true, isMaster: true, isEmpresaMaster: true,
        area: { select: { name: true } },
        permissions: { where: { moduleSlug: 'helpdesk' }, select: { subPermissions: true } },
      },
    })
    return users
      .filter(u => ehAgenteHelpdesk({ isMaster: u.isMaster, isEmpresaMaster: u.isEmpresaMaster, subPermissions: u.permissions[0]?.subPermissions, areaName: u.area?.name }))
      .map(u => ({ id: u.id, email: u.email }))
  }

  /** Usuários ativos da área do ticket (exceto o solicitante), com e-mail. */
  private async usuariosDaArea(areaId: string, exceptId: string | null, empresaId: string | null): Promise<Array<{ id: string; email: string | null }>> {
    return prisma.user.findMany({
      where: {
        areaId, isActive: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        ...(empresaId ? { OR: [{ empresaId }, { empresaId: null }] } : {}),
      },
      select: { id: true, email: true },
    })
  }

  /** Sino (in-app) de novo ticket para os usuários dados. */
  private async sinoNovoTicket(ticketId: string, userIds: string[], empresaId: string | null) {
    const ids = Array.from(new Set(userIds.filter(Boolean)))
    if (ids.length === 0) return
    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: { numero: true, titulo: true, prioridade: true },
    })
    if (!ticket) return
    const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
    try {
      await this.notificationService.criarParaUsers(ids, {
        titulo: `Novo ticket ${ticketNum}`,
        mensagem: `${ticket.titulo} (${ticket.prioridade})`,
        tipo: 'info',
        link: `/helpdesk/${ticketId}`,
        origem: 'helpdesk',
        empresaId: empresaId || null,
      })
    } catch (e) {
      console.warn('[Helpdesk] Falha no sino de novo ticket:', (e as Error).message)
    }
  }

  /** E-mail de novo ticket para a lista de endereços (dedup, exceto o solicitante). */
  private async emailNovoTicket(ticketId: string, emails: Array<string | null | undefined>, exceptEmail: string | null) {
    const dest = Array.from(new Set(
      emails.map(e => e?.trim().toLowerCase()).filter((e): e is string => !!e),
    )).filter(e => e !== exceptEmail)
    if (dest.length === 0) return

    const ticket = await prisma.helpdeskTicket.findUnique({
      where: { id: ticketId },
      select: {
        numero: true, titulo: true, descricao: true, tipo: true, prioridade: true, tags: true,
        area: { select: { name: true } },
        solicitante: { select: { name: true, email: true } },
      },
    })
    if (!ticket) return

    const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
    const origem = ticket.area?.name
      ? `Área: ${escapeHtml(ticket.area.name)}`
      : (ticket.tags.includes('fab-feedback') ? '🔔 Via balão "Fale com a TI"' : 'Sem área definida')
    // Anexos iniciais do ticket (os da descrição, sem mensagem) pro contador (R1.1).
    const numAnexos = await prisma.helpdeskAnexo.count({ where: { ticketId, mensagemId: null } })

    // R1.1 — corpo com autor (solicitante) + a descrição (com imagens embutidas)
    // + contador de anexos. Rodapé de "não responda" vem do emailTpl.
    const corpo =
      `<p style="margin:0 0 8px">Um novo ticket foi aberto e precisa de atenção:</p>` +
      `<p style="margin:0 0 4px"><strong>${ticketNum}</strong> — ${escapeHtml(ticket.titulo)}</p>` +
      `<p style="font-size:12px;color:#6b7280;margin:0 0 12px">Tipo: <strong>${ticket.tipo}</strong> · Prioridade: <strong>${ticket.prioridade}</strong> · ${origem}</p>` +
      this.blocoMensagemEmail({
        autorNome: ticket.solicitante?.name ?? 'Solicitante',
        conteudoHtml: ticket.descricao,
        numAnexos,
      })
    const html = this.emailTpl(ticketNum, corpo, `/helpdesk/${ticketId}`)

    // Envio individual (não expõe os endereços uns aos outros); falha de um não
    // impede os demais.
    await Promise.allSettled(dest.map(to =>
      this.emailService.sendMail({
        to,
        subject: `HelpDesk ${ticketNum} — ${ticket.titulo.slice(0, 60)}`,
        html,
      }),
    ))
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
    // R5.2 — flags de avaliação para o solicitante (a config de janela é
    // agente-only, então computamos aqui):
    //  - avaliacaoDisponivel: pode avaliar agora (RESOLVIDO, ou CONCLUÍDO sem
    //    nota dentro da janela).
    //  - concluidoSemAvaliacao: foi concluído sem avaliação registrada (ex.:
    //    auto-fechado) — a UI mostra o aviso disso.
    const janela = await this.avaliacaoPosConclusaoDias()
    const avaliacaoDisponivel = this.avaliacaoDisponivel(ticket, janela)
    const concluidoSemAvaliacao = ticket.status === 'CONCLUIDO' && ticket.csatNota == null && !ticket.csatRespondidoEm
    return { ...ticket, mensagens, avaliacaoDisponivel, concluidoSemAvaliacao, avaliacaoPosConclusaoDias: janela }
  }

  /** Listagem do agente (kanban e tabela). Escopo via `resolverEscopoEfetivo`. */
  async list(input: ListTicketInput, userId: string, empresaId?: string | null) {
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
    if (input.solicitanteId) where.solicitanteId = input.solicitanteId
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

    // Escopo efetivo (#HLP0139) via fonte única. O scope PEDIDO pela UI é
    // clampado ao permitido (nunca excede), e a visibilidade sai do mesmo
    // `filtroVisibilidade` que canAccess/relatorioTickets usam.
    const { scope: efetivo, areaId } = await this.resolverEscopoEfetivo(userId)
    const pedidoScope: HelpdeskScope = input.scope === 'TODOS' ? 'todos' : input.scope === 'AREA' ? 'area' : 'proprios'
    const aplicRank = Math.min(HELPDESK_SCOPE_RANK[pedidoScope], HELPDESK_SCOPE_RANK[efetivo])
    const scopeAplicado: HelpdeskScope =
      aplicRank >= HELPDESK_SCOPE_RANK.todos ? 'todos'
      : aplicRank === HELPDESK_SCOPE_RANK.area ? 'area'
      : 'proprios'
    const filtro = this.filtroVisibilidade(scopeAplicado, userId, areaId)
    if (filtro) where.AND = [filtro]

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
    const { scope, areaId } = await this.resolverEscopoEfetivo(userId)
    const filtro = this.filtroVisibilidade(scope, userId, areaId)
    const where: Prisma.HelpdeskTicketWhereInput = {
      ativo: true,
      arquivado: false,
      status: { notIn: ['CONCLUIDO', 'CANCELADO'] },
      ...(empresaId ? { empresaId } : {}),
      ...(filtro ?? {}),
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
        // "Meus": solicitante OU responsável OU watcher (#HLP0139) — mesma
        // definição do escopo MEUS do list().
        OR: [
          { solicitanteId: userId },
          { responsavelId: userId },
          { watchers: { some: { userId } } },
        ],
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
        arquivado: true, tipo: true,
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
    // ── Autorização de escrita ────────────────────────────────────────────
    // ATENÇÃO: até aqui o único gate era o `assertCanAccess` do router, que
    // responde "pode VER este ticket?" — não "pode ALTERAR". Sem as checagens
    // abaixo, qualquer usuário autenticado com visibilidade do ticket conseguia
    // mudar status (inclusive CANCELAR ticket de outra pessoa), responsável,
    // prioridade, prazo, categoria e arquivamento chamando o endpoint direto.
    // A interface escondia os controles; o backend não impedia.
    //
    // As sub-permissões (change_responsavel, change_prazo, change_prioridade,
    // arquivar) já existiam em packages/types e eram usadas SÓ pela UI — agora
    // valem de fato. Resolvidas uma vez só, e apenas quando algum campo
    // restrito está sendo tocado, pra não custar query em update trivial.
    const ehSolicitante = before.solicitanteId === userId
    const querCampoRestrito = (
      data.status !== undefined || data.responsavelId !== undefined
      || data.prioridade !== undefined || data.prazoSla !== undefined
      || data.categoriaId !== undefined || data.areaId !== undefined
      || data.arquivado !== undefined || data.tipo !== undefined || data.tags !== undefined
      || (data.titulo !== undefined && !ehSolicitante)
    )
    const ehAgente = querCampoRestrito ? await this.canAtuarAgente(userId) : false
    const subPerms: Record<string, boolean> = querCampoRestrito && !ehAgente
      ? (((await prisma.userPermission.findFirst({
          where: { userId, moduleSlug: 'helpdesk' },
          select: { subPermissions: true },
        }))?.subPermissions ?? {}) as Record<string, boolean>)
      : {}
    const podeCom = (chave: string) => ehAgente || subPerms[chave] === true

    const querMudarTitulo = data.titulo !== undefined && data.titulo !== before.titulo
    const querMudarDescricao = data.descricao !== undefined && data.descricao !== before.descricao

    // R5.1 — congelamento por ESTADO ENCERRADO: com o ticket CONCLUÍDO,
    // CANCELADO ou ARQUIVADO, os campos de CONTEÚDO/meta ficam bloqueados para
    // edição. O ciclo de vida (status e arquivamento) fica de fora de propósito
    // — é o que permite REABRIR/desarquivar (5.4) e o agente arquivar/desarquivar.
    const congeladoTotal = ticketCongelado(before.status as HelpdeskStatus, before.arquivado)
    const querEditarConteudo = querMudarTitulo || querMudarDescricao
      || (data.tipo !== undefined && data.tipo !== before.tipo)
      || (data.tags !== undefined)
      || (data.prioridade !== undefined && data.prioridade !== before.prioridade)
      || (data.categoriaId !== undefined && data.categoriaId !== before.categoriaId)
      || (data.areaId !== undefined && data.areaId !== before.areaId)
      || (data.prazoSla !== undefined)
      || (data.responsavelId !== undefined && data.responsavelId !== before.responsavelId)
    if (congeladoTotal && querEditarConteudo) {
      const estado = before.arquivado ? 'arquivado'
        : before.status === 'CANCELADO' ? 'cancelado' : 'concluído'
      throw new Error(`Ticket ${estado} — reabra o chamado para poder editá-lo.`)
    }

    if (querMudarTitulo || querMudarDescricao) {
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
    if (data.tipo !== undefined && data.tipo !== before.tipo) {
      if (!ehAgente) throw new Error('Só um agente da TI pode alterar o tipo do ticket')
      patch.tipo = data.tipo
    }
    if (data.tags !== undefined) {
      if (!ehAgente) throw new Error('Só um agente da TI pode alterar as tags do ticket')
      patch.tags = data.tags
    }
    if (data.arquivado !== undefined && data.arquivado !== before.arquivado) {
      // A reabertura manda status + arquivado na MESMA chamada (senão o ticket
      // volta pra fila mas continua escondido). Sem esta brecha, o guard de
      // `arquivar` barraria a reabertura feita pelo solicitante.
      const desarquivandoParaReabrir = ehSolicitante
        && data.arquivado === false
        && helpdeskSolicitantePodeReabrir({ status: before.status as HelpdeskStatus, arquivado: before.arquivado })
      if (!podeCom('arquivar') && !desarquivandoParaReabrir) {
        throw new Error('Você não tem permissão para arquivar tickets')
      }
      patch.arquivado = data.arquivado
      eventos.push({
        tipo: data.arquivado ? 'arquivado' : 'desarquivado',
        descricao: data.arquivado ? 'Ticket arquivado' : 'Ticket desarquivado',
      })
    }

    if (data.prioridade !== undefined && data.prioridade !== before.prioridade) {
      if (!podeCom('change_prioridade')) throw new Error('Você não tem permissão para alterar a prioridade')
      patch.prioridade = data.prioridade
      // Recalcula SLA se ainda está em aberto
      patch.prazoSla = await this.calcularPrazoSla(data.prioridade, data.categoriaId ?? before.categoriaId)
      eventos.push({
        tipo: 'prioridade_alterada',
        descricao: `Prioridade: ${before.prioridade} → ${data.prioridade}`,
      })
    }

    if (data.categoriaId !== undefined && data.categoriaId !== before.categoriaId) {
      if (!ehAgente) throw new Error('Só um agente da TI pode alterar a categoria do ticket')
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
      if (!ehAgente) throw new Error('Só um agente da TI pode alterar a área do ticket')
      patch.areaId = data.areaId
    }

    if (data.prazoSla !== undefined) {
      if (!podeCom('change_prazo')) throw new Error('Você não tem permissão para alterar o prazo/SLA')
      patch.prazoSla = data.prazoSla ? new Date(data.prazoSla) : null
      eventos.push({ tipo: 'prazo_alterado', descricao: 'Prazo SLA alterado' })
    }

    if (data.responsavelId !== undefined && data.responsavelId !== before.responsavelId) {
      // R5.1 — de "Aguardando avaliação" (RESOLVIDO) em diante, o responsável
      // congela mesmo com permissão: evita "roubar" a avaliação de outro agente.
      // Comparação por POSIÇÃO na ordem dos status (pegajoso), não por igualdade.
      if (helpdeskStatusRank(before.status as HelpdeskStatus) >= helpdeskStatusRank('RESOLVIDO')) {
        throw new Error('Da etapa "Aguardando avaliação" em diante o responsável não pode ser alterado.')
      }
      if (!podeCom('change_responsavel')) throw new Error('Você não tem permissão para atribuir responsável')
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
      // Agente move o ticket livremente. O SOLICITANTE só tem um caminho:
      // cancelar o PRÓPRIO chamado, e só na janela definida em @saas/types
      // (HELPDESK_STATUS_CANCELAVEL_PELO_SOLICITANTE) — a mesma constante que
      // as telas usam pra decidir se mostram o botão. Aqui é onde a regra é
      // IMPOSTA; lá é só exibição.
      //
      // As checagens ficam destrinchadas (em vez de um único `solicitantePodeCancelar`)
      // pra devolver a mensagem certa em cada caso — quem não é solicitante e quem
      // pediu tarde demais precisam ouvir coisas diferentes.
      if (!ehAgente) {
        if (!ehSolicitante) {
          throw new Error('Você não tem permissão para alterar o status deste ticket')
        }
        // O solicitante tem DUAS transições permitidas — não uma. Tratar
        // "cancelar" como a única fazia a REABERTURA (#HLP0062), que também é
        // ação dele, cair no erro genérico e falhar.
        const querCancelar = data.status === 'CANCELADO'
        const querReabrir = data.status === HELPDESK_STATUS_REABERTURA

        if (querCancelar) {
          if (!HELPDESK_STATUS_CANCELAVEL_PELO_SOLICITANTE.includes(before.status as HelpdeskStatus)) {
            throw new Error('O chamado já está em atendimento — fale com o responsável para encerrá-lo')
          }
        } else if (querReabrir) {
          if (!helpdeskSolicitantePodeReabrir({ status: before.status as HelpdeskStatus, arquivado: before.arquivado })) {
            throw new Error('Este chamado ainda está em atendimento — acompanhe por aqui mesmo.')
          }
        } else {
          throw new Error('Como solicitante, você só pode cancelar ou reabrir o próprio ticket')
        }
      }
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
      categoriaId: string | null; areaId: string | null; arquivado?: boolean;
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

      // ── 1. Responsável mudou (e status anterior != "Novo") ───────
      // Destinatários: criador, responsável anterior, novo responsável.
      // Todos pulam o actor automaticamente via notificarLote.
      // #HLP0056 (correção 02/06): quando o status anterior era "Novo", a
      // atribuição inicial já é coberta pela notificação de status (sair de Novo)
      // — não dispara a de "responsável alterado" pra evitar aviso duplicado.
      if (patch.responsavelId !== undefined && patch.responsavelId !== before.responsavelId && before.status !== 'NOVO') {
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

      // ── 2. Status mudou (novo != Novo) OU ticket desarquivado ────
      // Regra (#HLP0056): mesma notificação nos dois casos → criador sempre;
      // responsável atual também (skip actor via notificarLote). Se desarquivou
      // E mudou status na mesma operação (ex.: reabrir), dispara só uma vez.
      const mudouStatus = !!patch.status && patch.status !== before.status && patch.status !== 'NOVO'
      const desarquivou = patch.arquivado === false && before.arquivado === true
      if (mudouStatus || desarquivou) {
        const statusLabel = (mudouStatus ? patch.status : t.status) as string
        const soDesarquivou = desarquivou && !mudouStatus
        const virouAvaliacao = patch.status === 'RESOLVIDO'
        const corpo = soDesarquivou
          ? `O ticket <strong>${escapeHtml(t.titulo)}</strong> foi reaberto (desarquivado). Status atual: <strong>${statusLabel}</strong>.`
          : `Status do ticket <strong>${escapeHtml(t.titulo)}</strong> alterado para <strong>${statusLabel}</strong>.`
        // R1.2 — em RESOLVIDO ("Aguardando avaliação") o solicitante recebe a
        // versão "avalie" (abaixo), com CTA próprio; então o e-mail genérico vai
        // só ao responsável, evitando dois e-mails ao solicitante.
        await notificarLote(
          virouAvaliacao ? [t.responsavel] : [t.solicitante, t.responsavel],
          {
            titulo: soDesarquivou ? `${ticketNum} — reaberto` : `${ticketNum} → ${statusLabel}`,
            mensagem: t.titulo,
            tipo: mudouStatus && (patch.status === 'RESOLVIDO' || patch.status === 'CONCLUIDO') ? 'success' : 'info',
          },
          {
            subject: soDesarquivou ? `HelpDesk ${ticketNum} — reaberto` : `HelpDesk ${ticketNum} — ${statusLabel}`,
            html: this.emailTpl(ticketNum, corpo, link),
          },
        )

        // R1.2 — RESOLVIDO: sino + e-mail ao solicitante com CTA de AVALIAR.
        if (virouAvaliacao && t.solicitante && t.solicitante.id !== actorId) {
          await this.notificationService.criarParaUsers([t.solicitante.id], {
            titulo: `${ticketNum} — RESOLVIDO - Avalie o atendimento`,
            mensagem: t.titulo,
            tipo: 'success',
            link,
            origem: 'helpdesk',
            empresaId: t.empresaId,
          }).catch(() => {})
          if (t.solicitante.email) {
            void this.emailService.sendMail({
              to: t.solicitante.email,
              subject: `HelpDesk ${ticketNum} resolvido — avalie o atendimento`,
              html: this.emailTpl(
                ticketNum,
                `Seu ticket <strong>${escapeHtml(t.titulo)}</strong> foi resolvido e está <strong>aguardando sua avaliação</strong>. ` +
                `Abra o ticket e dê sua nota (e um comentário, se quiser) para fechar o chamado. ` +
                `Se não avaliar, ele é encerrado automaticamente após alguns dias, sem registrar nota.`,
                link,
                'Avaliar atendimento',
              ),
            })
          }
        }
      }
    } catch (e) {
      console.warn('[Helpdesk] Falha em notifyUpdate:', (e as Error).message)
    }
  }

  private emailTpl(ticketNum: string, corpoHtml: string, linkRel: string, ctaLabel = 'Abrir ticket'): string {
    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.oneclick.com.br'
    // R1.1 — sem replyTo (inbound não configurado), então o rodapé deixa claro
    // que NÃO se deve responder o e-mail; a resposta se perderia.
    return `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#1f2937">
      <div style="border-left:4px solid #22d3ee;padding:12px 16px;background:#ecfeff;border-radius:4px">
        <h2 style="margin:0 0 4px 0;font-size:14px;color:#0e7490">HelpDesk · ${ticketNum}</h2>
      </div>
      <div style="padding:16px 0;font-size:14px;line-height:1.5">${corpoHtml}</div>
      <a href="${base}${linkRel}" style="display:inline-block;background:#22d3ee;color:white;padding:10px 16px;border-radius:4px;text-decoration:none;font-size:13px">${escapeHtml(ctaLabel)}</a>
      <p style="margin-top:24px;font-size:11px;color:#9ca3af">E-mail automático — <strong>não responda por aqui</strong>, a resposta se perde. Para responder ou acompanhar, abra o ticket no botão acima.</p>
    </div>`
  }

  /**
   * Bloco de "mensagem" pro corpo do e-mail (R1.1): autor + o conteúdo da
   * mensagem (com as imagens embutidas nele) + contador de anexos, se houver.
   * O conteúdo é o HTML do editor; imagens inseridas pelo editor já têm URL
   * absoluta e renderizam no cliente de e-mail.
   */
  private blocoMensagemEmail(args: { autorNome: string; conteudoHtml: string; numAnexos: number }): string {
    const anexos = args.numAnexos > 0
      ? `<p style="margin:10px 0 0;font-size:12px;color:#6b7280">📎 ${args.numAnexos} anexo${args.numAnexos > 1 ? 's' : ''}</p>`
      : ''
    return `
      <p style="margin:0 0 8px;font-size:13px;color:#374151"><strong>${escapeHtml(args.autorNome)}</strong> escreveu:</p>
      <div style="border-left:3px solid #e5e7eb;padding-left:12px;font-size:14px;line-height:1.5">${args.conteudoHtml}</div>
      ${anexos}`
  }

  // ── Mensagens ──────────────────────────────────────────────────

  async addMensagem(input: AddMensagemInput, userId: string) {
    // Nota interna é embutida em "atuar como agente" (#HLP0139): só agente pode
    // escrever mensagens internas. Solicitante só manda mensagem pública.
    if (input.interna && !(await this.canAtuarAgente(userId))) {
      throw new Error('Apenas agentes podem escrever notas internas.')
    }
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
        ticket: { select: { status: true, arquivado: true } },
      },
    })
    if (!msg) throw new Error('Mensagem não encontrada')
    if (msg.autorId !== userId) {
      throw new Error('Só o autor pode editar a mensagem')
    }
    // R5.1 — no estado congelado (concluído/cancelado/arquivado) o histórico de
    // mensagens fica travado (nem editar, nem excluir).
    if (msg.ticket && ticketCongelado(msg.ticket.status as HelpdeskStatus, msg.ticket.arquivado)) {
      throw new Error('Chamado encerrado — não é possível editar mensagens.')
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
        ticket: { select: { status: true, arquivado: true } },
      },
    })
    if (!msg) throw new Error('Mensagem não encontrada')
    if (msg.autorId !== userId) {
      throw new Error('Só o autor pode excluir a mensagem')
    }
    // R5.1 — estado congelado trava o histórico (ver editMensagem).
    if (msg.ticket && ticketCongelado(msg.ticket.status as HelpdeskStatus, msg.ticket.arquivado)) {
      throw new Error('Chamado encerrado — não é possível excluir mensagens.')
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

      // Mensagem (autor + conteúdo + nº de anexos) pro corpo do e-mail (R1.1).
      const msg = interna ? null : await prisma.helpdeskMensagem.findUnique({
        where: { id: mensagemId },
        select: { conteudo: true, autor: { select: { name: true } }, _count: { select: { anexos: true } } },
      })

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

      // R1.1 — o corpo do e-mail traz autor + a própria mensagem (com imagens
      // embutidas) + contador de anexos. Só para mensagem pública.
      const corpoEmail = (() => {
        if (interna || !msg) return ''
        return `Nova resposta no ticket <strong>${escapeHtml(t.titulo)}</strong>:<br><br>` +
          this.blocoMensagemEmail({
            autorNome: msg.autor?.name ?? 'Participante',
            conteudoHtml: msg.conteudo,
            numAnexos: msg._count.anexos,
          })
      })()

      // E-mail apenas em mensagem pública e quando o destinatário é o "outro lado"
      if (!interna && t.solicitante?.email && autorId !== t.solicitanteId) {
        void this.emailService.sendMail({
          to: t.solicitante.email,
          subject: `HelpDesk ${ticketNum} — nova resposta`,
          html: this.emailTpl(ticketNum, corpoEmail, link),
        })
      }
      // Responsável é avisado sempre que quem escreveu NÃO é ele — cobre o
      // solicitante E um terceiro (ex.: outro operador da TI). #HLP0056.
      if (!interna && t.responsavel?.email && autorId !== t.responsavelId) {
        void this.emailService.sendMail({
          to: t.responsavel.email,
          subject: `HelpDesk ${ticketNum} — nova resposta`,
          html: this.emailTpl(ticketNum, corpoEmail, link),
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
      select: { solicitanteId: true, status: true, csatNota: true, csatRespondidoEm: true, concluidoEm: true },
    })
    if (!ticket) throw new Error('Ticket não encontrado')
    if (ticket.solicitanteId !== userId) throw new Error('Apenas o solicitante pode responder a avaliação')
    if (ticket.csatRespondidoEm) throw new Error('Avaliação já registrada')
    // R5.2 — RESOLVIDO sempre; CONCLUÍDO sem nota só dentro da janela configurável.
    const janela = await this.avaliacaoPosConclusaoDias()
    if (!this.avaliacaoDisponivel(ticket, janela)) {
      throw new Error(ticket.status === 'CONCLUIDO'
        ? `O prazo para avaliar este chamado (${janela} dias após a conclusão) já passou.`
        : 'Avaliação só disponível após a resolução.')
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
        // NÃO grava csatNota aqui: auto-fechamento não é avaliação. Gravar uma
        // nota "neutra" inventava satisfação que ninguém deu — as métricas já
        // filtram por csatRespondidoEm, então a nota só poluía o banco e induzia
        // a erro quem consultasse csat_nota direto.
        data: { status: 'CONCLUIDO', concluidoEm: agora },
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
  // Reusa a chave antiga (back-compat): antes guardava 1 e-mail; agora guarda
  // um array JSON de e-mails (os "Destinatários" / "Destinatários adicionais").
  private static readonly CFG_DESTINATARIOS = 'helpdesk.email_notificacao'
  private static readonly CFG_NOTIFICAR_TODOS_AGENTES = 'helpdesk.notificar_todos_agentes'
  // R5.2 — janela (dias) em que o solicitante ainda pode avaliar um ticket
  // CONCLUÍDO sem avaliação (ex.: auto-fechado). Contada a partir de concluidoEm.
  private static readonly CFG_AVALIACAO_POS_CONCLUSAO_DIAS = 'helpdesk.avaliacao_pos_conclusao_dias'
  private static readonly DEFAULT_AVALIACAO_POS_CONCLUSAO_DIAS = 25
  private static readonly DEFAULT_DESTINATARIO = 'ti@central-rnc.com.br'
  // SLA por prioridade — chaves helpdesk.sla.BAIXA / MEDIA / ALTA / URGENTE

  /**
   * Lê os destinatários do valor cru do SystemConfig. Back-compat:
   *   - '' (nunca configurado) → [DEFAULT_DESTINATARIO]
   *   - '[]' → [] (esvaziado de propósito)
   *   - '["a@b","c@d"]' → array JSON
   *   - 'a@b, c@d' → split (formato antigo de e-mail único ou lista por vírgula)
   */
  private parseDestinatarios(raw: string | undefined | null): string[] {
    const t = (raw ?? '').trim()
    if (!t) return [HelpdeskService.DEFAULT_DESTINATARIO]
    if (t.startsWith('[')) {
      try {
        const arr = JSON.parse(t)
        if (Array.isArray(arr)) return arr.filter((x): x is string => typeof x === 'string' && !!x.trim()).map(x => x.trim())
      } catch { /* cai pro split abaixo */ }
    }
    return t.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
  }

  async getConfig(empresaId?: string | null) {
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
    // `temAgentes` alimenta o aviso de "ninguém pra notificar/atender" (R1.3).
    const temAgentes = (await this.listAgentes(empresaId ?? null)).length > 0
    return {
      slaPorPrioridade,
      autoFechamentoDias: Number(map.get(HelpdeskService.CFG_AUTO_FECHAMENTO_DIAS) ?? 3),
      avaliacaoPosConclusaoDias: Number(map.get(HelpdeskService.CFG_AVALIACAO_POS_CONCLUSAO_DIAS) ?? HelpdeskService.DEFAULT_AVALIACAO_POS_CONCLUSAO_DIAS),
      inboundEmail: map.get(HelpdeskService.CFG_INBOUND_EMAIL) ?? '',
      notificarTodosAgentes: map.get(HelpdeskService.CFG_NOTIFICAR_TODOS_AGENTES) === 'true',
      destinatarios: this.parseDestinatarios(map.get(HelpdeskService.CFG_DESTINATARIOS)),
      temAgentes,
    }
  }

  /** R5.2 — janela (dias) de avaliação pós-conclusão. Leitura barata (1 chave). */
  private async avaliacaoPosConclusaoDias(): Promise<number> {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: HelpdeskService.CFG_AVALIACAO_POS_CONCLUSAO_DIAS } }).catch(() => null)
    const n = Number(cfg?.value ?? HelpdeskService.DEFAULT_AVALIACAO_POS_CONCLUSAO_DIAS)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : HelpdeskService.DEFAULT_AVALIACAO_POS_CONCLUSAO_DIAS
  }

  /**
   * R5.2 — a avaliação (CSAT) ainda está disponível para o solicitante?
   *   - RESOLVIDO ("Aguardando avaliação") sem resposta → sempre.
   *   - CONCLUÍDO sem nota registrada (ex.: auto-fechado) → dentro da janela
   *     configurável contada a partir de concluidoEm.
   */
  private avaliacaoDisponivel(t: { status: string; csatNota: number | null; csatRespondidoEm: Date | null; concluidoEm: Date | null }, janelaDias: number): boolean {
    if (t.csatRespondidoEm) return false
    if (t.status === 'RESOLVIDO') return true
    if (t.status === 'CONCLUIDO' && t.csatNota == null) {
      if (!t.concluidoEm) return false
      const limite = t.concluidoEm.getTime() + janelaDias * 24 * 60 * 60 * 1000
      return Date.now() <= limite
    }
    return false
  }

  async updateConfig(input: {
    slaPorPrioridade?: Partial<Record<HelpdeskPrioridade, number>>
    autoFechamentoDias?: number
    avaliacaoPosConclusaoDias?: number
    inboundEmail?: string
    notificarTodosAgentes?: boolean
    destinatarios?: string[]
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
    if (typeof input.avaliacaoPosConclusaoDias === 'number' && input.avaliacaoPosConclusaoDias > 0) {
      upserts.push({
        key: HelpdeskService.CFG_AVALIACAO_POS_CONCLUSAO_DIAS,
        value: String(Math.max(1, Math.floor(input.avaliacaoPosConclusaoDias))),
        label: 'Dias em que ainda se pode avaliar um ticket concluído sem avaliação',
      })
    }
    if (input.inboundEmail !== undefined) {
      upserts.push({
        key: HelpdeskService.CFG_INBOUND_EMAIL,
        value: String(input.inboundEmail).trim(),
        label: 'Endereço inbound para abertura de tickets por e-mail',
      })
    }
    if (input.notificarTodosAgentes !== undefined) {
      upserts.push({
        key: HelpdeskService.CFG_NOTIFICAR_TODOS_AGENTES,
        value: input.notificarTodosAgentes ? 'true' : 'false',
        label: 'Notificar todos os agentes do HelpDesk em cada novo ticket',
      })
    }
    if (input.destinatarios !== undefined) {
      const limpos = Array.from(new Set(
        input.destinatarios.map(e => e.trim().toLowerCase()).filter(Boolean),
      ))
      upserts.push({
        key: HelpdeskService.CFG_DESTINATARIOS,
        value: JSON.stringify(limpos),
        label: 'Destinatários (adicionais) de notificações por e-mail do HelpDesk',
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
    // ATRIBUIÇÃO de responsável usa a mesma fonte única (ehAgenteHelpdesk):
    // master/empresa-master, sub-perm atuar_agente ou área de TI. DIRETOR e
    // COORDENADOR NÃO entram — chefia enxerga a área mas não trata tickets.
    // Escopado à empresa do ticket (+ contas globais); sem empresa → default-deny.
    return this.listAgentes(ticket.empresaId)
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

/**
 * FONTE ÚNICA de "quem é agente do HelpDesk". Consumida por `canAtuarAgente`
 * (permissão de atuar), `listAgentes` (filtro de Responsável) e pelo roteamento
 * de e-mail (item 1.3). Critérios — qualquer um basta:
 *   1. master ou empresa-master
 *   2. sub-permissão `helpdesk.atuar_agente`
 *   3. lotado numa área de TI/Suporte/Tecnologia
 *
 * NÃO inclui os cargos DIRETOR/COORDENADOR: chefia não é agente da TI por si só
 * (isso era um bug — dava poder de agente a quem não atende). A chefia continua
 * enxergando a própria área via `resolverEscopoEfetivo`, mas não atua.
 *
 * Antes existiam DUAS definições divergentes (`canAtuarAgente` incluía os cargos
 * e o `isEmpresaMaster`; `listAgentes` não incluía nem os cargos nem o
 * empresa-master). Agora as duas passam por aqui.
 */
function ehAgenteHelpdesk(u: {
  isMaster?: boolean | null
  isEmpresaMaster?: boolean | null
  subPermissions?: unknown
  areaName?: string | null
}): boolean {
  if (u.isMaster || u.isEmpresaMaster) return true
  const sub = (u.subPermissions ?? {}) as Record<string, unknown>
  if (sub.atuar_agente === true) return true
  if (u.areaName && isAreaTi(u.areaName)) return true
  return false
}

/**
 * "Estado congelado" (R5.1): CONCLUÍDO, CANCELADO ou ARQUIVADO. Nesse estado a
 * edição dos campos de conteúdo e a edição/exclusão de mensagens ficam travadas.
 * NÃO governa a criação de nova mensagem — essa tem regra própria (permitida em
 * CONCLUÍDO como gatilho de reabertura; bloqueada em arquivado/cancelado).
 */
function ticketCongelado(status: HelpdeskStatus, arquivado: boolean): boolean {
  return arquivado || helpdeskStatusRank(status) >= helpdeskStatusRank('CONCLUIDO')
}
