'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Loader2, Save } from 'lucide-react'
import { Button, Card, Input } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { alerts } from '@/lib/alerts'

interface AiConfig {
  enabled: boolean
  capUsdMensal: number | string // Decimal vem como string do Prisma
  minCharsDescricao: number
  maxCharsDescricao: number
  gastoUsdMesAtual: number
}

export default function HelpdeskAiConfigPage() {
  const router = useRouter()
  const { profile, loading: loadingProfile } = useCurrentUserProfile()
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loadingProfile && profile && !profile.isMaster) router.replace('/configuracoes')
  }, [loadingProfile, profile, router])

  useEffect(() => {
    let cancelled = false
    ;(trpc.helpdesk as any).aiConfigGet.query()
      .then((r: AiConfig) => { if (!cancelled) setCfg(r) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  async function salvar() {
    if (!cfg) return
    setSaving(true)
    try {
      await (trpc.helpdesk as any).aiConfigUpdate.mutate({
        enabled: cfg.enabled,
        capUsdMensal: Number(cfg.capUsdMensal),
        minCharsDescricao: cfg.minCharsDescricao,
        maxCharsDescricao: cfg.maxCharsDescricao,
      })
      alerts.success('Salvo', 'Configuração da IA atualizada.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loadingProfile || loading || !cfg) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const cap = Number(cfg.capUsdMensal)
  const pct = cap > 0 ? Math.min(100, (cfg.gastoUsdMesAtual / cap) * 100) : 0
  const cor = pct < 60 ? 'bg-emerald-500' : pct < 90 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="configuracoes" icon={Bot} />
          <div>
            <h1>Triagem IA — Helpdesk</h1>
            <p className="text-sm text-muted-foreground">
              Comportamento do agente Claude que faz triagem automática dos tickets recém-criados.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BackButton href="/configuracoes" label="Voltar" />
        </div>
      </div>

      <Card className="p-5 space-y-5">
        {/* Consumo do mês */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div>
              <p className="text-[13px] font-semibold">Consumo do mês</p>
              <p className="text-[11px] text-muted-foreground">Soma dos custos das triagens executadas neste mês corrente</p>
            </div>
            <p className="text-sm font-mono tabular-nums">
              US$ {cfg.gastoUsdMesAtual.toFixed(4)} {cap > 0 && <span className="text-muted-foreground">/ US$ {cap.toFixed(2)}</span>}
            </p>
          </div>
          {cap > 0 && (
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${cor} transition-all`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        {/* Switch on/off */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div>
            <p className="text-[13px] font-semibold">Triagem IA ativa</p>
            <p className="text-[11px] text-muted-foreground">
              Desligue pra pausar imediatamente — tickets novos vão direto pra coluna &quot;Novo&quot; sem passar pela IA.
            </p>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.enabled}
              onChange={e => setCfg({ ...cfg, enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted-foreground/30 peer-checked:bg-emerald-500 rounded-full peer-checked:after:translate-x-full after:content-[''] after:absolute after:bg-white after:rounded-full after:h-5 after:w-5 after:top-0.5 after:left-0.5 after:transition-all relative" />
          </label>
        </div>

        {/* Cap mensal */}
        <div className="space-y-1.5 pt-3 border-t border-border">
          <label htmlFor="cap" className="text-[13px] font-semibold">Limite mensal de gasto (USD)</label>
          <div className="flex items-center gap-2 max-w-xs">
            <span className="text-sm text-muted-foreground">US$</span>
            <Input
              id="cap"
              type="number"
              min={0}
              max={10000}
              step={0.01}
              value={cfg.capUsdMensal}
              onChange={e => setCfg({ ...cfg, capUsdMensal: e.target.value })}
              className="h-9 text-sm w-32"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Quando a soma dos custos do mês ultrapassar este valor, a triagem é pausada até o início do próximo mês. Use <strong>0</strong> pra desativar o limite (não recomendado).
          </p>
        </div>

        {/* Min/max chars */}
        <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
          <div className="space-y-1.5">
            <label htmlFor="min" className="text-[13px] font-semibold">Tamanho mínimo da descrição</label>
            <div className="flex items-center gap-2">
              <Input
                id="min"
                type="number"
                min={0}
                max={1000}
                value={cfg.minCharsDescricao}
                onChange={e => setCfg({ ...cfg, minCharsDescricao: Number(e.target.value) })}
                className="h-9 text-sm w-24"
              />
              <span className="text-sm text-muted-foreground">caracteres</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Descrições menores são puladas (provável lixo).</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="max" className="text-[13px] font-semibold">Tamanho máximo da descrição</label>
            <div className="flex items-center gap-2">
              <Input
                id="max"
                type="number"
                min={100}
                max={100000}
                value={cfg.maxCharsDescricao}
                onChange={e => setCfg({ ...cfg, maxCharsDescricao: Number(e.target.value) })}
                className="h-9 text-sm w-28"
              />
              <span className="text-sm text-muted-foreground">caracteres</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Descrições maiores são puladas (custo alto + exige humano).</p>
          </div>
        </div>

        {/* Regras automáticas (fixas — só pra deixar claro pro master) */}
        <div className="pt-3 border-t border-border">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Regras automáticas (sempre ativas)</p>
          <ul className="text-[12px] text-muted-foreground space-y-1">
            <li>• Tickets do tipo <strong>MELHORIA</strong> são pulados (humano avalia roadmap)</li>
            <li>• Tickets já processados não são reprocessados (idempotente)</li>
            <li>• Tickets já fora do status &quot;Novo&quot; também não são processados</li>
          </ul>
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-border">
          <Button onClick={salvar} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
        </div>
      </Card>
    </div>
  )
}
