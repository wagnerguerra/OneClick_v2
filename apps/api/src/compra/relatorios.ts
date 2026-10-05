/**
 * Relatórios do módulo Aquisições — cálculo puro, sem banco (testável).
 *
 *   IQF        Índice de Qualidade do Fornecedor: % de "Atende" nos critérios
 *              da avaliação, por fornecedor. É a evidência de avaliação e
 *              reavaliação de fornecedores pedida pela ISO 9001 (item 8.4).
 *   Gastos     spend analysis: quanto foi comprado de quem, com a curva ABC
 *              (Pareto) e a evolução mês a mês.
 *   Conferência pedido × nota fiscal ("three-way match"): pedidos cujas notas
 *              não fecham com o total do pedido.
 */

export interface PedidoRelatorio {
  id: string
  code: number
  status: string
  fornecedorId: string
  fornecedor: string
  /** Data de referência do pedido (solicitação, senão criação). */
  data: Date
  dataAvaliacao: Date | null
  /** Itens + frete. */
  totalPedido: number
  /** Valor informado na avaliação (pode ser a soma de várias notas). */
  nfValorAvaliacao: number | null
  /** Soma das notas das entregas (recebimento por item). */
  nfValorRecebimentos: number | null
  /** Soma das notas lidas dos DANFEs anexados. */
  nfValorAnexos: number | null
  tipoFornecimento: string | null
  melhoria: boolean
  respostas: Array<{ criterio: string; ordem: number; atende: boolean }>
}

/** Pedido que entra no gasto: aprovado em diante (não conta rascunho nem reprovado). */
const STATUS_COM_GASTO = new Set(['APROVADO', 'RECEBIDO_PARCIAL', 'RECEBIDO', 'AVALIADO'])

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Valor gasto: a nota quando há (é o que foi pago), senão o total do pedido.
 *
 * Mas só nota PLAUSÍVEL — entre metade e o dobro do pedido. O histórico tem
 * erro de digitação que, aceito, distorce tudo: o #30 (pedido de R$ 1.864) tem
 * nota de R$ 5.335.255 e sozinho virava 97% do gasto de 12 anos; o #616 tem
 * R$ 1,74 numa compra de R$ 1.735,39. Fora da faixa vale o pedido, e a
 * conferência pedido × nota aponta o erro para ser corrigido.
 */
export function valorGasto(p: PedidoRelatorio): { valor: number; fonte: 'nf' | 'pedido' | 'nf_suspeita' } {
  const nf = p.nfValorAvaliacao ?? p.nfValorRecebimentos ?? p.nfValorAnexos
  if (nf == null || nf <= 0) return { valor: p.totalPedido, fonte: 'pedido' }
  if (p.totalPedido > 0 && (nf > p.totalPedido * 2 || nf < p.totalPedido / 2)) {
    return { valor: p.totalPedido, fonte: 'nf_suspeita' }
  }
  return { valor: nf, fonte: 'nf' }
}

// ── IQF ────────────────────────────────────────────────────────

export type ClasseIqf = 'APROVADO' | 'RESTRICAO' | 'REPROVADO'

/** Faixas usuais de IQF: ≥ 90% aprovado; 70–89,9% com restrição; < 70% reprovado. */
export function classificarIqf(pct: number): ClasseIqf {
  return pct >= 90 ? 'APROVADO' : pct >= 70 ? 'RESTRICAO' : 'REPROVADO'
}

export interface LinhaIqf {
  fornecedorId: string
  fornecedor: string
  avaliacoes: number
  /** % de "Atende" sobre as respostas dadas, 0–100. */
  iqf: number
  classe: ClasseIqf
  /** Por critério (na ordem do catálogo): % de atende e respostas. */
  criterios: Array<{ criterio: string; pct: number; respostas: number }>
  melhorias: number
  ultimaAvaliacao: Date | null
}

