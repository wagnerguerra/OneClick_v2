import { descricaoDaInteracao, lembretesDaAcao, textoDoHtml, tituloDaAcao, TAMANHO_TITULO_ACAO } from './crm-acao'

describe('tituloDaAcao', () => {
  it('tira o HTML e separa os parágrafos', () => {
    expect(tituloDaAcao('<p>Ligar para o <strong>João</strong></p><p>e mandar a proposta</p>'))
      .toBe('Ligar para o João e mandar a proposta')
  })

  it('corta texto longo na palavra', () => {
    const t = tituloDaAcao(`<p>${'palavra '.repeat(40)}</p>`)
    expect(t.length).toBeLessThanOrEqual(TAMANHO_TITULO_ACAO + 1)
    expect(t.endsWith('palavra…')).toBe(true)
  })

  it('texto vazio vira "Ação"', () => {
    expect(tituloDaAcao('<p></p>')).toBe('Ação')
  })

  it('decodifica as entidades comuns', () => {
    expect(textoDoHtml('<p>A &amp; B&nbsp;&lt;ok&gt;</p>')).toBe('A & B <ok>')
  })
})

describe('lembretesDaAcao', () => {
  it('sem lembrete', () => {
    expect(lembretesDaAcao({ minutosAntes: null, email: true })).toEqual([])
  })

  it('só o sino', () => {
    expect(lembretesDaAcao({ minutosAntes: 1440, email: false })).toEqual([{ canal: 'POPUP', minutosAntes: 1440 }])
  })

  it('sino e e-mail no mesmo momento', () => {
    expect(lembretesDaAcao({ minutosAntes: 0, email: true })).toEqual([
      { canal: 'POPUP', minutosAntes: 0 },
      { canal: 'EMAIL', minutosAntes: 0 },
    ])
  })
})

describe('descricaoDaInteracao', () => {
  it('com e sem contato', () => {
    expect(descricaoDaInteracao('LIGACAO', ' Maria ')).toBe('Ligação com Maria')
    expect(descricaoDaInteracao('REUNIAO', null)).toBe('Reunião')
  })
})
