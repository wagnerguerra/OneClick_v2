'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3, Headphones, Loader2, AlertTriangle, CheckCircle2, Star, Clock,
  Users, Tag, Inbox,
} from 'lucide-react'
import { Card, CardContent, Badge, Button, Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

interface Metricas {
  periodoDias: number
  kpis: {
    totalAbertos: number
    totalAtrasados: number
    totalResolvidos: number
    totalConcluidos: number
    totalNoPeriodo: number
    slaCumprimentoPct: number | null
    csatMedio: number | null
    csatRespostas: number
    tfrHoras: number | null
    mttrHoras: number | null
  }
  porCategoria: Array<{ id: string | null; nome: string; cor: string | null; total: number }>
  porAgente: Array<{ id: string | null; name: string; image: string | null; total: number }>
}

function formatHoras(h: number | null): string {
  if (h === null) return '—'
  if (h < 1) return `${Math.round(h * 60)} min`
  if (h < 24) return `${h.toFixed(1)} h`
  const d = h / 24
  return `${d.toFixed(1)} d`
}

export default function HelpdeskMetricasPage() {
  const router = useRouter()
  const [data, setData] = useState<Metricas | null>(null)
  const [periodoDias, setPeriodoDias] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ;(trpc.helpdesk as any).getMetricas.query({ periodoDias })
      .then((d: Metricas) => setData(d))
      .catch((e: Error) => { alerts.error('Erro', e.message); setData(null) })
      .finally(() => setLoading(false))
  }, [periodoDias])

  const maxCat = data ? Math.max(...data.porCategoria.map(c => c.total), 1) : 1
  const maxAg = data ? Math.max(...data.porAgente.map(a => a.total), 1) : 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULO_COLOR}, color-mix(in srgb, ${MODULO_COLOR} 87%, transparent))` }}
          >
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>HelpDesk — Métricas</h1>
            <p className="text-sm text-muted-foreground">Indicadores de atendimento — TFR, MTTR, SLA, CSAT.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(periodoDias)} onValueChange={v => setPeriodoDias(Number(v))}>
            <SelectTrigger className="h-9 text-sm w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="180">Últimos 180 dias</SelectItem>
              <SelectItem value="365">Últimos 365 dias</SelectItem>
            </SelectContent>
          </Select>
          <BackButton href="/helpdesk" />
        </div>
      </div>

      {loading || !data ? (
        <Card><CardContent className="p-12 flex items-center justify-center text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando métricas...
        </CardContent></Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <Kpi label="Abertos" value={data.kpis.totalAbertos} icon={Inbox} color="cyan" />
            <Kpi label="Atrasados" value={data.kpis.totalAtrasados} icon={AlertTriangle} color="rose" />
            <Kpi label="Resolvidos" value={data.kpis.totalResolvidos} icon={CheckCircle2} color="emerald" />
            <Kpi label="Total no período" value={data.kpis.totalNoPeriodo} icon={Headphones} color="violet" />
            <Kpi
              label="SLA cumprido"
              value={data.kpis.slaCumprimentoPct === null ? '—' : `${data.kpis.slaCumprimentoPct}%`}
              icon={Clock}
              color={data.kpis.slaCumprimentoPct !== null && data.kpis.slaCumprimentoPct >= 90 ? 'emerald' : data.kpis.slaCumprimentoPct !== null && data.kpis.slaCumprimentoPct >= 70 ? 'amber' : 'rose'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                  <Clock className="h-3.5 w-3.5" /> Tempo médio de 1ª resposta
                </div>
                <p className="text-3xl font-bold tabular-nums">{formatHoras(data.kpis.tfrHoras)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Tempo médio de resolução
                </div>
                <p className="text-3xl font-bold tabular-nums">{formatHoras(data.kpis.mttrHoras)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground uppercase tracking-wide">
                  <Star className="h-3.5 w-3.5" /> CSAT médio
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold tabular-nums">
                    {data.kpis.csatMedio === null ? '—' : data.kpis.csatMedio.toFixed(1)}
                  </p>
                  <span className="text-xs text-muted-foreground">/ 5</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{data.kpis.csatRespostas} resposta{data.kpis.csatRespostas === 1 ? '' : 's'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4" /> Volume por categoria
                </h3>
                {data.porCategoria.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Sem dados no período.</p>
                ) : (
                  <div className="space-y-2">
                    {data.porCategoria.map(c => (
                      <div key={c.id ?? 'sem'} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            {c.cor && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />}
                            <span className="truncate">{c.nome}</span>
                          </span>
                          <span className="tabular-nums font-medium">{c.total}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(c.total / maxCat) * 100}%`, backgroundColor: c.cor || MODULO_COLOR }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4" /> Volume por agente
                </h3>
                {data.porAgente.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-6 text-center">Sem tickets atribuídos no período.</p>
                ) : (
                  <div className="space-y-2">
                    {data.porAgente.map(a => (
                      <div key={a.id ?? 'sem'} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="truncate font-medium">{a.name}</span>
                          <span className="tabular-nums">{a.total}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(a.total / maxAg) * 100}%`, backgroundColor: MODULO_COLOR }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {data.kpis.csatRespostas === 0 && (
            <Card>
              <CardContent className="p-4 text-center">
                <Badge variant="outline" className="text-[10px]">CSAT ainda sem respostas no período</Badge>
                <p className="text-xs text-muted-foreground mt-2">
                  Conforme tickets resolvidos forem avaliados pelos solicitantes, o KPI vai aparecer aqui.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, icon: Icon, color }: {
  label: string
  value: number | string
  icon: typeof Headphones
  color: 'cyan' | 'rose' | 'emerald' | 'violet' | 'amber'
}) {
  const styles: Record<string, string> = {
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-600',
    rose: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-600',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-600',
    violet: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800 text-violet-600',
    amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600',
  }
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${styles[color]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
        <p className="text-[10px] uppercase tracking-wide font-medium opacity-80 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
