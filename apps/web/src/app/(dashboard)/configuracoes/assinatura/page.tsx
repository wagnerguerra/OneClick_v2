'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  CreditCard, ExternalLink, Loader2, CheckCircle2, AlertTriangle,
  XCircle, Clock, Crown, Users, Sparkles, Shield,
} from 'lucide-react'
import { Button, Card, CardHeader, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_COLORS,
  PLAN_INTERVAL_LABELS,
  MODULE_GROUPS,
} from '@saas/types'

interface Plan {
  id: string
  name: string
  description: string | null
  stripePriceId: string
  interval: string
  price: number
  features: string[]
  maxUsers: number
  isActive: boolean
  modules: string[]
  highlight: boolean
}

interface Subscription {
  id: string
  status: string
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  plan: Plan
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  ACTIVE: CheckCircle2,
  PAST_DUE: AlertTriangle,
  CANCELED: XCircle,
  TRIALING: Clock,
  INCOMPLETE: AlertTriangle,
}

export default function AssinaturaPage() {
  const searchParams = useSearchParams()
  const [plans, setPlans] = useState<Plan[]>([])
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [intervalo, setIntervalo] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY')

  useEffect(() => {
    loadData()

    // Feedback do checkout
    const status = searchParams.get('status')
    if (status === 'success') {
      alerts.success('Assinatura realizada com sucesso!')
    } else if (status === 'cancel') {
      alerts.error('Checkout cancelado.')
    }
  }, [searchParams])

  async function loadData() {
    setLoading(true)
    try {
      const [plansData, subData] = await Promise.all([
        trpc.billing.plans.query(),
        trpc.billing.currentSubscription.query(),
      ])
      const loadedPlans = (plansData as Plan[]) || []
      setPlans(loadedPlans)
      setSubscription((subData as Subscription) || null)
      // Default: prefere MONTHLY; se nao houver, cai pra YEARLY se existir
      const hasMonthly = loadedPlans.some((p) => p.interval === 'MONTHLY')
      const hasYearly = loadedPlans.some((p) => p.interval === 'YEARLY')
      if (!hasMonthly && hasYearly) setIntervalo('YEARLY')
    } catch {
      // Silencioso — pode nao ter tenant ainda
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckout(stripePriceId: string) {
    setActionLoading(stripePriceId)
    try {
      const result = await trpc.billing.createCheckoutSession.mutate({ stripePriceId })
      window.location.href = result.url
    } catch (err: any) {
      alerts.error(err.message || 'Erro ao iniciar checkout')
    } finally {
      setActionLoading(null)
    }
  }

  async function handlePortal() {
    setActionLoading('portal')
    try {
      const result = await trpc.billing.createPortalSession.mutate()
      window.location.href = result.url
    } catch (err: any) {
      alerts.error(err.message || 'Erro ao abrir portal de pagamento')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCancel() {
    const confirmed = await alerts.confirm({
      title: 'Cancelar assinatura',
      text: 'Sua assinatura continuara ativa ate o final do periodo atual. Deseja continuar?',
      confirmText: 'Cancelar assinatura',
    })
    if (!confirmed) return

    setActionLoading('cancel')
    try {
      await trpc.billing.cancelSubscription.mutate()
      alerts.success('Assinatura sera cancelada ao final do periodo.')
      await loadData()
    } catch (err: any) {
      alerts.error(err.message || 'Erro ao cancelar')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReactivate() {
    setActionLoading('reactivate')
    try {
      await trpc.billing.reactivateSubscription.mutate()
      alerts.success('Assinatura reativada!')
      await loadData()
    } catch (err: any) {
      alerts.error(err.message || 'Erro ao reativar')
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasActiveSubscription = subscription && ['ACTIVE', 'TRIALING'].includes(subscription.status)
  const bloqueado = searchParams.get('bloqueado') === '1'

  return (
    <div className="space-y-6">
      {/* Aviso de trial expirado / acesso bloqueado */}
      {bloqueado && !hasActiveSubscription && (
        <div className="flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Seu período de teste terminou</p>
            <p className="mt-0.5 text-rose-600/90 dark:text-rose-300/80">
              Escolha um plano abaixo para reativar o acesso ao sistema. Seus dados continuam salvos.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Assinatura</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seu plano e pagamentos
          </p>
        </div>
        {subscription && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={handlePortal}
            disabled={actionLoading === 'portal'}
          >
            {actionLoading === 'portal' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Portal de Pagamento
          </Button>
        )}
      </div>

      {/* Status atual da assinatura */}
      {subscription && (
        <Card>
          <CardHeader>
            <h3 className="text-[14px] font-semibold text-foreground">Assinatura Atual</h3>
          </CardHeader>
          <div className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-4">
                {/* Plano */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
                    <Crown className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{subscription.plan.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(subscription.plan.price)}/{PLAN_INTERVAL_LABELS[subscription.plan.interval] || subscription.plan.interval}
                    </p>
                  </div>
                </div>

                {/* Status */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const Icon = STATUS_ICONS[subscription.status] || AlertTriangle
                    const color = SUBSCRIPTION_STATUS_COLORS[subscription.status as keyof typeof SUBSCRIPTION_STATUS_COLORS] || '#6b7280'
                    return (
                      <>
                        <Icon className="h-4 w-4" style={{ color }} />
                        <span
                          className="text-sm font-medium px-2.5 py-0.5 rounded-full"
                          style={{ backgroundColor: `${color}15`, color }}
                        >
                          {SUBSCRIPTION_STATUS_LABELS[subscription.status as keyof typeof SUBSCRIPTION_STATUS_LABELS] || subscription.status}
                        </span>
                      </>
                    )
                  })()}
                  {subscription.cancelAtPeriodEnd && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      Cancela em {formatDate(subscription.currentPeriodEnd)}
                    </span>
                  )}
                </div>

                {/* Periodo */}
                <div className="text-sm text-muted-foreground">
                  Periodo atual: {formatDate(subscription.currentPeriodStart)} a {formatDate(subscription.currentPeriodEnd)}
                </div>
              </div>

              {/* Acoes */}
              <div className="flex flex-col gap-2">
                {subscription.cancelAtPeriodEnd ? (
                  <Button
                    size="sm"
                    onClick={handleReactivate}
                    disabled={actionLoading === 'reactivate'}
                  >
                    {actionLoading === 'reactivate' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Reativar
                  </Button>
                ) : hasActiveSubscription ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={handleCancel}
                    disabled={actionLoading === 'cancel'}
                  >
                    {actionLoading === 'cancel' ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Cancelar assinatura
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Planos e Precos */}
      {plans.length > 0 && (
        <div className="space-y-8 pt-2">
          {/* Cabecalho centralizado */}
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-foreground">Planos e Preços</h2>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto">
              {hasActiveSubscription
                ? 'Escolha o plano ideal para o seu escritório. Faça upgrade ou downgrade a qualquer momento.'
                : 'Escolha o plano ideal para o seu escritório e tenha acesso a todos os recursos.'}
            </p>
          </div>

          {/* Toggle Mensal / Anual */}
          <div className="flex justify-center">
            <div className="inline-flex items-center rounded-full border border-border bg-muted/40 p-1">
              {(['MONTHLY', 'YEARLY'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setIntervalo(opt)}
                  className={cn(
                    'rounded-full px-5 py-1.5 text-sm font-medium transition-colors',
                    intervalo === opt
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {opt === 'MONTHLY' ? 'Mensal' : 'Anual'}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const visiblePlans = plans.filter((p) => p.interval === intervalo)

            if (visiblePlans.length === 0) {
              return (
                <p className="text-center text-sm text-muted-foreground">
                  Nenhum plano {intervalo === 'YEARLY' ? 'anual' : 'mensal'} disponível.
                </p>
              )
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 items-stretch">
                {visiblePlans.map((plan) => {
                  const isCurrentPlan = subscription?.plan?.id === plan.id
                  const planModules = Array.isArray(plan.modules) ? plan.modules : []

                  return (
                    <div
                      key={plan.id}
                      className={cn(
                        'relative flex flex-col rounded-xl border bg-card p-6 transition-all hover:shadow-md',
                        plan.highlight
                          ? 'border-primary/40 ring-2 ring-primary/40 shadow-lg md:-translate-y-1'
                          : 'border-border',
                      )}
                    >
                      {/* Selo Popular */}
                      {plan.highlight && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm">
                          <Sparkles className="h-3 w-3" />
                          Popular
                        </div>
                      )}

                      {/* Nome e descricao */}
                      <div className="space-y-1">
                        <h3 className="text-lg font-semibold text-foreground">{plan.name}</h3>
                        {plan.description && (
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        )}
                      </div>

                      {/* Preco */}
                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-foreground">
                          {formatCurrency(plan.price)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {plan.interval === 'YEARLY' ? '/ano' : '/mês'}
                        </span>
                      </div>

                      {/* Usuarios */}
                      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4 shrink-0" />
                        Até {plan.maxUsers} usuários
                      </div>

                      {/* Features = grupos de modulos */}
                      <ul className="mt-4 space-y-2.5 border-t border-border pt-4">
                        {Object.entries(MODULE_GROUPS)
                          .filter(([group]) => group !== 'Configurações')
                          .map(([group, slugs]) => {
                            const included = (slugs as readonly string[]).some((s) =>
                              planModules.includes(s),
                            )
                            return (
                              <li key={group} className="flex items-center gap-2 text-sm">
                                {included ? (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                                ) : (
                                  <XCircle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                                )}
                                <span
                                  className={cn(
                                    included
                                      ? 'text-foreground'
                                      : 'text-muted-foreground/50 line-through',
                                  )}
                                >
                                  {group}
                                </span>
                              </li>
                            )
                          })}
                      </ul>

                      {/* CTA */}
                      <Button
                        className="w-full mt-6"
                        variant={isCurrentPlan ? 'outline' : 'default'}
                        disabled={isCurrentPlan || !!actionLoading}
                        onClick={() => handleCheckout(plan.stripePriceId)}
                      >
                        {actionLoading === plan.stripePriceId ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : isCurrentPlan ? (
                          <Shield className="h-4 w-4 mr-2" />
                        ) : (
                          <CreditCard className="h-4 w-4 mr-2" />
                        )}
                        {isCurrentPlan
                          ? 'Plano atual'
                          : hasActiveSubscription
                            ? 'Mudar plano'
                            : 'Assinar'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      )}

      {/* Sem planos */}
      {plans.length === 0 && !subscription && (
        <Card>
          <div className="p-12 text-center">
            <CreditCard className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">Nenhum plano disponivel</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Os planos de assinatura ainda nao foram configurados.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
