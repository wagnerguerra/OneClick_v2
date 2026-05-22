'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, CheckCircle2, Clock, X, Download, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ListChecks, MoreVertical, RefreshCw, Users, XCircle, Play,
  DollarSign, FileText, CircleAlert, Receipt,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'

// ============================================================
// Tipos
// ============================================================

interface DctfRecord {
  id: string
  clienteId: string | null
  documento: string
  razaoSocial: string | null
  competencia: string
  esocialFechado: boolean
  reinfFechado: boolean
  statusDctfweb: string | null
  valorDebitoApi: number | null
  statusProcesso: string
  statusProcessoLabel: string
  divergente: boolean
  darfEmitido: boolean
  darfPago: boolean
  valorDarf: number | null
  dataConsultaApi: string | null
  nivelAlerta: string
  nivelAlertaLabel: string
  textoSituacao: string | null
  dataEncerramento: string | null
  retificadoraPendente: boolean
  motivoRetificadora: string | null
  statusPosEntrega: string
  dataUltimaEntrega: string | null
  dataVencimento: string | null
}

interface Totais {
  total: number; aguardandoFechamento: number; prontoEnvio: number
  aguardandoPagamento: number; concluido: number
  alertasCriticos: number; alertasAtencao: number; divergentes: number
  retificadoras: number; totalDebitos: number
}

// ============================================================
// Helpers
// ============================================================

function formatDoc(d: string) {
  const clean = d.replace(/\D/g, '')
  return clean.length === 14 ? masks.cnpj(clean) : clean.length === 11 ? masks.cpf(clean) : d
}

