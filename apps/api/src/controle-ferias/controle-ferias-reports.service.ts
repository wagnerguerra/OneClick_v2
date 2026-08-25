import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import {
  diasDoEvento, saldoDoPeriodo, limiteConcessivo, farolVencimento, diasNoMes,
  limitePagamento, iso, type Farol,
} from './ferias-calc'

/**
 * Relatórios do Controle de Férias.
 *
 * O v1 não tinha nenhum — a conferência era feita na tela de lançamento, o que
 * só responde "quanto fulano tem". Estes respondem as perguntas que custam
 * dinheiro: quem está para vencer (dobra do art. 137), quem sai em cada mês
 * (escala), o que está por pagar (art. 145) e quanto a empresa deve em dias e
 * em reais (provisão).
 *
 * Tudo sai do mesmo cálculo de `ferias-calc.ts` que a listagem usa.
 */

/** Um gozo, já com os dias contados. */
interface GozoRel {
  id: string
  inicio: Date
  fim: Date
  dias: number
  descricao: string | null
}

interface PeriodoRel {
  id: string
  numero: number
  periodoInicial: number
  periodoFinal: number
  descricao: string | null
  dias: number
  saldoAnterior: number
  gozados: number
  saldo: number
  previsao: Date | null
  pagamento1: Date | null
  pagamento2: Date | null
  pagamento3: Date | null
  pago: boolean
  historico: boolean
  arquivos: number
  gozos: GozoRel[]
  limite: Date
  limiteAproximado: boolean
  farol: Farol
  diasRestantes: number
}

interface ColaboradorRel {
  id: string | null
  chave: string
  nome: string
  imagem: string | null
  /** null = nem existe no cadastro (resíduo do v1, só o nome sobrou). */
  ativo: boolean | null
  admissao: Date | null
  salario: number | null
  areaId: string | null
  area: string | null
  cargo: string | null
  periodos: PeriodoRel[]
}

export interface FiltroRelatorio {
  areaId?: string
  /** Traz também desligados e o resíduo do v1 (por padrão, só quem está ativo). */
  incluirInativos?: boolean
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

@Injectable()
export class ControleFeriasReportsService {
  // ── Base comum ─────────────────────────────────────────────────

  /**
   * Monta a visão por colaborador: o cadastro (que é quem manda, mesmo sem
   * período lançado) cruzado com os períodos de férias. Quem tem período mas
   * não existe mais no cadastro entra como resíduo, sem sumir da conta.
   */
  private async carregar(empresaId: string | null | undefined, filtro: FiltroRelatorio = {}) {
    const hoje = new Date()
    const [periodos, usuarios] = await Promise.all([
      prisma.feriasPeriodo.findMany({
        where: { empresaId: empresaId ?? null },
        include: {
          eventos: { select: { id: true, dataInicio: true, dataFim: true, descricao: true }, orderBy: { dataInicio: 'asc' } },
          _count: { select: { arquivos: true } },
        },
      }),
      prisma.user.findMany({
        where: {
          OR: [{ empresaId: empresaId ?? null }, { empresaId: null }],
          ...(filtro.incluirInativos ? {} : { isActive: true }),
          ...(filtro.areaId ? { areaId: filtro.areaId } : {}),
        },
        select: {
          id: true, name: true, image: true, isActive: true, dataAdmissao: true, salario: true,
          area: { select: { id: true, name: true } },
          cargo: { select: { name: true } },
        },
      }),
    ])

    const colaboradores = new Map<string, ColaboradorRel>()
    for (const u of usuarios) {
      colaboradores.set(`id:${u.id}`, {
        id: u.id,
        chave: `id:${u.id}`,
        nome: u.name,
        imagem: u.image,
        ativo: u.isActive,
        admissao: u.dataAdmissao,
        salario: u.salario === null ? null : Number(u.salario),
        areaId: u.area?.id ?? null,
        area: u.area?.name ?? null,
        cargo: u.cargo?.name ?? null,
        periodos: [],
      })
    }

    for (const p of periodos) {
      const chave = p.colaboradorId
        ? `id:${p.colaboradorId}`
        : `nome:${String(p.colaboradorNome ?? '').toLocaleLowerCase('pt-BR').trim()}`
      let c = colaboradores.get(chave)
      if (!c) {
        // Período de quem não está no recorte (desligado, outra área) ou de
        // quem sumiu do cadastro. Só entra quando o filtro pede os inativos.
        if (!filtro.incluirInativos) continue
        if (filtro.areaId) continue
        c = {
          id: p.colaboradorId, chave, nome: p.colaboradorNome ?? 'Sem colaborador',
          imagem: null, ativo: null, admissao: null, salario: null,
          areaId: null, area: null, cargo: null, periodos: [],
        }
        colaboradores.set(chave, c)
      }
      const { gozados, saldo } = saldoDoPeriodo(p)
      const { limite, aproximado } = limiteConcessivo(p.periodoFinal, c.admissao)
      const { farol, diasRestantes } = farolVencimento(limite, hoje)
      c.periodos.push({
        id: p.id, numero: p.numero,
        periodoInicial: p.periodoInicial, periodoFinal: p.periodoFinal,
        descricao: p.descricao,
        dias: p.dias, saldoAnterior: p.saldoAnterior, gozados, saldo,
        previsao: p.previsao,
        pagamento1: p.pagamento1, pagamento2: p.pagamento2, pagamento3: p.pagamento3,
        pago: p.pago, historico: p.historico,
        arquivos: p._count.arquivos,
        gozos: p.eventos.map((e) => ({
          id: e.id, inicio: e.dataInicio, fim: e.dataFim,
          dias: diasDoEvento(e.dataInicio, e.dataFim), descricao: e.descricao,
        })),
        limite, limiteAproximado: aproximado, farol, diasRestantes,
      })
    }

    const lista = [...colaboradores.values()]
    for (const c of lista) {
      c.periodos.sort((a, b) => (b.periodoInicial - a.periodoInicial) || (b.periodoFinal - a.periodoFinal))
    }
    lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    return lista
  }

