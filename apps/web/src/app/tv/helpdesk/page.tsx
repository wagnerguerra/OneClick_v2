'use client'

import { useMemo } from 'react'
import {
  Inbox, AlertTriangle, Activity, Gauge, Users, Tag, ListChecks, Flame,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts'
import {
  HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS, HELPDESK_PRIORIDADE_COLORS,
  HELPDESK_STATUS_FINAIS,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'
import { resolveAssetUrl } from '@/lib/api-url'
import { useHelpdeskData } from '@/hooks/use-helpdesk-data'
import { TvKiosk, Metric, Panel, LegendList, AXIS, type TvSlide } from '@/components/tv/kiosk'

const ACCENT = '#22d3ee' // TI / helpdesk

const STATUS_COR: Record<string, string> = {
  NOVO: '#3b82f6', AGUARDANDO_AUDITORIA: '#06b6d4', EM_ANDAMENTO: '#f59e0b',
  RESOLVIDO: '#a855f7', CONCLUIDO: '#10b981', CANCELADO: '#ef4444',
}
const CSAT_COR: Record<number, string> = { 1: '#ef4444', 2: '#f59e0b', 3: '#eab308', 4: '#84cc16', 5: '#10b981' }

const fmtHoras = (h: number | null | undefined) => {
  if (h === null || h === undefined) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 24) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}
const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const shortPeriodo = (p: string) => {
  // 'YYYY-MM-DD' -> 'DD/MM' ; 'YYYY-MM' -> 'MM/YY'
  const parts = p.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : `${parts[1]}/${parts[0].slice(2)}`
}

export default function HelpdeskTvPage() {
  const { data, loading, erro, updatedAt } = useHelpdeskData(30)

  const slides = useMemo<TvSlide[]>(() => {
    if (!data) return []
    const k = data.kpis ?? {}
    const porStatus: any[] = data.porStatus ?? []
    const porPrioridade: any[] = data.porPrioridade ?? []
    const serie: any[] = data.serie ?? []
    const porCategoria: any[] = data.porCategoria ?? []
    const porResponsavel: any[] = data.porResponsavel ?? []
    const csatDist: any[] = data.csatDist ?? []
    const slaEstourados: any[] = data.slaEstourados ?? []

    // Backlog por status (exclui finais: concluído/cancelado)
    const statusPie = porStatus
      .filter((s) => !HELPDESK_STATUS_FINAIS.includes(s.status) && s.total > 0)
      .map((s) => ({ name: HELPDESK_STATUS_LABELS[s.status as HelpdeskStatus] ?? s.status, value: s.total, fill: STATUS_COR[s.status] ?? ACCENT }))

    const prioChart = porPrioridade
      .filter((p) => p.total > 0)
      .sort((a, b) => ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'].indexOf(a.prioridade) - ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'].indexOf(b.prioridade))
      .map((p) => ({ nome: HELPDESK_PRIORIDADE_LABELS[p.prioridade as HelpdeskPrioridade] ?? p.prioridade, total: p.total, fill: HELPDESK_PRIORIDADE_COLORS[p.prioridade as HelpdeskPrioridade] ?? ACCENT }))

    const serieChart = serie.map((s) => ({ ...s, label: shortPeriodo(s.periodo) }))
    const catTop = porCategoria.slice(0, 8)
    const maxCat = Math.max(...catTop.map((c) => c.total), 1)
    const saldo = (k.criados ?? 0) - (k.resolvidos ?? 0)

    const list: TvSlide[] = []

    // ── Slide 1: Visão Geral ──
    list.push({
      key: 'overview', title: 'Visão Geral',
      node: (
        <div className="grid grid-cols-3 gap-[1.6vw] h-full">
          <Panel title="Operação agora" icon={Inbox}>
            <div className="flex flex-col justify-around flex-1">
              <Metric label="Backlog em aberto" value={k.backlogAbertos ?? 0} size="hero" color={ACCENT} />
              <Metric label="SLA estourado (atrasados)" value={k.backlogAtrasados ?? 0} size="lg" color={(k.backlogAtrasados ?? 0) > 0 ? '#ef4444' : '#10b981'} />
            </div>
          </Panel>
          <Panel title="Período · 30 dias" icon={Activity}>
            <div className="flex flex-col justify-around flex-1">
              <Metric label="Tickets criados" value={k.criados ?? 0} size="hero" color="#60a5fa" />
              <Metric label="Resolvidos" value={k.resolvidos ?? 0} size="lg" color="#10b981" />
              <Metric label="Saldo (criados − resolvidos)" value={saldo > 0 ? `+${saldo}` : `${saldo}`} color={saldo > 0 ? '#fbbf24' : '#10b981'} />
            </div>
          </Panel>
          <Panel title="Qualidade & SLA" icon={Gauge}>
            <div className="flex flex-col justify-around flex-1">
              <Metric label="Cumprimento de SLA" value={k.slaCumprimentoPct != null ? `${k.slaCumprimentoPct}%` : '—'} size="hero" color={k.slaCumprimentoPct == null ? '#fff' : k.slaCumprimentoPct >= 90 ? '#10b981' : k.slaCumprimentoPct >= 70 ? '#fbbf24' : '#ef4444'} />
              <div className="grid grid-cols-2 gap-[1vw]">
                <Metric label="CSAT médio" value={k.csatMedio != null ? `${Number(k.csatMedio).toFixed(1)}/5` : '—'} color="#84cc16" sub={`${k.csatRespostas ?? 0} respostas`} />
                <Metric label="Tempo médio resolução" value={fmtHoras(k.mttrHoras)} color="#a78bfa" />
              </div>
            </div>
          </Panel>
        </div>
      ),
    })

    // ── Slide 2: Backlog por status + prioridade ──
    list.push({
      key: 'backlog', title: 'Backlog · status e prioridade',
      node: (
        <div className="grid grid-cols-2 gap-[1.6vw] h-full">
          <Panel title="Em aberto por status" icon={ListChecks}>
            <div className="grid grid-cols-2 gap-[1vw] flex-1">
              {statusPie.length ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusPie} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2} dataKey="value" stroke="none">
                        {statusPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <LegendList items={statusPie} />
                </>
              ) : <EmptyMini />}
            </div>
          </Panel>
          <Panel title="Criados por prioridade (30d)" icon={Flame}>
            <div className="flex-1">
              {prioChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={prioChart} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="nome" tick={AXIS} />
                    <YAxis allowDecimals={false} tick={AXIS} />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {prioChart.map((e, i) => <Cell key={i} fill={e.fill} />)}
                      <LabelList dataKey="total" position="top" style={{ fill: '#fff', fontSize: 22, fontWeight: 700 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyMini />}
            </div>
          </Panel>
        </div>
      ),
    })

    // ── Slide 3: Fluxo (criados x resolvidos) + categorias ──
    list.push({
      key: 'fluxo', title: 'Fluxo e categorias',
      node: (
        <div className="grid grid-cols-[1fr_30vw] gap-[1.6vw] h-full">
          <Panel title="Criados × resolvidos (30 dias)" icon={Activity}>
            <div className="flex-1">
              {serieChart.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieChart} margin={{ top: 16, right: 8, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="label" tick={{ ...AXIS, fontSize: 14 }} minTickGap={18} />
                    <YAxis allowDecimals={false} tick={AXIS} />
                    <Bar dataKey="criados" name="Criados" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="resolvidos" name="Resolvidos" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyMini />}
            </div>
            <div className="flex items-center justify-center gap-[2vw] mt-[0.6vw] text-[1vw]">
              <span className="flex items-center gap-[0.5vw] text-white/60"><span className="h-[0.9vw] w-[0.9vw] rounded-sm bg-[#60a5fa]" /> Criados</span>
              <span className="flex items-center gap-[0.5vw] text-white/60"><span className="h-[0.9vw] w-[0.9vw] rounded-sm bg-[#10b981]" /> Resolvidos</span>
            </div>
          </Panel>
          <Panel title="Top categorias (30d)" icon={Tag}>
            <div className="flex-1 flex flex-col justify-around">
              {catTop.length ? catTop.map((c, i) => (
                <div key={c.id ?? i} className="space-y-[0.4vw]">
                  <div className="flex items-center justify-between text-[1.15vw]">
                    <span className="text-white/75 truncate pr-[1vw]">{c.nome}</span>
                    <span className="font-bold tabular-nums text-white">{c.total}<span className="text-white/40 text-[0.9vw] font-normal"> · {c.pct}%</span></span>
                  </div>
                  <div className="h-[0.8vw] rounded-full bg-white/[0.06] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(4, (c.total / maxCat) * 100)}%`, background: c.cor || ACCENT }} />
                  </div>
                </div>
              )) : <EmptyMini />}
            </div>
          </Panel>
        </div>
      ),
    })

    // ── Slide 4: Desempenho por agente ──
    if (porResponsavel.length > 0) {
      list.push({
        key: 'agentes', title: 'Desempenho por agente',
        node: (
          <Panel title="Resolvidos por responsável (30d)" icon={Users} className="h-full">
            <div className="grid grid-cols-[1fr_14vw_14vw_12vw] gap-x-[1.5vw] text-[1vw] uppercase tracking-wider text-white/40 font-semibold pb-[0.8vw] border-b border-white/10">
              <span>Agente</span><span className="text-center">Resolvidos</span><span className="text-center">Tempo médio</span><span className="text-right">SLA</span>
            </div>
            <div className="flex-1 flex flex-col justify-around mt-[0.5vw]">
              {porResponsavel.slice(0, 8).map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_14vw_14vw_12vw] gap-x-[1.5vw] items-center text-[1.5vw] py-[0.4vw] border-b border-white/[0.04]">
                  <span className="text-white/90 truncate flex items-center gap-[0.8vw]">
                    {a.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolveAssetUrl(a.image)} alt="" className="h-[2.4vw] w-[2.4vw] rounded-full object-cover shrink-0 ring-1 ring-white/15" />
                    ) : (
                      <span className="h-[2.4vw] w-[2.4vw] rounded-full shrink-0 flex items-center justify-center text-[1.1vw] font-bold text-white" style={{ background: ACCENT }}>
                        {(a.name || '?').trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="truncate">{a.name}</span>
                  </span>
                  <span className="text-center font-bold tabular-nums" style={{ color: ACCENT }}>{a.total}</span>
                  <span className="text-center tabular-nums text-white/70">{fmtHoras(a.mttrHoras)}</span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: a.slaPct == null ? '#fff' : a.slaPct >= 90 ? '#10b981' : a.slaPct >= 70 ? '#fbbf24' : '#ef4444' }}>
                    {a.slaPct != null ? `${a.slaPct}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        ),
      })
    }

    // ── Slide 5: SLA estourados (só se houver) ──
    if (slaEstourados.length > 0) {
      list.push({
        key: 'sla', title: 'SLA estourado · ação imediata',
        node: (
          <Panel title="Tickets com SLA vencido" icon={AlertTriangle} className="h-full">
            <div className="grid grid-cols-[6vw_1fr_11vw_16vw_12vw] gap-x-[1.2vw] text-[1vw] uppercase tracking-wider text-white/40 font-semibold pb-[0.8vw] border-b border-white/10">
              <span>Nº</span><span>Título</span><span className="text-center">Prioridade</span><span>Responsável</span><span className="text-right">Venceu em</span>
            </div>
            <div className="flex-1 flex flex-col justify-around mt-[0.5vw]">
              {slaEstourados.slice(0, 8).map((t) => (
                <div key={t.id} className="grid grid-cols-[6vw_1fr_11vw_16vw_12vw] gap-x-[1.2vw] items-center text-[1.35vw] py-[0.4vw] border-b border-white/[0.04]">
                  <span className="text-white/40 font-semibold">#{t.numero}</span>
                  <span className="text-white/90 truncate">{t.titulo}</span>
                  <span className="text-center">
                    <span className="px-[0.7vw] py-[0.2vw] rounded-full text-[1vw] font-semibold" style={{ background: `${HELPDESK_PRIORIDADE_COLORS[t.prioridade as HelpdeskPrioridade] ?? '#888'}22`, color: HELPDESK_PRIORIDADE_COLORS[t.prioridade as HelpdeskPrioridade] ?? '#fff' }}>
                      {HELPDESK_PRIORIDADE_LABELS[t.prioridade as HelpdeskPrioridade] ?? t.prioridade}
                    </span>
                  </span>
                  <span className="text-white/65 truncate">{t.responsavel ?? 'Sem responsável'}</span>
                  <span className="text-right tabular-nums text-red-400 font-semibold">{fmtData(t.prazoSla)}</span>
                </div>
              ))}
            </div>
          </Panel>
        ),
      })
    }

    return list
  }, [data])

  return (
    <TvKiosk
      accent={ACCENT}
      title="Painel de TI · Helpdesk"
      slides={slides}
      loading={loading}
      erro={erro}
      updatedAt={updatedAt}
      periodLabel="período 30 dias"
    />
  )
}

function EmptyMini() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-white/40">
      <Activity className="h-[2.5vw] w-[2.5vw] opacity-30" />
      <p className="text-[1vw] mt-[0.5vw]">Sem dados no período</p>
    </div>
  )
}
