'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, cn, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@saas/ui'
import { useTheme } from '@/hooks/use-theme'
import { trpc } from '@/lib/trpc'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Line, LabelList, BarChart, Cell,
} from 'recharts'

const MODULE_COLOR = 'var(--mod-contabil, #8b5cf6)'
const COLOR_POSITIVO = '#16a34a'
const COLOR_NEGATIVO = '#dc2626'

const MESES_LABELS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

interface ResultadoNaturezaRow { conta: string; nome: string; valor: number; categoria: string }
interface AnaliseVerticalRow { label: string; valor: number; percentual: number; destaque?: string }
interface IndicadorMensal { mes: number; valor: number; variacao: number | null }

interface AnaliseData {
  resultadoPorNatureza?: ResultadoNaturezaRow[]
  analiseVerticalDre?: AnaliseVerticalRow[]
  indicadoresHorizontaisComVariacao?: Record<string, IndicadorMensal[]>
  indicadoresHorizontais?: Record<string, Array<{ mes: number; valor: number }>>
}

interface BiAnaliseProps {
  clienteId: string
  ano: number
  meses: number[]
}

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

const fmtCompact = (v: number) =>
  new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(v)

const fmtSigned = (v: number) => {
  const abs = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.abs(v))
  return v < 0 ? `-${abs}` : abs
}

const INDICADORES_OPCOES = [
  { value: 'faturamento',         label: 'Faturamento' },
  { value: 'despesas_operacionais', label: 'Despesas Operacionais' },
  { value: 'ebitda',              label: 'EBITDA' },
  { value: 'lucro_liquido',       label: 'Lucro Líquido' },
  { value: 'margem_contribuicao', label: 'Margem de Contribuição' },
]

