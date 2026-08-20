import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Custeio / rentabilidade por cliente (Gestão de Contratos — Fase 3).
 * Port do `custeioClienteService` do SERPRO2, adaptado ao schema do v2.
 *
 * Modelo: custo mensal de servir cada cliente = custo_direto (rateio do custo
 * carregado do responsável na carteira, ponderado por categoria × complexidade)
 * + custo_rateio_apoio (pool das áreas de apoio ÷ clientes mensais) + custo_tdabc
 * (horas de execução × custo/hora, opcional). Comparado à receita de referência
 * (honorário, com fator de crescimento de faturamento).
 *
 * Tudo é parametrizável por empresa (EmpresaParametroCusteio) com defaults do
 * legado. Robusto a dados ausentes: componentes sem insumo saem zerados.
 */
@Injectable()
export class CusteioService {
  private assertEmpresa(empresaId?: string): string {
    if (!empresaId) throw new Error('Selecione uma empresa para trabalhar com o custeio.')
    return empresaId
  }

  private mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/

  // ── Parâmetros ────────────────────────────────────────────────
  async getParametros(empresaId?: string) {
    const emp = this.assertEmpresa(empresaId)
    const existing = await prisma.empresaParametroCusteio.findUnique({ where: { empresaId: emp } })
    if (existing) return existing
    return prisma.empresaParametroCusteio.create({ data: { empresaId: emp } })
  }

  async saveParametros(empresaId: string | undefined, data: {
    encargosPercentual?: number; usarHorasServicos?: boolean; aplicarAumentoFaturamento?: boolean
    horasMesReferencia?: number; beneficioAlimentacaoDia?: number; beneficioValeTransporteDia?: number
    beneficioPlanoSaudeMensal?: number; multCategoriaStandard?: number; multCategoriaAdvanced?: number
    multCategoriaPremium?: number
  }) {
    const emp = this.assertEmpresa(empresaId)
    await this.getParametros(emp) // garante a linha
    const clamp = (v: number | undefined, min: number, max: number, def: number) =>
      v == null || !Number.isFinite(Number(v)) ? def : Math.min(Math.max(Number(v), min), max)
    return prisma.empresaParametroCusteio.update({
      where: { empresaId: emp },
      data: {
        ...(data.encargosPercentual !== undefined ? { encargosPercentual: clamp(data.encargosPercentual, 0, 500, 0) } : {}),
        ...(data.usarHorasServicos !== undefined ? { usarHorasServicos: !!data.usarHorasServicos } : {}),
        ...(data.aplicarAumentoFaturamento !== undefined ? { aplicarAumentoFaturamento: !!data.aplicarAumentoFaturamento } : {}),
        ...(data.horasMesReferencia !== undefined ? { horasMesReferencia: Math.round(clamp(data.horasMesReferencia, 1, 400, 160)) } : {}),
        ...(data.beneficioAlimentacaoDia !== undefined ? { beneficioAlimentacaoDia: clamp(data.beneficioAlimentacaoDia, 0, 1000, 40) } : {}),
        ...(data.beneficioValeTransporteDia !== undefined ? { beneficioValeTransporteDia: clamp(data.beneficioValeTransporteDia, 0, 200, 10.2) } : {}),
        ...(data.beneficioPlanoSaudeMensal !== undefined ? { beneficioPlanoSaudeMensal: clamp(data.beneficioPlanoSaudeMensal, 0, 5000, 162) } : {}),
        ...(data.multCategoriaStandard !== undefined ? { multCategoriaStandard: clamp(data.multCategoriaStandard, 0, 10, 1) } : {}),
        ...(data.multCategoriaAdvanced !== undefined ? { multCategoriaAdvanced: clamp(data.multCategoriaAdvanced, 0, 10, 1.2) } : {}),
        ...(data.multCategoriaPremium !== undefined ? { multCategoriaPremium: clamp(data.multCategoriaPremium, 0, 10, 1.5) } : {}),
      },
    })
  }

  // ── Helpers de cálculo ────────────────────────────────────────
  private diasUteisNoMes(ano: number, mes: number): number {
    const last = new Date(ano, mes, 0).getDate()
    let d = 0
    for (let day = 1; day <= last; day++) {
      const wd = new Date(ano, mes - 1, day).getDay()
      if (wd >= 1 && wd <= 5) d++
    }
    return d
  }

  private multCategoria(categoria: string | null, p: { multCategoriaStandard: number; multCategoriaAdvanced: number; multCategoriaPremium: number }): number {
    switch (String(categoria || '').toUpperCase()) {
      case 'STANDARD': return p.multCategoriaStandard
      case 'ADVANCED': return p.multCategoriaAdvanced
      case 'PREMIUM': return p.multCategoriaPremium
      default: return 1
    }
  }

