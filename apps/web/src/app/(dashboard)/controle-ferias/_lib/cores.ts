import { TEXT } from '@/lib/color-styles'

/**
 * Leitura de cor dos dias disponíveis, igual em toda parte do módulo
 * (listagem, detalhe e relatórios):
 *
 * - **verde**: ainda tem dias a gozar;
 * - **âmbar**: zerou o período;
 * - **vermelho**: ficou negativo — gozou mais dias do que tinha, e há saldo
 *   devedor a acertar no próximo período.
 */
export function corSaldo(saldo: number): string {
  if (saldo > 0) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  if (saldo === 0) return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
  return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
}

/** Mesma leitura, só no texto (sem fundo). */
export function corSaldoTexto(saldo: number): string {
  if (saldo > 0) return TEXT.emerald
  if (saldo === 0) return TEXT.amber
  return TEXT.rose
}

/** Texto curto do que a cor quer dizer — vai no title da célula. */
export function tituloSaldo(saldo: number): string {
  if (saldo > 0) return 'Dias a gozar'
  if (saldo === 0) return 'Período zerado'
  return 'Gozou mais dias do que tinha'
}
