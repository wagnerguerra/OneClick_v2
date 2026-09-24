/**
 * Integridade do balancete importado.
 *
 * A trava que estes testes existem para prender: somar TODOS os níveis do
 * balancete conta o mesmo valor várias vezes, porque cada sintética repete as
 * filhas. Era assim que o módulo somava até agora — e ninguém percebia, porque
 * o template de contas só tinha folhas, por acidente.
 *
 * Os números vêm do balancete real da Finatto C (01/2026), em `docs/balancetes`.
 */

import { folhasDe, conferirBalanceteFecha } from './balancete-integridade'

/** Um recorte do balancete: a sintética e suas duas folhas. */
const RECORTE = [
  { conta: '04.1.1', debitos: 300, creditos: 0 },        // sintética
  { conta: '04.1.1.01.001', debitos: 100, creditos: 0 }, // folha
  { conta: '04.1.1.01.002', debitos: 200, creditos: 0 }, // folha
]

describe('folhas do balancete', () => {
  it('descarta a sintética e fica só com as filhas', () => {
    expect(folhasDe(RECORTE).map(l => l.conta)).toEqual(['04.1.1.01.001', '04.1.1.01.002'])
  })

  it('conta sem filhas é folha, mesmo em nível alto', () => {
    const linhas = [{ conta: '05', debitos: 10, creditos: 0 }]
    expect(folhasDe(linhas)).toHaveLength(1)
  })

  it('04.1 NÃO é pai de 04.10 — o ponto no prefixo é o que separa', () => {
    const linhas = [
      { conta: '04.1', debitos: 1, creditos: 0 },
      { conta: '04.10', debitos: 2, creditos: 0 },
    ]
    // Sem o '.' no prefixo, `'04.10'.startsWith('04.1')` daria true e a 04.1
    // sumiria da soma.
    expect(folhasDe(linhas)).toHaveLength(2)
  })
})

describe('conferência débito × crédito', () => {
  it('balancete que fecha passa', () => {
    const r = conferirBalanceteFecha([
      { conta: '01.1.1.01.001', debitos: 1000, creditos: 0 },
      { conta: '03.1.1.01.001', debitos: 0, creditos: 1000 },
    ])
    expect(r.fecha).toBe(true)
    expect(r.diferenca).toBe(0)
  })

  it('soma SÓ as folhas — a sintética não entra duas vezes', () => {
    const r = conferirBalanceteFecha(RECORTE)
    // Folhas: 100 + 200 = 300. Com a sintética entraria 600.
    expect(r.somaDebitos).toBe(300)
  })

  it('balancete torto é reprovado, e a diferença é reportada', () => {
    const r = conferirBalanceteFecha([
      { conta: '01.1.1.01.001', debitos: 1000, creditos: 0 },
      { conta: '03.1.1.01.001', debitos: 0, creditos: 940 },
    ])
    expect(r.fecha).toBe(false)
    expect(r.diferenca).toBe(60)
  })

  it('tolera centavo de arredondamento', () => {
    const r = conferirBalanceteFecha([
      { conta: '01.1.1.01.001', debitos: 1000.01, creditos: 0 },
      { conta: '03.1.1.01.001', debitos: 0, creditos: 1000 },
    ])
    expect(r.fecha).toBe(true)
  })

  it('balancete vazio fecha por vacuidade, sem quebrar', () => {
    const r = conferirBalanceteFecha([])
    expect(r.fecha).toBe(true)
    expect(r.somaDebitos).toBe(0)
  })
})
