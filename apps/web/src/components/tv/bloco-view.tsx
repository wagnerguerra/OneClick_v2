'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts'
import {
  Cpu, MemoryStick, HardDrive, Clock, Activity, Server, Network, Container,
  Coins, Filter, Percent, Target, FileText, AlarmClock, Landmark, CalendarClock,
  TrendingUp, Users, Inbox, PlusCircle, CheckCircle, ShieldCheck, Star, Timer,
  ListChecks, Flag, Tags, RotateCcw, type LucideIcon,
} from 'lucide-react'
import { HELPDESK_PRIORIDADE_COLORS, HELPDESK_PRIORIDADE_LABELS } from '@saas/types'
import { resolveAssetUrl } from '@/lib/api-url'
import { Metric, Panel, LegendList, AXIS, useAccent } from './kiosk'

const PALETTE = ['#fb7185', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#22d3ee', '#f472b6']

// Registro de ícones (lucide) usados pelos blocos. O nome vem da métrica
// (metric-catalog: ICON_BY_ID) ou de bloco.config.icon. Ausente → sem ícone.
const ICONS: Record<string, LucideIcon> = {
  Cpu, MemoryStick, HardDrive, Clock, Activity, Server, Network, Container,
  Coins, Filter, Percent, Target, FileText, AlarmClock, Landmark, CalendarClock,
  TrendingUp, Users, Inbox, PlusCircle, CheckCircle, ShieldCheck, Star, Timer,
  ListChecks, Flag, Tags, RotateCcw,
}
const resolveIcon = (name?: string): LucideIcon | undefined => (name ? ICONS[name] : undefined)

// ── Formatadores ──────────────────────────────────────────────────
const fmtMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0)
const fmtMoedaCompacto = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)
const fmtDuracao = (h: number | null | undefined) => {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 24) return `${h.toFixed(1)} h`
  return `${(h / 24).toFixed(1)} d`
}
const fmtData = (v: any) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')

function fmtKpi(d: any): string {
  if (!d) return '—'
  const v = d.value
  switch (d.kind) {
    case 'currency': return fmtMoedaCompacto(v ?? 0)
    case 'percent': return v == null ? '—' : `${v}%`
    case 'duration': return fmtDuracao(v)
    case 'rating': return v == null ? '—' : `${Number(v).toFixed(1)}/5`
    default: return v == null ? '—' : String(v)
  }
}