  /** Períodos que ainda pesam: fora do histórico e com saldo a gozar. */
  private emAberto(c: ColaboradorRel): PeriodoRel[] {
    return c.periodos.filter((p) => !p.historico && p.saldo > 0)
  }

  private linhaColaborador(c: ColaboradorRel) {
    return {
      colaboradorId: c.id, nome: c.nome, imagem: c.imagem, ativo: c.ativo,
      area: c.area, cargo: c.cargo, admissao: iso(c.admissao),
    }
  }

  // ── 1. Painel ──────────────────────────────────────────────────

  /**
   * Abertura dos relatórios: o tamanho do passivo, o risco legal e o
   * movimento do ano. Também aponta o que falta no cadastro — sem data de
   * admissão o prazo legal só pode ser aproximado, e isso precisa ficar à
   * vista em vez de virar número errado com cara de certo.
   */
  async painel(empresaId: string | null | undefined, filtro: FiltroRelatorio = {}) {
    const colabs = await this.carregar(empresaId, filtro)
    const hoje = new Date()
    const mesAtual = hoje.getUTCFullYear() * 100 + hoje.getUTCMonth()

    let diasEmAberto = 0
    let comSaldo = 0
    let periodosVigentes = 0
    let gozosNoMes = 0
    let pagos = 0
    let aPagar = 0
    let semRecibo = 0
    const contaFarol: Record<Farol, number> = { VENCIDO: 0, CRITICO: 0, ATENCAO: 0, OK: 0 }
    const porArea = new Map<string, { areaId: string | null; area: string; colaboradores: number; dias: number }>()
    const porMes = new Map<number, { dias: number; pessoas: Set<string> }>()

    for (const c of colabs) {
      const abertos = this.emAberto(c)
      const dias = abertos.reduce((acc, p) => acc + p.saldo, 0)
      diasEmAberto += dias
      periodosVigentes += abertos.length
      if (dias > 0) comSaldo++
      for (const p of abertos) contaFarol[p.farol]++

      if (dias > 0) {
        const k = c.areaId ?? '—'
        const atual = porArea.get(k) ?? { areaId: c.areaId, area: c.area ?? 'Sem área', colaboradores: 0, dias: 0 }
        atual.colaboradores++
        atual.dias += dias
        porArea.set(k, atual)
      }

      for (const p of c.periodos) {
        if (!p.historico) { if (p.pago) pagos++; else aPagar++ }
        if (p.gozados > 0 && p.arquivos === 0) semRecibo++
        for (const g of p.gozos) {
          const ini = new Date(g.inicio)
          const chaveMes = ini.getUTCFullYear() * 100 + ini.getUTCMonth()
          const reg = porMes.get(chaveMes) ?? { dias: 0, pessoas: new Set<string>() }
          reg.dias += g.dias
          reg.pessoas.add(c.chave)
          porMes.set(chaveMes, reg)
          if (chaveMes === mesAtual) gozosNoMes += g.dias
        }
      }
    }

    // Últimos 12 meses, sempre com todos os meses (mês vazio também informa).
    const gozosPorMes: Array<{ mes: string; label: string; dias: number; pessoas: number }> = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1))
      const chave = d.getUTCFullYear() * 100 + d.getUTCMonth()
      const reg = porMes.get(chave)
      gozosPorMes.push({
        mes: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        label: `${MESES[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`,
        dias: reg?.dias ?? 0,
        pessoas: reg?.pessoas.size ?? 0,
      })
    }

    const semAdmissao = colabs
      .filter((c) => c.ativo === true && !c.admissao)
      .map((c) => ({ colaboradorId: c.id, nome: c.nome, area: c.area }))
    const semPeriodo = colabs
      .filter((c) => c.ativo === true && c.periodos.length === 0)
      .map((c) => ({ colaboradorId: c.id, nome: c.nome, area: c.area, admissao: iso(c.admissao) }))

    return {
      resumo: {
        colaboradores: colabs.length,
        comSaldo,
        diasEmAberto,
        periodosVigentes,
        vencidos: contaFarol.VENCIDO,
        vencendo90: contaFarol.CRITICO + contaFarol.ATENCAO,
        gozosNoMes,
        pagos,
        aPagar,
        semRecibo,
      },
      farol: (['VENCIDO', 'CRITICO', 'ATENCAO', 'OK'] as Farol[]).map((f) => ({ farol: f, total: contaFarol[f] })),
      saldoPorArea: [...porArea.values()].sort((a, b) => b.dias - a.dias),
      gozosPorMes,
      pendencias: { semAdmissao, semPeriodo },
    }
  }

  // ── 2. Vencimentos (risco de dobra) ────────────────────────────

  /**
   * O relatório que evita multa: para cada período em aberto, até quando a
   * empresa pode conceder. Vencido = art. 137, férias devidas em dobro.
   */
  async vencimentos(empresaId: string | null | undefined, filtro: FiltroRelatorio = {}) {
    const colabs = await this.carregar(empresaId, filtro)
    const rows = colabs.flatMap((c) => this.emAberto(c).map((p) => ({
      ...this.linhaColaborador(c),
      periodoId: p.id,
      numero: p.numero,
      periodo: `${p.periodoInicial}/${p.periodoFinal}`,
      dias: p.dias + p.saldoAnterior,
      gozados: p.gozados,
      saldo: p.saldo,
      previsao: iso(p.previsao),
      limite: iso(p.limite),
      limiteAproximado: p.limiteAproximado,
      diasRestantes: p.diasRestantes,
      farol: p.farol,
    })))

    // Pior caso primeiro: quem já venceu, depois quem vence antes.
    rows.sort((a, b) => a.diasRestantes - b.diasRestantes || a.nome.localeCompare(b.nome, 'pt-BR'))

    const resumo = {
      total: rows.length,
      vencidos: rows.filter((r) => r.farol === 'VENCIDO').length,
      criticos: rows.filter((r) => r.farol === 'CRITICO').length,
      atencao: rows.filter((r) => r.farol === 'ATENCAO').length,
      ok: rows.filter((r) => r.farol === 'OK').length,
      diasVencidos: rows.filter((r) => r.farol === 'VENCIDO').reduce((a, r) => a + r.saldo, 0),
      aproximados: rows.filter((r) => r.limiteAproximado).length,
    }
    return { resumo, rows }
  }

  // ── 3. Saldos (espelho do colaborador) ─────────────────────────

  /** O extrato que se entrega quando o colaborador pergunta quanto tem. */
  async saldos(empresaId: string | null | undefined, filtro: FiltroRelatorio = {}) {
    const colabs = await this.carregar(empresaId, filtro)
    const rows = colabs.map((c) => {
      const abertos = this.emAberto(c)
      return {
        ...this.linhaColaborador(c),
        chave: c.chave,
        disponivel: abertos.reduce((a, p) => a + p.saldo, 0),
        periodosAbertos: abertos.length,
        totalPeriodos: c.periodos.length,
        proximoLimite: abertos.length ? iso(abertos[abertos.length - 1]!.limite) : null,
        periodos: c.periodos.map((p) => ({
          id: p.id, numero: p.numero,
          periodo: `${p.periodoInicial}/${p.periodoFinal}`,
          descricao: p.descricao,
          dias: p.dias + p.saldoAnterior,
          gozados: p.gozados,
          saldo: p.saldo,
          previsao: iso(p.previsao),
          pago: p.pago,
          historico: p.historico,
          limite: iso(p.limite),
          limiteAproximado: p.limiteAproximado,
          arquivos: p.arquivos,
        })),
      }
    })
    const totalDias = rows.reduce((a, r) => a + r.disponivel, 0)
    return { resumo: { colaboradores: rows.length, totalDias }, rows }
  }

  // ── 4. Escala anual (mapa de férias) ───────────────────────────

  /**
   * Quem sai em cada mês do ano — e quantos saem juntos na mesma área. É a
   * pergunta que a lista não responde: se aprovar estas férias, quem fica no
   * setor em janeiro?
   */
  async escala(empresaId: string | null | undefined, ano: number, filtro: FiltroRelatorio = {}) {
    const colabs = await this.carregar(empresaId, filtro)
    const linhas: Array<{
      colaboradorId: string | null; nome: string; imagem: string | null; area: string | null
      meses: number[]; total: number
    }> = []
    const gozos: Array<{
      colaboradorId: string | null; nome: string; area: string | null
      periodoId: string; periodo: string; inicio: string | null; fim: string | null; dias: number; descricao: string | null
    }> = []
    const porAreaMes = new Map<string, { area: string; meses: number[] }>()
    const totalMes = Array.from({ length: 12 }, () => ({ dias: 0, pessoas: new Set<string>() }))

    for (const c of colabs) {
      const meses = Array.from({ length: 12 }, () => 0)
      let total = 0
      for (const p of c.periodos) {
        for (const g of p.gozos) {
          let noAno = 0
          for (let m = 0; m < 12; m++) {
            const d = diasNoMes(g.inicio, g.fim, ano, m)
            if (!d) continue
            meses[m]! += d
            noAno += d
            totalMes[m]!.dias += d
            totalMes[m]!.pessoas.add(c.chave)
            const k = c.areaId ?? '—'
            const reg = porAreaMes.get(k) ?? { area: c.area ?? 'Sem área', meses: Array.from({ length: 12 }, () => 0) }
            reg.meses[m]! += d
            porAreaMes.set(k, reg)
          }
          if (noAno > 0) {
            total += noAno
            gozos.push({
              colaboradorId: c.id, nome: c.nome, area: c.area,
              periodoId: p.id, periodo: `${p.periodoInicial}/${p.periodoFinal}`,
              inicio: iso(g.inicio), fim: iso(g.fim), dias: g.dias, descricao: g.descricao,
            })
          }
        }
      }
      if (total > 0) linhas.push({ colaboradorId: c.id, nome: c.nome, imagem: c.imagem, area: c.area, meses, total })
    }

    linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    gozos.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))

    return {
      ano,
      meses: MESES,
      linhas,
      gozos,
      porMes: totalMes.map((t, m) => ({ mes: m, label: MESES[m]!, dias: t.dias, pessoas: t.pessoas.size })),
      porArea: [...porAreaMes.values()].sort((a, b) => a.area.localeCompare(b.area, 'pt-BR')),
      resumo: {
        colaboradores: linhas.length,
        dias: linhas.reduce((a, l) => a + l.total, 0),
        picoMes: totalMes.reduce((melhor, t, m) => (t.pessoas.size > melhor.pessoas ? { mes: m, pessoas: t.pessoas.size } : melhor), { mes: -1, pessoas: 0 }),
      },
    }
  }

  // ── 5. Pagamentos ──────────────────────────────────────────────

  /**
   * Previsão × realizado, mais o que a CLT cobra: pagamento até 2 dias antes
   * do início do gozo (art. 145) e o recibo arquivado.
   */
  async pagamentos(empresaId: string | null | undefined, ano: number | undefined, filtro: FiltroRelatorio = {}) {
    const colabs = await this.carregar(empresaId, filtro)
    const hoje = new Date()
    const rows = colabs.flatMap((c) => c.periodos
      .filter((p) => !ano || p.periodoInicial === ano || p.periodoFinal === ano
        || p.gozos.some((g) => new Date(g.inicio).getUTCFullYear() === ano))
      .map((p) => {
        const primeiroGozo = p.gozos[0] ?? null
        const limitePagto = primeiroGozo ? limitePagamento(primeiroGozo.inicio) : null
        const iniciou = !!primeiroGozo && new Date(primeiroGozo.inicio) <= hoje
        const situacao = p.pago
          ? (limitePagto && p.pagamento1 && new Date(p.pagamento1) > limitePagto ? 'PAGO_EM_ATRASO' : 'PAGO')
          : (iniciou ? 'ATRASADO' : 'A_PAGAR')
        return {
          ...this.linhaColaborador(c),
          periodoId: p.id,
          numero: p.numero,
          periodo: `${p.periodoInicial}/${p.periodoFinal}`,
          descricao: p.descricao,
          dias: p.dias + p.saldoAnterior,
          gozados: p.gozados,
          previsao: iso(p.previsao),
          pagamento1: iso(p.pagamento1),
          pagamento2: iso(p.pagamento2),
          pagamento3: iso(p.pagamento3),
          pago: p.pago,
          historico: p.historico,
          inicioGozo: primeiroGozo ? iso(primeiroGozo.inicio) : null,
          limitePagamento: iso(limitePagto),
          situacao,
          arquivos: p.arquivos,
          semRecibo: p.gozados > 0 && p.arquivos === 0,
        }
      }))

    const ordem: Record<string, number> = { ATRASADO: 0, PAGO_EM_ATRASO: 1, A_PAGAR: 2, PAGO: 3 }
    rows.sort((a, b) => (ordem[a.situacao]! - ordem[b.situacao]!)
      || String(a.previsao ?? a.inicioGozo ?? '').localeCompare(String(b.previsao ?? b.inicioGozo ?? ''))
      || a.nome.localeCompare(b.nome, 'pt-BR'))

    return {
      resumo: {
        total: rows.length,
        pagos: rows.filter((r) => r.situacao === 'PAGO').length,
        pagosEmAtraso: rows.filter((r) => r.situacao === 'PAGO_EM_ATRASO').length,
        aPagar: rows.filter((r) => r.situacao === 'A_PAGAR').length,
        atrasados: rows.filter((r) => r.situacao === 'ATRASADO').length,
        semRecibo: rows.filter((r) => r.semRecibo).length,
      },
      rows,
    }
  }

  // ── 6. Provisão (valores) ──────────────────────────────────────

  /**
   * O passivo em reais: dias em aberto × salário/30, mais o terço
   * constitucional. Os encargos (INSS patronal, RAT, terceiros, FGTS) ficam
   * como percentual na tela, porque a incidência muda conforme o enquadramento
   * da empresa — quem sabe a alíquota certa é o contador, não o sistema.
   *
   * Só quem tem a sub-permissão `valores` chega aqui, e quem está sem salário
   * no cadastro sai numa lista à parte em vez de entrar como zero.
   */
  async provisao(empresaId: string | null | undefined, filtro: FiltroRelatorio = {}) {
    const colabs = await this.carregar(empresaId, filtro)
    const rows: Array<{
      colaboradorId: string | null; nome: string; area: string | null; cargo: string | null
      salario: number; dias: number; base: number; terco: number; total: number
    }> = []
    const semSalario: Array<{ colaboradorId: string | null; nome: string; area: string | null; dias: number }> = []

    for (const c of colabs) {
      const dias = this.emAberto(c).reduce((a, p) => a + p.saldo, 0)
      if (dias <= 0) continue
      if (c.salario === null || c.salario <= 0) {
        semSalario.push({ colaboradorId: c.id, nome: c.nome, area: c.area, dias })
        continue
      }
      const base = (c.salario / 30) * dias
      const terco = base / 3
      rows.push({
        colaboradorId: c.id, nome: c.nome, area: c.area, cargo: c.cargo,
        salario: c.salario, dias,
        base: Math.round(base * 100) / 100,
        terco: Math.round(terco * 100) / 100,
        total: Math.round((base + terco) * 100) / 100,
      })
    }

    rows.sort((a, b) => b.total - a.total)
    return {
      resumo: {
        colaboradores: rows.length,
        dias: rows.reduce((a, r) => a + r.dias, 0),
        base: Math.round(rows.reduce((a, r) => a + r.base, 0) * 100) / 100,
        terco: Math.round(rows.reduce((a, r) => a + r.terco, 0) * 100) / 100,
        total: Math.round(rows.reduce((a, r) => a + r.total, 0) * 100) / 100,
        diasSemSalario: semSalario.reduce((a, r) => a + r.dias, 0),
      },
      rows,
      semSalario,
    }
  }

  // ── 7. Alerta do sino ──────────────────────────────────────────

  /**
   * Aviso proativo de férias vencidas e a vencer. Em modo sync, como os
   * certificados: apaga as notificações do módulo e recria a partir do estado
   * atual — período gozado ou lançado some do sino sozinho.
   *
   * Um aviso consolidado por bucket (vencidas / vencendo em 60 dias), para não
   * inundar o sino com uma linha por colaborador.
   */
  async notificarVencimentos(): Promise<{ vencidos: number; vencendo: number; notificados: number }> {
    await prisma.notification.deleteMany({ where: { origem: 'controle-ferias' } })

    // Empresas que têm período lançado (inclui a "sem empresa" do legado).
    const empresas = await prisma.feriasPeriodo.findMany({
      distinct: ['empresaId'], select: { empresaId: true },
    })

    let totalVencidos = 0
    let totalVencendo = 0
    let notificados = 0

    for (const { empresaId } of empresas) {
      const { rows } = await this.vencimentos(empresaId)
      const vencidos = rows.filter((r) => r.farol === 'VENCIDO')
      const vencendo = rows.filter((r) => r.farol === 'CRITICO' || r.farol === 'ATENCAO')
      if (!vencidos.length && !vencendo.length) continue
      totalVencidos += vencidos.length
      totalVencendo += vencendo.length

      const destinatarios = await this.destinatarios(empresaId)
      if (!destinatarios.length) continue

      const avisos: Array<{ titulo: string; mensagem: string; tipo: string; link: string }> = []
      if (vencidos.length) {
        avisos.push({
          titulo: `${vencidos.length} colaborador(es) com férias VENCIDAS`,
          mensagem: `${vencidos.reduce((a, r) => a + r.saldo, 0)} dia(s) fora do prazo legal — férias vencidas são devidas em dobro. Primeiros: ${vencidos.slice(0, 3).map((r) => r.nome).join(', ')}.`,
          tipo: 'error',
          link: '/controle-ferias/relatorios?aba=vencimentos&farol=VENCIDO',
        })
      }
      if (vencendo.length) {
        avisos.push({
          titulo: `${vencendo.length} colaborador(es) com férias a vencer em 90 dias`,
          mensagem: `Programe o gozo antes do fim do período concessivo. Primeiros: ${vencendo.slice(0, 3).map((r) => r.nome).join(', ')}.`,
          tipo: 'warning',
          link: '/controle-ferias/relatorios?aba=vencimentos&farol=CRITICO',
        })
      }

      const data = destinatarios.flatMap((userId) => avisos.map((a) => ({
        userId, titulo: a.titulo, mensagem: a.mensagem, tipo: a.tipo, link: a.link,
        origem: 'controle-ferias', empresaId,
      })))
      if (data.length) {
        await prisma.notification.createMany({ data }).catch(() => null)
        notificados += data.length
      }
    }

    return { vencidos: totalVencidos, vencendo: totalVencendo, notificados }
  }

  /** Quem recebe: masters e quem tem leitura no módulo, sem cruzar empresa. */
  private async destinatarios(empresaId: string | null): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { isMaster: true },
          { isEmpresaMaster: true, ...(empresaId ? { empresaId } : {}) },
          { permissions: { some: { moduleSlug: 'controle-ferias', canRead: true } } },
        ],
      },
      select: { id: true, empresaId: true, isMaster: true },
    })
    return users
      .filter((u) => u.isMaster || !empresaId || u.empresaId === empresaId)
      .map((u) => u.id)
  }
}
