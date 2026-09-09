import { describe, expect, it } from 'vitest'

import {
  type Parametros,
  PADRAO,
  adicionalIrpjMensal, aliquotaCpp,
  calcularComparativo, calcularDas, calcularIva, calcularPresumido, calcularReal,
  conferirDas, resolverAnexo, valorIva,
} from './calculo'
import { CPP_TOTAL_PADRAO } from './parametros-fiscais'

/**
 * Caso de referência: escritório de serviços contábeis no ES.
 *
 * Receita mensal R$ 208.720, RBT12 R$ 2.504.640 (12 × a mensal), folha de 30%
 * da receita, ISS de 5% e DAS informado de R$ 25.275,99.
 */
const RECEITA = 208_720
const RBT12 = 2_504_640

function base(over: Partial<Parametros> = {}): Parametros {
  return {
    ...PADRAO,
    regime: 'SIMPLES',
    atividade: 'SERVICOS',
    faturamentoMensal: RECEITA,
    despesasCreditaveis: 0,
    rbt12: RBT12,
    atividadeSimples: 'CONTABILIDADE',
    classificacaoIva: 'PROFISSAO_REGULAMENTADA',
    folhaMensal: RECEITA * 0.30,
    iss: 5,
    dasInformado: 25_275.99,
    ...over,
  }
}

/**
 * O caso de referência com o ISS fixo municipal informado.
 *
 * O documento não traz esse valor, e sem ele a coluna do Simples fica
 * legitimamente incompleta: o escritório de serviços contábeis recolhe ISS em
 * valor fixo por profissional ao município (art. 18, §22-A), e isso é parte da
 * carga. Onde o teste precisa da coluna FECHADA, o dado é informado — em vez de
 * deixar o componente virar zero silencioso, que é o defeito sob correção.
 */
function baseCompleta(over: Partial<Parametros> = {}): Parametros {
  return base({ issFixoPorProfissional: 250, profissionais: 4, ...over })
}

