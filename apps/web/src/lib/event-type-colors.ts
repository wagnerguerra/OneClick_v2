/**
 * Cores de um TIPO DE EVENTO (agenda) resolvidas para o TEMA atual — fonte única.
 *
 * O tipo guarda três cores cruas (`cor`, `corBorda`, `corTexto`); a diferença é
 * que `cor`/`corTexto` precisam de adaptação ao dark e `corBorda` não. Em vez de
 * espalhar essa lógica (e o erro de usar fundo onde é borda), passe o tipo por
 * `coresTipoEvento` e use os campos pelo PAPEL:
 *
 *   const c = coresTipoEvento(tipo, isDark)
 *   // chip/pílula:      style={{ backgroundColor: c.fundo, color: c.texto }}
 *   // dot:              style={{ backgroundColor: c.borda }}
 *   // traço/borda-esq:  borderLeft: `3px solid ${c.borda}`
 *
 * `isDark` vem do hook `useIsDark` (chamado uma vez no componente e passado aqui,
 * pois esta função roda dentro de `.map`).
 */
export interface TipoEventoCores {
  cor: string
  corBorda?: string | null
  corTexto?: string | null
}

export interface CoresResolvidas {
  /** Fundo do chip/pílula — claro: `cor` cheia · dark: `cor` + alpha (tint suave). */
  fundo: string
  /** Texto sobre o fundo — claro: `corTexto` · dark: branco. */
  texto: string
  /** Acento forte (dot, borda, traço lateral) — `corBorda` (não adapta ao tema). */
  borda: string
}

/** Tint de baixa opacidade (~20%) do fundo no dark — mesmo alpha da grade do mês. */
const DARK_FILL_ALPHA = '33'
/** Texto claro no dark (o `corTexto` mira o fundo cheio do tema claro). */
const DARK_TEXT = '#e5e7eb'

export function coresTipoEvento(t: TipoEventoCores, isDark: boolean): CoresResolvidas {
  return {
    fundo: isDark ? `${t.cor}${DARK_FILL_ALPHA}` : t.cor,
    texto: isDark ? DARK_TEXT : (t.corTexto ?? '#ffffff'),
    borda: t.corBorda || t.cor,
  }
}
