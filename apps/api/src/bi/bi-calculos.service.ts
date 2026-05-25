import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

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

// Categorias DRE — espelham o `dPlano de Contas` + `dMáscara` do PowerBI ref.
// Valores armazenados em `plano_contas_categoria_padrao.categoria_dre` e
// `cliente_bi_categorias.categoria_dre` (override).
type CategoriaDre =
  | 'RECEITA_BRUTA'
  | 'DEDUCOES_IMPOSTOS'
  | 'CUSTO_DAS_VENDAS'
  | 'DESPESAS_VARIAVEIS'
  | 'DESPESAS_OPERACIONAIS'
  | 'RECEITAS_FINANCEIRAS'
  | 'DESPESAS_FINANCEIRAS'
  | 'IR_CS'
  | 'DISTRIBUICAO_LUCROS'

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
  // 1. Receita Bruta — valor natural positivo (Crédito > Débito esperado)
  // ========================================================================

  async calcularReceitaBruta(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    return somarPorCategoriaDre(clienteId, 'RECEITA_BRUTA', periodoInicio, periodoFim, periodosSelecionados)
  }

  // ========================================================================
  // 2. Deduções/Impostos — valor natural negativo (entrega ABS pro card)
  // ========================================================================

  async calcularDeducoes(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    const algebrico = await somarPorCategoriaDre(clienteId, 'DEDUCOES_IMPOSTOS', periodoInicio, periodoFim, periodosSelecionados)
    return Math.abs(algebrico)
  }

  // ========================================================================
  // 3. Custo das Vendas — valor natural negativo, ABS pra card
  // ========================================================================

  async calcularCustoDasVendas(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    contasIgnoradas?: string[],
    periodosSelecionados?: string[],
  ): Promise<number> {
    const algebrico = await somarPorCategoriaDre(clienteId, 'CUSTO_DAS_VENDAS', periodoInicio, periodoFim, periodosSelecionados, contasIgnoradas)
    return Math.abs(algebrico)
  }

  // ========================================================================
  // 3b. Custos Fixos Card — alias de Custo das Vendas (mesma categoria DRE)
  // (mantido pra compatibilidade com o frontend; equivale ao card "Custos Fixos"
  // do PowerBI que filtra dMáscara[Categoria]="CUSTO DAS VENDAS")
  // ========================================================================

  async calcularCustosFixosCard(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    return this.calcularCustoDasVendas(clienteId, periodoInicio, periodoFim, undefined, periodosSelecionados)
  }

  // ========================================================================
  // 4. Despesas Operacionais — valor natural negativo, ABS pra card
  //
  // CORREÇÃO: antes usava SUM(ABS(movimento)) por leaf, o que inflava o total
  // quando havia contas redutoras (estornos com Crédito > Débito, ex:
  // "(-) Crédito COFINS sobre Aluguel"). Agora soma algébrico e ABS no final.
  // ========================================================================

  async calcularDespesasOperacionais(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    contasIgnoradas?: string[],
    periodosSelecionados?: string[],
  ): Promise<number> {
    const algebrico = await somarPorCategoriaDre(clienteId, 'DESPESAS_OPERACIONAIS', periodoInicio, periodoFim, periodosSelecionados, contasIgnoradas)
    return Math.abs(algebrico)
  }

  // ========================================================================
  // 5. Receitas Financeiras — valor natural positivo
  // ========================================================================

  async calcularReceitasFinanceiras(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<number> {
    return somarPorCategoriaDre(clienteId, 'RECEITAS_FINANCEIRAS', periodoInicio, periodoFim)
  }

  // ========================================================================
  // 6. Despesas Financeiras — valor natural negativo, ABS pra card
  // ========================================================================

  async calcularDespesasFinanceiras(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<number> {
    const algebrico = await somarPorCategoriaDre(clienteId, 'DESPESAS_FINANCEIRAS', periodoInicio, periodoFim)
    return Math.abs(algebrico)
  }

  // ========================================================================
  // 7. IR/CS — valor natural negativo, ABS pra card
  // ========================================================================

  async calcularIRCS(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<number> {
    const algebrico = await somarPorCategoriaDre(clienteId, 'IR_CS', periodoInicio, periodoFim)
    return Math.abs(algebrico)
  }

  // ========================================================================
  // 8. Lucro Líquido — soma natural de todas as contas categorizadas no DRE
  //
  // Equivale ao subtotal "RESULTADO LÍQUIDO" da dMáscara do PowerBI:
  // acumula todas as categorias com sinal natural. Funciona porque:
  //   RB(+) + Ded(-) + CV(-) + DespVar(-) + DespOp(-) + RF(+) + DF(-) + IR(-) + DistLucros(-)
  // = Lucro Líquido
  // ========================================================================

  async calcularLucroLiquidoSerpro(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    const p = buildPeriodoClause('l.periodo', periodoInicio, periodoFim, periodosSelecionados, 2)

    const sql = `
      SELECT COALESCE(SUM(l.creditos - l.debitos), 0)::float AS valor
      FROM cliente_bi_linhas l
      LEFT JOIN cliente_bi_categorias cbc
        ON cbc.cliente_id = l.cliente_id AND cbc.conta = l.conta AND cbc.categoria_dre IS NOT NULL
      LEFT JOIN plano_contas_categoria_padrao pccp
        ON pccp.classificacao = l.conta
      WHERE l.cliente_id = $1
        AND ${p.sql}
        AND COALESCE(cbc.categoria_dre, pccp.categoria_dre) IS NOT NULL
    `
    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, ...p.params)
    return toNumber(rows[0]?.valor)
  }

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
    const [
      receitaBruta,
      deducoes,
      custoDasVendas,
      despesasOperacionais,
      receitasFinanceiras,
      despesasFinanceiras,
      irCs,
      lucroLiquido,
    ] = await Promise.all([
      this.calcularReceitaBruta(clienteId, periodoInicio, periodoFim, periodosSelecionados),
      this.calcularDeducoes(clienteId, periodoInicio, periodoFim, periodosSelecionados),
      this.calcularCustoDasVendas(clienteId, periodoInicio, periodoFim, undefined, periodosSelecionados),
      this.calcularDespesasOperacionais(clienteId, periodoInicio, periodoFim, undefined, periodosSelecionados),
      this.calcularReceitasFinanceiras(clienteId, periodoInicio, periodoFim),
      this.calcularDespesasFinanceiras(clienteId, periodoInicio, periodoFim),
      this.calcularIRCS(clienteId, periodoInicio, periodoFim),
      this.calcularLucroLiquidoSerpro(clienteId, periodoInicio, periodoFim, periodosSelecionados),
    ])

    // Todos os valores acima já vêm POSITIVOS (ABS aplicado pra despesas)
    const receitaLiquida = receitaBruta - deducoes
    const lucroBruto = receitaLiquida - custoDasVendas
    const margemBruta = receitaLiquida !== 0 ? (lucroBruto / receitaLiquida) * 100 : 0
    const resultadoFinanceiro = receitasFinanceiras - despesasFinanceiras
    // EBITDA = Receita Líquida - Custo das Vendas - Despesas Operacionais (SEM resultado financeiro)
    const ebitda = lucroBruto - despesasOperacionais
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
