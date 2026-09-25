import { quantidadeRecebida, situacaoDoItem, statusPeloRecebimento, validarEntrega } from './recebimento'

describe('quantidadeRecebida', () => {
  it('soma as entregas', () => {
    expect(quantidadeRecebida({ quantidade: 10 }, [{ quantidade: 3 }, { quantidade: 4 }], 'RECEBIDO_PARCIAL')).toBe(7)
  })
  it('pedido recebido antes do recebimento por item conta o item inteiro', () => {
    expect(quantidadeRecebida({ quantidade: 5 }, [], 'RECEBIDO')).toBe(5)
    expect(quantidadeRecebida({ quantidade: 5 }, [], 'AVALIADO')).toBe(5)
  })
  it('aprovado sem entregas: nada chegou', () => {
    expect(quantidadeRecebida({ quantidade: 5 }, [], 'APROVADO')).toBe(0)
  })
})

describe('situacaoDoItem / statusPeloRecebimento', () => {
  it('situação de cada item', () => {
    expect(situacaoDoItem(5, 0)).toBe('PENDENTE')
    expect(situacaoDoItem(5, 2)).toBe('PARCIAL')
    expect(situacaoDoItem(5, 5)).toBe('RECEBIDO')
  })
  it('status do pedido', () => {
    expect(statusPeloRecebimento([{ quantidade: 2, recebida: 0 }, { quantidade: 1, recebida: 0 }])).toBe('APROVADO')
    expect(statusPeloRecebimento([{ quantidade: 2, recebida: 2 }, { quantidade: 1, recebida: 0 }])).toBe('RECEBIDO_PARCIAL')
    expect(statusPeloRecebimento([{ quantidade: 2, recebida: 1 }, { quantidade: 1, recebida: 1 }])).toBe('RECEBIDO_PARCIAL')
    expect(statusPeloRecebimento([{ quantidade: 2, recebida: 2 }, { quantidade: 1, recebida: 1 }])).toBe('RECEBIDO')
  })
})

describe('validarEntrega', () => {
  const itens = [
    { id: 'a', descricao: 'Toner', quantidade: 4, recebida: 1 },
    { id: 'b', descricao: 'Papel', quantidade: 2, recebida: 2 },
  ]
  it('aceita até o que falta', () => {
    expect(validarEntrega(itens, [{ itemId: 'a', quantidade: 3 }])).toBeNull()
  })
  it('recusa mais do que falta, item completo, repetido ou de outro pedido', () => {
    expect(validarEntrega(itens, [{ itemId: 'a', quantidade: 4 }])).toMatch(/faltam 3/)
    expect(validarEntrega(itens, [{ itemId: 'b', quantidade: 1 }])).toMatch(/já foi recebido/)
    expect(validarEntrega(itens, [{ itemId: 'a', quantidade: 1 }, { itemId: 'a', quantidade: 1 }])).toMatch(/duas vezes/)
    expect(validarEntrega(itens, [{ itemId: 'x', quantidade: 1 }])).toMatch(/não pertence/)
    expect(validarEntrega(itens, [{ itemId: 'a', quantidade: 0 }])).toMatch(/inválida/)
  })
})
