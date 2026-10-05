import { extrairChave, extrairNotaFiscal } from './nota-fiscal-pdf'

// Trechos dos DANFEs do pedido #617 (30/09/2026), na forma em que o pdf-parse
// os devolve. Chaves com dígitos trocados — só a estrutura importa.
const CHAVE_A = '3226 0911 1111 1100 0111 5500 1000 0037 9612 5386 5279'
const CHAVE_B = '3326 0922 2222 2200 0222 5500 1075 8869 3711 9182 3864'

describe('extrairNotaFiscal', () => {
  it('layout com canhoto: número da chave, valor do canhoto, emitente', () => {
    const texto = [
      'RECEBEMOS DE COMERCIAL HEMISFERIO LTDA OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA',
      'ABAIXO. EMISSÃO: 21/09/2026 VALOR TOTAL: R$ 749,00 DESTINATÁRIO: Fulano',
      'Nº. 000.003.796', 'Série 001', 'CHAVE DE ACESSO', CHAVE_A,
      'V. TOTAL DA NOTA', '749,00',
    ].join('\n')
    expect(extrairNotaFiscal(texto)).toEqual({
      numero: '3796', serie: '1', chave: CHAVE_A.replace(/\s/g, ''), valor: 749, emitente: 'COMERCIAL HEMISFERIO LTDA',
    })
  })

  it('layout Amazon: rótulos e valores em blocos — vale o maior R$', () => {
    const texto = [
      'N° 075.886.937', 'SÉRIE: 1',
      'RECEBEMOS DE AMAZON SERVICOS DE VAREJO DO BRASIL LTDA OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO.',
      'CHAVE DE ACESSO', CHAVE_B,
      'OUTRAS DESPESAS ACESSÓRIASVALOR TOTAL DO IPIVALOR TOTAL DA NOTAVALOR DO SEGURODESCONTO',
      'R$749,50R$29,98R$749,50R$0,00',
      'R$0,00R$749,50R$0,00R$0,00R$0,00R$0,00',
    ].join('\n')
    const r = extrairNotaFiscal(texto)
    expect(r?.numero).toBe('75886937')
    expect(r?.valor).toBe(749.5)
    expect(r?.emitente).toBe('AMAZON SERVICOS DE VAREJO DO BRASIL LTDA')
  })

  it('rótulo "V. TOTAL DA NOTA" quando não há canhoto', () => {
    const r = extrairNotaFiscal(`CHAVE DE ACESSO\n${CHAVE_A}\nV. TOTAL DA NOTA\n1.679,99\n`)
    expect(r?.valor).toBe(1679.99)
  })

  it('sem chave legível: usa o "Nº" e a série impressos', () => {
    const r = extrairNotaFiscal('Nº. 000.022.710\nSérie 002\nVALOR TOTAL: R$ 679,99')
    expect(r).toEqual({ numero: '22710', serie: '2', chave: null, valor: 679.99, emitente: null })
  })

  it('não inventa NF em documento qualquer', () => {
    expect(extrairNotaFiscal('Orçamento de manutenção\nTotal R$ 300,00')).toBeNull()
    expect(extrairNotaFiscal('')).toBeNull()
  })
})

describe('extrairChave', () => {
  it('só aceita modelo 55/65', () => {
    expect(extrairChave(CHAVE_A)).toHaveLength(44)
    expect(extrairChave('3226 0911 1111 1100 0111 9900 1000 0037 9612 5386 5279')).toBeNull()
  })
})
