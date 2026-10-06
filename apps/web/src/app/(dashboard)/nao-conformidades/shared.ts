/** Chaves visuais compartilhadas do módulo de Não Conformidades. */
import { BADGE } from '@/lib/color-styles'

export const PRIMARY = 'var(--color-primary)'

export const NC_SITUACAO_BADGE: Record<string, string> = {
  AGUARDANDO_CAUSA: BADGE.orange,
  AGUARDANDO_ACOES: BADGE.amber,
  EM_TRATAMENTO: BADGE.sky,
  AGUARDANDO_CONCLUSAO: BADGE.violet,
  FINALIZADA: BADGE.emerald,
  CANCELADA: BADGE.rose,
}

export const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export const dataHoraBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
