'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Target, TrendingUp, Percent, CircleDollarSign, FileText, AlertTriangle,
  FileCheck, Landmark, CalendarClock, Maximize2, Minimize2, Pause, Play, Activity,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts'
import { useComercialData } from '@/hooks/use-comercial-data'

const ROSE = '#fb7185'
const PIE_COLORS = ['#fb7185', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#22d3ee', '#f472b6']
const SLIDE_MS = 18_000

const ORC_STATUS_LABEL: Record<string, string> = {
  NOVO: 'Novo', A_ENVIAR: 'A enviar', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
  LIBERADO: 'Liberado', FINALIZADO: 'Finalizado', ENCERRADO: 'Encerrado',
}
const CONTRATO_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: 'Rascunho', AGUARDANDO_ASSINATURA: 'Aguard. assinatura', ASSINADO: 'Assinado',
  VIGENTE: 'Vigente', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado',
}

const fmtMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0)
const fmtCompacto = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v || 0)

// ── Blocos visuais (escala em vw → independe da resolução da TV) ──────────

function Metric({ label, value, sub, color, size = 'md' }: {
  label: string; value: string | number; sub?: string; color?: string; size?: 'hero' | 'lg' | 'md'
}) {
  const cls = size === 'hero' ? 'text-[5.2vw]' : size === 'lg' ? 'text-[3.4vw]' : 'text-[2.6vw]'
  return (
    <div>
      <div className="text-[0.95vw] uppercase tracking-[0.12em] text-white/45 font-semibold">{label}</div>
      <div className={`${cls} font-bold leading-none tabular-nums mt-[0.3vw]`} style={{ color: color ?? '#fff' }}>{value}</div>
      {sub && <div className="text-[0.9vw] text-white/40 mt-[0.5vw]">{sub}</div>}
    </div>
  )
}

function Panel({ title, icon: Icon, children, className = '' }: {
  title?: string; icon?: React.ElementType; children: React.ReactNode; className?: string
}) {
  return (
    <div className={`rounded-[1.4vw] border border-white/10 bg-white/[0.035] p-[1.6vw] flex flex-col ${className}`}>
      {title && (
        <div className="flex items-center gap-[0.7vw] mb-[1.2vw]">
          {Icon && <Icon className="h-[1.8vw] w-[1.8vw]" style={{ color: ROSE }} />}
          <h3 className="text-[1.5vw] font-bold text-white/90">{title}</h3>
        </div>
      )}
      {children}
    </div>
  )
}

function LegendList({ items }: { items: Array<{ name: string; value: number; fill: string }> }) {
  return (
    <div className="flex flex-col justify-center gap-[0.9vw]">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-[0.8vw]">
          <span className="h-[1.1vw] w-[1.1vw] rounded-[0.25vw] shrink-0" style={{ background: it.fill }} />
          <span className="text-[1.15vw] text-white/70 flex-1 truncate">{it.name}</span>
          <span className="text-[1.5vw] font-bold tabular-nums text-white">{it.value}</span>
        </div>
      ))}
    </div>
  )
}

const AXIS = { fill: '#94a3b8', fontSize: 18 } as const

// ════════════════════════════════════════════════════════════════════════
// Página kiosk
// ════════════════════════════════════════════════════════════════════════

