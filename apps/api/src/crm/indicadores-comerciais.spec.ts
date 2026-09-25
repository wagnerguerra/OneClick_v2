import { acumular, campoDaSituacao, dataDoContrato, reuniaoJaAconteceu, situacaoDosLeads } from './indicadores-comerciais'

const d = (s: string) => new Date(s)

describe('situacaoDosLeads', () => {
  it('vale a última interação com resultado; em andamento não decide', () => {
    const m = situacaoDosLeads([
      { oportunidadeId: 'a', tipo: 'LIGACAO', resultado: 'SEM_RESPOSTA', dataHora: d('2026-09-01T12:00:00Z'), userId: 'thay' },
      { oportunidadeId: 'a', tipo: 'WHATSAPP', resultado: 'QUALIFICADO', dataHora: d('2026-09-03T12:00:00Z'), userId: 'thay' },
      { oportunidadeId: 'a', tipo: 'EMAIL', resultado: 'EM_ANDAMENTO', dataHora: d('2026-09-04T12:00:00Z'), userId: 'thay' },
      { oportunidadeId: 'b', tipo: 'LIGACAO', resultado: null, dataHora: d('2026-09-02T12:00:00Z'), userId: 'thay' },
    ])
    expect(m.get('a')).toEqual({ resultado: 'QUALIFICADO', canal: 'WHATSAPP', userId: 'thay', dataHora: d('2026-09-03T12:00:00Z') })
    expect(m.has('b')).toBe(false)
  })

  it('mapeia para o campo do painel', () => {
    expect(campoDaSituacao({ resultado: 'QUALIFICADO', canal: 'LIGACAO', userId: null, dataHora: d('2026-09-01T12:00:00Z') })).toBe('qualifLigacao')
    expect(campoDaSituacao({ resultado: 'QUALIFICADO', canal: 'WHATSAPP', userId: null, dataHora: d('2026-09-01T12:00:00Z') })).toBe('qualifWhatsapp')
    expect(campoDaSituacao({ resultado: 'QUALIFICADO', canal: 'REUNIAO', userId: null, dataHora: d('2026-09-01T12:00:00Z') })).toBe('qualifOutros')
    expect(campoDaSituacao({ resultado: 'SEM_RESPOSTA', canal: 'LIGACAO', userId: null, dataHora: d('2026-09-01T12:00:00Z') })).toBe('semResposta')
    expect(campoDaSituacao({ resultado: 'DESQUALIFICADO', canal: 'LIGACAO', userId: null, dataHora: d('2026-09-01T12:00:00Z') })).toBe('desqualificados')
  })
})

describe('reuniaoJaAconteceu', () => {
  it('passado, futuro e hoje pela hora', () => {
    expect(reuniaoJaAconteceu('2026-09-24', null, null, '2026-09-25', '10:00')).toBe(true)
    expect(reuniaoJaAconteceu('2026-09-26', '09:00', null, '2026-09-25', '10:00')).toBe(false)
    expect(reuniaoJaAconteceu('2026-09-25', '09:30', '09:00', '2026-09-25', '10:00')).toBe(true)
    expect(reuniaoJaAconteceu('2026-09-25', '11:00', '10:00', '2026-09-25', '10:30')).toBe(false)
    expect(reuniaoJaAconteceu('2026-09-25', null, null, '2026-09-25', '23:00')).toBe(false)
  })
})

describe('dataDoContrato', () => {
  const aprovado = d('2026-09-10T12:00:00Z')
  const fechado = d('2026-09-20T12:00:00Z')
  it('a marca manual vence, com ou sem serviço de entrada', () => {
    expect(dataDoContrato({ contratoFechadoEm: fechado, dtAprovado: aprovado }, false)).toEqual(fechado)
    expect(dataDoContrato({ contratoFechadoEm: fechado, dtAprovado: null }, true)).toEqual(fechado)
  })
  it('sem marca: aprovação com serviço de entrada', () => {
    expect(dataDoContrato({ contratoFechadoEm: null, dtAprovado: aprovado }, true)).toEqual(aprovado)
    expect(dataDoContrato({ contratoFechadoEm: null, dtAprovado: aprovado }, false)).toBeNull()
    expect(dataDoContrato({ contratoFechadoEm: null, dtAprovado: null }, true)).toBeNull()
  })
})

describe('acumular', () => {
  it('soma no total e por pessoa', () => {
    const { total, porPessoa } = acumular([
      { campo: 'leadsRecebidos', userId: 'thay' },
      { campo: 'leadsRecebidos', userId: null },
      { campo: 'contratosAssinados', userId: 'gio' },
    ])
    expect(total.leadsRecebidos).toBe(2)
    expect(total.contratosAssinados).toBe(1)
    expect(porPessoa.get('thay')?.leadsRecebidos).toBe(1)
    expect(porPessoa.get('')?.leadsRecebidos).toBe(1)
    expect(porPessoa.get('gio')?.contratosAssinados).toBe(1)
  })
})
