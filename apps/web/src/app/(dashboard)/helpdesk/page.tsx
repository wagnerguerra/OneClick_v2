'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import {
  Plus, Loader2, Search, AlertTriangle, MessageSquare,
  CheckCircle2, LayoutGrid, List as ListIcon, Inbox, Settings, Archive,
  Paperclip, Bot, BarChart3, XCircle, MoreVertical, ExternalLink, X, FilterX, SlidersHorizontal,
  ListChecks, Bug, ClipboardList, HelpCircle, Lightbulb, Flag, Tag, Layers, UserCog, Clock,
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
import { TEXT, SURFACE } from '@/lib/color-styles'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import { AvatarPequeno, DicaIcone, LinhaCard } from '@/components/kanban/card-partes'
import { USER_PERMISSIONS_REFRESH_EVENT } from '@/hooks/use-user-permissions'
import { useSession } from '@/lib/auth-client'
import {
  HELPDESK_STATUS, HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE, HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_PRIORIDADE_COLORS, HELPDESK_TIPO_LABELS,
  solicitantePodeCancelar, helpdeskPodeArquivar,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'
import { NovoTicketModal } from './_components/novo-ticket-modal'
import { TicketDetalheCompletoSheet } from './_components/ticket-detalhe-completo-sheet'
import { HELPDESK_STATUS_COR } from './_lib/status-styles'

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
  /**
   * Checklist do serviço vinculado ao chamado (#HLP0396). Nulo = chamado sem
   * roteiro. Só a contagem: o card mostra o progresso, o conteúdo vive na aba
   * Checklist do detalhe.
   */
  checklist?: { passosTotal: number; passosFechados: number } | null
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
      destructive: true,
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
      <PageHeaderBar className="mb-0 sm:mb-0 shrink-0" actions={<>
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
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none bg-primary text-primary-foreground">{filtrosAtivos}</span>
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
            className="gap-1.5"
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
            <span className={TEXT.amber}>Arquivados</span>
          </>)}
        </p>
      </PageHeaderBar>


      {/* Painel de filtros — abre e fecha como o do /orcamentos */}
      <div
        className="grid shrink-0 transition-all duration-[250ms] ease-[cubic-bezier(.16,1,.3,1)] motion-reduce:transition-none"
        style={{
          gridTemplateRows: filtrosOpen ? '1fr' : '0fr',
          opacity: filtrosOpen ? 1 : 0,
          // Fechado, o painel tem altura zero — mas continua sendo filho do
          // `flex-col gap-5`, e o gap sozinho deixava 20px de vão entre o
          // título e o kanban. A margem negativa anula o gap, como no
          // /orcamentos.
          marginBottom: filtrosOpen ? 0 : '-1.25rem',
        }}
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
        <div className={cn('flex items-center justify-between gap-3 rounded-md border px-3 py-2 shrink-0', SURFACE.amber)}>
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
        <TooltipProvider delayDuration={200}>
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
        </TooltipProvider>
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

/** Ícone por tipo de ticket — ocupa o lugar da logo no cabeçalho do card. */
const TIPO_ICONE: Record<Ticket['tipo'], typeof Bug> = {
  INCIDENTE: Bug,
  REQUISICAO: ClipboardList,
  DUVIDA: HelpCircle,
  MELHORIA: Lightbulb,
}

/**
 * SLA do ticket no relógio do rodapé: tempo que falta (ou que passou) até o
 * prazo. Vencendo = menos de 24h. Sem prazo, ou ticket encerrado: nada.
 */
function slaDoTicket(ticket: Ticket): { curto: string; cor: string; titulo: string; texto: string; estado: 'ok' | 'vencendo' | 'vencido' } | null {
  if (!ticket.prazoSla || ['CONCLUIDO', 'CANCELADO', 'RESOLVIDO'].includes(ticket.status)) return null
  const prazo = new Date(ticket.prazoSla)
  const diff = prazo.getTime() - Date.now()
  const abs = Math.abs(diff)
  const horas = Math.floor(abs / 3600000)
  const tempo = horas >= 24 ? `${Math.floor(horas / 24)}d` : horas >= 1 ? `${horas}h` : `${Math.max(1, Math.floor(abs / 60000))}min`
  const quando = prazo.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  if (diff < 0) return { curto: `vencido ${tempo}`, cor: cn(TEXT.rose, 'font-semibold'), titulo: 'SLA vencido', texto: `Prazo era ${quando}.`, estado: 'vencido' }
  if (diff < 24 * 3600000) return { curto: tempo, cor: TEXT.amber, titulo: 'SLA vencendo', texto: `Prazo: ${quando}.`, estado: 'vencendo' }
  return { curto: tempo, cor: 'text-muted-foreground', titulo: 'Dentro do SLA', texto: `Prazo: ${quando}.`, estado: 'ok' }
}

