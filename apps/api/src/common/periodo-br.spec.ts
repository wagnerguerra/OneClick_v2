import { filtroDeData, janelaDoPeriodo } from './periodo-br'

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
