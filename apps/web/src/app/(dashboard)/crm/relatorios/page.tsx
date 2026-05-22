'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft, TrendingUp, Target, ArrowRight, Clock, Loader2, Users, BarChart3,
} from 'lucide-react'
import {
  Button, Card, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

const TABS = [
  { key: 'funil', label: 'Funil de Vendas', icon: TrendingUp },
  { key: 'desempenho', label: 'Desempenho', icon: Target },
  { key: 'origem', label: 'Por Origem', icon: ArrowRight },
  { key: 'tempo', label: 'Tempo por Etapa', icon: Clock },
] as const

type TabKey = typeof TABS[number]['key']

const PERIODOS = [
  { value: '30', label: 'Ultimos 30 dias' },
  { value: '90', label: 'Ultimos 90 dias' },
  { value: '180', label: 'Ultimos 180 dias' },
  { value: '365', label: 'Ultimo ano' },
  { value: 'all', label: 'Todo o periodo' },
]

const PIE_COLORS = [
  '#fb7185', '#818cf8', '#34d399', '#fbbf24', '#60a5fa',
  '#f97316', '#a78bfa', '#2dd4bf', '#f472b6', '#38bdf8',
  '#84cc16', '#e879f9', '#22d3ee', '#fb923c', '#94a3b8',
]

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const formatCompact = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)

// ============================================================
// Main Page
// ============================================================

export default function CrmRelatoriosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as TabKey) || 'funil'
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab)
  const [periodo, setPeriodo] = useState('90')

  const dias = periodo === 'all' ? undefined : Number(periodo)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/crm')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Relatorios do CRM</h1>
            <p className="text-xs text-muted-foreground">Analise de oportunidades, funil e desempenho</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                isActive ? 'text-white shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/60',
              )}
              style={isActive ? { backgroundColor: MODULE_COLOR } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div key={activeTab} style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
        {activeTab === 'funil' && <TabFunil dias={dias} />}
        {activeTab === 'desempenho' && <TabDesempenho dias={dias} />}
        {activeTab === 'origem' && <TabOrigem dias={dias} />}
        {activeTab === 'tempo' && <TabTempoMedio />}
      </div>
    </div>
  )
}

// ============================================================
// Tab: Funil de Vendas
// ============================================================

