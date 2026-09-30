import { CLIENTE_ATIVO_MENSAL, daCarteira, exigirEmpresa, foraDaCarteira } from './recorte-carteira'

describe('daCarteira (recorte das telas do Acessórias)', () => {
  it('exige cliente mensal ativo da empresa carregada', () => {
    expect(daCarteira('emp1')).toEqual({
      empresaId: 'emp1',
      cliente: { is: { status: 'ATIVO', situacao: 'MENSAL', empresaId: 'emp1' } },
    })
  })

  it('sem empresa carregada, ainda exige mensal ativo', () => {
    expect(daCarteira(null)).toEqual({ cliente: { is: CLIENTE_ATIVO_MENSAL } })
    expect(daCarteira(undefined)).toEqual({ cliente: { is: CLIENTE_ATIVO_MENSAL } })
  })
})

describe('exigirEmpresa (rotinas que gravam)', () => {
  it('devolve a empresa carregada', () => {
    expect(exigirEmpresa('emp1')).toBe('emp1')
  })
  it('sem empresa, recusa em vez de agir em todas', () => {
    expect(() => exigirEmpresa(null)).toThrow(/Selecione a empresa/)
    expect(() => exigirEmpresa(undefined)).toThrow(/Selecione a empresa/)
    expect(() => exigirEmpresa('')).toThrow(/Selecione a empresa/)
  })
})

describe('foraDaCarteira (limpeza na sincronização)', () => {
  it('pega só a empresa, e só cliente que não é mensal ativo', () => {
    expect(foraDaCarteira('emp1')).toEqual({
      empresaId: 'emp1',
      cliente: { is: { OR: [{ status: { not: 'ATIVO' } }, { situacao: { not: 'MENSAL' } }] } },
    })
  })
})
