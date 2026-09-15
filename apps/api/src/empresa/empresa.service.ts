import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import { invalidateSessionCacheForUser } from '../trpc/session-cache'
import type { Prisma } from '@saas/db'
import type { CreateEmpresaInput, UpdateEmpresaInput, ListEmpresaInput } from '@saas/types'

const FIELD_LABELS: Record<string, string> = {
  razaoSocial: 'Razão Social', nomeFantasia: 'Nome Fantasia', cnpj: 'CNPJ',
  inscricaoEstadual: 'IE', inscricaoMunicipal: 'IM', taxRegime: 'Regime Tributário',
  cep: 'CEP', logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento',
  bairro: 'Bairro', cidade: 'Cidade', uf: 'UF',
  telefone: 'Telefone', email: 'E-mail', site: 'Site',
  logoUrl: 'Logo', logoDarkUrl: 'Logo Dark', isActive: 'Status',
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

/** Ids de usuários gravados no evento de desativação da empresa. */
function idsDesativados(changes: Prisma.JsonValue | null | undefined): string[] {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return []
  const lista = (changes as Record<string, unknown>).usuariosDesativados
  return Array.isArray(lista) ? lista.filter((v): v is string => typeof v === 'string') : []
}

@Injectable()
export class EmpresaService {
  async list(input: ListEmpresaInput) {
    const { page, limit, search, sortBy, sortDir, isActive } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.EmpresaWhereInput = {
      ...(search ? { OR: [
        { razaoSocial: { contains: search, mode: 'insensitive' as const } },
        { nomeFantasia: { contains: search, mode: 'insensitive' as const } },
        { cnpj: { contains: search } },
      ] } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { code: 'asc' as const }

    const [data, total] = await Promise.all([
      prisma.empresa.findMany({ where, orderBy, skip, take }),
      prisma.empresa.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  /**
   * Isolamento multi-tenant (F-012): não-master só resolve a PRÓPRIA empresa;
   * master (admin de plataforma) resolve qualquer uma (navegação multi-empresa).
   * Sem isto, o seletor de "empresa ativa" do cliente resolvia uma empresa de
   * OUTRO tenant via id antigo no localStorage, divergindo do empresaId real do
   * usuário. Permissões/dados são sempre avaliados pelo `ctx.empresaId` da sessão
   * (a empresa real do usuário), nunca pela "empresa ativa" do cliente.
   */
  async getById(id: string, isMaster = false, empresaId?: string | null) {
    if (!isMaster && id !== (empresaId ?? null)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Empresa fora do seu acesso.' })
    }
    // As contagens alimentam os números do hero do detalhe (PADRAO_PAGINAS
    // §3.2). Usuários internos e de clientes são contados em separado: somados,
    // "76 usuários" misturava a equipe do escritório com as pessoas dos clientes
    // que só acessam o portal — e ainda contava os inativos.
    const ativos = { empresaId: id, isActive: true }
    const [empresa, usuariosInternos, usuariosDeClientes] = await Promise.all([
      prisma.empresa.findUniqueOrThrow({
        where: { id },
        include: { _count: { select: { clientes: true } } },
      }),
      prisma.user.count({ where: { ...ativos, role: { not: 'COLABORADOR_CLIENTE' } } }),
      prisma.user.count({ where: { ...ativos, role: 'COLABORADOR_CLIENTE' } }),
    ])
    return { ...empresa, usuariosInternos, usuariosDeClientes }
  }

  async create(input: CreateEmpresaInput, userId?: string) {
    return prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.create({
        data: {
          razaoSocial: input.razaoSocial, nomeFantasia: input.nomeFantasia || null,
          cnpj: input.cnpj, inscricaoEstadual: input.inscricaoEstadual || null,
          inscricaoMunicipal: input.inscricaoMunicipal || null, taxRegime: input.taxRegime || null,
          isActive: input.isActive, cep: input.cep || null, logradouro: input.logradouro || null,
          numero: input.numero || null, complemento: input.complemento || null,
          bairro: input.bairro || null, cidade: input.cidade || null, uf: input.uf || null,
          telefone: input.telefone || null, email: input.email || null, site: input.site || null,
          logoUrl: input.logoUrl || null, logoDarkUrl: input.logoDarkUrl || null,
          marcaDaguaUrl: (input as { marcaDaguaUrl?: string }).marcaDaguaUrl || null,
          version: 1,
        },
      })
      await tx.empresaEvent.create({ data: { empresaId: empresa.id, userId: userId || null, type: 'created', version: 1 } })
      return empresa
    })
  }

  async update(id: string, input: UpdateEmpresaInput, userId?: string) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.empresa.findUniqueOrThrow({ where: { id } })
      const data: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(input)) {
        // O status só muda por `desativar`/`reativar`: o form reenvia o
        // `isActive` que carregou, e salvar uma empresa inativa a religaria
        // sem devolver os usuários dela.
        if (key === 'isActive') continue
        if (value !== undefined) data[key] = typeof value === 'string' && value === '' ? null : value
      }
      const newVersion = before.version + 1
      data.version = newVersion
      const empresa = await tx.empresa.update({ where: { id }, data })
      const changes = detectChanges(before as unknown as Record<string, unknown>, data)
      if (changes) {
        await tx.empresaEvent.create({ data: { empresaId: id, userId: userId || null, type: 'updated', version: newVersion, changes: changes as Prisma.InputJsonValue } })
      }
      return empresa
    })
  }

  /**
   * Desliga o tenant na raiz. Substitui a exclusão física, que apagava a
   * empresa e deixava os clientes e usuários dela com `empresaId` nulo — e,
   * neste sistema, registro sem empresa é registro que toda empresa enxerga.
   *
   * O que muda: a empresa fica inativa; os usuários dela (internos e do
   * portal) ficam inativos e perdem a sessão aberta; e o login passa a ser
   * recusado (hook de sessão no AuthService). Nenhum outro dado é tocado.
   *
   * Os ids desativados ficam gravados no evento. É o que permite ao
   * `reativar` devolver exatamente quem estava ativo, sem religar quem já
   * era inativo antes.
   */
  async desativar(id: string, autorId: string) {
    const autor = await prisma.user.findUnique({ where: { id: autorId }, select: { empresaId: true } })
    if (autor?.empresaId === id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Você não pode inativar a empresa à qual pertence.' })
    }
    const resultado = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.findUniqueOrThrow({ where: { id } })
      if (!empresa.isActive) return { jaInativa: true, usuarios: [] as string[] }
      // Master global fica de fora: administra a plataforma, não o tenant.
      const usuarios = (await tx.user.findMany({
        where: { empresaId: id, isActive: true, isMaster: false },
        select: { id: true },
      })).map((u) => u.id)
      if (usuarios.length > 0) {
        await tx.user.updateMany({ where: { id: { in: usuarios } }, data: { isActive: false } })
        await tx.session.deleteMany({ where: { userId: { in: usuarios } } })
      }
      const version = empresa.version + 1
      await tx.empresa.update({ where: { id }, data: { isActive: false, version } })
      await tx.empresaEvent.create({
        data: {
          empresaId: id, userId: autorId, type: 'deactivated', version,
          changes: { isActive: { from: true, to: false }, usuariosDesativados: usuarios },
        },
      })
      return { jaInativa: false, usuarios }
    })
    for (const u of resultado.usuarios) invalidateSessionCacheForUser(u)
    return { jaInativa: resultado.jaInativa, usuariosDesativados: resultado.usuarios.length }
  }

  /**
   * Religa o tenant e devolve o acesso a quem a última desativação desligou.
   * Só volta quem continua nesta empresa e inativo: quem foi movido ou
   * religado à mão no meio do caminho não é tocado.
   */
  async reativar(id: string, autorId: string) {
    return prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.findUniqueOrThrow({ where: { id } })
      if (empresa.isActive) return { jaAtiva: true, usuariosReativados: 0 }
      const ultima = await tx.empresaEvent.findFirst({
        where: { empresaId: id, type: 'deactivated' },
        orderBy: { createdAt: 'desc' },
        select: { changes: true },
      })
      const ids = idsDesativados(ultima?.changes)
      const { count } = ids.length > 0
        ? await tx.user.updateMany({ where: { id: { in: ids }, empresaId: id, isActive: false }, data: { isActive: true } })
        : { count: 0 }
      const version = empresa.version + 1
      await tx.empresa.update({ where: { id }, data: { isActive: true, version } })
      await tx.empresaEvent.create({
        data: {
          empresaId: id, userId: autorId, type: 'reactivated', version,
          changes: { isActive: { from: false, to: true }, usuariosReativados: count },
        },
      })
      return { jaAtiva: false, usuariosReativados: count }
    })
  }

  async getEvents(empresaId: string) {
    return prisma.empresaEvent.findMany({
      where: { empresaId }, orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    })
  }

  async exportAll() {
    return prisma.empresa.findMany({ orderBy: { razaoSocial: 'asc' } })
  }

  async bulkCreate(items: CreateEmpresaInput[], userId?: string) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!, userId)
        results.created++
      } catch (e) { results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`) }
    }
    return results
  }

  /**
   * Lista empresas para selects/dropdowns. Isolamento multi-tenant:
   * não-master vê APENAS a própria empresa; master global vê todas.
   * `empresaId` nulo (não-master) retorna vazio (default-deny).
   */
  async listForSelect(opts: { empresaId?: string | null; isMaster: boolean }) {
    return prisma.empresa.findMany({
      where: {
        isActive: true,
        ...(opts.isMaster ? {} : { id: opts.empresaId ?? '__none__' }),
      },
      select: { id: true, razaoSocial: true, nomeFantasia: true, code: true, logoUrl: true, logoDarkUrl: true, marcaDaguaUrl: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  /** Retorna a empresa do usuário logado (sem exigir permissão no módulo empresas) */
  /**
   * Empresa ATIVA do usuário (server-authoritative): master segue a empresa ativa
   * (multi-empresa); não-master é sempre a home. É a fonte da verdade do cliente
   * para a "empresa ativa" — substitui o localStorage como autoridade. F-012.
   */
  async getMyEmpresa(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { empresaId: true, activeEmpresaId: true, isMaster: true },
    })
    if (!user) return null
    const targetId = user.isMaster ? (user.activeEmpresaId ?? user.empresaId) : user.empresaId
    if (!targetId) return null
    return prisma.empresa.findUnique({
      where: { id: targetId },
      // Endereço e telefone entram por causa do rodapé dos documentos impressos
      // (protocolo do cliente, resumo da agenda). No v1 esse rodapé era texto
      // chumbado no ASP — mudar de sala exigia editar o código.
      select: {
        id: true, code: true, razaoSocial: true, nomeFantasia: true,
        logoUrl: true, logoDarkUrl: true, marcaDaguaUrl: true,
        cep: true, logradouro: true, numero: true, complemento: true,
        bairro: true, cidade: true, uf: true, telefone: true,
      },
    })
  }

  /**
   * Define a empresa ATIVA (server-authoritative). Master ativa qualquer empresa
   * existente; não-master só a própria (home) — senão FORBIDDEN. Persiste em
   * users.active_empresa_id; daí o contexto, as permissões (getMyPermissions) e a
   * autorização passam a operar sobre ela. F-012/F-009.
   */
  async setActiveEmpresa(userId: string, empresaId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { empresaId: true, isMaster: true },
    })
    if (!user.isMaster && empresaId !== user.empresaId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Empresa fora do seu acesso.' })
    }
    const exists = await prisma.empresa.findUnique({ where: { id: empresaId }, select: { id: true } })
    if (!exists) throw new TRPCError({ code: 'NOT_FOUND', message: 'Empresa não encontrada.' })
    await prisma.user.update({ where: { id: userId }, data: { activeEmpresaId: empresaId } })
    // Invalida o ctx cacheado (30s) p/ o empresaId resolvido refletir na hora.
    invalidateSessionCacheForUser(userId)
    return { ok: true, empresaId }
  }
}