// ══════════════════════════════════════════════════════════════════════
// CASO 1 — o comparativo inteiro
// ══════════════════════════════════════════════════════════════════════
describe('CASO 1 — serviços contábeis, R$ 208.720/mês, folha 30%, ISS 5%', () => {
  const p = base()

  it('coloca o RBT12 na 5ª faixa do Anexo III', () => {
    // R$ 2.504.640 está entre 1.800.000,01 e 3.600.000 — 21% com parcela a
    // deduzir de 125.640. A continuidade da tabela confirma: nos R$ 1.800.000
    // exatos a 4ª e a 5ª faixa dão a mesma efetiva de 14,02%.
    const m = calcularDas(p)
    expect(m.anexo).toBe('III')
    expect(m.faixa).toBe(5)
    expect(m.nominal).toBe(21)
    expect(m.deduzir).toBe(125_640)
    expect(m.aliquotaEfetivaBruta).toBeCloseTo(15.9837, 3)
  })

  it('trava o ISS em 5% efetivos e redistribui o excedente aos federais', () => {
    // 33,50% de 15,9837% daria 5,3545% de ISS. Acima do teto, o excedente vai
    // proporcionalmente para IRPJ, CSLL, COFINS, PIS e CPP.
    const m = calcularDas(p)
    const iss = m.partilha.find(l => l.tributo === 'ISS')!
    expect(iss.percentual * m.aliquotaEfetivaBruta / 100).toBeCloseTo(5, 6)
    expect(m.partilha.reduce((a, l) => a + l.percentual, 0)).toBeCloseTo(100, 6)
    expect(m.avisos.some(a => a.includes('5%'))).toBe(true)
  })

  it('tira o ISS do DAS: escritório contábil recolhe fixo ao município', () => {
    const m = calcularDas(p)
    expect(m.foraDoDas).toContain('ISS')
    // Com o ISS travado em 5 pontos, retirá-lo baixa a efetiva na mesma medida.
    expect(m.aliquotaEfetivaDas).toBeCloseTo(15.9837 - 5, 3)
    expect(m.valorMensal).toBeCloseTo(22_925.20, 1)
  })

  it('Lucro Presumido custa R$ 55.544,11 por mês — 26,61%', () => {
    const c = calcularPresumido(p)
    expect(c.itens.find(i => i.chave === 'irpj')!.valor).toBeCloseTo(10_018.56, 2)
    expect(c.itens.find(i => i.chave === 'irpj_adicional')!.valor).toBeCloseTo(4_679.04, 2)
    expect(c.itens.find(i => i.chave === 'csll')!.valor).toBeCloseTo(6_011.14, 2)
    expect(c.itens.find(i => i.chave === 'pis')!.valor).toBeCloseTo(1_356.68, 2)
    expect(c.itens.find(i => i.chave === 'cofins')!.valor).toBeCloseTo(6_261.60, 2)
    expect(c.itens.find(i => i.chave === 'iss')!.valor).toBeCloseTo(10_436.00, 2)
    expect(c.itens.find(i => i.chave === 'cpp')!.valor).toBeCloseTo(16_781.09, 2)
    // R$ 55.544,10 — o motor soma os valores cheios. O R$ 55.544,11 da
    // especificação vem de somar os componentes já arredondados a centavo
    // (CSLL 6.011,14 em vez de 6.011,136). Diferença de arredondamento de
    // apresentação, não de cálculo.
    expect(c.totalEfetivo).toBeCloseTo(55_544.10, 2)
    expect(c.aliquotaEfetiva).toBeCloseTo(26.61, 2)
  })

  it('IVA 2033 com redução de 30% recolhe R$ 40.909,12 de consumo — 19,60%', () => {
    const iva = valorIva({ ...p, anoBase: 2033 })
    expect(iva.aliquotaTotal).toBeCloseTo(19.6, 6)
    expect(iva.total).toBeCloseTo(40_909.12, 2)
    // A coluna soma consumo + renda + previdência, então o total é maior — é
    // exatamente o erro de escopo que a correção resolve.
    const c = calcularIva({ ...p, anoBase: 2033 })
    expect(c.consumo).toBeCloseTo(40_909.12, 2)
    expect(c.renda).toBeGreaterThan(0)
    expect(c.previdencia).toBeCloseTo(16_781.09, 2)
  })

  it('Lucro Real não fecha total: renda exige DRE', () => {
    const c = calcularReal(p)
    expect(c.renda).toBeNull()
    expect(c.totalNominal).toBeNull()
    expect(c.totalEfetivo).toBeNull()
    expect(c.aliquotaEfetiva).toBeNull()
    expect(c.pendencias.some(m => m.includes('DRE'))).toBe(true)
    // O que É calculável continua aparecendo.
    expect(c.consumo).toBeGreaterThan(0)
    expect(c.previdencia).toBeCloseTo(16_781.09, 2)
  })

  it('inverte a conclusão antiga: o Presumido custa mais que o dobro do Simples', () => {
    const c = calcularComparativo(baseCompleta())
    expect(c.presumido.totalEfetivo).toBeGreaterThan(c.simplesDentro.totalEfetivo! * 2)
  })
})

// ══════════════════════════════════════════════════════════════════════
// CASO 2 — adicional de IRPJ, fronteira
// ══════════════════════════════════════════════════════════════════════
describe('CASO 2 — adicional de IRPJ é trimestral', () => {
  it('base trimestral de exatamente R$ 60.000 não gera adicional', () => {
    expect(adicionalIrpjMensal(60_000 / 3)).toBe(0)
  })

  it('base trimestral de R$ 60.001 gera R$ 0,10 no trimestre', () => {
    expect(adicionalIrpjMensal(60_001 / 3) * 3).toBeCloseTo(0.10, 6)
  })

  it('rejeita o limite de R$ 60.000 aplicado a cada mês', () => {
    // A confusão que este teste tranca: usar os R$ 60.000 como se fossem
    // mensais. Com a base do caso de referência (R$ 66.790,40/mês) o errado dá
    // R$ 679,04 e o certo R$ 4.679,04 — quase sete vezes menos.
    const baseMensal = 208_720 * 0.32
    const errado = Math.max(0, baseMensal - 60_000) * 0.10
    expect(adicionalIrpjMensal(baseMensal)).toBeCloseTo(4_679.04, 2)
    expect(errado).toBeCloseTo(679.04, 2)

    // Os R$ 20.000/mês do art. 3º, §1º são a MESMA coisa que R$ 60.000 por
    // trimestre quando a receita é constante — não é aí que os dois diferem.
    expect(adicionalIrpjMensal(baseMensal)).toBeCloseTo(
      Math.max(0, baseMensal - 20_000) * 0.10, 6,
    )
  })
})

