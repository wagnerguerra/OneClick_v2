import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { UpsertPlanInput } from '@saas/types'

// Stripe v22 — import dinâmico para evitar conflitos de tipos CJS/ESM
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StripeLib = require('stripe')

type StripeClient = InstanceType<typeof StripeLib>

type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING' | 'INCOMPLETE'

@Injectable()
export class StripeService {
  private stripe: StripeClient

  constructor() {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      console.warn('[Stripe] STRIPE_SECRET_KEY nao definida — modulo em modo desabilitado')
    }
    this.stripe = new StripeLib(key || 'sk_test_placeholder')
  }

  // ── Customer ──────────────────────────────────────────

  async createCustomer(tenantId: string, email: string, name: string): Promise<string> {
    const customer = await this.stripe.customers.create({
      email,
      name,
      metadata: { tenantId },
    })

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { stripeCustomerId: customer.id },
    })

    return customer.id
  }

  async getOrCreateCustomer(tenantId: string): Promise<string> {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })
    if (tenant.stripeCustomerId) return tenant.stripeCustomerId
    return this.createCustomer(tenantId, '', tenant.name)
  }

  // ── Checkout Session ──────────────────────────────────

  async createCheckoutSession(tenantId: string, stripePriceId: string): Promise<string> {
    const customerId = await this.getOrCreateCustomer(tenantId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${appUrl}/configuracoes/assinatura?status=success`,
      cancel_url: `${appUrl}/configuracoes/assinatura?status=cancel`,
      metadata: { tenantId },
    })

    return session.url
  }

  // ── Customer Portal ───────────────────────────────────

  async createPortalSession(tenantId: string): Promise<string> {
    const customerId = await this.getOrCreateCustomer(tenantId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/configuracoes/assinatura`,
    })

    return session.url
  }

  // ── Cancelar assinatura ───────────────────────────────

  async cancelSubscription(tenantId: string): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, status: { in: ['ACTIVE', 'TRIALING'] } },
    })
    if (!subscription) throw new Error('Nenhuma assinatura ativa encontrada')

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    })
  }

  // ── Reativar assinatura ───────────────────────────────

  async reactivateSubscription(tenantId: string): Promise<void> {
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, cancelAtPeriodEnd: true },
    })
    if (!subscription) throw new Error('Nenhuma assinatura para reativar')

    await this.stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: false,
    })

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    })
  }

  // ── Planos ────────────────────────────────────────────

  async getPlans() {
    return prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
    })
  }

  async getCurrentSubscription(tenantId: string) {
    return prisma.subscription.findFirst({
      where: { tenantId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ── Admin de planos (master-only) ─────────────────────

  /** Todos os planos (inclusive inativos), ordenados p/ a tela de gestão. */
  async adminListPlans() {
    return prisma.plan.findMany({
      orderBy: [{ displayOrder: 'asc' }, { price: 'asc' }],
    })
  }

  /** Cria ou atualiza um plano. `price` em centavos; `features` lista de strings. */
  async upsertPlan(input: UpsertPlanInput) {
    const data = {
      name: input.name,
      description: input.description ?? null,
      stripePriceId: input.stripePriceId,
      interval: input.interval,
      price: input.price,
      features: input.features,
      maxUsers: input.maxUsers,
      isActive: input.isActive,
      highlight: input.highlight,
      displayOrder: input.displayOrder,
    }
    if (input.id) {
      return prisma.plan.update({ where: { id: input.id }, data })
    }
    return prisma.plan.create({ data })
  }

  /** Ativa/desativa um plano (não aparece na pricing quando inativo). */
  async togglePlan(id: string, isActive: boolean) {
    return prisma.plan.update({ where: { id }, data: { isActive } })
  }

  // ── Config global de billing/trial ────────────────────

  async getBillingConfig() {
    const cfg = await prisma.platformBillingConfig.findUnique({ where: { id: 1 } })
    if (cfg) return cfg
    return prisma.platformBillingConfig.create({ data: { id: 1 } })
  }

  async setBillingConfig(trialDays: number, userId?: string) {
    return prisma.platformBillingConfig.upsert({
      where: { id: 1 },
      update: { trialDays, updatedBy: userId ?? null },
      create: { id: 1, trialDays, updatedBy: userId ?? null },
    })
  }

  // ── Webhook ───────────────────────────────────────────

  async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET nao configurado')

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret)

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpsert(event.data.object)
        break

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object)
        break

      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object)
        break

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object)
        break

      default:
        break
    }
  }

  // ── Handlers de Webhook (privados) ────────────────────

  private async handleSubscriptionUpsert(sub: any) {
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
    if (!customerId) return

    const tenant = await prisma.tenant.findUnique({ where: { stripeCustomerId: customerId } })
    if (!tenant) {
      console.warn(`[Stripe Webhook] Tenant nao encontrado para customer ${customerId}`)
      return
    }

    const priceId = sub.items?.data?.[0]?.price?.id
    if (!priceId) return

    const plan = await prisma.plan.findUnique({ where: { stripePriceId: priceId } })
    if (!plan) {
      console.warn(`[Stripe Webhook] Plano nao encontrado para price ${priceId}`)
      return
    }

    const status = this.mapStripeStatus(sub.status)

    await prisma.subscription.upsert({
      where: { stripeSubscriptionId: sub.id },
      create: {
        tenantId: tenant.id,
        planId: plan.id,
        stripeSubscriptionId: sub.id,
        stripeCustomerId: customerId,
        status,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      },
      update: {
        planId: plan.id,
        status,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      },
    })

    if (status === 'ACTIVE' || status === 'TRIALING') {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { status: 'ACTIVE' },
      })
    }
  }

  private async handleSubscriptionDeleted(sub: any) {
    const existing = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
    })
    if (!existing) return

    await prisma.subscription.update({
      where: { id: existing.id },
      data: { status: 'CANCELED', cancelAtPeriodEnd: false },
    })

    await prisma.tenant.update({
      where: { id: existing.tenantId },
      data: { status: 'SUSPENDED' },
    })
  }

  private async handleInvoicePaymentSucceeded(invoice: any) {
    const subId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id
    if (!subId) return

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subId, status: 'PAST_DUE' },
      data: { status: 'ACTIVE' },
    })
  }

  private async handleInvoicePaymentFailed(invoice: any) {
    const subId = typeof invoice.subscription === 'string'
      ? invoice.subscription
      : invoice.subscription?.id
    if (!subId) return

    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: subId },
      data: { status: 'PAST_DUE' },
    })
  }

  private mapStripeStatus(status: string): SubscriptionStatus {
    const map: Record<string, SubscriptionStatus> = {
      active: 'ACTIVE',
      past_due: 'PAST_DUE',
      canceled: 'CANCELED',
      trialing: 'TRIALING',
      incomplete: 'INCOMPLETE',
      incomplete_expired: 'CANCELED',
      unpaid: 'PAST_DUE',
      paused: 'INCOMPLETE',
    }
    return map[status] || 'INCOMPLETE'
  }
}
