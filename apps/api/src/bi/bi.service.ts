import { Injectable, forwardRef, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { Prisma } from '@saas/db'
import { BiCalculosService } from './bi-calculos.service'
import { BiBalanceteService } from './bi-balancete.service'
import { SciService } from '../cliente/sci.service'
import { carregarDepara, sqlJoinsCategoria, sqlSomenteFolhas, SQL_CATEGORIA, ehFolha } from './categoria-sql'
import { nivel3De } from './depara-nivel3'
import type { DeparaCliente } from './depara-nivel3'
import { calcularDre, INDICE, MASCARA_DRE, type CategoriaDre } from './mascara-dre'

// BI_CATEGORIAS — mapa de padrões de contas por tipo de KPI
export const BI_CATEGORIAS: Record<string, { label: string; patterns: string[] }> = {
  receita_bruta: { label: 'Receita Bruta', patterns: ['03.1.1', '3.1.1'] },
  deducoes_impostos: { label: 'Deduções / Impostos', patterns: ['03.1.3', '3.1.3'] },
  custo_das_vendas: { label: 'Custo das Vendas', patterns: ['04.1.%'] },
  despesas_operacionais: { label: 'Despesas Operacionais', patterns: ['04.2.1.%', '04.2.2.%'] },
  despesas_operacionais_com_financeiras: { label: 'Despesas Operacionais (c/ Financeiras)', patterns: ['04.2.1.%', '04.2.2.%', '04.2.3.%'] },
  receitas_financeiras: { label: 'Receitas Financeiras', patterns: ['03.1.4.%', '03.1.6.%'] },
  despesas_financeiras: { label: 'Despesas Financeiras', patterns: ['04.2.3.%'] },
  ir_cs: { label: 'IR / CSLL', patterns: ['04.4.2.%'] },
  distribuicao_lucros: { label: 'Distribuição de Lucros', patterns: ['04.4.%'] },
}

@Injectable()
export class BiService {
  constructor(
    private readonly calculos: BiCalculosService,
    private readonly balancete: BiBalanceteService,
    // Para descobrir o ID SCI de quem ainda não tem. `forwardRef` porque
    // ClienteModule e BiModule se importam mutuamente.
    @Inject(forwardRef(() => SciService)) private readonly sci: SciService,
  ) {}

  // ══════════════════════════════════════════════════════════════
  // Categorias globais (filtro)
  // ══════════════════════════════════════════════════════════════
  getCategorias() {
    return Object.entries(BI_CATEGORIAS).map(([key, val]) => ({
      id: key,
      label: val.label,
      patterns: val.patterns,
    }))
  }

  // ══════════════════════════════════════════════════════════════
  // Faturamento
  // ══════════════════════════════════════════════════════════════
  async faturamentoDisponivel(clienteId: string) {
    const rows = await prisma.biCacheFaturamento.findMany({
      where: { clienteId },
      select: { ano: true },
      distinct: ['ano'],
      orderBy: { ano: 'desc' },
    })
    return { anos: rows.map(r => r.ano) }
  }

  /** Anos com dados de balancete (linhas importadas) */
  async anosComBalancete(clienteId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ ano: number }>>(
      `SELECT DISTINCT CAST(LEFT(periodo, 4) AS INTEGER) AS ano
       FROM cliente_bi_linhas WHERE cliente_id = $1
       ORDER BY ano DESC`,
      clienteId,
    )
    return rows.map(r => r.ano)
  }

  async faturamentoSerie(clienteId: string, ano: number, fonte = 'sci') {
    const rows = await prisma.biCacheFaturamento.findMany({
      where: { clienteId, ano, fonte },
      orderBy: { mes: 'asc' },
    })
    const meses = rows.map(r => ({ mes: r.mes, valor: Number(r.valor) }))
    const total = meses.reduce((s, m) => s + m.valor, 0)
    return { ano, meses, total }
  }

  async faturamentoRefresh(clienteId: string, ano: number) {
    // Placeholder — full SCI integration will be added when SCI service is wired
    const jobKey = `fat_${clienteId}_${ano}`
    this.balancete.updateRefreshStatus(clienteId, ano, {
      status: 'running', progress: 0, message: 'Iniciando atualização de faturamento...',
    })

    // Simulate async job
    setTimeout(async () => {
      try {
        this.balancete.updateRefreshStatus(clienteId, ano, {
          status: 'done', progress: 100, message: 'Faturamento atualizado.',
        })
      } catch (e) {
        this.balancete.updateRefreshStatus(clienteId, ano, {
          status: 'error', message: (e as Error).message,
        })
      }
    }, 1000)

    return { jobKey, message: 'Atualização iniciada' }
  }

  faturamentoRefreshStatus(clienteId: string, ano: number) {
    return this.balancete.getRefreshStatus(clienteId, ano)
  }

  // ══════════════════════════════════════════════════════════════
  // Balancete — Categorias nível 4
  // ══════════════════════════════════════════════════════════════
  async balanceteCategoriasNivel4(clienteId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ conta: string; nome_conta: string }>>(
      `SELECT DISTINCT conta, nome_conta FROM cliente_bi_linhas
       WHERE cliente_id = $1
         AND (conta LIKE '03.%' OR conta LIKE '04.%' OR conta LIKE '3.%' OR conta LIKE '4.%')
         AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) = 3
       ORDER BY conta ASC`,
      clienteId,
    )
    return rows.map(r => ({ conta: r.conta, nomeConta: r.nome_conta }))
  }

  // ══════════════════════════════════════════════════════════════
  // Balancete — Matriz de Resultados
  // ══════════════════════════════════════════════════════════════
  /**
   * A Matriz de Resultados — a DRE do Power BI, linha a linha.
   *
   * ## O que mudou, e por quê
   *
   * Esta função montava a matriz a partir de FÓRMULAS gravadas por cliente
   * (`cliente_bi_categorias.formula`), portadas do SERPRO2. As fórmulas vieram
   * literalmente certas; o significado do operador é que não veio junto. No v1,
   * `subtracao` era "subtrai o MÓDULO":
   *
   *     if (op === 'subtracao') return acc - Math.abs(Number(v) || 0)
   *
   * No v2 virou subtração algébrica, aplicada a operandos que agora chegam com
   * sinal natural (`creditos − debitos`). Com Deduções valendo −170.510,96:
   *
   *     865.407,06 − (−170.510,96) = 1.035.918,02   ← o que a tela mostrava
   *     865.407,06 + (−170.510,96) =   694.896,10   ← o Power BI
   *
   * O erro subia por Margem Bruta e EBITDA. E `RESULTADO OPERACIONAL` somava um
   * operando (`RES_OPERACIONAL`) que não existia como categoria: resolvia para
   * zero e o Resultado Operacional virava cópia do EBITDA, sem o financeiro.
   *
   * ## Como é agora
   *
   * Não há mais fórmula por cliente, e portanto não há mais um segundo motor de
   * cálculo. A matriz é a MÁSCARA (`mascara-dre.ts`), igual ao Power BI:
   *
   *  - as 9 linhas de dado somam as FOLHAS da categoria delas, e abrem na
   *    hierarquia do próprio plano de contas do cliente;
   *  - os 7 subtotais são o acumulado da máscara até o índice — sem fórmula,
   *    porque o sinal natural já faz a subtração;
   *  - `% A.V.` é sobre a Receita Bruta, como no painel de referência.
   *
   * Consequência direta: matriz e cartões passam a somar exatamente as mesmas
   * contas, porque usam a mesma resolução de categoria. Eles não fechavam entre
   * si desde sempre.
   *
   * O flag `ativo` ("No BI", na tela de categorias) NÃO filtra mais a matriz.
   * Esconder uma conta que carrega valor enquanto o subtotal a inclui é um
   * número que não se explica; quem precisa tirar uma conta da conta usa a
   * exclusão de contas do KPI.
   */
  async balanceteMatriz(clienteId: string, ano: number) {
    const periodoInicio = `${ano}01`
    const periodoFim = `${ano}12`

    const [categorias, linhas, depara] = await Promise.all([
      prisma.clienteBiCategoria.findMany({ where: { clienteId } }),
      prisma.clienteBiLinha.findMany({
        where: { clienteId, periodo: { gte: periodoInicio, lte: periodoFim } },
        select: { conta: true, nomeConta: true, periodo: true, creditos: true, debitos: true, analitica: true },
      }),
      carregarDepara(clienteId),
    ])

    const catMap = new Map(categorias.map(c => [c.conta, c]))
    const overrides = new Map(
      categorias.filter(c => c.categoriaDre).map(c => [c.conta, c.categoriaDre as CategoriaDre]),
    )
    const categoriaPorNivel3 = new Map(depara.map(d => [d.conta3, d.categoria]))

    /** Override do cliente primeiro, de-para da máscara depois. */
    const categoriaDaConta = (conta: string): CategoriaDre | null => {
      const ov = overrides.get(conta)
      if (ov) return ov
      const n3 = nivel3De(conta)
      return (n3 && categoriaPorNivel3.get(n3)) || null
    }

    // ── Valor por conta e período: `creditos − debitos`, o mesmo `Realizado
    //    Base` dos cartões. Sinal natural: receita credora positiva, despesa
    //    devedora negativa.
    const valorPorConta = new Map<string, Map<string, number>>()
    const analiticaPorConta = new Map<string, boolean | null>()
    const nomePorConta = new Map<string, string>()
    const refs = new Set<string>()
    for (const l of linhas) {
      refs.add(l.periodo)
      if (!valorPorConta.has(l.conta)) valorPorConta.set(l.conta, new Map())
      const m = valorPorConta.get(l.conta)!
      m.set(l.periodo, (m.get(l.periodo) ?? 0) + (Number(l.creditos) - Number(l.debitos)))
      if (!analiticaPorConta.has(l.conta) || l.analitica !== null) analiticaPorConta.set(l.conta, l.analitica)
      if (!nomePorConta.has(l.conta)) nomePorConta.set(l.conta, l.nomeConta)
    }
    const sortedRefs = Array.from(refs).sort()
    const todasAsContas = new Set(valorPorConta.keys())

    // ── As folhas de cada categoria. Só folha: somar a sintética junto com as
    //    filhas dela seria contar o mesmo valor duas vezes.
    const folhasPorCategoria = new Map<CategoriaDre, string[]>()
    for (const conta of todasAsContas) {
      if (!ehFolha({ conta, analitica: analiticaPorConta.get(conta) ?? null }, todasAsContas)) continue
      const cat = categoriaDaConta(conta)
      if (!cat) continue
      if (!folhasPorCategoria.has(cat)) folhasPorCategoria.set(cat, [])
      folhasPorCategoria.get(cat)!.push(conta)
    }

    const nomeDaConta = (conta: string) =>
      catMap.get(conta)?.nomeExibicao || catMap.get(conta)?.nomeSci || nomePorConta.get(conta) || conta

    const cmpConta = (a: string, b: string) => {
      const ap = a.split('.'), bp = b.split('.')
      for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        const an = parseInt(ap[i] ?? '0', 10), bn = parseInt(bp[i] ?? '0', 10)
        if (an !== bn) return an - bn
      }
      return 0
    }

    type ResultRow = {
      id: string; conta: string; nomeConta: string
      level: number; parentId: string | null; hasChildren: boolean
      valores: Record<string, { realizado: number; pct_av: number }>
      total: { realizado: number; pct_av: number }
    }

    // ── Receita Bruta primeiro: é o denominador do % A.V.
    const somaDasFolhas = (contas: string[], ref: string) =>
      contas.reduce((acc, c) => acc + (valorPorConta.get(c)?.get(ref) ?? 0), 0)

    const receitaBrutaPorRef = new Map<string, number>()
    for (const ref of sortedRefs) {
      receitaBrutaPorRef.set(ref, somaDasFolhas(folhasPorCategoria.get('RECEITA_BRUTA') ?? [], ref))
    }
    const receitaBrutaTotal = sortedRefs.reduce((s, ref) => s + (receitaBrutaPorRef.get(ref) ?? 0), 0)

    const duasCasas = (v: number) => Math.round(v * 100) / 100
    const celula = (realizado: number, base: number) => ({
      realizado: duasCasas(realizado),
      // `Math.abs` espelha o `ABS(DIVIDE(...))` da medida "% do Faturamento" do
      // painel de referência: o percentual mede tamanho, o sinal já está no valor.
      pct_av: base !== 0 ? Math.round(Math.abs(realizado / base) * 10000) / 100 : 0,
    })

    const montarLinha = (
      id: string, conta: string, nome: string, level: number, parentId: string | null,
      hasChildren: boolean, porRef: (ref: string) => number,
    ): ResultRow => {
      const valores: Record<string, { realizado: number; pct_av: number }> = {}
      let total = 0
      for (const ref of sortedRefs) {
        const v = porRef(ref)
        total += v
        valores[ref] = celula(v, receitaBrutaPorRef.get(ref) ?? 0)
      }
      return { id, conta, nomeConta: nome, level, parentId, hasChildren, valores, total: celula(total, receitaBrutaTotal) }
    }

    // ── O detalhe de uma linha de dado: as folhas dela, penduradas nos
    //    ancestrais que existem entre o nível 3 e a própria folha. É o que o
    //    Power BI abre quando se clica no ⊞ da categoria.
    const detalhe = (folhas: string[], raizId: string): ResultRow[] => {
      const nós = new Map<string, { pai: string | null; folhas: string[] }>()
      for (const folha of folhas) {
        const partes = folha.split('.')
        let pai: string | null = null
        // Ancestrais a partir do nível 4 — o nível 3 é a própria categoria.
        for (let n = 4; n <= partes.length; n++) {
          const conta = partes.slice(0, n).join('.')
          if (!nós.has(conta)) nós.set(conta, { pai, folhas: [] })
          nós.get(conta)!.folhas.push(folha)
          pai = conta
        }
        // Folha rasa (nível 3 ou menos) entra direto sob a categoria.
        if (partes.length < 4 && !nós.has(folha)) nós.set(folha, { pai: null, folhas: [folha] })
      }

      const filhosDe = new Map<string | null, string[]>()
      for (const [conta, n] of nós) {
        if (!filhosDe.has(n.pai)) filhosDe.set(n.pai, [])
        filhosDe.get(n.pai)!.push(conta)
      }
      for (const [, lista] of filhosDe) lista.sort(cmpConta)

      const out: ResultRow[] = []
      const descer = (pai: string | null, level: number) => {
        for (const conta of filhosDe.get(pai) ?? []) {
          const n = nós.get(conta)!
          const temFilhos = (filhosDe.get(conta)?.length ?? 0) > 0
          out.push(montarLinha(
            `${raizId}::${conta}`, conta, nomeDaConta(conta), level,
            pai === null ? raizId : `${raizId}::${pai}`, temFilhos,
            ref => somaDasFolhas(n.folhas, ref),
          ))
          descer(conta, level + 1)
        }
      }
      descer(null, 1)
      return out
    }

    // ── A máscara, em ordem. Linha de dado soma as folhas da categoria;
    //    subtotal é o acumulado até o índice dele.
    const acumulado = new Map<string, number>()
    const rows: ResultRow[] = []
    for (const linha of MASCARA_DRE) {
      const id = `MASCARA_${linha.indice}`
      if (linha.subnivel === 0) {
        const folhas = (linha.categoria && folhasPorCategoria.get(linha.categoria)) || []
        for (const ref of sortedRefs) {
          acumulado.set(ref, (acumulado.get(ref) ?? 0) + somaDasFolhas(folhas, ref))
        }
        rows.push(montarLinha(id, linha.categoria ?? id, linha.rotulo, 0, null, folhas.length > 0,
          ref => somaDasFolhas(folhas, ref)))
        rows.push(...detalhe(folhas, id))
      } else {
        rows.push(montarLinha(id, id, linha.rotulo, 0, null, false, ref => acumulado.get(ref) ?? 0))
      }
    }

    return { ano, refs: sortedRefs, rows }
  }

  /**
   * Somas ALGÉBRICAS por categoria da DRE, quebradas por período.
   *
   * É a entrada da máscara para quem precisa da DRE mês a mês — a análise
   * horizontal e a matriz. Uma consulta só, com a mesma resolução de categoria
   * e o mesmo filtro de folha dos cartões.
   */
  private async somasMensaisPorCategoria(
    clienteId: string,
    depara: DeparaCliente,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<Map<string, Partial<Record<CategoriaDre, number>>>> {
    const rows = await prisma.$queryRawUnsafe<Array<{ periodo: string; categoria: string; valor: number }>>(
      `SELECT l.periodo, ${SQL_CATEGORIA} AS categoria,
              SUM(l.creditos - l.debitos)::float AS valor
       FROM cliente_bi_linhas l
       ${this.sqlCategoriaFolha(depara, null)}
       GROUP BY l.periodo, ${SQL_CATEGORIA}`,
      clienteId, periodoInicio, periodoFim,
    )
    const out = new Map<string, Partial<Record<CategoriaDre, number>>>()
    for (const r of rows) {
      if (!out.has(r.periodo)) out.set(r.periodo, {})
      out.get(r.periodo)![r.categoria as CategoriaDre] = Number(r.valor)
    }
    return out
  }

  /** Consolida as somas mensais de uma faixa de períodos numa soma só. */
  private somarTotais(
    somasMensais: Map<string, Partial<Record<CategoriaDre, number>>>,
    periodoInicio: string,
    periodoFim: string,
  ): Partial<Record<CategoriaDre, number>> {
    const total: Partial<Record<CategoriaDre, number>> = {}
    for (const [periodo, somas] of somasMensais) {
      if (periodo < periodoInicio || periodo > periodoFim) continue
      for (const [cat, valor] of Object.entries(somas)) {
        const k = cat as CategoriaDre
        total[k] = (total[k] ?? 0) + (valor ?? 0)
      }
    }
    return total
  }

  // ══════════════════════════════════════════════════════════════
  // Balancete — KPIs
  // ══════════════════════════════════════════════════════════════
  async balanceteKpis(clienteId: string, ano: number, meses?: string) {
    const periodoInicio = `${ano}01`
    const periodoFim = `${ano}12`
    const periodosSelecionados = meses
      ? meses.split(',').map(m => `${ano}${m.padStart(2, '0')}`)
      : undefined

    // Check for custom included accounts per KPI type
    const [inclReceita, inclCustos, inclDespesas, inclLucro] = await Promise.all([
      this.kpiContasIncluidasGet(clienteId, 'receita'),
      this.kpiContasIncluidasGet(clienteId, 'custos_fixos'),
      this.kpiContasIncluidasGet(clienteId, 'despesas'),
      this.kpiContasIncluidasGet(clienteId, 'lucro_liquido'),
    ])

    const [kpis, fontesReceita, fontesDespesas, mesesCustosDespesas] = await Promise.all([
      this.calculos.calcularKpisCompleto(clienteId, periodoInicio, periodoFim, periodosSelecionados),
      this.buscarFontesReceita(clienteId, periodoInicio, periodoFim),
      this.buscarFontesDespesas(clienteId, periodoInicio, periodoFim),
      this.buscarMesesCustosDespesas(clienteId, periodoInicio, periodoFim),
    ])

    // Override KPIs with custom account selections if defined
    const overrides: Record<string, number> = {}
    if (inclReceita.length > 0) {
      overrides.receitaBruta = await this.somarContasSelecionadas(clienteId, periodoInicio, periodoFim, inclReceita)
    }
    if (inclCustos.length > 0) {
      overrides.custosFixos = await this.somarContasSelecionadas(clienteId, periodoInicio, periodoFim, inclCustos)
    }
    if (inclDespesas.length > 0) {
      overrides.despesasOperacionais = await this.somarContasSelecionadas(clienteId, periodoInicio, periodoFim, inclDespesas)
    }
    if (inclLucro.length > 0) {
      overrides.lucroLiquido = await this.somarContasSelecionadas(clienteId, periodoInicio, periodoFim, inclLucro)
    }

    const finalKpis = { ...kpis, ...overrides }
    // Recalculate derived values if overrides applied.
    // Após refactor, custoDasVendas e despesasOperacionais vêm POSITIVOS de
    // calcularKpisCompleto (ABS aplicado). Mas somarContasSelecionadas
    // retorna ALGÉBRICO (-ABS pra contas 04). Normalizamos pra ABS aqui antes
    // de aplicar nas fórmulas, garantindo consistência em ambos os caminhos.
    if (Object.keys(overrides).length > 0) {
      // Override values can be algebraic (somarContasSelecionadas) — força positivo
      if ('custosFixos' in overrides) finalKpis.custosFixos = Math.abs(finalKpis.custosFixos)
      if ('custoDasVendas' in overrides) finalKpis.custoDasVendas = Math.abs(finalKpis.custoDasVendas)
      if ('despesasOperacionais' in overrides) finalKpis.despesasOperacionais = Math.abs(finalKpis.despesasOperacionais)

      finalKpis.receitaLiquida = finalKpis.receitaBruta - finalKpis.deducoes
      finalKpis.lucroBruto = finalKpis.receitaLiquida - finalKpis.custoDasVendas
      finalKpis.ebitda = finalKpis.lucroBruto - finalKpis.despesasOperacionais
      finalKpis.margemBruta = finalKpis.receitaLiquida !== 0
        ? Math.round((finalKpis.lucroBruto / finalKpis.receitaLiquida) * 10000) / 100 : 0
      finalKpis.margemEbitda = finalKpis.receitaLiquida !== 0
        ? Math.round((finalKpis.ebitda / finalKpis.receitaLiquida) * 10000) / 100 : 0
      finalKpis.margemLiquida = finalKpis.receitaLiquida !== 0
        ? Math.round((finalKpis.lucroLiquido / finalKpis.receitaLiquida) * 10000) / 100 : 0
    }

    return { ...finalKpis, fontesReceita, fontesDespesas, mesesCustosDespesas }
  }

  /**
   * Fragmento SQL: junta a linha do balancete a sua CATEGORIA DRE e restringe
   * as folhas. E o mesmo criterio do motor de KPI (bi-calculos), escrito uma
   * vez para as consultas de apoio deste arquivo pararem de classificar conta
   * por PREFIXO.
   *
   * O prefixo era o vicio comum das quatro: "03.%" para receita, "04.2.1.%"
   * para despesa, e cinco contas 04.1.1.01.* cravadas para custo fixo. Plano de
   * contas de outro cliente zera o grafico enquanto o cartao mostra valor.
   */
  private sqlCategoriaFolha(depara: DeparaCliente, categoria: string | null): string {
    return `
      ${sqlJoinsCategoria(depara)}
      WHERE l.cliente_id = $1 AND l.periodo BETWEEN $2 AND $3
        AND ${SQL_CATEGORIA} ${categoria ? `= '${categoria}'` : 'IS NOT NULL'}
        AND ${sqlSomenteFolhas()}`
  }

  /**
   * Soma as contas que o usuario escolheu para compor um KPI.
   *
   * Sem o `CASE WHEN conta LIKE '04%' THEN -ABS(movimento)` que existia aqui:
   * ele decidia o sinal pelo PREFIXO da conta, ignorando a categoria, e o
   * `-ABS` invertia estorno igual ao regex da matriz. `creditos - debitos` ja
   * traz o sinal contabil.
   */
  private async somarContasSelecionadas(clienteId: string, periodoInicio: string, periodoFim: string, contas: string[]) {
    if (contas.length === 0) return 0
    const placeholders = contas.map((_, i) => `$${i + 4}`).join(', ')
    const rows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COALESCE(SUM(creditos - debitos), 0)::float AS total
       FROM cliente_bi_linhas
       WHERE cliente_id = $1 AND periodo BETWEEN $2 AND $3 AND conta IN (${placeholders})`,
      clienteId, periodoInicio, periodoFim, ...contas,
    )
    return Number(rows[0]?.total ?? 0)
  }

  /** Top 5 fontes de receita — contas da categoria RECEITA_BRUTA, folhas. */
  private async buscarFontesReceita(clienteId: string, periodoInicio: string, periodoFim: string) {
    const depara = await carregarDepara(clienteId)
    const rows = await prisma.$queryRawUnsafe<Array<{ conta: string; nome_conta: string; total: number }>>(
      `SELECT l.conta, l.nome_conta, SUM(l.creditos - l.debitos)::float AS total
       FROM cliente_bi_linhas l
       ${this.sqlCategoriaFolha(depara, 'RECEITA_BRUTA')}
       GROUP BY l.conta, l.nome_conta
       HAVING ABS(SUM(l.creditos - l.debitos)) > 0.01
       ORDER BY SUM(l.creditos - l.debitos) DESC
       LIMIT 5`,
      clienteId, periodoInicio, periodoFim,
    )
    return rows.map(r => ({ contaLonga: r.conta, nomeConta: r.nome_conta, valor: r.total }))
  }

  /** Top 5 fontes de despesa — categoria DESPESAS_OPERACIONAIS, folhas. */
  private async buscarFontesDespesas(clienteId: string, periodoInicio: string, periodoFim: string) {
    const depara = await carregarDepara(clienteId)
    const rows = await prisma.$queryRawUnsafe<Array<{ conta: string; nome_conta: string; total: number }>>(
      `SELECT l.conta, l.nome_conta, ABS(SUM(l.creditos - l.debitos))::float AS total
       FROM cliente_bi_linhas l
       ${this.sqlCategoriaFolha(depara, 'DESPESAS_OPERACIONAIS')}
       GROUP BY l.conta, l.nome_conta
       HAVING ABS(SUM(l.creditos - l.debitos)) > 0.01
       ORDER BY ABS(SUM(l.creditos - l.debitos)) DESC
       LIMIT 5`,
      clienteId, periodoInicio, periodoFim,
    )
    return rows.map(r => ({ contaLonga: r.conta, nomeConta: r.nome_conta, valor: r.total }))
  }

  /**
   * Serie mensal de Custos Fixos x Despesas Operacionais para o grafico.
   *
   * Aqui estava o pior dos prefixos cravados: cinco contas
   * ('04.1.1.01.001','...032','...033','...035','...036') escolhidas a dedo do
   * plano de contas da SERRAFER, com o proprio comentario admitindo "padrao
   * SERPRO2". Para qualquer outro cliente o grafico de Custos Fixos ficava
   * ZERADO enquanto o cartao ao lado mostrava valor — e o texto do modal
   * explicava as cinco contas, descrevendo o grafico e nao o cartao.
   *
   * Agora as duas series saem das MESMAS categorias que os cartoes usam:
   * CUSTO_DAS_VENDAS e DESPESAS_OPERACIONAIS. Grafico e cartao passam a falar
   * da mesma coisa, em qualquer plano de contas.
   */
  private async buscarMesesCustosDespesas(clienteId: string, periodoInicio: string, periodoFim: string) {
    const depara = await carregarDepara(clienteId)
    const serie = (categoria: string) =>
      prisma.$queryRawUnsafe<Array<{ periodo: string; total: number }>>(
        `SELECT l.periodo, ABS(SUM(l.creditos - l.debitos))::float AS total
         FROM cliente_bi_linhas l
         ${this.sqlCategoriaFolha(depara, categoria)}
         GROUP BY l.periodo ORDER BY l.periodo`,
        clienteId, periodoInicio, periodoFim,
      )

    const [custos, despesas] = await Promise.all([
      serie('CUSTO_DAS_VENDAS'),
      serie('DESPESAS_OPERACIONAIS'),
    ])

    const custosMap = new Map(custos.map(r => [r.periodo, r.total]))
    const despesasMap = new Map(despesas.map(r => [r.periodo, r.total]))

    // Unir os períodos
    const periodos = new Set([...custosMap.keys(), ...despesasMap.keys()])
    return Array.from(periodos).sort().map(p => ({
      mes: Number(p.slice(4)),
      custosFixos: custosMap.get(p) ?? 0,
      despesas: despesasMap.get(p) ?? 0,
    }))
  }

  // ══════════════════════════════════════════════════════════════
  // Balancete — Análise Vertical e Horizontal
  // ══════════════════════════════════════════════════════════════
  async balanceteAnalise(clienteId: string, ano: number, _meses?: string) {
    const periodoInicio = `${ano}01`
    const periodoFim = `${ano}12`
    // Inclui dezembro do ano anterior pra calcular a variação% de janeiro
    // (replica DAX PREVIOUSMONTH do PowerBI ref).
    const periodoInicioExt = `${ano - 1}12`

    const deparaAnalise = await carregarDepara(clienteId)
    // Somas ALGÉBRICAS por categoria e por mês. É a base da máscara: com ela,
    // cada indicador composto sai de `calcularDre` em vez de ser rederivado à
    // mão aqui embaixo — que era como o EBITDA desta tela acabou incluindo
    // resultado financeiro e discordando do cartão ao lado.
    const somasMensais = await this.somasMensaisPorCategoria(clienteId, deparaAnalise, periodoInicioExt, periodoFim)
    const dreDoMes = (periodo: string) => calcularDre(somasMensais.get(periodo) ?? {})
    const somaDoMes = (periodo: string, cat: CategoriaDre) => somasMensais.get(periodo)?.[cat] ?? 0

    // Get monthly data for key metrics (estendido c/ dez do ano anterior)
    const tipos = ['receita_bruta', 'deducoes', 'custo_das_vendas', 'despesas_operacionais', 'receitas_financeiras', 'despesas_financeiras']
    const resultExtended: Record<string, Array<{ periodo: string; mes: string; valor: number }>> = {}
    const result: Record<string, Array<{ periodo: string; mes: string; valor: number }>> = {}

    for (const tipo of tipos) {
      resultExtended[tipo] = await this.calculos.obterDadosMensais(clienteId, periodoInicioExt, periodoFim, tipo as any)
      // Filtra só os meses do ano-alvo pra `result` (usado pelo restante)
      result[tipo] = resultExtended[tipo].filter(d => d.periodo >= periodoInicio)
    }

    // Calculate vertical analysis (% of receita liquida)
    const receitaBrutaMensal = result.receita_bruta || []
    const deducoesMensal = result.deducoes || []

    const analiseVertical = tipos.map(tipo => {
      const dados = result[tipo] || []
      return {
        tipo,
        label: BI_CATEGORIAS[tipo]?.label || tipo,
        dados: dados.map(d => {
          const rb = receitaBrutaMensal.find(r => r.periodo === d.periodo)?.valor || 0
          const ded = deducoesMensal.find(r => r.periodo === d.periodo)?.valor || 0
          const receitaLiquida = rb - ded
          const percentual = receitaLiquida !== 0 ? (d.valor / receitaLiquida) * 100 : 0
          return { ...d, percentual: Math.round(percentual * 100) / 100 }
        }),
      }
    })

    // Calculate horizontal analysis (month-to-month variation)
    const analiseHorizontal = tipos.map(tipo => {
      const dados = result[tipo] || []
      const variacoes = dados.map((d, i) => {
        if (i === 0) return { ...d, variacao: null as number | null }
        const anterior = dados[i - 1]!.valor
        if (anterior === 0) return { ...d, variacao: d.valor !== 0 ? 100 : 0 }
        return { ...d, variacao: Math.round(((d.valor - anterior) / Math.abs(anterior)) * 10000) / 100 }
      })
      return { tipo, label: BI_CATEGORIAS[tipo]?.label || tipo, dados: variacoes }
    })

    // Build composite indicators month-by-month for chart selector
    const periodos = (result.receita_bruta || []).map(d => d.periodo)
    const getVal = (tipo: string, periodo: string) => (result[tipo] || []).find(d => d.periodo === periodo)?.valor ?? 0

    const indicadoresHorizontais: Record<string, Array<{ mes: number; valor: number }>> = {}

    // Faturamento = Receita Bruta (replica DAX do PowerBI ref: [Indicador
    // Selecionado] retorna [Receita Bruta] pra "Faturamento" — sem deduzir)
    indicadoresHorizontais.faturamento = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('receita_bruta', p),
    }))

    // Despesas Operacionais = 04.2.1 + 04.2.2 (já temos)
    indicadoresHorizontais.despesas_operacionais = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('despesas_operacionais', p),
    }))

    // EBITDA, Lucro Líquido e Margem de Contribuição saem da MÁSCARA, mês a
    // mês — são os índices 9, 16 e 7. O EBITDA daqui somava receitas
    // financeiras (EBITDA, por definição, não inclui resultado financeiro) e
    // por isso divergia do cartão da Visão Geral, que já usa a máscara.
    //
    // `ebitda_simplificado` vira o mesmo número: a diferença entre os dois era
    // exatamente o resultado financeiro indevido. Fica como apelido para não
    // quebrar payload antigo, mas a opção sumiu dos seletores.
    indicadoresHorizontais.ebitda = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: dreDoMes(p).get(INDICE.EBITDA) ?? 0,
    }))
    indicadoresHorizontais.ebitda_simplificado = indicadoresHorizontais.ebitda
    indicadoresHorizontais.lucro_liquido = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: dreDoMes(p).get(INDICE.RESULTADO_LIQUIDO) ?? 0,
    }))
    indicadoresHorizontais.margem_contribuicao = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: dreDoMes(p).get(INDICE.MARGEM_CONTRIBUICAO) ?? 0,
    }))

    // ── Resultado por Natureza ──
    // Top contas leaf categorizadas no DRE, ordenadas por |valor| desc.
    // Replica o "Resultado por natureza" do PowerBI ref (bar chart horizontal).
    const resultadoPorNatureza = await prisma.$queryRawUnsafe<Array<{ conta: string; nome: string; valor: number; categoria: string }>>(
      `SELECT l.conta,
              l.nome_conta AS nome,
              SUM(l.creditos - l.debitos)::float AS valor,
              ${SQL_CATEGORIA} AS categoria
       FROM cliente_bi_linhas l
       ${this.sqlCategoriaFolha(deparaAnalise, null)}
       GROUP BY l.conta, l.nome_conta, ${SQL_CATEGORIA}
       HAVING ABS(SUM(l.creditos - l.debitos)) > 0.01
       ORDER BY ABS(SUM(l.creditos - l.debitos)) DESC
       LIMIT 10`,
      clienteId, periodoInicio, periodoFim,
    )

    // ── Análise Vertical (DRE) ──
    // Linhas da Demonstração de Resultado com seus % sobre Receita Líquida.
    // Replica o painel "Análise Vertical" do PowerBI ref.
    // Os sete subtotais vêm da máscara, pelo índice. Antes, dois deles eram
    // cópia de outra linha:
    //
    //   const resultadoOperacional = kpis.ebitda - 0
    //   const resultadoAntesParticipacoes = kpis.lucroLiquido
    //
    // — o Resultado Operacional nunca somava o resultado financeiro, e o
    // "Antes de Participações" repetia o Lucro Líquido. O painel mostrava o
    // mesmo número duas vezes, em duas duplas.
    const dreTotal = calcularDre(this.somarTotais(somasMensais, periodoInicio, periodoFim))
    const noIndice = (i: number) => dreTotal.get(i) ?? 0
    const rl = noIndice(INDICE.RECEITA_LIQUIDA)
    const pct = (v: number) => rl !== 0 ? Math.round((v / rl) * 10000) / 100 : 0
    const analiseVerticalDre = MASCARA_DRE
      .filter(l => l.subnivel === 1)
      .map(l => ({
        label: l.rotulo,
        valor: noIndice(l.indice),
        percentual: l.indice === INDICE.RECEITA_LIQUIDA ? 100 : pct(noIndice(l.indice)),
        ...(l.indice === INDICE.RECEITA_LIQUIDA ? { destaque: 'principal' } : {}),
      }))

    // ── Análise Horizontal (variação mensal por indicador) ──
    // Acrescenta variacao% em relação ao mês anterior pra cada indicador.
    // Janeiro compara com dezembro do ano anterior (PREVIOUSMONTH do DAX).
    const periodoAnteriorAno = `${ano - 1}12`

    // Mesmo cálculo do bloco acima, para um mês qualquer (inclusive dezembro do
    // ano anterior, que é a base da variação de janeiro). Uma função só para os
    // dois usos — antes eram duas listas de fórmulas escritas à mão, e elas já
    // tinham divergido entre si.
    const calcIndicador = (key: string, p: string): number => {
      switch (key) {
        case 'faturamento':           return somaDoMes(p, 'RECEITA_BRUTA')
        case 'despesas_operacionais': return Math.abs(somaDoMes(p, 'DESPESAS_OPERACIONAIS'))
        case 'ebitda':
        case 'ebitda_simplificado':   return dreDoMes(p).get(INDICE.EBITDA) ?? 0
        case 'lucro_liquido':         return dreDoMes(p).get(INDICE.RESULTADO_LIQUIDO) ?? 0
        case 'margem_contribuicao':   return dreDoMes(p).get(INDICE.MARGEM_CONTRIBUICAO) ?? 0
        default: return 0
      }
    }

    const indicadoresHorizontaisComVariacao: Record<string, Array<{ mes: number; valor: number; variacao: number | null }>> = {}
    for (const [key, arr] of Object.entries(indicadoresHorizontais)) {
      indicadoresHorizontaisComVariacao[key] = arr.map((d) => {
        // Mês anterior real: para janeiro = dez/ano-1; para outros = mes-1 do mesmo ano
        const mesAnterior = d.mes === 1 ? periodoAnteriorAno : `${ano}${String(d.mes - 1).padStart(2, '0')}`
        const anterior = calcIndicador(key, mesAnterior)
        if (anterior === 0) return { ...d, variacao: d.valor !== 0 ? null : 0 }
        return { ...d, variacao: Math.round(((d.valor - anterior) / Math.abs(anterior)) * 10000) / 100 }
      })
    }

    return {
      analiseVertical,
      analiseHorizontal,
      dadosMensais: result,
      indicadoresHorizontais,
      // Novos campos pra aba "Análise" no padrão PowerBI:
      resultadoPorNatureza,
      analiseVerticalDre,
      indicadoresHorizontaisComVariacao,
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Balancete — Diagnóstico resultado por natureza
  // ══════════════════════════════════════════════════════════════
  async balanceteDiagnostico(clienteId: string, ano: number) {
    const periodoFim = `${ano}12`
    return this.calculos.obterContasPorNatureza(clienteId, periodoFim)
  }

  // ══════════════════════════════════════════════════════════════
  // Balancete — Refresh / Exclusão / Simulação
  // ══════════════════════════════════════════════════════════════
  async balanceteRefresh(clienteId: string, ano: number, _force = false) {
    // Importação por ano completo — delega ao importarBalanceteSci
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, idSistema: true, documento: true },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')

    // Resolver PRCODEMP
    const prcodemp = this.resolverPrcodemp(cliente.documento, cliente.idSistema)

    return this.balancete.importarBalanceteSci({
      clienteId, prcodemp, anoInicio: ano, mesInicio: 1, anoFim: ano, mesFim: 12,
      substituirExistentes: true,
    })
  }

  async balanceteRefreshPeriodo(clienteId: string, anoInicio: number, mesInicio: number, anoFim: number, mesFim: number, substituirExistentes = true) {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, idSistema: true, documento: true },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')

    const idSistema = await this.garantirIdSci(cliente)
    const prcodemp = this.resolverPrcodemp(cliente.documento, idSistema)

    return this.balancete.importarBalanceteSci({
      clienteId, prcodemp, anoInicio, mesInicio, anoFim, mesFim, substituirExistentes,
    })
  }

  balanceteRefreshStatus(clienteId: string, ano: number) {
    return this.balancete.getRefreshStatus(clienteId, ano)
  }

  balanceteRefreshStatusByRange(clienteId: string, refInicio: number, refFim: number) {
    return this.balancete.getRefreshStatusByRange(clienteId, refInicio, refFim)
  }

  /**
   * Garante o ID SCI do cliente, buscando-o pelo CNPJ quando o cadastro ainda
   * não tem — e GRAVANDO o que encontrar.
   *
   * Antes, cliente sem ID SCI simplesmente não sincronizava: o erro mandava
   * preencher o campo à mão, sendo que o próprio SCI sabe responder pelo CNPJ.
   * São 119 dos 466 mensais ativos nessa situação. Agora o sistema pergunta uma
   * vez, guarda a resposta e segue — a próxima sincronização já parte do
   * cadastro.
   *
   * Falha de CONEXÃO com o SCI não vira "cliente sem ID": a mensagem separa as
   * duas coisas, porque uma se resolve preenchendo cadastro e a outra não.
   */
  private async garantirIdSci(cliente: { id: string; idSistema: string | null; documento: string }): Promise<string | null> {
    if (cliente.idSistema && Number(cliente.idSistema) > 0) return cliente.idSistema

    const cnpj = (cliente.documento || '').replace(/\D/g, '')
    if (cnpj.length !== 14) {
      throw new Error('Cliente sem CNPJ válido: não há como localizar o ID SCI automaticamente.')
    }

    let achado: { idCliente: number } | null = null
    try {
      achado = await this.sci.buscarIdSistemaPorCnpj(cnpj)
    } catch (e) {
      throw new Error(
        `Não foi possível consultar o SCI para descobrir o ID desta empresa: ${(e as Error).message}`,
      )
    }
    if (!achado?.idCliente) {
      throw new Error(
        `O CNPJ ${cnpj} não foi encontrado no SCI. Confira o documento no cadastro ou informe o ID SCI manualmente.`,
      )
    }

    const id = String(achado.idCliente)
    await prisma.cliente.update({ where: { id: cliente.id }, data: { idSistema: id } })
    console.log(`[BI] ID SCI ${id} descoberto pelo CNPJ ${cnpj} e gravado no cadastro.`)
    return id
  }

  /** Resolve PRCODEMP: exige id_sistema (ID SCI) preenchido no cadastro do cliente */
  private resolverPrcodemp(_documento: string, idSistema?: string | null): number {
    if (idSistema && Number(idSistema) > 0) return Number(idSistema)
    throw new Error('Cliente não possui ID SCI vinculado. Preencha o campo "ID SCI" na aba Integrações do cadastro do cliente.')
  }

  async balanceteExcluirPeriodo(clienteId: string, ano: number, mesInicio?: number, mesFim?: number) {
    const mi = mesInicio || 1
    const mf = mesFim || 12
    const periodoInicio = `${ano}${String(mi).padStart(2, '0')}`
    const periodoFim = `${ano}${String(mf).padStart(2, '0')}`
    return this.balancete.excluirBalancetePeriodoRange(clienteId, periodoInicio, periodoFim)
  }

  async balanceteSimular(_clienteId: string, ref: number) {
    // Placeholder — SCI simulation
    return { message: 'Simulação não implementada. Necessita conexão SCI ativa.', ref }
  }

  // ══════════════════════════════════════════════════════════════
  // Copiar categorias entre clientes
  // ══════════════════════════════════════════════════════════════
  /**
   * Copia a configuração de categorias de um cliente para outro.
   *
   * O parâmetro de entrada é o DOCUMENTO (CNPJ), que é público e adivinhável —
   * por isso os dois lados passam pelo recorte da empresa ativa do chamador.
   * Sem isso, mandar um CNPJ qualquer sobrescreveria a configuração de um
   * cliente de outro tenant. Master sem empresa ativa segue sem recorte.
   */
  async categoriasCopiar(
    documentoOrigem: string,
    documentoDestino: string,
    caller: { isMaster?: boolean; empresaId?: string } = {},
  ) {
    const doTenant: Prisma.ClienteWhereInput = caller.empresaId
      ? { empresaId: caller.empresaId }
      : caller.isMaster
        ? {}
        : { empresaId: '__none__' }

    const origem = await prisma.cliente.findFirst({
      where: { documento: documentoOrigem, status: 'ATIVO', ...doTenant },
      select: { id: true },
    })
    const destino = await prisma.cliente.findFirst({
      where: { documento: documentoDestino, status: 'ATIVO', ...doTenant },
      select: { id: true },
    })
    if (!origem) throw new Error('Cliente de origem não encontrado.')
    if (!destino) throw new Error('Cliente de destino não encontrado.')

    const catsOrigem = await prisma.clienteBiCategoria.findMany({
      where: { clienteId: origem.id },
    })

    // Buscar nomes corretos das linhas do cliente DESTINO (se já tiver balancete importado)
    const linhasDestino = await prisma.clienteBiLinha.findMany({
      where: { clienteId: destino.id },
      select: { conta: true, nomeConta: true },
      distinct: ['conta'],
    })
    const nomeDestinoMap = new Map(linhasDestino.map(l => [l.conta, l.nomeConta]))

    let copied = 0
    for (const cat of catsOrigem) {
      const nomeSci = this.sanitizeStr(nomeDestinoMap.get(cat.conta) || cat.nomeSci)
      const nomeExibicao = this.sanitizeStr(cat.nomeExibicao) || nomeSci || cat.conta

      await prisma.clienteBiCategoria.upsert({
        where: { clienteId_conta: { clienteId: destino.id, conta: cat.conta } },
        create: {
          clienteId: destino.id,
          conta: cat.conta,
          nomeSci,
          nomeExibicao,
          parentConta: cat.parentConta,
          nivel: cat.nivel,
          ordem: cat.ordem,
          tipo: cat.tipo,
          ativo: cat.ativo,
          formula: cat.formula ?? undefined,
        },
        update: {
          nomeExibicao,
          parentConta: cat.parentConta,
          nivel: cat.nivel,
          ordem: cat.ordem,
          tipo: cat.tipo,
          ativo: cat.ativo,
          formula: cat.formula ?? undefined,
        },
      })
      copied++
    }
    return { copied }
  }

  // ══════════════════════════════════════════════════════════════
  // KPI — Contas ignoradas
  // ══════════════════════════════════════════════════════════════
  async kpiContasIgnoradasGet(clienteId: string, tipoKpi: string) {
    const rows = await prisma.biKpiContaIgnorada.findMany({
      where: { clienteId, tipoKpi },
      select: { conta: true },
    })
    return rows.map(r => r.conta)
  }

  async kpiContasIgnoradasSave(clienteId: string, tipoKpi: string, contas: string[]) {
    await prisma.$transaction(async (tx) => {
      await tx.biKpiContaIgnorada.deleteMany({ where: { clienteId, tipoKpi } })
      if (contas.length > 0) {
        await tx.biKpiContaIgnorada.createMany({
          data: contas.map(conta => ({ clienteId, tipoKpi, conta })),
        })
      }
    })
    return { saved: contas.length }
  }

  // ══════════════════════════════════════════════════════════════
  // KPI — Contas incluídas (seleção do usuário para cada card)
  // ══════════════════════════════════════════════════════════════

  /**
   * Categoria DRE por tipo de KPI. Substitui o mapa de PREFIXOS que existia
   * aqui (`conta LIKE '04.%'` + `maxDots`), que tinha dois problemas:
   *
   *  - classificava por codigo de conta, quebrando em plano de contas diferente;
   *  - `maxDots: 1` OFERECIA SINTETICAS (ate nivel 2). Marcar `04.1` junto das
   *    filhas somava o mesmo valor duas vezes no KPI, sem aviso.
   *
   * Agora o seletor mostra exatamente as folhas da MESMA categoria que o cartao
   * soma. `null` = qualquer conta categorizada (o caso do lucro liquido).
   */
  private kpiCategoriaPorTipo: Record<string, string | null> = {
    receita: 'RECEITA_BRUTA',
    custos_fixos: 'CUSTO_DAS_VENDAS',
    despesas: 'DESPESAS_OPERACIONAIS',
    lucro_liquido: null,
  }

  async kpiListarContasDisponiveis(clienteId: string, tipoKpi: string, ano: number) {
    if (!(tipoKpi in this.kpiCategoriaPorTipo)) return []
    const categoria = this.kpiCategoriaPorTipo[tipoKpi] ?? null

    const periodoInicio = `${ano}01`
    const periodoFim = `${ano}12`
    const depara = await carregarDepara(clienteId)

    const rows = await prisma.$queryRawUnsafe<Array<{ conta: string; nome_conta: string; total: number }>>(
      `SELECT l.conta, l.nome_conta, SUM(l.creditos - l.debitos)::float AS total
       FROM cliente_bi_linhas l
       ${this.sqlCategoriaFolha(depara, categoria)}
       GROUP BY l.conta, l.nome_conta
       HAVING ABS(SUM(l.creditos - l.debitos)) > 0.01
       ORDER BY l.conta`,
      clienteId, periodoInicio, periodoFim,
    )
    return rows.map(r => ({ conta: r.conta, nomeConta: r.nome_conta, valor: r.total }))
  }

  async kpiContasIncluidasGet(clienteId: string, tipoKpi: string) {
    const key = `contas_incluidas_${tipoKpi}`
    const row = await prisma.biKpiRegraCalculo.findUnique({
      where: { clienteId_tipoKpi: { clienteId, tipoKpi: key } },
    })
    const regra = row?.regra as Record<string, unknown> | null
    return (regra?.contas as string[] | undefined) ?? []
  }

  async kpiContasIncluidasSave(clienteId: string, tipoKpi: string, contas: string[]) {
    const key = `contas_incluidas_${tipoKpi}`
    if (contas.length === 0) {
      await prisma.biKpiRegraCalculo.deleteMany({ where: { clienteId, tipoKpi: key } })
    } else {
      await prisma.biKpiRegraCalculo.upsert({
        where: { clienteId_tipoKpi: { clienteId, tipoKpi: key } },
        create: { clienteId, tipoKpi: key, regra: { contas } as any },
        update: { regra: { contas } as any },
      })
    }
    return { saved: contas.length }
  }

  // ══════════════════════════════════════════════════════════════
  // KPI — Regras de cálculo
  // ══════════════════════════════════════════════════════════════
  async kpiRegraCalculoGet(clienteId: string, tipoKpi: string) {
    const row = await prisma.biKpiRegraCalculo.findUnique({
      where: { clienteId_tipoKpi: { clienteId, tipoKpi } },
    })
    return row?.regra ?? null
  }

  async kpiRegraCalculoSave(clienteId: string, tipoKpi: string, regra: unknown) {
    await prisma.biKpiRegraCalculo.upsert({
      where: { clienteId_tipoKpi: { clienteId, tipoKpi } },
      create: { clienteId, tipoKpi, regra: regra as any },
      update: { regra: regra as any },
    })
    return { ok: true }
  }

  // ══════════════════════════════════════════════════════════════
  // Link público
  // ══════════════════════════════════════════════════════════════
  async linkPublicoGenerate(clienteId: string) {
    const existing = await prisma.clienteBiLink.findUnique({ where: { clienteId } })
    if (existing) {
      const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/bi-public?token=${existing.token}`
      return { token: existing.token, url }
    }

    const crypto = await import('crypto')
    const token = crypto.randomBytes(32).toString('hex')
    await prisma.clienteBiLink.create({ data: { clienteId, token } })
    const url = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/bi-public?token=${token}`
    return { token, url }
  }

  // ══════════════════════════════════════════════════════════════
  // BI Público — Resolver token
  // ══════════════════════════════════════════════════════════════
  async resolverToken(token: string) {
    const link = await prisma.clienteBiLink.findUnique({
      where: { token },
      include: {
        cliente: {
          select: {
            id: true, razaoSocial: true, documento: true, empresaId: true,
            empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true, logoUrl: true, logoDarkUrl: true } },
          },
        },
      },
    })
    if (!link) throw new Error('Link inválido ou expirado.')
    if (link.expiraEm && link.expiraEm < new Date()) throw new Error('Link expirado.')

    // Buscar logo: da empresa do cliente, ou fallback para a primeira empresa com logo
    let empresaLogo = link.cliente.empresa?.logoUrl ?? null
    let empresaLogoDark = link.cliente.empresa?.logoDarkUrl ?? null
    let empresaNome = link.cliente.empresa?.nomeFantasia ?? link.cliente.empresa?.razaoSocial ?? null

    if (!empresaLogo) {
      const fallback = await prisma.empresa.findFirst({
        where: { logoUrl: { not: null } },
        select: { razaoSocial: true, nomeFantasia: true, logoUrl: true, logoDarkUrl: true },
        orderBy: { createdAt: 'asc' },
      })
      if (fallback) {
        empresaLogo = fallback.logoUrl
        empresaLogoDark = fallback.logoDarkUrl
        empresaNome = fallback.nomeFantasia ?? fallback.razaoSocial
      }
    }

    return {
      id: link.cliente.id,
      razaoSocial: link.cliente.razaoSocial,
      documento: link.cliente.documento,
      empresaLogo,
      empresaLogoDark,
      empresaNome,
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Categorias — Backup / Restaurar / Limpar
  // ══════════════════════════════════════════════════════════════
  async categoriasBackup(documento: string) {
    const cliente = await prisma.cliente.findFirst({
      where: { documento, status: 'ATIVO' },
      select: { id: true },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')

    const categorias = await prisma.clienteBiCategoria.findMany({
      where: { clienteId: cliente.id },
      orderBy: [{ nivel: 'asc' }, { ordem: 'asc' }],
    })
    return { documento, exportedAt: new Date().toISOString(), categorias }
  }

  async categoriasRestaurar(documento: string, rawCategorias: Array<Record<string, unknown>>) {
    const cliente = await prisma.cliente.findFirst({
      where: { documento, status: 'ATIVO' },
      select: { id: true },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')

    // Normalize: accept both camelCase (new) and snake_case (SERPRO2 legacy)
    const categorias = rawCategorias.map((raw) => ({
      conta: String(raw.conta ?? raw.conta_longa ?? ''),
      nomeSci: String(raw.nomeSci ?? raw.nome_sci ?? raw.nome_conta ?? ''),
      nomeExibicao: String(raw.nomeExibicao ?? raw.nome_exibicao ?? raw.nome_exibido ?? raw.conta ?? raw.conta_longa ?? ''),
      parentConta: (raw.parentConta ?? raw.parent_conta_longa ?? raw.parentContaLonga ?? null) as string | null,
      nivel: Number(raw.nivel ?? (String(raw.conta ?? raw.conta_longa ?? '').split('.').length) ?? 1),
      ordem: Number(raw.ordem ?? 0),
      tipo: String(raw.tipo ?? raw.tipo_categoria ?? 'real'),
      ativo: raw.ativo === undefined ? true : !!raw.ativo && raw.ativo !== 0,
      formula: (raw.formula ?? null) as unknown,
    })).filter((c) => c.conta)

    // Delete all existing categories and recreate
    await prisma.$transaction(async (tx) => {
      await tx.clienteBiCategoria.deleteMany({ where: { clienteId: cliente.id } })
      for (const cat of categorias) {
        await tx.clienteBiCategoria.create({
          data: {
            clienteId: cliente.id,
            conta: cat.conta,
            nomeSci: cat.nomeSci,
            nomeExibicao: cat.nomeExibicao || cat.conta,
            parentConta: cat.parentConta || null,
            nivel: cat.nivel,
            ordem: cat.ordem,
            tipo: cat.tipo,
            ativo: cat.ativo,
            formula: cat.formula as any ?? undefined,
          },
        })
      }
    })
    return { restored: categorias.length }
  }

  /** Remove replacement characters (encoding quebrado Latin1→UTF8) */
  private sanitizeStr(s: unknown): string {
    return String(s ?? '').replace(/\uFFFD/g, '').trim()
  }

  async importarBackupCompleto(documento: string, backup: Record<string, unknown>) {
    const cliente = await prisma.cliente.findFirst({
      where: { documento, status: 'ATIVO' },
      select: { id: true },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')

    const categorias = (backup.categorias ?? []) as Array<Record<string, unknown>>
    const linhas = (backup.linhas ?? []) as Array<Record<string, unknown>>
    const consultas = (backup.consultas ?? []) as Array<Record<string, unknown>>
    let restoredCats = 0
    let importedLinhas = 0
    let importedConsultas = 0

    // Build nome lookup from linhas (para preencher nomeSci nas categorias)
    const nomeByContaFromLinhas = new Map<string, string>()
    for (const l of linhas) {
      const conta = String(l.conta ?? l.conta_longa ?? '')
      const nome = String(l.nomeConta ?? l.nome_conta ?? '')
      if (conta && nome) nomeByContaFromLinhas.set(conta, nome)
    }

    await prisma.$transaction(async (tx) => {
      // 1. Import lines first (so we have nomes)
      if (linhas.length > 0) {
        const byPeriodo = new Map<string, Array<Record<string, unknown>>>()
        for (const l of linhas) {
          const periodo = String(l.ref ?? l.periodo ?? '')
          if (!periodo) continue
          if (!byPeriodo.has(periodo)) byPeriodo.set(periodo, [])
          byPeriodo.get(periodo)!.push(l)
        }

        for (const [periodo, items] of byPeriodo) {
          await tx.clienteBiLinha.deleteMany({ where: { clienteId: cliente.id, periodo } })
          await tx.clienteBiLinha.createMany({
            data: items.map((l) => ({
              clienteId: cliente.id,
              periodo,
              conta: String(l.conta ?? l.conta_longa ?? ''),
              nomeConta: this.sanitizeStr(l.nomeConta ?? l.nome_conta),
              saldoAnterior: Number(l.saldoAnterior ?? l.saldo_anterior ?? 0),
              debitos: Number(l.debitos ?? 0),
              creditos: Number(l.creditos ?? 0),
              saldoAtual: Number(l.saldoAtual ?? l.saldo_atual ?? 0),
              movimento: Number(l.movimento ?? 0),
            })),
          })
          importedLinhas += items.length
        }
      }

      // 2. Restore categories
      if (categorias.length > 0) {
        await tx.clienteBiCategoria.deleteMany({ where: { clienteId: cliente.id } })
        for (const raw of categorias) {
          const conta = String(raw.conta ?? raw.conta_longa ?? '')
          if (!conta) continue

          // nomeSci: buscar das linhas; fallback para nome_exibicao do backup
          const nomeSci = this.sanitizeStr(
            raw.nomeSci ?? raw.nome_sci ?? raw.nome_conta
            ?? nomeByContaFromLinhas.get(conta)
            ?? raw.nome_exibicao ?? '',
          )
          const nomeExibicao = this.sanitizeStr(raw.nomeExibicao ?? raw.nome_exibicao ?? raw.nome_exibido) || nomeSci || conta

          // Formula: pode ser objeto JSON, manter como está
          let formula: unknown = raw.formula ?? undefined
          // Se tem categoria_referencia e tipo é referencia, montar formula de referência
          if (raw.categoria_referencia && String(raw.tipo_categoria ?? raw.tipo) === 'referencia') {
            formula = { operacao: 'referencia', conta: String(raw.categoria_referencia) }
          }

          await tx.clienteBiCategoria.create({
            data: {
              clienteId: cliente.id,
              conta,
              nomeSci,
              nomeExibicao,
              parentConta: (raw.parentConta ?? raw.parent_conta_longa ?? null) as string | null,
              nivel: Number(raw.nivel ?? conta.split('.').length ?? 1),
              ordem: Number(raw.ordem ?? 0),
              tipo: String(raw.tipo ?? raw.tipo_categoria ?? 'real'),
              ativo: raw.ativo === undefined ? false : !!raw.ativo && raw.ativo !== 0,
              formula: formula as any,
            },
          })
          restoredCats++
        }
      }

      // 3. Import consultas → BiCacheBalancete
      if (consultas.length > 0) {
        for (const c of consultas) {
          const ref = Number(c.ref ?? 0)
          if (!ref) continue
          await tx.biCacheBalancete.upsert({
            where: { clienteId_ref_fonte: { clienteId: cliente.id, ref, fonte: 'sci' } },
            create: {
              clienteId: cliente.id,
              ref,
              fonte: 'sci',
              totalLinhas: linhas.filter(l => Number(l.ref ?? l.periodo) === ref).length,
              payload: c as any,
            },
            update: {
              totalLinhas: linhas.filter(l => Number(l.ref ?? l.periodo) === ref).length,
              atualizadoEm: new Date(),
            },
          })
          importedConsultas++
        }
      }
    })

    // Sync categorias para preencher nomeSci de contas que podem ter ficado sem nome
    if (importedLinhas > 0) {
      await this.balancete.syncCategoriasFromLinhas(cliente.id, true)
    }

    return { restoredCats, importedLinhas, importedConsultas }
  }

  async categoriasLimpar(documento: string) {
    const cliente = await prisma.cliente.findFirst({
      where: { documento, status: 'ATIVO' },
      select: { id: true },
    })
    if (!cliente) throw new Error('Cliente não encontrado.')

    // Reset all personalizations (restore to SCI defaults)
    await prisma.$queryRawUnsafe(
      `UPDATE cliente_bi_categorias SET nome_exibicao = nome_sci, parent_conta = NULL, ordem = 0 WHERE cliente_id = $1`,
      cliente.id,
    )
    return { ok: true }
  }

  async categoriasLimparTudo() {
    const { count } = await prisma.clienteBiCategoria.deleteMany({})
    return { deleted: count }
  }

  /** Remove TODOS os dados BI de um cliente (linhas, categorias, cache, KPIs, links) */
  async limparTudoCliente(clienteId: string) {
    const [linhas, categorias, cache, contasIgnoradas, regras, links] = await prisma.$transaction([
      prisma.clienteBiLinha.deleteMany({ where: { clienteId } }),
      prisma.clienteBiCategoria.deleteMany({ where: { clienteId } }),
      prisma.biCacheBalancete.deleteMany({ where: { clienteId } }),
      prisma.biKpiContaIgnorada.deleteMany({ where: { clienteId } }),
      prisma.biKpiRegraCalculo.deleteMany({ where: { clienteId } }),
      prisma.clienteBiLink.deleteMany({ where: { clienteId } }),
    ])
    return {
      linhas: linhas.count,
      categorias: categorias.count,
      cache: cache.count,
      contasIgnoradas: contasIgnoradas.count,
      regras: regras.count,
      links: links.count,
    }
  }
}
