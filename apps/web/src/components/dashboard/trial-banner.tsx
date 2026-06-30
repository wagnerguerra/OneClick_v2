'use client'

import Link from 'next/link'
import { Clock, ArrowRight } from 'lucide-react'
import { cn } from '@saas/ui'

/**
 * Faixa de aviso do período de teste, exibida no topo do dashboard enquanto o
 * tenant está em TRIAL. Fica âmbar e, nos últimos 3 dias, vermelho (urgência).
 * Cores via utilitários Tailwind semânticos (com variante dark) — sem hex.
 */
export function TrialBanner({ daysRemaining }: { daysRemaining: number }) {
  const urgent = daysRemaining <= 3

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 text-sm border-b sm:px-6',
        urgent
          ? 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300'
          : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300',
      )}
    >
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 shrink-0" />
        <span>
          {daysRemaining > 0 ? (
            <>
              Período de teste —{' '}
              <strong className="font-semibold">
                {daysRemaining} {daysRemaining === 1 ? 'dia restante' : 'dias restantes'}
              </strong>
            </>
          ) : (
            <>Seu período de teste termina hoje</>
          )}
        </span>
      </div>
      <Link
        href="/configuracoes/assinatura"
        className="flex items-center gap-1 font-semibold underline shrink-0 underline-offset-2"
      >
        Assinar agora
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
