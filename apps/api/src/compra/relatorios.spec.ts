import { classificarIqf, montarConferencia, montarGastos, montarIqf, valorGasto, type PedidoRelatorio } from './relatorios'

let seq = 0
function pedido(p: Partial<PedidoRelatorio>): PedidoRelatorio {
  seq++
  return {
    id: `p${seq}`, code: seq, status: 'AVALIADO', fornecedorId: 'f1', fornecedor: 'Forn 1',
    data: new Date('2026-09-10T12:00:00Z'), dataAvaliacao: null, totalPedido: 100,
    nfValorAvaliacao: null, nfValorRecebimentos: null, nfValorAnexos: null,
    tipoFornecimento: 'NORMAL', melhoria: false, respostas: [], ...p,
  }
}
const resp = (...a: boolean[]) => a.map((atende, i) => ({ criterio: `C${i + 1}`, ordem: i, atende }))

describe('IQF', () => {
  it('faixas: 90 aprovado, 70 restrição, abaixo reprovado', () => {
    expect(classificarIqf(90)).toBe('APROVADO')
    expect(classificarIqf(89.99)).toBe('RESTRICAO')
    expect(classificarIqf(70)).toBe('RESTRICAO')
    expect(classificarIqf(69.9)).toBe('REPROVADO')
  })

  it('por fornecedor e critério; avaliação sem resposta não conta; pior primeiro', () => {
    const r = montarIqf([
      pedido({ fornecedorId: 'f1', fornecedor: 'Bom', respostas: resp(true, true) }),
      pedido({ fornecedorId: 'f1', fornecedor: 'Bom', respostas: resp(true, false), melhoria: true }),
      pedido({ fornecedorId: 'f2', fornecedor: 'Ruim', respostas: resp(false, false) }),
      pedido({ fornecedorId: 'f3', fornecedor: 'Sem resposta', respostas: [] }),
    ])
    expect(r.criterios).toEqual(['C1', 'C2'])
    expect(r.linhas.map((l) => [l.fornecedor, l.iqf, l.classe])).toEqual([['Ruim', 0, 'REPROVADO'], ['Bom', 75, 'RESTRICAO']])
    expect(r.linhas[1]!.criterios).toEqual([{ criterio: 'C1', pct: 100, respostas: 2 }, { criterio: 'C2', pct: 50, respostas: 2 }])
    expect(r.resumo).toMatchObject({ fornecedores: 2, avaliacoes: 3, melhorias: 1, iqfGeral: 50 })
  })
})

describe('gastos', () => {
  it('nota manda sobre o total do pedido; rascunho e reprovado não contam', () => {
    expect(valorGasto(pedido({ totalPedido: 100, nfValorAvaliacao: 110 }))).toEqual({ valor: 110, fonte: 'nf' })
    expect(valorGasto(pedido({ totalPedido: 100 }))).toEqual({ valor: 100, fonte: 'pedido' })
    // Erro de digitação (caso real #30 e #616): fica o pedido.
    expect(valorGasto(pedido({ totalPedido: 1864, nfValorAvaliacao: 5335255 }))).toEqual({ valor: 1864, fonte: 'nf_suspeita' })
    expect(valorGasto(pedido({ totalPedido: 1735.39, nfValorAvaliacao: 1.74 }))).toEqual({ valor: 1735.39, fonte: 'nf_suspeita' })
    // Pedido sem itens (#128): a nota é o único valor.
    expect(valorGasto(pedido({ totalPedido: 0, nfValorAvaliacao: 2761.67 }))).toEqual({ valor: 2761.67, fonte: 'nf' })
    const g = montarGastos([pedido({ status: 'REPROVADO' }), pedido({ status: 'NOVO' }), pedido({})])
    expect(g.pedidos).toBe(1)
  })

  it('curva ABC: quem cruza os 80% ainda é A', () => {
    const g = montarGastos([
      pedido({ fornecedorId: 'a', fornecedor: 'A', totalPedido: 700 }),
      pedido({ fornecedorId: 'b', fornecedor: 'B', totalPedido: 200 }),
      pedido({ fornecedorId: 'c', fornecedor: 'C', totalPedido: 60 }),
      pedido({ fornecedorId: 'd', fornecedor: 'D', totalPedido: 40 }),
    ])
    expect(g.fornecedores.map((f) => [f.fornecedor, f.classe, f.acumuladoPct])).toEqual([
      ['A', 'A', 70], ['B', 'A', 90], ['C', 'B', 96], ['D', 'C', 100],
    ])
    expect(g.total).toBe(1000)
  })
})

describe('conferência pedido × nota', () => {
  it('só recebidos com nota; tolerância de centavos; maior diferença primeiro', () => {
    const c = montarConferencia([
      pedido({ totalPedido: 2218.74, nfValorAvaliacao: 2273.69 }),
      pedido({ totalPedido: 100, nfValorRecebimentos: 100.03 }),
      pedido({ totalPedido: 100, nfValorAnexos: 90 }),
      pedido({ totalPedido: 100 }),
      pedido({ status: 'APROVADO', totalPedido: 100, nfValorAvaliacao: 500 }),
    ])
    expect(c.conferidos).toBe(3)
    expect(c.semNf).toBe(1)
    expect(c.divergentes.map((d) => [d.diferenca, d.fonte])).toEqual([[54.95, 'avaliacao'], [-10, 'danfe']])
    expect(c.acima).toBe(54.95)
    expect(c.abaixo).toBe(-10)
  })
})
