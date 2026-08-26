'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import {
  Plus, Loader2, Search, AlertTriangle, MessageSquare,
  CheckCircle2, LayoutGrid, List as ListIcon, Inbox, Settings, Archive,
  Paperclip, Bot, BarChart3, XCircle, MoreVertical, ExternalLink, X, FilterX, SlidersHorizontal,
} from 'lucide-react'
import {
  DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Button, Card, Badge, Input, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import { USER_PERMISSIONS_REFRESH_EVENT } from '@/hooks/use-user-permissions'
import { useSession } from '@/lib/auth-client'
import {
  HELPDESK_STATUS, HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE, HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_PRIORIDADE_COLORS,
  solicitantePodeCancelar, helpdeskPodeArquivar,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'
import { NovoTicketModal } from './_components/novo-ticket-modal'
import { TicketDetalheCompletoSheet } from './_components/ticket-detalhe-completo-sheet'
import { HELPDESK_STATUS_COR } from './_lib/status-styles'
import { UserAvatar } from '@/components/ui/user-avatar'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

interface Ticket {
  id: string
  numero: number
  titulo: string
  status: HelpdeskStatus
  prioridade: HelpdeskPrioridade
  tipo: 'INCIDENTE' | 'REQUISICAO' | 'DUVIDA' | 'MELHORIA'
  prazoSla: string | null
  createdAt: string
  /** Quando o solicitante respondeu o CSAT — usado pra sinalizar avaliação pendente. */
  csatRespondidoEm?: string | null
  solicitante: { id: string; name: string; image: string | null } | null
  responsavel: { id: string; name: string; image: string | null } | null
  categoria: { id: string; nome: string; cor: string | null } | null
  area: { id: string; name: string } | null
  _count: { mensagens: number; anexos: number }
  /** Primeiro anexo de imagem do ticket — usado como capa do card no kanban. */
  capa: { id: string; fileName: string; fileUrl: string; mimeType: string | null } | null
  /** Solicitante mandou a última mensagem pública ⇒ card destacado (aguarda o agente). */
  aguardandoResposta?: boolean
  // Score da triagem IA (#HLP0083) — exibido como badge no card do kanban.
  // aiElegivel=true → atingiu o threshold (cor violeta), false → não elegível (cinza).
  aiScore?: number | null
  aiElegivel?: boolean | null
  aiPlanoStatus?: 'pendente' | 'aprovado' | 'rejeitado' | null
  /** Arquivado — usado pra separar em dois quadros na visão de lista. */
  arquivado?: boolean
}

// Ordena por data de criação, mais novo primeiro. Usado nas visões de LISTA
// (ativos, arquivados e o modo "ver arquivados"); o kanban ordena por status.
const porCriacaoDesc = (ts: Ticket[]) => [...ts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

// Colunas do kanban — ordem visual horizontal
const COLUNAS: HelpdeskStatus[] = [
  'NOVO',
  'AGUARDANDO_AUDITORIA',
  'EM_ANDAMENTO',
  'RESOLVIDO',
  'CONCLUIDO',
  'CANCELADO',
]

// Cor de status: fonte única em _lib/status-styles (hex p/ kanban, barras e a
// bolinha do badge da lista). O badge com fundo sólido (HELPDESK_STATUS_BADGE)
// é usado só no detalhe do chamado.
const STATUS_COR = HELPDESK_STATUS_COR

type ScopeFiltro = 'MEUS' | 'AREA' | 'TODOS'
const SCOPE_FILTRO_LABEL: Record<ScopeFiltro, string> = { MEUS: 'Meus tickets', AREA: 'Minha área', TODOS: 'Todos' }

/**
 * Opções do filtro conforme o escopo EFETIVO do usuário (#HLP0139): só as que o
 * escopo abrange. A última é a mais abrangente (padrão selecionado).
 */
function scopeOptionsFor(escopo: 'proprios' | 'area' | 'todos', temArea: boolean): ScopeFiltro[] {
  if (escopo === 'todos') return temArea ? ['MEUS', 'AREA', 'TODOS'] : ['MEUS', 'TODOS']
  if (escopo === 'area') return ['MEUS', 'AREA']
  return ['MEUS']
}

export default function HelpdeskPage() {
  const router = useRouter()
  // #HLP0172: identidade do usuário para liberar o cancelamento do PRÓPRIO
  // ticket direto na lista — a solicitante do ticket procurou a opção aqui e
  // não achou, porque ela só existia dentro da página do chamado.
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? null
  // Estados independentes:
  //   - isAgente: tem permissão helpdesk.canRead → vê o módulo (qualquer um que tenha o slug)
  //   - podeAtuar: é agente da TI (master/empresa-master, sub-permissão
  //     atuar_agente ou área de TI — NÃO os cargos DIRETOR/COORDENADOR). Vê o
  //     kanban, arrasta, configura. Valor vem do probe do backend (fonte única
  //     ehAgenteHelpdesk), então não recalcular papel aqui.
  // Colaborador comum: isAgente=true (vê módulo) MAS podeAtuar=false (vê só os próprios).
  const [isAgente, setIsAgente] = useState<boolean | null>(null)
  const [podeAtuar, setPodeAtuar] = useState<boolean | null>(null)
  // C9 — pode ver as MÉTRICAS COMPLETAS (panel_metricas / master / cargo). Governa
  // o link de indicadores pra quem não é agente (chefia). O agente também vê o
  // link, mas cai na visão "minhas avaliações" se não tiver esta permissão.
  const [podeVerMetricas, setPodeVerMetricas] = useState<boolean | null>(null)
  const [items, setItems] = useState<Ticket[]>([])
  // Arquivados — quadro inferior na visão de lista (#HLP0318). Fica separado
  // de `items` (ativos) pra renderizar os dois quadros: ativos em cima,
  // arquivados embaixo. Só é populado quando a visão é lista e não estamos no
  // modo "arquivados only" da TI.
  const [arquivados, setArquivados] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  // Escolha manual do filtro (null = usar o padrão do escopo efetivo). #HLP0139
  const [scopeManual, setScopeManual] = useState<ScopeFiltro | null>(null)
  // Escopo efetivo do usuário — define as opções do filtro e o padrão.
  const [meuEscopo, setMeuEscopo] = useState<{ scope: 'proprios' | 'area' | 'todos'; temArea: boolean; areaId: string | null } | null>(null)
  // Modo "Arquivados" — quando true, fetcha só os arquivados (lista) e o
  // botão de cada card vira "Desarquivar" no lugar do drag.
  const [verArquivados, setVerArquivados] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState<HelpdeskPrioridade | ''>('')
  const [filtroStatus, setFiltroStatus] = useState<HelpdeskStatus | ''>('')
  // Filtros por solicitante / responsável (#HLP0139)
  const [filtroSolicitante, setFiltroSolicitante] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('')
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string; areaId: string | null }>>([])
  const [agentes, setAgentes] = useState<Array<{ id: string; name: string }>>([])
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>(() => {
    if (typeof window === 'undefined') return 'kanban'
    const salvo = window.localStorage.getItem('helpdesk:viewMode')
    if (salvo === 'kanban' || salvo === 'lista') return salvo
    // Sem preferência salva, o celular abre em lista: o kanban tem seis colunas
    // de 240px, ou seja 1440px de rolagem lateral numa tela de 390px. Quem
    // escolher kanban no celular continua com ele — a escolha manda.
    return window.matchMedia('(max-width: 639px)').matches ? 'lista' : 'kanban'
  })
  const [novoOpen, setNovoOpen] = useState(false)
  // Ticket aberto no sheet de detalhe (click esquerdo no card do kanban)
  const [openTicketId, setOpenTicketId] = useState<string | null>(null)
  // Ticket recém-desarquivado: usado pra rolar até ele + destacá-lo na lista de ativos.
  const [recemDesarquivado, setRecemDesarquivado] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('helpdesk:viewMode', viewMode)
  }, [viewMode])

  // Não-TI (sem podeAtuar) só veem em modo Lista — força quando descobrir o papel
  useEffect(() => {
    if (podeAtuar === false && viewMode !== 'lista') setViewMode('lista')
  }, [podeAtuar, viewMode])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Papel do usuário (probes canRead / atuar_agente) + escopo efetivo. Carrega na
  // montagem E quando as permissões mudam no app (evento user-permissions-refresh),
  // então uma alteração feita pela tela de /usuarios reflete sem exigir F5. #HLP0139
  useEffect(() => {
    let cancelled = false
    async function carregar() {
      const [acc, atuar, esc, metr] = await Promise.allSettled([
        (trpc.helpdesk as any).probeAccess.query(),
        (trpc.helpdesk as any).probeAtuarAgente.query(),
        (trpc.helpdesk as any).meuEscopo.query(),
        (trpc.helpdesk as any).probeMetricasCompletas.query(),
      ])
      if (cancelled) return
      const agente = acc.status === 'fulfilled'
      setIsAgente(agente)
      setPodeAtuar(atuar.status === 'fulfilled' ? !!(atuar.value as { ok?: boolean })?.ok : false)
      setPodeVerMetricas(metr.status === 'fulfilled' ? !!metr.value : false)
      setMeuEscopo(esc.status === 'fulfilled'
        ? (esc.value as { scope: 'proprios' | 'area' | 'todos'; temArea: boolean; areaId: string | null })
        : { scope: 'proprios', temArea: false, areaId: null })
      // Listas dos filtros (só pra agente — colaborador comum não filtra) #HLP0139
      if (agente) {
        const [us, ags] = await Promise.allSettled([
          (trpc.user as any).listForSelect.query(),
          (trpc.helpdesk as any).listAgentes.query(),
        ])
        if (cancelled) return
        if (us.status === 'fulfilled') setUsuarios((us.value as Array<{ id: string; name: string; areaId: string | null }>) ?? [])
        if (ags.status === 'fulfilled') setAgentes((ags.value as Array<{ id: string; name: string }>) ?? [])
      }
    }
    carregar()
    window.addEventListener(USER_PERMISSIONS_REFRESH_EVENT, carregar)
    return () => { cancelled = true; window.removeEventListener(USER_PERMISSIONS_REFRESH_EVENT, carregar) }
  }, [])

  // Opções disponíveis do filtro + padrão (mais abrangente). Ao carregar o escopo,
  // seleciona o padrão automaticamente.
  const scopeOptions = useMemo<ScopeFiltro[]>(
    () => (meuEscopo ? scopeOptionsFor(meuEscopo.scope, meuEscopo.temArea) : ['MEUS']),
    [meuEscopo],
  )
  // Escopo aplicado: escolha manual (se ainda válida) ou o padrão = mais abrangente.
  const scope = useMemo<ScopeFiltro>(
    () => (scopeManual && scopeOptions.includes(scopeManual) ? scopeManual : scopeOptions[scopeOptions.length - 1]!),
    [scopeManual, scopeOptions],
  )

  // Solicitantes disponíveis no filtro conforme o escopo: "área" → só os da minha
  // área; "todos" → todos; "meus" → nenhum (filtro não aparece). #HLP0139
  const solicitanteOptions = useMemo(() => {
    if (scope === 'AREA' && meuEscopo?.areaId) return usuarios.filter(u => u.areaId === meuEscopo.areaId)
    if (scope === 'TODOS') return usuarios
    return []
  }, [scope, usuarios, meuEscopo])

  // Fora do escopo "meus", o filtro de solicitante só vale se estiver nas opções.
  useEffect(() => {
    if (scope === 'MEUS') { if (filtroSolicitante) setFiltroSolicitante(''); return }
    if (filtroSolicitante && !solicitanteOptions.some(u => u.id === filtroSolicitante)) setFiltroSolicitante('')
  }, [scope, solicitanteOptions, filtroSolicitante])

  // No kanban as colunas já SÃO os status, então o filtro por status não faz
  // sentido lá — só na lista. Limpa ao entrar no kanban.
  const emKanban = viewMode === 'kanban' && !verArquivados
  useEffect(() => {
    if (emKanban && filtroStatus) setFiltroStatus('')
  }, [emKanban, filtroStatus])

  // Tickets do PRÓPRIO usuário resolvidos e ainda sem avaliação — o solicitante
  // precisa avaliar. Filtra por solicitante (a lista geral traz tickets de
  // terceiros, ao contrário da antiga /helpdesk/meus).
  const pendentesCsat = items.filter(t =>
    t.status === 'RESOLVIDO' && !t.csatRespondidoEm && t.solicitante?.id === currentUserId,
  )

  // C11 — filtros de NARROWING ativos (não conta o escopo/abrangência, que tem
  // padrão próprio). Alimenta o "x" da busca e o botão "Limpar filtros".
  const temFiltroAtivo = !!(search || filtroPrioridade || filtroStatus || filtroSolicitante || filtroResponsavel)
  /** Quantos refinamentos estão ligados — vira o número no botão "Filtros". */
  const filtrosAtivos = [filtroPrioridade, filtroStatus, filtroSolicitante, filtroResponsavel].filter(Boolean).length
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  function limparFiltros() {
    setSearch('')
    setFiltroPrioridade('')
    setFiltroStatus('')
    setFiltroSolicitante('')
    setFiltroResponsavel('')
  }

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    // Espera saber se é agente (canRead) e o escopo efetivo (#HLP0139).
    if (isAgente === null || meuEscopo === null) return
    // #HLP0182: refetch silencioso (foco de aba / back-forward) NÃO seta loading —
    // assim as colunas do kanban não desmontam e o scroll de cada coluna é
    // preservado. Só o carregamento inicial/troca de filtro mostra o spinner.
    if (opts?.silent !== true) setLoading(true)
    try {
      if (isAgente) {
        // Agente (canRead): painel completo, filtrado pelo escopo efetivo. O
        // backend clampa o scope pedido ao permitido, então nunca vaza.
        const baseParams = {
          scope,
          search: debouncedSearch || undefined,
          status: filtroStatus ? [filtroStatus] : undefined,
          prioridade: filtroPrioridade ? [filtroPrioridade] : undefined,
          solicitanteId: filtroSolicitante || undefined,
          responsavelId: filtroResponsavel || undefined,
          page: 1,
          limit: 200,
        }
        if (verArquivados) {
          // Modo "arquivados only" da TI — quadro único de arquivados.
          const res = await (trpc.helpdesk as any).list.query({ ...baseParams, arquivado: true })
          setItems(res.data || [])
          setArquivados([])
        } else {
          // Modo normal: ativos sempre; arquivados só na visão de lista (o
          // kanban não tem quadro de arquivados). Assim a Erica e demais
          // colaboradores passam a ver os dois quadros (#HLP0318).
          const querArq = viewMode === 'lista'
          const [ativosRes, arqRes] = await Promise.all([
            (trpc.helpdesk as any).list.query({ ...baseParams, arquivado: false }),
            querArq
              ? (trpc.helpdesk as any).list.query({ ...baseParams, arquivado: true })
              : Promise.resolve({ data: [] }),
          ])
          setItems(ativosRes.data || [])
          setArquivados(arqRes.data || [])
        }
      } else {
        // Sem canRead: vê APENAS os próprios tickets (solicitante/responsável) em lista
        const data = await (trpc.helpdesk as any).listMeus.query({ incluirHistorico: true })
        const q = (debouncedSearch || '').trim().toLowerCase()
        const digits = q.replace(/\D/g, '')
        const filtered = (data || []).filter((t: Ticket) => {
          if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false
          if (q) {
            const numFmt = `#hlp${String(t.numero).padStart(4, '0')}`
            const hit =
              t.titulo.toLowerCase().includes(q) ||
              numFmt.includes(q) ||
              (!!digits && String(t.numero).includes(digits)) ||
              (t.categoria?.nome?.toLowerCase().includes(q) ?? false) ||
              (t.responsavel?.name?.toLowerCase().includes(q) ?? false) ||
              (t.solicitante?.name?.toLowerCase().includes(q) ?? false)
            if (!hit) return false
          }
          return true
        })
        // Separa ativos (topo) de arquivados (embaixo) — #HLP0318.
        setItems(filtered.filter((t: Ticket) => !t.arquivado))
        setArquivados(filtered.filter((t: Ticket) => t.arquivado))
      }
    } catch (e) {
      alerts.error('Erro ao listar', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [isAgente, meuEscopo, scope, debouncedSearch, filtroStatus, filtroPrioridade, filtroSolicitante, filtroResponsavel, verArquivados, viewMode])
  // Nota: no finally o setLoading(false) é inofensivo mesmo no modo silent
  // (loading já estava false). O que importa é NÃO subir pra true no silent.

  /**
   * #HLP0172 — cancelamento do PRÓPRIO chamado direto na lista.
   * A regra é a mesma do botão que já existia dentro do ticket (ser solicitante
   * e o chamado estar aberto); o que faltava era o caminho aqui, que é onde a
   * solicitante procurou. O backend agora impõe essa regra de fato: um
   * não-agente só consegue levar o próprio ticket para CANCELADO.
   */
  const cancelarProprio = useCallback(async (t: Ticket) => {
    const ok = await alerts.confirm({
      title: `Cancelar #HLP${String(t.numero).padStart(4, '0')}?`,
      text: 'O chamado fica registrado como cancelado e sai da fila de atendimento.',
      confirmText: 'Cancelar chamado',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.helpdesk as any).update.mutate({ id: t.id, data: { status: 'CANCELADO' } })
      alerts.toast('Chamado cancelado')
      fetchData()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }, [fetchData])

  // Desarquivar in-place (da lista normal OU do modo "ver arquivados"). Sai do
  // modo arquivados e marca o ticket pra rolar/destacar já na lista de ativos.
  const desarquivar = useCallback(async (t: Ticket) => {
    try {
      await (trpc.helpdesk as any).update.mutate({ id: t.id, data: { arquivado: false } })
      alerts.success('Desarquivado', 'Ticket voltou pra lista ativa.')
      setRecemDesarquivado(t.id)
      // Garante a visão em lista (o scroll/destaque até o ticket só existe nela;
      // no kanban não há "posição" pra rolar).
      setViewMode('lista')
      // Vindo do modo "ver arquivados": só sair do modo — a troca de verArquivados
      // recria o fetchData e o efeito recarrega os ATIVOS (sem refetch dos
      // arquivados no meio). Na lista normal: recarrega no lugar (silencioso).
      if (verArquivados) setVerArquivados(false)
      else fetchData({ silent: true })
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }, [fetchData, verArquivados])

  // Arquivar in-place pelo kebab da lista (só etapas finais — mesma regra do
  // detalhe/kanban/backend, ver helpdeskPodeArquivar). Confirma antes.
  const arquivar = useCallback(async (t: Ticket) => {
    const ok = await alerts.confirm({
      title: `Arquivar #HLP${String(t.numero).padStart(4, '0')}?`,
      text: 'O chamado some das listas ativas (kanban e lista), mas continua acessível pelo histórico e pode ser desarquivado a qualquer momento.',
      confirmText: 'Arquivar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.helpdesk as any).update.mutate({ id: t.id, data: { arquivado: true } })
      alerts.success('Arquivado', 'Ticket movido para os arquivados.')
      fetchData({ silent: true })
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }, [fetchData])

  // Após desarquivar + recarregar: quando o ticket aparece nos ativos, rola até
  // ele e mantém o destaque por ~2,5s.
  useEffect(() => {
    if (!recemDesarquivado || !items.some(t => t.id === recemDesarquivado)) return
    const el = document.getElementById(`hlp-row-${recemDesarquivado}`)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    const timer = setTimeout(() => setRecemDesarquivado(null), 2500)
    return () => clearTimeout(timer)
  }, [recemDesarquivado, items])

  useEffect(() => { fetchData() }, [fetchData])

  // Refetch em back/forward + retorno de aba — App Router preserva o
  // componente em soft navigation; sem isso a lista fica stale após
  // criar/abrir/voltar de um ticket.
  useEffect(() => {
    // #HLP0182: refetch silencioso ao voltar (back-forward / foco de aba) — não
    // recarrega as colunas nem perde o scroll; só atualiza os dados em segundo plano.
    function refresh() { fetchData({ silent: true }) }
    function onVis() { if (!document.hidden) fetchData({ silent: true }) }
    window.addEventListener('popstate', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('popstate', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [fetchData])

  // ── DnD — segue PADRAO_KANBAN_DND.md (mesma sensação de peso do CRM/orçamentos) ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const lastDragXRef = useRef(0)
  const activeCard = useMemo(() => items.find(t => t.id === activeId) || null, [items, activeId])

  const handleDragStart = (e: DragStartEvent) => {
    if (!podeAtuar) return // só TI/diretor/coordenador move cards
    setActiveId(e.active.id as string)
    // Captura largura real do card pra o overlay não "encolher" (colunas usam flex-1)
    const initial = (e.active as unknown as { rect?: { current?: { initial?: { width: number } } } }).rect?.current?.initial
    setActiveCardWidth(initial?.width ?? null)
    setDragDeltaX(0)
    lastDragXRef.current = 0
  }
  const handleDragMove = (e: { delta: { x: number; y: number } }) => {
    const dx = e.delta.x - lastDragXRef.current
    lastDragXRef.current = e.delta.x
    setDragDeltaX(dx)
  }
  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    if (!podeAtuar) return
    const { active, over } = e
    if (!over) return
    const ticketId = String(active.id)
    const overId = String(over.id)
    // overId pode ser uma coluna (status) ou outro card
    let novoStatus: HelpdeskStatus | null = null
    if (COLUNAS.includes(overId as HelpdeskStatus)) {
      novoStatus = overId as HelpdeskStatus
    } else {
      const overTicket = items.find(t => t.id === overId)
      if (overTicket) novoStatus = overTicket.status
    }
    if (!novoStatus) return
    const atual = items.find(t => t.id === ticketId)
    if (!atual || atual.status === novoStatus) return

    // Otimismo
    setItems(prev => prev.map(t => t.id === ticketId ? { ...t, status: novoStatus! } : t))
    try {
      await (trpc.helpdesk as any).update.mutate({
        id: ticketId,
        data: { status: novoStatus },
      })
    } catch (err) {
      alerts.error('Erro', (err as Error).message)
      // Reverte
      setItems(prev => prev.map(t => t.id === ticketId ? { ...t, status: atual.status } : t))
    }
  }

  // Agrupa por status
  const porStatus = useMemo(() => {
    const map = new Map<HelpdeskStatus, Ticket[]>()
    for (const s of COLUNAS) map.set(s, [])
    for (const t of items) {
      const arr = map.get(t.status) ?? []
      arr.push(t)
      map.set(t.status, arr)
    }
    return map
  }, [items])

  if (isAgente === null) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-90px)]">
      {/* Topo — PADRAO_PAGINAS §1.1 (referência /clientes) */}
      <PageHeaderBar className="shrink-0" actions={<>
          {/* Busca e filtros no header, como no /orcamentos */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={isAgente ? 'Buscar título, descrição, tags...' : 'Buscar nos meus tickets...'}
              className="h-9 w-56 pl-8 pr-8 text-sm"
            />
            {/* C11 — limpa só a busca */}
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Limpar busca"
                aria-label="Limpar busca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
            <span className="mr-1 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
              {items.length} ticket{items.length === 1 ? '' : 's'}
            </span>
            {/* Botão "Filtros" com contador — mesmo do /orcamentos. Antes os
                quatro selects ficavam abertos na barra o tempo todo. */}
            <button
              type="button"
              onClick={() => setFiltrosOpen(v => !v)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
                filtrosOpen || filtrosAtivos > 0
                  ? 'border-border bg-muted text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted/50',
              )}
              title="Filtros"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtros
              {filtrosAtivos > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white" style={{ backgroundColor: MODULO_COLOR }}>{filtrosAtivos}</span>
              )}
            </button>
          {/* Toggle Kanban/Lista — só TI (podeAtuar). Demais usuários veem só Lista. */}
          {podeAtuar && (
            <div className="flex items-center overflow-hidden rounded-lg border">
              <button
                type="button"
                className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
                onClick={() => setViewMode('kanban')}
                title="Kanban"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn('p-1.5 transition-colors', viewMode === 'lista' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
                onClick={() => setViewMode('lista')}
                title="Lista"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => setNovoOpen(true)}
            style={{ backgroundColor: MODULO_COLOR }}
            className="text-white gap-1.5"
          >
            <Plus className="h-4 w-4" /> Novo Ticket
          </Button>
          {/* Arquivados fica à vista quando ligado — é um modo, e modo escondido
              no menu deixa o usuário sem saber por que a lista mudou. */}
          {podeAtuar && verArquivados && (
            <Button
              size="sm"
              onClick={() => setVerArquivados(false)}
              className="gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
            >
              <Archive className="h-4 w-4" />Sair dos arquivados
            </Button>
          )}
          {/* Secundárias no menu ⋮, como manda o padrão */}
          {(podeAtuar || podeVerMetricas) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                {(podeAtuar || podeVerMetricas) && (
                  <DropdownMenuItem onClick={() => router.push('/helpdesk/indicadores')}>
                    <BarChart3 className="h-4 w-4" />Indicadores e relatórios
                  </DropdownMenuItem>
                )}
                {podeAtuar && !verArquivados && (
                  <DropdownMenuItem onClick={() => setVerArquivados(true)}>
                    <Archive className="h-4 w-4" />Ver arquivados
                  </DropdownMenuItem>
                )}
                {podeAtuar && (
                  <DropdownMenuItem onClick={() => router.push('/helpdesk/configuracoes')}>
                    <Settings className="h-4 w-4" />Configurações
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>}
      >
        <h1 className="truncate">HelpDesk</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>TI</span>
          <span className="text-muted-foreground/50">›</span>
          <span>HelpDesk</span>
          {verArquivados && (<>
            <span className="text-muted-foreground/50">›</span>
            <span className="text-amber-600 dark:text-amber-400">Arquivados</span>
          </>)}
        </p>
      </PageHeaderBar>


      {/* Painel de filtros — abre e fecha como o do /orcamentos */}
      <div
        className="grid shrink-0 transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(.16,1,.3,1)]"
        style={{ gridTemplateRows: filtrosOpen ? '1fr' : '0fr', opacity: filtrosOpen ? 1 : 0 }}
        aria-hidden={!filtrosOpen}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          {/* C11 — limpa todos os filtros de narrowing de uma vez; fica entre o
              contador e os filtros. Só aparece quando há algo pra limpar. Outline
              (não ghost) pra ter borda visível também no dark. */}
          {temFiltroAtivo && (
            <Button
              variant="outline"
              size="sm"
              onClick={limparFiltros}
              className="h-8 gap-1.5 px-2 text-xs"
              title="Limpar todos os filtros"
            >
              <FilterX className="h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}
          {/* Solicitante — só fora do escopo "meus" e quando há opções. O value
              deriva pra "Todos os solicitantes" sempre que o selecionado não for
              uma opção válida (ex.: troquei de escopo), em vez de ficar em branco. */}
          {isAgente && scope !== 'MEUS' && solicitanteOptions.length > 0 && (
            <Select
              value={filtroSolicitante && solicitanteOptions.some(u => u.id === filtroSolicitante) ? filtroSolicitante : '__all__'}
              onValueChange={v => setFiltroSolicitante(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="h-9 text-xs w-[170px]">
                <span>{(filtroSolicitante && solicitanteOptions.find(u => u.id === filtroSolicitante)?.name) || 'Solicitante'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os solicitantes</SelectItem>
                {solicitanteOptions.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* Responsável — só agentes */}
          {isAgente && agentes.length > 0 && (
            <Select value={filtroResponsavel || '__all__'} onValueChange={v => setFiltroResponsavel(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs w-[160px]">
                <span>{(filtroResponsavel && agentes.find(a => a.id === filtroResponsavel)?.name) || 'Responsável'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os responsáveis</SelectItem>
                {agentes.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {/* Status — só na lista (no kanban as colunas já são os status) */}
          {isAgente && !emKanban && (
            <Select value={filtroStatus || '__all__'} onValueChange={v => setFiltroStatus(v === '__all__' ? '' : v as HelpdeskStatus)}>
              <SelectTrigger className="h-9 text-xs w-[150px]">
                <span>{(filtroStatus && HELPDESK_STATUS_LABELS[filtroStatus]) || 'Status'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                {HELPDESK_STATUS.map(s => (
                  <SelectItem key={s} value={s}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COR[s] }} />
                      {HELPDESK_STATUS_LABELS[s]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Prioridade */}
          {isAgente && (
            <Select value={filtroPrioridade || '__all__'} onValueChange={v => setFiltroPrioridade(v === '__all__' ? '' : v as HelpdeskPrioridade)}>
              <SelectTrigger className="h-9 text-xs w-[150px]">
                <span>{(filtroPrioridade && HELPDESK_PRIORIDADE_LABELS[filtroPrioridade]) || 'Prioridade'}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as prioridades</SelectItem>
                {HELPDESK_PRIORIDADE.map(p => (
                  <SelectItem key={p} value={p}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HELPDESK_PRIORIDADE_COLORS[p] }} />
                      {HELPDESK_PRIORIDADE_LABELS[p]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {/* Escopo — último da linha. Fica à direita dos demais para que a
              troca de escopo (que faz o filtro de solicitante aparecer/sumir)
              não desloque os filtros estáveis, ancorados à direita. */}
          {isAgente && (
            <Select value={scope} onValueChange={v => setScopeManual(v as ScopeFiltro)} disabled={scopeOptions.length <= 1}>
              <SelectTrigger className="h-9 text-xs w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {scopeOptions.map(o => <SelectItem key={o} value={o}>{SCOPE_FILTRO_LABEL[o]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          </div>
        </div>
      </div>

      {/* Banner do modo arquivado — sinaliza que a visão é distinta */}
      {verArquivados && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs">
            <Archive className="h-3.5 w-3.5" />
            <span>Você está vendo <strong>tickets arquivados</strong>. Eles não aparecem no kanban normal — use o botão de desarquivar pra trazer um ticket de volta.</span>
          </div>
          <button
            type="button"
            onClick={() => setVerArquivados(false)}
            className="text-[11px] text-amber-700 dark:text-amber-300 hover:underline shrink-0"
          >
            Voltar pros ativos
          </button>
        </div>
      )}

      {/* Aviso: chamados do próprio usuário aguardando avaliação (CSAT).
          Trazido da antiga /helpdesk/meus. O clique no chamado resolvido abre
          o detalhe pra avaliar. */}
      {pendentesCsat.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 px-3 py-2 shrink-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {pendentesCsat.length} chamado{pendentesCsat.length > 1 ? 's' : ''} aguardando sua avaliação
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
            Abra o chamado resolvido para avaliar o atendimento — leva menos de um minuto.
          </p>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <Card className="flex-1 flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando tickets...
          </div>
        </Card>
      ) : (viewMode === 'lista' && !verArquivados) ? (
        // Visão de lista normal — dois quadros: ativos em cima, arquivados
        // embaixo (#HLP0318). O container rola; cada quadro tem altura natural.
        (items.length === 0 && arquivados.length === 0) ? (
          <Card className="flex-1 flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-30 mb-2" />
            <p className="text-sm">Nenhum ticket encontrado</p>
          </Card>
        ) : (
          <div className="nice-scrollbar flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
            <TicketPanel titulo="Ativos" icon={Inbox} tickets={porCriacaoDesc(items)} vazio="Nenhum ticket ativo no momento."
              currentUserId={currentUserId} onCancelar={cancelarProprio} onOpen={setOpenTicketId}
              onArchive={podeAtuar ? arquivar : undefined} highlightId={recemDesarquivado} />
            {arquivados.length > 0 && (
              // Arquivados não recebem o cancelar (já encerrados), mas podem ser
              // desarquivados in-place — o ticket sobe pros Ativos e é destacado.
              <TicketPanel titulo="Arquivados" icon={Archive} tickets={porCriacaoDesc(arquivados)} vazio="Nenhum ticket arquivado." arquivado
                onOpen={setOpenTicketId} onUnarchive={podeAtuar ? desarquivar : undefined} />
            )}
          </div>
        )
      ) : items.length === 0 ? (
        <Card className="flex-1 flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="h-10 w-10 opacity-30 mb-2" />
          <p className="text-sm">Nenhum ticket encontrado</p>
        </Card>
      ) : (viewMode === 'kanban' && !verArquivados) ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
          <div className="nice-scrollbar -mx-1 flex-1 overflow-x-auto overflow-y-hidden pb-4">
            {/* `w-max` no lugar do minWidth calculado: a largura vem das colunas,
                que têm medida fixa — mesmo trilho do /orcamentos. */}
            <div className="flex h-full w-max gap-4 px-1">
              {COLUNAS.map(status => (
                <KanbanColumn
                  key={status}
                  status={status}
                  cor={STATUS_COR[status]}
                  tickets={porStatus.get(status) ?? []}
                  onCardClick={(id) => setOpenTicketId(id)}
                  onCardAuxClick={(id) => window.open(`/helpdesk/${id}`, '_blank', 'noopener,noreferrer')}
                  podeArquivarLote={!!podeAtuar && helpdeskPodeArquivar(status)}
                  onArchiveAll={async () => {
                    const labelStatus = HELPDESK_STATUS_LABELS[status]
                    const qtd = porStatus.get(status)?.length ?? 0
                    if (qtd === 0) return
                    const ok = await alerts.confirm({
                      title: `Arquivar ${qtd} ticket${qtd > 1 ? 's' : ''}?`,
                      text: `Todos os tickets da coluna "${labelStatus}" serão arquivados (somem do kanban mas continuam acessíveis pelo histórico).`,
                      confirmText: 'Arquivar tudo',
                      icon: 'warning',
                    })
                    if (!ok) return
                    try {
                      const r = await (trpc.helpdesk as any).arquivarPorStatus.mutate({ status }) as { count: number }
                      alerts.success('Arquivados', `${r.count} ticket${r.count > 1 ? 's' : ''} arquivado${r.count > 1 ? 's' : ''}.`)
                      fetchData()
                    } catch (e) {
                      alerts.error('Erro', (e as Error).message)
                    }
                  }}
                />
              ))}
            </div>
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeCard && <KanbanCardOverlay ticket={activeCard} cor={STATUS_COR[activeCard.status]} velocityX={dragDeltaX} width={activeCardWidth} />}
          </DragOverlay>
        </DndContext>
      ) : (
        // Modo arquivados — reaproveita o mesmo TicketPanel da lista normal, com
        // o desarquivar in-place por linha (sem entrar no ticket).
        <div className="nice-scrollbar flex-1 min-h-0 overflow-y-auto flex flex-col gap-4">
          <TicketPanel
            titulo="Arquivados"
            icon={Archive}
            tickets={porCriacaoDesc(items)}
            vazio="Nenhum ticket arquivado."
            arquivado
            currentUserId={currentUserId}
            onOpen={setOpenTicketId}
            onUnarchive={podeAtuar ? desarquivar : undefined}
          />
        </div>
      )}

      <NovoTicketModal
        open={novoOpen}
        onOpenChange={setNovoOpen}
        permitePrioridade={podeAtuar ?? false}
        onCreated={(id) => {
          fetchData()
          // Quem pode atuar vai direto pro detalhe (triagem); demais ficam na lista
          if (podeAtuar) router.push(`/helpdesk/${id}`)
        }}
      />

      {/* Sheet de detalhe — abre por click esquerdo no card. Mantém o
          kanban visível por baixo. Botão do meio abre o detalhe completo
          em nova aba via SortableCard.onAuxClick. */}
      <TicketDetalheCompletoSheet
        ticketId={openTicketId}
        onClose={() => setOpenTicketId(null)}
        // silent: refetch do board sem o spinner de loading — senão o kanban
        // atrás do modal "pisca" a cada interação feita no modal.
        onChange={() => fetchData({ silent: true })}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Coluna Kanban (droppable, contém SortableContext com cards)
// ─────────────────────────────────────────────────────────────────
function KanbanColumn({ status, cor, tickets, onCardClick, onCardAuxClick, podeArquivarLote, onArchiveAll }: {
  status: HelpdeskStatus
  cor: string
  tickets: Ticket[]
  onCardClick: (id: string) => void
  onCardAuxClick?: (id: string) => void
  podeArquivarLote?: boolean
  onArchiveAll?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Coluna ABERTA, como no /orcamentos e no /crm: largura fixa, sem caixa
        // cinza — os cards flutuam sobre o fundo da página. Só o alvo do arrasto
        // ganha um véu sutil. A coluna elástica anterior mudava de largura
        // conforme a quantidade de status visíveis.
        'flex h-full w-[340px] shrink-0 flex-col rounded-xl transition-colors',
        isOver && 'bg-black/[0.03] dark:bg-white/[0.04]',
      )}
      style={isOver ? { boxShadow: `0 0 0 2px ${cor}55` } : undefined}
    >
      {/* Header: dot da cor + nome + contador em pill tintada + ações */}
      <div className="flex items-center justify-between gap-2 px-1.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-sm font-semibold truncate">{HELPDESK_STATUS_LABELS[status]}</span>
          <span
            className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold text-white shrink-0"
            style={{ backgroundColor: cor }}
          >
            {tickets.length}
          </span>
        </div>
        <div className="flex items-center gap-0.5 sm:shrink-0">
          {podeArquivarLote && tickets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Opções da coluna"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onArchiveAll}>
                  <Archive className="h-4 w-4 mr-2" />
                  Arquivar os {tickets.length} desta coluna
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <div className="nice-scrollbar min-h-[120px] flex-1 space-y-2 overflow-y-auto px-1.5 pb-2">
        <SortableContext items={tickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 italic">Vazio</p>
          ) : tickets.map(t => (
            <SortableCard
              key={t.id}
              ticket={t}
              cor={cor}
              onClick={() => onCardClick(t.id)}
              onAuxClick={onCardAuxClick ? () => onCardAuxClick(t.id) : undefined}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

function SortableCard({ ticket, cor, onClick, onAuxClick }: { ticket: Ticket; cor: string; onClick: () => void; onAuxClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      // Botão do meio (scroll wheel) → abre o ticket em nova aba do navegador.
      // onAuxClick dispara pra qualquer botão não-primário; filtro por button===1.
      onAuxClick={onAuxClick ? (e) => { if (e.button === 1) { e.preventDefault(); onAuxClick() } } : undefined}
      // Previne o autoscroll do botão do meio (cursor de scroll) no Chromium/Firefox
      onMouseDown={onAuxClick ? (e) => { if (e.button === 1) e.preventDefault() } : undefined}
    >
      <KanbanCard ticket={ticket} cor={cor} />
    </div>
  )
}

/**
 * Overlay do card durante o drag — replica o efeito de "peso" do kanban
 * do CRM e dos orçamentos: simulador de mola-amortecedor que faz o card
 * inclinar levemente na direção do movimento (-8°..+8°), com damping 0.82
 * (perto do crítico) pra balançar UMA vez e estabilizar.
 *
 * Doc completo: docs/PADRAO_KANBAN_DND.md
 */
function KanbanCardOverlay({ ticket, cor, velocityX, width }: { ticket: Ticket; cor: string; velocityX: number; width?: number | null }) {
  const [rotation, setRotation] = useState(0)
  const rotRef = useRef(0)
  const angVelRef = useRef(0)
  const rafRef = useRef(0)
  const inputVelRef = useRef(0)

  useEffect(() => { inputVelRef.current = velocityX * 0.3 }, [velocityX])

  useEffect(() => {
    const tick = () => {
      angVelRef.current += inputVelRef.current * 0.06
      inputVelRef.current *= 0.3
      // mola puxa de volta pra 0
      angVelRef.current += -rotRef.current * 0.04
      // damping forte (0.82) — perto do crítico: card balança uma vez e estabiliza
      angVelRef.current *= 0.82
      rotRef.current += angVelRef.current
      rotRef.current = Math.max(-8, Math.min(8, rotRef.current))
      if (Math.abs(rotRef.current) < 0.02 && Math.abs(angVelRef.current) < 0.02) {
        rotRef.current = 0
        angVelRef.current = 0
      }
      setRotation(rotRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      // Largura dinâmica — vem do measurement no dragStart. Fallback 260px.
      style={{
        width: width ?? 260,
        transform: `rotate(${rotation.toFixed(2)}deg) scale(1.02)`,
        transformOrigin: 'top center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
      }}
    >
      <KanbanCard ticket={ticket} cor={cor} dragging />
    </div>
  )
}

function KanbanCard({ ticket, cor, dragging = false }: { ticket: Ticket; cor: string; dragging?: boolean }) {
  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const corPrioridade = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]
  const prazoAtrasado = ticket.prazoSla && new Date(ticket.prazoSla).getTime() < Date.now()
    && !['CONCLUIDO', 'CANCELADO', 'RESOLVIDO'].includes(ticket.status)
  const temCapa = !!ticket.capa
  // Quando o ticket tem capa, a imagem fica acima da barra colorida (modelo
  // de cards visuais — Hero/Trello). Quando não tem, a barra fica grossa no
  // topo do card (modelo simples — Landing page).
  return (
    <div
      className={cn(
        // Card escuro um pouco mais preto que o bg-card global, pra destacar sobre
        // o overlay sutil da coluna no dark.
        // cursor-pointer indica "clicável" (ação primária = abrir ticket).
        // O drag continua funcionando mesmo com pointer — só muda a aparência.
        'rounded-md bg-white dark:bg-[#1f242e] cursor-pointer group overflow-hidden border border-border/50 relative',
        dragging ? 'shadow-lg' : 'hover:shadow-md transition-shadow',
        // Solicitante respondeu — destaca o card (bola do lado do agente).
        ticket.aguardandoResposta && 'ring-2 ring-cyan-400 dark:ring-cyan-500 border-cyan-400/50 shadow-[0_0_0_3px] shadow-cyan-400/15',
      )}
    >
      {/* Selo "nova resposta" — solicitante respondeu, aguarda o agente */}
      {ticket.aguardandoResposta && (
        <div className="absolute top-1.5 right-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-cyan-500 text-white text-[9px] font-semibold px-1.5 py-0.5 shadow-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/80 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          Respondeu
        </div>
      )}

      {/* Capa (opcional) — primeira imagem anexada, com padding e cantos arredondados */}
      {temCapa && (
        <div className="px-2 pt-2">
          <div className="relative w-full aspect-[16/9] bg-muted overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAssetUrl(ticket.capa!.fileUrl)}
              alt={ticket.capa!.fileName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
      )}
      {/* Barra colorida da coluna — ocupa 1/3 da largura, alinhada à esquerda */}
      <div
        className={cn('ml-2.5 w-1/3 rounded-full h-1.5', temCapa ? 'mt-2 mb-2' : 'mt-2.5 mb-2')}
        style={{ backgroundColor: cor }}
      />

      {/* Conteúdo */}
      <div className="px-2.5 pb-2 flex flex-col gap-1.5">
        {/* Linha 1: ticket# + prioridade + SLA atrasado */}
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{ticketNum}</span>
          <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: corPrioridade }}>
            {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
          </span>
          {prazoAtrasado && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] text-rose-600 font-semibold">
              <AlertTriangle className="h-2.5 w-2.5" /> SLA
            </span>
          )}
        </div>

        {/* Linha 2: título — com ícone de check à esquerda como nos modelos */}
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 mt-[1px] text-muted-foreground/70 shrink-0" />
          <p className="text-[12px] font-semibold leading-tight line-clamp-2 flex-1">{ticket.titulo}</p>
        </div>

        {/* Linha 3: tag de categoria (estilo pill colorida, igual ao 'Illustration' do modelo) */}
        {ticket.categoria && (
          <div>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-white rounded-full px-2 py-0.5"
              style={{ backgroundColor: ticket.categoria.cor || '#5ea3cb' }}
            >
              {ticket.categoria.nome}
            </span>
          </div>
        )}

        {/* Linha 4 (rodapé): avatar do responsável (+ nome) à esquerda · indicadores à direita.
            Padding maior + tipos um pouco maiores pra melhorar legibilidade — antes ficava
            apertado e com fontes 9-10px que cansavam a vista. */}
        <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-border/40">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {/* Avatar group horizontal, sobreposto (frente→trás, da direita p/ a
                esquerda): solicitante ATRÁS à esquerda, peeking — nome em tooltip
                no hover (que o traz pra frente + zoom); responsável na FRENTE à
                direita, com o nome ao lado (como antes). O tooltip é portalizado
                (não é cortado pelo overflow-hidden do card). Sem responsável, só o
                solicitante aparece. */}
            <div className="flex items-center shrink-0">
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative z-0 rounded-full ring-2 ring-card transition-transform duration-150 hover:z-20 hover:scale-110">
                      <UserAvatar user={ticket.solicitante} bg="bg-slate-400" className="h-6 w-6 text-[10px]" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">Solicitante: {ticket.solicitante?.name ?? '—'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {ticket.responsavel && (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative z-10 -ml-2.5 rounded-full ring-2 ring-card transition-transform duration-150 hover:z-20 hover:scale-110">
                        <UserAvatar user={ticket.responsavel} bg="bg-[#5ea3cb]" className="h-6 w-6 text-[10px]" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top">Responsável: {ticket.responsavel.name}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <span className="text-[12px] text-muted-foreground truncate min-w-0">
              {ticket.responsavel?.name || ticket.solicitante?.name || 'Não atribuído'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground shrink-0">
            {/* Score da triagem IA (#HLP0083). Violeta = atingiu threshold ou
                tem plano; cinza = não-elegível. Tooltip via title detalha. */}
            {ticket.aiScore != null && <ScoreIaBadge ticket={ticket} />}
            {ticket._count.anexos > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="h-3.5 w-3.5" /> {ticket._count.anexos}
              </span>
            )}
            {ticket._count.mensagens > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-3.5 w-3.5" /> {ticket._count.mensagens}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Badge minúscula com o score IA do ticket (#HLP0083). Cor reflete elegibilidade:
 *  - violeta: elegível (atingiu o threshold) — IA chamou a API e gerou plano
 *  - cinza: não-elegível — score baixo, ticket não consumiu crédito
 */
function ScoreIaBadge({ ticket }: { ticket: Ticket }) {
  const elegivel = ticket.aiElegivel === true || !!ticket.aiPlanoStatus
  const title = elegivel
    ? `IA: score ${ticket.aiScore}${ticket.aiPlanoStatus ? ' · plano ' + ticket.aiPlanoStatus : ' · elegível'}`
    : `IA: score ${ticket.aiScore} (abaixo do threshold — não chamou API)`
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
        elegivel
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
          : 'bg-muted text-muted-foreground/70',
      )}
    >
      <Bot className="h-3 w-3" />
      {ticket.aiScore}
    </span>
  )
}

function TicketRow({ ticket, onUnarchive, onArchive, currentUserId, onCancelar, onOpen, highlight }: {
  ticket: Ticket
  onUnarchive?: () => void
  /** Arquivar pelo kebab — só passado p/ agente e só nas etapas finais. */
  onArchive?: () => void
  /** Id do usuário logado — habilita o cancelar quando ele é o solicitante (#HLP0172). */
  currentUserId?: string | null
  onCancelar?: (t: Ticket) => void
  /** Clique esquerdo simples abre o modal de detalhes (como no kanban). */
  onOpen?: (id: string) => void
  /** Destaca a linha (ex.: ticket recém-desarquivado). */
  highlight?: boolean
}) {
  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  // #HLP0172: regra vem de @saas/types — mesma fonte que o backend impõe e que
  // a página do chamado consulta.
  const podeCancelar = !!onCancelar && solicitantePodeCancelar({
    status: ticket.status,
    solicitanteId: ticket.solicitante?.id,
    userId: currentUserId,
  })
  // O próprio solicitante precisa avaliar este chamado resolvido? → CTA "Avaliar".
  const precisaCsat = ticket.status === 'RESOLVIDO' && !ticket.csatRespondidoEm && ticket.solicitante?.id === currentUserId
  return (
    <div
      id={`hlp-row-${ticket.id}`}
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 group transition-colors',
        highlight
          ? 'bg-slate-200/70 dark:bg-slate-700/40 ring-1 ring-inset ring-slate-300 dark:ring-slate-600'
          : precisaCsat
          ? 'bg-emerald-50/40 dark:bg-emerald-900/10 hover:bg-emerald-50/70 dark:hover:bg-emerald-900/20'
          : 'hover:bg-muted/30',
      )}
    >
      {/* Link esticado cobre a linha. Clique esquerdo simples → modal de detalhes
          (como no kanban); Ctrl/⌘+clique, botão do meio e "abrir em nova aba"
          abrem a PÁGINA COMPLETA em nova aba. target="_blank": as vias de nova
          aba já vão pro href, e o RouteProgress global (que intercepta <a> no
          capture) IGNORA âncoras _blank — sem ele, o clique-esquerdo (que
          abrimos via preventDefault) deixava a barra de progresso presa. */}
      <Link
        href={`/helpdesk/${ticket.id}`}
        aria-label={`Abrir ${ticketNum}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute inset-0 z-0"
        onClick={e => {
          if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          onOpen(ticket.id)
        }}
      />
      {/* Barra vertical = cor do STATUS */}
      <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: STATUS_COR[ticket.status] }} />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{ticketNum}</span>
          <Badge variant="outline" className="text-[10px] h-5 gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COR[ticket.status] }} />
            {HELPDESK_STATUS_LABELS[ticket.status]}
          </Badge>
          {precisaCsat && (
            <Badge className="relative z-10 h-5 gap-1 bg-emerald-600 text-[10px] text-white hover:bg-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Avaliar
            </Badge>
          )}
          {/* Prioridade — texto ao lado do status; só o valor colorido (como no kanban) */}
          <span className="text-[10px] text-muted-foreground">
            Prioridade: <span className="font-medium uppercase tracking-wider" style={{ color: HELPDESK_PRIORIDADE_COLORS[ticket.prioridade] }}>{HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}</span>
          </span>
        </div>
        <p className="text-sm font-semibold truncate">{ticket.titulo}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>Solicitante: {ticket.solicitante?.name || '—'}</span>
          {ticket.responsavel && <span>· Responsável: {ticket.responsavel.name}</span>}
          {ticket._count.mensagens > 0 && (
            <span>· <MessageSquare className="inline h-3 w-3" /> {ticket._count.mensagens}</span>
          )}
          {ticket.categoria && (
            <span className="inline-flex items-center gap-1">
              <span>·</span>
              {ticket.categoria.cor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ticket.categoria.cor }} />}
              <span>{ticket.categoria.nome}</span>
            </span>
          )}
        </div>
      </div>
      {onUnarchive && (
        <Button
          variant="outline" size="sm"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onUnarchive() }}
          className="relative z-10 h-7 gap-1 text-[11px] shrink-0"
          title="Desarquivar ticket"
        >
          <Archive className="h-3 w-3 rotate-180" />
          Desarquivar
        </Button>
      )}
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
        {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
      </span>
      {/* Kebab de ações, à direita da data. z-10 + stopPropagation: precisa ficar
          ACIMA do <Link> esticado que cobre a linha, senão o clique abriria o
          chamado em vez de abrir o menu. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost" size="sm"
            onClick={e => { e.preventDefault(); e.stopPropagation() }}
            className="relative z-10 h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-foreground"
            title="Ações"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/helpdesk/${ticket.id}`} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir em nova aba
            </Link>
          </DropdownMenuItem>
          {podeCancelar && (
            <DropdownMenuItem
              onClick={() => onCancelar!(ticket)}
              className="gap-2 text-rose-600 focus:text-rose-600"
            >
              <XCircle className="h-3.5 w-3.5" />
              Cancelar
            </DropdownMenuItem>
          )}
          {/* Arquivar — só agente (onArchive vem gateado por podeAtuar) e só nas
              etapas finais (mesma regra do detalhe/backend). Arquivados nunca
              recebem onArchive, então não reaparece lá. */}
          {onArchive && !ticket.arquivado && helpdeskPodeArquivar(ticket.status) && (
            <DropdownMenuItem onClick={() => onArchive()} className="gap-2">
              <Archive className="h-3.5 w-3.5" />
              Arquivar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Quadro de tickets da visão de lista (#HLP0318). Card com header (título +
 * contagem) e a lista de TicketRow. Usado duas vezes: "Ativos" no topo e
 * "Arquivados" embaixo (variante `arquivado` = header âmbar + linhas suaves),
 * pra que colaboradores como a Erica vejam também os tickets já arquivados.
 */
function TicketPanel({ titulo, icon: Icon, tickets, vazio, arquivado = false, currentUserId, onCancelar, onOpen, onUnarchive, onArchive, highlightId }: {
  titulo: string
  icon: typeof Inbox
  tickets: Ticket[]
  vazio: string
  arquivado?: boolean
  currentUserId?: string | null
  onCancelar?: (t: Ticket) => void
  onOpen?: (id: string) => void
  onUnarchive?: (t: Ticket) => void
  onArchive?: (t: Ticket) => void
  highlightId?: string | null
}) {
  return (
    <Card className="overflow-hidden flex flex-col shrink-0">
      <div className={cn(
        'flex items-center gap-2 px-4 py-2.5 border-b border-border',
        arquivado ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-muted/30',
      )}>
        <Icon className={cn('h-4 w-4', arquivado ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')} />
        <span className={cn('text-sm font-semibold', arquivado && 'text-amber-800 dark:text-amber-300')}>{titulo}</span>
        <span className={cn(
          'inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold',
          arquivado ? 'bg-amber-500 text-white' : 'bg-muted text-muted-foreground',
        )}>
          {tickets.length}
        </span>
      </div>
      {tickets.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">{vazio}</p>
      ) : (
        <div className={cn('divide-y divide-border/60', arquivado && 'opacity-80')}>
          {tickets.map(t => (
            <TicketRow key={t.id} ticket={t} currentUserId={currentUserId} onCancelar={onCancelar} onOpen={onOpen} onUnarchive={onUnarchive ? () => onUnarchive(t) : undefined} onArchive={onArchive ? () => onArchive(t) : undefined} highlight={t.id === highlightId} />
          ))}
        </div>
      )}
    </Card>
  )
}
