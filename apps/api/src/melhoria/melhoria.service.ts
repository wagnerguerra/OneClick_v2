import { Injectable } from '@nestjs/common'
import { prisma, getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type { CriarMelhoriaInput, AtualizarMelhoriaInput, ListarMelhoriasInput } from '@saas/types'

/**
 * Melhorias da Qualidade — port do `sgq_melhorias` do v1.
 *
 * Sem satélites de propósito: o v1 tem uma tabela só, sem log/anexo/mensagem,
 * e 2 registros ativos. A parte VIVA do assunto são as compras marcadas como
 * melhoria (46 no v1), que já moram em `Compra.melhoria` — daqui sai também a
 * listagem delas, como o índice do v1 fazia.
 */

function dataDeISO(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

@Injectable()
export class MelhoriaService {
  async listar(input: ListarMelhoriasInput, empresaId?: string | null) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Record<string, unknown>[] = []
    if (input.status) filtros.push({ status: input.status })
    if (input.areaId) filtros.push({ areaId: input.areaId })
    if (search) filtros.push({ titulo: { contains: search, mode: 'insensitive' } })

    const where = { empresaId: empresaId ?? null, ...(filtros.length ? { AND: filtros } : {}) }
    const orderBy = sortBy ? { [sortBy]: sortDir } : { criadoEm: 'desc' as const }

    const [data, total] = await Promise.all([
      prisma.melhoria.findMany({
        where, orderBy, skip, take,
        include: { area: { select: { id: true, name: true } } },
      }),
      prisma.melhoria.count({ where }),
    ])
    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, empresaId?: string | null) {
    const m = await prisma.melhoria.findFirst({
      where: { id, empresaId: empresaId ?? null },
      include: { area: { select: { id: true, name: true } } },
    })
    if (!m) throw new Error('Melhoria não encontrada.')
    return m
  }

  /**
   * As compras marcadas como melhoria — a metade mais usada do módulo no v1
   * (46 contra 2). Só leitura: quem trata o pedido é o /aquisicoes.
   */
  async listarComprasMelhoria(empresaId?: string | null) {
    return prisma.compra.findMany({
      where: { melhoria: true, isActive: true, ...(empresaId ? { empresaId } : {}) },
      select: {
        id: true, code: true, status: true, melhoriaObs: true, createdAt: true, setor: true,
        fornecedor: { select: { razaoSocial: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async criar(input: CriarMelhoriaInput, autorId: string, empresaId?: string | null) {
    return prisma.melhoria.create({
      data: {
        empresaId: empresaId ?? null,
        titulo: input.titulo.trim(),
        descricao: input.descricao || null,
        areaId: input.areaId || null,
        previstaPara: input.previstaPara ? dataDeISO(input.previstaPara) : null,
        autorId,
      },
      select: { id: true },
    })
  }

  async atualizar(input: AtualizarMelhoriaInput, empresaId?: string | null) {
    const { id, ...campos } = input
    await this.getById(id, empresaId)
    return prisma.melhoria.update({
      where: { id },
      data: {
        ...(campos.titulo !== undefined ? { titulo: campos.titulo.trim() } : {}),
        ...(campos.descricao !== undefined ? { descricao: campos.descricao || null } : {}),
        ...(campos.areaId !== undefined ? { areaId: campos.areaId || null } : {}),
        ...(campos.previstaPara !== undefined
          ? { previstaPara: campos.previstaPara ? dataDeISO(campos.previstaPara) : null }
          : {}),
        // Marcar implementada carimba a data; voltar atrás limpa — o carimbo
        // não pode sobreviver a um status que o desmente.
        ...(campos.status !== undefined
          ? {
            status: campos.status,
            implementadaEm: campos.status === 'IMPLEMENTADA' ? new Date() : null,
          }
          : {}),
      },
      select: { id: true },
    })
  }

  async excluir(id: string, empresaId?: string | null) {
    await this.getById(id, empresaId)
    await prisma.melhoria.delete({ where: { id } })
    return { id }
  }

  async listarAreas(empresaId?: string | null) {
    return prisma.area.findMany({
      where: { OR: [{ empresaId: empresaId ?? undefined }, { empresaId: null }], isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
  }
}
