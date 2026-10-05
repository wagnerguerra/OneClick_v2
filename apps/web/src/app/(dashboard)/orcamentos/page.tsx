'use client'

import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react'
import { ClienteIdentificacao, type ClienteDoc } from '@/components/cliente-identificacao'
import { SeloExCliente, ehExCliente } from '@/components/selo-ex-cliente'
import { mensagemErro } from '@/lib/errors'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { ROTEIRO_SOLICITACAO_ORCAMENTO, detalhamentoPreenchido } from '@/components/orcamento/roteiro-solicitacao'
import { useRoteiroSolicitacao } from '@/components/orcamento/use-roteiro-solicitacao'
import { useRouter } from 'next/navigation'
import {
  FileText, CircleDollarSign, Loader2, Plus, MoreVertical, Copy, Archive, Ban,
  Highlighter, Building2, IdCard, ListChecks, Pause, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronUp, ChevronDown, ChevronsUpDown,
  Clock, AlertTriangle, LayoutGrid, List, Eye, Settings2, Package, BarChart3, Activity,
  MessageSquare, Paperclip, RotateCcw, Star, SlidersHorizontal, X, Target, Check,
  Download, FileSpreadsheet, FileDown, CheckCircle2, Pencil, ThumbsDown, Search as SearchIcon,
  Wrench,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Label, RichEditor,
} from '@saas/ui'
import { ClienteCombobox } from './_components/cliente-combobox'
import { UserCombobox } from './_components/user-combobox'
import { CatalogoCombobox } from './_components/catalogo-combobox'
import { RelatorioColunaModal } from './_components/relatorio-coluna-modal'
import { PreviewOrcamento } from './_components/preview-orcamento'
import { AvatarPequeno, DicaIcone, LinhaCard, LogoCliente } from '@/components/kanban/card-partes'
import { ReprocessarServicosModal } from './_components/reprocessar-servicos-modal'
import { cn } from '@saas/ui'
import { TEXT, BADGE } from '@/lib/color-styles'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { useAutoHideScrollbar } from '@/hooks/use-autohide-scrollbar'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { FormasPagamentoModal } from '@/components/orcamento/formas-pagamento-modal'
import { AreasNotificarPicker, useAreasNotificaveis } from '@/components/orcamento/areas-notificar-picker'
import { DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent, type DragStartEvent, type DragOverEvent, type DragMoveEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { useUserPermissions } from '@/hooks/use-user-permissions'

// ============================================================
// Tipos e constantes
// ============================================================

import { isOrcamentoTransitionAllowed, ORCAMENTO_STATUS_LABELS, ORCAMENTO_STATUS_COLORS, resolveOrcamentoScope, type OrcamentoScope, formatDocumento, ehMatrizCnpj, DESTAQUE_CORES, DESTAQUE_COR_LABELS, type DestaqueCor } from '@saas/types'

const STATUS_ORDER = ['NOVO', 'A_ENVIAR', 'ENVIADO', 'APROVADO', 'LIBERADO', 'FINALIZADO', 'ENCERRADO'] as const

const STATUS_COLORS: Record<string, string> = ORCAMENTO_STATUS_COLORS

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
const PRIMARY = 'var(--color-primary)'

interface UserRef { id: string; name: string; image?: string | null }

interface OrcamentoRow {
  id: string
  numero: number
  status: string
  /** Card destacado no quadro (todos veem; sobe para o topo da coluna). */
  destacadoEm?: string | null
  destacadoCor?: DestaqueCor | null
  destacadoPorUser?: { id: string; name: string; image?: string | null } | null
  /** APROVADO com o serviço já concluído — falta a liberação do financeiro. */
  servicosConcluidos?: boolean
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
  /** Card de CRM vinculado — presença via oportunidadeId; nº quando disponível. */
  oportunidadeId?: string | null
  oportunidadeNumero?: number | null
  /** Resposta do cliente pelo link público (APROVADO | REVISAO_SOLICITADA | REPROVADO). */
  decisaoTipo?: string | null
  decisaoEm?: string | null
  createdAt: string
  updatedAt: string
  arquivado?: boolean
  paralizado?: boolean
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

/**
 * Cor do destaque em hex, aplicada inline na bolinha do menu, na borda do card
 * e no ícone do rodapé — os três idênticos. Não usa classes Tailwind porque a
 * página roda sob `.mod-comercial`, e o retint do globals.css troca as classes
 * rosa pela cor do módulo (a borda saía lavada, puxando para o laranja). Cor
 * escolhida pelo usuário é conceito, não módulo: mapa `*_COR` local.
 */
const DESTAQUE_COR: Record<DestaqueCor, string> = {
  amber: '#f59e0b',
  orange: '#f97316',
  rose: '#e11d48',
  emerald: '#10b981',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
}
/** Cores da quina de aviso do header (inline pelo mesmo motivo do DESTAQUE_COR). */
const AVISO_COR = { verde: '#10b981', ambar: '#f59e0b', vermelho: '#e11d48' } as const

const corDoDestaque = (orc: { destacadoCor?: DestaqueCor | null }): DestaqueCor =>
  orc.destacadoCor && (DESTAQUE_CORES as readonly string[]).includes(orc.destacadoCor) ? orc.destacadoCor : 'amber'

interface PrazoInfo {
  label: string  // texto curto pro card. ex: "3d p/ enviar", "vencido 2d"
  tooltip: string
  variant: 'ok' | 'warning' | 'danger' | 'neutral'
  /** 0–100: quanto do prazo da etapa ainda resta (medidor do preview). */
  restantePct?: number
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
      restantePct: 0,
    }
  }
  if (restantes === 0) {
    return { label: 'vence hoje', tooltip: `${acaoTooltip}. Vence hoje!`, variant: 'danger', restantePct: 0 }
  }

  // Cor baseada na proporção do prazo restante
  const total = (deadline - new Date(orc.createdAt).getTime()) / DIA_MS
  const ratio = restantes / Math.max(total, 1)
  const variant: PrazoInfo['variant'] = ratio < 0.2 ? 'danger' : ratio < 0.5 ? 'warning' : 'ok'

  return {
    label: `${restantes}d ${acaoLabel}`,
    tooltip: `${acaoTooltip}. Restam ${restantes} dia(s)`,
    variant,
    restantePct: Math.round(Math.min(1, ratio) * 100),
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
  // Clique no orçamento: detalhes direto (sub-permissão) ou preview. É
  // preferência de navegação, não acesso — por isso o master também segue a
  // marcação, sem bypass.
  const abrirDetalhesDireto = subPerms.abrir_detalhes_direto === true
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
  const [itemFilter, setItemFilter] = useState('')
  const [solicitanteFilter, setSolicitanteFilter] = useState('')
  const [responsavelFilter, setResponsavelFilter] = useState('')
  const [incluirParalizados, setIncluirParalizados] = useState(true)
  const [catalogo, setCatalogo] = useState<Array<{ id: string; nome: string; tipo: string; valorPadrao: number | string | null }>>([])
  const [filtrosDataLoaded, setFiltrosDataLoaded] = useState(false)
  const filtrosAtivos = (
    (debouncedNumero.trim() ? 1 : 0) + (dataInicial ? 1 : 0) + (dataFinal ? 1 : 0) +
    (clienteFilter ? 1 : 0) + (itemFilter ? 1 : 0) +
    (solicitanteFilter ? 1 : 0) + (responsavelFilter ? 1 : 0) +
    (!incluirParalizados ? 1 : 0)
  )
  function limparFiltros() {
    setNumeroFilter(''); setDataInicial(''); setDataFinal('')
    setClienteFilter(''); setItemFilter('')
    setSolicitanteFilter(''); setResponsavelFilter('')
    setIncluirParalizados(true); setPage(1)
  }
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([])
  // Preview (painel lateral) do card clicado no quadro.
  const [previewId, setPreviewId] = useState<string | null>(null)
  // Quem está logado — o destaque aplicado aqui já mostra "Por <nome>" sem
  // recarregar a lista.
  const { profile: eu } = useCurrentUserProfile()
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [clientesMap, setClientesMap] = useState<Map<string, ClienteDoc>>(new Map())
  const [orcConfig, setOrcConfig] = useState<OrcConfig>(DEFAULT_CONFIG)
  const [viewMode, setViewMode] = useState<'tabela' | 'kanban'>(() => {
    if (typeof window === 'undefined') return 'kanban'
    const salvo = localStorage.getItem('orcamentos-view-mode')
    if (salvo === 'tabela' || salvo === 'kanban') return salvo
    // Sem preferência salva, o celular abre em tabela: as colunas do kanban têm
    // 340px, e sete delas são 2380px de rolagem lateral numa tela de 390px.
    // Quem escolher kanban no celular continua com ele.
    return window.matchMedia('(max-width: 639px)').matches ? 'tabela' : 'kanban'
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
  // Coluna cujo relatório está aberto (status) — null = fechado.
  const [relatorioColuna, setRelatorioColuna] = useState<string | null>(null)
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
  // Recuperação dos aprovados sem serviço (master-only) — ver o componente.
  const [reprocessarModal, setReprocessarModal] = useState(false)
  // Catálogo de formas de pagamento — alimenta o dropdown do modal de criar.
  const [formasCatalogo, setFormasCatalogo] = useState<Array<{ id: string; valor: string; ordem: number }>>([])
  const loadFormasCatalogo = useCallback(async () => {
    try { setFormasCatalogo((await (trpc.orcamento as any).listFormasPagamento.query()) || []) } catch { /* sem permissão no módulo */ }
  }, [])
  useEffect(() => { void loadFormasCatalogo() }, [loadFormasCatalogo])
  const [clientes, setClientes] = useState<{ id: string; razaoSocial: string; documento?: string | null; status?: string | null }[]>([])
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([])
  const [creating, setCreating] = useState(false)
  // Áreas a notificar — lista + pills compartilhadas com o balão do FAB
  // (fonte única: Configurações → "Notificação de áreas"). Obrigatório quando há áreas.
  const areasNotificaveis = useAreasNotificaveis()
  const [areasNotificar, setAreasNotificar] = useState<string[]>([])
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
    // Abre com o roteiro do que o comercial precisa (#HLP0411) — lembrete, não trava.
    textoInterno: ROTEIRO_SOLICITACAO_ORCAMENTO,
  }
  const [form, setForm] = useState(FORM_INITIAL)
  // Roteiro configurável (Configurações → Textos padrão): substitui o padrão
  // no Detalhamento enquanto ninguém mexeu nele.
  const roteiro = useRoteiroSolicitacao()
  useEffect(() => {
    setForm(f => (f.textoInterno === ROTEIRO_SOLICITACAO_ORCAMENTO ? { ...f, textoInterno: roteiro } : f))
  }, [roteiro, createOpen])

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
        const [cls, usrs, cat] = await Promise.all([
          // Filtro por cliente alcança os orçamentos de ex-clientes também.
          (trpc.cliente as any).listForSelect.query({ incluirInativos: true }),
          (trpc.orcamento as any).listUsuarios.query(),
          (trpc.orcamento as any).listCatalogo.query({ somenteDisponiveis: true, tipoOrcamento: null }),
        ])
        setClientes(cls); setUsuarios(usrs); setCatalogo(cat)
        setFiltrosDataLoaded(true)
      } catch { /* mantém vazio; tenta de novo na próxima abertura */ }
    })()
  }, [filtrosOpen, filtrosDataLoaded])

  /**
   * #HLP0265 — URL de exportação da lista COM OS FILTROS DA TELA. É consumida
   * por um `<a href download>`, e NÃO por `window.location.href`: com resposta
   * `Content-Disposition: attachment`, atribuir o location faz o Chrome iniciar
   * o download mas deixar a aba presa no estado de carregamento (o arquivo
   * chega, a aba fica girando pra sempre). O `<a>` é o mesmo padrão que o
   * relatório da coluna já usava, e de graça ganha o "salvar como" do botão
   * direito e a abertura em nova aba.
   *
   * Os parâmetros abaixo espelham 1:1 o `input` montado no fetchData — se um
   * filtro novo entrar lá, precisa entrar aqui, senão a planilha deixa de
   * corresponder ao que está na tela. `scope` não vai: o backend o deriva da
   * permissão do usuário e sobrescreve o que o cliente manda, tanto na listagem
   * quanto na exportação, então os dois já batem.
   */
  const urlExportLista = useCallback((formato: 'xlsx' | 'csv' | 'pdf') => {
    const p = new URLSearchParams()
    p.set('formato', formato)
    if (debouncedSearch) p.set('search', debouncedSearch)
    if (statusFilter) p.set('status', statusFilter)
    if (comReaberturas) p.set('comReaberturas', '1')
    if (debouncedNumero.trim()) {
      const n = parseInt(debouncedNumero.replace(/\D/g, ''), 10)
      if (n > 0) p.set('numero', String(n))
    }
    if (dataInicial) p.set('de', dataInicial)
    if (dataFinal) p.set('ate', dataFinal)
    if (clienteFilter) p.set('clienteId', clienteFilter)
    if (itemFilter) p.set('itemCatalogoId', itemFilter)
    if (solicitanteFilter) p.set('solicitanteId', solicitanteFilter)
    if (responsavelFilter) p.set('responsavelId', responsavelFilter)
    if (!incluirParalizados) p.set('incluirParalizados', '0')
    if (arquivado) p.set('arquivado', '1')
    return `${getApiUrl()}/api/orcamento-report/lista?${p.toString()}`
  }, [debouncedSearch, statusFilter, comReaberturas, debouncedNumero, dataInicial, dataFinal,
      clienteFilter, itemFilter, solicitanteFilter, responsavelFilter, incluirParalizados, arquivado])

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
      if (itemFilter) input.itemCatalogoId = itemFilter
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
          // Ex-clientes também: orçamento de cliente que foi inativado (a
          // própria baixa da empresa, p.ex. #4783) aparecia como "Sem cliente".
          const cls = await (trpc.cliente as any).listForSelect.query({ incluirInativos: true })
          const map = new Map<string, ClienteDoc>()
          for (const c of cls) map.set(c.id, { razaoSocial: c.razaoSocial, documento: c.documento, tipoDocumento: c.tipoDocumento, ehMatriz: c.ehMatriz, nomeFantasia: c.nomeFantasia, logoUrl: c.logoUrl, status: c.status })
          setClientesMap(map)
        } catch { /* */ }
      }
    } catch {
      if (!silent) alerts.error('Erro', 'Falha ao carregar orçamentos')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page, limit, debouncedSearch, statusFilter, arquivado, comReaberturas, viewMode, listScope, sort,
      debouncedNumero, dataInicial, dataFinal, clienteFilter, itemFilter, solicitanteFilter, responsavelFilter, incluirParalizados])

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
    // E-mail do contato é OPCIONAL no cadastro (HLP0238 — antes era obrigatório
    // pelo #HLP0089): já há confirmação de e-mail no momento do ENVIO do orçamento,
    // e o atalho "Solicitar orçamento" também não exige. Se informado, precisa ser
    // válido (a checagem abaixo passa vazia — every() em lista vazia é true).
    const emails = (form.emailsContatos || '').split(/[,;]/).map(e => e.trim()).filter(Boolean)
    const reEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emails.every(e => reEmail.test(e))) { alerts.error('E-mail inválido', 'Informe um e-mail válido para o contato.'); return }
    if (areasNotificaveis.length > 0 && areasNotificar.length === 0) {
      alerts.error('Selecione as áreas', 'Marque ao menos uma área para notificar.'); return
    }
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
        // Roteiro intacto (nenhuma resposta) não é gravado como detalhamento.
        textoInterno: detalhamentoPreenchido(form.textoInterno, roteiro) ? form.textoInterno : undefined,
      })
      // Vincula as áreas marcadas — é isso que dispara sino/e-mail pro líder (e
      // substituto) com o prazo pra detalhar. Falhar aqui não desfaz o orçamento,
      // que já existe: avisa e segue, pra dar pra vincular na tela de detalhes.
      if (areasNotificar.length) {
        try {
          await (trpc.orcamento as any).vincularAreas.mutate({ orcamentoId: result.id, areaIds: areasNotificar })
        } catch (e) {
          alerts.error('Orçamento criado, mas as áreas não foram notificadas', (e as Error).message)
        }
      }
      setCreateOpen(false)
      setForm(FORM_INITIAL)
      setAreasNotificar([])
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

  /**
   * Destaque sem recarregar a página: atualiza só o card, na hora (a coluna o
   * reposiciona sozinha, porque a ordem sai de `orcByStatus`). Se a API recusar,
   * o card volta como estava.
   */
  async function handleDestacar(id: string, destacar: boolean, cor?: DestaqueCor) {
    const antes = orcamentos.find(o => o.id === id)
    if (!antes) return
    const aplicar = (patch: Partial<OrcamentoRow>) =>
      setOrcamentos(lista => lista.map(o => (o.id === id ? { ...o, ...patch } : o)))
    aplicar(destacar
      ? { destacadoEm: new Date().toISOString(), destacadoCor: cor ?? 'amber', destacadoPorUser: eu ? { id: eu.id, name: eu.name, image: eu.image } : null }
      : { destacadoEm: null, destacadoCor: null, destacadoPorUser: null })
    try {
      const r = await (trpc.orcamento as any).destacar.mutate({ id, destacar, cor }) as { destacadoEm: string | null }
      // Hora oficial do servidor (a local pode diferir alguns segundos).
      if (destacar && r?.destacadoEm) aplicar({ destacadoEm: r.destacadoEm })
    } catch (e) {
      aplicar({ destacadoEm: antes.destacadoEm ?? null, destacadoCor: antes.destacadoCor ?? null, destacadoPorUser: antes.destacadoPorUser ?? null })
      alerts.error('Erro', mensagemErro(e, 'Não foi possível alterar o destaque.'))
    }
  }

  async function handleCancelar(id: string) {
    // #HLP0303 — não existe mais exclusão permanente. Cancelar é soft: o orçamento
    // sai do funil e passa a constar como "Cancelado" no cadastro do cliente.
    const ok = await alerts.confirm({
      title: 'Cancelar este orçamento?',
      text: 'Ele sai do funil e fica registrado como Cancelado no cadastro do cliente (Comercial → Orçamentos). Nada é apagado.',
      confirmText: 'Cancelar orçamento',
      cancelText: 'Voltar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.orcamento as any).cancelar.mutate({ id })
      await alerts.success('Cancelado', 'Orçamento cancelado.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function openCreateModal() {
    setCreateOpen(true)
    try {
      const [cls, usrs] = await Promise.all([
        // Ex-clientes também, como no botão "+" (solicitar orçamento): é assim
        // que um cliente que saiu volta. Vêm marcados no combobox.
        (trpc.cliente as any).listForSelect.query({ incluirInativos: true }),
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
    const daColuna = orcamentos.filter(o => o.status === status)
    // Destacados sobem para o topo (o mais recente primeiro); os demais
    // mantêm a ordem de sempre — sort estável, só separa os dois grupos.
    acc[status] = [
      ...daColuna.filter(o => o.destacadoEm).sort((a, b) => (b.destacadoEm ?? '').localeCompare(a.destacadoEm ?? '')),
      ...daColuna.filter(o => !o.destacadoEm),
    ]
    return acc
  }, {} as Record<string, OrcamentoRow[]>)

  // Nome + final do CNPJ e selo Matriz/Filial (#HLP0410): matriz e filiais
  // de uma mesma empresa apareciam idênticas na lista.
  const getClienteNome = (orc: OrcamentoRow, variante: 'linha' | 'bloco' = 'linha'): ReactNode => {
    if (!orc.clienteId) return null
    const cli = clientesMap.get(orc.clienteId)
    return cli ? <ClienteIdentificacao cliente={cli} variante={variante} /> : null
  }
  // O card do quadro mostra só a razão social; CNPJ e matriz/filial vão para o
  // tooltip do título, por isso ele recebe o cliente cru.
  const getCliente = (orc: OrcamentoRow): ClienteDoc | null =>
    orc.clienteId ? clientesMap.get(orc.clienteId) ?? null : null

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col gap-5 h-[calc(100vh-98px)]" suppressHydrationWarning>
      {/* Header (padrão LuminAux, como o /crm): barra full-bleed com título+trilha
          à esquerda e ações à direita */}
      <PageHeaderBar className="mb-0 sm:mb-0 shrink-0"
        actions={<>
          <Button size="sm" className="gap-1.5" onClick={openCreateModal}>
            <Plus className="h-4 w-4" /> Novo Orçamento
          </Button>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar orçamentos..."
              className="h-9 w-56 pl-8 text-sm"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('kanban'); localStorage.setItem('orcamentos-view-mode', 'kanban') }} title="Kanban">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'tabela' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('tabela'); localStorage.setItem('orcamentos-view-mode', 'tabela') }} title="Tabela">
              <List className="h-4 w-4" />
            </button>
          </div>
          {viewMode === 'kanban' && (
            <div className="flex items-center border rounded-lg overflow-hidden">
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
              'inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium border transition-colors shrink-0',
              filtrosOpen || filtrosAtivos > 0
                ? 'bg-muted border-border text-foreground'
                : 'bg-card border-border text-muted-foreground hover:bg-muted/50',
            )}
            title="Filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-semibold leading-none" style={{ backgroundColor: PRIMARY }}>{filtrosAtivos}</span>
            )}
          </button>
          <button
            onClick={() => { setArquivado(!arquivado); setPage(1) }}
            className={cn(
              'h-9 px-3 rounded-lg text-xs font-medium border transition-colors shrink-0',
              arquivado
                ? BADGE.amber
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
                {isMaster && (
                  <DropdownMenuItem onClick={() => setReprocessarModal(true)}>
                    <Wrench className="h-4 w-4 mr-2" /> Recuperar serviços de aprovados
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>}
      >
        <h1 className="truncate">Orçamentos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Comercial</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Orçamentos</span>
        </p>
      </PageHeaderBar>

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
                <Label className="text-[11px] font-medium text-muted-foreground">Item</Label>
                <CatalogoCombobox catalogo={catalogo} selectedId={itemFilter} onSelect={v => { setItemFilter(v); setPage(1) }} placeholder="Todos os itens" />
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
                  <Checkbox className="cursor-pointer" accentColor={PRIMARY} checked={incluirParalizados} onCheckedChange={v => { setIncluirParalizados(v === true); setPage(1) }} />
                  <span className="text-sm text-foreground">Incluir paralisados</span>
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
              <div className="flex gap-4 px-1 h-full w-max">
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
                      onRelatorio={() => setRelatorioColuna(status)}
                      getCliente={getCliente}
                      onOpenDetail={(id) => router.push(`/orcamentos/${id}`)}
                      onDuplicar={handleDuplicar}
                      onArquivar={handleArquivar}
                      onCancelar={handleCancelar}
                      onDestacar={handleDestacar}
                      onPreview={(id) => (abrirDetalhesDireto ? router.push(`/orcamentos/${id}`) : setPreviewId(id))}
                    />
                  )
                })}
              </div>
            </div>
            <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
              {activeCard && <KanbanCardOverlay orc={activeCard} cliente={getCliente(activeCard)} velocityX={dragDeltaX} />}
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
                <SelectTrigger className="h-8 w-[60px] text-xs"><SelectValue /></SelectTrigger>
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
                  <SelectTrigger className="h-8 w-full text-xs sm:w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
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
                    ? BADGE.amber
                    : 'bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
                )}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Com reaberturas
              </button>
              {/* #HLP0265 — exportação da lista, junto dos demais controles
                  desta linha. Fica aqui, e não na barra do topo, porque exporta
                  exatamente o que estes filtros produziram — é o comportamento
                  do DataTables do sistema legado, a que o time está acostumado.
                  No kanban não aparece: lá o caminho é o relatório da coluna. */}
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs bg-card shrink-0" title="Exportar a lista com os filtros aplicados">
                  <Download className="h-3.5 w-3.5" />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  {total} orçamento{total === 1 ? '' : 's'} no filtro atual
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <a href={urlExportLista('xlsx')} download className="gap-2">
                    <FileSpreadsheet className="h-3.5 w-3.5" /> Excel (.xlsx)
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={urlExportLista('csv')} download className="gap-2">
                    <FileText className="h-3.5 w-3.5" /> CSV
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={urlExportLista('pdf')} download className="gap-2">
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                {/* Em tela estreita ficam cliente, valor e ações. Número e status
                    descem para dentro da célula do cliente; itens, áreas, pessoas
                    e data são apoio e só aparecem quando há espaço. */}
                <SortHead label="#" sortKey="numero" sort={sort} onSort={toggleSort} className="hidden sm:table-cell w-[70px] whitespace-nowrap" />
                <SortHead label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="hidden sm:table-cell w-[100px] whitespace-nowrap" />
                <TableHead className="whitespace-nowrap">Cliente</TableHead>
                <TableHead className="hidden 2xl:table-cell w-[240px] whitespace-nowrap">Itens</TableHead>
                <TableHead className="hidden lg:table-cell w-[150px] whitespace-nowrap">Áreas</TableHead>
                <SortHead label="Valor Total" sortKey="totalGeral" sort={sort} onSort={toggleSort} className="w-[140px] whitespace-nowrap" align="right" />
                <TableHead className="hidden min-[1700px]:table-cell w-[185px] whitespace-nowrap">Solicitante / Resp.</TableHead>
                <SortHead label="Criado em" sortKey="createdAt" sort={sort} onSort={toggleSort} className="hidden md:table-cell w-[125px] whitespace-nowrap" />
                <TableHead className="w-[80px] text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!orcamentos.length ? (
                <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhum orçamento encontrado
                </TableCell></TableRow>
              ) : orcamentos.map(orc => (
                <TableRow key={orc.id} className="cursor-pointer hover:bg-muted/40 sm:whitespace-nowrap" onClick={() => (abrirDetalhesDireto ? router.push(`/orcamentos/${orc.id}`) : setPreviewId(orc.id))}>
                  <TableCell className="hidden sm:table-cell font-mono text-xs font-medium">{orc.numero}</TableCell>
                  <TableCell className="hidden sm:table-cell"><StatusBadge status={orc.status} /></TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="flex min-w-0">{getClienteNome(orc) || '—'}</span>
                      {orc.paralizado && (
                        <Badge variant="outline" className={cn('shrink-0 text-[10px] px-1.5 py-0 border-transparent font-medium', BADGE.amber)}>Paralisado</Badge>
                      )}
                      {orc.status === 'APROVADO' && orc.servicosConcluidos && (
                        <Badge variant="outline" title="Serviço concluído — ao liberar, o orçamento é finalizado automaticamente"
                          className={cn('shrink-0 text-[10px] px-1.5 py-0 border-transparent font-medium', BADGE.emerald)}>Serviço concluído</Badge>
                      )}
                    </span>
                    {/* Número e status, que ganham coluna a partir de `sm` */}
                    <span className="mt-1 flex items-center gap-1.5 sm:hidden">
                      <span className="font-mono text-[11px] text-muted-foreground">#{orc.numero}</span>
                      <StatusBadge status={orc.status} />
                    </span>
                  </TableCell>
                  <TableCell className="hidden 2xl:table-cell text-xs"><ItensPreview orc={orc} /></TableCell>
                  <TableCell className="hidden lg:table-cell"><AreasCell areas={orc.areas} /></TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(Number(orc.totalGeral || orc.valorTotal || 0))}</TableCell>
                  <TableCell className="hidden min-[1700px]:table-cell text-xs">
                    <PessoasCell solicitante={orc.solicitante} responsavel={orc.responsavel} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{formatDate(orc.createdAt)}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => router.push(`/orcamentos/${orc.id}`)}><FileText className="h-4 w-4" />Detalhes</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicar(orc.id)}><Copy className="h-4 w-4" />Duplicar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleArquivar(orc.id)}><Archive className="h-4 w-4" />Arquivar</DropdownMenuItem>
                        <DropdownMenuItem className={TEXT.amber} onClick={() => handleCancelar(orc.id)}><Ban className="h-4 w-4" />Cancelar</DropdownMenuItem>
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
      <ReprocessarServicosModal open={reprocessarModal} onOpenChange={setReprocessarModal} />

      {/* Preview do orçamento — abre ao clicar no card do quadro */}
      {(() => {
        const o = previewId ? orcamentos.find(x => x.id === previewId) ?? null : null
        return (
          <PreviewOrcamento
            orc={o}
            cliente={o ? getCliente(o) : null}
            prazo={o ? calcularPrazoCard(o, orcConfig) : null}
            statusLabel={o ? (STATUS_LABELS[o.status] ?? o.status) : ''}
            statusCor={o ? (STATUS_COLORS[o.status] ?? '#94a3b8') : '#94a3b8'}
            onClose={() => setPreviewId(null)}
            onAbrir={(id) => router.push(`/orcamentos/${id}`)}
          />
        )
      })()}

      {/* Relatório de uma coluna do kanban (menu ⋮ da coluna) */}
      {relatorioColuna && (
        <RelatorioColunaModal
          open={!!relatorioColuna}
          onClose={() => setRelatorioColuna(null)}
          status={relatorioColuna}
          statusLabel={STATUS_LABELS[relatorioColuna] || relatorioColuna}
          moduleColor={PRIMARY}
        />
      )}

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
                placeholder="Selecione o cliente ou digite o nome"
                marcarExClientes
                onCreate={async (nome) => {
                  try {
                    const novo = await (trpc.orcamento as any).criarClienteRapido.mutate({ nome }) as { id: string; razaoSocial: string; documento?: string | null } | null
                    if (!novo) { alerts.error('Erro', 'Não foi possível cadastrar o cliente.'); return null }
                    // Entra na lista já selecionado — sem isto o combobox
                    // mostraria o campo vazio logo após cadastrar.
                    setClientes(prev => prev.some(c => c.id === novo.id) ? prev : [...prev, { id: novo.id, razaoSocial: novo.razaoSocial, documento: novo.documento ?? null }])
                    return novo.id
                  } catch (e) {
                    alerts.error('Erro ao cadastrar cliente', (e as Error).message)
                    return null
                  }
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                A busca cobre os clientes da empresa carregada, inclusive ex-clientes (marcados na lista).
                Cliente não cadastrado? Digite o nome — cadastramos automaticamente como prospect.
              </p>
            </div>

            {/* Contato + E-mail do contato */}
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-3 space-y-1.5">
                <Label className="text-xs font-medium">Contato</Label>
                <Input className="h-9 text-sm" value={form.contatos} onChange={e => setForm({ ...form, contatos: e.target.value })} placeholder="Nome do contato" />
              </div>
              <div className="col-span-12 sm:col-span-9 space-y-1.5">
                <Label className="text-xs font-medium">E-mail do Contato</Label>
                <Input className="h-9 text-sm" type="email" value={form.emailsContatos} onChange={e => setForm({ ...form, emailsContatos: e.target.value })} placeholder="contato@empresa.com.br" />
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

            {/* Notificar áreas (pills) — mesma lista e mesmo efeito do balão do FAB */}
            <AreasNotificarPicker areas={areasNotificaveis} value={areasNotificar} onChange={setAreasNotificar} accent={PRIMARY} required />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button size="sm" variant="success" className="gap-1.5" onClick={handleCreate} disabled={creating || !form.clienteId}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar Orçamento
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

function KanbanColumn({ status, items, isOver, activeCardId, collapsed, dropDisabled, draggable, onToggleCollapse, onRelatorio, getCliente, onOpenDetail, onDuplicar, onArquivar, onCancelar, onDestacar, onPreview }: {
  status: string
  items: OrcamentoRow[]
  isOver: boolean
  activeCardId: string | null
  collapsed: boolean
  dropDisabled: boolean
  draggable: boolean
  onToggleCollapse: () => void
  onRelatorio: () => void
  getCliente: (orc: OrcamentoRow) => ClienteDoc | null
  onOpenDetail: (id: string) => void
  onDuplicar: (id: string) => void
  onArquivar: (id: string) => void
  onCancelar: (id: string) => void
  onDestacar: (id: string, destacar: boolean, cor?: DestaqueCor) => void
  onPreview: (id: string) => void
}) {
  // Quando user não pode mover, desabilita também o drop (defesa em profundidade)
  const { setNodeRef } = useDroppable({ id: status, disabled: dropDisabled || !draggable })
  const color = STATUS_COLORS[status] || '#94a3b8'
  const label = STATUS_LABELS[status] || status
  // Barra de rolagem da pilha só aparece enquanto o usuário rola
  const scrollRef = useAutoHideScrollbar<HTMLDivElement>()

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={cn(
          'w-[44px] h-full shrink-0 flex flex-col rounded-xl border border-border/60 bg-card overflow-hidden transition-all duration-200 cursor-pointer hover:border-border',
          isOver && !dropDisabled && 'crm-column-over',
          dropDisabled && 'opacity-40 grayscale cursor-not-allowed',
        )}
        onClick={onToggleCollapse}
        title={dropDisabled ? `Movimento bloqueado: não é possível mover para "${label}" a partir do status atual` : `Expandir coluna ${label}`}
      >
        <div className="flex flex-col items-center gap-1.5 py-2 border-b border-border/60">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
            title="Expandir coluna"
            className="p-0.5 rounded hover:bg-white/60 dark:hover:bg-black/20 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </button>
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{items.length}</span>
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
        // Padrão do /crm (LuminAux): coluna ABERTA — sem caixa/fundo; os cards
        // flutuam sobre o fundo da página. Só o drop-target ganha um véu sutil.
        'w-[340px] h-full shrink-0 flex flex-col rounded-xl transition-colors relative',
        isOver && !dropDisabled && 'bg-black/[0.03] dark:bg-white/[0.04]',
        dropDisabled && 'opacity-40 grayscale',
      )}
      style={isOver && !dropDisabled ? { boxShadow: `0 0 0 2px ${color}55` } : undefined}
      title={dropDisabled ? `Movimento bloqueado para "${label}". Para voltar a status anteriores, use a opção "Reabrir orçamento" no menu de ações.` : undefined}
    >
      {dropDisabled && (
        <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center rounded-xl bg-rose-50/40 dark:bg-rose-900/20 backdrop-blur-[1px]">
          <div className="rounded-md bg-white/95 dark:bg-card/95 px-3 py-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-300 shadow-sm border border-rose-200/60">
            🚫 Não permitido
          </div>
        </div>
      )}
      {/* Header: dot da cor + nome + contador em pill tintada + ações */}
      <div className="px-1.5 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold truncate">{label}</span>
          <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{items.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-0.5 sm:shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title="Opções da coluna"
                className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onRelatorio}>
                <BarChart3 className="h-4 w-4 mr-2" /> Relatório da coluna
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Recolher coluna"
            className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-foreground transition-colors"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        </div>
      </div>
      <SortableContext items={items.map(o => o.id)} strategy={verticalListSortingStrategy}>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto scrollbar-autohide min-h-[120px] px-1.5 pt-0.5 pb-2">
          {items.map(orc => (
            <KanbanCard
              key={orc.id}
              orc={orc}
              isDraggingAny={!!activeCardId}
              cliente={getCliente(orc)}
              draggable={draggable}
              onOpenDetail={onOpenDetail}
              onDuplicar={onDuplicar}
              onArquivar={onArquivar}
              onCancelar={onCancelar}
              onDestacar={onDestacar}
              onPreview={onPreview}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function KanbanCard({ orc, isDraggingAny, cliente, draggable, onOpenDetail, onDuplicar, onArquivar, onCancelar, onDestacar, onPreview }: {
  orc: OrcamentoRow
  isDraggingAny: boolean
  cliente: ClienteDoc | null
  draggable: boolean
  onOpenDetail: (id: string) => void
  onDuplicar: (id: string) => void
  onArquivar: (id: string) => void
  onCancelar: (id: string) => void
  onDestacar: (id: string, destacar: boolean, cor?: DestaqueCor) => void
  onPreview: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: orc.id, disabled: !draggable })
  const style = {
    transform: CSS.Transform.toString(transform),
    // O dnd-kit controla `transition` do movimento; a da cor da borda (fade do
    // destaque) vai junto, senão uma sobrescreveria a outra.
    transition: [transition, 'border-color 500ms ease-out', 'box-shadow 500ms ease-out'].filter(Boolean).join(', '),
    opacity: isDragging ? 0.3 : 1,
    // Destacado: borda e sombra na mesma cor. Três camadas leves que se somam
    // num degradê suave (hex + alfa: 26 ≈ 15%, 38 ≈ 22%). Nenhuma passa de 6px
    // para os lados: a lista da coluna tem 6px de margem e rola, então sombra
    // mais larga era cortada e deixava a borda grosseira.
    ...(orc.destacadoEm && !isDragging
      ? {
          borderColor: DESTAQUE_COR[corDoDestaque(orc)],
          boxShadow: [
            `0 1px 2px ${DESTAQUE_COR[corDoDestaque(orc)]}26`,
            `0 2px 5px ${DESTAQUE_COR[corDoDestaque(orc)]}26`,
            `0 4px 8px -3px ${DESTAQUE_COR[corDoDestaque(orc)]}38`,
          ].join(', '),
        }
      : { boxShadow: '0 0 0 transparent, 0 0 0 transparent, 0 0 0 transparent' }),
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      className={cn(
        'rounded-md bg-white dark:bg-card group touch-none overflow-hidden',
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging ? 'border border-transparent opacity-30'
          // Destacado: borda de 1px na cor escolhida (inline, ver DESTAQUE_COR).
          : orc.destacadoEm ? 'border'
          : 'border border-border/60',
      )}
      // Clique abre o preview; o "Detalhes" do menu ⋮ segue indo à página.
      onClick={() => { if (!isDraggingAny) onPreview(orc.id) }}
    >
      <KanbanCardContent orc={orc} cliente={cliente} onDuplicar={onDuplicar} onArquivar={onArquivar} onCancelar={onCancelar} onDestacar={onDestacar} onOpenDetail={onOpenDetail} showMenu={!isDraggingAny} />
    </div>
  )
}

function KanbanCardOverlay({ orc, cliente, velocityX }: { orc: OrcamentoRow; cliente: ClienteDoc | null; velocityX: number }) {
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
      // Largura casa com o card da coluna (w-[340px] - padding px-1.5 12px = 328px),
      // pra evitar o efeito "encolher" ao iniciar o drag e "voltar ao normal" ao soltar.
      className="rounded-md bg-white dark:bg-card w-[328px] overflow-hidden"
      style={{
        transform: `rotate(${rotation.toFixed(2)}deg) scale(1.02)`,
        transformOrigin: 'top center',
        boxShadow: `0 10px 25px rgba(0,0,0,0.15)`,
      }}
    >
      <KanbanCardContent orc={orc} cliente={cliente} onDuplicar={() => {}} onArquivar={() => {}} onCancelar={() => {}} onDestacar={() => {}} onOpenDetail={() => {}} showMenu={false} />
    </div>
  )
}

function KanbanCardContent({ orc, cliente, onDuplicar, onArquivar, onCancelar, onDestacar, onOpenDetail, showMenu }: {
  orc: OrcamentoRow
  cliente: ClienteDoc | null
  onOpenDetail: (id: string) => void
  onDuplicar: (id: string) => void
  onArquivar: (id: string) => void
  onCancelar: (id: string) => void
  onDestacar: (id: string, destacar: boolean, cor?: DestaqueCor) => void
  showMenu: boolean
}) {
  const valor = Number(orc.totalGeral || orc.valorTotal || 0)
  const prazo = calcularPrazoCard(orc, useContext(OrcConfigContext))
  // Avisos do badge informativo do cabeçalho (o papel que era da quina), do
  // mais importante ao menos. O badge mostra o primeiro; o tooltip, todos.
  const avisos: Array<{ curto: string; label: string; detalhe?: string; Icon: typeof Clock; cor: string }> = []
  if (orc.decisaoTipo) {
    const quando = orc.decisaoEm
      ? `Respondido em ${new Date(orc.decisaoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
      : undefined
    avisos.push(orc.decisaoTipo === 'APROVADO'
      ? { curto: 'Aprovado', label: 'Cliente aprovou pelo link', detalhe: quando, Icon: CheckCircle2, cor: AVISO_COR.verde }
      : orc.decisaoTipo === 'REVISAO_SOLICITADA'
      ? { curto: 'Revisão', label: 'Cliente pediu revisão', detalhe: quando, Icon: Pencil, cor: AVISO_COR.ambar }
      : { curto: 'Recusado', label: 'Cliente recusou pelo link', detalhe: quando, Icon: ThumbsDown, cor: AVISO_COR.vermelho })
  }
  if (prazo.variant === 'danger') avisos.push({ curto: prazo.label === 'vence hoje' ? 'Vence hoje' : 'Vencido', label: `Prazo ${prazo.label}`, detalhe: prazo.tooltip, Icon: AlertTriangle, cor: AVISO_COR.vermelho })
  else if (prazo.variant === 'warning') avisos.push({ curto: 'Vencendo', label: `Prazo: ${prazo.label}`, detalhe: prazo.tooltip, Icon: Clock, cor: AVISO_COR.ambar })
  if (orc.status === 'APROVADO' && orc.servicosConcluidos) avisos.push({ curto: 'Serviço concluído', label: 'Serviço concluído', detalhe: 'Ao liberar, o orçamento é finalizado automaticamente', Icon: CheckCircle2, cor: AVISO_COR.verde })
  if (orc.paralizado) avisos.push({ curto: 'Paralisado', label: 'Orçamento paralisado', Icon: Pause, cor: AVISO_COR.ambar })
  const aviso = avisos[0] ?? null

  // Cabeçalho: nome curto (fantasia, senão a razão social); o corpo traz a
  // razão social completa em uma linha.
  const nomeCurto = cliente?.nomeFantasia?.trim() || cliente?.razaoSocial || 'Sem cliente'
  const doc = cliente?.documento ? formatDocumento(cliente.documento) : ''
  const ehCnpj = cliente?.tipoDocumento ? cliente.tipoDocumento === 'CNPJ' : doc.length > 14
  const matriz = ehCnpj && cliente ? ehMatrizCnpj(cliente.documento, cliente.ehMatriz, cliente.tipoDocumento) : false
  // Relógio do rodapé em versão curta ("3d p/ enviar" → "3d"); a frase inteira fica no tooltip.
  const prazoCurto = prazo.label.replace(/\s*p\/.*$/, '')
  const prazoCor: Record<typeof prazo.variant, string> = {
    ok: 'text-muted-foreground', neutral: 'text-muted-foreground',
    warning: TEXT.amber, danger: cn(TEXT.rose, 'font-semibold'),
  }

  return (
    <div className="flex flex-col">
      {/* Cabeçalho — logo + nome curto à esquerda; nº do orçamento e badge informativo à direita */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-dashed border-border transition-colors duration-500 ease-out"
        style={{ backgroundColor: orc.destacadoEm ? `${DESTAQUE_COR[corDoDestaque(orc)]}12` : 'transparent' }}
      >
        <LogoCliente nome={cliente?.nomeFantasia || cliente?.razaoSocial} logoUrl={cliente?.logoUrl} />
        <DadosClienteTooltip numero={orc.numero} cliente={cliente}>
          <span className="min-w-0 flex-1 cursor-help truncate text-[13px] font-semibold">{nomeCurto}</span>
        </DadosClienteTooltip>
        {ehExCliente(cliente) && <SeloExCliente />}
        <div className="flex shrink-0 items-center gap-1">
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-foreground/80">#{orc.numero}</span>
          {aviso && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex max-w-[110px] cursor-help items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                  // Cor inline (fundo = a cor com ~10% de alfa): em classe, o vermelho sofre o retint do módulo.
                  style={{ backgroundColor: `${aviso.cor}1A`, color: aviso.cor }}
                  onClick={e => e.stopPropagation()}
                  onPointerDown={e => e.stopPropagation()}
                >
                  <aviso.Icon className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                  <span className="truncate">{aviso.curto}</span>
                  {avisos.length > 1 && <span className="shrink-0 opacity-70">+{avisos.length - 1}</span>}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" sideOffset={6} className="tooltip-fade text-[11px] max-w-[280px]">
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
          <div className="-mr-1 h-6 w-6 shrink-0">
              {showMenu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
                    <button className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-muted">
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                    <DropdownMenuItem onClick={() => onOpenDetail(orc.id)}><Eye className="h-3.5 w-3.5 mr-2" /> Detalhes</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDuplicar(orc.id)}><Copy className="h-3.5 w-3.5 mr-2" /> Duplicar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <p className="flex items-center gap-2 px-2 pt-1 text-xs text-muted-foreground">
                      <Highlighter className="h-3.5 w-3.5" /> {orc.destacadoEm ? 'Cor do destaque' : 'Destacar'}
                    </p>
                    {/* Uma bolinha por cor; cada uma é item do menu (teclado e
                        fechamento ao escolher vêm de graça). */}
                    <div className="flex items-center gap-1 px-1.5 pb-1 pt-1.5">
                      {DESTAQUE_CORES.map(c => {
                        const atual = !!orc.destacadoEm && corDoDestaque(orc) === c
                        return (
                          <DropdownMenuItem
                            key={c}
                            title={DESTAQUE_COR_LABELS[c]}
                            aria-label={`Destacar em ${DESTAQUE_COR_LABELS[c]}`}
                            onClick={() => { if (!atual) onDestacar(orc.id, true, c) }}
                            className="h-7 w-7 justify-center rounded-full p-0"
                          >
                            <span className={cn('flex h-4 w-4 items-center justify-center rounded-full', atual && 'ring-2 ring-offset-2 ring-offset-popover ring-foreground/40')} style={{ backgroundColor: DESTAQUE_COR[c] }}>
                              {atual && <Check className="!size-2.5 text-white" strokeWidth={3} />}
                            </span>
                          </DropdownMenuItem>
                        )
                      })}
                    </div>
                    {orc.destacadoEm && (
                      <DropdownMenuItem onClick={() => onDestacar(orc.id, false)}>
                        <X className="h-3.5 w-3.5 mr-2" /> Remover destaque
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onArquivar(orc.id)}><Archive className="h-3.5 w-3.5 mr-2" /> Arquivar</DropdownMenuItem>
                    <DropdownMenuItem className={TEXT.amber} onClick={() => onCancelar(orc.id)}><Ban className="h-3.5 w-3.5 mr-2" /> Cancelar</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
          </div>
        </div>
      </div>

      {/* Corpo — uma informação por linha, cada uma com seu ícone */}
      <div className="space-y-1.5 px-3 py-2.5 text-[12px] text-foreground/85">
        <LinhaCard icone={Building2}>
          <span className="truncate">{cliente?.razaoSocial || 'Sem cliente'}</span>
        </LinhaCard>
        {doc && (
          <LinhaCard icone={IdCard}>
            <span className="truncate tabular-nums">{ehCnpj ? `CNPJ ${doc}` : `CPF ${doc}`}</span>
            {ehCnpj && <span className="shrink-0 text-muted-foreground">· {matriz ? 'Matriz' : 'Filial'}</span>}
          </LinhaCard>
        )}
        <LinhaCard icone={ListChecks}>
          {orc.itens && orc.itens.length > 0 ? (
            <>
              <span className="truncate">{stripHtml(orc.itens[0]!.descricao)}</span>
              {(orc._count?.itens ?? orc.itens.length) > 1 && (
                <ItensRestantesTooltip restantes={(orc.itensDescricoes ?? []).slice(1)}>
                  <span className="shrink-0 cursor-help text-[11px] font-medium text-primary-on-surface">
                    +{(orc._count?.itens ?? orc.itens.length) - 1}
                  </span>
                </ItensRestantesTooltip>
              )}
            </>
          ) : (
            <span className="truncate text-muted-foreground">{orc.observacoes ? stripHtml(orc.observacoes) : 'Sem serviços'}</span>
          )}
          {valor > 0 && (
            <span className={cn('ml-auto shrink-0 pl-2 font-semibold tabular-nums', TEXT.emerald)}>{formatCurrency(valor)}</span>
          )}
        </LinhaCard>
        {orc.solicitante && (
          <div className="flex min-w-0 items-center gap-2">
            <AvatarPequeno user={orc.solicitante} />
            <span className="truncate">{orc.solicitante.name}</span>
          </div>
        )}
      </div>

      {/* Rodapé — contadores à esquerda, relógio do prazo à direita */}
      <div className="flex items-center justify-between gap-2 border-t border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
        <div className="flex min-w-0 items-center gap-3">
          {orc.destacadoEm && (
            <DicaIcone
              titulo="Card destacado"
              texto={`${orc.destacadoPorUser?.name ? `Por ${orc.destacadoPorUser.name} em ` : 'Em '}${new Date(orc.destacadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
            >
              <span className="flex cursor-help items-center" style={{ color: DESTAQUE_COR[corDoDestaque(orc)] }}>
                <Highlighter className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
            </DicaIcone>
          )}
          {orc.oportunidadeId && (
            <DicaIcone titulo={`CRM${orc.oportunidadeNumero != null ? ` #${orc.oportunidadeNumero}` : ''}`} texto="Card de CRM vinculado">
              <span className={cn('flex cursor-help items-center gap-1 tabular-nums', TEXT.fuchsia)}>
                <Target className="h-3.5 w-3.5" strokeWidth={1.5} />
                {orc.oportunidadeNumero != null && orc.oportunidadeNumero}
              </span>
            </DicaIcone>
          )}
          {/* Contadores só aparecem com algo a contar — zero não informa nada. */}
          {(orc._count?.itens ?? 0) > 0 && (
            <DicaIcone titulo={`${orc._count!.itens} ${orc._count!.itens === 1 ? 'item' : 'itens'}`} texto="Serviços, taxas e despesas do orçamento">
              <span className="flex cursor-help items-center gap-1"><ListChecks className="h-3.5 w-3.5" strokeWidth={1.5} /> {orc._count!.itens}</span>
            </DicaIcone>
          )}
          {(orc._count?.mensagens ?? 0) > 0 && (
            <DicaIcone titulo={`${orc._count!.mensagens} ${orc._count!.mensagens === 1 ? 'mensagem' : 'mensagens'}`} texto="Mensagens trocadas no orçamento">
              <span className="flex cursor-help items-center gap-1"><MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} /> {orc._count!.mensagens}</span>
            </DicaIcone>
          )}
          {(orc._count?.arquivos ?? 0) > 0 && (
            <DicaIcone titulo={`${orc._count!.arquivos} ${orc._count!.arquivos === 1 ? 'arquivo' : 'arquivos'}`} texto="Anexos do orçamento">
              <span className="flex cursor-help items-center gap-1"><Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} /> {orc._count!.arquivos}</span>
            </DicaIcone>
          )}
          {orc.pesquisaRespondida && (
            <DicaIcone titulo="Pesquisa respondida" texto="O cliente respondeu a pesquisa de satisfação">
              <span className="flex cursor-help items-center text-primary-on-surface">
                <Star className="h-3.5 w-3.5 fill-current" />
              </span>
            </DicaIcone>
          )}
        </div>
        <DicaIcone titulo={prazo.label} texto={prazo.tooltip}>
          <span className={cn('flex shrink-0 cursor-help items-center gap-1 tabular-nums', prazoCor[prazo.variant])}>
            <Clock className="h-3.5 w-3.5" strokeWidth={1.5} /> {prazoCurto}
          </span>
        </DicaIcone>
      </div>
    </div>
  )
}

/**
 * Tooltip do título do card: nome completo (o título corta com "…") e os dados
 * que saíram do card para liberar espaço — CNPJ formatado e se é matriz ou
 * filial (#HLP0410). Abre sempre, já que essa informação não está mais à vista.
 */
function DadosClienteTooltip({ numero, cliente, children }: { numero: number; cliente: ClienteDoc | null; children: React.ReactElement }) {
  const tipo = cliente?.tipoDocumento ?? null
  const doc = cliente?.documento ? formatDocumento(cliente.documento) : ''
  const ehCnpj = tipo ? tipo === 'CNPJ' : doc.length > 14
  let linhaDoc = cliente ? 'Sem CPF/CNPJ no cadastro' : ''
  if (doc) {
    linhaDoc = ehCnpj
      ? `CNPJ ${doc} · ${ehMatrizCnpj(cliente!.documento, cliente!.ehMatriz, tipo) ? 'Matriz' : 'Filial'}`
      : `CPF ${doc}`
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={6} className="tooltip-fade text-[11px] max-w-[320px]">
        <p className="font-semibold">#{numero} {cliente?.razaoSocial || 'Sem cliente'}</p>
        {linhaDoc && <p>{linhaDoc}</p>}
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
      <TooltipContent side="top" sideOffset={6} className="tooltip-fade text-[11px] max-w-[280px]">
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

