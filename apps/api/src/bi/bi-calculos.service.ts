import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { calcularDre, INDICE, MASCARA_DRE, type CategoriaDre, type SomasPorCategoria } from './mascara-dre'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KpiValor {
  valor: number
}

interface KpiMensal {
  periodo: string
  mes: string
  valor: number
}

export interface ContaNatureza {
  conta: string
  nome_conta: string
  saldo_atual: number
}

export interface KpisCompleto {
  receitaBruta: number
  deducoes: number
  receitaLiquida: number
  custosFixos: number
  custoDasVendas: number
  lucroBruto: number
  margemBruta: number
  despesasOperacionais: number
  receitasFinanceiras: number
  despesasFinanceiras: number
  resultadoFinanceiro: number
  ebitda: number
  margemEbitda: number
  irCs: number
  lucroLiquido: number
  margemLiquida: number
}

// Categorias DRE — fonte única em `mascara-dre.ts`, que também guarda a ORDEM
// e quais linhas são subtotal. Valores armazenados em
// `plano_contas_categoria_padrao.categoria_dre` e
// `cliente_bi_categorias.categoria_dre` (override).

type KpiTipo =
  | 'receita_bruta'
  | 'deducoes'
  | 'custo_das_vendas'
  | 'despesas_operacionais'
  | 'receitas_financeiras'
  | 'despesas_financeiras'
  | 'ir_cs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Conta nivel 4 = exatamente 3 pontos (e.g. 04.2.1.1) */
export function isNivel4(conta: string): boolean {
  return (conta.match(/\./g) || []).length === 3
}

/** Retorna {start, end} para uso em BETWEEN */
function parsePeriodoRange(periodoInicio: string, periodoFim: string) {
  return { start: periodoInicio, end: periodoFim }
}

/** Formata periodo AAAAMM -> "Jan/2025" */
function formatarMes(periodo: string): string {
  const meses = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
  ]
  const ano = periodo.substring(0, 4)
  const mes = parseInt(periodo.substring(4, 6), 10)
  return `${meses[mes - 1]}/${ano}`
}

/** Converte Decimal/bigint retornado pelo Prisma para number */
function toNumber(val: unknown): number {
  if (val === null || val === undefined) return 0
  return Number(val)
}

/** Mapeia KpiTipo -> CategoriaDre */
function kpiTipoToCategoria(tipo: KpiTipo): CategoriaDre {
  switch (tipo) {
    case 'receita_bruta':         return 'RECEITA_BRUTA'
    case 'deducoes':              return 'DEDUCOES_IMPOSTOS'
    case 'custo_das_vendas':      return 'CUSTO_DAS_VENDAS'
    case 'despesas_operacionais': return 'DESPESAS_OPERACIONAIS'
    case 'receitas_financeiras':  return 'RECEITAS_FINANCEIRAS'
    case 'despesas_financeiras':  return 'DESPESAS_FINANCEIRAS'
    case 'ir_cs':                 return 'IR_CS'
  }
}

// ---------------------------------------------------------------------------
// Monta clausula de periodo (BETWEEN ou IN)
// ---------------------------------------------------------------------------

function buildPeriodoClause(
  coluna: string,
  periodoInicio: string,
  periodoFim: string,
  periodosSelecionados: string[] | undefined,
  paramOffset: number,
): { sql: string; params: unknown[]; nextOffset: number } {
  if (periodosSelecionados && periodosSelecionados.length > 0) {
    const placeholders = periodosSelecionados.map((_, i) => `$${paramOffset + i}`).join(', ')
    return {
      sql: `${coluna} IN (${placeholders})`,
      params: [...periodosSelecionados],
      nextOffset: paramOffset + periodosSelecionados.length,
    }
  }
  const { start, end } = parsePeriodoRange(periodoInicio, periodoFim)
  return {
    sql: `${coluna} BETWEEN $${paramOffset} AND $${paramOffset + 1}`,
    params: [start, end],
    nextOffset: paramOffset + 2,
  }
}

