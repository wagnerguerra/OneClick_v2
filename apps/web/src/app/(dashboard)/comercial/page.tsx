'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Target, TrendingUp, Percent, CircleDollarSign, FileText, AlertTriangle,
  FileCheck, Landmark, CalendarClock, RefreshCw, Loader2, BarChart3,
  ChevronDown, Filter, Users, Inbox, Phone, MessageCircle, PhoneOff, UserX, CalendarPlus,
  CalendarCheck, Send, FileSignature, CalendarRange,
} from 'lucide-react'
import {
  Button, Card, Badge, Input,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { StatCard } from '@/components/stat-card'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { STRONG, TEXT } from '@/lib/color-styles'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { ChartTooltip, CHART_CURSOR_FILL } from '@/components/chart-tooltip'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

// ── Período ──────────────────────────────────────────────────
// Até 25/09/2026 o painel só tinha janelas fixas (30/60/90 dias). Agora são
// data inicial e final (inclusivas, no fuso de Brasília — o backend converte);
// os atalhos só preenchem as duas datas. Data vazia = aberta daquele lado.

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function atalho(chave: string, hoje = new Date()): { de: string; ate: string } {
  const y = hoje.getFullYear()
  const m = hoje.getMonth()
  const menos = (dias: number) => { const d = new Date(hoje); d.setDate(d.getDate() - dias + 1); return d }
  switch (chave) {
    case 'mes-passado': return { de: iso(new Date(y, m - 1, 1)), ate: iso(new Date(y, m, 0)) }
    case '7': return { de: iso(menos(7)), ate: iso(hoje) }
    case '30': return { de: iso(menos(30)), ate: iso(hoje) }
    case '90': return { de: iso(menos(90)), ate: iso(hoje) }
    case 'ano': return { de: iso(new Date(y, 0, 1)), ate: iso(hoje) }
    case 'tudo': return { de: '', ate: '' }
    default: return { de: iso(new Date(y, m, 1)), ate: iso(hoje) } // este mês
  }
}

const ATALHOS = [
  { value: 'mes', label: 'Este mês' },
  { value: 'mes-passado', label: 'Mês passado' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: 'ano', label: 'Este ano' },
  { value: 'tudo', label: 'Todo o período' },
]

/** Colunas da tabela por pessoa, na ordem da planilha do comercial. */
const COLUNAS_FUNIL = [
  { campo: 'leadsRecebidos', rotulo: 'Leads recebidos', etapa: 'q' },
  { campo: 'qualifLigacao', rotulo: 'Qualif. por ligação', etapa: 'q' },
  { campo: 'qualifWhatsapp', rotulo: 'Qualif. por WhatsApp', etapa: 'q' },
  { campo: 'semResposta', rotulo: 'Sem resposta', etapa: 'q' },
  { campo: 'desqualificados', rotulo: 'Desqualificados', etapa: 'q' },
  { campo: 'reunioesAgendadas', rotulo: 'Reuniões agendadas', etapa: 'q' },
  { campo: 'reunioesRealizadas', rotulo: 'Reuniões realizadas', etapa: 'f' },
  { campo: 'propostasEnviadas', rotulo: 'Propostas enviadas', etapa: 'f' },
  { campo: 'contratosAssinados', rotulo: 'Contratos assinados', etapa: 'f' },
] as const
type CampoFunil = (typeof COLUNAS_FUNIL)[number]['campo'] | 'qualifOutros'
type TotaisFunil = Record<CampoFunil, number>
interface IndicadoresFunil {
  total: TotaisFunil
  pessoas: Array<TotaisFunil & { userId: string | null; nome: string; image: string | null }>
  servicosDeEntrada: number
}

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

interface PainelData {
  crmStats: any
  crmFunil: any
  crmDesempenho: any[]
  orcStats: any
  orcDash: any
  contratos: any
  mrrAvulso: any
  funil: IndicadoresFunil | null
}

export default function ComercialPage() {
  const router = useRouter()
  const inicial = useMemo(() => atalho('mes'), [])
  const [de, setDe] = useState(inicial.de)
  const [ate, setAte] = useState(inicial.ate)
  const [data, setData] = useState<PainelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [erro, setErro] = useState(false)
  const firstLoad = useRef(true)

  // Uma data digitada pela metade chega vazia no input; só vale a completa.
  const periodo = useMemo(() => ({ ...(de ? { de } : {}), ...(ate ? { ate } : {}) }), [de, ate])
  const invertido = !!de && !!ate && de > ate

  const load = useCallback(async () => {
    if (firstLoad.current) setLoading(true)
    else setRefreshing(true)
    setErro(false)
    // Cada chamada e independente: se um modulo nao tiver permissao (FORBIDDEN),
    // os demais continuam carregando.
    const safe = <T,>(p: Promise<T>): Promise<T | null> => p.then((r) => r).catch(() => null)
    try {
      const [crmStats, crmFunil, crmDesempenho, orcStats, orcDash, contratos, mrrAvulso, funil] = await Promise.all([
        safe((trpc.crm as any).getStats.query()),
        safe((trpc.crm as any).reportFunil.query(periodo)),
        safe((trpc.crm as any).reportDesempenho.query(periodo)),
        safe((trpc.orcamento as any).getStats.query()),
        safe((trpc.orcamento as any).getDashboardStats.query()),
        safe((trpc.contrato as any).reportComercial.query()),
        safe((trpc.orcamento as any).reportMrrAvulso.query(periodo)),
        safe((trpc.crm as any).indicadoresComerciais.query(periodo) as Promise<IndicadoresFunil>),
      ])
      if (!crmStats && !crmFunil && !orcStats && !contratos) setErro(true)
      setData({
        crmStats, crmFunil,
        crmDesempenho: Array.isArray(crmDesempenho) ? crmDesempenho : [],
        orcStats, orcDash, contratos, mrrAvulso, funil,
      })
    } finally {
      firstLoad.current = false
      setLoading(false)
      setRefreshing(false)
    }
  }, [periodo])

  useEffect(() => { if (!invertido) load() }, [load, invertido])

  // Auto-refresh leve (quadro de parede) — a cada 60s, sem spinner full.
  useEffect(() => {
    if (invertido) return
    const id = setInterval(() => { load() }, 60_000)
    return () => clearInterval(id)
  }, [load, invertido])

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

  // ── Receita recorrente vs. avulsa (vendas aprovadas no período) ──
  const mrrAvulso = data?.mrrAvulso
  const recPeriodo = mrrAvulso?.periodo
  const recValor = recPeriodo?.recorrente?.valor ?? 0
  const avValor = recPeriodo?.avulso?.valor ?? 0
  const recPct = recPeriodo?.pctRecorrente ?? 0
  const avPct = recPeriodo?.pctAvulso ?? 0
  const recAvTotal = recPeriodo?.totalValor ?? 0

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
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
          {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <div className="flex flex-wrap items-center gap-1.5">
            <Select value="" onValueChange={(v) => { const p = atalho(v); setDe(p.de); setAte(p.ate) }}>
              <SelectTrigger className="w-[40px] sm:w-[130px] h-8 text-xs" title="Atalhos de período">
                <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="hidden sm:inline"><SelectValue placeholder="Atalhos" /></span>
              </SelectTrigger>
              <SelectContent>
                {ATALHOS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" aria-label="Data inicial" value={de} max={ate || undefined}
              onChange={(e) => setDe(e.target.value)}
              className={cn('h-8 w-[136px] text-xs', invertido && 'border-destructive')} />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" aria-label="Data final" value={ate} min={de || undefined}
              onChange={(e) => setAte(e.target.value)}
              className={cn('h-8 w-[136px] text-xs', invertido && 'border-destructive')} />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <BarChart3 className="h-4 w-4" />
                Relatórios
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Relatórios comerciais</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/comercial/relatorios?tab=funil')}>
                <Filter className="h-4 w-4" />
                Funil unificado
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/comercial/relatorios?tab=mrr')}>
                <Landmark className="h-4 w-4" />
                MRR recorrente vs. avulso
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/comercial/relatorios?tab=vendedores')}>
                <Users className="h-4 w-4" />
                Ranking de vendedores
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push('/comercial/relatorios?tab=descontos')}>
                <Percent className="h-4 w-4" />
                Descontos & margem
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => load()}
            title="Atualizar agora"
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
      </>}>
        <h1 className="truncate">Painel Comercial</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Comercial</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Painel Comercial</span>
        </p>
      </PageHeaderBar>

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
          {invertido && (
            <p className={cn('text-xs', TEXT.rose)}>A data inicial está depois da final — ajuste o período.</p>
          )}

          {/* ── Funil comercial: Qualificação + Fechamento ── */}
          {data?.funil && <FunilComercial funil={data.funil} />}

          {/* ── KPIs ───────────────────────────────────────── */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> CRM — Pipeline
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard icon={Target} label="Oportunidades ativas" value={oportunidadesAtivas} color="#818cf8" />
              <StatCard icon={TrendingUp} label="Valor em pipeline" value={formatCompact(pipelineValor)} color="#34d399" sub={formatCurrency(pipelineValor)} />
              <StatCard icon={Percent} label="Taxa de conversão" value={`${taxaConversao}%`} color={MODULE_COLOR} />
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
              <StatCard icon={Landmark} label="MRR (receita recorrente)" value={formatCompact(mrr)} color={MODULE_COLOR} sub={formatCurrency(mrr)} />
              <StatCard icon={CalendarClock} label="A vencer (30 dias)" value={aVencer30} color="#fbbf24" sub={`${ct?.aVencer60 ?? 0} em até 60 dias`} />
            </div>
          </div>

          {/* ── Receita recorrente vs. avulsa (vendas aprovadas no período) ── */}
          {mrrAvulso && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                <CircleDollarSign className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> Receita — recorrente vs. avulsa
              </p>
              <Card className="p-4">
                {recAvTotal > 0 ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Mix das vendas aprovadas no período</span>
                      <span className="font-medium tabular-nums">{formatCurrency(recAvTotal)}</span>
                    </div>
                    <div className="flex h-6 w-full overflow-hidden rounded">
                      <div className="flex items-center justify-center text-[10px] font-semibold text-white transition-all"
                        style={{ width: `${recPct}%`, backgroundColor: '#34d399' }}>
                        {recPct >= 10 ? `${recPct}%` : ''}
                      </div>
                      <div className="flex items-center justify-center text-[10px] font-semibold text-white transition-all"
                        style={{ width: `${avPct}%`, backgroundColor: '#fbbf24' }}>
                        {avPct >= 10 ? `${avPct}%` : ''}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /> Recorrente (entra como MRR)
                        </div>
                        <p className="text-lg font-semibold tabular-nums mt-1">{formatCurrency(recValor)}</p>
                        <p className="text-[11px] text-muted-foreground">{recPeriodo?.recorrente?.count ?? 0} orçamento(s)</p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Avulso (pontual)
                        </div>
                        <p className="text-lg font-semibold tabular-nums mt-1">{formatCurrency(avValor)}</p>
                        <p className="text-[11px] text-muted-foreground">{recPeriodo?.avulso?.count ?? 0} orçamento(s)</p>
                      </div>
                    </div>
                    <button
                      onClick={() => router.push('/comercial/relatorios?tab=mrr')}
                      className="self-start text-[11px] font-medium hover:underline"
                      style={{ color: MODULE_COLOR }}
                    >
                      Ver relatório completo de MRR →
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">Nenhum orçamento aprovado no período.</p>
                )}
              </Card>
            </div>
          )}

          {/* ── Graficos linha 1: Funil CRM + Orcamentos por status ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <Card className="lg:col-span-7 p-4">
              <h3 className="text-[13px] font-semibold text-foreground mb-4">Funil de vendas (CRM)</h3>
              <div className="h-[280px]">
                {funilChart.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funilChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip format={(v: number, n?: string) => (n === 'Valor' ? formatCurrency(v) : v)} />} cursor={{ fill: CHART_CURSOR_FILL }} />
                      <Bar dataKey="count" name="Quantidade" radius={[4, 4, 0, 0]}>
                        {funilChart.map((e: any) => (
                          <Cell key={e.etapaId} fill={e.cor || MODULE_COLOR} opacity={0.85} />
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
                      <Tooltip content={<ChartTooltip format={(v: number) => `${v} orçamento(s)`} />} />
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
                      <Tooltip content={<ChartTooltip format={(v: number) => `${v} contrato(s)`} />} />
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
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_CURSOR_FILL }} />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_CURSOR_FILL }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="ganhos" name="Ganhos" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="perdidos" name="Perdidos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="total" name="Total" fill={MODULE_COLOR} opacity={0.4} radius={[4, 4, 0, 0]} />
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
                    <TableHead className="hidden sm:table-cell text-xs">Contrato</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="hidden md:table-cell text-xs text-center">Vence em</TableHead>
                    <TableHead className="text-xs text-center">Dias restantes</TableHead>
                    <TableHead className="text-xs text-right">Honorário mensal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aVencer.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="hidden sm:table-cell text-xs font-medium">#{c.numero}</TableCell>
                      <TableCell className="text-xs">{c.cliente}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-center">
                        {c.dataFim ? new Date(c.dataFim).toLocaleDateString('pt-BR') : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px]',
                            c.diasRestantes != null && c.diasRestantes <= 15
                              ? STRONG.red
                              : c.diasRestantes != null && c.diasRestantes <= 30
                                ? STRONG.amber
                                : STRONG.blue,
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

/**
 * Funil comercial na forma da planilha do time: Qualificação (quem recebe e
 * qualifica o lead) e Fechamento (quem conduz reunião, proposta e contrato),
 * nos cartões e por pessoa. As regras de contagem estão no backend
 * (apps/api/src/crm/indicadores-comerciais.ts).
 */
function FunilComercial({ funil }: { funil: IndicadoresFunil }) {
  const t = funil.total
  const pessoas = funil.pessoas
  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> Funil — Qualificação
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard icon={Inbox} label="Leads recebidos" value={t.leadsRecebidos} color="#818cf8" />
            <StatCard icon={Phone} label="Qualif. por ligação" value={t.qualifLigacao} color="#34d399" />
            <StatCard icon={MessageCircle} label="Qualif. por WhatsApp" value={t.qualifWhatsapp} color="#10b981"
              sub={t.qualifOutros > 0 ? `+${t.qualifOutros} por outros canais` : undefined} />
            <StatCard icon={PhoneOff} label="Sem resposta" value={t.semResposta} color="#fbbf24" />
            <StatCard icon={UserX} label="Desqualificados" value={t.desqualificados} color="#f87171" />
            <StatCard icon={CalendarPlus} label="Reuniões agendadas" value={t.reunioesAgendadas} color="#60a5fa" />
          </div>
        </div>
        <div className="xl:col-span-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileSignature className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> Funil — Fechamento
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-1 gap-3">
            <StatCard icon={CalendarCheck} label="Reuniões realizadas" value={t.reunioesRealizadas} color="#60a5fa" />
            <StatCard icon={Send} label="Propostas enviadas" value={t.propostasEnviadas} color="#a78bfa" />
            <StatCard icon={FileSignature} label="Contratos assinados" value={t.contratosAssinados} color={MODULE_COLOR}
              sub={funil.servicosDeEntrada === 0 ? 'nenhum serviço marcado como entrada de cliente' : undefined} />
          </div>
        </div>
      </div>

      {pessoas.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <h3 className="text-[13px] font-semibold text-foreground">Funil por pessoa</h3>
          </div>
          <div className="overflow-x-auto nice-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs min-w-[160px]">Pessoa</TableHead>
                  {COLUNAS_FUNIL.map((c) => (
                    <TableHead key={c.campo}
                      className={cn('text-xs text-center whitespace-nowrap', c.campo === 'reunioesRealizadas' && 'border-l border-border')}>
                      {c.rotulo}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pessoas.map((p) => (
                  <TableRow key={p.userId ?? 'sem'}>
                    <TableCell className="text-xs">
                      <span className="flex items-center gap-2">
                        <UserAvatar user={p.userId ? { name: p.nome, image: p.image } : null} className="h-6 w-6 text-[9px]" />
                        <span className={cn('truncate', !p.userId && 'text-muted-foreground italic')}>{p.nome}</span>
                      </span>
                    </TableCell>
                    {COLUNAS_FUNIL.map((c) => (
                      <TableCell key={c.campo}
                        className={cn('text-xs text-center tabular-nums', !p[c.campo] && 'text-muted-foreground/50', c.campo === 'reunioesRealizadas' && 'border-l border-border')}>
                        {p[c.campo]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell className="text-xs">Total</TableCell>
                  {COLUNAS_FUNIL.map((c) => (
                    <TableCell key={c.campo}
                      className={cn('text-xs text-center tabular-nums', c.campo === 'reunioesRealizadas' && 'border-l border-border')}>
                      {t[c.campo]}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </>
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
