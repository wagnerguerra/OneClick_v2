import { BADGE, TEXT } from '@/lib/color-styles'

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
  if (saldo > 0) return BADGE.emerald
  if (saldo === 0) return BADGE.amber
  return BADGE.rose
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
