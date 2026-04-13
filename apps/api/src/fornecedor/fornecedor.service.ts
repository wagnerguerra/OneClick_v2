import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake, scoped, Prisma } from '@saas/db'
import type { CreateFornecedorInput, UpdateFornecedorInput, ListFornecedorInput } from '@saas/types'

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.FornecedorWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

@Injectable()
export class FornecedorService {
  async list(input: ListFornecedorInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, sortBy, sortDir, isActive, tipoFornecedor, tipoDocumento } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.FornecedorWhereInput = {
        ...empresaFilter(isMaster, empresaId),
        ...(search ? {
          OR: [
            { razaoSocial: { contains: search, mode: 'insensitive' as const } },
            { nomeFantasia: { contains: search, mode: 'insensitive' as const } },
            { documento: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(tipoFornecedor ? { tipoFornecedor: tipoFornecedor as Prisma.EnumTipoFornecedorFilter['equals'] } : {}),
        ...(tipoDocumento ? { tipoDocumento: tipoDocumento as Prisma.EnumTipoDocumentoFilter['equals'] } : {}),
      }

      const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

      const [data, total] = await Promise.all([
        db.fornecedor.findMany({ where, orderBy, skip, take }),
        db.fornecedor.count({ where }),
      ])

      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const fornecedor = await db.fornecedor.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && fornecedor.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      return fornecedor
    })
  }

  async create(input: CreateFornecedorInput, userId?: string, _isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const fornecedor = await db.fornecedor.create({
        data: {
          razaoSocial: input.razaoSocial,
          nomeFantasia: input.nomeFantasia || null,
          documento: input.documento.replace(/\D/g, ''),
          tipoDocumento: input.tipoDocumento,
          inscricaoEstadual: input.inscricaoEstadual || null,
          inscricaoMunicipal: input.inscricaoMunicipal || null,
          tipoFornecedor: input.tipoFornecedor,
          categoria: input.categoria || null,
          logoUrl: input.logoUrl || null,
          telefone: input.telefone || null,
          celular: input.celular || null,
          email: input.email || null,
          site: input.site || null,
          contatoPrincipal: input.contatoPrincipal || null,
          cargoContato: input.cargoContato || null,
          cep: input.cep || null,
          logradouro: input.logradouro || null,
          numero: input.numero || null,
          complemento: input.complemento || null,
          bairro: input.bairro || null,
          cidade: input.cidade || null,
          uf: input.uf || null,
          banco: input.banco || null,
          agencia: input.agencia || null,
          conta: input.conta || null,
          tipoConta: input.tipoConta || null,
          pixChave: input.pixChave || null,
          pixTipo: input.pixTipo || null,
          observacoes: input.observacoes || null,
          isActive: input.isActive,
          empresaId: empresaId || null,
        },
      })

      await db.fornecedorEvent.create({
        data: {
          fornecedorId: fornecedor.id,
          userId: userId || null,
          type: 'created',
          version: 1,
        },
      })

      return fornecedor
    })
  }

  async update(id: string, input: UpdateFornecedorInput, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.fornecedor.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }

      const changes: Record<string, { from: unknown; to: unknown }> = {}
      const data: Prisma.FornecedorUpdateInput = {}

      function track(field: keyof UpdateFornecedorInput) {
        if (input[field] === undefined) return
        const oldVal = (existing as Record<string, unknown>)[field as string]
        let newVal: unknown = input[field]
        if (field === 'documento' && typeof newVal === 'string') newVal = newVal.replace(/\D/g, '')
        if (newVal === '') newVal = null
        if (String(oldVal ?? '') !== String(newVal ?? '')) {
          changes[field as string] = { from: oldVal, to: newVal }
        }
        ;(data as Record<string, unknown>)[field as string] = newVal
      }

      const fields: (keyof UpdateFornecedorInput)[] = [
        'razaoSocial', 'nomeFantasia', 'documento', 'tipoDocumento',
        'inscricaoEstadual', 'inscricaoMunicipal', 'tipoFornecedor', 'categoria', 'logoUrl',
        'telefone', 'celular', 'email', 'site', 'contatoPrincipal', 'cargoContato',
        'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
        'banco', 'agencia', 'conta', 'tipoConta', 'pixChave', 'pixTipo',
        'observacoes', 'isActive',
      ]
      for (const f of fields) track(f)

      const newVersion = existing.version + 1
      data.version = newVersion

      const updated = await db.fornecedor.update({ where: { id }, data })

      if (Object.keys(changes).length > 0) {
        await db.fornecedorEvent.create({
          data: {
            fornecedorId: id,
            userId: userId || null,
            type: 'updated',
            version: newVersion,
            changes: changes as unknown as Prisma.InputJsonValue,
          },
        })
      }

      return updated
    })
  }

  async delete(id: string, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.fornecedor.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }

      await db.fornecedorEvent.create({
        data: {
          fornecedorId: id,
          userId: userId || null,
          type: 'deleted',
          version: existing.version,
        },
      })

      return db.fornecedor.delete({ where: { id } })
    })
  }

  async listForSelect(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedor.findMany({
        where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
        select: { id: true, razaoSocial: true, nomeFantasia: true, code: true, documento: true },
        orderBy: { razaoSocial: 'asc' },
      }),
    )
  }

  async getEvents(id: string) {
    return prisma.fornecedorEvent.findMany({
      where: { fornecedorId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async exportAll(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.fornecedor.findMany({
        where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
        orderBy: { code: 'asc' },
      }),
    )
  }

  async bulkCreate(items: CreateFornecedorInput[], userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, userId, isMaster, empresaId, tenantSchema)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }
}