export function BiAnalise({ clienteId, ano, meses }: BiAnaliseProps) {
  const [data, setData] = useState<AnaliseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [indicadorSel, setIndicadorSel] = useState('faturamento')
  const { theme } = useTheme()
  // Cor da linha de variação: preto no light, branco no dark (hex porque Recharts não interpreta CSS vars)
  const colorVariacao = theme === 'dark' ? '#ffffff' : '#000000'

  useEffect(() => {
    if (!clienteId || !ano) return
    setLoading(true)
    const mesesParam = meses.length === 12 ? undefined : meses
    trpc.bi.balanceteAnalise.query({ clienteId, ano, meses: mesesParam })
      .then((result) => setData(result as AnaliseData))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [clienteId, ano, meses])

  // Resultado por Natureza — barras horizontais
  const naturezaData = useMemo(() => {
    const rows = data?.resultadoPorNatureza ?? []
    return rows.map(r => ({
      ...r,
      valorAbs: Math.abs(r.valor),
      // cor por categoria (receita = verde, demais = vermelho)
      cor: r.categoria === 'RECEITA_BRUTA' || r.categoria === 'RECEITAS_FINANCEIRAS' ? COLOR_POSITIVO : COLOR_NEGATIVO,
    }))
  }, [data])

  // Análise Vertical — bars relativas (%)
  const verticalRows = data?.analiseVerticalDre ?? []
  const verticalReceitaLiq = verticalRows[0]?.valor || 1

  // Análise Horizontal — combo bar + line
  const horizontalData = useMemo(() => {
    const arr = data?.indicadoresHorizontaisComVariacao?.[indicadorSel] ?? []
    return MESES_LABELS.map((label, i) => {
      const row = arr.find(d => d.mes === i + 1)
      return {
        mes: label,
        valor: row?.valor ?? 0,
        variacao: row?.variacao ?? null,
      }
    })
  }, [data, indicadorSel])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-sm">Nenhum dado de análise disponível</p>
        <p className="text-xs mt-1">Verifique se o balancete foi importado para este ano</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ─────────── ESQUERDA: Resultado por Natureza ─────────── */}
      <Card className="border border-border/50 lg:row-span-2">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
          <h4 className="text-[13px] font-semibold text-foreground">Resultado por natureza</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">Top 10 contas categorizadas no DRE — ordenadas por valor absoluto</p>
        </div>
        <CardContent className="p-4">
          {naturezaData.length === 0 ? (
            <div className="flex items-center justify-center h-[600px] text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(400, naturezaData.length * 24)}>
              <BarChart data={naturezaData} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => fmtCompact(v)} />
                <YAxis
                  type="category"
                  dataKey="nome"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  width={160}
                  interval={0}
                />
                <Tooltip
                  formatter={(val: number) => [fmtCurrency(val), 'Valor']}
                  labelFormatter={(label) => label}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
                />
                <Bar dataKey="valorAbs" radius={[0, 4, 4, 0]}>
                  {naturezaData.map((row, i) => <Cell key={i} fill={row.cor} opacity={0.85} />)}
                  <LabelList
                    dataKey="valor"
                    position="right"
                    formatter={(v: number) => fmtCurrency(v)}
                    style={{ fontSize: 10, fill: 'var(--foreground)' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ─────────── DIREITA SUP: Análise Vertical (BarChart horizontal Recharts) ─────────── */}
      <Card className="border border-border/50">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
          <h4 className="text-[13px] font-semibold text-foreground">Análise vertical</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">Cada linha como % da Receita Líquida</p>
        </div>
        <CardContent className="p-4">
          <ResponsiveContainer width="100%" height={Math.max(280, verticalRows.length * 34 + 60)}>
            <BarChart
              data={verticalRows.map(r => ({
                label: r.label,
                // Largura proporcional ao |%| da receita líquida (cap em 100)
                pctAbs: Math.min(100, Math.abs((r.valor / verticalReceitaLiq) * 100)),
                valor: r.valor,
                percentual: r.percentual,
                isNeg: r.valor < 0,
                isReceita: r.label === 'RECEITA LÍQUIDA',
              }))}
              layout="vertical"
              margin={{ top: 24, right: 180, left: 0, bottom: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                orientation="top"
                ticks={[0, 25, 50, 75, 100]}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontWeight: 600 }}
                width={210}
                interval={0}
              />
              <Tooltip
                formatter={(_v: number, _name: string, item: { payload?: { valor: number; percentual: number } }) =>
                  [`${fmtSigned(item.payload?.valor ?? 0)} (${(item.payload?.percentual ?? 0).toFixed(2)}%)`, 'Valor']}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
              />
              <Bar dataKey="pctAbs" radius={[0, 4, 4, 0]} barSize={18}>
                {verticalRows.map((r, i) => (
                  <Cell
                    key={i}
                    fill={r.valor < 0 ? '#ef4444' : (r.label === 'RECEITA LÍQUIDA' ? '#16a34a' : '#22c55e')}
                    opacity={r.valor < 0 ? 0.75 : 0.9}
                  />
                ))}
                <LabelList
                  position="right"
                  content={(props: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; index?: number }) => {
                    const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props
                    const row = verticalRows[index]
                    if (!row) return null
                    const isNeg = row.valor < 0
                    return (
                      <text
                        x={Number(x) + Number(width) + 8}
                        y={Number(y) + Number(height) / 2 + 4}
                        fontSize={10}
                        fill={isNeg ? '#dc2626' : 'var(--foreground)'}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {`${fmtSigned(row.valor)} (${row.percentual.toFixed(2)}%)`}
                      </text>
                    )
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ─────────── DIREITA INF: Análise Horizontal ─────────── */}
      <Card className="border border-border/50">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20 flex items-center justify-between">
          <div>
            <h4 className="text-[13px] font-semibold text-foreground">Análise horizontal</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">Valor mensal + variação % vs mês anterior</p>
          </div>
          <Select value={indicadorSel} onValueChange={setIndicadorSel}>
            <SelectTrigger className="h-8 text-xs w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDICADORES_OPCOES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <CardContent className="p-4">
          {horizontalData.every(d => d.valor === 0) ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={horizontalData} margin={{ top: 28, right: 40, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={v => fmtCompact(v)} />
                <YAxis
                  yAxisId="right" orientation="right"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip
                  formatter={(val: number, name: string) => {
                    if (name === 'variacao') return [`${val !== null && val !== undefined ? val.toFixed(0) : '-'}%`, 'Variação Mensal']
                    return [fmtCurrency(val), 'Indicador Selecionado']
                  }}
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)' }}
                />
                <Bar yAxisId="left" dataKey="valor" fill={COLOR_POSITIVO} opacity={0.85} radius={[4, 4, 0, 0]}>
                  <LabelList
                    dataKey="valor"
                    position="top"
                    formatter={(v: number) => v !== 0 ? `R$ ${fmtCompact(v)}` : ''}
                    style={{ fontSize: 9, fill: 'var(--foreground)' }}
                  />
                </Bar>
                <Line
                  yAxisId="right" type="monotone" dataKey="variacao"
                  stroke={colorVariacao} strokeWidth={2}
                  dot={{ r: 3, fill: colorVariacao }}
                  connectNulls
                >
                  <LabelList
                    dataKey="variacao"
                    position="top"
                    formatter={(v: number | null) => v !== null && v !== undefined ? `${v.toFixed(0)}%` : ''}
                    style={{ fontSize: 9, fill: colorVariacao, fontWeight: 600 }}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: COLOR_POSITIVO }} />Indicador Selecionado</div>
            <div className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: colorVariacao }} />Variação Mensal</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
