import { temServicoDeEntrada } from './contratos-de-orcamento'

describe('temServicoDeEntrada', () => {
  const entrada = new Set(['constituicao'])

  it('pelo serviço-modelo do orçamento', () => {
    expect(temServicoDeEntrada({ servicoId: 'constituicao', itens: [] }, entrada)).toBe(true)
  })

  it('por qualquer item', () => {
    expect(temServicoDeEntrada({ servicoId: null, itens: [{ catalogoId: 'folha' }, { catalogoId: 'constituicao' }] }, entrada)).toBe(true)
  })

  it('sem serviço de entrada', () => {
    expect(temServicoDeEntrada({ servicoId: 'folha', itens: [{ catalogoId: null }] }, entrada)).toBe(false)
  })
})
