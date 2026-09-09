/**
 * Matemática do simulador da reforma tributária.
 *
 * Funções puras, sem React e sem rede: a tela só monta o que sai daqui. Isso
 * mantém a conta em um lugar só — o comparativo, a transição e a calculadora
 * partem das MESMAS alíquotas, e não de três versões que divergem com o tempo.
 * As alíquotas em si moram em `parametros-fiscais.ts`, cada uma com o
 * dispositivo legal que a criou.
 *
 * O que este módulo NÃO é: a simulação do backend (`reforma-tributaria.service`),
 * que lê os snapshots do ERP, classifica créditos conta a conta e gera parecer.
 * Aquilo continua existindo e é a análise séria. Isto aqui é o simulador
 * pedagógico — o que a pessoa mexe na frente do cliente para mostrar a ordem de
 * grandeza da mudança.
 *
 * ── A regra que organiza o arquivo: ESCOPO ──────────────────────────────
 *
 * Toda coluna do comparativo soma as MESMAS três categorias:
 *
 *   consumo      → PIS/COFINS/ICMS/ISS/IPI  ou  CBS/IBS
 *   renda        → IRPJ + adicional + CSLL
 *   previdência  → CPP (INSS patronal)
 *
 * Comparar colunas com escopos diferentes é a origem do erro que esta tela
 * carregava: Lucro Presumido somava só consumo e era confrontado com o DAS do
 * Simples, que já embute renda e previdência. O Presumido aparecia como o
 * regime mais barato (8,65%) quando custa mais que o dobro do Simples.
 *
 * Componente que não dá para calcular é `null`, nunca zero: zero silencioso
 * some no total e mente; `null` sobe como pendência e a tela mostra o rótulo.
 */

import {
  type Anexo, type AtividadeSimples, type ClassificacaoIva, type FaixaSimples,
  type TributoSimples,
  ANEXOS, ANEXO_COM_CPP_EMBUTIDA, ATIVIDADES_ANEXO_III_POR_LEI, ATIVIDADES_ISS_FIXO,
  ANO_PLENO, anoCronograma,
  CBS_REFERENCIA, IBS_REFERENCIA, REDUCOES_IVA,
  COFINS_CUMULATIVO, COFINS_NAO_CUMULATIVO, PIS_CUMULATIVO, PIS_NAO_CUMULATIVO,
  CPP_FAP_PADRAO, CPP_PATRONAL, CPP_RAT_PADRAO, CPP_TERCEIROS_PADRAO,
  CSLL_ALIQUOTA, IRPJ_ADICIONAL_ALIQUOTA, IRPJ_ADICIONAL_LIMITE_TRIMESTRAL, IRPJ_ALIQUOTA,
  IRRF_SERVICOS, CSRF_SERVICOS,
  ISS_PADRAO, FATOR_R_LIMITE, PRESUNCAO_CSLL, PRESUNCAO_IRPJ,
  SUBLIMITE_ICMS_ISS, TETO_ISS_EFETIVO, TETO_SIMPLES, TOLERANCIA_DIVERGENCIA_DAS,
} from './parametros-fiscais'

export type Regime = 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES'
export type Atividade = 'INDUSTRIA' | 'COMERCIO' | 'SERVICOS'

/** As três categorias que toda coluna precisa ter. */
export type Escopo = 'CONSUMO' | 'RENDA' | 'PREVIDENCIA'

export const ROTULO_ESCOPO: Record<Escopo, string> = {
  CONSUMO: 'Tributos sobre consumo',
  RENDA: 'Tributos sobre a renda',
  PREVIDENCIA: 'Previdência patronal',
}

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
  /** DAS efetivo do Simples, em % do faturamento (valor informado/conferido). */
  das: number

  // ── Ano-base do IVA ──
  /** A qual ano do cronograma a coluna IVA se refere. */
  anoBase: number

  // ── Simples ──
  /** Receita bruta dos últimos 12 meses. Base do DAS. */
  rbt12: number
  /** Anexo, ou 'AUTO' para deduzir da atividade e do Fator R. */
  anexo: Anexo | 'AUTO'
  /** Atividade no recorte da LC 123 — decide anexo, Fator R e ISS fixo. */
  atividadeSimples: AtividadeSimples
  /** DAS efetivamente pago, em R$/mês. Confrontado com o calculado. */
  dasInformado: number

  // ── Folha e CPP ──
  /** Folha de pagamento mensal (salários + pró-labore, base da CPP). */
  folhaMensal: number
  /** RAT — 1% a 3% conforme o grau de risco. */
  cppRat: number
  /** FAP — 0,5 a 2,0, multiplica o RAT. */
  cppFap: number
  /** Terceiros — até 5,8%. */
  cppTerceiros: number

  // ── ISS ──
  /** Sociedade uniprofissional: ISS fixo por profissional, não percentual. */
  issUniprofissional: boolean
  /** Valor mensal do ISS fixo por profissional habilitado. */
  issFixoPorProfissional: number
  /** Quantidade de profissionais habilitados. */
  profissionais: number

  // ── Perfil da carteira ──
  /** % da receita com clientes PJ no regime regular, que se creditam do IVA. */
  percentualClientesPjRegular: number
  /** Classificação da atividade para as reduções da LC 214/2025. */
  classificacaoIva: ClassificacaoIva
}

/**
 * Valores de partida.
 *
 * Mantém CBS 9,3 + IBS 18,7 = 28% (o teto indicado pelo governo) e o ano-base
 * no regime pleno: é a comparação que a pessoa quer ver primeiro — "como fica
 * quando tudo estiver valendo". O seletor de ano existe para o resto.
 */
