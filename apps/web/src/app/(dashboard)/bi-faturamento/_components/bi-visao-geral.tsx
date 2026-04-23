'use client'

import { useState, useEffect } from 'react'
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { BiKpiCards, type KpiData } from './bi-kpi-cards'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts'

const MODULE_COLOR = '#8b5cf6'
const GREEN = 'rgba(16, 185, 129, 0.85)'
const GREEN_SOLID = '#10b981'
const RED = 'rgba(239, 68, 68, 0.85)'
const RED_SOLID = '#ef4444'
const AMBER = 'rgba(245, 158, 11, 0.85)'
const BLUE = 'rgba(59, 130, 246, 0.85)'

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(value)

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface FonteItem { contaLonga: string; nomeConta: string; valor: number; isDeducao?: boolean }
interface MesCustoDespesa { mes: number; custosFixos: number; despesas: number }

interface KpisResponse extends KpiData {
  fontesReceita: FonteItem[]
  fontesDespesas: FonteItem[]
  mesesCustosDespesas: MesCustoDespesa[]
}

const ANO_COLORS = ['#8b5cf6', '#f59e0b', '#0ea5e9', '#ec4899']

interface VisaoGeralProps {
  clienteId: string
  anos: number[]
  meses: number[]
}

const INDICADORES = [
  { value: 'faturamento', label: 'Faturamento' },
  { value: 'despesas_operacionais', label: 'Despesas Operacionais' },
  { value: 'ebitda', label: 'EBITDA Técnico' },
  { value: 'ebitda_simplificado', label: 'EBITDA Simplificado' },
  { value: 'lucro_liquido', label: 'Lucro Líquido' },
  { value: 'margem_contribuicao', label: 'Margem de Contribuição' },
]

