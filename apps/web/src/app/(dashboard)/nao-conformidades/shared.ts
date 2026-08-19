/** Chaves visuais compartilhadas do módulo de Não Conformidades. */
export const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

export const NC_SITUACAO_BADGE: Record<string, string> = {
  AGUARDANDO_CAUSA: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800',
  AGUARDANDO_ACOES: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  EM_TRATAMENTO: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  AGUARDANDO_CONCLUSAO: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
  FINALIZADA: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  CANCELADA: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
}

export const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
