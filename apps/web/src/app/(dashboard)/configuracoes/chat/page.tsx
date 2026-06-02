'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Loader2, Save } from 'lucide-react'
import { Button, Card, Input } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { alerts } from '@/lib/alerts'

export default function ChatConfigPage() {
  const router = useRouter()
  const { profile, loading: loadingProfile } = useCurrentUserProfile()
  const [ausenteAposMin, setAusenteAposMin] = useState<number>(5)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Redireciona não-master pra /configuracoes — só master pode mexer aqui.
    if (!loadingProfile && profile && !profile.isMaster) {
      router.replace('/configuracoes')
    }
  }, [loadingProfile, profile, router])

  useEffect(() => {
    let cancelled = false
    ;(trpc.chat as any).configGet.query()
      .then((cfg: { ausenteAposMin: number }) => {
        if (cancelled) return
        setAusenteAposMin(cfg.ausenteAposMin)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await (trpc.chat as any).configUpdate.mutate({ ausenteAposMin })
      alerts.success('Salvo', 'Configuração do chat atualizada.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loadingProfile || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <BackButton href="/configuracoes" label="Voltar" />

      <div className="flex items-center gap-3">
        <PageHeaderIcon icon={MessageSquare} module="configuracoes" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Chat interno</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Comportamento global do chat. Edição restrita ao master.
          </p>
        </div>
      </div>

      <Card className="p-5 space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="ausenteAposMin" className="text-[13px] font-semibold">
            Tempo para ficar ausente
          </label>
          <div className="flex items-center gap-2 max-w-xs">
            <Input
              id="ausenteAposMin"
              type="number"
              min={1}
              max={120}
              value={ausenteAposMin}
              onChange={e => setAusenteAposMin(Math.max(1, Math.min(120, parseInt(e.target.value || '5', 10))))}
              className="h-9 text-sm w-24"
            />
            <span className="text-sm text-muted-foreground">minutos</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tempo em que um usuário online sem atividade no sistema (sem cliques/navegação)
            passa a aparecer como <strong>Ausente</strong>. Após esse tempo + um intervalo,
            cai para <strong>Offline</strong>.
          </p>
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-border">
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </Card>
    </div>
  )
}
