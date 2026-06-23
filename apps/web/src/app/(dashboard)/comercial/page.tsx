'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Gauge, Target, TrendingUp, Percent, CircleDollarSign, FileText, AlertTriangle,
  FileCheck, Landmark, CalendarClock, RefreshCw, Loader2, BarChart3,
} from 'lucide-react'
import {
  Button, Card, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { StatCard } from '@/components/stat-card'
import { trpc } from '@/lib/trpc'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

const PERIODOS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '60', label: 'Últimos 60 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'all', label: 'Todo o período' },
]

const PIE_COLORS = [
  '#fb7185', '#818cf8', '#34d399', '#fbbf24', '#60a5fa',
  '#f97316', '#a78bfa', '#2dd4bf', '#f472b6', '#38bdf8',
]

const ORC_STATUS_LABEL: Record<string, string> = {
  NOVO: 'Novo', A_ENVIAR: 'A enviar', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
  LIBERADO: 'Liberado', FINALIZADO: 'Finalizado', ENCERRADO: 'Encerrado',
}
const CONTRATO_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', AGUARDANDO_ASSINATURA: 'Aguardando assinatura', ASSINADO: 'Assinado',
  VIGENTE: 'Vigente', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado',
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const formatCompact = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)

// ── Tooltip com bg do tema (evita o fundo branco/preto padrao do Recharts) ──
function ChartTooltip({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      {label != null && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill || p.fill }} />
          {p.name}: <span className="font-medium text-foreground">{fmt ? fmt(p.value, p.name) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

interface PainelData {
  crmStats: any
  crmFunil: any
  crmDesempenho: any[]
  orcStats: any
  orcDash: any
  contratos: any
}

export default function ComercialPage() {
  const [periodo, setPeriodo] = useState('90')
  const [data, setData] = useState<PainelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [erro, setErro] = useState(false)
  const firstLoad = useRef(true)

  const dias = periodo === 'all' ? undefined : Number(periodo)

  const load = useCallback(async () => {
    if (firstLoad.current) setLoading(true)
    else setRefreshing(true)
    setErro(false)
    // Cada chamada e independente: se um modulo nao tiver permissao (FORBIDDEN),
    // os demais continuam carregando.
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.then((r) => r).catch(() => null)
    try {
      const [crmStats, crmFunil, crmDesempenho, orcStats, orcDash, contratos] = await Promise.all([
        safe((trpc.crm as any).getStats.query()),
        safe((trpc.crm as any).reportFunil.query({ dias })),
        safe((trpc.crm as any).reportDesempenho.query({ dias })),
        safe((trpc.orcamento as any).getStats.query()),
        safe((trpc.orcamento as any).getDashboardStats.query()),
        safe((trpc.contrato as any).reportComercial.query()),
      ])
      if (!crmStats && !crmFunil && !orcStats && !contratos) setErro(true)
      setData({
        crmStats, crmFunil,
        crmDesempenho: Array.isArray(crmDesempenho) ? crmDesempenho : [],
        orcStats, orcDash, contratos,
      })
    } finally {
      firstLoad.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [dias])

  useEffect(() => { load() }, [load])

  // Auto-refresh leve (quadro de parede) — a cada 60s, sem spinner full.
  useEffect(() => {
    const id = setInterval(() => { load() }, 60_000)
    return () => clearInterval(id)
  }, [load])

  // ── KPIs derivados ──────────────────────────────────────────
  const funilEtapas: any[] = data?.crmFunil?.etapas ?? []
  const crmAtivas = funilEtapas.filter((e) => !e.ehGanho && !e.ehPerda)
  const oportunidadesAtivas = crmAtivas.reduce((s, e) => s + (e.count ?? 0), 0)
  const pipelineValor = crmAtivas.reduce((s, e) => s + (e.valor ?? 0), 0)
  const taxaConversao = data?.crmFunil?.taxaGeral ?? 0

  const orcPorStatus: any[] = data?.orcStats?.porStatus ?? []
  const orcTotal = data?.orcStats?.total ?? 0
  const orcAprovados = orcPorStatus
    .filter((s) => ['APROVADO', 'LIBERADO', 'FINALIZADO'].includes(s.status))
    .reduce((acc, s) => acc + (s._count ?? 0), 0)
  const taxaAprovacao = orcTotal > 0 ? Math.round((orcAprovados / orcTotal) * 100) : 0
  const orcDash = data?.orcDash
  const orcEmAberto = orcDash?.permitido
    ? (orcDash.aguardandoEnvio ?? 0) + (orcDash.aguardandoAprovacao ?? 0)
    : orcPorStatus.filter((s) => ['NOVO', 'A_ENVIAR', 'ENVIADO'].includes(s.status)).reduce((a, s) => a + (s._count ?? 0), 0)
  const orcValorPendente = orcDash?.permitido ? (orcDash.valorPendente ?? 0) : 0
  const orcAtrasados = orcDash?.permitido ? (orcDash.atrasados ?? 0) : 0

  const ct = data?.contratos
  const mrr = ct?.mrr ?? 0
  const vigentes = ct?.vigentes ?? 0
  const aVencer30 = ct?.aVencer30 ?? 0

  // ── Dados de graficos ──────────────────────────────────────
  const funilChart = funilEtapas.filter((e) => !e.ehPerda)
  const orcPie = orcPorStatus
    .filter((s) => (s._count ?? 0) > 0)
    .map((s, idx) => ({ name: ORC_STATUS_LABEL[s.status] ?? s.status, value: s._count, fill: PIE_COLORS[idx % PIE_COLORS.length] }))
  const ctPorStatus: any[] = ct?.porStatus ?? []
  const ctPie = ctPorStatus
    .filter((s) => (s.count ?? 0) > 0)
    .map((s, idx) => ({ name: CONTRATO_STATUS_LABEL[s.status] ?? s.status, value: s.count, fill: PIE_COLORS[idx % PIE_COLORS.length] }))
  const ctEvolucao: any[] = ct?.evolucaoMensal ?? []
  const aVencer: any[] = ct?.aVencer ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <Gauge className="h-6 w-6" />
          </div>
          <div>
            <h1>Painel Comercial</h1>
            <p className="text-sm text-muted-foreground">Gestão à vista — CRM, Orçamentos e Contratos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[170px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => load()}
            title="Atualizar agora"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: MODULE_COLOR }} />
          <span className="ml-2 text-sm text-muted-foreground">Carregando painel...</span>
        </div>
      ) : erro ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">Sem dados ou sem permissão para os módulos comerciais.</p>
        </div>
      ) : (
        <>
          {/* ── KPIs ───────────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> CRM — Pipeline
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard icon={Target} label="Oportunidades ativas" value={oportunidadesAtivas} color="#818cf8" />
              <StatCard icon={TrendingUp} label="Valor em pipeline" value={formatCompact(pipelineValor)} color="#34d399" sub={formatCurrency(pipelineValor)} />
              <StatCard icon={Percent} label="Taxa de conversão" value={`${taxaConversao}%`} color="#fb7185" />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <CircleDollarSign className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> Orçamentos
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={FileText} label="Em aberto" value={orcEmAberto} color="#60a5fa" />
              <StatCard icon={CircleDollarSign} label="Valor pendente" value={formatCompact(orcValorPendente)} color="#34d399" sub={orcDash?.permitido ? formatCurrency(orcValorPendente) : 'sem acesso a valores'} />
              <StatCard icon={Percent} label="Taxa de aprovação" value={`${taxaAprovacao}%`} color="#a78bfa" />
              <StatCard icon={AlertTriangle} label="Atrasados" value={orcAtrasados} color="#f97316" />
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <FileCheck className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> Contratos — Carteira
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard icon={FileCheck} label="Contratos vigentes" value={vigentes} color="#34d399" />
              <StatCard icon={Landmark} label="MRR (receita recorrente)" value={formatCompact(mrr)} color="#fb7185" sub={formatCurrency(mrr)} />
              <StatCard icon={CalendarClock} label="A vencer (30 dias)" value={aVencer30} color="#fbbf24" sub={`${ct?.aVencer60 ?? 0} em até 60 dias`} />
            </div>
          </div>

          {/* ── Graficos linha 1: Funil CRM + Orcamentos por status ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-7 p-4">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">Funil de vendas (CRM)</h3>
              <div className="h-[280px]">
                {funilChart.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funilChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip fmt={(v: any, n: string) => (n === 'Valor' ? formatCurrency(v) : v)} />} cursor={{ fill: 'hsl(var(--muted))' }} />
                      <Bar dataKey="count" name="Quantidade" radius={[4, 4, 0, 0]}>
                        {funilChart.map((e: any) => (
                          <Cell key={e.etapaId} fill={e.cor || '#fb7185'} opacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyMini />}
              </div>
            </Card>

            <Card className="lg:col-span-5 p-4">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">Orçamentos por status</h3>
              <div className="h-[280px]">
                {orcPie.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={orcPie} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} dataKey="value">
                        {orcPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip fmt={(v: any) => `${v} orçamento(s)`} />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyMini />}
              </div>
            </Card>
          </div>

          {/* ── Graficos linha 2: Contratos por status + evolucao ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-5 p-4">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">Contratos por status</h3>
              <div className="h-[280px]">
                {ctPie.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={ctPie} cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2} dataKey="value">
                        {ctPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip fmt={(v: any) => `${v} contrato(s)`} />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyMini />}
              </div>
            </Card>

            <Card className="lg:col-span-7 p-4">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">Contratos — novos × encerrados (6 meses)</h3>
              <div className="h-[280px]">
                {ctEvolucao.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={ctEvolucao} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="novos" name="Novos" fill="#34d399" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="encerrados" name="Encerrados" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyMini />}
              </div>
            </Card>
          </div>

          {/* ── Desempenho por responsavel (CRM) ── */}
          {data?.crmDesempenho.length ? (
            <Card className="p-4">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">Desempenho por responsável (CRM)</h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.crmDesempenho} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ganhos" name="Ganhos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="perdidos" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Total" fill="#fb7185" opacity={0.4} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          ) : null}

          {/* ── Contratos a vencer ── */}
          {aVencer.length ? (
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <CalendarClock className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h3 className="text-[13px] font-semibold text-foreground">Contratos a vencer (próximos 60 dias)</h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Contrato</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs text-center">Vence em</TableHead>
                    <TableHead className="text-xs text-center">Dias restantes</TableHead>
                    <TableHead className="text-xs text-right">Honorário mensal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aVencer.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-medium">#{c.numero}</TableCell>
                      <TableCell className="text-xs">{c.cliente}</TableCell>
                      <TableCell className="text-xs text-center">
                        {c.dataFim ? new Date(c.dataFim).toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            c.diasRestantes != null && c.diasRestantes <= 15
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                              : c.diasRestantes != null && c.diasRestantes <= 30
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
                          )}
                        >
                          {c.diasRestantes != null ? `${c.diasRestantes} dias` : '—'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-right">{formatCurrency(c.honorarioMensal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

function EmptyMini() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <BarChart3 className="h-8 w-8 mb-1 opacity-25" />
      <p className="text-xs">Sem dados no período</p>
    </div>
  )
}