export function BiVisaoGeral({ clienteId, anos, meses }: VisaoGeralProps) {
  const ano = anos[0] ?? new Date().getFullYear()
  const [dataByAno, setDataByAno] = useState<Record<number, KpisResponse>>({})
  const [analiseByAno, setAnaliseByAno] = useState<Record<number, Record<string, Array<{ mes: number; valor: number }>>>>({})
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [indicador, setIndicador] = useState('faturamento')

  useEffect(() => {
    if (!clienteId || anos.length === 0) return
    setLoading(true)
    setDataByAno({})

    const mesesParam = meses.length === 12 ? undefined : meses.join(',')

    Promise.all(
      anos.map(async a => {
        const [kpis, analise] = await Promise.all([
          trpc.bi.balanceteKpis.query({ clienteId, ano: a, meses: mesesParam }).catch(() => null),
          trpc.bi.balanceteAnalise.query({ clienteId, ano: a, meses: mesesParam }).catch(() => null),
        ])
        return { ano: a, kpis: kpis as KpisResponse | null, analise }
      })
    ).then(results => {
      const kpiMap: Record<number, KpisResponse> = {}
      const analiseMap: Record<number, Record<string, Array<{ mes: number; valor: number }>>> = {}
      for (const r of results) {
        if (r.kpis) kpiMap[r.ano] = r.kpis
        if (r.analise && (r.analise as any).indicadoresHorizontais) {
          analiseMap[r.ano] = (r.analise as any).indicadoresHorizontais
        }
      }
      setDataByAno(kpiMap)
      setAnaliseByAno(analiseMap)
    }).finally(() => setLoading(false))
  }, [clienteId, anos, meses, reloadKey])

  const data = dataByAno[ano] ?? null // Dados do ano principal para KPI cards
  const isComparativo = anos.length > 1

  // Dados para gráfico de barras (custos x despesas por mês) — comparativo
  const barData = MESES_LABELS.map((label, i) => {
    const entry: Record<string, unknown> = { mes: label }
    for (const a of anos) {
      const mesDados = (dataByAno[a]?.mesesCustosDespesas ?? []).find(m => m.mes === i + 1)
      entry[`custos_${a}`] = mesDados?.custosFixos ?? 0
      entry[`despesas_${a}`] = mesDados?.despesas ?? 0
    }
    return entry
  })
  const hasBarData = anos.some(a => (dataByAno[a]?.mesesCustosDespesas ?? []).length > 0)

  // Dados para donut (ano principal)
  const totalCustos = Math.abs(data?.custosFixos ?? 0)
  const totalDespesas = Math.abs(data?.despesasOperacionais ?? 0)
  const totalCD = totalCustos + totalDespesas
  const donutData = totalCD > 0 ? [
    { name: 'Custos Fixos', value: Math.round((totalCustos / totalCD) * 1000) / 10 },
    { name: 'Despesas Op.', value: Math.round((totalDespesas / totalCD) * 1000) / 10 },
  ] : []

  // Fontes top 5
  const fontesReceita = (data?.fontesReceita ?? []).slice(0, 5)
  const fontesDespesas = (data?.fontesDespesas ?? []).slice(0, 5)

  // Tooltip customizado
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null
    return (
      <div className="rounded-lg border bg-white dark:bg-card px-3 py-2 shadow-md">
        <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-[11px]" style={{ color: p.color }}>
            {p.name === 'custos' ? 'Custos Fixos' : p.name === 'despesas' ? 'Despesas Op.' : p.name}: <span className="font-semibold">{formatCurrency(p.value)}</span>
          </p>
        ))}
      </div>
    )
  }

  const FonteTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null
    return (
      <div className="rounded-lg border bg-white dark:bg-card px-3 py-2 shadow-md">
        <p className="text-[11px] font-semibold">{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <BiKpiCards data={data} loading={loading} clienteId={clienteId} ano={ano} onKpisChanged={() => setReloadKey(k => k + 1)} />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
          Nenhum dado disponível. Importe o balancete do SCI para visualizar os indicadores.
        </div>
      ) : (
        <>
          {/* Linha 1: Resultado no período (70%) + Fontes Receita/Despesas empilhados (30%) */}
          <div className="grid gap-4" style={{ gridTemplateColumns: '70% 1fr' }}>
            <Card className="overflow-hidden border border-border/50">
              <div className="px-5 py-3 border-b border-border/60 bg-muted/20 flex items-center gap-3">
                <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2 flex-1">
                  <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  Resultado no período {isComparativo ? 'x Ano anterior' : ''}
                </h4>
                <select
                  value={indicador}
                  onChange={e => setIndicador(e.target.value)}
                  className="shrink-0 h-6 w-auto max-w-[180px] rounded border border-input bg-white dark:bg-card px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {INDICADORES.map(ind => (
                    <option key={ind.value} value={ind.value}>{ind.label}</option>
                  ))}
                </select>
              </div>
              <CardContent className="p-4 bg-white dark:bg-card">
                {(() => {
                  // Build chart data from indicadoresHorizontais
                  const chartData = MESES_LABELS.map((label, i) => {
                    const entry: Record<string, unknown> = { mes: label }
                    for (const a of anos) {
                      const indicadorData = analiseByAno[a]?.[indicador] ?? []
                      const mesData = indicadorData.find(d => d.mes === i + 1)
                      entry[`valor_${a}`] = mesData?.valor ?? 0
                    }
                    // Calcular variação % entre os dois primeiros anos selecionados
                    if (isComparativo && anos.length >= 2) {
                      const valAtual = Number(entry[`valor_${anos[0]}`] ?? 0)
                      const valAnterior = Number(entry[`valor_${anos[1]}`] ?? 0)
                      entry.variacao = valAnterior !== 0 ? ((valAtual - valAnterior) / Math.abs(valAnterior)) * 100 : 0
                    }
                    return entry
                  })
                  const hasData = anos.some(a => (analiseByAno[a]?.[indicador] ?? []).length > 0)

                  if (!hasData) {
                    return <div className="flex items-center justify-center h-[380px] text-sm text-muted-foreground">Sem dados para {INDICADORES.find(i => i.value === indicador)?.label}</div>
                  }

                  const renderBarLabel = (props: any) => {
                    const { x, y, width, value } = props
                    if (!value || value === 0) return null
                    return <text x={x + width / 2} y={y - 4} fill="var(--muted-foreground)" textAnchor="middle" fontSize={9}>{formatCompact(value)}</text>
                  }

                  return (
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={chartData} margin={{ top: 25, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={{ stroke: 'var(--border)' }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={v => formatCompact(v)} axisLine={{ stroke: 'var(--border)' }} />
                        {isComparativo && (
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#000000' }} tickFormatter={v => `${Number(v).toFixed(0)}%`} axisLine={{ stroke: '#f59e0b' }} />
                        )}
                        <Tooltip content={({ active, payload, label }: any) => {
                          if (!active || !payload) return null
                          return (
                            <div className="rounded-lg border bg-white dark:bg-card px-3 py-2 shadow-md">
                              <p className="text-xs font-semibold text-foreground mb-1">{label}</p>
                              {payload.filter((p: any) => p.dataKey !== 'variacao').map((p: any, i: number) => (
                                <p key={i} className="text-[11px]" style={{ color: p.color }}>
                                  {String(p.dataKey).replace('valor_', '')}: <span className="font-semibold">{formatCurrency(p.value)}</span>
                                </p>
                              ))}
                              {isComparativo && payload.find((p: any) => p.dataKey === 'variacao') && (
                                <p className="text-[11px] mt-1 pt-1 border-t" style={{ color: '#000000' }}>
                                  Variação: <span className="font-semibold">{Number(payload.find((p: any) => p.dataKey === 'variacao')?.value ?? 0).toFixed(1)}%</span>
                                </p>
                              )}
                            </div>
                          )
                        }} />
                        <Legend iconType="circle" iconSize={8} formatter={(value) => {
                          if (value === 'variacao') return <span className="text-xs" style={{ color: '#000000' }}>Variação %</span>
                          const anoLabel = String(value).replace('valor_', '')
                          return <span className="text-xs text-foreground">{anoLabel}</span>
                        }} />
                        {anos.map((a, idx) => (
                          <Bar
                            key={`valor_${a}`}
                            dataKey={`valor_${a}`}
                            yAxisId="left"
                            fill={isComparativo ? ANO_COLORS[idx % ANO_COLORS.length] : MODULE_COLOR}
                            radius={[4, 4, 0, 0]}
                            opacity={isComparativo ? 0.7 + idx * 0.1 : 0.85}
                            name={`valor_${a}`}
                          >
                            <LabelList dataKey={`valor_${a}`} content={renderBarLabel} />
                          </Bar>
                        ))}
                        {isComparativo && (
                          <Line
                            type="monotone"
                            dataKey="variacao"
                            yAxisId="right"
                            stroke="#000000"
                            strokeWidth={2}
                            dot={{ fill: '#000000', r: 3 }}
                            name="variacao"
                            label={({ x, y, value }: any) => value != null && value !== 0 ? <text x={x} y={y - 10} fill="#000" textAnchor="middle" fontSize={9} fontWeight={600}>{`${Number(value).toFixed(1)}%`}</text> : null}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )
                })()}
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              {/* Fontes de Receita */}
              <Card className="overflow-hidden border border-border/50 flex-1">
                <div className="px-4 py-2.5 border-b border-border/60 bg-muted/20">
                  <h4 className="text-[12px] font-semibold text-foreground flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                    Principais Fontes de Receita
                  </h4>
                </div>
                <CardContent className="p-3 bg-white dark:bg-card">
                  {fontesReceita.length === 0 ? (
                    <div className="flex items-center justify-center h-[80px] text-xs text-muted-foreground">Sem dados</div>
                  ) : (
                    <div className="space-y-1.5">
                      {fontesReceita.map((f, i) => {
                        const maxVal = Math.max(...fontesReceita.map(x => x.valor))
                        const pct = maxVal > 0 ? (f.valor / maxVal) * 100 : 0
                        return (
                          <div key={f.contaLonga} className="rounded border border-border/30 px-2.5 py-2 hover:border-border/60 transition-colors">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[12px] text-foreground truncate flex-1" title={f.nomeConta}>
                                {f.nomeConta}
                              </span>
                              <span className="text-[12px] font-bold tabular-nums text-foreground ml-2 shrink-0">{formatCurrency(f.valor)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: GREEN_SOLID, opacity: 1 - i * 0.15 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Fontes de Despesas */}
              <Card className="overflow-hidden border border-border/50 flex-1">
                <div className="px-4 py-2.5 border-b border-border/60 bg-muted/20">
                  <h4 className="text-[12px] font-semibold text-foreground flex items-center gap-2">
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                    Principais Fontes de Despesas
                  </h4>
                </div>
                <CardContent className="p-3 bg-white dark:bg-card">
                  {fontesDespesas.length === 0 ? (
                    <div className="flex items-center justify-center h-[80px] text-xs text-muted-foreground">Sem dados</div>
                  ) : (
                    <div className="space-y-1.5">
                      {fontesDespesas.map((f, i) => {
                        const maxVal = Math.max(...fontesDespesas.map(x => x.valor))
                        const pct = maxVal > 0 ? (f.valor / maxVal) * 100 : 0
                        return (
                          <div key={f.contaLonga} className="rounded border border-border/30 px-2.5 py-2 hover:border-border/60 transition-colors">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[12px] text-foreground truncate flex-1" title={f.nomeConta}>
                                {f.nomeConta}
                              </span>
                              <span className="text-[12px] font-bold tabular-nums text-foreground ml-2 shrink-0">{formatCurrency(f.valor)}</span>
                            </div>
                            <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: RED_SOLID, opacity: 1 - i * 0.15 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Linha 2: % Custos Fixos x Despesas Operacionais — donut (30%) + barras mensais (70%) */}
          <Card className="overflow-hidden border border-border/50">
            <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
              <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                % Custos Fixos x Despesas Operacionais
              </h4>
            </div>
            <CardContent className="p-4 bg-white dark:bg-card">
              <div className="flex gap-6" style={{ minHeight: 320 }}>
                {/* Donut 30% */}
                <div className="flex flex-col items-center justify-center" style={{ width: '30%' }}>
                  {donutData.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Sem dados</div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value"
                            label={({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                              const RADIAN = Math.PI / 180
                              const radius = innerRadius + (outerRadius - innerRadius) * 0.5
                              const x = cx + radius * Math.cos(-midAngle * RADIAN)
                              const y = cy + radius * Math.sin(-midAngle * RADIAN)
                              return <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{`${value}%`}</text>
                            }}
                            labelLine={false}
                          >
                            <Cell fill={GREEN_SOLID} stroke={GREEN_SOLID} />
                            <Cell fill={RED_SOLID} stroke={RED_SOLID} />
                          </Pie>
                          <Tooltip formatter={(value: number) => `${value}%`} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-col gap-2 w-full mt-1">
                        <div className="flex items-center justify-between rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 px-3 py-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GREEN_SOLID }} />
                            <span className="font-medium text-foreground">Custos Fixos</span>
                          </div>
                          <span className="font-bold text-[11px] tabular-nums text-foreground">{formatCurrency(totalCustos)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/30 px-3 py-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RED_SOLID }} />
                            <span className="font-medium text-foreground">Despesas Op.</span>
                          </div>
                          <span className="font-bold text-[11px] tabular-nums text-foreground">{formatCurrency(totalDespesas)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-md bg-muted/30 border border-border/40 px-3 py-2">
                          <span className="text-[11px] font-medium text-foreground">Total</span>
                          <span className="font-bold text-[11px] tabular-nums text-foreground">{formatCurrency(totalCustos + totalDespesas)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Barras 70% */}
                <div style={{ width: '70%' }}>
                  {!hasBarData ? (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Sem dados mensais</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={380}>
                      <BarChart data={barData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                        <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={{ stroke: 'var(--border)' }} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={v => formatCompact(v)} axisLine={{ stroke: 'var(--border)' }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} formatter={(value) => {
                          const parts = String(value).split('_')
                          const tipo = parts[0] === 'custos' ? 'Custos' : 'Despesas'
                          const anoLabel = parts[1] || ''
                          return <span className="text-xs text-foreground">{tipo} {anoLabel}</span>
                        }} />
                        {anos.map((a, idx) => (
                          <Bar key={`custos_${a}`} dataKey={`custos_${a}`} stackId={`stack_${a}`} fill={isComparativo ? ANO_COLORS[idx % ANO_COLORS.length] : GREEN} radius={[0, 0, 0, 0]} opacity={0.7} />
                        ))}
                        {anos.map((a, idx) => (
                          <Bar key={`despesas_${a}`} dataKey={`despesas_${a}`} stackId={`stack_${a}`} fill={isComparativo ? ANO_COLORS[idx % ANO_COLORS.length] : RED} radius={[4, 4, 0, 0]} opacity={isComparativo ? 0.4 : 0.85} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Linha 3: Comparativo entre Anos (só aparece com 2+ anos) */}
          {isComparativo && Object.keys(dataByAno).length > 1 && (
            <Card className="overflow-hidden border border-border/50">
              <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
                <h4 className="text-[13px] font-semibold text-foreground">Comparativo entre Anos</h4>
              </div>
              <CardContent className="p-4 bg-white dark:bg-card">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Indicador</th>
                        {anos.map((a, i) => (
                          <th key={a} className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: ANO_COLORS[i % ANO_COLORS.length] }}>{a}</th>
                        ))}
                        {anos.length === 2 && <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">Variação</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Receita Bruta', key: 'receitaBruta' },
                        { label: 'Custos Fixos', key: 'custosFixos', abs: true },
                        { label: 'Despesas', key: 'despesasOperacionais' },
                        { label: 'Lucro Líquido', key: 'lucroLiquido' },
                        { label: 'EBITDA', key: 'ebitda' },
                        { label: 'Margem Líquida', key: 'margemLiquida', pct: true },
                      ].map(row => {
                        const vals = anos.map(a => {
                          const d = dataByAno[a]
                          const v = Number((d as any)?.[row.key] ?? 0)
                          return row.abs ? Math.abs(v) : v
                        })
                        const variacao = anos.length === 2 && vals[1] !== 0 ? ((vals[0]! - vals[1]!) / Math.abs(vals[1]!)) * 100 : null
                        return (
                          <tr key={row.key} className="border-b hover:bg-muted/10">
                            <td className="px-3 py-2 font-medium">{row.label}</td>
                            {vals.map((v, i) => (
                              <td key={i} className={cn('px-3 py-2 text-right tabular-nums font-semibold', v < 0 && 'text-red-600')}>
                                {row.pct ? `${v.toFixed(1)}%` : formatCurrency(v)}
                              </td>
                            ))}
                            {variacao !== null && (
                              <td className={cn('px-3 py-2 text-right tabular-nums font-bold', variacao > 0 ? 'text-emerald-600' : variacao < 0 ? 'text-red-600' : '')}>
                                {variacao > 0 ? '+' : ''}{variacao.toFixed(1)}%
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
