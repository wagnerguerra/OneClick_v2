import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { NotificationsEventsService } from '../notifications-events/notifications-events.service'

// Catálogo das origens conhecidas no sistema. Cada origem é um "tipo" de
// notificação criado por um módulo (servicos, agenda, certificados, orcamentos).
// `removivelPadrao` define o comportamento default quando ainda não existe
// override em SystemConfig — auditável via /configuracoes → Notificações.
//
// Origens com `removivelPadrao: false` são gerenciadas pelo sistema: elas saem
// sozinhas quando a condição que as gerou deixa de existir (evento passou;
// certificado regularizado). Permitir remoção manual nessas leva o usuário
// a achar que resolveu, mas o scheduler recria na próxima execução.
export interface OrigemCatalogo {
  origem: string
  label: string
  descricao: string
  modulo: string
  removivelPadrao: boolean
}

export const NOTIFICATION_ORIGENS: OrigemCatalogo[] = [
  {
    origem: 'agenda',
    label: 'Agenda',
    descricao: 'Eventos agendados — somem quando o evento passa.',
    modulo: 'Agenda Corporativa',
    removivelPadrao: false,
  },
  {
    origem: 'gestao-certificados',
    label: 'Certificados Digitais',
    descricao: 'Certificados vencendo/vencidos — somem quando o certificado é renovado/regularizado.',
    modulo: 'Gestão de Certificados',
    removivelPadrao: false,
  },
  {
    origem: 'servicos',
    label: 'Meus Serviços',
    descricao: 'Atribuição e atraso de execução de serviços.',
    modulo: 'Meus Serviços',
    removivelPadrao: true,
  },
  {
    origem: 'orcamentos',
    label: 'Orçamentos',
    descricao: 'Alertas de orçamentos (validade, aprovação pendente).',
    modulo: 'Orçamentos',
    removivelPadrao: true,
  },
  {
    origem: 'helpdesk',
    label: 'HelpDesk',
    descricao: 'Tickets de suporte — novo, atribuição, resposta, mudança de status, SLA.',
    modulo: 'HelpDesk',
    removivelPadrao: true,
  },
]

const CFG_KEY_REMOVABLE = 'notification.removable_origins'

/**
 * Lê SystemConfig e retorna map { origem -> boolean }. Origens sem entrada
 * caem no `removivelPadrao` do catálogo. Origens desconhecidas (ainda não
 * mapeadas no catálogo) são consideradas removíveis (default permissivo).
 */
