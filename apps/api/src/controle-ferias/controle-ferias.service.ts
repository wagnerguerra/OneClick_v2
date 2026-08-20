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
    const orderBy = sortBy ? { [sortBy]: sortDir } : [{ periodoInicial: 'desc' as const }, { criadoEm: 'desc' as const }]

    const [data, total] = await Promise.all([
      prisma.feriasPeriodo.findMany({
        where, orderBy, skip, take,
        include: { eventos: { select: { dataInicio: true, dataFim: true } }, _count: { select: { arquivos: true } } },
      }),
      prisma.feriasPeriodo.count({ where }),
    ])

    const nomes = await this.nomesPorId(data.map((d) => d.colaboradorId))
    const rows = data.map((d) => {
      const { gozados, saldo } = this.saldo(d)
      return {
        ...d,
        eventos: undefined,
        colaboradorNomeResolvido: d.colaboradorId ? nomes.get(d.colaboradorId) ?? d.colaboradorNome : d.colaboradorNome,
        gozados,
        saldo,
        eventosTotal: d.eventos.length,
        arquivosTotal: d._count.arquivos,
      }
    })
    return buildPaginatedResponse(rows, total, page, limit)
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
    return {
      ...p,
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

  async listarColaboradores(empresaId?: string | null) {
    return prisma.user.findMany({
      where: { OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true },
    })
  }
}
