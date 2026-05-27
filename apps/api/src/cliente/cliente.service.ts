import { Injectable, Inject, forwardRef } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateClienteInput, UpdateClienteInput, ListClienteInput } from '@saas/types'
import { BiSyncEventsService } from '../bi/bi-sync-events.service'

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
  constructor(
    @Inject(forwardRef(() => BiSyncEventsService))
    private readonly biSyncEvents: BiSyncEventsService,
  ) {}

  // ============================================================
  // Listagem (ativos)
  // ============================================================
  async list(input: ListClienteInput, isMaster?: boolean, empresaId?: string) {
    const { page, limit, search, sortBy, sortDir, situacao, status, tributacao, grupo, cidade, uf, isLead } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.ClienteWhereInput = {
      deletedAt: null,
      ...(isLead !== undefined ? { isLead } : {}),
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
      ...(grupo ? { grupo } : {}),
      ...(cidade ? { cidade } : {}),
      ...(uf ? { uf } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.cliente.findMany({
        where, orderBy, skip, take,
        include: {
          servicosContratados: {
            where: { contratado: true },
            select: { area: { select: { name: true } } },
          },
        },
      }),
      prisma.cliente.count({ where }),
    ])

    const mapped = data.map(c => {
      const { servicosContratados, ...rest } = c
      return {
        ...rest,
        areasContratadas: servicosContratados.length > 0
          ? servicosContratados.map(s => s.area.name).join(';')
          : rest.areasContratadas,
      }
    })

    return buildPaginatedResponse(mapped, total, page, limit)
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
      // SSE: notifica o Launcher se idSistema mudou (pra refresh em tempo real)
      if (changes && 'idSistema' in changes) {
        this.biSyncEvents.emitClienteUpdated(
          id,
          (changes as Record<string, { from: unknown; to: unknown }>).idSistema?.from as string | null,
          (changes as Record<string, { from: unknown; to: unknown }>).idSistema?.to as string | null,
        )
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
  // Esvaziar lixeira
  // ============================================================
  async emptyTrash(isMaster?: boolean, empresaId?: string) {
    const where: Prisma.ClienteWhereInput = {
      deletedAt: { not: null },
      ...empresaFilter(isMaster, empresaId),
    }

    const trashed = await prisma.cliente.findMany({
      where,
      select: { id: true, razaoSocial: true },
    })

    if (trashed.length === 0) return { deleted: 0, total: 0 }

    let deleted = 0
    const errors: string[] = []

    for (const item of trashed) {
      try {
        await prisma.cliente.delete({ where: { id: item.id } })
        deleted++
      } catch (e) {
        const msg = (e as Error).message?.slice(0, 200) || 'Erro desconhecido'
        errors.push(`${item.razaoSocial}: ${msg}`)
      }
    }

    return { deleted, total: trashed.length, errors: errors.length > 0 ? errors.slice(0, 20) : undefined }
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
  // Lookup leve usado em vários módulos (orçamentos, CRM, contratos, etc).
  // Diferente do `list` completo, este filtro inclui clientes órfãos
  // (empresaId=null — legado/migração) para que dropdowns nunca venham
  // vazios por causa de divergência de scope. Master continua vendo tudo.
  async listForSelect(isMaster?: boolean, empresaId?: string) {
    const where: Prisma.ClienteWhereInput = isMaster
      ? { deletedAt: null }
      : empresaId
        ? { deletedAt: null, OR: [{ empresaId }, { empresaId: null }] }
        : { deletedAt: null, empresaId: null }
    return prisma.cliente.findMany({
      where,
      select: { id: true, razaoSocial: true, nomeFantasia: true, code: true, documento: true, situacao: true },
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
    // Retorna o mais recente (proteção contra duplicatas históricas; o save
    // novo já garante linha única).
    return prisma.clienteContratoParam.findFirst({
      where: { clienteId, ...(empresaId ? { empresaId } : {}) },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async saveContratoParams(clienteId: string, empresaId: string | undefined, data: {
    honorario: number; lancamentos: number; faturamento: number
    nfEntrada: number; nfSaida: number; nfPrestado: number; nfTomado: number; funcionarios: number
  }) {
    const clean = {
      honorario: Number(data.honorario) || 0,
      lancamentos: Math.round(Number(data.lancamentos) || 0),
      faturamento: Number(data.faturamento) || 0,
      nfEntrada: Math.round(Number(data.nfEntrada) || 0),
      nfSaida: Math.round(Number(data.nfSaida) || 0),
      nfPrestado: Math.round(Number(data.nfPrestado) || 0),
      nfTomado: Math.round(Number(data.nfTomado) || 0),
      funcionarios: Math.round(Number(data.funcionarios) || 0),
    }
    // Não usar `upsert` com chave composta que inclui empresa_id NULLável: no
    // Postgres `NULL != NULL` em unique, então a constraint não dispara e o
    // upsert insere linha duplicada toda vez. Faz find+update OR create.
    const empresa = empresaId || null
    const existing = await prisma.clienteContratoParam.findFirst({
      where: { clienteId, empresaId: empresa },
    })
    if (existing) {
      return prisma.clienteContratoParam.update({ where: { id: existing.id }, data: clean })
    }
    return prisma.clienteContratoParam.create({ data: { clienteId, empresaId: empresa, ...clean } })
  }

  // ============================================================
  // SNAPSHOTS ERP (SCI)
  // ============================================================
  /**
   * Persiste o retorno do SCI no banco. Chamado após cada `buscarMetricasSci`
   * bem-sucedida (local ou via Launcher remoto). Gráficos depois leem só do DB.
   */
  async salvarSnapshotsSci(
    clienteId: string,
    empresaId: string | undefined,
    metricas: Record<string, unknown>,
  ): Promise<{ salvos: number }> {
    const INDICADORES = ['lancamentos', 'faturamento', 'nf_entrada', 'nf_saida', 'nf_prestado', 'nf_tomado', 'vidas']
    const empresa = empresaId || null
    let salvos = 0
    for (const ind of INDICADORES) {
      const rows = metricas[ind]
      if (!Array.isArray(rows)) continue
      for (const r of rows as Array<{ ano?: number; mes?: number; movimentacao?: number }>) {
        const ano = Number(r.ano)
        const mes = Number(r.mes)
        if (!ano || !mes) continue
        const valor = Number(r.movimentacao) || 0
        const mesStr = `${ano}-${String(mes).padStart(2, '0')}`
        const existing = await prisma.clienteErpSnapshot.findFirst({
          where: { clienteId, empresaId: empresa, mes: mesStr, indicador: ind },
        })
        if (existing) {
          await prisma.clienteErpSnapshot.update({ where: { id: existing.id }, data: { valor } })
        } else {
          await prisma.clienteErpSnapshot.create({
            data: { clienteId, empresaId: empresa, mes: mesStr, indicador: ind, valor },
          })
        }
        salvos++
      }
    }
    return { salvos }
  }

  /**
   * Lê o snapshot e devolve no MESMO shape do `sciService.buscarMetricasSci`
   * (sucesso, periodo, indicador → linhas [{ ano, mes, movimentacao }]).
   * Usado pelos gráficos pra evitar tocar no SCI a cada render.
   */
  async getMetricasSnapshot(
    clienteId: string,
    empresaId: string | undefined,
    datai: string,
    dataf: string,
  ): Promise<Record<string, unknown>> {
    const empresa = empresaId || null
    const rows = await prisma.clienteErpSnapshot.findMany({
      where: {
        clienteId,
        ...(empresa ? { empresaId: empresa } : {}),
        mes: { gte: datai.slice(0, 7), lte: dataf.slice(0, 7) },
      },
      orderBy: { mes: 'asc' },
    })
    const out: Record<string, Array<{ ano: number; mes: number; movimentacao: number }>> = {
      lancamentos: [], faturamento: [], nf_entrada: [], nf_saida: [], nf_prestado: [], nf_tomado: [], vidas: [],
    }
    for (const r of rows) {
      const [anoStr, mesStr] = r.mes.split('-')
      const ano = Number(anoStr)
      const mes = Number(mesStr)
      if (out[r.indicador]) {
        out[r.indicador].push({ ano, mes, movimentacao: r.valor })
      }
    }
    return { sucesso: true, periodo: { datai, dataf }, ...out, origem: 'snapshot' }
  }

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

  // ============================================================
  // SERVIÇOS (ÁREAS CONTRATADAS)
  // ============================================================

  async listServicos(clienteId: string) {
    const [areas, contratos, usuarios] = await Promise.all([
      prisma.area.findMany({ where: { isActive: true, availableForHiring: true }, select: { id: true, name: true, leaderId: true }, orderBy: { name: 'asc' } }),
      prisma.clienteAreaContratada.findMany({
        where: { clienteId },
        include: {
          responsavel: { select: { id: true, name: true } },
          substituto: { select: { id: true, name: true } },
        },
      }),
      prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, areaId: true }, orderBy: { name: 'asc' } }),
    ])

    const cMap = new Map(contratos.map(c => [c.areaId, c]))

    const merged = areas.map(area => {
      const c = cMap.get(area.id)
      return {
        areaId: area.id,
        areaNome: area.name,
        areaLeaderId: area.leaderId ?? null,
        contratado: c?.contratado ?? false,
        responsavelId: c?.responsavelId ?? null,
        substitutoId: c?.substitutoId ?? null,
        responsavelNome: c?.responsavel?.name ?? null,
        substitutoNome: c?.substituto?.name ?? null,
        dataEncerramento: c?.dataEncerramento ?? null,
        observacoes: c?.observacoes ?? null,
        complexidadePeso: c?.complexidadePeso ? Number(c.complexidadePeso) : 0,
        clienteAreaContratadaId: c?.id ?? null,
      }
    })

    return { areas: merged, usuarios }
  }

  async saveServicos(
    clienteId: string,
    items: Array<{
      areaId: string; contratado: boolean
      responsavelId?: string | null; substitutoId?: string | null
      dataEncerramento?: string | null; observacoes?: string | null
    }>,
    userId?: string,
    isMaster?: boolean,
  ) {
    const areas = await prisma.area.findMany({ select: { id: true, leaderId: true } })
    const leaderMap = new Map(areas.map(a => [a.id, a.leaderId]))

    let saved = 0
    for (const item of items) {
      const contratado = item.contratado
      let respId = contratado ? (item.responsavelId || null) : null
      let subsId = contratado ? (item.substitutoId || null) : null

      // Validar: apenas lider da area ou master pode alterar responsavel
      if (!isMaster && userId) {
        const leaderId = leaderMap.get(item.areaId)
        if (leaderId && leaderId !== userId) {
          const existing = await prisma.clienteAreaContratada.findUnique({
            where: { clienteId_areaId: { clienteId, areaId: item.areaId } },
            select: { responsavelId: true, substitutoId: true },
          })
          if (existing) {
            respId = existing.responsavelId
            subsId = existing.substitutoId
          }
        }
      }

      const data = {
        contratado,
        responsavelId: respId,
        substitutoId: subsId,
        dataEncerramento: item.dataEncerramento ? new Date(item.dataEncerramento) : null,
        observacoes: item.observacoes || null,
      }

      await prisma.clienteAreaContratada.upsert({
        where: { clienteId_areaId: { clienteId, areaId: item.areaId } },
        create: { clienteId, areaId: item.areaId, ...data },
        update: data,
      })
      saved++
    }
    return { saved }
  }

  async getParametros(clienteAreaContratadaId: string) {
    const params = await prisma.clienteAreaParametro.findMany({
      where: { clienteAreaContratadaId },
      orderBy: [{ tipo: 'asc' }, { nome: 'asc' }],
    })
    const parsed = params.map(p => ({ ...p, valor: Number(p.valor) }))
    const total = parsed.reduce((s, p) => s + p.valor, 0)
    const media = parsed.length > 0 ? Math.round((total / parsed.length) * 10) / 10 : 0
    return { parametros: parsed, media }
  }

  async saveParametros(
    clienteAreaContratadaId: string,
    params: Array<{ tipo: string; nome: string; descricao?: string; valor: number }>,
  ) {
    await prisma.$transaction(async (tx) => {
      await tx.clienteAreaParametro.deleteMany({ where: { clienteAreaContratadaId } })
      if (params.length > 0) {
        await tx.clienteAreaParametro.createMany({
          data: params.map(p => ({
            clienteAreaContratadaId,
            tipo: p.tipo,
            nome: p.nome,
            descricao: p.descricao || null,
            valor: p.valor,
          })),
        })
      }
    })

    // Recalcular complexidade_peso
    const media = params.length > 0
      ? params.reduce((s, p) => s + p.valor, 0) / params.length
      : 0
    await prisma.clienteAreaContratada.update({
      where: { id: clienteAreaContratadaId },
      data: { complexidadePeso: Math.round(media * 10000) / 10000 },
    })
    return { saved: params.length, complexidadePeso: media }
  }

  async getClientesParaCopiarEstrutura(clienteId: string, empresaId?: string) {
    const clientes = await prisma.cliente.findMany({
      where: {
        id: { not: clienteId },
        deletedAt: null,
        ...(empresaId ? { empresaId } : {}),
        servicosContratados: { some: { parametros: { some: {} } } },
      },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
      take: 100,
    })
    return clientes.map(c => ({ id: c.id, razaoSocial: c.razaoSocial, documento: c.documento }))
  }

  async copiarEstrutura(fromClienteId: string, toClienteAreaContratadaId: string) {
    const target = await prisma.clienteAreaContratada.findUniqueOrThrow({
      where: { id: toClienteAreaContratadaId },
    })

    const source = await prisma.clienteAreaContratada.findFirst({
      where: { clienteId: fromClienteId, areaId: target.areaId },
      include: { parametros: true },
    })
    if (!source || source.parametros.length === 0) {
      throw new Error('Cliente de origem não possui parâmetros para esta área.')
    }

    await prisma.$transaction(async (tx) => {
      await tx.clienteAreaParametro.deleteMany({ where: { clienteAreaContratadaId: toClienteAreaContratadaId } })
      await tx.clienteAreaParametro.createMany({
        data: source.parametros.map(p => ({
          clienteAreaContratadaId: toClienteAreaContratadaId,
          tipo: p.tipo,
          nome: p.nome,
          descricao: p.descricao,
          valor: p.valor,
        })),
      })
    })
    return { copied: source.parametros.length }
  }

  // ============================================================
  // PARTICULARIDADES (notas por área contratada)
  // ============================================================

  private readonly CPT = 'cliente_particularidades'

  async listParticularidades(clienteId: string) {
    // Todas as areas contratadas com suas particularidades
    const allAreas = await prisma.clienteAreaContratada.findMany({
      where: { clienteId, contratado: true },
      include: {
        area: { select: { name: true } },
      },
      orderBy: { area: { name: 'asc' } },
    })

    // Buscar particularidades existentes via raw (tabela não é model Prisma ainda)
    type PartRow = { cliente_area_contratada_id: string; texto: string; updated_by_user_id: string | null; updated_at: Date; user_nome: string | null }
    const parts = await prisma.$queryRawUnsafe<PartRow[]>(
      `SELECT cp.cliente_area_contratada_id, cp.texto, cp.updated_by_user_id, cp.updated_at, u.name AS user_nome
       FROM cliente_particularidades cp
       LEFT JOIN users u ON u.id = cp.updated_by_user_id
       WHERE cp.cliente_area_contratada_id = ANY($1::text[])`,
      allAreas.map(a => a.id),
    )
    const existingMap = new Map(parts.map(r => [r.cliente_area_contratada_id, r]))

    return allAreas.map(a => {
      const existing = existingMap.get(a.id)
      return {
        clienteAreaContratadaId: a.id,
        areaNome: a.area.name,
        texto: existing?.texto ?? '',
        updatedByNome: existing?.user_nome ?? null,
        updatedAt: existing?.updated_at ?? null,
      }
    })
  }

  async saveParticularidade(clienteAreaContratadaId: string, texto: string, userId: string) {
    // Buscar texto anterior para historico
    type PrevRow = { texto: string }
    const [prev] = await prisma.$queryRawUnsafe<PrevRow[]>(
      `SELECT texto FROM ${this.CPT} WHERE cliente_area_contratada_id = $1`, clienteAreaContratadaId,
    )
    const textoAnterior = prev?.texto ?? ''

    await prisma.$executeRawUnsafe(
      `INSERT INTO ${this.CPT} (id, cliente_area_contratada_id, texto, updated_by_user_id, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, NOW(), NOW())
       ON CONFLICT (cliente_area_contratada_id) DO UPDATE SET
         texto = $2, updated_by_user_id = $3, updated_at = NOW()`,
      clienteAreaContratadaId, texto, userId,
    )

    // Registrar historico se houve mudanca
    if (textoAnterior !== texto) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO cliente_particularidades_historico (id, cliente_area_contratada_id, texto_anterior, texto_novo, usuario_id, created_at)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())`,
        clienteAreaContratadaId, textoAnterior, texto, userId,
      )
    }

    return { saved: true }
  }

  // ============================================================
  // ACESSOS (credenciais de portais)
  // ============================================================

  async listAcessos(clienteId: string) {
    type Row = { id: string; portal: string; usuario: string | null; senha: string | null; observacoes: string | null; created_at: Date }
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, portal, usuario, senha, observacoes, created_at FROM cliente_acessos WHERE cliente_id = $1 ORDER BY portal ASC`, clienteId,
    )
  }

  async addAcesso(clienteId: string, data: { portal: string; usuario?: string; senha?: string; observacoes?: string }) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_acessos (id, cliente_id, portal, usuario, senha, observacoes, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())`,
      clienteId, data.portal, data.usuario || null, data.senha || null, data.observacoes || null,
    )
    return { created: true }
  }

  async updateAcesso(id: string, data: { portal?: string; usuario?: string; senha?: string; observacoes?: string }) {
    const sets: string[] = ['updated_at = NOW()']
    const vals: unknown[] = []
    let idx = 1
    if (data.portal !== undefined) { sets.push(`portal = $${idx}`); vals.push(data.portal); idx++ }
    if (data.usuario !== undefined) { sets.push(`usuario = $${idx}`); vals.push(data.usuario || null); idx++ }
    if (data.senha !== undefined) { sets.push(`senha = $${idx}`); vals.push(data.senha || null); idx++ }
    if (data.observacoes !== undefined) { sets.push(`observacoes = $${idx}`); vals.push(data.observacoes || null); idx++ }
    vals.push(id)
    await prisma.$executeRawUnsafe(`UPDATE cliente_acessos SET ${sets.join(', ')} WHERE id = $${idx}`, ...vals)
    return { updated: true }
  }

  async removeAcesso(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM cliente_acessos WHERE id = $1`, id)
    return { deleted: true }
  }

  // ============================================================
  // VENCIMENTOS (prazos de certificados, alvaras, etc.)
  // ============================================================

  async listVencimentos(clienteId: string) {
    type Row = { id: string; descricao: string; data_vencimento: Date; alerta_dias: number; observacoes: string | null; concluido: boolean }
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, descricao, data_vencimento, alerta_dias, observacoes, concluido FROM cliente_vencimentos WHERE cliente_id = $1 ORDER BY data_vencimento ASC`, clienteId,
    )
  }

  async addVencimento(clienteId: string, data: { descricao: string; dataVencimento: string; alertaDias?: number; observacoes?: string }) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_vencimentos (id, cliente_id, descricao, data_vencimento, alerta_dias, observacoes, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), NOW())`,
      clienteId, data.descricao, new Date(data.dataVencimento), data.alertaDias ?? 30, data.observacoes || null,
    )
    return { created: true }
  }

  async toggleVencimento(id: string) {
    await prisma.$executeRawUnsafe(`UPDATE cliente_vencimentos SET concluido = NOT concluido, updated_at = NOW() WHERE id = $1`, id)
    return { toggled: true }
  }

  async removeVencimento(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM cliente_vencimentos WHERE id = $1`, id)
    return { deleted: true }
  }

  // ============================================================
  // ANDAMENTOS (Legalizacao — progress tracking)
  // ============================================================

  async listAndamentos(clienteId: string) {
    type Row = { id: string; descricao: string; tipo: string; status: string; data_inicio: Date | null; data_conclusao: Date | null; observacoes: string | null; usuario_nome: string | null; created_at: Date }
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT a.id, a.descricao, a.tipo, a.status, a.data_inicio, a.data_conclusao, a.observacoes, u.name AS usuario_nome, a.created_at
       FROM cliente_andamentos a LEFT JOIN users u ON u.id = a.usuario_id
       WHERE a.cliente_id = $1 ORDER BY a.created_at DESC`, clienteId,
    )
  }

  async addAndamento(clienteId: string, data: { descricao: string; tipo?: string; status?: string; dataInicio?: string; dataConclusao?: string; observacoes?: string }, userId?: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_andamentos (id, cliente_id, descricao, tipo, status, data_inicio, data_conclusao, observacoes, usuario_id, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      clienteId, data.descricao, data.tipo || 'geral', data.status || 'pendente',
      data.dataInicio ? new Date(data.dataInicio) : null,
      data.dataConclusao ? new Date(data.dataConclusao) : null,
      data.observacoes || null, userId || null,
    )
    return { created: true }
  }

  async updateAndamentoStatus(id: string, status: string) {
    const dataConclusao = status === 'concluido' ? 'NOW()' : 'NULL'
    await prisma.$executeRawUnsafe(
      `UPDATE cliente_andamentos SET status = $1, data_conclusao = ${dataConclusao}, updated_at = NOW() WHERE id = $2`, status, id,
    )
    return { updated: true }
  }

  async removeAndamento(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM cliente_andamentos WHERE id = $1`, id)
    return { deleted: true }
  }

  // ============================================================
  // CNAEs (Legalizacao)
  // ============================================================

  async listCnaes(clienteId: string) {
    type Row = { id: string; codigo: string; descricao: string; principal: boolean }
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, codigo, descricao, principal FROM cliente_cnaes WHERE cliente_id = $1 ORDER BY principal DESC, codigo ASC`, clienteId,
    )
  }

  async addCnae(clienteId: string, data: { codigo: string; descricao?: string; principal?: boolean }) {
    if (data.principal) {
      await prisma.$executeRawUnsafe(`UPDATE cliente_cnaes SET principal = false WHERE cliente_id = $1`, clienteId)
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_cnaes (id, cliente_id, codigo, descricao, principal, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())`,
      clienteId, data.codigo, data.descricao || '', data.principal ?? false,
    )
    return { created: true }
  }

  async removeCnae(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM cliente_cnaes WHERE id = $1`, id)
    return { deleted: true }
  }

  // ============================================================
  // BI BALANCETE (Contábil)
  // ============================================================

  async biListCategorias(clienteId: string) {
    return prisma.clienteBiCategoria.findMany({
      where: { clienteId },
      orderBy: [{ nivel: 'asc' }, { ordem: 'asc' }, { conta: 'asc' }],
    })
  }

  async biSaveCategorias(
    clienteId: string,
    categorias: Array<{
      conta: string; nomeSci?: string; nomeExibicao?: string
      parentConta?: string | null; nivel?: number; ordem?: number
      tipo?: string; ativo?: boolean; formula?: unknown
      categoriaDre?: string | null; sinal?: number | null
    }>,
  ) {
    let saved = 0
    for (const cat of categorias) {
      await prisma.clienteBiCategoria.upsert({
        where: { clienteId_conta: { clienteId, conta: cat.conta } },
        create: {
          clienteId, conta: cat.conta,
          nomeSci: cat.nomeSci || '',
          nomeExibicao: cat.nomeExibicao || cat.nomeSci || cat.conta,
          parentConta: cat.parentConta || null,
          nivel: cat.nivel ?? 1,
          ordem: cat.ordem ?? 0,
          tipo: cat.tipo || 'real',
          ativo: cat.ativo ?? true,
          formula: cat.formula as Prisma.InputJsonValue ?? undefined,
          categoriaDre: cat.categoriaDre ?? null,
          sinal: cat.sinal ?? null,
        },
        update: {
          nomeExibicao: cat.nomeExibicao || undefined,
          parentConta: cat.parentConta,
          nivel: cat.nivel,
          ordem: cat.ordem,
          tipo: cat.tipo,
          ativo: cat.ativo,
          formula: cat.formula as Prisma.InputJsonValue ?? undefined,
          categoriaDre: cat.categoriaDre,
          sinal: cat.sinal,
        },
      })
      saved++
    }
    return { saved }
  }

  async biDeleteCategoria(clienteId: string, conta: string) {
    await prisma.clienteBiCategoria.deleteMany({ where: { clienteId, conta } })
    return { deleted: true }
  }

  /**
   * Retorna o template global de Plano de Contas (categoria DRE + sinal padrão).
   * UI usa pra mostrar valor herdado quando o cliente não tem override.
   */
  async biListPlanoContasPadrao() {
    return prisma.planoContasCategoriaPadrao.findMany({
      orderBy: { classificacao: 'asc' },
      select: { classificacao: true, categoriaDre: true, sinal: true, nivel5: true },
    })
  }

  async biListLinhas(clienteId: string, periodo?: string) {
    return prisma.clienteBiLinha.findMany({
      where: { clienteId, ...(periodo ? { periodo } : {}) },
      orderBy: [{ periodo: 'desc' }, { conta: 'asc' }],
    })
  }

  async biGetPeriodosDisponiveis(clienteId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ periodo: string; total: bigint }>>(
      `SELECT periodo, COUNT(*) as total FROM cliente_bi_linhas WHERE cliente_id = $1 GROUP BY periodo ORDER BY periodo DESC`, clienteId,
    )
    return rows.map(r => ({ periodo: r.periodo, total: Number(r.total) }))
  }

  async biImportLinhas(
    clienteId: string,
    periodo: string,
    linhas: Array<{
      conta: string; nomeConta: string
      saldoAnterior: number; debitos: number; creditos: number
      saldoAtual: number; movimento: number
    }>,
  ) {
    // Deletar linhas do periodo e reinserir
    await prisma.$transaction(async (tx) => {
      await tx.clienteBiLinha.deleteMany({ where: { clienteId, periodo } })
      if (linhas.length > 0) {
        await tx.clienteBiLinha.createMany({
          data: linhas.map(l => ({
            clienteId, periodo,
            conta: l.conta, nomeConta: l.nomeConta,
            saldoAnterior: l.saldoAnterior, debitos: l.debitos,
            creditos: l.creditos, saldoAtual: l.saldoAtual, movimento: l.movimento,
          })),
        })
      }
    })

    // Sincronizar categorias: criar categorias para contas novas
    const existingCats = await prisma.clienteBiCategoria.findMany({
      where: { clienteId },
      select: { conta: true },
    })
    const existingSet = new Set(existingCats.map(c => c.conta))

    const newCats = linhas.filter(l => !existingSet.has(l.conta))
    if (newCats.length > 0) {
      for (const l of newCats) {
        const parts = l.conta.split('.')
        const nivel = parts.length
        const parentConta = parts.length > 1 ? parts.slice(0, -1).join('.') : null
        await prisma.clienteBiCategoria.upsert({
          where: { clienteId_conta: { clienteId, conta: l.conta } },
          create: {
            clienteId, conta: l.conta,
            nomeSci: l.nomeConta, nomeExibicao: l.nomeConta,
            parentConta, nivel, tipo: 'real', ativo: true,
          },
          update: { nomeSci: l.nomeConta },
        })
      }
    }

    return { imported: linhas.length, newCategories: newCats.length }
  }

  async biDeletePeriodo(clienteId: string, periodo: string) {
    const { count } = await prisma.clienteBiLinha.deleteMany({ where: { clienteId, periodo } })
    return { deleted: count }
  }

  // Link público
  async biGetOrCreateLink(clienteId: string) {
    const existing = await prisma.clienteBiLink.findUnique({ where: { clienteId } })
    if (existing) return { token: existing.token, createdAt: existing.createdAt }

    const crypto = await import('crypto')
    const token = crypto.randomBytes(32).toString('hex')
    const link = await prisma.clienteBiLink.create({
      data: { clienteId, token },
    })
    return { token: link.token, createdAt: link.createdAt }
  }

  async biDeleteLink(clienteId: string) {
    await prisma.clienteBiLink.deleteMany({ where: { clienteId } })
    return { deleted: true }
  }

  async biResolveToken(token: string) {
    const link = await prisma.clienteBiLink.findUnique({
      where: { token },
      include: { cliente: { select: { id: true, razaoSocial: true, documento: true } } },
    })
    if (!link) throw new Error('Link inválido ou expirado.')
    if (link.expiraEm && link.expiraEm < new Date()) throw new Error('Link expirado.')
    return link.cliente
  }

  // ============================================================
  // OBRIGAÇÕES
  // ============================================================

  async listObrigacoes(clienteId: string) {
    type Row = { id: string; nome: string; tipo: string; periodicidade: string; area_id: string | null; responsavel_id: string | null; dia_vencimento: number | null; competencia_atual: string | null; status: string; observacoes: string | null; ativo: boolean; area_nome: string | null; resp_nome: string | null }
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT o.*, a.name AS area_nome, u.name AS resp_nome
       FROM cliente_obrigacoes o
       LEFT JOIN areas a ON a.id = o.area_id
       LEFT JOIN users u ON u.id = o.responsavel_id
       WHERE o.cliente_id = $1 ORDER BY o.ativo DESC, o.nome ASC`, clienteId,
    )
  }

  async addObrigacao(clienteId: string, data: { nome: string; tipo?: string; periodicidade?: string; areaId?: string; responsavelId?: string; diaVencimento?: number; observacoes?: string }) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_obrigacoes (id, cliente_id, nome, tipo, periodicidade, area_id, responsavel_id, dia_vencimento, observacoes, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      clienteId, data.nome, data.tipo || 'fixa', data.periodicidade || 'mensal',
      data.areaId || null, data.responsavelId || null, data.diaVencimento || null, data.observacoes || null,
    )
    return { created: true }
  }

  async updateObrigacaoStatus(id: string, status: string) {
    await prisma.$executeRawUnsafe(`UPDATE cliente_obrigacoes SET status = $1, updated_at = NOW() WHERE id = $2`, status, id)
    return { updated: true }
  }

  async toggleObrigacaoAtivo(id: string) {
    await prisma.$executeRawUnsafe(`UPDATE cliente_obrigacoes SET ativo = NOT ativo, updated_at = NOW() WHERE id = $1`, id)
    return { toggled: true }
  }

  async removeObrigacao(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM cliente_obrigacoes WHERE id = $1`, id)
    return { deleted: true }
  }

  // ============================================================
  // PROTOCOLOS
  // ============================================================

  async listProtocolos(clienteId: string) {
    type Row = { id: string; orgao: string; tipo: string; protocolo: string; descricao: string | null; status: string; data_solicitacao: Date; data_retorno: Date | null; resultado: string | null; user_nome: string | null }
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT p.*, u.name AS user_nome FROM cliente_protocolos p LEFT JOIN users u ON u.id = p.usuario_id
       WHERE p.cliente_id = $1 ORDER BY p.data_solicitacao DESC`, clienteId,
    )
  }

  async addProtocolo(clienteId: string, data: { orgao: string; tipo?: string; protocolo: string; descricao?: string }, userId?: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_protocolos (id, cliente_id, orgao, tipo, protocolo, descricao, usuario_id, created_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW())`,
      clienteId, data.orgao, data.tipo || 'consulta', data.protocolo, data.descricao || null, userId || null,
    )
    return { created: true }
  }

  async updateProtocoloStatus(id: string, status: string, resultado?: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE cliente_protocolos SET status = $1, resultado = $2, data_retorno = CASE WHEN $1 = 'concluido' THEN NOW() ELSE data_retorno END WHERE id = $3`,
      status, resultado || null, id,
    )
    return { updated: true }
  }

  async removeProtocolo(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM cliente_protocolos WHERE id = $1`, id)
    return { deleted: true }
  }

  // ============================================================
  // OCORRÊNCIAS (Reclamações, Elogios, Sugestões — ISO 9001)
  // ============================================================

  async listOcorrencias(clienteId: string) {
    type Row = { id: string; tipo: string; titulo: string; descricao: string | null; status: string; prioridade: string; area_id: string | null; responsavel_id: string | null; data_ocorrencia: Date; data_resolucao: Date | null; resolucao: string | null; area_nome: string | null; resp_nome: string | null; user_nome: string | null }
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT o.*, a.name AS area_nome, r.name AS resp_nome, u.name AS user_nome
       FROM cliente_ocorrencias o
       LEFT JOIN areas a ON a.id = o.area_id
       LEFT JOIN users r ON r.id = o.responsavel_id
       LEFT JOIN users u ON u.id = o.usuario_id
       WHERE o.cliente_id = $1 ORDER BY o.data_ocorrencia DESC`, clienteId,
    )
  }

  async addOcorrencia(clienteId: string, data: { tipo?: string; titulo: string; descricao?: string; prioridade?: string; areaId?: string; responsavelId?: string }, userId?: string) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_ocorrencias (id, cliente_id, tipo, titulo, descricao, prioridade, area_id, responsavel_id, usuario_id, created_at, updated_at)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      clienteId, data.tipo || 'reclamacao', data.titulo, data.descricao || null,
      data.prioridade || 'media', data.areaId || null, data.responsavelId || null, userId || null,
    )
    return { created: true }
  }

  async resolveOcorrencia(id: string, resolucao: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE cliente_ocorrencias SET status = 'resolvida', resolucao = $1, data_resolucao = NOW(), updated_at = NOW() WHERE id = $2`,
      resolucao, id,
    )
    return { resolved: true }
  }

  async removeOcorrencia(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM cliente_ocorrencias WHERE id = $1`, id)
    return { deleted: true }
  }

  // ── Configuracao do modulo (capa do header) ───────────────────
  async getHeaderCover(empresaId?: string): Promise<{ headerCover: string }> {
    const rows = await prisma.$queryRawUnsafe<Array<{ valor: string }>>(
      `SELECT valor FROM opcoes_cadastro WHERE tipo = 'CLIENTE_CONFIG' AND valor LIKE 'header_cover=%' ${empresaId ? `AND empresa_id = '${empresaId}'` : 'AND empresa_id IS NULL'} LIMIT 1`
    ).catch(() => [])
    const raw = rows[0]?.valor || ''
    const idx = raw.indexOf('=')
    return { headerCover: idx > 0 ? raw.slice(idx + 1) : '' }
  }

  // Restricao a master e aplicada no router. URL vazia/null limpa.
  async setHeaderCover(url: string | null, empresaId?: string) {
    const value = url || ''
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM opcoes_cadastro WHERE tipo = 'CLIENTE_CONFIG' AND valor LIKE 'header_cover=%' ${empresaId ? `AND empresa_id = '${empresaId}'` : 'AND empresa_id IS NULL'} LIMIT 1`
    ).catch(() => [])
    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(`UPDATE opcoes_cadastro SET valor = $1 WHERE id = $2`, `header_cover=${value}`, existing[0]!.id)
    } else {
      await prisma.$executeRawUnsafe(
        `INSERT INTO opcoes_cadastro (id, tipo, valor, empresa_id) VALUES (gen_random_uuid(), 'CLIENTE_CONFIG', $1, $2)`,
        `header_cover=${value}`, empresaId || null
      )
    }
    return { ok: true }
  }
}
