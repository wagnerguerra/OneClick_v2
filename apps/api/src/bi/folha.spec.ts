/**
 * O filtro que impede contar o mesmo dinheiro duas vezes.
 *
 * Com o de-para por nível 3, a conta sintética e as filhas dela têm a MESMA
 * categoria. Sem este filtro, a DRE sai com o dobro.
 */

import { ehFolha, sqlSomenteFolhas } from './folha'

const PLANO = new Set([
  '04.2.1',
  '04.2.1.01',
  '04.2.1.01.001',
  '04.2.1.01.002',
  '04.2.1.07',
  '04.2.1.07.001',
])

describe('ehFolha', () => {
  it('o SCI manda: analitica = true é folha, mesmo com filha aparente', () => {
    expect(ehFolha({ conta: '04.2.1', analitica: true }, PLANO)).toBe(true)
  })

  it('analitica = false é sintética, mesmo sem filha importada', () => {
    expect(ehFolha({ conta: '04.2.9', analitica: false }, PLANO)).toBe(false)
  })

  it('sem o dado do SCI, é folha quem não tem descendente', () => {
    expect(ehFolha({ conta: '04.2.1.01.001', analitica: null }, PLANO)).toBe(true)
    expect(ehFolha({ conta: '04.2.1.01', analitica: null }, PLANO)).toBe(false)
    expect(ehFolha({ conta: '04.2.1', analitica: null }, PLANO)).toBe(false)
  })

  it('prefixo parecido não é descendente', () => {
    // "04.2.10" começa com "04.2.1" mas não é filha dela — é o ponto que
    // separa os dois. Sem ele, 04.2.1 seria sintética por engano.
    expect(ehFolha({ conta: '04.2.1', analitica: null }, new Set(['04.2.1', '04.2.10', '04.2.10.001']))).toBe(true)
  })

  it('conta sozinha é folha', () => {
    expect(ehFolha({ conta: '03.1.1.01.004', analitica: null }, new Set(['03.1.1.01.004']))).toBe(true)
  })
})

describe('sqlSomenteFolhas', () => {
  it('respeita o apelido da tabela', () => {
    expect(sqlSomenteFolhas('x')).toContain('x.analitica = true')
    expect(sqlSomenteFolhas('x')).toContain("x.conta || '.%'")
  })

  it('a heurística só vale quando a fonte não falou', () => {
    expect(sqlSomenteFolhas()).toContain('l.analitica IS NULL AND NOT EXISTS')
  })
})
