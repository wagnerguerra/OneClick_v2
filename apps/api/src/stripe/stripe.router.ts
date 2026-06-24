import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { upsertPlanInput, billingConfigSchema } from '@saas/types'
import { router, publicProcedure, protectedProcedure } from '../trpc/trpc.service'
import { StripeService } from './stripe.service'

const DAY_MS = 24 * 60 * 60 * 1000

export function createBillingRouter(stripeService: StripeService) {
  return router({
    // Planos disponiveis (publico — para exibir na landing/pricing)
    plans: publicProcedure.query(() => stripeService.getPlans()),

    // Estado de acesso (trial/assinatura) do tenant logado — usado pelo guard
    // do dashboard e pelo banner de trial. Lê o billingState do contexto.
    access: protectedProcedure.query(({ ctx }) => {
      const state = ctx.billingState ?? 'ACTIVE'
      const trialEndsAt = ctx.trialEndsAt ?? null
      let daysRemaining: number | null = null
      if (trialEndsAt) {
        daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / DAY_MS))
      }
      return { state, trialEndsAt, daysRemaining }
    }),

    // Assinatura atual do tenant
    currentSubscription: protectedProcedure.query(({ ctx }) => {
      if (!ctx.tenantId) return null
      return stripeService.getCurrentSubscription(ctx.tenantId)
    }),

    // ── Admin de planos e config (master global) ─────────
    adminListPlans: protectedProcedure.query(({ ctx }) => {
      if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master' })
      return stripeService.adminListPlans()
    }),

    upsertPlan: protectedProcedure
      .input(upsertPlanInput)
      .mutation(({ ctx, input }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master' })
        return stripeService.upsertPlan(input)
      }),

    togglePlan: protectedProcedure
      .input(z.object({ id: z.string(), isActive: z.boolean() }))
      .mutation(({ ctx, input }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master' })
        return stripeService.togglePlan(input.id, input.isActive)
      }),

    getBillingConfig: protectedProcedure.query(({ ctx }) => {
      if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master' })
      return stripeService.getBillingConfig()
    }),

    setBillingConfig: protectedProcedure
      .input(billingConfigSchema)
      .mutation(({ ctx, input }) => {
        if (!ctx.isMaster) throw new TRPCError({ code: 'FORBIDDEN', message: 'Apenas master' })
        return stripeService.setBillingConfig(input.trialDays, ctx.userId)
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
