'use client'

import { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, CircleDollarSign, Loader2, Plus, MoreVertical, Copy, Archive, Trash2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown, ChevronsUpDown,
  Clock, LayoutGrid, List, Eye, Settings2, Package, BarChart3, Activity,
  MessageSquare, Paperclip, RotateCcw, Star, SlidersHorizontal, X,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Label, RichEditor,
} from '@saas/ui'
import { ClienteCombobox } from './_components/cliente-combobox'
import { UserCombobox } from './_components/user-combobox'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { FormasPagamentoModal } from '@/components/orcamento/formas-pagamento-modal'
import { DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent, type DragStartEvent, type DragOverEvent, type DragMoveEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl, getApiUrl } from '@/lib/api-url'
import { useUserPermissions } from '@/hooks/use-user-permissions'

// ============================================================
// Tipos e constantes
// ============================================================

import { isOrcamentoTransitionAllowed, ORCAMENTO_STATUS_LABELS, resolveOrcamentoScope, type OrcamentoScope } from '@saas/types'

const STATUS_ORDER = ['NOVO', 'A_ENVIAR', 'ENVIADO', 'APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO'] as const

const STATUS_COLORS: Record<string, string> = {
  NOVO: '#818cf8',
  A_ENVIAR: '#94a3b8',
  ENVIADO: '#3b82f6',
  APROVADO: '#10b981',
  LIBERADO: '#059669',
  FINALIZADO: '#1e293b',
  ENCERRADO: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  A_ENVIAR: 'A Enviar',
  ENVIADO: 'Enviado',
  APROVADO: 'Aprovado',
  LIBERADO: 'Liberado',
  FINALIZADO: 'Finalizado',
  ENCERRADO: 'Encerrado',
}

const PAGE_SIZES = [10, 20, 50]
const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

interface UserRef { id: string; name: string; image?: string | null }

interface OrcamentoRow {
  id: string
  numero: number
  status: string
  totalGeral: number
  valorTotal?: number
  clienteId: string | null
  responsavelId: string | null
  solicitanteId: string | null
  observacoes: string | null
  formaPagamento?: string | null
  responsavel?: UserRef | null
  solicitante?: UserRef | null
  itens?: Array<{ id: string; descricao: string; tipo: string }>
  /** Descrições de TODOS os itens, em ordem de inclusão — alimenta a prévia da
   *  coluna "Itens" (`itens` traz só os 2 primeiros, pro card do kanban). */
  itensDescricoes?: string[]
  /** Áreas derivadas dos serviços dos itens (#HLP0266) — calculadas no backend. */
  areas?: Array<{ id: string; nome: string }>
  _count?: { itens: number; mensagens: number; arquivos: number }
  pesquisaRespondida?: boolean
  createdAt: string
  updatedAt: string
  arquivado?: boolean
  // Datas dedicadas + validade — usadas para calcular prazo no card
  dtEnviado?: string | null
  dtAprovado?: string | null
  dtLiberado?: string | null
  dtFinalizado?: string | null
  dtEncerrado?: string | null
  validadeDias?: number | null
}

interface OrcConfig {
  diasEnviar: number
  diasAprovar: number
  diasRevisar: number
  validadeDias: number
}

const DEFAULT_CONFIG: OrcConfig = { diasEnviar: 7, diasAprovar: 15, diasRevisar: 7, validadeDias: 90 }

// Context para que o KanbanCardContent pegue config sem prop drilling
const OrcConfigContext = createContext<OrcConfig>(DEFAULT_CONFIG)

interface PrazoInfo {
  label: string  // texto curto pro card. ex: "3d p/ enviar", "vencido 2d"
  tooltip: string
  variant: 'ok' | 'warning' | 'danger' | 'neutral'
}

function calcularPrazoCard(orc: OrcamentoRow, config: OrcConfig): PrazoInfo {
  const HOJE = Date.now()
  const DIA_MS = 86400000

  const diasEntre = (a: number, b: number) => Math.floor((b - a) / DIA_MS)

  // Status finais — sem prazo ativo
  if (orc.status === 'ENCERRADO' || orc.status === 'FINALIZADO') {
    const dt = orc.dtEncerrado ?? orc.dtFinalizado ?? orc.updatedAt
    const dias = diasEntre(new Date(dt).getTime(), HOJE)
    return { label: `${dias}d`, tooltip: `Encerrado há ${dias} dia(s)`, variant: 'neutral' }
  }

  let deadline: number
  let acaoLabel: string
  let acaoTooltip: string

  if (orc.status === 'NOVO' || orc.status === 'A_ENVIAR') {
    // Prazo para enviar
    deadline = new Date(orc.createdAt).getTime() + config.diasEnviar * DIA_MS
    acaoLabel = 'p/ enviar'
    acaoTooltip = `Limite para envio: ${config.diasEnviar} dias após cadastro`
  } else if (orc.status === 'ENVIADO') {
    const base = orc.dtEnviado ? new Date(orc.dtEnviado).getTime() : new Date(orc.createdAt).getTime()
    deadline = base + config.diasAprovar * DIA_MS
    acaoLabel = 'p/ aprovação'
    acaoTooltip = `Limite para aprovação: ${config.diasAprovar} dias após envio`
  } else if (orc.status === 'EM_REVISAO') {
    const base = orc.dtEnviado ? new Date(orc.dtEnviado).getTime() : new Date(orc.createdAt).getTime()
    deadline = base + config.diasRevisar * DIA_MS
    acaoLabel = 'p/ revisão'
    acaoTooltip = `Limite para revisão: ${config.diasRevisar} dias`
  } else if (orc.status === 'APROVADO' || orc.status === 'LIBERADO') {
    // Validade do orçamento (após aprovação)
    const base = orc.dtAprovado ? new Date(orc.dtAprovado).getTime() : new Date(orc.createdAt).getTime()
    const validade = orc.validadeDias ?? config.validadeDias
    deadline = base + validade * DIA_MS
    acaoLabel = 'de validade'
    acaoTooltip = `Validade: ${validade} dias após aprovação`
  } else {
    const dias = diasEntre(new Date(orc.createdAt).getTime(), HOJE)
    return { label: `${dias}d`, tooltip: `${dias} dia(s) desde o cadastro`, variant: 'neutral' }
  }

  const restantes = Math.ceil((deadline - HOJE) / DIA_MS)

  if (restantes < 0) {
    const atraso = Math.abs(restantes)
    return {
      label: `vencido ${atraso}d`,
      tooltip: `${acaoTooltip}. Vencido há ${atraso} dia(s)`,
      variant: 'danger',
    }
  }
  if (restantes === 0) {
    return { label: 'vence hoje', tooltip: `${acaoTooltip}. Vence hoje!`, variant: 'danger' }
  }

  // Cor baseada na proporção do prazo restante
  const total = (deadline - new Date(orc.createdAt).getTime()) / DIA_MS
  const ratio = restantes / Math.max(total, 1)
  const variant: PrazoInfo['variant'] = ratio < 0.2 ? 'danger' : ratio < 0.5 ? 'warning' : 'ok'

  return {
    label: `${restantes}d ${acaoLabel}`,
    tooltip: `${acaoTooltip}. Restam ${restantes} dia(s)`,
    variant,
  }
}

// ============================================================
// Helpers
// ============================================================

function formatCurrency(v: number | null | undefined): string {
  if (v == null) return 'R$ 0,00'
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Remove tags HTML e converte entidades comuns. Itens e observações são editados
 *  via RichEditor (TipTap) e armazenados como HTML — em previews/cards mostramos
 *  só texto puro. Não usar onde formatação rica é desejável (ex: detalhe completo). */
function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#94a3b8'
  const label = STATUS_LABELS[status] || status
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white whitespace-nowrap" style={{ backgroundColor: color }}>
      {label}
    </span>
  )
}

