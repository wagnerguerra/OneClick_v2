import { ordenarPassosDaEtapa } from './servico-sub-etapa'

describe('ordenarPassosDaEtapa', () => {
  const subEtapas = [
    { id: 's2', nome: 'Receita Federal', ordem: 1 },
    { id: 's1', nome: 'Junta Comercial', ordem: 0 },
  ]
  const passos = [
    { id: 'p5', ordem: 5, subEtapaId: 's2' },
    { id: 'p1', ordem: 1, subEtapaId: null },
    { id: 'p3', ordem: 3, subEtapaId: 's1' },
    { id: 'p2', ordem: 2, subEtapaId: 's1' },
    { id: 'p0', ordem: 0, subEtapaId: null },
  ]

  it('diretos primeiro, depois cada sub-etapa na ordem dela', () => {
    const r = ordenarPassosDaEtapa({ passos, subEtapas })
    expect(r.map(x => x.passo.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p5'])
    expect(r.map(x => x.subEtapaNome)).toEqual([null, null, 'Junta Comercial', 'Junta Comercial', 'Receita Federal'])
  })

  it('sem sub-etapas fica igual a hoje (ordem do passo)', () => {
    const r = ordenarPassosDaEtapa({ passos: passos.map(p => ({ ...p, subEtapaId: null })) })
    expect(r.map(x => x.passo.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p5'])
    expect(r.every(x => x.subEtapaNome === null)).toBe(true)
  })

  it('passo com sub-etapa desconhecida não some: vira direto', () => {
    const r = ordenarPassosDaEtapa({ passos: [{ id: 'x', ordem: 0, subEtapaId: 'nao-existe' }], subEtapas })
    expect(r).toEqual([{ passo: { id: 'x', ordem: 0, subEtapaId: 'nao-existe' }, subEtapaNome: null }])
  })
})