function KanbanCard({ ticket, cor, dragging = false }: { ticket: Ticket; cor: string; dragging?: boolean }) {
  void cor // a cor da coluna já aparece no cabeçalho da coluna
  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const corPrioridade = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]
  const sla = slaDoTicket(ticket)
  const IconeTipo = TIPO_ICONE[ticket.tipo] ?? Inbox

  // Badge informativo: o que pede atenção, do mais urgente ao menos.
  const avisos: Array<{ curto: string; label: string; detalhe?: string; Icon: typeof Bug; cor: string }> = []
  if (ticket.aguardandoResposta) avisos.push({ curto: 'Respondeu', label: 'Solicitante respondeu', detalhe: 'Aguardando o agente', Icon: MessageSquare, cor: 'var(--color-primary-on-surface)' })
  if (sla?.estado === 'vencido') avisos.push({ curto: 'SLA vencido', label: 'SLA vencido', detalhe: sla.texto, Icon: AlertTriangle, cor: '#e11d48' })
  else if (sla?.estado === 'vencendo') avisos.push({ curto: 'SLA vencendo', label: 'SLA vencendo', detalhe: sla.texto, Icon: Clock, cor: '#d97706' })
  if (ticket.prioridade === 'URGENTE' || ticket.prioridade === 'ALTA') {
    avisos.push({ curto: HELPDESK_PRIORIDADE_LABELS[ticket.prioridade], label: `Prioridade ${HELPDESK_PRIORIDADE_LABELS[ticket.prioridade].toLowerCase()}`, Icon: Flag, cor: corPrioridade })
  }
  const aviso = avisos[0] ?? null

  return (
    <div
      className={cn(
        // cursor-pointer indica "clicável" (ação primária = abrir ticket); o
        // drag continua funcionando.
        'group relative cursor-pointer overflow-hidden rounded-md border border-border/60 bg-white dark:bg-card',
        dragging && 'shadow-lg',
        // Solicitante respondeu — anel na primária (a vez é do agente).
        ticket.aguardandoResposta && 'border-primary/60 ring-2 ring-primary',
      )}
    >
      {/* Cabeçalho — tipo + título; nº do ticket e badge informativo à direita */}
      <div className="flex items-center gap-2 border-b border-dashed border-border px-3 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" title={HELPDESK_TIPO_LABELS[ticket.tipo]}>
          <IconeTipo className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <DicaIcone titulo={ticket.titulo} texto={`${HELPDESK_TIPO_LABELS[ticket.tipo]} · aberto em ${new Date(ticket.createdAt).toLocaleDateString('pt-BR')}`}>
          <span className="min-w-0 flex-1 cursor-help truncate text-[13px] font-semibold">{ticket.titulo}</span>
        </DicaIcone>
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground/80">{ticketNum}</span>
          {aviso && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex max-w-[110px] cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                  // Cor inline (fundo = a cor com ~10% de alfa): em classe, o vermelho sofre o retint do módulo.
                  // color-mix em vez de sufixo hex de alfa: aceita tanto hex quanto var (o "Respondeu" é a primária).
                  style={{ backgroundColor: `color-mix(in srgb, ${aviso.cor} 10%, transparent)`, color: aviso.cor }}
                  onClick={e => e.stopPropagation()}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <aviso.Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                  <span className="truncate">{aviso.curto}</span>
                  {avisos.length > 1 && <span className="shrink-0 opacity-70">+{avisos.length - 1}</span>}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" sideOffset={6} className="tooltip-fade max-w-[280px] text-[11px]">
                <div className="space-y-1.5">
                  {avisos.map(a => (
                    <div key={a.label}>
                      <p className="flex items-center gap-1 font-semibold"><a.Icon className="h-3 w-3 shrink-0" /> {a.label}</p>
                      {a.detalhe && <p>{a.detalhe}</p>}
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Capa (opcional) — primeira imagem anexada */}
      {ticket.capa && (
        <div className="px-3 pt-2.5">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-md bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveAssetUrl(ticket.capa.fileUrl)} alt={ticket.capa.fileName} className="h-full w-full object-cover" loading="lazy" />
          </div>
        </div>
      )}

      {/* Corpo — uma informação por linha, cada uma com seu ícone */}
      <div className="space-y-1.5 px-3 py-2.5 text-[12px] text-foreground/85">
        {ticket.categoria && (
          <LinhaCard icone={Tag}>
            <span className="inline-flex max-w-full items-center truncate rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ backgroundColor: ticket.categoria.cor || '#5ea3cb' }}>
              {ticket.categoria.nome}
            </span>
          </LinhaCard>
        )}
        {ticket.area && (
          <LinhaCard icone={Layers}>
            <span className="truncate">{ticket.area.name}</span>
          </LinhaCard>
        )}
        <LinhaCard icone={Flag}>
          <span className="font-medium" style={{ color: corPrioridade }}>{HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}</span>
          <span className="text-muted-foreground">· {HELPDESK_TIPO_LABELS[ticket.tipo]}</span>
        </LinhaCard>
        {ticket.solicitante && (
          <div className="flex min-w-0 items-center gap-2">
            <AvatarPequeno user={ticket.solicitante} />
            <span className="truncate">{ticket.solicitante.name}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">solicitante</span>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-2">
          {ticket.responsavel ? <AvatarPequeno user={ticket.responsavel} /> : <UserCog className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
          <span className={cn('truncate', !ticket.responsavel && 'text-muted-foreground')}>{ticket.responsavel?.name ?? 'Não atribuído'}</span>
          {ticket.responsavel && <span className="shrink-0 text-[11px] text-muted-foreground">responsável</span>}
        </div>
      </div>

      {/* Rodapé — contadores à esquerda (só os que têm algo), SLA à direita */}
      <div className="flex items-center justify-between gap-2 border-t border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          {ticket.checklist && ticket.checklist.passosTotal > 0 && (
            <DicaIcone titulo={`Checklist ${ticket.checklist.passosFechados}/${ticket.checklist.passosTotal}`} texto="Passos concluídos do roteiro do serviço">
              <span className={cn('flex cursor-help items-center gap-1 tabular-nums', ticket.checklist.passosFechados >= ticket.checklist.passosTotal && TEXT.emerald)}>
                <ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} /> {ticket.checklist.passosFechados}/{ticket.checklist.passosTotal}
              </span>
            </DicaIcone>
          )}
          {ticket._count.anexos > 0 && (
            <DicaIcone titulo={`${ticket._count.anexos} ${ticket._count.anexos === 1 ? 'anexo' : 'anexos'}`} texto="Arquivos do ticket">
              <span className="flex cursor-help items-center gap-1"><Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} /> {ticket._count.anexos}</span>
            </DicaIcone>
          )}
          {ticket._count.mensagens > 0 && (
            <DicaIcone titulo={`${ticket._count.mensagens} ${ticket._count.mensagens === 1 ? 'mensagem' : 'mensagens'}`} texto="Conversa do ticket">
              <span className="flex cursor-help items-center gap-1"><MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} /> {ticket._count.mensagens}</span>
            </DicaIcone>
          )}
          {ticket.aiScore != null && <ScoreIaBadge ticket={ticket} />}
        </div>
        {sla ? (
          <DicaIcone titulo={sla.titulo} texto={sla.texto}>
            <span className={cn('flex shrink-0 cursor-help items-center gap-1 tabular-nums', sla.cor)}>
              <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> {sla.curto}
            </span>
          </DicaIcone>
        ) : (
          <DicaIcone titulo="Aberto" texto={`em ${new Date(ticket.createdAt).toLocaleDateString('pt-BR')}`}>
            <span className="flex shrink-0 cursor-help items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> {Math.max(0, Math.floor((Date.now() - new Date(ticket.createdAt).getTime()) / 86400000))}d
            </span>
          </DicaIcone>
        )}
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
              className={cn('gap-2 focus:text-rose-600 dark:focus:text-rose-400', TEXT.rose)}
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
        <Icon className={cn('h-4 w-4', arquivado ? TEXT.amber : 'text-muted-foreground')} />
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