function TabFunil({ dias }: { dias?: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(trpc.crm as any).reportFunil.query({ dias })
      .then((r: any) => setData(r))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dias])

  if (loading) return <LoadingState />
  if (!data) return <EmptyState message="Nenhum dado encontrado" />

  const etapasChart = data.etapas.filter((e: any) => !e.ehPerda)
  const maxCount = Math.max(...etapasChart.map((e: any) => e.count), 1)

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total de Oportunidades" value={String(data.totalOportunidades)} />
        <KpiCard label="Valor Total" value={formatCurrency(data.valorTotal)} />
        <KpiCard label="Taxa de Conversao Geral" value={`${data.taxaGeral}%`} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Funnel Visual */}
        <Card className="col-span-5 p-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Funil Visual</h3>
          <div className="space-y-1.5">
            {etapasChart.map((etapa: any, idx: number) => {
              const width = Math.max(30, (etapa.count / maxCount) * 100)
              return (
                <div key={etapa.etapaId} className="flex items-center gap-2">
                  <div className="w-[90px] shrink-0 text-right">
                    <span className="text-[11px] text-muted-foreground truncate block">{etapa.nome}</span>
                  </div>
                  <div className="flex-1 relative">
                    <div
                      className="h-8 rounded flex items-center px-2 transition-all"
                      style={{
                        width: `${width}%`,
                        backgroundColor: etapa.cor || MODULE_COLOR,
                        opacity: 0.85,
                      }}
                    >
                      <span className="text-[11px] font-semibold text-white whitespace-nowrap">
                        {etapa.count} ({formatCompact(etapa.valor)})
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Bar Chart */}
        <Card className="col-span-7 p-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Quantidade e Valor por Etapa</h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.etapas} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatCompact(v)} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value: any, name: string) => [
                    name === 'valor' ? formatCurrency(value) : value,
                    name === 'valor' ? 'Valor' : 'Quantidade',
                  ]}
                />
                <Bar yAxisId="left" dataKey="count" name="Quantidade" radius={[4, 4, 0, 0]}>
                  {data.etapas.map((e: any) => (
                    <Cell key={e.etapaId} fill={e.cor || MODULE_COLOR} opacity={0.85} />
                  ))}
                </Bar>
                <Bar yAxisId="right" dataKey="valor" name="Valor" radius={[4, 4, 0, 0]} fill={MODULE_COLOR} opacity={0.3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Conversion Rates */}
      {data.conversoes.length > 0 && (
        <Card className="p-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-3">Taxas de Conversao entre Etapas</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {data.conversoes.map((c: any, idx: number) => (
              <div key={idx} className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[11px] py-0.5 px-2">{c.de}</Badge>
                <div className="flex items-center gap-1">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <span className={cn(
                    'text-[12px] font-bold',
                    c.taxa >= 50 ? 'text-emerald-600' : c.taxa >= 25 ? 'text-amber-600' : 'text-red-500',
                  )}>
                    {c.taxa}%
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </div>
                <Badge variant="secondary" className="text-[11px] py-0.5 px-2">{c.para}</Badge>
                {idx < data.conversoes.length - 1 && <div className="w-px h-4 bg-border mx-1" />}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ============================================================
// Tab: Desempenho por Responsavel
// ============================================================

function TabDesempenho({ dias }: { dias?: number }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(trpc.crm as any).reportDesempenho.query({ dias })
      .then((r: any) => setData(r))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dias])

  if (loading) return <LoadingState />
  if (!data.length) return <EmptyState message="Nenhum dado de desempenho encontrado" />

  return (
    <div className="space-y-4">
      {/* Chart */}
      <Card className="p-4">
        <h3 className="text-[13px] font-semibold text-foreground mb-4">Comparativo de Desempenho</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="ganhos" name="Ganhos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="perdidos" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total" name="Total" fill={MODULE_COLOR} radius={[4, 4, 0, 0]} opacity={0.4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)]">
          <h3 className="text-[13px] font-semibold text-foreground">Detalhamento por Responsavel</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Responsavel</TableHead>
              <TableHead className="text-xs text-center">Total</TableHead>
              <TableHead className="text-xs text-center">Ganhos</TableHead>
              <TableHead className="text-xs text-center">Perdidos</TableHead>
              <TableHead className="text-xs text-center">Em Aberto</TableHead>
              <TableHead className="text-xs text-center">Taxa de Conversao</TableHead>
              <TableHead className="text-xs text-right">Valor Total</TableHead>
              <TableHead className="text-xs text-right">Valor Ganho</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row: any) => (
              <TableRow key={row.responsavelId || 'sem'}>
                <TableCell className="text-xs font-medium">
                  <div className="flex items-center gap-2">
                    {row.image ? (
                      <img src={resolveAssetUrl(row.image)} className="h-6 w-6 rounded-full" alt="" />
                    ) : (
                      <div className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: MODULE_COLOR }}>
                        {(row.nome || '?')[0].toUpperCase()}
                      </div>
                    )}
                    {row.nome}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-center">{row.total}</TableCell>
                <TableCell className="text-xs text-center">
                  <span className="text-emerald-600 font-medium">{row.ganhos}</span>
                </TableCell>
                <TableCell className="text-xs text-center">
                  <span className="text-red-500 font-medium">{row.perdidos}</span>
                </TableCell>
                <TableCell className="text-xs text-center">{row.total - row.ganhos - row.perdidos}</TableCell>
                <TableCell className="text-xs text-center">
                  <Badge
                    variant="secondary"
                    className="text-[10px]"
                    style={{
                      backgroundColor: row.taxaConversao >= 50 ? '#d1fae5' : row.taxaConversao >= 25 ? '#fef3c7' : '#fee2e2',
                      color: row.taxaConversao >= 50 ? '#065f46' : row.taxaConversao >= 25 ? '#92400e' : '#991b1b',
                    }}
                  >
                    {row.taxaConversao}%
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right">{formatCurrency(row.valor)}</TableCell>
                <TableCell className="text-xs text-right font-medium text-emerald-600">
                  {formatCurrency(row.valorGanho)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ============================================================
// Tab: Oportunidades por Origem
// ============================================================

function TabOrigem({ dias }: { dias?: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(trpc.crm as any).reportOrigem.query({ dias })
      .then((r: any) => setData(r))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [dias])

  if (loading) return <LoadingState />
  if (!data || !data.origens?.length) return <EmptyState message="Nenhum dado de origem encontrado" />

  const pieData = data.origens.map((o: any, idx: number) => ({
    name: o.origem,
    value: o.count,
    fill: PIE_COLORS[idx % PIE_COLORS.length],
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-12 gap-4">
        {/* Donut Chart */}
        <Card className="col-span-5 p-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Distribuicao por Origem</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                >
                  {pieData.map((entry: any, idx: number) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value: any) => [value, 'Quantidade']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Value Bar Chart */}
        <Card className="col-span-7 p-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-4">Valor por Origem</h3>
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.origens} layout="vertical" margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis type="category" dataKey="origem" tick={{ fontSize: 10 }} width={100} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value: any) => [formatCurrency(value), 'Valor']}
                />
                <Bar dataKey="valor" name="Valor" radius={[0, 4, 4, 0]}>
                  {data.origens.map((_: any, idx: number) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)]">
          <h3 className="text-[13px] font-semibold text-foreground">Detalhamento por Origem</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Origem</TableHead>
              <TableHead className="text-xs text-center">Quantidade</TableHead>
              <TableHead className="text-xs text-center">% do Total</TableHead>
              <TableHead className="text-xs text-center">Ganhos</TableHead>
              <TableHead className="text-xs text-center">Perdidos</TableHead>
              <TableHead className="text-xs text-center">Taxa de Conversao</TableHead>
              <TableHead className="text-xs text-right">Valor Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.origens.map((row: any, idx: number) => (
              <TableRow key={row.origem}>
                <TableCell className="text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                    {row.origem}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-center">{row.count}</TableCell>
                <TableCell className="text-xs text-center">
                  {data.total > 0 ? Math.round((row.count / data.total) * 100) : 0}%
                </TableCell>
                <TableCell className="text-xs text-center">
                  <span className="text-emerald-600 font-medium">{row.ganhos}</span>
                </TableCell>
                <TableCell className="text-xs text-center">
                  <span className="text-red-500 font-medium">{row.perdidos}</span>
                </TableCell>
                <TableCell className="text-xs text-center">
                  <Badge
                    variant="secondary"
                    className="text-[10px]"
                    style={{
                      backgroundColor: row.taxaConversao >= 50 ? '#d1fae5' : row.taxaConversao >= 25 ? '#fef3c7' : '#fee2e2',
                      color: row.taxaConversao >= 50 ? '#065f46' : row.taxaConversao >= 25 ? '#92400e' : '#991b1b',
                    }}
                  >
                    {row.taxaConversao}%
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right">{formatCurrency(row.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

// ============================================================
// Tab: Tempo Medio por Etapa
// ============================================================

function TabTempoMedio() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(trpc.crm as any).reportTempoMedio.query()
      .then((r: any) => setData(r))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (!data.length) return <EmptyState message="Nenhum dado encontrado" />

  const maxDias = Math.max(...data.map((d: any) => d.mediaDias), 1)

  return (
    <div className="space-y-4">
      {/* Chart */}
      <Card className="p-4">
        <h3 className="text-[13px] font-semibold text-foreground mb-4">Tempo Medio em Cada Etapa (dias)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
                formatter={(value: any) => [`${value} dias`, 'Tempo Medio']}
              />
              <Bar dataKey="mediaDias" name="Dias" radius={[4, 4, 0, 0]}>
                {data.map((e: any) => (
                  <Cell key={e.etapaId} fill={e.cor || MODULE_COLOR} opacity={0.85} />
                ))}
                <LabelList dataKey="mediaDias" position="top" style={{ fontSize: 10, fontWeight: 600 }} formatter={(v: number) => `${v}d`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Visual bars + table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.08)]">
          <h3 className="text-[13px] font-semibold text-foreground">Detalhamento</h3>
        </div>
        <div className="p-4 space-y-2.5">
          {data.map((etapa: any) => {
            const width = maxDias > 0 ? Math.max(4, (etapa.mediaDias / maxDias) * 100) : 4
            return (
              <div key={etapa.etapaId} className="flex items-center gap-3">
                <div className="w-[120px] shrink-0 text-right">
                  <span className="text-[11px] text-muted-foreground">{etapa.nome}</span>
                </div>
                <div className="flex-1 relative h-7 bg-muted/30 rounded overflow-hidden">
                  <div
                    className="h-full rounded flex items-center px-2 transition-all"
                    style={{
                      width: `${width}%`,
                      backgroundColor: etapa.cor || MODULE_COLOR,
                      opacity: 0.8,
                    }}
                  >
                    <span className="text-[10px] font-semibold text-white whitespace-nowrap">
                      {etapa.mediaDias} dias
                    </span>
                  </div>
                </div>
                <div className="w-[80px] shrink-0 text-right">
                  <span className="text-[10px] text-muted-foreground">
                    {etapa.totalOportunidades} oport.
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ============================================================
// Shared Components
// ============================================================

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </Card>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: MODULE_COLOR }} />
      <span className="ml-2 text-sm text-muted-foreground">Carregando dados...</span>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
      <BarChart3 className="h-10 w-10 mb-2 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
