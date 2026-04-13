'use client'

import { useState, useEffect } from 'react'
import {
  CreditCard, Key, Webhook, FileText, Loader2, Save,
  Eye, EyeOff, X, CheckCircle2, XCircle, AlertTriangle,
  ExternalLink, Copy, Check, RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/* ── Sub-abas (pills laterais) ─────────────────────────── */

interface PillTab {
  key: string
  label: string
  icon: LucideIcon
}

const TABS: PillTab[] = [
  { key: 'chaves',   label: 'Chaves de API',      icon: Key },
  { key: 'webhooks', label: 'Webhooks',            icon: Webhook },
  { key: 'planos',   label: 'Produtos e Preços',   icon: CreditCard },
  { key: 'info',     label: 'Informações Gerais',  icon: FileText },
]

const MODULE_COLOR = '#f97316'

/* ── Tipos ─────────────────────────────────────────────── */

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
  createdAt: string
}

const WEBHOOK_EVENTS = [
  { event: 'customer.subscription.created',  description: 'Quando uma nova assinatura é criada' },
  { event: 'customer.subscription.updated',  description: 'Quando uma assinatura é atualizada' },
  { event: 'customer.subscription.deleted',  description: 'Quando uma assinatura é cancelada/expirada' },
  { event: 'invoice.payment_succeeded',      description: 'Quando um pagamento de fatura é confirmado' },
  { event: 'invoice.payment_failed',         description: 'Quando um pagamento de fatura falha' },
]

