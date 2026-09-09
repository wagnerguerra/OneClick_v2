/**
 * Parâmetros fiscais do simulador — a única fonte de alíquotas.
 *
 * Toda constante daqui carrega o dispositivo legal que a criou. A regra é
 * simples: se um número tributário aparece na tela, ele nasceu neste arquivo.
 * Antes, oito constantes moravam soltas no motor (`PADRAO`) e o resto estava
 * escrito à mão dentro das funções — foi assim que a tela passou meses
 * apresentando Lucro Presumido como o regime mais barato.
 *
 * Nada aqui é `const enum` nem está congelado por acaso: as faixas do Simples
 * mudam por lei complementar, e a alíquota do IVA ainda vai ser fixada. Quando
 * mudarem, mudam AQUI, e o teste que trava o caso de referência acusa.
 */

// ══════════════════════════════════════════════════════════════════════
// SIMPLES NACIONAL — LC 123/2006
// ══════════════════════════════════════════════════════════════════════

/** Tributo que compõe a partilha do DAS. */
export type TributoSimples = 'IRPJ' | 'CSLL' | 'COFINS' | 'PIS' | 'CPP' | 'ICMS' | 'IPI' | 'ISS'

export interface FaixaSimples {
  /** Teto de RBT12 da faixa, em reais. */
  ate: number
  /** Alíquota nominal da faixa, em %. */
  nominal: number
  /** Parcela a deduzir, em reais. */
  deduzir: number
  /**
   * Partilha da faixa, em % do DAS. Sempre soma 100.
   *
   * É o que permite dizer "quanto do DAS é CPP" — sem ela não dá para comparar
   * o Simples com um regime em que o INSS patronal é pago por fora.
   */
  partilha: Partial<Record<TributoSimples, number>>
}

/**
 * Anexo I — Comércio (LC 123/2006, Anexo I, redação da LC 155/2016).
 */
export const ANEXO_I: FaixaSimples[] = [
  { ate: 180_000, nominal: 4.00, deduzir: 0, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 41.50, ICMS: 34.00 } },
  { ate: 360_000, nominal: 7.30, deduzir: 5_940, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 41.50, ICMS: 34.00 } },
  { ate: 720_000, nominal: 9.50, deduzir: 13_860, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 42.00, ICMS: 33.50 } },
  { ate: 1_800_000, nominal: 10.70, deduzir: 22_500, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 42.00, ICMS: 33.50 } },
  { ate: 3_600_000, nominal: 14.30, deduzir: 87_300, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 12.74, PIS: 2.76, CPP: 42.00, ICMS: 33.50 } },
  { ate: 4_800_000, nominal: 19.00, deduzir: 378_000, partilha: { IRPJ: 13.50, CSLL: 10.00, COFINS: 28.27, PIS: 6.13, CPP: 42.10 } },
]

/**
 * Anexo II — Indústria (LC 123/2006, Anexo II).
 */
