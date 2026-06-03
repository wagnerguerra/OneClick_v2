'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button, Input, Label } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface AiConfig {
  enabled: boolean
  capUsdMensal: number | string
  minCharsDescricao: number
  maxCharsDescricao: number
  gastoUsdMesAtual: number
}

/**
 * Seção de configuração da Triagem IA do Helpdesk. Reusada em:
 *  - /configuracoes/helpdesk-ia (página dedicada)
 *  - tab "Triagem IA" dentro da pill Helpdesk em /configuracoes
 *
 * Restrita ao master (router valida) — checagem visual no contêiner pai.
 */
export function HelpdeskIaSection() {
  const [cfg, setCfg] = useState<AiConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  if (loading || !cfg) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
      </div>
    )
  }

  const cap = Number(cfg.capUsdMensal)
  const pct = cap > 0 ? Math.min(100, (cfg.gastoUsdMesAtual / cap) * 100) : 0
  const cor = pct < 60 ? 'bg-emerald-500' : pct < 90 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end -mt-1">
        <Button variant="success" size="sm" onClick={salvar} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {/* Consumo do mês */}
      <section className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-[13px] font-semibold">Consumo do mês</Label>
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
      </section>

      {/* Switch on/off */}
      <section className="flex items-center justify-between pt-3 border-t">
        <div>
          <Label className="text-[13px] font-semibold">Triagem IA ativa</Label>
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
      </section>

      {/* Cap mensal */}
      <section className="space-y-1.5 pt-3 border-t">
        <Label className="text-[13px] font-semibold">Limite mensal de gasto (USD)</Label>
        <div className="flex items-center gap-2 max-w-xs">
          <span className="text-sm text-muted-foreground">US$</span>
          <Input
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
      </section>

      {/* Min/max chars */}
      <section className="grid grid-cols-2 gap-4 pt-3 border-t">
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Tamanho mínimo da descrição</Label>
          <div className="flex items-center gap-2">
            <Input
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
          <Label className="text-[13px] font-semibold">Tamanho máximo da descrição</Label>
          <div className="flex items-center gap-2">
            <Input
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
      </section>

      {/* Regras automáticas */}
      <section className="pt-3 border-t">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Regras automáticas (sempre ativas)</p>
        <ul className="text-[12px] text-muted-foreground space-y-1">
          <li>• Tickets do tipo <strong>MELHORIA</strong> são pulados (humano avalia roadmap)</li>
          <li>• Tickets já processados não são reprocessados (idempotente)</li>
          <li>• Tickets já fora do status &quot;Novo&quot; também não são processados</li>
        </ul>
      </section>
    </div>
  )
}
