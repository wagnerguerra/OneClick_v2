'use client'

import { cn } from '@saas/ui'

/**
 * Pontua a senha de 0 a 4 por comprimento + variedade de caracteres.
 * Heurística leve (UX), client-side — a regra dura (mínimo 8) é validada no
 * Zod e pelo Better Auth (minPasswordLength) no servidor. F-011.
 */
export function scorePassword(pw: string): number {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(s, 4)
}

const LEVELS = [
  { label: 'Muito fraca', bar: 'bg-rose-500', text: 'text-rose-500' },
  { label: 'Fraca', bar: 'bg-orange-500', text: 'text-orange-500' },
  { label: 'Média', bar: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Boa', bar: 'bg-lime-500', text: 'text-lime-600' },
  { label: 'Forte', bar: 'bg-emerald-500', text: 'text-emerald-600' },
] as const

/** Medidor de força de senha — 4 barras + rótulo. Não renderiza com senha vazia. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null
  const score = scorePassword(password)
  const level = LEVELS[score]!
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              i < score ? level.bar : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p className={cn('text-xs', level.text)}>Força da senha: {level.label}</p>
    </div>
  )
}
