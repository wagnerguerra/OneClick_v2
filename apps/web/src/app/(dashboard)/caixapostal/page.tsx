'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Search, Loader2, Trash2, RefreshCw, CheckCircle2, AlertTriangle, Clock,
  FileText, Eye, X, Mail, Play, Inbox, BookOpen, ArrowLeft, Send,
  MailOpen, MailWarning, RotateCcw, Shield, UserX, Filter,
  User, History, MessageSquare, ClipboardList, Archive, ArchiveRestore,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Star,
  CalendarClock, ExternalLink, MoreVertical, PanelRightOpen, Maximize2,
} from 'lucide-react'
import Link from 'next/link'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Checkbox,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import { useUserPermissions } from '@/hooks/use-user-permissions'

// ============================================================
// Tipos
// ============================================================

interface ClienteMensal {
  id: string
  razaoSocial: string
  documento: string
  tipoDocumento: string
  alertaProcuracao?: boolean
}

interface StatusInfo {
  status: string | null
  total: number
  lidas: number
  nao_lidas: number
  ultima_sync: string | null
}

interface MensagemClassificada {
  isn?: string
  ISN?: string
  assuntoModelo?: string
  origemModelo?: string
  descricaoOrigem?: string
  dataEnvio?: string
  horaEnvio?: string
  codigoSistemaRemetente?: string
  prioridade: string
  score: number
  motivos: string[]
  acao_recomendada: string
  sla_dias: number | null
  prazo_urgente: boolean
  precisa_triagem_humana: boolean
  lida: boolean
  data_leitura?: string | null
  [key: string]: unknown
}

// ============================================================
// Helpers
// ============================================================

const PRIORIDADE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  P0: { bg: 'bg-red-600 dark:bg-red-700', text: 'text-white', border: 'border-red-700 dark:border-red-600' },
  P1: { bg: 'bg-orange-500 dark:bg-orange-600', text: 'text-white', border: 'border-orange-600 dark:border-orange-500' },
  P2: { bg: 'bg-amber-400 dark:bg-amber-500', text: 'text-amber-950 dark:text-amber-950', border: 'border-amber-500 dark:border-amber-400' },
  P3: { bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', border: 'border-gray-300 dark:border-gray-600' },
}

function PrioridadeBadge({ p }: { p: string }) {
  const c = PRIORIDADE_COLORS[p] || PRIORIDADE_COLORS.P3!
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold shadow-sm', c.bg, c.text, c.border)}>
      {p === 'P0' && <AlertTriangle className="h-3 w-3" />}
      {p === 'P1' && <MailWarning className="h-3 w-3" />}
      {p === 'P2' && <Clock className="h-3 w-3" />}
      {p === 'P3' && <Mail className="h-3 w-3" />}
      {p}
    </span>
  )
}

function formatDoc(doc: string) {
  if (doc.length === 11) return masks.cpf(doc)
  return masks.cnpj(doc)
}

function formatDateSerpro(d: string | undefined) {
  if (!d) return '—'
  if (d.length === 8) return `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`
  return d
}

// ============================================================
// Componente principal
// ============================================================

interface MensagemAgregada extends MensagemClassificada {
  contribuinte?: string
  clienteNome?: string
}

const PRIORIDADE_LABELS: Record<string, string> = {
  P0: 'Crítica',
  P1: 'Alta',
  P2: 'Média',
  P3: 'Baixa',
}

