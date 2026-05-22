import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { BiCalculosService } from './bi-calculos.service'
import { BiBalanceteService } from './bi-balancete.service'

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
  async balanceteMatriz(clienteId: string, ano: number, _useParent = false) {
    const periodoInicio = `${ano}01`
    const periodoFim = `${ano}12`

    // 1. Get ALL categories (including non-ativo for formula operands)
    const categorias = await prisma.clienteBiCategoria.findMany({
      where: { clienteId },
    })
    const catMap = new Map(categorias.map(c => [c.conta, c]))
    const contasAtivas = new Set(categorias.filter(c => c.ativo).map(c => c.conta))

    // 2. Get all linhas for the year
    const linhas = await prisma.clienteBiLinha.findMany({
      where: { clienteId, periodo: { gte: periodoInicio, lte: periodoFim } },
    })

    // 3. Build value map: conta → ref → movimento
    const valueMap = new Map<string, Map<string, number>>()
    const refs = new Set<string>()
    for (const l of linhas) {
      refs.add(l.periodo)
      if (!valueMap.has(l.conta)) valueMap.set(l.conta, new Map())
      const refMap = valueMap.get(l.conta)!
      refMap.set(l.periodo, (refMap.get(l.periodo) || 0) + Number(l.movimento))
    }
    const sortedRefs = Array.from(refs).sort()

    // 4. Build nodes for ALL categories (needed for formula resolution)
    const nodesById = new Map<string, { valores: Map<string, number> }>()
    for (const cat of categorias) {
      const vals = valueMap.get(cat.conta) || new Map()
      nodesById.set(cat.conta, { valores: vals })
    }
    // Also add contas from linhas not in categories
    for (const [conta, vals] of valueMap) {
      if (!nodesById.has(conta)) nodesById.set(conta, { valores: vals })
    }

    // 5. Process formulas (calculada categories)
    const processadas = new Set<string>()
    const calcCats = categorias.filter(c => (c.tipo === 'calculada' || c.tipo === 'C') && c.formula)

    const aplicarOp = (acc: number, op: string, v: number): number => {
      const o = (op || 'soma').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      if (o === 'subtracao' || o === 'subtração' || o === '-') return acc - Math.abs(v)
      if (o === 'multiplicacao' || o === '*') return acc * v
      if (o === 'divisao' || o === '/') return v !== 0 ? acc / v : acc
      return acc + v // soma
    }

    const calcFormula = (formula: Record<string, unknown>, ref: string): number => {
      const operandos = (formula.operandos as string[] || []).map(String).filter(Boolean)
      const operadores = (formula.operadores as string[] || []).map(String)
      const operacao = String(formula.operacao || 'soma')

      if (operandos.length === 0) return 0
      const vals = operandos.map(opId => nodesById.get(opId)?.valores.get(ref) ?? 0)

      if (operacao === 'igualdade' || operandos.length === 1) return vals[0] ?? 0
      if (operacao === 'cadeia' && operadores.length >= operandos.length - 1) {
        let acc = vals[0] ?? 0
        for (let i = 1; i < vals.length; i++) acc = aplicarOp(acc, operadores[i - 1] || 'soma', vals[i]!)
        return acc
      }
      // Legacy: single operation between all operands
      if (operacao === 'subtracao' && vals.length === 2) return (vals[0] ?? 0) - Math.abs(vals[1] ?? 0)
      return vals.reduce((a, b) => a + b, 0)
    }

    const processarCalc = (cat: typeof calcCats[0]) => {
      if (processadas.has(cat.conta)) return
      const formula = cat.formula as Record<string, unknown>
      const operandos = (formula?.operandos as string[] || []).map(String).filter(Boolean)
      // Process dependencies first
      for (const opId of operandos) {
        const dep = calcCats.find(c => c.conta === opId)
        if (dep && !processadas.has(opId)) processarCalc(dep)
      }
      const node = nodesById.get(cat.conta) || { valores: new Map() }
      for (const ref of sortedRefs) {
        node.valores.set(ref, calcFormula(formula, ref))
      }
      nodesById.set(cat.conta, node)
      processadas.add(cat.conta)
    }
    for (const cat of calcCats) processarCalc(cat)

    // 6. Process reference categories
    for (const cat of categorias.filter(c => (c.tipo === 'referencia' || c.tipo === 'F') && c.formula)) {
      const formula = cat.formula as Record<string, unknown>
      const operandos = formula?.operandos as string[] | undefined
      const refConta = String(formula?.conta || (operandos && operandos[0]) || '')
      if (!refConta) continue
      const srcNode = nodesById.get(refConta)
      if (srcNode) nodesById.set(cat.conta, { valores: new Map(srcNode.valores) })
    }

    // 7. Find Receita Bruta for % A.V calculation
    let receitaBrutaId: string | null = null
    for (const cat of categorias) {
      const nome = (cat.nomeExibicao || cat.nomeSci || '').toUpperCase()
      if (nome.includes('RECEITA BRUTA') || nome.includes('RECEITA  BRUTA')) { receitaBrutaId = cat.conta; break }
    }
    if (!receitaBrutaId) {
      // Fallback: try conta 03.1.1
      if (nodesById.has('03.1.1')) receitaBrutaId = '03.1.1'
      else if (nodesById.has('3.1.1')) receitaBrutaId = '3.1.1'
    }
    const receitaBrutaNode = receitaBrutaId ? nodesById.get(receitaBrutaId) : null

    // 8. Detect expense/cost categories (displayed as negative)
    const isDespesa = (nome: string) => /dedu[cç]|custo|despesa|imposto|abatimento/i.test(nome)

    // 9. Build visible hierarchy (only ativo=true, skip invisible parents)
    const visibleParent = new Map<string, string | null>()
    for (const cat of categorias) {
      if (!contasAtivas.has(cat.conta)) continue
      let parent = cat.parentConta
      // Walk up to find nearest visible ancestor
      while (parent && !contasAtivas.has(parent)) {
        const parentCat = catMap.get(parent)
        parent = parentCat?.parentConta || null
      }
      visibleParent.set(cat.conta, parent || null)
    }
    const visibleChildren = new Map<string | null, string[]>()
    for (const [conta, parent] of visibleParent) {
      if (!visibleChildren.has(parent)) visibleChildren.set(parent, [])
      visibleChildren.get(parent)!.push(conta)
    }

    // 10. Sort children by ordem, then conta
    const cmpConta = (a: string, b: string) => {
      const ap = a.split('.'), bp = b.split('.')
      for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
        const an = parseInt(ap[i] || '0'), bn = parseInt(bp[i] || '0')
        if (an !== bn) return an - bn
      }
      return 0
    }
    for (const [, children] of visibleChildren) {
      children.sort((a, b) => {
        const oa = catMap.get(a)?.ordem ?? 9999, ob = catMap.get(b)?.ordem ?? 9999
        if (oa !== ob) return oa - ob
        return cmpConta(a, b)
      })
    }

    // 11. Flatten tree (DFS) in order
    type ResultRow = {
      id: string; conta: string; nomeConta: string
      level: number; parentId: string | null; hasChildren: boolean
      valores: Record<string, { realizado: number; pct_av: number }>
      total: { realizado: number; pct_av: number }
    }
    const result: ResultRow[] = []

    const walk = (parentKey: string | null, level: number) => {
      for (const conta of visibleChildren.get(parentKey) ?? []) {
        const cat = catMap.get(conta)
        const node = nodesById.get(conta)
        const nome = cat?.nomeExibicao || cat?.nomeSci || conta
        const isDesp = isDespesa(nome)
        const hasSub = (visibleChildren.get(conta)?.length ?? 0) > 0

        const valores: Record<string, { realizado: number; pct_av: number }> = {}
        let totalReal = 0

        for (const ref of sortedRefs) {
          const v = node?.valores.get(ref) ?? 0
          const realizado = isDesp ? -Math.abs(v) : v
          totalReal += realizado

          const rb = receitaBrutaNode?.valores.get(ref) ?? 0
          const pct_av = rb !== 0 ? Math.round((Math.abs(v) / Math.abs(rb)) * 100) : 0

          valores[ref] = { realizado, pct_av }
        }

        const rbTotal = sortedRefs.reduce((s, ref) => s + (receitaBrutaNode?.valores.get(ref) ?? 0), 0)
        const pctTotal = rbTotal !== 0 ? Math.round((Math.abs(totalReal) / Math.abs(rbTotal)) * 100) : 0

        result.push({
          id: conta,
          conta,
          nomeConta: nome,
          level,
          parentId: parentKey,
          hasChildren: hasSub,
          valores,
          total: { realizado: totalReal, pct_av: pctTotal },
        })

        walk(conta, level + 1)
      }
    }
    walk(null, 0)

    return { ano, refs: sortedRefs, rows: result }
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
    // Recalculate derived values if overrides applied
    if (Object.keys(overrides).length > 0) {
      finalKpis.receitaLiquida = finalKpis.receitaBruta - finalKpis.deducoes
      finalKpis.lucroBruto = finalKpis.receitaLiquida + finalKpis.custoDasVendas
    }

    return { ...finalKpis, fontesReceita, fontesDespesas, mesesCustosDespesas }
  }

  /** Soma contas selecionadas pelo usuário */
  /** Soma contas selecionadas com inversão de sinal para 04 (custos/despesas = negativo) */
  private async somarContasSelecionadas(clienteId: string, periodoInicio: string, periodoFim: string, contas: string[]) {
    if (contas.length === 0) return 0
    const placeholders = contas.map((_, i) => `$${i + 4}`).join(', ')
    // Soma cada conta com sinal: 04* = -ABS(movimento), demais = movimento
    const rows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT SUM(
        CASE WHEN conta LIKE '04%' OR conta LIKE '4%'
             THEN -ABS(movimento)
             ELSE movimento
        END
      )::float AS total
      FROM cliente_bi_linhas
      WHERE cliente_id = $1 AND periodo BETWEEN $2 AND $3 AND conta IN (${placeholders})`,
      clienteId, periodoInicio, periodoFim, ...contas,
    )
    return Number(rows[0]?.total ?? 0)
  }

  /** Top fontes de receita (contas 03 leaf, agrupadas, top 5) */
  private async buscarFontesReceita(clienteId: string, periodoInicio: string, periodoFim: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ conta: string; nome_conta: string; total: number }>>(
      `SELECT conta, nome_conta, ABS(SUM(movimento))::float AS total
       FROM cliente_bi_linhas
       WHERE cliente_id = $1 AND periodo BETWEEN $2 AND $3
         AND (conta LIKE '03.%' OR conta LIKE '3.%')
         AND NOT EXISTS (
           SELECT 1 FROM cliente_bi_linhas b2
           WHERE b2.cliente_id = cliente_bi_linhas.cliente_id
             AND b2.periodo = cliente_bi_linhas.periodo
             AND b2.conta LIKE cliente_bi_linhas.conta || '.%'
             AND LENGTH(b2.conta) > LENGTH(cliente_bi_linhas.conta)
         )
       GROUP BY conta, nome_conta
       HAVING ABS(SUM(movimento)) > 0.01
       ORDER BY ABS(SUM(movimento)) DESC
       LIMIT 5`,
      clienteId, periodoInicio, periodoFim,
    )
    return rows.map(r => ({ contaLonga: r.conta, nomeConta: r.nome_conta, valor: r.total }))
  }

  /** Top fontes de despesas (contas 04.2 leaf, top 5) */
  /** Top fontes de despesas (contas 04.2.1 + 04.2.2 leaf, SEM 04.2.3 financeiras, top 5) */
  private async buscarFontesDespesas(clienteId: string, periodoInicio: string, periodoFim: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ conta: string; nome_conta: string; total: number }>>(
      `SELECT conta, nome_conta, ABS(SUM(movimento))::float AS total
       FROM cliente_bi_linhas
       WHERE cliente_id = $1 AND periodo BETWEEN $2 AND $3
         AND (conta LIKE '04.2.1.%' OR conta LIKE '04.2.2.%')
         AND NOT EXISTS (
           SELECT 1 FROM cliente_bi_linhas b2
           WHERE b2.cliente_id = cliente_bi_linhas.cliente_id
             AND b2.periodo = cliente_bi_linhas.periodo
             AND b2.conta LIKE cliente_bi_linhas.conta || '.%'
             AND LENGTH(b2.conta) > LENGTH(cliente_bi_linhas.conta)
         )
       GROUP BY conta, nome_conta
       HAVING ABS(SUM(movimento)) > 0.01
       ORDER BY ABS(SUM(movimento)) DESC
       LIMIT 5`,
      clienteId, periodoInicio, periodoFim,
    )
    return rows.map(r => ({ contaLonga: r.conta, nomeConta: r.nome_conta, valor: r.total }))
  }

  /** Dados mensais de custos x despesas para gráfico */
  private async buscarMesesCustosDespesas(clienteId: string, periodoInicio: string, periodoFim: string) {
    // Custos Fixos (5 contas específicas, SUM com sinal) por mês — padrão SERPRO2
    const custos = await prisma.$queryRawUnsafe<Array<{ periodo: string; total: number }>>(
      `SELECT periodo, SUM(movimento)::float AS total
       FROM cliente_bi_linhas
       WHERE cliente_id = $1 AND periodo BETWEEN $2 AND $3
         AND conta IN ('04.1.1.01.001','04.1.1.01.032','04.1.1.01.033','04.1.1.01.035','04.1.1.01.036')
       GROUP BY periodo ORDER BY periodo`,
      clienteId, periodoInicio, periodoFim,
    )

    // Despesas Operacionais sem financeiras (04.2.1 + 04.2.2, leaf nodes) por mês
    const despesas = await prisma.$queryRawUnsafe<Array<{ periodo: string; total: number }>>(
      `SELECT periodo, SUM(ABS(movimento))::float AS total
       FROM cliente_bi_linhas
       WHERE cliente_id = $1 AND periodo BETWEEN $2 AND $3
         AND (conta LIKE '04.2.1.%' OR conta LIKE '04.2.2.%')
         AND NOT EXISTS (
           SELECT 1 FROM cliente_bi_linhas b2
           WHERE b2.cliente_id = cliente_bi_linhas.cliente_id
             AND b2.periodo = cliente_bi_linhas.periodo
             AND b2.conta LIKE cliente_bi_linhas.conta || '.%'
             AND LENGTH(b2.conta) > LENGTH(cliente_bi_linhas.conta)
         )
       GROUP BY periodo ORDER BY periodo`,
      clienteId, periodoInicio, periodoFim,
    )

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

    // Get monthly data for key metrics
    const tipos = ['receita_bruta', 'deducoes', 'custo_das_vendas', 'despesas_operacionais', 'receitas_financeiras', 'despesas_financeiras']
    const result: Record<string, Array<{ periodo: string; mes: string; valor: number }>> = {}

    for (const tipo of tipos) {
      result[tipo] = await this.calculos.obterDadosMensais(clienteId, periodoInicio, periodoFim, tipo as any)
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

    // Faturamento = Receita Bruta - Deduções
    indicadoresHorizontais.faturamento = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('receita_bruta', p) - getVal('deducoes', p),
    }))

    // Despesas Operacionais = 04.2.1 + 04.2.2 (já temos)
    indicadoresHorizontais.despesas_operacionais = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('despesas_operacionais', p),
    }))

    // EBITDA Técnico = Receita Bruta - Deduções + Receitas Financeiras - Custos - Despesas Op
    indicadoresHorizontais.ebitda = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('receita_bruta', p) - getVal('deducoes', p) + getVal('receitas_financeiras', p)
        - Math.abs(getVal('custo_das_vendas', p)) - getVal('despesas_operacionais', p),
    }))

    // EBITDA Simplificado = Receita Bruta - Deduções - Custos - Despesas Op
    indicadoresHorizontais.ebitda_simplificado = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('receita_bruta', p) - getVal('deducoes', p)
        - Math.abs(getVal('custo_das_vendas', p)) - getVal('despesas_operacionais', p),
    }))

    // Lucro Líquido = Receita Bruta - Deduções - Custos - Despesas Op - Despesas Fin + Receitas Fin
    indicadoresHorizontais.lucro_liquido = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('receita_bruta', p) - getVal('deducoes', p)
        - Math.abs(getVal('custo_das_vendas', p)) - getVal('despesas_operacionais', p)
        - getVal('despesas_financeiras', p) + getVal('receitas_financeiras', p),
    }))

    // Margem de Contribuição = Receita Bruta - Deduções - Custos
    indicadoresHorizontais.margem_contribuicao = periodos.map(p => ({
      mes: Number(p.slice(4)),
      valor: getVal('receita_bruta', p) - getVal('deducoes', p) - Math.abs(getVal('custo_das_vendas', p)),
    }))

    return { analiseVertical, analiseHorizontal, dadosMensais: result, indicadoresHorizontais }
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

    const prcodemp = this.resolverPrcodemp(cliente.documento, cliente.idSistema)

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
  async categoriasCopiar(documentoOrigem: string, documentoDestino: string) {
    const origem = await prisma.cliente.findFirst({
      where: { documento: documentoOrigem, deletedAt: null },
      select: { id: true },
    })
    const destino = await prisma.cliente.findFirst({
      where: { documento: documentoDestino, deletedAt: null },
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

  /** Padrões SQL por tipo de KPI para listar contas disponíveis */
  private kpiContaPatterns: Record<string, { sql: string; maxDots: number }> = {
    receita: { sql: "(conta LIKE '03.%' OR conta LIKE '3.%')", maxDots: 2 },
    custos_fixos: { sql: "(conta LIKE '04.%')", maxDots: 1 },
    despesas: { sql: "(conta LIKE '04.%')", maxDots: 3 },
    lucro_liquido: { sql: "(conta LIKE '03.%' OR conta LIKE '04.%')", maxDots: 1 },
  }

  async kpiListarContasDisponiveis(clienteId: string, tipoKpi: string, ano: number) {
    const config = this.kpiContaPatterns[tipoKpi]
    if (!config) return []

    const periodoInicio = `${ano}01`
    const periodoFim = `${ano}12`

    // Contas 04 (custos/despesas): inverter sinal para exibir como negativo
    const rows = await prisma.$queryRawUnsafe<Array<{ conta: string; nome_conta: string; total: number }>>(
      `SELECT conta, nome_conta,
              CASE WHEN conta LIKE '04%' OR conta LIKE '4%'
                   THEN -ABS(SUM(movimento))
                   ELSE SUM(movimento)
              END::float AS total
       FROM cliente_bi_linhas
       WHERE cliente_id = $1 AND periodo BETWEEN $2 AND $3
         AND ${config.sql}
         AND LENGTH(conta) - LENGTH(REPLACE(conta, '.', '')) <= ${config.maxDots}
       GROUP BY conta, nome_conta
       HAVING ABS(SUM(movimento)) > 0.01
       ORDER BY conta`,
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
      where: { documento, deletedAt: null },
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
      where: { documento, deletedAt: null },
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
      where: { documento, deletedAt: null },
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
      where: { documento, deletedAt: null },
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