// ============================================================
// Page
// ============================================================

export default function OrcamentosPage() {
  const router = useRouter()

  // Sub-permissoes do modulo orcamentos
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const orcPerm = permissions.find(p => p.moduleSlug === 'orcamentos')
  const subPerms = (orcPerm?.subPermissions ?? {}) as Record<string, boolean>
  const canViewIndicadores = isMaster || subPerms.panel_indicadores === true
  // Configurações do módulo + catálogo: master/empresa-master OU sub-permissão explícita
  const canManageConfig = isMaster || isEmpresaMaster || subPerms.acessar_configuracoes === true
  const canCadastroCompleto = isMaster || subPerms.cadastro_completo === true
  // Mover cards no kanban — só com sub-permissão explícita ou master
  const canMoverKanban = isMaster || subPerms.mover_kanban === true
  // panel_consultas: pagina de consultas ainda nao implementada (legado index-consulta.asp); flag pronta para uso futuro
  // Escopo de listagem — escolha ÚNICA gravada na permissão do usuário, com
  // 'proprios' como padrão e fallback (#HLP0266). Master/EmpresaMaster vê tudo.
  //
  // ⚠️ Isto é só para a UI (esconder filtros que não fazem sentido no escopo).
  // Quem decide o que volta do banco é o backend, que recalcula por conta
  // própria e ignora qualquer `scope` enviado daqui.
  const listScope: OrcamentoScope = isMaster ? 'todos' : resolveOrcamentoScope(subPerms)
  // No escopo "Para liberação do financeiro" a lista é sempre APROVADO +
  // LIBERADO (a liberar + já liberados) — o filtro de status livre não teria
  // efeito além desses dois e só confundiria, então fica escondido.
  const escopoFixaStatus = listScope === 'financeiro'
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [statusFilter, setStatusFilter] = useState('')
  const [arquivado, setArquivado] = useState(false)
  const [comReaberturas, setComReaberturas] = useState(false)
  // ── Painel de filtros (HLP0296) — espelha a lista do legado ──
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  // overflow do wrapper: hidden durante a animação (pra clipar), visible depois
  // de abrir (pra os dropdowns dos selects não serem cortados pelo container).
  const [filtrosOverflow, setFiltrosOverflow] = useState(false)
  const [numeroFilter, setNumeroFilter] = useState('')
  const [debouncedNumero, setDebouncedNumero] = useState('')
  const [dataInicial, setDataInicial] = useState('')
  const [dataFinal, setDataFinal] = useState('')
  const [clienteFilter, setClienteFilter] = useState('')
  const [servicoFilter, setServicoFilter] = useState('')
  const [solicitanteFilter, setSolicitanteFilter] = useState('')
  const [responsavelFilter, setResponsavelFilter] = useState('')
  const [incluirParalizados, setIncluirParalizados] = useState(true)
  const [servicosFiltro, setServicosFiltro] = useState<{ id: string; nome: string }[]>([])
  const [filtrosDataLoaded, setFiltrosDataLoaded] = useState(false)
  const filtrosAtivos = (
    (debouncedNumero.trim() ? 1 : 0) + (dataInicial ? 1 : 0) + (dataFinal ? 1 : 0) +
    (clienteFilter ? 1 : 0) + (servicoFilter ? 1 : 0) +
    (solicitanteFilter ? 1 : 0) + (responsavelFilter ? 1 : 0) +
    (!incluirParalizados ? 1 : 0)
  )
  function limparFiltros() {
    setNumeroFilter(''); setDataInicial(''); setDataFinal('')
    setClienteFilter(''); setServicoFilter('')
    setSolicitanteFilter(''); setResponsavelFilter('')
    setIncluirParalizados(true); setPage(1)
  }
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [clientesMap, setClientesMap] = useState<Map<string, { razaoSocial: string }>>(new Map())
  const [orcConfig, setOrcConfig] = useState<OrcConfig>(DEFAULT_CONFIG)
  const [viewMode, setViewMode] = useState<'tabela' | 'kanban'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('orcamentos-view-mode') as 'tabela' | 'kanban') || 'kanban'
    return 'kanban'
  })
  const [loading, setLoading] = useState(true)

  // Ordenação clicável (modo tabela) — campos diretos do orçamento (server-side)
  type OrcSortKey = 'numero' | 'status' | 'totalGeral' | 'createdAt'
  const [sort, setSort] = useState<{ key: OrcSortKey; dir: 'asc' | 'desc' } | null>(null)
  const toggleSort = (key: OrcSortKey) => {
    setSort(s => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(1)
  }

  // Colunas recolhidas (kanban) — persistido no localStorage
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('orcamentos-kanban-collapsed')
      if (saved) try { return new Set(JSON.parse(saved)) } catch { /* */ }
    }
    return new Set()
  })
  const persistCollapsed = (set: Set<string>) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orcamentos-kanban-collapsed', JSON.stringify([...set]))
    }
  }
  const toggleColumnCollapse = (status: string) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      persistCollapsed(next)
      return next
    })
  }
  const collapseAllColumns = () => {
    const next = new Set(STATUS_ORDER as readonly string[])
    setCollapsedColumns(next)
    persistCollapsed(next)
  }
  const expandAllColumns = () => {
    const next = new Set<string>()
    setCollapsedColumns(next)
    persistCollapsed(next)
  }
  const allCollapsed = collapsedColumns.size === STATUS_ORDER.length
  const allExpanded = collapsedColumns.size === 0

  // Drag and drop kanban
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const lastDragXRef = useRef(0)
  const kanbanSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const activeCard = activeCardId ? orcamentos.find(o => o.id === activeCardId) || null : null

  const handleKanbanDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string)
    setDragDeltaX(0)
    lastDragXRef.current = 0
  }

  const handleKanbanDragMove = (event: DragMoveEvent) => {
    const deltaX = event.delta.x - lastDragXRef.current
    lastDragXRef.current = event.delta.x
    setDragDeltaX(deltaX)
  }

  const handleKanbanDragOver = (event: DragOverEvent) => {
    const overId = event.over?.id as string | null
    if (!overId) { setOverColumnId(null); return }
    const isColumn = STATUS_ORDER.includes(overId as any)
    if (isColumn) { setOverColumnId(overId); return }
    const overOrc = orcamentos.find(o => o.id === overId)
    setOverColumnId(overOrc?.status || null)
  }

  const handleKanbanDragCancel = () => {
    setActiveCardId(null)
    setOverColumnId(null)
  }

  const handleKanbanDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveCardId(null)
    setOverColumnId(null)
    if (!over) return
    // Defesa em profundidade: bloqueia o drop se o user não tem permissão
    // (sensores também são desabilitados, mas mantém defesa caso alguém burle).
    if (!canMoverKanban) {
      alerts.warning('Sem permissão', 'Você não tem permissão para mover cards no kanban.')
      return
    }

    const cardId = active.id as string
    const overId = over.id as string

    const isColumn = STATUS_ORDER.includes(overId as any)
    let targetStatus: string
    if (isColumn) {
      targetStatus = overId
    } else {
      const overOrc = orcamentos.find(o => o.id === overId)
      if (!overOrc) return
      targetStatus = overOrc.status
    }

    const card = orcamentos.find(o => o.id === cardId)
    if (!card) return

    const sameColumn = card.status === targetStatus

    if (sameColumn) {
      // Reordenar dentro da mesma coluna
      const columnOrcs = orcamentos.filter(o => o.status === targetStatus)
      const oldIndex = columnOrcs.findIndex(o => o.id === cardId)
      const newIndex = isColumn ? columnOrcs.length - 1 : columnOrcs.findIndex(o => o.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(columnOrcs, oldIndex, newIndex)
      setOrcamentos(prev => {
        const others = prev.filter(o => o.status !== targetStatus)
        return [...others, ...reordered]
      })
      try {
        await (trpc.orcamento as any).reordenar.mutate({ ids: reordered.map(o => o.id) })
      } catch {
        fetchData(true)
      }
    } else {
      // ── Guard: bloquear regressões antes de chamar API ──
      // O backend também valida (defesa em profundidade), mas a checagem aqui
      // dá feedback imediato sem flash de UI optimistic + rollback.
      if (!isOrcamentoTransitionAllowed(card.status, targetStatus)) {
        const labelDe = ORCAMENTO_STATUS_LABELS[card.status as keyof typeof ORCAMENTO_STATUS_LABELS] || card.status
        const labelPara = ORCAMENTO_STATUS_LABELS[targetStatus as keyof typeof ORCAMENTO_STATUS_LABELS] || targetStatus
        alerts.warning(
          'Movimento não permitido',
          `Não é possível mover de "${labelDe}" para "${labelPara}". Para voltar a status anteriores, abra o orçamento e use a opção "Reabrir orçamento" no menu de ações.`,
        )
        return
      }

      // ── Guard: orçamento sem itens não pode ir para ENVIADO ──
      // Backend também valida, mas verificamos aqui para evitar flash de optimistic update.
      if (targetStatus === 'ENVIADO' && (card._count?.itens ?? 0) === 0) {
        alerts.warning(
          'Orçamento sem itens',
          'Não é possível enviar um orçamento sem itens. Abra o orçamento e adicione ao menos um serviço, taxa ou despesa antes de mover para "Enviado".',
        )
        return
      }

      // Ao mover para ENVIADO, perguntar se notifica o cliente por e-mail (decisão do operador).
      let notificarCliente = true
      if (targetStatus === 'ENVIADO') {
        // #HLP0258: avisar quando o orçamento não tem forma de pagamento definida
        // (o operador pode enviar assim mesmo, mas é alertado antes).
        const semFormaPgto = !((card.formaPagamento ?? '').trim())
        const avisoFormaPgto = semFormaPgto
          ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:10px 12px;margin:0 0 14px;color:#92400e;font-size:13px;text-align:left">⚠️ <b>Sem forma de pagamento definida.</b> Você pode enviar assim mesmo, mas recomendamos definir antes (abra o orçamento → aba <b>Desconto e Pagamento</b>).</div>`
          : ''
        const r = await alerts.custom({
          title: 'Mover para Enviado',
          icon: semFormaPgto ? 'warning' : 'question',
          html: `${avisoFormaPgto}<p style="margin:0 0 14px">Confirmar a mudança do orçamento para <b>Enviado</b>.</p>
                 <label style="display:flex;align-items:center;gap:8px;justify-content:center;font-size:14px;cursor:pointer">
                   <input type="checkbox" id="swal-notificar-cli" checked style="width:16px;height:16px"> Notificar o cliente por e-mail
                 </label>`,
          confirmButtonText: semFormaPgto ? 'Enviar mesmo assim' : 'Confirmar',
          preConfirm: () => (document.getElementById('swal-notificar-cli') as HTMLInputElement)?.checked ?? true,
        })
        if (!r.isConfirmed) return // cancelou → não move
        notificarCliente = r.value !== false
      }

      // Mover para outro status (optimistic update + rollback em caso de erro)
      setOrcamentos(prev => prev.map(o => o.id === cardId ? { ...o, status: targetStatus } : o))
      try {
        await (trpc.orcamento as any).changeStatus.mutate({ id: cardId, status: targetStatus, viaKanban: true, notificarCliente })
        await fetchData(true)
      } catch (e) {
        alerts.error('Erro', (e as Error).message)
        fetchData(true)
      }
    }
  }

  // Create modal — espelha o legado crp_orcamentos/modal-create-orc.asp
  const [createOpen, setCreateOpen] = useState(false)
  const [formasModal, setFormasModal] = useState(false)
  // Catálogo de formas de pagamento — alimenta o dropdown do modal de criar.
  const [formasCatalogo, setFormasCatalogo] = useState<Array<{ id: string; valor: string; ordem: number }>>([])
  const loadFormasCatalogo = useCallback(async () => {
    try { setFormasCatalogo((await (trpc.orcamento as any).listFormasPagamento.query()) || []) } catch { /* sem permissão no módulo */ }
  }, [])
  useEffect(() => { void loadFormasCatalogo() }, [loadFormasCatalogo])
  const [clientes, setClientes] = useState<{ id: string; razaoSocial: string; documento?: string | null }[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([])
  const [creating, setCreating] = useState(false)
  const FORM_INITIAL = {
    clienteId: '',
    contatos: '',
    emailsContatos: '',
    formaPagamento: '',
    tipo: 'SERVICO_MENSAL',
    responsavelId: '',
    validadeDias: '90',
    descontoPct: '',
    descontoValor: '',
    observacoes: '',
    textoInterno: '',
  }
  const [form, setForm] = useState(FORM_INITIAL)

  useEffect(() => { const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])
  useEffect(() => { const t = setTimeout(() => { setDebouncedNumero(numeroFilter); setPage(1) }, 400); return () => clearTimeout(t) }, [numeroFilter])

  // Libera overflow visível só depois que a animação de abrir termina (~300ms).
  useEffect(() => {
    if (!filtrosOpen) { setFiltrosOverflow(false); return }
    const t = setTimeout(() => setFiltrosOverflow(true), 320)
    return () => clearTimeout(t)
  }, [filtrosOpen])

  // Carrega os dados dos selects do painel de filtros na 1ª vez que ele abre.
  useEffect(() => {
    if (!filtrosOpen || filtrosDataLoaded) return
    void (async () => {
      try {
        const [cls, usrs, svs] = await Promise.all([
          (trpc.cliente as any).listForSelect.query(),
          (trpc.orcamento as any).listUsuarios.query(),
          (trpc.orcamento as any).listServicosParaFiltro.query(),
        ])
        setClientes(cls); setUsuarios(usrs); setServicosFiltro(svs)
        setFiltrosDataLoaded(true)
      } catch { /* mantém vazio; tenta de novo na próxima abertura */ }
    })()
  }, [filtrosOpen, filtrosDataLoaded])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const input: Record<string, unknown> = { page, limit: viewMode === 'kanban' ? 100 : limit, search: debouncedSearch || undefined, arquivado, scope: listScope }
      if (statusFilter) input.status = statusFilter
      if (comReaberturas) input.comReaberturas = true
      // Painel de filtros (HLP0296)
      if (debouncedNumero.trim()) { const n = parseInt(debouncedNumero.replace(/\D/g, ''), 10); if (n > 0) input.numero = n }
      if (dataInicial) input.dataInicial = dataInicial
      if (dataFinal) input.dataFinal = dataFinal
      if (clienteFilter) input.clienteId = clienteFilter
      if (servicoFilter) input.servicoId = servicoFilter
      if (solicitanteFilter) input.solicitanteId = solicitanteFilter
      if (responsavelFilter) input.responsavelId = responsavelFilter
      if (!incluirParalizados) input.incluirParalizados = false
      if (viewMode === 'tabela' && sort) { input.sortKey = sort.key; input.sortDir = sort.dir }
      const result = await (trpc.orcamento as any).list.query(input)
      setOrcamentos(result.data)
      setTotal(result.total)
      setTotalPages(result.totalPages)

      // Buscar nomes dos clientes
      const clienteIds = [...new Set(result.data.map((o: OrcamentoRow) => o.clienteId).filter(Boolean))] as string[]
      if (clienteIds.length > 0) {
        try {
          const cls = await (trpc.cliente as any).listForSelect.query()
          const map = new Map<string, { razaoSocial: string }>()
          for (const c of cls) map.set(c.id, { razaoSocial: c.razaoSocial })
          setClientesMap(map)
        } catch { /* */ }
      }
    } catch {
      if (!silent) alerts.error('Erro', 'Falha ao carregar orçamentos')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, limit, debouncedSearch, statusFilter, arquivado, comReaberturas, viewMode, listScope, sort,
      debouncedNumero, dataInicial, dataFinal, clienteFilter, servicoFilter, solicitanteFilter, responsavelFilter, incluirParalizados])

  useEffect(() => { fetchData() }, [fetchData])

  // SSE — refetch silencioso quando qualquer outro cliente cria/move/edita um
  // orçamento (changeStatus, paralisar, retomar, reabrir, duplicar, arquivar,
  // delete). Filtra apenas eventos do tipo `kanban` (mudanças visíveis no
  // grid/lista). Ignora `dados-gerais` e `itens` — esses são pra página de
  // detalhe, não afetam o kanban.
  useEffect(() => {
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let closed = false
    const connect = () => {
      if (closed) return
      try {
        es = new EventSource(`${getApiUrl()}/api/orcamentos/events`)
        es.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data) as { type: string }
            if (ev.type !== 'kanban') return
            fetchData(true) // silencioso — não tira spinner
          } catch { /* payload inválido */ }
        }
        es.onerror = () => {
          es?.close()
          if (!closed) retryTimeout = setTimeout(connect, 15000)
        }
      } catch {
        if (!closed) retryTimeout = setTimeout(connect, 15000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retryTimeout) }
  }, [fetchData])

  // Carrega config (prazos / validade) uma unica vez para calcular prazos nos cards
  useEffect(() => {
    (trpc.orcamento as any).getConfig.query()
      .then((data: Partial<OrcConfig>) => {
        setOrcConfig({
          diasEnviar: data.diasEnviar ?? DEFAULT_CONFIG.diasEnviar,
          diasAprovar: data.diasAprovar ?? DEFAULT_CONFIG.diasAprovar,
          diasRevisar: data.diasRevisar ?? DEFAULT_CONFIG.diasRevisar,
          validadeDias: data.validadeDias ?? DEFAULT_CONFIG.validadeDias,
        })
      })
      .catch(() => { /* mantem defaults */ })
  }, [])

  // ── Actions ──

  async function handleCreate() {
    if (!form.clienteId) { alerts.error('Cliente obrigatório', 'Selecione o cliente.'); return }
    // E-mail do contato é obrigatório no cadastro (#HLP0089). Aceita um ou mais
    // e-mails separados por vírgula/ponto-e-vírgula; todos precisam ser válidos.
    const emails = (form.emailsContatos || '').split(/[,;]/).map(e => e.trim()).filter(Boolean)
    if (emails.length === 0) { alerts.error('E-mail obrigatório', 'Informe o e-mail do contato.'); return }
    const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emails.every(e => reEmail.test(e))) { alerts.error('E-mail inválido', 'Informe um e-mail válido para o contato.'); return }
    setCreating(true)
    try {
      const result = await (trpc.orcamento as any).create.mutate({
        clienteId: form.clienteId,
        contatos: form.contatos || undefined,
        emailsContatos: form.emailsContatos || undefined,
        formaPagamento: form.formaPagamento || undefined,
        tipo: form.tipo || undefined,
        responsavelId: form.responsavelId || undefined,
        validadeDias: form.validadeDias ? Number(form.validadeDias) : 90,
        descontoPct: form.descontoPct ? Number(form.descontoPct) : undefined,
        descontoValor: form.descontoValor ? Number(form.descontoValor) : undefined,
        textoInterno: form.textoInterno || undefined,
      })
      setCreateOpen(false)
      setForm(FORM_INITIAL)
      await alerts.success('Orçamento criado', `Orçamento #${result.numero} criado com sucesso.`)
      fetchData()
      router.push(`/orcamentos/${result.id}`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setCreating(false) }
  }

  async function handleDuplicar(id: string) {
    try {
      const result = await (trpc.orcamento as any).duplicar.mutate({ id })
      await alerts.success('Duplicado', `Orçamento #${result.numero} criado como cópia.`)
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleArquivar(id: string) {
    const ok = await alerts.confirm({ title: 'Arquivar orçamento', text: 'Deseja arquivar este orçamento?', icon: 'question' })
    if (!ok) return
    try {
      await (trpc.orcamento as any).arquivar.mutate({ id })
      await alerts.success('Arquivado', 'Orçamento arquivado com sucesso.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDelete(id: string) {
    if (!await alerts.confirmDelete('este orcamento')) return
    try {
      await (trpc.orcamento as any).delete.mutate({ id })
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function openCreateModal() {
    setCreateOpen(true)
    try {
      const [cls, usrs] = await Promise.all([
        (trpc.cliente as any).listForSelect.query(),
        (trpc.orcamento as any).listUsuarios.query(),
      ])
      setClientes(cls)
      setUsuarios(usrs)
    } catch { setClientes([]); setUsuarios([]) }
  }

  // ── Pagination helpers ──
  const startRecord = total > 0 ? (page - 1) * limit + 1 : 0
  const endRecord = Math.min(page * limit, total)

  function getPageNumbers() {
    const p: number[] = []
    let s = Math.max(1, page - 2)
    const e = Math.min(totalPages, s + 4)
    s = Math.max(1, e - 4)
    for (let i = s; i <= e; i++) p.push(i)
    return p
  }

  // ── Kanban data ──
  const orcByStatus = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = orcamentos.filter(o => o.status === status)
    return acc
  }, {} as Record<string, OrcamentoRow[]>)

  const getClienteNome = (orc: OrcamentoRow) => {
    if (!orc.clienteId) return null
    return clientesMap.get(orc.clienteId)?.razaoSocial || null
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col gap-5 h-[calc(100vh-90px)]" suppressHydrationWarning>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <CircleDollarSign className="h-6 w-6" />
          </div>
          <div>
            <h1>Orçamentos</h1>
            <p className="text-sm text-muted-foreground">Gerencie orçamentos e propostas comerciais</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Input
            placeholder="Buscar orçamento..."
            className="h-9 w-56 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="flex items-center border rounded-[2px] overflow-hidden">
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('kanban'); localStorage.setItem('orcamentos-view-mode', 'kanban') }} title="Kanban">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'tabela' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('tabela'); localStorage.setItem('orcamentos-view-mode', 'tabela') }} title="Tabela">
              <List className="h-4 w-4" />
            </button>
          </div>
          {viewMode === 'kanban' && (
            <div className="flex items-center border rounded-[2px] overflow-hidden">
              <button
                type="button"
                className={cn('p-1.5 transition-colors', allCollapsed ? 'opacity-40 cursor-default' : 'text-muted-foreground hover:bg-muted')}
                onClick={collapseAllColumns}
                disabled={allCollapsed}
                title="Recolher todas as colunas"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn('p-1.5 transition-colors border-l', allExpanded ? 'opacity-40 cursor-default' : 'text-muted-foreground hover:bg-muted')}
                onClick={expandAllColumns}
                disabled={allExpanded}
                title="Expandir todas as colunas"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setFiltrosOpen(v => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium border transition-colors shrink-0',
              filtrosOpen || filtrosAtivos > 0
                ? 'bg-muted border-border text-foreground'
                : 'bg-card border-border text-muted-foreground hover:bg-muted/50',
            )}
            title="Filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-semibold leading-none" style={{ backgroundColor: MODULE_COLOR }}>{filtrosAtivos}</span>
            )}
          </button>
          <button
            onClick={() => { setArquivado(!arquivado); setPage(1) }}
            className={cn(
              'h-9 px-3 rounded-md text-xs font-medium border transition-colors shrink-0',
              arquivado
                ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
                : 'bg-card border-border text-muted-foreground hover:bg-muted/50',
            )}
            title={arquivado ? 'Mostrando arquivados' : 'Mostrando ativos'}
          >
            <Archive className="h-4 w-4" />
          </button>
          {canViewIndicadores && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push('/orcamentos/relatorios')} title="Relatórios">
              <BarChart3 className="h-4 w-4" />
            </Button>
          )}
          {canViewIndicadores && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push('/orcamentos/relatorios?tab=indicadores')} title="Indicadores">
              <Activity className="h-4 w-4" />
            </Button>
          )}
          {canManageConfig && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" title="Configurações">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => router.push('/orcamentos/parametros')}>
                  <Package className="h-4 w-4 mr-2" /> Catálogo de Serviços
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/orcamentos/configuracoes')}>
                  <Settings2 className="h-4 w-4 mr-2" /> Configurações
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFormasModal(true)}>
                  <CircleDollarSign className="h-4 w-4 mr-2" /> Gerenciar formas de pagamento
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={openCreateModal}>
            <Plus className="h-4 w-4" /> Novo Orçamento
          </Button>
        </div>
      </div>

      {/* ── Painel de filtros (HLP0296) — espelha a lista do legado ──
          Anima expandir/retrair via grid-template-rows (0fr↔1fr). A margem
          negativa quando fechado neutraliza o gap do flex-col do container. */}
      <div
        className="shrink-0 grid transition-all duration-300 ease-out motion-reduce:transition-none"
        style={{
          gridTemplateRows: filtrosOpen ? '1fr' : '0fr',
          opacity: filtrosOpen ? 1 : 0,
          marginBottom: filtrosOpen ? 0 : '-1.25rem',
        }}
        aria-hidden={!filtrosOpen}
      >
        <div className="min-h-0" style={{ overflow: filtrosOverflow ? 'visible' : 'hidden' }}>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Número</Label>
                <Input inputMode="numeric" placeholder="Nº do orçamento" className="h-9 text-sm" value={numeroFilter} onChange={e => setNumeroFilter(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Data inicial</Label>
                <Input type="date" className="h-9 text-sm" value={dataInicial} onChange={e => { setDataInicial(e.target.value); setPage(1) }} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Data final</Label>
                <Input type="date" className="h-9 text-sm" value={dataFinal} onChange={e => { setDataFinal(e.target.value); setPage(1) }} />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Cliente</Label>
                <ClienteCombobox clientes={clientes} value={clienteFilter} onSelect={v => { setClienteFilter(v); setPage(1) }} placeholder="Todos os clientes" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Serviço</Label>
                <UserCombobox users={servicosFiltro.map(s => ({ id: s.id, name: s.nome }))} value={servicoFilter} onSelect={v => { setServicoFilter(v); setPage(1) }} placeholder="Todos os serviços" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Solicitante</Label>
                <UserCombobox users={usuarios} value={solicitanteFilter} onSelect={v => { setSolicitanteFilter(v); setPage(1) }} placeholder="Todos os solicitantes" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-medium text-muted-foreground">Responsável</Label>
                <UserCombobox users={usuarios} value={responsavelFilter} onSelect={v => { setResponsavelFilter(v); setPage(1) }} placeholder="Todos os responsáveis" />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 h-9 cursor-pointer select-none">
                  <input type="checkbox" className="h-4 w-4 rounded border-border cursor-pointer" style={{ accentColor: MODULE_COLOR }} checked={incluirParalizados} onChange={e => { setIncluirParalizados(e.target.checked); setPage(1) }} />
                  <span className="text-sm text-foreground">Incluir paralizados</span>
                </label>
              </div>
            </div>
            {filtrosAtivos > 0 && (
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={limparFiltros} className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                  <X className="h-3.5 w-3.5" /> Limpar filtros
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Kanban View ── (sempre montado quando viewMode=kanban; loader vira overlay para nao desmontar DragOverlay portal) */}
      {viewMode === 'kanban' && (
        <div className="relative flex-1 flex flex-col min-h-0">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <OrcConfigContext.Provider value={orcConfig}>
          <DndContext sensors={kanbanSensors} collisionDetection={closestCenter} onDragStart={handleKanbanDragStart} onDragMove={handleKanbanDragMove} onDragOver={handleKanbanDragOver} onDragEnd={handleKanbanDragEnd} onDragCancel={handleKanbanDragCancel}>
            <div className="overflow-x-auto overflow-y-hidden pb-4 -mx-1 flex-1 nice-scrollbar">
              <div className="flex gap-3 px-1 h-full w-max">
                {STATUS_ORDER.map(status => {
                  const items = orcByStatus[status] || []
                  // Sinaliza visualmente colunas que NÃO podem receber o card sendo arrastado.
                  // Quando não há drag ativo (activeCard nulo) ou quando a transição é a mesma
                  // coluna ou está permitida, drop fica habilitado.
                  // Caso especial: ENVIADO exige ao menos 1 item — se o card não tem,
                  // a coluna fica visualmente bloqueada antes mesmo do drop.
                  const semItens = !!activeCard && (activeCard._count?.itens ?? 0) === 0
                  const dropDisabled = !!activeCard
                    && activeCard.status !== status
                    && (!isOrcamentoTransitionAllowed(activeCard.status, status)
                      || (status === 'ENVIADO' && semItens))
                  return (
                    <KanbanColumn
                      key={status}
                      status={status}
                      items={items}
                      isOver={overColumnId === status}
                      activeCardId={activeCardId}
                      collapsed={collapsedColumns.has(status)}
                      dropDisabled={dropDisabled}
                      draggable={canMoverKanban}
                      onToggleCollapse={() => toggleColumnCollapse(status)}
                      getClienteNome={getClienteNome}
                      onOpenDetail={(id) => router.push(`/orcamentos/${id}`)}
                      onDuplicar={handleDuplicar}
                      onArquivar={handleArquivar}
                      onDelete={handleDelete}
                    />
                  )
                })}
              </div>
            </div>
            <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeCard && <KanbanCardOverlay orc={activeCard} clienteNome={getClienteNome(activeCard)} velocityX={dragDeltaX} />}
            </DragOverlay>
          </DndContext>
          </OrcConfigContext.Provider>
        </div>
      )}

      {/* ── Table View ── */}
      {viewMode === 'tabela' && (
        <Card className="relative">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[1px] rounded-md">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 flex-1">
              <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
                <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
              </Select>
              {/* #HLP0266: no escopo "Para liberação do financeiro" a lista é
                  fixa em APROVADO — o filtro não teria efeito. */}
              {escopoFixaStatus ? (
                <span className="inline-flex items-center h-8 px-3 text-xs font-medium rounded-md border border-border/60 bg-card text-muted-foreground">
                  Aprovados · para liberação
                </span>
              ) : (
                <Select value={statusFilter || '__all__'} onValueChange={v => { setStatusFilter(v === '__all__' ? '' : v); setPage(1) }}>
                  <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os status</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <button
                type="button"
                onClick={() => { setComReaberturas(v => !v); setPage(1) }}
                title="Filtrar somente orçamentos com pelo menos uma reabertura no histórico"
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border transition-colors',
                  comReaberturas
                    ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-200'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Com reaberturas
              </button>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="#" sortKey="numero" sort={sort} onSort={toggleSort} className="w-[70px]" />
                <SortHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="w-[100px]" />
                <TableHead>Cliente</TableHead>
                <TableHead className="w-[240px]">Itens</TableHead>
                <TableHead className="w-[150px]">Áreas</TableHead>
                <SortHead label="Valor Total" sortKey="totalGeral" sort={sort} onSort={toggleSort} className="w-[130px]" align="right" />
                <TableHead className="w-[170px]">Solicitante / Responsável</TableHead>
                <SortHead label="Criado em" sortKey="createdAt" sort={sort} onSort={toggleSort} className="w-[110px]" />
                <TableHead className="w-[50px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!orcamentos.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhum orçamento encontrado
                </TableCell></TableRow>
              ) : orcamentos.map(orc => (
                <TableRow key={orc.id} className="cursor-pointer hover:bg-muted/40 whitespace-nowrap" onClick={() => router.push(`/orcamentos/${orc.id}`)}>
                  <TableCell className="font-mono text-xs font-medium">{orc.numero}</TableCell>
                  <TableCell><StatusBadge status={orc.status} /></TableCell>
                  <TableCell className="text-sm">
                    <span className="block max-w-[250px] truncate">{getClienteNome(orc) || '—'}</span>
                  </TableCell>
                  <TableCell className="text-xs"><ItensPreview orc={orc} /></TableCell>
                  <TableCell><AreasCell areas={orc.areas} /></TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(Number(orc.totalGeral || orc.valorTotal || 0))}</TableCell>
                  <TableCell className="text-xs">
                    <PessoasCell solicitante={orc.solicitante} responsavel={orc.responsavel} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(orc.createdAt)}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => router.push(`/orcamentos/${orc.id}`)}><FileText className="h-4 w-4" />Detalhes</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicar(orc.id)}><Copy className="h-4 w-4" />Duplicar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArquivar(orc.id)}><Archive className="h-4 w-4" />Arquivar</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(orc.id)}><Trash2 className="h-4 w-4" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{total}</span> registros
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  {getPageNumbers().map(p => (
                    <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                  ))}
                  <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Gerência de formas de pagamento (menu do header) */}
      <FormasPagamentoModal open={formasModal} onOpenChange={(o) => { setFormasModal(o); if (!o) void loadFormasCatalogo() }} />

      {/* Create Modal — espelha o legado crp_orcamentos/modal-create-orc.asp */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Novo Orçamento</DialogTitle>
            <DialogDescription>Preencha os dados do orçamento. Você poderá ajustar tudo depois na tela de detalhes.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            {/* Cliente — full width, combobox filtravel */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Cliente <span className="text-rose-500">*</span></Label>
              <ClienteCombobox
                clientes={clientes}
                value={form.clienteId}
                onSelect={v => setForm({ ...form, clienteId: v })}
                placeholder="Selecione o cliente"
              />
            </div>

            {/* Contato + E-mail do contato */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-3 space-y-1.5">
                <Label className="text-xs font-medium">Contato</Label>
                <Input className="h-9 text-sm" value={form.contatos} onChange={e => setForm({ ...form, contatos: e.target.value })} placeholder="Nome do contato" />
              </div>
              <div className="col-span-12 sm:col-span-9 space-y-1.5">
                <Label className="text-xs font-medium">E-mail do Contato <span className="text-rose-500">*</span></Label>
                <Input className="h-9 text-sm" type="email" required value={form.emailsContatos} onChange={e => setForm({ ...form, emailsContatos: e.target.value })} placeholder="contato@empresa.com.br" />
              </div>
            </div>

            {/* Campos avancados — somente para usuarios com permissao cadastro_completo (espelha legado orc_cadastro=1) */}
            {canCadastroCompleto && (
              <>
                {/* Forma de Pagamento */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Forma de Pagamento</Label>
                  <Select value={form.formaPagamento || '__none__'} onValueChange={v => setForm({ ...form, formaPagamento: v === '__none__' ? '' : v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione a forma de pagamento" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Não informada —</SelectItem>
                      {/* valor atual fora do catálogo (compat) — preserva sem perder */}
                      {form.formaPagamento && !formasCatalogo.some(f => f.valor === form.formaPagamento) && (
                        <SelectItem value={form.formaPagamento}>{form.formaPagamento}</SelectItem>
                      )}
                      {formasCatalogo.map(f => <SelectItem key={f.id} value={f.valor}>{f.valor}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">Opções do catálogo (menu ⋮ → Gerenciar formas de pagamento).</p>
                </div>

                {/* Tipo + Responsavel + Validade */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 sm:col-span-4 space-y-1.5">
                    <Label className="text-xs font-medium">Tipo <span className="text-rose-500">*</span></Label>
                    <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SERVICO_MENSAL">Serviço Mensal</SelectItem>
                        <SelectItem value="SERVICO_EXTRA">Serviço Extra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 sm:col-span-6 space-y-1.5">
                    <Label className="text-xs font-medium">Responsável pelo Serviço</Label>
                    <UserCombobox
                      users={usuarios}
                      value={form.responsavelId}
                      onSelect={v => setForm({ ...form, responsavelId: v })}
                      placeholder="Selecione"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium">Validade</Label>
                    <div className="flex">
                      <Input type="number" min={1} className="h-9 text-sm rounded-r-none" value={form.validadeDias} onChange={e => setForm({ ...form, validadeDias: e.target.value })} />
                      <span className="inline-flex items-center px-2 h-9 border border-l-0 border-input bg-muted text-xs text-muted-foreground rounded-r-md">dias</span>
                    </div>
                  </div>
                </div>

                {/* Descontos */}
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 sm:col-span-3 space-y-1.5">
                    <Label className="text-xs font-medium">Desconto em %</Label>
                    <div className="flex">
                      <Input type="number" min={0} max={100} step="0.01" className="h-9 text-sm rounded-r-none" value={form.descontoPct} onChange={e => setForm({ ...form, descontoPct: e.target.value })} placeholder="0" />
                      <span className="inline-flex items-center px-2 h-9 border border-l-0 border-input bg-muted text-xs text-muted-foreground rounded-r-md">%</span>
                    </div>
                  </div>
                  <div className="col-span-6 sm:col-span-3 space-y-1.5">
                    <Label className="text-xs font-medium">Desconto em R$</Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-2 h-9 border border-r-0 border-input bg-muted text-xs text-muted-foreground rounded-l-md">R$</span>
                      <Input type="number" min={0} step="0.01" className="h-9 text-sm rounded-l-none" value={form.descontoValor} onChange={e => setForm({ ...form, descontoValor: e.target.value })} placeholder="0,00" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Detalhamento — espelha o "Texto Interno" da página de detalhes
                (mesmo campo `textoInterno`). Anotações da equipe sobre o orçamento. */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Detalhamento</Label>
              <RichEditor
                value={form.textoInterno}
                onChange={v => setForm({ ...form, textoInterno: v })}
                placeholder="Texto interno (visível apenas pela equipe)..."
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white gap-1.5" onClick={handleCreate} disabled={creating || !form.clienteId}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar Orcamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}

// Cabeçalho de coluna ordenável (modo tabela) — clica pra ordenar; seta indica direção.
function SortHead({ label, sortKey, sort, onSort, className, align = 'left' }: {
  label: string
  sortKey: 'numero' | 'status' | 'totalGeral' | 'createdAt'
  sort: { key: string; dir: 'asc' | 'desc' } | null
  onSort: (k: 'numero' | 'status' | 'totalGeral' | 'createdAt') => void
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  const active = sort?.key === sortKey
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('inline-flex items-center gap-1 select-none hover:text-foreground w-full', justify, active && 'text-foreground font-semibold')}
      >
        {label}
        {active
          ? (sort!.dir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)
          : <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />}
      </button>
    </TableHead>
  )
}

// ============================================================
// Kanban DnD Components
// ============================================================

function KanbanColumn({ status, items, isOver, activeCardId, collapsed, dropDisabled, draggable, onToggleCollapse, getClienteNome, onOpenDetail, onDuplicar, onArquivar, onDelete }: {
  status: string
  items: OrcamentoRow[]
  isOver: boolean
  activeCardId: string | null
  collapsed: boolean
  dropDisabled: boolean
  draggable: boolean
  onToggleCollapse: () => void
  getClienteNome: (orc: OrcamentoRow) => string | null
  onOpenDetail: (id: string) => void
  onDuplicar: (id: string) => void
  onArquivar: (id: string) => void
  onDelete: (id: string) => void
}) {
  // Quando user não pode mover, desabilita também o drop (defesa em profundidade)
  const { setNodeRef } = useDroppable({ id: status, disabled: dropDisabled || !draggable })
  const color = STATUS_COLORS[status] || '#94a3b8'
  const label = STATUS_LABELS[status] || status

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'w-[44px] h-full shrink-0 flex flex-col border border-border/40 overflow-hidden transition-all duration-200 rounded cursor-pointer hover:border-border/80',
          isOver && !dropDisabled && 'crm-column-over',
          dropDisabled && 'opacity-40 grayscale cursor-not-allowed',
        )}
        onClick={onToggleCollapse}
        title={dropDisabled ? `Movimento bloqueado: não é possível mover para "${label}" a partir do status atual` : `Expandir coluna ${label}`}
        style={{ backgroundColor: `${color}08` }}
      >
        <div className="flex flex-col items-center gap-1.5 py-2 border-b" style={{ backgroundColor: `${color}12` }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
            title="Expandir coluna"
            className="p-0.5 rounded hover:bg-white/60 dark:hover:bg-black/20 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">{items.length}</Badge>
        </div>
        <div className="flex-1 flex items-center justify-center py-3">
          <span
            className="text-sm font-semibold tracking-wide whitespace-nowrap select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            {label}
          </span>
        </div>
        <div className="border-t border-border/40 flex items-center justify-center py-1.5 text-muted-foreground">
          <ChevronsRight className="h-3.5 w-3.5" />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-[360px] h-full shrink-0 flex flex-col border border-border/40 overflow-hidden transition-all duration-200 rounded relative',
        isOver && !dropDisabled && 'crm-column-over',
        dropDisabled && 'opacity-40 grayscale',
      )}
      title={dropDisabled ? `Movimento bloqueado para "${label}". Para voltar a status anteriores, use a opção "Reabrir orçamento" no menu de ações.` : undefined}
    >
      {dropDisabled && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center bg-rose-50/40 dark:bg-rose-900/20 backdrop-blur-[1px]">
          <div className="rounded-md bg-white/95 dark:bg-card/95 px-3 py-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-300 shadow-sm border border-rose-200/60">
            🚫 Não permitido
          </div>
        </div>
      )}
      <div className="px-3 py-2.5 border-b flex items-center justify-between gap-2" style={{ backgroundColor: `${color}12` }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">{items.length}</Badge>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Recolher coluna"
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <SortableContext items={items.map(o => o.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto nice-scrollbar min-h-[120px]">
          {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhum orçamento</p>}
          {items.map(orc => (
            <KanbanCard
              key={orc.id}
              orc={orc}
              isDraggingAny={!!activeCardId}
              clienteNome={getClienteNome(orc)}
              draggable={draggable}
              onOpenDetail={onOpenDetail}
              onDuplicar={onDuplicar}
              onArquivar={onArquivar}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function KanbanCard({ orc, isDraggingAny, clienteNome, draggable, onOpenDetail, onDuplicar, onArquivar, onDelete }: {
  orc: OrcamentoRow
  isDraggingAny: boolean
  clienteNome: string | null
  draggable: boolean
  onOpenDetail: (id: string) => void
  onDuplicar: (id: string) => void
  onArquivar: (id: string) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: orc.id, disabled: !draggable })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  const color = STATUS_COLORS[orc.status] || '#94a3b8'

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={cn(
        'rounded-sm bg-white dark:bg-card group touch-none overflow-hidden',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging ? 'border border-transparent opacity-30' : 'border border-border/50',
        !isDragging && !isDraggingAny && 'hover:shadow-md transition-shadow',
      )}
      onClick={() => { if (!isDraggingAny) onOpenDetail(orc.id) }}
    >
      <div className="flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent orc={orc} clienteNome={clienteNome} onDuplicar={onDuplicar} onArquivar={onArquivar} onDelete={onDelete} onOpenDetail={onOpenDetail} showMenu={!isDraggingAny} />
        </div>
      </div>
    </div>
  )
}

function KanbanCardOverlay({ orc, clienteNome, velocityX }: { orc: OrcamentoRow; clienteNome: string | null; velocityX: number }) {
  const [rotation, setRotation] = useState(0)
  const rotRef = useRef(0)
  const angVelRef = useRef(0)
  const rafRef = useRef(0)
  const inputVelRef = useRef(0)
  const color = STATUS_COLORS[orc.status] || '#94a3b8'

  useEffect(() => { inputVelRef.current = velocityX * 0.3 }, [velocityX])

  useEffect(() => {
    const tick = () => {
      angVelRef.current += inputVelRef.current * 0.06
      inputVelRef.current *= 0.3
      angVelRef.current += -rotRef.current * 0.04
      // Damping forte (0.82, antes 0.95) — perto do amortecimento critico:
      // o card balanca uma vez na direcao do drag e volta sem mais oscilacoes.
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
      // Largura casa com a coluna do kanban (w-[360px] - border 2px - padding p-2 16px = 342px),
      // pra evitar o efeito "encolher" ao iniciar o drag e "voltar ao normal" ao soltar.
      className="rounded-sm bg-white dark:bg-card w-[342px] overflow-hidden"
      style={{
        transform: `rotate(${rotation.toFixed(2)}deg) scale(1.02)`,
        transformOrigin: 'top center',
        boxShadow: `0 10px 25px rgba(0,0,0,0.15)`,
      }}
    >
      <div className="flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent orc={orc} clienteNome={clienteNome} onDuplicar={() => {}} onArquivar={() => {}} onDelete={() => {}} onOpenDetail={() => {}} showMenu={false} />
        </div>
      </div>
    </div>
  )
}

function KanbanCardContent({ orc, clienteNome, onDuplicar, onArquivar, onDelete, onOpenDetail, showMenu }: {
  orc: OrcamentoRow
  clienteNome: string | null
  onOpenDetail: (id: string) => void
  onDuplicar: (id: string) => void
  onArquivar: (id: string) => void
  onDelete: (id: string) => void
  showMenu: boolean
}) {
  const valor = Number(orc.totalGeral || orc.valorTotal || 0)

  return (
    <div className="flex flex-col">
      {/* Header — número à esquerda do nome do cliente para ganhar espaço vertical */}
      <div className="flex items-start justify-between gap-1 px-3 pt-2.5 pb-1">
        <h4 className="min-w-0 text-[13px] font-semibold leading-tight line-clamp-2">
          <span className="shrink-0">#{orc.numero}</span> {clienteNome || 'Sem cliente'}
        </h4>
        <div className="h-6 w-6 shrink-0 -mr-1 -mt-0.5">
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-muted">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => onOpenDetail(orc.id)}><Eye className="h-3.5 w-3.5 mr-2" /> Detalhes</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicar(orc.id)}><Copy className="h-3.5 w-3.5 mr-2" /> Duplicar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onArquivar(orc.id)}><Archive className="h-3.5 w-3.5 mr-2" /> Arquivar</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(orc.id)}><Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {/* Body */}
      <div className="px-3 pb-2 space-y-1">
        {valor > 0 && (
          <span className="text-xs font-semibold" style={{ color: MODULE_COLOR }}>{formatCurrency(valor)}</span>
        )}
        {orc.itens && orc.itens.length > 0 && (
          <div className="space-y-0.5 pt-0.5">
            {orc.itens.map(item => (
              <div key={item.id} className="text-[11px] text-foreground/75 leading-tight flex items-start gap-1.5">
                <span className="text-muted-foreground/60 shrink-0 mt-px">•</span>
                <span className="truncate flex-1">{stripHtml(item.descricao)}</span>
              </div>
            ))}
            {(orc._count?.itens ?? 0) > orc.itens.length && (() => {
              const ocultos = orc._count!.itens - orc.itens.length
              // O card mostra os 2 primeiros; o tooltip lista os que sobraram.
              const restantes = (orc.itensDescricoes ?? []).slice(orc.itens!.length)
              return (
                <ItensRestantesTooltip restantes={restantes}>
                  <div
                    className={cn(
                      'text-[10px] font-medium pl-3 w-fit',
                      restantes.length > 0 && 'underline decoration-dotted underline-offset-2 cursor-help',
                    )}
                    style={{ color: MODULE_COLOR }}
                  >
                    + {ocultos} {ocultos === 1 ? 'outro item' : 'outros itens'}
                  </div>
                </ItensRestantesTooltip>
              )
            })()}
          </div>
        )}
        {orc.observacoes && (!orc.itens || orc.itens.length === 0) && (
          <p className="text-[11px] text-muted-foreground truncate">{stripHtml(orc.observacoes)}</p>
        )}
      </div>
      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/40 bg-muted/20">
        <div className="flex items-center gap-2">
          {(orc.solicitante || orc.responsavel) && (
            <div className="flex items-center -space-x-1.5">
              {orc.solicitante && <UserChip user={orc.solicitante} role="Solicitante" />}
              {orc.responsavel && <UserChip user={orc.responsavel} role="Responsavel" />}
            </div>
          )}
          <PrazoBadge orc={orc} />
        </div>
        <div className="flex items-center gap-2">
          {(orc._count?.itens ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`${orc._count!.itens} ${orc._count!.itens === 1 ? 'item' : 'itens'}`}>
              <FileText className="h-3 w-3" /> {orc._count!.itens}
            </span>
          )}
          {(orc._count?.mensagens ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`${orc._count!.mensagens} ${orc._count!.mensagens === 1 ? 'mensagem' : 'mensagens'}`}>
              <MessageSquare className="h-3 w-3" /> {orc._count!.mensagens}
            </span>
          )}
          {(orc._count?.arquivos ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5" title={`${orc._count!.arquivos} ${orc._count!.arquivos === 1 ? 'arquivo' : 'arquivos'}`}>
              <Paperclip className="h-3 w-3" /> {orc._count!.arquivos}
            </span>
          )}
          {orc.pesquisaRespondida && (
            <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--mod-comercial, #fb7185)' }} title="Cliente respondeu a pesquisa de satisfação">
              <Star className="h-3 w-3 fill-current" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// Badge de prazo no card do kanban — calcula dinamicamente baseado no status + config + datas
function PrazoBadge({ orc }: { orc: OrcamentoRow }) {
  const config = useContext(OrcConfigContext)
  const prazo = calcularPrazoCard(orc, config)
  const colorClasses: Record<typeof prazo.variant, string> = {
    ok: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger: 'text-rose-600 dark:text-rose-400 font-semibold',
    neutral: 'text-muted-foreground',
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('text-[10px] flex items-center gap-0.5 whitespace-nowrap', colorClasses[prazo.variant])}>
          <Clock className="h-3 w-3" /> {prazo.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="text-[11px]">
        {prazo.tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Envolve um "+N" com o tooltip listando os itens que ficaram de fora. Usado
 * pela coluna Itens da tabela e pelo "+N outros itens" do card do kanban — o
 * mesmo conteúdo nos dois lugares.
 *
 * Sem descrições disponíveis (payload antigo em cache, por exemplo), devolve o
 * gatilho puro em vez de um tooltip vazio.
 */
function ItensRestantesTooltip({ restantes, children }: { restantes: string[]; children: React.ReactElement }) {
  if (restantes.length === 0) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="text-[11px] max-w-[280px]">
        <ul className="space-y-0.5">
          {restantes.map((d, i) => <li key={i}>• {stripHtml(d)}</li>)}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Prévia dos itens na tabela: mostra o primeiro e resume o resto em "e +N", com
 * a lista completa no tooltip. Usa `itensDescricoes` (todos os itens) e não
 * `itens`, que vem limitado a 2 pelo backend para os cards do kanban.
 */
function ItensPreview({ orc }: { orc: OrcamentoRow }) {
  const descricoes = orc.itensDescricoes ?? orc.itens?.map(i => i.descricao) ?? []
  const total = orc._count?.itens ?? descricoes.length
  if (total === 0) return <span className="text-muted-foreground">—</span>

  const primeiro = stripHtml(descricoes[0] ?? '') || `${total} ${total === 1 ? 'item' : 'itens'}`
  const restantes = descricoes.slice(1)
  const extras = Math.max(total - 1, 0)

  return (
    <div className="flex items-baseline gap-1 min-w-0">
      <span className="truncate min-w-0" title={primeiro}>{primeiro}</span>
      {extras > 0 && (
        <ItensRestantesTooltip restantes={restantes}>
          <span className={cn(
            'shrink-0 text-muted-foreground',
            restantes.length > 0 && 'underline decoration-dotted underline-offset-2 cursor-help',
          )}>
            e +{extras}
          </span>
        </ItensRestantesTooltip>
      )}
    </div>
  )
}

/** Áreas derivadas dos serviços do orçamento (#HLP0266) — somente leitura. */
function AreasCell({ areas }: { areas?: Array<{ id: string; nome: string }> }) {
  if (!areas || areas.length === 0) return <span className="text-xs text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {areas.map(a => (
        <Badge key={a.id} variant="secondary" className="text-[10px] h-5 px-1.5 font-medium">{a.nome}</Badge>
      ))}
    </div>
  )
}

/**
 * Solicitante em cima, responsável embaixo com "↳" — a seta dispensa rótulo e
 * deixa claro que a segunda linha deriva da primeira. Nome completo no title.
 */
function PessoasCell({ solicitante, responsavel }: { solicitante?: UserRef | null; responsavel?: UserRef | null }) {
  if (!solicitante && !responsavel) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="truncate" title={solicitante ? `Solicitante: ${solicitante.name}` : undefined}>
        {solicitante?.name ?? '—'}
      </span>
      <span className="truncate text-muted-foreground" title={responsavel ? `Responsável: ${responsavel.name}` : undefined}>
        <span aria-hidden="true">↳ </span>
        {responsavel?.name ?? '—'}
      </span>
    </div>
  )
}

function UserChip({ user, role }: { user: UserRef; role: 'Solicitante' | 'Responsavel' }) {
  const initials = (user.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  const chip = user.image ? (
    <img src={resolveAssetUrl(user.image)} alt={user.name} className="h-6 w-6 rounded-full object-cover shrink-0 border-2 border-background shadow-sm" />
  ) : (
    <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0 border-2 border-background shadow-sm">
      <span className="text-[8px] font-bold text-muted-foreground">{initials}</span>
    </div>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{chip}</span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="text-[11px]">
        <span className="font-semibold">{role}:</span> {user.name}
      </TooltipContent>
    </Tooltip>
  )
}
