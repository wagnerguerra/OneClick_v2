import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateColaboradorInput, UpdateColaboradorInput, ListColaboradorInput } from '@saas/types'

/**
 * Módulo Colaboradores agora opera sobre a tabela `User`,
 * filtrando apenas usuários com `exibirComoColaborador = true`.
 * Permissões/RBAC ficam no módulo /usuarios.
 */

function empresaFilter(isMaster: boolean, empresaId?: string): Prisma.UserWhereInput {
  return !isMaster && empresaId ? { empresaId } : {}
}

/** Aceita um User do Prisma e devolve no shape antigo de Colaborador (compat com frontend). */
function userToColaborador(u: any) {
  if (!u) return u
  return {
    ...u,
    // Aliases pra manter compatibilidade com o front
    nomeCompleto: u.name,
    fotoUrl: u.image,
    // Campos legados sem equivalente direto — preencher com defaults pra frontend não quebrar
    code: 0,
    version: 1,
  }
}

@Injectable()
export class ColaboradorService {
  async list(input: ListColaboradorInput, isMaster: boolean, empresaId?: string) {
    const { page, limit, search, sortBy, sortDir, isActive, tipoContrato, areaId, cargoId } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.UserWhereInput = {
      exibirComoColaborador: true,
      ...empresaFilter(isMaster, empresaId),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { cpf: { contains: search } },
          { email: { contains: search, mode: 'insensitive' as const } },
          // Busca também por cargo e área (qualquer registro das colunas)
          { cargo: { name: { contains: search, mode: 'insensitive' as const } } },
          { area: { name: { contains: search, mode: 'insensitive' as const } } },
        ],
      } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(tipoContrato ? { tipoContrato: tipoContrato as Prisma.EnumTipoContratoFilter['equals'] } : {}),
      ...(areaId ? { areaId } : {}),
      ...(cargoId ? { cargoId } : {}),
    }

    // sortBy mapping (compat: nomeCompleto → name; fotoUrl → image) + ordenação por
    // relação (cargo/area usam o nome da relação).
    const dir = (sortDir === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc'
    const sortField = sortBy === 'nomeCompleto' ? 'name' : (sortBy === 'fotoUrl' ? 'image' : sortBy)
    let orderBy: Prisma.UserOrderByWithRelationInput
    if (sortField === 'cargo') orderBy = { cargo: { name: dir } }
    else if (sortField === 'area') orderBy = { area: { name: dir } }
    else if (sortField) orderBy = { [sortField]: dir } as Prisma.UserOrderByWithRelationInput
    else orderBy = { name: 'asc' }

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy, skip, take,
        include: {
          area: { select: { id: true, name: true } },
          cargo: { select: { id: true, name: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return buildPaginatedResponse(data.map(userToColaborador), total, page, limit)
  }

  async getById(id: string, isMaster: boolean, empresaId?: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      include: {
        area: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
      },
    })
    if (!isMaster && empresaId && user.empresaId !== empresaId) {
      throw new Error('Acesso negado.')
    }
    if (!user.exibirComoColaborador) {
      throw new Error('Usuário não está marcado como colaborador.')
    }
    return userToColaborador(user)
  }

  async create(input: CreateColaboradorInput, _userId?: string, _isMaster?: boolean, empresaId?: string) {
    // Email único — se não vier, gera um placeholder determinístico (cpf-XXXXX@sem-acesso.local)
    const cpfLimpo = input.cpf.replace(/\D/g, '')
    const email = (input.email && input.email.trim()) || `cpf-${cpfLimpo}@sem-acesso.local`

    const user = await prisma.user.create({
      data: {
        // Identidade (User base)
        name: input.nomeCompleto,
        email,
        // Visibilidade no módulo Colaboradores
        exibirComoColaborador: true,
        isActive: input.isActive,
        // Documentos
        cpf: cpfLimpo,
        rg: input.rg || null,
        orgaoEmissor: input.orgaoEmissor || null,
        dataNascimento: input.dataNascimento ? new Date(input.dataNascimento) : null,
        sexo: input.sexo || null,
        estadoCivil: input.estadoCivil || null,
        nacionalidade: input.nacionalidade || 'Brasileira',
        naturalidade: input.naturalidade || null,
        image: input.fotoUrl || null,
        // Documentos trabalhistas
        pis: input.pis || null,
        ctps: input.ctps || null,
        ctpsSerie: input.ctpsSerie || null,
        tituloEleitor: input.tituloEleitor || null,
        reservista: input.reservista || null,
        // Contato
        telefone: input.telefone || null,
        celular: input.celular || null,
        // Endereço
        cep: input.cep || null,
        logradouro: input.logradouro || null,
        numero: input.numero || null,
        complemento: input.complemento || null,
        bairro: input.bairro || null,
        cidade: input.cidade || null,
        uf: input.uf || null,
        // Contrato / RH
        tipoContrato: input.tipoContrato,
        dataAdmissao: input.dataAdmissao ? new Date(input.dataAdmissao) : null,
        dataDemissao: input.dataDemissao ? new Date(input.dataDemissao) : null,
        salario: input.salario ?? null,
        cargaHoraria: input.cargaHoraria ?? 44,
        incluirFerias: input.incluirFerias,
        observacoes: input.observacoes || null,
        // Vínculos
        areaId: input.areaId || null,
        cargoId: input.cargoId || null,
        empresaId: empresaId || null,
      },
    })

    return userToColaborador(user)
  }

  async update(id: string, input: UpdateColaboradorInput, _userId?: string, isMaster?: boolean, empresaId?: string) {
    const existing = await prisma.user.findUniqueOrThrow({ where: { id } })
    if (!isMaster && empresaId && existing.empresaId !== empresaId) {
      throw new Error('Acesso negado.')
    }

    const data: Prisma.UserUpdateInput = {}

    function set<K extends keyof UpdateColaboradorInput>(field: K, dbField?: string) {
      if (input[field] === undefined) return
      const key = dbField || (field as string)
      let newVal: unknown = input[field]
      if (field === 'cpf' && typeof newVal === 'string') newVal = newVal.replace(/\D/g, '')
      if (['dataNascimento', 'dataAdmissao', 'dataDemissao'].includes(field as string)) {
        newVal = newVal ? new Date(newVal as string) : null
      }
      if (newVal === '') newVal = null
      ;(data as Record<string, unknown>)[key] = newVal
    }

    // Mapping nomeCompleto → name, fotoUrl → image
    set('nomeCompleto', 'name')
    set('fotoUrl', 'image')
    set('cpf')
    set('rg')
    set('orgaoEmissor')
    set('dataNascimento')
    set('sexo')
    set('estadoCivil')
    set('nacionalidade')
    set('naturalidade')
    set('pis')
    set('ctps')
    set('ctpsSerie')
    set('tituloEleitor')
    set('reservista')
    set('email')
    set('telefone')
    set('celular')
    set('cep')
    set('logradouro')
    set('numero')
    set('complemento')
    set('bairro')
    set('cidade')
    set('uf')
    set('tipoContrato')
    set('dataAdmissao')
    set('dataDemissao')
    set('salario')
    set('cargaHoraria')
    set('incluirFerias')
    set('observacoes')
    set('areaId')
    set('cargoId')
    set('isActive')

    const updated = await prisma.user.update({ where: { id }, data })
    return userToColaborador(updated)
  }

  async delete(id: string, _userId?: string, isMaster?: boolean, empresaId?: string) {
    const existing = await prisma.user.findUniqueOrThrow({ where: { id } })
    if (!isMaster && empresaId && existing.empresaId !== empresaId) {
      throw new Error('Acesso negado.')
    }
    // Não apaga o User — apenas retira do módulo Colaboradores
    return prisma.user.update({
      where: { id },
      data: { exibirComoColaborador: false },
    })
  }

  async listForSelect(isMaster: boolean, empresaId?: string) {
    const users = await prisma.user.findMany({
      where: { isActive: true, exibirComoColaborador: true, ...empresaFilter(isMaster, empresaId) },
      select: { id: true, name: true, cpf: true },
      orderBy: { name: 'asc' },
    })
    return users.map(u => ({ id: u.id, nomeCompleto: u.name, code: 0, cpf: u.cpf }))
  }

  /**
   * Lista colaboradores ativos com telefone/celular preenchido.
   * O ramal é derivado dos 4 últimos dígitos do telefone (preferindo celular).
   */
  async listRamais(isMaster: boolean, empresaId?: string) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      exibirComoColaborador: true,
      ...empresaFilter(isMaster, empresaId),
    }

    const [users, totalAtivos] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          image: true,
          email: true,
          telefone: true,
          celular: true,
          area: { select: { name: true } },
          cargo: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.user.count({ where }),
    ])

    const items = users
      .map(u => {
        const fonte = u.celular || u.telefone || ''
        const digitos = fonte.replace(/\D/g, '')
        const ramal = digitos.length >= 4 ? digitos.slice(-4) : null
        return {
          id: u.id,
          nomeCompleto: u.name,
          fotoUrl: u.image,
          email: u.email,
          telefone: u.telefone,
          celular: u.celular,
          area: u.area,
          cargo: u.cargo,
          ramal,
        }
      })
      .filter(c => c.ramal !== null)

    return { items, totalAtivos }
  }

  async getEvents(_id: string) {
    // Eventos do módulo legado de Colaborador foram desativados na unificação com User.
    // Histórico de auditoria do User pode ser feito via outro mecanismo no futuro.
    return []
  }

  async exportAll(isMaster: boolean, empresaId?: string) {
    const users = await prisma.user.findMany({
      where: { isActive: true, exibirComoColaborador: true, ...empresaFilter(isMaster, empresaId) },
      include: {
        area: { select: { name: true } },
        cargo: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    })
    return users.map(userToColaborador)
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
