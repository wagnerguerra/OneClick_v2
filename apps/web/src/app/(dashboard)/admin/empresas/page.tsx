'use client'

/**
 * Gestão GLOBAL de tenants (master da plataforma). Lista todas as empresas/
 * tenants com estado de trial/assinatura e permite estender trial, suspender
 * e reativar. Separada do módulo /empresas (tabela interna de cada tenant).
 */

import { useState, useEffect, useCallback } from 'react'
import { Building2, MoreVertical, Clock, Lock, Loader2, CalendarPlus, Ban, RotateCcw, Users } from 'lucide-react'
import {
  Button, Card, CardContent, Input, Badge, cn,
  Dialog, DialogContent, DialogTitle, DialogFooter, DialogBody,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'

const MODULE_COLOR = 'var(--mod-configuracoes, #f97316)'

type TenantState = 'ACTIVE' | 'TRIAL' | 'TRIAL_EXPIRED' | 'SUSPENDED'

interface TenantRow {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string
  trialEndsAt: string | null
  daysRemaining: number | null
  userCount: number
  subscriptionStatus: string | null
  planName: string | null
  state: TenantState
}

const STATE_META: Record<TenantState, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ativo', cls: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  TRIAL: { label: 'Trial', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  TRIAL_EXPIRED: { label: 'Trial expirado', cls: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' },
  SUSPENDED: { label: 'Suspenso', cls: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20' },
}

export default function AdminEmpresasPage() {
  const { profile, loading: loadingProfile } = useCurrentUserProfile()
  const [rows, setRows] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [extendTarget, setExtendTarget] = useState<TenantRow | null>(null)
  const [extendDias, setExtendDias] = useState(7)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc.adminTenant as any).list.query()
      setRows(data as TenantRow[])
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao carregar tenants')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleExtend() {
    if (!extendTarget) return
    setSaving(true)
    try {
      await (trpc.adminTenant as any).extendTrial.mutate({ tenantId: extendTarget.id, dias: extendDias })
      alerts.success(`Trial de "${extendTarget.name}" estendido em ${extendDias} dia(s).`)
      setExtendTarget(null)
      await load()
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao estender trial')
    } finally {
      setSaving(false)
    }
  }

  async function handleSuspend(t: TenantRow) {
    const ok = await alerts.confirm({
      title: 'Suspender tenant',
      text: `"${t.name}" perderá o acesso ao sistema até ser reativado. Continuar?`,
      confirmText: 'Suspender',
    })
    if (!ok) return
    try {
      await (trpc.adminTenant as any).suspend.mutate({ tenantId: t.id })
      alerts.success('Tenant suspenso.')
      await load()
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao suspender')
    }
  }

  async function handleReactivate(t: TenantRow) {
    try {
      await (trpc.adminTenant as any).reactivate.mutate({ tenantId: t.id })
      alerts.success('Tenant reativado.')
      await load()
    } catch (err: any) {
      alerts.error(err?.message || 'Erro ao reativar')
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

  const filtered = rows.filter((r) =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.slug.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Header inline (padrão de módulo) */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1>Empresas (tenants)</h1>
            <p className="text-sm text-muted-foreground">Gestão de assinaturas e períodos de teste da plataforma</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Input
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56 text-sm"
          />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Empresa</th>
                <th className="w-32 px-4 py-2.5 text-left">Estado</th>
                <th className="hidden w-28 px-4 py-2.5 text-left md:table-cell">Trial / Plano</th>
                <th className="hidden w-24 px-4 py-2.5 text-left lg:table-cell">Usuários</th>
                <th className="hidden w-28 px-4 py-2.5 text-left lg:table-cell">Criado em</th>
                <th className="w-12 px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-muted-foreground">Nenhum tenant encontrado.</td></tr>
              ) : (
                filtered.map((t) => {
                  const meta = STATE_META[t.state]
                  return (
                    <tr key={t.id} className="border-b border-border/60 hover:bg-muted/20">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground truncate">{t.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{t.slug}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className={cn('font-medium', meta.cls)}>{meta.label}</Badge>
                      </td>
                      <td className="hidden px-4 py-2.5 md:table-cell">
                        {t.planName ? (
                          <span className="text-foreground">{t.planName}</span>
                        ) : t.state === 'TRIAL' && t.daysRemaining != null ? (
                          <span className="flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" />{t.daysRemaining}d</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 lg:table-cell">
                        <span className="flex items-center gap-1 text-muted-foreground"><Users className="h-3.5 w-3.5" />{t.userCount}</span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">{formatDate(t.createdAt)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => { setExtendTarget(t); setExtendDias(7) }}>
                              <CalendarPlus className="mr-2 h-4 w-4" /> Estender trial
                            </DropdownMenuItem>
                            {t.status === 'SUSPENDED' ? (
                              <DropdownMenuItem onClick={() => handleReactivate(t)}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Reativar
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleSuspend(t)} className="text-rose-600">
                                <Ban className="mr-2 h-4 w-4" /> Suspender
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal estender trial */}
      <Dialog open={!!extendTarget} onOpenChange={(o) => !o && setExtendTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeaderIcon icon={CalendarPlus} color="amber">
            <DialogTitle>Estender período de teste</DialogTitle>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Adicionar dias ao trial de <strong className="text-foreground">{extendTarget?.name}</strong>.
              {extendTarget?.daysRemaining != null && extendTarget.state === 'TRIAL'
                ? ` Restam ${extendTarget.daysRemaining} dia(s) — os novos somam ao fim atual.`
                : ' O trial será contado a partir de hoje.'}
            </p>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-foreground">Dias a adicionar</label>
              <Input
                type="number"
                min={1}
                max={365}
                value={extendDias}
                onChange={(e) => setExtendDias(Math.max(1, Number(e.target.value) || 1))}
                className="h-9 text-sm"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleExtend} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Estender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
