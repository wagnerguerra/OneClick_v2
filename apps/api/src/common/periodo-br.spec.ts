import { filtroDeData, janelaDoPeriodo, mesesDaJanela } from './periodo-br'

describe('janelaDoPeriodo', () => {
  const agora = new Date('2026-09-25T15:00:00.000Z')

  it('datas inclusivas no fuso de Brasília', () => {
    const j = janelaDoPeriodo({ de: '2026-09-01', ate: '2026-09-25' }, agora)
    expect(j.gte?.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(j.lte?.toISOString()).toBe('2026-09-26T02:59:59.999Z')
  })

  it('de/ate vencem os dias', () => {
    const j = janelaDoPeriodo({ dias: 30, de: '2026-09-01' }, agora)
    expect(j.gte?.toISOString()).toBe('2026-09-01T03:00:00.000Z')
    expect(j.lte).toBeUndefined()
  })

  it('dias contam a partir de agora', () => {
    const j = janelaDoPeriodo({ dias: 1 }, agora)
    expect(j.gte?.toISOString()).toBe('2026-09-24T15:00:00.000Z')
    expect(j.lte).toEqual(agora)
  })

  it('sem período: sem filtro', () => {
    expect(filtroDeData(janelaDoPeriodo(undefined))).toBeUndefined()
    expect(filtroDeData(janelaDoPeriodo({}))).toBeUndefined()
  })
})

describe('mesesDaJanela', () => {
  const agora = new Date('2026-09-25T15:00:00.000Z')

  it('os meses do período, inclusive as pontas', () => {
    const m = mesesDaJanela(janelaDoPeriodo({ de: '2026-07-15', ate: '2026-09-25' }), agora)
    expect(m.map(x => x.chave)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(m[0]!.rotulo).toBe('jul/26')
  })

  it('atravessa a virada do ano', () => {
    const m = mesesDaJanela(janelaDoPeriodo({ de: '2025-11-01', ate: '2026-02-10' }), agora)
    expect(m.map(x => x.chave)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('sem início: padrão de meses até o fim', () => {
    expect(mesesDaJanela({}, agora, 6).map(x => x.chave)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
  })

  it('limita aos mais recentes', () => {
    const m = mesesDaJanela(janelaDoPeriodo({ de: '2020-01-01', ate: '2026-09-25' }), agora, 12, 24)
    expect(m).toHaveLength(24)
    expect(m[23]!.chave).toBe('2026-09')
  })

  it('o fim é o mês de Brasília, não o de UTC', () => {
    // 01/10 00:30 UTC ainda é 30/09 em Brasília.
    expect(mesesDaJanela({ lte: new Date('2026-10-01T00:30:00Z') }, agora, 1).map(x => x.chave)).toEqual(['2026-09'])
  })
})
