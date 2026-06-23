import { Injectable } from '@nestjs/common'
import { buildPaginatedResponse, getPrismaSkipTake, scoped, Prisma } from '@saas/db'
import {
  EMPTY_TREATMENT_DEFINITION,
  type CreateTreatmentModelInput,
  type UpdateTreatmentModelInput,
  type ListTreatmentModelInput,
  type TreatmentDefinition,
} from '@saas/types'

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.TreatmentModelWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

@Injectable()
export class TratamentoLancamentosService {
  async list(input: ListTreatmentModelInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, sortBy, sortDir, isActive, clienteId } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.TreatmentModelWhereInput = {
        deletedAt: null,
        ...empresaFilter(isMaster, empresaId),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(clienteId ? { clienteId } : {}),
        ...(search
          ? {
              OR: [
                { nome: { contains: search, mode: 'insensitive' as const } },
                { contaCorrente: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      }

      const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'desc' as const }

      const [data, total] = await Promise.all([
        db.treatmentModel.findMany({ where, orderBy, skip, take }),
        db.treatmentModel.count({ where }),
      ])

      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async listTrash(input: ListTreatmentModelInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.TreatmentModelWhereInput = {
        deletedAt: { not: null },
        ...empresaFilter(isMaster, empresaId),
      }
      const [data, total] = await Promise.all([
        db.treatmentModel.findMany({ where, orderBy: { deletedAt: 'desc' }, skip, take }),
        db.treatmentModel.count({ where }),
      ])
      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const model = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && model.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      const currentVersion = model.currentVersionId
        ? await db.treatmentModelVersion.findUnique({ where: { id: model.currentVersionId } })
        : null
      return {
        ...model,
        definition: (currentVersion?.definition ?? null) as TreatmentDefinition | null,
        currentVersionNumber: currentVersion?.versionNumber ?? null,
      }
    })
  }

  async create(input: CreateTreatmentModelInput, userId?: string, _isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    const definition: TreatmentDefinition = input.definition ?? EMPTY_TREATMENT_DEFINITION
    const contaCorrente = input.contaCorrente || definition.contaCorrente || null

    return scoped(tenantSchema, async (db) => {
      const model = await db.treatmentModel.create({
        data: {
          nome: input.nome,
          contaCorrente,
          clienteId: input.clienteId || null,
          empresaId: empresaId || null,
          isActive: input.isActive ?? true,
          version: 1,
        },
      })

      const version = await db.treatmentModelVersion.create({
        data: {
          modelId: model.id,
          versionNumber: 1,
          definition: definition as unknown as Prisma.InputJsonValue,
          authorId: userId || null,
          note: input.note || null,
        },
      })

      return db.treatmentModel.update({
        where: { id: model.id },
        data: { currentVersionId: version.id },
      })
    })
  }

  async update(id: string, input: UpdateTreatmentModelInput, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }

      const data: Prisma.TreatmentModelUpdateInput = {}
      if (input.nome !== undefined) data.nome = input.nome
      if (input.clienteId !== undefined) data.clienteId = input.clienteId || null
      if (input.isActive !== undefined) data.isActive = input.isActive
      if (input.contaCorrente !== undefined) data.contaCorrente = input.contaCorrente || null

      // Nova versão apenas quando a definição (corpo do modelo) é enviada.
      if (input.definition !== undefined) {
        const newVersionNumber = existing.version + 1
        const version = await db.treatmentModelVersion.create({
          data: {
            modelId: id,
            versionNumber: newVersionNumber,
            definition: input.definition as unknown as Prisma.InputJsonValue,
            authorId: userId || null,
            note: input.note || null,
          },
        })
        data.version = newVersionNumber
        data.currentVersionId = version.id
        // Mantém a conta corrente do modelo em sincronia com a da definição.
        if (input.contaCorrente === undefined && input.definition.contaCorrente) {
          data.contaCorrente = input.definition.contaCorrente
        }
      }

      return db.treatmentModel.update({ where: { id }, data })
    })
  }

  async remove(id: string, _userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      return db.treatmentModel.update({ where: { id }, data: { deletedAt: new Date() } })
    })
  }

  async restore(id: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      return db.treatmentModel.update({ where: { id }, data: { deletedAt: null } })
    })
  }

  async getVersions(id: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const model = await db.treatmentModel.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && model.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      return db.treatmentModelVersion.findMany({
        where: { modelId: id },
        orderBy: { versionNumber: 'desc' },
        select: { id: true, versionNumber: true, note: true, authorId: true, createdAt: true },
      })
    })
  }

  async listForSelect(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.treatmentModel.findMany({
        where: { isActive: true, deletedAt: null, ...empresaFilter(isMaster, empresaId) },
        select: { id: true, nome: true, code: true, contaCorrente: true, clienteId: true },
        orderBy: { nome: 'asc' },
      }),
    )
  }
}
