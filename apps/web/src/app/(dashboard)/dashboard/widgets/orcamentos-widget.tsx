'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Send, Clock, AlertTriangle, Lock, CalendarClock } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { EmptyState } from './empty-state'
import { KpiPill } from './kpi-pill'

interface Stats {
  permitido: true
  aguardandoEnvio: number
  aguardandoAprovacao: number
  atrasados: number
  vencendo7d: number
  valorPendente: number
}
interface SemAcesso { permitido: false }
type StatsResp = Stats | SemAcesso

function formatMoeda(v: number): string {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1).replace('.', ',')}k`
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
}

export function OrcamentosWidget({ title, bloco }: { canRead?: boolean; title?: string; bloco?: string } = {}) {
  const [s, setS] = useState<StatsResp | null>(null)

  useEffect(() => {
    ;(trpc.orcamento as any).getDashboardStats.query()
      .then((d: StatsResp) => setS(d))
      .catch(() => setS({ permitido: false }))
  }, [])

  if (!s) {
    return <EmptyState color="amber" Icon={FileText} title="Orçamentos" message="Carregando..." bloco={bloco} />
  }

  // Sem permissão de cargo (não-gestor) — orçamentos exigem cargo gestor+
  if (!s.permitido) {
    return (
      <Card
        className="h-full border-l-4 border-l-amber-500 overflow-hidden @container/widget"
        style={bloco ? { borderLeftColor: bloco } : undefined}
      >
        <CardContent className="p-3 @sm:p-4 h-full overflow-hidden">
          <div className="flex items-center justify-between gap-3 h-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 @sm:h-10 @sm:w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <Lock className="h-4 w-4 @sm:h-5 @sm:w-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">{title ?? 'Orçamentos'}</h3>
                <p className="text-xs text-muted-foreground truncate">
                  Restrito a gestores e acima
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalPendentes = s.aguardandoEnvio + s.aguardandoAprovacao
  if (totalPendentes === 0 && s.atrasados === 0 && s.vencendo7d === 0) {
    return (
      <EmptyState
        color="amber"
        Icon={FileText}
        title={title ?? 'Orçamentos'}
        message="Nenhum orçamento em aberto"
        href="/orcamentos"
        showCheck
        bloco={bloco}
      />
    )
  }

  return (
    <Card
      className="h-full border-l-4 border-l-amber-500 overflow-hidden @container/widget"
      style={bloco ? { borderLeftColor: bloco } : undefined}
    >
      <CardContent className="p-3 @sm:p-4 h-full overflow-hidden">
        <div className="flex flex-col @[460px]:flex-row @[460px]:items-center @[460px]:justify-between gap-3">
          <Link href="/orcamentos" className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0">
            <div className="flex h-9 w-9 @sm:h-10 @sm:w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/20">
              <FileText className="h-4 w-4 @sm:h-5 @sm:w-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{title ?? 'Orçamentos'}</h3>
              <p className="text-xs text-muted-foreground truncate tabular-nums">
                {s.valorPendente > 0
                  ? `${formatMoeda(s.valorPendente)} em aberto`
                  : 'Pipeline comercial'}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap @[460px]:justify-end">
            {s.aguardandoEnvio > 0 && (
              <KpiPill color="gray" Icon={Send} count={s.aguardandoEnvio} label="A enviar" href="/orcamentos?status=A_ENVIAR" />
            )}
            {s.aguardandoAprovacao > 0 && (
              <KpiPill color="sky" Icon={Clock} count={s.aguardandoAprovacao} label="Aguardando" href="/orcamentos?status=ENVIADO" />
            )}
            {s.vencendo7d > 0 && (
              <KpiPill color="amber" Icon={CalendarClock} count={s.vencendo7d} label="Vencendo 7d" href="/orcamentos" />
            )}
            {s.atrasados > 0 && (
              <KpiPill color="rose" Icon={AlertTriangle} count={s.atrasados} label="Atrasados" href="/orcamentos" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
