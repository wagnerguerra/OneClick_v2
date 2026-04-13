import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateClienteInput, UpdateClienteInput, ListClienteInput } from '@saas/types'

const FIELD_LABELS: Record<string, string> = {
  razaoSocial: 'Razão Social', nomeFantasia: 'Nome Fantasia', documento: 'Documento',
  tipoDocumento: 'Tipo Documento', tipoCliente: 'Tipo Cliente', logoUrl: 'Logo',
  idSistema: 'ID SCI', idOmie: 'ID Omie', omieEmpresa: 'Empresa Omie', idOneClick: 'ID OneClick',
  situacao: 'Situação', status: 'Status', grupo: 'Grupo', categoria: 'Categoria', origem: 'Origem',
  dataEntrada: 'Data Entrada', dataSaida: 'Data Saída', observacoes: 'Observações',
  tributacao: 'Tributação', regime: 'Regime', inscricaoEstadual: 'IE', inscricaoMunicipal: 'IM',
  areasContratadas: 'Áreas Contratadas',
  cep: 'CEP', logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento',
  bairro: 'Bairro', cidade: 'Cidade', uf: 'UF',
  telefone: 'Telefone', email: 'E-mail', isActive: 'Ativo',
}

function detectChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of Object.keys(FIELD_LABELS)) {
    const oldVal = before[key] ?? null
    const newVal = after[key] ?? null
    if (String(oldVal) !== String(newVal)) changes[key] = { from: oldVal, to: newVal }
  }
  return Object.keys(changes).length > 0 ? changes : null
}

function empresaFilter(isMaster?: boolean, empresaId?: string): Prisma.ClienteWhereInput {
  if (isMaster) return {}
  return empresaId ? { empresaId } : { empresaId: '__none__' }
}

