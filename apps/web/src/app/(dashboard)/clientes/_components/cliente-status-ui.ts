// #HLP0209 — FONTE ÚNICA das cores de status do cliente no frontend.
//
// Convenção do módulo:
//   • Ativo   → verde (emerald)
//   • Inativo → âmbar (amber)
//
// TUDO que pinta status/ação de cliente deriva daqui — não hardcode cores soltas:
//   • Badges de status (lista de clientes, badges do log) → STATUS_BADGE_CLASS /
//     EVENT_BADGE_CLASS, que derivam do papel STRONG de @/lib/color-styles.
//   • Botões de AÇÃO em GRUPO (ícones por linha na tabela) → variants `soft-warning`
//     (âmbar) e `soft-success` (verde) do <Button>, p/ ficarem homogêneos com o Editar.
//   • Botões de AÇÃO em DESTAQUE / sobre fundo colorido (barra de lote, capa do
//     detalhe) → `variant="outline"` + INATIVAR_BTN_CLASS.
//   • Confirmar do modal de inativação → `variant="warning"` (âmbar sólido): é
//     ação primária sobre fundo neutro, pede o peso do variant opaco.
//   • Aviso "Cliente inativado" (card na lateral do detalhe) → INATIVADO_SURFACE_CLASS.
//   • Badge SÓLIDO do cabeçalho do detalhe → STATUS_COLORS (hex) em `@saas/types`,
//     mantido alinhado (ATIVO emerald, INATIVO amber).
import type { ClienteStatus } from '@saas/types'
import { STRONG } from '@/lib/color-styles'

/**
 * Botão de "Inativar" em destaque — âmbar soft COM BORDA, alinhado ao tom `amber`
 * do KPI "Backlog em aberto" (quando há atrasados) em /helpdesk/indicadores:
 * `bg-amber-50 · border-amber-200 · text-amber-600` (+ variantes dark). O fundo
 * opaco + a borda dão contraste mesmo sobre fundo colorido (ex.: a barra de
 * seleção esmeralda), onde o `soft-warning` (tint 10%) sumia. Usar com
 * `variant="outline"` (que fornece a estrutura de borda/sombra).
 */
/**
 * Superfície da "Zona de perigo" no rodapé da aba Detalhes — o lugar onde mora
 * a inativação, longe do Salvar.
 *
 * Âmbar, e não vermelho como a zona de perigo de outros sistemas: lá a ação é
 * excluir, que é definitiva; aqui é inativar, que se desfaz pelo aviso
 * "Cliente inativado". Pintar de vermelho prometeria uma gravidade que a ação
 * não tem — e contrariaria a convenção do módulo (inativo = âmbar), logo acima.
 */
export const ZONA_PERIGO_SURFACE_CLASS =
  'border-amber-300 dark:border-amber-800/70 bg-amber-50/40 dark:bg-amber-900/10'

export const INATIVAR_BTN_CLASS =
  'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 ' +
  'text-amber-600 dark:text-amber-300 ' +
  'hover:bg-amber-100 hover:text-amber-700 dark:hover:bg-amber-900/30 dark:hover:text-amber-200'

/**
 * Superfície do aviso "Cliente inativado" (card na lateral do detalhe) — mesma
 * borda + fundo âmbar do KPI "Backlog em aberto" com atrasados
 * (`bg-amber-50 · border-amber-200`, + variantes dark). Ícone/título ficam em
 * `text-amber-600`/`text-amber-700` (dark `amber-300`), como no KPI.
 */
export const INATIVADO_SURFACE_CLASS =
  'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'

/**
 * Botão "Reativar cliente" em destaque (dentro do card âmbar de inativado) — par
 * simétrico do INATIVAR_BTN_CLASS, em esmeralda soft COM BORDA. A borda o destaca
 * sobre o fundo âmbar do card. Usar com `variant="outline"`.
 */
export const REATIVAR_BTN_CLASS =
  'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 ' +
  'text-emerald-600 dark:text-emerald-300 ' +
  'hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-200'

/** Classes do badge de status — derivam do papel STRONG (fonte única): Ativo=verde, Inativo=âmbar. */
export const STATUS_BADGE_CLASS: Record<ClienteStatus, string> = {
  ATIVO: STRONG.emerald,
  INATIVO: STRONG.amber,
}

/** Badges de evento do histórico espelham o status resultante da ação. */
export const EVENT_BADGE_CLASS: Record<'inactivated' | 'reactivated', string> = {
  inactivated: STATUS_BADGE_CLASS.INATIVO,
  reactivated: STATUS_BADGE_CLASS.ATIVO,
}

/**
 * #HLP0210 (Fase 3) — "Ex-cliente" = mensal que virou inativo com data de saída.
 * É um inativo específico (cliente recorrente perdido); ganha cor própria (rosé)
 * para se distinguir do "Inativo" genérico (âmbar).
 */
export const EX_CLIENTE_BADGE_CLASS = STRONG.rose

/** Regra derivada do "Ex-cliente" (espelha o backend). */
export function isExCliente(c: { situacao?: string | null; status?: string | null; dataSaida?: string | null }): boolean {
  return c.situacao === 'MENSAL' && c.status === 'INATIVO' && !!c.dataSaida
}
