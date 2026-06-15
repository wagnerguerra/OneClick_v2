import type { HelpdeskStatus } from '@saas/types'

// Classes NativeWind por status do helpdesk (badge: fundo translúcido + texto).
// Mantém coerência com o sistema (sky/amber/violet/emerald/rose).
export const HELPDESK_STATUS_CLASSES: Record<HelpdeskStatus, { bg: string; text: string }> = {
  NOVO: { bg: 'bg-sky-500/15', text: 'text-sky-600 dark:text-sky-400' },
  EM_ANDAMENTO: { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400' },
  AGUARDANDO_AUDITORIA: { bg: 'bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400' },
  RESOLVIDO: { bg: 'bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400' },
  CONCLUIDO: { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400' },
  CANCELADO: { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400' },
}
