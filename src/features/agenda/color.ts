// Helpers de cor para os tipos de evento da Agenda.
//
// Tudo aqui é puro: dadas as cores cruas do tipo de evento (que podem vir
// nulas/ausentes da API), resolvemos um trio { bg, border, text } sempre válido.

/** Cores cruas de um tipo de evento, como chegam da API (qualquer campo pode faltar). */
export interface TipoCores {
  cor?: string | null
  corBorda?: string | null
  corTexto?: string | null
}

/** Cor de fundo padrão quando o tipo não define `cor` (azul da marca). */
const COR_PADRAO = '#2563eb'
/** Texto claro para fundos escuros. */
const TEXTO_CLARO = '#ffffff'
/** Texto escuro (slate-900) para fundos claros. */
const TEXTO_ESCURO = '#0f172a'

/**
 * Normaliza um hex para a forma longa de 6 dígitos com '#', em minúsculas.
 * Aceita '#rgb', 'rgb', '#rrggbb', 'rrggbb'. Retorna null se não reconhecer.
 */
function normalizeHex(hex: string): string | null {
  const limpo = hex.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(limpo)) {
    // Expande forma curta (ex.: 'abc' -> 'aabbcc').
    const [r, g, b] = limpo.split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }
  if (/^[0-9a-f]{6}$/.test(limpo)) {
    return `#${limpo}`
  }
  return null
}

/**
 * Escurece um hex multiplicando cada canal por `fator` (0..1).
 * Usado pra derivar uma cor de borda a partir da cor de fundo.
 */
function darken(hex: string, fator: number): string {
  const norm = normalizeHex(hex)
  if (norm === null) return hex
  const r = Math.round(parseInt(norm.slice(1, 3), 16) * fator)
  const g = Math.round(parseInt(norm.slice(3, 5), 16) * fator)
  const b = Math.round(parseInt(norm.slice(5, 7), 16) * fator)
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Escolhe texto legível sobre um fundo `hex` usando luminância relativa (WCAG).
 * Fundos claros -> texto escuro; fundos escuros -> texto claro.
 */
export function contrastText(hex: string): '#ffffff' | '#0f172a' {
  const norm = normalizeHex(hex)
  // Sem hex válido, assumimos fundo escuro e devolvemos texto claro.
  if (norm === null) return TEXTO_CLARO

  // Converte cada canal sRGB (0..255) para linear, conforme fórmula WCAG.
  const canalLinear = (valor8bits: number): number => {
    const c = valor8bits / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }

  const r = canalLinear(parseInt(norm.slice(1, 3), 16))
  const g = canalLinear(parseInt(norm.slice(3, 5), 16))
  const b = canalLinear(parseInt(norm.slice(5, 7), 16))

  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Limiar ~0.5: acima disso o fundo é claro o bastante pra texto escuro.
  return luminancia > 0.5 ? TEXTO_ESCURO : TEXTO_CLARO
}

/**
 * Converte um hex (`#rrggbb`/`#rgb`) numa string `rgba(r,g,b,alpha)`.
 * Útil pra derivar um FUNDO bem leve na cor do tipo: como o alpha compõe sobre
 * o que está atrás, o MESMO valor funciona nos dois temas — sobre um card claro
 * vira um tom pálido; sobre um fundo escuro vira um tom escuro sutil. Se o hex
 * for inválido, devolve ele mesmo (degrade gracioso).
 */
export function withAlpha(hex: string, alpha: number): string {
  const norm = normalizeHex(hex)
  if (norm === null) return hex
  const r = parseInt(norm.slice(1, 3), 16)
  const g = parseInt(norm.slice(3, 5), 16)
  const b = parseInt(norm.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Resolve o trio final de cores a partir das cores cruas do tipo, com fallbacks:
 * - bg:     `cor` ou COR_PADRAO.
 * - border: `corBorda` ou uma versão mais escura do bg (~75%).
 * - text:   `corTexto` ou a melhor escolha por contraste sobre o bg.
 */
export function resolveTipoCores(
  t?: TipoCores | null,
): { bg: string; border: string; text: string } {
  const bg = t?.cor ?? COR_PADRAO
  const border = t?.corBorda ?? darken(bg, 0.75)
  const text = t?.corTexto ?? contrastText(bg)
  return { bg, border, text }
}
