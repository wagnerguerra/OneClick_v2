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
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class BiCalculosService {
  // ========================================================================
  // 1. Receita Bruta — SUM(movimento) para contas 03.1.1 / 3.1.1
  // ========================================================================

  async calcularReceitaBruta(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    const p = buildPeriodoClause('periodo', periodoInicio, periodoFim, periodosSelecionados, 2)

    const sql = `
      SELECT COALESCE(SUM(movimento), 0) AS valor
      FROM cliente_bi_linhas
      WHERE cliente_id = $1
        AND ${p.sql}
        AND conta IN ('03.1.1', '3.1.1')
    `

    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, ...p.params)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 2. Deducoes — SUM(ABS(movimento)) para contas 03.1.3 / 3.1.3
  // ========================================================================

  async calcularDeducoes(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    const p = buildPeriodoClause('periodo', periodoInicio, periodoFim, periodosSelecionados, 2)

    const sql = `
      SELECT COALESCE(SUM(ABS(movimento)), 0) AS valor
      FROM cliente_bi_linhas
      WHERE cliente_id = $1
        AND ${p.sql}
        AND conta IN ('03.1.3', '3.1.3')
    `

    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, ...p.params)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 3. Custo das Vendas — SUM(movimento) para contas 04.1.% (leaf nodes)
  // ========================================================================

  async calcularCustoDasVendas(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    contasIgnoradas?: string[],
    periodosSelecionados?: string[],
  ): Promise<number> {
    const p = buildPeriodoClause('l.periodo', periodoInicio, periodoFim, periodosSelecionados, 2)

    const ignoradasClause = contasIgnoradas && contasIgnoradas.length > 0
      ? `AND l.conta NOT IN (${contasIgnoradas.map((_, i) => `$${p.nextOffset + i}`).join(', ')})`
      : ''
    const extraParams = contasIgnoradas && contasIgnoradas.length > 0 ? [...contasIgnoradas] : []

    const sql = `
      SELECT COALESCE(SUM(l.movimento), 0) AS valor
      FROM cliente_bi_linhas l
      WHERE l.cliente_id = $1
        AND ${p.sql}
        AND l.conta LIKE '04.1.%'
        ${ignoradasClause}
        AND NOT EXISTS (
          SELECT 1 FROM cliente_bi_linhas c
          WHERE c.cliente_id = l.cliente_id
            AND c.periodo = l.periodo
            AND c.conta LIKE l.conta || '.%'
        )
    `

    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, ...p.params, ...extraParams)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 3b. Custos Fixos Card — 5 contas específicas (padrão SERPRO2)
  // ========================================================================

  async calcularCustosFixosCard(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    const p = buildPeriodoClause('periodo', periodoInicio, periodoFim, periodosSelecionados, 2)
    const contas = ['04.1.1.01.001', '04.1.1.01.032', '04.1.1.01.033', '04.1.1.01.035', '04.1.1.01.036']
    const contasPlaceholders = contas.map((_, i) => `$${p.nextOffset + i}`).join(', ')

    const sql = `
      SELECT SUM(movimento)::float AS valor
      FROM cliente_bi_linhas
      WHERE cliente_id = $1
        AND ${p.sql}
        AND conta IN (${contasPlaceholders})
    `
    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, ...p.params, ...contas)
    const val = toNumber(rows[0]?.valor)

    // Fallback: se resultado = 0, usar 04.1.% leaf com SUM(movimento)
    if (val === 0) {
      return this.calcularCustoDasVendas(clienteId, periodoInicio, periodoFim, undefined, periodosSelecionados)
    }
    return val
  }

  // ========================================================================
  // 3c. Lucro Líquido (fórmula SERPRO2: totalReceita03 - custos04_1 - despesas04_2)
  // ========================================================================

  async calcularLucroLiquidoSerpro(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    periodosSelecionados?: string[],
  ): Promise<number> {
    const p = buildPeriodoClause('periodo', periodoInicio, periodoFim, periodosSelecionados, 2)

    // Lucro Líquido = conta sintética 03 (movimento) + conta sintética 04 (movimento)
    // Isso dá o resultado líquido: receitas (positivo) + despesas/custos (negativo)
    const sql = `
      SELECT SUM(movimento)::float AS valor FROM cliente_bi_linhas
      WHERE cliente_id = $1 AND ${p.sql}
        AND conta IN ('03', '04')
    `
    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, ...p.params)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 4. Despesas Operacionais — SUM(ABS(movimento)) para 04.2.1.% / 04.2.2.% nivel 4+
  // ========================================================================

  async calcularDespesasOperacionais(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    contasIgnoradas?: string[],
    periodosSelecionados?: string[],
  ): Promise<number> {
    const p = buildPeriodoClause('periodo', periodoInicio, periodoFim, periodosSelecionados, 2)

    const ignoradasClause = contasIgnoradas && contasIgnoradas.length > 0
      ? `AND conta NOT IN (${contasIgnoradas.map((_, i) => `$${p.nextOffset + i}`).join(', ')})`
      : ''
    const extraParams = contasIgnoradas && contasIgnoradas.length > 0 ? [...contasIgnoradas] : []

    const sql = `
      SELECT COALESCE(SUM(ABS(movimento)), 0) AS valor
      FROM cliente_bi_linhas
      WHERE cliente_id = $1
        AND ${p.sql}
        AND (conta LIKE '04.2.1.%' OR conta LIKE '04.2.2.%')
        AND NOT EXISTS (
          SELECT 1 FROM cliente_bi_linhas c
          WHERE c.cliente_id = cliente_bi_linhas.cliente_id
            AND c.periodo = cliente_bi_linhas.periodo
            AND c.conta LIKE cliente_bi_linhas.conta || '.%'
            AND LENGTH(c.conta) > LENGTH(cliente_bi_linhas.conta)
        )
        ${ignoradasClause}
    `

    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, ...p.params, ...extraParams)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 5. Receitas Financeiras — SUM(ABS(movimento)) para 03.1.4.% / 03.1.6.% nivel 4
  // ========================================================================

  async calcularReceitasFinanceiras(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<number> {
    const { start, end } = parsePeriodoRange(periodoInicio, periodoFim)

    const sql = `
      SELECT COALESCE(SUM(ABS(movimento)), 0) AS valor
      FROM cliente_bi_linhas
      WHERE cliente_id = $1
        AND periodo BETWEEN $2 AND $3
        AND (conta LIKE '03.1.4.%' OR conta LIKE '03.1.6.%')
        AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3
    `

    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, start, end)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 6. Despesas Financeiras — SUM(ABS(movimento)) para 04.2.3.% nivel 4
  // ========================================================================

  async calcularDespesasFinanceiras(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<number> {
    const { start, end } = parsePeriodoRange(periodoInicio, periodoFim)

    const sql = `
      SELECT COALESCE(SUM(ABS(movimento)), 0) AS valor
      FROM cliente_bi_linhas
      WHERE cliente_id = $1
        AND periodo BETWEEN $2 AND $3
        AND conta LIKE '04.2.3.%'
        AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3
    `

    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, start, end)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 7. IR/CS — SUM(ABS(movimento)) para 04.4.2.% nivel 4
  // ========================================================================

  async calcularIRCS(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<number> {
    const { start, end } = parsePeriodoRange(periodoInicio, periodoFim)

    const sql = `
      SELECT COALESCE(SUM(ABS(movimento)), 0) AS valor
      FROM cliente_bi_linhas
      WHERE cliente_id = $1
        AND periodo BETWEEN $2 AND $3
        AND conta LIKE '04.4.2.%'
        AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3
    `

    const rows = await prisma.$queryRawUnsafe<KpiValor[]>(sql, clienteId, start, end)
    return toNumber(rows[0]?.valor)
  }

  // ========================================================================
  // 8. KPIs Completo — calcula todos e retorna objeto consolidado
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
      custosFixos,
      custoDasVendas,
      despesasOperacionais,
      receitasFinanceiras,
      despesasFinanceiras,
      irCs,
      lucroLiquido,
    ] = await Promise.all([
      this.calcularReceitaBruta(clienteId, periodoInicio, periodoFim, periodosSelecionados),
      this.calcularDeducoes(clienteId, periodoInicio, periodoFim, periodosSelecionados),
      this.calcularCustosFixosCard(clienteId, periodoInicio, periodoFim, periodosSelecionados),
      this.calcularCustoDasVendas(clienteId, periodoInicio, periodoFim, undefined, periodosSelecionados),
      this.calcularDespesasOperacionais(clienteId, periodoInicio, periodoFim, undefined, periodosSelecionados),
      this.calcularReceitasFinanceiras(clienteId, periodoInicio, periodoFim),
      this.calcularDespesasFinanceiras(clienteId, periodoInicio, periodoFim),
      this.calcularIRCS(clienteId, periodoInicio, periodoFim),
      this.calcularLucroLiquidoSerpro(clienteId, periodoInicio, periodoFim, periodosSelecionados),
    ])

    const receitaLiquida = receitaBruta - deducoes
    const lucroBruto = receitaLiquida + custoDasVendas // custoDasVendas é negativo (algébrico)
    const margemBruta = receitaLiquida !== 0 ? (lucroBruto / receitaLiquida) * 100 : 0
    const resultadoFinanceiro = receitasFinanceiras - despesasFinanceiras
    const ebitda = lucroBruto - despesasOperacionais + resultadoFinanceiro
    const margemEbitda = receitaLiquida !== 0 ? (ebitda / receitaLiquida) * 100 : 0
    const margemLiquida = receitaLiquida !== 0 ? (lucroLiquido / receitaLiquida) * 100 : 0

    return {
      receitaBruta,
      deducoes,
      receitaLiquida,
      custosFixos,
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
  // 9. Dados Mensais — retorna [{periodo, mes, valor}] por tipo de KPI
  // ========================================================================

  async obterDadosMensais(
    clienteId: string,
    periodoInicio: string,
    periodoFim: string,
    tipo: KpiTipo,
  ): Promise<KpiMensal[]> {
    const { start, end } = parsePeriodoRange(periodoInicio, periodoFim)

    let contaFilter: string
    let valorExpr: string

    switch (tipo) {
      case 'receita_bruta':
        contaFilter = "conta IN ('03.1.1', '3.1.1')"
        valorExpr = 'COALESCE(SUM(movimento), 0)'
        break
      case 'deducoes':
        contaFilter = "conta IN ('03.1.3', '3.1.3')"
        valorExpr = 'COALESCE(SUM(ABS(movimento)), 0)'
        break
      case 'custo_das_vendas':
        contaFilter = "conta LIKE '04.1.%'"
        valorExpr = 'COALESCE(SUM(movimento), 0)'
        break
      case 'despesas_operacionais':
        contaFilter = "(conta LIKE '04.2.1.%' OR conta LIKE '04.2.2.%') AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3"
        valorExpr = 'COALESCE(SUM(ABS(movimento)), 0)'
        break
      case 'receitas_financeiras':
        contaFilter = "(conta LIKE '03.1.4.%' OR conta LIKE '03.1.6.%') AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3"
        valorExpr = 'COALESCE(SUM(ABS(movimento)), 0)'
        break
      case 'despesas_financeiras':
        contaFilter = "conta LIKE '04.2.3.%' AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3"
        valorExpr = 'COALESCE(SUM(ABS(movimento)), 0)'
        break
      case 'ir_cs':
        contaFilter = "conta LIKE '04.4.2.%' AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3"
        valorExpr = 'COALESCE(SUM(ABS(movimento)), 0)'
        break
    }

    // Para custo_das_vendas precisamos do filtro de leaf node
    const leafFilter = tipo === 'custo_das_vendas'
      ? `AND NOT EXISTS (
           SELECT 1 FROM cliente_bi_linhas c
           WHERE c.cliente_id = l.cliente_id
             AND c.periodo = l.periodo
             AND c.conta LIKE l.conta || '.%'
         )`
      : ''

    const alias = tipo === 'custo_das_vendas' ? 'l' : 'l'

    const sql = `
      SELECT ${alias}.periodo, ${valorExpr.replace(/\b(movimento|conta)\b/g, `${alias}.$1`)} AS valor
      FROM cliente_bi_linhas ${alias}
      WHERE ${alias}.cliente_id = $1
        AND ${alias}.periodo BETWEEN $2 AND $3
        AND ${contaFilter.replace(/\b(conta)\b/g, `${alias}.$1`)}
        ${leafFilter}
      GROUP BY ${alias}.periodo
      ORDER BY ${alias}.periodo ASC
    `

    type RawRow = { periodo: string; valor: unknown }
    const rows = await prisma.$queryRawUnsafe<RawRow[]>(sql, clienteId, start, end)

    return rows.map(r => ({
      periodo: r.periodo,
      mes: formatarMes(r.periodo),
      valor: toNumber(r.valor),
    }))
  }

  // ========================================================================
  // 10. Contas por Natureza — leaf accounts 04.2.% ordenadas por saldo
  // ========================================================================

  async obterContasPorNatureza(
    clienteId: string,
    periodoFim: string,
  ): Promise<ContaNatureza[]> {
    const sql = `
      SELECT l.conta, l.nome_conta, l.saldo_atual
      FROM cliente_bi_linhas l
      WHERE l.cliente_id = $1
        AND l.periodo = $2
        AND l.conta LIKE '04.2.%'
        AND NOT EXISTS (
          SELECT 1 FROM cliente_bi_linhas c
          WHERE c.cliente_id = l.cliente_id
            AND c.periodo = l.periodo
            AND c.conta LIKE l.conta || '.%'
        )
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
