import { describe, it, expect } from 'vitest'
import { detectCodigoColumn, projectRows, cellPreview } from './columns'

describe('extrato-edit columns', () => {
  it('detectCodigoColumn identifica cliente e fornecedor pelo cabeçalho', () => {
    expect(detectCodigoColumn(['Data', 'Cód. Fornecedor', 'Valor'])).toEqual({ index: 1, tipo: 'fornecedor' })
    expect(detectCodigoColumn(['Cod Cliente', 'Nome'])).toEqual({ index: 0, tipo: 'cliente' })
    expect(detectCodigoColumn(['Data', 'Valor'])).toBeNull()
  })

  it('projectRows seleciona e reordena colunas', () => {
    const headers = ['A', 'B', 'C']
    const rows = [
      ['a1', 'b1', 'c1'],
      ['a2', 'b2', 'c2'],
    ]
    const out = projectRows(headers, rows, ['C', 'A'])
    expect(out.headers).toEqual(['C', 'A'])
    expect(out.rows).toEqual([
      ['c1', 'a1'],
      ['c2', 'a2'],
    ])
  })

  it('cellPreview formata data e nulos', () => {
    expect(cellPreview(null)).toBe('')
    expect(cellPreview('x')).toBe('x')
    expect(cellPreview(12)).toBe('12')
  })
})
