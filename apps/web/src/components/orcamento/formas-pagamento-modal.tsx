'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, Button, Input } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { DollarSign, Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

/**
 * Gerência das formas de pagamento (opções do campo "Forma de Pagamento" dos
 * orçamentos). Auto-contido: carrega a lista ao abrir, adiciona, EDITA e remove
 * via os endpoints orcamento.*FormaPagamento. Usado no header de /orcamentos e
 * no detalhe. A edição inline (#HLP0347) permite corrigir a escrita das opções
 * sem excluir e recriar — ex.: acertar a grafia de "à vista".
 */
export function FormasPagamentoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [formas, setFormas] = useState<Array<{ id: string; valor: string; ordem: number }>>([])
  const [nova, setNova] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValor, setEditValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  const load = useCallback(async () => {
    try { setFormas((await (trpc.orcamento as any).listFormasPagamento.query()) || []) } catch { /* sem permissão */ }
  }, [])
  useEffect(() => { if (open) void load() }, [open, load])

  // Ao fechar, zera os campos de edição/inclusão (evita reabrir "no meio de algo").
  useEffect(() => { if (!open) { setEditingId(null); setEditValor(''); setNova('') } }, [open])

  const add = async () => {
    if (!nova.trim()) return
    try {
      await (trpc.orcamento as any).createFormaPagamento.mutate({ valor: nova.trim() })
      setNova('')
      await load()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const startEdit = (f: { id: string; valor: string }) => { setEditingId(f.id); setEditValor(f.valor) }
  const cancelEdit = () => { setEditingId(null); setEditValor('') }
  const saveEdit = async (id: string) => {
    const valor = editValor.trim()
    if (!valor) return
    setSalvando(true)
    try {
      await (trpc.orcamento as any).updateFormaPagamento.mutate({ id, valor })
      setFormas(prev => prev.map(f => f.id === id ? { ...f, valor } : f))
      cancelEdit()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
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
            <div className="space-y-1 max-h-[340px] overflow-y-auto nice-scrollbar">
              {formas.map(f => (
                <div key={f.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 group hover:bg-muted/30 transition-colors">
                  {editingId === f.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editValor}
                        onChange={e => setEditValor(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); void saveEdit(f.id) }
                          else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                        }}
                        className="h-7 text-sm flex-1"
                      />
                      <button
                        type="button"
                        onClick={() => void saveEdit(f.id)}
                        disabled={salvando || !editValor.trim()}
                        className="text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors"
                        aria-label="Salvar"
                        title="Salvar"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Cancelar"
                        title="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1">{f.valor}</span>
                      <button
                        type="button"
                        onClick={() => startEdit(f)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={`Editar ${f.valor}`}
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void del(f.id, f.valor)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remover ${f.valor}`}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
