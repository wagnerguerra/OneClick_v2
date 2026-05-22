'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { Card, CardContent, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts'

const MODULE_COLOR = 'var(--mod-contabil, #8b5cf6)'

const MESES_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

const formatCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(value)

interface AnaliseData {
  dadosMensais?: Record<string, Array<{ periodo: string; mes: string; valor: number }>>
  indicadoresHorizontais?: Record<string, Array<{ mes: number; valor: number }>>
}

interface BiAnaliseProps {
  clienteId: string
  ano: number
  meses: number[]
}

export function BiAnalise({ clienteId, ano, meses }: BiAnaliseProps) {
  const [data, setData] = useState<AnaliseData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clienteId || !ano) return
    setLoading(true)

    const mesesParam = meses.length === 12 ? undefined : meses

    trpc.bi.balanceteAnalise.query({ clienteId, ano, meses: mesesParam })
      .then((result) => setData(result as AnaliseData))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [clienteId, ano, meses])

  // Dados para o grafico de barras empilhadas (analise vertical)
  const dm = data?.dadosMensais ?? {}
  const ind = data?.indicadoresHorizontais ?? {}
  const verticalChartData = MESES_LABELS.map((label, i) => {
    const mesNum = i + 1
    const mesStr = String(mesNum)
    const getVal = (tipo: string) => (dm[tipo] ?? []).find(d => Number(d.mes) === mesNum)?.valor ?? 0
    const getInd = (tipo: string) => (ind[tipo] ?? []).find(d => d.mes === mesNum)?.valor ?? 0
    return {
      mes: label,
      Receita: getVal('receita_bruta'),
      Custos: Math.abs(getVal('custo_das_vendas')),
      Despesas: getVal('despesas_operacionais'),
      Lucro: getInd('lucro_liquido'),
    }
  }).filter(d => d.Receita !== 0 || d.Custos !== 0 || d.Despesas !== 0 || d.Lucro !== 0)

  // Dados para gráfico de evolução mensal (linhas por indicador)
  const evolucaoData = MESES_LABELS.map((label, i) => {
    const mesNum = i + 1
    const entry: Record<string, any> = { mes: label }
    const tipos = ['faturamento', 'despesas_operacionais', 'ebitda', 'lucro_liquido']
    tipos.forEach(t => { entry[t] = (ind[t] ?? []).find((d: any) => d.mes === mesNum)?.valor ?? 0 })
    return entry
  }).filter(d => d.faturamento !== 0 || d.despesas_operacionais !== 0)

  const evolucaoSeries = [
    { key: 'faturamento', label: 'Faturamento', color: '#8b5cf6' },
    { key: 'despesas_operacionais', label: 'Despesas', color: '#ef4444' },
    { key: 'ebitda', label: 'EBITDA', color: '#10b981' },
    { key: 'lucro_liquido', label: 'Lucro Líquido', color: '#8b5cf6' },
  ]

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
        <p className="text-sm">Nenhum dado de analise disponivel</p>
        <p className="text-xs mt-1">Verifique se o balancete foi importado para este ano</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Composição Mensal - Barras agrupadas */}
      <Card className="border border-border/50">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
          <h4 className="text-[13px] font-semibold text-foreground">Composição Mensal</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">Receita, Custos, Despesas e Lucro por mês</p>
        </div>
        <CardContent className="p-4">
          {verticalChartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">Sem dados mensais</div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={verticalChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={v => formatCompact(v)} />
                <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
                <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey="Custos" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey="Despesas" fill="#f59e0b" radius={[4, 4, 0, 0]} opacity={0.85} />
                <Bar dataKey="Lucro" fill="#8b5cf6" radius={[4, 4, 0, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Evolução Mensal - Linhas */}
      <Card className="border border-border/50">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
          <h4 className="text-[13px] font-semibold text-foreground">Evolução Mensal</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">Faturamento, Despesas, EBITDA e Lucro Líquido</p>
        </div>
        <CardContent className="p-4">
          {evolucaoData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">Sem dados</div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={evolucaoData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} tickFormatter={v => formatCompact(v)} />
                <Tooltip formatter={(value: number, name: string) => [formatCurrency(value), evolucaoSeries.find(s => s.key === name)?.label ?? name]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs">{evolucaoSeries.find(s => s.key === v)?.label ?? v}</span>} />
                {evolucaoSeries.map(s => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 3, fill: s.color }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Resumo por Indicador */}
      <Card className="border border-border/50">
        <div className="px-5 py-3 border-b border-border/60 bg-muted/20">
          <h4 className="text-[13px] font-semibold text-foreground">Resumo por Indicador</h4>
        </div>
        <CardContent className="p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Indicador</th>
                  {MESES_LABELS.map(m => <th key={m} className="px-2 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">{m}</th>)}
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase text-foreground border-l-2 border-border/40">Total</th>
                </tr>
              </thead>
              <tbody>
                {evolucaoSeries.map(s => {
                  const dados = ind[s.key] ?? []
                  const total = dados.reduce((sum: number, d: any) => sum + (d.valor ?? 0), 0)
                  return (
                    <tr key={s.key} className="border-b hover:bg-muted/10">
                      <td className="px-3 py-2 font-medium" style={{ color: s.color }}>{s.label}</td>
                      {MESES_LABELS.map((_, i) => {
                        const v = dados.find((d: any) => d.mes === i + 1)?.valor ?? 0
                        return <td key={i} className={cn('px-2 py-2 text-right tabular-nums', v < 0 && 'text-red-600')}>{formatCompact(v)}</td>
                      })}
                      <td className={cn('px-3 py-2 text-right tabular-nums font-bold border-l-2 border-border/40', total < 0 && 'text-red-600')}>{formatCurrency(total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
