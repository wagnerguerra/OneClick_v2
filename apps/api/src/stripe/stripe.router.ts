import { z } from 'zod'
import { router, publicProcedure, protectedProcedure } from '../trpc/trpc.service'
import { StripeService } from './stripe.service'

export function createBillingRouter(stripeService: StripeService) {
  return router({
    // Planos disponiveis (publico — para exibir na landing/pricing)
    plans: publicProcedure.query(() => stripeService.getPlans()),

    // Assinatura atual do tenant
    currentSubscription: protectedProcedure.query(({ ctx }) => {
      if (!ctx.tenantId) return null
      return stripeService.getCurrentSubscription(ctx.tenantId)
    }),

    // Criar sessao de checkout do Stripe
    createCheckoutSession: protectedProcedure
      .input(z.object({ stripePriceId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.tenantId) throw new Error('Tenant nao encontrado')
        const url = await stripeService.createCheckoutSession(ctx.tenantId, input.stripePriceId)
        return { url }
      }),

    // Criar sessao do portal de billing do Stripe
    createPortalSession: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.tenantId) throw new Error('Tenant nao encontrado')
        const url = await stripeService.createPortalSession(ctx.tenantId)
        return { url }
      }),

    // Cancelar assinatura (ao final do periodo)
    cancelSubscription: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.tenantId) throw new Error('Tenant nao encontrado')
        await stripeService.cancelSubscription(ctx.tenantId)
        return { ok: true }
      }),

    // Reativar assinatura (desfazer cancelamento)
    reactivateSubscription: protectedProcedure
      .mutation(async ({ ctx }) => {
        if (!ctx.tenantId) throw new Error('Tenant nao encontrado')
        await stripeService.reactivateSubscription(ctx.tenantId)
        return { ok: true }
      }),
  })
}