// ══════════════════════════════════════════════════════════════════════
// CASO 3 — sensibilidade da CPP
// ══════════════════════════════════════════════════════════════════════
describe('CASO 3 — a folha decide a comparação', () => {
  it('CPP a 26,8% sobre folhas de 20%, 30% e 40% da receita', () => {
    expect(aliquotaCpp(PADRAO)).toBeCloseTo(CPP_TOTAL_PADRAO, 6)
    const cpp = (percentual: number) =>
      calcularPresumido(base({ folhaMensal: RECEITA * percentual }))
        .itens.find(i => i.chave === 'cpp')!.valor
    expect(cpp(0.20)).toBeCloseTo(11_187.39, 2)
    expect(cpp(0.30)).toBeCloseTo(16_781.09, 2)
    expect(cpp(0.40)).toBeCloseTo(22_374.78, 2)
  })

  it('sem folha informada a CPP é null e o comparativo não conclui', () => {
    const c = calcularComparativo(base({ folhaMensal: 0 }))
    expect(c.presumido.previdencia).toBeNull()
    expect(c.presumido.totalEfetivo).toBeNull()
    expect(c.conclusivo).toBe(false)
    expect(c.motivosNaoConclusivo.some(m => m.toLowerCase().includes('folha'))).toBe(true)
  })

  it('a diferença entre Simples e Presumido muda de tamanho com a folha', () => {
    const delta = (percentual: number) => {
      const c = calcularComparativo(base({ folhaMensal: RECEITA * percentual }))
      return c.presumido.totalEfetivo! - c.simplesDentro.totalEfetivo!
    }
    expect(delta(0.40)).toBeGreaterThan(delta(0.20))
  })
})

// ══════════════════════════════════════════════════════════════════════
// CASO 4 — cronograma
// ══════════════════════════════════════════════════════════════════════
describe('CASO 4 — a alíquota do IVA é função do ano-base', () => {
  it('2026 é fase-teste: CBS 0,9% + IBS 0,1%, compensáveis', () => {
    const iva = valorIva(base({ anoBase: 2026, classificacaoIva: 'PADRAO' }))
    expect(iva.aliquotaCbs).toBeCloseTo(0.9, 6)
    expect(iva.aliquotaIbs).toBeCloseTo(0.1, 6)
    expect(iva.compensavel).toBe(true)
  })

  it('2033 é regime pleno, com a redução da atividade aplicada', () => {
    const iva = valorIva(base({ anoBase: 2033 }))
    expect(iva.aliquotaTotal).toBeCloseTo(19.6, 6)
    expect(iva.reducao).toBe(30)
    expect(iva.compensavel).toBe(false)
  })

  it('em 2029 o ICMS/ISS antigo ainda entra na coluna IVA', () => {
    const c = calcularIva(base({ anoBase: 2029 }))
    expect(c.itens.some(i => i.chave === 'icms_iss_residual')).toBe(true)
    // Sem o resíduo, 2029 pareceria mais barato que 2033.
    const residual = c.itens.find(i => i.chave === 'icms_iss_residual')!.valor
    expect(residual).toBeCloseTo(RECEITA * 0.05 * 0.9, 2)
  })
})

