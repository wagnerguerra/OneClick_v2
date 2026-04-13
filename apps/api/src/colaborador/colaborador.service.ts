import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateColaboradorInput, UpdateColaboradorInput, ListColaboradorInput } from '@saas/types'

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.ColaboradorWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

@Injectable()
export class ColaboradorService {
  async list(input: ListColaboradorInput, isMaster: boolean, empresaId?: string) {
    const { page, limit, search, sortBy, sortDir, isActive, tipoContrato, areaId, cargoId } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.ColaboradorWhereInput = {
      ...empresaFilter(isMaster, empresaId),
      ...(search ? {
        OR: [
          { nomeCompleto: { contains: search, mode: 'insensitive' as const } },
          { cpf: { contains: search } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(tipoContrato ? { tipoContrato: tipoContrato as Prisma.EnumTipoContratoFilter['equals'] } : {}),
      ...(areaId ? { areaId } : {}),
      ...(cargoId ? { cargoId } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.colaborador.findMany({
        where, orderBy, skip, take,
        include: {
          area: { select: { id: true, name: true } },
          cargo: { select: { id: true, name: true } },
        },
      }),
      prisma.colaborador.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, isMaster: boolean, empresaId?: string) {
    const colaborador = await prisma.colaborador.findUniqueOrThrow({
      where: { id },
      include: {
        area: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    })
    if (!isMaster && empresaId && colaborador.empresaId !== empresaId) {
      throw new Error('Acesso negado.')
    }
    return colaborador
  }

  async create(input: CreateColaboradorInput, userId?: string, _isMaster?: boolean, empresaId?: string) {
    const colaborador = await prisma.colaborador.create({
      data: {
        nomeCompleto: input.nomeCompleto,
        cpf: input.cpf.replace(/\D/g, ''),
        rg: input.rg || null,
        orgaoEmissor: input.orgaoEmissor || null,
        dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : null,
        sexo: input.sexo || null,
        estadoCivil: input.estadoCivil || null,
        nacionalidade: input.nacionalidade || 'Brasileira',
        naturalidade: input.naturalidade || null,
        fotoUrl: input.fotoUrl || null,
        pis: input.pis || null,
        ctps: input.ctps || null,
        ctpsSerie: input.ctpsSerie || null,
        tituloEleitor: input.tituloEleitor || null,
        reservista: input.reservista || null,
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
        tipoContrato: input.tipoContrato,
        dataAdmissao: input.dataAdmissao ? new Date(input.dataAdmissao) : null,
        dataDemissao: input.dataDemissao ? new Date(input.dataDemissao) : null,
        salario: input.salario ?? null,
        cargaHoraria: input.cargaHoraria ?? 44,
        incluirFerias: input.incluirFerias,
        observacoes: input.observacoes || null,
        areaId: input.areaId || null,
        cargoId: input.cargoId || null,
        userId: input.userId || null,
        isActive: input.isActive,
        empresaId: empresaId || null,
      },
    })

    await prisma.colaboradorEvent.create({
      data: {
        colaboradorId: colaborador.id,
        userId: userId || null,
        type: 'created',
        version: 1,
        changes: undefined,
      },
    })

    return colaborador
  }

  async update(id: string, input: UpdateColaboradorInput, userId?: string, isMaster?: boolean, empresaId?: string) {
    const existing = await prisma.colaborador.findUniqueOrThrow({ where: { id } })
    if (!isMaster && empresaId && existing.empresaId !== empresaId) {
      throw new Error('Acesso negado.')
    }

    // Detectar mudanças para audit trail
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    const data: Prisma.ColaboradorUpdateInput = {}

    function track<K extends keyof UpdateColaboradorInput>(field: K, dbField?: string) {
      if (input[field] === undefined) return
      const key = dbField || (field as string)
      const oldVal = (existing as Record<string, unknown>)[key]
      let newVal: unknown = input[field]

      if (field === 'cpf' && typeof newVal === 'string') newVal = newVal.replace(/\D/g, '')
      if (['dataNascimento', 'dataAdmissao', 'dataDemissao'].includes(field as string)) {
        newVal = newVal ? new Date(newVal as string) : null
      }
      if (newVal === '') newVal = null

      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        changes[field as string] = { from: oldVal, to: newVal }
      }
      ;(data as Record<string, unknown>)[key] = newVal
    }

    track('nomeCompleto')
    track('cpf')
    track('rg')
    track('orgaoEmissor')
    track('dataNascimento')
    track('sexo')
    track('estadoCivil')
    track('nacionalidade')
    track('naturalidade')
    track('fotoUrl')
    track('pis')
    track('ctps')
    track('ctpsSerie')
    track('tituloEleitor')
    track('reservista')
    track('email')
    track('telefone')
    track('celular')
    track('cep')
    track('logradouro')
    track('numero')
    track('complemento')
    track('bairro')
    track('cidade')
    track('uf')
    track('tipoContrato')
    track('dataAdmissao')
    track('dataDemissao')
    track('salario')
    track('cargaHoraria')
    track('incluirFerias')
    track('observacoes')
    track('areaId')
    track('cargoId')
    track('userId')
    track('isActive')

    const newVersion = existing.version + 1
    data.version = newVersion

    const updated = await prisma.colaborador.update({ where: { id }, data })

    if (Object.keys(changes).length > 0) {
      await prisma.colaboradorEvent.create({
        data: {
          colaboradorId: id,
          userId: userId || null,
          type: 'updated',
          version: newVersion,
          changes: changes as unknown as Prisma.InputJsonValue,
        },
      })
    }

    return updated
  }

  async delete(id: string, userId?: string, isMaster?: boolean, empresaId?: string) {
    const existing = await prisma.colaborador.findUniqueOrThrow({ where: { id } })
    if (!isMaster && empresaId && existing.empresaId !== empresaId) {
      throw new Error('Acesso negado.')
    }

    await prisma.colaboradorEvent.create({
      data: {
        colaboradorId: id,
        userId: userId || null,
        type: 'deleted',
        version: existing.version,
        changes: undefined,
      },
    })

    return prisma.colaborador.delete({ where: { id } })
  }

  async listForSelect(isMaster: boolean, empresaId?: string) {
    return prisma.colaborador.findMany({
      where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
      select: { id: true, nomeCompleto: true, code: true, cpf: true },
      orderBy: { nomeCompleto: 'asc' },
    })
  }

  async getEvents(id: string) {
    return prisma.colaboradorEvent.findMany({
      where: { colaboradorId: id },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async exportAll(isMaster: boolean, empresaId?: string) {
    return prisma.colaborador.findMany({
      where: { isActive: true, ...empresaFilter(isMaster, empresaId) },
      include: {
        area: { select: { name: true } },
        cargo: { select: { name: true } },
      },
      orderBy: { code: 'asc' },
    })
  }

  async bulkCreate(items: CreateColaboradorInput[], userId?: string, isMaster?: boolean, empresaId?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, userId, isMaster, empresaId)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }
}
