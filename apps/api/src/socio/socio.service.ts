import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake, scoped, Prisma } from '@saas/db'
import type { CreateSocioInput, UpdateSocioInput, ListSocioInput } from '@saas/types'

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.SocioWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

@Injectable()
export class SocioService {
  async list(input: ListSocioInput, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    const { page, limit, search, sortBy, sortDir, isActive, tipoSocio, clienteId } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    return scoped(tenantSchema, async (db) => {
      const where: Prisma.SocioWhereInput = {
        ...empresaFilter(isMaster, empresaId),
        ...(search ? {
          OR: [
            { nomeCompleto: { contains: search, mode: 'insensitive' as const } },
            { cpf: { contains: search } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(tipoSocio ? { tipoSocio: tipoSocio as Prisma.EnumTipoSocioFilter['equals'] } : {}),
        ...(clienteId ? { clienteId } : {}),
      }

      const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

      const [data, total] = await Promise.all([
        db.socio.findMany({
          where, orderBy, skip, take,
          include: {
            cliente: { select: { id: true, razaoSocial: true } },
          },
        }),
        db.socio.count({ where }),
      ])

      return buildPaginatedResponse(data, total, page, limit)
    })
  }

  async getById(id: string, isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const socio = await db.socio.findUniqueOrThrow({
        where: { id },
        include: {
          cliente: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        },
      })
      if (!isMaster && empresaId && socio.empresaId !== empresaId) {
        throw new Error('Acesso negado.')
      }
      return socio
    })
  }

  async create(input: CreateSocioInput, userId?: string, _isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const socio = await db.socio.create({
        data: {
          nomeCompleto: input.nomeCompleto,
          cpf: input.cpf.replace(/\D/g, ''),
          rg: input.rg || null,
          orgaoEmissor: input.orgaoEmissor || null,
          dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : null,
          nacionalidade: input.nacionalidade || 'Brasileira',
          estadoCivil: input.estadoCivil || null,
          profissao: input.profissao || null,
          email: input.email || null,
          telefone: input.telefone || null,
          celular: input.celular || null,
          cep: input.cep || null,
          logradouro: input.logradouro || null,
          numero: input.numero || null,
          complemento: input.complemento || null,
          bairro: input.bairro || null,
          cidade: input.cidade || null,
          uf: input.uf || null,
          tipoSocio: input.tipoSocio,
          participacao: input.participacao ?? null,
          valorQuotas: input.valorQuotas ?? null,
          dataEntrada: input.dataEntrada ? new Date(input.dataEntrada) : null,
          dataSaida: input.dataSaida ? new Date(input.dataSaida) : null,
          assinaNaEmpresa: input.assinaNaEmpresa,
          responsavelLegal: input.responsavelLegal,
          observacoes: input.observacoes || null,
          clienteId: input.clienteId || null,
          isActive: input.isActive,
          empresaId: empresaId || null,
        },
      })

      await db.socioEvent.create({
        data: { socioId: socio.id, userId: userId || null, type: 'created', version: 1 },
      })

      return socio
    })
  }

  async update(id: string, input: UpdateSocioInput, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.socio.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) throw new Error('Acesso negado.')

      const changes: Record<string, { from: unknown; to: unknown }> = {}
      const data: Prisma.SocioUpdateInput = {}

      function track(field: keyof UpdateSocioInput) {
        if (input[field] === undefined) return
        const oldVal = (existing as Record<string, unknown>)[field as string]
        let newVal: unknown = input[field]
        if (field === 'cpf' && typeof newVal === 'string') newVal = newVal.replace(/\D/g, '')
        if (['dataNascimento', 'dataEntrada', 'dataSaida'].includes(field as string)) newVal = newVal ? new Date(newVal as string) : null
        if (newVal === '') newVal = null
        if (String(oldVal ?? '') !== String(newVal ?? '')) changes[field as string] = { from: oldVal, to: newVal }
        ;(data as Record<string, unknown>)[field as string] = newVal
      }

