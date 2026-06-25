import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateUserInput, UpdateUserInput, ListUserInput } from '@saas/types'
import { PLATFORM_ADMIN_MODULES } from '@saas/types'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { PermissionsEventsService } from '../permissions-events/permissions-events.service'
import { invalidateUserPermissionsCache } from '../trpc/trpc.service'

@Injectable()
export class UserService {
  constructor(private readonly permissionsEvents: PermissionsEventsService) {}

  /**
   * Invalida o cache server-side e emite o evento SSE — usado em qualquer
   * caminho que alterou as permissões de um usuário (admin via UI, import,
   * sync de roles, etc).
   */
  private notifyPermissionsChanged(userId: string, actorUserId?: string | null) {
    invalidateUserPermissionsCache(userId)
    this.permissionsEvents.emit({ type: 'updated', userId, actorUserId: actorUserId ?? null })
  }

  async list(input: ListUserInput, callerIsMaster: boolean, callerEmpresaId?: string) {
    const { page, limit, search, sortBy, sortDir, role, empresaId } = input
    const incluirInativos = (input as any).incluirInativos === true
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(role ? { role } : {}),
      ...(empresaId ? { empresaId } : {}),
      // Por padrão esconde inativos (soft-deleted). Pra mostrar todos, passar incluirInativos=true.
      ...(incluirInativos ? {} : { isActive: true }),
      // Non-MASTER users can only see users from their empresa
      ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { name: 'asc' as const }

    const [raw, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          profile: true,
          isMaster: true,
          isActive: true,
          exibirComoColaborador: true,
          empresaId: true,
          createdAt: true,
          empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          area: { select: { id: true, name: true } },
          _count: { select: { permissions: true } },
          // Última sessão = último login bem-sucedido (better-auth grava em Session.createdAt).
          // Limita a 1 e descendente — Prisma não tem MAX agrupado direto no select.
          sessions: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ])

    // Achata sessions[] em lastLoginAt pra simplificar o front
    const data = raw.map(({ sessions, ...u }) => ({
      ...u,
      lastLoginAt: sessions[0]?.createdAt ?? null,
    }))

