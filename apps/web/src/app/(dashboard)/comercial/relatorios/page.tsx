'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Filter, Megaphone, Target, Send, CheckCircle2, FileCheck, BarChart3, DollarSign, Users, Percent, Landmark, Repeat, Zap, Users2, Trophy, TicketPercent, Scissors, Wallet, TrendingDown } from 'lucide-react'
import { Card, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, Avatar, AvatarImage, AvatarFallback, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'
const COR_RECORRENTE = '#34d399'
const COR_AVULSO = '#fbbf24'

type FunilData = inferRouterOutputs<AppRouter>['orcamento']['reportFunilComercial']
type MrrData = inferRouterOutputs<AppRouter>['orcamento']['reportMrrAvulso']
type VendedoresData = inferRouterOutputs<AppRouter>['orcamento']['reportRankingVendedores']
type DescontosData = inferRouterOutputs<AppRouter>['orcamento']['reportDescontosMargem']

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const formatCompact = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md text-xs">
      {label != null && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-medium text-foreground">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

const TABS = [
  { key: 'funil', label: 'Funil unificado', icon: Filter },
  { key: 'mrr', label: 'MRR recorrente vs. avulso', icon: DollarSign },
  { key: 'vendedores', label: 'Ranking de vendedores', icon: Users },
  { key: 'descontos', label: 'Descontos & margem', icon: Percent },
] as const
type TabKey = typeof TABS[number]['key']

const PERIODOS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 180 dias' },
  { value: '365', label: 'Último ano' },
  { value: 'all', label: 'Todos os tempos' },
]

const ICONES_ESTAGIO = [Megaphone, Target, Send, CheckCircle2, FileCheck]

export default function ComercialRelatoriosPage() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tabInicial: TabKey = TABS.some(t => t.key === tabParam) ? (tabParam as TabKey) : 'funil'
  const [tab, setTab] = useState<TabKey>(tabInicial)
  const [periodo, setPeriodo] = useState('90')
  const [funil, setFunil] = useState<FunilData | null>(null)
  const [mrr, setMrr] = useState<MrrData | null>(null)
  const [vendedores, setVendedores] = useState<VendedoresData | null>(null)
  const [descontos, setDescontos] = useState<DescontosData | null>(null)
  const [loading, setLoading] = useState(false)

  const dias = periodo === 'all' ? undefined : Number(periodo)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'funil') setFunil(await trpc.orcamento.reportFunilComercial.query({ dias }))
      else if (tab === 'mrr') setMrr(await trpc.orcamento.reportMrrAvulso.query({ dias }))
      else if (tab === 'vendedores') setVendedores(await trpc.orcamento.reportRankingVendedores.query({ dias }))
      else if (tab === 'descontos') setDescontos(await trpc.orcamento.reportDescontosMargem.query({ dias }))
    } catch { /* silent */ } finally { setLoading(false) }
  }, [tab, dias])
  useEffect(() => { load() }, [tab, load])

  const maxCount = funil ? Math.max(...funil.funil.map(s => s.count), 1) : 1

  return (
    <div className="flex flex-col gap-5">
      {/* Header inline */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>Relatórios Comerciais</h1>
            <p className="text-sm text-muted-foreground">Visão de gestor cruzando captação, CRM, orçamentos e contratos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="h-9 w-[180px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <BackButton href="/comercial" label="Voltar" />
        </div>
      </div>

      {/* Pills */}
      <div className="flex gap-1 border-b border-border/40 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                active ? 'text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              style={active ? { borderBottomColor: MODULE_COLOR } : undefined}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      {tab === 'funil' ? (
        loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !funil ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">Não foi possível carregar o funil.</Card>
        ) : (
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-1">Jornada Lead → Oportunidade → Orçamento → Contrato</h3>
            <p className="text-[11px] text-muted-foreground mb-4">Volume por estágio no período e taxa de conversão para o estágio seguinte.</p>
            <div className="space-y-2">
              {funil.funil.map((s, i) => {
                const Icon = ICONES_ESTAGIO[i] ?? Filter
                const pct = (s.count / maxCount) * 100
                return (
                  <div key={s.label}>
                    {i > 0 && (
                      <div className="flex items-center gap-2 pl-[200px] py-0.5">
                        <span className="text-[10px] text-muted-foreground">↓ conversão</span>
                        <span className="text-[10px] font-semibold tabular-nums" style={{ color: MODULE_COLOR }}>
                          {s.conversao != null ? `${s.conversao}%` : '—'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-[190px] shrink-0 flex items-center gap-2 text-xs font-medium">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: MODULE_COLOR }} />
                        <span className="truncate">{s.label}</span>
                      </div>
                      <div className="flex-1 h-8 bg-muted/30 rounded relative overflow-hidden">
                        <div className="h-full flex items-center justify-end pr-2 text-[11px] font-semibold text-white transition-all"
                          style={{ width: `${Math.max(pct, 6)}%`, backgroundColor: MODULE_COLOR }}>
                          {s.count}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-4">
              Funil macro (volume por estágio no período) — não rastreia o mesmo registro fluindo entre etapas; mostra onde o funil estreita.
            </p>
          </Card>
        )
      ) : tab === 'mrr' ? (
        loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !mrr ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">Não foi possível carregar o relatório de MRR.</Card>
        ) : (
          <MrrReport mrr={mrr} />
        )
      ) : tab === 'vendedores' ? (
        loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !vendedores ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">Não foi possível carregar o ranking de vendedores.</Card>
        ) : (
          <VendedoresReport data={vendedores} />
        )
      ) : (
        loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !descontos ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">Não foi possível carregar o relatório de descontos.</Card>
        ) : (
          <DescontosReport data={descontos} />
        )
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, cor }: { icon: any; label: string; value: string; sub?: string; cor: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-[4px]" style={{ background: `color-mix(in srgb, ${cor} 15%, transparent)` }}>
          <Icon className="h-4 w-4" style={{ color: cor }} />
        </div>
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  )
}

function MrrReport({ mrr }: { mrr: MrrData }) {
  const { periodo, serie12m } = mrr
  const totalMix = periodo.totalValor
  return (
    <div className="flex flex-col gap-4">
      {/* KPIs da carteira recorrente */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Landmark} label="MRR atual" value={formatCompact(mrr.mrrAtual)} sub={formatCurrency(mrr.mrrAtual)} cor={COR_RECORRENTE} />
        <KpiCard icon={Repeat} label="Receita anualizada" value={formatCompact(mrr.mrrAnualizado)} sub="MRR × 12" cor="#34d399" />
        <KpiCard icon={Users2} label="Contratos recorrentes" value={String(mrr.contratosRecorrentes)} sub="vigentes + assinados" cor="#818cf8" />
        <KpiCard icon={Zap} label="Ticket médio MRR" value={formatCompact(mrr.ticketMedioMrr)} sub="por contrato/mês" cor="#fb7185" />
      </div>

      {/* Mix de vendas aprovadas no período */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-1">Mix das vendas aprovadas no período</h3>
        <p className="text-[11px] text-muted-foreground mb-4">Orçamentos aprovados, separados pela natureza do serviço: recorrente (entra como MRR) vs. avulso (faturamento pontual).</p>
        {totalMix > 0 ? (
          <>
            <div className="flex h-6 w-full overflow-hidden rounded">
              <div className="flex items-center justify-center text-[10px] font-semibold text-white transition-all" style={{ width: `${periodo.pctRecorrente}%`, backgroundColor: COR_RECORRENTE }}>
                {periodo.pctRecorrente >= 8 ? `${periodo.pctRecorrente}%` : ''}
              </div>
              <div className="flex items-center justify-center text-[10px] font-semibold text-white transition-all" style={{ width: `${periodo.pctAvulso}%`, backgroundColor: COR_AVULSO }}>
                {periodo.pctAvulso >= 8 ? `${periodo.pctAvulso}%` : ''}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_RECORRENTE }} /> Recorrente (MRR)</div>
                <p className="text-lg font-semibold tabular-nums mt-1">{formatCurrency(periodo.recorrente.valor)}</p>
                <p className="text-[11px] text-muted-foreground">{periodo.recorrente.count} orçamento(s)</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_AVULSO }} /> Avulso (pontual)</div>
                <p className="text-lg font-semibold tabular-nums mt-1">{formatCurrency(periodo.avulso.valor)}</p>
                <p className="text-[11px] text-muted-foreground">{periodo.avulso.count} orçamento(s)</p>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum orçamento aprovado no período.</p>
        )}
      </Card>

      {/* Série 12 meses */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-1">Vendas aprovadas — recorrente × avulso (12 meses)</h3>
        <p className="text-[11px] text-muted-foreground mb-4">Valor aprovado por mês (por data de aprovação), classificado pela natureza do serviço.</p>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie12m} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCompact(v)} width={56} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="recorrente" name="Recorrente" stackId="a" fill={COR_RECORRENTE} radius={[0, 0, 0, 0]} />
              <Bar dataKey="avulso" name="Avulso" stackId="a" fill={COR_AVULSO} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}

