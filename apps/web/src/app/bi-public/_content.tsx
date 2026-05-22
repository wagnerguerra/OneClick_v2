'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { trpc } from '@/lib/trpc'
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, Receipt, Wallet,
  Table as TableIcon, Loader2, AlertCircle, ChevronDown, Plus, Minus, Search,
} from 'lucide-react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts'

/* ── helpers ── */
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCompact = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)
const fmtPct = (v: number) => Number.isFinite(v) ? `${v}%` : ''

const ACCENT = '#0ea5e9'
const GREEN = '#10b981'
const RED = '#ef4444'
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

type Tab = 'visao-geral' | 'matriz' | 'analise'

/* ── main ── */
export default function BiPublicContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [tab, setTab] = useState<Tab>('visao-geral')
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([])
  const [anosSelecionados, setAnosSelecionados] = useState<number[]>([])
  const ano = anosSelecionados[0] ?? new Date().getFullYear() // ano principal

  const toggleAno = (a: number) => {
    setAnosSelecionados(prev => {
      if (prev.includes(a)) { const next = prev.filter(x => x !== a); return next.length === 0 ? [a] : next }
      return [...prev, a].sort((x, y) => y - x)
    })
  }

  const [ctx, setCtx] = useState<{ id: string; razaoSocial: string; documento: string; empresaLogo?: string | null; empresaLogoDark?: string | null; empresaNome?: string | null } | null>(null)
  const [kpisByAno, setKpisByAno] = useState<Record<number, any>>({})
  const [analiseByAno, setAnaliseByAno] = useState<Record<number, any>>({})
  const [matriz, setMatriz] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Load context + available years
  useEffect(() => {
    if (!token) { setError('Token não informado na URL.'); setLoading(false); return }
    ;(async () => {
      try {
        const c = await trpc.biPublic.context.query({ token }) as any
        setCtx(c)
        const anos = await (trpc.biPublic as any).anosDisponiveis.query({ token }) as number[]
        setAnosDisponiveis(anos)
        if (anos.length > 0) setAnosSelecionados([anos[0]!])
      } catch { setError('Token inválido ou expirado.') }
      finally { setLoading(false) }
    })()
  }, [token])

  // Load KPIs + analise for all selected years
  useEffect(() => {
    if (!token || !ctx || anosSelecionados.length === 0) return
    Promise.all(
      anosSelecionados.map(async a => {
        const [k, an] = await Promise.all([
          trpc.biPublic.balanceteKpis.query({ token, ano: a }).catch(() => null),
          trpc.biPublic.balanceteAnalise.query({ token, ano: a }).catch(() => null),
        ])
        return { ano: a, kpis: k, analise: an }
      })
    ).then(results => {
      const km: Record<number, any> = {}
      const am: Record<number, any> = {}
      for (const r of results) { if (r.kpis) km[r.ano] = r.kpis; if (r.analise) am[r.ano] = r.analise }
      setKpisByAno(km)
      setAnaliseByAno(am)
    })
  }, [token, ctx, anosSelecionados])

  // Load matriz
  useEffect(() => {
    if (tab !== 'matriz' || !token || !ctx) return
    trpc.biPublic.balanceteMatriz.query({ token, ano, useParent: false }).then((m: any) => setMatriz(m)).catch(() => {})
  }, [tab, token, ctx, ano])

  const kpis = kpisByAno[ano] ?? null
  const analise = analiseByAno[ano] ?? null

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>
  if (error) return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4 rounded-lg border bg-white p-8 shadow-sm max-w-md">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <h2 className="text-lg font-semibold">Acesso negado</h2>
        <p className="text-center text-sm text-gray-500">{error}</p>
      </div>
    </div>
  )

  const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'visao-geral', label: 'Visão Geral', icon: BarChart3 },
    { id: 'matriz', label: 'Matriz de Resultados', icon: TableIcon },
    { id: 'analise', label: 'Análise', icon: TrendingUp },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-30 border-b bg-white shadow-sm">
        <div className="mx-auto flex h-14 w-full max-w-screen-xl items-center justify-between px-8">
          <div className="flex items-center gap-3">
            {ctx?.empresaLogo ? (
              <div className="flex items-center gap-2.5">
                <img alt={ctx.empresaNome ?? 'Logo'} className="h-8 w-auto max-w-[140px] object-contain dark:hidden" src={ctx.empresaLogo} />
                <img alt={ctx.empresaNome ?? 'Logo'} className="h-8 w-auto max-w-[140px] object-contain hidden dark:block" src={ctx.empresaLogoDark ?? ctx.empresaLogo} />
              </div>
            ) : (
              <span className="text-lg font-bold tracking-tight" style={{ color: ACCENT }}>{ctx?.empresaNome ?? 'ONECLICK'}</span>
            )}
            {ctx && <><span className="hidden text-gray-300 sm:inline">|</span><span className="hidden text-sm font-medium text-gray-600 sm:inline">{ctx.razaoSocial}</span></>}
          </div>
          <div className="flex items-center gap-1">
            {anosDisponiveis.map(a => (
              <button key={a} onClick={() => toggleAno(a)} className={`rounded px-2.5 py-1 text-xs font-medium transition border ${anosSelecionados.includes(a) ? 'text-white border-transparent' : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`} style={anosSelecionados.includes(a) ? { backgroundColor: ACCENT } : undefined}>{a}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-screen-xl gap-0 px-8">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${tab === id ? 'border-sky-500 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto w-full max-w-screen-xl flex-1 px-8 py-6">
        {tab === 'visao-geral' && <PubVisaoGeral kpis={kpis} analiseByAno={analiseByAno} kpisByAno={kpisByAno} anos={anosSelecionados} />}
        {tab === 'matriz' && <PubMatriz data={matriz} />}
        {tab === 'analise' && <PubAnalise analise={analise} ano={ano} />}
      </main>

      <footer className="border-t bg-white py-4 text-center text-xs text-gray-400">OneClick ERP — Relatório gerado automaticamente</footer>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Visão Geral
   ═══════════════════════════════════════════════════════════════ */
const ANO_COLORS = ['#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899']

function PubVisaoGeral({ kpis, analiseByAno, kpisByAno, anos }: { kpis: any; analiseByAno: Record<number, any>; kpisByAno: Record<number, any>; anos: number[] }) {
  const ano = anos[0] ?? new Date().getFullYear()
  const isComparativo = anos.length > 1
  const [indicador, setIndicador] = useState('faturamento')

  const INDICADORES = [
    { value: 'faturamento', label: 'Faturamento' },
    { value: 'despesas_operacionais', label: 'Despesas Operacionais' },
    { value: 'ebitda', label: 'EBITDA Técnico' },
    { value: 'ebitda_simplificado', label: 'EBITDA Simplificado' },
    { value: 'lucro_liquido', label: 'Lucro Líquido' },
    { value: 'margem_contribuicao', label: 'Margem de Contribuição' },
  ]

  const cards = kpis ? [
    { label: 'Receita Bruta', value: kpis.receitaBruta ?? 0, icon: DollarSign, color: GREEN, subtitle: `Líquida: ${fmt(kpis.receitaLiquida ?? 0)}` },
    { label: 'Custos Fixos', value: Math.abs(kpis.custosFixos ?? 0), icon: Receipt, color: RED, subtitle: `Lucro Bruto: ${fmt(kpis.lucroBruto ?? 0)}` },
    { label: 'Despesas', value: Math.abs(kpis.despesasOperacionais ?? 0), icon: Wallet, color: '#f59e0b', subtitle: `EBITDA: ${fmt(kpis.ebitda ?? 0)}` },
    { label: 'Lucro Líquido', value: kpis.lucroLiquido ?? 0, icon: BarChart3, color: ACCENT, negative: true, subtitle: `Margem: ${(kpis.margemLiquida ?? 0).toFixed(1)}%` },
  ] : []

  const chartData = MONTHS.map((label, i) => {
    const entry: Record<string, any> = { mes: label }
    for (const a of anos) {
      const indData = analiseByAno[a]?.indicadoresHorizontais?.[indicador] ?? []
      entry[`valor_${a}`] = indData.find((d: any) => d.mes === i + 1)?.valor ?? 0
    }
    if (isComparativo && anos.length >= 2) {
      const v0 = Number(entry[`valor_${anos[0]}`] ?? 0)
      const v1 = Number(entry[`valor_${anos[1]}`] ?? 0)
      entry.variacao = v1 !== 0 ? ((v0 - v1) / Math.abs(v1)) * 100 : 0
    }
    return entry
  })
  const hasChartData = anos.some(a => (analiseByAno[a]?.indicadoresHorizontais?.[indicador] ?? []).length > 0)

  // Donut
  const totalCustos = Math.abs(kpis?.custosFixos ?? 0)
  const totalDespesas = Math.abs(kpis?.despesasOperacionais ?? 0)
  const totalCD = totalCustos + totalDespesas
  const donutData = totalCD > 0 ? [
    { name: 'Custos Fixos', value: Math.round((totalCustos / totalCD) * 1000) / 10 },
    { name: 'Despesas Op.', value: Math.round((totalDespesas / totalCD) * 1000) / 10 },
  ] : []

  // Fontes
  const fontesReceita = (kpis?.fontesReceita ?? []).slice(0, 5)
  const fontesDespesas = (kpis?.fontesDespesas ?? []).slice(0, 5)

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="rounded-lg border border-gray-200 bg-white p-5 border-l-4" style={{ borderLeftColor: c.color }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{c.label}</p>
                <p className={`text-xl font-bold tabular-nums ${c.negative && c.value < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(c.value)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{c.subtitle}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: c.color + '14' }}>
                <c.icon className="h-5 w-5" style={{ color: c.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparativo entre Anos */}
      {isComparativo && Object.keys(kpisByAno).length > 1 && (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50"><h4 className="text-[13px] font-semibold text-gray-700">Comparativo entre Anos</h4></div>
          <div className="p-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Indicador</th>
                  {anos.map((a, i) => <th key={a} className="px-3 py-2 text-right text-[10px] font-semibold uppercase" style={{ color: ANO_COLORS[i % ANO_COLORS.length] }}>{a}</th>)}
                  {anos.length === 2 && <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Variação</th>}
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
                  const vals = anos.map(a => { const v = Number(kpisByAno[a]?.[row.key] ?? 0); return row.abs ? Math.abs(v) : v })
                  const variacao = anos.length === 2 && vals[1] !== 0 ? ((vals[0]! - vals[1]!) / Math.abs(vals[1]!)) * 100 : null
                  return (
                    <tr key={row.key} className="border-b hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      {vals.map((v, i) => <td key={i} className={`px-3 py-2 text-right tabular-nums font-semibold ${v < 0 ? 'text-red-600' : ''}`}>{row.pct ? `${v.toFixed(1)}%` : fmt(v)}</td>)}
                      {variacao !== null && <td className={`px-3 py-2 text-right tabular-nums font-bold ${variacao > 0 ? 'text-emerald-600' : variacao < 0 ? 'text-red-600' : ''}`}>{variacao > 0 ? '+' : ''}{variacao.toFixed(1)}%</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gráfico principal com selector */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '70% 1fr' }}>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50 flex items-center gap-3">
            <h4 className="text-[13px] font-semibold text-gray-700 flex-1 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-400" />Resultado no período {isComparativo ? 'x Ano anterior' : ''}</h4>
            <select value={indicador} onChange={e => setIndicador(e.target.value)} className="shrink-0 h-6 max-w-[180px] rounded border border-gray-200 bg-white px-1.5 text-[11px]">
              {INDICADORES.map(ind => <option key={ind.value} value={ind.value}>{ind.label}</option>)}
            </select>
          </div>
          <div className="p-4">
            {!hasChartData ? (
              <div className="flex items-center justify-center h-[380px] text-sm text-gray-400">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={chartData} margin={{ top: 25, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => fmtCompact(v)} />
                  {isComparativo && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#000' }} tickFormatter={v => `${Number(v).toFixed(0)}%`} axisLine={{ stroke: '#000' }} />}
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload) return null
                    return (
                      <div className="rounded-lg border bg-white px-3 py-2 shadow-md">
                        <p className="text-xs font-semibold mb-1">{label}</p>
                        {payload.filter((p: any) => p.dataKey !== 'variacao').map((p: any, i: number) => (
                          <p key={i} className="text-[11px]" style={{ color: p.color }}>{String(p.dataKey).replace('valor_', '')}: <span className="font-semibold">{fmt(p.value)}</span></p>
                        ))}
                        {isComparativo && payload.find((p: any) => p.dataKey === 'variacao') && (
                          <p className="text-[11px] mt-1 pt-1 border-t">Variação: <span className="font-semibold">{Number(payload.find((p: any) => p.dataKey === 'variacao')?.value ?? 0).toFixed(1)}%</span></p>
                        )}
                      </div>
                    )
                  }} />
                  <Legend iconType="circle" iconSize={8} formatter={v => {
                    if (v === 'variacao') return <span className="text-xs">Variação %</span>
                    return <span className="text-xs">{String(v).replace('valor_', '')}</span>
                  }} />
                  {anos.map((a, idx) => (
                    <Bar key={`valor_${a}`} dataKey={`valor_${a}`} yAxisId="left" fill={isComparativo ? ANO_COLORS[idx % ANO_COLORS.length] : ACCENT} radius={[4, 4, 0, 0]} opacity={isComparativo ? 0.7 + idx * 0.1 : 0.85} name={`valor_${a}`}>
                      <LabelList dataKey={`valor_${a}`} content={({ x, y, width, value }: any) => value ? <text x={x + width / 2} y={y - 4} fill="#9ca3af" textAnchor="middle" fontSize={9}>{fmtCompact(value)}</text> : null} />
                    </Bar>
                  ))}
                  {isComparativo && <Line type="monotone" dataKey="variacao" yAxisId="right" stroke="#000" strokeWidth={2} dot={{ fill: '#000', r: 3 }} name="variacao" label={({ x, y, value }: any) => value != null && value !== 0 ? <text x={x} y={y - 10} fill="#000" textAnchor="middle" fontSize={9} fontWeight={600}>{`${Number(value).toFixed(1)}%`}</text> : null} />}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Fontes */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex-1">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50"><h4 className="text-[12px] font-semibold text-gray-700 flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Fontes de Receita</h4></div>
            <div className="p-3 space-y-1.5">
              {fontesReceita.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Sem dados</p> : fontesReceita.map((f: any, i: number) => {
                const max = Math.max(...fontesReceita.map((x: any) => x.valor))
                return (
                  <div key={f.contaLonga} className="rounded border border-gray-100 px-2.5 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[12px] text-gray-700 truncate">{f.nomeConta}</span>
                      <span className="text-[12px] font-bold tabular-nums text-gray-800 ml-2 shrink-0">{fmt(f.valor)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${max > 0 ? (f.valor / max) * 100 : 0}%`, backgroundColor: GREEN, opacity: 1 - i * 0.15 }} /></div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex-1">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/50"><h4 className="text-[12px] font-semibold text-gray-700 flex items-center gap-2"><TrendingDown className="h-3.5 w-3.5 text-red-500" />Fontes de Despesas</h4></div>
            <div className="p-3 space-y-1.5">
              {fontesDespesas.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Sem dados</p> : fontesDespesas.map((f: any, i: number) => {
                const max = Math.max(...fontesDespesas.map((x: any) => x.valor))
                return (
                  <div key={f.contaLonga} className="rounded border border-gray-100 px-2.5 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[12px] text-gray-700 truncate">{f.nomeConta}</span>
                      <span className="text-[12px] font-bold tabular-nums text-gray-800 ml-2 shrink-0">{fmt(f.valor)}</span>
                    </div>
                    <div className="h-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${max > 0 ? (f.valor / max) * 100 : 0}%`, backgroundColor: RED, opacity: 1 - i * 0.15 }} /></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* % Custos x Despesas */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h4 className="text-[13px] font-semibold text-gray-700">% Custos Fixos x Despesas Operacionais</h4>
        </div>
        <div className="p-4">
          {donutData.length === 0 ? <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">Sem dados</div> : (
            <div className="flex gap-6" style={{ minHeight: 280 }}>
              <div className="flex flex-col items-center justify-center" style={{ width: '30%' }}>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
                        const R = Math.PI / 180; const r = innerRadius + (outerRadius - innerRadius) * 0.5
                        return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{`${value}%`}</text>
                      }} labelLine={false}>
                      <Cell fill={GREEN} /><Cell fill={RED} />
                    </Pie>
                    <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 w-full mt-1">
                  <div className="flex items-center justify-between rounded bg-emerald-50 border border-emerald-200/50 px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px]"><div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: GREEN }} /><span className="font-medium">Custos Fixos</span></div>
                    <span className="font-bold text-[11px] tabular-nums">{fmt(totalCustos)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-red-50 border border-red-200/50 px-3 py-2">
                    <div className="flex items-center gap-2 text-[11px]"><div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RED }} /><span className="font-medium">Despesas Op.</span></div>
                    <span className="font-bold text-[11px] tabular-nums">{fmt(totalDespesas)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-gray-50 border border-gray-200/50 px-3 py-2">
                    <span className="text-[11px] font-medium">Total</span>
                    <span className="font-bold text-[11px] tabular-nums">{fmt(totalCustos + totalDespesas)}</span>
                  </div>
                </div>
              </div>
              <div style={{ width: '70%' }}>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={(kpis?.mesesCustosDespesas ?? []).map((m: any) => ({ mes: MONTHS[m.mes - 1], custos: m.custosFixos, despesas: m.despesas }))} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => fmtCompact(v)} />
                    <Tooltip formatter={(value: number, name: string) => [fmt(value), name === 'custos' ? 'Custos' : 'Despesas']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend formatter={v => <span className="text-xs">{v === 'custos' ? 'Custos Fixos' : 'Despesas Op.'}</span>} iconType="circle" iconSize={8} />
                    <Bar dataKey="custos" stackId="a" fill={GREEN} opacity={0.8} />
                    <Bar dataKey="despesas" stackId="a" fill={RED} opacity={0.8} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Matriz de Resultados
   ═══════════════════════════════════════════════════════════════ */
function PubMatriz({ data }: { data: any }) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selRow, setSelRow] = useState<string | null>(null)
  const [selCol, setSelCol] = useState<string | null>(null)

  if (!data?.rows?.length) return <div className="rounded-lg border bg-white p-12 text-center text-gray-400"><Loader2 className="inline h-5 w-5 animate-spin mr-2" />Carregando matriz...</div>

  const rows = data.rows as Array<{ id: string; conta: string; nomeConta: string; level: number; parentId: string | null; hasChildren: boolean; valores: Record<string, { realizado: number; pct_av: number }>; total: { realizado: number; pct_av: number } }>
  const refs = (data.refs ?? []) as string[]

  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id) } else { n.add(id) }; return n })
  const handleCellClick = (rowId: string, colRef: string) => {
    if (selRow === rowId && selCol === colRef) { setSelRow(null); setSelCol(null) }
    else { setSelRow(rowId); setSelCol(colRef) }
  }

  const visibleRows = search
    ? rows.filter(r => r.conta.toLowerCase().includes(search.toLowerCase()) || r.nomeConta.toLowerCase().includes(search.toLowerCase()))
    : rows.filter(r => {
        let parent = r.parentId
        while (parent) { if (!expanded.has(parent)) return false; parent = rows.find(x => x.id === parent)?.parentId ?? null }
        return true
      })

  const getType = (conta: string, nome: string) => {
    if (/^0?[13]/.test(conta) || /receita|ativo/i.test(nome)) return 'receita'
    if (/^0?[24]/.test(conta) || /despesa|custo|passivo/i.test(nome)) return 'despesa'
    return null
  }

  return (
    <div className="space-y-3">
      <style>{`
        .mz-pub-row-sel td:not(.mz-pub-sticky-conta) { background-color: rgba(255, 180, 40, 0.12); }
        .mz-pub-sel-col { background-color: rgba(255, 180, 40, 0.12) !important; }
        .mz-pub-sel-cross-l { background-color: rgba(255, 180, 40, 0.35) !important; box-shadow: inset 0 2px 0 rgba(154,114,0,0.5), inset 2px 0 0 rgba(154,114,0,0.5), inset 0 -2px 0 rgba(154,114,0,0.5); }
        .mz-pub-sel-cross-r { background-color: rgba(255, 180, 40, 0.35) !important; box-shadow: inset 0 2px 0 rgba(154,114,0,0.5), inset -2px 0 0 rgba(154,114,0,0.5), inset 0 -2px 0 rgba(154,114,0,0.5); }
        .mz-pub-sticky-conta { position: sticky; left: 0; z-index: 15; background-color: #fff; box-shadow: 6px 0 10px -4px rgba(0,0,0,0.15); }
        .mz-pub-sticky-conta.mz-pub-cat-sel { background-color: rgba(255, 180, 40, 0.3); }
        .mz-pub-cat-sel { background-color: rgba(255, 180, 40, 0.3) !important; border-left: 3px solid #9a7200 !important; }
        .mz-pub-head-sel { background-color: rgba(255, 180, 40, 0.4) !important; }
      `}</style>
      <div className="relative max-w-xs">
        <input placeholder="Buscar conta..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-sky-400/30" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white" style={{ maxHeight: '70vh' }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b">
              <th rowSpan={2} className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500 cursor-pointer" style={{ minWidth: 280, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)' }} onClick={() => { setSelRow(null); setSelCol(null) }} title="Limpar destaque">Conta</th>
              {refs.map(ref => <th key={ref} colSpan={2} className={`px-1 py-2 text-center text-[10px] font-semibold uppercase text-gray-500 border-l border-gray-100 cursor-pointer select-none ${selCol === ref ? 'mz-pub-head-sel' : ''}`} onClick={() => setSelCol(prev => prev === ref ? null : ref)}>{MONTHS[Number(ref.slice(4)) - 1]}/{ref.slice(0, 4)}</th>)}
              <th colSpan={2} className="px-1 py-2 text-center text-[10px] font-bold uppercase text-gray-700 border-l-2 border-gray-200 bg-gray-100">Total</th>
            </tr>
            <tr className="bg-gray-50/80 border-b">
              {refs.map(ref => <React.Fragment key={`s-${ref}`}><th className="px-2 py-1 text-right text-[9px] font-medium text-gray-400 border-l border-gray-100" style={{ minWidth: 80 }}>Realizado</th><th className="px-1 py-1 text-right text-[9px] font-medium text-gray-400" style={{ minWidth: 40 }}>% A.V</th></React.Fragment>)}
              <th className="px-2 py-1 text-right text-[9px] font-bold text-gray-600 border-l-2 border-gray-200" style={{ minWidth: 90 }}>Realizado</th>
              <th className="px-1 py-1 text-right text-[9px] font-bold text-gray-600" style={{ minWidth: 40 }}>% A.V</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const indent = search ? 0 : row.level * 18
              const type = getType(row.conta, row.nomeConta)
              const valCls = type === 'receita' ? 'text-emerald-700' : type === 'despesa' ? 'text-red-800' : ''
              const isRowSel = selRow === row.id
              return (
                <tr key={row.id} className={`border-b border-gray-100 hover:bg-sky-50/30 ${row.level === 0 ? 'bg-gray-50/50' : ''} ${isRowSel ? 'mz-pub-row-sel' : ''}`}>
                  <td className={`mz-pub-sticky-conta px-3 py-1.5 whitespace-nowrap cursor-pointer ${isRowSel ? 'mz-pub-cat-sel' : ''}`} style={{ paddingLeft: `${12 + indent}px` }} onClick={() => setSelRow(prev => prev === row.id ? null : row.id)}>
                    <div className="flex items-center gap-1">
                      {row.hasChildren ? <button onClick={e => { e.stopPropagation(); toggleExpand(row.id) }} className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-gray-100 text-gray-400">{expanded.has(row.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</button> : <span className="w-4 shrink-0" />}
                      <span className={`truncate ${row.level === 0 ? 'font-semibold' : ''}`}>{row.nomeConta}</span>
                    </div>
                  </td>
                  {refs.map(ref => {
                    const cell = row.valores[ref] ?? { realizado: 0, pct_av: 0 }
                    const isColSel = selCol === ref
                    const isCross = isRowSel && isColSel
                    const hlL = isCross ? 'mz-pub-sel-cross-l' : isColSel ? 'mz-pub-sel-col' : ''
                    const hlR = isCross ? 'mz-pub-sel-cross-r' : isColSel ? 'mz-pub-sel-col' : ''
                    return (
                      <React.Fragment key={ref}>
                        <td className={`px-2 py-1.5 text-right tabular-nums border-l border-gray-50 cursor-pointer ${cell.realizado < 0 ? 'text-red-600' : valCls} ${row.level === 0 ? 'font-semibold' : ''} ${hlL}`} onClick={() => handleCellClick(row.id, ref)}>{fmtNum(cell.realizado)}</td>
                        <td className={`px-1 py-1.5 text-right tabular-nums text-gray-400 cursor-pointer ${cell.pct_av < 0 ? 'text-red-400' : ''} ${hlR}`} onClick={() => handleCellClick(row.id, ref)}>{fmtPct(cell.pct_av)}</td>
                      </React.Fragment>
                    )
                  })}
                  <td className={`px-2 py-1.5 text-right tabular-nums border-l-2 border-gray-200 bg-gray-50/30 font-semibold ${row.total.realizado < 0 ? 'text-red-600' : valCls}`}>{fmtNum(row.total.realizado)}</td>
                  <td className={`px-1 py-1.5 text-right tabular-nums bg-gray-50/30 text-gray-500 font-semibold ${row.total.pct_av < 0 ? 'text-red-400' : ''}`}>{fmtPct(row.total.pct_av)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Análise
   ═══════════════════════════════════════════════════════════════ */
function PubAnalise({ analise, ano }: { analise: any; ano: number }) {
  if (!analise) return <div className="rounded-lg border bg-white p-12 text-center text-gray-400"><Loader2 className="inline h-5 w-5 animate-spin mr-2" />Carregando análise...</div>

  const indicadores = analise.indicadoresHorizontais ?? {}
  const tipos = [
    { key: 'faturamento', label: 'Faturamento', color: ACCENT },
    { key: 'despesas_operacionais', label: 'Despesas', color: RED },
    { key: 'ebitda', label: 'EBITDA Técnico', color: GREEN },
    { key: 'lucro_liquido', label: 'Lucro Líquido', color: '#8b5cf6' },
  ]

  const chartData = MONTHS.map((label, i) => {
    const entry: Record<string, any> = { mes: label }
    tipos.forEach(t => { entry[t.key] = (indicadores[t.key] ?? []).find((d: any) => d.mes === i + 1)?.valor ?? 0 })
    return entry
  })
  const hasData = tipos.some(t => (indicadores[t.key] ?? []).length > 0)

  if (!hasData) return <div className="rounded-lg border bg-white p-12 text-center text-gray-400">Dados de análise indisponíveis para {ano}.</div>

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50"><h4 className="text-[13px] font-semibold text-gray-700">Evolução Mensal — {ano}</h4></div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => fmtCompact(v)} />
              <Tooltip formatter={(value: number, name: string) => [fmt(value), tipos.find(t => t.key === name)?.label ?? name]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs">{tipos.find(t => t.key === v)?.label ?? v}</span>} />
              {tipos.map(t => <Line key={t.key} type="monotone" dataKey={t.key} stroke={t.color} strokeWidth={2} dot={{ r: 3, fill: t.color }} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela resumo */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50"><h4 className="text-[13px] font-semibold text-gray-700">Resumo por Indicador</h4></div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Indicador</th>
                {MONTHS.map(m => <th key={m} className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">{m}</th>)}
                <th className="px-3 py-2 text-right text-[10px] font-bold uppercase text-gray-700 border-l-2 border-gray-200">Total</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map(t => {
                const dados = indicadores[t.key] ?? []
                const total = dados.reduce((s: number, d: any) => s + (d.valor ?? 0), 0)
                return (
                  <tr key={t.key} className="border-b hover:bg-gray-50/50">
                    <td className="px-3 py-2 font-medium" style={{ color: t.color }}>{t.label}</td>
                    {MONTHS.map((_, i) => {
                      const v = dados.find((d: any) => d.mes === i + 1)?.valor ?? 0
                      return <td key={i} className={`px-2 py-2 text-right tabular-nums ${v < 0 ? 'text-red-600' : ''}`}>{fmtCompact(v)}</td>
                    })}
                    <td className={`px-3 py-2 text-right tabular-nums font-bold border-l-2 border-gray-200 ${total < 0 ? 'text-red-600' : ''}`}>{fmt(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
