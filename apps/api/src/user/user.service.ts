import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import type { Prisma } from '@saas/db'
import type { CreateUserInput, UpdateUserInput, ListUserInput } from '@saas/types'
import { hashPassword } from 'better-auth/crypto'

@Injectable()
export class UserService {
  async list(input: ListUserInput, callerIsMaster: boolean, callerEmpresaId?: string) {
    const { page, limit, search, sortBy, sortDir, role, empresaId } = input
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
      // Non-MASTER users can only see users from their empresa
      ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
    }

    const orderBy = sortBy ? { [sortBy]: sortDir } : { name: 'asc' as const }

    const [data, total] = await Promise.all([
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
          empresaId: true,
          createdAt: true,
          empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
          area: { select: { id: true, name: true } },
          _count: { select: { permissions: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, callerIsMaster = false, callerEmpresaId?: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        telefone: true,
        role: true,
        profile: true,
        isMaster: true,
        isActive: true,
        empresaId: true,
        areaId: true,
        cargoId: true,
        salario: true,
        dataAdmissao: true,
        idOneClick: true,
        incluirFerias: true,
        image: true,
        createdAt: true,
        empresa: { select: { id: true, razaoSocial: true, nomeFantasia: true } },
        area: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
        permissions: {
          select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true },
        },
      },
    })
    if (!callerIsMaster && callerEmpresaId && user.empresaId !== callerEmpresaId) {
      throw new Error('Acesso negado.')
    }
    return user
  }

  async create(input: CreateUserInput) {
    const { permissions, password, empresaId, areaId, cargoId, dataAdmissao, salario, role, profile, ...userData } = input
    const hashedPassword = await hashPassword(password || 'Acesso@123')

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...userData,
          role: (role ?? 'COLABORADOR_INTERNO') as never,
          profile: (profile ?? 'OPERADOR') as never,
          empresaId: empresaId || null,
          areaId: areaId || null,
          cargoId: cargoId || null,
          salario: salario != null && salario !== '' ? Number(salario) : null,
          dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null,
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
    const { permissions, password, empresaId, areaId, cargoId, dataAdmissao, salario, ...userData } = input

    return prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUniqueOrThrow({ where: { id } })
      if (existing.isMaster && !callerIsMaster) {
        throw new Error('Apenas um usuário MASTER pode editar outro MASTER.')
      }
      if (existing.isMaster && !callerIsMaster) {
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
      if (salario !== undefined) data.salario = salario != null && salario !== '' ? Number(salario) : null
      if (dataAdmissao !== undefined) data.dataAdmissao = dataAdmissao ? new Date(dataAdmissao) : null

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
            })),
          })
        }
      }

      return user
    })
  }

  async delete(id: string, callerUserId: string) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id } })
    if (user.isMaster) {
      throw new Error('Rebaixe o usuário MASTER antes de excluí-lo.')
    }
    if (id === callerUserId) {
      throw new Error('Você não pode excluir a si mesmo.')
    }
    return prisma.user.delete({ where: { id } })
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
    return prisma.user.findMany({
      where: {
        isActive: true,
        ...(!callerIsMaster && callerEmpresaId ? { empresaId: callerEmpresaId } : {}),
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    })
  }

  async getMyPermissions(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        isMaster: true,
        role: true,
        empresaId: true,
        permissions: {
          select: { moduleSlug: true, canRead: true, canWrite: true, canDelete: true },
        },
      },
    })

    return {
      isMaster: user.isMaster,
      role: user.role,
      empresaId: user.empresaId,
      permissions: user.permissions,
    }
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
