import { Inject, Injectable, Optional } from '@nestjs/common'
import { prisma, createTenantSchema } from '@saas/db'
import { MODULE_SLUGS } from '@saas/types'
import { StripeService } from '../stripe/stripe.service'

@Injectable()
export class OnboardingService {
  constructor(
    @Optional() @Inject(StripeService) private readonly stripeService?: StripeService,
  ) {}

  /**
   * Cria tenant + empresa e vincula o usuário como empresa master.
   * Cria customer no Stripe para o tenant.
   * Atribui todas as permissões ao usuário.
   */
  async createEmpresa(
    userId: string,
    data: { razaoSocial: string; nomeFantasia?: string; cnpj: string },
  ) {
    const result = await prisma.$transaction(async (tx) => {
      // Verificar se o usuário já tem empresa
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
      if (user.empresaId) {
        throw new Error('Usuário já possui uma empresa vinculada.')
      }

      // Período de teste: lê os dias da config global (fallback 7)
      const billingCfg = await tx.platformBillingConfig.findUnique({ where: { id: 1 } })
      const trialDays = billingCfg?.trialDays ?? 7
      const now = new Date()
      const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)

      // Criar tenant (container de billing) — já em trial de N dias, sem cartão
      const slug = data.cnpj.replace(/\D/g, '').slice(0, 14)
      const tenant = await tx.tenant.create({
        data: {
          name: data.razaoSocial,
          slug: `tenant-${slug}-${Date.now()}`,
          schema: `tenant_${slug}`,
          status: 'ACTIVE',
          trialStartedAt: now,
          trialEndsAt,
        },
      })

      // Criar empresa
      const empresa = await tx.empresa.create({
        data: {
          razaoSocial: data.razaoSocial,
          nomeFantasia: data.nomeFantasia || null,
          cnpj: data.cnpj,
          isActive: true,
        },
      })

      // Atualizar usuário: vincular à empresa + tenant + marcar como empresa master + role DIRETOR
      await tx.user.update({
        where: { id: userId },
        data: {
          empresaId: empresa.id,
          tenantId: tenant.id,
          isEmpresaMaster: true,
          role: 'DIRETOR' as never,
        },
      })

      // Criar permissões completas para todos os módulos
      const allSlugs = MODULE_SLUGS as readonly string[]
      await tx.userPermission.createMany({
        data: allSlugs.map((moduleSlug) => ({
          userId,
          moduleSlug,
          canRead: true,
          canWrite: true,
          canDelete: true,
        })),
      })

      return { empresa, tenant, userEmail: user.email }
    })

    // Criar schema do tenant no PostgreSQL (fora da transaction — DDL)
    try {
      await createTenantSchema(result.tenant.schema)
      console.log(`[Onboarding] Schema "${result.tenant.schema}" criado com sucesso.`)
    } catch (err: any) {
      console.error(`[Onboarding] Erro ao criar schema do tenant:`, err.message)
      // Não falhar o onboarding — o sistema funciona com public como fallback
    }

    // Criar customer no Stripe (fora da transaction — chamada externa)
    if (this.stripeService && process.env.STRIPE_SECRET_KEY) {
      try {
        await this.stripeService.createCustomer(
          result.tenant.id,
          result.userEmail,
          data.razaoSocial,
        )
      } catch (err: any) {
        console.error('[Onboarding] Erro ao criar customer Stripe:', err.message)
        // Nao falhar o onboarding por causa do Stripe
      }
    }

    return result.empresa
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
