/**
 * Regressão contra o painel publicado no Power BI.
 *
 * As somas abaixo saíram dos oito balancetes da Finatto C (01 a 08/2026)
 * tratados exatamente como o modelo do Power BI trata: de-para pelo nome do
 * nível 3, `Crédito − Débito` só das folhas. Os números esperados são os do
 * painel publicado — os quatro cartões, a análise vertical e a coluna de cada
 * mês da Matriz de Resultados.
 *
 * Servem de rede porque a DRE inteira já esteve errada de duas formas ao mesmo
 * tempo, e nada percebeu: os subtotais da matriz somavam onde deviam subtrair,
 * e os cartões ignoravam 19 contas com movimento. Qualquer mudança que
 * desloque um subtotal cai aqui.
 */

import { calcularDre, INDICE, type SomasPorCategoria } from './mascara-dre'

/** Soma algébrica por categoria, por mês. Sinal natural: despesa é negativa. */
const MESES: Readonly<Record<string, SomasPorCategoria>> = {
  '202601': {
    RECEITA_BRUTA: 865407.06, DEDUCOES_IMPOSTOS: -170510.96, CUSTO_DAS_VENDAS: -606824.59,
    DESPESAS_OPERACIONAIS: -167011.17, RECEITAS_FINANCEIRAS: -41294.24, DESPESAS_FINANCEIRAS: -941.24,
  },
  '202602': {
    RECEITA_BRUTA: 2660973.26, DEDUCOES_IMPOSTOS: -527676.46, CUSTO_DAS_VENDAS: -1885468.18,
    DESPESAS_OPERACIONAIS: -195863.83, RECEITAS_FINANCEIRAS: 128278.11, DESPESAS_FINANCEIRAS: -1295.24,
  },
  '202603': {
    RECEITA_BRUTA: 2469339.58, DEDUCOES_IMPOSTOS: -609617.19, CUSTO_DAS_VENDAS: -1353285.73,
    DESPESAS_OPERACIONAIS: -197888.93, RECEITAS_FINANCEIRAS: 61093.93, DESPESAS_FINANCEIRAS: -2088.92,
    IR_CS: -45571.09,
  },
  '202604': {
    RECEITA_BRUTA: 3075419.48, DEDUCOES_IMPOSTOS: -703429.57, CUSTO_DAS_VENDAS: -1999885.13,
    DESPESAS_OPERACIONAIS: -208549.09, RECEITAS_FINANCEIRAS: 233812.38, DESPESAS_FINANCEIRAS: -5876.29,
    IR_CS: -130516.87,
  },
  '202605': {
    RECEITA_BRUTA: 2633501.46, DEDUCOES_IMPOSTOS: -589697.59, CUSTO_DAS_VENDAS: -1745800.69,
    DESPESAS_OPERACIONAIS: -282533.89, RECEITAS_FINANCEIRAS: 162668.57, DESPESAS_FINANCEIRAS: -1758.60,
    IR_CS: -57867.76,
  },
  '202606': {
    RECEITA_BRUTA: 3000612.70, DEDUCOES_IMPOSTOS: -314531.67, CUSTO_DAS_VENDAS: -2392021.30,
    DESPESAS_OPERACIONAIS: -656299.30, RECEITAS_FINANCEIRAS: 18789.62, DESPESAS_FINANCEIRAS: -3635.80,
    IR_CS: 233955.72,
  },
  '202607': {
    RECEITA_BRUTA: 2144928.21, DEDUCOES_IMPOSTOS: -232758.99, CUSTO_DAS_VENDAS: -1534435.98,
    DESPESAS_OPERACIONAIS: -216654.21, RECEITAS_FINANCEIRAS: 8070.90, DESPESAS_FINANCEIRAS: -5596.48,
  },
  '202608': {
    RECEITA_BRUTA: 3418219.27, DEDUCOES_IMPOSTOS: -347863.54, CUSTO_DAS_VENDAS: -2560612.36,
    DESPESAS_OPERACIONAIS: -171150.65, RECEITAS_FINANCEIRAS: 110671.46, DESPESAS_FINANCEIRAS: -5236.56,
  },
}

/** Coluna "Realizado" da última linha da Matriz, mês a mês, no painel. */
const RESULTADO_LIQUIDO_DO_MES: Readonly<Record<string, number>> = {
  '202601': -121175.14,
  '202602': 178947.66,
  '202603': 321981.65,
  '202604': 260974.91,
  '202605': 118511.50,
  '202606': -113130.03,
  '202607': 163553.45,
  '202608': 444027.62,
}

function acumularAno(): SomasPorCategoria {
  const total: SomasPorCategoria = {}
  for (const somas of Object.values(MESES)) {
    for (const [cat, v] of Object.entries(somas)) {
      const k = cat as keyof SomasPorCategoria
      total[k] = Math.round(((total[k] ?? 0) + (v ?? 0)) * 100) / 100
    }
  }
  return total
}

