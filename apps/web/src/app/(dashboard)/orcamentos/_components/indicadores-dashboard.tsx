'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send, ThumbsDown, Coins, CheckCircle2, FileDown, CalendarDays } from 'lucide-react'
import { Button, Card, Input, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { exportToExcel, type ExportColumn } from '@/lib/export-data'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

type IndicadoresData = inferRouterOutputs<AppRouter>['orcamento']['reportIndicadores']
type ListaItem = IndicadoresData['listas']['aprovados'][number]

function formatCurrency(v: number): string {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(iso: string | null): string {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return '—' }
}
function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function mesAnterior(): { ini: string; fim: string } {
  const now = new Date()
  return { ini: toIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), fim: toIso(new Date(now.getFullYear(), now.getMonth(), 0)) }
}

export function IndicadoresDashboard() {
  const router = useRouter()
  const def = mesAnterior()
  const [dataInicio, setDataInicio] = useState(def.ini)
  const [dataFim, setDataFim] = useState(def.fim)
  const [aplicado, setAplicado] = useState({ dataInicio: def.ini, dataFim: def.fim })
  const [data, setData] = useState<IndicadoresData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (di: string, df: string) => {
    setLoading(true)
    try { setData(await trpc.orcamento.reportIndicadores.query({ dataInicio: di, dataFim: df })) }
    catch { /* silent */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(aplicado.dataInicio, aplicado.dataFim) }, [load, aplicado])

  function consultar() {
    if (dataFim < dataInicio) { alerts.error('Datas inválidas', 'A Data Final deve ser igual ou posterior à Data Inicial.'); return }
    setAplicado({ dataInicio, dataFim })
  }

  function exportar() {
    if (!data) return
    const linhas = [
      ...data.listas.aprovados.map(o => ({ ...o, situacao: 'Aprovado' })),
      ...data.listas.liberados.map(o => ({ ...o, situacao: 'Liberado' })),
      ...data.listas.reprovados.map(o => ({ ...o, situacao: 'Reprovado' })),
    ].map(o => ({
      data: fmtData(o.data), numero: o.numero, cliente: o.cliente, tipo: o.tipo, situacao: o.situacao,
      itens: o.primeiroItem + (o.qtdExtra > 0 ? ` +${o.qtdExtra}` : ''), valor: o.valor,
    }))
    const cols: ExportColumn[] = [
      { header: 'Data', accessor: 'data' }, { header: 'Número', accessor: 'numero' },
      { header: 'Cliente', accessor: 'cliente' }, { header: 'Tipo', accessor: 'tipo' },
      { header: 'Situação', accessor: 'situacao' }, { header: 'Itens', accessor: 'itens' },
      { header: 'Valor', accessor: 'valor' },
    ]
    exportToExcel(linhas, cols, `orcamentos-indicadores-${aplicado.dataInicio}_a_${aplicado.dataFim}`)
  }

  return (
    <div className="space-y-4">
      {/* Filtro de intervalo de datas (default mês anterior) */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="h-8 w-[140px] text-xs bg-card border-0" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={dataFim} min={dataInicio} onChange={e => setDataFim(e.target.value)} className="h-8 w-[140px] text-xs bg-card border-0" />
          <Button size="sm" onClick={consultar} disabled={loading} className="h-8 gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }}>
            <CalendarDays className="h-3.5 w-3.5" /> Consultar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Não foi possível carregar os indicadores.</Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi label="Mensais Enviados" value={formatCurrency(data.kpis.enviadosMensal.valor)} sub={`De ${data.kpis.enviadosMensal.count} serviços mensais`} icon={Send} />
            <Kpi label="Extras Enviados" value={formatCurrency(data.kpis.enviadosExtra.valor)} sub={`De ${data.kpis.enviadosExtra.count} serviços extra`} icon={Send} />
            <Kpi label={`${data.kpis.aprovadosMensal.count} Mensa${data.kpis.aprovadosMensal.count === 1 ? 'l' : 'is'} Aprovado${data.kpis.aprovadosMensal.count === 1 ? '' : 's'}`} value={formatCurrency(data.kpis.aprovadosMensal.valor)} sub={`Taxa de conversão: ${data.kpis.conversaoMensal}%`} icon={CheckCircle2} cor="#10b981" />
            <Kpi label={`${data.kpis.aprovadosExtra.count} Extra${data.kpis.aprovadosExtra.count === 1 ? '' : 's'} Aprovado${data.kpis.aprovadosExtra.count === 1 ? '' : 's'}`} value={formatCurrency(data.kpis.aprovadosExtra.valor)} sub={`Taxa de conversão: ${data.kpis.conversaoExtra}%`} icon={CheckCircle2} cor="#10b981" />
            <Kpi label="Orçamentos Reprovados" value={formatCurrency(data.kpis.reprovados.valor)} sub={`${data.kpis.reprovados.count} orçamentos reprovados`} icon={ThumbsDown} cor="#ef4444" />
            <Kpi label="Total Enviados no Período" value={formatCurrency(data.kpis.totalEnviados.valor)} sub={`${data.kpis.totalEnviados.count} orçamentos enviados`} icon={Coins} />
            <Kpi label="Total Aprovados no Período" value={formatCurrency(data.kpis.totalAprovados.valor)} sub={`${data.kpis.totalAprovados.count} orçamentos aprovados`} icon={Coins} cor="#10b981" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            <DonutCard title="Aprovados / Liberados / Reprovados" slices={[
              { name: 'Aprovados', value: data.donutEstagios.aprovados, fill: '#10b981' },
              { name: 'Liberados', value: data.donutEstagios.liberados, fill: '#0ea5e9' },
              { name: 'Reprovados', value: data.donutEstagios.reprovados, fill: '#ef4444' },
            ]} />
            <DonutCard title="Serviço Mensal x Extra" slices={[
              { name: 'Mensal', value: data.donutTipo.mensal, fill: '#3b82f6' },
              { name: 'Extra', value: data.donutTipo.extra, fill: '#f59e0b' },
            ]} />
            <Card className="xl:col-span-2 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                <h3 className="text-sm font-semibold">Aprovados, Liberados e Reprovados</h3>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={exportar}>
                  <FileDown className="h-3.5 w-3.5" /> Exportar Excel
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0 divide-y md:divide-y-0 md:divide-x divide-border/50">
                <ListaColuna titulo="Aprovados" cor="emerald" itens={data.listas.aprovados} router={router} />
                <ListaColuna titulo="Liberados" cor="sky" itens={data.listas.liberados} router={router} />
                <ListaColuna titulo="Reprovados" cor="rose" itens={data.listas.reprovados} router={router} />
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4">Acompanhamento dos últimos 12 meses — Mensais x Extras</h3>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={data.serie12m}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} orçamentos`, '']} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="mensal" name="Mensal" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="extra" name="Extra" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, sub, icon: Icon, cor = MODULE_COLOR }: { label: string; value: string; sub: string; icon: typeof Send; cor?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-xl font-bold leading-tight" style={{ color: cor === MODULE_COLOR ? undefined : cor }}>{value}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
        </div>
        <div className="h-9 w-9 shrink-0 rounded-md flex items-center justify-center" style={{ backgroundColor: `${cor}18` }}>
          <Icon className="h-5 w-5" style={{ color: cor }} />
        </div>
      </div>
    </Card>
  )
}

function DonutCard({ title, slices }: { title: string; slices: { name: string; value: number; fill: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  return (
    <Card className="flex flex-col">
      <div className="border-b border-border/60 px-4 py-3"><h3 className="text-sm font-semibold">{title}</h3></div>
      <div className="flex-1 p-3">
        {total === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">Sem dados no período</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={48} label={({ value }) => `${value}`}>
                {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

const COR_BADGE: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  sky: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
}
const COR_TITULO: Record<string, string> = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  sky: 'text-sky-600 dark:text-sky-400',
  rose: 'text-rose-600 dark:text-rose-400',
}

function ListaColuna({ titulo, cor, itens, router }: { titulo: string; cor: 'emerald' | 'sky' | 'rose'; itens: ListaItem[]; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="p-3">
      <h4 className={cn('text-sm font-semibold mb-2', COR_TITULO[cor])}>{titulo} ({itens.length})</h4>
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-4 text-center">Nenhum no período</p>
      ) : (
        <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
          {itens.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => router.push(`/orcamentos/${o.id}`)}
              className="w-full text-left flex items-center gap-2.5 rounded-md border border-border/60 p-2 hover:bg-muted/40 transition-colors"
            >
              <span className={cn('shrink-0 rounded-md px-2 py-1 text-[11px] font-bold tabular-nums', COR_BADGE[cor])}>{o.numero}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] text-muted-foreground">{fmtData(o.data)} · {o.tipo}</span>
                <span className="block text-[13px] font-medium truncate">{o.cliente}</span>
                {o.primeiroItem && (
                  <span className="block text-[10px] text-muted-foreground truncate">
                    {o.primeiroItem}{o.qtdExtra > 0 ? ` +${o.qtdExtra}` : ''}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums">{formatCurrency(o.valor)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
