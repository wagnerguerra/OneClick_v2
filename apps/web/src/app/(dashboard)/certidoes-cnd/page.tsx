'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, Loader2, Trash2, CheckCircle2, XCircle, AlertTriangle, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Eye, RotateCcw,
  Download, X, Play, Users, FileOutput, CalendarClock,
  MoreVertical, RefreshCw, Shield, DollarSign, UserX,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Checkbox,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import { getApiUrl } from '@/lib/api-url'

// ============================================================
// Tipos
// ============================================================

interface CndRecord {
  id: string
  documento: string
  tipoDocumento: number
  razaoSocial: string | null
  etapa: string
  tipoCertidao: string | null
  codigoControle: string | null
  dataEmissao: string | null
  dataValidade: string | null
  temPdf: boolean
  statusApi: number | null
  mensagemApi: string | null
  sucesso: boolean
  erro: string | null
  clienteId: string | null
  createdAt: string
  deletedAt: string | null
}

interface ClienteMensal {
  id: string
  razaoSocial: string
  documento: string
  tipoDocumento: string
}

// ============================================================
// Helpers
// ============================================================

const CERTIDAO_COLORS: Record<string, { bg: string; text: string; border: string; icon: typeof CheckCircle2 }> = {
  'Negativa': { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800', icon: CheckCircle2 },
  'Positiva com Efeitos de Negativa': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800', icon: AlertTriangle },
  'Pendente': { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700', icon: Clock },
}

function CertidaoBadge({ tipo }: { tipo: string | null }) {
  if (!tipo) return <span className="text-xs text-muted-foreground">—</span>
  const c = CERTIDAO_COLORS[tipo] || CERTIDAO_COLORS['Pendente']!
  const Icon = c.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', c.bg, c.text, c.border)}>
      <Icon className="h-3 w-3" />{tipo}
    </span>
  )
}

function formatDoc(d: string) {
  const clean = d.replace(/\D/g, '')
  if (clean.length === 11) return masks.cpf(clean)
  if (clean.length === 14) return masks.cnpj(clean)
  return d
}

function formatDate(d: string | null) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('pt-BR') } catch { return d }
}

