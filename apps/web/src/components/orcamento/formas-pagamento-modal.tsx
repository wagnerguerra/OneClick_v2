'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, Button, Input } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { DollarSign, Plus, Trash2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

/**
 * Gerência das formas de pagamento (opções do campo "Forma de Pagamento" dos
 * orçamentos). Auto-contido: carrega a lista ao abrir, adiciona e remove via os
 * endpoints orcamento.*FormaPagamento. Usado no header de /orcamentos e no detalhe.
 */
export function FormasPagamentoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [formas, setFormas] = useState<Array<{ id: string; valor: string; ordem: number }>>([])
  const [nova, setNova] = useState('')

  const load = useCallback(async () => {
    try { setFormas((await (trpc.orcamento as any).listFormasPagamento.query()) || []) } catch { /* sem permissão */ }
  }, [])
  useEffect(() => { if (open) void load() }, [open, load])

  const add = async () => {
    if (!nova.trim()) return
    try {
      await (trpc.orcamento as any).createFormaPagamento.mutate({ valor: nova.trim() })
      setNova('')
      await load()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const del = async (id: string, valor: string) => {
    if (!await alerts.confirmDelete(valor)) return
    try {
      await (trpc.orcamento as any).deleteFormaPagamento.mutate({ id })
      setFormas(prev => prev.filter(f => f.id !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeaderIcon icon={DollarSign} color="emerald">
          <DialogTitle className="text-[15px]">Formas de Pagamento</DialogTitle>
          <DialogDescription className="text-[11px]">Gerencie as opções disponíveis no campo &quot;Forma de Pagamento&quot; dos orçamentos.</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Nova forma de pagamento..."
              value={nova}
              onChange={e => setNova(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
              className="h-9 text-sm flex-1"
            />
            <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={() => void add()} disabled={!nova.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {formas.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma forma de pagamento cadastrada</p>
          ) : (
            <div className="space-y-1 max-h-[340px] overflow-y-auto">
              {formas.map(f => (
                <div key={f.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 group hover:bg-muted/30 transition-colors">
                  <span className="text-sm flex-1">{f.valor}</span>
                  <button
                    type="button"
                    onClick={() => void del(f.id, f.valor)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    aria-label={`Remover ${f.valor}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
