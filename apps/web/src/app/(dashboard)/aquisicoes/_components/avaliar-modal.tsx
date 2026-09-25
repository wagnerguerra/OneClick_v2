'use client'

import { useEffect, useState } from 'react'
import { Check, ClipboardCheck, Loader2 } from 'lucide-react'
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
 */
const TIPO_FORN_OPCOES = ['NORMAL', 'CONTRATO_PERMANENTE', 'CONTRATO_TEMPORARIO', 'CURSO_TREINAMENTO', 'MANUTENCAO_SOFTWARE']

export interface CompraAvaliavel {
  id: string; code: number
  nfNumero: string | null; nfValor: number | null; tipoFornecimento: string | null
  melhoria: boolean; melhoriaObs: string | null
}

interface CritRow { id: string; criterio: string; ordem: number; atende: boolean | null }
export function AvaliarModal({ compra, onClose, onDone }: { compra: CompraAvaliavel; onClose: () => void; onDone: () => void }) {
  const [criterios, setCriterios] = useState<CritRow[]>([])
  const [loading, setLoading] = useState(true)
  const [nfNumero, setNfNumero] = useState(compra.nfNumero ?? '')
  const [nfValor, setNfValor] = useState(compra.nfValor != null ? String(compra.nfValor) : '')
  const [tipo, setTipo] = useState(compra.tipoFornecimento ?? 'NORMAL')
  const [melhoria, setMelhoria] = useState(compra.melhoria ?? false)
  const [melhoriaObs, setMelhoriaObs] = useState(compra.melhoriaObs ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(trpc.compra as any).getAvaliacao.query({ compraId: compra.id }).then((d: CritRow[]) => setCriterios(d || [])).catch(() => setCriterios([])).finally(() => setLoading(false))
  }, [compra.id])

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
            <div><Label>Nota Fiscal (nº)</Label><Input value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} className="mt-1.5 h-9" /></div>
            <div><Label>Valor da NF (R$)</Label><Input type="number" step="0.01" value={nfValor} onChange={(e) => setNfValor(e.target.value)} className="mt-1.5 h-9" /></div>
          </div>
          <div><Label>Tipo de Fornecimento</Label>
            <Select value={tipo} onValueChange={setTipo}><SelectTrigger className="mt-1.5 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{TIPO_FORN_OPCOES.map((t) => <SelectItem key={t} value={t}>{TIPO_FORNECIMENTO_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Critérios de avaliação</Label>
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
