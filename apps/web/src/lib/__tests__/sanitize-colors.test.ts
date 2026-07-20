import { describe, it, expect } from 'vitest'
import { isThemeUnsafeColor, sanitizeInlineTextColors } from '@saas/ui'

/**
 * #HLP0178 — texto colado de fonte externa vem com `color:#000000` grudado e
 * some no tema escuro (e o inverso no claro). O filtro derruba só os cinzas
 * extremos; cor escolhida de propósito tem que sobreviver.
 */
describe('isThemeUnsafeColor', () => {
  it('derruba os extremos escuros que somem no tema escuro', () => {
    for (const c of ['#000000', '#000', 'black', 'rgb(0, 0, 0)', '#111827', 'rgb(94, 94, 94)']) {
      expect(isThemeUnsafeColor(c), c).toBe(true)
    }
  })

  it('derruba os extremos claros que somem no tema claro', () => {
    for (const c of ['#ffffff', '#fff', 'white', 'rgb(255,255,255)', '#f8f9fa', '#d1d5db']) {
      expect(isThemeUnsafeColor(c), c).toBe(true)
    }
  })

  it('preserva cores escolhidas de propósito', () => {
    // #475569 é o "Cinza" da paleta do editor — neutro na aparência, mas com
    // spread de canais alto o bastante pra contar como escolha deliberada.
    for (const c of ['#475569', '#dc2626', '#0284c7', '#16a34a', 'rgb(150,150,150)', '#808080']) {
      expect(isThemeUnsafeColor(c), c).toBe(false)
    }
  })

  it('ignora o que não sabe interpretar em vez de chutar', () => {
    for (const c of ['inherit', 'currentColor', 'var(--foreground)', '', 'transparent']) {
      expect(isThemeUnsafeColor(c), c).toBe(false)
    }
  })
})

describe('sanitizeInlineTextColors', () => {
  it('remove a cor preta preservando o resto do style', () => {
    const out = sanitizeInlineTextColors('<p><span style="color:#000000;font-family:Calibri">x</span></p>')
    expect(out).not.toMatch(/color:\s*(#000000|rgb\(0, 0, 0\))/)
    expect(out).toContain('Calibri')
  })

  it('derruba o atributo style quando a cor era a única declaração', () => {
    const out = sanitizeInlineTextColors('<span style="color: rgb(0, 0, 0)">x</span>')
    expect(out).toBe('<span>x</span>')
  })

  it('não toca em marca-texto nem em fundo', () => {
    const marca = '<mark style="background-color: #fef08a">x</mark>'
    expect(sanitizeInlineTextColors(marca)).toBe(marca)
    const fundo = '<p style="background-color: #000000">x</p>'
    expect(sanitizeInlineTextColors(fundo)).toBe(fundo)
  })

  it('preserva cor intencional', () => {
    const html = '<span style="color: #dc2626">x</span>'
    expect(sanitizeInlineTextColors(html)).toBe(html)
  })

  it('limpa o atributo legado <font color>', () => {
    const out = sanitizeInlineTextColors('<font color="#000000" face="Arial">x</font>')
    expect(out).not.toContain('color=')
    expect(out).toContain('Arial')
  })

  it('devolve a string original quando não há nada a mudar', () => {
    const html = '<p>simples</p>'
    expect(sanitizeInlineTextColors(html)).toBe(html)
  })

  it('é idempotente', () => {
    const once = sanitizeInlineTextColors('<p><span style="color:#000">x</span></p>')
    expect(sanitizeInlineTextColors(once)).toBe(once)
  })
})