// ── Bloco individual ──────────────────────────────────────────────
export function BlocoView({ bloco, data }: { bloco: any; data: Record<string, any> }) {
  const accent = useAccent()
  const d = data?.[bloco.id] ?? data?.[bloco.metricId] // fallback p/ compat
  const label = bloco.config?.label ?? d?.label ?? ''
  const color = bloco.config?.color || accent
  const Icon = resolveIcon(bloco.config?.icon ?? d?.icon)
  // Cor por faixa de uso (metric-catalog: level) — deixa o KPI "vivo".
  const nivelColor = d?.level === 'crit' ? '#f87171' : d?.level === 'warn' ? '#fbbf24' : color

  if (d == null) {
    return <Panel title={label} icon={Icon} className="h-full"><Empty /></Panel>
  }

  switch (bloco.visual) {
    case 'kpi':
      return (
        <div className="relative overflow-hidden rounded-[1.4vw] border border-white/10 bg-white/[0.035] p-[1.6vw] h-full flex flex-col justify-center">
          {Icon && (
            <Icon
              className={`absolute top-[1.3vw] right-[1.3vw] h-[2.8vw] w-[2.8vw] ${d.level === 'crit' ? 'opacity-40 animate-pulse' : d.level === 'warn' ? 'opacity-35' : 'opacity-20'}`}
              style={{ color: nivelColor }}
            />
          )}
          <Metric label={label} value={fmtKpi(d)} sub={d.sub} color={nivelColor} size={bloco.config?.size ?? 'lg'} />
          {d.comparacao && <ComparacaoBadge variacaoPct={d.comparacao.variacaoPct} />}
        </div>
      )

    case 'donut': {
      const items = (d.items ?? []).map((it: any, i: number) => ({ ...it, fill: it.color || PALETTE[i % PALETTE.length] }))
      return (
        <Panel title={label} icon={Icon} className="h-full">
          <div className="grid grid-cols-2 gap-[1.2vw] flex-1 min-h-0">
            {items.length ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={items} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2} dataKey="value" stroke="none">
                      {items.map((e: any, i: number) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <LegendList items={items} />
              </>
            ) : <Empty />}
          </div>
        </Panel>
      )
    }

    case 'bar': {
      const isSeries = Array.isArray(d.points)
      return (
        <Panel title={label} icon={Icon} className="h-full">
          <div className="flex-1 min-h-0">
            {isSeries ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.points} margin={{ top: 20, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="x" tick={{ ...AXIS, fontSize: 14 }} minTickGap={18} />
                  <YAxis allowDecimals={false} tick={AXIS} />
                  {(d.series ?? []).map((s: any) => (
                    <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color || accent} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (d.items?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.items} margin={{ top: 24, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" tick={AXIS} />
                  <YAxis allowDecimals={false} tick={AXIS} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {d.items.map((e: any, i: number) => <Cell key={i} fill={e.color || PALETTE[i % PALETTE.length]} />)}
                    <LabelList dataKey="value" position="top" style={{ fill: '#fff', fontSize: 22, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />)}
          </div>
          {isSeries && (d.series?.length ? <SeriesLegend series={d.series} /> : null)}
        </Panel>
      )
    }

    case 'line':
      return (
        <Panel title={label} icon={Icon} className="h-full">
          <div className="flex-1 min-h-0">
            {d.points?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={d.points} margin={{ top: 16, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="x" tick={{ ...AXIS, fontSize: 14 }} minTickGap={18} />
                  <YAxis allowDecimals={false} tick={AXIS} />
                  {(d.series ?? []).map((s: any) => (
                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color || accent} strokeWidth={3} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </div>
          {d.series?.length ? <SeriesLegend series={d.series} /> : null}
        </Panel>
      )

    case 'table':
    case 'list':
      return (
        <Panel title={label} icon={Icon} className="h-full">
          <TableViz columns={d.columns ?? []} rows={d.rows ?? []} accent={accent} />
        </Panel>
      )

    default:
      return <Panel title={label} icon={Icon} className="h-full"><Empty /></Panel>
  }
}

// ── Tabela genérica ───────────────────────────────────────────────
function TableViz({ columns, rows, accent }: { columns: any[]; rows: any[]; accent: string }) {
  if (!rows.length) return <Empty />
  const tmpl = columns.map((c) => (c.kind === 'avatarName' || (!c.align)) ? '1fr' : c.align === 'right' ? '11vw' : '11vw').join(' ')
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid gap-x-[1.2vw] text-[1vw] uppercase tracking-wider text-white/40 font-semibold pb-[0.7vw] border-b border-white/10" style={{ gridTemplateColumns: tmpl }}>
        {columns.map((c) => <span key={c.key} className={alignCls(c.align)}>{c.label}</span>)}
      </div>
      <div className="flex-1 flex flex-col justify-around mt-[0.4vw]">
        {rows.map((row, ri) => (
          <div key={ri} className="grid gap-x-[1.2vw] items-center text-[1.4vw] py-[0.35vw] border-b border-white/[0.04]" style={{ gridTemplateColumns: tmpl }}>
            {columns.map((c) => <CellView key={c.key} col={c} row={row} accent={accent} />)}
          </div>
        ))}
      </div>
    </div>
  )
}

function CellView({ col, row, accent }: { col: any; row: any; accent: string }) {
  const v = row[col.key]
  if (col.kind === 'avatarName') {
    return (
      <span className={`text-white/90 truncate flex items-center gap-[0.8vw] ${alignCls(col.align)}`}>
        {row.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolveAssetUrl(row.image)} alt="" className="h-[2.4vw] w-[2.4vw] rounded-full object-cover shrink-0 ring-1 ring-white/15" />
        ) : (
          <span className="h-[2.4vw] w-[2.4vw] rounded-full shrink-0 flex items-center justify-center text-[1.1vw] font-bold text-white" style={{ background: accent }}>
            {(v || '?').toString().trim().charAt(0).toUpperCase()}
          </span>
        )}
        <span className="truncate">{v ?? '—'}</span>
      </span>
    )
  }
  if (col.kind === 'status') {
    // Status booleano (up). Rótulos customizáveis via col.onLabel/col.offLabel
    // (ex.: Ativo/Parado p/ containers; default Online/Offline p/ portas).
    const up = v === true || v === 'Online' || v === 'online' || v === 'up'
    const cor = up ? '#34d399' : '#f87171'
    const label = up ? (col.onLabel ?? 'Online') : (col.offLabel ?? 'Offline')
    return (
      <span className={alignCls(col.align)}>
        <span className="inline-flex items-center gap-[0.5vw] px-[0.7vw] py-[0.2vw] rounded-full text-[1vw] font-semibold" style={{ background: `${cor}22`, color: cor }}>
          <span className="h-[0.8vw] w-[0.8vw] rounded-full" style={{ background: cor }} />
          {label}
        </span>
      </span>
    )
  }
  if (col.kind === 'prioridade') {
    const cor = HELPDESK_PRIORIDADE_COLORS[v as keyof typeof HELPDESK_PRIORIDADE_COLORS] ?? '#888'
    const lbl = HELPDESK_PRIORIDADE_LABELS[v as keyof typeof HELPDESK_PRIORIDADE_LABELS] ?? v
    return (
      <span className={alignCls(col.align)}>
        <span className="px-[0.7vw] py-[0.2vw] rounded-full text-[1vw] font-semibold" style={{ background: `${cor}22`, color: cor }}>{lbl}</span>
      </span>
    )
  }
  let txt: string
  if (col.kind === 'currency') txt = fmtMoeda(Number(v ?? 0))
  else if (col.kind === 'percent') txt = v == null ? '—' : `${v}%`
  else if (col.kind === 'duration') txt = fmtDuracao(v)
  else if (col.kind === 'date') txt = fmtData(v)
  else if (col.kind === 'hash') txt = `#${v}`
  else txt = v == null ? '—' : String(v)
  return <span className={`truncate tabular-nums ${alignCls(col.align)} ${col.kind === 'date' ? 'text-white/70' : 'text-white/85'}`}>{txt}</span>
}

function alignCls(a?: string) {
  return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left'
}

function SeriesLegend({ series }: { series: any[] }) {
  return (
    <div className="flex items-center justify-center gap-[2vw] mt-[0.6vw] text-[1vw]">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-[0.5vw] text-white/60">
          <span className="h-[0.9vw] w-[0.9vw] rounded-sm" style={{ background: s.color }} /> {s.label}
        </span>
      ))}
    </div>
  )
}

function Empty() {
  return <div className="flex items-center justify-center h-full text-white/35 text-[1vw]">Sem dados no período</div>
}

function ComparacaoBadge({ variacaoPct }: { variacaoPct: number | null }) {
  if (variacaoPct == null) {
    return <div className="text-[0.9vw] mt-[0.5vw] text-white/40">— vs período anterior</div>
  }
  const cor = variacaoPct > 0 ? '#34d399' : variacaoPct < 0 ? '#f87171' : '#94a3b8'
  const seta = variacaoPct > 0 ? '▲' : variacaoPct < 0 ? '▼' : '—'
  return (
    <div className="text-[1vw] mt-[0.5vw] font-bold" style={{ color: cor }}>
      {seta} {Math.abs(variacaoPct)}% <span className="text-white/40 font-normal text-[0.85vw]">vs período anterior</span>
    </div>
  )
}

// ── Grid de uma folha ─────────────────────────────────────────────
export function FolhaGrid({ folha, data }: { folha: any; data: Record<string, any> }) {
  const cols = folha.cols ?? 12
  const blocos = [...(folha.blocos ?? [])].sort((a, b) => a.ordem - b.ordem)
  return (
    <div
      className="h-full"
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: 'minmax(0, 1fr)', gap: '1.6vw' }}
    >
      {blocos.map((b) => {
        const span = b.config?.colSpan ?? (b.visual === 'kpi' ? 3 : 6)
        const rowSpan = b.config?.rowSpan ?? 1
        return (
          <div key={b.id} style={{ gridColumn: `span ${Math.min(span, cols)}`, gridRow: `span ${rowSpan}`, minHeight: 0 }}>
            <BlocoView bloco={b} data={data} />
          </div>
        )
      })}
    </div>
  )
}
