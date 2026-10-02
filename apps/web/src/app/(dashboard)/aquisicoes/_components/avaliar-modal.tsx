'use client'

import { useEffect, useState } from 'react'
import { Check, ClipboardCheck, FileText, Loader2 } from 'lucide-react'
import {
  Button, Input, Label, Checkbox, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { TIPO_FORNECIMENTO_LABELS } from '@saas/types'

/**
 * Avaliação do fornecimento (P1..P5 + NF + tipo + melhoria). Saiu da página do
 * pedido em 25/09/2026, quando ela foi refeita no padrão de detalhe.
 *
 * Desde 02/10/2026 a NF vem pronta: o pedido pode ter várias notas (compra de
 * marketplace entregue por vários vendedores), lidas dos DANFEs anexados. Os
 * números são juntados e os valores somados; quem avalia só confere. Os
 * critérios são opcionais — dá para concluir sem responder nenhum.
 */
const TIPO_FORN_OPCOES = ['NORMAL', 'CONTRATO_PERMANENTE', 'CONTRATO_TEMPORARIO', 'CURSO_TREINAMENTO', 'MANUTENCAO_SOFTWARE']

export interface CompraAvaliavel {
  id: string; code: number
  nfNumero: string | null; nfValor: number | null; tipoFornecimento: string | null
  melhoria: boolean; melhoriaObs: string | null
}

interface CritRow { id: string; criterio: string; ordem: number; atende: boolean | null }
interface NotaDoPedido { numero: string; serie: string | null; valor: number | null; emitente: string | null; arquivo: string | null }
interface NotasDoPedido { notas: NotaDoPedido[]; total: number; semValor: number }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export function AvaliarModal({ compra, totalPedido, onClose, onDone }: {
  compra: CompraAvaliavel
  /** Total do pedido (itens + frete), para comparar com a soma das notas. */
  totalPedido?: number
  onClose: () => void
  onDone: () => void
}) {
  const [criterios, setCriterios] = useState<CritRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nfNumero, setNfNumero] = useState(compra.nfNumero ?? '')
  const [nfValor, setNfValor] = useState(compra.nfValor != null ? String(compra.nfValor) : '')
  const [tipo, setTipo] = useState(compra.tipoFornecimento ?? 'NORMAL')
  const [melhoria, setMelhoria] = useState(compra.melhoria ?? false)
  const [melhoriaObs, setMelhoriaObs] = useState(compra.melhoriaObs ?? '')
  const [saving, setSaving] = useState(false)
  const [notas, setNotas] = useState<NotasDoPedido | null>(null)

  useEffect(() => {
    ;(trpc.compra as any).getAvaliacao.query({ compraId: compra.id }).then((d: CritRow[]) => setCriterios(d || [])).catch(() => setCriterios([])).finally(() => setLoading(false))
    // Notas do pedido: pré-preenche só o que ainda está vazio — a avaliação
    // revista não perde o que alguém já digitou.
    ;(trpc.compra as any).notasFiscais.query({ compraId: compra.id })
      .then((d: NotasDoPedido) => {
        setNotas(d)
        if (!d?.notas.length) return
        if (!compra.nfNumero) setNfNumero(d.notas.map((n) => n.numero).join(', '))
        if (compra.nfValor == null && d.total > 0) setNfValor(String(d.total))
      })
      .catch(() => setNotas(null))
  }, [compra.id, compra.nfNumero, compra.nfValor])

  function resp(id: string, atende: boolean) { setCriterios((prev) => prev.map((c) => c.id === id ? { ...c, atende } : c)) }

  async function salvar() {
    setSaving(true)
    try {
      await (trpc.compra as any).avaliar.mutate({
        id: compra.id, nfNumero: nfNumero || undefined, nfValor: Number(nfValor) || undefined,
        tipoFornecimento: tipo, melhoria, melhoriaObs: melhoriaObs || undefined,
        respostas: criterios.filter((c) => c.atende !== null).map((c) => ({ criterioId: c.id, atende: c.atende as boolean })),
      })
      alerts.success('Avaliado', 'Fornecimento avaliado.'); onDone()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeaderIcon icon={ClipboardCheck} color="emerald"><DialogTitle>Avaliar fornecimento — Pedido #{compra.code}</DialogTitle></DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{(notas?.notas.length ?? 0) > 1 ? 'Notas Fiscais (nº)' : 'Nota Fiscal (nº)'}</Label><Input value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} className="mt-1.5 h-9" /></div>
            <div><Label>{(notas?.notas.length ?? 0) > 1 ? 'Valor das NFs (R$)' : 'Valor da NF (R$)'}</Label><Input type="number" step="0.01" value={nfValor} onChange={(e) => setNfValor(e.target.value)} className="mt-1.5 h-9" /></div>
          </div>

          {/* Notas lidas dos DANFEs anexados — origem do pré-preenchimento */}
          {notas && notas.notas.length > 0 && (
            <div className="rounded-md border border-border">
              <p className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-[12px] font-semibold">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                {notas.notas.length === 1 ? '1 nota fiscal no pedido' : `${notas.notas.length} notas fiscais no pedido`}
              </p>
              <div className="nice-scrollbar max-h-[150px] divide-y divide-border/60 overflow-y-auto">
                {notas.notas.map((n, i) => (
                  <div key={`${n.numero}-${i}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                    <span className="w-[86px] shrink-0 font-medium tabular-nums">NF {n.numero}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground" title={n.emitente ?? n.arquivo ?? ''}>
                      {n.emitente ?? n.arquivo ?? 'digitada no recebimento'}
                    </span>
                    <span className="shrink-0 tabular-nums">{n.valor != null ? brl(n.valor) : '—'}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[12px]">
                <span className="text-muted-foreground">
                  {totalPedido != null && notas.total > 0 && Math.abs(notas.total - totalPedido) >= 0.01
                    ? `Pedido: ${brl(totalPedido)} · diferença ${brl(notas.total - totalPedido)}`
                    : notas.semValor > 0 ? `${notas.semValor} sem valor lido` : 'Soma das notas'}
                </span>
                <span className="font-semibold tabular-nums">{brl(notas.total)}</span>
              </div>
            </div>
          )}
          <div><Label>Tipo de Fornecimento</Label>
            <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="mt-1.5 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPO_FORN_OPCOES.map((t) => <SelectItem key={t} value={t}>{TIPO_FORNECIMENTO_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Critérios de avaliação <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            {loading ? <div className="py-4 text-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
              : criterios.length === 0 ? <p className="text-xs text-muted-foreground py-2">Nenhum critério cadastrado (cadastre em Aquisições › critérios).</p>
              : <div className="mt-1.5 divide-y divide-border/60 rounded-md border border-border">
                  {criterios.map((cr) => (
                    <div key={cr.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="text-sm flex-1">{cr.criterio}</span>
                      <button type="button" onClick={() => resp(cr.id, true)} className={cn('h-7 px-2 rounded text-xs border', cr.atende === true ? 'bg-emerald-500 text-white border-transparent' : 'border-border text-muted-foreground')}>Atende</button>
                      <button type="button" onClick={() => resp(cr.id, false)} className={cn('h-7 px-2 rounded text-xs border', cr.atende === false ? 'bg-rose-500 text-white border-transparent' : 'border-border text-muted-foreground')}>Não</button>
                    </div>
                  ))}
                </div>}
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-sm"><Checkbox checked={melhoria} onCheckedChange={(v) => setMelhoria(v === true)} />Abrir oportunidade de melhoria</label>
          {melhoria && <textarea value={melhoriaObs} onChange={(e) => setMelhoriaObs(e.target.value)} rows={2} placeholder="Descrição da melhoria/não conformidade..." className="w-full rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="success" size="sm" disabled={saving} onClick={salvar}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Concluir avaliação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
