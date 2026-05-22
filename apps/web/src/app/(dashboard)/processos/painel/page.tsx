'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Workflow, Search, Loader2, AlertTriangle, PlayCircle, Clock, Pause, CheckCircle2,
  ArrowLeft, Filter, Users, X, LayoutGrid, UserCircle2, CalendarRange,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, CardContent,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import { SEGMENTO_SLUGS, SEGMENTO_META, type SegmentoSlug } from '@saas/types'

const MODULE_COLOR = 'var(--mod-processos, #8b5cf6)' // violet (Processos)

interface Execucao {
  id: string
  status: string
  prazoLimite: string | null
  iniciadoEm: string
  concluidoEm: string | null
  pausado: boolean
  servicoId: string
  servicoNome: string
  segmentoSlug: string | null
  clienteId: string
  clienteRazaoSocial: string
  clienteDocumento: string
  processoId: string | null
  processoNome: string | null
  responsavel: { id: string; name: string; image: string | null } | null
  progresso: { total: number; fechados: number }
  prioridade: string
}

type Coluna = 'atrasados' | 'em_andamento' | 'aguardando' | 'pausados' | 'concluidos'

const COLUNAS: { id: Coluna; label: string; icon: typeof Workflow; cor: string; bg: string }[] = [
  { id: 'atrasados',    label: 'Atrasados',         icon: AlertTriangle, cor: '#ef4444', bg: 'bg-red-50 dark:bg-red-950/20' },
  { id: 'em_andamento', label: 'Em andamento',      icon: PlayCircle,    cor: '#8b5cf6', bg: 'bg-violet-50 dark:bg-violet-950/20' },
  { id: 'aguardando',   label: 'Aguardando início', icon: Clock,         cor: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-950/20' },
  { id: 'pausados',     label: 'Pausados',          icon: Pause,         cor: '#64748b', bg: 'bg-slate-50 dark:bg-slate-900/30' },
  { id: 'concluidos',   label: 'Concluídos (7d)',   icon: CheckCircle2,  cor: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
]

export default function PainelOperacionalPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [segmentosFilter, setSegmentosFilter] = useState<string[]>([])
  const [responsavelFilter, setResponsavelFilter] = useState<string>('') // single select para MVP
  const [apenasAtrasados, setApenasAtrasados] = useState(false)
  const [viewMode, setViewMode] = useState<'status' | 'responsavel' | 'timeline'>('status')
  // Modal de checklist
  const [execucaoAberta, setExecucaoAberta] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [responsaveis, setResponsaveis] = useState<Array<{ id: string; name: string; image: string | null }>>([])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const fetchExecucoes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await (trpc.processo as any).painelExecucoes.query({
        search: debouncedSearch || undefined,
        segmentos: segmentosFilter.length > 0 ? segmentosFilter : undefined,
        responsaveis: responsavelFilter ? [responsavelFilter] : undefined,
      }) as Execucao[]
      setExecucoes(result)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [debouncedSearch, segmentosFilter, responsavelFilter])

  useEffect(() => { fetchExecucoes() }, [fetchExecucoes])

  // Carrega lista de responsáveis 1× ao montar
  useEffect(() => {
    (trpc.processo as any).painelResponsaveis.query()
      .then((r: typeof responsaveis) => setResponsaveis(r))
      .catch(() => {})
  }, [])

  // Auto-refresh a cada 60s (silent — não desmonta cards)
  useEffect(() => {
    const i = setInterval(() => fetchExecucoes(true), 60_000)
    return () => clearInterval(i)
  }, [fetchExecucoes])

  // Classifica em colunas
  const porColuna = useMemo(() => {
    const agora = new Date()
    const map: Record<Coluna, Execucao[]> = {
      atrasados: [], em_andamento: [], aguardando: [], pausados: [], concluidos: [],
    }
    for (const e of execucoes) {
      if (e.status === 'CONCLUIDO') {
        map.concluidos.push(e)
        continue
      }
      if (e.status === 'AGUARDANDO_INICIO') {
        map.aguardando.push(e)
        continue
      }
      // EM_ANDAMENTO
      if (e.pausado) {
        map.pausados.push(e)
        continue
      }
      const atrasado = e.prazoLimite && new Date(e.prazoLimite) < agora
      if (atrasado) map.atrasados.push(e)
      else map.em_andamento.push(e)
    }
    return map
  }, [execucoes])

  const visiveis = apenasAtrasados ? { atrasados: porColuna.atrasados, em_andamento: [], aguardando: [], pausados: [], concluidos: [] } : porColuna

  // Agrupamento por responsável (view "responsavel")
  const porResponsavel = useMemo(() => {
    const ativas = apenasAtrasados ? porColuna.atrasados : execucoes.filter(e => e.status !== 'CONCLUIDO')
    const map = new Map<string, { resp: { id: string; name: string; image: string | null } | null; items: Execucao[] }>()
    for (const e of ativas) {
      const k = e.responsavel?.id ?? '__sem_responsavel__'
      if (!map.has(k)) map.set(k, { resp: e.responsavel, items: [] })
      map.get(k)!.items.push(e)
    }
    // Ordena: com mais atrasadas primeiro
    return Array.from(map.values()).sort((a, b) => {
      const aAtraso = a.items.filter(i => i.prazoLimite && new Date(i.prazoLimite) < new Date()).length
      const bAtraso = b.items.filter(i => i.prazoLimite && new Date(i.prazoLimite) < new Date()).length
      if (aAtraso !== bAtraso) return bAtraso - aAtraso
      return b.items.length - a.items.length
    })
  }, [execucoes, porColuna, apenasAtrasados])

  const kpis = {
    atrasados: porColuna.atrasados.length,
    em_andamento: porColuna.em_andamento.length,
    aguardando: porColuna.aguardando.length,
    pausados: porColuna.pausados.length,
    concluidosHoje: porColuna.concluidos.filter(e => {
      if (!e.concluidoEm) return false
      const d = new Date(e.concluidoEm)
      const agora = new Date()
      return d.toDateString() === agora.toDateString()
    }).length,
  }

  function toggleSegmento(slug: string) {
    setSegmentosFilter(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])
  }

  function limparFiltros() {
    setSearch('')
    setSegmentosFilter([])
    setResponsavelFilter('')
    setApenasAtrasados(false)
  }

  const temFiltros = search || segmentosFilter.length > 0 || responsavelFilter || apenasAtrasados

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 gap-1.5 text-xs" onClick={() => router.push('/processos')}>
          <ArrowLeft className="h-3.5 w-3.5" />Processos
        </Button>
        <span>/</span>
        <span className="font-medium" style={{ color: MODULE_COLOR }}>Painel Operacional</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <Workflow className="h-6 w-6" />
          </div>
          <div>
            <h1>Painel Operacional</h1>
            <p className="text-sm text-muted-foreground">
              Visão consolidada de todas as execuções ativas com responsáveis e prazos.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="tabular-nums">{execucoes.length} execuções</span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <KpiCard label="Atrasados"        value={kpis.atrasados}     icon={AlertTriangle} color="#ef4444" critico={kpis.atrasados > 0} onClick={() => setApenasAtrasados(true)} />
        <KpiCard label="Em andamento"     value={kpis.em_andamento}  icon={PlayCircle}    color="#8b5cf6" />
        <KpiCard label="Aguardando"       value={kpis.aguardando}    icon={Clock}         color="#f59e0b" />
        <KpiCard label="Pausados"         value={kpis.pausados}      icon={Pause}         color="#64748b" />
        <KpiCard label="Concluídos hoje"  value={kpis.concluidosHoje} icon={CheckCircle2} color="#10b981" />
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col lg:flex-row gap-2 items-stretch lg:items-center">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por cliente (razão/CNPJ) ou serviço..."
                className="h-9 pl-8 text-sm"
              />
            </div>

            <Select
              value={responsavelFilter || '__all__'}
              onValueChange={v => setResponsavelFilter(v === '__all__' ? '' : v)}
            >
              <SelectTrigger className="h-9 text-sm sm:w-[200px]">
                <Users className="h-3.5 w-3.5 mr-1" />
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os responsáveis</SelectItem>
                {responsaveis.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={apenasAtrasados ? 'default' : 'outline'}
              size="sm"
              onClick={() => setApenasAtrasados(!apenasAtrasados)}
              className={cn('h-9 gap-1.5', apenasAtrasados && 'bg-red-500 hover:bg-red-600 text-white')}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Apenas atrasados
            </Button>

            {temFiltros && (
              <Button variant="ghost" size="sm" onClick={limparFiltros} className="h-9 gap-1.5 text-xs">
                <X className="h-3.5 w-3.5" />Limpar
              </Button>
            )}
          </div>

          {/* Chips de segmento */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t">
            <span className="text-[11px] text-muted-foreground mr-1">
              <Filter className="h-3 w-3 inline mr-0.5" />Segmentos:
            </span>
            {SEGMENTO_SLUGS.map(slug => {
              const meta = SEGMENTO_META[slug]
              const ativo = segmentosFilter.includes(slug)
              return (
                <button
                  key={slug}
                  onClick={() => toggleSegmento(slug)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all',
                    ativo
                      ? 'text-white shadow-sm'
                      : 'bg-card hover:shadow-sm border-border text-foreground/70',
                  )}
                  style={ativo ? { backgroundColor: meta.cor, borderColor: meta.cor } : undefined}
                >
                  {meta.label}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Toggle de visualização */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {[
            { id: 'status' as const,      label: 'Status',         icon: LayoutGrid },
            { id: 'responsavel' as const, label: 'Por responsável', icon: UserCircle2 },
            { id: 'timeline' as const,    label: 'Timeline (30d)',  icon: CalendarRange },
          ].map(v => {
            const ativo = viewMode === v.id
            const Icon = v.icon
            return (
              <button
                key={v.id}
                onClick={() => setViewMode(v.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  ativo
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* View: Status (Kanban por status) */}
      {viewMode === 'status' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {COLUNAS.map(c => {
            const items = visiveis[c.id]
            const Icon = c.icon
            return (
              <div key={c.id} className={cn('rounded-lg border', c.bg)}>
                <div className="flex items-center justify-between gap-2 p-3 border-b">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: c.cor }} />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: c.cor }}>
                      {c.label}
                    </span>
                  </div>
                  <span className="text-[11px] tabular-nums font-semibold" style={{ color: c.cor }}>
                    {items.length}
                  </span>
                </div>
                <div className="p-2 space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto">
                  {items.length === 0 && (
                    <p className="text-center text-[11px] text-muted-foreground py-6 italic">vazio</p>
                  )}
                  {items.map(e => <ExecucaoCard key={e.id} exec={e} onClick={() => setExecucaoAberta(e.id)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View: Por responsável */}
      {viewMode === 'responsavel' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {porResponsavel.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground py-12 italic">
              Nenhuma execução ativa.
            </p>
          )}
          {porResponsavel.map(({ resp, items }) => {
            const atrasos = items.filter(i => i.prazoLimite && new Date(i.prazoLimite) < new Date() && !i.pausado && i.status === 'EM_ANDAMENTO').length
            return (
              <div key={resp?.id ?? '__sem__'} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    {resp?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveAssetUrl(resp.image)} alt={resp.name} className="h-7 w-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className={cn(
                        'h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                        resp ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' : 'bg-slate-100 text-slate-500',
                      )}>
                        {resp ? resp.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase() : '?'}
                      </div>
                    )}
                    <span className="text-sm font-semibold truncate" title={resp?.name ?? 'Sem responsável'}>
                      {resp?.name ?? 'Sem responsável'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {atrasos > 0 && (
                      <Badge variant="outline" className="text-[10px] h-5 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
                        {atrasos} atras.
                      </Badge>
                    )}
                    <span className="text-[11px] tabular-nums font-semibold text-muted-foreground">
                      {items.length}
                    </span>
                  </div>
                </div>
                <div className="p-2 space-y-2 max-h-[calc(100vh-380px)] overflow-y-auto">
                  {items.map(e => <ExecucaoCard key={e.id} exec={e} onClick={() => setExecucaoAberta(e.id)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* View: Timeline (Gantt simplificado dos próximos 30 dias) */}
      {viewMode === 'timeline' && (
        <TimelineView execucoes={execucoes} apenasAtrasados={apenasAtrasados} onCardClick={(id) => setExecucaoAberta(id)} />
      )}

      {/* Modal de checklist inline */}
      {execucaoAberta && (
        <ChecklistDialog
          execucaoId={execucaoAberta}
          onClose={() => setExecucaoAberta(null)}
          onChanged={() => fetchExecucoes(true)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TimelineView — Gantt simplificado dos próximos 30 dias
// Linha por execução; barra colorida da iniciadoEm até prazoLimite
// (clamp ao range [hoje, hoje+30d]). Marker vertical em "hoje".
// ─────────────────────────────────────────────────────────────
function TimelineView({ execucoes, apenasAtrasados, onCardClick }: { execucoes: Execucao[]; apenasAtrasados: boolean; onCardClick?: (id: string) => void }) {
  const DAYS = 30
  const COL_WIDTH = 36 // px por dia
  const ROW_HEIGHT = 32

  const hoje = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const fim = useMemo(() => {
    const d = new Date(hoje)
    d.setDate(d.getDate() + DAYS)
    return d
  }, [hoje])

  // Filtra execuções relevantes pra timeline:
  // - precisa ter prazoLimite (sem prazo não tem onde plotar)
  // - status ativo (EM_ANDAMENTO ou AGUARDANDO_INICIO) ou CONCLUIDO recente
  // - se apenasAtrasados, só atrasados
  const ativas = useMemo(() => {
    let arr = execucoes.filter(e => e.prazoLimite && e.status !== 'CANCELADO')
    if (apenasAtrasados) {
      arr = arr.filter(e => e.prazoLimite && new Date(e.prazoLimite) < hoje && e.status === 'EM_ANDAMENTO' && !e.pausado)
    }
    // Ordena por prazo (mais atrasado/próximo primeiro)
    arr.sort((a, b) => {
      const ad = a.prazoLimite ? new Date(a.prazoLimite).getTime() : Infinity
      const bd = b.prazoLimite ? new Date(b.prazoLimite).getTime() : Infinity
      return ad - bd
    })
    return arr
  }, [execucoes, apenasAtrasados, hoje])

  function statusColor(e: Execucao): string {
    if (e.status === 'CONCLUIDO') return '#10b981'
    if (e.status === 'AGUARDANDO_INICIO') return '#f59e0b'
    if (e.pausado) return '#64748b'
    if (e.prazoLimite && new Date(e.prazoLimite) < hoje) return '#ef4444'
    return '#8b5cf6'
  }

  // Range visual de cada execução, em pixels
  function bar(e: Execucao): { offsetPx: number; widthPx: number } | null {
    const inicio = new Date(e.iniciadoEm)
    const prazo = e.prazoLimite ? new Date(e.prazoLimite) : null
    if (!prazo) return null
    // Clamp aos limites visíveis
    const clampInicio = inicio < hoje ? hoje : inicio
    const clampFim = prazo > fim ? fim : prazo
    if (clampInicio > fim || clampFim < hoje) return null // fora da janela
    const diasInicio = Math.max(0, (clampInicio.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    const diasFim = (clampFim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
    const offsetPx = diasInicio * COL_WIDTH
    const widthPx = Math.max(8, (diasFim - diasInicio) * COL_WIDTH)
    return { offsetPx, widthPx }
  }

  // Cabeçalho de dias
  const dias = Array.from({ length: DAYS + 1 }, (_, i) => {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    return d
  })
  const totalWidth = (DAYS + 1) * COL_WIDTH
  const labelWidth = 280

  if (ativas.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma execução com prazo nos próximos 30 dias.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          {/* Header de dias */}
          <div className="flex border-b sticky top-0 bg-card z-10">
            <div className="shrink-0 px-3 py-2 border-r bg-muted/30 text-[10px] font-bold uppercase tracking-wide text-muted-foreground" style={{ width: labelWidth }}>
              Execução
            </div>
            <div className="flex" style={{ minWidth: totalWidth }}>
              {dias.map((d, i) => {
                const eHoje = i === 0
                const dom = d.getDay() === 0 || d.getDay() === 6
                return (
                  <div
                    key={i}
                    className={cn(
                      'shrink-0 text-center text-[9px] py-1 border-r leading-tight',
                      eHoje && 'bg-violet-100 dark:bg-violet-900/30 font-bold',
                      dom && !eHoje && 'bg-slate-50 dark:bg-slate-900/30 text-muted-foreground',
                    )}
                    style={{ width: COL_WIDTH }}
                  >
                    <div className="font-semibold">{d.getDate().toString().padStart(2, '0')}</div>
                    <div className="text-[8px] opacity-60">{['D','S','T','Q','Q','S','S'][d.getDay()]}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Linhas de execução */}
          <div className="max-h-[calc(100vh-440px)] overflow-y-auto">
            {ativas.map(e => {
              const b = bar(e)
              const cor = statusColor(e)
              return (
                <div
                  key={e.id}
                  className={cn('flex border-b hover:bg-muted/20 transition-colors', onCardClick && 'cursor-pointer')}
                  onClick={() => onCardClick?.(e.id)}
                >
                  {/* Label */}
                  <div className="shrink-0 px-3 py-1.5 border-r flex items-center gap-2 min-w-0" style={{ width: labelWidth }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold truncate" title={e.servicoNome}>{e.servicoNome}</p>
                      <p className="text-[10px] text-muted-foreground truncate" title={e.clienteRazaoSocial}>{e.clienteRazaoSocial}</p>
                    </div>
                    {e.responsavel && (
                      e.responsavel.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveAssetUrl(e.responsavel.image)} alt={e.responsavel.name} className="h-5 w-5 rounded-full object-cover shrink-0" title={e.responsavel.name} />
                      ) : (
                        <div className="h-5 w-5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 flex items-center justify-center text-[8px] font-bold shrink-0" title={e.responsavel.name}>
                          {e.responsavel.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                        </div>
                      )
                    )}
                  </div>
                  {/* Track */}
                  <div className="relative shrink-0" style={{ minWidth: totalWidth, height: ROW_HEIGHT }}>
                    {/* Grade (faixa amena de fim de semana) */}
                    {dias.map((d, i) => {
                      const dom = d.getDay() === 0 || d.getDay() === 6
                      return (
                        <div
                          key={i}
                          className={cn(
                            'absolute top-0 bottom-0 border-r border-border/50',
                            dom && 'bg-slate-50/50 dark:bg-slate-900/20',
                          )}
                          style={{ left: i * COL_WIDTH, width: COL_WIDTH }}
                        />
                      )
                    })}
                    {/* Marker hoje */}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-violet-500/70 z-10" style={{ left: 0 }} />
                    {/* Barra da execução */}
                    {b && (
                      <div
                        className="absolute rounded-md flex items-center justify-end px-1.5 text-[9px] font-semibold text-white shadow-sm overflow-hidden"
                        style={{
                          left: b.offsetPx,
                          width: b.widthPx,
                          top: 4,
                          bottom: 4,
                          backgroundColor: cor,
                        }}
                        title={`${e.servicoNome} · ${e.status}${e.prazoLimite ? ' · vence ' + new Date(e.prazoLimite).toLocaleDateString('pt-BR') : ''}`}
                      >
                        {e.progresso.total > 0 && b.widthPx > 50 && (
                          <span className="tabular-nums opacity-90">
                            {e.progresso.fechados}/{e.progresso.total}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Legenda */}
        <div className="border-t px-4 py-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#8b5cf6' }} /> Em andamento</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444' }} /> Atrasado</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#f59e0b' }} /> Aguardando</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#64748b' }} /> Pausado</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ backgroundColor: '#10b981' }} /> Concluído</span>
          <span className="inline-flex items-center gap-1 ml-auto">
            <span className="w-0.5 h-3 bg-violet-500/70" /> Hoje
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function KpiCard({ label, value, icon: Icon, color, critico, onClick }: {
  label: string; value: number; icon: typeof Workflow; color: string; critico?: boolean; onClick?: () => void
}) {
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      onClick={onClick}
      className={cn(
        'rounded-lg border p-3 transition-all bg-card text-left',
        onClick && 'cursor-pointer hover:shadow-md',
        critico && 'animate-pulse',
      )}
      style={{ borderColor: critico ? color : undefined }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color }} />
        <span className="text-[10px] uppercase font-bold tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
    </Component>
  )
}

function ExecucaoCard({ exec, onClick }: { exec: Execucao; onClick?: () => void }) {
  const segmento = exec.segmentoSlug && SEGMENTO_META[exec.segmentoSlug as SegmentoSlug]
  const total = exec.progresso.total
  const fechados = exec.progresso.fechados
  const pct = total > 0 ? Math.round((fechados / total) * 100) : 0

  // Prazo
  let prazoLabel: string | null = null
  let prazoCor: string | null = null
  if (exec.prazoLimite) {
    const agora = new Date()
    const prazo = new Date(exec.prazoLimite)
    const diffMs = prazo.getTime() - agora.getTime()
    const diffDias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
    if (diffDias < 0) {
      prazoLabel = `atrasado ${Math.abs(diffDias)}d`
      prazoCor = '#ef4444'
    } else if (diffDias === 0) {
      prazoLabel = 'vence hoje'
      prazoCor = '#f59e0b'
    } else if (diffDias <= 3) {
      prazoLabel = `vence em ${diffDias}d`
      prazoCor = '#f59e0b'
    } else {
      prazoLabel = `vence em ${diffDias}d`
      prazoCor = '#10b981'
    }
  }

  return (
    <div
      className={cn('rounded-md border bg-card p-2.5 transition-shadow text-[11px]', onClick && 'cursor-pointer hover:shadow-md')}
      onClick={onClick}
    >
      {/* Linha 1: serviço + segmento */}
      <div className="flex items-start justify-between gap-1.5 mb-1">
        <span className="font-semibold leading-tight line-clamp-2 text-[12px]">
          {exec.servicoNome}
        </span>
      </div>

      {/* Linha 2: cliente */}
      <p className="text-foreground/70 truncate mb-1.5" title={exec.clienteRazaoSocial}>
        {exec.clienteRazaoSocial}
      </p>

      {/* Linha 3: badges (segmento + processo) */}
      <div className="flex items-center gap-1 flex-wrap mb-1.5">
        {segmento && (
          <Badge
            variant="outline"
            className="text-[9px] h-4 px-1 text-white"
            style={{ backgroundColor: segmento.cor, borderColor: segmento.cor }}
          >
            {segmento.label}
          </Badge>
        )}
        {exec.processoId && exec.processoNome && (
          <Link
            href={`/processos/${exec.processoId}`}
            onClick={ev => ev.stopPropagation()}
            className="text-[9px] text-violet-600 dark:text-violet-400 hover:underline truncate max-w-[120px]"
            title={`Processo: ${exec.processoNome}`}
          >
            ↗ {exec.processoNome}
          </Link>
        )}
      </div>

      {/* Linha 4: progresso */}
      {total > 0 && (
        <div className="space-y-0.5 mb-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="tabular-nums text-muted-foreground">{fechados}/{total}</span>
            <span className="tabular-nums text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${pct}%`, backgroundColor: '#8b5cf6' }}
            />
          </div>
        </div>
      )}

      {/* Linha 5: responsável + prazo */}
      <div className="flex items-center justify-between gap-1.5 pt-1 border-t">
        <div className="flex items-center gap-1.5 min-w-0">
          {exec.responsavel ? (
            <>
              {exec.responsavel.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveAssetUrl(exec.responsavel.image)} alt={exec.responsavel.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-5 w-5 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-[9px] font-bold text-violet-700 dark:text-violet-300 shrink-0">
                  {exec.responsavel.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </div>
              )}
              <span className="text-[10px] truncate" title={exec.responsavel.name}>
                {exec.responsavel.name.split(' ')[0]}
              </span>
            </>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">sem resp.</span>
          )}
        </div>
        {prazoLabel && (
          <span
            className="text-[9px] font-semibold tabular-nums whitespace-nowrap rounded-sm px-1 py-0.5"
            style={{ color: prazoCor || undefined, backgroundColor: prazoCor ? `${prazoCor}15` : undefined }}
          >
            {prazoLabel}
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ChecklistDialog — modal compacto pra marcar passos sem sair do painel
// Usa trpc.servico.getExecucao + togglePasso. Para edição completa
// (anexos, comentários, watchers), botão "Abrir checklist completo →"
// leva pra /meus-servicos.
// ─────────────────────────────────────────────────────────────
function ChecklistDialog({ execucaoId, onClose, onChanged }: {
  execucaoId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<{
    id: string
    status: string
    servico: { id: string; nome: string }
    cliente: { razaoSocial: string }
    passos: Array<{
      id: string
      passoNome: string
      etapaNome: string
      ordem: number
      concluido: boolean
      ignorado: boolean
      obrigatorio: boolean
      permiteIgnorar: boolean
      observacao: string | null
    }>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.servico as any).getExecucao.query({ id: execucaoId })
      setData(r)
    } catch (e) {
      alerts.error('Erro ao carregar', (e as Error).message)
      onClose()
    } finally {
      setLoading(false)
    }
  }, [execucaoId, onClose])

  useEffect(() => { load() }, [load])

  async function togglePasso(passoId: string) {
    setTogglingId(passoId)
    try {
      await (trpc.servico as any).togglePasso.mutate({ id: passoId })
      await load() // recarrega execução pra refletir mudança + cascata
      onChanged() // refetch da lista do painel (silent)
    } catch (e) {
      alerts.error('Erro ao alterar passo', (e as Error).message)
    } finally {
      setTogglingId(null)
    }
  }

  // Agrupar passos por etapa
  const porEtapa = useMemo(() => {
    if (!data) return []
    const map = new Map<string, typeof data.passos>()
    for (const p of data.passos) {
      if (!map.has(p.etapaNome)) map.set(p.etapaNome, [])
      map.get(p.etapaNome)!.push(p)
    }
    return Array.from(map.entries()).map(([etapa, passos]) => ({ etapa, passos }))
  }, [data])

  const fechados = data?.passos.filter(p => p.concluido || p.ignorado).length ?? 0
  const total = data?.passos.length ?? 0
  const pct = total > 0 ? Math.round((fechados / total) * 100) : 0

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] overflow-y-auto">
        <DialogHeaderIcon icon={Workflow} color="violet">
          <DialogTitle>{loading ? 'Carregando...' : data?.servico.nome ?? 'Execução'}</DialogTitle>
          <DialogDescription>
            {data ? `${data.cliente.razaoSocial} · ${fechados}/${total} passos · ${pct}%` : ''}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {data && (
            <div className="space-y-4">
              {/* Barra de progresso */}
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: data.status === 'CONCLUIDO' ? '#10b981' : '#8b5cf6' }}
                />
              </div>

              {/* Passos por etapa */}
              {porEtapa.map(({ etapa, passos }) => (
                <div key={etapa}>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 pb-1 border-b">
                    {etapa}
                  </h4>
                  <ul className="space-y-1.5">
                    {passos.map(p => {
                      const fechado = p.concluido || p.ignorado
                      return (
                        <li key={p.id} className="flex items-start gap-2.5 text-sm group">
                          <button
                            onClick={() => togglePasso(p.id)}
                            disabled={togglingId === p.id}
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors',
                              p.concluido && 'bg-emerald-500 border-emerald-500',
                              p.ignorado && 'bg-amber-400 border-amber-400',
                              !fechado && 'border-border hover:border-violet-500',
                            )}
                            title={p.concluido ? 'Concluído (clique pra reabrir)' : p.ignorado ? 'Ignorado' : 'Marcar como concluído'}
                          >
                            {togglingId === p.id ? (
                              <Loader2 className="h-3 w-3 animate-spin text-white" />
                            ) : fechado ? (
                              <CheckCircle2 className="h-3 w-3 text-white" />
                            ) : null}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn('leading-snug', fechado && 'line-through text-muted-foreground')}>
                              {p.passoNome}
                              {p.obrigatorio && !fechado && (
                                <span className="ml-1 text-[10px] text-red-600/70 font-semibold">obrig.</span>
                              )}
                            </p>
                            {p.observacao && (
                              <p className="text-[11px] text-muted-foreground italic mt-0.5">{p.observacao}</p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter className="flex items-center justify-between gap-2">
          <Link
            href={`/meus-servicos?exec=${execucaoId}`}
            className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
          >
            Abrir checklist completo →
          </Link>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
