import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateCargoInput, UpdateCargoInput, ListCargoInput } from '@saas/types'

const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', areaId: 'Área relacionada', showInOrgChart: 'Exibir no organograma',
  descricaoSumaria: 'Descrição sumária', responsabilidades: 'Responsabilidades',
  habilidades: 'Habilidades', autoridades: 'Autoridades', experiencias: 'Experiências',
  treinamentos: 'Treinamentos', educacao: 'Educação', isActive: 'Status',
}

function detectChanges(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of Object.keys(FIELD_LABELS)) {
    const oldVal = before[key] ?? null
    const newVal = after[key] ?? null
    if (String(oldVal) !== String(newVal)) changes[key] = { from: oldVal, to: newVal }
  }
  return Object.keys(changes).length > 0 ? changes : null
}

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.CargoWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

@Injectable()
export class CargoService {
  async list(input: ListCargoInput, isMaster: boolean, empresaId?: string) {
    const { page, limit, search, sortBy, sortDir, isActive } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.CargoWhereInput = {
      ...empresaFilter(isMaster, empresaId),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { name: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.cargo.findMany({
        where, orderBy, skip, take,
        include: { area: { select: { id: true, name: true } }, _count: { select: { users: true } } },
      }),
      prisma.cargo.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, isMaster: boolean, empresaId?: string) {
    const cargo = await prisma.cargo.findUniqueOrThrow({
      where: { id },
      include: {
        area: { select: { id: true, name: true } },
        users: { where: { isActive: true }, select: { id: true, name: true, email: true, profile: true, image: true }, orderBy: { name: 'asc' } },
      },
    })
    if (!isMaster && empresaId && cargo.empresaId !== empresaId) throw new Error('Acesso negado.')
    return cargo
  }

  async create(input: CreateCargoInput, _isMaster: boolean, empresaId?: string, userId?: string) {
    const { areaId, ...data } = input
    return prisma.$transaction(async (tx) => {
      const cargo = await tx.cargo.create({
        data: {
          ...data, areaId: areaId || null, empresaId: empresaId || null,
          descricaoSumaria: data.descricaoSumaria || null, responsabilidades: data.responsabilidades || null,
          habilidades: data.habilidades || null, autoridades: data.autoridades || null,
          experiencias: data.experiencias || null, treinamentos: data.treinamentos || null,
          educacao: data.educacao || null, version: 1,
        },
      })
      await tx.cargoEvent.create({ data: { cargoId: cargo.id, userId: userId || null, type: 'created', version: 1 } })
      return cargo
    })
  }

  async update(id: string, input: UpdateCargoInput, isMaster: boolean, empresaId?: string, userId?: string) {
    const { areaId, ...rest } = input
    return prisma.$transaction(async (tx) => {
      const before = await tx.cargo.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && before.empresaId !== empresaId) throw new Error('Acesso negado.')

      const data: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined) data[key] = typeof value === 'string' && value === '' ? null : value
      }
      if (areaId !== undefined) data.areaId = areaId || null

      const newVersion = before.version + 1
      data.version = newVersion

      const cargo = await tx.cargo.update({ where: { id }, data })
      const changes = detectChanges(before as unknown as Record<string, unknown>, data)
      if (changes) {
        await tx.cargoEvent.create({ data: { cargoId: id, userId: userId || null, type: 'updated', version: newVersion, changes: changes as Prisma.InputJsonValue } })
      }
      return cargo
    })
  }

  async delete(id: string, isMaster: boolean, empresaId?: string, userId?: string) {
    return prisma.$transaction(async (tx) => {
      const cargo = await tx.cargo.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && cargo.empresaId !== empresaId) throw new Error('Acesso negado.')
      await tx.cargoEvent.create({ data: { cargoId: id, userId: userId || null, type: 'deleted', version: cargo.version } })
      return tx.cargo.delete({ where: { id } })
    })
  }

  async getEvents(cargoId: string) {
    return prisma.cargoEvent.findMany({
      where: { cargoId }, orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  async exportAll(isMaster: boolean, empresaId?: string) {
    return prisma.cargo.findMany({
      where: empresaFilter(isMaster, empresaId),
      orderBy: { name: 'asc' },
      include: { area: { select: { id: true, name: true } }, _count: { select: { users: true } } },
    })
  }

  async bulkCreate(items: CreateCargoInput[], isMaster: boolean, empresaId?: string, userId?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, isMaster, empresaId, userId)
        results.created++
      } catch (e) { results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`) }
    }
    return results
  }

  async listForSelect(isMaster: boolean, empresaId?: string) {
    return prisma.cargo.findMany({
      where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    })
  }
}