function diasRestantes(dataValidade: string | null): number | null {
  if (!dataValidade) return null
  const val = new Date(dataValidade)
  const hoje = new Date()
  return Math.ceil((val.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

function getPageNumbers(current: number, total: number): number[] {
  const pages: number[] = []
  const start = Math.max(1, current - 2)
  const end = Math.min(total, current + 2)
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
}

const DIAS_SEMANA = [
  { key: '1', label: 'Seg' }, { key: '2', label: 'Ter' }, { key: '3', label: 'Qua' },
  { key: '4', label: 'Qui' }, { key: '5', label: 'Sex' }, { key: '6', label: 'Sáb' }, { key: '0', label: 'Dom' },
]
const HORAS_DISPONIVEIS = Array.from({ length: 24 }, (_, i) => i)

function parseCron(cron: string) {
  const parts = cron.split(' ')
  if (parts.length < 5) return { dias: ['1'], horas: [7] }
  const horasStr = parts[1] || '7'
  const diasStr = parts[4] || '*'
  const horas = horasStr === '*' ? [7] : horasStr.split(',').map(Number)
  const dias = diasStr === '*' ? ['1','2','3','4','5','6','0'] : diasStr.split(',')
  return { dias, horas }
}

function buildCron(dias: string[], horas: number[]) {
  return `0 ${horas.sort((a, b) => a - b).join(',')} * * ${dias.length === 7 ? '*' : dias.join(',')}`
}

// ============================================================
// Pagina
// ============================================================

export default function CertidoesCndPage() {
  // Estado principal
  const [data, setData] = useState<CndRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [lixeira, setLixeira] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [totais, setTotais] = useState({ total: 0, negativas: 0, positivasEfeitos: 0, naoEmitidas: 0, lixeira: 0 })

  // Consulta individual
  const [consultaOpen, setConsultaOpen] = useState(false)
  const [consultaDoc, setConsultaDoc] = useState('')
  const [consultaLoading, setConsultaLoading] = useState(false)
  const [clientes, setClientes] = useState<ClienteMensal[]>([])
  const [clienteSelecionado, setClienteSelecionado] = useState('')
  const [clienteSearch, setClienteSearch] = useState('')
  const [forcarNova, setForcarNova] = useState(false)

  // Consulta em lote
  const [loteOpen, setLoteOpen] = useState(false)
  const [loteSelecionados, setLoteSelecionados] = useState<Set<string>>(new Set())
  const [loteSearch, setLoteSearch] = useState('')
  const [loteProgresso, setLoteProgresso] = useState<Array<{ documento: string; sucesso: boolean; erro?: string }>>([])
  const [loteRunning, setLoteRunning] = useState(false)

  // PDF
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfRecord, setPdfRecord] = useState<CndRecord | null>(null)
  const [pdfTab, setPdfTab] = useState<'cnd' | 'sitfis' | 'darf'>('cnd')
  const [sitfisLoading, setSitfisLoading] = useState(false)
  const [sitfisUrl, setSitfisUrl] = useState<string | null>(null)
  const [sitfisErro, setSitfisErro] = useState<string | null>(null)
  const [sitfisFromCache, setSitfisFromCache] = useState(false)

  // DARF
  const [darfLoading, setDarfLoading] = useState(false)
  const [darfPdfBase64, setDarfPdfBase64] = useState<string | null>(null)
  const [darfConsolidado, setDarfConsolidado] = useState<Record<string, unknown> | null>(null)
  const [darfErro, setDarfErro] = useState<string | null>(null)
  const [darfForm, setDarfForm] = useState({ codigoReceita: '', dataPA: '', valorImposto: '', dataConsolidacao: new Date().toISOString().slice(0, 10), tipoPA: 'ME', observacao: '' })
  const [darfBlobUrl, setDarfBlobUrl] = useState<string | null>(null)

  // Agendamento
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleData, setScheduleData] = useState<Record<string, unknown> | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSaving, setScheduleSaving] = useState(false)
  const [scheduleClientes, setScheduleClientes] = useState<Array<{ id: string; razaoSocial: string; documento: string }>>([])
  const [scheduleProgress, setScheduleProgress] = useState<{ current: number; total: number; currentCliente: string; status: string; items: Array<{ razaoSocial: string; status: string; erro?: string }> } | null>(null)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  // Fetch data
  const fetchTotais = useCallback(async () => {
    try {
      const t = await trpc.cnd.totalizadores.query() as typeof totais
      setTotais(t)
    } catch { /* */ }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.cnd.list.query({
        page, limit, search: debouncedSearch || undefined,
        sortBy: 'razaoSocial', sortDir: 'asc',
        tipoCertidao: filtroTipo || undefined,
        lixeira,
      }) as { data: CndRecord[]; total: number }
      setData(result.data)
      setTotal(result.total)
    } catch (e) { console.error('[CND] Erro:', (e as Error).message) }
    finally { setLoading(false) }
  }, [page, limit, debouncedSearch, filtroTipo, lixeira])

  useEffect(() => { fetchData(); fetchTotais() }, [fetchData, fetchTotais])

  // Paginacao
  const totalPages = Math.ceil(total / limit)
  const startRecord = total > 0 ? (page - 1) * limit + 1 : 0
  const endRecord = Math.min(page * limit, total)

  // ── Consulta individual ─────────────────────────────

  async function openConsulta() {
    setConsultaOpen(true)
    setConsultaDoc('')
    setClienteSelecionado('')
    setForcarNova(false)
    setClienteSearch('')
    try {
      const lista = await trpc.cnd.clientesMensais.query() as ClienteMensal[]
      setClientes(lista)
    } catch { /* */ }
  }

  async function handleConsultar() {
    const doc = clienteSelecionado
      ? clientes.find(c => c.id === clienteSelecionado)?.documento || ''
      : consultaDoc
    if (!doc || doc.replace(/\D/g, '').length < 11) { alerts.error('Atenção', 'Informe um documento válido'); return }

    const docLimpo = doc.replace(/\D/g, '')
    const tipo = docLimpo.length === 11 ? 2 : 1

    setConsultaLoading(true)
    try {
      const result = await trpc.cnd.consultar.mutate({
        documento: docLimpo,
        tipoDocumento: tipo,
        clienteId: clienteSelecionado || undefined,
        forcarNova,
      }) as CndRecord & { fromCache?: boolean }

      if (result.sucesso) {
        const cacheMsg = result.fromCache ? ' (do cache)' : ''
        alerts.success(`CND ${result.tipoCertidao || ''}${cacheMsg}`, result.codigoControle ? `Código: ${result.codigoControle}` : '')
      } else {
        alerts.warning('Certidão não emitida', result.erro || result.mensagemApi || 'Sem detalhes')
      }
      setConsultaOpen(false)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setConsultaLoading(false) }
  }

  // ── Inativar clientes ────────────────────────────────

  async function handleInativarCliente(cliente: ClienteMensal) {
    const ok = await alerts.confirm({
      title: 'Inativar cliente',
      text: `Deseja inativar "${cliente.razaoSocial}"? O cliente será removido das consultas automáticas.`,
      confirmText: 'Inativar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await trpc.caixaPostal.inativarCliente.mutate({ clienteId: cliente.id })
      setClientes(prev => prev.filter(c => c.id !== cliente.id))
      setLoteSelecionados(prev => { const n = new Set(prev); n.delete(cliente.id); return n })
      alerts.success('Inativado', `${cliente.razaoSocial} foi inativado.`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Consulta em lote ────────────────────────────────

  async function openLote() {
    setLoteOpen(true)
    setLoteSelecionados(new Set())
    setLoteSearch('')
    setLoteProgresso([])
    setLoteRunning(false)
    try {
      const lista = await trpc.cnd.clientesMensais.query() as ClienteMensal[]
      setClientes(lista)
      setLoteSelecionados(new Set(lista.map(c => c.id)))
    } catch { /* */ }
  }

  async function handleConsultarLote() {
    const docs = clientes
      .filter(c => loteSelecionados.has(c.id))
      .map(c => c.documento.replace(/\D/g, ''))

    if (docs.length === 0) { alerts.error('Atenção', 'Selecione ao menos um cliente'); return }

    setLoteRunning(true)
    setLoteProgresso([])
    try {
      const result = await trpc.cnd.consultarLote.mutate({ documentos: docs }) as Array<{ documento: string; sucesso: boolean; erro?: string }>
      setLoteProgresso(result)
      const ok = result.filter(r => r.sucesso).length
      const fail = result.filter(r => !r.sucesso).length
      alerts.success('Consulta em lote concluída', `${ok} sucesso, ${fail} falha(s)`)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoteRunning(false) }
  }

  // ── Reconsultar individual (forçar nova) ──────────

  async function handleReconsultar(r: CndRecord) {
    const ok = await alerts.confirm({
      title: 'Reconsultar CND',
      text: `Deseja forçar uma nova consulta para ${r.razaoSocial || formatDoc(r.documento)}? Isso irá ignorar o cache de 24h.`,
      confirmText: 'Reconsultar',
      icon: 'question',
    })
    if (!ok) return
    try {
      await trpc.cnd.consultar.mutate({
        documento: r.documento,
        tipoDocumento: r.tipoDocumento,
        clienteId: r.clienteId || undefined,
        forcarNova: true,
      })
      alerts.success('CND atualizada', `Consulta realizada para ${r.razaoSocial || formatDoc(r.documento)}`)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── PDF ─────────────────────────────────────────────

  function handleVerPdf(record: CndRecord) {
    setPdfUrl(`${getApiUrl()}/api/cnd/${record.id}/pdf`)
    setPdfRecord(record)
    setPdfTab('cnd')
    setSitfisUrl(null)
    setSitfisErro(null)
    setSitfisFromCache(false)
    setDarfPdfBase64(null)
    setDarfConsolidado(null)
    setDarfErro(null)
    setDarfForm({ codigoReceita: '', dataPA: '', valorImposto: '', dataConsolidacao: new Date().toISOString().slice(0, 10), tipoPA: 'ME', observacao: '' })
    if (darfBlobUrl) { URL.revokeObjectURL(darfBlobUrl); setDarfBlobUrl(null) }
  }
  async function handleCarregarSitfis(recordOverride?: CndRecord) {
    const record = recordOverride || pdfRecord
    if (!record) return
    setSitfisLoading(true)
    setSitfisErro(null)
    setSitfisUrl(null)
    setSitfisFromCache(false)
    try {
      // Primeiro verificar se tem cache
      const cache = await trpc.sitfis.verificarCache.query({ documento: record.documento }) as { encontrado: boolean; id?: string }
      if (cache.encontrado && cache.id) {
        setSitfisUrl(`${getApiUrl()}/api/sitfis/${cache.id}/pdf`)
        setSitfisFromCache(true)
        setPdfTab('sitfis')
        setSitfisLoading(false)
        return
      }

      // Sem cache — consultar API SERPRO
      const result = await trpc.sitfis.consultar.mutate({
        documento: record.documento,
        clienteId: record.clienteId || undefined,
      }) as { id: string; sucesso: boolean; temPdf: boolean; erro: string | null; consultaRecente?: boolean; consultaRecenteId?: string }

      const id = result.consultaRecenteId || result.id
      if (result.sucesso || result.consultaRecente) {
        setSitfisUrl(`${getApiUrl()}/api/sitfis/${id}/pdf`)
        setSitfisFromCache(!!result.consultaRecente)
        setPdfTab('sitfis')
      } else {
        setSitfisErro(result.erro || 'Não foi possível emitir a situação fiscal')
      }
    } catch (e) {
      setSitfisErro((e as Error).message)
    } finally { setSitfisLoading(false) }
  }

  async function handleEmitirDarf() {
    if (!pdfRecord) return
    if (!darfForm.codigoReceita || !darfForm.dataPA || !darfForm.valorImposto) {
      alerts.error('Atenção', 'Preencha código de receita, período e valor')
      return
    }
    setDarfLoading(true)
    setDarfErro(null)
    setDarfPdfBase64(null)
    setDarfConsolidado(null)
    if (darfBlobUrl) { URL.revokeObjectURL(darfBlobUrl); setDarfBlobUrl(null) }
    try {
      const result = await trpc.sitfis.emitirDarf.mutate({
        documento: pdfRecord.documento,
        tipoDocumento: pdfRecord.tipoDocumento,
        codigoReceita: darfForm.codigoReceita,
        dataPA: darfForm.dataPA,
        valorImposto: Number(darfForm.valorImposto.replace(',', '.')),
        dataConsolidacao: `${darfForm.dataConsolidacao}T00:00:00`,
        tipoPA: darfForm.tipoPA || undefined,
        observacao: darfForm.observacao || undefined,
      }) as { sucesso: boolean; consolidado: Record<string, unknown> | null; darfPdfBase64: string | null; numeroDocumento: string | null }

      if (result.sucesso && result.darfPdfBase64) {
        setDarfPdfBase64(result.darfPdfBase64)
        setDarfConsolidado(result.consolidado)
        // Criar blob URL para o iframe
        const bytes = Uint8Array.from(atob(result.darfPdfBase64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        setDarfBlobUrl(URL.createObjectURL(blob))
        alerts.success('DARF emitido', result.numeroDocumento ? `Documento: ${result.numeroDocumento}` : '')
      } else {
        setDarfErro('DARF emitido sem PDF')
      }
    } catch (e) {
      setDarfErro((e as Error).message)
    } finally { setDarfLoading(false) }
  }

  function handleDownloadDarf() {
    if (!darfPdfBase64) return
    const blob = new Blob([Uint8Array.from(atob(darfPdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `darf_${pdfRecord?.documento || 'doc'}_${new Date().toISOString().slice(0, 10)}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadPdf(id: string) {
    const link = document.createElement('a')
    link.href = `${getApiUrl()}/api/cnd/${id}/download-pdf`
    link.download = ''
    link.click()
  }

  // ── Excluir / Restaurar ─────────────────────────────

  async function handleDelete(id: string) {
    if (!await alerts.confirmDelete()) return
    try {
      await trpc.cnd.delete.mutate({ id })
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRestore(id: string) {
    try {
      await trpc.cnd.restore.mutate({ id })
      fetchData(); fetchTotais()
      alerts.success('Restaurado', '')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Agendamento ─────────────────────────────────────

  async function openSchedule() {
    setScheduleOpen(true)
    setScheduleLoading(true)
    try {
      const [status, clientesList] = await Promise.all([
        trpc.cnd.schedule.get.query() as Promise<Record<string, unknown>>,
        trpc.cnd.schedule.clientes.query() as Promise<typeof scheduleClientes>,
      ])
      setScheduleData(status)
      setScheduleClientes(clientesList)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setScheduleLoading(false) }
  }

  async function handleSaveSchedule() {
    if (!scheduleData) return
    setScheduleSaving(true)
    try {
      await trpc.cnd.schedule.update.mutate((scheduleData as { config: Record<string, unknown> }).config as never)
      alerts.success('Agendamento salvo', '')
      const status = await trpc.cnd.schedule.get.query() as Record<string, unknown>
      setScheduleData(status)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setScheduleSaving(false) }
  }

  async function handleRunNow() {
    try {
      const r = await trpc.cnd.schedule.runNow.mutate() as { message: string }
      alerts.success('Execução', r.message)
      setScheduleProgress({ current: 0, total: 0, currentCliente: 'Iniciando...', status: 'running', items: [] })
      startProgressPolling()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  function startProgressPolling() {
    stopProgressPolling()
    progressIntervalRef.current = setInterval(async () => {
      try {
        const p = await trpc.cnd.schedule.progress.query() as typeof scheduleProgress
        setScheduleProgress(p)
        if (p?.status === 'idle') {
          stopProgressPolling()
          const status = await trpc.cnd.schedule.get.query() as Record<string, unknown>
          setScheduleData(status)
          fetchData(); fetchTotais()
        }
      } catch { /* */ }
    }, 2000)
  }

  function stopProgressPolling() {
    if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md">
            <FileOutput className="h-6 w-6" />
          </div>
          <div>
            <h1>CND's Federais</h1>
            <p className="text-sm text-muted-foreground">Certidões Negativas de Débitos — PGFN/RFB</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white" onClick={openConsulta}>
            <Search className="h-3.5 w-3.5" />Nova Consulta
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={openLote} className="text-xs gap-2">
                <Users className="h-3.5 w-3.5" />Consulta em Lote
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openSchedule} className="text-xs gap-2">
                <CalendarClock className="h-3.5 w-3.5" />Agendamento
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filtros por tipo */}
      <div className="flex items-center gap-2">
        {([
          { key: '', label: 'Todas', icon: FileOutput, count: totais.total },
          { key: 'Negativa', label: 'Negativa', icon: CheckCircle2, count: totais.negativas },
          { key: 'Positiva com Efeitos de Negativa', label: 'Positiva c/ Efeitos', icon: AlertTriangle, count: totais.positivasEfeitos },
          { key: '__nao_emitida__', label: 'Não Emitida', icon: XCircle, count: totais.naoEmitidas },
        ] as const).map(f => {
          const isActive = f.key === '' ? !filtroTipo && !lixeira : filtroTipo === f.key && !lixeira
          const Icon = f.icon
          return (
            <button key={f.key} type="button" onClick={() => { setFiltroTipo(f.key); setLixeira(false); setPage(1) }}
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
        <button type="button" onClick={() => { setLixeira(!lixeira); setFiltroTipo(''); setPage(1) }}
          className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all ml-auto',
            lixeira ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 shadow-sm'
              : 'border-border/40 text-muted-foreground hover:border-red-200 hover:text-foreground bg-card',
          )}>
          <Trash2 className="h-3.5 w-3.5" />Lixeira
          {totais.lixeira > 0 && <span className={cn('text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none', lixeira ? 'bg-red-200/60 text-red-700' : 'bg-muted text-muted-foreground')}>{totais.lixeira}</span>}
        </button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input placeholder="Buscar por razão social, documento ou código..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="h-9 text-sm" />
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-9 w-[55px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 50].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabela */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%] min-w-[180px]">Razão Social</TableHead>
              <TableHead className="hidden xl:table-cell w-[14%]">Documento</TableHead>
              <TableHead className="w-[20%] min-w-[150px]">Certidão</TableHead>
              <TableHead className="hidden md:table-cell w-[10%] text-center">Emissão</TableHead>
              <TableHead className="hidden sm:table-cell w-[12%] text-center">Validade</TableHead>
              <TableHead className="w-[40px] text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                {lixeira ? 'Nenhum registro na lixeira' : 'Nenhuma certidão encontrada'}
              </TableCell></TableRow>
            ) : data.map(r => {
              const dias = diasRestantes(r.dataValidade)
              const vencida = dias !== null && dias <= 0
              const proxVencer = dias !== null && dias > 0 && dias <= 15
              return (
                <TableRow key={r.id} className={cn('hover:bg-muted/30', r.temPdf && 'cursor-pointer')} onClick={() => r.temPdf && handleVerPdf(r)}>
                  <TableCell>
                    <p className="text-sm font-medium">{r.razaoSocial || '—'}</p>
                    <p className="font-mono text-[10px] text-muted-foreground xl:hidden">{formatDoc(r.documento)}</p>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell font-mono text-sm text-muted-foreground">{formatDoc(r.documento)}</TableCell>
                  <TableCell>
                    {r.sucesso ? (
                      <CertidaoBadge tipo={r.tipoCertidao} />
                    ) : r.etapa === 'concluido' && !r.sucesso ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400" title={r.mensagemApi || r.erro || ''}>
                        <XCircle className="h-3 w-3" />{r.mensagemApi || r.erro || 'Certidão não emitida'}
                      </span>
                    ) : r.etapa === 'erro' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-red-500" title={r.erro || ''}><XCircle className="h-3 w-3" />{r.erro || 'Erro na consulta'}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{r.etapa === 'consultando' ? 'Consultando...' : r.etapa === 'autenticando' ? 'Autenticando...' : r.etapa}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground text-center">{formatDate(r.dataEmissao)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    {r.dataValidade ? (
                      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                        vencida ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800' :
                        proxVencer ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' :
                        'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
                      )}>
                        {vencida ? <XCircle className="h-3 w-3" /> : proxVencer ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {formatDate(r.dataValidade)}
                      </span>
                    ) : <span className="text-sm text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {r.temPdf && (
                          <>
                            <DropdownMenuItem onClick={() => handleVerPdf(r)} className="text-xs gap-2"><Eye className="h-3.5 w-3.5" />Visualizar Certidão</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDownloadPdf(r.id)} className="text-xs gap-2"><Download className="h-3.5 w-3.5" />Baixar PDF</DropdownMenuItem>
                          </>
                        )}
                        {!r.temPdf && r.etapa === 'concluido' && !r.sucesso && (
                          <DropdownMenuItem onClick={() => {
                            setPdfRecord(r)
                            setPdfUrl('__sitfis__')
                            setPdfTab('sitfis')
                            setSitfisUrl(null)
                            setSitfisErro(null)
                            setSitfisFromCache(false)
                            handleCarregarSitfis(r)
                          }} className="text-xs gap-2">
                            <Shield className="h-3.5 w-3.5" />Ver Situação Fiscal
                          </DropdownMenuItem>
                        )}
                        {!lixeira && (
                          <DropdownMenuItem onClick={() => handleReconsultar(r)} className="text-xs gap-2"><RefreshCw className="h-3.5 w-3.5" />Reconsultar</DropdownMenuItem>
                        )}
                        {lixeira ? (
                          <DropdownMenuItem onClick={() => handleRestore(r.id)} className="text-xs gap-2"><RotateCcw className="h-3.5 w-3.5" />Restaurar</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleDelete(r.id)} className="text-xs gap-2 text-red-500 focus:text-red-500"><Trash2 className="h-3.5 w-3.5" />Excluir</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {/* Paginacao */}
        {total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{total}</span>
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers(page, totalPages).map(p => (
                  <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Modal Consulta Individual ── */}
      <Dialog open={consultaOpen} onOpenChange={o => !o && setConsultaOpen(false)}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md">
                <Search className="h-6 w-6" />
              </div>
              <div><DialogTitle>Nova Consulta CND</DialogTitle><DialogDescription>Consulte a certidão negativa de débitos federais</DialogDescription></div>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Selecione um cliente mensal</label>
              <Input placeholder="Buscar cliente..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} className="h-8 text-xs" />
              <div className="border rounded-lg max-h-[200px] overflow-y-auto">
                {clientes.filter(c => {
                  if (!clienteSearch) return true
                  const t = clienteSearch.toLowerCase()
                  return c.razaoSocial.toLowerCase().includes(t) || c.documento.includes(t)
                }).map(c => (
                  <div key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 border-b last:border-b-0', clienteSelecionado === c.id && 'bg-indigo-50/40')}>
                    <input type="radio" name="cliente-cnd" checked={clienteSelecionado === c.id} onChange={() => { setClienteSelecionado(c.id); setConsultaDoc(c.documento) }} className="h-3.5 w-3.5 accent-indigo-500 cursor-pointer" />
                    <span className="flex-1 truncate cursor-pointer" onClick={() => { setClienteSelecionado(c.id); setConsultaDoc(c.documento) }}>{c.razaoSocial}</span>
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatDoc(c.documento)}</span>
                    <button type="button" onClick={() => handleInativarCliente(c)} title="Inativar cliente"
                      className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <UserX className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-center text-[10px] text-muted-foreground">ou informe manualmente</div>
            <Input placeholder="CNPJ ou CPF" value={consultaDoc} onChange={e => { setConsultaDoc(e.target.value); setClienteSelecionado('') }} className="h-9 text-sm font-mono" />
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={forcarNova} onCheckedChange={v => setForcarNova(!!v)} />
              Forçar nova consulta (ignorar cache)
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConsultaOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleConsultar} disabled={consultaLoading} className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white">
              {consultaLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              Consultar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Consulta em Lote ── */}
      <Dialog open={loteOpen} onOpenChange={o => !o && setLoteOpen(false)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md">
                <Users className="h-6 w-6" />
              </div>
              <div><DialogTitle>Consulta em Lote</DialogTitle><DialogDescription>Consulte CND de vários clientes mensais</DialogDescription></div>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">{loteSelecionados.size} selecionado(s)</Badge>
              <div className="flex gap-2">
                <button className="text-[10px] text-rose-600 hover:underline" onClick={() => setLoteSelecionados(new Set(clientes.map(c => c.id)))}>Todos</button>
                <button className="text-[10px] text-rose-600 hover:underline" onClick={() => setLoteSelecionados(new Set())}>Nenhum</button>
              </div>
            </div>
            <Input placeholder="Buscar..." value={loteSearch} onChange={e => setLoteSearch(e.target.value)} className="h-8 text-xs" />
            <div className="border rounded-lg max-h-[250px] overflow-y-auto">
              {clientes.filter(c => !loteSearch || c.razaoSocial.toLowerCase().includes(loteSearch.toLowerCase())).map(c => (
                <div key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 border-b last:border-b-0', loteSelecionados.has(c.id) && 'bg-indigo-50/40')}>
                  <input type="checkbox" checked={loteSelecionados.has(c.id)} onChange={() => {
                    setLoteSelecionados(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })
                  }} className="h-3.5 w-3.5 rounded accent-indigo-500 cursor-pointer" />
                  <span className="flex-1 truncate cursor-pointer" onClick={() => setLoteSelecionados(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}>{c.razaoSocial}</span>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatDoc(c.documento)}</span>
                  <button type="button" onClick={() => handleInativarCliente(c)} title="Inativar cliente"
                    className="shrink-0 rounded p-1 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <UserX className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {loteProgresso.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 border-b text-[11px] font-medium">
                  Resultado: {loteProgresso.filter(r => r.sucesso).length} sucesso, {loteProgresso.filter(r => !r.sucesso).length} falha(s)
                </div>
                <div className="max-h-[150px] overflow-y-auto divide-y">
                  {loteProgresso.filter(r => !r.sucesso).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                      <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="font-mono">{formatDoc(r.documento)}</span>
                      <span className="text-red-500 truncate">{r.erro}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLoteOpen(false)}>Fechar</Button>
            <Button size="sm" onClick={handleConsultarLote} disabled={loteRunning || loteSelecionados.size === 0} className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white">
              {loteRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Consultar ({loteSelecionados.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal Agendamento ── */}
      <Dialog open={scheduleOpen} onOpenChange={o => { if (!o) { setScheduleOpen(false); stopProgressPolling() } }}>
        <DialogContent className="max-w-[620px]">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-md">
                <CalendarClock className="h-6 w-6" />
              </div>
              <div><DialogTitle>Agendamento Automático — CND</DialogTitle><DialogDescription>Configure a consulta automática de certidões</DialogDescription></div>
            </div>
          </DialogHeader>
          <DialogBody>
            {scheduleLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando...</div>
            ) : scheduleData ? (() => {
              const cfg = (scheduleData as { config: { enabled: boolean; cron: string; delayMs: number; clienteIds: string[] } }).config
              const setCfg = (partial: Partial<typeof cfg>) => setScheduleData(prev => prev ? { ...prev, config: { ...cfg, ...partial } } : prev)
              const parsed = parseCron(cfg.cron)
              return (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 text-sm font-medium">
                      <button type="button" onClick={() => setCfg({ enabled: !cfg.enabled })}
                        className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors', cfg.enabled ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600')}>
                        <span className={cn('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5', cfg.enabled ? 'translate-x-4 ml-0.5' : 'translate-x-0.5')} />
                      </button>
                      Agendamento {cfg.enabled ? 'ativado' : 'desativado'}
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Dias da semana</label>
                    <div className="flex gap-1.5">
                      {DIAS_SEMANA.map(d => {
                        const active = parsed.dias.includes(d.key)
                        return (
                          <button key={d.key} type="button" onClick={() => {
                            const newDias = active ? parsed.dias.filter(x => x !== d.key) : [...parsed.dias, d.key]
                            if (newDias.length === 0) return
                            setCfg({ cron: buildCron(newDias, parsed.horas) })
                          }} className={cn('rounded-md px-2.5 py-1.5 text-[11px] font-medium border transition-all',
                            active ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm' : 'text-muted-foreground border-border/60 hover:border-indigo-400')}>
                            {d.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Horários</label>
                    <div className="flex flex-wrap gap-1">
                      {HORAS_DISPONIVEIS.map(h => {
                        const active = parsed.horas.includes(h)
                        return (
                          <button key={h} type="button" onClick={() => {
                            const newHoras = active ? parsed.horas.filter(x => x !== h) : [...parsed.horas, h]
                            if (newHoras.length === 0) return
                            setCfg({ cron: buildCron(parsed.dias, newHoras) })
                          }} className={cn('rounded px-2 py-1 text-[11px] font-mono font-medium border min-w-[36px] transition-all',
                            active ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm' : 'text-muted-foreground border-border/60 hover:border-indigo-400')}>
                            {String(h).padStart(2, '0')}h
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Progresso */}
                  {scheduleProgress && scheduleProgress.status === 'running' && (
                    <div className="rounded-lg border overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-indigo-50 dark:bg-indigo-950/20 border-b">
                        <div className="flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" /><span className="font-medium">Processando {scheduleProgress.current}/{scheduleProgress.total}</span></div>
                      </div>
                      <div className="h-1.5 bg-muted"><div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${scheduleProgress.total > 0 ? (scheduleProgress.current / scheduleProgress.total) * 100 : 0}%` }} /></div>
                      <div className="max-h-[200px] overflow-y-auto divide-y">
                        {scheduleProgress.items.map((item, idx) => (
                          <div key={idx} className={cn('flex items-center gap-2 px-3 py-1.5 text-[11px]', item.status === 'processando' && 'bg-indigo-50/50')}>
                            {item.status === 'pendente' && <Clock className="h-3 w-3 text-muted-foreground/40" />}
                            {item.status === 'processando' && <Loader2 className="h-3 w-3 text-indigo-500 animate-spin" />}
                            {item.status === 'ok' && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                            {item.status === 'erro' && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            <span className={cn('flex-1 truncate', item.status === 'processando' && 'font-medium')}>{item.razaoSocial}</span>
                            {item.erro && <span className="text-[10px] text-red-500 truncate max-w-[150px]">{item.erro}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })() : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={handleRunNow} disabled={scheduleProgress?.status === 'running'} className="gap-1.5">
              <Play className="h-3.5 w-3.5" />Executar Agora
            </Button>
            <Button size="sm" onClick={handleSaveSchedule} disabled={scheduleSaving} className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white">
              {scheduleSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal PDF com abas CND / Situação Fiscal ── */}
      {pdfUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setPdfUrl(null); setPdfRecord(null) }}>
          <div className="bg-card rounded-lg shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-500 text-white shrink-0">
                  <FileOutput className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{pdfRecord?.razaoSocial || 'Certidão'}</h3>
                  <p className="text-[11px] text-muted-foreground">{pdfRecord ? formatDoc(pdfRecord.documento) : ''} {pdfRecord?.tipoCertidao ? `· ${pdfRecord.tipoCertidao}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => {
                  const url = pdfTab === 'sitfis' && sitfisUrl ? sitfisUrl.replace('/pdf', '/download-pdf') : pdfUrl.replace('/pdf', '/download-pdf')
                  const a = document.createElement('a'); a.href = url; a.download = ''; a.click()
                }}>
                  <Download className="h-3 w-3" />Baixar
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => { setPdfUrl(null); setPdfRecord(null) }}><X className="h-4 w-4" /></Button>
              </div>
            </div>

            {/* Abas */}
            <div className="flex items-center border-b px-4 shrink-0">
              <button type="button" onClick={() => setPdfTab('cnd')}
                className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                  pdfTab === 'cnd' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <FileOutput className="h-3.5 w-3.5" />CND Federal
              </button>
              <button type="button" onClick={() => {
                setPdfTab('sitfis')
                if (!sitfisUrl && !sitfisLoading && !sitfisErro) handleCarregarSitfis()
              }}
                className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                  pdfTab === 'sitfis' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                <Shield className="h-3.5 w-3.5" />Situação Fiscal
                {sitfisLoading && <Loader2 className="h-3 w-3 animate-spin" />}
              </button>
              {pdfRecord?.tipoCertidao && pdfRecord.tipoCertidao !== 'Negativa' && (
                <button type="button" onClick={() => setPdfTab('darf')}
                  className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                    pdfTab === 'darf' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <DollarSign className="h-3.5 w-3.5" />Emitir DARF
                  {darfLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                </button>
              )}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-hidden">
              {pdfTab === 'cnd' && (
                pdfUrl && pdfUrl !== '__sitfis__' ? (
                  <iframe src={pdfUrl} className="h-full w-full" title="CND Federal" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                    <XCircle className="h-10 w-10 opacity-20" />
                    <p className="text-sm font-medium text-foreground">Certidão não disponível</p>
                    <p className="text-xs text-center max-w-md">{pdfRecord?.mensagemApi || pdfRecord?.erro || 'A certidão não pôde ser emitida para este contribuinte'}</p>
                  </div>
                )
              )}
              {pdfTab === 'sitfis' && (
                <>
                  {sitfisLoading && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                      <p className="text-sm">Consultando situação fiscal via SERPRO...</p>
                      <p className="text-xs">Isso pode levar alguns segundos</p>
                    </div>
                  )}
                  {sitfisErro && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <AlertTriangle className="h-8 w-8 text-amber-500" />
                      <p className="text-sm font-medium text-foreground">Não foi possível carregar</p>
                      <p className="text-xs text-center max-w-md">{sitfisErro}</p>
                      <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={() => handleCarregarSitfis()}>
                        <RefreshCw className="h-3.5 w-3.5" />Tentar novamente
                      </Button>
                    </div>
                  )}
                  {sitfisUrl && !sitfisLoading && (
                    <div className="flex flex-col h-full">
                      {sitfisFromCache && (
                        <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b text-xs text-amber-700 dark:text-amber-400">
                          <span>Relatório do cache (consulta recente). Para atualizar, acesse o módulo de Situação Fiscal.</span>
                          <a href="/situacao-fiscal" className="font-medium underline hover:no-underline shrink-0 ml-3">Ir para Situação Fiscal</a>
                        </div>
                      )}
                      <iframe src={sitfisUrl} className="flex-1 w-full" title="Situação Fiscal" />
                    </div>
                  )}
                  {!sitfisUrl && !sitfisLoading && !sitfisErro && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                      <Shield className="h-8 w-8 opacity-20" />
                      <p className="text-sm">Clique para carregar a situação fiscal</p>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleCarregarSitfis()}>
                        <Search className="h-3.5 w-3.5" />Consultar Situação Fiscal
                      </Button>
                    </div>
                  )}
                </>
              )}
              {pdfTab === 'darf' && (
                <div className="flex h-full">
                  {/* Formulário à esquerda */}
                  <div className="w-[340px] shrink-0 border-r overflow-y-auto p-4 space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold mb-1">Emitir DARF</h4>
                      <p className="text-[11px] text-muted-foreground">Informe o código de receita, período e valor para gerar a guia de pagamento (DARF) via SICALC/SERPRO. O sistema calculará multa e juros automaticamente.</p>
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-400">
                      <strong>Dica:</strong> Consulte a aba "Situação Fiscal" para identificar os códigos de receita e valores pendentes do contribuinte.
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Código de Receita *</label>
                      <input type="text" placeholder="Ex: 0220, 6106..." value={darfForm.codigoReceita}
                        onChange={e => setDarfForm(prev => ({ ...prev, codigoReceita: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Período (PA) *</label>
                        <input type="text" placeholder="MM/YYYY" value={darfForm.dataPA}
                          onChange={e => setDarfForm(prev => ({ ...prev, dataPA: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium">Tipo Período</label>
                        <select value={darfForm.tipoPA} onChange={e => setDarfForm(prev => ({ ...prev, tipoPA: e.target.value }))}
                          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="ME">Mensal</option>
                          <option value="TR">Trimestral</option>
                          <option value="SE">Semestral</option>
                          <option value="AN">Anual</option>
                          <option value="DE">Decendial</option>
                          <option value="QU">Quinzenal</option>
                          <option value="SM">Semanal</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Valor do Imposto (R$) *</label>
                      <input type="text" placeholder="0,00" value={darfForm.valorImposto}
                        onChange={e => setDarfForm(prev => ({ ...prev, valorImposto: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Data de Consolidação</label>
                      <input type="date" value={darfForm.dataConsolidacao}
                        onChange={e => setDarfForm(prev => ({ ...prev, dataConsolidacao: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium">Observação</label>
                      <input type="text" placeholder="Opcional" value={darfForm.observacao}
                        onChange={e => setDarfForm(prev => ({ ...prev, observacao: e.target.value }))}
                        className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>

                    <Button className="w-full gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white" onClick={handleEmitirDarf} disabled={darfLoading}>
                      {darfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
                      Emitir DARF
                    </Button>

                    {darfErro && (
                      <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-900/10 p-3 text-xs text-red-700 dark:text-red-400">
                        <p className="font-medium mb-1">Erro na emissão</p>
                        <p>{darfErro}</p>
                      </div>
                    )}

                    {darfConsolidado && (
                      <div className="rounded-md border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/10 p-3 space-y-1.5 text-xs">
                        <p className="font-semibold text-indigo-700 dark:text-indigo-400 mb-2">Valores Consolidados</p>
                        {typeof darfConsolidado.valorPrincipalMoedaCorrente === 'number' && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Principal</span><span className="font-mono font-medium">R$ {Number(darfConsolidado.valorPrincipalMoedaCorrente).toFixed(2)}</span></div>
                        )}
                        {typeof darfConsolidado.valorMultaMora === 'number' && Number(darfConsolidado.valorMultaMora) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Multa ({String(darfConsolidado.percentualMultaMora)}%)</span><span className="font-mono font-medium text-red-600">R$ {Number(darfConsolidado.valorMultaMora).toFixed(2)}</span></div>
                        )}
                        {typeof darfConsolidado.valorJuros === 'number' && Number(darfConsolidado.valorJuros) > 0 && (
                          <div className="flex justify-between"><span className="text-muted-foreground">Juros ({String(darfConsolidado.percentualJuros)}%)</span><span className="font-mono font-medium text-amber-600">R$ {Number(darfConsolidado.valorJuros).toFixed(2)}</span></div>
                        )}
                        {typeof darfConsolidado.valorTotalConsolidado === 'number' && (
                          <div className="flex justify-between border-t pt-1.5 mt-1.5"><span className="font-semibold">Total</span><span className="font-mono font-bold">R$ {Number(darfConsolidado.valorTotalConsolidado).toFixed(2)}</span></div>
                        )}
                      </div>
                    )}

                    {darfPdfBase64 && (
                      <Button variant="outline" className="w-full gap-1.5" onClick={handleDownloadDarf}>
                        <Download className="h-4 w-4" />Baixar DARF (PDF)
                      </Button>
                    )}
                  </div>

                  {/* Preview do DARF à direita */}
                  <div className="flex-1 min-w-0">
                    {darfLoading ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        <p className="text-sm">Emitindo DARF via SICALC/SERPRO...</p>
                      </div>
                    ) : darfBlobUrl ? (
                      <iframe src={darfBlobUrl} className="h-full w-full" title="DARF" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                        <DollarSign className="h-10 w-10 opacity-20" />
                        <p className="text-sm">Preencha os dados e clique em "Emitir DARF"</p>
                        <p className="text-xs">O documento será gerado via SICALC e exibido aqui</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
