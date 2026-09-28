import { describe, expect, it } from 'vitest'
import { ehMatrizCnpj, finalCnpj } from '@saas/types'

// #HLP0410 — final do CNPJ e selo Matriz/Filial nas listas.
describe('finalCnpj', () => {
  it('ordem + DV, com ou sem máscara', () => {
    expect(finalCnpj('12.345.678/0001-91')).toBe('0001-91')
    expect(finalCnpj('12345678000291')).toBe('0002-91')
  })
  it('CNPJ alfanumérico, por posição', () => {
    expect(finalCnpj('12ABC345A01B35')).toBe('A01B-35')
  })
  it('CPF ou documento incompleto não tem final', () => {
    expect(finalCnpj('123.456.789-09')).toBe('')
    expect(finalCnpj('12345678000291', 'CPF')).toBe('')
    expect(finalCnpj(null)).toBe('')
  })
  it('matriz pelo /0001 ou pela marca gravada', () => {
    expect(ehMatrizCnpj('12345678000191', null)).toBe(true)
    expect(ehMatrizCnpj('12345678000291', null)).toBe(false)
    expect(ehMatrizCnpj('12ABC345A01B35', true)).toBe(true)
  })
})
