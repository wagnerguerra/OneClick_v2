'use client'

import { useState } from 'react'
import {
  Loader2, X, Sparkles, Check, AlertTriangle, Database, Globe,
} from 'lucide-react'
import {
  Button, Card, Badge, Checkbox, Input, Label,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface ResultadoBulk {
  stats: {
    total: number
    atualizados: number
    semDados: number
    erros: number
    brasilapi: number
    serpro: number
  }
  detalhes: Array<{
    clienteId: string
    razao: string
    ok: boolean
    campos?: string[]
    motivo?: string
    fonte?: string
  }>
}

export function EnriquecerCnaeDialog({ open, onOpenChange, onAfterRun }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAfterRun: () => void
}) {
  const [apenasSemCnae, setApenasSemCnae] = useState(true)
  const [limite, setLimite] = useState<number>(50)
  const [running, setRunning] = useState(false)
  const [resultado, setResultado] = useState<ResultadoBulk | null>(null)

  async function executar() {
    setRunning(true)
    setResultado(null)
    try {
      const res = await (trpc as any).cliente.enriquecerCnaeBulk.mutate({ apenasSemCnae, limite })
      setResultado(res as ResultadoBulk)
      onAfterRun()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao executar enriquecimento.')
    } finally { setRunning(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col">
        <DialogHeaderIcon icon={Sparkles} color="orange">
          <DialogTitle>Enriquecer CNAE dos Clientes</DialogTitle>
          <DialogDescription className="text-xs">
            Busca o CNAE principal de cada cliente via BrasilAPI (gratuita) com fallback automático para SERPRO (paga).
            Atualiza o campo <code>cnaePrincipal</code> do cliente — usado pela recomendação automática de templates.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="flex-1 overflow-auto space-y-4">
          {!resultado && !running && (
            <Card className="p-4 space-y-3">
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox checked={apenasSemCnae} onCheckedChange={(v) => setApenasSemCnae(!!v)} className="mt-0.5" />
                  <div>
                    <span className="font-medium">Apenas clientes sem CNAE preenchido</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Recomendado. Desmarque pra forçar atualização de TODOS (sobrescreve CNAEs existentes).
                    </p>
                  </div>
                </label>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Limite por execução</Label>
                <Input
                  type="number" min={1} max={2000}
                  value={limite}
                  onChange={(e) => setLimite(Math.max(1, Math.min(2000, Number(e.target.value) || 50)))}
                  className="h-9 text-sm w-32 tabular-nums"
                />
                <p className="text-[11px] text-muted-foreground">
                  Cada chamada respeita 200ms entre clientes (≈5/s). 50 clientes ≈ 10s. Limite máximo: 2000.
                </p>
              </div>
              <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <strong>Sobre custos:</strong> a 1ª tentativa usa BrasilAPI (gratuita). SERPRO entra apenas
                    como fallback quando BrasilAPI falha (ex.: CNPJ inativo ou indisponível). Cada chamada SERPRO
                    consome créditos da sua conta.
                  </div>
                </div>
              </div>
            </Card>
          )}

          {running && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
              <p className="text-sm text-muted-foreground">Consultando CNPJs... pode levar alguns minutos.</p>
            </div>
          )}

          {resultado && (
            <>
              {/* Sumário */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Card className="p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">Processados</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.total}</div>
                </Card>
                <Card className="p-3 border-l-2 border-emerald-200">
                  <div className="text-[10px] uppercase text-emerald-700">Atualizados</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.atualizados}</div>
                </Card>
                <Card className="p-3 border-l-2 border-sky-200">
                  <div className="text-[10px] uppercase text-sky-700">Via BrasilAPI</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.brasilapi}</div>
                  <div className="text-[10px] text-muted-foreground">grátis</div>
                </Card>
                <Card className="p-3 border-l-2 border-violet-200">
                  <div className="text-[10px] uppercase text-violet-700">Via SERPRO</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.serpro}</div>
                  <div className="text-[10px] text-muted-foreground">fallback pago</div>
                </Card>
                <Card className="p-3 border-l-2 border-red-200">
                  <div className="text-[10px] uppercase text-red-700">Erros</div>
                  <div className="text-xl font-semibold tabular-nums">{resultado.stats.erros}</div>
                </Card>
              </div>

              {/* Detalhes — top 30 */}
              <Card>
                <div className="px-4 py-2 border-b text-xs font-semibold text-muted-foreground">
                  Detalhes (primeiros 30 de {resultado.detalhes.length})
                </div>
                <div className="max-h-[260px] overflow-y-auto divide-y">
                  {resultado.detalhes.slice(0, 30).map((d, i) => (
                    <div key={i} className="px-4 py-1.5 text-xs flex items-center gap-2">
                      {d.ok && d.campos ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : d.ok ? (
                        <span className="h-3.5 w-3.5 inline-block text-center text-muted-foreground shrink-0">—</span>
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span className="font-medium truncate flex-1">{d.razao}</span>
                      {d.fonte === 'brasilapi' && <Badge variant="outline" className="h-4 text-[9px] bg-sky-50 text-sky-700 border-sky-200">BrasilAPI</Badge>}
                      {d.fonte === 'serpro' && <Badge variant="outline" className="h-4 text-[9px] bg-violet-50 text-violet-700 border-violet-200">SERPRO</Badge>}
                      {d.motivo && <span className="text-muted-foreground italic truncate max-w-[200px]">{d.motivo}</span>}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </DialogBody>

        <DialogFooter>
          {!running && !resultado && (
            <Button onClick={executar} style={{ backgroundColor: '#f97316', color: 'white' }}>
              <Globe className="h-4 w-4" />Iniciar enriquecimento
            </Button>
          )}
          {resultado && (
            <Button onClick={() => { setResultado(null) }} variant="outline">
              <Sparkles className="h-4 w-4" />Rodar de novo
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            <X className="h-4 w-4" />Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
