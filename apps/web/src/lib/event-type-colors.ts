import type { CSSProperties } from 'react'

/**
 * Cores de um TIPO DE EVENTO (agenda) — fonte única do uso correto.
 *
 * Cada tipo tem três cores distintas e com PAPÉIS distintos:
 *  - `cor`      → **fundo** (preenchimento do chip/pílula do evento);
 *  - `corBorda` → **borda / dot / traço** (versão mais forte; é o que se usa em
 *                 bolinhas, barras verticais e bordas-esquerdas);
 *  - `corTexto` → cor do texto sobre o fundo cheio (tema claro).
 *
 * Erro comum: usar `cor` (fundo) onde o certo é `corBorda` (dot/borda). Para
 * borda/dot/traço use `t.corBorda` DIRETO no call site — não precisa de helper.
 * Este módulo centraliza só a **adaptação de dark do FUNDO** (`chipTipoEvento`),
 * que é a parte com lógica (e a que estava inconsistente pelo sistema).
 */
export interface TipoEventoCores {
  cor: string
  corBorda?: string | null
  corTexto?: string | null
}

/** Tint de baixa opacidade (~20%) para o fundo no DARK — mesmo alpha usado na
 *  grade do mês em /agenda. */
const DARK_FILL_ALPHA = '33'
/** Texto claro no DARK (o `corTexto` do tipo mira o fundo cheio do tema claro). */
const DARK_TEXT = '#e5e7eb'

/**
 * Estilo do **chip preenchido** de um tipo de evento, adaptado ao tema:
 *  - dark  → fundo = `cor` + alpha (tint suave) e texto claro;
 *  - claro → fundo = `cor` cheia e texto = `corTexto`.
 *
 * Use em qualquer lugar que pinte o fundo com a cor do tipo (pílulas de evento,
 * chips no modal de Tipos, widget de eventos, etc.) para ter a MESMA adaptação
 * de dark em todo o sistema.
 */
export function chipTipoEvento(t: TipoEventoCores, isDark: boolean): CSSProperties {
  return {
    backgroundColor: isDark ? `${t.cor}${DARK_FILL_ALPHA}` : t.cor,
    color: isDark ? DARK_TEXT : (t.corTexto ?? '#ffffff'),
  }
}
