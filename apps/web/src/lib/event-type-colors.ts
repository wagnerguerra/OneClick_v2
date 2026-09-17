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

/** No dark, o fundo é a MESMA `cor` do tema claro com uma "camada escura" (preto)
 *  por cima — escurece preservando o matiz, sem lavar/esbranquiçar as cores
 *  pálidas (o que acontecia ao deixá-las translúcidas sobre o fundo).
 *  `DARK_LAYER_PCT` = força da camada preta (quanto do preto). Maior = mais
 *  escuro; menor = mais colorido. */
const DARK_LAYER_PCT = 75
/** Reforço de saturação aplicado por cima do resultado escurecido: multiplica a
 *  chroma (oklch) via relative color syntax. 1 = sem reforço; 1.3 = +30%. */
const DARK_SAT_BOOST = 1.5
/** Texto claro no dark (o `corTexto` mira o fundo cheio do tema claro). */
const DARK_TEXT = '#e5e7eb'

export function coresTipoEvento(t: TipoEventoCores, isDark: boolean): CoresResolvidas {
  // Dark: cor escurecida (camada preta) + leve boost de chroma no resultado.
  const fundoDark = `oklch(from color-mix(in srgb, #000 ${DARK_LAYER_PCT}%, ${t.cor}) l calc(c * ${DARK_SAT_BOOST}) h)`
  return {
    fundo: isDark ? fundoDark : t.cor,
    texto: isDark ? DARK_TEXT : (t.corTexto ?? '#ffffff'),
    borda: t.corBorda || t.cor,
  }
}
