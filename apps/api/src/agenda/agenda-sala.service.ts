import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'

interface CreateSalaInput {
  nome: string
  capacidade?: number | null
  equipamentos?: string | null
  ativo?: boolean
  empresaId?: string | null
}

interface UpdateSalaInput {
  nome?: string
  capacidade?: number | null
  equipamentos?: string | null
  ativo?: boolean
}

/**
 * CRUD de salas de reunião pra agenda. Soft delete via `ativo=false`
 * (preserva eventos antigos que referenciam a sala).
 */
@Injectable()
export class AgendaSalaService {
  list(opts?: { incluirInativas?: boolean; empresaId?: string | null }) {
    // Catálogo global (empresa NULL) + as salas do tenant atual. F-013.
    const tenant = { OR: [{ empresaId: null }, { empresaId: opts?.empresaId ?? null }] }
    return prisma.agendaSala.findMany({
      where: opts?.incluirInativas ? tenant : { ativo: true, ...tenant },
      orderBy: { nome: 'asc' },
    })
  }

  create(input: CreateSalaInput) {
    return prisma.agendaSala.create({
      data: {
        empresaId: input.empresaId ?? null,  // sala criada é DO tenant. F-013.
        nome: input.nome.trim(),
        capacidade: input.capacidade ?? null,
        equipamentos: input.equipamentos?.trim() || null,
        ativo: input.ativo ?? true,
      },
    })
  }

  /**
   * Não-master só altera/exclui as PRÓPRIAS salas — nunca as globais (empresa
   * NULL) nem as de outro tenant. F-013.
   */
  private async assertSalaOwned(id: string, isMaster: boolean, empresaId: string | null) {
    if (isMaster) return
    const sala = await prisma.agendaSala.findUnique({ where: { id }, select: { empresaId: true } })
    if (!sala || sala.empresaId === null || sala.empresaId !== empresaId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Sala fora do seu acesso (salas globais só o master gerencia).' })
    }
  }

  async update(id: string, data: UpdateSalaInput, isMaster = false, empresaId: string | null = null) {
    await this.assertSalaOwned(id, isMaster, empresaId)
    const patch: UpdateSalaInput = {}
    if (data.nome !== undefined) patch.nome = data.nome.trim()
    if (data.capacidade !== undefined) patch.capacidade = data.capacidade
    if (data.equipamentos !== undefined) patch.equipamentos = data.equipamentos?.trim() || null
    if (data.ativo !== undefined) patch.ativo = data.ativo
    return prisma.agendaSala.update({ where: { id }, data: patch })
  }

  /** Soft delete — eventos antigos continuam apontando pra ela. */
  async delete(id: string, isMaster = false, empresaId: string | null = null) {
    await this.assertSalaOwned(id, isMaster, empresaId)
    return prisma.agendaSala.update({ where: { id }, data: { ativo: false } })
  }
}
