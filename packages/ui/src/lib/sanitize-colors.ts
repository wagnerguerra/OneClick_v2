/**
 * Neutraliza cores de texto "quase-preto" e "quase-branco" em HTML.
 *
 * #HLP0178 — texto colado de fontes externas (Word, Google Docs, Outlook, sites)
 * quase sempre vem com `style="color:#000000"` embutido. O TipTap preserva isso
 * (extensões TextStyle + Color), então o trecho colado fica preto fixo: some no
 * tema escuro. O inverso também acontece — texto copiado de uma página escura
 * vem branco e some no tema claro. O usuário lê como "o texto não colou inteiro".
 *
 * A correção remove APENAS as declarações de cor nesses dois extremos. Sem cor
 * inline, o texto herda `currentColor` do editor/visualizador — que já é o token
 * de tema (escuro no claro, claro no escuro) e continua trocando junto com o tema
 * mesmo depois de salvo. Cores intencionais da paleta (vermelho, azul, o cinza
 * #475569 do seletor, etc.) são preservadas.
 */

/** Máxima diferença entre os canais RGB para a cor ainda contar como "neutra".
 *  Acima disso é um tom colorido de propósito e fica como está — é o que protege
 *  o cinza-azulado #475569 do seletor do editor (spread 34). */
const MAX_SPREAD_NEUTRO = 30
/** Cinzas com todos os canais até aqui somem no tema escuro (inclui #000, #1f2937
 *  e cinzas médios-escuros como rgb(94,94,94)). */
const LIMITE_ESCURO = 120
/** Cinzas claros a partir daqui somem no tema claro (inclui #fff, #f8f9fa, #d1d5db). */
const LIMITE_CLARO = 175

/** Cor considerada "extremo neutro": cinza (sem saturação relevante) e escura ou
 *  clara o bastante pra sumir em um dos temas. */
function isNearBlackOrWhite(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max - min > MAX_SPREAD_NEUTRO) return false // colorido demais pra ser cinza
  return max <= LIMITE_ESCURO || min >= LIMITE_CLARO
}

/** Converte um valor CSS de cor em RGB. Retorna null pro que não reconhecer
 *  (`currentColor`, `inherit`, `var(--x)`, hsl, nomes exóticos) — nesses casos
 *  não mexemos, por segurança. */
function parseCssColor(raw: string): [number, number, number] | null {
  const value = raw.trim().toLowerCase()

  if (value === 'black') return [0, 0, 0]
  if (value === 'white') return [255, 255, 255]

  const hex = value.match(/^#([0-9a-f]{3,8})$/)
  if (hex) {
    const h = hex[1] ?? ''
    // #rgb / #rgba → expande cada dígito ("f" → "ff")
    const full = h.length === 3 || h.length === 4
      ? h.slice(0, 3).split('').map(d => d + d).join('')
      : h.length === 6 || h.length === 8
        ? h.slice(0, 6)
        : ''
    if (!full) return null
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/)
  if (rgb) return [Number(rgb[1] ?? 0), Number(rgb[2] ?? 0), Number(rgb[3] ?? 0)]

  return null
}

/**
 * true se o valor CSS informado é um extremo neutro (quase-preto/quase-branco)
 * que sumiria em um dos temas e portanto deve ceder lugar à cor padrão do texto.
 * Valores não reconhecidos (`inherit`, `var(--x)`, hsl…) retornam false.
 */
export function isThemeUnsafeColor(value: string): boolean {
  const rgb = parseCssColor(value)
  if (!rgb) return false
  return isNearBlackOrWhite(rgb[0], rgb[1], rgb[2])
}

/**
 * Remove de `html` as cores de texto quase-pretas/quase-brancas — inclusive o
 * atributo legado `<font color="...">`. Use ao renderizar HTML já gravado
 * (`dangerouslySetInnerHTML`); dentro do editor a limpeza acontece no parse da
 * extensão de cor, sem passar por aqui.
 *
 * Usa o DOM em vez de regex: o parser de CSS do browser entende `hsl()`,
 * `rgb(0 0 0 / 50%)`, nomes de cor, aspas e `!important`, e não há risco de
 * corromper o markup. `background-color` fica intacto — marca-texto é intencional.
 * Idempotente; devolve a string original quando nada muda (evita churn de diff).
 *
 * ⚠️ Sem DOM (SSR/Node puro) retorna o HTML inalterado — é um ajuste de leitura,
 * não de segurança, então degradar silenciosamente é aceitável.
 */
export function sanitizeInlineTextColors(html: string): string {
  if (!html || !html.includes('color')) return html
  if (typeof DOMParser === 'undefined') return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false

  doc.body.querySelectorAll<HTMLElement>('[style]').forEach((el) => {
    const color = el.style.color
    if (!color || !isThemeUnsafeColor(color)) return
    el.style.removeProperty('color')
    changed = true
    // Era só a cor no style — não deixa `style=""` sobrando.
    if (!el.getAttribute('style')) el.removeAttribute('style')
  })

  doc.body.querySelectorAll('font[color]').forEach((el) => {
    const color = el.getAttribute('color')
    if (!color || !isThemeUnsafeColor(color)) return
    el.removeAttribute('color')
    changed = true
  })

  return changed ? doc.body.innerHTML : html
}
