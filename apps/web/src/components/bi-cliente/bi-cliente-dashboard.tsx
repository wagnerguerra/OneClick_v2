'use client'

/**
 * Dashboard Financeiro do CLIENTE — a tela, sem saber de onde vêm os dados.
 *
 * Duas portas levam a ela, com portões diferentes:
 *
 *  - o LINK público (`/bi-public?token=…`), em que o token é a autorização;
 *  - o PORTAL do cliente (`/portal/bi`), em que a pessoa está logada e passa
 *    pelo módulo `bi` da empresa e pela permissão `podeVerBi` dela.
 *
 * A tela é a mesma nas duas, e por isso mora aqui. O que muda é a `fonte`:
 * quatro funções que buscam os dados pela porta certa. Manter duas cópias da
 * tela seria garantir que uma delas ficasse para trás na próxima correção —
 * como o filtro de meses, que já teve de ser feito duas vezes.
 *
 * ## Padrão visual
 *
 * LuminAux, como o resto do v2: Plus Jakarta Sans (global), hierarquia por
 * PESO e COR, títulos compactos, `rounded-lg`, superfícies `bg-card` sobre
 * `bg-background`, tudo em tokens — funciona no claro e no escuro.
 */

import React, { useState, useEffect, useMemo } from 'react'
import { cn } from '@saas/ui'
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, Receipt, Wallet,
  Table as TableIcon, Loader2, Plus, Minus,
} from 'lucide-react'
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts'

/** De onde a tela tira os dados. Cada porta de entrada fornece a sua. */
export interface FonteBiCliente {
  /**
   * Muda quando o CLIENTE muda — é o que dispara a recarga. No portal, trocar
   * de empresa no seletor troca a chave; depender da identidade do objeto
   * recarregaria a cada render.
   */
  chave: string
  anos(): Promise<number[]>
  kpis(ano: number, meses?: string): Promise<unknown>
  analise(ano: number, meses?: string): Promise<unknown>
  matriz(ano: number): Promise<unknown>
}

/* ── helpers ── */
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtNum = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtCompact = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)
const fmtPct = (v: number) => Number.isFinite(v) ? `${v}%` : ''

/** Cores de DADO (série de gráfico), não de interface. A interface usa tokens. */
const ACCENT = '#0ea5e9'
const GREEN = '#10b981'
const RED = '#ef4444'
const AMBER = '#f59e0b'
const VIOLET = '#8b5cf6'
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const TODOS_OS_MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** Eixos e grade saem dos tokens — é o que faz o gráfico existir no dark mode. */
const EIXO = { fontSize: 11, fill: 'var(--color-muted-foreground)' }
const GRADE = 'var(--color-border)'

type Tab = 'visao-geral' | 'matriz' | 'analise'

/** Superfície padrão: um cartão. Uma classe só, para os cartões não divergirem. */
const CARD = 'rounded-lg border border-border bg-card'
/** Cabeçalho de cartão — título compacto, peso 600, sem caixa alta. */
const CARD_HEAD = 'flex items-center gap-2 border-b border-border px-5 py-3 text-[13px] font-semibold text-foreground'

