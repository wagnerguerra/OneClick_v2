'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  BarChart3, Loader2, AlertTriangle, CheckCircle2, Star, Clock,
  Inbox, RefreshCcw, TrendingUp, Tag, Users, ListChecks, Activity,
} from 'lucide-react'
import {
  Card, CardContent, Badge, Button, Input,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, PieChart, Pie,
} from 'recharts'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS, HELPDESK_TIPO_LABELS,
  HELPDESK_PRIORIDADE_COLORS,
  type HelpdeskStatus, type HelpdeskPrioridade, type HelpdeskTipo,
} from '@saas/types'

// Cor do módulo (helpdesk = ti, slug cyan). var() preferencial + fallback.
const MOD = 'var(--mod-ti, #22d3ee)'

// ── Tipos do retorno do endpoint helpdesk.dashboard ────────────────
interface Dashboard {
  range: { inicio: string; fim: string }
  granularidade: 'dia' | 'mes'
  kpis: {
    criados: number
    resolvidos: number
    backlogAbertos: number
    backlogAtrasados: number
    slaCumprimentoPct: number | null
    csatMedio: number | null
    csatRespostas: number
    tfrHoras: number | null
    mttrHoras: number | null
    taxaReaberturaPct: number | null
    ticketsReabertos: number
  }
  porStatus: Array<{ status: HelpdeskStatus; total: number }>
  porPrioridade: Array<{ prioridade: HelpdeskPrioridade; total: number }>
  porTipo: Array<{ tipo: HelpdeskTipo; total: number }>
  csatDist: Array<{ nota: number; total: number }>
  serie: Array<{ periodo: string; criados: number; resolvidos: number }>
  porCategoria: Array<{ id: string | null; nome: string; cor: string | null; total: number; pct: number }>
  porResponsavel: Array<{ id: string; name: string; image: string | null; total: number; mttrHoras: number | null; slaPct: number | null }>
  slaEstourados: Array<{
    id: string; numero: number; titulo: string; prioridade: HelpdeskPrioridade
    status: HelpdeskStatus; prazoSla: string | null; createdAt: string
    responsavel: string | null; categoria: { nome: string; cor: string | null } | null
  }>
}

function formatHoras(h: number | null): string {
  if (h === null || h === undefined) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 24) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}

function toInputDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const STATUS_COR: Record<HelpdeskStatus, string> = {
  NOVO: '#3b82f6',
  AGUARDANDO_AUDITORIA: '#06b6d4',
  EM_ANDAMENTO: '#f59e0b',
  RESOLVIDO: '#a855f7',
  CONCLUIDO: '#10b981',
  CANCELADO: '#ef4444',
}

// Cores para distribuição de CSAT (1=ruim → 5=ótimo)
const CSAT_COR: Record<number, string> = {
  1: '#ef4444', 2: '#f59e0b', 3: '#eab308', 4: '#84cc16', 5: '#10b981',
}

