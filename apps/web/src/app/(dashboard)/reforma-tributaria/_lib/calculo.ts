/**
 * Matemática do simulador da reforma tributária.
 *
 * Funções puras, sem React e sem rede: a tela só monta o que sai daqui. Isso
 * mantém a conta em um lugar só — o comparativo, a transição e a calculadora
 * partem das MESMAS alíquotas, e não de três versões que divergem com o tempo.
 *
 * O que este módulo NÃO é: a simulação do backend (`reforma-tributaria.service`),
 * que lê os snapshots do ERP, classifica créditos conta a conta e gera parecer.
 * Aquilo continua existindo e é a análise séria. Isto aqui é o simulador
 * pedagógico — o que a pessoa mexe na frente do cliente para mostrar a ordem de
 * grandeza da mudança.
 */

export type Regime = 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES'
export type Atividade = 'INDUSTRIA' | 'COMERCIO' | 'SERVICOS'

export interface Parametros {
  regime: Regime
  atividade: Atividade
  /** Receita bruta mensal. */
  faturamentoMensal: number
  /** Despesas mensais que geram crédito no IVA. */
  despesasCreditaveis: number

  // ── IVA Dual (editável) ──
  cbs: number
  ibs: number

  // ── Sistema antigo (editável) ──
  pis: number
  cofins: number
  ipi: number
  icms: number
  iss: number
  /** DAS efetivo do Simples, em % do faturamento. */
  das: number
}

/**
 * Alíquotas de referência.
 *
 * CBS 9,3% + IBS 18,7% = 28%, o teto que o governo indicou. A alíquota final
 * ainda não foi fixada em lei: a estimativa oficial varia de 26,5% a 28%, e por
 * isso os dois campos são editáveis na tela.
 */
export const PADRAO: Omit<Parametros, 'regime' | 'atividade' | 'faturamentoMensal' | 'despesasCreditaveis'> = {
  cbs: 9.3,
  ibs: 18.7,
  pis: 1.65,
  cofins: 7.6,
  ipi: 5,
  icms: 18,
  iss: 5,
  das: 12.11,
}

export const ROTULO_REGIME: Record<Regime, string> = {
  LUCRO_REAL: 'Lucro Real',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  SIMPLES: 'Simples Nacional',
}

export const ROTULO_ATIVIDADE: Record<Atividade, string> = {
  INDUSTRIA: 'Indústria',
  COMERCIO: 'Comércio',
  SERVICOS: 'Serviços',
}

/** Serviço não tem IPI nem ICMS; quem paga ISS é ele. */
export function ehServico(a: Atividade): boolean {
  return a === 'SERVICOS'
}

/** Indústria é a única que apura IPI. */
export function temIpi(a: Atividade): boolean {
  return a === 'INDUSTRIA'
}

export interface LinhaRegime {
  regime: Regime
  /** PIS (ou o DAS inteiro, no Simples). */
  federal: number
  cofins: number
  /** IPI + ICMS, ou ISS no serviço. */
  estadualMunicipal: number
  creditos: number
  totalNominal: number
  totalEfetivo: number
  aliquotaNominal: number
  aliquotaEfetiva: number
}

export interface LinhaIva {
  cbs: number
  ibs: number
  creditos: number
  totalNominal: number
  totalEfetivo: number
  aliquotaNominal: number
  aliquotaEfetiva: number
}

const pct = (v: number) => v / 100

/**
 * Carga mensal de um regime do sistema antigo.
 *
 * O crédito do sistema antigo é aproximado: no não-cumulativo (Lucro Real) as
 * despesas creditáveis geram PIS/COFINS de volta; no Presumido, o regime é
 * cumulativo e só o ICMS/IPI da entrada credita. No Simples não há crédito —
 * é o traço que mais pesa na comparação e por isso não é maquiado aqui.
 */
export function calcularRegime(p: Parametros, regime: Regime): LinhaRegime {
  const receita = p.faturamentoMensal
  const servico = ehServico(p.atividade)
  const comIpi = temIpi(p.atividade)

  if (regime === 'SIMPLES') {
    const total = receita * pct(p.das)
    return {
      regime, federal: total, cofins: 0, estadualMunicipal: 0, creditos: 0,
      totalNominal: total, totalEfetivo: total,
      aliquotaNominal: receita > 0 ? (total / receita) * 100 : 0,
      aliquotaEfetiva: receita > 0 ? (total / receita) * 100 : 0,
    }
  }

  const real = regime === 'LUCRO_REAL'
  // Cumulativo (Presumido) tem alíquota menor de PIS/COFINS e não credita.
  const pisAliq = real ? p.pis : 0.65
  const cofinsAliq = real ? p.cofins : 3.0

  const federal = receita * pct(pisAliq)
  const cofins = receita * pct(cofinsAliq)
  const estadualMunicipal = servico
    ? receita * pct(p.iss)
    : receita * pct(p.icms) + (comIpi ? receita * pct(p.ipi) : 0)

  // Crédito: PIS/COFINS só no não-cumulativo; ICMS/IPI da entrada nos dois.
  const creditoPisCofins = real ? p.despesasCreditaveis * pct(pisAliq + cofinsAliq) : 0
  const creditoIcmsIpi = servico ? 0 : p.despesasCreditaveis * pct(p.icms)
  const creditos = creditoPisCofins + creditoIcmsIpi

  const totalNominal = federal + cofins + estadualMunicipal
  const totalEfetivo = Math.max(0, totalNominal - creditos)
  return {
    regime, federal, cofins, estadualMunicipal, creditos, totalNominal, totalEfetivo,
    aliquotaNominal: receita > 0 ? (totalNominal / receita) * 100 : 0,
    aliquotaEfetiva: receita > 0 ? (totalEfetivo / receita) * 100 : 0,
  }
}

