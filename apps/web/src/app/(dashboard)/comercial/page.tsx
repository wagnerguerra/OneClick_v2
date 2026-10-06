'use client'

import { useState, useEffect, useCallback, useRef, useMemo, type ElementType, type ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Target, TrendingUp, Percent, CircleDollarSign, FileText, AlertTriangle,
  FileCheck, Landmark, CalendarClock, RefreshCw, Loader2, BarChart3,
  Filter, Users, Inbox, Phone, MessageCircle, PhoneOff, UserX, CalendarPlus,
  CalendarCheck, Send, FileSignature, ListChecks, ExternalLink, MoreVertical, Undo2,
} from 'lucide-react'
import {
  Button, Card, Badge, Input,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { alerts } from '@/lib/alerts'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { cn } from '@saas/ui'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { BADGE, STRONG, TEXT } from '@/lib/color-styles'
import { UserAvatar } from '@/components/ui/user-avatar'
import { RelatorioComercial, type TipoRelatorioComercial } from './_components/relatorios-comerciais'
import { Ajuda, AJUDA } from './_components/ajuda'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { ChartTooltip, CHART_CURSOR_FILL } from '@/components/chart-tooltip'
import { ORCAMENTO_STATUS_COLORS, ORCAMENTO_STATUS_LABELS, CONTRATO_STATUS_COLORS, CONTRATO_STATUS_LABELS } from '@saas/types'

const PRIMARY = 'var(--color-primary)'

// ── Período ──────────────────────────────────────────────────
// Data inicial e final (inclusivas, no fuso de Brasília — o backend converte),
// e elas valem para TODAS as abas. Começa no mês corrente. Data vazia = aberta
// daquele lado. (Os atalhos "este mês", "últimos 30 dias"... saíram em
// 25/09/2026, a pedido do Wagner.)

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function mesCorrente(hoje = new Date()): { de: string; ate: string } {
  return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(hoje) }
}

// ── Abas ─────────────────────────────────────────────────────
// Em 25/09/2026 o painel virou abas: numa página só, os 19 cartões e os seis
// gráficos disputavam a largura e os KPIs do pipeline ficavam espremidos. No
// mesmo dia os relatórios comerciais (antes atrás do botão "Relatórios", em
// /comercial/relatorios) entraram como abas, seguindo o mesmo período.
const ABAS = [
  { v: 'funil', Icon: Phone, label: 'Funil comercial' },
  { v: 'pipeline', Icon: Target, label: 'Pipeline & Orçamentos' },
  { v: 'contratos', Icon: FileCheck, label: 'Contratos' },
  { v: 'funil-unificado', Icon: Filter, label: 'Funil unificado' },
  { v: 'mrr', Icon: Landmark, label: 'MRR recorrente vs. avulso' },
  { v: 'vendedores', Icon: Users, label: 'Ranking de vendedores' },
  { v: 'descontos', Icon: Percent, label: 'Descontos & margem' },
] as const
const ABAS_RELATORIO: ReadonlyArray<string> = ['funil-unificado', 'mrr', 'vendedores', 'descontos']
type Aba = (typeof ABAS)[number]['v']
const CHAVE_ABA = 'comercial:aba'

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
/** Linha da lista que abre ao clicar num total (crm.indicadorDetalhe). */
interface ItemIndicador {
  chave: string
  oportunidadeId: string | null
  numero: number | null
  nome: string
  contato: string | null
  etapa: { nome: string; cor: string } | null
  orcamentoId: string | null
  orcamentoNumero: number | null
  valor: number | null
  orcamentoStatus: string | null
  contratoFechadoEm: string | null
  quando: string
  detalhe: string | null
  responsavel: string | null
}

interface IndicadoresFunil {
  total: TotaisFunil
  pessoas: Array<TotaisFunil & { userId: string | null; nome: string; image: string | null }>
  servicosDeEntrada: number
}

