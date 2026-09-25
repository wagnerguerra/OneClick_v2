'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, PackageCheck } from 'lucide-react'
import {
  Button, Input, Label, Checkbox, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/**
 * Registrar uma entrega do pedido — o recebimento é POR ITEM (25/09/2026).
 *
 * Quem compra N coisas recebe em datas diferentes, às vezes parte da quantidade
 * de um mesmo item. Aqui se marca o que chegou nesta entrega, quanto de cada
 * um, o dia e a nota. O pedido fica "Recebido parcialmente" até o último item
 * completar. Regras (e o limite de não receber mais do que falta) no backend,
 * em compra/recebimento.ts.
 */

export interface ItemParaReceber {
  id: string
  descricao: string
  unidade: string | null
  quantidade: number
  quantidadeRecebida: number
}

const hojeIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export function ReceberModal({ open, compraId, codigo, itens, itemInicial, onClose, onDone }: {
  open: boolean
  compraId: string
  codigo: number
  itens: ItemParaReceber[]
  /** Aberto pela linha de um item: só ele vem marcado. */
  itemInicial?: string | null
  onClose: () => void
  onDone: () => void
}) {
  const pendentes = useMemo(() => itens.filter(i => i.quantidade - i.quantidadeRecebida > 0), [itens])
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [qtd, setQtd] = useState<Record<string, string>>({})
  const [data, setData] = useState(hojeIso())
  const [nf, setNf] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!open) return
    const m: Record<string, boolean> = {}
    const q: Record<string, string> = {}
    for (const i of pendentes) {
      m[i.id] = itemInicial ? i.id === itemInicial : true
      q[i.id] = String(i.quantidade - i.quantidadeRecebida)
    }
    setMarcados(m); setQtd(q); setData(hojeIso()); setNf(''); setObs('')
  }, [open, pendentes, itemInicial])

  const selecionados = pendentes.filter(i => marcados[i.id])
  const problema = selecionados.map(i => {
    const n = Number(qtd[i.id])
    const falta = i.quantidade - i.quantidadeRecebida
    if (!Number.isInteger(n) || n <= 0) return `Quantidade inválida em "${i.descricao}".`
    if (n > falta) return `"${i.descricao}": faltam ${falta}.`
    return null
  }).find(Boolean)

  const todos = pendentes.length > 0 && selecionados.length === pendentes.length

  async function registrar() {
    if (!selecionados.length || problema || !data) return
    setSalvando(true)
    try {
      await (trpc.compra as any).receberItens.mutate({
        compraId,
        data,
        nfNumero: nf.trim() || undefined,
        observacao: obs.trim() || undefined,
        itens: selecionados.map(i => ({ itemId: i.id, quantidade: Number(qtd[i.id]) })),
      })
      alerts.success('Recebimento registrado', `${selecionados.length} item(ns) do pedido #${codigo}.`)
      onDone()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-[760px]">
        <DialogHeaderIcon icon={PackageCheck} color="indigo">
          <DialogTitle className="text-[15px]">Registrar recebimento — Pedido #{codigo}</DialogTitle>
          <DialogDescription className="text-[11px]">
            Marque o que chegou nesta entrega e quanto de cada item. O restante continua pendente.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 sm:col-span-4 space-y-1.5">
              <Label className="text-[13px] font-semibold">Data do recebimento</Label>
              <Input type="date" className="h-9 text-sm" value={data} max={hojeIso()} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="col-span-12 sm:col-span-8 space-y-1.5">
              <Label className="text-[13px] font-semibold">Nota fiscal <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input className="h-9 text-sm" value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Número da NF da entrega" />
            </div>
          </div>

          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Todos os itens já foram recebidos.</p>
          ) : (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={todos} onCheckedChange={(v) => setMarcados(Object.fromEntries(pendentes.map(i => [i.id, v === true])))} aria-label="Marcar todos" />
                    </TableHead>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-center">Pedido</TableHead>
                    <TableHead className="text-xs text-center">Já recebido</TableHead>
                    <TableHead className="text-xs text-center w-[120px]">Chegou agora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendentes.map((i) => {
                    const falta = i.quantidade - i.quantidadeRecebida
                    return (
                      <TableRow key={i.id} className={cn(!marcados[i.id] && 'opacity-60')}>
                        <TableCell>
                          <Checkbox checked={!!marcados[i.id]} onCheckedChange={(v) => setMarcados(m => ({ ...m, [i.id]: v === true }))} aria-label={`Recebido: ${i.descricao}`} />
                        </TableCell>
                        <TableCell className="text-xs font-medium">{i.descricao}</TableCell>
                        <TableCell className="text-xs text-center tabular-nums">{i.quantidade} {i.unidade ?? ''}</TableCell>
                        <TableCell className="text-xs text-center tabular-nums text-muted-foreground">{i.quantidadeRecebida}</TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number" min={1} max={falta} step={1}
                            className="h-8 w-[96px] text-sm text-center tabular-nums mx-auto"
                            value={qtd[i.id] ?? ''}
                            disabled={!marcados[i.id]}
                            onChange={(e) => setQtd(q => ({ ...q, [i.id]: e.target.value }))}
                            aria-label={`Quantidade recebida de ${i.descricao}`}
                          />
                          <p className="text-[10px] text-muted-foreground mt-0.5">faltam {falta}</p>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Observação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
              placeholder="Avaria, divergência, quem entregou..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          {problema && <p className="text-xs text-destructive">{problema}</p>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button size="sm" onClick={registrar} disabled={salvando || !selecionados.length || !!problema || !data}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Registrar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