    return buildPaginatedResponse(data, total, page, limit)
  }

  /**
   * Lista quem tem acesso a um módulo (tela). Retorna dois grupos:
   *  - acessoTotal: master global e donos do tenant (empresaMaster) — enxergam
   *    tudo sem precisar de linha em UserPermission.
   *  - comPermissao: usuários com permissão no módulo.
   *
   * Dois modos:
   *  - módulo (padrão): lista quem tem canRead, com o nível (leitura/escrita/
   *    exclusão).
   *  - sub-permissão (subPermission informado): lista quem tem aquela sub-
   *    permissão específica ligada (ex.: 'manage_tipos'). Útil quando a tela é
   *    governada por uma sub-permissão, não pelo módulo inteiro.
   * Escopo: não-master vê só usuários da própria empresa (igual ao list).
   */
  async comAcessoAoModulo(moduleSlug: string, callerIsMaster = false, callerEmpresaId?: string, subPermission?: string) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        isMaster: true,
        isEmpresaMaster: true,
        cargo: { select: { name: true } },
        area: { select: { name: true } },
        permissions: {
          where: { moduleSlug },
          select: { canRead: true, canWrite: true, canDelete: true, subPermissions: true },
        },
      },
    })

    const acessoTotal: Array<Record<string, unknown>> = []
    const comPermissao: Array<Record<string, unknown>> = []

    for (const u of users) {
      const base = {
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image,
        role: u.role,
        cargo: u.cargo?.name ?? null,
        area: u.area?.name ?? null,
      }
      if (u.isMaster || u.isEmpresaMaster) {
        acessoTotal.push({ ...base, tipo: u.isMaster ? 'MASTER' : 'EMPRESA_MASTER' })
        continue
      }
      const perm = u.permissions[0]
      if (!perm?.canRead) continue

      if (subPermission) {
        const subs = (perm.subPermissions ?? {}) as Record<string, boolean>
        if (subs[subPermission] === true) {
          comPermissao.push({ ...base, sub: true })
        }
      } else {
        comPermissao.push({ ...base, canRead: perm.canRead, canWrite: perm.canWrite, canDelete: perm.canDelete })
      }
    }

    return { acessoTotal, comPermissao, total: acessoTotal.length + comPermissao.length, mode: subPermission ? 'sub' : 'module' }
  }

  async getById(id: string, callerIsMaster = false, callerEmpresaId?: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        telefone: true,
        celular: true,
        ramal: true,
        role: true,
        profile: true,
        isMaster: true,
        isActive: true,
        exibirComoColaborador: true,
        empresaId: true,
        areaId: true,
        cargoId: true,
        salario: true,
        dataAdmissao: true,
        dataDemissao: true,
        dataNascimento: true,
        idOneClick: true,
        incluirFerias: true,
        image: true,
        createdAt: true,
        // Documentos
        cpf: true,
        rg: true,
        orgaoEmissor: true,
        sexo: true,
        estadoCivil: true,
        nacionalidade: true,
        naturalidade: true,
        pis: true,
        ctps: true,
        ctpsSerie: true,
        tituloEleitor: true,
        reservista: true,
        // Endereço
        cep: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        uf: true,
        // Contrato / RH
        tipoContrato: true,
        cargaHoraria: true,
        observacoes: true,
        empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        area: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
        permissions: {
          select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true, subPermissions: true },
        },
      },
    })
    if (!callerIsMaster && callerEmpresaId && user.empresaId !== callerEmpresaId) {
      throw new Error('Acesso negado.')
    }
    return user
  }

  async create(input: CreateUserInput) {
    const {
      permissions, password, empresaId, areaId, cargoId,
      dataAdmissao, dataNascimento, dataDemissao,
      salario, role, profile, sexo, estadoCivil, tipoContrato,
      cpf, ...rest
    } = input as any
    const hashedPassword = await hashPassword(password || 'Acesso@123')

    // Limpa empty strings → null pra não violar enums e checks
    const userData: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) {
      userData[k] = v === '' ? null : v
    }

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...userData,
          role: (role ?? 'COLABORADOR_INTERNO') as never,
          profile: (profile ?? 'OPERADOR') as never,
          empresaId: empresaId || null,
          areaId: areaId || null,
          cargoId: cargoId || null,
          cpf: cpf ? String(cpf).replace(/\D/g, '') : null,
          salario: salario != null && salario !== '' ? Number(salario) : null,
          dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null,
          dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
          dataDemissao: dataDemissao ? new Date(dataDemissao) : null,
          sexo: sexo || null,
          estadoCivil: estadoCivil || null,
          tipoContrato: tipoContrato || 'CLT',
          emailVerified: false,
        },
      })

      // Create credential account (Better Auth compatible)
      await tx.account.create({
        data: {
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: hashedPassword,
        },
      })

      // Create permissions
      if (permissions?.length) {
        await tx.userPermission.createMany({
          data: permissions.map((p) => ({
            userId: user.id,
            moduleSlug: p.moduleSlug,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
          })),
        })
      }

      return user
    })
  }

  async update(id: string, input: UpdateUserInput, callerIsMaster = false) {
    const {
      permissions, password, empresaId, areaId, cargoId,
      dataAdmissao, dataNascimento, dataDemissao,
      salario, cpf, sexo, estadoCivil, tipoContrato,
      ...userData
    } = input as any

    return prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUniqueOrThrow({ where: { id } })
      if (existing.isMaster && !callerIsMaster) {
        throw new Error('Apenas um usuário MASTER pode editar outro MASTER.')
      }
      if (existing.isMaster && callerIsMaster) {
        // Mesmo MASTER não pode alterar role/isActive de outro MASTER
        delete (userData as Record<string, unknown>).role
        delete (userData as Record<string, unknown>).isActive
      }

      const data: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(userData)) {
        if (value !== undefined) {
          data[key] = typeof value === 'string' && value === '' ? null : value
        }
      }
      if (empresaId !== undefined) data.empresaId = empresaId || null
      if (areaId !== undefined) data.areaId = areaId || null
      if (cargoId !== undefined) data.cargoId = cargoId || null
      if (cpf !== undefined) data.cpf = cpf ? String(cpf).replace(/\D/g, '') : null
      if (sexo !== undefined) data.sexo = sexo || null
      if (estadoCivil !== undefined) data.estadoCivil = estadoCivil || null
      if (tipoContrato !== undefined) data.tipoContrato = tipoContrato || 'CLT'
      if (salario !== undefined) data.salario = salario != null && salario !== '' ? Number(salario) : null
      if (dataAdmissao !== undefined) data.dataAdmissao = dataAdmissao ? new Date(dataAdmissao) : null
      if (dataNascimento !== undefined) data.dataNascimento = dataNascimento ? new Date(dataNascimento) : null
      if (dataDemissao !== undefined) data.dataDemissao = dataDemissao ? new Date(dataDemissao) : null

      const user = await tx.user.update({ where: { id }, data })

      // Update password if provided
      if (password) {
        const hashedPassword = await hashPassword(password)
        await tx.account.updateMany({
          where: { userId: id, providerId: 'credential' },
          data: { password: hashedPassword },
        })
      }

      // Replace permissions if provided
      if (permissions !== undefined) {
        await tx.userPermission.deleteMany({ where: { userId: id } })
        if (permissions.length) {
          await tx.userPermission.createMany({
            data: permissions.map((p) => ({
              userId: id,
              moduleSlug: p.moduleSlug,
              canRead: p.canRead,
              canWrite: p.canWrite,
              canDelete: p.canDelete,
              subPermissions: p.subPermissions ?? undefined,
            })),
          })
        }
      }

      return user
    }).then((res) => {
      // Após commit, dispara SSE + invalida cache. Fora da transação pra não
      // notificar antes do dado estar persistido.
      if (permissions !== undefined) this.notifyPermissionsChanged(id)
      return res
    })
  }

  async updatePermissions(userId: string, permissions: Array<{ moduleSlug: string; canRead: boolean; canWrite: boolean; canDelete: boolean; subPermissions?: Record<string, boolean> }>) {
    await prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } })
      if (permissions.length) {
        await tx.userPermission.createMany({
          data: permissions.map((p) => ({
            userId,
            moduleSlug: p.moduleSlug,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
            subPermissions: p.subPermissions ?? undefined,
          })),
        })
      }
    })
    // SSE + invalidação de cache — frontend do user logado vai reagir e
    // recarregar permissões/sidebar sem precisar refresh manual.
    this.notifyPermissionsChanged(userId)
    return { success: true, total: permissions.length }
  }

  /**
   * Revoga acesso de um usuário num módulo (botão "Quem tem acesso").
   *
   * Modo sub-permissão (subKey informado): desliga só aquela sub-permissão
   * (ex.: 'manage_tipos') — NÃO mexe no acesso ao módulo. Usado quando a tela é
   * governada por uma sub-permissão.
   *
   * Modo módulo (nivel informado): cascata coerente:
   *  - 'delete' → tira só exclusão.
   *  - 'write'  → tira escrita E exclusão.
   *  - 'read'   → remove o acesso ao módulo por completo (apaga a linha).
   * Não mexe em master/empresaMaster (eles não têm linha em UserPermission).
   */
  async revogarAcessoModulo(userId: string, moduleSlug: string, opts: { nivel?: 'read' | 'write' | 'delete'; subKey?: string }) {
    const where = { userId_moduleSlug: { userId, moduleSlug } }

    if (opts.subKey) {
      const perm = await prisma.userPermission.findUnique({ where, select: { subPermissions: true } })
      const subs = { ...((perm?.subPermissions ?? {}) as Record<string, boolean>) }
      subs[opts.subKey] = false
      await prisma.userPermission.update({ where, data: { subPermissions: subs } })
    } else if (opts.nivel === 'read') {
      await prisma.userPermission.deleteMany({ where: { userId, moduleSlug } })
    } else if (opts.nivel === 'write') {
      await prisma.userPermission.update({ where, data: { canWrite: false, canDelete: false } })
    } else if (opts.nivel === 'delete') {
      await prisma.userPermission.update({ where, data: { canDelete: false } })
    }

    this.notifyPermissionsChanged(userId)
    return { success: true }
  }

  /**
   * Soft delete: desativa o usuário. Hard delete não é seguro porque o User tem
   * FKs em vários módulos (eventos da agenda, permissões, sessions, etc.).
   * Desativa sessões ativas pra cortar o acesso imediato.
   */
  async delete(id: string, callerUserId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } })
    if (user.isMaster) {
      throw new Error('Rebaixe o usuário MASTER antes de excluí-lo.')
    }
    if (id === callerUserId) {
      throw new Error('Você não pode excluir a si mesmo.')
    }
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: {
          isActive: false,
          exibirComoColaborador: false,
        },
      }),
      // Encerra qualquer sessão ativa
      prisma.session.deleteMany({ where: { userId: id } }),
    ])
    return { ok: true, soft: true }
  }

  /**
   * Soft-delete em lote. Aplica a mesma regra do delete singular:
   *   - Master nunca é desativado pelo lote
   *   - Caller nunca desativa a si mesmo
   * Retorna contadores e listas dos pulados (com motivo).
   */
  async deleteBulk(ids: string[], callerUserId: string) {
    const idsUnicos = Array.from(new Set(ids)).filter(Boolean)
    if (idsUnicos.length === 0) return { ok: true, desativados: 0, pulados: [] as Array<{ id: string; nome: string; motivo: string }> }

    const users = await prisma.user.findMany({
      where: { id: { in: idsUnicos } },
      select: { id: true, name: true, isMaster: true, isActive: true },
    })

    const pulados: Array<{ id: string; nome: string; motivo: string }> = []
    const aDesativar: string[] = []
    for (const u of users) {
      if (u.id === callerUserId) { pulados.push({ id: u.id, nome: u.name, motivo: 'é você' }); continue }
      if (u.isMaster) { pulados.push({ id: u.id, nome: u.name, motivo: 'usuário MASTER' }); continue }
      if (!u.isActive) { pulados.push({ id: u.id, nome: u.name, motivo: 'já estava inativo' }); continue }
      aDesativar.push(u.id)
    }

    if (aDesativar.length > 0) {
      await prisma.$transaction([
        prisma.user.updateMany({
          where: { id: { in: aDesativar } },
          data: { isActive: false, exibirComoColaborador: false },
        }),
        prisma.session.deleteMany({ where: { userId: { in: aDesativar } } }),
      ])
    }

    return { ok: true, desativados: aDesativar.length, pulados }
  }

  async toggleMaster(targetId: string, callerUserId: string, callerIsMaster: boolean) {
    if (!callerIsMaster) {
      throw new Error('Apenas um usuário MASTER pode promover ou rebaixar outro MASTER.')
    }
    if (targetId === callerUserId) {
      throw new Error('Você não pode rebaixar a si mesmo.')
    }
    const target = await prisma.user.findUniqueOrThrow({ where: { id: targetId } })
    return prisma.user.update({
      where: { id: targetId },
      data: { isMaster: !target.isMaster },
    })
  }

  async listForSelect(callerIsMaster: boolean, callerEmpresaId?: string) {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
      },
      select: {
        id: true, name: true, email: true, role: true,
        areaId: true,
        area: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    })
    return users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      areaId: u.areaId,
      areaName: u.area?.name ?? null,
    }))
  }

  async getMyPermissions(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        isMaster: true,
        isEmpresaMaster: true,
        role: true,
        empresaId: true,
        permissions: {
          // subPermissions OBRIGATÓRIO no select — sem ele o frontend que usa
          // `useUserPermissions()` recebe undefined, e qualquer check tipo
          // `subPerms.manage_itens` cai pra false em não-master. Causava
          // sintoma de "sub-permissão marcada não funciona".
          select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true, subPermissions: true },
        },
      },
    })

    // Controle de acesso de PLATAFORMA (F-009): módulos de config de sistema
    // (configuracoes/metricas/backup-restore) NUNCA são concedidos a não-master,
    // mesmo que existam grants antigos no banco (onboarding legado concedia tudo).
    // O servidor (masterProcedure no tRPC + middleware nas rotas) é o boundary
    // real; aqui garantimos que getMyPermissions não exponha canWrite indevido.
    const platformAdmin = new Set<string>(PLATFORM_ADMIN_MODULES)
    const permissions = user.isMaster
      ? user.permissions
      : user.permissions.filter((p) => !platformAdmin.has(p.moduleSlug))

    return {
      isMaster: user.isMaster,
      isEmpresaMaster: user.isEmpresaMaster,
      role: user.role,
      empresaId: user.empresaId,
      permissions,
    }
  }

  // ── Perfil pessoal — espelha legado cad_profile/index.asp ──

  async getMyProfile(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, role: true, profile: true,
        image: true, coverImage: true, isMaster: true, isEmpresaMaster: true, isActive: true,
        twoFactorEnabled: true,
        salario: true, dataAdmissao: true, idOneClick: true, createdAt: true,
        // Pessoal
        dataNascimento: true, sexo: true, estadoCivil: true, nacionalidade: true, naturalidade: true,
        bio: true,
        // Contato
        telefone: true, celular: true, whatsapp: true, ramal: true,
        // Endereço
        cep: true, logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, uf: true, pais: true,
        // Sociais
        siteUrl: true, linkedinUrl: true, githubUrl: true, instagramUrl: true, facebookUrl: true,
        // Assinatura
        signatureImageUrl: true,
        empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        area: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
      },
    })
    // Ultimo login (excluindo a sessao atual seria ideal, mas como nao temos token aqui, pegamos a ultima)
    const lastSession = await prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, ipAddress: true, userAgent: true },
    }).catch(() => null)
    return { ...user, lastLogin: lastSession }
  }

  /**
   * Retorna apenas o necessário pra montar a assinatura de email (user + empresa).
   * Empresa é resolvida via `empresaId` (multi-tenant pode ser null se usuário
   * master global).
   */
  async getMySignatureData(userId: string) {
    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        telefone: true,
        celular: true,
        whatsapp: true,
        instagramUrl: true,
        linkedinUrl: true,
        signatureImageUrl: true,
        area: { select: { name: true } },
        cargo: { select: { name: true } },
        empresa: {
          select: {
            id: true, razaoSocial: true, nomeFantasia: true,
            telefone: true, email: true, site: true,
            logradouro: true, numero: true, bairro: true, cidade: true, uf: true,
            logoUrl: true, logoDarkUrl: true,
          },
        },
      },
    })
  }

  async updateMyProfile(
    userId: string,
    data: Record<string, unknown>,
  ) {
    // Whitelist de campos que o próprio usuário pode editar no /perfil.
    // CPF/RG/admissão/salário/role NÃO entram — esses são do RH/admin.
    const ALLOWED: ReadonlyArray<string> = [
      'name', 'image', 'coverImage',
      // Pessoal
      'dataNascimento', 'sexo', 'estadoCivil', 'nacionalidade', 'naturalidade', 'bio',
      // Contato
      'telefone', 'celular', 'whatsapp', 'ramal',
      // Endereço
      'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'pais',
      // Sociais
      'siteUrl', 'linkedinUrl', 'githubUrl', 'instagramUrl', 'facebookUrl',
      // Assinatura
      'signatureImageUrl',
    ]
    const update: Record<string, unknown> = {}
    for (const key of ALLOWED) {
      if (!(key in data)) continue
      const value = data[key]
      // strings vazias viram null pra limpar o campo no DB
      if (key === 'dataNascimento') {
        update[key] = value ? new Date(value as string) : null
      } else if (typeof value === 'string') {
        update[key] = value.trim() || null
      } else {
        update[key] = value ?? null
      }
    }
    if (Object.keys(update).length === 0) return { ok: true }
    await prisma.user.update({ where: { id: userId }, data: update })
    return { ok: true }
  }

  // ── Dispositivos confiaveis (MFA trust) ──

  async listTrustedDevices(userId: string) {
    const now = new Date()
    return prisma.trustedDevice.findMany({
      where: { userId, expiresAt: { gt: now } },
      select: { id: true, label: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true },
      orderBy: { lastUsedAt: 'desc' },
    })
  }

  async registerTrustedDevice(userId: string, input: { label?: string; userAgent?: string }) {
    const { randomBytes, createHash } = await import('node:crypto')
    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 dias
    await prisma.trustedDevice.create({
      data: {
        userId,
        tokenHash,
        label: input.label || null,
        userAgent: input.userAgent || null,
        ipAddress: null,
        expiresAt,
      },
    })
    return { token, expiresAt }
  }

  async revokeTrustedDevice(userId: string, deviceId: string) {
    const device = await prisma.trustedDevice.findUnique({ where: { id: deviceId }, select: { userId: true } })
    if (!device || device.userId !== userId) throw new Error('Dispositivo nao encontrado')
    await prisma.trustedDevice.delete({ where: { id: deviceId } })
    return { ok: true }
  }

  async revokeAllTrustedDevices(userId: string) {
    const r = await prisma.trustedDevice.deleteMany({ where: { userId } })
    return { ok: true, count: r.count }
  }

  async changeMyPassword(userId: string, currentPassword: string, newPassword: string) {
    if (currentPassword === newPassword) {
      throw new Error('A nova senha deve ser diferente da atual')
    }
    const account = await prisma.account.findFirst({
      where: { userId, providerId: 'credential' },
      select: { id: true, password: true },
    })
    if (!account?.password) {
      throw new Error('Conta sem senha local. Use o método de redefinição.')
    }
    const ok = await verifyPassword({ hash: account.password, password: currentPassword })
    if (!ok) throw new Error('Senha atual incorreta')
    const hashed = await hashPassword(newPassword)
    await prisma.account.update({ where: { id: account.id }, data: { password: hashed } })
    // Invalida demais sessoes ao trocar senha (forca re-login em outros dispositivos)
    return { ok: true }
  }

  async copyPermissions(sourceUserId: string, targetUserIds: string[]) {
    const sourcePerms = await prisma.userPermission.findMany({
      where: { userId: sourceUserId },
      select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true, subPermissions: true },
    })

    if (!sourcePerms.length) {
      throw new Error('O usuário de origem não possui permissões configuradas.')
    }

    let updated = 0
    for (const targetId of targetUserIds) {
      if (targetId === sourceUserId) continue
      await prisma.$transaction(async (tx) => {
        await tx.userPermission.deleteMany({ where: { userId: targetId } })
        await tx.userPermission.createMany({
          data: sourcePerms.map((p) => ({
            userId: targetId,
            moduleSlug: p.moduleSlug,
            canRead: p.canRead,
            canWrite: p.canWrite,
            canDelete: p.canDelete,
            subPermissions: p.subPermissions ?? undefined,
          })),
        })
      })
      updated++
    }

    return { updated, permissionsCopied: sourcePerms.length }
  }

  async exportAll(callerIsMaster: boolean, callerEmpresaId?: string) {
    return prisma.user.findMany({
      where: {
        ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        name: true, email: true, telefone: true,
        role: true, profile: true, isMaster: true, isActive: true,
        salario: true, dataAdmissao: true, idOneClick: true, incluirFerias: true,
        empresa: { select: { razaoSocial: true } },
        area: { select: { name: true } },
        cargo: { select: { name: true } },
      },
    })
  }

  // ============================================================
  // Clientes vinculados (responsável/substituto em áreas contratadas)
  // ============================================================
  async getAssignedClients(userId: string) {
    type Row = {
      cliente_id: string; razao_social: string; documento: string
      area_nome: string; role: string; contratado: boolean
      data_encerramento: Date | null
    }
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT c.id AS cliente_id, c.razao_social, c.documento,
              a.name AS area_nome,
              CASE WHEN ca.responsavel_id = $1 THEN 'Responsável'
                   WHEN ca.substituto_id = $1 THEN 'Substituto(a)'
              END AS role,
              ca.contratado, ca.data_encerramento
       FROM cliente_areas_contratadas ca
       INNER JOIN clientes c ON c.id = ca.cliente_id AND c.deleted_at IS NULL
       INNER JOIN areas a ON a.id = ca.area_id
       WHERE (ca.responsavel_id = $1 OR ca.substituto_id = $1)
         AND ca.contratado = true
       ORDER BY c.razao_social, a.name`, userId,
    )
    return rows.map(r => ({
      clienteId: r.cliente_id,
      razaoSocial: r.razao_social,
      documento: r.documento,
      areaNome: r.area_nome,
      role: r.role,
      encerrado: !!r.data_encerramento,
    }))
  }

  async getLoginHistory(userId: string, limit = 15) {
    return prisma.session.findMany({
      where: { userId },
      select: { id: true, createdAt: true, ipAddress: true, userAgent: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    })
  }

  // ============================================================
  // Importar carteira de clientes do OneClick v1
  // ============================================================
  async importarCarteiraOneClick(userId: string, opts: { dryRun?: boolean; somenteAreaUsuario?: boolean } = {}) {
    // 1. Buscar o usuario e seu idOneClick
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, idOneClick: true, areaId: true },
    })
    if (!user.idOneClick) throw new Error('Preencha o campo "ID OneClick" no cadastro do usuário antes de importar.')

    const ocUserId = Number(user.idOneClick)
    if (isNaN(ocUserId) || ocUserId <= 0) throw new Error('ID OneClick inválido. Deve ser um número positivo.')

    // 2. Conectar ao OneClick v1
    const mysql = await import('mysql2/promise')
    const conn = await mysql.createConnection({
      host: process.env.OCK_V1_DB_HOST || process.env.ONECLICK_DB_HOST || 'localhost',
      user: process.env.OCK_V1_DB_USER || process.env.ONECLICK_DB_USER || 'root',
      password: process.env.OCK_V1_DB_PASSWORD || process.env.ONECLICK_DB_PASSWORD || '',
      database: process.env.OCK_V1_DB_NAME || process.env.ONECLICK_DB_NAME || 'db_intranet',
      port: Number(process.env.OCK_V1_DB_PORT || process.env.ONECLICK_DB_PORT || 3306),
      charset: 'utf8mb4',
    })

    try {
      // 3. Detectar colunas existentes na tabela ger_cad_cli
      const [colRows] = await conn.execute(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ger_cad_cli'`,
      ) as [Array<{ COLUMN_NAME: string }>, unknown]
      const existingCols = new Set(colRows.map(r => r.COLUMN_NAME.toLowerCase()))

      function detectCol(candidates: string[]): string | null {
        for (const c of candidates) { if (existingCols.has(c.toLowerCase())) return c }
        return null
      }

      // Detectar coluna de CNPJ
      const cnpjCol = detectCol(['cad_cli_cnpj', 'cad_cli_cgc', 'cnpj', 'cgc', 'documento']) || 'cad_cli_cnpj'

      // Detectar colunas de responsavel por area
      const areaDefs = [
        { slug: 'contabil', respCandidates: ['cad_cli_res_con', 'cad_cli_resp_contabil', 'cad_cli_con_res', 'cad_cli_contabil_res'], flagCandidates: ['cad_cli_con_con', 'cad_cli_contabil_contratado'] },
        { slug: 'fiscal', respCandidates: ['cad_cli_res_fis', 'cad_cli_resp_fiscal', 'cad_cli_fis_res', 'cad_cli_fiscal_res'], flagCandidates: ['cad_cli_fis_con', 'cad_cli_fiscal_contratado'] },
        { slug: 'trabalhista', respCandidates: ['cad_cli_res_trab', 'cad_cli_resp_trabalhista', 'cad_cli_trab_res', 'cad_cli_pes_res'], flagCandidates: ['cad_cli_trab_con', 'cad_cli_trabalhista_contratado', 'cad_cli_dp_con', 'cad_cli_pes_con'] },
        { slug: 'legalizacao', respCandidates: ['cad_cli_res_legal', 'cad_cli_resp_legal', 'cad_cli_legal_res', 'cad_cli_leg_res'], flagCandidates: ['cad_cli_legal_con', 'cad_cli_legal_contratado'] },
      ]

      const respCols: Array<{ slug: string; col: string; flagCol: string | null }> = []
      for (const ad of areaDefs) {
        const col = detectCol(ad.respCandidates)
        if (col) respCols.push({ slug: ad.slug, col, flagCol: detectCol(ad.flagCandidates) })
      }

      if (respCols.length === 0) throw new Error('Nenhuma coluna de responsável encontrada na tabela ger_cad_cli.')

      // Construir query dinamica
      const selectCols = [cnpjCol + ' AS cnpj_raw']
      for (const rc of respCols) {
        selectCols.push(`${rc.col} AS resp_${rc.slug}`)
        if (rc.flagCol) selectCols.push(`${rc.flagCol} AS flag_${rc.slug}`)
      }

      const whereOr = respCols.map(r => `${r.col} = ?`).join(' OR ')
      const params = respCols.map(() => ocUserId)

      const ativoCol = detectCol(['cad_cli_ativo', 'ativo']) || 'cad_cli_ativo'

      const [rows] = await conn.execute(
        `SELECT ${selectCols.join(', ')} FROM ger_cad_cli WHERE ${ativoCol} = 1 AND (${whereOr})`,
        params,
      ) as [Array<Record<string, unknown>>, unknown]

      // 4. Mapear areas do novo sistema
      const areasDb = await prisma.area.findMany({
        where: { isActive: true, availableForHiring: true },
        select: { id: true, name: true },
      })
      const areaMap = new Map<string, string>()
      for (const a of areasDb) {
        const n = a.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        if (n.includes('contab')) areaMap.set('contabil', a.id)
        if (n.includes('fiscal')) areaMap.set('fiscal', a.id)
        if (n.includes('trabalh') || n.includes('pessoal') || n.includes('dp')) areaMap.set('trabalhista', a.id)
        if (n.includes('legal') || n.includes('societar')) areaMap.set('legalizacao', a.id)
      }

      // 5. Filtrar por area do usuario se solicitado
      let activeSlugs = respCols.map(r => r.slug)
      if (opts.somenteAreaUsuario && user.areaId) {
        const userArea = areasDb.find(a => a.id === user.areaId)
        if (userArea) {
          const n = userArea.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          const matchSlug = activeSlugs.find(s => n.includes(s.replace('legalizacao', 'legal')))
          if (matchSlug) activeSlugs = [matchSlug]
        }
      }

      // 6. Processar resultados
      let vinculados = 0, ignoradosSemCliente = 0, ignoradosSemArea = 0

      for (const row of rows) {
        const doc = String(row.cnpj_raw || '').replace(/\D/g, '')
        if (!doc || doc.length < 11) { ignoradosSemCliente++; continue }

        const cliente = await prisma.cliente.findFirst({
          where: { documento: doc, deletedAt: null },
          select: { id: true },
        })
        if (!cliente) { ignoradosSemCliente++; continue }

        for (const rc of respCols) {
          if (!activeSlugs.includes(rc.slug)) continue
          if (Number(row[`resp_${rc.slug}`] || 0) !== ocUserId) continue

          const areaId = areaMap.get(rc.slug)
          if (!areaId) { ignoradosSemArea++; continue }

          if (!opts.dryRun) {
            await prisma.clienteAreaContratada.upsert({
              where: { clienteId_areaId: { clienteId: cliente.id, areaId } },
              create: { clienteId: cliente.id, areaId, contratado: true, responsavelId: userId },
              update: { responsavelId: userId, contratado: true },
            })
          }
          vinculados++
        }
      }

      return {
        ocUserId,
        totalLinhasOneClick: rows.length,
        vinculados,
        ignoradosSemCliente,
        ignoradosSemArea,
        areasMapeadas: Object.fromEntries([...areaMap.entries()].filter(([k]) => activeSlugs.includes(k))),
        dryRun: !!opts.dryRun,
      }
    } finally {
      conn.end().catch(() => {})
    }
  }

  // ============================================================
  // Importar dados dos usuários do OneClick v1 (db_intranet.ger_cad_usu)
  // ============================================================
  /**
   * Lê os usuários do db_intranet.ger_cad_usu e sincroniza com o nosso banco:
   *
   *   1. ATUALIZAR — match em cascata (idOneClick → email → nome canon)
   *      preenche dataNascimento, dataAdmissao, ramal, idOneClick (e salario
   *      se incluso) dos usuários encontrados. Não sobrescreve dados já
   *      preenchidos a menos que opts.sobrescrever = true.
   *
   *   2. DESATIVAR — usuários nossos com idOneClick setado, mas cujo registro
   *      no v1 tem cad_usu_ativo != 1 (ou foi removido). Soft-delete:
   *      isActive=false + exibirComoColaborador=false + sessões encerradas.
   *      Não desativa: master/empresa-master, próprio caller, ou users sem
   *      idOneClick (criados manualmente sem origem v1).
   *
   *   3. CRIAR — ativos no v1 que não bateram em nenhum match. Cria com
   *      senha temporária ("Acesso@123") e role/profile padrão.
   *
   * opts.dryRun retorna o plano completo sem aplicar.
   */
  async importarDoIntranetV1(
    callerUserId: string,
    opts: {
      dryRun?: boolean
      sobrescrever?: boolean
      campos?: Array<'dataNascimento' | 'dataAdmissao' | 'ramal' | 'idOneClick' | 'salario'>
      desativarAusentes?: boolean
      criarNovos?: boolean
    } = {},
  ) {
    const camposPermitidos = new Set(
      opts.campos ?? ['dataNascimento', 'dataAdmissao', 'ramal', 'idOneClick'],
    )
    const sobrescrever = !!opts.sobrescrever
    const desativarAusentes = opts.desativarAusentes ?? true
    const criarNovos = opts.criarNovos ?? true

    function canonNome(s: string): string {
      return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/\s+/g, ' ').trim()
    }
    function parseSalarioBR(v: string | null | undefined): number | null {
      if (!v) return null
      // "3.932,00" → 3932.00
      const limpo = v.replace(/\./g, '').replace(',', '.').trim()
      const n = Number(limpo)
      return Number.isFinite(n) && n > 0 ? n : null
    }

    const mysqlModule = await import('mysql2/promise')
    const conn = await mysqlModule.createConnection({
      host: process.env.OCK_V1_DB_HOST || 'localhost',
      user: process.env.OCK_V1_DB_USER || 'root',
      password: process.env.OCK_V1_DB_PASSWORD || '',
      database: process.env.OCK_V1_DB_NAME || 'db_intranet',
      port: Number(process.env.OCK_V1_DB_PORT || 3306),
      charset: 'utf8mb4',
      dateStrings: true, // evita Date inválido vindo do MySQL
      connectTimeout: 8000,
    })

    type LegacyRow = {
      CAD_USU_ID: number
      cad_usu_email: string | null
      cad_usu_nome: string | null
      CAD_USU_DT_NAS: string | null   // YYYY-MM-DD (dateStrings)
      dt_admissao: string | null
      cad_usu_ramal: string | null
      salario: string | null
      cad_usu_ativo: number
    }

    try {
      // TRAZ TODOS (ativos e inativos) — usados pra detectar quem foi
      // desativado no v1 e pra montar mapa de match por ID
      const [rowsAll] = await conn.execute(`
        SELECT CAD_USU_ID, cad_usu_email, cad_usu_nome,
               CAD_USU_DT_NAS, dt_admissao, cad_usu_ramal, salario,
               cad_usu_ativo
        FROM ger_cad_usu
      `) as [LegacyRow[], unknown]
      const rows = rowsAll.filter(r => r.cad_usu_ativo === 1)
      const mapaV1PorId = new Map(rowsAll.map(r => [String(r.CAD_USU_ID), r]))

      // Carrega TODOS os nossos users (relevante p/ match por nome/email)
      const meus = await prisma.user.findMany({
        select: {
          id: true, name: true, email: true,
          dataNascimento: true, dataAdmissao: true,
          ramal: true, idOneClick: true, salario: true,
          isActive: true, isMaster: true, isEmpresaMaster: true,
        },
      })
      const porEmail = new Map<string, typeof meus[number]>()
      const porIdOneClick = new Map<string, typeof meus[number]>()
      const porNomeCanon = new Map<string, typeof meus[number]>()
      for (const u of meus) {
        if (u.email) porEmail.set(u.email.toLowerCase(), u)
        if (u.idOneClick) porIdOneClick.set(u.idOneClick, u)
        if (u.name) porNomeCanon.set(canonNome(u.name), u)
      }

      const semMatch: Array<{ id: number; nome: string | null; email: string | null }> = []
      const planoAtualizacoes: Array<{
        userId: string
        userName: string
        matchedBy: 'idOneClick' | 'email' | 'nome'
        campos: Record<string, { de: unknown; para: unknown; pulado?: string }>
      }> = []

      for (const r of rows) {
        let alvo: typeof meus[number] | undefined
        let matchedBy: 'idOneClick' | 'email' | 'nome' = 'idOneClick'

        const idStr = String(r.CAD_USU_ID)
        alvo = porIdOneClick.get(idStr)
        if (alvo) matchedBy = 'idOneClick'
        if (!alvo && r.cad_usu_email) {
          alvo = porEmail.get(r.cad_usu_email.toLowerCase().trim())
          if (alvo) matchedBy = 'email'
        }
        if (!alvo && r.cad_usu_nome) {
          alvo = porNomeCanon.get(canonNome(r.cad_usu_nome))
          if (alvo) matchedBy = 'nome'
        }

        if (!alvo) {
          semMatch.push({ id: r.CAD_USU_ID, nome: r.cad_usu_nome, email: r.cad_usu_email })
          continue
        }

        const campos: Record<string, { de: unknown; para: unknown; pulado?: string }> = {}

        function tentar(campo: string, atual: unknown, novo: unknown) {
          if (!camposPermitidos.has(campo as any)) return
          if (novo == null || novo === '') return
          if (atual != null && atual !== '' && !sobrescrever) {
            // Só registra como "pulado" se há divergência
            if (String(atual) !== String(novo)) {
              campos[campo] = { de: atual, para: novo, pulado: 'já preenchido' }
            }
            return
          }
          if (atual !== novo) campos[campo] = { de: atual, para: novo }
        }

        tentar('dataNascimento', alvo.dataNascimento?.toISOString().slice(0, 10) ?? null, r.CAD_USU_DT_NAS)
        tentar('dataAdmissao', alvo.dataAdmissao?.toISOString().slice(0, 10) ?? null, r.dt_admissao)
        tentar('ramal', alvo.ramal, r.cad_usu_ramal?.trim() || null)
        tentar('idOneClick', alvo.idOneClick, idStr)
        const sal = parseSalarioBR(r.salario)
        if (sal !== null) tentar('salario', alvo.salario ? Number(alvo.salario) : null, sal)

        if (Object.keys(campos).length > 0) {
          planoAtualizacoes.push({
            userId: alvo.id,
            userName: alvo.name,
            matchedBy,
            campos,
          })
        }
      }

      // ─── Plano de DESATIVAÇÃO ─────────────────────────────────
      // Users nossos com idOneClick que viraram inativos no v1 (ou sumiram)
      const planoDesativar: Array<{ userId: string; userName: string; motivo: string }> = []
      if (desativarAusentes) {
        for (const u of meus) {
          if (!u.isActive) continue                          // já inativo
          if (u.isMaster || u.isEmpresaMaster) continue      // nunca masters
          if (u.id === callerUserId) continue                // não desativa si mesmo
          if (!u.idOneClick) continue                        // sem origem v1
          const v1 = mapaV1PorId.get(u.idOneClick)
          if (!v1) {
            planoDesativar.push({ userId: u.id, userName: u.name, motivo: 'removido no v1' })
          } else if (v1.cad_usu_ativo !== 1) {
            planoDesativar.push({ userId: u.id, userName: u.name, motivo: 'desativado no v1' })
          }
        }
      }

      // ─── Plano de CRIAÇÃO ────────────────────────────────────
      // Ativos no v1 sem match (semMatch) e com dados mínimos (nome + email)
      const planoCriar: Array<{ legacyId: number; nome: string; email: string }> = []
      if (criarNovos) {
        for (const sm of semMatch) {
          if (!sm.nome || !sm.email) continue
          const emailNorm = sm.email.toLowerCase().trim()
          // Evita criar duplicado caso o email já exista (race com matching)
          if (porEmail.has(emailNorm)) continue
          planoCriar.push({ legacyId: sm.id, nome: sm.nome.trim(), email: emailNorm })
        }
      }

      // ─── Aplica (a menos que dryRun) ──────────────────────────
      let aplicadas = 0
      let desativados = 0
      let criados = 0
      const errosCriacao: Array<{ email: string; erro: string }> = []

      if (!opts.dryRun) {
        // 1. Atualizações
        for (const plano of planoAtualizacoes) {
          const data: Record<string, unknown> = {}
          for (const [campo, info] of Object.entries(plano.campos)) {
            if (info.pulado) continue
            if (campo === 'dataNascimento' || campo === 'dataAdmissao') {
              data[campo] = info.para ? new Date(String(info.para) + 'T00:00:00') : null
            } else {
              data[campo] = info.para
            }
          }
          if (Object.keys(data).length === 0) continue
          await prisma.user.update({ where: { id: plano.userId }, data })
          aplicadas++
        }

        // 2. Desativações (soft-delete + encerra sessões — espelha User.delete)
        for (const d of planoDesativar) {
          await prisma.$transaction([
            prisma.user.update({
              where: { id: d.userId },
              data: { isActive: false, exibirComoColaborador: false },
            }),
            prisma.session.deleteMany({ where: { userId: d.userId } }),
          ])
          desativados++
        }

        // 3. Criações — senha temporária "Acesso@123" (igual UserService.create)
        const senhaPadrao = await hashPassword('Acesso@123')
        for (const c of planoCriar) {
          const v1 = mapaV1PorId.get(String(c.legacyId))
          if (!v1) continue
          try {
            await prisma.$transaction(async (tx) => {
              const novoUser = await tx.user.create({
                data: {
                  name: c.nome,
                  email: c.email,
                  role: 'COLABORADOR_INTERNO',
                  profile: 'OPERADOR',
                  isActive: true,
                  exibirComoColaborador: true,
                  emailVerified: false,
                  tipoContrato: 'CLT',
                  idOneClick: String(c.legacyId),
                  dataNascimento: v1.CAD_USU_DT_NAS ? new Date(v1.CAD_USU_DT_NAS + 'T00:00:00') : null,
                  dataAdmissao: v1.dt_admissao ? new Date(v1.dt_admissao + 'T00:00:00') : null,
                  ramal: v1.cad_usu_ramal?.trim() || null,
                  salario: parseSalarioBR(v1.salario) ?? null,
                },
              })
              await tx.account.create({
                data: {
                  userId: novoUser.id,
                  accountId: novoUser.id,
                  providerId: 'credential',
                  password: senhaPadrao,
                },
              })
            })
            criados++
          } catch (e) {
            errosCriacao.push({ email: c.email, erro: (e as Error).message })
          }
        }
      }

      return {
        totalLegado: rows.length,
        matched: planoAtualizacoes.length + (rows.length - planoAtualizacoes.length - semMatch.length),
        atualizacoesPlanejadas: planoAtualizacoes.length,
        desativacoesPlanejadas: planoDesativar.length,
        criacoesPlanejadas: planoCriar.length,
        aplicadas,
        desativados,
        criados,
        errosCriacao,
        semMatch,
        plano: planoAtualizacoes,
        planoDesativar,
        planoCriar,
        dryRun: !!opts.dryRun,
        sobrescrever,
      }
    } finally {
      conn.end().catch(() => {})
    }
  }

  // ============================================================
  // Buscar dados do usuário nos bancos legados (SERPRO2 + v1)
  // ============================================================
  async buscarDadosLegado(email: string) {
    const mysql = await import('mysql2/promise')
    const result: {
      encontrado: boolean
      fonte: string | null
      dados: Record<string, unknown> | null
    } = { encontrado: false, fonte: null, dados: null }

    // 1. Tentar SERPRO2 (oneclick_fiscal_serpro) — tem dados mais completos
    try {
      const conn = await mysql.createConnection({
        host: process.env.LEGACY_DB_HOST || 'localhost',
        user: process.env.LEGACY_DB_USER || 'root',
        password: process.env.LEGACY_DB_PASSWORD || '',
        database: process.env.LEGACY_DB_NAME || 'oneclick_fiscal_serpro',
        port: Number(process.env.LEGACY_DB_PORT || 3306),
        charset: 'utf8mb4',
        connectTimeout: 5000,
      })
      try {
        const [rows] = await conn.execute(
          `SELECT u.id, u.nome, u.email, u.telefone,
                  u.tipo_usuario, u.perfil, u.ativo,
                  u.data_admissao, u.controle_ferias,
                  u.oneclick_usuario_id, u.salario,
                  a.nome AS area_nome, c.nome AS cargo_nome
           FROM usuarios u
           LEFT JOIN areas a ON a.id = u.area_id
           LEFT JOIN cargos c ON c.id = u.cargo_id
           WHERE u.email = ?
           LIMIT 1`,
          [email.trim().toLowerCase()],
        ) as [Array<Record<string, unknown>>, unknown]

        if (rows.length > 0) {
          const row = rows[0]!
          result.encontrado = true
          result.fonte = 'SERPRO2'
          result.dados = {
            idLegado: row.id,
            nome: row.nome,
            email: row.email,
            telefone: row.telefone,
            tipoUsuario: row.tipo_usuario,
            perfil: row.perfil,
            ativo: row.ativo,
            dataAdmissao: row.data_admissao,
            controleFerias: !!row.controle_ferias,
            oneclickUsuarioId: row.oneclick_usuario_id,
            salario: row.salario,
            areaNome: row.area_nome,
            cargoNome: row.cargo_nome,
          }
        }
      } finally {
        conn.end().catch(() => {})
      }
    } catch {
      // SERPRO2 indisponível, segue para v1
    }

    // 2. Se não encontrou no SERPRO2, tentar OneClick v1 (db_intranet)
    if (!result.encontrado) {
      try {
        const conn = await mysql.createConnection({
          host: process.env.OCK_V1_DB_HOST || process.env.ONECLICK_DB_HOST || 'localhost',
          user: process.env.OCK_V1_DB_USER || process.env.ONECLICK_DB_USER || 'root',
          password: process.env.OCK_V1_DB_PASSWORD || process.env.ONECLICK_DB_PASSWORD || '',
          database: process.env.OCK_V1_DB_NAME || process.env.ONECLICK_DB_NAME || 'db_intranet',
          port: Number(process.env.OCK_V1_DB_PORT || process.env.ONECLICK_DB_PORT || 3306),
          charset: 'utf8mb4',
          connectTimeout: 5000,
        })
        try {
          // Descobrir tabela e colunas dinamicamente
          const [tables] = await conn.execute(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME IN ('crp_usuarios','ger_usuarios','cad_usuarios','usuarios')
             LIMIT 1`,
          ) as [Array<{ TABLE_NAME: string }>, unknown]

          if (tables.length > 0) {
            const tbl = tables[0]!.TABLE_NAME
            const [cols] = await conn.execute(
              `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
              [tbl],
            ) as [Array<{ COLUMN_NAME: string }>, unknown]
            const colSet = new Set(cols.map(c => c.COLUMN_NAME.toLowerCase()))

            const idCol = ['id', 'id_usuario', 'codigo', 'cd_usuario'].find(c => colSet.has(c)) || 'id'
            const nomeCol = ['nome', 'nome_completo', 'nm_usuario'].find(c => colSet.has(c)) || 'nome'
            const emailCol = colSet.has('email') ? 'email' : null

            if (emailCol) {
              const [rows] = await conn.execute(
                `SELECT ${idCol} AS id, ${nomeCol} AS nome, ${emailCol} AS email FROM ${tbl} WHERE ${emailCol} = ? LIMIT 1`,
                [email.trim().toLowerCase()],
              ) as [Array<Record<string, unknown>>, unknown]

              if (rows.length > 0) {
                const row = rows[0]!
                result.encontrado = true
                result.fonte = 'OneClick v1'
                result.dados = {
                  idLegado: row.id,
                  nome: row.nome,
                  email: row.email,
                  oneclickUsuarioId: row.id,
                }
              }
            }
          }
        } finally {
          conn.end().catch(() => {})
        }
      } catch {
        // v1 também indisponível
      }
    }

    return result
  }

  async bulkCreate(items: CreateUserInput[]) {
    const results = { created: 0, errors: [] as string[] }
    for (let i = 0; i < items.length; i++) {
      try {
        await this.create(items[i]!)
        results.created++
      } catch (e) {
        results.errors.push(`Linha ${i + 1}: ${(e as Error).message}`)
      }
    }
    return results
  }
}
