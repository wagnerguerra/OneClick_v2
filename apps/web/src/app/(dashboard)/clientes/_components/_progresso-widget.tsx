'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@saas/ui'

export interface DistProgresso {
  etapa: string
  mensagem: string
  atual: number
  total: number
  pct: number
}

/** Widget de progresso compartilhado NFe SEFAZ + NFS-e Nacional + outras sync futuras. */
export function ProgressoWidget({
  progresso,
  solicitado,
  cor,
}: {
  progresso: DistProgresso | null
  solicitado: boolean
  cor: 'sky' | 'emerald'
}) {
  if (!progresso && !solicitado) return null

  const corMap = {
    sky: { bg: 'bg-sky-50 dark:bg-sky-950/30', border: 'border-sky-200 dark:border-sky-900/40', text: 'text-sky-900 dark:text-sky-200', bar: 'bg-sky-500', barBg: 'bg-sky-200/40 dark:bg-sky-900/40' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-900/40', text: 'text-emerald-900 dark:text-emerald-200', bar: 'bg-emerald-500', barBg: 'bg-emerald-200/40 dark:bg-emerald-900/40' },
  }[cor]

  return (
    <div className={cn('rounded-md border p-3', corMap.bg, corMap.border)}>
      <div className={cn('flex items-center justify-between text-[11px] mb-1.5', corMap.text)}>
        <span className="flex items-center gap-1.5 font-semibold">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {!progresso ? 'Aguardando o scheduler (até 60s)...' : progresso.mensagem}
        </span>
        {progresso?.pct ? (
          <span className="tabular-nums">{progresso.pct}%</span>
        ) : null}
      </div>
      <div className={cn('h-1.5 w-full overflow-hidden rounded-full', corMap.barBg)}>
        <div
          className={cn('h-full transition-all duration-300', corMap.bar)}
          style={{
            width: progresso?.pct ? `${progresso.pct}%` : '10%',
            animation: progresso?.pct ? undefined : 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      {progresso && progresso.total > 0 && (
        <div className={cn('text-[10px] mt-1.5 opacity-70', corMap.text)}>
          Etapa: <b className="capitalize">{progresso.etapa}</b> · {progresso.atual} de {progresso.total}
        </div>
      )}
    </div>
  )
}