// Rótulos e cores de status vêm de @saas/types (tipados pelo enum de status:
// status novo sem rótulo/cor quebra o typecheck, não dessincroniza calado).
const ORC_STATUS_LABEL: Record<string, string> = ORCAMENTO_STATUS_LABELS
/** Cor do status do orçamento (a mesma do kanban de /orcamentos). */
const ORC_STATUS_COR: Record<string, string> = ORCAMENTO_STATUS_COLORS
const CONTRATO_STATUS_LABEL: Record<string, string> = {
  ...CONTRATO_STATUS_LABELS,
  // Vigência da carteira (Gestão de Contratos) — a aba Contratos lê de lá.
  // Não são status do enum de contrato, por isso não estão em @saas/types.
  VENCIDO: 'Vencido', SEM_VIGENCIA: 'Sem vigência informada',
}
/** Cor da fatia de contrato: status do enum + vigência da carteira (semáforo). */
const CONTRATO_STATUS_COR: Record<string, string> = {
  ...CONTRATO_STATUS_COLORS,
  VENCIDO: '#ef4444',      // vermelho — o mesmo "Vencido" de Benefícios e Certificados
  SEM_VIGENCIA: '#f59e0b', // âmbar — falta cadastrar a data de fim
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const formatCompact = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)

interface PainelData {
  crmStats: any
  crmFunil: any
  /** Pipeline atual (cards no funil hoje), sem o recorte do período. */
  crmPipeline: any
  /** Enviados e aprovados no período — base da taxa de aprovação. */
  orcFunil: any
  crmDesempenho: any[]
  orcStats: any
  orcDash: any
  contratos: any
  mrrAvulso: any
  funil: IndicadoresFunil | null
}