// ══════════════════════════════════════════════════════════════════════
// CASO 5 — divergência do DAS
// ══════════════════════════════════════════════════════════════════════
describe('CASO 5 — DAS informado é conferido contra a memória de cálculo', () => {
  it('acusa a divergência do caso de referência', () => {
    const c = calcularComparativo(base())
    expect(c.divergenciaDas).not.toBeNull()
    expect(c.divergenciaDas!.informado).toBeCloseTo(25_275.99, 2)
    expect(c.divergenciaDas!.calculado).toBeCloseTo(22_925.20, 1)
    expect(c.divergenciaDas!.alerta).toBe(true)
  })

  it('não alerta quando o informado bate com o calculado', () => {
    const d = conferirDas(22_925.20, 22_925.20)
    expect(d!.alerta).toBe(false)
    // Tolerância de 2%: uma diferença de 1% passa.
    expect(conferirDas(22_925.20 * 1.01, 22_925.20)!.alerta).toBe(false)
    expect(conferirDas(22_925.20 * 1.03, 22_925.20)!.alerta).toBe(true)
  })

  it('com o ISS dentro do DAS a conta muda de patamar', () => {
    // Empresa de serviços que NÃO recolhe ISS fixo: o ISS fica na guia.
    const m = calcularDas(base({ atividadeSimples: 'CONSULTORIA', anexo: 'III' }))
    expect(m.foraDoDas).not.toContain('ISS')
    expect(m.valorMensal).toBeCloseTo(RECEITA * 0.159837, 0)
  })
})

// ══════════════════════════════════════════════════════════════════════
// CASO 6 — Fator R
// ══════════════════════════════════════════════════════════════════════
describe('CASO 6 — Fator R e a exceção do art. 18, §5º-B', () => {
  it('contabilidade com folha de 10% permanece no Anexo III', () => {
    const r = resolverAnexo(base({ atividadeSimples: 'CONTABILIDADE', folhaMensal: RECEITA * 0.10 }))
    expect(r.anexo).toBe('III')
    expect(r.porLei).toBe(true)
    expect(r.fatorR).toBeCloseTo(10, 6)
  })

  it('tecnologia com folha de 10% cai no Anexo V', () => {
    const r = resolverAnexo(base({ atividadeSimples: 'TECNOLOGIA', folhaMensal: RECEITA * 0.10 }))
    expect(r.anexo).toBe('V')
    expect(r.porLei).toBe(false)
  })

  it('tecnologia com folha de 28% sobe para o Anexo III', () => {
    const r = resolverAnexo(base({ atividadeSimples: 'TECNOLOGIA', folhaMensal: RECEITA * 0.28 }))
    expect(r.anexo).toBe('III')
    expect(r.fatorR).toBeCloseTo(28, 6)
  })
})