export const PADRAO: Omit<Parametros, 'regime' | 'atividade' | 'faturamentoMensal' | 'despesasCreditaveis'> = {
  cbs: CBS_REFERENCIA,
  ibs: IBS_REFERENCIA,
  pis: PIS_NAO_CUMULATIVO,
  cofins: COFINS_NAO_CUMULATIVO,
  ipi: 5,
  icms: 18,
  iss: ISS_PADRAO,
  das: 0,
  anoBase: ANO_PLENO,
  rbt12: 0,
  anexo: 'AUTO',
  atividadeSimples: 'OUTROS_SERVICOS',
  dasInformado: 0,
  folhaMensal: 0,
  cppRat: CPP_RAT_PADRAO,
  cppFap: CPP_FAP_PADRAO,
  cppTerceiros: CPP_TERCEIROS_PADRAO,
  issUniprofissional: false,
  issFixoPorProfissional: 0,
  profissionais: 0,
  percentualClientesPjRegular: 0,
  classificacaoIva: 'PADRAO',
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

const pct = (v: number) => v / 100

/** Soma tratando `null` como ausência: um item nulo torna o total nulo. */
function somaOuNulo(valores: Array<number | null>): number | null {
  if (valores.some(v => v === null)) return null
  return valores.reduce<number>((a, v) => a + (v ?? 0), 0)
}

// ══════════════════════════════════════════════════════════════════════
// MODELO DE COLUNA
// ══════════════════════════════════════════════════════════════════════

export interface ItemTributo {
  chave: string
  rotulo: string
  escopo: Escopo
  /** `null` = não calculável. Nunca somado como zero. */
  valor: number | null
  /** Dispositivo legal, para a tela poder mostrar de onde veio. */
  base: string
  /**
   * Faltando este item, a coluna ainda pode ser somada?
   *
   * `true` (padrão) — sem ele o total é `null`. É o caso do IRPJ/CSLL do Lucro
   * Real: são a maior parcela da coluna e não se estimam sem DRE; um total sem
   * eles não seria um total, seria um engano com aparência de número.
   *
   * `false` — o item fica de fora e a coluna sai marcada como PARCIAL. É o caso
   * do ISS fixo municipal: valor pequeno, definido por lei de cada município, e
   * que muitos escritórios sequer recolhem em separado. Anular a coluna atual
   * do cliente por causa dele apagava justamente o número que a pessoa abriu a
   * tela para ver.
   */
  essencial?: boolean
}

export type ColunaChave = 'SIMPLES_DENTRO' | 'SIMPLES_FORA' | 'LUCRO_PRESUMIDO' | 'LUCRO_REAL' | 'IVA'

export interface Coluna {
  chave: ColunaChave
  rotulo: string
  /**
   * Faltou algum componente não-essencial?
   *
   * O total existe, mas é um PISO: o que falta só somaria. A tela precisa dizer
   * isso — um número parcial apresentado como fechado é pior do que um traço.
   */
  parcial: boolean
  /** Frase curta que explica o que a coluna assume. */
  subtitulo: string
  itens: ItemTributo[]
  consumo: number | null
  renda: number | null
  previdencia: number | null
  /** Créditos do IVA (ou do não-cumulativo) já abatidos no total efetivo. */
  creditos: number
  totalNominal: number | null
  totalEfetivo: number | null
  aliquotaEfetiva: number | null
  /**
   * Impacto econômico líquido — só faz sentido no IVA.
   *
   * O IBS/CBS é cobrado POR FORA e o adquirente do regime regular se credita
   * integralmente dele: para esse pedaço da carteira o tributo destacado não é
   * custo, é repasse. Ver `calcularIva`.
   */
  impactoLiquido: number | null
  /**
   * Retenções na fonte — IRRF e CSRF sobre serviços prestados a PJ.
   *
   * ANTECIPAÇÃO compensável, nunca carga: entra em linha separada porque
   * aperta o caixa, e somá-la ao total contaria o mesmo tributo duas vezes.
   */
  retencoes: number
  /** Componentes que não foram calculáveis. Vira rótulo na tela. */
  pendencias: string[]
  notas: string[]
}

function montarColuna(
  chave: ColunaChave,
  rotulo: string,
  subtitulo: string,
  itens: ItemTributo[],
  extras: {
    receita: number
    creditos?: number
    retencoes?: number
    pendencias?: string[]
    notas?: string[]
    impactoLiquido?: number | null
  },
): Coluna {
  // Item não-essencial ausente não entra na soma nem a anula — some do cálculo
  // e reaparece como marca de "parcial" na coluna.
  const ausenteNaoEssencial = itens.some(i => i.valor === null && i.essencial === false)
  const somaveis = itens.filter(i => !(i.valor === null && i.essencial === false))
  const porEscopo = (e: Escopo) => somaOuNulo(somaveis.filter(i => i.escopo === e).map(i => i.valor))
  const consumo = porEscopo('CONSUMO')
  const renda = porEscopo('RENDA')
  const previdencia = porEscopo('PREVIDENCIA')
  const creditos = extras.creditos ?? 0
  const totalNominal = somaOuNulo([consumo, renda, previdencia])
  const totalEfetivo = totalNominal === null ? null : Math.max(0, totalNominal - creditos)
  return {
    chave, rotulo, subtitulo, itens,
    parcial: ausenteNaoEssencial,
    consumo, renda, previdencia, creditos,
    totalNominal, totalEfetivo,
    aliquotaEfetiva: totalEfetivo !== null && extras.receita > 0
      ? (totalEfetivo / extras.receita) * 100
      : null,
    impactoLiquido: extras.impactoLiquido ?? totalEfetivo,
    retencoes: extras.retencoes ?? 0,
    pendencias: extras.pendencias ?? [],
    notas: extras.notas ?? [],
  }
}

// ══════════════════════════════════════════════════════════════════════
// CPP
// ══════════════════════════════════════════════════════════════════════

/** Alíquota total da CPP: patronal + RAT×FAP + terceiros. */
export function aliquotaCpp(p: Pick<Parametros, 'cppRat' | 'cppFap' | 'cppTerceiros'>): number {
  return CPP_PATRONAL + p.cppRat * p.cppFap + p.cppTerceiros
}

/**
 * CPP mensal sobre a folha.
 *
 * Sem folha informada devolve `null` — e não zero. Zero aqui diria "esta
 * empresa não tem empregados", que é uma afirmação, não uma lacuna; e como a
 * CPP costuma ser o maior item fora do Simples, essa afirmação inverte a
 * conclusão do comparativo.
 */
function calcularCpp(p: Parametros): number | null {
  if (p.folhaMensal <= 0) return null
  return p.folhaMensal * pct(aliquotaCpp(p))
}

// ══════════════════════════════════════════════════════════════════════
// SIMPLES NACIONAL
// ══════════════════════════════════════════════════════════════════════

export interface LinhaPartilha {
  tributo: TributoSimples
  /** % do DAS destinado ao tributo, já com teto de ISS aplicado. */
  percentual: number
  /** Alíquota efetiva do tributo sobre a receita, em %. */
  aliquotaEfetiva: number
  valor: number
}

export interface MemoriaDas {
  anexo: Anexo
  /** 1 a 6. */
  faixa: number
  faixaTexto: string
  nominal: number
  deduzir: number
  /** Alíquota efetiva bruta da faixa, antes das exclusões. */
  aliquotaEfetivaBruta: number
  /** Alíquota efetiva do que realmente sai no DAS. */
  aliquotaEfetivaDas: number
  partilha: LinhaPartilha[]
  /** Tributos que NÃO saem no DAS (ISS fixo, sublimite). */
  foraDoDas: TributoSimples[]
  valorMensal: number
  /**
   * O DAS é calculável?
   *
   * Sem RBT12 não há faixa, e sem faixa não há alíquota. Antes isso produzia
   * uma alíquota efetiva de 0% e a coluna do Simples saía com R$ 0,00 em cada
   * linha — o zero silencioso que esta correção existe para eliminar, agora
   * cometido pelo próprio DAS.
   */
  calculavel: boolean
  fatorR: number | null
  /** Anexo determinado por lei (art. 18 §5º-B), imune ao Fator R. */
  anexoPorLei: boolean
  acimaDoSublimite: boolean
  acimaDoTeto: boolean
  avisos: string[]
}

/** Faixa do RBT12 dentro do anexo. Acima do teto, a última faixa. */
function acharFaixa(tabela: FaixaSimples[], rbt12: number): { faixa: FaixaSimples; idx: number } {
  const i = tabela.findIndex(f => rbt12 <= f.ate)
  const idx = i === -1 ? tabela.length - 1 : i
  // A tabela de cada anexo tem sempre 6 faixas; o `??` existe só para o
  // compilador, que não sabe disso.
  return { faixa: tabela[idx] ?? tabela[tabela.length - 1]!, idx }
}

const reaisFaixa = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

/**
 * Fator R — folha ÷ receita, ambos dos últimos 12 meses.
 *
 * Devolve `null` quando não há dados para calcular; a decisão de anexo então
 * não pode ser automática.
 */
export function calcularFatorR(folha12: number, rbt12: number): number | null {
  if (rbt12 <= 0) return null
  return (folha12 / rbt12) * 100
}

/**
 * Anexo aplicável.
 *
 * A ordem importa: a exceção do art. 18, §5º-B vem ANTES do Fator R. Escritório
 * de serviços contábeis é Anexo III por determinação legal, com folha de 1% ou
 * de 90% da receita — testar o Fator R primeiro jogaria a contabilidade enxuta
 * no Anexo V e inflaria a simulação em mais de sete pontos.
 */
export function resolverAnexo(p: Parametros): { anexo: Anexo; porLei: boolean; fatorR: number | null } {
  const fatorR = calcularFatorR(p.folhaMensal * 12, p.rbt12)

  if (p.anexo !== 'AUTO') return { anexo: p.anexo, porLei: false, fatorR }

  if (p.atividade === 'COMERCIO') return { anexo: 'I', porLei: false, fatorR }
  if (p.atividade === 'INDUSTRIA') return { anexo: 'II', porLei: false, fatorR }

  if ((ATIVIDADES_ANEXO_III_POR_LEI as readonly string[]).includes(p.atividadeSimples)) {
    return { anexo: 'III', porLei: true, fatorR }
  }

  // Sujeita ao Fator R: 28% de folha sobe do Anexo V para o III.
  if (fatorR === null) return { anexo: 'V', porLei: false, fatorR }
  return { anexo: fatorR >= FATOR_R_LIMITE ? 'III' : 'V', porLei: false, fatorR }
}

/**
 * DAS mensal com memória de cálculo.
 *
 * O que mudou: o simulador aceitava o valor da guia digitado à mão e o exibia
 * como se fosse a carga do Simples. Agora ele REFAZ a conta pela LC 123/2006 e
 * confronta — se o cliente informou uma alíquota que a tabela não produz, ou o
 * RBT12 está errado, ou a guia tem particularidade que o simulador não conhece.
 * Nos dois casos, apresentar sem conferir é o problema.
 */
export function calcularDas(p: Parametros, opcoes?: { ibsCbsPorFora?: boolean }): MemoriaDas {
  const { anexo, porLei, fatorR } = resolverAnexo(p)
  const tabela = ANEXOS[anexo]
  const { faixa, idx } = acharFaixa(tabela, p.rbt12)
  const avisos: string[] = []

  const calculavel = p.rbt12 > 0
  const aliquotaEfetivaBruta = calculavel
    ? ((p.rbt12 * pct(faixa.nominal) - faixa.deduzir) / p.rbt12) * 100
    : 0

  // ── Teto do ISS (art. 18, §16) ────────────────────────────────────────
  // Passando de 5% efetivos, o excesso é redistribuído proporcionalmente
  // entre os demais tributos: o total do DAS não muda, a partilha sim.
  const partilhaAjustada: Partial<Record<TributoSimples, number>> = { ...faixa.partilha }
  const issShare = partilhaAjustada.ISS ?? 0
  if (issShare > 0 && aliquotaEfetivaBruta > 0) {
    const issEfetivo = aliquotaEfetivaBruta * pct(issShare)
    if (issEfetivo > TETO_ISS_EFETIVO) {
      const novaShare = (TETO_ISS_EFETIVO / aliquotaEfetivaBruta) * 100
      const excedente = issShare - novaShare
      const outros = (Object.keys(partilhaAjustada) as TributoSimples[]).filter(t => t !== 'ISS')
      const somaOutros = outros.reduce((a, t) => a + (partilhaAjustada[t] ?? 0), 0)
      partilhaAjustada.ISS = novaShare
      for (const t of outros) {
        partilhaAjustada[t] = (partilhaAjustada[t] ?? 0) + excedente * ((partilhaAjustada[t] ?? 0) / somaOutros)
      }
      avisos.push(`ISS excedeu 5% efetivos: ${(issEfetivo).toFixed(2)}% redistribuídos na partilha (art. 18, §16).`)
    }
  }

  // ── O que NÃO sai no DAS ──────────────────────────────────────────────
  const foraDoDas: TributoSimples[] = []

  // ISS em valor fixo ao município (art. 18, §22-A) — escritório contábil.
  const issFixo = ATIVIDADES_ISS_FIXO.includes(p.atividadeSimples) || p.issUniprofissional
  if (issFixo && partilhaAjustada.ISS) {
    foraDoDas.push('ISS')
    avisos.push('ISS recolhido em valor fixo ao município e excluído do DAS (art. 18, §22-A).')
  }

  // Sublimite estadual: acima dele, ICMS e ISS saem do DAS (arts. 19 e 20).
  const acimaDoSublimite = p.rbt12 > SUBLIMITE_ICMS_ISS
  if (acimaDoSublimite) {
    for (const t of ['ICMS', 'ISS'] as TributoSimples[]) {
      if (partilhaAjustada[t] && !foraDoDas.includes(t)) foraDoDas.push(t)
    }
    avisos.push(`RBT12 acima do sublimite de R$ ${reaisFaixa(SUBLIMITE_ICMS_ISS)}: ICMS/ISS recolhidos fora do DAS (arts. 19 e 20).`)
  }

  // Art. 41 da LC 214/2025 — opção pelo IBS/CBS no regime regular: os tributos
  // substituídos saem do DAS e passam a ser recolhidos por fora.
  if (opcoes?.ibsCbsPorFora) {
    for (const t of ['PIS', 'COFINS', 'ICMS', 'ISS', 'IPI'] as TributoSimples[]) {
      if (partilhaAjustada[t] && !foraDoDas.includes(t)) foraDoDas.push(t)
    }
  }

  const acimaDoTeto = p.rbt12 > TETO_SIMPLES
  if (acimaDoTeto) {
    avisos.push(`RBT12 acima do teto de R$ ${reaisFaixa(TETO_SIMPLES)}: a empresa está fora do Simples.`)
  }

  const shareNoDas = (Object.keys(partilhaAjustada) as TributoSimples[])
    .filter(t => !foraDoDas.includes(t))
    .reduce((a, t) => a + (partilhaAjustada[t] ?? 0), 0)

  const aliquotaEfetivaDas = aliquotaEfetivaBruta * pct(shareNoDas)
  const valorMensal = p.faturamentoMensal * pct(aliquotaEfetivaDas)

  const partilha: LinhaPartilha[] = (Object.keys(partilhaAjustada) as TributoSimples[])
    .filter(t => (partilhaAjustada[t] ?? 0) > 0)
    .map(t => {
      const percentual = partilhaAjustada[t] ?? 0
      const dentro = !foraDoDas.includes(t)
      const aliq = dentro ? aliquotaEfetivaBruta * pct(percentual) : 0
      return {
        tributo: t,
        percentual,
        aliquotaEfetiva: aliq,
        valor: p.faturamentoMensal * pct(aliq),
      }
    })

  const piso = idx === 0 ? 0 : (tabela[idx - 1]?.ate ?? 0)
  return {
    anexo, faixa: idx + 1,
    faixaTexto: `${idx + 1}ª faixa — de R$ ${reaisFaixa(piso)} a R$ ${reaisFaixa(faixa.ate)}`,
    nominal: faixa.nominal, deduzir: faixa.deduzir,
    aliquotaEfetivaBruta, aliquotaEfetivaDas,
    partilha, foraDoDas, valorMensal, calculavel,
    fatorR, anexoPorLei: porLei,
    acimaDoSublimite, acimaDoTeto, avisos,
  }
}

export interface DivergenciaDas {
  informado: number
  calculado: number
  /** Diferença relativa, em %. */
  diferencaPct: number
  alerta: boolean
}

/** Confronta o DAS informado com o recalculado. */
export function conferirDas(informado: number, calculado: number): DivergenciaDas | null {
  if (informado <= 0 || calculado <= 0) return null
  const diferencaPct = ((informado - calculado) / calculado) * 100
  return {
    informado, calculado, diferencaPct,
    alerta: Math.abs(diferencaPct) > TOLERANCIA_DIVERGENCIA_DAS,
  }
}

/** Escopo de cada tributo da partilha do DAS. */
const ESCOPO_TRIBUTO: Record<TributoSimples, Escopo> = {
  IRPJ: 'RENDA', CSLL: 'RENDA',
  PIS: 'CONSUMO', COFINS: 'CONSUMO', ICMS: 'CONSUMO', IPI: 'CONSUMO', ISS: 'CONSUMO',
  CPP: 'PREVIDENCIA',
}

/**
 * Coluna do Simples.
 *
 * `ibsCbsPorFora` implementa as duas alternativas do art. 41 da LC 214/2025:
 *
 *  - `false` — IBS/CBS DENTRO do DAS. Carga menor, mas o adquirente só recebe
 *    crédito limitado ao que foi efetivamente recolhido na guia.
 *  - `true` — IBS/CBS recolhidos POR FORA, no regime regular. Carga maior, e o
 *    adquirente recebe crédito integral. Para carteira B2B costuma valer.
 *
 * Não há migração compulsória: o Simples permanece depois da reforma, e as duas
 * colunas existem para que a escolha apareça.
 */
export function calcularSimples(p: Parametros, ibsCbsPorFora: boolean): { coluna: Coluna; memoria: MemoriaDas } {
  const memoria = calcularDas(p, { ibsCbsPorFora })
  const receita = p.faturamentoMensal
  const itens: ItemTributo[] = []
  const notas: string[] = []
  const pendencias: string[] = []

  if (!memoria.calculavel) {
    pendencias.push('DAS: informe o RBT12 (receita bruta dos últimos 12 meses).')
  }

  for (const linha of memoria.partilha) {
    if (memoria.foraDoDas.includes(linha.tributo)) continue
    itens.push({
      chave: `das_${linha.tributo}`,
      rotulo: `${linha.tributo} (no DAS)`,
      escopo: ESCOPO_TRIBUTO[linha.tributo],
      // Sem RBT12 o valor não é zero, é desconhecido.
      valor: memoria.calculavel ? linha.valor : null,
      base: `LC 123/2006, Anexo ${memoria.anexo}, ${memoria.faixa}ª faixa`,
    })
  }

  // ISS fixo por fora: sociedade uniprofissional ou escritório contábil.
  // Na opção do art. 41 o ISS já foi substituído pelo IBS/CBS, então não entra.
  if (memoria.foraDoDas.includes('ISS') && !ibsCbsPorFora) {
    const fixo = p.issUniprofissional || ATIVIDADES_ISS_FIXO.includes(p.atividadeSimples)
    if (fixo && p.issFixoPorProfissional > 0 && p.profissionais > 0) {
      itens.push({
        chave: 'iss_fixo',
        rotulo: 'ISS fixo (por profissional)',
        escopo: 'CONSUMO',
        valor: p.issFixoPorProfissional * p.profissionais,
        base: 'DL 406/1968, art. 9º, §§1º e 3º · LC 123/2006, art. 18, §22-A',
      })
    } else if (fixo) {
      itens.push({
        chave: 'iss_fixo',
        rotulo: 'ISS fixo (por profissional)',
        escopo: 'CONSUMO',
        valor: null,
        base: 'DL 406/1968, art. 9º, §§1º e 3º',
        // Não bloqueia o total: o DAS é a quase totalidade da carga do Simples,
        // e o ISS fixo é um valor municipal pequeno que nem todo escritório
        // recolhe em separado. A coluna sai marcada como parcial.
        essencial: false,
      })
      pendencias.push('ISS fixo municipal não informado — a coluna não o inclui.')
    } else {
      // Fora do DAS por sublimite: volta pelo regime normal, percentual.
      itens.push({
        chave: 'iss_normal',
        rotulo: 'ISS (fora do DAS)',
        escopo: 'CONSUMO',
        valor: receita * pct(p.iss),
        base: 'LC 116/2003 · LC 123/2006, arts. 19 e 20',
      })
    }
  }

  if (memoria.foraDoDas.includes('ICMS') && !ibsCbsPorFora) {
    itens.push({
      chave: 'icms_normal',
      rotulo: 'ICMS (fora do DAS)',
      escopo: 'CONSUMO',
      valor: receita * pct(p.icms),
      base: 'LC 123/2006, arts. 19 e 20',
    })
  }

  // CPP por fora: Anexo IV não embute, e a opção do art. 41 não muda isso.
  if (!ANEXO_COM_CPP_EMBUTIDA[memoria.anexo]) {
    const cpp = calcularCpp(p)
    itens.push({
      chave: 'cpp',
      rotulo: 'CPP (por fora)',
      escopo: 'PREVIDENCIA',
      valor: cpp,
      base: 'Lei 8.212/1991, art. 22 — Anexo IV não embute CPP',
    })
    if (cpp === null) pendencias.push('CPP: informe a folha de pagamento mensal.')
    notas.push('O Anexo IV não embute a CPP: o INSS patronal é recolhido por fora.')
  }

  let impactoLiquido: number | null = null
  if (ibsCbsPorFora) {
    const iva = valorIva(p)
    itens.push({
      chave: 'ibs_cbs',
      rotulo: 'IBS + CBS (regime regular)',
      escopo: 'CONSUMO',
      valor: iva.total,
      base: 'LC 214/2025, art. 41 — opção pelo regime regular',
    })
    notas.push('Transfere crédito INTEGRAL de IBS/CBS ao adquirente.')
    impactoLiquido = null
  } else {
    notas.push('Crédito transferido ao adquirente limitado ao valor efetivamente recolhido no DAS (LC 214/2025, art. 41).')
  }

  // Optante do Simples não sofre retenção de IRRF/CSRF sobre os serviços
  // prestados (LC 123/2006, art. 13, §1º; IN RFB 459/2004, art. 3º, II).
  const coluna = montarColuna(
    ibsCbsPorFora ? 'SIMPLES_FORA' : 'SIMPLES_DENTRO',
    ibsCbsPorFora ? 'Simples · IBS/CBS por fora' : 'Simples Nacional',
    ibsCbsPorFora
      ? `Anexo ${memoria.anexo} com IBS/CBS no regime regular`
      : `Anexo ${memoria.anexo}, ${memoria.faixa}ª faixa`,
    itens,
    { receita, retencoes: 0, pendencias, notas, impactoLiquido: undefined },
  )
  if (impactoLiquido !== null) coluna.impactoLiquido = impactoLiquido
  return { coluna, memoria }
}

// ══════════════════════════════════════════════════════════════════════
// LUCRO PRESUMIDO
// ══════════════════════════════════════════════════════════════════════

const chaveAtividade = (a: Atividade) => (a === 'SERVICOS' ? 'SERVICOS' : a === 'COMERCIO' ? 'COMERCIO' : 'INDUSTRIA')

/**
 * Adicional de IRPJ — apuração TRIMESTRAL.
 *
 * O limite de R$ 60.000 é do trimestre (R$ 20.000 por mês do período), não de
 * cada mês. Calculamos o trimestre inteiro e dividimos por 3 só para exibir
 * mensalmente. Aplicar R$ 20.000 mês a mês dá o mesmo número quando a receita é
 * constante e erra — sempre para menos — em qualquer sazonalidade.
 */
export function adicionalIrpjMensal(baseMensal: number): number {
  const baseTrimestral = baseMensal * 3
  const excedente = Math.max(0, baseTrimestral - IRPJ_ADICIONAL_LIMITE_TRIMESTRAL)
  return (excedente * pct(IRPJ_ADICIONAL_ALIQUOTA)) / 3
}

export function calcularPresumido(p: Parametros): Coluna {
  const receita = p.faturamentoMensal
  const servico = ehServico(p.atividade)
  const chave = chaveAtividade(p.atividade)

  const baseIrpj = receita * pct(PRESUNCAO_IRPJ[chave])
  const baseCsll = receita * pct(PRESUNCAO_CSLL[chave])
  const cpp = calcularCpp(p)
  const pendencias: string[] = []
  if (cpp === null) pendencias.push('CPP: informe a folha de pagamento mensal.')

  const itens: ItemTributo[] = [
    {
      chave: 'irpj', rotulo: `IRPJ ${IRPJ_ALIQUOTA}%`, escopo: 'RENDA',
      valor: baseIrpj * pct(IRPJ_ALIQUOTA),
      base: `Lei 9.249/1995, arts. 3º e 15 — presunção de ${PRESUNCAO_IRPJ[chave]}%`,
    },
    {
      chave: 'irpj_adicional', rotulo: `Adicional de IRPJ ${IRPJ_ADICIONAL_ALIQUOTA}%`, escopo: 'RENDA',
      valor: adicionalIrpjMensal(baseIrpj),
      base: 'Lei 9.249/1995, art. 3º, §1º — R$ 60.000 por trimestre',
    },
    {
      chave: 'csll', rotulo: `CSLL ${CSLL_ALIQUOTA}%`, escopo: 'RENDA',
      valor: baseCsll * pct(CSLL_ALIQUOTA),
      base: `Lei 7.689/1988, art. 3º — presunção de ${PRESUNCAO_CSLL[chave]}%`,
    },
    {
      chave: 'pis', rotulo: `PIS ${PIS_CUMULATIVO}%`, escopo: 'CONSUMO',
      valor: receita * pct(PIS_CUMULATIVO),
      base: 'Lei 9.718/1998 — regime cumulativo',
    },
    {
      chave: 'cofins', rotulo: `COFINS ${COFINS_CUMULATIVO}%`, escopo: 'CONSUMO',
      valor: receita * pct(COFINS_CUMULATIVO),
      base: 'Lei 9.718/1998 — regime cumulativo',
    },
  ]

  if (servico) {
    itens.push({
      chave: 'iss', rotulo: `ISS ${p.iss}%`, escopo: 'CONSUMO',
      valor: receita * pct(p.iss),
      base: 'LC 116/2003, art. 8º-A — 2% a 5% conforme o município',
    })
  } else {
    itens.push({
      chave: 'icms', rotulo: `ICMS ${p.icms}%`, escopo: 'CONSUMO',
      valor: receita * pct(p.icms), base: 'LC 87/1996 · legislação estadual',
    })
    if (temIpi(p.atividade)) {
      itens.push({
        chave: 'ipi', rotulo: `IPI ${p.ipi}%`, escopo: 'CONSUMO',
        valor: receita * pct(p.ipi), base: 'TIPI — Decreto 11.158/2022',
      })
    }
  }

  itens.push({
    chave: 'cpp', rotulo: `CPP ${aliquotaCpp(p).toFixed(1)}% s/ folha`, escopo: 'PREVIDENCIA',
    valor: cpp,
    base: 'Lei 8.212/1991, art. 22 — patronal 20% + RAT×FAP + terceiros',
  })

  // Cumulativo não credita PIS/COFINS; no comércio, o ICMS da entrada credita.
  const creditos = servico ? 0 : p.despesasCreditaveis * pct(p.icms)

  return montarColuna(
    'LUCRO_PRESUMIDO', 'Lucro Presumido',
    `Presunção de ${PRESUNCAO_IRPJ[chave]}% (IRPJ) e ${PRESUNCAO_CSLL[chave]}% (CSLL)`,
    itens,
    {
      receita, creditos, pendencias,
      retencoes: servico ? receita * pct(IRRF_SERVICOS + CSRF_SERVICOS) * pct(p.percentualClientesPjRegular) : 0,
    },
  )
}

// ══════════════════════════════════════════════════════════════════════
// LUCRO REAL
// ══════════════════════════════════════════════════════════════════════

/**
 * Coluna do Lucro Real.
 *
 * IRPJ e CSLL incidem sobre o LUCRO apurado, com adições e exclusões — não
 * sobre presunção. Sem DRE não há como estimar isso, e um número inventado
 * aqui é pior do que a ausência dele: a coluna pareceria comparável.
 *
 * Por isso a renda sai `null` com pendência declarada. O consumo e a CPP são
 * calculáveis e aparecem; o total, não.
 */
export function calcularReal(p: Parametros): Coluna {
  const receita = p.faturamentoMensal
  const servico = ehServico(p.atividade)
  const cpp = calcularCpp(p)

  const itens: ItemTributo[] = [
    {
      chave: 'pis', rotulo: `PIS ${p.pis}%`, escopo: 'CONSUMO',
      valor: receita * pct(p.pis), base: 'Lei 10.637/2002 — não-cumulativo',
    },
    {
      chave: 'cofins', rotulo: `COFINS ${p.cofins}%`, escopo: 'CONSUMO',
      valor: receita * pct(p.cofins), base: 'Lei 10.833/2003 — não-cumulativo',
    },
  ]

  if (servico) {
    itens.push({
      chave: 'iss', rotulo: `ISS ${p.iss}%`, escopo: 'CONSUMO',
      valor: receita * pct(p.iss), base: 'LC 116/2003, art. 8º-A',
    })
  } else {
    itens.push({
      chave: 'icms', rotulo: `ICMS ${p.icms}%`, escopo: 'CONSUMO',
      valor: receita * pct(p.icms), base: 'LC 87/1996',
    })
    if (temIpi(p.atividade)) {
      itens.push({
        chave: 'ipi', rotulo: `IPI ${p.ipi}%`, escopo: 'CONSUMO',
        valor: receita * pct(p.ipi), base: 'TIPI — Decreto 11.158/2022',
      })
    }
  }

  // Essenciais: sem eles não há total do Lucro Real que signifique alguma coisa.
  itens.push({
    chave: 'irpj', rotulo: 'IRPJ 15% + adicional 10%', escopo: 'RENDA',
    valor: null, base: 'Lei 9.430/1996 — sobre o lucro real ajustado', essencial: true,
  })
  itens.push({
    chave: 'csll', rotulo: 'CSLL 9%', escopo: 'RENDA',
    valor: null, base: 'Lei 7.689/1988 — sobre a base ajustada', essencial: true,
  })
  itens.push({
    chave: 'cpp', rotulo: `CPP ${aliquotaCpp(p).toFixed(1)}% s/ folha`, escopo: 'PREVIDENCIA',
    valor: cpp, base: 'Lei 8.212/1991, art. 22',
  })

  const pendencias = ['IRPJ e CSLL exigem DRE: lucro contábil, adições e exclusões do período.']
  if (cpp === null) pendencias.push('CPP: informe a folha de pagamento mensal.')

  const creditos = p.despesasCreditaveis * pct(p.pis + p.cofins)
    + (servico ? 0 : p.despesasCreditaveis * pct(p.icms))

  return montarColuna(
    'LUCRO_REAL', 'Lucro Real', 'Requer DRE — renda não estimável',
    itens,
    {
      receita, creditos, pendencias,
      retencoes: servico ? receita * pct(IRRF_SERVICOS + CSRF_SERVICOS) * pct(p.percentualClientesPjRegular) : 0,
      notas: ['A coluna não fecha total: IRPJ e CSLL do Lucro Real não são modeláveis sem a DRE do período.'],
    },
  )
}

// ══════════════════════════════════════════════════════════════════════
// IVA DUAL
// ══════════════════════════════════════════════════════════════════════

export interface ValorIva {
  /** Alíquota da CBS no ano-base, já reduzida. */
  aliquotaCbs: number
  /** Alíquota do IBS no ano-base, já reduzida. */
  aliquotaIbs: number
  aliquotaTotal: number
  cbs: number
  ibs: number
  total: number
  /** Redução aplicada, em %. */
  reducao: number
  reducaoRotulo: string
  reducaoBase: string
  compensavel: boolean
  notaAno: string
}

/**
 * IBS e CBS no ano-base, com a redução da atividade.
 *
 * Duas correções em relação ao que a tela fazia:
 *
 *  1. A alíquota é função do ANO. O cronograma da EC 132/2023 só chega ao
 *     regime pleno em 2033; até lá o IVA convive com o sistema antigo. Aplicar
 *     28% como se já valessem hoje superestima a carga em qualquer ano.
 *  2. A redução do art. 127 da LC 214/2025 existe. Profissão regulamentada —
 *     contabilidade entre elas — paga 70% da alíquota: 19,6% e não 28%.
 */
export function valorIva(p: Parametros): ValorIva {
  const crono = anoCronograma(p.anoBase)
  const red = REDUCOES_IVA[p.classificacaoIva]
  const fator = 1 - pct(red.reducao)

  const aliquotaCbs = p.cbs * crono.cbs * fator
  const aliquotaIbs = p.ibs * crono.ibs * fator
  const receita = p.faturamentoMensal

  return {
    aliquotaCbs, aliquotaIbs,
    aliquotaTotal: aliquotaCbs + aliquotaIbs,
    cbs: receita * pct(aliquotaCbs),
    ibs: receita * pct(aliquotaIbs),
    total: receita * pct(aliquotaCbs + aliquotaIbs),
    reducao: red.reducao,
    reducaoRotulo: red.rotulo,
    reducaoBase: red.base,
    compensavel: crono.compensavel,
    notaAno: crono.nota,
  }
}

/**
 * Coluna do IVA.
 *
 * Escopo completo: consumo pelo IBS/CBS do ano-base, renda pela presunção do
 * Lucro Presumido e previdência pela CPP. IRPJ, CSLL e CPP não acabam com a
 * reforma — ela substitui PIS, COFINS, ICMS, ISS e IPI. Somar só CBS + IBS e
 * confrontar com o DAS repete exatamente o erro de escopo que motivou esta
 * correção.
 *
 * Em ano de transição o sistema antigo ainda cobra a sua parte, e ela entra
 * aqui — senão 2029 pareceria mais barato que 2033.
 *
 * O `impactoLiquido` responde à outra metade: o IBS/CBS é cobrado POR FORA e o
 * adquirente no regime regular se credita integralmente dele. Para a fatia da
 * carteira que se credita, o tributo destacado não é custo da empresa, é
 * repasse. É um modelo simples — supõe que o preço líquido se mantém — mas
 * separa o que é recolhimento do que é ônus econômico.
 */
export function calcularIva(p: Parametros): Coluna {
  const receita = p.faturamentoMensal
  const crono = anoCronograma(p.anoBase)
  const iva = valorIva(p)
  const servico = ehServico(p.atividade)
  const chave = chaveAtividade(p.atividade)

  const itens: ItemTributo[] = [
    {
      chave: 'cbs', rotulo: `CBS ${iva.aliquotaCbs.toFixed(2)}%`, escopo: 'CONSUMO',
      valor: iva.cbs, base: 'EC 132/2023 · LC 214/2025',
    },
    {
      chave: 'ibs', rotulo: `IBS ${iva.aliquotaIbs.toFixed(2)}%`, escopo: 'CONSUMO',
      valor: iva.ibs, base: 'EC 132/2023 · LC 214/2025',
    },
  ]

  // Resíduo do sistema antigo no ano-base.
  if (crono.pisCofins) {
    itens.push({
      chave: 'pis_cofins_residual', rotulo: 'PIS + COFINS (ainda vigentes)', escopo: 'CONSUMO',
      valor: receita * pct(p.pis + p.cofins), base: 'Extintos a partir de 2027',
    })
  }
  if (crono.icmsIss > 0) {
    itens.push({
      chave: 'icms_iss_residual',
      rotulo: `${servico ? 'ISS' : 'ICMS'} a ${Math.round(crono.icmsIss * 10)}/10`,
      escopo: 'CONSUMO',
      valor: receita * pct(servico ? p.iss : p.icms) * crono.icmsIss,
      base: 'EC 132/2023, art. 128 — redução escalonada',
    })
  }

  const baseIrpj = receita * pct(PRESUNCAO_IRPJ[chave])
  const baseCsll = receita * pct(PRESUNCAO_CSLL[chave])
  const cpp = calcularCpp(p)
  const pendencias: string[] = []
  if (cpp === null) pendencias.push('CPP: informe a folha de pagamento mensal.')

  itens.push(
    {
      chave: 'irpj', rotulo: `IRPJ ${IRPJ_ALIQUOTA}%`, escopo: 'RENDA',
      valor: baseIrpj * pct(IRPJ_ALIQUOTA), base: 'Lei 9.249/1995 — mantido pela reforma',
    },
    {
      chave: 'irpj_adicional', rotulo: `Adicional de IRPJ ${IRPJ_ADICIONAL_ALIQUOTA}%`, escopo: 'RENDA',
      valor: adicionalIrpjMensal(baseIrpj), base: 'Lei 9.249/1995, art. 3º, §1º',
    },
    {
      chave: 'csll', rotulo: `CSLL ${CSLL_ALIQUOTA}%`, escopo: 'RENDA',
      valor: baseCsll * pct(CSLL_ALIQUOTA), base: 'Lei 7.689/1988 — mantida pela reforma',
    },
    {
      chave: 'cpp', rotulo: `CPP ${aliquotaCpp(p).toFixed(1)}% s/ folha`, escopo: 'PREVIDENCIA',
      valor: cpp, base: 'Lei 8.212/1991 — mantida pela reforma',
    },
  )

  // No IVA o crédito é amplo: tudo que a empresa compra e que foi tributado
  // volta. É a diferença estrutural em relação ao sistema atual.
  const creditos = p.despesasCreditaveis * pct(iva.aliquotaTotal)

  const notas = [
    `Ano-base ${p.anoBase} — ${iva.notaAno}.`,
    `Renda e previdência pela regra do Lucro Presumido: a reforma substitui PIS, COFINS, ICMS, ISS e IPI, e não IRPJ, CSLL ou CPP.`,
  ]
  if (iva.reducao > 0) notas.push(`${iva.reducaoRotulo} (${iva.reducaoBase}).`)
  if (iva.compensavel) notas.push('Na fase-teste o IBS/CBS é compensável com PIS/COFINS: o desembolso adicional tende a zero.')

  const coluna = montarColuna(
    'IVA', 'IVA Dual · CBS + IBS',
    iva.reducao > 0 ? `${iva.aliquotaTotal.toFixed(2)}% (redução de ${iva.reducao}%)` : `${iva.aliquotaTotal.toFixed(2)}%`,
    itens,
    {
      receita, creditos, pendencias, notas,
      retencoes: servico ? receita * pct(IRRF_SERVICOS + CSRF_SERVICOS) * pct(p.percentualClientesPjRegular) : 0,
    },
  )

  // Impacto econômico líquido: o IBS/CBS destacado para adquirente que se
  // credita não é ônus da empresa. Só essa parcela é descontada — renda e
  // previdência continuam sendo custo integral.
  if (coluna.totalEfetivo !== null) {
    const creditavelPeloCliente = iva.total * pct(p.percentualClientesPjRegular)
    coluna.impactoLiquido = Math.max(0, coluna.totalEfetivo - creditavelPeloCliente)
  }

  return coluna
}

// ══════════════════════════════════════════════════════════════════════
// COMPARATIVO
// ══════════════════════════════════════════════════════════════════════

export interface Comparativo {
  simplesDentro: Coluna
  simplesFora: Coluna
  presumido: Coluna
  real: Coluna
  iva: Coluna
  /** Na ordem em que a tabela mostra. */
  colunas: Coluna[]
  memoriaDas: MemoriaDas
  divergenciaDas: DivergenciaDas | null
  /**
   * O comparativo é conclusivo?
   *
   * Sem folha informada a CPP não existe em três das cinco colunas, e a CPP é
   * justamente o item que decide a comparação. Melhor dizer que não conclui do
   * que apresentar um ranking que se inverte quando o dado chegar.
   */
  conclusivo: boolean
  motivosNaoConclusivo: string[]
}

export function calcularComparativo(p: Parametros): Comparativo {
  const dentro = calcularSimples(p, false)
  const fora = calcularSimples(p, true)
  const presumido = calcularPresumido(p)
  const real = calcularReal(p)
  const iva = calcularIva(p)

  const motivos: string[] = []
  if (p.folhaMensal <= 0) {
    motivos.push('Folha de pagamento não informada: sem ela a CPP não entra nas colunas fora do Simples, e é ela que costuma decidir a comparação.')
  }
  if (p.rbt12 <= 0) {
    motivos.push('RBT12 não informado: o DAS não pode ser recalculado nem conferido.')
  }

  const divergenciaDas = conferirDas(p.dasInformado, dentro.memoria.valorMensal)

  return {
    simplesDentro: dentro.coluna,
    simplesFora: fora.coluna,
    presumido, real, iva,
    colunas: [dentro.coluna, fora.coluna, presumido, real, iva],
    memoriaDas: dentro.memoria,
    divergenciaDas,
    conclusivo: motivos.length === 0,
    motivosNaoConclusivo: motivos,
  }
}

/** A coluna que representa o regime atual do cliente. */
export function colunaDoRegime(c: Comparativo, regime: Regime): Coluna {
  if (regime === 'SIMPLES') return c.simplesDentro
  if (regime === 'LUCRO_PRESUMIDO') return c.presumido
  return c.real
}

// ══════════════════════════════════════════════════════════════════════
// TRANSIÇÃO 2026–2033
// ══════════════════════════════════════════════════════════════════════

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
 * Agora lê as frações de `CRONOGRAMA` em vez de repetir os degraus aqui — eram
 * duas descrições do mesmo cronograma, e a coluna IVA usava só uma delas.
 *
 * A conta é nominal (sem crédito) de propósito: a tabela mostra o que é
 * recolhido em cada ano, e o crédito depende do perfil de compras, que já
 * aparece no comparativo de regimes. A redução da atividade É aplicada.
 */
export function calcularTransicao(p: Parametros): AnoTransicao[] {
  const anual = p.faturamentoMensal * 12
  const servico = ehServico(p.atividade)
  const comIpi = temIpi(p.atividade)
  const fator = 1 - pct(REDUCOES_IVA[p.classificacaoIva].reducao)

  const pisCofins = anual * pct(p.pis + p.cofins)
  const ipiCheio = comIpi ? anual * pct(p.ipi) : 0
  const icmsIssCheio = servico ? anual * pct(p.iss) : anual * pct(p.icms)
  const cbsCheia = anual * pct(p.cbs) * fator
  const ibsCheia = anual * pct(p.ibs) * fator

  const base2026 = pisCofins + ipiCheio + icmsIssCheio

  return anoCronogramaTodos().map(c => {
    const antigo = (c.pisCofins ? pisCofins : 0) + (c.ipi ? ipiCheio : 0) + icmsIssCheio * c.icmsIss
    // Na fase-teste o IBS/CBS é compensável com PIS/COFINS: não há desembolso
    // adicional, e somá-lo faria 2026 parecer mais caro do que é.
    const cbs = c.compensavel ? 0 : cbsCheia * c.cbs
    const ibs = c.compensavel ? 0 : ibsCheia * c.ibs
    const total = antigo + cbs + ibs
    return {
      ano: c.ano, sistemaAntigo: antigo, ibs, cbs, total,
      vsHoje: base2026 > 0 ? ((total - base2026) / base2026) * 100 : 0,
      nota: c.nota,
    }
  })
}

function anoCronogramaTodos() {
  const anos: number[] = []
  for (let a = 2026; a <= 2033; a++) anos.push(a)
  return anos.map(anoCronograma)
}

// ══════════════════════════════════════════════════════════════════════
// CALCULADORA DE OPERAÇÃO
// ══════════════════════════════════════════════════════════════════════

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

/**
 * Uma operação avulsa: quanto de IBS/CBS ela gera e quanto sobra a recolher.
 *
 * Usa as alíquotas do ano-base, como o resto da tela. O `totalNota` mostra a
 * natureza POR FORA do IVA: o tributo é somado ao valor da operação, e não
 * embutido nele como PIS/COFINS/ISS são hoje.
 */
export function calcularOperacao(p: Parametros, op: Operacao): ResultadoOperacao {
  const crono = anoCronograma(p.anoBase)
  const fator = 1 - pct(op.reducao)
  const debitoCbs = op.valor * pct(p.cbs * crono.cbs) * fator
  const debitoIbs = op.valor * pct(p.ibs * crono.ibs) * fator
  const destacado = debitoCbs + debitoIbs
  const credito = op.valor * pct(op.despesasCreditaveis) * pct(p.cbs * crono.cbs + p.ibs * crono.ibs) * fator
  const aRecolher = Math.max(0, destacado - credito)
  return {
    debitoCbs, debitoIbs, credito, aRecolher,
    aliquotaEfetiva: op.valor > 0 ? (aRecolher / op.valor) * 100 : 0,
    destacado,
    totalNota: op.valor + destacado,
  }
}

// ══════════════════════════════════════════════════════════════════════
// FORMATAÇÃO
// ══════════════════════════════════════════════════════════════════════

/** "R$ 1.500.000,00" */
export const reais = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "28,00%" */
export const porcento = (v: number, casas = 2) =>
  `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`

/** "R$ 5.805k" — para eixo de gráfico, onde o valor cheio não cabe. */
export const reaisCurto = (v: number) =>
  `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`

/** Valor que pode não existir. Mantém o "—" fora dos componentes. */
export const reaisOuTraco = (v: number | null) => (v === null ? '—' : reais(v))
export const porcentoOuTraco = (v: number | null, casas = 2) => (v === null ? '—' : porcento(v, casas))
