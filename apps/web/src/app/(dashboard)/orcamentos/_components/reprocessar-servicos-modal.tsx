'use client'

/**
 * Recuperação dos orçamentos aprovados que ficaram sem serviço.
 *
 * A aprovação pelo link público gravava o status direto e não chamava o gatilho
 * que cria o Processo + a Execução — o orçamento seguia para LIBERADO e o
 * serviço nunca aparecia em /meus-servicos. O caminho já foi corrigido; esta
 * tela é o conserto do que ficou para trás, e serve de válvula caso algum
 * orçamento volte a ficar sem execução por outro motivo.
 *
 * Abre sempre em simulação: primeiro mostra o que falta, só depois cria.
 */

import { useState, useEffect, useCallback } from 'react'
import { Wrench, Loader2, CheckCircle2 } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Badge, cn } from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

type Pendente = { numero: number; status: string; cliente: string; faltando: string[] }
type Ignorado = { numero: number; status: string; cliente: string; motivo: string }
type Simulacao = { pendentes: Pendente[]; ignorados: Ignorado[] }
type Aplicado = { criadas: number; resultado: Array<{ numero: number; criadas: number; nomes: string[] }> }

type Mutacao = { reprocessarServicosAprovados: { mutate: (i: { dryRun: boolean }) => Promise<Simulacao & Aplicado> } }

export function ReprocessarServicosModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [carregando, setCarregando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [sim, setSim] = useState<Simulacao | null>(null)
  const [aplicado, setAplicado] = useState<Aplicado | null>(null)

  const simular = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await (trpc.orcamento as unknown as Mutacao).reprocessarServicosAprovados.mutate({ dryRun: true })
      setSim({ pendentes: r.pendentes ?? [], ignorados: r.ignorados ?? [] })
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      onOpenChange(false)
    } finally {
      setCarregando(false)
    }
  }, [onOpenChange])

  useEffect(() => {
    if (!open) { setSim(null); setAplicado(null); return }
    void simular()
  }, [open, simular])

  async function aplicar() {
    setAplicando(true)
    try {
      const r = await (trpc.orcamento as unknown as Mutacao).reprocessarServicosAprovados.mutate({ dryRun: false })
      setAplicado({ criadas: r.criadas ?? 0, resultado: r.resultado ?? [] })
      await alerts.success('Pronto', `${r.criadas} serviço(s) criado(s).`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  const total = sim?.pendentes.reduce((n, p) => n + p.faltando.length, 0) ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeaderIcon icon={Wrench} color="violet">
          <DialogTitle>Recuperar serviços de orçamentos aprovados</DialogTitle>
          <DialogDescription>
            Orçamentos aprovados pelo link do cliente cujo serviço não chegou a ser aberto. A criação é
            idempotente — rodar de novo não duplica nada.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="space-y-4">
          {carregando && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo os orçamentos…
            </div>
          )}

          {!carregando && aplicado && (
            <div className="space-y-2">
              <div className={cn('flex items-center gap-2 text-sm font-medium', TEXT.emerald)}>
                <CheckCircle2 className="h-4 w-4" /> {aplicado.criadas} serviço(s) criado(s).
              </div>
              <ul className="nice-scrollbar max-h-[280px] space-y-1 overflow-y-auto text-sm">
                {aplicado.resultado.filter(r => r.criadas > 0).map(r => (
                  <li key={r.numero} className="rounded border border-border bg-muted/20 px-3 py-1.5">
                    <span className="font-medium">#{r.numero}</span>
                    <span className="text-muted-foreground"> — {r.nomes.join(', ')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!carregando && !aplicado && sim && (
            <>
              {sim.pendentes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum orçamento aprovado está sem serviço. Nada a recuperar.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-[13px] font-semibold text-foreground">
                    {sim.pendentes.length} orçamento(s) em aberto, {total} serviço(s) a criar
                  </p>
                  <ul className="nice-scrollbar max-h-[260px] space-y-1 overflow-y-auto text-sm">
                    {sim.pendentes.map(p => (
                      <li key={p.numero} className="rounded border border-border bg-muted/20 px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">#{p.numero}</span>
                          <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                          <span className="truncate text-muted-foreground">{p.cliente}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{p.faltando.join(' · ')}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {sim.ignorados.length > 0 && (
                <div className="space-y-1 border-t border-border pt-3">
                  <p className="text-[13px] font-semibold text-foreground">
                    Fora do reprocessamento ({sim.ignorados.length})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    O ciclo desses orçamentos já se encerrou; abrir serviço agora jogaria trabalho vencido no
                    painel de alguém. Se algum precisar mesmo do serviço, dá para lançar a mão em Meus Serviços.
                  </p>
                  <ul className="nice-scrollbar max-h-[140px] space-y-1 overflow-y-auto text-xs text-muted-foreground">
                    {sim.ignorados.map(i => (
                      <li key={i.numero}>
                        #{i.numero} — {i.cliente} <span className="opacity-70">({i.motivo})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {aplicado ? 'Fechar' : 'Cancelar'}
          </Button>
          {!aplicado && (
            <Button
              variant="success"
              size="sm"
              className="gap-1.5"
              disabled={carregando || aplicando || !sim || sim.pendentes.length === 0}
              onClick={aplicar}
            >
              {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Criar os serviços
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