export function montarIqf(pedidos: PedidoRelatorio[]) {
  const nomesCriterios = new Map<string, number>()
  const por = new Map<string, {
    fornecedor: string; avaliacoes: number; melhorias: number; ultima: Date | null
    crit: Map<string, { sim: number; total: number }>
  }>()

  for (const p of pedidos) {
    // Avaliação sem nenhuma resposta não tem o que medir (critérios são opcionais).
    if (!p.respostas.length) continue
    const f = por.get(p.fornecedorId) ?? { fornecedor: p.fornecedor, avaliacoes: 0, melhorias: 0, ultima: null, crit: new Map() }
    f.avaliacoes++
    if (p.melhoria) f.melhorias++
    const quando = p.dataAvaliacao ?? p.data
    if (!f.ultima || quando > f.ultima) f.ultima = quando
    for (const r of p.respostas) {
      nomesCriterios.set(r.criterio, Math.min(nomesCriterios.get(r.criterio) ?? r.ordem, r.ordem))
      const c = f.crit.get(r.criterio) ?? { sim: 0, total: 0 }
      c.total++
      if (r.atende) c.sim++
      f.crit.set(r.criterio, c)
    }
    por.set(p.fornecedorId, f)
  }

  const criterios = [...nomesCriterios.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n)
  const linhas: LinhaIqf[] = [...por.entries()].map(([fornecedorId, f]) => {
    let sim = 0, total = 0
    for (const c of f.crit.values()) { sim += c.sim; total += c.total }
    const iqf = total ? r2((sim / total) * 100) : 0
    return {
      fornecedorId, fornecedor: f.fornecedor, avaliacoes: f.avaliacoes, iqf, classe: classificarIqf(iqf),
      criterios: criterios.map((nome) => {
        const c = f.crit.get(nome)
        return { criterio: nome, pct: c?.total ? r2((c.sim / c.total) * 100) : 0, respostas: c?.total ?? 0 }
      }),
      melhorias: f.melhorias, ultimaAvaliacao: f.ultima,
    }
  })
  // Pior primeiro: é onde se age.
  linhas.sort((a, b) => a.iqf - b.iqf || b.avaliacoes - a.avaliacoes || a.fornecedor.localeCompare(b.fornecedor, 'pt-BR'))

  const resumo = {
    fornecedores: linhas.length,
    avaliacoes: linhas.reduce((t, l) => t + l.avaliacoes, 0),
    aprovados: linhas.filter((l) => l.classe === 'APROVADO').length,
    restricao: linhas.filter((l) => l.classe === 'RESTRICAO').length,
    reprovados: linhas.filter((l) => l.classe === 'REPROVADO').length,
    melhorias: linhas.reduce((t, l) => t + l.melhorias, 0),
    /** IQF geral, ponderado pelas respostas. */
    iqfGeral: (() => {
      let sim = 0, total = 0
      for (const p of pedidos) for (const r of p.respostas) { total++; if (r.atende) sim++ }
      return total ? r2((sim / total) * 100) : null
    })(),
  }
  return { criterios, linhas, resumo }
}

// ── Gastos + curva ABC ─────────────────────────────────────────

export type ClasseAbc = 'A' | 'B' | 'C'

