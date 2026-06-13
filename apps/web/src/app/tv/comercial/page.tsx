'use client'

import { useMemo } from 'react'
import { Target, TrendingUp, CircleDollarSign, FileCheck, Landmark, CalendarClock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LabelList,
} from 'recharts'
import { useComercialData } from '@/hooks/use-comercial-data'
import { TvKiosk, Metric, Panel, LegendList, AXIS, type TvSlide } from '@/components/tv/kiosk'

const ROSE = '#fb7185'
const PIE_COLORS = ['#fb7185', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f97316', '#22d3ee', '#f472b6']

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

export default function ComercialTvPage() {
  const { data, loading, erro, updatedAt } = useComercialData(90)

  const slides = useMemo<TvSlide[]>(() => {
    if (!data) return []

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

    const list: TvSlide[] = []

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
            <Panel className="justify-center"><Metric label="Atrasados" value={orcAtrasados} size="lg" color={orcAtrasados > 0 ? '#f97316' : '#fff'} /></Panel>
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

  return (
    <TvKiosk
      accent={ROSE}
      title="Painel Comercial"
      slides={slides}
      loading={loading}
      erro={erro}
      updatedAt={updatedAt}
      periodLabel="período 90 dias"
    />
  )
}
