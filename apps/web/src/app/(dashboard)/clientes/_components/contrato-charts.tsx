'use client'

/**
 * Modal Gráficos — Contrato x ERP
 * Replica funcionalidade do SERPRO2 (PRD-PORT-CONTRATOS-VISUAL-ONECLICK-CODE.md §5):
 *  - Mini-cards de parâmetros com borda colorida por status
 *  - Gráfico multi-série "Dados extraídos por mês" (5 indicadores)
 *  - Comparativo com 5 bar charts (Contrato vs ERP último mês)
 *  - Por indicador: barras agrupadas POR ANO (jan/2025 ao lado de jan/2026)
 *    + sparkline + tabela detalhada com status por mês
 *  - Datalabels nos pontos (chartjs-plugin-datalabels)
 */

import { useEffect, useState, useMemo } from 'react'
import { Loader2, ArrowLeft, X, FileBarChart, ExternalLink, Search as SearchIcon } from 'lucide-react'
import { Button, Input, Label, Checkbox } from '@saas/ui'
import { cn } from '@saas/ui'

type ErpRow = { ano: number; mes: number; movimentacao: number }
type ChartData = Record<string, ErpRow[] | undefined>

interface Indicator {
  key: string
  label: string
  paramKey: string
  color: string
  isMoney: boolean
}

const INDICATORS: Indicator[] = [
  { key: 'lancamentos', label: 'Lançamentos', paramKey: 'lancamentos', color: '#5ea3cb', isMoney: false },
  { key: 'faturamento', label: 'Faturamento', paramKey: 'faturamento', color: '#10b981', isMoney: true },
  { key: 'nf_entrada', label: 'NF Entrada', paramKey: 'nfEntrada', color: '#f59e0b', isMoney: false },
  { key: 'nf_saida',   label: 'NF Saída',   paramKey: 'nfSaida',   color: '#8b5cf6', isMoney: false },
  { key: 'nf_prestado',label: 'NF Prestado',paramKey: 'nfPrestado',color: '#06b6d4', isMoney: false },
  { key: 'nf_tomado',  label: 'NF Tomado',  paramKey: 'nfTomado',  color: '#ec4899', isMoney: false },
  { key: 'vidas',      label: 'Funcionários',paramKey: 'funcionarios', color: '#f97316', isMoney: false },
]

// Paleta pra diferenciar anos no agrupamento (jan/25 ao lado de jan/26)
const YEAR_COLORS = ['#5ea3cb', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444']

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function fmtVal(v: number, money: boolean): string {
  if (money) {
    if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)} mi`
    if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)} mil`
    return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function fmtValShort(v: number, money: boolean): string {
  if (money) {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
    return v.toFixed(0)
  }
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

// Status por linha (mês): comparação valor vs limite do contrato
function statusFromVal(val: number, limite: number): 'ok' | 'igual' | 'defasado' | 'sem' {
  if (!limite || limite <= 0) return 'sem'
  if (val < limite) return 'ok'
  if (val === limite) return 'igual'
  return 'defasado'
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  ok: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'OK' },
  igual: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'IGUAL' },
  defasado: { bg: 'bg-red-100', text: 'text-red-700', label: 'DEFASADO' },
  sem: { bg: 'bg-gray-100', text: 'text-gray-500', label: '—' },
}

// Cor da borda do mini-card de parâmetro
function borderColorByStatus(st: 'ok' | 'igual' | 'defasado' | 'sem'): string {
  if (st === 'ok') return 'rgba(16,185,129,0.5)'
  if (st === 'igual') return 'rgba(245,158,11,0.5)'
  if (st === 'defasado') return 'rgba(239,68,68,0.5)'
  return 'rgba(0,0,0,0.08)'
}

// Helper: último mês das rows (mais recente cronologicamente)
function ultimoValor(rows: ErpRow[] | undefined): number {
  if (!rows || rows.length === 0) return 0
  const sorted = [...rows].sort((a, b) => b.ano * 100 + b.mes - (a.ano * 100 + a.mes))
  return Number(sorted[0]?.movimentacao) || 0
}

interface ChartsType {
  Bar: React.ComponentType<Record<string, unknown>>
  Line: React.ComponentType<Record<string, unknown>>
}

