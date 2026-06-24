'use client'

/**
 * Gestão dinâmica de planos e preços (master da plataforma). Os valores aqui
 * alimentam a página pública de assinatura (/configuracoes/assinatura). O preço
 * é exibição (centavos); a cobrança real usa o stripePriceId do plano.
 * Também define os dias de trial de novos tenants.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Tag, Plus, Pencil, Lock, Loader2, Star, Save, Clock, CreditCard,
} from 'lucide-react'
import {
  Button, Card, CardContent, Input, Textarea, Switch, Badge, cn,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogBody,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-configuracoes, #f97316)'

interface Plan {
  id: string
  name: string
  description: string | null
  stripePriceId: string
  interval: 'MONTHLY' | 'YEARLY'
  price: number
  features: string[]
  maxUsers: number
  isActive: boolean
  highlight: boolean
  displayOrder: number
}

interface PlanForm {
  id?: string
  name: string
  description: string
  stripePriceId: string
  interval: 'MONTHLY' | 'YEARLY'
  precoReais: string
  featuresText: string
  maxUsers: number
  isActive: boolean
  highlight: boolean
  displayOrder: number
}

const EMPTY_FORM: PlanForm = {
  name: '', description: '', stripePriceId: '', interval: 'MONTHLY',
  precoReais: '', featuresText: '', maxUsers: 5, isActive: true, highlight: false, displayOrder: 0,
}

export default function AdminPlanosPage() {
  const { profile, loading: loadingProfile } = useCurrentUserProfile()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<PlanForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [trialDays, setTrialDays] = useState<number>(7)
  const [savingTrial, setSavingTrial] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [plansData, cfg] = await Promise.all([
        (trpc.billing as any).adminListPlans.query(),
        (trpc.billing as any).getBillingConfig.query(),
      ])
      setPlans(plansData as Plan[])
      setTrialDays((cfg as { trialDays: number })?.trialDays ?? 7)
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao carregar planos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() { setForm({ ...EMPTY_FORM }) }
  function openEdit(p: Plan) {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      stripePriceId: p.stripePriceId,
      interval: p.interval,
      precoReais: (p.price / 100).toFixed(2),
      featuresText: (p.features || []).join('\n'),
      maxUsers: p.maxUsers,
      isActive: p.isActive,
      highlight: p.highlight,
      displayOrder: p.displayOrder,
    })
  }

  async function handleSave() {
    if (!form) return
    const precoCentavos = Math.round((parseFloat(form.precoReais.replace(',', '.')) || 0) * 100)
    if (!form.name.trim()) { alerts.error('Informe o nome do plano.'); return }
    if (!form.stripePriceId.trim()) { alerts.error('Informe o stripePriceId (Price do Stripe usado no checkout).'); return }
    setSaving(true)
    try {
      await (trpc.billing as any).upsertPlan.mutate({
        id: form.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        stripePriceId: form.stripePriceId.trim(),
        interval: form.interval,
        price: precoCentavos,
        features: form.featuresText.split('\n').map((s) => s.trim()).filter(Boolean),
        maxUsers: form.maxUsers,
        isActive: form.isActive,
        highlight: form.highlight,
        displayOrder: form.displayOrder,
      })
      alerts.success(form.id ? 'Plano atualizado.' : 'Plano criado.')
      setForm(null)
      await load()
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao salvar plano')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(p: Plan) {
    try {
      await (trpc.billing as any).togglePlan.mutate({ id: p.id, isActive: !p.isActive })
      await load()
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao alterar status')
    }
  }

  async function handleSaveTrial() {
    setSavingTrial(true)
    try {
      await (trpc.billing as any).setBillingConfig.mutate({ trialDays })
      alerts.success('Dias de teste atualizados.')
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao salvar config')
    } finally {
      setSavingTrial(false)
    }
  }

  if (loadingProfile) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
  }
  if (!profile?.isMaster) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="p-8 text-center space-y-3">
          <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">Esta página é da plataforma — só master.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header inline */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <Tag className="h-6 w-6" />
          </div>
          <div>
            <h1>Planos e preços</h1>
            <p className="text-sm text-muted-foreground">Valores exibidos na página de assinatura</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo plano
          </Button>
        </div>
      </div>

      {/* Config global de trial */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              <Clock className="h-4 w-4" /> Período de teste grátis (novos cadastros)
            </label>
            <p className="text-xs text-muted-foreground">Dias de acesso liberado, sem cartão, ao criar uma nova empresa.</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(Math.max(0, Number(e.target.value) || 0))}
              className="h-9 w-24 text-sm"
            />
            <span className="text-sm text-muted-foreground">dias</span>
            <Button size="sm" onClick={handleSaveTrial} disabled={savingTrial}>
              {savingTrial ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de planos */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Plano</th>
                <th className="w-28 px-4 py-2.5 text-left">Preço</th>
                <th className="hidden w-24 px-4 py-2.5 text-left md:table-cell">Intervalo</th>
                <th className="hidden w-20 px-4 py-2.5 text-left lg:table-cell">Usuários</th>
                <th className="w-24 px-4 py-2.5 text-left">Ativo</th>
                <th className="w-12 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : plans.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Nenhum plano cadastrado. Crie o primeiro.</td></tr>
              ) : (
                plans.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 hover:bg-muted/20">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground truncate">{p.name}</span>
                        {p.highlight && <Badge variant="outline" className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"><Star className="mr-1 h-3 w-3" />Destaque</Badge>}
                      </div>
                      {p.description && <div className="text-xs text-muted-foreground truncate">{p.description}</div>}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{formatCurrency(p.price)}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">{p.interval === 'MONTHLY' ? 'Mensal' : 'Anual'}</td>
                    <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">{p.maxUsers}</td>
                    <td className="px-4 py-2.5"><Switch checked={p.isActive} onCheckedChange={() => handleToggle(p)} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="soft-info" size="icon-sm" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal criar/editar plano */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={form?.id ? Pencil : Plus} color={form?.id ? 'sky' : 'emerald'}>
            <DialogTitle>{form?.id ? 'Editar plano' : 'Novo plano'}</DialogTitle>
            <DialogDescription>O preço é exibição; a cobrança usa o stripePriceId.</DialogDescription>
          </DialogHeaderIcon>
          {form && (
            <DialogBody className="grid grid-cols-12 gap-3">
              <Field label="Nome" className="col-span-7">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-9 text-sm" />
              </Field>
              <Field label="Ordem" className="col-span-5">
                <Input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) || 0 })} className="h-9 text-sm" />
              </Field>
              <Field label="Descrição" className="col-span-12">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 text-sm" />
              </Field>
              <Field label="Preço (R$)" className="col-span-4">
                <Input value={form.precoReais} onChange={(e) => setForm({ ...form, precoReais: e.target.value })} placeholder="299,00" className="h-9 text-sm" />
              </Field>
              <Field label="Intervalo" className="col-span-4">
                <Select value={form.interval} onValueChange={(v) => setForm({ ...form, interval: v as 'MONTHLY' | 'YEARLY' })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Mensal</SelectItem>
                    <SelectItem value="YEARLY">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Máx. usuários" className="col-span-4">
                <Input type="number" min={1} value={form.maxUsers} onChange={(e) => setForm({ ...form, maxUsers: Math.max(1, Number(e.target.value) || 1) })} className="h-9 text-sm" />
              </Field>
              <Field label="stripePriceId (checkout)" className="col-span-12">
                <Input value={form.stripePriceId} onChange={(e) => setForm({ ...form, stripePriceId: e.target.value })} placeholder="price_..." className="h-9 font-mono text-sm" />
              </Field>
              <Field label="Features (uma por linha)" className="col-span-12">
                <Textarea value={form.featuresText} onChange={(e) => setForm({ ...form, featuresText: e.target.value })} rows={4} className="text-sm" placeholder={'Módulo CRM\nSuporte por e-mail\nRelatórios'} />
              </Field>
              <div className="col-span-12 flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch checked={form.highlight} onCheckedChange={(v) => setForm({ ...form, highlight: v })} /> Destaque
                </label>
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} /> Ativo
                </label>
              </div>
            </DialogBody>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              {form?.id ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-[13px] font-semibold text-foreground">{label}</label>
      {children}
    </div>
  )
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}
