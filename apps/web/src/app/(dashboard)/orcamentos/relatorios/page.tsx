'use client'

import { useState, useEffect, useMemo, useCallback, type ElementType } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  BarChart3, Loader2, Clock, Target, AlertTriangle, Building2, TrendingUp, Star, ThumbsUp, MessageSquare, Activity,
} from 'lucide-react'
import {
  Card, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { IndicadoresDashboard } from '../_components/indicadores-dashboard'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LabelList,
} from 'recharts'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

type OrcOut = inferRouterOutputs<AppRouter>['orcamento']
type FunilData = OrcOut['reportFunil']
type AtrasadosData = OrcOut['reportAtrasados']
type DesempenhoData = OrcOut['reportDesempenho']
type TempoData = OrcOut['reportTempoCiclo']
type AreaData = OrcOut['reportPorArea']
type PesquisaData = inferRouterOutputs<AppRouter>['pesquisa']['reportPesquisa']

const STATUS_LABELS: Record<string, string> = {
  NOVO: 'Novo', A_ENVIAR: 'A Enviar', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
  LIBERADO: 'Liberado', FINALIZADO: 'Finalizado', ENCERRADO: 'Encerrado',
}

const STATUS_COLORS: Record<string, string> = {
  NOVO: '#818cf8', A_ENVIAR: '#94a3b8', ENVIADO: '#3b82f6', APROVADO: '#10b981',
  LIBERADO: '#059669', FINALIZADO: '#1e293b', ENCERRADO: '#ef4444',
}

const TABS = [
  { key: 'indicadores', label: 'Indicadores', icon: Activity },
  { key: 'funil', label: 'Funil de Vendas', icon: TrendingUp },
  { key: 'atrasados', label: 'Atrasados', icon: AlertTriangle },
  { key: 'desempenho', label: 'Desempenho', icon: Target },
  { key: 'tempo', label: 'Tempo de Ciclo', icon: Clock },
  { key: 'area', label: 'Por Área', icon: Building2 },
  { key: 'satisfacao', label: 'Satisfação', icon: Star },
] as const

type TabKey = typeof TABS[number]['key']

const PERIODOS: Array<{ value: string; label: string; dias?: number }> = [
  { value: '30', label: 'Ultimos 30 dias', dias: 30 },
  { value: '90', label: 'Ultimos 90 dias', dias: 90 },
  { value: '180', label: 'Ultimos 180 dias', dias: 180 },
  { value: '365', label: 'Ultimo ano', dias: 365 },
  { value: 'all', label: 'Todos os tempos' },
]