// ══════════════════════════════════════════════════════════════════════
// Critérios de aceite estruturais
// ══════════════════════════════════════════════════════════════════════
describe('escopo — toda coluna soma as mesmas categorias', () => {
  const c = calcularComparativo(baseCompleta())

  it('nenhuma coluna soma um componente nulo como zero', () => {
    for (const coluna of c.colunas) {
      const temNulo = coluna.itens.some(i => i.valor === null)
      if (temNulo) {
        // Um item nulo torna o escopo nulo, e o escopo nulo torna o total nulo.
        expect(coluna.totalNominal).toBeNull()
        expect(coluna.pendencias.length).toBeGreaterThan(0)
      }
    }
  })

  it('as colunas calculáveis têm consumo, renda e previdência', () => {
    for (const coluna of [c.simplesDentro, c.presumido, c.iva]) {
      expect(coluna.consumo).not.toBeNull()
      expect(coluna.renda).not.toBeNull()
      expect(coluna.previdencia).not.toBeNull()
    }
  })

  it('o Simples embute a CPP no DAS e não a cobra por fora', () => {
    // Anexo III: 43,40% do DAS é CPP. Sair do Simples é passar a pagar isso
    // por fora — o item que decide a comparação.
    const cpp = c.simplesDentro.itens.find(i => i.chave === 'das_CPP')
    expect(cpp).toBeDefined()
    expect(c.simplesDentro.itens.some(i => i.chave === 'cpp')).toBe(false)
  })

  it('retenções ficam fora da carga', () => {
    expect(c.presumido.retencoes).toBeGreaterThanOrEqual(0)
    const soma = c.presumido.itens.reduce((a, i) => a + (i.valor ?? 0), 0)
    expect(c.presumido.totalNominal).toBeCloseTo(soma, 6)
  })

  it('o Simples optante não sofre retenção na fonte', () => {
    expect(c.simplesDentro.retencoes).toBe(0)
  })

  it('sem RBT12 o DAS é pendência, e não R$ 0,00', () => {
    // Regressão: um cliente cujo faturamento vinha do balancete abria com
    // receita cheia e RBT12 zero. O DAS caía na 1ª faixa, saía zerado, e a
    // coluna do Simples exibia R$ 0,00 linha a linha — o zero silencioso que
    // esta correção existe para eliminar, cometido pelo próprio DAS.
    const c = calcularComparativo(base({ rbt12: 0 }))
    expect(c.memoriaDas.calculavel).toBe(false)
    for (const it of c.simplesDentro.itens.filter(i => i.chave.startsWith('das_'))) {
      expect(it.valor).toBeNull()
    }
    expect(c.simplesDentro.renda).toBeNull()
    expect(c.simplesDentro.previdencia).toBeNull()
    expect(c.simplesDentro.pendencias.some(m => m.includes('RBT12'))).toBe(true)
    expect(c.conclusivo).toBe(false)
  })

  it('ISS fixo não informado vira pendência, e não zero', () => {
    // Sem o valor municipal a coluna do Simples NAO fecha. É o comportamento
    // desejado: somar zero ali faria o Simples parecer mais barato do que é.
    const semIss = calcularComparativo(base())
    const item = semIss.simplesDentro.itens.find(i => i.chave === 'iss_fixo')!
    expect(item.valor).toBeNull()
    expect(semIss.simplesDentro.totalEfetivo).toBeNull()
    expect(semIss.simplesDentro.pendencias.some(m => m.includes('ISS fixo'))).toBe(true)
  })
})

describe('art. 41 — as duas alternativas do Simples', () => {
  const p = baseCompleta({ percentualClientesPjRegular: 100 })
  const c = calcularComparativo(p)

  it('recolher IBS/CBS por fora custa mais que mantê-los no DAS', () => {
    expect(c.simplesFora.totalEfetivo).toBeGreaterThan(c.simplesDentro.totalEfetivo!)
  })

  it('a opção por fora carrega IBS/CBS e tira PIS/COFINS do DAS', () => {
    expect(c.simplesFora.itens.some(i => i.chave === 'ibs_cbs')).toBe(true)
    expect(c.simplesFora.itens.some(i => i.chave === 'das_PIS')).toBe(false)
    expect(c.simplesFora.itens.some(i => i.chave === 'das_COFINS')).toBe(false)
    // IRPJ, CSLL e CPP continuam no DAS.
    expect(c.simplesFora.itens.some(i => i.chave === 'das_CPP')).toBe(true)
  })

  it('e o Simples não é apresentado como extinto', () => {
    expect(c.simplesDentro.totalEfetivo).not.toBeNull()
    expect(c.simplesFora.totalEfetivo).not.toBeNull()
  })
})

describe('ERRO 5 — crédito do adquirente e natureza por fora', () => {
  it('carteira 100% PJ no regime regular: o IBS/CBS destacado deixa de ser ônus', () => {
    const c = calcularIva(base({ anoBase: 2033, percentualClientesPjRegular: 100 }))
    expect(c.impactoLiquido).toBeCloseTo(c.totalEfetivo! - 40_909.12, 2)
  })

  it('carteira sem crédito: nominal e líquido coincidem', () => {
    const c = calcularIva(base({ anoBase: 2033, percentualClientesPjRegular: 0 }))
    expect(c.impactoLiquido).toBeCloseTo(c.totalEfetivo!, 6)
  })
})
