/**
 * A DRE resolvida por acumulação da máscara.
 *
 * A trava que estes testes existem para prender: os valores têm que entrar com
 * o SINAL NATURAL de `créditos − débitos`. Despesa entra negativa e o
 * acumulado subtrai sozinho. Quem passar despesa positiva (o `Math.abs` que o
 * módulo aplicava em toda parte) faz o EBITDA crescer com o aumento da despesa.
 *
 * Os números são um mês fictício redondo, escolhido para as contas fecharem de
 * cabeça.
 */

import { calcularDre, INDICE, MASCARA_DRE } from './mascara-dre'

/** Mês didático: receita 1.000, e cada linha de saída levando um pedaço. */
const MES = {
  RECEITA_BRUTA: 1000,
  DEDUCOES_IMPOSTOS: -100,
  CUSTO_DAS_VENDAS: -400,
  DESPESAS_VARIAVEIS: -50,
  DESPESAS_OPERACIONAIS: -200,
  RECEITAS_FINANCEIRAS: 30,
  DESPESAS_FINANCEIRAS: -80,
  IR_CS: -40,
  DISTRIBUICAO_LUCROS: -60,
}

describe('estrutura da máscara', () => {
  it('tem 16 linhas: 9 de dados e 7 de subtotal', () => {
    expect(MASCARA_DRE).toHaveLength(16)
    expect(MASCARA_DRE.filter(l => l.subnivel === 0)).toHaveLength(9)
    expect(MASCARA_DRE.filter(l => l.subnivel === 1)).toHaveLength(7)
  })

  it('os índices são 1..16, sem buraco e sem repetição', () => {
    expect(MASCARA_DRE.map(l => l.indice)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
  })

  it('toda linha de dados tem categoria, e nenhum subtotal tem', () => {
    for (const l of MASCARA_DRE) {
      if (l.subnivel === 0) expect(l.categoria).not.toBeNull()
      else expect(l.categoria).toBeNull()
    }
  })
})

describe('acumulação', () => {
  const dre = calcularDre(MES)

  it('Receita Líquida = Receita Bruta + Deduções', () => {
    expect(dre.get(INDICE.RECEITA_LIQUIDA)).toBe(900)
  })

  it('Margem Bruta desce o Custo das Vendas', () => {
    expect(dre.get(INDICE.MARGEM_BRUTA)).toBe(500)
  })

  it('Margem de Contribuição desce as Despesas Variáveis', () => {
    expect(dre.get(INDICE.MARGEM_CONTRIBUICAO)).toBe(450)
  })

  it('EBITDA desce as Despesas Operacionais e NÃO inclui resultado financeiro', () => {
    // 1000 - 100 - 400 - 50 - 200 = 250. O financeiro só entra no índice 12.
    expect(dre.get(INDICE.EBITDA)).toBe(250)
  })

  it('Resultado Operacional inclui o financeiro', () => {
    // 250 + 30 - 80 = 200
    expect(dre.get(INDICE.RESULTADO_OPERACIONAL)).toBe(200)
  })

  it('Resultado Líquido desce IR/CS e a distribuição de lucros', () => {
    expect(dre.get(INDICE.RESULTADO_ANTES_PARTICIPACOES)).toBe(160) // 200 - 40
    expect(dre.get(INDICE.RESULTADO_LIQUIDO)).toBe(100)             // 160 - 60
  })

  it('o Resultado Líquido bate com a soma direta de tudo', () => {
    const somaDireta = Object.values(MES).reduce((a, b) => a + b, 0)
    expect(dre.get(INDICE.RESULTADO_LIQUIDO)).toBe(somaDireta)
  })

  it('categoria ausente vale zero — não quebra a DRE', () => {
    const dreParcial = calcularDre({ RECEITA_BRUTA: 500 })
    expect(dreParcial.get(INDICE.RECEITA_LIQUIDA)).toBe(500)
    expect(dreParcial.get(INDICE.RESULTADO_LIQUIDO)).toBe(500)
  })

  it('DESPESA POSITIVA é o erro que este modelo não perdoa', () => {
    // Passar despesa com Math.abs faz o acumulado SOMAR o gasto. O teste existe
    // para que a intenção fique escrita: quem alimentar isto tem que mandar o
    // valor algébrico.
    const errado = calcularDre({ ...MES, DESPESAS_OPERACIONAIS: 200 })
    expect(errado.get(INDICE.EBITDA)).toBe(650) // em vez de 250
  })
})
