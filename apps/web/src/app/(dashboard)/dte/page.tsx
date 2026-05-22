'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Loader2, Trash2, RefreshCw, CheckCircle2, AlertTriangle,
  MailWarning, Eye, Mail, Inbox, Filter, Info, ArrowLeft,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreVertical,
  Building2, Clock, FileText, AlertCircle,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'

// ============================================================
// Tipos
// ============================================================

interface DteMensagem {
  id: string
  cliente_id: string | null
  documento: string
  razao_social: string
  tipo: string
  titulo: string
  data_mensagem: string
  status: string
  observacao: string | null
  synced_at: string
  created_at: string
}

interface DteStats {
  total: number
  naoLidas: number
  clientes: number
}

interface SyncProgress {
  status: 'idle' | 'running' | 'done' | 'error'
  total: number
  current: number
  currentCliente: string
  mensagensNovas: number
  erros: number
  items: Array<{ razaoSocial: string; documento: string; mensagens: number; status: string; erro?: string }>
  logs?: Array<{ time: string; level: string; msg: string }>
}

interface ClienteAgrupado {
  documento: string
  razao_social: string
  total: number
  naoLidas: number
  ultimaMensagem: string
  mensagens: DteMensagem[]
}

// ============================================================
// Constantes
// ============================================================

const MODULE_COLOR = 'var(--mod-fiscal, #818cf8)'

const TIPO_COLORS: Record<string, { bg: string; text: string }> = {
  DFE: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' },
  NOTIFICACOES: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  'NOTIFICAÇÕES': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' },
  'COOPERAÇÃO FISCAL': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  'COOPERACAO FISCAL': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  INTIMACOES: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
  'INTIMAÇÕES': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300' },
  CIENCIAS: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
  'CIÊNCIAS': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' },
}

