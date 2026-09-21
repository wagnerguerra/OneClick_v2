/** Chaves visuais compartilhadas entre a listagem e o detalhe. */
import { BADGE } from '@/lib/color-styles'

export const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

export const ANALISE_BADGE: Record<string, string> = {
  EXTERNA: BADGE.sky,
  INTERNA: BADGE.violet,
}
export const TIPO_BADGE: Record<string, string> = {
  OPORTUNIDADE: BADGE.emerald,
  FORCA: BADGE.emerald,
  AMEACA: BADGE.rose,
  FRAQUEZA: BADGE.amber,
}

/** Farol do grau de risco (gravidade × probabilidade, 1–9). */
export function riscoClasse(grau: number | null | undefined): string {
  if (grau == null) return 'bg-muted text-muted-foreground'
  if (grau >= 6) return BADGE.rose
  if (grau >= 3) return BADGE.amber
  return BADGE.emerald
}

export const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