function formatCurrency(v: number | string | null | undefined): string {
  return Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function RelatoriosOrcamentosPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabFromUrl = searchParams?.get('tab') as TabKey | null

  const [tab, setTab] = useState<TabKey>(tabFromUrl && TABS.find(t => t.key === tabFromUrl) ? tabFromUrl : 'funil')
  const [periodo, setPeriodo] = useState('90')

  const dias = useMemo(() => {
    const p = PERIODOS.find(p => p.value === periodo)
    return p?.dias
  }, [periodo])

  // Data states
  const [funil, setFunil] = useState<FunilData | null>(null)
  const [atrasados, setAtrasados] = useState<AtrasadosData | null>(null)
  const [desempenho, setDesempenho] = useState<DesempenhoData>([])
  const [tempo, setTempo] = useState<TempoData | null>(null)
  const [areas, setAreas] = useState<AreaData>([])
  const [pesquisa, setPesquisa] = useState<PesquisaData | null>(null)
  const [loading, setLoading] = useState(false)

  const loadTab = useCallback(async (currentTab: TabKey) => {
    if (currentTab === 'indicadores') { setLoading(false); return }   // tab gerencia o próprio carregamento
    setLoading(true)
    try {
      if (currentTab === 'funil') {
        setFunil(await trpc.orcamento.reportFunil.query({ dias }))
      } else if (currentTab === 'atrasados') {
        setAtrasados(await trpc.orcamento.reportAtrasados.query())
      } else if (currentTab === 'desempenho') {
        setDesempenho(await trpc.orcamento.reportDesempenho.query({ dias }))
      } else if (currentTab === 'tempo') {
        setTempo(await trpc.orcamento.reportTempoCiclo.query({ dias }))
      } else if (currentTab === 'area') {
        setAreas(await trpc.orcamento.reportPorArea.query({ dias }))
      } else if (currentTab === 'satisfacao') {
        setPesquisa(await trpc.pesquisa.reportPesquisa.query({ dias: dias ?? null }))
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [dias])

  useEffect(() => { loadTab(tab) }, [tab, loadTab])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>Relatórios de Orçamentos</h1>
            <p className="text-sm text-muted-foreground">Indicadores e análises do pipeline comercial</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tab !== 'indicadores' && (
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="h-9 w-[180px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          )}
          <BackButton href="/orcamentos" label="Voltar" />
        </div>
      </div>

      {/* Pills */}
      <div className="flex gap-1 border-b border-border/40 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); router.replace(`/orcamentos/relatorios?tab=${t.key}`) }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                active ? 'text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              style={active ? { borderBottomColor: MODULE_COLOR } : undefined}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Conteudo */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === 'indicadores' && <IndicadoresDashboard />}
          {tab === 'funil' && funil && <FunilTab funil={funil} />}
          {tab === 'atrasados' && atrasados && <AtrasadosTab atrasados={atrasados} />}
          {tab === 'desempenho' && <DesempenhoTab data={desempenho} />}
          {tab === 'tempo' && tempo && <TempoTab data={tempo} />}
          {tab === 'area' && <AreaTab data={areas} />}
          {tab === 'satisfacao' && <SatisfacaoTab data={pesquisa} />}
        </>
      )}
    </div>
  )
}

// ============================================================
// Tabs
// ============================================================

function FunilTab({ funil }: { funil: FunilData }) {
  const dadosChart = funil.funil.map(f => ({
    name: STATUS_LABELS[f.status] || f.status,
    qtd: f.count,
    valor: f.valor,
    cor: STATUS_COLORS[f.status] || '#94a3b8',
  }))

  const maxCount = Math.max(...funil.funil.map(f => f.count), 1)

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total no período" value={String(funil.total)} icon={Target} />
        <StatCard label="Valor total" value={formatCurrency(funil.valorTotal)} icon={TrendingUp} />
        <StatCard label="Taxa de conversão" value={`${funil.taxaConversao}%`} icon={BarChart3} />
      </div>

      {/* Funil visual */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Funil por status</h3>
        <div className="space-y-2">
          {funil.funil.map(f => {
            const pct = (f.count / maxCount) * 100
            return (
              <div key={f.status} className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs font-medium text-right">
                  {STATUS_LABELS[f.status] || f.status}
                </div>
                <div className="flex-1 h-7 bg-muted/30 rounded relative overflow-hidden">
                  <div
                    className="h-full transition-all flex items-center justify-end pr-2 text-[10px] font-semibold text-white"
                    style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: STATUS_COLORS[f.status] }}
                  >
                    {f.count > 0 && f.count}
                  </div>
                </div>
                <div className="w-32 shrink-0 text-xs text-right text-muted-foreground">
                  {formatCurrency(f.valor)}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* BarChart */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Distribuicao</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dadosChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="qtd" radius={[4, 4, 0, 0]}>
              {dadosChart.map((d, i) => <Cell key={i} fill={d.cor} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}

function AtrasadosTab({ atrasados }: { atrasados: AtrasadosData }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <StatCard label={`Aguardando envio (>${atrasados.diasEnvioConfig}d)`} value={String(atrasados.aguardandoEnvio.length)} icon={Clock} cor="#f59e0b" />
        <StatCard label={`Aguardando aprovacao (>${atrasados.diasAprovacaoConfig}d)`} value={String(atrasados.aguardandoAprovacao.length)} icon={AlertTriangle} cor="#ef4444" />
      </div>

      <Card>
        <div className="px-5 py-3 border-b border-border/60">
          <h3 className="text-sm font-semibold">Aguardando envio</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">#</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-[120px] text-right">Valor</TableHead>
              <TableHead className="w-[110px]">Criado em</TableHead>
              <TableHead className="w-[100px] text-center">Atraso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {atrasados.aguardandoEnvio.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground italic">Nenhum orçamento atrasado</TableCell></TableRow>
            ) : atrasados.aguardandoEnvio.map(o => (
              <TableRow key={o.id} className="whitespace-nowrap">
                <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                <TableCell className="text-sm">{o.cliente?.razaoSocial || '—'}</TableCell>
                <TableCell className="text-right text-sm">{formatCurrency(o.totalGeral)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                <TableCell className="text-center">
                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">{o.diasAtraso}d</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b border-border/60">
          <h3 className="text-sm font-semibold">Aguardando aprovacao do cliente</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">#</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-[120px] text-right">Valor</TableHead>
              <TableHead className="w-[110px]">Enviado em</TableHead>
              <TableHead className="w-[100px] text-center">Atraso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {atrasados.aguardandoAprovacao.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-xs text-muted-foreground italic">Nenhum orçamento atrasado</TableCell></TableRow>
            ) : atrasados.aguardandoAprovacao.map(o => (
              <TableRow key={o.id} className="whitespace-nowrap">
                <TableCell className="font-mono text-xs">{o.numero}</TableCell>
                <TableCell className="text-sm">{o.cliente?.razaoSocial || '—'}</TableCell>
                <TableCell className="text-right text-sm">{formatCurrency(o.totalGeral)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{o.dtEnviado ? new Date(o.dtEnviado).toLocaleDateString('pt-BR') : '—'}</TableCell>
                <TableCell className="text-center">
                  <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 text-[10px]">{o.diasAtraso}d</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function DesempenhoTab({ data }: { data: DesempenhoData }) {
  const dadosChart = data.slice(0, 10).map(d => ({
    name: d.nome.length > 20 ? d.nome.slice(0, 18) + '...' : d.nome,
    Aprovados: d.aprovados,
    Total: d.total,
  }))

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Desempenho por responsavel</h3>
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-6">Nenhum dado no período</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Total" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Aprovados" fill={MODULE_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Responsavel</TableHead>
              <TableHead className="w-[80px] text-center">Total</TableHead>
              <TableHead className="w-[100px] text-center">Aprovados</TableHead>
              <TableHead className="w-[100px] text-center">Encerrados</TableHead>
              <TableHead className="w-[100px] text-center">Conversão</TableHead>
              <TableHead className="w-[140px] text-right">Valor aprovado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground italic">Nenhum dado</TableCell></TableRow>
            ) : data.map((d, i) => (
              <TableRow key={i} className="whitespace-nowrap">
                <TableCell className="text-sm">
                  <div className="flex items-center gap-2">
                    {d.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveAssetUrl(d.image)} alt={d.nome} className="h-6 w-6 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-[8px] font-bold text-muted-foreground">{(d.nome || '?').split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}</span>
                      </div>
                    )}
                    <span>{d.nome}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center text-sm">{d.total}</TableCell>
                <TableCell className="text-center text-sm text-emerald-600">{d.aprovados}</TableCell>
                <TableCell className="text-center text-sm text-rose-600">{d.encerrados}</TableCell>
                <TableCell className="text-center">
                  <Badge className={cn(
                    'text-[10px]',
                    d.taxaAprovacao >= 50 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      d.taxaAprovacao >= 25 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                  )}>{d.taxaAprovacao}%</Badge>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">{formatCurrency(d.valorAprovado)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function TempoTab({ data }: { data: TempoData }) {
  const items = [
    { label: 'Criacao -> Envio', d: data.criacaoAteEnvio, cor: '#818cf8' },
    { label: 'Envio -> Aprovacao', d: data.envioAteAprovacao, cor: '#3b82f6' },
    { label: 'Aprovacao -> Liberacao', d: data.aprovacaoAteLiberacao, cor: '#10b981' },
    { label: 'Liberacao -> Finalizacao', d: data.liberacaoAteFinalizacao, cor: '#059669' },
    { label: 'Criacao -> Finalizacao (total)', d: data.criacaoAteFinalizacao, cor: '#fb7185', destaque: true },
  ]
  const max = Math.max(...items.map(i => i.d.dias), 1)

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold mb-4">Tempo médio por etapa do workflow</h3>
      <div className="space-y-3">
        {items.map((it, i) => (
          <div key={i} className={cn('flex items-center gap-3', it.destaque && 'pt-3 mt-3 border-t border-border/40')}>
            <div className="w-56 shrink-0 text-xs font-medium">{it.label}</div>
            <div className="flex-1 h-8 bg-muted/30 rounded relative overflow-hidden">
              <div
                className="h-full transition-all flex items-center justify-end pr-2 text-[11px] font-semibold text-white"
                style={{ width: `${Math.max((it.d.dias / max) * 100, 4)}%`, backgroundColor: it.cor }}
              >
                {it.d.dias > 0 && `${it.d.dias}d`}
              </div>
            </div>
            <div className="w-24 shrink-0 text-[10px] text-muted-foreground text-right">
              {it.d.amostra > 0 ? `${it.d.amostra} amostras` : '—'}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function AreaTab({ data }: { data: AreaData }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const dadosPie = data.map((d, i) => ({
    name: d.area,
    value: d.count,
    fill: ['#fb7185', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444', '#14b8a6'][i % 8],
  }))

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Distribuicao por area</h3>
        {data.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center py-6">Nenhum dado</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={dadosPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} label={({ value }) => `${value}`}>
                {dadosPie.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Area</TableHead>
              <TableHead className="w-[70px] text-center">Qtd</TableHead>
              <TableHead className="w-[80px] text-center">Conversão</TableHead>
              <TableHead className="w-[140px] text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground italic">Nenhum dado</TableCell></TableRow>
            ) : data.map((d, i) => (
              <TableRow key={i}>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: dadosPie[i]?.fill }} />
                    <span>{d.area}</span>
                  </div>
                </TableCell>
                <TableCell className="text-center text-sm">{d.count} <span className="text-[10px] text-muted-foreground">({total > 0 ? Math.round((d.count / total) * 100) : 0}%)</span></TableCell>
                <TableCell className="text-center">
                  <Badge className={cn(
                    'text-[10px]',
                    d.taxaAprovacao >= 50 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      d.taxaAprovacao >= 25 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                  )}>{d.taxaAprovacao}%</Badge>
                </TableCell>
                <TableCell className="text-right text-sm">{formatCurrency(d.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function SatisfacaoTab({ data }: { data: PesquisaData | null }) {
  if (!data) return <p className="text-sm text-muted-foreground text-center py-10">Carregando…</p>
  const npsCor = data.nps < 0 ? '#ef4444' : data.nps < 50 ? '#f59e0b' : '#10b981'
  const chartNps = (data.distribuicaoNps || []).map((d: { nota: number; count: number }) => ({ nome: String(d.nota), count: d.count }))
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label={`Respostas (${data.taxaResposta}%)`} value={`${data.respondidas}/${data.enviadas}`} icon={Star} />
        <StatCard label="NPS" value={String(data.nps)} icon={TrendingUp} cor={npsCor} />
        <StatCard label="Média de estrelas" value={data.mediaEstrelas ? Number(data.mediaEstrelas).toFixed(1) : '—'} icon={Star} />
        <StatCard label="% Sim (Sim/Não)" value={`${data.percentSim}%`} icon={ThumbsUp} />
      </div>

      {data.respondidas === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhuma resposta de pesquisa no período selecionado.</p>
      )}

      {chartNps.length > 0 && (
        <Card className="p-5">
          <h4 className="text-sm font-semibold mb-4">Distribuição das notas NPS (0–10)</h4>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartNps}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartNps.map((d, i: number) => {
                  const n = Number(d.nome); const c = n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#10b981'
                  return <Cell key={i} fill={c} />
                })}
                <LabelList dataKey="count" position="top" style={{ fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {(data.comentarios || []).length > 0 && (
        <Card className="p-5">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Comentários ({data.comentarios.length})</h4>
          <div className="space-y-2 max-h-[360px] overflow-y-auto">
            {data.comentarios.map((c: { texto: string }, i: number) => (
              <p key={i} className="text-sm border-l-2 pl-3 py-1 text-muted-foreground" style={{ borderColor: MODULE_COLOR }}>{c.texto}</p>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, icon: Icon, cor = MODULE_COLOR }: { label: string; value: string; icon: ElementType; cor?: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${cor}18` }}>
        <Icon className="h-5 w-5" style={{ color: cor }} />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-lg font-bold leading-tight">{value}</p>
      </div>
    </Card>
  )
}