export default function HelpdeskIndicadoresPage() {
  const hoje = useMemo(() => new Date(), [])
  const [inicio, setInicio] = useState(() => toInputDate(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)))
  const [fim, setFim] = useState(() => toInputDate(new Date()))
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(() => {
    setLoading(true)
    ;(trpc.helpdesk as any).dashboard.query({ inicio, fim })
      .then((d: Dashboard) => setData(d))
      .catch((e: Error) => { alerts.error('Erro ao carregar indicadores', e.message); setData(null) })
      .finally(() => setLoading(false))
  }, [inicio, fim])

  useEffect(() => { fetchData() }, [fetchData])

  const aplicarPreset = (dias: number) => {
    setInicio(toInputDate(new Date(Date.now() - (dias - 1) * 24 * 60 * 60 * 1000)))
    setFim(toInputDate(hoje))
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MOD}, color-mix(in srgb, ${MOD} 87%, transparent))` }}
          >
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>HelpDesk — Indicadores</h1>
            <p className="text-sm text-muted-foreground">
              Volume, SLA, tempos de atendimento, CSAT e relatórios por categoria e responsável.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1">
            <Input
              type="date" value={inicio} max={fim}
              onChange={e => setInicio(e.target.value)}
              className="h-7 w-[130px] border-0 bg-transparent px-1 text-xs"
            />
            <span className="text-muted-foreground text-xs">→</span>
            <Input
              type="date" value={fim} min={inicio} max={toInputDate(hoje)}
              onChange={e => setFim(e.target.value)}
              className="h-7 w-[130px] border-0 bg-transparent px-1 text-xs"
            />
          </div>
          <div className="flex items-center gap-1">
            {[7, 30, 90].map(d => (
              <Button key={d} variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={() => aplicarPreset(d)}>
                {d}d
              </Button>
            ))}
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={fetchData} title="Atualizar">
              <RefreshCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <BackButton href="/helpdesk" />
        </div>
      </div>

      {loading || !data ? (
        <Card><CardContent className="flex items-center justify-center gap-2 p-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando indicadores...
        </CardContent></Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Criados no período" value={data.kpis.criados} icon={Inbox} tone="cyan" />
            <Kpi label="Resolvidos" value={data.kpis.resolvidos} icon={CheckCircle2} tone="emerald" />
            <Kpi
              label="Backlog em aberto"
              value={data.kpis.backlogAbertos}
              sub={data.kpis.backlogAtrasados > 0 ? `${data.kpis.backlogAtrasados} atrasado(s)` : 'no prazo'}
              icon={Activity}
              tone={data.kpis.backlogAtrasados > 0 ? 'amber' : 'slate'}
            />
            <Kpi
              label="SLA cumprido"
              value={data.kpis.slaCumprimentoPct === null ? '—' : `${data.kpis.slaCumprimentoPct}%`}
              icon={Clock}
              tone={slaTone(data.kpis.slaCumprimentoPct)}
            />
            <Kpi
              label="CSAT médio"
              value={data.kpis.csatMedio === null ? '—' : `${data.kpis.csatMedio.toFixed(1)}`}
              sub={`${data.kpis.csatRespostas} resposta(s)`}
              icon={Star}
              tone="violet"
            />
            <Kpi
              label="Taxa de reabertura"
              value={data.kpis.taxaReaberturaPct === null ? '—' : `${data.kpis.taxaReaberturaPct}%`}
              sub={`${data.kpis.ticketsReabertos} reaberto(s)`}
              icon={RefreshCcw}
              tone={data.kpis.taxaReaberturaPct !== null && data.kpis.taxaReaberturaPct > 10 ? 'rose' : 'emerald'}
            />
          </div>

          {/* Tempos */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card><CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Tempo médio de 1ª resposta (TFR)
              </div>
              <p className="text-3xl font-bold tabular-nums">{formatHoras(data.kpis.tfrHoras)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Tempo médio de resolução (MTTR)
              </div>
              <p className="text-3xl font-bold tabular-nums">{formatHoras(data.kpis.mttrHoras)}</p>
            </CardContent></Card>
          </div>

          {/* Série temporal: criados x resolvidos */}
          <Card><CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4" /> Tendência — criados x resolvidos ({data.granularidade === 'mes' ? 'por mês' : 'por dia'})
            </h3>
            {data.serie.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.serie} margin={{ left: -18, right: 8, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCriados" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradResolvidos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="criados" name="Criados" stroke="#22d3ee" fill="url(#gradCriados)" strokeWidth={2} />
                  <Area type="monotone" dataKey="resolvidos" name="Resolvidos" stroke="#10b981" fill="url(#gradResolvidos)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent></Card>

          {/* Distribuições */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Por status (backlog atual) */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4" /> Tickets por status (atual)
              </h3>
              {data.porStatus.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.porStatus.map(s => ({ name: HELPDESK_STATUS_LABELS[s.status], value: s.total, status: s.status }))}
                      dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}
                      paddingAngle={2}
                    >
                      {data.porStatus.map(s => <Cell key={s.status} fill={STATUS_COR[s.status]} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>

            {/* Por prioridade */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" /> Criados por prioridade
              </h3>
              {data.porPrioridade.length === 0 ? <Empty /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.porPrioridade.map(p => ({ name: HELPDESK_PRIORIDADE_LABELS[p.prioridade], value: p.total, prioridade: p.prioridade }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Tickets" radius={[4, 4, 0, 0]}>
                      {data.porPrioridade.map(p => <Cell key={p.prioridade} fill={HELPDESK_PRIORIDADE_COLORS[p.prioridade]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>

            {/* CSAT distribuição */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Star className="h-4 w-4" /> Distribuição de CSAT
              </h3>
              {data.kpis.csatRespostas === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Sem avaliações no período.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.csatDist.map(c => ({ name: `${c.nota}★`, value: c.total, nota: c.nota }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Respostas" radius={[4, 4, 0, 0]}>
                      {data.csatDist.map(c => <Cell key={c.nota} fill={CSAT_COR[c.nota] ?? '#94a3b8'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent></Card>
          </div>

          {/* Relatórios — tabelas */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* Por categoria */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Tag className="h-4 w-4" /> Tickets por categoria
              </h3>
              {data.porCategoria.length === 0 ? <Empty /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Categoria</TableHead>
                      <TableHead className="text-right text-xs">Volume</TableHead>
                      <TableHead className="text-right text-xs">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.porCategoria.map(c => (
                      <TableRow key={c.id ?? 'sem'}>
                        <TableCell className="text-sm">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.cor || MOD }} />
                            <span className="truncate">{c.nome}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{c.total}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{c.pct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>

            {/* Por responsável */}
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Desempenho por responsável
              </h3>
              {data.porResponsavel.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">Sem tickets resolvidos atribuídos no período.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Agente</TableHead>
                      <TableHead className="text-right text-xs">Resolvidos</TableHead>
                      <TableHead className="text-right text-xs">MTTR</TableHead>
                      <TableHead className="text-right text-xs">SLA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.porResponsavel.map(a => (
                      <TableRow key={a.id}>
                        <TableCell className="max-w-[160px] truncate text-sm">{a.name}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{a.total}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{formatHoras(a.mttrHoras)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {a.slaPct === null ? '—' : (
                            <Badge
                              variant="outline"
                              className={
                                a.slaPct >= 90 ? 'border-emerald-300 text-emerald-600 dark:border-emerald-800'
                                  : a.slaPct >= 70 ? 'border-amber-300 text-amber-600 dark:border-amber-800'
                                  : 'border-rose-300 text-rose-600 dark:border-rose-800'
                              }
                            >
                              {a.slaPct}%
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </div>

          {/* Por tipo + SLA estourados */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <Card><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <ListChecks className="h-4 w-4" /> Criados por tipo
              </h3>
              {data.porTipo.length === 0 ? <Empty /> : (
                <div className="space-y-2">
                  {data.porTipo.map(t => {
                    const max = Math.max(...data.porTipo.map(x => x.total), 1)
                    return (
                      <div key={t.tipo} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{HELPDESK_TIPO_LABELS[t.tipo]}</span>
                          <span className="font-medium tabular-nums">{t.total}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${(t.total / max) * 100}%`, backgroundColor: MOD }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent></Card>

            {/* SLA estourados / mais antigos abertos */}
            <Card className="lg:col-span-2"><CardContent className="p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-rose-500" /> SLA estourado — abertos mais críticos
              </h3>
              {data.slaEstourados.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">Nenhum ticket aberto com SLA estourado. 🎉</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ticket</TableHead>
                      <TableHead className="text-xs">Prioridade</TableHead>
                      <TableHead className="text-xs">Responsável</TableHead>
                      <TableHead className="text-right text-xs">Venceu há</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.slaEstourados.map(t => {
                      const atrasoMs = t.prazoSla ? Date.now() - new Date(t.prazoSla).getTime() : 0
                      const atrasoH = atrasoMs / 3600_000
                      return (
                        <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40" onClick={() => window.open(`/helpdesk/${t.id}`, '_blank')}>
                          <TableCell className="text-sm">
                            <span className="font-mono text-[11px] text-muted-foreground">#HLP{String(t.numero).padStart(4, '0')}</span>
                            <span className="ml-2 truncate">{t.titulo}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-medium" style={{ color: HELPDESK_PRIORIDADE_COLORS[t.prioridade] }}>
                              {HELPDESK_PRIORIDADE_LABELS[t.prioridade]}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.responsavel ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums text-rose-600">{formatHoras(atrasoH)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </div>
        </>
      )}
    </div>
  )
}

function slaTone(pct: number | null): KpiTone {
  if (pct === null) return 'slate'
  if (pct >= 90) return 'emerald'
  if (pct >= 70) return 'amber'
  return 'rose'
}

type KpiTone = 'cyan' | 'rose' | 'emerald' | 'violet' | 'amber' | 'slate'

function Kpi({ label, value, sub, icon: Icon, tone }: {
  label: string
  value: number | string
  sub?: string
  icon: typeof Inbox
  tone: KpiTone
}) {
  const styles: Record<KpiTone, string> = {
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-600',
    rose: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600',
    violet: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600',
    slate: 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800 text-slate-600',
  }
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${styles[tone]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</p>
        {sub && <p className="text-[10px] opacity-70">{sub}</p>}
      </div>
    </div>
  )
}

function Empty() {
  return <div className="py-12 text-center text-xs text-muted-foreground">Sem dados no período.</div>
}

// Tooltip custom com tokens de tema (dark-mode safe)
function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: { name?: string } }>
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      {(label !== undefined && label !== '') && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-1.5 text-muted-foreground">
          {p.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />}
          {p.name ?? p.payload?.name}: <span className="font-semibold text-foreground tabular-nums">{p.value}</span>
        </p>
      ))}
    </div>
  )
}