export default function ComercialPage() {
  // Aba: `?aba=` na URL (links e a rota antiga /comercial/relatorios) vence;
  // sem ela, a última aberta neste navegador (conveniência de quem vê).
  const searchParams = useSearchParams()
  const abaUrl = searchParams.get('aba')
  const [aba, setAba] = useState<Aba>('funil')
  useEffect(() => {
    if (ABAS.some((a) => a.v === abaUrl)) { setAba(abaUrl as Aba); return }
    try {
      const salva = localStorage.getItem(CHAVE_ABA)
      if (ABAS.some((a) => a.v === salva)) setAba(salva as Aba)
    } catch { /* storage indisponível: fica na primeira aba */ }
  }, [abaUrl])
  // Recarga dos relatórios: sobe no botão atualizar e no auto-refresh.
  const [versao, setVersao] = useState(0)
  const trocarAba = (v: string) => {
    setAba(v as Aba)
    try { localStorage.setItem(CHAVE_ABA, v) } catch { /* ignora */ }
  }

  const inicial = useMemo(() => mesCorrente(), [])
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
      const [crmStats, crmFunil, crmDesempenho, orcStats, orcDash, contratos, mrrAvulso, funil, crmPipeline, orcFunil] = await Promise.all([
        safe((trpc.crm as any).getStats.query()),
        safe((trpc.crm as any).reportFunil.query(periodo)),
        safe((trpc.crm as any).reportDesempenho.query(periodo)),
        safe((trpc.orcamento as any).getStats.query(periodo)),
        safe((trpc.orcamento as any).getDashboardStats.query(periodo)),
        safe((trpc.contrato as any).reportComercial.query(periodo)),
        safe((trpc.orcamento as any).reportMrrAvulso.query(periodo)),
        safe((trpc.crm as any).indicadoresComerciais.query(periodo) as Promise<IndicadoresFunil>),
        safe((trpc.crm as any).reportFunil.query({ ...periodo, apenasAtivos: true })),
        safe((trpc.orcamento as any).reportFunilComercial.query(periodo)),
      ])
      if (!crmStats && !crmFunil && !orcStats && !contratos) setErro(true)
      setData({
        crmStats, crmFunil,
        crmDesempenho: Array.isArray(crmDesempenho) ? crmDesempenho : [],
        orcStats, orcDash, contratos, mrrAvulso, funil, crmPipeline, orcFunil,
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
    const id = setInterval(() => { load(); setVersao((v) => v + 1) }, 60_000)
    return () => clearInterval(id)
  }, [load, invertido])

  // ── KPIs derivados ──────────────────────────────────────────
  const funilEtapas: any[] = data?.crmFunil?.etapas ?? []
  // Oportunidades ativas / valor em pipeline = cards CRIADOS no período que
  // seguem no funil: ativos e fora das etapas de ganho, perda e Declínio
  // (identificada pelo nome, a mesma regra do CRM). Difere de "Leads
  // recebidos" por tirar os arquivados, os em Declínio e os ganhos.
  const crmAtivas = ((data?.crmPipeline?.etapas ?? []) as any[])
    .filter((e) => !e.ehGanho && !e.ehPerda && !/decl/i.test(e.nome ?? ''))
  const oportunidadesAtivas = crmAtivas.reduce((s, e) => s + (e.count ?? 0), 0)
  const pipelineValor = crmAtivas.reduce((s, e) => s + (e.valor ?? 0), 0)
  const taxaConversao = data?.crmFunil?.taxaGeral ?? 0

  const orcPorStatus: any[] = data?.orcStats?.porStatus ?? []
  // Taxa de aprovação no PERÍODO: aprovados ÷ enviados (cancelados fora). Antes
  // era de todos os tempos, contava só APROVADO/LIBERADO/FINALIZADO (o que foi
  // aprovado e depois encerrado sumia) e dividia por tudo, inclusive rascunho.
  const estagiosOrc: Array<{ label: string; count: number }> = data?.orcFunil?.funil ?? []
  const orcEnviadosPeriodo = estagiosOrc.find((e) => e.label === 'Orçamentos enviados')?.count ?? 0
  const orcAprovadosPeriodo = estagiosOrc.find((e) => e.label === 'Orçamentos aprovados')?.count ?? 0
  const taxaAprovacao = orcEnviadosPeriodo > 0 ? Math.round((orcAprovadosPeriodo / orcEnviadosPeriodo) * 100) : 0
  const orcDash = data?.orcDash
  const orcEmAberto = orcDash?.permitido
    ? (orcDash.aguardandoEnvio ?? 0) + (orcDash.aguardandoAprovacao ?? 0)
    : orcPorStatus.filter((s) => ['NOVO', 'A_ENVIAR', 'ENVIADO'].includes(s.status)).reduce((a, s) => a + (s._count ?? 0), 0)
  const orcValorPendente = orcDash?.permitido ? (orcDash.valorPendente ?? 0) : 0
  const orcAtrasados = orcDash?.permitido ? (orcDash.atrasados ?? 0) : 0

  const ct = data?.contratos
  const mrr = ct?.mrr ?? 0
  const vigentes = ct?.vigentes ?? 0
  const vencemNoPeriodo = ct?.vencemNoPeriodo ?? ct?.aVencer30 ?? 0

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
  // Cor por STATUS (fonte única em @saas/types), não por posição: a mesma
  // fatia tem sempre a mesma cor, com significado, qualquer que seja o período.
  const orcPie = orcPorStatus
    .filter((s) => (s._count ?? 0) > 0)
    .map((s) => ({ name: ORC_STATUS_LABEL[s.status] ?? s.status, value: s._count, fill: (ORCAMENTO_STATUS_COLORS as Record<string, string>)[s.status] ?? '#94a3b8' }))
  const ctPorStatus: any[] = ct?.porStatus ?? []
  const ctPie = ctPorStatus
    .filter((s) => (s.count ?? 0) > 0)
    .map((s) => ({ name: CONTRATO_STATUS_LABEL[s.status] ?? s.status, value: s.count, fill: CONTRATO_STATUS_COR[s.status] ?? '#94a3b8' }))
  const ctEvolucao: any[] = ct?.evolucaoMensal ?? []
  const aVencer: any[] = ct?.aVencer ?? []

  return (
    <div className="flex flex-col gap-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
          {refreshing && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <div className="flex flex-wrap items-center gap-1.5">
            <Input type="date" aria-label="Data inicial" value={de} max={ate || undefined}
              onChange={(e) => setDe(e.target.value)}
              className={cn('h-8 w-[136px] text-xs', invertido && 'border-destructive')} />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" aria-label="Data final" value={ate} min={de || undefined}
              onChange={(e) => setAte(e.target.value)}
              className={cn('h-8 w-[136px] text-xs', invertido && 'border-destructive')} />
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => { load(); setVersao((v) => v + 1) }}
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
          <Loader2 className="h-6 w-6 animate-spin text-primary-on-surface" />
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

          {/* Abas sublinhadas — o mesmo padrão das abas do CRM e dos relatórios. */}
          <div className="flex gap-1 border-b border-border/40 overflow-x-auto scrollbar-none">
            {ABAS.map(({ v, Icon, label }) => {
              const ativa = aba === v
              return (
                <button key={v} type="button" onClick={() => trocarAba(v)}
                  className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                    ativa ? 'text-foreground border-primary-on-surface' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              )
            })}
          </div>

            {/* ── Aba Funil: Qualificação + Fechamento, e por pessoa ── */}
            {aba === 'funil' && (
            <div className="flex flex-col gap-5">
              {/* ── Funil comercial: Qualificação + Fechamento ── */}
              {data?.funil
                ? <FunilComercial funil={data.funil} periodo={periodo} onChanged={load} />
                : <p className="text-sm text-muted-foreground py-10 text-center">Sem acesso ao CRM ou sem dados no período.</p>}
            </div>
            )}

            {/* ── Aba Pipeline & Orçamentos ── */}
            {aba === 'pipeline' && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-primary-on-surface" /> CRM — Pipeline
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <KpiFunil icon={Target} label="Oportunidades ativas" ajuda={AJUDA.oportunidadesAtivas} value={oportunidadesAtivas} color="#818cf8" sub="criadas no período, ainda no funil" />
                  <KpiFunil icon={TrendingUp} label="Valor em pipeline" ajuda={AJUDA.valorPipeline} value={formatCompact(pipelineValor)} color="#34d399" sub={formatCurrency(pipelineValor)} />
                  <KpiFunil icon={Percent} label="Taxa de conversão" ajuda={AJUDA.taxaConversao} value={`${taxaConversao}%`} color={PRIMARY} />
                </div>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <CircleDollarSign className="h-3.5 w-3.5 text-primary-on-surface" /> Orçamentos
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <KpiFunil icon={FileText} label="Em aberto" ajuda={AJUDA.emAberto} value={orcEmAberto} color="#60a5fa" />
                  <KpiFunil icon={CircleDollarSign} label="Valor pendente" ajuda={AJUDA.valorPendente} value={formatCompact(orcValorPendente)} color="#34d399" sub={orcDash?.permitido ? formatCurrency(orcValorPendente) : 'sem acesso a valores'} />
                  <KpiFunil icon={Percent} label="Taxa de aprovação" ajuda={AJUDA.taxaAprovacao} value={`${taxaAprovacao}%`} color="#a78bfa"
                    sub={`${orcAprovadosPeriodo} aprov. ÷ ${orcEnviadosPeriodo} env. no período`} />
                  <KpiFunil icon={AlertTriangle} label="Atrasados" ajuda={AJUDA.atrasados} value={orcAtrasados} color="#f97316" />
                </div>
                </div>

              {/* ── Receita recorrente vs. avulsa (vendas aprovadas no período) ── */}
              {mrrAvulso && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <CircleDollarSign className="h-3.5 w-3.5 text-primary-on-surface" /> Receita — recorrente vs. avulsa <Ajuda texto={AJUDA.mixReceita} />
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
                          onClick={() => trocarAba('mrr')}
                          className="self-start text-[11px] font-medium hover:underline text-primary-on-surface"
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
                  <h3 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-1.5">Funil de vendas (CRM) <Ajuda texto={AJUDA.funilCrm} /></h3>
                  <div className="h-[280px]">
                    {funilChart.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={funilChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                          <Tooltip
                            content={<ChartTooltip
                              format={(v: number, n?: string) => (n === 'Valor' ? formatCurrency(v) : v)}
                              seriesColor={(_serie, etapa) => (etapa.cor as string) || PRIMARY}
                            />}
                            cursor={{ fill: CHART_CURSOR_FILL }}
                          />
                          <Bar dataKey="count" name="Quantidade" radius={[4, 4, 0, 0]}>
                            {funilChart.map((e: any) => (
                              <Cell key={e.etapaId} fill={e.cor || PRIMARY} opacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyMini />}
                  </div>
                </Card>

                <Card className="lg:col-span-5 p-4">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-1.5">Orçamentos por status <span className="font-normal text-muted-foreground">· criados no período</span> <Ajuda texto={AJUDA.orcPorStatus} /></h3>
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

              {/* ── Desempenho por responsavel (CRM) ── */}
              {data?.crmDesempenho.length ? (
                <Card className="p-4">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-1.5">Desempenho por responsável (CRM) <Ajuda texto={AJUDA.desempenho} /></h3>
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
                        <Bar dataKey="total" name="Total" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              ) : null}

            </div>
            )}

            {/* ── Aba Contratos ── */}
            {aba === 'contratos' && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                  <FileCheck className="h-3.5 w-3.5 text-primary-on-surface" /> Contratos — Carteira
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <KpiFunil icon={FileCheck} label="Clientes na carteira" ajuda={AJUDA.clientesCarteira} value={vigentes} color="#34d399" />
                  <KpiFunil icon={Landmark} label="MRR (receita recorrente)" ajuda={AJUDA.mrr} value={formatCompact(mrr)} color={PRIMARY} sub={formatCurrency(mrr)} />
                  <KpiFunil icon={CalendarClock} label="Vencem no período" ajuda={AJUDA.aVencer} value={vencemNoPeriodo} color="#fbbf24" />
                </div>
              </div>

              {/* ── Graficos linha 2: Contratos por status + evolucao ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <Card className="lg:col-span-5 p-4">
                  <h3 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-1.5">Carteira por vigência <Ajuda texto={AJUDA.carteiraVigencia} /></h3>
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
                  <h3 className="text-[13px] font-semibold text-foreground mb-4 flex items-center gap-1.5">Clientes — entradas × saídas por mês <Ajuda texto={AJUDA.entradasSaidas} /></h3>
                  <div className="h-[280px]">
                    {ctEvolucao.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ctEvolucao} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                          <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                          <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_CURSOR_FILL }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="novos" name="Entradas" fill="#34d399" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="encerrados" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <EmptyMini />}
                  </div>
                </Card>
              </div>

              {/* ── Contratos a vencer ── */}
              {aVencer.length ? (
                <Card className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-primary-on-surface" />
                    <h3 className="text-[13px] font-semibold text-foreground">Contratos que vencem no período</h3>
                    <Ajuda texto={AJUDA.tabelaAVencer} />
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
            </div>
            )}

            {/* ── Abas de relatório (antes em /comercial/relatorios) ── */}
            {ABAS_RELATORIO.includes(aba) && (
              <RelatorioComercial tipo={aba as TipoRelatorioComercial} periodo={periodo} versao={versao} />
            )}

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
function FunilComercial({ funil, periodo, onChanged }: {
  funil: IndicadoresFunil
  periodo: { de?: string; ate?: string }
  /** Recarrega o painel depois de marcar/desfazer um contrato fechado. */
  onChanged: () => void
}) {
  const t = funil.total
  const pessoas = funil.pessoas
  const [aberto, setAberto] = useState<(typeof COLUNAS_FUNIL)[number] | null>(null)
  return (
    <>
      {/* Uma linha só: 6 cartões de Qualificação + 3 de Fechamento, todos da
          mesma largura (6fr/3fr). Abaixo de lg os dois grupos empilham. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,6fr)_minmax(0,3fr)] gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-primary-on-surface" /> Funil — Qualificação
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiFunil icon={Inbox} label="Leads recebidos" ajuda={AJUDA.leadsRecebidos} value={t.leadsRecebidos} color="#818cf8" />
            <KpiFunil icon={Phone} label="Qualif. por ligação" ajuda={AJUDA.qualifLigacao} value={t.qualifLigacao} color="#34d399" />
            <KpiFunil icon={MessageCircle} label="Qualif. por WhatsApp" ajuda={AJUDA.qualifWhatsapp} value={t.qualifWhatsapp} color="#10b981"
              sub={t.qualifOutros > 0 ? `+${t.qualifOutros} outros canais` : undefined} />
            <KpiFunil icon={PhoneOff} label="Sem resposta" ajuda={AJUDA.semResposta} value={t.semResposta} color="#fbbf24" />
            <KpiFunil icon={UserX} label="Desqualificados" ajuda={AJUDA.desqualificados} value={t.desqualificados} color="#f87171" />
            <KpiFunil icon={CalendarPlus} label="Reuniões agendadas" ajuda={AJUDA.reunioesAgendadas} value={t.reunioesAgendadas} color="#60a5fa" />
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <FileSignature className="h-3.5 w-3.5 text-primary-on-surface" /> Funil — Fechamento
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiFunil icon={CalendarCheck} label="Reuniões realizadas" ajuda={AJUDA.reunioesRealizadas} value={t.reunioesRealizadas} color="#60a5fa" />
            <KpiFunil icon={Send} label="Propostas enviadas" ajuda={AJUDA.propostasEnviadas} value={t.propostasEnviadas} color="#a78bfa" />
            <KpiFunil icon={FileSignature} label="Contratos assinados" ajuda={AJUDA.contratosAssinados} value={t.contratosAssinados} color={PRIMARY}
              sub={funil.servicosDeEntrada === 0 ? 'sem serviço de entrada' : undefined}
              title={funil.servicosDeEntrada === 0 ? 'Nenhum serviço está marcado como entrada de novo cliente (cadastro do serviço).' : undefined} />
          </div>
        </div>
      </div>

      {pessoas.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Users className="h-4 w-4 text-primary-on-surface" />
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
                      <span className="inline-flex items-center gap-1">{c.rotulo}<Ajuda texto={AJUDA[c.campo]} /></span>
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
                      className={cn('text-xs text-center tabular-nums p-1', c.campo === 'reunioesRealizadas' && 'border-l border-border')}>
                      {t[c.campo] > 0 ? (
                        <button type="button" onClick={() => setAberto(c)}
                          title={`Ver ${c.rotulo.toLowerCase()}`}
                          className="min-w-8 rounded px-2 py-1 underline decoration-dotted underline-offset-4 hover:bg-background hover:no-underline transition-colors text-primary-on-surface">
                          {t[c.campo]}
                        </button>
                      ) : t[c.campo]}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <DetalheIndicadorModal coluna={aberto} periodo={periodo} onClose={() => setAberto(null)} onChanged={onChanged} />
    </>
  )
}

/**
 * Lista por trás de um total do funil. Vem da mesma apuração do número
 * (crm.indicadorDetalhe), então a contagem da lista bate com o total clicado.
 */
function DetalheIndicadorModal({ coluna, periodo, onClose, onChanged }: {
  coluna: (typeof COLUNAS_FUNIL)[number] | null
  periodo: { de?: string; ate?: string }
  onClose: () => void
  onChanged: () => void
}) {
  const [itens, setItens] = useState<ItemIndicador[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  // Orçamento cuja marca de contrato fechado está sendo informada.
  const [fechando, setFechando] = useState<ItemIndicador | null>(null)

  useEffect(() => {
    if (!coluna) return
    let vivo = true
    setErro(null)
    if (recarga === 0) setItens(null)
    ;(trpc.crm as any).indicadorDetalhe.query({ ...periodo, campo: coluna.campo })
      .then((r: ItemIndicador[]) => { if (vivo) setItens(r) })
      .catch((e: Error) => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [coluna, periodo, recarga])
  useEffect(() => { if (!coluna) setRecarga(0) }, [coluna])

  const depoisDeMarcar = () => { setRecarga((n) => n + 1); onChanged() }

  const desfazer = async (i: ItemIndicador) => {
    const ok = await alerts.confirm({
      title: 'Desfazer contrato fechado?',
      text: `O orçamento #${i.orcamentoNumero} deixa de contar como contrato fechado.`,
      confirmText: 'Desfazer',
      icon: 'warning',
      destructive: true,
    })
    if (!ok) return
    try {
      await (trpc.orcamento as any).marcarContratoFechado.mutate({ id: i.orcamentoId, fechadoEm: null })
      depoisDeMarcar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const deOrcamento = coluna?.campo === 'propostasEnviadas' || coluna?.campo === 'contratosAssinados'
  const comDetalhe = coluna?.campo === 'reunioesAgendadas' || coluna?.campo === 'reunioesRealizadas'
    || coluna?.campo === 'semResposta' || coluna?.campo === 'desqualificados'
  const fmtData = (d: string) => new Date(d).toLocaleDateString('pt-BR')
  const intervalo = periodo.de || periodo.ate
    ? `${periodo.de ? fmtData(`${periodo.de}T12:00:00`) : 'início'} a ${periodo.ate ? fmtData(`${periodo.ate}T12:00:00`) : 'hoje'}`
    : 'todo o período'

  return (
    <Dialog open={!!coluna} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[min(1280px,95vw)]">
        <DialogHeaderIcon icon={ListChecks}>
          <DialogTitle className="text-[15px]">{coluna?.rotulo}</DialogTitle>
          <DialogDescription className="text-[11px]">
            {itens ? `${itens.length} registro(s)` : 'Carregando…'} · {intervalo}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="max-h-[72vh] overflow-y-auto nice-scrollbar p-0">
          {erro ? (
            <p className={cn('text-sm py-8 text-center', TEXT.rose)}>{erro}</p>
          ) : !itens ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : itens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nada no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[64px]">Card</TableHead>
                  <TableHead className="text-xs">Lead</TableHead>
                  {deOrcamento
                    ? <>
                        <TableHead className="text-xs">Orçamento</TableHead>
                        <TableHead className="text-xs">Situação</TableHead>
                      </>
                    : <TableHead className="hidden sm:table-cell text-xs">Etapa</TableHead>}
                  {comDetalhe && <TableHead className="hidden md:table-cell text-xs">{coluna?.campo.startsWith('reunioes') ? 'Reunião' : 'Canal'}</TableHead>}
                  <TableHead className="text-xs text-center">Data</TableHead>
                  <TableHead className="hidden sm:table-cell text-xs">Responsável</TableHead>
                  {deOrcamento && <TableHead className="text-xs w-[48px] text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.chave}>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{i.numero != null ? `#${i.numero}` : '—'}</TableCell>
                    <TableCell className="text-xs">
                      {i.oportunidadeId ? (
                        <Link href={`/crm?op=${i.oportunidadeId}`} target="_blank" className="inline-flex items-center gap-1 font-medium hover:underline">
                          {i.nome}<ExternalLink className="h-3 w-3 opacity-50" />
                        </Link>
                      ) : <span className="font-medium">{i.nome}</span>}
                      {i.contato && <span className="text-muted-foreground"> · {i.contato}</span>}
                    </TableCell>
                    {deOrcamento ? (
                      <>
                        <TableCell className="text-xs whitespace-nowrap">
                          {i.orcamentoId ? (
                            <Link href={`/orcamentos/${i.orcamentoId}`} target="_blank" className="hover:underline">
                              #{i.orcamentoNumero}{i.valor != null && <span className="text-muted-foreground"> · {formatCurrency(i.valor)}</span>}
                            </Link>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="flex flex-wrap items-center gap-1.5">
                            {i.orcamentoStatus && (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ORC_STATUS_COR[i.orcamentoStatus] ?? '#94a3b8' }} />
                                {ORC_STATUS_LABEL[i.orcamentoStatus] ?? i.orcamentoStatus}
                              </span>
                            )}
                            {i.contratoFechadoEm && (
                              <span className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium whitespace-nowrap', BADGE.emerald)}>
                                <FileSignature className="h-3 w-3" />Contrato fechado · {fmtData(i.contratoFechadoEm)}
                              </span>
                            )}
                          </span>
                        </TableCell>
                      </>
                    ) : (
                      <TableCell className="hidden sm:table-cell text-xs">
                        {i.etapa ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: i.etapa.cor }} />{i.etapa.nome}
                          </span>
                        ) : '—'}
                      </TableCell>
                    )}
                    {comDetalhe && <TableCell className="hidden md:table-cell text-xs truncate max-w-[220px]">{i.detalhe ?? '—'}</TableCell>}
                    <TableCell className="text-xs text-center tabular-nums">{fmtData(i.quando)}</TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{i.responsavel ?? <span className="text-muted-foreground italic">—</span>}</TableCell>
                    {deOrcamento && (
                      <TableCell className="text-right">
                        {i.orcamentoId && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" title="Ações"><MoreVertical className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setFechando(i)}>
                                <FileSignature className="h-4 w-4" />
                                {i.contratoFechadoEm ? 'Alterar data do contrato' : 'Marcar contrato fechado'}
                              </DropdownMenuItem>
                              {i.contratoFechadoEm && (
                                <DropdownMenuItem onClick={() => desfazer(i)} className="text-destructive focus:text-destructive">
                                  <Undo2 className="h-4 w-4" />Desfazer contrato fechado
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem asChild>
                                <Link href={`/orcamentos/${i.orcamentoId}`} target="_blank">
                                  <ExternalLink className="h-4 w-4" />Abrir orçamento
                                </Link>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogBody>
      </DialogContent>

      <ContratoFechadoModal item={fechando} onClose={() => setFechando(null)} onSaved={() => { setFechando(null); depoisDeMarcar() }} />
    </Dialog>
  )
}

/**
 * Informa que o orçamento virou contrato, e em que dia. É a fonte mais forte
 * do indicador "Contratos assinados": vale mesmo sem aprovação formal ou
 * serviço de entrada (regra em apps/api/src/crm/indicadores-comerciais.ts).
 */
function ContratoFechadoModal({ item, onClose, onSaved }: {
  item: ItemIndicador | null
  onClose: () => void
  onSaved: () => void
}) {
  const [data, setData] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (!item) return
    setData(item.contratoFechadoEm ? iso(new Date(item.contratoFechadoEm)) : iso(new Date()))
  }, [item])

  const salvar = async () => {
    if (!item?.orcamentoId || !data) return
    setSalvando(true)
    try {
      await (trpc.orcamento as any).marcarContratoFechado.mutate({ id: item.orcamentoId, fechadoEm: data })
      alerts.success('Contrato fechado registrado', `Orçamento #${item.orcamentoNumero}`)
      onSaved()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[440px]">
        <DialogHeaderIcon icon={FileSignature} color="emerald">
          <DialogTitle className="text-[15px]">Contrato fechado</DialogTitle>
          <DialogDescription className="text-[11px]">
            Orçamento #{item?.orcamentoNumero} · {item?.nome}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-1.5">
          <label className="text-[13px] font-semibold" htmlFor="contrato-fechado-em">Data do fechamento</label>
          <Input id="contrato-fechado-em" type="date" className="h-9 text-sm" value={data} max={iso(new Date())}
            onChange={(e) => setData(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">
            O orçamento passa a contar em &quot;Contratos assinados&quot; nesta data, no painel e no funil por pessoa.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variant="success" size="sm" onClick={salvar} disabled={salvando || !data}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Cartão compacto dos indicadores do painel. O StatCard põe um quadro de 40px
 * ao lado do RÓTULO, o que não cabe em nove/dez cartões numa linha: aqui o
 * rótulo vai em cima, na largura toda (até duas linhas), e o ícone fica ao
 * lado do NÚMERO, onde pode ser maior.
 */
function KpiFunil({ icon: Icon, label, value, color, sub, title, ajuda }: {
  icon: ElementType
  label: string
  value: number | string
  color: string
  sub?: string
  title?: string
  /** Texto do "(?)": de onde vem o número e o que entra nele. */
  ajuda?: ReactNode
}) {
  return (
    <Card className="relative overflow-hidden p-3 pb-3.5" title={ajuda ? title : (title ?? (sub ? `${label}: ${sub}` : label))}>
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground leading-tight line-clamp-2 min-h-[2lh]">{label}</p>
        {ajuda && <Ajuda texto={ajuda} className="mt-px" />}
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-none tabular-nums whitespace-nowrap">{value}</p>
          {sub && <p className="text-[10.5px] text-muted-foreground truncate mt-1">{sub}</p>}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: color }} />
    </Card>
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
