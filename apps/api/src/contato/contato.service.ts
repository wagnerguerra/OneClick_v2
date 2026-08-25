import { Injectable } from '@nestjs/common'
import { prisma, Prisma } from '@saas/db'
import { getPrismaSkipTake, buildPaginatedResponse } from '@saas/db'
import type { CriarContatoInput, AtualizarContatoInput, ListarContatosInput } from '@saas/types'

/**
 * Agenda de Contatos — port do `ger_age` do v1 (crp_contatos).
 *
 * Visibilidade fiel ao v1: entrada **privada** só aparece para quem a criou
 * (o `dono`) e para o master; as demais são da empresa toda. O soft-delete
 * (`ativo`) também vem do v1 — excluir não apaga, some da lista.
 */
@Injectable()
export class ContatoService {
  /** Filtro de visibilidade: públicas + as minhas privadas (master vê tudo). */
  private escopo(userId: string, empresaId: string | null | undefined, isMaster: boolean): Prisma.ContatoWhereInput {
    const base: Prisma.ContatoWhereInput = { empresaId: empresaId ?? null }
    if (isMaster) return base
    return { ...base, OR: [{ privado: false }, { privado: true, donoId: userId }] }
  }

  async listar(input: ListarContatosInput, ctx: { userId: string; empresaId?: string | null; isMaster?: boolean }) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const filtros: Prisma.ContatoWhereInput[] = [this.escopo(ctx.userId, ctx.empresaId, !!ctx.isMaster)]
    if (!input.incluirInativos) filtros.push({ ativo: true })
    if (input.somentePrivados) filtros.push({ privado: true, donoId: ctx.userId })
    if (search) {
      const termo = search.trim()
      filtros.push({
        OR: [
          { nome: { contains: termo, mode: 'insensitive' } },
          { observacoes: { contains: termo, mode: 'insensitive' } },
          { pessoas: { some: { OR: [
            { nome: { contains: termo, mode: 'insensitive' } },
            { telefone: { contains: termo, mode: 'insensitive' } },
            { email: { contains: termo, mode: 'insensitive' } },
          ] } } },
        ],
      })
    }
    const where: Prisma.ContatoWhereInput = { AND: filtros }
    const orderBy = sortBy ? { [sortBy]: sortDir } : ({ nome: 'asc' } as const)

    const [data, total] = await Promise.all([
      prisma.contato.findMany({
        where, orderBy, skip, take,
        include: { pessoas: { orderBy: { ordem: 'asc' } } },
      }),
      prisma.contato.count({ where }),
    ])
    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, ctx: { userId: string; empresaId?: string | null; isMaster?: boolean }) {
    const c = await prisma.contato.findFirst({
      where: { AND: [{ id }, this.escopo(ctx.userId, ctx.empresaId, !!ctx.isMaster)] },
      include: { pessoas: { orderBy: { ordem: 'asc' } } },
    })
    if (!c) throw new Error('Contato não encontrado')
    return c
  }

  async criar(input: CriarContatoInput, userId: string, empresaId?: string | null) {
    const pessoas = (input.pessoas ?? []).filter(p => p.nome || p.telefone || p.email)
    return prisma.contato.create({
      data: {
        empresaId: empresaId ?? null,
        nome: input.nome.trim(),
        observacoes: input.observacoes ?? null,
        privado: !!input.privado,
        donoId: userId,
        pessoas: { create: pessoas.map((p, i) => ({ nome: p.nome ?? null, telefone: p.telefone ?? null, email: p.email ?? null, ordem: i })) },
      },
      include: { pessoas: { orderBy: { ordem: 'asc' } } },
    })
  }

  /**
   * Edição: o dono edita a própria entrada; contato público é editável por
   * quem tem escrita no módulo (a agenda é compartilhada). Privado alheio
   * nem aparece na listagem — aqui é a defesa em profundidade.
   */
  async atualizar(input: AtualizarContatoInput, ctx: { userId: string; empresaId?: string | null; isMaster?: boolean }) {
    const atual = await this.getById(input.id, ctx)
    if (atual.privado && atual.donoId !== ctx.userId && !ctx.isMaster) {
      throw new Error('Este contato é privado de outro usuário.')
    }
    const { id, pessoas, ...resto } = input
    const dados: Prisma.ContatoUpdateInput = {
      ...(resto.nome !== undefined ? { nome: resto.nome.trim() } : {}),
      ...(resto.observacoes !== undefined ? { observacoes: resto.observacoes } : {}),
      ...(resto.privado !== undefined ? { privado: resto.privado } : {}),
    }
    // Lista de pessoas é substituída por inteiro (o form manda o conjunto final)
    if (pessoas) {
      const limpas = pessoas.filter(p => p.nome || p.telefone || p.email)
      dados.pessoas = {
        deleteMany: {},
        create: limpas.map((p, i) => ({ nome: p.nome ?? null, telefone: p.telefone ?? null, email: p.email ?? null, ordem: i })),
      }
    }
    return prisma.contato.update({ where: { id }, data: dados, include: { pessoas: { orderBy: { ordem: 'asc' } } } })
  }

  /** Soft-delete (o `ativo=0` do v1). */
  async excluir(id: string, ctx: { userId: string; empresaId?: string | null; isMaster?: boolean }) {
    const atual = await this.getById(id, ctx)
    if (atual.privado && atual.donoId !== ctx.userId && !ctx.isMaster) {
      throw new Error('Este contato é privado de outro usuário.')
    }
    await prisma.contato.update({ where: { id }, data: { ativo: false } })
    return { ok: true }
  }

  async restaurar(id: string, ctx: { userId: string; empresaId?: string | null; isMaster?: boolean }) {
    await this.getById(id, ctx)
    await prisma.contato.update({ where: { id }, data: { ativo: true } })
    return { ok: true }
  }
}
