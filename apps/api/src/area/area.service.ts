import { Injectable } from '@nestjs/common'
import { buildPaginatedResponse, getPrismaSkipTake, scoped } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateAreaInput, UpdateAreaInput, ListAreaInput } from '@saas/types'

function empresaFilter(_isMaster: boolean, empresaId?: string): Prisma.AreaWhereInput {
  return empresaId ? { empresaId } : {}
}

@Injectable()
export class AreaService {
  async list(input: ListAreaInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, sortBy, sortDir, isActive } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.AreaWhereInput = {
        ...empresaFilter(isMaster, empresaId),
        ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      }

      const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

      const [data, total] = await Promise.all([
        db.area.findMany({
          where, orderBy, skip, take,
          include: {
            parent: { select: { id: true, name: true } },
            leader: { select: { id: true, name: true, email: true } },
          },
        }),
        db.area.count({ where }),
      ])

      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const area = await db.area.findUniqueOrThrow({
        where: { id },
        include: {
          parent: { select: { id: true, name: true } },
          leader: { select: { id: true, name: true, email: true } },
          children: { select: { id: true, name: true } },
        },
      })
      if (!isMaster && empresaId && area.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      // #367 (espelho) — estado do vínculo "notificável em orçamentos"
      // (OrcamentoAreaHabilitada). Não é coluna da Area; é derivado. Anexado ao
      // objeto SEM alterar o tipo do retorno (o spread `{...area, x}` degradava a
      // inferência do output do trpc, tornando `data` any no front); o front lê via cast.
      const habil = await db.orcamentoAreaHabilitada.findFirst({
        where: { empresaId: empresaId ?? null, areaId: id, ativo: true },
        select: { id: true },
      })
      ;(area as typeof area & { notificavelOrcamento?: boolean }).notificavelOrcamento = !!habil
      return area
    })
  }

  async create(input: CreateAreaInput, _isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const area = await db.area.create({
        data: {
          name: input.name,
          isActive: input.isActive,
          availableForHiring: input.availableForHiring,
          showInOrgChart: input.showInOrgChart,
          email: input.email || null,
          leaderId: input.leaderId || null,
          parentId: input.parentId || null,
          costType: input.costType,
          costWeight: input.costWeight,
          excludeFromCosting: input.excludeFromCosting,
          empresaId: empresaId || null,
        },
      })
      // #367 (espelho) — habilita p/ notificação em orçamentos (OrcamentoAreaHabilitada).
      if (input.notificavelOrcamento) {
        await db.orcamentoAreaHabilitada.create({ data: { empresaId: empresaId || null, areaId: area.id, ativo: true, ordem: 0 } })
      }
      return area
    })
  }

  async update(id: string, input: UpdateAreaInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      if (!isMaster && empresaId) {
        const existing = await db.area.findUniqueOrThrow({ where: { id } })
        if (existing.empresaId !== empresaId) throw new Error('Acesso negado.')
      }
      const area = await db.area.update({
        where: { id },
        data: {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
          ...(input.availableForHiring !== undefined && { availableForHiring: input.availableForHiring }),
          ...(input.showInOrgChart !== undefined && { showInOrgChart: input.showInOrgChart }),
          ...(input.email !== undefined && { email: input.email || null }),
          ...(input.leaderId !== undefined && { leaderId: input.leaderId || null }),
          ...(input.parentId !== undefined && { parentId: input.parentId || null }),
          ...(input.costType !== undefined && { costType: input.costType }),
          ...(input.costWeight !== undefined && { costWeight: input.costWeight }),
          ...(input.excludeFromCosting !== undefined && { excludeFromCosting: input.excludeFromCosting }),
        },
      })
      // #367 (espelho) — sincroniza o vínculo "notificável em orçamentos" (presença
      // = habilitada, como o saveConfigAreas). Só quando o campo veio no payload.
      if (input.notificavelOrcamento !== undefined) {
        const empId = empresaId ?? null
        if (input.notificavelOrcamento) {
          const existing = await db.orcamentoAreaHabilitada.findFirst({ where: { empresaId: empId, areaId: id } })
          if (!existing) await db.orcamentoAreaHabilitada.create({ data: { empresaId: empId, areaId: id, ativo: true, ordem: 0 } })
          else if (!existing.ativo) await db.orcamentoAreaHabilitada.update({ where: { id: existing.id }, data: { ativo: true } })
        } else {
          await db.orcamentoAreaHabilitada.deleteMany({ where: { empresaId: empId, areaId: id } })
        }
      }
      return area
    })
  }

  async bulkCreate(items: CreateAreaInput[], isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, isMaster, empresaId, tenantSchema)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }

  async delete(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      if (!isMaster && empresaId) {
        const existing = await db.area.findUniqueOrThrow({ where: { id } })
        if (existing.empresaId !== empresaId) throw new Error('Acesso negado.')
      }
      return db.area.delete({ where: { id } })
    })
  }

  /**
   * Áreas para preencher um select.
   *
   * Diferente do `list` do módulo, aqui a empresa ATIVA vale também para o
   * master: um seletor que mistura as áreas de duas empresas mostra "Comercial"
   * duas vezes, sem dizer de qual tenant é cada uma. Trocar de empresa é pelo
   * seletor do cabeçalho.
   */
  async listForSelect(_isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.area.findMany({
        where: { isActive: true, ...(empresaId ? { empresaId } : {}) },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    )
  }
}
