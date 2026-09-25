import { describe, expect, it } from 'vitest'
import { diasAtePrazo, formatarPrazo, hojeIso, lembreteJaPassou, rotuloLembrete, situacaoDoPrazo } from './acao-prazo'

// 25/09/2026 às 14:00 no fuso local.
const HOJE = new Date(2026, 8, 25, 14, 0)

describe('situacaoDoPrazo', () => {
  it('lê o prazo como data (meia-noite UTC), não como instante', () => {
    expect(diasAtePrazo('2026-09-25T00:00:00.000Z', HOJE)).toBe(0)
    expect(formatarPrazo('2026-09-25T00:00:00.000Z')).toBe('25/09/2026')
  })

  it('classifica atrasada, hoje, próxima e futura', () => {
    expect(situacaoDoPrazo('2026-09-22T00:00:00.000Z', false, HOJE)).toEqual({ tipo: 'atrasada', dias: 3 })
    expect(situacaoDoPrazo('2026-09-25T00:00:00.000Z', false, HOJE)).toEqual({ tipo: 'hoje' })
    expect(situacaoDoPrazo('2026-09-27T00:00:00.000Z', false, HOJE)).toEqual({ tipo: 'proxima', dias: 2 })
    expect(situacaoDoPrazo('2026-10-05T00:00:00.000Z', false, HOJE)).toEqual({ tipo: 'futura', dias: 10 })
  })

  it('concluída ignora o prazo', () => {
    expect(situacaoDoPrazo('2026-09-01T00:00:00.000Z', true, HOJE)).toEqual({ tipo: 'concluida' })
  })
})

describe('lembretes', () => {
  it('rótulos fixos e livres', () => {
    expect(rotuloLembrete(1440)).toBe('1 dia antes')
    expect(rotuloLembrete(30)).toBe('30 min antes')
    expect(rotuloLembrete(120)).toBe('2 h antes')
    expect(rotuloLembrete(4320)).toBe('3 dias antes')
  })

  it('avisa quando o lembrete já ficou para trás', () => {
    // Vence hoje sem hora (09:00): "1 dia antes" e "no dia" já passaram às 14h.
    expect(lembreteJaPassou('2026-09-25', '', 1440, HOJE)).toBe(true)
    expect(lembreteJaPassou('2026-09-25', '', 0, HOJE)).toBe(true)
    // Vence hoje às 18:00: "no dia" (18:00) ainda vem.
    expect(lembreteJaPassou('2026-09-25', '18:00', 0, HOJE)).toBe(false)
    // Vence amanhã: "1 dia antes" = hoje 09:00, já passou; "no dia" não.
    expect(lembreteJaPassou('2026-09-26', null, 1440, HOJE)).toBe(true)
    expect(lembreteJaPassou('2026-09-26', null, 0, HOJE)).toBe(false)
  })

  it('hojeIso é o dia local', () => {
    expect(hojeIso(HOJE)).toBe('2026-09-25')
  })
})