// ---------------------------------------------------------------------------
// Núcleo: soma algébrica (Crédito - Débito) por Categoria DRE
//
// Replica o `Realizado Base` do PowerBI:
//   CALCULATE(SUM(fResultados[Crédito]) - SUM(fResultados[Débito]),
//             'dPlano de Contas'[Categoria] <> BLANK())
//
// Resolução da categoria por conta: override do cliente prevalece;
// senão usa o template global (plano_contas_categoria_padrao).
// ---------------------------------------------------------------------------

async function somarPorCategoriaDre(
  clienteId: string,
  categoria: CategoriaDre,
  periodoInicio: string,
  periodoFim: string,
  periodosSelecionados?: string[],
  contasIgnoradas?: string[],
): Promise<number> {
  const p = buildPeriodoClause('l.periodo', periodoInicio, periodoFim, periodosSelecionados, 3)
  let nextOffset = p.nextOffset

  let ignoradasClause = ''
  const extraParams: unknown[] = []
  if (contasIgnoradas && contasIgnoradas.length > 0) {
    const placeholders = contasIgnoradas.map((_, i) => `$${nextOffset + i}`).join(', ')
    ignoradasClause = `AND l.conta NOT IN (${placeholders})`
    extraParams.push(...contasIgnoradas)
    nextOffset += contasIgnoradas.length
  }

  // COALESCE(override do cliente, template global)
  //
  // SOMENTE FOLHAS. Sem este NOT EXISTS, categorizar uma conta sintética que já
  // tem filhas categorizadas soma o mesmo valor duas vezes — e a tela de
  // categorias deixa categorizar qualquer nível, sem validar nem avisar. Até
  // agora o que protegia era acidente: o template global só tem contas de
  // nível 5. O Power BI resolve o mesmo problema por construção — a consulta
  // da `dPlano de Contas` filtra `Comprimento = 13 ou 19`, isto é, só folhas.
  //
  // Folha = conta sem nenhuma outra conta descendente no MESMO período.
  const sql = `
    SELECT COALESCE(SUM(l.creditos - l.debitos), 0)::float AS valor
    FROM cliente_bi_linhas l
    LEFT JOIN cliente_bi_categorias cbc
      ON cbc.cliente_id = l.cliente_id AND cbc.conta = l.conta AND cbc.categoria_dre IS NOT NULL
    LEFT JOIN plano_contas_categoria_padrao pccp
      ON pccp.classificacao = l.conta
    WHERE l.cliente_id = $1
      AND ${p.sql}
      AND COALESCE(cbc.categoria_dre, pccp.categoria_dre) = $2
      AND NOT EXISTS (
        SELECT 1 FROM cliente_bi_linhas f
        WHERE f.cliente_id = l.cliente_id
          AND f.periodo = l.periodo
          AND f.conta LIKE l.conta || '.%'
          AND LENGTH(f.conta) > LENGTH(l.conta)
      )
      ${ignoradasClause}
  `

  const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, categoria, ...p.params, ...extraParams)
  return toNumber(rows[0]?.valor)
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class BiCalculosService {
  // ========================================================================
  // Os NOVE métodos `calcular*` por categoria (Receita Bruta, Deduções,
  // Custo das Vendas, Custos Fixos, Despesas Operacionais, Receitas e
  // Despesas Financeiras, IR/CS e Lucro Líquido) foram REMOVIDOS daqui.
  //
  // Cada um era uma soma por categoria seguida de `Math.abs`, e juntos
  // reimplementavam — com regra própria e sinal próprio — o que a máscara
  // resolve por acumulação em `mascara-dre.ts`. Depois que o
  // `calcularKpisCompleto` passou a usar a máscara, nenhum deles tinha mais
  // chamador: de fora, este serviço só expõe `calcularKpisCompleto`,
  // `obterDadosMensais` e `obterContasPorNatureza`.
  //
  // Deixar os nove de pé não seria inofensivo: manter duas implementações da
  // mesma regra, uma delas com `Math.abs` embutido, é exatamente como este
  // módulo ganhou dois motores de cálculo que não fechavam entre si.
  // ========================================================================

  // ========================================================================
  // 9. KPIs Completo — consolida tudo
  //
  // CORREÇÃO EBITDA: antes era `lucroBruto - despesasOperacionais + resultadoFinanceiro`
  // (somava o resultado financeiro indevidamente). EBITDA por definição não
  // inclui resultado financeiro. Agora segue o PowerBI:
  //   EBITDA = ReceitaBruta + Deduções + CustoDasVendas + DespOp (algébricos)
  //         = ReceitaLiquida - CustoDasVendas - DespOp (com ABS)
  // ========================================================================

  async calcularKpisCompleto(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<KpisCompleto> {
    // Uma soma ALGÉBRICA por categoria da máscara — sinal natural, sem
    // `Math.abs`. É o `Realizado Base` do Power BI, por categoria.
    //
    // As nove vão juntas e TODAS recebem `periodosSelecionados`. Antes,
    // Receitas Financeiras, Despesas Financeiras e IR/CS não recebiam: com
    // filtro de meses ativo, esses três vinham do ano inteiro e se misturavam
    // com KPIs de um trimestre.
    const categorias = MASCARA_DRE
      .filter(l => l.categoria !== null)
      .map(l => l.categoria as CategoriaDre)

    const valores = await Promise.all(
      categorias.map(cat =>
        somarPorCategoriaDre(clienteId, cat, periodoInicio, periodoFim, periodosSelecionados),
      ),
    )
    const somas: SomasPorCategoria = {}
    categorias.forEach((cat, i) => { somas[cat] = valores[i] ?? 0 })

    // A DRE inteira sai daqui: cada subtotal é o acumulado até o índice dele.
    // Aposenta as fórmulas escritas à mão que existiam logo abaixo
    // (`ebitda = lucroBruto - despesasOperacionais` etc.), que além de repetir
    // a regra OMITIAM as Despesas Variáveis — categoria que existe no enum e
    // nunca entrava em conta nenhuma.
    const dre = calcularDre(somas)
    const emIndice = (i: number) => dre.get(i) ?? 0

    const receitaBruta = somas.RECEITA_BRUTA ?? 0
    const receitaLiquida = emIndice(INDICE.RECEITA_LIQUIDA)
    const lucroBruto = emIndice(INDICE.MARGEM_BRUTA)
    const ebitda = emIndice(INDICE.EBITDA)
    const lucroLiquido = emIndice(INDICE.RESULTADO_LIQUIDO)
    const resultadoFinanceiro = (somas.RECEITAS_FINANCEIRAS ?? 0) + (somas.DESPESAS_FINANCEIRAS ?? 0)

    // A tela espera despesa POSITIVA nos cartões (é rótulo, não conta): o
    // módulo entra só na apresentação, nunca na aritmética acima.
    const deducoes = Math.abs(somas.DEDUCOES_IMPOSTOS ?? 0)
    const custoDasVendas = Math.abs(somas.CUSTO_DAS_VENDAS ?? 0)
    const despesasOperacionais = Math.abs(somas.DESPESAS_OPERACIONAIS ?? 0)
    const receitasFinanceiras = somas.RECEITAS_FINANCEIRAS ?? 0
    const despesasFinanceiras = Math.abs(somas.DESPESAS_FINANCEIRAS ?? 0)
    const irCs = Math.abs(somas.IR_CS ?? 0)

    const margemBruta = receitaLiquida !== 0 ? (lucroBruto / receitaLiquida) * 100 : 0
    const margemEbitda = receitaLiquida !== 0 ? (ebitda / receitaLiquida) * 100 : 0
    const margemLiquida = receitaLiquida !== 0 ? (lucroLiquido / receitaLiquida) * 100 : 0

    return {
      receitaBruta,
      deducoes,
      receitaLiquida,
      custosFixos: custoDasVendas, // alias UI
      custoDasVendas,
      lucroBruto,
      margemBruta: Math.round(margemBruta * 100) / 100,
      despesasOperacionais,
      receitasFinanceiras,
      despesasFinanceiras,
      resultadoFinanceiro,
      ebitda,
      margemEbitda: Math.round(margemEbitda * 100) / 100,
      irCs,
      lucroLiquido,
      margemLiquida: Math.round(margemLiquida * 100) / 100,
    }
  }

  // ========================================================================
  // 10. Dados Mensais — série por categoria DRE (gráficos de linha)
  // ========================================================================

  async obterDadosMensais(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    tipo: KpiTipo,
  ): Promise<KpiMensal[]> {
    const { start, end } = parsePeriodoRange(periodoInicio, periodoFim)
    const categoria = kpiTipoToCategoria(tipo)

    // Despesas são apresentadas em ABS no gráfico; receitas em valor natural
    const isReceita = categoria === 'RECEITA_BRUTA' || categoria === 'RECEITAS_FINANCEIRAS'
    const valorExpr = isReceita
      ? 'SUM(l.creditos - l.debitos)'
      : 'ABS(SUM(l.creditos - l.debitos))'

    const sql = `
      SELECT l.periodo, COALESCE(${valorExpr}, 0)::float AS valor
      FROM cliente_bi_linhas l
      LEFT JOIN cliente_bi_categorias cbc
        ON cbc.cliente_id = l.cliente_id AND cbc.conta = l.conta AND cbc.categoria_dre IS NOT NULL
      LEFT JOIN plano_contas_categoria_padrao pccp
        ON pccp.classificacao = l.conta
      WHERE l.cliente_id = $1
        AND l.periodo BETWEEN $2 AND $3
        AND COALESCE(cbc.categoria_dre, pccp.categoria_dre) = $4
      GROUP BY l.periodo
      ORDER BY l.periodo ASC
    `

    type RawRow = { periodo: string; valor: unknown }
    const rows = await prisma.$queryRawUnsafe<RawRow[]>(sql, clienteId, start, end, categoria)

    return rows.map(r => ({
      periodo: r.periodo,
      mes: formatarMes(r.periodo),
      valor: toNumber(r.valor),
    }))
  }

  // ========================================================================
  // 11. Contas por Natureza — leaf accounts de DESPESAS_OPERACIONAIS por saldo
  // ========================================================================

  async obterContasPorNatureza(
    clienteId: string,
    periodoFim: string,
  ): Promise<ContaNatureza[]> {
    const sql = `
      SELECT l.conta, l.nome_conta, l.saldo_atual
      FROM cliente_bi_linhas l
      LEFT JOIN cliente_bi_categorias cbc
        ON cbc.cliente_id = l.cliente_id AND cbc.conta = l.conta AND cbc.categoria_dre IS NOT NULL
      LEFT JOIN plano_contas_categoria_padrao pccp
        ON pccp.classificacao = l.conta
      WHERE l.cliente_id = $1
        AND l.periodo = $2
        AND COALESCE(cbc.categoria_dre, pccp.categoria_dre) = 'DESPESAS_OPERACIONAIS'
      ORDER BY ABS(l.saldo_atual) DESC
      LIMIT 100
    `

    type RawRow = { conta: string; nome_conta: string; saldo_atual: unknown }
    const rows = await prisma.$queryRawUnsafe<RawRow[]>(sql, clienteId, periodoFim)

    return rows.map(r => ({
      conta: r.conta,
      nome_conta: r.nome_conta,
      saldo_atual: toNumber(r.saldo_atual),
    }))
  }
}
