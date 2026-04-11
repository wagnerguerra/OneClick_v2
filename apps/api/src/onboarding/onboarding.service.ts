import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { MODULE_SLUGS } from '@saas/types'

@Injectable()
export class OnboardingService {
  /**
   * Cria empresa e vincula o usuário como empresa master.
   * Atribui todas as permissões ao usuário.
   */
  async createEmpresa(
    userId: string,
    data: { razaoSocial: string; nomeFantasia?: string; cnpj: string },
  ) {
    return prisma.$transaction(async (tx) => {
      // Verificar se o usuário já tem empresa
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      if (user.empresaId) {
        throw new Error('Usuário já possui uma empresa vinculada.')
      }

      // Criar empresa
      const empresa = await tx.empresa.create({
        data: {
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia || null,
          cnpj: data.cnpj,
          isActive: true,
        },
      })

      // Atualizar usuário: vincular à empresa + marcar como empresa master + role DIRETOR
      await tx.user.update({
        where: { id: userId },
        data: {
          empresaId: empresa.id,
          isEmpresaMaster: true,
          role: 'DIRETOR' as never,
        },
      })

      // Criar permissões completas para todos os módulos
      const allSlugs = MODULE_SLUGS as readonly string[]
      await tx.userPermission.createMany({
        data: allSlugs.map((slug) => ({
          userId,
          moduleSlug: slug,
          canRead: true,
          canWrite: true,
          canDelete: true,
        })),
      })

      return empresa
    })
  }

  /**
   * Verifica se o usuário precisa de onboarding (sem empresa).
   */
  async needsOnboarding(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { empresaId: true, isMaster: true },
    })
    if (!user) return true
    // MASTER global não precisa de onboarding
    if (user.isMaster) return false
    // Se não tem empresa, precisa
    return !user.empresaId
  }
}
