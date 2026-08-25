import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarFeriasPeriodoInput, AtualizarFeriasPeriodoInput, CriarFeriasEventoInput,
  ListarFeriasPeriodosInput,
} from '@saas/types'

/**
 * Controle de Férias — port do `crp_ferias` do v1. Um registro por período
 * aquisitivo, com gozos, até três pagamentos e recibos. O SALDO é derivado
 * AQUI (dias + saldo anterior − gozados, contando fim − início + 1 por
 * evento) e entregue no payload — o front nunca refaz a conta.
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Dias corridos do gozo, inclusivos (17→23 = 7 dias). */
function diasDoEvento(inicio: Date, fim: Date): number {
  return Math.round((fim.getTime() - inicio.getTime()) / 86400000) + 1
}

@Injectable()
export class ControleFeriasService {
  private async nomesPorId(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } })
    return new Map(users.map((u) => [u.id, u.name]))
  }

  /** Nome, situação e admissão do cadastro (colunas que o v1 mostrava). */
  private async usuariosPorId(ids: Array<string | null | undefined>) {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map<string, { name: string; isActive: boolean; dataAdmissao: Date | null; image: string | null }>()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true, isActive: true, dataAdmissao: true, image: true } })
    return new Map(users.map((u) => [u.id, { name: u.name, isActive: u.isActive, dataAdmissao: u.dataAdmissao, image: u.image }]))
  }

  /** Agrupador de períodos: o id do colaborador ou, no resíduo do v1, o nome. */
  private chaveColaborador(p: { colaboradorId?: string | null; colaboradorNomeResolvido?: string | null; colaboradorNome?: string | null }): string {
    if (p.colaboradorId) return `id:${p.colaboradorId}`
    return `nome:${String(p.colaboradorNomeResolvido ?? p.colaboradorNome ?? '').toLocaleLowerCase('pt-BR').trim()}`
  }

  private saldo(p: { dias: number; saldoAnterior: number; eventos: Array<{ dataInicio: Date; dataFim: Date }> }) {
    const gozados = p.eventos.reduce((acc, e) => acc + diasDoEvento(e.dataInicio, e.dataFim), 0)
    return { gozados, saldo: p.dias + p.saldoAnterior - gozados }
  }

  async listar(input: ListarFeriasPeriodosInput, empresaId?: string | null) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []
    if (input.colaboradorId) filtros.push({ colaboradorId: input.colaboradorId })
    if (input.situacao === 'ABERTOS') filtros.push({ historico: false })
    if (input.situacao === 'HISTORICO') filtros.push({ historico: true })
    if (search) filtros.push({ OR: [
      { colaboradorNome: { contains: search, mode: 'insensitive' } },
      { descricao: { contains: search, mode: 'insensitive' } },
    ] })

    const where = { empresaId: empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }

    // Volume pequeno (algumas centenas de períodos) e três colunas DERIVADAS
    // (nome do colaborador, gozados, saldo): busca tudo o que casa o filtro,
    // resolve, ordena e pagina em memória — assim qualquer coluna é ordenável.
    const data = await prisma.feriasPeriodo.findMany({
      where,
      include: { eventos: { select: { dataInicio: true, dataFim: true } }, _count: { select: { arquivos: true } } },
    })

    const usuarios = await this.usuariosPorId(data.map((d) => d.colaboradorId))
    let rows = data.map((d) => {
      const { gozados, saldo } = this.saldo(d)
      const u = d.colaboradorId ? usuarios.get(d.colaboradorId) : undefined
      return {
        ...d,
        eventos: undefined,
        colaboradorNomeResolvido: u?.name ?? d.colaboradorNome,
        /** false = desligado no cadastro; null = nem existe mais (só resíduo). */
        colaboradorAtivo: d.colaboradorId ? (u?.isActive ?? false) : null,
        /** Data de admissão do cadastro — coluna "Dt Admissão" do v1. */
        colaboradorAdmissao: u?.dataAdmissao ?? null,
        /** Foto do cadastro — a bolinha na primeira coluna da lista. */
        colaboradorImagem: u?.image ?? null,
        gozados,
        saldo,
        eventosTotal: d.eventos.length,
        arquivosTotal: d._count.arquivos,
      }
    })

    // A lista segue o cadastro: por padrão, só colaboradores ativos. Guardamos
    // quantos ficaram de fora para a tela poder avisar (e oferecer o atalho) —
    // sem isso o usuário acha que o registro não foi portado.
    let ocultosPorInatividade = 0
    if ((input.colaboradores ?? 'ATIVOS') === 'ATIVOS' && !input.colaboradorId) {
      const antes = rows.length
      rows = rows.filter((r) => r.colaboradorAtivo === true)
      ocultosPorInatividade = antes - rows.length
    }

    // Uma linha por colaborador: fica só o período MAIS RECENTE; os anteriores
    // viram histórico dentro do registro (decisão do Wagner, 25/08). Filtrar por
    // um colaborador específico desagrupa — é o drill-down natural.
    if (!input.colaboradorId) {
      const maisRecente = new Map<string, (typeof rows)[number]>()
      const totalPorColab = new Map<string, number>()
      for (const r of rows) {
        const k = this.chaveColaborador(r)
        totalPorColab.set(k, (totalPorColab.get(k) ?? 0) + 1)
        const atual = maisRecente.get(k)
        const maisNovo = !atual
          || r.periodoInicial > atual.periodoInicial
          || (r.periodoInicial === atual.periodoInicial && r.periodoFinal > atual.periodoFinal)
        if (maisNovo) maisRecente.set(k, r)
      }
      rows = [...maisRecente.values()].map((r) => ({
        ...r,
        /** Quantos períodos anteriores existem para este colaborador. */
        periodosAnteriores: (totalPorColab.get(this.chaveColaborador(r)) ?? 1) - 1,
      }))
    } else {
      rows = rows.map((r) => ({ ...r, periodosAnteriores: 0 }))
    }

    // Ordenação — padrão alfabético pelo colaborador; qualquer coluna serve.
    const dir = sortDir === 'desc' ? -1 : 1
    const campo = sortBy || 'colaborador'
    const texto = (v: unknown) => String(v ?? '').toLocaleLowerCase('pt-BR')
    const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0))
    const data0 = (v: unknown) => (v ? new Date(v as Date).getTime() : 0)
    rows.sort((a, b) => {
      let c = 0
      switch (campo) {
        case 'colaborador': c = texto(a.colaboradorNomeResolvido).localeCompare(texto(b.colaboradorNomeResolvido), 'pt-BR'); break
        case 'periodo': c = (a.periodoInicial - b.periodoInicial) || (a.periodoFinal - b.periodoFinal); break
        case 'dias': c = num(a.dias + a.saldoAnterior) - num(b.dias + b.saldoAnterior); break
        case 'gozados': c = a.gozados - b.gozados; break
        case 'saldo': c = a.saldo - b.saldo; break
        case 'previsao': c = data0(a.previsao) - data0(b.previsao); break
        case 'numero': c = a.numero - b.numero; break
        case 'admissao': c = data0(a.colaboradorAdmissao) - data0(b.colaboradorAdmissao); break
        case 'pagamento': c = data0(a.pagamento1) - data0(b.pagamento1); break
        case 'descricao': c = texto(a.descricao).localeCompare(texto(b.descricao), 'pt-BR'); break
        case 'situacao': c = Number(a.historico) - Number(b.historico) || Number(a.pago) - Number(b.pago); break
        default: c = texto(a.colaboradorNomeResolvido).localeCompare(texto(b.colaboradorNomeResolvido), 'pt-BR')
      }
      // Empate: sempre pelo período mais recente, depois pelo nome
      if (c === 0) c = (b.periodoInicial - a.periodoInicial) || texto(a.colaboradorNomeResolvido).localeCompare(texto(b.colaboradorNomeResolvido), 'pt-BR')
      return c * dir
    })

    const total = rows.length
    return { ...buildPaginatedResponse(rows.slice(skip, skip + take), total, page, limit), ocultosPorInatividade }
  }

  async getById(id: string, empresaId?: string | null) {
    const p = await prisma.feriasPeriodo.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: {
        eventos: { orderBy: [{ dataInicio: 'asc' }] },
        arquivos: { orderBy: { criadoEm: 'desc' } },
      },
    })
    if (!p) throw new Error('Período não encontrado.')
    const nomes = await this.nomesPorId([p.colaboradorId, ...p.eventos.map((e) => e.registradoPorId)])
    const { gozados, saldo } = this.saldo(p)

    // Histórico do colaborador: os demais períodos (a lista mostra só o mais
    // recente, então é aqui que o usuário consulta os anteriores).
    const irmaos = await prisma.feriasPeriodo.findMany({
      where: {
        empresaId: empresaId ?? null,
        id: { not: p.id },
        ...(p.colaboradorId
          ? { colaboradorId: p.colaboradorId }
          : { colaboradorId: null, colaboradorNome: p.colaboradorNome }),
      },
      include: { eventos: { select: { dataInicio: true, dataFim: true } }, _count: { select: { arquivos: true } } },
      orderBy: [{ periodoInicial: 'desc' }, { periodoFinal: 'desc' }],
    })
    const historicoColaborador = irmaos.map((h) => {
      const { gozados: g, saldo: sd } = this.saldo(h)
      return {
        id: h.id,
        periodoInicial: h.periodoInicial,
        periodoFinal: h.periodoFinal,
        descricao: h.descricao,
        dias: h.dias,
        saldoAnterior: h.saldoAnterior,
        gozados: g,
        saldo: sd,
        previsao: h.previsao,
        pago: h.pago,
        historico: h.historico,
        eventosTotal: h.eventos.length,
        arquivosTotal: h._count.arquivos,
      }
    })

    return {
      ...p,
      historicoColaborador,
      colaboradorNomeResolvido: p.colaboradorId ? nomes.get(p.colaboradorId) ?? p.colaboradorNome : p.colaboradorNome,
      gozados,
      saldo,
      eventos: p.eventos.map((e) => ({
        ...e,
        dias: diasDoEvento(e.dataInicio, e.dataFim),
        registradoPorNome: e.registradoPorId ? nomes.get(e.registradoPorId) ?? null : null,
      })),
    }
  }

  async criar(input: CriarFeriasPeriodoInput, usuarioId: string, empresaId?: string | null) {
    return prisma.feriasPeriodo.create({
      data: {
        empresaId: empresaId ?? null,
        colaboradorId: input.colaboradorId,
        periodoInicial: input.periodoInicial,
        periodoFinal: input.periodoFinal,
        descricao: input.descricao?.trim() || null,
        saldoAnterior: input.saldoAnterior,
        dias: input.dias,
        previsao: input.previsao ? dataDeISO(input.previsao) : null,
        registradoPorId: usuarioId,
      },
      select: { id: true },
    })
  }

  async atualizar(input: AtualizarFeriasPeriodoInput, empresaId?: string | null) {
    const { id, ...c } = input
    await this.getById(id, empresaId)
    const d = (v: string | null | undefined) => (v === undefined ? undefined : v ? dataDeISO(v) : null)
    return prisma.feriasPeriodo.update({
      where: { id },
      data: {
        ...(c.descricao !== undefined ? { descricao: c.descricao?.trim() || null } : {}),
        ...(c.saldoAnterior !== undefined ? { saldoAnterior: c.saldoAnterior } : {}),
        ...(c.dias !== undefined ? { dias: c.dias } : {}),
        ...(c.previsao !== undefined ? { previsao: d(c.previsao) } : {}),
        ...(c.pagamento1 !== undefined ? { pagamento1: d(c.pagamento1) } : {}),
        ...(c.pagamento2 !== undefined ? { pagamento2: d(c.pagamento2) } : {}),
        ...(c.pagamento3 !== undefined ? { pagamento3: d(c.pagamento3) } : {}),
        ...(c.pago !== undefined ? { pago: c.pago } : {}),
        ...(c.historico !== undefined ? { historico: c.historico } : {}),
      },
      select: { id: true },
    })
  }

  async excluir(id: string, empresaId?: string | null) {
    await this.getById(id, empresaId)
    await prisma.feriasPeriodo.delete({ where: { id } })
    return { id }
  }

  // ── Gozos ──────────────────────────────────────────────────────

  async criarEvento(input: CriarFeriasEventoInput, usuarioId: string, empresaId?: string | null) {
    const p = await this.getById(input.periodoId, empresaId)
    return prisma.feriasEvento.create({
      data: {
        periodoId: p.id,
        ordem: p.eventos.length + 1,
        dataInicio: dataDeISO(input.dataInicio),
        dataFim: dataDeISO(input.dataFim),
        descricao: input.descricao?.trim() || null,
        registradoPorId: usuarioId,
      },
      select: { id: true },
    })
  }

  async excluirEvento(id: string) {
    await prisma.feriasEvento.delete({ where: { id } })
    return { id }
  }

  // ── Arquivos (recibos/avisos) ──────────────────────────────────

  async criarArquivo(input: { periodoId: string; nome: string; path: string }, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.periodoId, empresaId)
    return prisma.feriasArquivo.create({
      data: { periodoId: input.periodoId, nome: input.nome, path: input.path, autorId: usuarioId },
      select: { id: true },
    })
  }

  async excluirArquivo(id: string) {
    await prisma.feriasArquivo.delete({ where: { id } })
    return { id }
  }

  /**
   * Colaboradores para o seletor: só quem está ATIVO no cadastro (não faz
   * sentido abrir período novo para quem saiu). `incluirInativos` traz todos —
   * usado pelo filtro quando o usuário quer ver o histórico dos desligados.
   */
  async listarColaboradores(empresaId?: string | null, incluirInativos = false) {
    return prisma.user.findMany({
      where: {
        OR: [{ empresaId: empresaId ?? null }, { empresaId: null }],
        ...(incluirInativos ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true, isActive: true },
    })
  }
}
