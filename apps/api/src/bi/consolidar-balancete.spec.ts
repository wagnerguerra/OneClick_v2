import { consolidarBalancetes } from './consolidar-balancete'
import type { SciBalanceteLinha } from '../cliente/sci.service'

const linha = (cnpj: string, classificacao: string, valores: Partial<SciBalanceteLinha> = {}): SciBalanceteLinha => ({
  CLASSIFICACAO: classificacao, NOME_CONTA: `conta ${classificacao}`,
  BDSALDO_ANTERIOR: 0, DEBITO: 0, CREDITO: 0, BDMOVIMENTO: 0, BDSALDO_ATUAL: 0,
  TIPO_CONTA: 1, CC_CODIGO: 0, CC_NOME: '', CNPJ_EMPRESA: cnpj,
  ...valores,
})

const MATRIZ = '24.166.094/0001-31'
const FILIAL = '24.166.094/0002-12'

describe('consolidarBalancetes — matriz + filiais, conta a conta', () => {
  it('soma a mesma conta das duas empresas (o faturamento da filial entra na matriz)', () => {
    const r = consolidarBalancetes(MATRIZ, [
      { prcodemp: 436, linhas: [linha(MATRIZ, '03.1.1.01.004', { CREDITO: 0 })] },
      { prcodemp: 437, linhas: [linha(FILIAL, '03.1.1.01.004', { CREDITO: 648124.65, BDMOVIMENTO: 648124.65 })] },
    ])
    expect(r).toHaveLength(1)
    expect(r[0]!.CREDITO).toBe(648124.65)
    expect(r[0]!.BDMOVIMENTO).toBe(648124.65)
    expect(r[0]!.CNPJ_EMPRESA).toBe('24166094000131')
  })

  it('soma saldos anterior e atual e mantém o nome/tipo da matriz', () => {
    const r = consolidarBalancetes(MATRIZ, [
      { prcodemp: 436, linhas: [linha(MATRIZ, '01', { BDSALDO_ANTERIOR: 100.1, BDSALDO_ATUAL: 200.2, TIPO_CONTA: 0, NOME_CONTA: 'ATIVO' })] },
      { prcodemp: 437, linhas: [linha(FILIAL, '01', { BDSALDO_ANTERIOR: 0.2, BDSALDO_ATUAL: 0.1, TIPO_CONTA: 0, NOME_CONTA: 'ATIVO FILIAL' })] },
    ])
    expect(r[0]!.BDSALDO_ANTERIOR).toBe(100.3)
    expect(r[0]!.BDSALDO_ATUAL).toBe(200.3)
    expect(r[0]!.NOME_CONTA).toBe('ATIVO')
  })

  it('conta que só existe na filial entra como está', () => {
    const r = consolidarBalancetes(MATRIZ, [
      { prcodemp: 436, linhas: [linha(MATRIZ, '01')] },
      { prcodemp: 437, linhas: [linha(FILIAL, '02.1.4.03.001', { CREDITO: 44292.17 })] },
    ])
    expect(r.map(l => l.CLASSIFICACAO).sort()).toEqual(['01', '02.1.4.03.001'])
  })

  it('centro de custo diferente não se mistura', () => {
    const r = consolidarBalancetes(MATRIZ, [
      { prcodemp: 436, linhas: [linha(MATRIZ, '04.1', { DEBITO: 10, CC_CODIGO: 1 })] },
      { prcodemp: 437, linhas: [linha(FILIAL, '04.1', { DEBITO: 5, CC_CODIGO: 2 })] },
    ])
    expect(r).toHaveLength(2)
  })

  it('recusa empresa de outra raiz de CNPJ (ID SCI errado no cadastro)', () => {
    expect(() => consolidarBalancetes(MATRIZ, [
      { prcodemp: 436, linhas: [linha(MATRIZ, '01')] },
      { prcodemp: 999, linhas: [linha('11.222.333/0001-81', '01')] },
    ])).toThrow(/mesma raiz/)
  })
})
