import { CLIENTE_ATIVO_MENSAL, daCarteira } from './recorte-carteira'

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
