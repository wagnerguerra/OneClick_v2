/** Chaves visuais compartilhadas entre a listagem e o detalhe. */
export const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

export const ANALISE_BADGE: Record<string, string> = {
  EXTERNA: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  INTERNA: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-400 dark:border-violet-800',
}
export const TIPO_BADGE: Record<string, string> = {
  OPORTUNIDADE: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  FORCA: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  AMEACA: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
  FRAQUEZA: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
}

/** Farol do grau de risco (gravidade × probabilidade, 1–9). */
export function riscoClasse(grau: number | null | undefined): string {
  if (grau == null) return 'bg-muted text-muted-foreground'
  if (grau >= 6) return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
  if (grau >= 3) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
}

export const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