export function BiClienteDashboard({ fonte }: { fonte: FonteBiCliente }) {
  const [tab, setTab] = useState<Tab>('visao-geral')
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[] | null>(null)
  const [anosSelecionados, setAnosSelecionados] = useState<number[]>([])
  const ano = anosSelecionados[0] ?? new Date().getFullYear() // ano principal

  const [meses, setMeses] = useState<number[]>(TODOS_OS_MESES)
  const mesesParam = meses.length === 12 ? undefined : meses.join(',')

  const [kpisByAno, setKpisByAno] = useState<Record<number, any>>({})
  const [analiseByAno, setAnaliseByAno] = useState<Record<number, any>>({})
  const [matriz, setMatriz] = useState<any>(null)

  const toggleAno = (a: number) => {
    setAnosSelecionados(prev => {
      if (prev.includes(a)) { const next = prev.filter(x => x !== a); return next.length === 0 ? [a] : next }
      return [...prev, a].sort((x, y) => y - x)
    })
  }

  /** Desmarcar o último mês deixaria a tela vazia sem explicar por quê. */
  const toggleMes = (m: number) => {
    setMeses(prev => {
      if (prev.includes(m)) { const next = prev.filter(x => x !== m); return next.length === 0 ? [m] : next }
      return [...prev, m].sort((a, b) => a - b)
    })
  }

  // Anos com balancete — recomeça do zero quando o cliente muda.
  useEffect(() => {
    let cancelado = false
    setAnosDisponiveis(null)
    setKpisByAno({}); setAnaliseByAno({}); setMatriz(null)
    fonte.anos()
      .then(anos => {
        if (cancelado) return
        setAnosDisponiveis(anos)
        setAnosSelecionados(anos.length > 0 ? [anos[0]!] : [])
      })
      .catch(() => { if (!cancelado) setAnosDisponiveis([]) })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte.chave])

  // KPIs + análise dos anos escolhidos
  useEffect(() => {
    if (anosSelecionados.length === 0) return
    let cancelado = false
    Promise.all(
      anosSelecionados.map(async a => {
        const [k, an] = await Promise.all([
          fonte.kpis(a, mesesParam).catch(() => null),
          fonte.analise(a, mesesParam).catch(() => null),
        ])
        return { ano: a, kpis: k, analise: an }
      }),
    ).then(results => {
      if (cancelado) return
      const km: Record<number, any> = {}
      const am: Record<number, any> = {}
      for (const r of results) { if (r.kpis) km[r.ano] = r.kpis; if (r.analise) am[r.ano] = r.analise }
      setKpisByAno(km)
      setAnaliseByAno(am)
    })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte.chave, anosSelecionados, mesesParam])

  // Matriz — só quando a aba abre
  useEffect(() => {
    if (tab !== 'matriz' || anosSelecionados.length === 0) return
    let cancelado = false
    fonte.matriz(ano).then(m => { if (!cancelado) setMatriz(m) }).catch(() => {})
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonte.chave, tab, ano, anosSelecionados.length])

  const kpis = kpisByAno[ano] ?? null
  const analise = analiseByAno[ano] ?? null

  if (anosDisponiveis === null) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  }
  if (anosDisponiveis.length === 0) {
    return (
      <div className={cn(CARD, 'flex flex-col items-center gap-2 px-6 py-14 text-center')}>
        <BarChart3 className="h-9 w-9 text-muted-foreground/60" />
        <p className="text-sm font-semibold text-foreground">Ainda não há balancete importado</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Os números aparecem aqui assim que o escritório importar o primeiro balancete da empresa.
        </p>
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: 'visao-geral', label: 'Visão Geral', icon: BarChart3 },
    { id: 'matriz', label: 'Matriz de Resultados', icon: TableIcon },
    { id: 'analise', label: 'Análise', icon: TrendingUp },
  ]

  return (
    <div className="space-y-5">
      {/* ── Filtros e abas, num cartão só ── */}
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Ano</span>
            <div className="flex flex-wrap gap-1">
              {anosDisponiveis.map(a => (
                <Chip key={a} ativo={anosSelecionados.includes(a)} onClick={() => toggleAno(a)}>{a}</Chip>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Meses</span>
            <div className="flex flex-wrap gap-1">
              {MONTHS.map((label, i) => (
                <Chip key={label} ativo={meses.includes(i + 1)} onClick={() => toggleMes(i + 1)}>{label}</Chip>
              ))}
            </div>
          </div>

          {meses.length < 12 && (
            <button
              type="button"
              onClick={() => setMeses(TODOS_OS_MESES)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Selecionar todos
            </button>
          )}
        </div>

        <div className="flex gap-0 overflow-x-auto border-t border-border px-2 sm:px-3">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'visao-geral' && <PubVisaoGeral kpis={kpis} analiseByAno={analiseByAno} kpisByAno={kpisByAno} anos={anosSelecionados} meses={meses} />}
      {tab === 'matriz' && <PubMatriz data={matriz} />}
      {tab === 'analise' && <PubAnalise analise={analise} ano={ano} meses={meses} />}
    </div>
  )
}

/** Pílula de filtro — ano e mês usam a mesma, para o olho ler as duas do mesmo jeito. */
function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
        ativo
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Os meses escolhidos, na ordem do calendário. */
function useMesesVisiveis(meses: number[]) {
  return useMemo(
    () => MONTHS.map((label, i) => ({ label, mes: i + 1 })).filter(m => meses.length === 0 || meses.includes(m.mes)),
    [meses],
  )
}

/** Tooltip dos gráficos — em cartão do tema, não num branco cravado. */
function ChartCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md">{children}</div>
}

/* ═══════════════════════════════════════════════════════════════
   Visão Geral
   ═══════════════════════════════════════════════════════════════ */
const ANO_COLORS = [ACCENT, AMBER, VIOLET, '#ec4899']

function PubVisaoGeral({ kpis, analiseByAno, kpisByAno, anos, meses }: { kpis: any; analiseByAno: Record<number, any>; kpisByAno: Record<number, any>; anos: number[]; meses: number[] }) {
  const isComparativo = anos.length > 1
  const [indicador, setIndicador] = useState('faturamento')
  const mesesVisiveis = useMesesVisiveis(meses)

  const INDICADORES = [
    { value: 'faturamento', label: 'Faturamento' },
    { value: 'despesas_operacionais', label: 'Despesas Operacionais' },
    { value: 'ebitda', label: 'EBITDA' },
    { value: 'lucro_liquido', label: 'Lucro Líquido' },
    { value: 'margem_contribuicao', label: 'Margem de Contribuição' },
  ]

  const cards = kpis ? [
    { label: 'Receita Bruta', value: kpis.receitaBruta ?? 0, icon: DollarSign, color: GREEN, subtitle: `Líquida: ${fmt(kpis.receitaLiquida ?? 0)}` },
    { label: 'Custos Fixos', value: Math.abs(kpis.custosFixos ?? 0), icon: Receipt, color: RED, subtitle: `Lucro Bruto: ${fmt(kpis.lucroBruto ?? 0)}` },
    { label: 'Despesas', value: Math.abs(kpis.despesasOperacionais ?? 0), icon: Wallet, color: AMBER, subtitle: `EBITDA: ${fmt(kpis.ebitda ?? 0)}` },
    { label: 'Lucro Líquido', value: kpis.lucroLiquido ?? 0, icon: BarChart3, color: ACCENT, negative: true, subtitle: `Margem: ${(kpis.margemLiquida ?? 0).toFixed(1)}%` },
  ] : []

  const chartData = mesesVisiveis.map(({ label, mes }) => {
    const entry: Record<string, any> = { mes: label }
    for (const a of anos) {
      const indData = analiseByAno[a]?.indicadoresHorizontais?.[indicador] ?? []
      entry[`valor_${a}`] = indData.find((d: any) => d.mes === mes)?.valor ?? 0
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

  const barCustosDespesas = mesesVisiveis.map(({ label, mes }) => {
    const m = (kpis?.mesesCustosDespesas ?? []).find((x: any) => x.mes === mes)
    return { mes: label, custos: m?.custosFixos ?? 0, despesas: m?.despesas ?? 0 }
  })

  // Fontes
  const fontesReceita = (kpis?.fontesReceita ?? []).slice(0, 5)
  const fontesDespesas = (kpis?.fontesDespesas ?? []).slice(0, 5)

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className={cn(CARD, 'border-l-4 p-5')} style={{ borderLeftColor: c.color }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className={cn('text-xl font-bold tabular-nums', c.negative && c.value < 0 ? 'text-destructive' : 'text-foreground')}>{fmt(c.value)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{c.subtitle}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: c.color + '1f' }}>
                <c.icon className="h-5 w-5" style={{ color: c.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparativo entre Anos */}
      {isComparativo && Object.keys(kpisByAno).length > 1 && (
        <div className={cn(CARD, 'overflow-hidden')}>
          <div className={CARD_HEAD}>Comparativo entre anos</div>
          <div className="overflow-x-auto p-4">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Indicador</th>
                  {anos.map((a, i) => <th key={a} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider" style={{ color: ANO_COLORS[i % ANO_COLORS.length] }}>{a}</th>)}
                  {anos.length === 2 && <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Variação</th>}
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
                    <tr key={row.key} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2 font-medium text-foreground">{row.label}</td>
                      {vals.map((v, i) => <td key={i} className={cn('px-3 py-2 text-right font-semibold tabular-nums', v < 0 && 'text-destructive')}>{row.pct ? `${v.toFixed(1)}%` : fmt(v)}</td>)}
                      {variacao !== null && <td className={cn('px-3 py-2 text-right font-bold tabular-nums', variacao > 0 ? 'text-emerald-600 dark:text-emerald-400' : variacao < 0 && 'text-destructive')}>{variacao > 0 ? '+' : ''}{variacao.toFixed(1)}%</td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gráfico principal + fontes */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className={cn(CARD, 'overflow-hidden')}>
          <div className={CARD_HEAD}>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">Resultado no período {isComparativo ? '× ano anterior' : ''}</span>
            <select
              value={indicador}
              onChange={e => setIndicador(e.target.value)}
              className="h-8 max-w-[190px] shrink-0 rounded-lg border border-border bg-card px-2 text-xs font-normal text-foreground"
            >
              {INDICADORES.map(ind => <option key={ind.value} value={ind.value}>{ind.label}</option>)}
            </select>
          </div>
          <div className="p-4">
            {!hasChartData ? (
              <div className="flex h-[380px] items-center justify-center text-sm text-muted-foreground">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={chartData} margin={{ top: 25, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRADE} opacity={0.5} />
                  <XAxis dataKey="mes" tick={EIXO} axisLine={{ stroke: GRADE }} />
                  <YAxis yAxisId="left" tick={EIXO} tickFormatter={v => fmtCompact(v)} axisLine={{ stroke: GRADE }} />
                  {isComparativo && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--color-foreground)' }} tickFormatter={v => `${Number(v).toFixed(0)}%`} axisLine={{ stroke: AMBER }} />}
                  <Tooltip
                    cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload) return null
                      return (
                        <ChartCard>
                          <p className="mb-1 text-xs font-semibold">{label}</p>
                          {payload.filter((p: any) => p.dataKey !== 'variacao').map((p: any, i: number) => (
                            <p key={i} className="text-[11px]" style={{ color: p.color }}>{String(p.dataKey).replace('valor_', '')}: <span className="font-semibold">{fmt(p.value)}</span></p>
                          ))}
                          {isComparativo && payload.find((p: any) => p.dataKey === 'variacao') && (
                            <p className="mt-1 border-t border-border pt-1 text-[11px]">Variação: <span className="font-semibold">{Number(payload.find((p: any) => p.dataKey === 'variacao')?.value ?? 0).toFixed(1)}%</span></p>
                          )}
                        </ChartCard>
                      )
                    }}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={v => (
                    <span className="text-xs text-foreground">{v === 'variacao' ? 'Variação %' : String(v).replace('valor_', '')}</span>
                  )} />
                  {anos.map((a, idx) => (
                    <Bar key={`valor_${a}`} dataKey={`valor_${a}`} yAxisId="left" fill={isComparativo ? ANO_COLORS[idx % ANO_COLORS.length] : ACCENT} radius={[4, 4, 0, 0]} opacity={isComparativo ? 0.7 + idx * 0.1 : 0.85} name={`valor_${a}`}>
                      <LabelList dataKey={`valor_${a}`} content={({ x, y, width, value }: any) => value ? <text x={x + width / 2} y={y - 4} fill="var(--color-muted-foreground)" textAnchor="middle" fontSize={9}>{fmtCompact(value)}</text> : null} />
                    </Bar>
                  ))}
                  {isComparativo && <Line type="monotone" dataKey="variacao" yAxisId="right" stroke="var(--color-foreground)" strokeWidth={2} dot={{ fill: 'var(--color-foreground)', r: 3 }} name="variacao" />}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Fontes */}
        <div className="flex flex-col gap-4">
          <Fontes titulo="Fontes de receita" icone={<TrendingUp className="h-3.5 w-3.5" style={{ color: GREEN }} />} itens={fontesReceita} cor={GREEN} />
          <Fontes titulo="Fontes de despesas" icone={<TrendingDown className="h-3.5 w-3.5" style={{ color: RED }} />} itens={fontesDespesas} cor={RED} />
        </div>
      </div>

      {/* % Custos x Despesas */}
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className={CARD_HEAD}>% custos fixos × despesas operacionais</div>
        <div className="p-4">
          {donutData.length === 0 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <div className="flex flex-col gap-6 lg:flex-row" style={{ minHeight: 280 }}>
              <div className="flex flex-col items-center justify-center lg:w-[30%]">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                      label={({ cx, cy, midAngle, innerRadius, outerRadius, value }: any) => {
                        const R = Math.PI / 180; const r = innerRadius + (outerRadius - innerRadius) * 0.5
                        return <text x={cx + r * Math.cos(-midAngle * R)} y={cy + r * Math.sin(-midAngle * R)} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>{`${value}%`}</text>
                      }} labelLine={false}>
                      <Cell fill={GREEN} /><Cell fill={RED} />
                    </Pie>
                    <Tooltip content={({ active, payload }: any) => active && payload?.[0]
                      ? <ChartCard><p className="text-[11px]">{payload[0].name}: <span className="font-semibold">{payload[0].value}%</span></p></ChartCard>
                      : null} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-1 flex w-full flex-col gap-2">
                  <LinhaTotal cor={GREEN} rotulo="Custos Fixos" valor={totalCustos} />
                  <LinhaTotal cor={RED} rotulo="Despesas Op." valor={totalDespesas} />
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <span className="text-[11px] font-medium text-foreground">Total</span>
                    <span className="text-[11px] font-bold tabular-nums text-foreground">{fmt(totalCustos + totalDespesas)}</span>
                  </div>
                </div>
              </div>
              <div className="lg:w-[70%]">
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={barCustosDespesas} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRADE} opacity={0.5} />
                    <XAxis dataKey="mes" tick={EIXO} axisLine={{ stroke: GRADE }} />
                    <YAxis tick={EIXO} tickFormatter={v => fmtCompact(v)} axisLine={{ stroke: GRADE }} />
                    <Tooltip
                      cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
                      content={({ active, payload, label }: any) => active && payload?.length
                        ? (
                          <ChartCard>
                            <p className="mb-1 text-xs font-semibold">{label}</p>
                            {payload.map((p: any, i: number) => (
                              <p key={i} className="text-[11px]" style={{ color: p.color }}>{p.dataKey === 'custos' ? 'Custos Fixos' : 'Despesas Op.'}: <span className="font-semibold">{fmt(Number(p.value))}</span></p>
                            ))}
                          </ChartCard>
                        )
                        : null}
                    />
                    <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs text-foreground">{v === 'custos' ? 'Custos Fixos' : 'Despesas Op.'}</span>} />
                    <Bar dataKey="custos" stackId="a" fill={GREEN} opacity={0.85} />
                    <Bar dataKey="despesas" stackId="a" fill={RED} opacity={0.85} radius={[4, 4, 0, 0]} />
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

function LinhaTotal({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-2 text-[11px] text-foreground">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cor }} />
        <span className="font-medium">{rotulo}</span>
      </div>
      <span className="text-[11px] font-bold tabular-nums text-foreground">{fmt(valor)}</span>
    </div>
  )
}

function Fontes({ titulo, icone, itens, cor }: { titulo: string; icone: React.ReactNode; itens: any[]; cor: string }) {
  const max = itens.length > 0 ? Math.max(...itens.map((x: any) => Math.abs(x.valor))) : 0
  return (
    <div className={cn(CARD, 'flex-1 overflow-hidden')}>
      <div className={cn(CARD_HEAD, 'text-[12px]')}>{icone}{titulo}</div>
      <div className="space-y-1.5 p-3">
        {itens.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Sem dados</p>
        ) : itens.map((f: any, i: number) => (
          <div key={f.contaLonga} className="rounded-lg border border-border px-2.5 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-[12px] text-foreground">{f.nomeConta}</span>
              <span className="shrink-0 text-[12px] font-bold tabular-nums text-foreground">{fmt(f.valor)}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${max > 0 ? (Math.abs(f.valor) / max) * 100 : 0}%`, backgroundColor: cor, opacity: 1 - i * 0.15 }} />
            </div>
          </div>
        ))}
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

  if (!data?.rows?.length) return <div className={cn(CARD, 'p-12 text-center text-muted-foreground')}><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Carregando matriz...</div>

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
        .mz-pub-sticky-conta { position: sticky; left: 0; z-index: 15; background-color: var(--color-card); box-shadow: 6px 0 10px -4px rgba(0,0,0,0.15); }
        .mz-pub-sticky-conta.mz-pub-cat-sel { background-color: rgba(255, 180, 40, 0.3); }
        .mz-pub-cat-sel { background-color: rgba(255, 180, 40, 0.3) !important; border-left: 3px solid #9a7200 !important; }
        .mz-pub-head-sel { background-color: rgba(255, 180, 40, 0.4) !important; }
      `}</style>
      <div className="relative max-w-xs">
        <input
          placeholder="Buscar conta..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <div className={cn(CARD, 'overflow-x-auto')} style={{ maxHeight: '70vh' }}>
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-border bg-muted/80">
              <th rowSpan={2} className="sticky left-0 z-20 cursor-pointer bg-muted px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ minWidth: 280, boxShadow: '4px 0 8px -4px rgba(0,0,0,0.1)' }} onClick={() => { setSelRow(null); setSelCol(null) }} title="Limpar destaque">Conta</th>
              {refs.map(ref => <th key={ref} colSpan={2} className={cn('cursor-pointer select-none border-l border-border/40 px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground', selCol === ref && 'mz-pub-head-sel')} onClick={() => setSelCol(prev => prev === ref ? null : ref)}>{MONTHS[Number(ref.slice(4)) - 1]}/{ref.slice(0, 4)}</th>)}
              <th colSpan={2} className="border-l-2 border-border px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-foreground">Total</th>
            </tr>
            <tr className="border-b border-border bg-muted/60">
              {refs.map(ref => <React.Fragment key={`s-${ref}`}><th className="border-l border-border/30 px-2 py-1 text-right text-[9px] font-medium text-muted-foreground" style={{ minWidth: 80 }}>Realizado</th><th className="px-1 py-1 text-right text-[9px] font-medium text-muted-foreground" style={{ minWidth: 40 }}>% A.V</th></React.Fragment>)}
              <th className="border-l-2 border-border px-2 py-1 text-right text-[9px] font-bold text-foreground" style={{ minWidth: 90 }}>Realizado</th>
              <th className="px-1 py-1 text-right text-[9px] font-bold text-foreground" style={{ minWidth: 40 }}>% A.V</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const indent = search ? 0 : row.level * 18
              const type = getType(row.conta, row.nomeConta)
              const valCls = type === 'receita' ? 'text-emerald-600 dark:text-emerald-400' : type === 'despesa' ? 'text-red-600 dark:text-red-400' : ''
              const isRowSel = selRow === row.id
              return (
                <tr key={row.id} className={cn('border-b border-border/40 hover:bg-muted/30', row.level === 0 && 'bg-muted/20', isRowSel && 'mz-pub-row-sel')}>
                  <td className={cn('mz-pub-sticky-conta cursor-pointer whitespace-nowrap px-3 py-1.5 text-foreground', isRowSel && 'mz-pub-cat-sel')} style={{ paddingLeft: `${12 + indent}px` }} onClick={() => setSelRow(prev => prev === row.id ? null : row.id)}>
                    <div className="flex items-center gap-1">
                      {row.hasChildren ? <button onClick={e => { e.stopPropagation(); toggleExpand(row.id) }} className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted">{expanded.has(row.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}</button> : <span className="w-4 shrink-0" />}
                      <span className={cn('truncate', row.level === 0 && 'font-semibold')}>{row.nomeConta}</span>
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
                        <td className={cn('cursor-pointer border-l border-border/20 px-2 py-1.5 text-right tabular-nums', cell.realizado < 0 ? 'text-destructive' : valCls, row.level === 0 && 'font-semibold', hlL)} onClick={() => handleCellClick(row.id, ref)}>{fmtNum(cell.realizado)}</td>
                        <td className={cn('cursor-pointer px-1 py-1.5 text-right tabular-nums text-muted-foreground', cell.pct_av < 0 && 'text-destructive', hlR)} onClick={() => handleCellClick(row.id, ref)}>{fmtPct(cell.pct_av)}</td>
                      </React.Fragment>
                    )
                  })}
                  <td className={cn('border-l-2 border-border bg-muted/20 px-2 py-1.5 text-right font-semibold tabular-nums', row.total.realizado < 0 ? 'text-destructive' : valCls)}>{fmtNum(row.total.realizado)}</td>
                  <td className={cn('bg-muted/20 px-1 py-1.5 text-right font-semibold tabular-nums text-muted-foreground', row.total.pct_av < 0 && 'text-destructive')}>{fmtPct(row.total.pct_av)}</td>
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
function PubAnalise({ analise, ano, meses }: { analise: any; ano: number; meses: number[] }) {
  const mesesVisiveis = useMesesVisiveis(meses)

  const tipos = [
    { key: 'faturamento', label: 'Faturamento', color: ACCENT },
    { key: 'despesas_operacionais', label: 'Despesas', color: RED },
    { key: 'ebitda', label: 'EBITDA', color: GREEN },
    { key: 'lucro_liquido', label: 'Lucro Líquido', color: VIOLET },
  ]

  const indicadores = analise?.indicadoresHorizontais ?? {}
  const chartData = mesesVisiveis.map(({ label, mes }) => {
    const entry: Record<string, any> = { mes: label }
    tipos.forEach(t => { entry[t.key] = (indicadores[t.key] ?? []).find((d: any) => d.mes === mes)?.valor ?? 0 })
    return entry
  })
  const hasData = tipos.some(t => (indicadores[t.key] ?? []).length > 0)

  if (!analise) return <div className={cn(CARD, 'p-12 text-center text-muted-foreground')}><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Carregando análise...</div>
  if (!hasData) return <div className={cn(CARD, 'p-12 text-center text-muted-foreground')}>Dados de análise indisponíveis para {ano}.</div>

  return (
    <div className="space-y-5">
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className={CARD_HEAD}>Evolução mensal — {ano}</div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRADE} opacity={0.5} />
              <XAxis dataKey="mes" tick={EIXO} axisLine={{ stroke: GRADE }} />
              <YAxis tick={EIXO} tickFormatter={v => fmtCompact(v)} axisLine={{ stroke: GRADE }} />
              <Tooltip
                cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
                content={({ active, payload, label }: any) => active && payload?.length
                  ? (
                    <ChartCard>
                      <p className="mb-1 text-xs font-semibold">{label}</p>
                      {payload.map((p: any, i: number) => (
                        <p key={i} className="text-[11px]" style={{ color: p.color }}>{tipos.find(t => t.key === p.dataKey)?.label ?? p.dataKey}: <span className="font-semibold">{fmt(Number(p.value))}</span></p>
                      ))}
                    </ChartCard>
                  )
                  : null}
              />
              <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs text-foreground">{tipos.find(t => t.key === v)?.label ?? v}</span>} />
              {tipos.map(t => <Line key={t.key} type="monotone" dataKey={t.key} stroke={t.color} strokeWidth={2} dot={{ r: 3, fill: t.color }} />)}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabela resumo */}
      <div className={cn(CARD, 'overflow-hidden')}>
        <div className={CARD_HEAD}>Resumo por indicador</div>
        <div className="overflow-x-auto p-4">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Indicador</th>
                {mesesVisiveis.map(m => <th key={m.label} className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{m.label}</th>)}
                <th className="border-l-2 border-border px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map(t => {
                const dados = indicadores[t.key] ?? []
                // O total acompanha o filtro: somar os doze meses embaixo de uma
                // linha que mostra três seria uma conta que não fecha na tela.
                const total = mesesVisiveis.reduce((s, m) => s + (dados.find((d: any) => d.mes === m.mes)?.valor ?? 0), 0)
                return (
                  <tr key={t.key} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-2 font-medium" style={{ color: t.color }}>{t.label}</td>
                    {mesesVisiveis.map(m => {
                      const v = dados.find((d: any) => d.mes === m.mes)?.valor ?? 0
                      return <td key={m.mes} className={cn('px-2 py-2 text-right tabular-nums text-foreground', v < 0 && 'text-destructive')}>{fmtCompact(v)}</td>
                    })}
                    <td className={cn('border-l-2 border-border px-3 py-2 text-right font-bold tabular-nums text-foreground', total < 0 && 'text-destructive')}>{fmt(total)}</td>
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