  // ── Recálculo do mês ──────────────────────────────────────────
  async recalcularMes(empresaId: string | undefined, refMes: string, clienteId?: string | null) {
    const emp = this.assertEmpresa(empresaId)
    if (!this.mesRegex.test(String(refMes || ''))) throw new Error('Mês inválido. Use o formato AAAA-MM.')
    const partes = refMes.split('-')
    const ano = Number(partes[0])
    const mes = Number(partes[1])
    const p = await this.getParametros(emp)
    const params = {
      encargosPercentual: Number(p.encargosPercentual) || 0,
      usarHorasServicos: p.usarHorasServicos,
      aplicarAumentoFaturamento: p.aplicarAumentoFaturamento,
      horasMesReferencia: Number(p.horasMesReferencia) || 160,
      beneficioAlimentacaoDia: Number(p.beneficioAlimentacaoDia) || 0,
      beneficioValeTransporteDia: Number(p.beneficioValeTransporteDia) || 0,
      beneficioPlanoSaudeMensal: Number(p.beneficioPlanoSaudeMensal) || 0,
      multCategoriaStandard: Number(p.multCategoriaStandard) || 1,
      multCategoriaAdvanced: Number(p.multCategoriaAdvanced) || 1,
      multCategoriaPremium: Number(p.multCategoriaPremium) || 1,
    }
    const diasUteis = this.diasUteisNoMes(ano, mes)

    // 1) Áreas (direta/apoio, peso, desconsiderar). Áreas podem ser globais
    // (empresaId NULL) ou específicas do tenant — inclui ambas.
    const areas = await prisma.area.findMany({ where: { OR: [{ empresaId: emp }, { empresaId: null }] } })
    const areaMap = new Map(areas.map(a => [a.id, {
      costType: a.costType, costWeight: Number(a.costWeight) || 0, exclude: a.excludeFromCosting,
    }]))

    // 2) Colaboradores: custo carregado + pool de apoio
    const beneficiosTotal =
      diasUteis * params.beneficioAlimentacaoDia +
      params.beneficioPlanoSaudeMensal +
      diasUteis * params.beneficioValeTransporteDia
    const users = await prisma.user.findMany({
      where: { empresaId: emp, isActive: true, salario: { not: null } },
      select: { id: true, salario: true, areaId: true },
    })
    const custoCarregado = new Map<string, number>()
    let poolApoio = 0
    for (const u of users) {
      const salario = Number(u.salario) || 0
      const carregado = salario * (1 + params.encargosPercentual / 100) + beneficiosTotal
      custoCarregado.set(u.id, carregado)
      const area = u.areaId ? areaMap.get(u.areaId) : null
      if (area && area.costType === 'INDIRECT' && !area.exclude) poolApoio += carregado
    }

    // 3) Clientes candidatos (com áreas contratadas e/ou baseline), no escopo.
    const clientes = await prisma.cliente.findMany({
      where: {
        empresaId: emp,
        status: { not: 'INATIVO' },
        ...(clienteId ? { id: clienteId } : {}),
      },
      select: {
        id: true, code: true, documento: true, razaoSocial: true, categoria: true,
        situacao: true, dataSaida: true,
        servicosContratados: {
          where: { contratado: true },
          select: { areaId: true, responsavelId: true, complexidadePeso: true },
        },
        contratoParams: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
    })

    const pesoComplexidade = (v: number | null | undefined) => {
      const n = Number(v) || 0
      return n > 0 ? n : 1 // sem complexidade definida → peso neutro
    }

    // 3a) Custo direto — agrupa por (responsável, área) só de áreas DIRETAS.
    type Grupo = { custoBase: number; itens: Array<{ clienteId: string; peso: number }> }
    const grupos = new Map<string, Grupo>()
    for (const c of clientes) {
      const catMult = this.multCategoria(c.categoria, params)
      for (const s of c.servicosContratados) {
        const area = areaMap.get(s.areaId)
        if (!area || area.costType !== 'DIRECT' || area.exclude) continue
        if (!s.responsavelId) continue
        const key = `${s.responsavelId}::${s.areaId}`
        let g = grupos.get(key)
        if (!g) {
          const base = (custoCarregado.get(s.responsavelId) || 0) * area.costWeight
          g = { custoBase: base, itens: [] }
          grupos.set(key, g)
        }
        g.itens.push({ clienteId: c.id, peso: catMult * pesoComplexidade(Number(s.complexidadePeso)) })
      }
    }
    const diretoPorCliente = new Map<string, number>()
    for (const g of grupos.values()) {
      const sumW = g.itens.reduce((acc, it) => acc + it.peso, 0)
      const n = g.itens.length
      for (const it of g.itens) {
        const parcela = sumW > 0 ? g.custoBase * (it.peso / sumW) : (n > 0 ? g.custoBase / n : 0)
        diretoPorCliente.set(it.clienteId, (diretoPorCliente.get(it.clienteId) || 0) + parcela)
      }
    }

    // 3b) Rateio de apoio — pool ÷ clientes MENSAL ativos (igualitário).
    const mensais = clientes.filter(c => c.situacao === 'MENSAL' && !c.dataSaida)
    const rateioApoio = mensais.length > 0 ? poolApoio / mensais.length : 0
    const apoioClienteIds = new Set(mensais.map(c => c.id))

    // 3c) TDABC (opcional) — horas de execução concluídas no mês.
    const tdabcPorCliente = new Map<string, number>()
    if (params.usarHorasServicos) {
      try {
        const inicio = new Date(ano, mes - 1, 1)
        const fim = new Date(ano, mes, 1)
        const passos = await prisma.servicoExecucaoPasso.findMany({
          where: {
            concluido: true,
            concluidoEm: { gte: inicio, lt: fim },
            execucao: { is: { cliente: { is: { empresaId: emp, ...(clienteId ? { id: clienteId } : {}) } } } },
          },
          select: { tempoGastoMinutos: true, concluidoPor: true, execucao: { select: { clienteId: true } } },
        })
        for (const passo of passos) {
          const cid = passo.execucao?.clienteId
          if (!cid) continue
          const rate = passo.concluidoPor ? (custoCarregado.get(passo.concluidoPor) || 0) / params.horasMesReferencia : 0
          const custoH = ((Number(passo.tempoGastoMinutos) || 0) / 60) * rate
          if (custoH > 0) tdabcPorCliente.set(cid, (tdabcPorCliente.get(cid) || 0) + custoH)
        }
      } catch {
        // Sem dados/tabela de execução → TDABC fica zerado (degrada em silêncio).
      }
    }

    // 4) Receita de referência (honorário + fator de crescimento de faturamento).
    const faturamentoMesRows = await prisma.biCacheFaturamento.findMany({
      where: { clienteId: { in: clientes.map(c => c.id) }, ano, mes },
      select: { clienteId: true, valor: true },
    })
    const faturamentoMes = new Map<string, number>()
    for (const r of faturamentoMesRows) {
      faturamentoMes.set(r.clienteId, Math.max(faturamentoMes.get(r.clienteId) || 0, Number(r.valor) || 0))
    }

    // 5) Consolida por cliente e persiste (recálculo do mês inteiro ou 1 cliente).
    const linhas: Array<{
      clienteId: string; custoDireto: number; custoRateioApoio: number; custoTdabc: number
      custoTotal: number; receitaReferencia: number
      detalheJson: { categoria: string | null; faturamentoMes: number; faturamentoBase: number; honorarioBase: number }
    }> = []
    for (const c of clientes) {
      const direto = diretoPorCliente.get(c.id) || 0
      const apoio = apoioClienteIds.has(c.id) ? rateioApoio : 0
      const tdabc = tdabcPorCliente.get(c.id) || 0
      const total = direto + apoio + tdabc

      const baseline = c.contratoParams[0]
      const honorarioBase = baseline ? Number(baseline.honorario) || 0 : 0
      const faturamentoBase = baseline ? Number(baseline.faturamento) || 0 : 0
      const fatMes = faturamentoMes.get(c.id) || 0
      let receita = honorarioBase
      if (params.aplicarAumentoFaturamento && faturamentoBase > 0 && fatMes > faturamentoBase) {
        receita = honorarioBase * (fatMes / faturamentoBase)
      }

      // Só grava clientes com algum custo ou receita (evita lixo de zeros).
      if (total <= 0 && receita <= 0) continue
      linhas.push({
        clienteId: c.id,
        custoDireto: Math.round(direto * 100) / 100,
        custoRateioApoio: Math.round(apoio * 100) / 100,
        custoTdabc: Math.round(tdabc * 100) / 100,
        custoTotal: Math.round(total * 100) / 100,
        receitaReferencia: Math.round(receita * 100) / 100,
        detalheJson: { categoria: c.categoria, faturamentoMes: fatMes, faturamentoBase, honorarioBase },
      })
    }

    await prisma.$transaction(async (tx) => {
      await tx.clienteCusteioMensal.deleteMany({
        where: { empresaId: emp, refMes, ...(clienteId ? { clienteId } : {}) },
      })
      if (linhas.length > 0) {
        await tx.clienteCusteioMensal.createMany({
          data: linhas.map(l => ({ empresaId: emp, refMes, ...l })),
        })
      }
    })

    return {
      refMes,
      processados: linhas.length,
      poolApoio: Math.round(poolApoio * 100) / 100,
      clientesMensais: mensais.length,
      diasUteis,
    }
  }

  // ── Consultas ─────────────────────────────────────────────────
  async listarMes(empresaId: string | undefined, refMes: string) {
    const emp = this.assertEmpresa(empresaId)
    if (!this.mesRegex.test(String(refMes || ''))) throw new Error('Mês inválido. Use o formato AAAA-MM.')
    const rows = await prisma.clienteCusteioMensal.findMany({
      where: { empresaId: emp, refMes },
      include: { cliente: { select: { code: true, documento: true, razaoSocial: true } } },
      orderBy: { custoTotal: 'desc' },
    })
    return rows.map(r => ({
      clienteId: r.clienteId,
      numero: r.cliente.code,
      documento: r.cliente.documento,
      cliente: r.cliente.razaoSocial,
      custoDireto: r.custoDireto,
      custoRateioApoio: r.custoRateioApoio,
      custoTdabc: r.custoTdabc,
      custoTotal: r.custoTotal,
      receitaReferencia: r.receitaReferencia,
      margem: r.receitaReferencia > 0 ? Math.round(((r.receitaReferencia - r.custoTotal) / r.receitaReferencia) * 1000) / 10 : null,
    }))
  }

  /** Relatório agregado por cliente num intervalo de meses (AAAA-MM). */
  async listarRelatorio(empresaId: string | undefined, refInicio: string, refFim: string) {
    const emp = this.assertEmpresa(empresaId)
    if (!this.mesRegex.test(String(refInicio || '')) || !this.mesRegex.test(String(refFim || ''))) {
      throw new Error('Período inválido. Use o formato AAAA-MM.')
    }
    const [ini, fim] = refInicio <= refFim ? [refInicio, refFim] : [refFim, refInicio]
    const rows = await prisma.clienteCusteioMensal.findMany({
      where: { empresaId: emp, refMes: { gte: ini, lte: fim } },
      include: { cliente: { select: { code: true, documento: true, razaoSocial: true } } },
    })
    const acc = new Map<string, {
      numero: number | null; documento: string | null; cliente: string | null
      custoDireto: number; custoRateio: number; custoTdabc: number; custoTotal: number
      receitaTotal: number; meses: number
    }>()
    for (const r of rows) {
      let a = acc.get(r.clienteId)
      if (!a) {
        a = {
          numero: r.cliente.code, documento: r.cliente.documento, cliente: r.cliente.razaoSocial,
          custoDireto: 0, custoRateio: 0, custoTdabc: 0, custoTotal: 0, receitaTotal: 0, meses: 0,
        }
        acc.set(r.clienteId, a)
      }
      a.custoDireto += r.custoDireto
      a.custoRateio += r.custoRateioApoio
      a.custoTdabc += r.custoTdabc
      a.custoTotal += r.custoTotal
      a.receitaTotal += r.receitaReferencia
      a.meses += 1
    }
    const registros = [...acc.entries()].map(([clienteId, a]) => {
      const custoMedio = a.meses > 0 ? a.custoTotal / a.meses : 0
      const receitaMedia = a.meses > 0 ? a.receitaTotal / a.meses : 0
      const round = (v: number) => Math.round(v * 100) / 100
      return {
        clienteId,
        numero: a.numero,
        documento: a.documento,
        cliente: a.cliente,
        custoDiretoTotal: round(a.custoDireto),
        custoRateioTotal: round(a.custoRateio),
        custoTdabcTotal: round(a.custoTdabc),
        custoTotalPeriodo: round(a.custoTotal),
        custoMedioMensal: round(custoMedio),
        receitaTotalPeriodo: round(a.receitaTotal),
        receitaMediaMensal: round(receitaMedia),
        mesesComRegistro: a.meses,
        margemMediaMensal: receitaMedia > 0 ? Math.round(((receitaMedia - custoMedio) / receitaMedia) * 1000) / 10 : null,
      }
    }).sort((x, y) => (x.margemMediaMensal ?? 999) - (y.margemMediaMensal ?? 999))
    return { registros, periodo: { inicio: ini, fim } }
  }
}
