'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Shield, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { EmptyState } from './empty-state'
import { KpiPill } from './kpi-pill'

interface T { total: number; negativas: number; positivasEfeitos: number; naoEmitidas: number; vencidas: number; vencendo: number }

export function CndFederaisWidget({ title, bloco }: { canRead?: boolean; title?: string; bloco?: string } = {}) {
  const titulo = title ?? "CND's Federais"
  const [t, setT] = useState<T | null>(null)
  useEffect(() => {
    trpc.cnd.totalizadores.query().then((d: unknown) => setT(d as T)).catch(() => {})
  }, [])
  if (!t) return <EmptyState color="indigo" Icon={Shield} title={titulo} message="Carregando..." bloco={bloco} />
  if (t.total === 0) return <EmptyState color="indigo" Icon={Shield} title={titulo} message="Nenhuma certidão consultada" href="/certidoes-cnd" bloco={bloco} />

  return (
    <Card className="h-full border-l-4 border-l-indigo-500 overflow-hidden @container/widget" style={bloco ? { borderLeftColor: bloco } : undefined}>
      <CardContent className="p-3 @sm:p-4 h-full overflow-hidden">
        <div className="flex flex-col @[420px]:flex-row @[420px]:items-center @[420px]:justify-between gap-3">
          <Link href="/certidoes-cnd" className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0">
            <div className="flex h-9 w-9 @sm:h-10 @sm:w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/20">
              <Shield className="h-4 w-4 @sm:h-5 @sm:w-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{titulo}</h3>
              <p className="text-xs text-muted-foreground truncate">{t.total} certidão(ões)</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap @[420px]:justify-end">
            {t.negativas > 0          && <KpiPill color="emerald" Icon={CheckCircle2}  count={t.negativas}        label="Negativa"      href="/certidoes-cnd?filtro=Negativa" />}
            {t.positivasEfeitos > 0   && <KpiPill color="amber"   Icon={AlertTriangle} count={t.positivasEfeitos} label="Positiva c/ Ef." href="/certidoes-cnd?filtro=Positiva+com+Efeitos+de+Negativa" />}
            {t.naoEmitidas > 0        && <KpiPill color="red"     Icon={XCircle}       count={t.naoEmitidas}      label="Não emitida"   href="/certidoes-cnd?filtro=__nao_emitida__" />}
            {t.vencendo > 0           && <KpiPill color="orange"  Icon={Clock}         count={t.vencendo}         label="Vencendo"      href="/certidoes-cnd?filtro=__vencendo__" />}
            {t.vencidas > 0           && <KpiPill color="gray"    Icon={XCircle}       count={t.vencidas}         label="Vencida"       href="/certidoes-cnd?filtro=__vencidas__" />}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