function formatMoeda(v: number | null) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function getCompetenciaAtual() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getCompetencias() {
  const comps: string[] = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    comps.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`)
  }
  return comps
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  aguardando_fechamento: { bg: 'bg-gray-50 dark:bg-gray-800/50', text: 'text-gray-600 dark:text-gray-400', border: 'border-gray-200 dark:border-gray-700' },
  pronto_envio: { bg: 'bg-sky-50 dark:bg-sky-900/20', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-200 dark:border-sky-800' },
  aguardando_pagamento: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  concluido: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
}

const ALERTA_COLORS: Record<string, { bg: string; text: string }> = {
  verde: { bg: 'bg-emerald-500', text: 'text-white' },
  amarelo: { bg: 'bg-amber-400', text: 'text-amber-950' },
  vermelho: { bg: 'bg-red-500', text: 'text-white' },
}

function getPageNumbers(current: number, total: number): number[] {
  const pages: number[] = []
  for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) pages.push(i)
  return pages
}

// ============================================================
// Página
// ============================================================

export default function DctfwebPage() {
  const [data, setData] = useState<DctfRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [competencia, setCompetencia] = useState(getCompetenciaAtual())
  const [filtroStatus, setFiltroStatus] = useState('')
  const [totais, setTotais] = useState<Totais>({ total: 0, aguardandoFechamento: 0, prontoEnvio: 0, aguardandoPagamento: 0, concluido: 0, alertasCriticos: 0, alertasAtencao: 0, divergentes: 0, retificadoras: 0, totalDebitos: 0 })

  // Sincronização
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncClientes, setSyncClientes] = useState<Array<{ id: string; razaoSocial: string; documento: string }>>([])
  const [syncSelecionados, setSyncSelecionados] = useState<Set<string>>(new Set())
  const [syncSearch, setSyncSearch] = useState('')
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResultado, setSyncResultado] = useState<Array<{ documento: string; razaoSocial: string; sucesso: boolean; erro?: string }>>([])

  // Visualizador PDF
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfRecord, setPdfRecord] = useState<DctfRecord | null>(null)
  const [pdfTab, setPdfTab] = useState<'relatorio' | 'recibo' | 'guia'>('relatorio')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfErro, setPdfErro] = useState<string | null>(null)

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 400); return () => clearTimeout(t) }, [search])

  const fetchTotais = useCallback(async () => {
    try {
      const t = await trpc.dctfweb.totalizadores.query({ competencia }) as Totais
      setTotais(t)
    } catch { /* */ }
  }, [competencia])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const isRetif = filtroStatus === '__retificadora__'
      const result = await trpc.dctfweb.list.query({
        page, limit, search: debouncedSearch || undefined,
        competencia,
        statusProcesso: isRetif ? undefined : (filtroStatus || undefined),
        statusPosEntrega: isRetif ? 'retificadora_pendente' : undefined,
        sortBy: 'razaoSocial', sortDir: 'asc',
      }) as { data: DctfRecord[]; total: number }
      setData(result.data)
      setTotal(result.total)
    } catch (e) { console.error('[DCTFWeb]', (e as Error).message) }
    finally { setLoading(false) }
  }, [page, limit, debouncedSearch, competencia, filtroStatus])

  useEffect(() => { fetchData(); fetchTotais() }, [fetchData, fetchTotais])

  const totalPages = Math.ceil(total / limit)
  const startRecord = total > 0 ? (page - 1) * limit + 1 : 0
  const endRecord = Math.min(page * limit, total)

  // ── Sincronizar ─────────────────────────────────────

  async function openSyncModal() {
    setSyncOpen(true)
    setSyncSearch('')
    setSyncResultado([])
    setSyncLoading(false)
    try {
      const lista = await trpc.dctfweb.clientesMensais.query() as typeof syncClientes
      setSyncClientes(lista)
      setSyncSelecionados(new Set(lista.map(c => c.id)))
    } catch { /* */ }
  }

  async function handleSincronizarLote() {
    const ids = Array.from(syncSelecionados)
    if (ids.length === 0) { alerts.error('Atenção', 'Selecione ao menos um cliente'); return }
    setSyncLoading(true)
    setSyncResultado([])
    try {
      const result = await trpc.dctfweb.sincronizarLote.mutate({ competencia, clienteIds: ids }) as typeof syncResultado
      setSyncResultado(result)
      const okCount = result.filter(r => r.sucesso).length
      const failCount = result.filter(r => !r.sucesso).length
      alerts.success('Sincronização concluída', `${okCount} sucesso, ${failCount} falha(s)`)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSyncLoading(false) }
  }

  // ── Visualizar PDFs ─────────────────────────────────

  function openPdfViewer(record: DctfRecord, tab: 'relatorio' | 'recibo' | 'guia') {
    setPdfRecord(record)
    setPdfTab(tab)
    setPdfOpen(true)
    setPdfBlobUrl(null)
    setPdfErro(null)
    loadPdf(record, tab)
  }

  async function loadPdf(record: DctfRecord, tab: 'relatorio' | 'recibo' | 'guia') {
    setPdfLoading(true)
    setPdfErro(null)
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null) }
    try {
      let base64: string | null = null
      if (tab === 'relatorio') {
        base64 = await trpc.dctfweb.relatorio.query({ documento: record.documento, competencia: record.competencia }) as string | null
      } else if (tab === 'recibo') {
        base64 = await trpc.dctfweb.recibo.query({ documento: record.documento, competencia: record.competencia }) as string | null
      } else {
        const guiaResult = await trpc.dctfweb.guia.mutate({ documento: record.documento, competencia: record.competencia }) as { pdf: string; dataVencimento: string | null; valorTotal: number | null }
        base64 = guiaResult.pdf
        // Atualizar a data de vencimento na lista se veio do DARF
        if (guiaResult.dataVencimento) {
          fetchData()
        }
      }
      if (base64) {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'application/pdf' })
        setPdfBlobUrl(URL.createObjectURL(blob))
      }
    } catch (e) {
      setPdfErro((e as Error).message)
    } finally { setPdfLoading(false) }
  }

  function handleDownloadPdf() {
    if (!pdfBlobUrl || !pdfRecord) return
    const a = document.createElement('a')
    a.href = pdfBlobUrl
    a.download = `dctfweb_${pdfTab}_${pdfRecord.documento}_${pdfRecord.competencia.replace('/', '-')}.pdf`
    a.click()
  }

  // ── Sincronizar individual ──────────────────────────

  async function handleSincronizarIndividual(r: DctfRecord) {
    try {
      await trpc.dctfweb.sincronizar.mutate({ documento: r.documento, competencia: r.competencia, clienteId: r.clienteId || undefined })
      alerts.success('Atualizado', r.razaoSocial || r.documento)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ── Toggle manual ───────────────────────────────────

  async function handleToggle(id: string, field: string, value: boolean) {
    try {
      await trpc.dctfweb.atualizarManual.mutate({ id, [field]: value } as never)
      fetchData(); fetchTotais()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="fiscal" icon={ListChecks} />
          <div>
            <h1>Controle DCTFWeb</h1>
            <p className="text-sm text-muted-foreground">Hub de conformidade — eSocial, Reinf, DCTFWeb e DARF</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={competencia} onValueChange={v => { setCompetencia(v); setPage(1) }}>
            <SelectTrigger className="h-9 w-[130px] text-xs font-mono"><SelectValue /></SelectTrigger>
            <SelectContent>{getCompetencias().map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white" onClick={openSyncModal}>
            <RefreshCw className="h-3.5 w-3.5" />Sincronizar
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {([
          { label: 'Ag. Fechamento', value: totais.aguardandoFechamento, icon: Clock, color: 'text-gray-500' },
          { label: 'Pronto p/ Envio', value: totais.prontoEnvio, icon: FileText, color: 'text-sky-600' },
          { label: 'Ag. Pagamento', value: totais.aguardandoPagamento, icon: DollarSign, color: 'text-amber-600' },
          { label: 'Concluído', value: totais.concluido, icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Alertas', value: totais.alertasCriticos + totais.alertasAtencao, icon: CircleAlert, color: 'text-red-500' },
        ]).map(kpi => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label} className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                  <p className="text-2xl font-bold mt-0.5">{kpi.value}</p>
                </div>
                <Icon className={cn('h-8 w-8 opacity-20', kpi.color)} />
              </div>
            </Card>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-2">
        {([
          { key: '', label: 'Todos', count: totais.total },
          { key: 'aguardando_fechamento', label: 'Ag. Fechamento', count: totais.aguardandoFechamento },
          { key: 'pronto_envio', label: 'Pronto Envio', count: totais.prontoEnvio },
          { key: 'aguardando_pagamento', label: 'Ag. Pagamento', count: totais.aguardandoPagamento },
          { key: 'concluido', label: 'Concluído', count: totais.concluido },
          ...(totais.retificadoras > 0 ? [{ key: '__retificadora__', label: 'Retificadora', count: totais.retificadoras }] : []),
        ]).map(f => {
          const isActive = filtroStatus === f.key
          return (
            <button key={f.key} type="button" onClick={() => { setFiltroStatus(f.key); setPage(1) }}
              className={cn('flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                isActive ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 shadow-sm'
                  : 'border-border/40 text-muted-foreground hover:border-indigo-200 hover:text-foreground bg-card',
              )}>
              {f.label}
              <span className={cn('text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none',
                isActive ? 'bg-indigo-200/60 dark:bg-indigo-800/40 text-indigo-700 dark:text-indigo-300' : 'bg-muted text-muted-foreground',
              )}>{f.count}</span>
            </button>
          )
        })}
      </div>

      {/* Tabela */}
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex-1 min-w-[200px] max-w-sm">
            <Input placeholder="Buscar por razão social ou documento..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} className="h-9 text-sm" />
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-9 w-[55px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 50].map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[30%] min-w-[180px]">Empresa</TableHead>
              <TableHead className="w-[8%] text-center">eSocial</TableHead>
              <TableHead className="w-[8%] text-center">Reinf</TableHead>
              <TableHead className="w-[18%]">DCTFWeb</TableHead>
              <TableHead className="hidden md:table-cell w-[10%] text-right">Débito</TableHead>
              <TableHead className="hidden md:table-cell w-[10%] text-center">Vencimento</TableHead>
              <TableHead className="hidden sm:table-cell w-[6%] text-center">DARF</TableHead>
              <TableHead className="hidden lg:table-cell w-[10%] text-center">Pós-entrega</TableHead>
              <TableHead className="w-[8%] text-center">Alerta</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={10} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>
              </TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Nenhum registro para {competencia}. Clique em "Sincronizar" para consultar.
              </TableCell></TableRow>
            ) : data.map(r => {
              const sc = STATUS_COLORS[r.statusProcesso] || STATUS_COLORS.aguardando_fechamento!
              const ac = ALERTA_COLORS[r.nivelAlerta] || ALERTA_COLORS.verde!
              return (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell>
                    <p className="text-sm font-medium">{r.razaoSocial || '—'}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{formatDoc(r.documento)}</p>
                  </TableCell>
                  <TableCell className="text-center">
                    <button type="button" onClick={() => handleToggle(r.id, 'esocialFechado', !r.esocialFechado)}
                      className={cn('h-5 w-5 rounded-full border-2 mx-auto flex items-center justify-center transition-all',
                        r.esocialFechado ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600')}>
                      {r.esocialFechado && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <button type="button" onClick={() => handleToggle(r.id, 'reinfFechado', !r.reinfFechado)}
                      className={cn('h-5 w-5 rounded-full border-2 mx-auto flex items-center justify-center transition-all',
                        r.reinfFechado ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300 dark:border-gray-600')}>
                      {r.reinfFechado && <CheckCircle2 className="h-3 w-3" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium', sc.bg, sc.text, sc.border)}>
                      {r.statusProcessoLabel}
                    </span>
                    {r.divergente && <span className="ml-1 text-[9px] text-red-500 font-bold">DIVERG.</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right text-sm font-mono">{formatMoeda(r.valorDebitoApi)}</TableCell>
                  <TableCell className="hidden md:table-cell text-center">
                    {r.dataVencimento ? (() => {
                      const venc = new Date(r.dataVencimento)
                      const hoje = new Date()
                      const dias = Math.ceil((venc.getTime() - hoje.getTime()) / 86400000)
                      const vencido = dias < 0
                      const proximo = dias >= 0 && dias <= 5
                      return (
                        <span className={cn('text-xs font-mono',
                          vencido ? 'text-red-600 font-semibold' : proximo ? 'text-amber-600 font-medium' : 'text-muted-foreground',
                        )}>
                          {venc.toLocaleDateString('pt-BR')}
                        </span>
                      )
                    })() : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    <button type="button" onClick={() => handleToggle(r.id, 'darfPago', !r.darfPago)}
                      className={cn('h-5 w-5 rounded-full border-2 mx-auto flex items-center justify-center transition-all',
                        r.darfPago ? 'border-emerald-500 bg-emerald-500 text-white' : r.darfEmitido ? 'border-amber-400 bg-amber-400 text-amber-950' : 'border-gray-300 dark:border-gray-600')}>
                      {r.darfPago ? <CheckCircle2 className="h-3 w-3" /> : r.darfEmitido ? <DollarSign className="h-3 w-3" /> : null}
                    </button>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center">
                    {r.retificadoraPendente ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium" title={r.motivoRetificadora || ''}>
                        <AlertTriangle className="h-3 w-3" />Retif.
                      </span>
                    ) : r.statusPosEntrega === 'retificadora_transmitida' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600"><CheckCircle2 className="h-3 w-3" />OK</span>
                    ) : r.dataUltimaEntrega ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600"><CheckCircle2 className="h-3 w-3" />OK</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn('inline-block h-3 w-3 rounded-full', ac.bg)} title={r.nivelAlertaLabel} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" className="h-7 w-7"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => openPdfViewer(r, 'relatorio')} className="text-xs gap-2"><FileText className="h-3.5 w-3.5" />Relatório Completo</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openPdfViewer(r, 'recibo')} className="text-xs gap-2"><Receipt className="h-3.5 w-3.5" />Recibo de Transmissão</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openPdfViewer(r, 'guia')} className="text-xs gap-2"><DollarSign className="h-3.5 w-3.5" />Gerar Guia DARF</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSincronizarIndividual(r)} className="text-xs gap-2"><RefreshCw className="h-3.5 w-3.5" />Atualizar via API</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(r.id, 'esocialFechado', !r.esocialFechado)} className="text-xs gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5" />{r.esocialFechado ? 'Desmarcar eSocial' : 'Marcar eSocial fechado'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(r.id, 'reinfFechado', !r.reinfFechado)} className="text-xs gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5" />{r.reinfFechado ? 'Desmarcar Reinf' : 'Marcar Reinf fechado'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(r.id, 'darfEmitido', !r.darfEmitido)} className="text-xs gap-2">
                          <DollarSign className="h-3.5 w-3.5" />{r.darfEmitido ? 'Desmarcar DARF emitido' : 'Marcar DARF emitido'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(r.id, 'darfPago', !r.darfPago)} className="text-xs gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5" />{r.darfPago ? 'Desmarcar pagamento' : 'Marcar como pago'}
                        </DropdownMenuItem>
                        {r.retificadoraPendente && (
                          <DropdownMenuItem onClick={async () => {
                            try {
                              await trpc.dctfweb.marcarRetificadoraOk.mutate({ id: r.id })
                              alerts.success('Regularizada', 'Retificadora marcada como transmitida')
                              fetchData(); fetchTotais()
                            } catch (e) { alerts.error('Erro', (e as Error).message) }
                          }} className="text-xs gap-2 text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" />Retificadora transmitida
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

        {/* Paginação */}
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

      {/* Rodapé com total de débitos */}
      {totais.totalDebitos > 0 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">Total de débitos ({competencia}):</span>
          <span className="font-bold text-lg font-mono">{formatMoeda(totais.totalDebitos)}</span>
        </div>
      )}

      {/* Modal Visualizador PDF */}
      {pdfOpen && pdfRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { setPdfOpen(false); if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl) }}>
          <div className="bg-card rounded-lg shadow-2xl w-full max-w-5xl h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-500 text-white shrink-0">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold truncate">{pdfRecord.razaoSocial || formatDoc(pdfRecord.documento)}</h3>
                  <p className="text-[11px] text-muted-foreground">Competência: {pdfRecord.competencia}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pdfBlobUrl && (
                  <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleDownloadPdf}>
                    <Download className="h-3 w-3" />Baixar
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => { setPdfOpen(false); if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl) }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Abas */}
            <div className="flex items-center border-b px-4 shrink-0">
              {([
                { key: 'relatorio' as const, label: 'Relatório Completo', icon: FileText },
                { key: 'recibo' as const, label: 'Recibo Transmissão', icon: Receipt },
                { key: 'guia' as const, label: 'Guia DARF', icon: DollarSign },
              ]).map(tab => {
                const Icon = tab.icon
                return (
                  <button key={tab.key} type="button" onClick={() => { setPdfTab(tab.key); loadPdf(pdfRecord, tab.key) }}
                    className={cn('flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors',
                      pdfTab === tab.key ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                    <Icon className="h-3.5 w-3.5" />{tab.label}
                    {pdfTab === tab.key && pdfLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </button>
                )
              })}
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-hidden">
              {pdfLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                  <p className="text-sm">Consultando SERPRO...</p>
                </div>
              ) : pdfErro ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <XCircle className="h-8 w-8 text-red-400" />
                  <p className="text-sm font-medium text-foreground">Não foi possível carregar</p>
                  <p className="text-xs text-center max-w-md">{pdfErro}</p>
                  <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={() => loadPdf(pdfRecord, pdfTab)}>
                    <RefreshCw className="h-3.5 w-3.5" />Tentar novamente
                  </Button>
                </div>
              ) : pdfBlobUrl ? (
                <iframe src={pdfBlobUrl} className="h-full w-full" title="DCTFWeb PDF" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
                  <FileText className="h-8 w-8 opacity-20" />
                  <p className="text-sm">Selecione uma aba para carregar o documento</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Sincronizar */}
      <Dialog open={syncOpen} onOpenChange={o => !o && setSyncOpen(false)}>
        <DialogContent className="max-w-[560px]">
          <DialogHeaderIcon icon={Users} color="indigo">
            <DialogTitle>Sincronizar DCTFWeb</DialogTitle>
            <DialogDescription>Selecione os clientes para consultar a competência {competencia}</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">{syncSelecionados.size} selecionado(s)</Badge>
              <div className="flex gap-2">
                <button className="text-[10px] text-indigo-600 hover:underline" onClick={() => setSyncSelecionados(new Set(syncClientes.map(c => c.id)))}>Todos</button>
                <button className="text-[10px] text-indigo-600 hover:underline" onClick={() => setSyncSelecionados(new Set())}>Nenhum</button>
              </div>
            </div>
            <Input placeholder="Buscar..." value={syncSearch} onChange={e => setSyncSearch(e.target.value)} className="h-8 text-xs" />
            <div className="border rounded-lg max-h-[280px] overflow-y-auto">
              {syncClientes.filter(c => !syncSearch || c.razaoSocial.toLowerCase().includes(syncSearch.toLowerCase()) || c.documento.includes(syncSearch)).map(c => (
                <div key={c.id} className={cn('flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/30 border-b last:border-b-0', syncSelecionados.has(c.id) && 'bg-indigo-50/40')}>
                  <input type="checkbox" checked={syncSelecionados.has(c.id)} onChange={() => {
                    setSyncSelecionados(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })
                  }} className="h-3.5 w-3.5 rounded accent-indigo-500 cursor-pointer" />
                  <span className="flex-1 truncate cursor-pointer" onClick={() => setSyncSelecionados(prev => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n })}>{c.razaoSocial}</span>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatDoc(c.documento)}</span>
                </div>
              ))}
            </div>
            {syncResultado.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="px-3 py-2 bg-muted/20 border-b text-[11px] font-medium">
                  Resultado: {syncResultado.filter(r => r.sucesso).length} sucesso, {syncResultado.filter(r => !r.sucesso).length} falha(s)
                </div>
                <div className="max-h-[150px] overflow-y-auto divide-y">
                  {syncResultado.filter(r => !r.sucesso).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                      <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                      <span className="flex-1 truncate">{r.razaoSocial}</span>
                      <span className="text-red-500 truncate text-[10px] max-w-[200px]">{r.erro}</span>
                    </div>
                  ))}
                  {syncResultado.every(r => r.sucesso) && (
                    <div className="px-3 py-3 text-center text-[11px] text-emerald-600">Todos sincronizados com sucesso!</div>
                  )}
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSyncOpen(false)}>Fechar</Button>
            <Button size="sm" onClick={handleSincronizarLote} disabled={syncLoading || syncSelecionados.size === 0} className="gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white">
              {syncLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Sincronizar ({syncSelecionados.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