function TipoBadge({ tipo }: { tipo: string }) {
  const upper = tipo.toUpperCase()
  const colors = TIPO_COLORS[upper] || TIPO_COLORS[tipo] || { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' }
  return <Badge className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', colors.bg, colors.text)}>{tipo || '--'}</Badge>
}

function formatDoc(doc: string) {
  if (!doc) return '--'
  const digits = doc.replace(/\D/g, '')
  if (digits.length === 11) return masks.cpf(digits)
  return masks.cnpj(digits)
}

// ============================================================
// Componente principal
// ============================================================

export default function DtePage() {
  // Dados
  const [mensagens, setMensagens] = useState<DteMensagem[]>([])
  const [stats, setStats] = useState<DteStats>({ total: 0, naoLidas: 0, clientes: 0 })
  const [loading, setLoading] = useState(true)

  // Sync
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncLogs, setSyncLogs] = useState<Array<{ time: string; level: 'info' | 'warn' | 'error' | 'success'; msg: string }>>([])

  // View: 'clientes' (lista agrupada) ou 'mensagens' (mensagens de um cliente)
  const [view, setView] = useState<'clientes' | 'mensagens'>('clientes')
  const [selectedCliente, setSelectedCliente] = useState<ClienteAgrupado | null>(null)

  // Filtros da lista de clientes
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  // Filtros da lista de mensagens
  const [msgSearch, setMsgSearch] = useState('')
  const [tipoFilter, setTipoFilter] = useState('todos')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [msgPage, setMsgPage] = useState(1)
  const [msgPageSize] = useState(20)
  const [selected, setSelected] = useState<string[]>([])

  // Detalhe da mensagem
  const [detailMsg, setDetailMsg] = useState<DteMensagem | null>(null)

  // Debounce da busca
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [search])

  // ============================================================
  // Carregar dados
  // ============================================================

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [msgs, st] = await Promise.all([
        (trpc.dte as any).listMensagens.query({ limit: 500 }) as Promise<DteMensagem[]>,
        (trpc.dte as any).getStats.query() as Promise<DteStats>,
      ])
      setMensagens(msgs)
      setStats(st)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ============================================================
  // Agrupar mensagens por documento (cliente)
  // ============================================================

  const clientesAgrupados: ClienteAgrupado[] = (() => {
    const map = new Map<string, ClienteAgrupado>()
    for (const m of mensagens) {
      const existing = map.get(m.documento)
      if (existing) {
        existing.total += 1
        if (m.status === 'nao_lida') existing.naoLidas += 1
        if (m.data_mensagem > existing.ultimaMensagem) existing.ultimaMensagem = m.data_mensagem
        existing.mensagens.push(m)
      } else {
        map.set(m.documento, {
          documento: m.documento,
          razao_social: m.razao_social,
          total: 1,
          naoLidas: m.status === 'nao_lida' ? 1 : 0,
          ultimaMensagem: m.data_mensagem || '',
          mensagens: [m],
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.razao_social.localeCompare(b.razao_social))
  })()

  const empresasSync = [...new Map(mensagens.map(m => [m.documento, { doc: m.documento, razao: m.razao_social }])).values()]

  // ============================================================
  // Filtros da lista de clientes
  // ============================================================

  const clientesFiltrados = clientesAgrupados.filter(c => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      const docLimpo = c.documento.replace(/\D/g, '')
      const buscaLimpa = q.replace(/\D/g, '')
      const matchNome = c.razao_social.toLowerCase().includes(q)
      const matchDoc = buscaLimpa.length > 0 && docLimpo.includes(buscaLimpa)
      if (!matchNome && !matchDoc) return false
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(clientesFiltrados.length / pageSize))
  const paginaAtual = Math.min(page, totalPages)
  const clientesPaginados = clientesFiltrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize)
  const startRecord = clientesFiltrados.length > 0 ? (paginaAtual - 1) * pageSize + 1 : 0
  const endRecord = Math.min(paginaAtual * pageSize, clientesFiltrados.length)

  // ============================================================
  // Filtros da lista de mensagens (VIEW 2)
  // ============================================================

  const mensagensCliente = selectedCliente?.mensagens || []
  const tipos = [...new Set(mensagensCliente.map(m => m.tipo).filter(Boolean))]

  const mensagensFiltradas = mensagensCliente.filter(m => {
    if (msgSearch) {
      const q = msgSearch.toLowerCase()
      if (!m.titulo.toLowerCase().includes(q) && !m.tipo.toLowerCase().includes(q)) return false
    }
    if (tipoFilter !== 'todos' && m.tipo.toUpperCase() !== tipoFilter.toUpperCase()) return false
    if (statusFilter === 'nao_lida' && m.status !== 'nao_lida') return false
    if (statusFilter === 'lida' && m.status !== 'lida') return false
    return true
  }).sort((a, b) => {
    // Ordenar por data decrescente (dd/mm/yyyy HH:mm)
    const parseDate = (d: string) => {
      const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})\s*(\d{2}):(\d{2})/)
      return m ? new Date(+m[3]!, +m[2]! - 1, +m[1]!, +m[4]!, +m[5]!).getTime() : 0
    }
    return parseDate(b.data_mensagem) - parseDate(a.data_mensagem)
  })

  const msgTotalPages = Math.max(1, Math.ceil(mensagensFiltradas.length / msgPageSize))
  const msgPaginaAtual = Math.min(msgPage, msgTotalPages)
  const mensagensPaginadas = mensagensFiltradas.slice((msgPaginaAtual - 1) * msgPageSize, msgPaginaAtual * msgPageSize)

  // ============================================================
  // Sync
  // ============================================================

  function addLog(level: 'info' | 'warn' | 'error' | 'success', msg: string) {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setSyncLogs(prev => [...prev, { time, level, msg }])
  }

  // Polling do progresso durante sincronizacao
  useEffect(() => {
    if (!syncing) return
    let lastLogCount = 0
    const interval = setInterval(async () => {
      try {
        const progress = await (trpc.dte as any).getSyncProgress.query() as SyncProgress
        setSyncProgress(progress)

        // Sincronizar logs do backend
        if (progress.logs && progress.logs.length > lastLogCount) {
          const newLogs = progress.logs.slice(lastLogCount)
          setSyncLogs(prev => [...prev, ...newLogs.map(l => ({ time: l.time, level: l.level as 'info' | 'warn' | 'error' | 'success', msg: l.msg }))])
          lastLogCount = progress.logs.length
        }

        if (progress.status === 'done' || progress.status === 'error') {
          setSyncing(false)
          loadData()
          if (progress.status === 'done') {
            alerts.success('Sincronizacao concluida', `${progress.mensagensNovas} nova(s) mensagem(ns) importada(s)`)
          }
        }
      } catch { /* silencioso */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [syncing, loadData])

  async function handleSync() {
    const confirmed = await alerts.confirm({
      title: 'Sincronizar DT-e ES',
      text: 'Isso vai abrir o portal da SEFAZ/ES (Agencia Virtual) e importar as mensagens DT-e de todos os clientes com procuracao. Na primeira execucao, sera necessario selecionar o certificado digital PF do contador no dialogo do Windows.',
      confirmText: 'Iniciar Sincronizacao',
      icon: 'info',
    })
    if (!confirmed) return

    setSyncing(true)
    setSyncLogs([])
    addLog('info', 'Iniciando sincronizacao...')
    setSyncProgress({ status: 'running', total: 0, current: 0, currentCliente: 'Iniciando...', mensagensNovas: 0, erros: 0, items: [] })
    setShowSyncModal(true)

    try {
      await (trpc.dte as any).sincronizarTodos.mutate()
    } catch (err) {
      alerts.error('Erro na sincronizacao', (err as Error).message)
      setSyncing(false)
    }
  }

  async function handleSyncCliente(documento: string, razaoSocial: string) {
    const confirmed = await alerts.confirm({
      title: 'Sincronizar DT-e',
      text: `Sincronizar mensagens DT-e de ${razaoSocial} (${formatDoc(documento)})?`,
      confirmText: 'Sincronizar',
      icon: 'question',
    })
    if (!confirmed) return
    setSyncing(true)
    setSyncLogs([])
    addLog('info', `Sincronizando ${razaoSocial} (${documento})...`)
    setSyncProgress({ status: 'running', total: 1, current: 0, currentCliente: razaoSocial, mensagensNovas: 0, erros: 0, items: [{ razaoSocial, documento, mensagens: 0, status: 'processando' }] })
    setShowSyncModal(true)
    try {
      const r = await (trpc.dte as any).sincronizarCliente.mutate({ clienteId: '', documento }) as { mensagens: number; novas: number }
      addLog('success', `${r.novas} nova(s) de ${r.mensagens} total — ${razaoSocial}`)
      alerts.success('Sincronizado', `${r.novas} nova(s) mensagem(ns) de ${razaoSocial}`)
    } catch (err) {
      addLog('error', `Erro: ${(err as Error).message}`)
      alerts.error('Erro', (err as Error).message)
    } finally {
      setSyncing(false)
      loadData()
    }
  }

  // ============================================================
  // Acoes nas mensagens
  // ============================================================

  async function handleMarcarLida(id: string) {
    try {
      await (trpc.dte as any).marcarLida.mutate({ id })
      setMensagens(prev => prev.map(m => m.id === id ? { ...m, status: 'lida' } : m))
      setStats(prev => ({ ...prev, naoLidas: Math.max(0, prev.naoLidas - 1) }))
      // Atualizar mensagens do cliente selecionado
      if (selectedCliente) {
        setSelectedCliente(prev => prev ? {
          ...prev,
          naoLidas: Math.max(0, prev.naoLidas - 1),
          mensagens: prev.mensagens.map(m => m.id === id ? { ...m, status: 'lida' } : m),
        } : null)
      }
    } catch { /* silencioso */ }
  }

  async function handleDelete(id: string) {
    const confirmed = await alerts.confirmDelete()
    if (!confirmed) return
    try {
      await (trpc.dte as any).deleteMensagem.mutate({ id })
      setMensagens(prev => prev.filter(m => m.id !== id))
      setStats(prev => ({ ...prev, total: prev.total - 1 }))
      if (selectedCliente) {
        setSelectedCliente(prev => prev ? {
          ...prev,
          total: prev.total - 1,
          mensagens: prev.mensagens.filter(m => m.id !== id),
        } : null)
      }
    } catch { /* silencioso */ }
  }

  async function handleMarcarLidaLote(ids: string[]) {
    try {
      for (const id of ids) { await (trpc.dte as any).marcarLida.mutate({ id }) }
      setMensagens(prev => prev.map(m => ids.includes(m.id) ? { ...m, status: 'lida' } : m))
      setStats(prev => ({ ...prev, naoLidas: Math.max(0, prev.naoLidas - ids.length) }))
      setSelected([])
      if (selectedCliente) {
        const count = selectedCliente.mensagens.filter(m => ids.includes(m.id) && m.status === 'nao_lida').length
        setSelectedCliente(prev => prev ? {
          ...prev,
          naoLidas: Math.max(0, prev.naoLidas - count),
          mensagens: prev.mensagens.map(m => ids.includes(m.id) ? { ...m, status: 'lida' } : m),
        } : null)
      }
      alerts.success('Atualizado', `${ids.length} mensagem(ns) marcada(s) como lida`)
    } catch { /* silencioso */ }
  }

  async function handleDeleteLote(ids: string[]) {
    const confirmed = await alerts.confirm({
      title: 'Excluir mensagens',
      text: `Excluir ${ids.length} mensagem(ns) selecionada(s)?`,
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!confirmed) return
    try {
      for (const id of ids) { await (trpc.dte as any).deleteMensagem.mutate({ id }) }
      setMensagens(prev => prev.filter(m => !ids.includes(m.id)))
      setStats(prev => ({ ...prev, total: prev.total - ids.length }))
      setSelected([])
      if (selectedCliente) {
        setSelectedCliente(prev => prev ? {
          ...prev,
          total: prev.total - ids.length,
          mensagens: prev.mensagens.filter(m => !ids.includes(m.id)),
        } : null)
      }
      alerts.success('Excluido', `${ids.length} mensagem(ns) removida(s)`)
    } catch { /* silencioso */ }
  }

  // ============================================================
  // Navegacao entre views
  // ============================================================

  function navigateToMensagens(cliente: ClienteAgrupado) {
    setSelectedCliente(cliente)
    setView('mensagens')
    setMsgSearch('')
    setTipoFilter('todos')
    setStatusFilter('todos')
    setMsgPage(1)
    setSelected([])
  }

  function navigateToClientes() {
    setView('clientes')
    setSelectedCliente(null)
    setSelected([])
  }

  // ============================================================
  // Paginacao helpers
  // ============================================================

  function getPageNumbers(current: number, total: number) {
    const pages: number[] = []
    let start = Math.max(1, current - 2)
    const end = Math.min(total, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-5">
      {/* ============================================================ */}
      {/* Header */}
      {/* ============================================================ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ backgroundColor: MODULE_COLOR }}>
            <MailWarning className="h-6 w-6" />
          </div>
          <div>
            {view === 'clientes' ? (
              <>
                <h1 className="text-xl font-semibold">DT-e ES — Domicilio Tributario Eletronico</h1>
                <p className="text-sm text-muted-foreground">Mensagens do Domicilio Tributario Eletronico — SEFAZ/ES</p>
              </>
            ) : (
              <>
                <h1 className="text-xl font-semibold">{selectedCliente?.razao_social}</h1>
                <p className="text-sm text-muted-foreground">{formatDoc(selectedCliente?.documento || '')}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {view === 'mensagens' && selectedCliente && (
            <>
              <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-xs">
                {selectedCliente.total} mensagen(s)
              </Badge>
              {selectedCliente.naoLidas > 0 && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                  {selectedCliente.naoLidas} nao lida(s)
                </Badge>
              )}
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="success" size="sm" className="gap-1.5" disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[260px]">
              <DropdownMenuItem onClick={handleSync} className="gap-2">
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <div>
                  <p className="font-medium text-xs">Todos os clientes</p>
                  <p className="text-[10px] opacity-60">Sincroniza DT-e de todas as empresas com procuracao</p>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                const { value } = await alerts.custom({
                  title: 'Sincronizar por CNPJ',
                  html: '<input id="swal-cnpj" class="swal2-input" placeholder="00.000.000/0000-00" style="font-size:14px">',
                  confirmButtonText: 'Sincronizar',
                  preConfirm: () => (document.getElementById('swal-cnpj') as HTMLInputElement)?.value?.replace(/\D/g, '') || '',
                })
                if (value && value.length >= 14) handleSyncCliente(value, 'CNPJ ' + value)
              }} className="gap-2">
                <Search className="h-3.5 w-3.5 shrink-0" />
                <div>
                  <p className="font-medium text-xs">Por CNPJ</p>
                  <p className="text-[10px] opacity-60">Informe o CNPJ para sincronizar um cliente</p>
                </div>
              </DropdownMenuItem>
              {empresasSync.length > 0 && (
                <>
                  <div className="border-t my-1" />
                  <div className="px-2 py-1"><span className="text-[10px] text-muted-foreground font-medium">Empresas sincronizadas</span></div>
                  {empresasSync.map(e => (
                    <DropdownMenuItem key={e.doc} onClick={() => handleSyncCliente(e.doc, e.razao)} className="gap-2">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-xs truncate">{e.razao}</p>
                        <p className="text-[10px] opacity-60">{formatDoc(e.doc)}</p>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {view === 'mensagens' && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={navigateToClientes}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* VIEW 1: Lista de Clientes (agrupado) */}
      {/* ============================================================ */}
      {view === 'clientes' && (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total</p>
                  <p className="text-2xl font-bold mt-1">{stats.total}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">mensagens</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(129,140,248,0.15)' }}>
                  <Mail className="h-5 w-5" style={{ color: MODULE_COLOR }} />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1" style={{ backgroundColor: MODULE_COLOR }} />
            </Card>
            <Card className="p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Nao lidas</p>
                  <p className="text-2xl font-bold mt-1">{stats.naoLidas}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">pendentes</p>
                </div>
                <div className={cn('flex h-11 w-11 items-center justify-center rounded-full', stats.naoLidas > 0 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30')}>
                  {stats.naoLidas > 0
                    ? <AlertTriangle className="h-5 w-5 text-amber-600" />
                    : <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  }
                </div>
              </div>
              <div className={cn('absolute bottom-0 left-0 right-0 h-1', stats.naoLidas > 0 ? 'bg-amber-400' : 'bg-emerald-400')} />
            </Card>
            <Card className="p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Clientes</p>
                  <p className="text-2xl font-bold mt-1">{stats.clientes}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">empresas</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-400" />
            </Card>
            <Card className="p-4 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Lidas</p>
                  <p className="text-2xl font-bold mt-1">{Math.max(0, stats.total - stats.naoLidas)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{stats.total > 0 ? Math.round(((stats.total - stats.naoLidas) / stats.total) * 100) : 0}% do total</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-400" />
            </Card>
          </div>

          {/* Informativo primeira execucao */}
          {stats.total === 0 && !syncing && !loading && (
            <Card className="p-4 border-indigo-200 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/10">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">Primeira sincronizacao</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Ao clicar em &quot;Sincronizar&quot;, o sistema abrira o portal da SEFAZ/ES (Agencia Virtual) automaticamente.
                    Na primeira execucao, sera necessario:
                  </p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc ml-4">
                    <li>O hCaptcha do gov.br sera resolvido automaticamente via 2Captcha</li>
                    <li><strong>Selecionar o certificado digital PF do contador</strong> no dialogo do Windows (apenas na primeira vez)</li>
                    <li>O sistema navegara automaticamente ate as mensagens DT-e de cada cliente</li>
                  </ul>
                  <p className="text-xs text-muted-foreground mt-2">
                    <strong>Pre-requisitos:</strong> Certificado PF do contador instalado no Windows + API Key do 2Captcha configurada em Configuracoes.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Filtros */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por empresa, CNPJ..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button variant="outline" size="sm" className="gap-1" onClick={loadData} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Atualizar
              </Button>
            </div>
          </Card>

          {/* Tabela de clientes */}
          <Card>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : clientesFiltrados.length === 0 ? (
              <div className="text-center py-16">
                <Inbox className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">
                  {mensagens.length === 0 ? 'Nenhuma mensagem DT-e sincronizada.' : 'Nenhum cliente encontrado com os filtros aplicados.'}
                </p>
                {mensagens.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Clique em &quot;Sincronizar&quot; para importar as mensagens do portal SEFAZ/ES.</p>
                )}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="whitespace-nowrap">
                      <TableHead>Razao Social</TableHead>
                      <TableHead className="w-[150px]">CNPJ</TableHead>
                      <TableHead className="w-[80px] text-center">Msgs</TableHead>
                      <TableHead className="w-[80px] text-center">Nao lidas</TableHead>
                      <TableHead className="w-[120px]">Ultima msg</TableHead>
                      <TableHead className="w-[44px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientesPaginados.map(cliente => (
                      <TableRow
                        key={cliente.documento}
                        className={cn('cursor-pointer hover:bg-muted/50 whitespace-nowrap', cliente.naoLidas > 0 && 'bg-amber-50/50 dark:bg-amber-950/10')}
                        onClick={() => navigateToMensagens(cliente)}
                      >
                        <TableCell className="font-medium text-sm truncate max-w-[300px] uppercase">{cliente.razao_social}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatDoc(cliente.documento)}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-[10px]">{cliente.total}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {cliente.naoLidas > 0
                            ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px]">{cliente.naoLidas}</Badge>
                            : <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-[10px]">0</Badge>
                          }
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{cliente.ultimaMensagem || '--'}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-xs" onClick={e => e.stopPropagation()}>
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); navigateToMensagens(cliente) }}>
                                <Eye className="h-3.5 w-3.5 mr-2" /> Visualizar mensagens
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={e => { e.stopPropagation(); handleSyncCliente(cliente.documento, cliente.razao_social) }}>
                                <RefreshCw className="h-3.5 w-3.5 mr-2" /> Sincronizar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Paginacao */}
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    {startRecord}-{endRecord} de {clientesFiltrados.length} cliente(s)
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" disabled={paginaAtual <= 1} onClick={() => setPage(1)}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" disabled={paginaAtual <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers(paginaAtual, totalPages).map(p => (
                      <Button
                        key={p}
                        variant={p === paginaAtual ? 'default' : 'ghost'}
                        size="icon-xs"
                        onClick={() => setPage(p)}
                        style={p === paginaAtual ? { backgroundColor: MODULE_COLOR } : undefined}
                      >
                        {p}
                      </Button>
                    ))}
                    <Button variant="ghost" size="icon-xs" disabled={paginaAtual >= totalPages} onClick={() => setPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" disabled={paginaAtual >= totalPages} onClick={() => setPage(totalPages)}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* ============================================================ */}
      {/* VIEW 2: Mensagens do Cliente */}
      {/* ============================================================ */}
      {view === 'mensagens' && selectedCliente && (
        <>
          {/* Filtros */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por assunto, tipo..."
                  value={msgSearch}
                  onChange={e => { setMsgSearch(e.target.value); setMsgPage(1) }}
                  className="pl-9"
                />
              </div>
              <Select value={tipoFilter} onValueChange={v => { setTipoFilter(v); setMsgPage(1) }}>
                <SelectTrigger className="w-[160px]"><Filter className="h-3.5 w-3.5 mr-1.5" /><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tipos</SelectItem>
                  {tipos.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setMsgPage(1) }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="nao_lida">Nao lidas</SelectItem>
                  <SelectItem value="lida">Lidas</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="gap-1" onClick={loadData} disabled={loading}>
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Atualizar
              </Button>
            </div>

            {/* Barra de acoes em lote */}
            {selected.length > 0 && (
              <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground">{selected.length} selecionada(s)</span>
                <Button variant="outline" size="xs" className="gap-1" onClick={() => handleMarcarLidaLote(selected)}>
                  <CheckCircle2 className="h-3 w-3" /> Marcar como lidas
                </Button>
                <Button variant="outline" size="xs" className="gap-1 text-destructive" onClick={() => handleDeleteLote(selected)}>
                  <Trash2 className="h-3 w-3" /> Excluir
                </Button>
                <Button variant="ghost" size="xs" onClick={() => setSelected([])}>Limpar selecao</Button>
              </div>
            )}
          </Card>

          {/* Tabela de mensagens */}
          <Card>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : mensagensFiltradas.length === 0 ? (
              <div className="text-center py-16">
                <Inbox className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
                <p className="text-sm text-muted-foreground">Nenhuma mensagem encontrada.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow className="whitespace-nowrap">
                      <TableHead className="w-[36px]">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300"
                          checked={mensagensPaginadas.length > 0 && mensagensPaginadas.every(m => selected.includes(m.id))}
                          onChange={e => {
                            if (e.target.checked) setSelected(prev => [...new Set([...prev, ...mensagensPaginadas.map(m => m.id)])])
                            else setSelected(prev => prev.filter(id => !mensagensPaginadas.some(m => m.id === id)))
                          }}
                        />
                      </TableHead>
                      <TableHead className="w-[100px]">Tipo</TableHead>
                      <TableHead className="w-[44px]"></TableHead>
                      <TableHead>Assunto</TableHead>
                      <TableHead className="w-[110px]">Data</TableHead>
                      <TableHead className="w-[44px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mensagensPaginadas.map(msg => (
                      <TableRow
                        key={msg.id}
                        className={cn(
                          'cursor-pointer whitespace-nowrap',
                          msg.status === 'nao_lida' && 'bg-amber-50/50 dark:bg-amber-950/10 font-medium',
                          selected.includes(msg.id) && 'bg-indigo-50/50 dark:bg-indigo-950/10',
                        )}
                        onClick={() => setDetailMsg(msg)}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={selected.includes(msg.id)}
                            onChange={e => {
                              if (e.target.checked) setSelected(prev => [...prev, msg.id])
                              else setSelected(prev => prev.filter(id => id !== msg.id))
                            }}
                          />
                        </TableCell>
                        <TableCell><TipoBadge tipo={msg.tipo} /></TableCell>
                        <TableCell>
                          {msg.status === 'nao_lida'
                            ? <AlertCircle className="h-4 w-4 text-amber-500" />
                            : <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          }
                        </TableCell>
                        <TableCell className="truncate max-w-[400px]">
                          <span className="text-foreground text-sm">{msg.titulo || '--'}</span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{msg.data_mensagem}</TableCell>
                        <TableCell onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-xs"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setDetailMsg(msg)}>
                                <Eye className="h-3.5 w-3.5 mr-2" /> Visualizar
                              </DropdownMenuItem>
                              {msg.status === 'nao_lida' && (
                                <DropdownMenuItem onClick={() => handleMarcarLida(msg.id)}>
                                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Marcar como lida
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleDelete(msg.id)} className="text-destructive">
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Paginacao */}
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    {mensagensFiltradas.length} mensagem(ns) {msgSearch || tipoFilter !== 'todos' || statusFilter !== 'todos' ? '(filtrado)' : ''}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" disabled={msgPaginaAtual <= 1} onClick={() => setMsgPage(1)}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" disabled={msgPaginaAtual <= 1} onClick={() => setMsgPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {getPageNumbers(msgPaginaAtual, msgTotalPages).map(p => (
                      <Button
                        key={p}
                        variant={p === msgPaginaAtual ? 'default' : 'ghost'}
                        size="icon-xs"
                        onClick={() => setMsgPage(p)}
                        style={p === msgPaginaAtual ? { backgroundColor: MODULE_COLOR } : undefined}
                      >
                        {p}
                      </Button>
                    ))}
                    <Button variant="ghost" size="icon-xs" disabled={msgPaginaAtual >= msgTotalPages} onClick={() => setMsgPage(p => p + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" disabled={msgPaginaAtual >= msgTotalPages} onClick={() => setMsgPage(msgTotalPages)}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </>
      )}

      {/* ============================================================ */}
      {/* Modal Detalhe da Mensagem */}
      {/* ============================================================ */}
      {detailMsg && (
        <Dialog open={!!detailMsg} onOpenChange={open => { if (!open) setDetailMsg(null) }}>
          <DialogContent className="max-w-[550px]">
            <DialogHeaderIcon icon={FileText} color="sky">
              <DialogTitle className="text-[15px]">Mensagem DT-e</DialogTitle>
              <DialogDescription className="text-[11px]">
                {detailMsg.razao_social} — {formatDoc(detailMsg.documento)}
              </DialogDescription>
            </DialogHeaderIcon>
            <DialogBody>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <TipoBadge tipo={detailMsg.tipo} />
                  <span className="text-xs text-muted-foreground">{detailMsg.data_mensagem}</span>
                  {detailMsg.status === 'nao_lida' ? (
                    <Badge className="bg-amber-100 text-amber-700 text-[10px]">Nao lida</Badge>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Lida</Badge>
                  )}
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">Assunto</p>
                  <p className="text-foreground font-medium mt-0.5">{detailMsg.titulo || '--'}</p>
                </div>
                {detailMsg.observacao && (
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">Observacoes</p>
                    <p className="text-foreground text-xs mt-0.5 whitespace-pre-wrap">{detailMsg.observacao}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">Empresa</p>
                    <p className="text-foreground text-xs mt-0.5">{detailMsg.razao_social}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase">CNPJ</p>
                    <p className="text-foreground text-xs mt-0.5">{formatDoc(detailMsg.documento)}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase">Sincronizado em</p>
                  <p className="text-foreground text-xs mt-0.5">{new Date(detailMsg.synced_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-3 border-t">
                {detailMsg.status === 'nao_lida' && (
                  <Button size="sm" variant="success" className="gap-1" onClick={() => { handleMarcarLida(detailMsg.id); setDetailMsg({ ...detailMsg, status: 'lida' }) }}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Marcar como lida
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setDetailMsg(null)}>Fechar</Button>
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}

      {/* ============================================================ */}
      {/* Modal Progresso + Log Detalhado (Sync) */}
      {/* ============================================================ */}
      {showSyncModal && (
        <Dialog open={showSyncModal} onOpenChange={open => { if (!open && !syncing) setShowSyncModal(false) }}>
          <DialogContent className="max-w-[700px] max-h-[90vh]">
            <DialogHeaderIcon icon={RefreshCw} color="violet">
              <DialogTitle className="text-[15px]">Sincronizacao DT-e ES</DialogTitle>
              <DialogDescription className="text-[11px]">
                {syncProgress?.status === 'running' ? 'Sincronizando mensagens...' : syncProgress?.status === 'done' ? 'Concluido!' : syncProgress?.status === 'error' ? 'Erro' : 'Aguardando...'}
              </DialogDescription>
            </DialogHeaderIcon>
            <DialogBody className="space-y-4">
              {/* Barra de progresso */}
              {syncProgress && syncProgress.total > 0 && (
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="truncate max-w-[400px]">{syncProgress.currentCliente}</span>
                    <span>{syncProgress.current}/{syncProgress.total}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%`, backgroundColor: MODULE_COLOR }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                    <span>{syncProgress.mensagensNovas} nova(s)</span>
                    {syncProgress.erros > 0 && <span className="text-destructive">{syncProgress.erros} erro(s)</span>}
                  </div>
                </div>
              )}

              {/* Log detalhado */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground">Log de execucao</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{syncLogs.length} entrada(s)</span>
                    {syncLogs.length > 0 && (
                      <Button variant="ghost" size="xs" className="h-5 px-1.5 text-[10px] gap-1" onClick={() => {
                        const text = syncLogs.map(l => `[${l.time}] ${l.level === 'error' ? 'ERRO' : l.level === 'warn' ? 'AVISO' : l.level === 'success' ? 'OK' : 'INFO'} ${l.msg}`).join('\n')
                        const ta = document.createElement('textarea')
                        ta.value = text
                        ta.style.position = 'fixed'
                        ta.style.opacity = '0'
                        document.body.appendChild(ta)
                        ta.select()
                        try { document.execCommand('copy') } catch { /* silencioso */ }
                        ta.remove()
                        alerts.success('Log copiado', 'Cole em qualquer lugar para compartilhar')
                      }}>
                        <FileText className="h-3 w-3" /> Copiar
                      </Button>
                    )}
                  </div>
                </div>
                <div
                  className="bg-gray-950 dark:bg-gray-900 rounded-lg p-3 max-h-[350px] overflow-y-auto font-mono text-[11px] leading-5 border"
                  ref={el => { if (el) el.scrollTop = el.scrollHeight }}
                >
                  {syncLogs.length === 0 ? (
                    <span className="text-gray-500">Aguardando...</span>
                  ) : syncLogs.map((log, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-gray-500 shrink-0">{log.time}</span>
                      <span className={cn(
                        'shrink-0 w-[14px] text-center',
                        log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : log.level === 'success' ? 'text-emerald-400' : 'text-blue-400',
                      )}>
                        {log.level === 'error' ? '\u2717' : log.level === 'warn' ? '\u26A0' : log.level === 'success' ? '\u2713' : '\u2192'}
                      </span>
                      <span className={cn(
                        log.level === 'error' ? 'text-red-300' : log.level === 'warn' ? 'text-amber-300' : log.level === 'success' ? 'text-emerald-300' : 'text-gray-300',
                      )}>{log.msg}</span>
                    </div>
                  ))}
                  {syncing && <span className="text-blue-400 animate-pulse">|</span>}
                </div>
              </div>

              {/* Tabela de clientes (colapsavel) */}
              {syncProgress && syncProgress.items.length > 0 && (
                <details className="border rounded-lg">
                  <summary className="px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted/50">
                    Clientes ({syncProgress.items.filter(i => i.status === 'ok').length} ok / {syncProgress.items.length} total)
                  </summary>
                  <div className="max-h-[200px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Empresa</TableHead>
                          <TableHead className="text-xs w-[60px]">Msgs</TableHead>
                          <TableHead className="text-xs w-[80px]">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {syncProgress.items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs truncate max-w-[300px]" title={item.razaoSocial}>{item.razaoSocial}</TableCell>
                            <TableCell className="text-xs text-center">{item.mensagens}</TableCell>
                            <TableCell>
                              {item.status === 'ok' && <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">OK</Badge>}
                              {item.status === 'processando' && <Badge className="bg-blue-100 text-blue-700 text-[9px]"><Loader2 className="h-3 w-3 animate-spin mr-1" />...</Badge>}
                              {item.status === 'erro' && <Badge className="bg-red-100 text-red-700 text-[9px]" title={item.erro}>Erro</Badge>}
                              {item.status === 'pendente' && <Badge className="bg-gray-100 text-gray-500 text-[9px]">Pendente</Badge>}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              )}

              {!syncing && (
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowSyncModal(false)}>Fechar</Button>
                </div>
              )}
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