export function montarGastos(pedidos: PedidoRelatorio[]) {
  const comGasto = pedidos.filter((p) => STATUS_COM_GASTO.has(p.status))
  const total = comGasto.reduce((t, p) => t + valorGasto(p).valor, 0)

  const porForn = new Map<string, { fornecedor: string; valor: number; pedidos: number }>()
  const porMes = new Map<string, { valor: number; pedidos: number }>()
  const porTipo = new Map<string, number>()
  let viaNf = 0
  let nfSuspeita = 0

  for (const p of comGasto) {
    const { valor, fonte } = valorGasto(p)
    if (fonte === 'nf') viaNf++
    if (fonte === 'nf_suspeita') nfSuspeita++
    const f = porForn.get(p.fornecedorId) ?? { fornecedor: p.fornecedor, valor: 0, pedidos: 0 }
    f.valor += valor; f.pedidos++
    porForn.set(p.fornecedorId, f)
    const mes = `${p.data.getUTCFullYear()}-${String(p.data.getUTCMonth() + 1).padStart(2, '0')}`
    const m = porMes.get(mes) ?? { valor: 0, pedidos: 0 }
    m.valor += valor; m.pedidos++
    porMes.set(mes, m)
    const tipo = p.tipoFornecimento ?? 'NAO_INFORMADO'
    porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + valor)
  }

  // Curva ABC: ordena do maior gasto e acumula. A = até 80% do gasto, B = até
  // 95%, C = o resto. A classe é decidida pelo acumulado ANTES do fornecedor:
  // quem cruza a fronteira dos 80% ainda é A (é ele que completa o grosso).
  let acumulado = 0
  const fornecedores = [...porForn.entries()]
    .sort((a, b) => b[1].valor - a[1].valor)
    .map(([fornecedorId, f]) => {
      const antes = total ? (acumulado / total) * 100 : 0
      acumulado += f.valor
      const classe: ClasseAbc = antes < 80 ? 'A' : antes < 95 ? 'B' : 'C'
      return {
        fornecedorId, fornecedor: f.fornecedor, pedidos: f.pedidos, valor: r2(f.valor),
        pct: total ? r2((f.valor / total) * 100) : 0,
        acumuladoPct: total ? r2((acumulado / total) * 100) : 0,
        classe,
      }
    })

  return {
    total: r2(total),
    pedidos: comGasto.length,
    /** Quantos pedidos tiveram o valor tirado da nota (o resto, do pedido). */
    viaNf,
    /** Notas fora da faixa plausível — o gasto usou o pedido (ver valorGasto). */
    nfSuspeita,
    ticketMedio: comGasto.length ? r2(total / comGasto.length) : 0,
    fornecedores,
    abc: (['A', 'B', 'C'] as const).map((c) => {
      const fs = fornecedores.filter((f) => f.classe === c)
      const v = fs.reduce((t, f) => t + f.valor, 0)
      return { classe: c, fornecedores: fs.length, valor: r2(v), pct: total ? r2((v / total) * 100) : 0 }
    }),
    meses: [...porMes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, m]) => ({ mes, valor: r2(m.valor), pedidos: m.pedidos })),
    tipos: [...porTipo.entries()].sort((a, b) => b[1] - a[1]).map(([tipo, valor]) => ({ tipo, valor: r2(valor) })),
  }
}

// ── Conferência pedido × nota ──────────────────────────────────

/** Diferença abaixo disto é arredondamento, não divergência. */
const TOLERANCIA = 0.05

export function montarConferencia(pedidos: PedidoRelatorio[]) {
  const recebidos = pedidos.filter((p) => ['RECEBIDO_PARCIAL', 'RECEBIDO', 'AVALIADO'].includes(p.status))
  const linhas = recebidos.flatMap((p) => {
    // A fonte mais completa primeiro: a avaliação junta todas as notas.
    const fonte = p.nfValorAvaliacao != null ? 'avaliacao' as const
      : p.nfValorRecebimentos != null ? 'recebimento' as const
      : p.nfValorAnexos != null ? 'danfe' as const : null
    if (!fonte) return []
    const nf = (p.nfValorAvaliacao ?? p.nfValorRecebimentos ?? p.nfValorAnexos) as number
    const diferenca = r2(nf - p.totalPedido)
    return [{
      id: p.id, code: p.code, fornecedor: p.fornecedor, data: p.data, status: p.status,
      totalPedido: r2(p.totalPedido), totalNf: r2(nf), diferenca,
      diferencaPct: p.totalPedido ? r2((diferenca / p.totalPedido) * 100) : null,
      fonte,
    }]
  })
  const divergentes = linhas.filter((l) => Math.abs(l.diferenca) > TOLERANCIA)
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca))
  return {
    conferidos: linhas.length,
    /** Recebidos sem nenhum valor de nota — não dá para conferir. */
    semNf: recebidos.length - linhas.length,
    divergentes,
    acima: r2(divergentes.filter((d) => d.diferenca > 0).reduce((t, d) => t + d.diferenca, 0)),
    abaixo: r2(divergentes.filter((d) => d.diferenca < 0).reduce((t, d) => t + d.diferenca, 0)),
  }
}
