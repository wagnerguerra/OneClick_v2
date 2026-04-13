import { z } from 'zod'

// ── Planos ─────────────────────────────────────────────

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  stripePriceId: z.string(),
  interval: z.enum(['MONTHLY', 'YEARLY']),
  price: z.number(),
  features: z.array(z.string()),
  maxUsers: z.number(),
  isActive: z.boolean(),
})

export type PlanOutput = z.infer<typeof planSchema>

// ── Assinatura ─────────────────────────────────────────

export const subscriptionStatusEnum = z.enum([
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'TRIALING',
  'INCOMPLETE',
])

export type SubscriptionStatus = z.infer<typeof subscriptionStatusEnum>

export const subscriptionSchema = z.object({
  id: z.string(),
  status: subscriptionStatusEnum,
  currentPeriodStart: z.coerce.date(),
  currentPeriodEnd: z.coerce.date(),
  cancelAtPeriodEnd: z.boolean(),
  plan: planSchema,
})

export type SubscriptionOutput = z.infer<typeof subscriptionSchema>

// ── Inputs ─────────────────────────────────────────────

export const createCheckoutInput = z.object({
  stripePriceId: z.string().min(1, 'ID do preco e obrigatorio'),
})

export type CreateCheckoutInput = z.infer<typeof createCheckoutInput>

// ── Labels e cores para status ─────────────────────────

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'Ativa',
  PAST_DUE: 'Pagamento pendente',
  CANCELED: 'Cancelada',
  TRIALING: 'Periodo de teste',
  INCOMPLETE: 'Incompleta',
}

export const SUBSCRIPTION_STATUS_COLORS: Record<SubscriptionStatus, string> = {
  ACTIVE: '#10b981',
  PAST_DUE: '#f59e0b',
  CANCELED: '#ef4444',
  TRIALING: '#5ea3cb',
  INCOMPLETE: '#6b7280',
}

export const PLAN_INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
}
