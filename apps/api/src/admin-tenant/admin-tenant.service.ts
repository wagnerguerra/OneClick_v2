import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

const DAY_MS = 24 * 60 * 60 * 1000

export type TenantBillingState = 'ACTIVE' | 'TRIAL' | 'TRIAL_EXPIRED' | 'SUSPENDED'

/**
 * Gestão GLOBAL dos tenants (schema public) — apenas master da plataforma.
 * Separado do módulo /empresas (que é a tabela interna de cada tenant).
 */
@Injectable()
export class AdminTenantService {
  /** Lista todos os tenants com estado de trial/assinatura derivado. */
  async list() {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        trialStartedAt: true,
        trialEndsAt: true,
        createdAt: true,
        stripeCustomerId: true,
        _count: { select: { users: true } },
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            currentPeriodEnd: true,
            plan: { select: { name: true } },
          },
        },
      },
    })

    const now = Date.now()
    return tenants.map((t) => {
      const sub = t.subscriptions[0] ?? null
      const trialEndsAt = t.trialEndsAt
      let state: TenantBillingState
      let daysRemaining: number | null = null

      if (t.status === 'SUSPENDED') {
        state = 'SUSPENDED'
      } else if (
        sub &&
        (sub.status === 'ACTIVE' || sub.status === 'TRIALING') &&
        sub.currentPeriodEnd.getTime() > now
      ) {
        state = 'ACTIVE'
      } else if (trialEndsAt) {
        daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now) / DAY_MS))
        state = trialEndsAt.getTime() > now ? 'TRIAL' : 'TRIAL_EXPIRED'
      } else {
        state = 'ACTIVE' // trialEndsAt NULL = isento/grandfathered
      }

      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        createdAt: t.createdAt,
        trialEndsAt,
        daysRemaining,
        userCount: t._count.users,
        subscriptionStatus: sub?.status ?? null,
        planName: sub?.plan?.name ?? null,
        state,
      }
    })
  }

  /**
   * Estende o trial em N dias. Se o trial ainda está vigente, soma a partir do
   * fim atual; se já expirou (ou era NULL), conta a partir de hoje.
   */
  async extendTrial(tenantId: string, dias: number) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { trialEndsAt: true },
    })
    const now = Date.now()
    const base =
      tenant?.trialEndsAt && tenant.trialEndsAt.getTime() > now
        ? tenant.trialEndsAt
        : new Date()
    const trialEndsAt = new Date(base.getTime() + dias * DAY_MS)
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { trialEndsAt },
    })
  }

  /** Suspende o tenant (bloqueia todo o acesso às features). */
  async suspend(tenantId: string) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'SUSPENDED' },
    })
  }

  /** Reativa um tenant suspenso. */
  async reactivate(tenantId: string) {
    return prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    })
  }
}