describe('mês a mês, contra a Matriz de Resultados do painel', () => {
  for (const [periodo, esperado] of Object.entries(RESULTADO_LIQUIDO_DO_MES)) {
    it(`${periodo}: resultado líquido = ${esperado}`, () => {
      const dre = calcularDre(MESES[periodo]!)
      expect(dre.get(INDICE.RESULTADO_LIQUIDO)).toBeCloseTo(esperado, 2)
    })
  }

  it('janeiro fecha linha a linha', () => {
    const dre = calcularDre(MESES['202601']!)
    expect(dre.get(INDICE.RECEITA_LIQUIDA)).toBeCloseTo(694896.10, 2)
    expect(dre.get(INDICE.MARGEM_BRUTA)).toBeCloseTo(88071.51, 2)
    expect(dre.get(INDICE.MARGEM_CONTRIBUICAO)).toBeCloseTo(88071.51, 2)
    expect(dre.get(INDICE.EBITDA)).toBeCloseTo(-78939.66, 2)
    expect(dre.get(INDICE.RESULTADO_OPERACIONAL)).toBeCloseTo(-121175.14, 2)
  })

  it('o EBITDA de janeiro NÃO inclui o resultado financeiro', () => {
    // A armadilha que já pegou duas vezes: em janeiro as receitas financeiras
    // são NEGATIVAS (−41.294,24). Quem soma o financeiro no EBITDA chega a
    // −121.175 e acha que está certo, porque bate com o Resultado Operacional.
    const dre = calcularDre(MESES['202601']!)
    expect(dre.get(INDICE.EBITDA)).not.toBeCloseTo(dre.get(INDICE.RESULTADO_OPERACIONAL)!, 2)
  })
})

describe('acumulado jan–ago, contra os cartões e a análise vertical', () => {
  const dre = calcularDre(acumularAno())

  it('Receita Bruta = 20.268.401,02', () => {
    // O cartão mostrava 20.196.901 — faltavam "Receita de Aluguel" (54.000) e
    // "Serviços Prestados" (17.500), folhas que o template de 142 contas não
    // tinha.
    expect(acumularAno().RECEITA_BRUTA).toBeCloseTo(20268401.02, 2)
  })

  it('Custo das Vendas = 14.078.333,96 (o cartão "Custos Fixos")', () => {
    expect(Math.abs(acumularAno().CUSTO_DAS_VENDAS!)).toBeCloseTo(14078333.96, 2)
  })

  it('Despesas Operacionais = 2.095.951,07', () => {
    expect(Math.abs(acumularAno().DESPESAS_OPERACIONAIS!)).toBeCloseTo(2095951.07, 2)
  })

  it('Receita Líquida = 16.772.315,05', () => {
    expect(dre.get(INDICE.RECEITA_LIQUIDA)).toBeCloseTo(16772315.05, 2)
  })

  it('Margem Bruta = 2.693.981,09 (16,06% da Receita Líquida)', () => {
    const v = dre.get(INDICE.MARGEM_BRUTA)!
    expect(v).toBeCloseTo(2693981.09, 2)
    expect(Math.round((v / dre.get(INDICE.RECEITA_LIQUIDA)!) * 10000) / 100).toBeCloseTo(16.06, 2)
  })

  it('EBITDA = 598.030,02 (3,57%)', () => {
    const v = dre.get(INDICE.EBITDA)!
    expect(v).toBeCloseTo(598030.02, 2)
    expect(Math.round((v / dre.get(INDICE.RECEITA_LIQUIDA)!) * 10000) / 100).toBeCloseTo(3.57, 2)
  })

  it('Resultado Operacional = 1.253.691,62 — e NÃO é igual ao EBITDA', () => {
    // Era: `const resultadoOperacional = kpis.ebitda - 0`.
    expect(dre.get(INDICE.RESULTADO_OPERACIONAL)).toBeCloseTo(1253691.62, 2)
    expect(dre.get(INDICE.RESULTADO_OPERACIONAL)).not.toBeCloseTo(dre.get(INDICE.EBITDA)!, 2)
  })

  it('Lucro Líquido = 1.253.691,62 (7,47%)', () => {
    expect(dre.get(INDICE.RESULTADO_LIQUIDO)).toBeCloseTo(1253691.62, 2)
  })

  it('o ano é a soma dos meses — a matriz e os cartões não podem discordar', () => {
    const somaDosMeses = Object.keys(MESES).reduce(
      (acc, p) => acc + (calcularDre(MESES[p]!).get(INDICE.RESULTADO_LIQUIDO) ?? 0), 0,
    )
    expect(somaDosMeses).toBeCloseTo(dre.get(INDICE.RESULTADO_LIQUIDO)!, 1)
  })
})