export default function ComercialTvPage() {
  const { data, loading, erro, updatedAt } = useComercialData(90)

  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState<Date | null>(null)
  const [isFs, setIsFs] = useState(false)
  const cycle = useRef(0)

  // Relógio
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // ── Derivações (mesma lógica do painel /comercial) ──
  const slides = useMemo(() => {
    if (!data) return [] as Array<{ key: string; title: string; node: React.ReactNode }>

    const funilEtapas: any[] = data.crmFunil?.etapas ?? []
    const crmAtivas = funilEtapas.filter((e) => !e.ehGanho && !e.ehPerda)
    const oportunidadesAtivas = crmAtivas.reduce((s, e) => s + (e.count ?? 0), 0)
    const pipelineValor = crmAtivas.reduce((s, e) => s + (e.valor ?? 0), 0)
    const taxaConversao = data.crmFunil?.taxaGeral ?? 0
    const funilChart = funilEtapas.filter((e) => !e.ehPerda)

    const orcPorStatus: any[] = data.orcStats?.porStatus ?? []
    const orcTotal = data.orcStats?.total ?? 0
    const orcAprovados = orcPorStatus
      .filter((s) => ['APROVADO', 'LIBERADO', 'FINALIZADO'].includes(s.status))
      .reduce((a, s) => a + (s._count ?? 0), 0)
    const taxaAprovacao = orcTotal > 0 ? Math.round((orcAprovados / orcTotal) * 100) : 0
    const od = data.orcDash
    const orcEmAberto = od?.permitido
      ? (od.aguardandoEnvio ?? 0) + (od.aguardandoAprovacao ?? 0)
      : orcPorStatus.filter((s) => ['NOVO', 'A_ENVIAR', 'ENVIADO'].includes(s.status)).reduce((a, s) => a + (s._count ?? 0), 0)
    const orcValorPendente = od?.permitido ? (od.valorPendente ?? 0) : 0
    const orcAtrasados = od?.permitido ? (od.atrasados ?? 0) : 0
    const orcPie = orcPorStatus
      .filter((s) => (s._count ?? 0) > 0)
      .map((s, i) => ({ name: ORC_STATUS_LABEL[s.status] ?? s.status, value: s._count, fill: PIE_COLORS[i % PIE_COLORS.length] }))

    const ct = data.contratos
    const mrr = ct?.mrr ?? 0
    const vigentes = ct?.vigentes ?? 0
    const aVencer30 = ct?.aVencer30 ?? 0
    const aVencer60 = ct?.aVencer60 ?? 0
    const ctPorStatus: any[] = ct?.porStatus ?? []
    const ctPie = ctPorStatus
      .filter((s) => (s.count ?? 0) > 0)
      .map((s, i) => ({ name: CONTRATO_STATUS_LABEL[s.status] ?? s.status, value: s.count, fill: PIE_COLORS[i % PIE_COLORS.length] }))
    const ctEvolucao: any[] = ct?.evolucaoMensal ?? []
    const aVencer: any[] = ct?.aVencer ?? []

    const list: Array<{ key: string; title: string; node: React.ReactNode }> = []

    // ── Slide 1: Visão Geral ──
    list.push({
      key: 'overview', title: 'Visão Geral',
      node: (
        <div className="grid grid-cols-3 gap-[1.6vw] h-full">
          <Panel title="CRM · Pipeline" icon={Target}>
            <div className="flex flex-col justify-around flex-1">
              <Metric label="Oportunidades ativas" value={oportunidadesAtivas} size="hero" color="#818cf8" />
              <Metric label="Valor em pipeline" value={fmtCompacto(pipelineValor)} color="#34d399" sub={fmtMoeda(pipelineValor)} />
              <Metric label="Taxa de conversão" value={`${taxaConversao}%`} color={ROSE} />
            </div>
          </Panel>
          <Panel title="Orçamentos" icon={CircleDollarSign}>
            <div className="flex flex-col justify-around flex-1">
              <Metric label="Em aberto" value={orcEmAberto} size="hero" color="#60a5fa" />
              <Metric label="Valor pendente" value={fmtCompacto(orcValorPendente)} color="#34d399" />
              <div className="grid grid-cols-2 gap-[1vw]">
                <Metric label="Aprovação" value={`${taxaAprovacao}%`} color="#a78bfa" />
                <Metric label="Atrasados" value={orcAtrasados} color={orcAtrasados > 0 ? '#f97316' : '#fff'} />
              </div>
            </div>
          </Panel>
          <Panel title="Contratos · Carteira" icon={FileCheck}>
            <div className="flex flex-col justify-around flex-1">
              <Metric label="MRR · receita recorrente" value={fmtCompacto(mrr)} size="hero" color={ROSE} sub={fmtMoeda(mrr)} />
              <Metric label="Contratos vigentes" value={vigentes} color="#34d399" />
              <Metric label="A vencer (30 dias)" value={aVencer30} color={aVencer30 > 0 ? '#fbbf24' : '#fff'} sub={`${aVencer60} em até 60 dias`} />
            </div>
          </Panel>
        </div>
      ),
    })

    // ── Slide 2: CRM ──
    list.push({
      key: 'crm', title: 'CRM · Funil de vendas',
      node: (
        <div className="grid grid-cols-[1fr_24vw] gap-[1.6vw] h-full">
          <Panel title="Funil de vendas" icon={TrendingUp}>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funilChart} margin={{ top: 24, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="nome" tick={AXIS} />
                  <YAxis allowDecimals={false} tick={AXIS} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {funilChart.map((e: any) => <Cell key={e.etapaId} fill={e.cor || ROSE} />)}
                    <LabelList dataKey="count" position="top" style={{ fill: '#fff', fontSize: 22, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <div className="flex flex-col gap-[1.6vw]">
            <Panel className="flex-1 justify-center"><Metric label="Oportunidades ativas" value={oportunidadesAtivas} size="lg" color="#818cf8" /></Panel>
            <Panel className="flex-1 justify-center"><Metric label="Valor em pipeline" value={fmtCompacto(pipelineValor)} size="lg" color="#34d399" sub={fmtMoeda(pipelineValor)} /></Panel>
            <Panel className="flex-1 justify-center"><Metric label="Taxa de conversão" value={`${taxaConversao}%`} size="lg" color={ROSE} /></Panel>
          </div>
        </div>
      ),
    })

    // ── Slide 3: Orçamentos ──
    list.push({
      key: 'orcamentos', title: 'Orçamentos',
      node: (
        <div className="grid grid-cols-[1fr_28vw] gap-[1.6vw] h-full">
          <Panel title="Por status" icon={CircleDollarSign}>
            <div className="grid grid-cols-2 gap-[1.2vw] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={orcPie} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2} dataKey="value" stroke="none">
                    {orcPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <LegendList items={orcPie} />
            </div>
          </Panel>
          <div className="grid grid-rows-2 grid-cols-2 gap-[1.4vw]">
            <Panel className="justify-center"><Metric label="Em aberto" value={orcEmAberto} size="lg" color="#60a5fa" /></Panel>
            <Panel className="justify-center"><Metric label="Valor pendente" value={fmtCompacto(orcValorPendente)} size="lg" color="#34d399" /></Panel>
            <Panel className="justify-center"><Metric label="Taxa aprovação" value={`${taxaAprovacao}%`} size="lg" color="#a78bfa" /></Panel>
            <Panel className="justify-center" ><Metric label="Atrasados" value={orcAtrasados} size="lg" color={orcAtrasados > 0 ? '#f97316' : '#fff'} /></Panel>
          </div>
        </div>
      ),
    })

    // ── Slide 4: Contratos ──
    list.push({
      key: 'contratos', title: 'Contratos · Carteira',
      node: (
        <div className="grid grid-cols-3 gap-[1.6vw] h-full">
          <Panel title="Receita recorrente" icon={Landmark} className="justify-center items-start">
            <Metric label="MRR mensal" value={fmtCompacto(mrr)} size="hero" color={ROSE} sub={fmtMoeda(mrr)} />
            <div className="mt-[2vw] grid grid-cols-1 gap-[1.4vw] w-full">
              <Metric label="Vigentes" value={vigentes} color="#34d399" />
              <Metric label="A vencer (30d / 60d)" value={`${aVencer30} / ${aVencer60}`} color="#fbbf24" />
            </div>
          </Panel>
          <Panel title="Por status" icon={FileCheck}>
            <div className="flex-1 flex flex-col">
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ctPie} cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2} dataKey="value" stroke="none">
                      {ctPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <LegendList items={ctPie} />
            </div>
          </Panel>
          <Panel title="Novos × encerrados (6m)" icon={TrendingUp}>
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ctEvolucao} margin={{ top: 24, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="mes" tick={AXIS} />
                  <YAxis allowDecimals={false} tick={AXIS} />
                  <Bar dataKey="novos" name="Novos" fill="#34d399" radius={[5, 5, 0, 0]}>
                    <LabelList dataKey="novos" position="top" style={{ fill: '#34d399', fontSize: 18, fontWeight: 700 }} />
                  </Bar>
                  <Bar dataKey="encerrados" name="Encerrados" fill="#ef4444" radius={[5, 5, 0, 0]}>
                    <LabelList dataKey="encerrados" position="top" style={{ fill: '#ef4444', fontSize: 18, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-[2vw] mt-[0.6vw] text-[1vw]">
              <span className="flex items-center gap-[0.5vw] text-white/60"><span className="h-[0.9vw] w-[0.9vw] rounded-sm bg-[#34d399]" /> Novos</span>
              <span className="flex items-center gap-[0.5vw] text-white/60"><span className="h-[0.9vw] w-[0.9vw] rounded-sm bg-[#ef4444]" /> Encerrados</span>
            </div>
          </Panel>
        </div>
      ),
    })

    // ── Slide 5: Contratos a vencer (só se houver) ──
    if (aVencer.length > 0) {
      list.push({
        key: 'avencer', title: 'Contratos a vencer · próximos 60 dias',
        node: (
          <Panel title="Renovações próximas" icon={CalendarClock} className="h-full">
            <div className="grid grid-cols-[6vw_1fr_14vw_12vw] gap-x-[1.5vw] text-[1vw] uppercase tracking-wider text-white/40 font-semibold pb-[0.8vw] border-b border-white/10">
              <span>Nº</span><span>Cliente</span><span className="text-center">Vence em</span><span className="text-right">Honorário</span>
            </div>
            <div className="flex-1 flex flex-col justify-around mt-[0.5vw]">
              {aVencer.slice(0, 9).map((c: any) => {
                const urgente = c.diasRestantes != null && c.diasRestantes <= 15
                const medio = c.diasRestantes != null && c.diasRestantes <= 30
                const cor = urgente ? '#f87171' : medio ? '#fbbf24' : '#60a5fa'
                return (
                  <div key={c.id} className="grid grid-cols-[6vw_1fr_14vw_12vw] gap-x-[1.5vw] items-center text-[1.5vw] py-[0.5vw] border-b border-white/[0.04]">
                    <span className="text-white/40 font-semibold">#{c.numero}</span>
                    <span className="text-white/90 truncate">{c.cliente}</span>
                    <span className="text-center font-semibold tabular-nums" style={{ color: cor }}>
                      {c.dataFim ? new Date(c.dataFim).toLocaleDateString('pt-BR') : '—'}
                      <span className="block text-[0.85vw] text-white/40">{c.diasRestantes != null ? `${c.diasRestantes} dias` : ''}</span>
                    </span>
                    <span className="text-right tabular-nums text-white/80">{fmtMoeda(c.honorarioMensal)}</span>
                  </div>
                )
              })}
            </div>
          </Panel>
        ),
      })
    }

    return list
  }, [data])

  const len = slides.length

  // Mantém o índice válido se o nº de slides mudar
  useEffect(() => {
    if (len > 0 && active >= len) setActive(0)
  }, [len, active])

  // Rotação automática
  useEffect(() => {
    if (paused || len === 0) return
    cycle.current++
    const id = setTimeout(() => setActive((a) => (a + 1) % len), SLIDE_MS)
    return () => clearTimeout(id)
  }, [active, paused, len])

  // Atalhos de teclado
  const toggleFs = useCallback(() => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setActive((a) => (len ? (a + 1) % len : 0))
      else if (e.key === 'ArrowLeft') setActive((a) => (len ? (a - 1 + len) % len : 0))
      else if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p) }
      else if (e.key.toLowerCase() === 'f') toggleFs()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [len, toggleFs])

  useEffect(() => {
    const onFs = () => setIsFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  const segsSinceUpdate = now && updatedAt ? Math.floor((now.getTime() - updatedAt) / 1000) : null

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0b0f1a] text-white overflow-hidden select-none">
      <style>{`@keyframes tvbar { from { width: 0% } to { width: 100% } }`}</style>

      {/* ── Top bar ── */}
      <header className="h-[8vh] shrink-0 flex items-center justify-between px-[2vw] border-b border-white/10 bg-gradient-to-r from-rose-500/10 to-transparent">
        <div className="flex items-center gap-[1.2vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.png" alt="OneClick" className="h-[3.2vh] w-auto object-contain" />
          <div className="h-[3.5vh] w-px bg-white/15" />
          <div>
            <div className="text-[1.7vw] font-bold leading-none">Painel Comercial</div>
            <div className="text-[0.9vw] text-white/45 mt-[0.4vh]">{slides[active]?.title ?? 'Gestão à vista'}</div>
          </div>
        </div>
        <div className="flex items-center gap-[1.8vw]">
          <div className="flex items-center gap-[0.6vw] text-[1.05vw] text-emerald-400">
            <span className="relative flex h-[1vw] w-[1vw]">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex rounded-full h-[1vw] w-[1vw] bg-emerald-400" />
            </span>
            ao vivo
          </div>
          <div className="text-right">
            <div className="text-[1.9vw] font-bold leading-none tabular-nums">
              {now ? now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
            </div>
            <div className="text-[0.85vw] text-white/45 mt-[0.3vh] capitalize">
              {now ? now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : ''}
            </div>
          </div>
          <button onClick={toggleFs} className="text-white/40 hover:text-white transition-colors" title="Tela cheia (F)">
            {isFs ? <Minimize2 className="h-[1.8vw] w-[1.8vw]" /> : <Maximize2 className="h-[1.8vw] w-[1.8vw]" />}
          </button>
        </div>
      </header>

      {/* ── Conteúdo (slide ativo) ── */}
      <main className="flex-1 min-h-0 p-[2vw]">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center gap-[1.5vw] text-white/50">
            <div className="h-[4vw] w-[4vw] animate-spin rounded-full border-4 border-rose-500 border-t-transparent" />
            <p className="text-[1.5vw]">Carregando painel…</p>
          </div>
        ) : erro || len === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-[1vw] text-white/50">
            <Activity className="h-[4vw] w-[4vw] opacity-30" />
            <p className="text-[1.6vw]">Sem dados ou sem permissão para os módulos comerciais.</p>
          </div>
        ) : (
          <div key={active} className="h-full animate-[fadeIn_0.5s_ease-out]">{slides[active]?.node}</div>
        )}
      </main>

      {/* ── Bottom bar: dots + progresso ── */}
      <footer className="h-[6vh] shrink-0 flex items-center justify-between px-[2vw] border-t border-white/10">
        <div className="flex items-center gap-[1vw]">
          {slides.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setActive(i)}
              className="flex items-center gap-[0.5vw] group"
              title={s.title}
            >
              <span
                className="h-[0.9vw] rounded-full transition-all duration-300"
                style={{
                  width: i === active ? '3vw' : '0.9vw',
                  background: i === active ? ROSE : 'rgba(255,255,255,0.25)',
                }}
              />
            </button>
          ))}
          <button onClick={() => setPaused((p) => !p)} className="ml-[1vw] text-white/40 hover:text-white transition-colors" title="Pausar/retomar (espaço)">
            {paused ? <Play className="h-[1.4vw] w-[1.4vw]" /> : <Pause className="h-[1.4vw] w-[1.4vw]" />}
          </button>
        </div>
        <div className="text-[0.9vw] text-white/35 tabular-nums">
          {segsSinceUpdate != null ? `atualizado há ${segsSinceUpdate}s · período 90 dias` : 'período 90 dias'}
        </div>
      </footer>

      {/* Barra de progresso do slide (reinicia a cada troca/cycle) */}
      <div className="absolute bottom-0 left-0 right-0 h-[0.4vh] bg-white/5">
        {!paused && len > 0 && (
          <div
            key={`${active}-${cycle.current}`}
            className="h-full"
            style={{ background: ROSE, animation: `tvbar ${SLIDE_MS}ms linear forwards` }}
          />
        )}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(1vh) } to { opacity: 1; transform: none } }`}</style>
    </div>
  )
}