interface Props {
  chartDatei: string
  setChartDatei: (v: string) => void
  chartDatef: string
  setChartDatef: (v: string) => void
  chartData: Record<string, unknown> | null
  chartLoading: boolean
  params: Record<string, number>
  onLoad: () => void
  onClose: () => void
  onOpenErp: () => void
}

export function ContratoChartModal({
  chartDatei, setChartDatei, chartDatef, setChartDatef,
  chartData, chartLoading, params, onLoad, onClose, onOpenErp,
}: Props) {
  const [fullscreen, setFullscreen] = useState(false)
  const [sections, setSections] = useState({
    parametros: true, dadosMeses: true, comparativo: true,
    lancamentos: true, faturamento: true, nf_entrada: true, nf_saida: true,
    nf_prestado: true, nf_tomado: true, vidas: true,
  })
  const [Charts, setCharts] = useState<ChartsType | null>(null)

  // Carrega Chart.js + plugin datalabels
  useEffect(() => {
    Promise.all([
      import('chart.js'),
      import('react-chartjs-2'),
      import('chartjs-plugin-datalabels'),
    ]).then(([mod, c, dl]) => {
      mod.Chart.register(
        mod.CategoryScale, mod.LinearScale, mod.BarElement, mod.LineElement,
        mod.PointElement, mod.Title, mod.Tooltip, mod.Legend, mod.Filler,
        // Registra datalabels (uma vez por sessão)
        (dl.default as unknown) as Parameters<typeof mod.Chart.register>[0],
      )
      setCharts({
        Bar: c.Bar as React.ComponentType<Record<string, unknown>>,
        Line: c.Line as React.ComponentType<Record<string, unknown>>,
      })
    }).catch((e) => {
      console.warn('[ContratoChartModal] erro ao carregar Chart.js:', e)
    })
  }, [])

  const data = chartData as ChartData | null

  // ─── Mini-cards de parâmetros (com borda colorida por status) ───
  const paramCards = useMemo(() => {
    if (!data) return []
    return INDICATORS.map((ind) => {
      const rows = data[ind.key]
      const paramVal = params[ind.paramKey] || 0
      const ultimo = ultimoValor(rows)
      const st = statusFromVal(ultimo, paramVal)
      return { ...ind, paramVal, ultimo, status: st }
    })
  }, [data, params])

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => !chartLoading && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'bg-card rounded-lg shadow-xl flex flex-col modal-content transition-all',
            fullscreen ? 'w-full h-full max-w-none max-h-none rounded-none' : 'w-full max-w-6xl max-h-[92vh]',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between shrink-0">
            <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
              <FileBarChart className="h-4 w-4 text-muted-foreground" /> Gráficos — Contrato x ERP
            </h4>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setFullscreen(!fullscreen)} className="text-muted-foreground hover:text-foreground" title={fullscreen ? 'Restaurar' : 'Tela cheia'}>
                {fullscreen ? <ArrowLeft className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
              </button>
              <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Filtros + Checkboxes */}
          <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] shrink-0 space-y-2">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1"><Label>Início</Label><Input type="date" value={chartDatei} onChange={(e) => setChartDatei(e.target.value)} className="h-8" /></div>
              <div className="space-y-1"><Label>Fim</Label><Input type="date" value={chartDatef} onChange={(e) => setChartDatef(e.target.value)} className="h-8" /></div>
              <Button type="button" size="sm" onClick={onLoad} disabled={chartLoading} style={{ backgroundColor: '#10b981', color: '#fff' }}>
                {chartLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />} Atualizar
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Exibir:</span>
              {[
                { k: 'parametros', l: 'Parâmetros' },
                { k: 'dadosMeses', l: 'Dados por mês' },
                { k: 'comparativo', l: 'Comparativo' },
                ...INDICATORS.map((i) => ({ k: i.key, l: i.label })),
              ].map((s) => (
                <label key={s.k} className="flex items-center gap-1 text-[10px] cursor-pointer">
                  <Checkbox checked={sections[s.k as keyof typeof sections] ?? true} onCheckedChange={(v) => setSections((prev) => ({ ...prev, [s.k]: !!v }))} />
                  {s.l}
                </label>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {chartLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
                <p className="text-sm text-muted-foreground">Carregando dados do SCI...</p>
              </div>
            ) : !data ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileBarChart className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm mb-3">Nenhuma consulta ERP salva para este período.</p>
                <Button type="button" variant="outline" size="sm" onClick={onOpenErp}>Executar Verificar no ERP</Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* ═══ Mini-cards de parâmetros (borda colorida) ═══ */}
                {sections.parametros && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {paramCards.map((card) => (
                      <div
                        key={card.key}
                        className="rounded border-l-4 p-3 bg-card"
                        style={{
                          borderLeftColor: borderColorByStatus(card.status),
                          borderTop: '1px solid rgba(0,0,0,0.04)',
                          borderRight: '1px solid rgba(0,0,0,0.04)',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                        }}
                      >
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">{card.label}</p>
                        <p className="text-lg font-bold" style={{ color: card.color }}>
                          {fmtVal(card.ultimo, card.isMoney)}
                        </p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9px] text-muted-foreground">
                            Contrato: {card.paramVal > 0 ? fmtVal(card.paramVal, card.isMoney) : '—'}
                          </span>
                          <span className={cn('text-[9px] font-bold px-1 rounded', STATUS_BADGE[card.status].bg, STATUS_BADGE[card.status].text)}>
                            {STATUS_BADGE[card.status].label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ═══ Gráfico multi-série: dados por mês ═══ */}
                {sections.dadosMeses && Charts && (
                  <MultiSeriesChart data={data} Charts={Charts} fullscreen={fullscreen} />
                )}

                {/* ═══ Comparativo: 5 bar charts (Contrato vs ERP último mês) ═══ */}
                {sections.comparativo && Charts && (
                  <div>
                    <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Comparativo — Contrato vs ERP (último mês)
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                      {INDICATORS.slice(0, 5).map((ind) => (
                        <ComparativoCard key={ind.key} ind={ind} data={data} params={params} Charts={Charts} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ═══ Gráficos por indicador (agrupado por ano + sparkline + tabela) ═══ */}
                {Charts && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {INDICATORS.filter((ind) => sections[ind.key as keyof typeof sections]).map((ind) => {
                      const rows = data[ind.key] || []
                      if (rows.length === 0) return null
                      return (
                        <IndicadorCard
                          key={ind.key}
                          ind={ind}
                          rows={rows}
                          paramVal={params[ind.paramKey] || 0}
                          Charts={Charts}
                          fullscreen={fullscreen}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] flex justify-end shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Multi-Série — 5 indicadores no mesmo gráfico (Lanc/Ent/Sai/Vidas + Fat no Y direito)
// ═══════════════════════════════════════════════════════════════

function MultiSeriesChart({ data, Charts, fullscreen }: { data: ChartData; Charts: ChartsType; fullscreen: boolean }) {
  // Coleta todos os meses únicos (ordenados cronologicamente)
  const labelsSet = new Set<string>()
  for (const ind of INDICATORS) {
    const rows = data[ind.key] || []
    rows.forEach((r) => labelsSet.add(`${r.ano}-${String(r.mes).padStart(2, '0')}`))
  }
  const sortedKeys = Array.from(labelsSet).sort()
  const labels = sortedKeys.map((k) => {
    const [y, m] = k.split('-')
    return `${MESES_PT[Number(m) - 1]}/${y.slice(2)}`
  })

  const seriesOf = (key: string): number[] => {
    const rows = data[key] || []
    const map = new Map<string, number>()
    rows.forEach((r) => map.set(`${r.ano}-${String(r.mes).padStart(2, '0')}`, Number(r.movimentacao) || 0))
    return sortedKeys.map((k) => map.get(k) || 0)
  }

  const cData = {
    labels,
    datasets: [
      { label: 'Lançamentos', data: seriesOf('lancamentos'), borderColor: '#5ea3cb', backgroundColor: '#5ea3cb40', tension: 0.2, yAxisID: 'y', fill: false },
      { label: 'NF Entrada', data: seriesOf('nf_entrada'), borderColor: '#f59e0b', backgroundColor: '#f59e0b40', tension: 0.2, yAxisID: 'y', fill: false },
      { label: 'NF Saída', data: seriesOf('nf_saida'), borderColor: '#8b5cf6', backgroundColor: '#8b5cf640', tension: 0.2, yAxisID: 'y', fill: false },
      { label: 'Vidas', data: seriesOf('vidas'), borderColor: '#f97316', backgroundColor: '#f9731640', tension: 0.2, yAxisID: 'y', fill: false },
      { label: 'Faturamento', data: seriesOf('faturamento'), borderColor: '#10b981', backgroundColor: '#10b98140', tension: 0.2, yAxisID: 'y1', fill: false, borderDash: [4, 2] },
    ],
  }
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 10 }, usePointStyle: true } },
      datalabels: { display: false }, // multi-série fica poluído com label
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string; yAxisID?: string }; parsed: { y: number } }) => {
            const v = ctx.parsed.y
            const isFat = ctx.dataset.yAxisID === 'y1'
            return `${ctx.dataset.label}: ${fmtVal(v, isFat)}`
          },
        },
      },
    },
    scales: {
      y: { beginAtZero: true, position: 'left' as const, title: { display: true, text: 'Quantidade', font: { size: 9 } }, ticks: { font: { size: 9 } } },
      y1: { beginAtZero: true, position: 'right' as const, title: { display: true, text: 'Faturamento (R$)', font: { size: 9 } }, ticks: { font: { size: 9 }, callback: (v: number) => fmtValShort(v, true) }, grid: { drawOnChartArea: false } },
      x: { ticks: { font: { size: 9 } } },
    },
  }

  return (
    <div className="rounded border border-border/40 p-4">
      <h5 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Dados extraídos por mês (multi-série)
      </h5>
      <div style={{ height: fullscreen ? '380px' : '260px' }}>
        <Charts.Line data={cData} options={opts} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Card Comparativo: bar de 2 colunas (Contrato vs ERP último mês)
// ═══════════════════════════════════════════════════════════════

function ComparativoCard({ ind, data, params, Charts }: {
  ind: Indicator; data: ChartData; params: Record<string, number>; Charts: ChartsType
}) {
  const paramVal = params[ind.paramKey] || 0
  const ultimo = ultimoValor(data[ind.key])
  const st = statusFromVal(ultimo, paramVal)

  const cData = {
    labels: ['Contrato', 'ERP'],
    datasets: [{
      data: [paramVal, ultimo],
      backgroundColor: ['rgba(0,0,0,0.15)', ind.color + 'bb'],
      borderColor: ['rgba(0,0,0,0.3)', ind.color],
      borderWidth: 1,
      borderRadius: 3,
    }],
  }
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: ind.label, font: { size: 10, weight: '600' as const } },
      datalabels: {
        anchor: 'end' as const,
        align: 'top' as const,
        font: { size: 9, weight: 'bold' as const },
        formatter: (v: number) => fmtValShort(v, ind.isMoney),
        color: '#374151',
      },
      tooltip: {
        callbacks: { label: (ctx: { raw: number }) => fmtVal(ctx.raw, ind.isMoney) },
      },
    },
    scales: {
      y: { display: false, beginAtZero: true, grace: '20%' as const },
      x: { ticks: { font: { size: 9 } } },
    },
  }

  return (
    <div className="rounded border border-border/40 p-3">
      <div style={{ height: '120px' }}>
        <Charts.Bar data={cData} options={opts} />
      </div>
      <div className="mt-1 flex items-center justify-center">
        <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded', STATUS_BADGE[st].bg, STATUS_BADGE[st].text)}>
          {STATUS_BADGE[st].label}
        </span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Card por indicador: barras agrupadas por ano + sparkline + tabela
// ═══════════════════════════════════════════════════════════════

function IndicadorCard({ ind, rows, paramVal, Charts, fullscreen }: {
  ind: Indicator; rows: ErpRow[]; paramVal: number; Charts: ChartsType; fullscreen: boolean
}) {
  // Agrupa por ano (jan/2025 ao lado de jan/2026)
  const anos = Array.from(new Set(rows.map((r) => r.ano))).sort()
  const byMesAno: Record<number, Record<number, number>> = {}
  for (let m = 1; m <= 12; m++) byMesAno[m] = {}
  rows.forEach((r) => {
    byMesAno[r.mes][r.ano] = (byMesAno[r.mes][r.ano] || 0) + Number(r.movimentacao || 0)
  })

  const labels = MESES_PT
  const datasets = anos.map((ano, i) => ({
    label: String(ano),
    data: labels.map((_, mi) => byMesAno[mi + 1][ano] || 0),
    backgroundColor: YEAR_COLORS[i % YEAR_COLORS.length] + 'cc',
    borderColor: YEAR_COLORS[i % YEAR_COLORS.length],
    borderWidth: 1,
    borderRadius: 3,
    order: 2,
  })) as Array<Record<string, unknown>>

  if (paramVal > 0) {
    datasets.unshift({
      label: 'Contrato (limite)',
      data: labels.map(() => paramVal),
      type: 'line',
      borderColor: '#ef4444',
      borderWidth: 2,
      borderDash: [6, 3],
      pointRadius: 0,
      fill: false,
      order: 1,
    })
  }

  const barData = { labels, datasets }
  const barOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const, labels: { font: { size: 9 }, usePointStyle: true, pointStyleWidth: 8 } },
      title: { display: true, text: `${ind.label} — ERP × Contrato`, font: { size: 11, weight: '600' as const }, color: '#374151' },
      datalabels: {
        anchor: 'end' as const,
        align: 'top' as const,
        font: { size: 8, weight: 'bold' as const },
        color: '#374151',
        formatter: (v: number) => v > 0 ? fmtValShort(v, ind.isMoney) : '',
        // Esconde label de linha (Contrato limite)
        display: (ctx: { dataset: { type?: string } }) => ctx.dataset.type !== 'line',
      },
      tooltip: {
        callbacks: { label: (ctx: { dataset: { label?: string }; parsed: { y: number } }) => `${ctx.dataset.label}: ${fmtVal(ctx.parsed.y, ind.isMoney)}` },
      },
    },
    scales: {
      y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: (v: number) => fmtValShort(v, ind.isMoney) } },
      x: { ticks: { font: { size: 9 } } },
    },
  }

  // Sparkline (cronológico)
  const sortedRows = [...rows].sort((a, b) => a.ano * 100 + a.mes - (b.ano * 100 + b.mes))
  const sparkLabels = sortedRows.map((r) => `${String(r.mes).padStart(2, '0')}/${String(r.ano).slice(2)}`)
  const sparkValues = sortedRows.map((r) => Number(r.movimentacao) || 0)
  const sparkData = {
    labels: sparkLabels,
    datasets: [{
      data: sparkValues, borderColor: ind.color, backgroundColor: ind.color + '30',
      tension: 0.3, fill: true, pointRadius: 2, pointBackgroundColor: ind.color,
    }],
  }
  const sparkOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
      tooltip: {
        callbacks: { label: (ctx: { parsed: { y: number }; label: string }) => `${ctx.label}: ${fmtVal(ctx.parsed.y, ind.isMoney)}` },
      },
    },
    scales: { y: { display: false, beginAtZero: true }, x: { ticks: { font: { size: 8 } } } },
  }

  return (
    <div className="rounded border border-border/40 p-4">
      <div style={{ height: fullscreen ? '300px' : '220px' }}>
        <Charts.Bar data={barData} options={barOpts} />
      </div>

      {/* Sparkline */}
      <div className="mt-3 pt-3 border-t border-border/20">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground mb-1">Evolução temporal</p>
        <div style={{ height: '70px' }}>
          <Charts.Line data={sparkData} options={sparkOpts} />
        </div>
      </div>

      {/* Tabela completa: Mês/Valor/Limite/Status */}
      <div className="mt-2 max-h-[140px] overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border/30">
              <th className="text-left py-1 px-1 font-semibold text-muted-foreground">Mês/Ano</th>
              <th className="text-right py-1 px-1 font-semibold text-muted-foreground">Valor ERP</th>
              <th className="text-right py-1 px-1 font-semibold text-muted-foreground">Limite</th>
              <th className="text-center py-1 px-1 font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => {
              const v = Number(r.movimentacao) || 0
              const st = statusFromVal(v, paramVal)
              return (
                <tr key={i} className="border-b border-border/10">
                  <td className="py-1 px-1">{String(r.mes).padStart(2, '0')}/{r.ano}</td>
                  <td className="py-1 px-1 text-right font-mono">{fmtVal(v, ind.isMoney)}</td>
                  <td className="py-1 px-1 text-right font-mono text-muted-foreground">{paramVal > 0 ? fmtVal(paramVal, ind.isMoney) : '—'}</td>
                  <td className="py-1 px-1 text-center">
                    <span className={cn('text-[8px] font-bold px-1 rounded', STATUS_BADGE[st].bg, STATUS_BADGE[st].text)}>
                      {STATUS_BADGE[st].label}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
