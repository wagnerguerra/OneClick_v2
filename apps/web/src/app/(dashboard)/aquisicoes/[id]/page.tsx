'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  ShoppingCart, Save, Plus, Trash2, Loader2, Send, Check, Ban, PackageCheck, ClipboardCheck,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { STATUS_COMPRA_LABELS, TIPO_FORNECIMENTO_LABELS } from '@saas/types'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const brl = (v: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_COLORS: Record<string, string> = {
  NOVO: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  AGUARDANDO_APROVACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  APROVADO: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400',
  REPROVADO: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  RECEBIDO: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400',
  AVALIADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  CANCELADO: 'bg-muted text-muted-foreground',
}
const TIPO_FORN_OPCOES = ['NORMAL', 'CONTRATO_PERMANENTE', 'CONTRATO_TEMPORARIO', 'CURSO_TREINAMENTO', 'MANUTENCAO_SOFTWARE']

interface Item { id: string; descricao: string; unidade: string | null; quantidade: number; valorUnitario: number }
interface Compra {
  id: string; code: number; status: string; frete: number | null; total: number
  formaPagamento: string | null; prazoEntrega: string | null; prazoPagamento: string | null; observacoes: string | null
  fornecedor: { id: string; razaoSocial: string } | null
  solicitante: { name: string } | null; aprovador: { name: string } | null; recebedor: { name: string } | null
  motivoReprovacao: string | null; nfNumero: string | null; nfValor: number | null; tipoFornecimento: string | null
  melhoria: boolean; melhoriaObs: string | null
  itens: Item[]
}

