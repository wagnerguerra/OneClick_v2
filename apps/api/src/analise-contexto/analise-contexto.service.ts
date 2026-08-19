import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type {
  CriarAnaliseContextoInput, AtualizarAnaliseContextoInput, AvaliarAnaliseContextoInput,
  CriarAnaliseContextoAcaoInput, AtualizarAnaliseContextoAcaoInput, ConcluirAnaliseContextoAcaoInput,
  ListarAnaliseContextoInput,
} from '@saas/types'

/**
 * Análise de Contexto — port do `sgq_contexto` do v1 (a SWOT da ISO 9001 §4.1).
 * Registro (oportunidade/ameaça/força/fraqueza) + plano de ação + avaliação de
 * eficácia. O grau de risco (gravidade × probabilidade) é DERIVADO aqui e vai
 * como valor no payload — o front não refaz a conta (padrão de estados
 * derivados do projeto).
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}


@Injectable()
export class AnaliseContextoService {
  private grauRisco(gravidade: number | null, probabilidade: number | null): number | null {
    if (!gravidade || !probabilidade) return null
    return gravidade * probabilidade
  }

  private async nomesPorId(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unicos = [...new Set(ids.filter((x): x is string => !!x))]
    if (!unicos.length) return new Map()
    const users = await prisma.user.findMany({ where: { id: { in: unicos } }, select: { id: true, name: true } })
    return new Map(users.map((u) => [u.id, u.name]))
  }

  async listar(input: ListarAnaliseContextoInput, empresaId?: string | null) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = [{ ativo: true }]
    if (input.analise) filtros.push({ analise: input.analise })
    if (input.tipo) filtros.push({ tipo: input.tipo })
    if (input.situacao === 'PENDENTE') filtros.push({ avaliadoEm: null })
    if (input.situacao === 'AVALIADO') filtros.push({ avaliadoEm: { not: null } })
    if (search) {
      filtros.push({ OR: [
        { identificacao: { contains: search, mode: 'insensitive' } },
        { processo: { contains: search, mode: 'insensitive' } },
      ] })
    }

    const where = { empresaId: empresaId ?? null, AND: filtros }
    const orderBy = sortBy ? { [sortBy]: sortDir } : { criadoEm: 'desc' as const }

    const [data, total] = await Promise.all([
      prisma.analiseContexto.findMany({
        where, orderBy, skip, take,
        include: { _count: { select: { acoes: true } }, acoes: { select: { concluida: true } } },
      }),
      prisma.analiseContexto.count({ where }),
    ])

    const nomes = await this.nomesPorId(data.map((d) => d.responsavelId))
    const rows = data.map((d) => ({
      ...d,
      acoes: undefined,
      responsavelNomeResolvido: d.responsavelId ? nomes.get(d.responsavelId) ?? d.responsavelNome : d.responsavelNome,
      grauRisco: this.grauRisco(d.gravidade, d.probabilidade),
      acoesAbertas: d.acoes.filter((a) => !a.concluida).length,
      acoesTotal: d._count.acoes,
      avaliado: d.avaliadoEm != null,
    }))
    return buildPaginatedResponse(rows, total, page, limit)
  }

  async getById(id: string, empresaId?: string | null) {
    const a = await prisma.analiseContexto.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: { acoes: { orderBy: [{ concluida: 'asc' }, { prazo: 'asc' }] } },
    })
    if (!a) throw new Error('Registro não encontrado.')
    const nomes = await this.nomesPorId([
      a.responsavelId, a.avaliadoPorId,
      ...a.acoes.flatMap((x) => [x.responsavelId, x.finalizadoPorId]),
    ])
    return {
      ...a,
      grauRisco: this.grauRisco(a.gravidade, a.probabilidade),
      avaliado: a.avaliadoEm != null,
      responsavelNomeResolvido: a.responsavelId ? nomes.get(a.responsavelId) ?? a.responsavelNome : a.responsavelNome,
      avaliadoPorNomeResolvido: a.avaliadoPorId ? nomes.get(a.avaliadoPorId) ?? a.avaliadoPorNome : a.avaliadoPorNome,
      acoes: a.acoes.map((x) => ({
        ...x,
        responsavelNomeResolvido: x.responsavelId ? nomes.get(x.responsavelId) ?? x.responsavelNome : x.responsavelNome,
        finalizadoPorNome: x.finalizadoPorId ? nomes.get(x.finalizadoPorId) ?? null : null,
      })),
    }
  }

  async criar(input: CriarAnaliseContextoInput, empresaId?: string | null) {
    return prisma.analiseContexto.create({
      data: {
        empresaId: empresaId ?? null,
        analise: input.analise,
        tipo: input.tipo,
        identificacao: input.identificacao.trim(),
        processo: input.processo?.trim() || null,
        parteInteressada: input.parteInteressada || null,
        gravidade: input.gravidade ?? null,
        probabilidade: input.probabilidade ?? null,
        responsavelId: input.responsavelId || null,
        prazo: input.prazo ? dataDeISO(input.prazo) : null,
      },
      select: { id: true },
    })
  }

  async atualizar(input: AtualizarAnaliseContextoInput, empresaId?: string | null) {
    const { id, ...c } = input
    await this.getById(id, empresaId)
    return prisma.analiseContexto.update({
      where: { id },
      data: {
        ...(c.analise !== undefined ? { analise: c.analise } : {}),
        ...(c.tipo !== undefined ? { tipo: c.tipo } : {}),
        ...(c.identificacao !== undefined ? { identificacao: c.identificacao.trim() } : {}),
        ...(c.processo !== undefined ? { processo: c.processo?.trim() || null } : {}),
        ...(c.parteInteressada !== undefined ? { parteInteressada: c.parteInteressada || null } : {}),
        ...(c.gravidade !== undefined ? { gravidade: c.gravidade } : {}),
        ...(c.probabilidade !== undefined ? { probabilidade: c.probabilidade } : {}),
        ...(c.responsavelId !== undefined ? { responsavelId: c.responsavelId || null } : {}),
        ...(c.prazo !== undefined ? { prazo: c.prazo ? dataDeISO(c.prazo) : null } : {}),
      },
      select: { id: true },
    })
  }

  /** Registra a avaliação de eficácia (o fechamento do v1). */
  async avaliar(input: AvaliarAnaliseContextoInput, usuarioId: string, empresaId?: string | null) {
    await this.getById(input.id, empresaId)
    return prisma.analiseContexto.update({
      where: { id: input.id },
      data: {
        avaliacao: input.avaliacao,
        eficaz: input.eficaz,
        avaliadoPorId: usuarioId,
        avaliadoEm: input.avaliadoEm ? dataDeISO(input.avaliadoEm) : new Date(),
      },
      select: { id: true },
    })
  }

  /** Soft-delete, como o v1 (ativo=0) — o registro sai das listagens. */
  async excluir(id: string, empresaId?: string | null) {
    await this.getById(id, empresaId)
    await prisma.analiseContexto.update({ where: { id }, data: { ativo: false } })
    return { id }
  }

  // ── Plano de ação ──────────────────────────────────────────────

  async criarAcao(input: CriarAnaliseContextoAcaoInput, empresaId?: string | null) {
    await this.getById(input.analiseId, empresaId)
    return prisma.analiseContextoAcao.create({
      data: {
        analiseId: input.analiseId,
        tipo: input.tipo,
        descricao: input.descricao.trim(),
        responsavelId: input.responsavelId || null,
        prazo: input.prazo ? dataDeISO(input.prazo) : null,
      },
      select: { id: true },
    })
  }

  async atualizarAcao(input: AtualizarAnaliseContextoAcaoInput) {
    const { id, ...c } = input
    return prisma.analiseContextoAcao.update({
      where: { id },
      data: {
        ...(c.tipo !== undefined ? { tipo: c.tipo } : {}),
        ...(c.descricao !== undefined ? { descricao: c.descricao.trim() } : {}),
        ...(c.responsavelId !== undefined ? { responsavelId: c.responsavelId || null, responsavelNome: null } : {}),
        ...(c.prazo !== undefined ? { prazo: c.prazo ? dataDeISO(c.prazo) : null } : {}),
      },
      select: { id: true },
    })
  }

  async concluirAcao(input: ConcluirAnaliseContextoAcaoInput, usuarioId: string) {
    return prisma.analiseContextoAcao.update({
      where: { id: input.id },
      data: input.concluida
        ? { concluida: true, finalizadoEm: new Date(), finalizadoPorId: usuarioId, observacao: input.observacao || null }
        : { concluida: false, finalizadoEm: null, finalizadoPorId: null },
      select: { id: true },
    })
  }

  async excluirAcao(id: string) {
    await prisma.analiseContextoAcao.delete({ where: { id } })
    return { id }
  }

  /** Usuários selecionáveis como responsável (mesmo escopo dos demais módulos). */
  async listarUsuarios(empresaId?: string | null) {
    return prisma.user.findMany({
      where: { OR: [{ empresaId: empresaId ?? null }, { empresaId: null }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, image: true },
    })
  }
}
