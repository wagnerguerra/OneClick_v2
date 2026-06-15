/**
 * Catálogo de métricas dos Painéis de Gestão à Vista (TV).
 *
 * Cada métrica define de qual FONTE (`source`) ela depende e como EXTRAIR
 * seu dado a partir do resultado dessa fonte. O service chama cada fonte uma
 * única vez (reusando os reports já existentes) e roda os `extract`.
 *
 * `kind` define o formato do dado (e quais visuais o bloco pode usar):
 *  - number/currency/percent/duration/rating → { value, sub? }
 *  - distribution                            → { items: [{name,value,color?}] }
 *  - series                                  → { points, series }
 *  - table                                   → { columns, rows }
 */

import {
  HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS, HELPDESK_PRIORIDADE_COLORS,
  HELPDESK_STATUS_FINAIS, HELPDESK_TIPO_LABELS,
} from '@saas/types'

export type MetricKind =
  | 'number' | 'currency' | 'percent' | 'duration' | 'rating'
  | 'distribution' | 'series' | 'table'
export type SourceName = 'comercial' | 'helpdesk'

export interface MetricDef {
  id: string
  label: string
  modulo: string
  kind: MetricKind
  source: SourceName
  visuals: string[] // visuais permitidos p/ este kind
  extract: (src: any) => any
}

const PALETTE = ['#fb7185', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#22d3ee', '#f472b6']
const STATUS_HD: Record<string, string> = {
  NOVO: '#3b82f6', AGUARDANDO_AUDITORIA: '#06b6d4', EM_ANDAMENTO: '#f59e0b',
  RESOLVIDO: '#a855f7', CONCLUIDO: '#10b981', CANCELADO: '#ef4444',
}
const CSAT_COR: Record<number, string> = { 1: '#ef4444', 2: '#f59e0b', 3: '#eab308', 4: '#84cc16', 5: '#10b981' }
const ORC_STATUS_LABEL: Record<string, string> = {
  NOVO: 'Novo', A_ENVIAR: 'A enviar', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
  LIBERADO: 'Liberado', FINALIZADO: 'Finalizado', ENCERRADO: 'Encerrado',
}
const CONTRATO_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', AGUARDANDO_ASSINATURA: 'Aguard. assinatura', ASSINADO: 'Assinado',
  VIGENTE: 'Vigente', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado',
}

const KPI = ['kpi']
const DIST = ['donut', 'bar']
const SERIES = ['bar', 'line']
const TABLE = ['table', 'list']

// ── Helpers de derivação comercial ────────────────────────────────
function crmAtivas(src: any): any[] {
  const etapas: any[] = src?.crmFunil?.etapas ?? []
  return etapas.filter((e) => !e.ehGanho && !e.ehPerda)
}
function orcEmAberto(src: any): number {
  const od = src?.orcDash
  if (od?.permitido) return (od.aguardandoEnvio ?? 0) + (od.aguardandoAprovacao ?? 0)
  const ps: any[] = src?.orcStats?.porStatus ?? []
  return ps.filter((s) => ['NOVO', 'A_ENVIAR', 'ENVIADO'].includes(s.status)).reduce((a, s) => a + (s._count ?? 0), 0)
}
function taxaAprovacao(src: any): number {
  const ps: any[] = src?.orcStats?.porStatus ?? []
  const total = src?.orcStats?.total ?? 0
  const aprov = ps.filter((s) => ['APROVADO', 'LIBERADO', 'FINALIZADO'].includes(s.status)).reduce((a, s) => a + (s._count ?? 0), 0)
  return total > 0 ? Math.round((aprov / total) * 100) : 0
}

// ════════════════════════════════════════════════════════════════
// CATÁLOGO
// ════════════════════════════════════════════════════════════════