function parseOptionalDate(value?: string | null): Date | null {
  if (!value || value === '') return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

const SITUACAO_SEARCH: Record<string, string[]> = {
  MENSAL: ['mensal'],
  EM_CONSTITUICAO: ['constituicao', 'constituição', 'em constituição', 'em constituicao'],
  POTENCIAL: ['potencial'],
  AVULSO: ['avulso'],
  PARALIZADO: ['paralizado', 'paralisado'],
  PRE_OPERACIONAL: ['pre operacional', 'pré operacional', 'pre-operacional'],
  PROSPECT: ['prospect'],
}

const TRIBUTACAO_SEARCH: Record<string, string[]> = {
  SIMPLES_NACIONAL: ['simples', 'simples nacional'],
  LUCRO_PRESUMIDO: ['presumido', 'lucro presumido'],
  LUCRO_REAL: ['lucro real'],
  MEI: ['mei'],
}

function matchEnumSituacao(search: string): Prisma.ClienteWhereInput[] {
  const s = search.toLowerCase().trim()
  const matches = Object.entries(SITUACAO_SEARCH)
    .filter(([, terms]) => terms.some((t) => t.includes(s) || s.includes(t)))
    .map(([key]) => ({ situacao: key as never }))
  return matches
}

function matchEnumTributacao(search: string): Prisma.ClienteWhereInput[] {
  const s = search.toLowerCase().trim()
  const matches = Object.entries(TRIBUTACAO_SEARCH)
    .filter(([, terms]) => terms.some((t) => t.includes(s) || s.includes(t)))
    .map(([key]) => ({ tributacao: key as never }))
  return matches
}

@Injectable()
export class ClienteService {
  // ============================================================
  // Listagem (ativos)
  // ============================================================
  async list(input: ListClienteInput, isMaster?: boolean, empresaId?: string) {
    const { page, limit, search, sortBy, sortDir, situacao, status, tributacao } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.ClienteWhereInput = {
      deletedAt: null, // Somente ativos (não na lixeira)
      ...empresaFilter(isMaster, empresaId),
      ...(search ? { OR: [
        { razaoSocial: { contains: search, mode: 'insensitive' as const } },
        { nomeFantasia: { contains: search, mode: 'insensitive' as const } },
        { documento: { contains: search } },
        { cidade: { contains: search, mode: 'insensitive' as const } },
        { uf: { contains: search, mode: 'insensitive' as const } },
        { grupo: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { telefone: { contains: search } },
        { tipoCliente: { contains: search, mode: 'insensitive' as const } },
        { origem: { contains: search, mode: 'insensitive' as const } },
        { areasContratadas: { contains: search, mode: 'insensitive' as const } },
        { idSistema: { contains: search } },
        ...matchEnumSituacao(search),
        ...matchEnumTributacao(search),
      ] } : {}),
      ...(situacao ? { situacao } : {}),
      ...(status ? { status } : {}),
      ...(tributacao ? { tributacao } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.cliente.findMany({ where, orderBy, skip, take }),
      prisma.cliente.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  // ============================================================
  // Lixeira (soft-deleted)
  // ============================================================
  async listTrash(input: ListClienteInput, isMaster?: boolean, empresaId?: string) {
    const { page, limit, search, sortBy, sortDir } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.ClienteWhereInput = {
      deletedAt: { not: null },
      ...empresaFilter(isMaster, empresaId),
      ...(search ? { OR: [
        { razaoSocial: { contains: search, mode: 'insensitive' as const } },
        { documento: { contains: search } },
      ] } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { deletedAt: 'desc' as const }

    const [data, total] = await Promise.all([
      prisma.cliente.findMany({ where, orderBy, skip, take }),
      prisma.cliente.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  // ============================================================
  // Obter por ID
  // ============================================================
  async getById(id: string, isMaster?: boolean, empresaId?: string) {
    const cliente = await prisma.cliente.findUniqueOrThrow({
      where: { id },
      include: {
        arquivos: { orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, name: true } } } },
        contatos: { orderBy: [{ principal: 'desc' }, { nome: 'asc' }] },
      },
    })
    if (!isMaster && empresaId && cliente.empresaId !== empresaId) {
      throw new Error('Acesso negado: cliente pertence a outra empresa')
    }
    return cliente
  }

  // ============================================================
  // Criar
  // ============================================================
  async create(input: CreateClienteInput, userId?: string, empresaId?: string) {
    return prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.create({
        data: {
          razaoSocial: input.razaoSocial,
          nomeFantasia: input.nomeFantasia || null,
          documento: input.documento,
          tipoDocumento: (input.tipoDocumento || 'CNPJ') as never,
          tipoCliente: input.tipoCliente || null,
          idSistema: input.idSistema || null,
          idOmie: input.idOmie || null,
          omieEmpresa: input.omieEmpresa || null,
          idOneClick: input.idOneClick || null,
          situacao: (input.situacao || 'MENSAL') as never,
          status: (input.status || 'ATIVA') as never,
          grupo: input.grupo || null,
          categoria: input.categoria || 'NAO_INFORMADO',
          origem: input.origem || null,
          dataEntrada: parseOptionalDate(input.dataEntrada),
          dataSaida: parseOptionalDate(input.dataSaida),
          observacoes: input.observacoes || null,
          tributacao: (input.tributacao || null) as never,
          regime: (input.regime || null) as never,
          inscricaoEstadual: input.inscricaoEstadual || null,
          inscricaoMunicipal: input.inscricaoMunicipal || null,
          areasContratadas: input.areasContratadas || null,
          cep: input.cep || null,
          logradouro: input.logradouro || null,
          numero: input.numero || null,
          complemento: input.complemento || null,
          bairro: input.bairro || null,
          cidade: input.cidade || null,
          uf: input.uf || null,
          telefone: input.telefone || null,
          email: input.email || null,
          logoUrl: input.logoUrl || null,
          isActive: input.isActive ?? true,
          empresaId: empresaId || null,
          version: 1,
        },
      })
      await tx.clienteEvent.create({
        data: { clienteId: cliente.id, userId: userId || null, type: 'created', version: 1 },
      })
      return cliente
    })
  }

  // ============================================================
  // Atualizar
  // ============================================================
  async update(id: string, input: UpdateClienteInput, userId?: string, isMaster?: boolean, empresaId?: string) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.cliente.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && before.empresaId !== empresaId) {
        throw new Error('Acesso negado')
      }
      const data: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined) continue
        if (key === 'dataEntrada' || key === 'dataSaida') {
          data[key] = parseOptionalDate(value as string)
        } else {
          data[key] = typeof value === 'string' && value === '' ? null : value
        }
      }
      const newVersion = before.version + 1
      data.version = newVersion
      const cliente = await tx.cliente.update({ where: { id }, data })
      const changes = detectChanges(before as unknown as Record<string, unknown>, data)
      if (changes) {
        await tx.clienteEvent.create({
          data: { clienteId: id, userId: userId || null, type: 'updated', version: newVersion, changes: changes as Prisma.InputJsonValue },
        })
      }
      return cliente
    })
  }

  // ============================================================
  // Soft Delete (mover para lixeira)
  // ============================================================
  async delete(id: string, userId?: string, isMaster?: boolean, empresaId?: string) {
    return prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && cliente.empresaId !== empresaId) {
        throw new Error('Acesso negado')
      }
      await tx.clienteEvent.create({
        data: { clienteId: id, userId: userId || null, type: 'deleted', version: cliente.version },
      })
      return tx.cliente.update({ where: { id }, data: { deletedAt: new Date() } })
    })
  }

  // ============================================================
  // Restaurar da lixeira
  // ============================================================
  async restore(id: string, userId?: string, isMaster?: boolean, empresaId?: string) {
    return prisma.$transaction(async (tx) => {
      const cliente = await tx.cliente.findUniqueOrThrow({ where: { id } })
      if (!isMaster && empresaId && cliente.empresaId !== empresaId) {
        throw new Error('Acesso negado')
      }
      await tx.clienteEvent.create({
        data: { clienteId: id, userId: userId || null, type: 'restored', version: cliente.version },
      })
      return tx.cliente.update({ where: { id }, data: { deletedAt: null } })
    })
  }

  // ============================================================
  // Excluir permanentemente
  // ============================================================
  async deletePermanent(id: string, isMaster?: boolean, empresaId?: string) {
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id } })
    if (!isMaster && empresaId && cliente.empresaId !== empresaId) {
      throw new Error('Acesso negado')
    }
    return prisma.cliente.delete({ where: { id } })
  }

  // ============================================================
  // Eventos (Log de auditoria)
  // ============================================================
  async getEvents(clienteId: string) {
    return prisma.clienteEvent.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  // ============================================================
  // Exportar todos
  // ============================================================
  async exportAll(isMaster?: boolean, empresaId?: string) {
    return prisma.cliente.findMany({
      where: { deletedAt: null, ...empresaFilter(isMaster, empresaId) },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  // ============================================================
  // Importação em lote
  // ============================================================
  async bulkCreate(items: CreateClienteInput[], userId?: string, empresaId?: string) {
    const results = { created: 0, updated: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, userId, empresaId)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }

  // ============================================================
  // Lista para select (dropdown)
  // ============================================================
  async listForSelect(isMaster?: boolean, empresaId?: string) {
    return prisma.cliente.findMany({
      where: { deletedAt: null, ...empresaFilter(isMaster, empresaId) },
      select: { id: true, razaoSocial: true, nomeFantasia: true, code: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  // ============================================================
  // Opções de filtros (valores distintos para dropdowns)
  // ============================================================
  async getFilterOptions(isMaster?: boolean, empresaId?: string) {
    const base = { deletedAt: null, ...empresaFilter(isMaster, empresaId) }
    const [grupos, cidades, estados] = await Promise.all([
      prisma.cliente.findMany({ where: { ...base, grupo: { not: null } }, select: { grupo: true }, distinct: ['grupo'], orderBy: { grupo: 'asc' } }),
      prisma.cliente.findMany({ where: { ...base, cidade: { not: null } }, select: { cidade: true }, distinct: ['cidade'], orderBy: { cidade: 'asc' } }),
      prisma.cliente.findMany({ where: { ...base, uf: { not: null } }, select: { uf: true }, distinct: ['uf'], orderBy: { uf: 'asc' } }),
    ])
    return {
      grupos: grupos.map(g => g.grupo).filter(Boolean),
      cidades: cidades.map(c => c.cidade).filter(Boolean),
      estados: estados.map(e => e.uf).filter(Boolean),
    }
  }

  // ============================================================
  // ARQUIVOS
  // ============================================================
  async addArquivo(clienteId: string, data: { fileName: string; fileUrl: string; fileSize?: number; mimeType?: string; vencimento?: string }, userId?: string) {
    return prisma.clienteArquivo.create({
      data: {
        clienteId,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        fileSize: data.fileSize || null,
        mimeType: data.mimeType || null,
        vencimento: parseOptionalDate(data.vencimento),
        userId: userId || null,
      },
    })
  }

  async renameArquivo(arquivoId: string, fileName: string) {
    return prisma.clienteArquivo.update({ where: { id: arquivoId }, data: { fileName } })
  }

  async removeArquivo(arquivoId: string) {
    return prisma.clienteArquivo.delete({ where: { id: arquivoId } })
  }

  async listArquivos(clienteId: string) {
    return prisma.clienteArquivo.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  // ============================================================
  // CONTATOS
  // ============================================================
  async addContato(clienteId: string, data: { nome: string; cargo?: string; telefone?: string; email?: string; observacoes?: string; principal?: boolean; areaId?: string }) {
    return prisma.clienteContato.create({
      data: {
        clienteId,
        nome: data.nome,
        cargo: data.cargo || null,
        telefone: data.telefone || null,
        email: data.email || null,
        observacoes: data.observacoes || null,
        principal: data.principal ?? false,
        areaId: data.areaId || null,
      },
    })
  }

  async updateContato(contatoId: string, data: { nome?: string; cargo?: string; telefone?: string; email?: string; observacoes?: string; principal?: boolean; areaId?: string | null }) {
    const updateData: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) updateData[key] = typeof value === 'string' && value === '' ? null : value
    }
    return prisma.clienteContato.update({ where: { id: contatoId }, data: updateData })
  }

  async removeContato(contatoId: string) {
    return prisma.clienteContato.delete({ where: { id: contatoId } })
  }

  async listContatos(clienteId: string) {
    return prisma.clienteContato.findMany({
      where: { clienteId },
      include: { area: { select: { id: true, name: true } } },
      orderBy: [{ principal: 'desc' }, { nome: 'asc' }],
    })
  }

  async setPrincipalContato(contatoId: string) {
    const contato = await prisma.clienteContato.findUniqueOrThrow({ where: { id: contatoId } })
    await prisma.$transaction([
      prisma.clienteContato.updateMany({ where: { clienteId: contato.clienteId }, data: { principal: false } }),
      prisma.clienteContato.update({ where: { id: contatoId }, data: { principal: true } }),
    ])
    return contato
  }

  // ============================================================
  // PARÂMETROS DO CONTRATO
  // ============================================================
  async getContratoParams(clienteId: string, empresaId?: string) {
    return prisma.clienteContratoParam.findFirst({
      where: { clienteId, ...(empresaId ? { empresaId } : {}) },
    })
  }

  async saveContratoParams(clienteId: string, empresaId: string | undefined, data: {
    honorario: number; lancamentos: number; faturamento: number
    nfEntrada: number; nfSaida: number; nfPrestado: number; nfTomado: number; funcionarios: number
  }) {
    return prisma.clienteContratoParam.upsert({
      where: { clienteId_empresaId: { clienteId, empresaId: empresaId || '' } },
      create: { clienteId, empresaId: empresaId || null, ...data },
      update: data,
    })
  }

  // ============================================================
  // SNAPSHOTS ERP (SCI)
  // ============================================================
  async getErpSnapshots(clienteId: string, empresaId?: string, datai?: string, dataf?: string) {
    const where: Record<string, unknown> = { clienteId }
    if (empresaId) where.empresaId = empresaId
    if (datai && dataf) {
      where.mes = { gte: datai.slice(0, 7), lte: dataf.slice(0, 7) }
    }
    return prisma.clienteErpSnapshot.findMany({
      where: where as never,
      orderBy: [{ mes: 'asc' }, { indicador: 'asc' }],
    })
  }

  async saveErpSnapshot(clienteId: string, empresaId: string | undefined, mes: string, indicador: string, valor: number) {
    return prisma.clienteErpSnapshot.upsert({
      where: { clienteId_empresaId_mes_indicador: { clienteId, empresaId: empresaId || '', mes, indicador } },
      create: { clienteId, empresaId: empresaId || null, mes, indicador, valor },
      update: { valor },
    })
  }

  // ============================================================
  // HISTÓRICO COMERCIAL (Chat)
  // ============================================================
  async listHistoricos(clienteId: string) {
    return prisma.clienteHistorico.findMany({
      where: { clienteId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  async createHistorico(clienteId: string, userId: string | undefined, mensagem: string, tipo: string) {
    return prisma.clienteHistorico.create({
      data: { clienteId, userId: userId || null, mensagem, tipo },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  async updateHistorico(id: string, mensagem: string) {
    return prisma.clienteHistorico.update({
      where: { id },
      data: { mensagem },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  async deleteHistorico(id: string) {
    return prisma.clienteHistorico.delete({ where: { id } })
  }
}
