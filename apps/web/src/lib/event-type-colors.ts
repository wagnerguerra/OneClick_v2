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
  /** Fundo do chip/pílula — claro: `cor` cheia · dark: a MESMA `cor` escurecida
   *  (mix com preto), preservando o matiz. */
  fundo: string
  /** Texto sobre o fundo — claro: `corTexto` · dark: branco. */
  texto: string
  /** Acento forte (dot, borda, traço lateral) — `corBorda` (não adapta ao tema). */
  borda: string
}

/** No dark, o fundo é a MESMA `cor` do tema claro com uma "camada escura" por
 *  cima (mix com preto) — escurece preservando o matiz, sem lavar/esbranquiçar as
 *  cores pálidas (o que acontecia ao deixá-las translúcidas sobre o fundo).
 *  `DARK_COR_PCT` = quanto da cor sobra; o resto é preto. Maior = mais colorido/
 *  claro; menor = mais escuro. */
const DARK_COR_PCT = 30
/** Texto claro no dark (o `corTexto` mira o fundo cheio do tema claro). */
const DARK_TEXT = '#e5e7eb'

export function coresTipoEvento(t: TipoEventoCores, isDark: boolean): CoresResolvidas {
  return {
    fundo: isDark ? `color-mix(in srgb, ${t.cor} ${DARK_COR_PCT}%, #000)` : t.cor,
    texto: isDark ? DARK_TEXT : (t.corTexto ?? '#ffffff'),
    borda: t.corBorda || t.cor,
  }
}
