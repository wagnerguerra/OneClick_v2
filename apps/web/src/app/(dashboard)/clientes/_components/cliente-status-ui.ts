// #HLP0209 — FONTE ÚNICA das cores de status do cliente no frontend.
//
// Convenção do módulo:
//   • Ativo   → verde (emerald)
//   • Inativo → âmbar (amber)
//
// TUDO que pinta status/ação de cliente deriva daqui — não hardcode cores soltas:
//   • Badges "soft" (lista de clientes, badges do log) → STATUS_BADGE_CLASS / EVENT_BADGE_CLASS.
//   • Botões de AÇÃO (inativar/reativar) → variants `soft-warning` (âmbar) e
//     `soft-success` (verde) do <Button>.
//   • Badge SÓLIDO do cabeçalho do detalhe → STATUS_COLORS (hex) em `@saas/types`,
//     mantido alinhado (ATIVO emerald, INATIVO amber).
import type { ClienteStatus } from '@saas/types'

/** Classes Tailwind do badge "soft" de status (fundo pastel + texto na cor principal). */
export const STATUS_BADGE_CLASS: Record<ClienteStatus, string> = {
  ATIVO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INATIVO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

/** Badges de evento do histórico espelham o status resultante da ação. */
export const EVENT_BADGE_CLASS: Record<'inactivated' | 'reactivated', string> = {
  inactivated: STATUS_BADGE_CLASS.INATIVO,
  reactivated: STATUS_BADGE_CLASS.ATIVO,
}