function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '?'
}

const MEDALHAS = ['#fbbf24', '#94a3b8', '#d97706'] // ouro, prata, bronze

function VendedoresReport({ data }: { data: VendedoresData }) {
  const { ranking, totais } = data
  const maxValor = Math.max(...ranking.map(r => r.valorAprovado), 1)
  if (!ranking.length) {
    return <Card className="p-10 text-center text-sm text-muted-foreground">Nenhuma atividade de vendedores no período.</Card>
  }
  return (
    <div className="flex flex-col gap-4">
      {/* KPIs totais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Send} label="Orçamentos enviados" value={String(totais.enviados)} cor="#60a5fa" />
        <KpiCard icon={CheckCircle2} label="Aprovados" value={String(totais.aprovados)} sub={`${totais.enviados > 0 ? Math.round((totais.aprovados / totais.enviados) * 100) : 0}% de aprovação`} cor={COR_RECORRENTE} />
        <KpiCard icon={DollarSign} label="Valor aprovado" value={formatCompact(totais.valorAprovado)} sub={formatCurrency(totais.valorAprovado)} cor="#34d399" />
        <KpiCard icon={FileCheck} label="Contratos efetivados" value={String(totais.contratos)} sub={`${formatCompact(totais.mrr)} em MRR`} cor="#fb7185" />
      </div>

      {/* Tabela ranking */}
      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Trophy className="h-4 w-4" style={{ color: MODULE_COLOR }} />
          <h3 className="text-sm font-semibold">Ranking por valor aprovado</h3>
        </div>
        <div className="divide-y divide-border">
          {ranking.map((v, i) => (
            <div key={v.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-6 shrink-0 text-center text-sm font-bold tabular-nums" style={{ color: i < 3 ? MEDALHAS[i] : 'hsl(var(--muted-foreground))' }}>
                {i + 1}
              </div>
              <Avatar className="h-9 w-9 shrink-0">
                {v.image && <AvatarImage src={v.image} alt={v.nome} />}
                <AvatarFallback className="text-[11px]">{iniciais(v.nome)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{v.nome}</span>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{formatCurrency(v.valorAprovado)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded bg-muted/40 overflow-hidden">
                  <div className="h-full rounded transition-all" style={{ width: `${Math.max((v.valorAprovado / maxValor) * 100, 2)}%`, backgroundColor: MODULE_COLOR }} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span><Send className="inline h-3 w-3 mr-0.5" />{v.enviados} env.</span>
                  <span><CheckCircle2 className="inline h-3 w-3 mr-0.5" />{v.aprovados} aprov.</span>
                  <span className="font-medium" style={{ color: v.taxaAprovacao >= 50 ? COR_RECORRENTE : undefined }}>{v.taxaAprovacao}% conv.</span>
                  <span>Ticket {formatCompact(v.ticketMedio)}</span>
                  <span><FileCheck className="inline h-3 w-3 mr-0.5" />{v.contratos} contrato(s)</span>
                  {v.mrr > 0 && <span><Landmark className="inline h-3 w-3 mr-0.5" />{formatCompact(v.mrr)} MRR</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <p className="text-[10px] text-muted-foreground">
        Vendedor = responsável do orçamento/contrato. Enviados e aprovados por data de envio/aprovação no período; contratos por data de criação.
      </p>
    </div>
  )
}

function DescontosReport({ data }: { data: DescontosData }) {
  const { kpis, margem, faixas, topDescontos, porVendedor } = data
  const maxFaixa = Math.max(...faixas.map(f => f.count), 1)
  const maxVend = Math.max(...porVendedor.map(v => v.descontoMedioPct), 1)
  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="Valor bruto" value={formatCompact(kpis.brutoTotal)} sub={`${kpis.totalAprovados} aprovado(s)`} cor="#60a5fa" />
        <KpiCard icon={Scissors} label="Desconto concedido" value={formatCompact(kpis.descTotal)} sub={formatCurrency(kpis.descTotal)} cor="#fb7185" />
        <KpiCard icon={TicketPercent} label="Desconto médio" value={`${kpis.descontoMedioPct}%`} sub="sobre o bruto" cor="#f97316" />
        <KpiCard icon={TrendingDown} label="Com desconto" value={`${kpis.pctComDesconto}%`} sub={`${kpis.comDesconto} de ${kpis.totalAprovados}`} cor="#fbbf24" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Composição / margem */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Composição do faturamento (margem de serviço)</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Quanto do bruto é honorário (receita do escritório) vs. repasses (taxas e despesas de terceiros).</p>
          {kpis.brutoTotal > 0 ? (
            <>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-semibold tabular-nums" style={{ color: COR_RECORRENTE }}>{margem.margemServicoPct}%</span>
                <span className="text-xs text-muted-foreground">margem de serviço</span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded">
                <div className="flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${margem.margemServicoPct}%`, backgroundColor: COR_RECORRENTE }}>
                  {margem.margemServicoPct >= 10 ? `${margem.margemServicoPct}%` : ''}
                </div>
                <div className="flex items-center justify-center text-[10px] font-semibold text-white" style={{ width: `${100 - margem.margemServicoPct}%`, backgroundColor: '#94a3b8' }} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_RECORRENTE }} /> Serviços (honorários)</div>
                  <p className="text-lg font-semibold tabular-nums mt-1">{formatCurrency(margem.servicos)}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium"><span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Repasses (taxas/despesas)</div>
                  <p className="text-lg font-semibold tabular-nums mt-1">{formatCurrency(margem.repasses)}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhum orçamento aprovado no período.</p>
          )}
        </Card>

        {/* Distribuição por faixa de desconto */}
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Distribuição por faixa de desconto</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Quantos orçamentos aprovados em cada faixa de desconto concedido.</p>
          <div className="space-y-2.5">
            {faixas.map(f => (
              <div key={f.label} className="flex items-center gap-3">
                <span className="w-[110px] shrink-0 text-xs">{f.label}</span>
                <div className="flex-1 h-6 bg-muted/30 rounded relative overflow-hidden">
                  <div className="h-full flex items-center justify-end pr-2 text-[11px] font-semibold text-white transition-all"
                    style={{ width: `${Math.max((f.count / maxFaixa) * 100, f.count > 0 ? 8 : 0)}%`, backgroundColor: MODULE_COLOR }}>
                    {f.count > 0 ? f.count : ''}
                  </div>
                  {f.count === 0 && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">0</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Desconto médio por vendedor */}
      {porVendedor.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Desconto médio por vendedor</h3>
          <p className="text-[11px] text-muted-foreground mb-4">Quem concede mais desconto (% sobre o bruto dos orçamentos aprovados).</p>
          <div className="space-y-2.5">
            {porVendedor.map(v => (
              <div key={v.id} className="flex items-center gap-3">
                <span className="w-[150px] shrink-0 text-xs font-medium truncate">{v.nome}</span>
                <div className="flex-1 h-5 bg-muted/30 rounded overflow-hidden">
                  <div className="h-full rounded transition-all" style={{ width: `${Math.max((v.descontoMedioPct / maxVend) * 100, v.descontoMedioPct > 0 ? 4 : 0)}%`, backgroundColor: '#fb7185' }} />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums">{v.descontoMedioPct}%</span>
                <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground tabular-nums">{formatCompact(v.desconto)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Top maiores descontos */}
      {topDescontos.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2">
            <Scissors className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <h3 className="text-sm font-semibold">Maiores descontos concedidos</h3>
          </div>
          <div className="divide-y divide-border">
            {topDescontos.map(d => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-2.5 text-xs">
                <span className="w-12 shrink-0 font-mono text-muted-foreground">#{d.numero}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{d.cliente}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{d.vendedor}</p>
                </div>
                <span className="w-24 shrink-0 text-right text-muted-foreground tabular-nums">{formatCurrency(d.bruto)}</span>
                <span className="w-24 shrink-0 text-right tabular-nums" style={{ color: '#fb7185' }}>−{formatCurrency(d.desconto)}</span>
                <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{d.pct}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <p className="text-[10px] text-muted-foreground">
        Base: orçamentos aprovados no período (por data de aprovação). Margem de serviço = honorários ÷ bruto; repasses (taxas/despesas) são valores de terceiros.
      </p>
    </div>
  )
}