export default function StripeSettingsPage() {
  const [activeTab, setActiveTab] = useState('chaves')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Valores das chaves
  const [values, setValues] = useState<Record<string, string>>({
    STRIPE_SECRET_KEY: '',
    STRIPE_PUBLISHABLE_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
  })
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState<string | null>(null)

  // Planos
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  // Status de conexão
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [connectionMessage, setConnectionMessage] = useState('')

  useEffect(() => {
    loadConfigs()
  }, [])

  useEffect(() => {
    if (activeTab === 'planos') loadPlans()
  }, [activeTab])

  async function loadConfigs() {
    setLoading(true)
    try {
      const configs = await trpc.admin.getConfigs.query() as Array<{ key: string; value: string }>
      const v: Record<string, string> = { ...values }
      for (const c of configs) {
        if (c.key in v) v[c.key] = c.value
      }
      setValues(v)
    } catch {
      // silencioso
    } finally {
      setLoading(false)
    }
  }

  async function loadPlans() {
    setLoadingPlans(true)
    try {
      const data = await trpc.billing.plans.query() as Plan[]
      setPlans(data)
    } catch {
      // billing router pode não estar disponível — silencioso
      setPlans([])
    } finally {
      setLoadingPlans(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const items: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) {
        items[k] = v
      }
      const result = await trpc.admin.saveConfigs.mutate({ group: 'Stripe', items })
      await alerts.success('Configurações salvas', `${result.saved} campo(s) atualizado(s).`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  function handleClear(key: string) {
    setValues(prev => ({ ...prev, [key]: '__CLEAR__' }))
  }

  async function handleCopy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch { /* silencioso */ }
  }

  async function handleTestConnection() {
    setConnectionStatus('testing')
    setConnectionMessage('')
    try {
      const result = await trpc.admin.testStripe.mutate() as { ok: boolean; message: string; details?: string }
      if (result.ok) {
        setConnectionStatus('ok')
        setConnectionMessage(result.details ? `${result.message} — ${result.details}` : result.message)
      } else {
        setConnectionStatus('error')
        setConnectionMessage(result.message)
      }
    } catch (e) {
      setConnectionStatus('error')
      setConnectionMessage((e as Error).message || 'Não foi possível conectar ao Stripe.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Configurações do Stripe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie suas chaves de API, webhooks e planos do Stripe
          </p>
        </div>
      </div>

      {/* Card principal com pills */}
      <Card>
        <CardHeader>
          <h5 className="text-[14px] font-semibold text-foreground">Stripe — Pagamentos e Assinaturas</h5>
        </CardHeader>
        <div className="flex min-h-[500px]">
          {/* Pills laterais */}
          <div className="w-[200px] shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[#f8f9fa] dark:bg-[#1a1a2e] p-3 overflow-y-auto">
            <div className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={isActive ? { backgroundColor: MODULE_COLOR } : undefined}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      isActive
                        ? 'text-white shadow-sm'
                        : 'text-muted-foreground hover:bg-white dark:hover:bg-white/5',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Conteúdo */}
          <div key={activeTab} className="flex-1" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            {activeTab === 'chaves' && (
              <TabChaves
                values={values}
                setValues={setValues}
                showSecret={showSecret}
                setShowSecret={setShowSecret}
                copied={copied}
                onCopy={handleCopy}
                onClear={handleClear}
                onSave={handleSave}
                saving={saving}
                connectionStatus={connectionStatus}
                connectionMessage={connectionMessage}
                onTestConnection={handleTestConnection}
              />
            )}
            {activeTab === 'webhooks' && <TabWebhooks values={values} />}
            {activeTab === 'planos' && (
              <TabPlanos plans={plans} loading={loadingPlans} onRefresh={loadPlans} />
            )}
            {activeTab === 'info' && <TabInfo />}
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab: Chaves de API
   ═══════════════════════════════════════════════════════════ */

interface TabChavesProps {
  values: Record<string, string>
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  showSecret: Record<string, boolean>
  setShowSecret: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  copied: string | null
  onCopy: (text: string, key: string) => void
  onClear: (key: string) => void
  onSave: () => void
  saving: boolean
  connectionStatus: 'idle' | 'testing' | 'ok' | 'error'
  connectionMessage: string
  onTestConnection: () => void
}

const KEY_FIELDS = [
  {
    key: 'STRIPE_SECRET_KEY',
    label: 'Chave Secreta (Secret Key)',
    placeholder: 'sk_live_... ou sk_test_...',
    help: 'Chave secreta da API do Stripe. Encontrada em Developers → API keys.',
    secret: true,
  },
  {
    key: 'STRIPE_PUBLISHABLE_KEY',
    label: 'Chave Publicável (Publishable Key)',
    placeholder: 'pk_live_... ou pk_test_...',
    help: 'Chave pública do Stripe, usada no frontend para Stripe Elements.',
    secret: false,
  },
  {
    key: 'STRIPE_WEBHOOK_SECRET',
    label: 'Segredo do Webhook (Webhook Secret)',
    placeholder: 'whsec_...',
    help: 'Segredo para verificação de assinatura dos webhooks. Encontrado em Developers → Webhooks → Signing secret.',
    secret: true,
  },
]

function TabChaves({
  values, setValues, showSecret, setShowSecret,
  copied, onCopy, onClear, onSave, saving,
  connectionStatus, connectionMessage, onTestConnection,
}: TabChavesProps) {
  return (
    <div>
      {/* Título interno */}
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <h4 className="text-[13px] font-semibold text-foreground">Chaves de API do Stripe</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Configure as chaves de acesso à API do Stripe para habilitar pagamentos e assinaturas.
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Ambiente */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Certifique-se de usar as chaves corretas para o ambiente desejado.
            Chaves com prefixo <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">sk_test_</code> são
            de teste; <code className="font-mono bg-amber-100 dark:bg-amber-900/30 px-1 rounded">sk_live_</code> são de produção.
          </p>
        </div>

        {/* Campos */}
        <div className="grid grid-cols-12 gap-4">
          {KEY_FIELDS.map((field) => {
            const val = values[field.key] || ''
            const isCleared = val === '__CLEAR__'
            const isSecret = field.secret
            const isVisible = showSecret[field.key]

            return (
              <div key={field.key} className="col-span-12">
                <Label className="text-xs font-medium text-foreground mb-1.5 block">
                  {field.label}
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isSecret && !isVisible ? 'password' : 'text'}
                      value={isCleared ? '' : val}
                      onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="pr-20 font-mono text-xs"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      {isSecret && (
                        <button
                          type="button"
                          onClick={() => setShowSecret(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                          title={isVisible ? 'Ocultar' : 'Mostrar'}
                        >
                          {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {val && !isCleared && (
                        <button
                          type="button"
                          onClick={() => onCopy(val, field.key)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                          title="Copiar"
                        >
                          {copied === field.key
                            ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {val && (
                        <button
                          type="button"
                          onClick={() => onClear(field.key)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground"
                          title="Limpar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {field.help && (
                  <p className="text-[11px] text-muted-foreground mt-1">{field.help}</p>
                )}
              </div>
            )
          })}
        </div>

        {/* Teste de conexão */}
        {connectionStatus !== 'idle' && (
          <div className={cn(
            'flex items-center gap-2 p-3 rounded-lg border text-xs',
            connectionStatus === 'ok' && 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400',
            connectionStatus === 'error' && 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400',
            connectionStatus === 'testing' && 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-400',
          )}>
            {connectionStatus === 'testing' && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            {connectionStatus === 'ok' && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {connectionStatus === 'error' && <XCircle className="h-4 w-4 shrink-0" />}
            <span>{connectionStatus === 'testing' ? 'Testando conexão...' : connectionMessage}</span>
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center gap-3 pt-2 border-t border-[rgba(0,0,0,0.08)]">
          <Button onClick={onSave} disabled={saving} className="gap-2" variant="success">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Chaves
          </Button>
          <Button
            variant="outline"
            onClick={onTestConnection}
            disabled={connectionStatus === 'testing'}
            className="gap-2"
          >
            {connectionStatus === 'testing'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
            Testar Conexão
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab: Webhooks
   ═══════════════════════════════════════════════════════════ */

function TabWebhooks({ values }: { values: Record<string, string> }) {
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/stripe/webhook`
    : '/api/stripe/webhook'
  const [copied, setCopied] = useState(false)

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silencioso */ }
  }

  const hasWebhookSecret = !!values.STRIPE_WEBHOOK_SECRET && values.STRIPE_WEBHOOK_SECRET !== '__CLEAR__'

  return (
    <div>
      {/* Título interno */}
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <h4 className="text-[13px] font-semibold text-foreground">Configuração de Webhooks</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Configure os webhooks do Stripe para receber notificações de eventos de pagamento em tempo real.
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* URL do Endpoint */}
        <div>
          <Label className="text-xs font-medium text-foreground mb-1.5 block">
            URL do Endpoint (Webhook)
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded border border-[#ced4da] bg-muted/30 font-mono text-xs text-foreground">
              <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{webhookUrl}</span>
            </div>
            <Button variant="outline" size="sm" onClick={copyUrl} className="gap-1.5 shrink-0">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado!' : 'Copiar'}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            Use esta URL no painel do Stripe em <strong>Developers → Webhooks → Add endpoint</strong>.
          </p>
        </div>

        {/* Status do Webhook Secret */}
        <div className={cn(
          'flex items-center gap-2 p-3 rounded-lg border text-xs',
          hasWebhookSecret
            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400'
            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400',
        )}>
          {hasWebhookSecret
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            {hasWebhookSecret
              ? 'Webhook Secret configurado. Os eventos serão verificados automaticamente.'
              : 'Webhook Secret não configurado. Vá na aba "Chaves de API" para adicionar o STRIPE_WEBHOOK_SECRET.'}
          </span>
        </div>

        {/* Eventos monitorados */}
        <div>
          <div className="-mx-5 px-5 py-3 border-t border-[rgba(0,0,0,0.08)]">
            <h4 className="text-[13px] font-semibold text-foreground">Eventos Monitorados</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Selecione estes eventos ao configurar o webhook no painel do Stripe.
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {WEBHOOK_EVENTS.map((item) => (
              <div
                key={item.event}
                className="flex items-center justify-between p-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-muted/20"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded bg-violet-100 dark:bg-violet-900/30">
                    <Webhook className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-xs font-mono font-medium text-foreground">{item.event}</p>
                    <p className="text-[11px] text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Link para o dashboard */}
        <div className="pt-3 border-t border-[rgba(0,0,0,0.08)]">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.open('https://dashboard.stripe.com/webhooks', '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
            Abrir Webhooks no Stripe Dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab: Produtos e Preços
   ═══════════════════════════════════════════════════════════ */

const INTERVAL_LABELS: Record<string, string> = {
  MONTHLY: 'Mensal',
  YEARLY: 'Anual',
}

function TabPlanos({ plans, loading, onRefresh }: { plans: Plan[]; loading: boolean; onRefresh: () => void }) {
  return (
    <div>
      {/* Título interno */}
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
        <div>
          <h4 className="text-[13px] font-semibold text-foreground">Produtos e Preços Cadastrados</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Planos sincronizados com o Stripe e registrados no banco de dados local.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => window.open('https://dashboard.stripe.com/products', '_blank')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Stripe Dashboard
          </Button>
        </div>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Nenhum plano cadastrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Crie produtos e preços no Stripe Dashboard e registre-os no sistema.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => {
              const features = Array.isArray(plan.features) ? plan.features : []
              return (
                <div
                  key={plan.id}
                  className={cn(
                    'p-4 rounded-lg border transition-all',
                    plan.isActive
                      ? 'border-[rgba(0,0,0,0.08)] bg-white dark:bg-white/5'
                      : 'border-dashed border-muted-foreground/20 bg-muted/10 opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h5 className="text-sm font-semibold text-foreground">{plan.name}</h5>
                        <span className={cn(
                          'text-[10px] font-medium px-2 py-0.5 rounded-full',
                          plan.isActive
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500',
                        )}>
                          {plan.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground">{plan.description}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-foreground">
                        {formatCurrency(plan.price)}
                        <span className="text-xs font-normal text-muted-foreground">
                          /{INTERVAL_LABELS[plan.interval] || plan.interval}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Até {plan.maxUsers} usuários
                      </p>
                    </div>
                  </div>

                  {/* Detalhes técnicos */}
                  <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.06)] grid grid-cols-12 gap-3">
                    <div className="col-span-6">
                      <p className="text-[11px] text-muted-foreground">Stripe Price ID</p>
                      <p className="text-xs font-mono text-foreground truncate">{plan.stripePriceId}</p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-[11px] text-muted-foreground">ID Interno</p>
                      <p className="text-xs font-mono text-foreground truncate">{plan.id}</p>
                    </div>
                    <div className="col-span-3">
                      <p className="text-[11px] text-muted-foreground">Funcionalidades</p>
                      <p className="text-xs text-foreground">{features.length} item(ns)</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Tab: Informações Gerais
   ═══════════════════════════════════════════════════════════ */

function TabInfo() {
  const infoItems = [
    {
      label: 'Documentação da API',
      description: 'Referência completa da API do Stripe',
      url: 'https://stripe.com/docs/api',
    },
    {
      label: 'Stripe Dashboard',
      description: 'Painel de controle do Stripe',
      url: 'https://dashboard.stripe.com',
    },
    {
      label: 'Teste de Webhooks (CLI)',
      description: 'Ferramenta para testar webhooks localmente',
      url: 'https://stripe.com/docs/stripe-cli',
    },
    {
      label: 'Guia de Checkout Sessions',
      description: 'Como configurar sessões de checkout',
      url: 'https://stripe.com/docs/payments/checkout',
    },
    {
      label: 'Customer Portal',
      description: 'Portal de autoatendimento para clientes',
      url: 'https://stripe.com/docs/billing/subscriptions/integrating-customer-portal',
    },
  ]

  return (
    <div>
      {/* Título interno */}
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <h4 className="text-[13px] font-semibold text-foreground">Informações e Links Úteis</h4>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Referências rápidas para configuração e gerenciamento do Stripe.
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Resumo do fluxo */}
        <div>
          <h5 className="text-xs font-semibold text-foreground mb-3">Fluxo de Pagamento</h5>
          <div className="space-y-2">
            {[
              { step: '1', label: 'Tenant acessa a página de Assinatura' },
              { step: '2', label: 'Seleciona um plano e é redirecionado ao Stripe Checkout' },
              { step: '3', label: 'Após pagamento, Stripe envia webhook de confirmação' },
              { step: '4', label: 'Sistema ativa a assinatura e libera acesso ao tenant' },
              { step: '5', label: 'Renovações e cobranças são automáticas via Stripe Billing' },
            ].map((item) => (
              <div key={item.step} className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center h-6 w-6 rounded-full text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: MODULE_COLOR }}
                >
                  {item.step}
                </div>
                <p className="text-xs text-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Links */}
        <div className="-mx-5 px-5 py-3 border-t border-[rgba(0,0,0,0.08)]">
          <h5 className="text-xs font-semibold text-foreground">Links Úteis</h5>
        </div>

        <div className="space-y-2">
          {infoItems.map((item) => (
            <a
              key={item.label}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3 rounded-lg border border-[rgba(0,0,0,0.08)] hover:bg-muted/30 transition-colors group"
            >
              <div>
                <p className="text-xs font-medium text-foreground group-hover:text-[#f97316] transition-colors">
                  {item.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{item.description}</p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-[#f97316] shrink-0 transition-colors" />
            </a>
          ))}
        </div>

        {/* Nota sobre ambiente */}
        <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
          <h5 className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">Dica: Teste local de webhooks</h5>
          <p className="text-[11px] text-blue-700 dark:text-blue-400 leading-relaxed">
            Para testar webhooks localmente, use o Stripe CLI:{' '}
            <code className="font-mono bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded text-[10px]">
              stripe listen --forward-to localhost:4000/api/stripe/webhook
            </code>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────── */

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}
