import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateAreaInput, UpdateAreaInput, ListAreaInput } from '@saas/types'

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.AreaWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

@Injectable()
export class AreaService {
  async list(input: ListAreaInput, isMaster: boolean, empresaId?: string) {
    const { page, limit, search, sortBy, sortDir, isActive } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.AreaWhereInput = {
      ...empresaFilter(isMaster, empresaId),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.area.findMany({
        where, orderBy, skip, take,
        include: {
          parent: { select: { id: true, name: true } },
          leader: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.area.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, isMaster: boolean, empresaId?: string) {
    const area = await prisma.area.findUniqueOrThrow({
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
    return area
  }

  async create(input: CreateAreaInput, _isMaster: boolean, empresaId?: string) {
    return prisma.area.create({
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
  }

  async update(id: string, input: UpdateAreaInput, isMaster: boolean, empresaId?: string) {
    if (!isMaster && empresaId) {
      const existing = await prisma.area.findUniqueOrThrow({ where: { id } })
      if (existing.empresaId !== empresaId) throw new Error('Acesso negado.')
    }
    return prisma.area.update({
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
  }

  async bulkCreate(items: CreateAreaInput[], isMaster: boolean, empresaId?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, isMaster, empresaId)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }

  async delete(id: string, isMaster: boolean, empresaId?: string) {
    if (!isMaster && empresaId) {
      const existing = await prisma.area.findUniqueOrThrow({ where: { id } })
      if (existing.empresaId !== empresaId) throw new Error('Acesso negado.')
    }
    return prisma.area.delete({ where: { id } })
  }

  async listForSelect(isMaster: boolean, empresaId?: string) {
    return prisma.area.findMany({
      where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    })
  }
}