async function carregarRemovableMap(): Promise<Record<string, boolean>> {
  const cfg = await prisma.systemConfig.findUnique({ where: { key: CFG_KEY_REMOVABLE } })
  let stored: Record<string, boolean> = {}
  if (cfg?.value) {
    try {
      const parsed = JSON.parse(cfg.value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed
    } catch { /* ignora valor corrompido */ }
  }
  const map: Record<string, boolean> = {}
  for (const o of NOTIFICATION_ORIGENS) {
    map[o.origem] = typeof stored[o.origem] === 'boolean' ? stored[o.origem]! : o.removivelPadrao
  }
  // preserva overrides para origens não mapeadas no catálogo
  for (const k of Object.keys(stored)) {
    if (!(k in map)) map[k] = !!stored[k]
  }
  return map
}

async function ehRemovivel(origem: string | null): Promise<boolean> {
  if (!origem) return true
  const map = await carregarRemovableMap()
  if (origem in map) return !!map[origem]
  return true // origem desconhecida → permissivo
}

@Injectable()
export class NotificationService {
  constructor(private readonly events: NotificationsEventsService) {}

  /**
   * Remove notificações de agenda cujo evento já passou (data < hoje no fuso BRT).
   * Catálogo promete "Eventos agendados — somem quando o evento passa", então
   * limpamos preguiçosamente toda vez que o user lista/conta pendências. É barato
   * porque o filtro por user_id + origem já é selecionado pelo índice.
   *
   * O eventoId vem do querystring do link (`/agenda?eventoId=X`). Para notificações
   * antigas com link `/agenda` puro (sem id), apaga só quando passa N dias da criação.
   */
  private async limparNotificacoesAgendaExpiradas(userId: string): Promise<void> {
    const notifs = await prisma.notification.findMany({
      where: { userId, origem: 'agenda' },
      select: { id: true, link: true, createdAt: true },
    })
    if (notifs.length === 0) return

    const eventoIds: string[] = []
    const idsLinkAntigo: string[] = []
    for (const n of notifs) {
      const m = n.link?.match(/[?&]eventoId=([^&]+)/)
      if (m && m[1]) eventoIds.push(m[1])
      else if (n.link === '/agenda') {
        // Notificação antiga sem eventoId no link — usa idade (>= 7 dias) como
        // critério de limpeza pra não ficar pendurada eternamente.
        const ageDays = (Date.now() - n.createdAt.getTime()) / 86400000
        if (ageDays >= 7) idsLinkAntigo.push(n.id)
      }
    }

    const idsParaApagar: string[] = [...idsLinkAntigo]
    if (eventoIds.length > 0) {
      // Hoje 00:00 no fuso local — evento "hoje" ainda não passou
      const hoje = new Date()
      hoje.setHours(0, 0, 0, 0)
      const eventos = await prisma.agendaEvento.findMany({
        where: { id: { in: eventoIds } },
        select: { id: true, data: true, isActive: true },
      })
      const mapaEventos = new Map(eventos.map(e => [e.id, e]))
      for (const n of notifs) {
        const m = n.link?.match(/[?&]eventoId=([^&]+)/)
        const evId = m?.[1]
        if (!evId) continue
        const ev = mapaEventos.get(evId)
        // Evento foi hard-deleted ou inativado → notificação órfã
        if (!ev || !ev.isActive) { idsParaApagar.push(n.id); continue }
        // Evento já passou (data < hoje 00:00)
        if (ev.data.getTime() < hoje.getTime()) idsParaApagar.push(n.id)
      }
    }

    if (idsParaApagar.length > 0) {
      await prisma.notification.deleteMany({ where: { id: { in: idsParaApagar } } })
      this.events.emit({ type: 'removed', userId, notificationIds: idsParaApagar })
    }
  }

  /**
   * Lista as notificações do usuário, ordenadas por data DESC.
   * Por padrão retorna até 30 mais recentes (ajustável via opts.limit).
   * `apenasNaoLidas: true` filtra só não lidas (usado pelo badge do sino).
   * Cada item recebe `removivel: boolean` — frontend usa pra esconder o X.
   */
  async listarMinhas(userId: string, opts?: { limit?: number; apenasNaoLidas?: boolean }) {
    await this.limparNotificacoesAgendaExpiradas(userId)
    const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 100)
    const items = await prisma.notification.findMany({
      where: {
        userId,
        ...(opts?.apenasNaoLidas ? { lida: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    // Carrega o mapa uma vez só (evita N+1 chamadas a SystemConfig)
    const removableMap = await carregarRemovableMap()
    return items.map(n => ({
      ...n,
      removivel: !n.origem ? true : (n.origem in removableMap ? !!removableMap[n.origem] : true),
    }))
  }

  /** Quantidade de não lidas — mantido por compat. */
  async contarNaoLidas(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, lida: false } })
  }

  /**
   * Quantidade total de pendências do user — usado pelo sino.
   * Notificação representa pendência ativa: só some quando a origem (módulo)
   * remove o registro porque a condição foi resolvida.
   */
  async contarPendentes(userId: string): Promise<number> {
    await this.limparNotificacoesAgendaExpiradas(userId)
    return prisma.notification.count({ where: { userId } })
  }

  async marcarComoLida(id: string, userId: string) {
    // Garante que só marca as próprias
    const n = await prisma.notification.findUnique({ where: { id }, select: { userId: true, lida: true } })
    if (!n || n.userId !== userId) throw new Error('Notificação não encontrada')
    if (n.lida) return { ok: true }
    await prisma.notification.update({
      where: { id },
      data: { lida: true, lidaEm: new Date() },
    })
    this.events.emit({ type: 'updated', userId, notificationIds: [id] })
    return { ok: true }
  }

  async marcarTodasComoLidas(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, lida: false },
      data: { lida: true, lidaEm: new Date() },
    })
    this.events.emit({ type: 'cleared', userId })
    return { ok: true }
  }

  async excluir(id: string, userId: string) {
    const n = await prisma.notification.findUnique({ where: { id }, select: { userId: true, origem: true } })
    if (!n || n.userId !== userId) throw new Error('Notificação não encontrada')
    if (!(await ehRemovivel(n.origem))) {
      throw new Error('Esta notificação é gerenciada pelo sistema e some automaticamente quando a pendência for resolvida.')
    }
    await prisma.notification.delete({ where: { id } })
    this.events.emit({ type: 'removed', userId, notificationIds: [id] })
    return { ok: true }
  }

  /**
   * Apaga todas as notificações que apontem para um link específico (em todos
   * os usuários). Usado quando uma "pendência sistêmica" some — ex: orçamento
   * deixa de estar em status NOVO, todas as notificações com link daquele
   * orçamento devem evaporar do sino de todo mundo.
   *
   * Emite eventos SSE para cada user afetado pra atualizar o sino em tempo real.
   */
  async removerPorLink(link: string) {
    const alvos = await prisma.notification.findMany({
      where: { link },
      select: { id: true, userId: true },
    })
    if (alvos.length === 0) return { count: 0 }
    const ids = alvos.map(a => a.id)
    await prisma.notification.deleteMany({ where: { id: { in: ids } } })
    // Agrupa por userId pra emitir um evento por destinatário
    const idsPorUser = new Map<string, string[]>()
    for (const a of alvos) {
      const arr = idsPorUser.get(a.userId) ?? []
      arr.push(a.id)
      idsPorUser.set(a.userId, arr)
    }
    for (const [userId, notificationIds] of idsPorUser) {
      this.events.emit({ type: 'removed', userId, notificationIds })
    }
    return { count: ids.length }
  }

  // ── Configuração: quais origens o usuário pode remover do sino ──────
  // Persistida em SystemConfig (chave única) como JSON { [origem]: boolean }.
  // Endpoint admin em /configuracoes → pill "Notificações".

  /**
   * Lista catálogo + estado atual + contagem de notificações ativas por origem.
   * Usado pela UI de configurações para popular a tabela de toggles.
   */
  async listarOrigens() {
    const map = await carregarRemovableMap()
    // Conta notificações ativas por origem (group by)
    const counts = await prisma.notification.groupBy({
      by: ['origem'],
      _count: { _all: true },
    })
    const countMap = new Map<string, number>()
    for (const c of counts) {
      if (c.origem) countMap.set(c.origem, c._count._all)
    }
    // Mostra primeiro as do catálogo, depois extras (origens criadas mas não
    // mapeadas — ex: novo módulo que ainda não foi adicionado ao catálogo)
    const knownSlugs = new Set(NOTIFICATION_ORIGENS.map(o => o.origem))
    const principais = NOTIFICATION_ORIGENS.map(o => ({
      origem: o.origem,
      label: o.label,
      descricao: o.descricao,
      modulo: o.modulo,
      removivelPadrao: o.removivelPadrao,
      removivelAtual: o.origem in map ? !!map[o.origem] : o.removivelPadrao,
      ativos: countMap.get(o.origem) ?? 0,
      conhecida: true,
    }))
    const extras = Array.from(countMap.keys())
      .filter(slug => !knownSlugs.has(slug))
      .map(slug => ({
        origem: slug,
        label: slug,
        descricao: 'Origem detectada no banco mas ainda não mapeada no catálogo do sistema.',
        modulo: '—',
        removivelPadrao: true,
        removivelAtual: slug in map ? !!map[slug] : true,
        ativos: countMap.get(slug) ?? 0,
        conhecida: false,
      }))
    return [...principais, ...extras]
  }

  /** Atualiza a config a partir de um map { origem -> boolean }. */
  async setRemovableConfig(input: Record<string, boolean>) {
    const sanitized: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(input)) {
      if (typeof k === 'string' && k.length > 0 && typeof v === 'boolean') sanitized[k] = v
    }
    await prisma.systemConfig.upsert({
      where: { key: CFG_KEY_REMOVABLE },
      update: { value: JSON.stringify(sanitized), label: 'Origens de notificação removíveis pelo usuário', group: 'Notificações' },
      create: {
        key: CFG_KEY_REMOVABLE,
        value: JSON.stringify(sanitized),
        label: 'Origens de notificação removíveis pelo usuário',
        group: 'Notificações',
      },
    })
    return { ok: true }
  }

  /**
   * Helper interno (chamado por outros services) para criar notificação para 1 user.
   * Use `criarParaUsers` quando precisar disparar para vários ao mesmo tempo.
   */
  async criar(data: {
    userId: string
    titulo: string
    mensagem?: string | null
    tipo?: 'info' | 'success' | 'warning' | 'error'
    link?: string | null
    origem?: string | null
    empresaId?: string | null
  }) {
    const created = await prisma.notification.create({
      data: {
        userId: data.userId,
        titulo: data.titulo,
        mensagem: data.mensagem ?? null,
        tipo: data.tipo ?? 'info',
        link: data.link ?? null,
        origem: data.origem ?? null,
        empresaId: data.empresaId ?? null,
      },
    })
    this.events.emit({ type: 'new', userId: data.userId, notificationIds: [created.id] })
    return created
  }

  async criarParaUsers(userIds: string[], payload: {
    titulo: string
    mensagem?: string | null
    tipo?: 'info' | 'success' | 'warning' | 'error'
    link?: string | null
    origem?: string | null
    empresaId?: string | null
  }) {
    if (userIds.length === 0) return { count: 0 }
    const result = await prisma.notification.createMany({
      data: userIds.map(userId => ({
        userId,
        titulo: payload.titulo,
        mensagem: payload.mensagem ?? null,
        tipo: payload.tipo ?? 'info',
        link: payload.link ?? null,
        origem: payload.origem ?? null,
        empresaId: payload.empresaId ?? null,
      })),
    })
    this.events.emitBatch(userIds, { type: 'new' })
    return result
  }
}
