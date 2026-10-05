import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { calcularDre, INDICE, MASCARA_DRE, type CategoriaDre, type SomasPorCategoria } from './mascara-dre'
import { carregarDepara, sqlJoinsCategoria, sqlSomenteFolhas, SQL_CATEGORIA } from './categoria-sql'
import type { DeparaCliente } from './depara-nivel3'

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
// e quais linhas são subtotal. A categoria de cada conta sai do de-para por
// nível 3 (`depara-nivel3.ts`), com `cliente_bi_categorias.categoria_dre` como
// override manual.

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
// Resolução da categoria por conta: override do cliente prevalece; senão o
// de-para da máscara pelo NOME DO NÍVEL 3 (`depara-nivel3.ts`), que é como o
// Power BI faz. Antes era o template global de 142 classificações de folha —
// plano de contas de outra empresa, que deixava conta com movimento fora da
// DRE sem avisar.
// ---------------------------------------------------------------------------

async function somarPorCategoriaDre(
  clienteId: string,
  categoria: CategoriaDre,
  depara: DeparaCliente,
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

  const sql = `
    SELECT COALESCE(SUM(l.creditos - l.debitos), 0)::float AS valor
    FROM cliente_bi_linhas l
    ${sqlJoinsCategoria(depara)}
    WHERE l.cliente_id = $1
      AND ${p.sql}
      AND ${SQL_CATEGORIA} = $2
      AND ${sqlSomenteFolhas()}
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

    // O de-para do plano do cliente sai do banco UMA vez e vai para as nove
    // somas — resolver nome de conta dentro de cada consulta seria o mesmo
    // trabalho nove vezes.
    const depara = await carregarDepara(clienteId)
    const valores = await Promise.all(
      categorias.map(cat =>
        somarPorCategoriaDre(clienteId, cat, depara, periodoInicio, periodoFim, periodosSelecionados),
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

    // O filtro de folha NAO existia aqui. Era seguro por acidente enquanto a
    // categoria vinha do template de 142 folhas; com o de-para por nivel 3, a
    // conta sintetica passaria a casar junto com as filhas e a serie viria
    // dobrada.
    const depara = await carregarDepara(clienteId)
    const sql = `
      SELECT l.periodo, COALESCE(${valorExpr}, 0)::float AS valor
      FROM cliente_bi_linhas l
      ${sqlJoinsCategoria(depara)}
      WHERE l.cliente_id = $1
        AND l.periodo BETWEEN $2 AND $3
        AND ${SQL_CATEGORIA} = $4
        AND ${sqlSomenteFolhas()}
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
    // Mesma correcao do `obterDadosMensais`: sem o filtro de folha, a
    // sintetica de despesa apareceria no topo da lista somando as filhas que
    // vem logo abaixo dela.
    const depara = await carregarDepara(clienteId)
    const sql = `
      SELECT l.conta, l.nome_conta, l.saldo_atual
      FROM cliente_bi_linhas l
      ${sqlJoinsCategoria(depara)}
      WHERE l.cliente_id = $1
        AND l.periodo = $2
        AND ${SQL_CATEGORIA} = 'DESPESAS_OPERACIONAIS'
        AND ${sqlSomenteFolhas()}
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
