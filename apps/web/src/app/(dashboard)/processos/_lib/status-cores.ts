import { cn } from '@saas/ui'
import { BADGE, SURFACE, TEXT, type ColorName } from '@/lib/color-styles'

/**
 * Cor de cada status de processo/execução — FONTE ÚNICA para a listagem, o
 * detalhe e o painel de Processos. Mapeia status → cor do helper; selo, KPI e
 * hex (estilo inline/SVG do gantt) derivam daqui. Status novo/desconhecido cai
 * em slate.
 *
 * EM_ANDAMENTO é blue (status "em progresso"), não o sky do módulo
 * Administrativo. ATRASADO e PAUSADO são situações do painel (derivadas de
 * prazo/pausa sobre uma execução EM_ANDAMENTO), não valores de status no banco.
 */
export const STATUS_COR: Record<string, ColorName> = {
  EM_ANDAMENTO: 'blue',
  CONCLUIDO: 'emerald',
  CANCELADO: 'rose',
  AGUARDANDO_INICIO: 'amber',
  AGUARDANDO_RESPOSTA: 'orange',
  PULADO: 'slate',
  ATRASADO: 'red',
  PAUSADO: 'slate',
}

/** Tom 500 de cada cor usada acima — para estilo inline/SVG (gantt, legenda). */
const HEX_500: Partial<Record<ColorName, string>> = {
  blue: '#3b82f6',
  emerald: '#10b981',
  rose: '#f43f5e',
  amber: '#f59e0b',
  orange: '#f97316',
  slate: '#64748b',
  red: '#ef4444',
}

const corDe = (status: string): ColorName => STATUS_COR[status] ?? 'slate'

/** Selo de status (fundo+texto+borda). */
export const statusBadge = (status: string) => BADGE[corDe(status)]

/** Superfície + texto (cards de KPI). */
export const statusSurface = (status: string) => cn(SURFACE[corDe(status)], TEXT[corDe(status)])

/**
 * Texto/ícone no tom 500 (o mesmo do hex) — use no lugar do hex quando for texto.
 * Só o slate ganha variante dark: o 500 fica escuro demais sobre superfície escura.
 */
const TEXT_500: Partial<Record<ColorName, string>> = {
  blue: 'text-blue-500',
  emerald: 'text-emerald-500',
  rose: 'text-rose-500',
  amber: 'text-amber-500',
  orange: 'text-orange-500',
  slate: 'text-slate-500 dark:text-slate-300',
  red: 'text-red-500',
}

export const statusText = (status: string): string =>
  TEXT_500[corDe(status)] ?? 'text-slate-500 dark:text-slate-300'

/** Hex do status — só para preenchimento inline/SVG (sem variante dark). */
export const statusHex = (status: string) => HEX_500[corDe(status)] ?? '#64748b'