export default function PedidoDetalhePage() {
  const params = useParams<{ id: string }>()
  const [c, setC] = useState<Compra | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [acting, setActing] = useState(false)
  const [reprovarOpen, setReprovarOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [avaliarOpen, setAvaliarOpen] = useState(false)

  // campos editáveis
  const [forma, setForma] = useState(''); const [pEnt, setPEnt] = useState(''); const [pPag, setPPag] = useState('')
  const [frete, setFrete] = useState(''); const [obs, setObs] = useState('')

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.compra as any).getById.query({ id: params.id }).then((d: Compra) => {
      setC(d)
      setForma(d.formaPagamento ?? ''); setPEnt(d.prazoEntrega ?? ''); setPPag(d.prazoPagamento ?? '')
      setFrete(d.frete != null ? String(d.frete).replace('.', ',') : ''); setObs(d.observacoes ?? '')
    }).catch(() => setC(null)).finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!c) return <div className="py-12 text-center text-muted-foreground">Pedido não encontrado</div>

  const editavel = c.status === 'NOVO' || c.status === 'REPROVADO'
  const freteNum = Number(frete.replace(/\./g, '').replace(',', '.')) || 0

  async function salvar() {
    setSaving(true)
    try {
      await (trpc.compra as any).update.mutate({ id: c!.id, data: { formaPagamento: forma, prazoEntrega: pEnt, prazoPagamento: pPag, frete: freteNum, observacoes: obs } })
      alerts.success('Salvo', 'Alterações gravadas.'); carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setSaving(false) }
  }

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setActing(true)
    try { await fn(); alerts.success('Pronto', msg); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) } finally { setActing(false) }
  }

  async function addItem() {
    await acao(() => (trpc.compra as any).addItem.mutate({ compraId: c!.id, descricao: 'Novo item', quantidade: 1, valorUnitario: 0 }), 'Item adicionado.')
  }
  async function saveItem(it: Item) {
    await (trpc.compra as any).updateItem.mutate({ id: it.id, descricao: it.descricao, unidade: it.unidade || undefined, quantidade: it.quantidade, valorUnitario: it.valorUnitario })
  }
  function patchItem(id: string, patch: Partial<Item>) { setC((prev) => prev ? { ...prev, itens: prev.itens.map((i) => i.id === id ? { ...i, ...patch } : i) } : prev) }
  async function removeItem(id: string) { await acao(() => (trpc.compra as any).removeItem.mutate({ id }), 'Item removido.') }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1>Pedido #{c.code}</h1>
              <Badge className={cn('text-[11px]', STATUS_COLORS[c.status])}>{STATUS_COMPRA_LABELS[c.status] ?? c.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{c.fornecedor?.razaoSocial ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {editavel && <Button variant="success" size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar</Button>}
          {(c.status === 'NOVO' || c.status === 'REPROVADO') && <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" disabled={acting} onClick={() => acao(() => (trpc.compra as any).enviar.mutate({ id: c.id }), 'Enviado para aprovação.')}><Send className="h-4 w-4" />Enviar p/ aprovação</Button>}
          {c.status === 'AGUARDANDO_APROVACAO' && <>
            <Button variant="success" size="sm" disabled={acting} onClick={() => acao(() => (trpc.compra as any).aprovar.mutate({ id: c.id }), 'Pedido aprovado.')}><Check className="h-4 w-4" />Aprovar</Button>
            <Button variant="destructive" size="sm" disabled={acting} onClick={() => { setMotivo(''); setReprovarOpen(true) }}><Ban className="h-4 w-4" />Reprovar</Button>
          </>}
          {c.status === 'APROVADO' && <Button size="sm" className="bg-indigo-500 hover:bg-indigo-600 text-white" disabled={acting} onClick={() => acao(() => (trpc.compra as any).receber.mutate({ id: c.id }), 'Marcado como recebido.')}><PackageCheck className="h-4 w-4" />Receber</Button>}
          {(c.status === 'RECEBIDO' || c.status === 'AVALIADO') && <Button variant="success" size="sm" onClick={() => setAvaliarOpen(true)}><ClipboardCheck className="h-4 w-4" />{c.status === 'AVALIADO' ? 'Rever avaliação' : 'Avaliar'}</Button>}
          <BackButton href="/aquisicoes" label="Voltar" />
        </div>
      </div>

      {c.status === 'REPROVADO' && c.motivoReprovacao && (
        <Card className="p-3 border-rose-300 bg-rose-50 dark:bg-rose-950/20 text-sm text-rose-700 dark:text-rose-400"><strong>Reprovado:</strong> {c.motivoReprovacao}</Card>
      )}

      {/* Dados */}
      <Card className="p-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4"><Label>Forma de Pagamento</Label><Input value={forma} onChange={(e) => setForma(e.target.value)} disabled={!editavel} className="mt-1.5" /></div>
          <div className="col-span-6 md:col-span-3"><Label>Prazo de Entrega</Label><Input value={pEnt} onChange={(e) => setPEnt(e.target.value)} disabled={!editavel} className="mt-1.5" /></div>
          <div className="col-span-6 md:col-span-3"><Label>Prazo de Pagamento</Label><Input value={pPag} onChange={(e) => setPPag(e.target.value)} disabled={!editavel} className="mt-1.5" /></div>
          <div className="col-span-6 md:col-span-2"><Label>Frete (R$)</Label><Input value={frete} onChange={(e) => setFrete(e.target.value)} disabled={!editavel} className="mt-1.5" placeholder="0,00" /></div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
          {c.solicitante && <span>Solicitante: <strong className="text-foreground">{c.solicitante.name}</strong></span>}
          {c.aprovador && <span>Aprovador: <strong className="text-foreground">{c.aprovador.name}</strong></span>}
          {c.recebedor && <span>Recebido por: <strong className="text-foreground">{c.recebedor.name}</strong></span>}
        </div>
      </Card>

      {/* Itens */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[13px] font-semibold">Itens do pedido</h4>
          {editavel && <Button type="button" variant="outline" size="xs" onClick={addItem} disabled={acting}><Plus className="h-3.5 w-3.5" />Adicionar item</Button>}
        </div>
        {c.itens.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Sem itens.</p> : (
          <div className="space-y-2">
            {c.itens.map((it) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-center">
                <Input className="col-span-12 md:col-span-5 h-9" value={it.descricao} disabled={!editavel} onChange={(e) => patchItem(it.id, { descricao: e.target.value })} onBlur={() => editavel && saveItem(it)} />
                <Input className="col-span-3 md:col-span-2 h-9" placeholder="Unid." value={it.unidade ?? ''} disabled={!editavel} onChange={(e) => patchItem(it.id, { unidade: e.target.value })} onBlur={() => editavel && saveItem(it)} />
                <Input className="col-span-3 md:col-span-1 h-9" type="number" min={1} value={it.quantidade} disabled={!editavel} onChange={(e) => patchItem(it.id, { quantidade: Number(e.target.value) || 1 })} onBlur={() => editavel && saveItem(it)} />
                <Input className="col-span-4 md:col-span-2 h-9" type="number" min={0} step="0.01" value={it.valorUnitario} disabled={!editavel} onChange={(e) => patchItem(it.id, { valorUnitario: Number(e.target.value) || 0 })} onBlur={() => editavel && saveItem(it)} />
                <div className="col-span-2 md:col-span-2 flex items-center justify-end gap-2">
                  <span className="text-xs tabular-nums text-muted-foreground hidden md:inline">{brl(it.quantidade * it.valorUnitario)}</span>
                  {editavel && <Button type="button" variant="soft-destructive" size="icon-sm" onClick={() => removeItem(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-6 mt-4 pt-3 border-t border-border text-sm">
          <span className="text-muted-foreground">Frete: <strong className="tabular-nums text-foreground">{brl(freteNum)}</strong></span>
          <span className="text-muted-foreground">Total: <strong className="tabular-nums" style={{ color: MODULE_COLOR }}>{brl(c.total)}</strong></span>
        </div>
      </Card>

      {/* Observações */}
      <Card className="p-5">
        <Label>Observações</Label>
        {editavel ? <div className="mt-1.5"><RichEditor value={obs} onChange={setObs} placeholder="Detalhamento..." /></div>
          : <div className="mt-1.5 prose prose-sm max-w-none dark:prose-invert text-sm" dangerouslySetInnerHTML={{ __html: c.observacoes || '<p class="text-muted-foreground">Sem observações.</p>' }} />}
      </Card>

      {/* Reprovar modal */}
      <Dialog open={reprovarOpen} onOpenChange={setReprovarOpen}>
        <DialogContent>
          <DialogHeaderIcon icon={Ban} color="rose"><DialogTitle>Reprovar pedido #{c.code}</DialogTitle></DialogHeaderIcon>
          <DialogBody>
            <Label>Motivo da reprovação *</Label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Descreva o motivo..." />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReprovarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" size="sm" disabled={acting || motivo.trim().length < 3} onClick={async () => { await acao(() => (trpc.compra as any).reprovar.mutate({ id: c.id, motivo: motivo.trim() }), 'Pedido reprovado.'); setReprovarOpen(false) }}>Reprovar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {avaliarOpen && <AvaliarModal compra={c} onClose={() => setAvaliarOpen(false)} onDone={() => { setAvaliarOpen(false); carregar() }} />}
    </div>
  )
}

// ── Modal de avaliação (P1..P5 + NF + tipo + melhoria) ──
interface CritRow { id: string; criterio: string; ordem: number; atende: boolean | null }
function AvaliarModal({ compra, onClose, onDone }: { compra: Compra; onClose: () => void; onDone: () => void }) {
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
          <label className="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" checked={melhoria} onChange={(e) => setMelhoria(e.target.checked)} className="h-4 w-4" />Abrir oportunidade de melhoria</label>
          {melhoria && <textarea value={melhoriaObs} onChange={(e) => setMelhoriaObs(e.target.value)} rows={2} placeholder="Descrição da melhoria/não conformidade..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20" />}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="success" size="sm" disabled={saving} onClick={salvar}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Concluir avaliação</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