export default function CaixaPostalPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const prioridadeParam = searchParams.get('prioridade') as 'P0' | 'P1' | 'P2' | 'P3' | null
  const importanteParam = searchParams.get('importante') === '1'

  // Sub-permissões do módulo caixapostal
  const { isMaster, permissions } = useUserPermissions()
  const caixaPostalPerm = permissions.find(p => p.moduleSlug === 'caixapostal')
  const subPerms = (caixaPostalPerm?.subPermissions ?? {}) as Record<string, boolean>
  const canBulkActions = isMaster || subPerms.bulk_actions === true
  const canArchiveDelete = isMaster || subPerms.archive_delete === true
  const canReclassify = isMaster || subPerms.reclassify === true
  const canGestao = isMaster || subPerms.manage_gestao === true

  // Visão filtrada por prioridade ou importantes (vindo do dashboard)
  const [mensagensAgregadas, setMensagensAgregadas] = useState<MensagemAgregada[]>([])
  const [agregadasLoading, setAgregadasLoading] = useState(false)
  const [modoFiltrado, setModoFiltrado] = useState(false)
  const [modoFiltradoTipo, setModoFiltradoTipo] = useState<'prioridade' | 'importante'>('prioridade')

  // Carregar mensagens filtradas se vier do dashboard
  useEffect(() => {
    if (!prioridadeParam && !importanteParam) {
      setModoFiltrado(false)
      return
    }
    setModoFiltrado(true)
    setModoFiltradoTipo(importanteParam ? 'importante' : 'prioridade')
    setAgregadasLoading(true)
    trpc.caixaPostal.listarPorPrioridade.query({
      prioridade: prioridadeParam || undefined,
      importante: importanteParam || undefined,
    })
      .then((result: unknown) => {
        const res = result as { mensagens: MensagemAgregada[]; total: number }
        setMensagensAgregadas(res.mensagens)
      })
      .catch((e: unknown) => {
        alerts.error('Erro', (e as Error).message)
        setMensagensAgregadas([])
      })
      .finally(() => setAgregadasLoading(false))
  }, [prioridadeParam, importanteParam])

  // Estado principal
  const [clientes, setClientes] = useState<ClienteMensal[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, StatusInfo>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'pendentes' | 'lidas'>('todos')
  const [paginaClientes, setPaginaClientes] = useState(1)
  const [limitClientes, setLimitClientes] = useState(10)
  const PAGE_SIZES = [10, 20, 50, 100]

  // Seleção para inativação em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [inativandoLote, setInativandoLote] = useState(false)

  // Loading individual por cliente (atualizar / inativar)
  const [refreshingCliente, setRefreshingCliente] = useState<string | null>(null)
  const [inativandoCliente, setInativandoCliente] = useState<string | null>(null)

  // Estado de detalhe do cliente
  const [selectedCliente, setSelectedCliente] = useState<ClienteMensal | null>(null)
  const [mensagens, setMensagens] = useState<MensagemClassificada[]>([])
  const [mensagensLoading, setMensagensLoading] = useState(false)
  const [filtroLeitura, setFiltroLeitura] = useState<'todas' | 'lidas' | 'nao_lidas'>('todas')
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>('')
  const [verArquivadas, setVerArquivadas] = useState(false)
  const [msgSelecionadas, setMsgSelecionadas] = useState<Set<string>>(new Set())
  const [paginaMsg, setPaginaMsg] = useState(1)
  const [limitMsg, setLimitMsg] = useState(10)
  const PAGE_SIZES_MSG = [10, 20, 50, 100]

  // Modo de visualização: modal ou painel lateral
  const [viewMode, setViewMode] = useState<'modal' | 'painel'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('caixapostal-view-mode') as 'modal' | 'painel') || 'modal'
    }
    return 'modal'
  })

  // Estado de detalhe da mensagem
  const [detalheOpen, setDetalheOpen] = useState(false)
  const [detalheData, setDetalheData] = useState<unknown>(null)
  const [detalheMsg, setDetalheMsg] = useState<MensagemClassificada | null>(null)
  const [detalheLoading, setDetalheLoading] = useState(false)

  // Gestão da mensagem (dentro do modal de detalhe)
  const [itemDetalhes, setItemDetalhes] = useState<Record<string, unknown> | null>(null)
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [detalheTab, setDetalheTab] = useState<'conteudo' | 'gestao' | 'historico'>('conteudo')
  const [gestaoToast, setGestaoToast] = useState<string | null>(null)
  const gestaoToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showGestaoToast(msg: string) {
    if (gestaoToastTimer.current) clearTimeout(gestaoToastTimer.current)
    setGestaoToast(msg)
    gestaoToastTimer.current = setTimeout(() => setGestaoToast(null), 2500)
  }

  // Modal de agendamento
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleData, setScheduleData] = useState<{ config: { enabled: boolean; cron: string; delayMs: number; filter: string; clienteIds: string[] }; lastRun: string | null; lastResult: { total: number; success: number; failed: number; startedAt: string; finishedAt: string } | null; nextRun: string | null; isRunning: boolean } | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleClientes, setScheduleClientes] = useState<Array<{ id: string; razaoSocial: string; documento: string }>>([])
  const [scheduleClienteSearch, setScheduleClienteSearch] = useState('')
  const [scheduleProgress, setScheduleProgress] = useState<{ current: number; total: number; currentCliente: string; status: string; items: Array<{ razaoSocial: string; status: string; erro?: string }> } | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Histórico de execuções
  const [scheduleTab, setScheduleTab] = useState<'config' | 'historico'>('config')
  const [execLogs, setExecLogs] = useState<Array<{
    id: string; tipo: string; iniciadoPor: string | null; nomeUsuario: string | null
    iniciadoEm: string; finalizadoEm: string | null; total: number; sucesso: number; falhas: number
    status: string; itens: Array<{ razaoSocial: string; documento: string; status: string; erro?: string; duracaoMs?: number }>
  }>>([])
  const [execLogsTotal, setExecLogsTotal] = useState(0)
  const [execLogsPage, setExecLogsPage] = useState(0)
  const [execLogsLoading, setExecLogsLoading] = useState(false)
  const [execLogDetalhe, setExecLogDetalhe] = useState<typeof execLogs[0] | null>(null)

  const DIAS_SEMANA = [
    { key: '1', label: 'Seg' },
    { key: '2', label: 'Ter' },
    { key: '3', label: 'Qua' },
    { key: '4', label: 'Qui' },
    { key: '5', label: 'Sex' },
    { key: '6', label: 'Sáb' },
    { key: '0', label: 'Dom' },
  ]
  const HORAS_DISPONIVEIS = Array.from({ length: 24 }, (_, i) => i)

  // Parsear cron para dias/horas e vice-versa
  function parseCron(cron: string): { dias: string[]; horas: number[] } {
    const parts = cron.split(' ')
    if (parts.length < 5) return { dias: ['1','2','3','4','5','6','0'], horas: [6] }
    const horasStr = parts[1] || '6'
    const diasStr = parts[4] || '*'
    const horas = horasStr === '*' ? [6] : horasStr.includes('/') ? [Number(horasStr.replace('*/', '')) || 6] : horasStr.split(',').map(Number)
    const dias = diasStr === '*' ? ['1','2','3','4','5','6','0'] : diasStr.includes('-')
      ? Array.from({ length: Number(diasStr.split('-')[1]) - Number(diasStr.split('-')[0]) + 1 }, (_, i) => String(Number(diasStr.split('-')[0]) + i))
      : diasStr.split(',')
    return { dias, horas }
  }

  function buildCron(dias: string[], horas: number[]): string {
    const horasStr = horas.sort((a, b) => a - b).join(',')
    const allDays = dias.length === 7
    const diasStr = allDays ? '*' : dias.join(',')
    return `0 ${horasStr} * * ${diasStr}`
  }

  async function loadExecLogs(page = 0) {
    setExecLogsLoading(true)
    try {
      const result = await trpc.caixaPostal.schedule.logs.query({ limit: 10, offset: page * 10 }) as { logs: typeof execLogs; total: number }
      setExecLogs(result.logs)
      setExecLogsTotal(result.total)
      setExecLogsPage(page)
    } catch { /* silencioso */ }
    finally { setExecLogsLoading(false) }
  }

  async function openScheduleModal() {
    setScheduleOpen(true)
    setScheduleLoading(true)
    setScheduleClienteSearch('')
    setScheduleTab('config')
    try {
      const [data, clientesList] = await Promise.all([
        trpc.caixaPostal.schedule.get.query() as Promise<typeof scheduleData>,
        trpc.caixaPostal.schedule.clientes.query() as Promise<typeof scheduleClientes>,
      ])
      setScheduleData(data)
      setScheduleClientes(clientesList)
      // Se está rodando, iniciar polling
      if (data?.isRunning) {
        const p = await trpc.caixaPostal.schedule.progress.query() as typeof scheduleProgress
        setScheduleProgress(p)
        startProgressPolling()
      } else {
        setScheduleProgress(null)
      }
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setScheduleLoading(false) }
  }

  async function handleSaveSchedule() {
    if (!scheduleData) return
    setScheduleSaving(true)
    try {
      await trpc.caixaPostal.schedule.update.mutate(scheduleData.config)
      await alerts.success('Agendamento salvo', scheduleData.config.enabled ? 'Consulta automática ativada.' : 'Consulta automática desativada.')
      // Recarregar status
      const data = await trpc.caixaPostal.schedule.get.query() as typeof scheduleData
      setScheduleData(data)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setScheduleSaving(false) }
  }

  function startProgressPolling() {
    stopProgressPolling()
    progressIntervalRef.current = setInterval(async () => {
      try {
        const p = await trpc.caixaPostal.schedule.progress.query() as typeof scheduleProgress
        setScheduleProgress(p)
        if (p?.status === 'idle') {
          stopProgressPolling()
          // Recarregar status final
          const data = await trpc.caixaPostal.schedule.get.query() as typeof scheduleData
          setScheduleData(data)
        }
      } catch { /* silencioso */ }
    }, 2000)
  }

  function stopProgressPolling() {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
  }

  async function handleRunNow() {
    try {
      const r = await trpc.caixaPostal.schedule.runNow.mutate() as { message: string }
      alerts.success('Execução', r.message)
      setScheduleProgress({ current: 0, total: 0, currentCliente: 'Iniciando...', status: 'running', items: [] })
      startProgressPolling()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // Lote
  const [loteOpen, setLoteOpen] = useState(false)
  const [loteModo, setLoteModo] = useState<'indicador' | 'classificar'>('classificar')
  const [loteSelecionados, setLoteSelecionados] = useState<Set<string>>(new Set())
  const [loteItems, setLoteItems] = useState<Array<{ id: string; documento: string; razaoSocial: string; status: 'pendente' | 'consultando' | 'sucesso' | 'erro' | 'pulado'; erro?: string | null; total?: number }>>([])
  const [loteStatus, setLoteStatus] = useState<'idle' | 'running' | 'done'>('idle')
  const [loteDelay, setLoteDelay] = useState(10)
  const [loteSearchFilter, setLoteSearchFilter] = useState('')
  const loteAbortRef = useRef(false)
  const loteCountdownRef = useRef(0)

  // Debounce da busca (400ms)
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPaginaClientes(1) }, 400)
    return () => clearTimeout(timer)
  }, [search])

  // ============================================================
  // Carregar clientes e status
  // ============================================================

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    setSelecionados(new Set())
    try {
      const lista = await trpc.sitfis.listClientesMensal.query() as ClienteMensal[]
      setClientes(lista)

      if (lista.length > 0) {
        const docs = lista.map(c => c.documento.replace(/\D/g, ''))
        try {
          const status = await trpc.caixaPostal.statusLote.mutate({ documentos: docs }) as Record<string, StatusInfo>
          setStatusMap(status)
        } catch (e) {
          console.error('[CaixaPostal] Erro ao buscar status:', (e as Error).message)
        }
      }
    } catch (e) {
      console.error('[CaixaPostal] Erro ao buscar clientes:', (e as Error).message)
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  // ============================================================
  // Filtrar clientes
  // ============================================================

  const getStatus = (c: ClienteMensal) => statusMap[c.documento.replace(/\D/g, '')] || statusMap[c.documento] || null

  const clientesFiltrados = clientes.filter(c => {
    // Filtro de busca (debounced)
    if (debouncedSearch) {
      const t = debouncedSearch.toLowerCase()
      const docLimpo = c.documento.replace(/\D/g, '')
      const buscaLimpa = t.replace(/\D/g, '')
      const matchNome = c.razaoSocial.toLowerCase().includes(t)
      const matchDoc = buscaLimpa.length > 0 && docLimpo.includes(buscaLimpa)
      if (!matchNome && !matchDoc) return false
    }
    // Filtro de status
    if (filtroStatus !== 'todos') {
      const st = getStatus(c)
      if (filtroStatus === 'pendentes' && (!st || st.nao_lidas === 0)) return false
      if (filtroStatus === 'lidas' && (!st || st.status !== 'TODAS LIDAS')) return false
    }
    return true
  })

  const countPendentes = clientes.filter(c => { const s = getStatus(c); return s && s.nao_lidas > 0 }).length
  const countEmDia = clientes.filter(c => { const s = getStatus(c); return s?.status === 'TODAS LIDAS' }).length

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / limitClientes))
  const paginaAtual = Math.min(paginaClientes, totalPaginas)
  const clientesPaginados = clientesFiltrados.slice((paginaAtual - 1) * limitClientes, paginaAtual * limitClientes)
  const startRecord = clientesFiltrados.length > 0 ? (paginaAtual - 1) * limitClientes + 1 : 0
  const endRecord = Math.min(paginaAtual * limitClientes, clientesFiltrados.length)

  function getPageNumbers() {
    const pages: number[] = []
    let start = Math.max(1, paginaAtual - 2)
    const end = Math.min(totalPaginas, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  // ============================================================
  // Atualizar status de um cliente individual
  // ============================================================

  async function handleRefreshCliente(cliente: ClienteMensal) {
    const doc = cliente.documento.replace(/\D/g, '')
    setRefreshingCliente(cliente.id)
    try {
      const status = await trpc.caixaPostal.status.query({ contribuinte: doc }) as StatusInfo
      setStatusMap(prev => ({ ...prev, [doc]: status }))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setRefreshingCliente(null)
    }
  }

  // ============================================================
  // Inativar cliente individual
  // ============================================================

  async function handleInativarCliente(cliente: ClienteMensal) {
    const ok = await alerts.confirm({
      title: 'Inativar cliente',
      text: `Deseja inativar "${cliente.razaoSocial}"? O cliente será movido para a situação PARALIZADO e não aparecerá mais na caixa postal.`,
      confirmText: 'Sim, inativar',
      icon: 'warning',
    })
    if (!ok) return

    setInativandoCliente(cliente.id)
    try {
      await trpc.caixaPostal.inativarCliente.mutate({ clienteId: cliente.id })
      setClientes(prev => prev.filter(c => c.id !== cliente.id))
      setSelecionados(prev => { const n = new Set(prev); n.delete(cliente.id); return n })
      await alerts.success('Cliente inativado', `"${cliente.razaoSocial}" foi inativado com sucesso.`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setInativandoCliente(null)
    }
  }

  // ============================================================
  // Inativar clientes em lote
  // ============================================================

  async function handleInativarLote() {
    if (selecionados.size === 0) return

    const nomes = clientes.filter(c => selecionados.has(c.id)).map(c => c.razaoSocial)
    const ok = await alerts.confirm({
      title: `Inativar ${selecionados.size} cliente(s)`,
      text: selecionados.size <= 5
        ? `Deseja inativar: ${nomes.join(', ')}? Os clientes serão movidos para a situação PARALIZADO.`
        : `Deseja inativar ${selecionados.size} clientes selecionados? Eles serão movidos para a situação PARALIZADO e não aparecerão mais na caixa postal.`,
      confirmText: 'Sim, inativar todos',
      icon: 'warning',
    })
    if (!ok) return

    setInativandoLote(true)
    try {
      const ids = Array.from(selecionados)
      const result = await trpc.caixaPostal.inativarClientesLote.mutate({ clienteIds: ids }) as { total: number }
      setClientes(prev => prev.filter(c => !selecionados.has(c.id)))
      setSelecionados(new Set())
      await alerts.success('Inativação em lote', `${result.total} cliente(s) inativado(s) com sucesso.`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setInativandoLote(false)
    }
  }

  // ============================================================
  // Seleção (checkbox)
  // ============================================================

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function toggleTodosSelecionados() {
    if (selecionados.size >= clientesFiltrados.length && clientesFiltrados.length > 0) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(clientesFiltrados.map(c => c.id)))
    }
  }

  // ============================================================
  // Voltar para lista de clientes (atualiza status)
  // ============================================================

  async function handleVoltarLista() {
    if (selectedCliente) {
      // Atualizar status do cliente antes de voltar
      try {
        const st = await trpc.caixaPostal.status.query({ contribuinte: selectedCliente.documento }) as StatusInfo
        setStatusMap(prev => ({ ...prev, [selectedCliente.documento.replace(/\D/g, '')]: st }))
      } catch { /* silencioso */ }
    }
    setSelectedCliente(null)
    setMensagens([])
    setVerArquivadas(false)
    setMsgSelecionadas(new Set())
  }

  // ============================================================
  // Consultar mensagens de um cliente
  // ============================================================

  async function handleConsultarCliente(cliente: ClienteMensal, useCache = false) {
    setSelectedCliente(cliente)
    setMensagensLoading(true)
    setMensagens([])
    setMsgSelecionadas(new Set())
    setPaginaMsg(1)

    try {
      const tipo = cliente.documento.length === 11 ? 1 : 2
      const contribuinte = { numero: cliente.documento, tipo }

      let result: { mensagensClassificadas: MensagemClassificada[]; totalMensagens: number }

      if (useCache) {
        result = await trpc.caixaPostal.listCache.query({ contribuinte }) as typeof result
      } else {
        result = await trpc.caixaPostal.consultarClassificadas.mutate({ contribuinte }) as typeof result
      }

      setMensagens(result.mensagensClassificadas || [])

      // Atualizar status do cliente no mapa
      const status = await trpc.caixaPostal.status.query({ contribuinte: cliente.documento }) as StatusInfo
      setStatusMap(prev => ({ ...prev, [cliente.documento.replace(/\D/g, '')]: status }))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setMensagensLoading(false)
    }
  }

  // ============================================================
  // Detalhar mensagem
  // ============================================================

  async function loadItemDetalhes(isn: string, contribuinte: string) {
    try {
      const item = await trpc.caixaPostal.itemByIsn.query({ isn, contribuinte }) as Record<string, unknown> | null
      if (item?.id) {
        const detalhes = await trpc.caixaPostal.itemDetalhes.query({ itemId: item.id as string }) as Record<string, unknown>
        setItemDetalhes(detalhes)
      }
    } catch { /* silencioso */ }
  }

  async function loadUsuarios() {
    if (usuarios.length > 0) return
    try {
      const data = await trpc.caixaPostal.listarUsuarios.query() as Array<{ id: string; name: string; email: string }>
      setUsuarios(data)
    } catch { /* silencioso */ }
  }

  async function handleDetalhar(msg: MensagemClassificada, contribuinteOverride?: string) {
    const isn = msg.isn || msg.ISN
    const doc = contribuinteOverride || selectedCliente?.documento
    if (!isn || !doc) return

    if (viewMode === 'modal') setDetalheOpen(true)
    setDetalheLoading(true)
    setDetalheData(null)
    setDetalheMsg(msg)
    setItemDetalhes(null)
    setDetalheTab('conteudo')

    try {
      const docLimpo = doc.replace(/\D/g, '')
      const tipo = docLimpo.length === 11 ? 1 : 2
      const result = await trpc.caixaPostal.detalhar.mutate({
        contribuinte: { numero: docLimpo, tipo },
        isn,
      })
      setDetalheData(result)

      // Marcar como lida
      if (!msg.lida) {
        await trpc.caixaPostal.marcarLida.mutate({ isn, contribuinte: docLimpo })
        setMensagens(prev => prev.map(m => (m.isn || m.ISN) === isn ? { ...m, lida: true } : m))
        if (modoFiltrado) setMensagensAgregadas(prev => prev.map(m => (m.isn || m.ISN) === isn ? { ...m, lida: true } : m))
      }

      // Carregar detalhes do item e usuários em paralelo
      loadItemDetalhes(isn, docLimpo)
      loadUsuarios()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setDetalheLoading(false)
    }
  }

  // ============================================================
  // Marcar como lida / não lida
  // ============================================================

  async function handleToggleLida(msg: MensagemClassificada) {
    const isn = msg.isn || msg.ISN
    if (!isn || !selectedCliente) return

    try {
      if (msg.lida) {
        await trpc.caixaPostal.marcarNaoLida.mutate({ isn, contribuinte: selectedCliente.documento })
      } else {
        await trpc.caixaPostal.marcarLida.mutate({ isn, contribuinte: selectedCliente.documento })
      }
      setMensagens(prev => prev.map(m => (m.isn || m.ISN) === isn ? { ...m, lida: !m.lida } : m))
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  // ============================================================
  // Consulta em lote (modal com seleção)
  // ============================================================

  function handleAbrirLote(modo: 'indicador' | 'classificar') {
    setLoteModo(modo)
    setLoteOpen(true)
    setLoteStatus('idle')
    setLoteItems([])
    setLoteSearchFilter('')
    loteAbortRef.current = false
    setLoteSelecionados(new Set(clientes.map(c => c.id)))
  }

  function loteToggle(id: string) {
    setLoteSelecionados(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  const loteClientesFiltrados = clientes.filter(c => {
    if (!loteSearchFilter) return true
    const t = loteSearchFilter.toLowerCase()
    return c.razaoSocial.toLowerCase().includes(t) || c.documento.includes(t.replace(/\D/g, ''))
  })

  function loteToggleAll(checked: boolean) {
    if (checked) setLoteSelecionados(new Set(loteClientesFiltrados.map(c => c.id)))
    else setLoteSelecionados(new Set())
  }

  async function handleIniciarLote() {
    const sels = clientes.filter(c => loteSelecionados.has(c.id))
    if (!sels.length) return

    const items = sels.map(c => ({ id: c.id, documento: c.documento, razaoSocial: c.razaoSocial, status: 'pendente' as const }))
    setLoteItems(items)
    setLoteStatus('running')
    loteAbortRef.current = false

    for (let i = 0; i < items.length; i++) {
      if (loteAbortRef.current) {
        setLoteItems(prev => prev.map((it, idx) => idx >= i && it.status === 'pendente' ? { ...it, status: 'pulado' } : it))
        break
      }

      setLoteItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'consultando' } : it))

      const item = items[i]!
      const tipo = item.documento.replace(/\D/g, '').length === 11 ? 1 : 2
      const contribuinte = { numero: item.documento.replace(/\D/g, ''), tipo }

      try {
        if (loteModo === 'indicador') {
          await trpc.caixaPostal.indicadorNovas.mutate({ contribuinte })
          setLoteItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'sucesso' } : it))
        } else {
          const res = await trpc.caixaPostal.consultarClassificadas.mutate({ contribuinte }) as { totalMensagens: number }
          setLoteItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'sucesso', total: res.totalMensagens } : it))
        }
      } catch (e) {
        setLoteItems(prev => prev.map((it, idx) => idx === i ? { ...it, status: 'erro', erro: (e as Error).message } : it))
      }

      // Delay entre consultas
      if (i < items.length - 1 && !loteAbortRef.current) {
        for (let s = loteDelay; s > 0; s--) {
          if (loteAbortRef.current) break
          loteCountdownRef.current = s
          setLoteItems(prev => [...prev])
          await new Promise(r => setTimeout(r, 1000))
        }
        loteCountdownRef.current = 0
      }
    }

    setLoteStatus('done')
    fetchClientes()
  }

  function handlePararLote() {
    loteAbortRef.current = true
    setLoteStatus('done')
  }

  // ============================================================
  // Limpeza
  // ============================================================

  async function handleLimparTudo() {
    if (!await alerts.confirmDelete('todos os registros de caixa postal')) return
    try {
      const result = await trpc.caixaPostal.limparTudo.mutate() as { totalExcluido: number }
      await alerts.success('Limpeza concluída', `${result.totalExcluido} registros excluídos.`)
      fetchClientes()
      if (selectedCliente) setMensagens([])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  // ============================================================
  // Reclassificação
  // ============================================================

  async function handleReclassificar(msg: MensagemClassificada) {
    const isn = msg.isn || msg.ISN
    if (!isn || !selectedCliente) return
    try {
      await trpc.caixaPostal.reclassificarTodas.mutate({ contribuinte: selectedCliente.documento })
      await alerts.success('Reclassificada', 'Mensagem reclassificada com sucesso.')
      handleConsultarCliente(selectedCliente, true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function handleReclassificarTodas() {
    if (!selectedCliente) return
    try {
      const result = await trpc.caixaPostal.reclassificarTodas.mutate({ contribuinte: selectedCliente.documento }) as { reclassificados: number }
      await alerts.success('Reclassificação concluída', `${result.reclassificados} mensagem(ns) reclassificada(s).`)
      handleConsultarCliente(selectedCliente, true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  // ============================================================
  // Filtros de mensagens
  // ============================================================

  const mensagensFiltradas = mensagens
    .filter(m => {
      if (filtroLeitura === 'lidas' && !m.lida) return false
      if (filtroLeitura === 'nao_lidas' && m.lida) return false
      if (filtroPrioridade && m.prioridade !== filtroPrioridade) return false
      return true
    })
    .sort((a, b) => {
      const impA = (a as Record<string, unknown>).importante === true ? 1 : 0
      const impB = (b as Record<string, unknown>).importante === true ? 1 : 0
      if (impA !== impB) return impB - impA
      const dA = a.dataEnvio || ''
      const dB = b.dataEnvio || ''
      return dB.localeCompare(dA)
    })

  const totalPaginasMsg = Math.max(1, Math.ceil(mensagensFiltradas.length / limitMsg))
  const paginaAtualMsg = Math.min(paginaMsg, totalPaginasMsg)
  const msgPaginadas = mensagensFiltradas.slice((paginaAtualMsg - 1) * limitMsg, paginaAtualMsg * limitMsg)
  const startMsg = mensagensFiltradas.length > 0 ? (paginaAtualMsg - 1) * limitMsg + 1 : 0
  const endMsg = Math.min(paginaAtualMsg * limitMsg, mensagensFiltradas.length)

  function getMsgPageNumbers() {
    const pages: number[] = []
    let start = Math.max(1, paginaAtualMsg - 2)
    const end = Math.min(totalPaginasMsg, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  // ============================================================
  // Formatar conteúdo da mensagem SERPRO
  // ============================================================

  function extrairCorpoMensagem(dados: unknown): string | null {
    if (!dados) return null
    let base = dados as Record<string, unknown>

    if (typeof dados === 'string') {
      try { base = JSON.parse(dados) } catch { return null }
    }

    if (base?.dados && typeof base.dados === 'string') {
      try { base = JSON.parse(base.dados as string) } catch { /* keep */ }
    } else if (base?.dados && typeof base.dados === 'object') {
      base = base.dados as Record<string, unknown>
    }

    if (base?.conteudo && Array.isArray(base.conteudo) && base.conteudo.length > 0) {
      const msg = base.conteudo[0] as Record<string, unknown>
      if (msg?.corpoModelo && typeof msg.corpoModelo === 'string') {
        return processarCorpoModelo(msg.corpoModelo, msg)
      }
    }

    return null
  }

  function processarCorpoModelo(corpo: string, msg: Record<string, unknown>): string {
    let result = corpo

    // 1. Usar campo "variaveis" (array) — fonte principal para o corpo
    if (Array.isArray(msg.variaveis) && msg.variaveis.length > 0) {
      (msg.variaveis as string[]).forEach((v, i) => {
        if (v) result = result.replace(new RegExp(`\\+\\+${i + 1}\\+\\+`, 'g'), v)
      })
    }

    // 2. Fallback: valorParametroCorpo (pipe-separated)
    if (result.includes('++')) {
      const valorCorpo = (msg.valorParametroCorpo || msg.valorParametro) as string | undefined
      if (valorCorpo && typeof valorCorpo === 'string') {
        valorCorpo.split('|').forEach((p, i) => {
          if (p) result = result.replace(new RegExp(`\\+\\+${i + 1}\\+\\+`, 'g'), p)
        })
      }
    }

    // 3. Fallback: valorParametroAssunto (pipe-separated)
    if (result.includes('++') && msg.valorParametroAssunto && typeof msg.valorParametroAssunto === 'string') {
      (msg.valorParametroAssunto as string).split('|').forEach((p, i) => {
        if (p) result = result.replace(new RegExp(`\\+\\+${i + 1}\\+\\+`, 'g'), p)
      })
    }

    // 4. Fallback: campos conhecidos
    if (result.includes('++1++')) {
      const sub = (msg.niUsuario || msg.numeroControle || '') as string
      if (sub) result = result.replace(/\+\+1\+\+/g, sub)
    }
    if (result.includes('++2++')) {
      const dataStr = (msg.dataExpiracao || msg.dataEnvio || '') as string
      const sub = dataStr ? formatDateSerpro(dataStr) : ''
      if (sub) result = result.replace(/\+\+2\+\+/g, sub)
    }

    // Limpar placeholders restantes
    result = result.replace(/\+\+\d+\+\+/g, '')

    // Decodificar entidades HTML
    result = result
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&aacute;/gi, 'á').replace(/&Aacute;/gi, 'Á')
      .replace(/&eacute;/gi, 'é').replace(/&Eacute;/gi, 'É')
      .replace(/&iacute;/gi, 'í').replace(/&Iacute;/gi, 'Í')
      .replace(/&oacute;/gi, 'ó').replace(/&Oacute;/gi, 'Ó')
      .replace(/&uacute;/gi, 'ú').replace(/&Uacute;/gi, 'Ú')
      .replace(/&atilde;/gi, 'ã').replace(/&Atilde;/gi, 'Ã')
      .replace(/&otilde;/gi, 'õ').replace(/&Otilde;/gi, 'Õ')
      .replace(/&ccedil;/gi, 'ç').replace(/&Ccedil;/gi, 'Ç')
      .replace(/&ntilde;/gi, 'ñ')

    return result
  }

  function extrairMetadados(dados: unknown): Record<string, unknown> | null {
    if (!dados) return null
    let base = dados as Record<string, unknown>
    if (typeof dados === 'string') {
      try { base = JSON.parse(dados) } catch { return null }
    }
    if (base?.dados && typeof base.dados === 'string') {
      try { base = JSON.parse(base.dados as string) } catch { /* keep */ }
    } else if (base?.dados && typeof base.dados === 'object') {
      base = base.dados as Record<string, unknown>
    }
    if (base?.conteudo && Array.isArray(base.conteudo) && base.conteudo.length > 0) {
      return base.conteudo[0] as Record<string, unknown>
    }
    return null
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Modal Consulta Automática */}
      <Dialog open={scheduleOpen} onOpenChange={(o) => { if (!o) { setScheduleOpen(false); stopProgressPolling(); setExecLogDetalhe(null) } }}>
        <DialogContent className="max-w-[720px]">
          <DialogHeaderIcon icon={CalendarClock} color="sky">
            <DialogTitle>Consulta Automática e-CAC</DialogTitle>
            <DialogDescription>Agende a busca automática de mensagens para todos os clientes mensais</DialogDescription>
          </DialogHeaderIcon>

          <DialogBody>
            {/* Tabs: Configuração / Histórico */}
            <div className="flex border-b mb-4">
              <button type="button" onClick={() => setScheduleTab('config')}
                className={cn('px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                  scheduleTab === 'config' ? 'border-sky-500 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}>Configuração</button>
              <button type="button" onClick={() => { setScheduleTab('historico'); loadExecLogs(0) }}
                className={cn('px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                  scheduleTab === 'historico' ? 'border-sky-500 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}>Histórico de Execuções</button>
            </div>

            {scheduleTab === 'historico' ? (
              /* ── Aba Histórico ── */
              <div className="space-y-3 min-h-[520px]">
                {execLogDetalhe ? (
                  /* Detalhe de uma execução */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => setExecLogDetalhe(null)} className="flex items-center gap-1.5 text-xs text-sky-600 hover:underline">
                        <ArrowLeft className="h-3 w-3" />Voltar
                      </button>
                      <Badge variant="outline" className={cn('text-[10px]',
                        execLogDetalhe.status === 'completed' && execLogDetalhe.falhas === 0 && 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        execLogDetalhe.status === 'completed' && execLogDetalhe.falhas > 0 && 'bg-amber-50 text-amber-700 border-amber-200',
                        execLogDetalhe.status === 'running' && 'bg-sky-50 text-sky-700 border-sky-200',
                        execLogDetalhe.status === 'error' && 'bg-red-50 text-red-700 border-red-200',
                      )}>
                        {execLogDetalhe.status === 'running' ? 'Em execução' : execLogDetalhe.falhas > 0 ? 'Com falhas' : 'Sucesso'}
                      </Badge>
                    </div>

                    {/* Info da execução */}
                    <div className="rounded-lg border p-3 bg-muted/10 space-y-1.5 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tipo</span>
                        <span className="font-medium">{execLogDetalhe.tipo === 'manual' ? 'Manual' : 'Automático'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Iniciado por</span>
                        <span className="font-medium">{execLogDetalhe.nomeUsuario || (execLogDetalhe.tipo === 'automatico' ? 'Sistema (Cron)' : '—')}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Início</span>
                        <span className="font-medium">{new Date(execLogDetalhe.iniciadoEm).toLocaleString('pt-BR')}</span>
                      </div>
                      {execLogDetalhe.finalizadoEm && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Fim</span>
                          <span className="font-medium">{new Date(execLogDetalhe.finalizadoEm).toLocaleString('pt-BR')}</span>
                        </div>
                      )}
                      {execLogDetalhe.finalizadoEm && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Duração</span>
                          <span className="font-medium">{(() => {
                            const ms = new Date(execLogDetalhe.finalizadoEm).getTime() - new Date(execLogDetalhe.iniciadoEm).getTime()
                            const s = Math.round(ms / 1000)
                            return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
                          })()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Resultado</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600 font-medium">{execLogDetalhe.sucesso} ok</span>
                          {execLogDetalhe.falhas > 0 && <span className="text-red-500 font-medium">{execLogDetalhe.falhas} erro(s)</span>}
                          <span className="text-muted-foreground">/ {execLogDetalhe.total}</span>
                        </div>
                      </div>
                    </div>

                    {/* Lista de clientes da execução */}
                    <div className="rounded-lg border overflow-hidden">
                      <div className="px-3 py-2 bg-muted/20 border-b">
                        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Detalhamento por Cliente</h4>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto divide-y">
                        {execLogDetalhe.itens.length === 0 ? (
                          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">Nenhum detalhe disponível</div>
                        ) : execLogDetalhe.itens.map((item, idx) => (
                          <div key={idx} className={cn('flex items-center gap-2 px-3 py-2 text-[11px]', item.status === 'erro' && 'bg-red-50/30 dark:bg-red-900/5')}>
                            <div className="w-4 shrink-0 text-center">
                              {item.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{item.razaoSocial}</div>
                              {item.status === 'erro' && item.erro && (
                                <div className="text-[10px] text-red-500 mt-0.5 truncate" title={item.erro}>{item.erro}</div>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="font-mono text-[10px] text-muted-foreground">{item.documento ? formatDoc(item.documento) : ''}</span>
                              {typeof item.duracaoMs === 'number' && (
                                <div className="text-[9px] text-muted-foreground">{item.duracaoMs >= 1000 ? `${(item.duracaoMs / 1000).toFixed(1)}s` : `${item.duracaoMs}ms`}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Lista de execuções */
                  <div className="space-y-3">
                    {execLogsLoading ? (
                      <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando...</div>
                    ) : execLogs.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground text-sm">Nenhuma execução registrada</div>
                    ) : (
                      <>
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-[11px] py-2">Data/Hora</TableHead>
                                <TableHead className="text-[11px] py-2">Tipo</TableHead>
                                <TableHead className="text-[11px] py-2">Iniciado por</TableHead>
                                <TableHead className="text-[11px] py-2 text-center">Total</TableHead>
                                <TableHead className="text-[11px] py-2 text-center">Sucesso</TableHead>
                                <TableHead className="text-[11px] py-2 text-center">Erros</TableHead>
                                <TableHead className="text-[11px] py-2 text-center">Duração</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {execLogs.map(log => (
                                <TableRow key={log.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setExecLogDetalhe(log)}>
                                  <TableCell className="text-[11px] py-2 whitespace-nowrap">{new Date(log.iniciadoEm).toLocaleString('pt-BR')}</TableCell>
                                  <TableCell className="text-[11px] py-2">
                                    <Badge variant="outline" className={cn('text-[9px]',
                                      log.tipo === 'manual' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-violet-50 text-violet-700 border-violet-200',
                                    )}>{log.tipo === 'manual' ? 'Manual' : 'Automático'}</Badge>
                                  </TableCell>
                                  <TableCell className="text-[11px] py-2 truncate max-w-[120px]">{log.nomeUsuario || (log.tipo === 'automatico' ? 'Sistema' : '—')}</TableCell>
                                  <TableCell className="text-[11px] py-2 text-center font-medium">{log.total}</TableCell>
                                  <TableCell className="text-[11px] py-2 text-center text-emerald-600 font-medium">{log.sucesso}</TableCell>
                                  <TableCell className="text-[11px] py-2 text-center">
                                    {log.falhas > 0 ? <span className="text-red-500 font-medium">{log.falhas}</span> : <span className="text-muted-foreground">0</span>}
                                  </TableCell>
                                  <TableCell className="text-[11px] py-2 text-center whitespace-nowrap font-mono">
                                    {log.finalizadoEm ? (() => {
                                      const ms = new Date(log.finalizadoEm).getTime() - new Date(log.iniciadoEm).getTime()
                                      const s = Math.round(ms / 1000)
                                      return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
                                    })() : <Loader2 className="h-3 w-3 animate-spin inline" />}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        {/* Paginação */}
                        {execLogsTotal > 10 && (
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] text-muted-foreground">{execLogsTotal} execução(ões)</span>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={execLogsPage === 0} onClick={() => loadExecLogs(execLogsPage - 1)}>
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </Button>
                              <span className="text-[10px] px-2">{execLogsPage + 1}/{Math.ceil(execLogsTotal / 10)}</span>
                              <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={(execLogsPage + 1) * 10 >= execLogsTotal} onClick={() => loadExecLogs(execLogsPage + 1)}>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : scheduleLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando...</div>
            ) : scheduleData ? (
              <div className="space-y-5 min-h-[520px]">
                {/* Toggle */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 text-sm font-medium">
                    <button type="button" onClick={() => setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, enabled: !prev.config.enabled } } : prev)}
                      className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
                        scheduleData.config.enabled ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600',
                      )}>
                      <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5',
                        scheduleData.config.enabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5',
                      )} />
                    </button>
                    Agendamento {scheduleData.config.enabled ? 'ativado' : 'desativado'}
                  </label>
                  {scheduleData.isRunning && (
                    <Badge variant="outline" className="text-[10px] bg-sky-50 text-sky-700 border-sky-200 gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />Em execução
                    </Badge>
                  )}
                </div>

                {/* Dias da semana */}
                {(() => {
                  const parsed = parseCron(scheduleData.config.cron)
                  return (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Dias da semana</label>
                        <div className="flex gap-1.5">
                          {DIAS_SEMANA.map(d => {
                            const active = parsed.dias.includes(d.key)
                            return (
                              <button key={d.key} type="button" onClick={() => {
                                const newDias = active ? parsed.dias.filter(x => x !== d.key) : [...parsed.dias, d.key]
                                if (newDias.length === 0) return
                                setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, cron: buildCron(newDias, parsed.horas) } } : prev)
                              }}
                                className={cn('rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-all border',
                                  active ? 'bg-sky-500 text-white border-sky-500 shadow-sm' : 'text-muted-foreground border-border/60 bg-background hover:border-sky-400 hover:text-sky-600',
                                )}>
                                {d.label}
                              </button>
                            )
                          })}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button type="button" className="text-[10px] text-sky-600 hover:underline" onClick={() => {
                            setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, cron: buildCron(['1','2','3','4','5','6','0'], parsed.horas) } } : prev)
                          }}>Todos</button>
                          <button type="button" className="text-[10px] text-sky-600 hover:underline" onClick={() => {
                            setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, cron: buildCron(['1','2','3','4','5'], parsed.horas) } } : prev)
                          }}>Dias úteis</button>
                        </div>
                      </div>

                      {/* Horários */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Horários</label>
                        <div className="flex flex-wrap gap-1">
                          {HORAS_DISPONIVEIS.map(h => {
                            const active = parsed.horas.includes(h)
                            return (
                              <button key={h} type="button" onClick={() => {
                                const newHoras = active ? parsed.horas.filter(x => x !== h) : [...parsed.horas, h]
                                if (newHoras.length === 0) return
                                setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, cron: buildCron(parsed.dias, newHoras) } } : prev)
                              }}
                                className={cn('rounded px-2 py-1 text-[11px] font-mono font-medium transition-all border min-w-[36px]',
                                  active ? 'bg-sky-500 text-white border-sky-500 shadow-sm' : 'text-muted-foreground border-border/60 bg-background hover:border-sky-400 hover:text-sky-600',
                                )}>
                                {String(h).padStart(2, '0')}h
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )
                })()}

                {/* Intervalo */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Intervalo entre consultas</label>
                  <Select value={String(scheduleData.config.delayMs)} onValueChange={v => setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, delayMs: Number(v) } } : prev)}>
                    <SelectTrigger className="h-9 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3000">3 segundos</SelectItem>
                      <SelectItem value="5000">5 segundos</SelectItem>
                      <SelectItem value="10000">10 segundos</SelectItem>
                      <SelectItem value="15000">15 segundos</SelectItem>
                      <SelectItem value="20000">20 segundos</SelectItem>
                      <SelectItem value="30000">30 segundos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Seleção de clientes */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Clientes</label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {scheduleData.config.clienteIds.length === 0 ? `Todos (${scheduleClientes.length})` : scheduleData.config.clienteIds[0] === '__none__' ? 'Nenhum' : `${scheduleData.config.clienteIds.length} selecionado(s)`}
                      </Badge>
                      {scheduleData.config.clienteIds.length > 0 ? (
                        <button className="text-[10px] text-sky-600 hover:underline" onClick={() => setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, clienteIds: [] } } : prev)}>
                          Selecionar todos
                        </button>
                      ) : (
                        <button className="text-[10px] text-sky-600 hover:underline" onClick={() => setScheduleData(prev => prev ? { ...prev, config: { ...prev.config, clienteIds: ['__none__'] } } : prev)}>
                          Desmarcar todos
                        </button>
                      )}
                    </div>
                  </div>
                  <Input placeholder="Buscar cliente..." value={scheduleClienteSearch} onChange={e => setScheduleClienteSearch(e.target.value)} className="h-8 text-xs" />
                  <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                    {scheduleClientes
                      .filter(c => {
                        if (!scheduleClienteSearch) return true
                        const t = scheduleClienteSearch.toLowerCase()
                        return c.razaoSocial.toLowerCase().includes(t) || c.documento.replace(/\D/g, '').includes(t.replace(/\D/g, ''))
                      })
                      .map(c => {
                        const isNone = scheduleData.config.clienteIds[0] === '__none__'
                        const checked = !isNone && (scheduleData.config.clienteIds.length === 0 || scheduleData.config.clienteIds.includes(c.id))
                        return (
                          <label key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 cursor-pointer border-b last:border-b-0', checked && scheduleData.config.clienteIds.length > 0 && 'bg-sky-50/40')}>
                            <input type="checkbox" checked={checked} onChange={() => {
                              setScheduleData(prev => {
                                if (!prev) return prev
                                let ids = [...prev.config.clienteIds]
                                if (ids[0] === '__none__') {
                                  // Nenhum selecionado — marcar apenas este
                                  ids = [c.id]
                                } else if (ids.length === 0) {
                                  // "Todos" ativo — ao desmarcar um, selecionar todos exceto esse
                                  ids = scheduleClientes.map(x => x.id).filter(x => x !== c.id)
                                } else if (ids.includes(c.id)) {
                                  ids = ids.filter(x => x !== c.id)
                                  if (ids.length === 0) ids = ['__none__'] // nenhum
                                } else {
                                  ids.push(c.id)
                                  if (ids.length === scheduleClientes.length) ids = [] // todos = vazio
                                }
                                return { ...prev, config: { ...prev.config, clienteIds: ids } }
                              })
                            }} className="h-3 w-3 rounded" />
                            <span className="flex-1 truncate">{c.razaoSocial}</span>
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatDoc(c.documento)}</span>
                          </label>
                        )
                      })}
                  </div>
                </div>

                {/* Status */}
                {(scheduleData.lastRun || scheduleData.nextRun) && (
                  <div className="rounded-lg border p-3 bg-muted/10 space-y-2">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</h4>
                    {scheduleData.lastRun && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Última execução</span>
                        <span className="font-medium">{new Date(scheduleData.lastRun).toLocaleString('pt-BR')}</span>
                      </div>
                    )}
                    {scheduleData.lastResult && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Resultado</span>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600 font-medium">{scheduleData.lastResult.success} ok</span>
                          {scheduleData.lastResult.failed > 0 && <span className="text-red-500 font-medium">{scheduleData.lastResult.failed} erro(s)</span>}
                          <span className="text-muted-foreground">/ {scheduleData.lastResult.total}</span>
                        </div>
                      </div>
                    )}
                    {scheduleData.nextRun && scheduleData.config.enabled && (
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Próxima execução</span>
                        <span className="font-medium">{new Date(scheduleData.nextRun).toLocaleString('pt-BR')}</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Progresso em tempo real */}
                {scheduleProgress && scheduleProgress.status === 'running' && (
                  <div className="rounded-lg border overflow-hidden">
                    {/* Header do progresso */}
                    <div className="flex items-center justify-between px-3 py-2 bg-sky-50 dark:bg-sky-950/20 border-b">
                      <div className="flex items-center gap-2 text-xs">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
                        <span className="font-medium">Processando {scheduleProgress.current}/{scheduleProgress.total}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{scheduleProgress.currentCliente}</span>
                    </div>
                    {/* Barra de progresso */}
                    <div className="h-1.5 bg-muted">
                      <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${scheduleProgress.total > 0 ? (scheduleProgress.current / scheduleProgress.total) * 100 : 0}%` }} />
                    </div>
                    {/* Lista de itens */}
                    <div className="max-h-[200px] overflow-y-auto divide-y">
                      {scheduleProgress.items.map((item, idx) => (
                        <div key={idx} className={cn('flex items-center gap-2 px-3 py-1.5 text-[11px]', item.status === 'processando' && 'bg-sky-50/50 dark:bg-sky-900/10')}>
                          <div className="w-4 shrink-0 text-center">
                            {item.status === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground/40" />}
                            {item.status === 'processando' && <Loader2 className="h-3 w-3 text-sky-500 animate-spin" />}
                            {item.status === 'ok' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                            {item.status === 'erro' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                          </div>
                          <span className={cn('flex-1 truncate', item.status === 'processando' && 'font-medium')}>{item.razaoSocial}</span>
                          {item.status === 'erro' && <span className="text-[10px] text-red-500 truncate max-w-[150px]" title={item.erro}>{item.erro}</span>}
                          {item.status === 'ok' && <span className="text-[10px] text-emerald-600">OK</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Progresso concluído */}
                {scheduleProgress && scheduleProgress.status === 'idle' && scheduleProgress.total > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-b">
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-medium">Concluído — {scheduleProgress.items.filter(i => i.status === 'ok').length}/{scheduleProgress.total} sucesso</span>
                      </div>
                      <button className="text-[10px] text-muted-foreground hover:underline" onClick={() => setScheduleProgress(null)}>Fechar</button>
                    </div>
                    <div className="max-h-[150px] overflow-y-auto divide-y">
                      {scheduleProgress.items.filter(i => i.status === 'erro').map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="flex-1 truncate">{item.razaoSocial}</span>
                          <span className="text-[10px] text-red-500 truncate max-w-[200px]" title={item.erro}>{item.erro}</span>
                        </div>
                      ))}
                      {scheduleProgress.items.filter(i => i.status === 'erro').length === 0 && (
                        <div className="px-3 py-3 text-center text-[11px] text-emerald-600">Todos os clientes processados com sucesso!</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </DialogBody>

          {scheduleTab === 'config' && (
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={handleRunNow} disabled={scheduleData?.isRunning || (scheduleProgress?.status === 'running')} className="gap-1.5">
                <Play className="h-3.5 w-3.5" />Executar Agora
              </Button>
              <Button variant="success" size="sm" onClick={handleSaveSchedule} disabled={scheduleSaving} className="gap-1.5">
                {scheduleSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Salvar
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal detalhe da mensagem */}
      <Dialog open={detalheOpen} onOpenChange={(o) => { if (!o) setDetalheOpen(false) }}>
        <DialogContent className="max-w-[820px]">
          {/* Exceção ao padrão DialogHeaderIcon: o slot do ícone é ocupado pelo
              badge de prioridade dinâmico (P0/P1/P2/P3 com cor/ícone variáveis) +
              status badge à direita + linha de abas. Padrão não comporta. */}
          <DialogHeader>
            <div className="flex items-center gap-4">
              {detalheMsg && (() => {
                const p = detalheMsg.prioridade
                const styles: Record<string, { bg: string; text: string; label: string; icon: typeof AlertTriangle }> = {
                  P0: { bg: 'bg-red-600', text: 'text-white', label: 'Crítica', icon: AlertTriangle },
                  P1: { bg: 'bg-orange-500', text: 'text-white', label: 'Alta', icon: MailWarning },
                  P2: { bg: 'bg-amber-400', text: 'text-amber-950', label: 'Média', icon: Clock },
                  P3: { bg: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-700 dark:text-gray-200', label: 'Baixa', icon: Mail },
                }
                const s = styles[p] || styles.P3!
                const Icon = s.icon
                return (
                  <div className={cn('flex flex-col items-center justify-center rounded-lg px-3 py-2 min-w-[56px] shadow-sm', s.bg, s.text)}>
                    <Icon className="h-5 w-5" />
                    <span className="text-[11px] font-black mt-0.5">{p}</span>
                    <span className="text-[8px] font-semibold uppercase tracking-wider opacity-80">{s.label}</span>
                  </div>
                )
              })()}
              <div className="flex-1 min-w-0">
                <DialogTitle>Detalhamento da Mensagem</DialogTitle>
                {detalheMsg && (
                  <DialogDescription className="truncate">{detalheMsg.assuntoModelo || 'Sem assunto'}</DialogDescription>
                )}
              </div>
              {itemDetalhes && (
                <Badge variant="outline" className={cn('text-[10px] shrink-0',
                  (itemDetalhes.status as string) === 'concluido' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  (itemDetalhes.status as string) === 'em_andamento' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                  (itemDetalhes.status as string) === 'arquivado' ? 'bg-gray-100 text-gray-500 border-gray-200' : ''
                )}>
                  {({ pendente: 'Pendente', em_andamento: 'Em Andamento', concluido: 'Concluído', arquivado: 'Arquivado' } as Record<string, string>)[(itemDetalhes.status as string) || 'pendente'] || 'Pendente'}
                </Badge>
              )}
            </div>

            {/* Abas */}
            <div className="flex gap-0 -mb-4 mt-3">
              {([
                { key: 'conteudo' as const, label: 'Conteúdo', icon: FileText },
                ...(canGestao ? [
                  { key: 'gestao' as const, label: 'Gestão', icon: User },
                  { key: 'historico' as const, label: 'Histórico', icon: History },
                ] : []),
              ]).map(tab => {
                const TabIcon = tab.icon
                return (
                  <button key={tab.key} onClick={() => setDetalheTab(tab.key)}
                    className={cn('flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                      detalheTab === tab.key ? 'border-sky-500 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}>
                    <TabIcon className="h-3.5 w-3.5" />{tab.label}
                    {tab.key === 'historico' && itemDetalhes && Array.isArray((itemDetalhes as Record<string, unknown>).eventos) && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5">{((itemDetalhes as Record<string, unknown>).eventos as unknown[]).length}</Badge>
                    )}
                  </button>
                )
              })}
            </div>
          </DialogHeader>

          <DialogBody className="p-0">
            {detalheLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div>
                {/* ===== ABA CONTEÚDO ===== */}
                {detalheTab === 'conteudo' && (
                  <>
                    {/* Metadados */}
                    {detalheMsg && (
                      <div className="px-5 py-4 bg-muted/20 border-b space-y-2">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                          <div><span className="text-muted-foreground">Origem: </span><span className="font-medium">{detalheMsg.descricaoOrigem || detalheMsg.origemModelo || '—'}</span></div>
                          <div><span className="text-muted-foreground">Data envio: </span><span className="font-medium">{formatDateSerpro(detalheMsg.dataEnvio)}</span></div>
                          <div><span className="text-muted-foreground">Sistema: </span><span className="font-mono">{detalheMsg.codigoSistemaRemetente || '—'}</span></div>
                          {detalheMsg.sla_dias !== null && detalheMsg.sla_dias !== undefined && (
                            <div><span className="text-muted-foreground">SLA: </span><span className={cn('font-medium', detalheMsg.sla_dias <= 0 ? 'text-red-600' : detalheMsg.sla_dias <= 3 ? 'text-orange-600' : '')}>{detalheMsg.sla_dias} dia(s)</span></div>
                          )}
                          <div><span className="text-muted-foreground">Score: </span><span className="font-medium">{detalheMsg.score}/100</span></div>
                        </div>
                        {detalheMsg.acao_recomendada && (
                          <div className="text-xs mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                            <strong>Ação recomendada:</strong> {detalheMsg.acao_recomendada}
                          </div>
                        )}
                        <a
                          href="https://cav.receita.fazenda.gov.br/autenticacao/login"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-600 hover:text-sky-700 hover:underline mt-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Acessar mensagem original no e-CAC
                        </a>
                      </div>
                    )}

                    {/* Corpo da mensagem */}
                    <div className="px-5 py-4">
                      {(() => {
                        const corpo = extrairCorpoMensagem(detalheData)
                        if (corpo) return <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_p]:mb-3 [&_a]:text-sky-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: corpo }} />
                        const meta = extrairMetadados(detalheData)
                        if (meta) {
                          for (const campo of ['textoMensagem', 'texto', 'mensagem', 'corpo', 'descricao']) {
                            if (meta[campo] && typeof meta[campo] === 'string') return <div className="text-sm leading-relaxed whitespace-pre-wrap">{meta[campo] as string}</div>
                          }
                        }
                        if (detalheData) return (<div><p className="text-xs text-muted-foreground mb-2">Resposta bruta da API:</p><pre className="text-xs whitespace-pre-wrap bg-muted/30 rounded-lg p-4 overflow-x-auto max-h-[400px]">{JSON.stringify(detalheData, null, 2)}</pre></div>)
                        return <p className="text-center text-muted-foreground py-10">Nenhum conteúdo disponível.</p>
                      })()}
                    </div>

                    {/* Motivos */}
                    {detalheMsg && detalheMsg.motivos.length > 0 && (
                      <div className="px-5 py-3 border-t bg-muted/10">
                        <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Motivos da classificação</p>
                        <div className="flex flex-wrap gap-1">
                          {detalheMsg.motivos.map((m, i) => <Badge key={i} variant="outline" className="text-[10px] font-normal">{m}</Badge>)}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ===== ABA GESTÃO ===== */}
                {detalheTab === 'gestao' && (
                  <div className="p-5 space-y-5 relative">
                    {/* Toast de confirmação */}
                    {gestaoToast && (
                      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-emerald-500 text-white text-xs font-medium px-4 py-2 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {gestaoToast}
                      </div>
                    )}
                    {/* Status */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                      <select
                        className="h-9 w-[220px] rounded-md border border-input bg-transparent px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        value={(itemDetalhes?.status as string) || 'pendente'}
                        onChange={async (e) => {
                          const v = e.target.value
                          if (!itemDetalhes?.id) return
                          try {
                            await trpc.caixaPostal.alterarStatus.mutate({ itemId: itemDetalhes.id as string, status: v as 'pendente' | 'em_andamento' | 'concluido' | 'arquivado' })
                            setItemDetalhes(prev => prev ? { ...prev, status: v } : prev)
                            showGestaoToast('Status atualizado')
                          } catch (e2) { alerts.error('Erro', (e2 as Error).message) }
                        }}
                      >
                        <option value="pendente">Pendente</option>
                        <option value="em_andamento">Em Andamento</option>
                        <option value="concluido">Concluído</option>
                        <option value="arquivado">Arquivado</option>
                      </select>
                    </div>

                    {/* Responsável */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Responsável</label>
                      <select
                        className="h-9 w-[320px] rounded-md border border-input bg-transparent px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        value={(itemDetalhes?.responsavelId as string) || ''}
                        onChange={async (e) => {
                          const v = e.target.value
                          if (!itemDetalhes?.id || !v) return
                          try {
                            await trpc.caixaPostal.definirResponsavel.mutate({ itemId: itemDetalhes.id as string, responsavelId: v })
                            const user = usuarios.find(u => u.id === v)
                            setItemDetalhes(prev => prev ? { ...prev, responsavelId: v, responsavelNome: user?.name || null } : prev)
                            showGestaoToast('Responsável definido')
                          } catch (e2) { alerts.error('Erro', (e2 as Error).message) }
                        }}
                      >
                        <option value="">Selecione um responsável</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      {typeof itemDetalhes?.responsavelNome === 'string' && itemDetalhes.responsavelNome && (
                        <p className="text-[11px] text-muted-foreground">Atual: <span className="font-medium text-foreground">{itemDetalhes.responsavelNome}</span></p>
                      )}
                    </div>

                    {/* Observação */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Observações</label>
                      <textarea
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                        value={(itemDetalhes?.observacoes as string) || ''}
                        onChange={e => setItemDetalhes(prev => prev ? { ...prev, observacoes: e.target.value } : prev)}
                        placeholder="Adicione observações sobre esta mensagem..."
                      />
                      <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1"
                        onClick={async () => {
                          if (!itemDetalhes?.id) return
                          try {
                            await trpc.caixaPostal.adicionarObservacao.mutate({ itemId: itemDetalhes.id as string, texto: (itemDetalhes.observacoes as string) || '' })
                            const isn = detalheMsg?.isn || detalheMsg?.ISN
                            if (isn && selectedCliente) loadItemDetalhes(isn, selectedCliente.documento)
                            showGestaoToast('Observação salva')
                          } catch (e) { alerts.error('Erro', (e as Error).message) }
                        }}>
                        <MessageSquare className="h-3 w-3" />Salvar observação
                      </Button>
                    </div>

                    <hr />

                    {/* Encaminhar */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Encaminhar mensagem</label>
                      <select id="encaminhar-modal-dest"
                        className="h-9 w-[320px] rounded-md border border-input bg-transparent px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                        defaultValue="">
                        <option value="">Selecione o destinatário</option>
                        {usuarios.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                      </select>
                      <textarea id="encaminhar-modal-obs"
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs min-h-[50px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Observação (opcional)..." />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                          <input type="checkbox" id="encaminhar-modal-email" className="h-3.5 w-3.5 rounded" />
                          Notificar por e-mail
                        </label>
                        <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1.5"
                          onClick={async () => {
                            const dest = (document.getElementById('encaminhar-modal-dest') as HTMLSelectElement)?.value
                            const obs = (document.getElementById('encaminhar-modal-obs') as HTMLTextAreaElement)?.value
                            const email = (document.getElementById('encaminhar-modal-email') as HTMLInputElement)?.checked
                            if (!itemDetalhes?.id || !dest) { alerts.error('Atenção', 'Selecione um destinatário'); return }
                            try {
                              const r = await trpc.caixaPostal.encaminhar.mutate({
                                itemId: itemDetalhes.id as string, destinatarioIds: [dest],
                                observacao: obs || undefined, enviarEmail: email,
                              }) as { mensagem: string }
                              const isn = detalheMsg?.isn || detalheMsg?.ISN
                              if (isn && selectedCliente) loadItemDetalhes(isn, selectedCliente.documento)
                              showGestaoToast(r.mensagem)
                              ;(document.getElementById('encaminhar-modal-dest') as HTMLSelectElement).value = ''
                              ;(document.getElementById('encaminhar-modal-obs') as HTMLTextAreaElement).value = ''
                              ;(document.getElementById('encaminhar-modal-email') as HTMLInputElement).checked = false
                            } catch (e2) { alerts.error('Erro', (e2 as Error).message) }
                          }}>
                          <Send className="h-3 w-3" />Encaminhar
                        </Button>
                      </div>
                    </div>

                    <hr />

                    {/* Criar obrigação */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Criar obrigação/serviço</label>
                      <p className="text-[11px] text-muted-foreground mb-2">Abre uma obrigação vinculada a esta mensagem no cadastro do cliente</p>
                      <Button variant="outline" size="sm" className="text-[11px] h-8 gap-1.5"
                        onClick={async () => {
                          if (!itemDetalhes?.id || !detalheMsg) return
                          const nome = detalheMsg.assuntoModelo || 'Obrigação da Caixa Postal'
                          try {
                            await trpc.caixaPostal.criarObrigacao.mutate({
                              itemId: itemDetalhes.id as string,
                              nome,
                              tipo: 'sob_demanda',
                              observacoes: `Originada da mensagem ISN: ${detalheMsg.isn || detalheMsg.ISN} - ${detalheMsg.descricaoOrigem || detalheMsg.origemModelo || ''}`,
                            })
                            const isn = detalheMsg.isn || detalheMsg.ISN
                            if (isn && selectedCliente) loadItemDetalhes(isn, selectedCliente.documento)
                            showGestaoToast('Obrigação criada com sucesso')
                          } catch (e) { alerts.error('Erro', (e as Error).message) }
                        }}>
                        <ClipboardList className="h-3.5 w-3.5" />Criar Obrigação
                      </Button>
                    </div>
                  </div>
                )}

                {/* ===== ABA HISTÓRICO ===== */}
                {detalheTab === 'historico' && (
                  <div className="p-5">
                    {(() => {
                      const eventos = (itemDetalhes?.eventos as Array<Record<string, unknown>>) || []
                      if (!eventos.length) return (
                        <div className="text-center py-10 text-muted-foreground">
                          <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                          <p className="text-xs">Nenhum evento registrado</p>
                        </div>
                      )

                      const TIPO_ICONS: Record<string, { icon: typeof Mail; color: string }> = {
                        LEITURA: { icon: Eye, color: 'text-sky-500' },
                        ENCAMINHAMENTO: { icon: Send, color: 'text-indigo-500' },
                        RESPONSAVEL: { icon: User, color: 'text-purple-500' },
                        OBSERVACAO: { icon: MessageSquare, color: 'text-amber-500' },
                        STATUS: { icon: RefreshCw, color: 'text-emerald-500' },
                        OBRIGACAO_CRIADA: { icon: ClipboardList, color: 'text-orange-500' },
                        RECLASSIFICACAO: { icon: RotateCcw, color: 'text-gray-500' },
                      }

                      return (
                        <div className="space-y-0">
                          {eventos.map((evt, idx) => {
                            const tipo = TIPO_ICONS[(evt.tipo as string)] || { icon: History, color: 'text-gray-400' }
                            const EvtIcon = tipo.icon
                            const data = new Date(evt.created_at as string)
                            const isLast = idx === eventos.length - 1

                            return (
                              <div key={evt.id as string} className="flex gap-3">
                                <div className="flex flex-col items-center">
                                  <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background', tipo.color)}>
                                    <EvtIcon className="h-3.5 w-3.5" />
                                  </div>
                                  {!isLast && <div className="w-px flex-1 bg-border" />}
                                </div>
                                <div className={cn('pb-5 flex-1 min-w-0', isLast && 'pb-0')}>
                                  <p className="text-xs font-medium">{evt.descricao as string}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {data.toLocaleDateString('pt-BR')} às {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    {typeof evt.user_name === 'string' && evt.user_name && <span> — {evt.user_name}</span>}
                                  </p>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {detalheMsg && (
              <div className="flex-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>ISN: <span className="font-mono">{detalheMsg.isn || detalheMsg.ISN || '—'}</span></span>
                {itemDetalhes && typeof itemDetalhes.leitorNome === 'string' && (
                  <span>• Lida por: <span className="font-medium text-foreground">{itemDetalhes.leitorNome}</span></span>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setDetalheOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="fiscal" icon={Mail} />
          <div>
            <h1>
              {modoFiltrado
                ? 'Caixa Postal e-CAC'
                : selectedCliente ? selectedCliente.razaoSocial : 'Caixa Postal e-CAC'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {modoFiltrado
                ? modoFiltradoTipo === 'importante'
                  ? 'Mensagens marcadas como importante'
                  : `Mensagens não lidas — Prioridade ${prioridadeParam} (${PRIORIDADE_LABELS[prioridadeParam!]})`
                : selectedCliente
                  ? `${formatDoc(selectedCliente.documento)} — Mensagens da caixa postal do e-CAC`
                  : 'Gerencie mensagens da caixa postal do e-CAC via SERPRO'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {modoFiltrado ? (
            <>
              <Button variant="outline" size="sm" onClick={() => {
                setModoFiltrado(false)
                setMensagensAgregadas([])
                router.push('/caixapostal')
              }} className="gap-1.5">
                <X className="h-4 w-4" />Limpar filtro
              </Button>
              <Button variant="ghost" size="sm" onClick={() => {
                setModoFiltrado(false)
                setMensagensAgregadas([])
                router.push('/caixapostal')
              }} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />Voltar
              </Button>
            </>
          ) : selectedCliente ? (
            <div className="flex items-center gap-1.5">
              {canBulkActions && (
                <Button size="sm" onClick={() => handleConsultarCliente(selectedCliente, false)} disabled={mensagensLoading} className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white">
                  {mensagensLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Consultar API
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => handleConsultarCliente(selectedCliente, true)} className="text-xs gap-2"><Inbox className="h-3.5 w-3.5" />Ver cache</DropdownMenuItem>
                  {canReclassify && (
                    <DropdownMenuItem onClick={handleReclassificarTodas} disabled={mensagensLoading || mensagens.length === 0} className="text-xs gap-2"><RotateCcw className="h-3.5 w-3.5" />Reclassificar todas</DropdownMenuItem>
                  )}
                  {canArchiveDelete && (
                    <>
                      <DropdownMenuItem onClick={async () => {
                        if (verArquivadas) {
                          setVerArquivadas(false)
                          handleConsultarCliente(selectedCliente, true)
                        } else {
                          setVerArquivadas(true)
                          setMensagensLoading(true)
                          try {
                            const r = await trpc.caixaPostal.listarArquivadas.query({ contribuinte: selectedCliente.documento }) as { mensagens: MensagemClassificada[]; total: number }
                            setMensagens(r.mensagens || [])
                          } catch (e) { alerts.error('Erro', (e as Error).message) }
                          finally { setMensagensLoading(false) }
                        }
                      }} className="text-xs gap-2">
                        {verArquivadas ? <Inbox className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                        {verArquivadas ? 'Voltar às ativas' : 'Ver arquivadas'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        const ok = await alerts.confirm({ title: 'Arquivar antigas', text: 'Arquivar mensagens lidas com mais de 30 dias?', confirmText: 'Sim', icon: 'question' })
                        if (!ok) return
                        try {
                          const r = await trpc.caixaPostal.arquivarAntigas.mutate({ contribuinte: selectedCliente.documento, dias: 30 }) as { total: number }
                          await alerts.success('Arquivadas', `${r.total} mensagem(ns)`)
                          handleConsultarCliente(selectedCliente, true)
                        } catch (e) { alerts.error('Erro', (e as Error).message) }
                      }} className="text-xs gap-2"><Clock className="h-3.5 w-3.5" />Arquivar lidas +30 dias</DropdownMenuItem>
                      <DropdownMenuItem onClick={async () => {
                        const ok = await alerts.confirm({ title: 'Arquivar antigas', text: 'Arquivar mensagens lidas com mais de 90 dias?', confirmText: 'Sim', icon: 'question' })
                        if (!ok) return
                        try {
                          const r = await trpc.caixaPostal.arquivarAntigas.mutate({ contribuinte: selectedCliente.documento, dias: 90 }) as { total: number }
                          await alerts.success('Arquivadas', `${r.total} mensagem(ns)`)
                          handleConsultarCliente(selectedCliente, true)
                        } catch (e) { alerts.error('Erro', (e as Error).message) }
                      }} className="text-xs gap-2"><Clock className="h-3.5 w-3.5" />Arquivar lidas +90 dias</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" onClick={handleVoltarLista} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" />Voltar
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {canArchiveDelete && selecionados.size > 0 && (
                <Button variant="destructive" size="sm" onClick={handleInativarLote} disabled={inativandoLote} className="gap-1.5">
                  {inativandoLote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                  Inativar ({selecionados.size})
                </Button>
              )}
              {canBulkActions && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white">
                      <Play className="h-3.5 w-3.5" />Consultar em Lote
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onClick={() => handleAbrirLote('classificar')} className="text-xs gap-2"><BookOpen className="h-3.5 w-3.5" />Classificar Mensagens</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleAbrirLote('indicador')} className="text-xs gap-2"><Search className="h-3.5 w-3.5" />Consultar Novas (indicador)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {canBulkActions && (
                    <>
                      <DropdownMenuItem asChild><Link href="/caixapostal/regras" className="text-xs gap-2"><Shield className="h-3.5 w-3.5" />Regras de Classificação</Link></DropdownMenuItem>
                      <DropdownMenuItem onClick={openScheduleModal} className="text-xs gap-2"><CalendarClock className="h-3.5 w-3.5" />Consulta Automática</DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuItem onClick={fetchClientes} className="text-xs gap-2"><RefreshCw className="h-3.5 w-3.5" />Atualizar lista</DropdownMenuItem>
                  {canArchiveDelete && (
                    <DropdownMenuItem onClick={handleLimparTudo} className="text-xs gap-2 text-red-600"><Trash2 className="h-3.5 w-3.5" />Limpar tudo</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Modal Consulta em Lote */}
      {loteOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50" onClick={() => loteStatus !== 'running' && setLoteOpen(false)} />
          <div className="fixed inset-x-4 top-[5%] bottom-[5%] z-50 mx-auto flex max-w-3xl flex-col rounded-lg bg-background shadow-2xl sm:inset-x-auto sm:w-[720px]">
            <div className="flex items-center justify-between border-b px-5 py-3.5">
              <div>
                <h3 className="text-sm font-semibold">
                  {loteModo === 'classificar' ? 'Classificar Mensagens em Lote' : 'Consultar Novas em Lote'}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {loteModo === 'classificar' ? 'Busca mensagens no SERPRO e classifica por prioridade' : 'Verifica indicador de novas mensagens para cada cliente'}
                </p>
              </div>
              {loteStatus !== 'running' && (
                <Button variant="ghost" size="icon-sm" onClick={() => setLoteOpen(false)}><X className="h-4 w-4" /></Button>
              )}
            </div>

            {/* Controles */}
            <div className="flex items-center gap-3 border-b px-5 py-3 bg-muted/30">
              <div className="flex items-center gap-2 flex-1">
                <Input placeholder="Filtrar clientes..." value={loteSearchFilter} onChange={e => setLoteSearchFilter(e.target.value)} className="h-8 text-xs max-w-[220px]" disabled={loteStatus === 'running'} />
                <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" disabled={loteStatus === 'running'}
                  onClick={() => loteToggleAll(loteSelecionados.size < loteClientesFiltrados.length)}>
                  {loteSelecionados.size >= loteClientesFiltrados.length && loteClientesFiltrados.length > 0 ? 'Desmarcar todos' : 'Marcar todos'}
                </Button>
                <Badge variant="outline" className="text-[10px] shrink-0">{loteSelecionados.size} de {clientes.length}</Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label className="text-[11px] text-muted-foreground whitespace-nowrap">Intervalo:</label>
                <Select value={String(loteDelay)} onValueChange={v => setLoteDelay(Number(v))} disabled={loteStatus === 'running'}>
                  <SelectTrigger className="h-8 w-[80px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5s</SelectItem>
                    <SelectItem value="10">10s</SelectItem>
                    <SelectItem value="15">15s</SelectItem>
                    <SelectItem value="20">20s</SelectItem>
                    <SelectItem value="30">30s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto">
              {loteStatus === 'idle' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px] pl-5">
                        <input type="checkbox"
                          checked={loteClientesFiltrados.length > 0 && loteClientesFiltrados.every(c => loteSelecionados.has(c.id))}
                          onChange={e => loteToggleAll(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-gray-300" />
                      </TableHead>
                      <TableHead className="text-xs">Razão Social</TableHead>
                      <TableHead className="text-xs w-[160px]">CNPJ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!loteClientesFiltrados.length ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-xs">Nenhum cliente encontrado</TableCell></TableRow>
                    ) : loteClientesFiltrados.map(c => (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/40" onClick={() => loteToggle(c.id)}>
                        <TableCell className="pl-5">
                          <input type="checkbox" checked={loteSelecionados.has(c.id)} onChange={() => loteToggle(c.id)} className="h-3.5 w-3.5 rounded border-gray-300" />
                        </TableCell>
                        <TableCell className="text-xs font-medium">{c.razaoSocial}</TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{formatDoc(c.documento)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="divide-y">
                  {loteItems.map((item, idx) => (
                    <div key={item.id} className={cn('flex items-center gap-3 px-5 py-2.5 text-xs', item.status === 'consultando' && 'bg-sky-50/50 dark:bg-sky-900/10')}>
                      <div className="w-5 shrink-0 text-center font-mono text-muted-foreground">{idx + 1}</div>
                      <div className="w-5 shrink-0">
                        {item.status === 'pendente' && <Clock className="h-3.5 w-3.5 text-muted-foreground/50" />}
                        {item.status === 'consultando' && <Loader2 className="h-3.5 w-3.5 text-sky-500 animate-spin" />}
                        {item.status === 'sucesso' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {item.status === 'erro' && <AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
                        {item.status === 'pulado' && <X className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.razaoSocial}</p>
                        <p className="font-mono text-muted-foreground text-[10px]">{formatDoc(item.documento)}</p>
                      </div>
                      <div className="shrink-0 text-right min-w-[120px]">
                        {item.status === 'consultando' && <span className="text-sky-600 font-medium">Consultando...</span>}
                        {item.status === 'sucesso' && (
                          <span className="text-emerald-600">{item.total !== undefined ? `${item.total} msg` : 'OK'}</span>
                        )}
                        {item.status === 'erro' && <span className="text-red-500 text-[10px] line-clamp-1" title={item.erro || ''}>{item.erro || 'Erro'}</span>}
                        {item.status === 'pulado' && <span className="text-muted-foreground">Cancelado</span>}
                        {item.status === 'pendente' && loteStatus === 'running' && idx === loteItems.findIndex(it => it.status === 'pendente') && loteCountdownRef.current > 0 && (
                          <span className="text-amber-500 font-mono">Aguardando {loteCountdownRef.current}s</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t px-5 py-3 bg-muted/30">
              {loteStatus === 'done' ? (
                <>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 font-medium">{loteItems.filter(i => i.status === 'sucesso').length} sucesso</span>
                    {loteItems.filter(i => i.status === 'erro').length > 0 && (
                      <span className="text-red-500 font-medium">{loteItems.filter(i => i.status === 'erro').length} erro(s)</span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setLoteOpen(false)}>Fechar</Button>
                </>
              ) : loteStatus === 'running' ? (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
                    Processando {loteItems.filter(i => i.status !== 'pendente' && i.status !== 'pulado').length} de {loteItems.length}...
                  </div>
                  <Button variant="destructive" size="sm" onClick={handlePararLote} className="gap-1.5">
                    <X className="h-3.5 w-3.5" />Parar
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{loteSelecionados.size} cliente(s) — intervalo de {loteDelay}s</p>
                  <Button variant="success" size="sm" onClick={handleIniciarLote} disabled={!loteSelecionados.size} className="gap-1.5">
                    <Play className="h-3.5 w-3.5" />Iniciar
                  </Button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* Visão: Mensagens filtradas por prioridade (do dashboard)      */}
      {/* ============================================================ */}
      {modoFiltrado && (
        <Card>
          {/* Header com badge de prioridade */}
          <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Filtro ativo:</span>
              {modoFiltradoTipo === 'importante' ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><Star className="h-3.5 w-3.5 fill-amber-400" />Importantes</span>
              ) : (
                <>{prioridadeParam && <PrioridadeBadge p={prioridadeParam} />}<span className="text-xs text-muted-foreground">— Apenas não lidas</span></>
              )}
            </div>
            <div className="ml-auto">
              <Badge variant="outline" className="text-[10px]">{mensagensAgregadas.length} mensagem(ns)</Badge>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Prior.</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead className="hidden md:table-cell">Origem</TableHead>
                <TableHead className="hidden sm:table-cell w-[90px]">Data</TableHead>
                <TableHead className="hidden lg:table-cell w-[70px] text-center">SLA</TableHead>
                <TableHead className="w-[60px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agregadasLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando mensagens...</div>
                </TableCell></TableRow>
              ) : !mensagensAgregadas.length ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  Nenhuma mensagem não lida com prioridade {prioridadeParam}
                </TableCell></TableRow>
              ) : mensagensAgregadas.map((m, idx) => {
                const isn = m.isn || m.ISN || `agg-${idx}`
                const isImp = (m as Record<string, unknown>).importante === true
                return (
                  <TableRow key={`${m.contribuinte || ''}-${isn}-${idx}`} className={cn(
                    'cursor-pointer transition-colors',
                    isImp && 'border-l-2 border-l-amber-400',
                    !m.lida
                      ? 'bg-white dark:bg-card font-medium hover:bg-gray-50 dark:hover:bg-muted/40'
                      : 'bg-transparent hover:bg-muted/30',
                  )} onClick={() => handleDetalhar(m, m.contribuinte)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <PrioridadeBadge p={m.prioridade} />
                        {isImp && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[180px]">
                      <p className={cn('truncate', !m.lida ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{m.clienteNome || '—'}</p>
                      {m.contribuinte && (
                        <p className="font-mono text-[10px] text-muted-foreground font-normal">{formatDoc(m.contribuinte)}</p>
                      )}
                    </TableCell>
                    <TableCell className={cn('text-xs max-w-[220px] truncate', !m.lida ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                      {m.assuntoModelo || '(Sem assunto)'}
                    </TableCell>
                    <TableCell className={cn('hidden md:table-cell text-xs max-w-[180px] truncate', !m.lida ? 'text-foreground/70' : 'text-muted-foreground')}>
                      {m.descricaoOrigem || m.origemModelo || '—'}
                    </TableCell>
                    <TableCell className={cn('hidden sm:table-cell text-xs', !m.lida ? 'text-foreground/70' : 'text-muted-foreground')}>
                      {formatDateSerpro(m.dataEnvio)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-center">
                      {m.sla_dias !== null && m.sla_dias !== undefined ? (
                        <span className={cn('text-[10px] font-mono', m.sla_dias <= 0 ? 'text-red-600 font-bold' : m.sla_dias <= 3 ? 'text-orange-600' : 'text-muted-foreground')}>
                          {m.sla_dias}d
                        </span>
                      ) : <span className="text-[10px] text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="soft-info" size="icon-sm" onClick={() => handleDetalhar(m, m.contribuinte)} title="Ver detalhes">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* ============================================================ */}
      {/* Visão: Lista de clientes                                     */}
      {/* ============================================================ */}
      {!selectedCliente && !modoFiltrado && (
        <>
          {/* Filtros */}
          <div className="flex items-center gap-2">
            {([
              { key: 'todos' as const, label: 'Todos', icon: Mail, count: clientes.length },
              { key: 'pendentes' as const, label: 'Pendentes', icon: MailWarning, count: countPendentes },
              { key: 'lidas' as const, label: 'Em dia', icon: CheckCircle2, count: countEmDia },
            ]).map(f => {
              const isActive = filtroStatus === f.key
              const Icon = f.icon
              return (
                <button key={f.key} type="button" onClick={() => { setFiltroStatus(f.key); setPaginaClientes(1) }}
                  className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                    isActive ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 shadow-sm'
                      : 'border-border/40 text-muted-foreground hover:border-indigo-200 hover:text-foreground bg-card',
                  )}>
                  <Icon className="h-3.5 w-3.5" />{f.label}
                  <span className={cn('text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none',
                    isActive ? 'bg-indigo-200/60 dark:bg-indigo-800/40 text-indigo-700 dark:text-indigo-300' : 'bg-muted text-muted-foreground',
                  )}>{f.count}</span>
                </button>
              )
            })}
          </div>

          {/* Seleção em lote */}
          {selecionados.size > 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 px-4 py-2.5 text-sm">
              <span className="font-medium text-indigo-700 dark:text-indigo-400">{selecionados.size} selecionado{selecionados.size > 1 ? 's' : ''}</span>
              {canArchiveDelete && (
                <Button variant="soft-destructive" size="sm" onClick={handleInativarLote} disabled={inativandoLote}>
                  {inativandoLote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                  Inativar selecionados
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>Limpar seleção</Button>
            </div>
          )}

          {/* DataTable */}
          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
              <div className="flex-1 min-w-[200px] max-w-sm">
                <Input placeholder="Buscar por nome ou CNPJ..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Exibir</span>
                <Select value={String(limitClientes)} onValueChange={(v) => { setLimitClientes(Number(v)); setPaginaClientes(1) }}>
                  <SelectTrigger className="h-9 w-[55px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={clientesPaginados.length > 0 && clientesPaginados.every(c => selecionados.has(c.id))}
                      onCheckedChange={toggleTodosSelecionados}
                    />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Razão Social</TableHead>
                  <TableHead className="w-[160px] whitespace-nowrap hidden xl:table-cell">Documento</TableHead>
                  <TableHead className="hidden md:table-cell w-[100px] text-center whitespace-nowrap">Não Lidas</TableHead>
                  <TableHead className="hidden sm:table-cell w-[100px] text-center whitespace-nowrap">Status</TableHead>
                  <TableHead className="hidden lg:table-cell w-[140px] text-center whitespace-nowrap">Última Sinc.</TableHead>
                  <TableHead className="w-[50px] text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...
                    </div>
                  </TableCell></TableRow>
                ) : !clientesFiltrados.length ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Nenhum cliente encontrado
                  </TableCell></TableRow>
                ) : clientesPaginados.map(c => {
                  const st = statusMap[c.documento.replace(/\D/g, '')]
                  const isRefreshing = refreshingCliente === c.id
                  const isInativando = inativandoCliente === c.id
                  const temNaoLidas = st && st.nao_lidas > 0
                  return (
                    <TableRow key={c.id} className={cn(
                      'cursor-pointer transition-colors',
                      selecionados.has(c.id) && 'bg-sky-50/50 dark:bg-sky-900/10',
                      !selecionados.has(c.id) && temNaoLidas && 'bg-white dark:bg-card hover:bg-gray-50 dark:hover:bg-muted/40 border-l-2 border-l-red-500',
                      !selecionados.has(c.id) && !temNaoLidas && 'bg-transparent hover:bg-muted/30',
                    )} onClick={() => handleConsultarCliente(c, true)}>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox checked={selecionados.has(c.id)} onCheckedChange={() => toggleSelecionado(c.id)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <p className={cn('text-sm truncate', temNaoLidas ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>{c.razaoSocial}</p>
                          {c.alertaProcuracao && (
                            <span title="Possível falta de procuração no e-CAC" className="shrink-0 text-amber-500"><AlertTriangle className="h-3.5 w-3.5" /></span>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-muted-foreground font-normal xl:hidden">{formatDoc(c.documento)}</p>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell font-mono text-xs text-muted-foreground">{formatDoc(c.documento)}</TableCell>
                      <TableCell className="hidden md:table-cell text-center">
                        {st && st.nao_lidas > 0 ? (
                          <Badge variant="destructive" className="text-[10px] px-1.5">{st.nao_lidas}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-center">
                        {st?.status === 'TODAS LIDAS' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600"><CheckCircle2 className="h-3 w-3" />Lidas</span>
                        )}
                        {st?.status === 'NÃO LIDAS' && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><MailWarning className="h-3 w-3" />Pendentes</span>
                        )}
                        {!st?.status && <span className="text-[10px] text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-center">
                        {st?.ultima_sync ? (
                          <span className="text-[10px] text-muted-foreground">{new Date(st.ultima_sync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => handleConsultarCliente(c, true)} className="text-xs gap-2">
                              <Inbox className="h-3.5 w-3.5" />Ver mensagens em cache
                            </DropdownMenuItem>
                            {canBulkActions && (
                              <DropdownMenuItem onClick={() => handleConsultarCliente(c, false)} className="text-xs gap-2">
                                <Search className="h-3.5 w-3.5" />Consultar API
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleRefreshCliente(c)} disabled={isRefreshing} className="text-xs gap-2">
                              {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                              Atualizar status
                            </DropdownMenuItem>
                            {canArchiveDelete && (
                              <DropdownMenuItem onClick={() => handleInativarCliente(c)} disabled={isInativando} className="text-xs gap-2 text-red-500 focus:text-red-500">
                                {isInativando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                                Inativar cliente
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>

            {/* Footer com paginação */}
            {clientesFiltrados.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                  Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{clientesFiltrados.length}</span> registros
                </p>
                {totalPaginas > 1 && (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon-xs" disabled={paginaAtual === 1} onClick={() => setPaginaClientes(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="icon-xs" disabled={paginaAtual === 1} onClick={() => setPaginaClientes(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    {getPageNumbers().map(p => (
                      <Button key={p} variant={p === paginaAtual ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPaginaClientes(p)}>{p}</Button>
                    ))}
                    <Button variant="outline" size="icon-xs" disabled={paginaAtual === totalPaginas} onClick={() => setPaginaClientes(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="icon-xs" disabled={paginaAtual === totalPaginas} onClick={() => setPaginaClientes(totalPaginas)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      {/* ============================================================ */}
      {/* Visão: Mensagens do cliente selecionado                      */}
      {/* ============================================================ */}
      {selectedCliente && !modoFiltrado && (
        <Card>
          {/* Filtros de mensagens */}
          <div className="flex items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
            {verArquivadas ? (
              <div className="flex items-center gap-2">
                <Archive className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs font-medium text-amber-700">Mensagens arquivadas</span>
                <Badge variant="outline" className="text-[10px]">{mensagens.length}</Badge>
              </div>
            ) : (
            <div className="flex items-center gap-1">
              <Button variant={filtroLeitura === 'todas' ? 'soft' : 'ghost'} size="sm" className="h-7 text-[11px]" onClick={() => { setFiltroLeitura('todas'); setPaginaMsg(1) }}>
                Todas ({mensagens.length})
              </Button>
              <Button variant={filtroLeitura === 'nao_lidas' ? 'soft' : 'ghost'} size="sm" className="h-7 text-[11px]" onClick={() => { setFiltroLeitura('nao_lidas'); setPaginaMsg(1) }}>
                Não lidas ({mensagens.filter(m => !m.lida).length})
              </Button>
              <Button variant={filtroLeitura === 'lidas' ? 'soft' : 'ghost'} size="sm" className="h-7 text-[11px]" onClick={() => { setFiltroLeitura('lidas'); setPaginaMsg(1) }}>
                Lidas ({mensagens.filter(m => m.lida).length})
              </Button>
            </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {msgSelecionadas.size > 0 && (
                <>
                  {/* Marcar lidas/não lidas em lote */}
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                    onClick={async () => {
                      const ids = Array.from(msgSelecionadas)
                      // Verificar se a maioria é não lida para decidir a ação
                      const naoLidas = mensagens.filter(m => ids.includes((m as Record<string, unknown>).id as string) && !m.lida)
                      const marcarComoLida = naoLidas.length > 0
                      try {
                        if (marcarComoLida) {
                          await trpc.caixaPostal.marcarLidasLote.mutate({ itemIds: ids })
                          setMensagens(prev => prev.map(m => ids.includes((m as Record<string, unknown>).id as string) ? { ...m, lida: true } : m))
                          alerts.success('Marcadas como lidas', `${ids.length} mensagem(ns)`)
                        } else {
                          await trpc.caixaPostal.marcarNaoLidasLote.mutate({ itemIds: ids })
                          setMensagens(prev => prev.map(m => ids.includes((m as Record<string, unknown>).id as string) ? { ...m, lida: false } : m))
                          alerts.success('Marcadas como não lidas', `${ids.length} mensagem(ns)`)
                        }
                        setMsgSelecionadas(new Set())
                      } catch (e) { alerts.error('Erro', (e as Error).message) }
                    }}>
                    {mensagens.filter(m => Array.from(msgSelecionadas).includes((m as Record<string, unknown>).id as string) && !m.lida).length > 0
                      ? <><MailOpen className="h-3 w-3" />Marcar lidas ({msgSelecionadas.size})</>
                      : <><Mail className="h-3 w-3" />Marcar não lidas ({msgSelecionadas.size})</>
                    }
                  </Button>

                  {/* Arquivar/Desarquivar em lote */}
                  {canArchiveDelete && (
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                      onClick={async () => {
                        const ids = Array.from(msgSelecionadas)
                        const isArq = verArquivadas
                        try {
                          if (isArq) {
                            await trpc.caixaPostal.desarquivar.mutate({ itemIds: ids })
                            await alerts.success('Desarquivadas', `${ids.length} mensagem(ns) desarquivada(s).`)
                          } else {
                            await trpc.caixaPostal.arquivar.mutate({ itemIds: ids })
                            await alerts.success('Arquivadas', `${ids.length} mensagem(ns) arquivada(s).`)
                          }
                          setMensagens(prev => prev.filter(m => !msgSelecionadas.has((m as Record<string, unknown>).id as string)))
                          setMsgSelecionadas(new Set())
                        } catch (e) { alerts.error('Erro', (e as Error).message) }
                      }}>
                      {verArquivadas ? <ArchiveRestore className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
                      {verArquivadas ? `Desarquivar (${msgSelecionadas.size})` : `Arquivar (${msgSelecionadas.size})`}
                    </Button>
                  )}

                  {/* Marcar importante em lote */}
                  <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1"
                    onClick={async () => {
                      const ids = Array.from(msgSelecionadas)
                      const temNaoImportante = mensagens.some(m => ids.includes((m as Record<string, unknown>).id as string) && !(m as Record<string, unknown>).importante)
                      try {
                        await trpc.caixaPostal.marcarImportanteLote.mutate({ itemIds: ids, importante: temNaoImportante })
                        setMensagens(prev => prev.map(m => ids.includes((m as Record<string, unknown>).id as string) ? { ...m, importante: temNaoImportante } as typeof m : m))
                        setMsgSelecionadas(new Set())
                        alerts.success(temNaoImportante ? 'Marcadas como importantes' : 'Importância removida', `${ids.length} mensagem(ns)`)
                      } catch (e) { alerts.error('Erro', (e as Error).message) }
                    }}>
                    <Star className="h-3 w-3" />
                    Importante ({msgSelecionadas.size})
                  </Button>
                </>
              )}
              <Select value={filtroPrioridade || '__all__'} onValueChange={v => { setFiltroPrioridade(v === '__all__' ? '' : v); setPaginaMsg(1) }}>
                <SelectTrigger className="h-7 w-[90px] text-[11px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  <SelectItem value="P0">P0</SelectItem>
                  <SelectItem value="P1">P1</SelectItem>
                  <SelectItem value="P2">P2</SelectItem>
                  <SelectItem value="P3">P3</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="hidden sm:inline">Exibir</span>
                <Select value={String(limitMsg)} onValueChange={(v) => { setLimitMsg(Number(v)); setPaginaMsg(1) }}>
                  <SelectTrigger className="h-7 w-[55px] text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{PAGE_SIZES_MSG.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="hidden md:flex items-center border-l pl-2 ml-1 gap-0.5">
                <button type="button" title="Abrir em modal" onClick={() => { setViewMode('modal'); localStorage.setItem('caixapostal-view-mode', 'modal'); setDetalheMsg(null) }}
                  className={cn('rounded p-1.5 transition-colors', viewMode === 'modal' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' : 'text-muted-foreground hover:bg-muted/50')}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" title="Painel de leitura" onClick={() => { setViewMode('painel'); localStorage.setItem('caixapostal-view-mode', 'painel'); setDetalheOpen(false) }}
                  className={cn('rounded p-1.5 transition-colors', viewMode === 'painel' ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' : 'text-muted-foreground hover:bg-muted/50')}>
                  <PanelRightOpen className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className={cn('flex', viewMode === 'painel' ? 'divide-x' : '')}>
          {/* Lista de mensagens */}
          <div className={cn(viewMode === 'painel' ? 'w-[30%] shrink-0 overflow-hidden' : 'w-full')}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] pl-4">
                  <input
                    type="checkbox"
                    checked={mensagensFiltradas.length > 0 && mensagensFiltradas.every(m => msgSelecionadas.has((m as Record<string, unknown>).id as string))}
                    onChange={() => {
                      const ids = mensagensFiltradas.map(m => (m as Record<string, unknown>).id as string).filter(Boolean)
                      if (ids.every(id => msgSelecionadas.has(id))) {
                        setMsgSelecionadas(new Set())
                      } else {
                        setMsgSelecionadas(new Set(ids))
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer"
                  />
                </TableHead>
                <TableHead className="w-[50px]">Prior.</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead className="w-[50px] text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mensagensLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando SERPRO...</div>
                </TableCell></TableRow>
              ) : !mensagensFiltradas.length ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  {mensagens.length === 0 ? 'Nenhuma mensagem encontrada. Clique em "Consultar API" para buscar.' : 'Nenhuma mensagem com os filtros selecionados.'}
                </TableCell></TableRow>
              ) : msgPaginadas.map((m, idx) => {
                const isn = m.isn || m.ISN || `idx-${idx}`
                const mId = (m as Record<string, unknown>).id as string | undefined
                const isImportante = (m as Record<string, unknown>).importante === true
                return (
                  <TableRow key={`${mId || isn}-${idx}`} className={cn(
                    'cursor-pointer transition-colors',
                    isImportante && 'border-l-2 border-l-amber-400',
                    mId && msgSelecionadas.has(mId) && 'bg-sky-100/60 dark:bg-sky-900/20',
                    !msgSelecionadas.has(mId || '') && !m.lida && 'bg-white dark:bg-card font-medium hover:bg-gray-50 dark:hover:bg-muted/40',
                    !msgSelecionadas.has(mId || '') && m.lida && 'bg-transparent hover:bg-muted/30',
                  )}>
                    <TableCell className="pl-4" onClick={e => e.stopPropagation()}>
                      {mId && (
                        <input type="checkbox" checked={msgSelecionadas.has(mId)} onChange={() => {
                          setMsgSelecionadas(prev => { const n = new Set(prev); if (n.has(mId)) n.delete(mId); else n.add(mId); return n })
                        }} className="h-4 w-4 rounded border-gray-300 text-sky-500 focus:ring-sky-500 accent-sky-500 cursor-pointer" />
                      )}
                    </TableCell>
                    <TableCell onClick={() => handleDetalhar(m)}>
                      <div className="flex items-center gap-1.5">
                        <PrioridadeBadge p={m.prioridade} />
                        {isImportante && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400 shrink-0" />}
                      </div>
                    </TableCell>
                    <TableCell onClick={() => handleDetalhar(m)} className="max-w-[250px]">
                      <p className={cn('text-xs truncate', !m.lida ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{m.assuntoModelo || '(Sem assunto)'}</p>
                      <p className="text-[10px] text-muted-foreground font-normal">{formatDateSerpro(m.dataEnvio)}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleDetalhar(m)} className="text-xs gap-2">
                            <Eye className="h-3.5 w-3.5" />Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleLida(m)} className="text-xs gap-2">
                            {m.lida ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
                            {m.lida ? 'Marcar não lida' : 'Marcar como lida'}
                          </DropdownMenuItem>
                          {typeof (m as Record<string, unknown>).id === 'string' && (
                            <DropdownMenuItem className="text-xs gap-2" onClick={async () => {
                              const id = (m as Record<string, unknown>).id as string
                              try {
                                const r = await trpc.caixaPostal.toggleImportante.mutate({ itemId: id }) as { importante: boolean }
                                setMensagens(prev => prev.map(msg => (msg as Record<string, unknown>).id === id ? { ...msg, importante: r.importante } as typeof msg : msg))
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }}>
                              <Star className={cn('h-3.5 w-3.5', isImportante && 'fill-amber-400 text-amber-500')} />
                              {isImportante ? 'Remover importância' : 'Marcar importante'}
                            </DropdownMenuItem>
                          )}
                          {canReclassify && (
                            <DropdownMenuItem onClick={() => handleReclassificar(m)} className="text-xs gap-2">
                              <RotateCcw className="h-3.5 w-3.5" />Reclassificar
                            </DropdownMenuItem>
                          )}
                          {canArchiveDelete && typeof (m as Record<string, unknown>).id === 'string' && (
                            <DropdownMenuItem className="text-xs gap-2" onClick={async () => {
                              const id = (m as Record<string, unknown>).id as string
                              const isArquivada = (m as Record<string, unknown>).arquivada
                              try {
                                if (isArquivada) {
                                  await trpc.caixaPostal.desarquivar.mutate({ itemIds: [id] })
                                  alerts.success('Desarquivada', '')
                                } else {
                                  await trpc.caixaPostal.arquivar.mutate({ itemIds: [id] })
                                  alerts.success('Arquivada', '')
                                }
                                setMensagens(prev => prev.filter(msg => (msg as Record<string, unknown>).id !== id))
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }}>
                              {(m as Record<string, unknown>).arquivada ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                              {(m as Record<string, unknown>).arquivada ? 'Desarquivar' : 'Arquivar'}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Footer com paginação */}
          {mensagensFiltradas.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Mostrando <span className="font-medium">{startMsg}</span> a <span className="font-medium">{endMsg}</span> de <span className="font-medium">{mensagensFiltradas.length}</span> mensagens
              </p>
              {totalPaginasMsg > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" disabled={paginaAtualMsg === 1} onClick={() => setPaginaMsg(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={paginaAtualMsg === 1} onClick={() => setPaginaMsg(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  {getMsgPageNumbers().map(p => (
                    <Button key={p} variant={p === paginaAtualMsg ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPaginaMsg(p)}>{p}</Button>
                  ))}
                  <Button variant="outline" size="icon-xs" disabled={paginaAtualMsg === totalPaginasMsg} onClick={() => setPaginaMsg(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                  <Button variant="outline" size="icon-xs" disabled={paginaAtualMsg === totalPaginasMsg} onClick={() => setPaginaMsg(totalPaginasMsg)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </div>
          )}
          </div>{/* fim da lista de mensagens */}

          {/* ── Painel de leitura (à direita) ── */}
          {viewMode === 'painel' && (
            <div className="flex-1 min-w-0 overflow-y-auto">
              {detalheLoading ? (
                <div className="flex items-center justify-center h-full min-h-[400px]">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !detalheMsg ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
                  <Mail className="h-10 w-10 mb-3 opacity-20" />
                  <p className="text-sm">Selecione uma mensagem para ler</p>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {/* Header do painel */}
                  <div className="shrink-0 border-b border-border/60 bg-muted/20 px-4 py-3">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const p = detalheMsg.prioridade
                        const styles: Record<string, { bg: string; text: string; label: string; icon: typeof AlertTriangle }> = {
                          P0: { bg: 'bg-red-600', text: 'text-white', label: 'Crítica', icon: AlertTriangle },
                          P1: { bg: 'bg-orange-500', text: 'text-white', label: 'Alta', icon: MailWarning },
                          P2: { bg: 'bg-amber-400', text: 'text-amber-950', label: 'Média', icon: Clock },
                          P3: { bg: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-700 dark:text-gray-200', label: 'Baixa', icon: Mail },
                        }
                        const s = styles[p] || styles.P3!
                        const Icon = s.icon
                        return (
                          <div className={cn('flex items-center gap-2.5 rounded-lg px-3 py-2 shadow-sm', s.bg, s.text)}>
                            <Icon className="h-7 w-7 shrink-0" />
                            <div className="flex flex-col items-start leading-none">
                              <span className="text-sm font-black">{p}</span>
                              <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80 mt-0.5">{s.label}</span>
                            </div>
                          </div>
                        )
                      })()}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold truncate">{detalheMsg.assuntoModelo || 'Sem assunto'}</h3>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{detalheMsg.descricaoOrigem || detalheMsg.origemModelo || '—'} · {formatDateSerpro(detalheMsg.dataEnvio)}</p>
                      </div>
                      <button type="button" onClick={() => setDetalheMsg(null)} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/50">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Abas do painel */}
                  <div className="shrink-0 flex border-b px-4">
                    {([
                      { key: 'conteudo' as const, label: 'Conteúdo', icon: FileText },
                      ...(canGestao ? [
                        { key: 'gestao' as const, label: 'Gestão', icon: User },
                        { key: 'historico' as const, label: 'Histórico', icon: History },
                      ] : []),
                    ]).map(tab => {
                      const TabIcon = tab.icon
                      return (
                        <button key={tab.key} onClick={() => setDetalheTab(tab.key)}
                          className={cn('flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 -mb-px transition-colors',
                            detalheTab === tab.key ? 'border-sky-500 text-sky-600' : 'border-transparent text-muted-foreground hover:text-foreground'
                          )}>
                          <TabIcon className="h-3 w-3" />{tab.label}
                        </button>
                      )
                    })}
                  </div>

                  {/* Conteúdo do painel — reutiliza as mesmas abas do modal */}
                  <div className="flex-1 overflow-y-auto">
                    {detalheTab === 'conteudo' && (
                      <>
                        <div className="px-4 py-3 bg-muted/10 border-b space-y-2">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                            <div><span className="text-muted-foreground">Origem: </span><span className="font-medium">{detalheMsg.descricaoOrigem || detalheMsg.origemModelo || '—'}</span></div>
                            <div><span className="text-muted-foreground">Data: </span><span className="font-medium">{formatDateSerpro(detalheMsg.dataEnvio)}</span></div>
                            <div><span className="text-muted-foreground">Sistema: </span><span className="font-mono">{detalheMsg.codigoSistemaRemetente || '—'}</span></div>
                            <div><span className="text-muted-foreground">Score: </span><span className="font-medium">{detalheMsg.score}/100</span></div>
                          </div>
                          {detalheMsg.acao_recomendada && (
                            <div className="text-xs p-2 rounded bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                              <strong>Ação:</strong> {detalheMsg.acao_recomendada}
                            </div>
                          )}
                          <a href="https://cav.receita.fazenda.gov.br/autenticacao/login" target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-600 hover:underline">
                            <ExternalLink className="h-3 w-3" />Acessar no e-CAC
                          </a>
                        </div>
                        <div className="px-4 py-3">
                          {(() => {
                            const corpo = extrairCorpoMensagem(detalheData)
                            if (corpo) return <div className="prose prose-sm max-w-none text-sm leading-relaxed [&_p]:mb-2 [&_a]:text-sky-600 [&_a]:underline" dangerouslySetInnerHTML={{ __html: corpo }} />
                            const meta = extrairMetadados(detalheData)
                            if (meta) {
                              for (const campo of ['textoMensagem', 'texto', 'mensagem', 'corpo', 'descricao']) {
                                if (meta[campo] && typeof meta[campo] === 'string') return <div className="text-sm leading-relaxed whitespace-pre-wrap">{meta[campo] as string}</div>
                              }
                            }
                            if (detalheData) return <pre className="text-[10px] whitespace-pre-wrap bg-muted/30 rounded p-3 overflow-x-auto max-h-[300px]">{JSON.stringify(detalheData, null, 2)}</pre>
                            return <p className="text-center text-muted-foreground py-6 text-xs">Nenhum conteúdo disponível.</p>
                          })()}
                        </div>
                        {detalheMsg.motivos.length > 0 && (
                          <div className="px-4 py-2 border-t bg-muted/10">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1">Motivos da classificação</p>
                            <div className="flex flex-wrap gap-1">
                              {detalheMsg.motivos.map((mot, i) => <Badge key={i} variant="outline" className="text-[9px] font-normal">{mot}</Badge>)}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {detalheTab === 'gestao' && (
                      <div className="p-4 space-y-4 relative">
                        {gestaoToast && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-emerald-500 text-white text-[11px] font-medium px-3 py-1.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-300">
                            <CheckCircle2 className="h-3 w-3 shrink-0" />{gestaoToast}
                          </div>
                        )}
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</label>
                          <select className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                            value={(itemDetalhes?.status as string) || 'pendente'}
                            onChange={async (e) => {
                              const v = e.target.value
                              if (!itemDetalhes?.id) return
                              try {
                                await trpc.caixaPostal.alterarStatus.mutate({ itemId: itemDetalhes.id as string, status: v as 'pendente' | 'em_andamento' | 'concluido' | 'arquivado' })
                                setItemDetalhes(prev => prev ? { ...prev, status: v } : prev)
                                showGestaoToast('Status atualizado')
                              } catch (e2) { alerts.error('Erro', (e2 as Error).message) }
                            }}>
                            <option value="pendente">Pendente</option>
                            <option value="em_andamento">Em Andamento</option>
                            <option value="concluido">Concluído</option>
                            <option value="arquivado">Arquivado</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Responsável</label>
                          <select className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                            value={(itemDetalhes?.responsavelId as string) || ''}
                            onChange={async (e) => {
                              const v = e.target.value
                              if (!itemDetalhes?.id || !v) return
                              try {
                                await trpc.caixaPostal.definirResponsavel.mutate({ itemId: itemDetalhes.id as string, responsavelId: v })
                                const user = usuarios.find(u => u.id === v)
                                setItemDetalhes(prev => prev ? { ...prev, responsavelId: v, responsavelNome: user?.name || null } : prev)
                                showGestaoToast('Responsável definido')
                              } catch (e2) { alerts.error('Erro', (e2 as Error).message) }
                            }}>
                            <option value="">Selecione...</option>
                            {usuarios.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Observações</label>
                          <textarea className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                            value={(itemDetalhes?.observacoes as string) || ''}
                            onChange={e => setItemDetalhes(prev => prev ? { ...prev, observacoes: e.target.value } : prev)}
                            placeholder="Adicione observações..." />
                          <Button variant="outline" size="sm" className="text-[10px] h-6 gap-1"
                            onClick={async () => {
                              if (!itemDetalhes?.id) return
                              try {
                                await trpc.caixaPostal.adicionarObservacao.mutate({ itemId: itemDetalhes.id as string, texto: (itemDetalhes.observacoes as string) || '' })
                                const isn = detalheMsg?.isn || detalheMsg?.ISN
                                if (isn && selectedCliente) loadItemDetalhes(isn, selectedCliente.documento)
                                showGestaoToast('Observação salva')
                              } catch (e) { alerts.error('Erro', (e as Error).message) }
                            }}>
                            <MessageSquare className="h-3 w-3" />Salvar
                          </Button>
                        </div>
                        <hr />
                        <div className="space-y-1">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Encaminhar mensagem</label>
                          <select id="encaminhar-painel-dest"
                            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                            defaultValue="">
                            <option value="">Selecione o destinatário</option>
                            {usuarios.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                          </select>
                          <textarea id="encaminhar-painel-obs"
                            className="w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-xs min-h-[40px] resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder="Observação (opcional)..." />
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                              <input type="checkbox" id="encaminhar-painel-email" className="h-3.5 w-3.5 rounded" />
                              Notificar por e-mail
                            </label>
                            <Button variant="outline" size="sm" className="h-6 text-[10px] gap-1"
                              onClick={async () => {
                                const dest = (document.getElementById('encaminhar-painel-dest') as HTMLSelectElement)?.value
                                const obs = (document.getElementById('encaminhar-painel-obs') as HTMLTextAreaElement)?.value
                                const email = (document.getElementById('encaminhar-painel-email') as HTMLInputElement)?.checked
                                if (!itemDetalhes?.id || !dest) { alerts.error('Atenção', 'Selecione um destinatário'); return }
                                try {
                                  const r = await trpc.caixaPostal.encaminhar.mutate({
                                    itemId: itemDetalhes.id as string, destinatarioIds: [dest],
                                    observacao: obs || undefined, enviarEmail: email,
                                  }) as { mensagem: string }
                                  const isn = detalheMsg?.isn || detalheMsg?.ISN
                                  if (isn && selectedCliente) loadItemDetalhes(isn, selectedCliente.documento)
                                  showGestaoToast(r.mensagem)
                                  ;(document.getElementById('encaminhar-painel-dest') as HTMLSelectElement).value = ''
                                  ;(document.getElementById('encaminhar-painel-obs') as HTMLTextAreaElement).value = ''
                                  ;(document.getElementById('encaminhar-painel-email') as HTMLInputElement).checked = false
                                } catch (e2) { alerts.error('Erro', (e2 as Error).message) }
                              }}>
                              <Send className="h-3 w-3" />Encaminhar
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {detalheTab === 'historico' && (
                      <div className="p-4">
                        {itemDetalhes && Array.isArray((itemDetalhes as Record<string, unknown>).eventos) ? (
                          <div className="space-y-2">
                            {((itemDetalhes as Record<string, unknown>).eventos as Array<{ tipo: string; descricao: string; createdAt: string; userName?: string }>).map((ev, idx) => (
                              <div key={idx} className="flex gap-2 text-[11px] border-b pb-2 last:border-b-0">
                                <div className="w-2 h-2 rounded-full bg-sky-400 mt-1.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium">{ev.descricao}</p>
                                  <p className="text-[10px] text-muted-foreground">{new Date(ev.createdAt).toLocaleString('pt-BR')} {ev.userName ? `· ${ev.userName}` : ''}</p>
                                </div>
                              </div>
                            ))}
                            {((itemDetalhes as Record<string, unknown>).eventos as unknown[]).length === 0 && (
                              <p className="text-center text-muted-foreground text-xs py-6">Nenhum evento registrado</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-center text-muted-foreground text-xs py-6">Nenhum evento registrado</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>{/* fim do flex lista+painel */}
        </Card>
      )}
    </div>
  )
}