export const ANEXO_II: FaixaSimples[] = [
  { ate: 180_000, nominal: 4.50, deduzir: 0, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { ate: 360_000, nominal: 7.80, deduzir: 5_940, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { ate: 720_000, nominal: 10.00, deduzir: 13_860, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { ate: 1_800_000, nominal: 11.20, deduzir: 22_500, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { ate: 3_600_000, nominal: 14.70, deduzir: 85_500, partilha: { IRPJ: 5.50, CSLL: 3.50, COFINS: 11.51, PIS: 2.49, CPP: 37.50, IPI: 7.50, ICMS: 32.00 } },
  { ate: 4_800_000, nominal: 30.00, deduzir: 720_000, partilha: { IRPJ: 8.50, CSLL: 7.50, COFINS: 20.96, PIS: 4.54, CPP: 23.50, IPI: 35.00 } },
]

/**
 * Anexo III — Serviços do art. 18 §5º-B (LC 123/2006, Anexo III).
 *
 * É o anexo dos escritórios de serviços contábeis (§5º-B, XIV) e o do caso de
 * referência. A CPP responde por 43,40% do DAS nas cinco primeiras faixas — o
 * número que decide qualquer comparação com Presumido ou Real, porque lá o
 * INSS patronal passa a ser pago por fora.
 */
export const ANEXO_III: FaixaSimples[] = [
  { ate: 180_000, nominal: 6.00, deduzir: 0, partilha: { IRPJ: 4.00, CSLL: 3.50, COFINS: 12.82, PIS: 2.78, CPP: 43.40, ISS: 33.50 } },
  { ate: 360_000, nominal: 11.20, deduzir: 9_360, partilha: { IRPJ: 4.00, CSLL: 3.50, COFINS: 14.05, PIS: 3.05, CPP: 43.40, ISS: 32.00 } },
  { ate: 720_000, nominal: 13.50, deduzir: 17_640, partilha: { IRPJ: 4.00, CSLL: 3.50, COFINS: 13.64, PIS: 2.96, CPP: 43.40, ISS: 32.50 } },
  { ate: 1_800_000, nominal: 16.00, deduzir: 35_640, partilha: { IRPJ: 4.00, CSLL: 3.50, COFINS: 13.64, PIS: 2.96, CPP: 43.40, ISS: 32.50 } },
  { ate: 3_600_000, nominal: 21.00, deduzir: 125_640, partilha: { IRPJ: 4.00, CSLL: 3.50, COFINS: 12.82, PIS: 2.78, CPP: 43.40, ISS: 33.50 } },
  { ate: 4_800_000, nominal: 33.00, deduzir: 648_000, partilha: { IRPJ: 35.00, CSLL: 15.00, COFINS: 16.03, PIS: 3.47, CPP: 30.50 } },
]

/**
 * Anexo IV — Serviços do art. 18 §5º-C (LC 123/2006, Anexo IV).
 *
 * ATENÇÃO: a partilha NÃO tem CPP. É a marca do Anexo IV — construção civil,
 * limpeza, vigilância e advocacia recolhem o INSS patronal POR FORA do DAS,
 * pela Lei 8.212/91. Quem trata "Anexo IV" como "CPP embutida" subestima a
 * carga do Simples nesses ramos em cerca de 27% da folha.
 */
export const ANEXO_IV: FaixaSimples[] = [
  { ate: 180_000, nominal: 4.50, deduzir: 0, partilha: { IRPJ: 18.80, CSLL: 15.20, COFINS: 17.67, PIS: 3.83, ISS: 44.50 } },
  { ate: 360_000, nominal: 9.00, deduzir: 8_100, partilha: { IRPJ: 19.80, CSLL: 15.20, COFINS: 20.55, PIS: 4.45, ISS: 40.00 } },
  { ate: 720_000, nominal: 10.20, deduzir: 12_420, partilha: { IRPJ: 20.80, CSLL: 15.20, COFINS: 19.73, PIS: 4.27, ISS: 40.00 } },
  { ate: 1_800_000, nominal: 14.00, deduzir: 39_780, partilha: { IRPJ: 17.80, CSLL: 19.20, COFINS: 18.90, PIS: 4.10, ISS: 40.00 } },
  { ate: 3_600_000, nominal: 22.00, deduzir: 183_780, partilha: { IRPJ: 18.80, CSLL: 19.20, COFINS: 18.08, PIS: 3.92, ISS: 40.00 } },
  { ate: 4_800_000, nominal: 33.00, deduzir: 828_000, partilha: { IRPJ: 53.50, CSLL: 21.50, COFINS: 20.55, PIS: 4.45 } },
]

/**
 * Anexo V — Serviços do art. 18 §5º-I (LC 123/2006, Anexo V).
 *
 * É o destino de quem está sujeito ao Fator R e não atinge os 28% de folha.
 */
export const ANEXO_V: FaixaSimples[] = [
  { ate: 180_000, nominal: 15.50, deduzir: 0, partilha: { IRPJ: 25.00, CSLL: 15.00, COFINS: 14.10, PIS: 3.05, CPP: 28.85, ISS: 14.00 } },
  { ate: 360_000, nominal: 18.00, deduzir: 4_500, partilha: { IRPJ: 23.00, CSLL: 15.00, COFINS: 14.10, PIS: 3.05, CPP: 27.85, ISS: 17.00 } },
  { ate: 720_000, nominal: 19.50, deduzir: 9_900, partilha: { IRPJ: 24.00, CSLL: 15.00, COFINS: 14.92, PIS: 3.23, CPP: 23.85, ISS: 19.00 } },
  { ate: 1_800_000, nominal: 20.50, deduzir: 17_100, partilha: { IRPJ: 21.00, CSLL: 15.00, COFINS: 15.74, PIS: 3.41, CPP: 23.85, ISS: 21.00 } },
  { ate: 3_600_000, nominal: 23.00, deduzir: 62_100, partilha: { IRPJ: 23.00, CSLL: 12.50, COFINS: 14.10, PIS: 3.05, CPP: 23.85, ISS: 23.50 } },
  { ate: 4_800_000, nominal: 30.50, deduzir: 540_000, partilha: { IRPJ: 35.00, CSLL: 15.50, COFINS: 16.44, PIS: 3.56, CPP: 29.50 } },
]

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V'

export const ANEXOS: Record<Anexo, FaixaSimples[]> = {
  I: ANEXO_I, II: ANEXO_II, III: ANEXO_III, IV: ANEXO_IV, V: ANEXO_V,
}

export const ROTULO_ANEXO: Record<Anexo, string> = {
  I: 'Anexo I — Comércio',
  II: 'Anexo II — Indústria',
  III: 'Anexo III — Serviços',
  IV: 'Anexo IV — Serviços (CPP por fora)',
  V: 'Anexo V — Serviços (Fator R)',
}

/** Anexos cuja partilha embute a CPP. No IV o INSS patronal é pago por fora. */
export const ANEXO_COM_CPP_EMBUTIDA: Record<Anexo, boolean> = {
  I: true, II: true, III: true, IV: false, V: true,
}

/**
 * Teto do Simples e sublimite estadual (LC 123/2006, arts. 3º e 19-20).
 *
 * Acima do sublimite a empresa continua no Simples, mas ICMS e ISS saem do DAS
 * e passam a ser recolhidos pelo regime normal.
 */
export const TETO_SIMPLES = 4_800_000
export const SUBLIMITE_ICMS_ISS = 3_600_000

/**
 * Teto do ISS dentro do DAS (LC 123/2006, art. 18, §16 e §16-A).
 *
 * Quando a alíquota efetiva da partilha do ISS passa de 5%, o excesso é
 * redistribuído proporcionalmente entre os demais tributos — o município não
 * pode receber, pelo Simples, mais do que a alíquota máxima do ISS.
 */
export const TETO_ISS_EFETIVO = 5

/**
 * Fator R (LC 123/2006, art. 18, §§5º-J e 5º-M).
 *
 * Folha dos últimos 12 meses ÷ receita dos últimos 12 meses. Atingindo 28%, a
 * atividade sujeita ao Fator R migra do Anexo V para o III.
 */
export const FATOR_R_LIMITE = 28

/**
 * Atividades que são Anexo III POR DETERMINAÇÃO LEGAL (art. 18, §5º-B).
 *
 * Não passam por Fator R: mesmo com folha de 1% da receita, continuam no
 * Anexo III. Escritórios de serviços contábeis são o inciso XIV. Confundir
 * isso com o §5º-D (esse sim sujeito ao Fator R) joga uma contabilidade
 * enxuta no Anexo V e infla a carga simulada em mais de 7 pontos.
 */
export const ATIVIDADES_ANEXO_III_POR_LEI = [
  'CONTABILIDADE',
  'MEDICINA_AMBULATORIAL',
  'ODONTOLOGIA',
  'PSICOLOGIA',
  'FISIOTERAPIA',
  'ENGENHARIA_ARQUITETURA',
] as const

export type AtividadeSimples =
  | (typeof ATIVIDADES_ANEXO_III_POR_LEI)[number]
  | 'TECNOLOGIA'
  | 'CONSULTORIA'
  | 'COMERCIO'
  | 'INDUSTRIA'
  | 'OUTROS_SERVICOS'

/**
 * ISS em valor fixo (LC 123/2006, art. 18, §22-A).
 *
 * O escritório de serviços contábeis recolhe o ISS diretamente ao município,
 * em valor fixo por profissional, e por isso o ISS SAI da partilha do DAS.
 * Ignorar isso superestima o DAS em cerca de um terço.
 */
export const ATIVIDADES_ISS_FIXO: AtividadeSimples[] = ['CONTABILIDADE']

// ══════════════════════════════════════════════════════════════════════
// LUCRO PRESUMIDO E LUCRO REAL
// ══════════════════════════════════════════════════════════════════════

/**
 * Percentuais de presunção do IRPJ (Lei 9.249/1995, art. 15).
 *
 * Serviços em geral: 32%. Venda de mercadorias e indústria: 8%.
 */
export const PRESUNCAO_IRPJ = { SERVICOS: 32, COMERCIO: 8, INDUSTRIA: 8 } as const

/**
 * Percentuais de presunção da CSLL (Lei 9.249/1995, art. 20).
 *
 * Serviços em geral: 32%. Comércio e indústria: 12% — NÃO 8%. É o erro clássico
 * de espelhar o percentual do IRPJ na CSLL.
 */
export const PRESUNCAO_CSLL = { SERVICOS: 32, COMERCIO: 12, INDUSTRIA: 12 } as const

/** IRPJ — alíquota básica (Lei 9.249/1995, art. 3º). */
export const IRPJ_ALIQUOTA = 15

/** IRPJ — adicional (Lei 9.249/1995, art. 3º, §1º). */
export const IRPJ_ADICIONAL_ALIQUOTA = 10

/**
 * Limite do adicional de IRPJ — R$ 20.000 por MÊS do período de apuração.
 *
 * A apuração do Presumido é TRIMESTRAL (Lei 9.430/1996, art. 1º), então o
 * limite do trimestre é R$ 60.000. Aplicar R$ 20.000 mês a mês dá o mesmo
 * resultado só quando a receita é constante; em qualquer sazonalidade o
 * adicional sai errado, e sempre para menos.
 */
export const IRPJ_ADICIONAL_LIMITE_MENSAL = 20_000
export const IRPJ_ADICIONAL_LIMITE_TRIMESTRAL = IRPJ_ADICIONAL_LIMITE_MENSAL * 3

/** CSLL (Lei 7.689/1988, art. 3º, III, com redação da Lei 13.169/2015). */
export const CSLL_ALIQUOTA = 9

/** PIS/COFINS cumulativo — Presumido (Lei 9.718/1998, art. 8º; LC 70/1991). */
export const PIS_CUMULATIVO = 0.65
export const COFINS_CUMULATIVO = 3.00

/** PIS/COFINS não-cumulativo — Real (Leis 10.637/2002 e 10.833/2003). */
export const PIS_NAO_CUMULATIVO = 1.65
export const COFINS_NAO_CUMULATIVO = 7.60

// ══════════════════════════════════════════════════════════════════════
// CONTRIBUIÇÃO PREVIDENCIÁRIA PATRONAL (CPP)
// ══════════════════════════════════════════════════════════════════════

/**
 * Componentes da CPP, todos parametrizáveis.
 *
 * - Patronal 20% sobre a folha (Lei 8.212/1991, art. 22, I)
 * - RAT de 1% a 3% conforme o grau de risco (art. 22, II), multiplicado pelo
 *   FAP de 0,5 a 2,0 (Lei 10.666/2003, art. 10)
 * - Terceiros até 5,8% — Sistema S, INCRA, Salário-Educação, SEBRAE
 *
 * O default de 26,8% é o caso mais comum de um escritório: 20 + RAT 1 (risco
 * leve, FAP 1,0) + 5,8 de terceiros. Quem tem FAP diferente ajusta na tela.
 */
export const CPP_PATRONAL = 20
export const CPP_RAT_PADRAO = 1
export const CPP_FAP_PADRAO = 1.0
export const CPP_TERCEIROS_PADRAO = 5.8

/** 26,8% — o default do simulador, e o número que decide a comparação. */
export const CPP_TOTAL_PADRAO = CPP_PATRONAL + CPP_RAT_PADRAO * CPP_FAP_PADRAO + CPP_TERCEIROS_PADRAO

export const CPP_RAT_MIN = 1
export const CPP_RAT_MAX = 3
export const CPP_FAP_MIN = 0.5
export const CPP_FAP_MAX = 2.0
export const CPP_TERCEIROS_MAX = 5.8

// ══════════════════════════════════════════════════════════════════════
// ISS
// ══════════════════════════════════════════════════════════════════════

/** Faixa constitucional do ISS (CF art. 156, §3º, I; LC 116/2003, art. 8º-A). */
export const ISS_MIN = 2
export const ISS_MAX = 5
export const ISS_PADRAO = 5

/**
 * ISS fixo da sociedade uniprofissional (DL 406/1968, art. 9º, §§1º e 3º).
 *
 * Sociedade simples de contadores recolhe um valor fixo por profissional
 * habilitado, e não um percentual do faturamento. Como o valor é definido por
 * lei municipal, ele entra como parâmetro — não há default nacional para
 * inventar. O padrão abaixo é só um ponto de partida visível na tela.
 */
export const ISS_FIXO_POR_PROFISSIONAL_PADRAO = 0

// ══════════════════════════════════════════════════════════════════════
// RETENÇÕES NA FONTE
// ══════════════════════════════════════════════════════════════════════

/**
 * Retenções sobre serviços prestados a pessoa jurídica.
 *
 * - IRRF 1,5% (Lei 7.713/1988, art. 52; RIR/2018, art. 714)
 * - CSRF 4,65% = CSLL 1% + COFINS 3% + PIS 0,65% (Lei 10.833/2003, art. 30)
 *
 * São ANTECIPAÇÃO, compensável com o tributo devido — nunca carga adicional.
 * Aparecem em linha própria porque afetam o fluxo de caixa, e somá-las ao
 * total contaria o mesmo tributo duas vezes.
 */
export const IRRF_SERVICOS = 1.5
export const CSRF_SERVICOS = 4.65

// ══════════════════════════════════════════════════════════════════════
// IVA DUAL — EC 132/2023 e LC 214/2025
// ══════════════════════════════════════════════════════════════════════

/**
 * Alíquotas de referência do regime pleno.
 *
 * CBS 9,3% + IBS 18,7% = 28%, o teto indicado pelo governo. A alíquota final
 * ainda não está fixada em lei e a estimativa oficial varia de 26,5% a 28%,
 * por isso os dois campos seguem editáveis na tela.
 */
export const CBS_REFERENCIA = 9.3
export const IBS_REFERENCIA = 18.7

/**
 * Reduções de alíquota por atividade (LC 214/2025).
 *
 * O valor é a REDUÇÃO em %, aplicada sobre a alíquota de referência:
 * 30 significa pagar 70% da alíquota cheia.
 *
 * Chaveado por classificação de atividade, e não por uma alíquota única
 * chumbada, porque a mesma carteira tem cliente de cada tipo.
 */
export type ClassificacaoIva =
  | 'PADRAO'
  | 'PROFISSAO_REGULAMENTADA'
  | 'SAUDE_EDUCACAO'
  | 'ALIMENTOS_CESTA_BASICA'
  | 'TRANSPORTE_COLETIVO'

export interface ReducaoIva {
  rotulo: string
  /** Redução da alíquota, em %. */
  reducao: number
  /** Dispositivo da LC 214/2025 que a concede. */
  base: string
}

export const REDUCOES_IVA: Record<ClassificacaoIva, ReducaoIva> = {
  PADRAO: {
    rotulo: 'Sem redução',
    reducao: 0,
    base: 'Alíquota de referência',
  },
  PROFISSAO_REGULAMENTADA: {
    // Contabilidade, advocacia, medicina, engenharia, arquitetura e demais
    // profissões de fiscalização por conselho. É a do caso de referência.
    rotulo: 'Profissão regulamentada — redução de 30%',
    reducao: 30,
    base: 'LC 214/2025, art. 127',
  },
  SAUDE_EDUCACAO: {
    rotulo: 'Saúde, educação e dispositivos médicos — redução de 60%',
    reducao: 60,
    base: 'LC 214/2025, arts. 128 a 135',
  },
  ALIMENTOS_CESTA_BASICA: {
    rotulo: 'Cesta básica nacional — alíquota zero',
    reducao: 100,
    base: 'LC 214/2025, art. 143 e Anexo I',
  },
  TRANSPORTE_COLETIVO: {
    rotulo: 'Transporte público coletivo — redução de 100%',
    reducao: 100,
    base: 'LC 214/2025, art. 144',
  },
}

/**
 * Cronograma da transição (EC 132/2023, art. 125 e segs.; LC 214/2025).
 *
 * `cbs` e `ibs` são a FRAÇÃO da alíquota cheia que vale no ano; `antigo` é a
 * fração de ICMS/ISS ainda cobrada. É o que faltava no comparativo: a tela
 * aplicava regime pleno como se já valesse hoje.
 */
export interface AnoCronograma {
  ano: number
  /** Fração (0 a 1) da CBS cheia. */
  cbs: number
  /** Fração (0 a 1) do IBS cheio. */
  ibs: number
  /** Fração (0 a 1) de ICMS/ISS ainda devida. */
  icmsIss: number
  /** PIS/COFINS ainda existem neste ano? */
  pisCofins: boolean
  /** IPI ainda existe neste ano? (zerado em 2027, salvo ZFM) */
  ipi: boolean
  /** O IBS/CBS do ano é compensável com PIS/COFINS (fase-teste)? */
  compensavel: boolean
  nota: string
}

export const CRONOGRAMA: AnoCronograma[] = [
  {
    ano: 2026, cbs: 0.9 / 9.3, ibs: 0.1 / 18.7, icmsIss: 1, pisCofins: true, ipi: true,
    compensavel: true,
    nota: 'Fase-teste: CBS 0,9% e IBS 0,1%, compensáveis com PIS/COFINS',
  },
  {
    ano: 2027, cbs: 1, ibs: 0, icmsIss: 1, pisCofins: false, ipi: false, compensavel: false,
    nota: 'CBS integral; PIS/COFINS extintos; IPI zerado (salvo ZFM)',
  },
  {
    ano: 2028, cbs: 1, ibs: 0, icmsIss: 1, pisCofins: false, ipi: false, compensavel: false,
    nota: 'Mesma composição de 2027',
  },
  { ano: 2029, cbs: 1, ibs: 0.1, icmsIss: 0.9, pisCofins: false, ipi: false, compensavel: false, nota: 'IBS a 1/10 · ICMS/ISS a 9/10' },
  { ano: 2030, cbs: 1, ibs: 0.2, icmsIss: 0.8, pisCofins: false, ipi: false, compensavel: false, nota: 'IBS a 2/10 · ICMS/ISS a 8/10' },
  { ano: 2031, cbs: 1, ibs: 0.3, icmsIss: 0.7, pisCofins: false, ipi: false, compensavel: false, nota: 'IBS a 3/10 · ICMS/ISS a 7/10' },
  { ano: 2032, cbs: 1, ibs: 0.4, icmsIss: 0.6, pisCofins: false, ipi: false, compensavel: false, nota: 'IBS a 4/10 · ICMS/ISS a 6/10' },
  { ano: 2033, cbs: 1, ibs: 1, icmsIss: 0, pisCofins: false, ipi: false, compensavel: false, nota: 'Regime pleno — sistema antigo extinto' },
]

export const ANO_PLENO = 2033
export const ANO_INICIAL = 2026

/** Regime pleno — o degrau final, e o fallback de qualquer ano fora da tabela. */
const REGIME_PLENO: AnoCronograma = {
  ano: ANO_PLENO, cbs: 1, ibs: 1, icmsIss: 0, pisCofins: false, ipi: false,
  compensavel: false, nota: 'Regime pleno — sistema antigo extinto',
}

export function anoCronograma(ano: number): AnoCronograma {
  return CRONOGRAMA.find(a => a.ano === ano) ?? REGIME_PLENO
}

/**
 * Divergência tolerada entre o DAS calculado e o informado, em %.
 *
 * Acima disso a tela alerta: ou o RBT12/anexo está errado, ou a guia tem
 * particularidade que o simulador não conhece (ISS fixo, sublimite, retenção,
 * ICMS-ST). Nos dois casos, apresentar o número sem conferir é o problema.
 */
export const TOLERANCIA_DIVERGENCIA_DAS = 2