      const fields: (keyof UpdateSocioInput)[] = [
        'nomeCompleto', 'cpf', 'rg', 'orgaoEmissor', 'dataNascimento', 'nacionalidade',
        'estadoCivil', 'profissao', 'email', 'telefone', 'celular',
        'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf',
        'tipoSocio', 'participacao', 'valorQuotas', 'dataEntrada', 'dataSaida',
        'assinaNaEmpresa', 'responsavelLegal', 'observacoes', 'clienteId', 'isActive',
      ]
      for (const f of fields) track(f)

      const newVersion = existing.version + 1
      data.version = newVersion
      const updated = await db.socio.update({ where: { id }, data })

      if (Object.keys(changes).length > 0) {
        await db.socioEvent.create({
          data: { socioId: id, userId: userId || null, type: 'updated', version: newVersion, changes: changes as unknown as Prisma.InputJsonValue },
        })
      }
      return updated
    })
  }

  async delete(id: string, userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, async (db) => {
      const existing = await db.socio.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && existing.empresaId !== empresaId) throw new Error('Acesso negado.')
      await db.socioEvent.create({ data: { socioId: id, userId: userId || null, type: 'deleted', version: existing.version } })
      return db.socio.delete({ where: { id } })
    })
  }

  async listForSelect(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socio.findMany({
        where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
        select: { id: true, nomeCompleto: true, code: true, cpf: true, tipoSocio: true },
        orderBy: { nomeCompleto: 'asc' },
      }),
    )
  }

  async getEvents(id: string) {
    return prisma.socioEvent.findMany({
      where: { socioId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async exportAll(isMaster: boolean, empresaId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socio.findMany({
        where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
        include: { cliente: { select: { razaoSocial: true } } },
        orderBy: { code: 'asc' },
      }),
    )
  }

  // ============================================================
  // ARQUIVOS
  // ============================================================

  async listArquivos(socioId: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioArquivo.findMany({
        where: { socioId },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, name: true } } },
      }),
    )
  }

  async addArquivo(socioId: string, data: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string; vencimento?: string }, userId?: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioArquivo.create({
        data: {
          socioId,
          fileName: data.fileName,
          fileUrl: data.fileUrl,
          fileSize: data.fileSize || null,
          mimeType: data.mimeType || null,
          vencimento: data.vencimento ? new Date(data.vencimento) : null,
          userId: userId || null,
        },
      }),
    )
  }

  async renameArquivo(arquivoId: string, fileName: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioArquivo.update({ where: { id: arquivoId }, data: { fileName } }),
    )
  }

  async removeArquivo(arquivoId: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioArquivo.delete({ where: { id: arquivoId } }),
    )
  }

  // ============================================================
  // MENSAGENS
  // ============================================================

  async listMensagens(socioId: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioMensagem.findMany({
        where: { socioId },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      }),
    )
  }

  async createMensagem(socioId: string, userId: string | undefined, mensagem: string, tipo: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioMensagem.create({
        data: { socioId, userId: userId || null, mensagem, tipo },
        include: { user: { select: { id: true, name: true } } },
      }),
    )
  }

  async updateMensagem(id: string, mensagem: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioMensagem.update({
        where: { id },
        data: { mensagem },
        include: { user: { select: { id: true, name: true } } },
      }),
    )
  }

  async deleteMensagem(id: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socioMensagem.delete({ where: { id } }),
    )
  }

  // ============================================================

  async listByCliente(clienteId: string) {
    return prisma.socio.findMany({
      where: { clienteId },
      select: { id: true, nomeCompleto: true, cpf: true, tipoSocio: true, participacao: true },
      orderBy: { nomeCompleto: 'asc' },
    })
  }

  async deleteByClienteId(clienteId: string, tenantSchema?: string) {
    return scoped(tenantSchema, (db) =>
      db.socio.deleteMany({ where: { clienteId } }),
    )
  }

  async bulkCreate(items: CreateSocioInput[], userId?: string, isMaster?: boolean, empresaId?: string, tenantSchema?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, userId, isMaster, empresaId, tenantSchema)
        results.created++
      } catch (e) { results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`) }
    }
    return results
  }
}