export const METRIC_CATALOG: MetricDef[] = [
  // ── COMERCIAL ──────────────────────────────────────────────────
  { id: 'comercial.mrr', label: 'MRR (receita recorrente)', modulo: 'comercial', kind: 'currency', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.contratos?.mrr ?? 0 }) },
  { id: 'comercial.pipeline', label: 'Valor em pipeline (CRM)', modulo: 'comercial', kind: 'currency', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: crmAtivas(s).reduce((a, e) => a + (e.valor ?? 0), 0) }) },
  { id: 'comercial.conversao', label: 'Taxa de conversão (CRM)', modulo: 'comercial', kind: 'percent', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.crmFunil?.taxaGeral ?? 0 }) },
  { id: 'comercial.oportunidades', label: 'Oportunidades ativas', modulo: 'comercial', kind: 'number', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: crmAtivas(s).reduce((a, e) => a + (e.count ?? 0), 0) }) },
  { id: 'comercial.orcEmAberto', label: 'Orçamentos em aberto', modulo: 'comercial', kind: 'number', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: orcEmAberto(s) }) },
  { id: 'comercial.orcValorPendente', label: 'Valor pendente (orçamentos)', modulo: 'comercial', kind: 'currency', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.orcDash?.permitido ? (s.orcDash.valorPendente ?? 0) : 0 }) },
  { id: 'comercial.taxaAprovacao', label: 'Taxa de aprovação (orçamentos)', modulo: 'comercial', kind: 'percent', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: taxaAprovacao(s) }) },
  { id: 'comercial.orcAtrasados', label: 'Orçamentos atrasados', modulo: 'comercial', kind: 'number', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.orcDash?.permitido ? (s.orcDash.atrasados ?? 0) : 0 }) },
  { id: 'comercial.vigentes', label: 'Contratos vigentes', modulo: 'comercial', kind: 'number', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.contratos?.vigentes ?? 0 }) },
  { id: 'comercial.aVencer30', label: 'Contratos a vencer (30d)', modulo: 'comercial', kind: 'number', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.contratos?.aVencer30 ?? 0, sub: `${s?.contratos?.aVencer60 ?? 0} em até 60 dias` }) },
  { id: 'comercial.funil', label: 'Funil de vendas (CRM)', modulo: 'comercial', kind: 'distribution', source: 'comercial', visuals: DIST,
    extract: (s) => ({ items: (s?.crmFunil?.etapas ?? []).filter((e: any) => !e.ehPerda).map((e: any) => ({ name: e.nome, value: e.count ?? 0, color: e.cor || undefined })) }) },
  { id: 'comercial.orcStatus', label: 'Orçamentos por status', modulo: 'comercial', kind: 'distribution', source: 'comercial', visuals: DIST,
    extract: (s) => ({ items: (s?.orcStats?.porStatus ?? []).filter((x: any) => (x._count ?? 0) > 0).map((x: any, i: number) => ({ name: ORC_STATUS_LABEL[x.status] ?? x.status, value: x._count, color: PALETTE[i % PALETTE.length] })) }) },
  { id: 'comercial.contratoStatus', label: 'Contratos por status', modulo: 'comercial', kind: 'distribution', source: 'comercial', visuals: DIST,
    extract: (s) => ({ items: (s?.contratos?.porStatus ?? []).filter((x: any) => (x.count ?? 0) > 0).map((x: any, i: number) => ({ name: CONTRATO_STATUS_LABEL[x.status] ?? x.status, value: x.count, color: PALETTE[i % PALETTE.length] })) }) },
  { id: 'comercial.evolucaoContratos', label: 'Contratos novos × encerrados (6m)', modulo: 'comercial', kind: 'series', source: 'comercial', visuals: SERIES,
    extract: (s) => ({ points: (s?.contratos?.evolucaoMensal ?? []).map((m: any) => ({ x: m.mes, novos: m.novos, encerrados: m.encerrados })), series: [{ key: 'novos', label: 'Novos', color: '#34d399' }, { key: 'encerrados', label: 'Encerrados', color: '#ef4444' }] }) },
  { id: 'comercial.desempenho', label: 'Desempenho por responsável (CRM)', modulo: 'comercial', kind: 'table', source: 'comercial', visuals: TABLE,
    extract: (s) => ({
      columns: [
        { key: 'name', label: 'Responsável', kind: 'avatarName' },
        { key: 'total', label: 'Total', align: 'center' },
        { key: 'ganhos', label: 'Ganhos', align: 'center' },
        { key: 'valorGanho', label: 'Valor ganho', align: 'right', kind: 'currency' },
      ],
      rows: (s?.crmDesempenho ?? []).map((r: any) => ({ name: r.nome, image: r.image, total: r.total, ganhos: r.ganhos, valorGanho: r.valorGanho })),
    }) },
  { id: 'comercial.aVencer', label: 'Contratos a vencer (lista)', modulo: 'comercial', kind: 'table', source: 'comercial', visuals: TABLE,
    extract: (s) => ({
      columns: [
        { key: 'numero', label: 'Nº', kind: 'hash' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'dataFim', label: 'Vence em', align: 'center', kind: 'date' },
        { key: 'honorarioMensal', label: 'Honorário', align: 'right', kind: 'currency' },
      ],
      rows: (s?.contratos?.aVencer ?? []),
    }) },

  // ── HELPDESK ───────────────────────────────────────────────────
  { id: 'helpdesk.backlog', label: 'Backlog em aberto', modulo: 'helpdesk', kind: 'number', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.backlogAbertos ?? 0 }) },
  { id: 'helpdesk.atrasados', label: 'SLA estourado (atrasados)', modulo: 'helpdesk', kind: 'number', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.backlogAtrasados ?? 0 }) },
  { id: 'helpdesk.criados', label: 'Tickets criados (período)', modulo: 'helpdesk', kind: 'number', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.criados ?? 0 }) },
  { id: 'helpdesk.resolvidos', label: 'Tickets resolvidos (período)', modulo: 'helpdesk', kind: 'number', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.resolvidos ?? 0 }) },
  { id: 'helpdesk.sla', label: 'Cumprimento de SLA', modulo: 'helpdesk', kind: 'percent', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.slaCumprimentoPct ?? null }) },
  { id: 'helpdesk.csat', label: 'CSAT médio', modulo: 'helpdesk', kind: 'rating', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.csatMedio ?? null, sub: `${s?.kpis?.csatRespostas ?? 0} respostas` }) },
  { id: 'helpdesk.mttr', label: 'Tempo médio de resolução', modulo: 'helpdesk', kind: 'duration', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.mttrHoras ?? null }) },
  { id: 'helpdesk.porStatus', label: 'Backlog por status', modulo: 'helpdesk', kind: 'distribution', source: 'helpdesk', visuals: DIST,
    extract: (s) => ({ items: (s?.porStatus ?? []).filter((x: any) => !HELPDESK_STATUS_FINAIS.includes(x.status) && (x.total ?? 0) > 0).map((x: any) => ({ name: HELPDESK_STATUS_LABELS[x.status] ?? x.status, value: x.total, color: STATUS_HD[x.status] })) }) },
  { id: 'helpdesk.porPrioridade', label: 'Criados por prioridade', modulo: 'helpdesk', kind: 'distribution', source: 'helpdesk', visuals: DIST,
    extract: (s) => {
      const ord = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']
      return { items: (s?.porPrioridade ?? []).filter((x: any) => (x.total ?? 0) > 0).sort((a: any, b: any) => ord.indexOf(a.prioridade) - ord.indexOf(b.prioridade)).map((x: any) => ({ name: HELPDESK_PRIORIDADE_LABELS[x.prioridade] ?? x.prioridade, value: x.total, color: HELPDESK_PRIORIDADE_COLORS[x.prioridade] })) }
    } },
  { id: 'helpdesk.serie', label: 'Criados × resolvidos (período)', modulo: 'helpdesk', kind: 'series', source: 'helpdesk', visuals: SERIES,
    extract: (s) => ({ points: (s?.serie ?? []).map((p: any) => ({ x: p.periodo, criados: p.criados, resolvidos: p.resolvidos })), series: [{ key: 'criados', label: 'Criados', color: '#60a5fa' }, { key: 'resolvidos', label: 'Resolvidos', color: '#10b981' }] }) },
  { id: 'helpdesk.porCategoria', label: 'Tickets por categoria', modulo: 'helpdesk', kind: 'table', source: 'helpdesk', visuals: TABLE,
    extract: (s) => ({
      columns: [
        { key: 'nome', label: 'Categoria' },
        { key: 'total', label: 'Total', align: 'center' },
        { key: 'pct', label: '%', align: 'right', kind: 'percent' },
      ],
      rows: (s?.porCategoria ?? []),
    }) },
  { id: 'helpdesk.porAgente', label: 'Desempenho por agente', modulo: 'helpdesk', kind: 'table', source: 'helpdesk', visuals: TABLE,
    extract: (s) => ({
      columns: [
        { key: 'name', label: 'Agente', kind: 'avatarName' },
        { key: 'total', label: 'Resolvidos', align: 'center' },
        { key: 'mttrHoras', label: 'Tempo médio', align: 'center', kind: 'duration' },
        { key: 'slaPct', label: 'SLA', align: 'right', kind: 'percent' },
      ],
      rows: (s?.porResponsavel ?? []),
    }) },
  { id: 'helpdesk.slaEstourados', label: 'SLA estourado (lista)', modulo: 'helpdesk', kind: 'table', source: 'helpdesk', visuals: TABLE,
    extract: (s) => ({
      columns: [
        { key: 'numero', label: 'Nº', kind: 'hash' },
        { key: 'titulo', label: 'Título' },
        { key: 'prioridade', label: 'Prioridade', align: 'center', kind: 'prioridade' },
        { key: 'responsavel', label: 'Responsável' },
        { key: 'prazoSla', label: 'Venceu em', align: 'right', kind: 'date' },
      ],
      rows: (s?.slaEstourados ?? []),
    }) },

  // ── COMERCIAL (extras) ─────────────────────────────────────────
  { id: 'comercial.contratosTotal', label: 'Total de contratos', modulo: 'comercial', kind: 'number', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.contratos?.totalContratos ?? 0 }) },
  { id: 'comercial.orcValorTotal', label: 'Valor total de orçamentos', modulo: 'comercial', kind: 'currency', source: 'comercial', visuals: KPI,
    extract: (s) => ({ value: s?.orcStats?.valorTotal ?? 0 }) },

  // ── HELPDESK (extras) ──────────────────────────────────────────
  { id: 'helpdesk.tfr', label: 'Tempo até 1ª resposta (TFR)', modulo: 'helpdesk', kind: 'duration', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.tfrHoras ?? null }) },
  { id: 'helpdesk.reabertura', label: 'Taxa de reabertura', modulo: 'helpdesk', kind: 'percent', source: 'helpdesk', visuals: KPI,
    extract: (s) => ({ value: s?.kpis?.taxaReaberturaPct ?? null }) },
  { id: 'helpdesk.porTipo', label: 'Tickets por tipo', modulo: 'helpdesk', kind: 'distribution', source: 'helpdesk', visuals: DIST,
    extract: (s) => ({ items: (s?.porTipo ?? []).filter((x: any) => (x.total ?? 0) > 0).map((x: any, i: number) => ({ name: HELPDESK_TIPO_LABELS[x.tipo] ?? x.tipo, value: x.total, color: PALETTE[i % PALETTE.length] })) }) },
  { id: 'helpdesk.csatDist', label: 'Distribuição de CSAT (1–5)', modulo: 'helpdesk', kind: 'distribution', source: 'helpdesk', visuals: DIST,
    extract: (s) => ({ items: (s?.csatDist ?? []).map((x: any) => ({ name: `${x.nota}★`, value: x.total, color: CSAT_COR[x.nota] ?? '#94a3b8' })) }) },
]

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRIC_CATALOG.map((m) => [m.id, m]))

/** Catálogo enxuto p/ a UI do builder (sem as funções extract). */
export function catalogForUi() {
  return METRIC_CATALOG.map(({ id, label, modulo, kind, visuals }) => ({ id, label, modulo, kind, visuals }))
}
