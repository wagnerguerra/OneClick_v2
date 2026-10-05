import { extrairVencimentoGuia, vencimentoMaisProximo } from './vencimento-guia'

// Trechos reais da amostra de 30/09/2026 (dados de cliente removidos), na forma
// em que o pdf-parse os devolve — rótulo e valor em linhas separadas.
describe('extrairVencimentoGuia', () => {
  it('DARF: "Pagar este documento até" vence o "Vencimento" da composição', () => {
    const darfRecalculado = [
      'Período de ApuraçãoData de VencimentoNúmero do Documento',
      '07.16.26273.9871094-6',
      'Pagar este documento até',
      '30/09/2026',
      'Observações',
      '01 CSLL - LUCRO REAL - ENTIDADE NÃO FINANCEIRA - A',
      'PA:2º Trimestre/2026 Vencimento:31/07/2026',
    ].join('\n')
    expect(extrairVencimentoGuia(darfRecalculado)).toEqual({ data: '2026-09-30', regra: 'pagar_documento_ate' })
  })

  it('FGTS Digital', () => {
    expect(extrairVencimentoGuia('08/2026 MENSAL\nPagar este documento até\n18/09/2026\nValor a recolher'))
      .toEqual({ data: '2026-09-18', regra: 'pagar_documento_ate' })
  })

  it('DUA-ES: "Pagar até" vence o campo Vencimento (FEEF vinha 20/09 x 21/09)', () => {
    const dua = 'Receita de ICMS\nVencimento\n20/09/2026\nServiço\n**********\nPagar até 21/09/2026. Após esta data deverá ser emitido novo DUA.'
    expect(extrairVencimentoGuia(dua)).toEqual({ data: '2026-09-21', regra: 'pagar_ate' })
  })

  it('DAS/PGFN com "Pagar até:"', () => {
    expect(extrairVencimentoGuia('Número:07.17.26267.3851033-2\nPagar até:30/09/2026\nValor:747,08'))
      .toEqual({ data: '2026-09-30', regra: 'pagar_ate' })
  })

  it('DAM Vitória e DARE-SP: "Data de Vencimento"', () => {
    expect(extrairVencimentoGuia('Emissão: 11/09/2026 - 08:21:23\nData de Vencimento:  21/09/2026\nCNPJ'))
      .toEqual({ data: '2026-09-21', regra: 'data_de_vencimento' })
    expect(extrairVencimentoGuia('260590196467383\n07 - Data de Vencimento\n15/09/2026\n03 - CNPJ Base / CPF'))
      .toEqual({ data: '2026-09-15', regra: 'data_de_vencimento' })
  })

  it('DAM municipal: "Vencimento" seguido da data', () => {
    expect(extrairVencimentoGuia('ES\nVencimento\nValor Imposto\nCorreção\nBanestes, Pix via QRCODE.\nVencimento\n10/09/2026\nBeneficiário'))
      .toEqual({ data: '2026-09-10', regra: 'vencimento' })
    expect(extrairVencimentoGuia('Emissão : 27/07/2026 08:41:12\nVencimento : 31/07/2026\nCNPJ'))
      .toEqual({ data: '2026-07-31', regra: 'vencimento' })
  })

  it('layout Febraban: única data completa quando o texto fala em vencimento', () => {
    const febraban = 'Processo:Data Emissão:Vencimento Original:Data Vencimento:\n08/09/26 10:44\n00009558268\n10/09/2026'
    expect(extrairVencimentoGuia(febraban)).toEqual({ data: '2026-09-10', regra: 'data_unica' })
  })

  it('não inventa vencimento em relatório', () => {
    expect(extrairVencimentoGuia('Adiantamento 13º\nAdmissão 07/10/2019\nPagamento 29/09/2026')).toBeNull()
    expect(extrairVencimentoGuia('Relatório de saídas\n01/08/2026 a 31/08/2026\nvencimento dos títulos')).toBeNull()
    expect(extrairVencimentoGuia('')).toBeNull()
  })
})

describe('vencimentoMaisProximo', () => {
  it('entre várias guias, a que vence primeiro', () => {
    expect(vencimentoMaisProximo([
      { data: '2026-09-18', regra: 'pagar_ate' }, null, { data: '2026-08-15', regra: 'pagar_ate' },
    ])).toEqual({ data: '2026-08-15', regra: 'pagar_ate' })
    expect(vencimentoMaisProximo([null])).toBeNull()
  })
})
