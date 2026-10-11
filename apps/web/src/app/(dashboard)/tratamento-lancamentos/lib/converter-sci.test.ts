import { describe, expect, it } from 'vitest'
import { converterParaSci, sciTextToBytes } from '@saas/types'

// Conversão no navegador ("Gerar arquivo"). Dados fictícios.
const TABELA = {
  headers: ['Data', 'Histórico', 'Valor'],
  rows: [
    { Data: '02/01/2026', Histórico: 'TARIFA PACOTE', Valor: '-35,90' },
    { Data: '03/01/2026', Histórico: 'TARIFA AVULSA', Valor: '12,00' },
  ],
}

// Definição como um modelo salvo ANTES do bloco "Juros e Descontos" fica no
// banco: sem `jurosDescontos` (e com a conta corrente no formato legado).
const DEF_LEGADA = {
  contaCorrente: '78',
  columnMapping: { descricao: 'Histórico', valor: 'Valor', data: 'Data' },
  debitoCredito: { tipo: 'SINAL', coluna: '', mapa: [] },
  contrapartida: { modo: 'PALAVRA_CHAVE', palavraChave: [{ palavraChave: 'TARIFA', conta: '412', historicoFixo: '' }], descricao: [] },
}

describe('converterParaSci', () => {
  it('converte com a definição de um modelo antigo (sem juros/descontos)', () => {
    const r = converterParaSci(TABELA, DEF_LEGADA, 'Modelo antigo')
    expect(r.pendencias).toEqual([])
    expect(r.sciText).not.toBeNull()
    expect(r.sciText!.split('\r\n')).toHaveLength(2)
    expect(r.fileName).toBe('SCI_Modelo_antigo.txt')
    expect(r.okTotal).toBe(2)
  })

  it('sem definição salva, devolve pendências em vez de quebrar', () => {
    const r = converterParaSci(TABELA, null, 'Vazio')
    expect(r.sciText).toBeNull()
    expect(r.pendencias.length).toBeGreaterThan(0)
  })

  it('pede o ano de competência quando a data vem sem ano', () => {
    const tabela = { headers: TABELA.headers, rows: [{ Data: '02/01', Histórico: 'TARIFA', Valor: '1,00' }] }
    expect(converterParaSci(tabela, DEF_LEGADA, 'x').needsCompetenciaAno).toBe(true)
    expect(converterParaSci(tabela, DEF_LEGADA, 'x', 2026).sciText).toContain(',20260102,')
  })
})

describe('colunas opcionais "aceitar em branco"', () => {
  const tabela = {
    headers: ['Data', 'Histórico', 'Valor', 'Cliente', 'NF', 'CNPJ'],
    rows: [
      { Data: '02/01/2026', Histórico: 'TARIFA', Valor: '10,00', Cliente: 'ACME', NF: '123', CNPJ: '11.222.333/0001-81' },
      { Data: '03/01/2026', Histórico: 'TARIFA', Valor: '20,00', Cliente: '', NF: null, CNPJ: '' },
    ],
  }
  const def = {
    ...DEF_LEGADA,
    columnMapping: { ...DEF_LEGADA.columnMapping, participante: 'Cliente', numeroNf: 'NF', documento: 'CNPJ' },
  }

  it('sem a marcação, coluna opcional vazia vira pendência', () => {
    const r = converterParaSci(tabela, def, 'x')
    expect(r.sciText).toBeNull()
    expect(r.pendencias.map((p) => p.campo).sort()).toEqual(['CNPJ', 'Cliente', 'NF'])
  })

  it('marcada, a célula vazia passa e o lançamento sai sem o dado', () => {
    const r = converterParaSci(tabela, { ...def, aceitaVazio: { participante: true, numeroNf: true, documento: true } }, 'x')
    expect(r.pendencias).toEqual([])
    const [comDados, semDados] = r.sciText!.split('\r\n')
    expect(comDados).toContain('VR REF RECEB NF Nº 123 - ACME,DCTO123,,11222333000181')
    expect(semDados).toMatch(/,VR REF RECEB,,,$/)
  })

  it('a marcação vale por coluna', () => {
    const r = converterParaSci(tabela, { ...def, aceitaVazio: { numeroNf: true } }, 'x')
    expect(r.pendencias.map((p) => p.campo).sort()).toEqual(['CNPJ', 'Cliente'])
  })
})

describe('sciTextToBytes', () => {
  it('codifica em latin1 (um byte por caractere)', () => {
    expect([...sciTextToBytes('AÇÃO')]).toEqual([0x41, 0xc7, 0xc3, 0x4f])
  })
})