/** Carga mensal no IVA Dual, já com o crédito das despesas. */
export function calcularIva(p: Parametros): LinhaIva {
  const receita = p.faturamentoMensal
  const cbs = receita * pct(p.cbs)
  const ibs = receita * pct(p.ibs)
  // No IVA o crédito é amplo: tudo que a empresa compra e que foi tributado
  // volta. É a diferença estrutural em relação ao sistema atual.
  const creditos = p.despesasCreditaveis * pct(p.cbs + p.ibs)
  const totalNominal = cbs + ibs
  const totalEfetivo = Math.max(0, totalNominal - creditos)
  return {
    cbs, ibs, creditos, totalNominal, totalEfetivo,
    aliquotaNominal: receita > 0 ? (totalNominal / receita) * 100 : 0,
    aliquotaEfetiva: receita > 0 ? (totalEfetivo / receita) * 100 : 0,
  }
}

export interface AnoTransicao {
  ano: number
  sistemaAntigo: number
  ibs: number
  cbs: number
  total: number
  /** Variação percentual contra o total de 2026 (a carga de hoje). */
  vsHoje: number
  nota: string
}

/**
 * Cronograma da transição, ano a ano, sobre o faturamento ANUAL.
 *
 * Segue a EC 132/2023 e a LC 214/2025:
 *  - 2026 — fase-teste: CBS 0,9% e IBS 0,1%, compensáveis com PIS/COFINS. Na
 *    prática o desembolso é o do sistema antigo, e por isso a linha soma zero
 *    do lado novo.
 *  - 2027 — CBS cheia; PIS e COFINS extintos; IPI zerado (salvo Zona Franca).
 *  - 2028 — igual a 2027.
 *  - 2029 a 2032 — o IBS sobe 1/10 por ano e ICMS/ISS caem na mesma proporção.
 *  - 2033 — só IBS e CBS; o sistema antigo acaba.
 *
 * A conta é nominal (sem crédito) de propósito: a tabela mostra o que é
 * recolhido em cada ano, e o crédito depende do perfil de compras, que já
 * aparece no comparativo de regimes.
 */
export function calcularTransicao(p: Parametros): AnoTransicao[] {
  const anual = p.faturamentoMensal * 12
  const servico = ehServico(p.atividade)
  const comIpi = temIpi(p.atividade)

  const pisCofins = anual * pct(p.pis + p.cofins)
  const ipi = comIpi ? anual * pct(p.ipi) : 0
  const icmsIss = servico ? anual * pct(p.iss) : anual * pct(p.icms)
  const cbsCheia = anual * pct(p.cbs)
  const ibsCheia = anual * pct(p.ibs)

  const base2026 = pisCofins + ipi + icmsIss

  const linhas: AnoTransicao[] = []
  for (let ano = 2026; ano <= 2033; ano++) {
    let antigo = 0
    let cbs = 0
    let ibs = 0
    let nota = ''

    if (ano === 2026) {
      antigo = base2026
      nota = 'Fase-teste: CBS 0,9% e IBS 0,1%, compensáveis'
    } else if (ano === 2027 || ano === 2028) {
      antigo = icmsIss
      cbs = cbsCheia
      nota = ano === 2027 ? 'PIS/COFINS extintos, IPI zerado, CBS cheia' : 'Mesma composição de 2027'
    } else if (ano >= 2029 && ano <= 2032) {
      const fracao = (ano - 2028) / 10
      antigo = icmsIss * (1 - fracao)
      cbs = cbsCheia
      ibs = ibsCheia * fracao
      nota = `IBS a ${ano - 2028}/10 · ICMS/ISS a ${10 - (ano - 2028)}/10`
    } else {
      cbs = cbsCheia
      ibs = ibsCheia
      nota = 'Sistema antigo extinto'
    }

    const total = antigo + cbs + ibs
    linhas.push({
      ano, sistemaAntigo: antigo, ibs, cbs, total,
      vsHoje: base2026 > 0 ? ((total - base2026) / base2026) * 100 : 0,
      nota,
    })
  }
  return linhas
}

export interface Operacao {
  /** Valor da operação, sem impostos (o `vBC` da nota). */
  valor: number
  /** Fração da operação que gera crédito, em %. */
  despesasCreditaveis: number
  /** Redução de alíquota do regime específico, em % (0 = padrão). */
  reducao: number
}

export interface ResultadoOperacao {
  debitoCbs: number
  debitoIbs: number
  credito: number
  aRecolher: number
  aliquotaEfetiva: number
  destacado: number
  totalNota: number
}

/** Uma operação avulsa: quanto de IBS/CBS ela gera e quanto sobra a recolher. */
export function calcularOperacao(p: Parametros, op: Operacao): ResultadoOperacao {
  const fator = 1 - pct(op.reducao)
  const debitoCbs = op.valor * pct(p.cbs) * fator
  const debitoIbs = op.valor * pct(p.ibs) * fator
  const destacado = debitoCbs + debitoIbs
  const credito = op.valor * pct(op.despesasCreditaveis) * pct(p.cbs + p.ibs) * fator
  const aRecolher = Math.max(0, destacado - credito)
  return {
    debitoCbs, debitoIbs, credito, aRecolher,
    aliquotaEfetiva: op.valor > 0 ? (aRecolher / op.valor) * 100 : 0,
    destacado,
    totalNota: op.valor + destacado,
  }
}

/** "R$ 1.500.000,00" */
export const reais = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "28,00%" */
export const porcento = (v: number, casas = 2) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

/** "R$ 5.805k" — para eixo de gráfico, onde o valor cheio não cabe. */
export const reaisCurto = (v: number) =>
  `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`
