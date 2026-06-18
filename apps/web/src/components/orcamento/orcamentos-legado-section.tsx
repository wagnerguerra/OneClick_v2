'use client'

import { useEffect, useState } from 'react'
import { Archive, Loader2, MessageSquare, History as HistoryIcon, Receipt } from 'lucide-react'
import { cn, Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'

interface ItemLegado { descricao: string | null; tipo: string | null; quantidade: string | number | null; valorUnitario: string | number | null }
interface MsgLegado { conteudo: string; data: string | null }
interface EvLegado { evento: string; data: string | null }
interface OrcLegado {
  id: string; legacyId: number; numero: number; status: string | null; valorTotal: string | number | null
  desconto: string | null; valorDesconto: string | number | null
  contato: string | null; contatoEmail: string | null; validadeDias: number | null; descricao: string | null
  decisaoTipo: string | null; decisaoNome: string | null; decisaoObs: string | null; decisaoEm: string | null
  dtNovo: string | null; dtFinalizado: string | null; dtAprovado: string | null; dtCancelado: string | null
  itens: ItemLegado[]; mensagens: MsgLegado[]; eventos: EvLegado[]
}

const fmtMoeda = (v: unknown) => {
  const n = Number(v); if (!v || isNaN(n) || n === 0) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
const fmtData = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR') : null
const servicoLabel = (o: OrcLegado) => {
  if (!o.itens.length) return '—'
  const first = o.itens[0].descricao || o.itens[0].tipo || 'Serviço'
  return o.itens.length > 1 ? `${first} +${o.itens.length - 1}` : first
}

/**
 * Histórico de orçamentos do SISTEMA LEGADO (v4) do cliente. Somente leitura —
 * NÃO são orçamentos válidos do sistema novo; servem apenas como histórico.
 * Tabela (ordenada por número desc) → clicar abre um modal com os detalhes.
 */
export function OrcamentosLegadoSection({ clienteId, className }: { clienteId?: string | null; className?: string }) {
  const [orcs, setOrcs] = useState<OrcLegado[]>([])
  const [loading, setLoading] = useState(false)
  const [sel, setSel] = useState<OrcLegado | null>(null)

  useEffect(() => {
    if (!clienteId) { setOrcs([]); return }
    let cancel = false
    setLoading(true)
    ;(trpc.orcamento as any).legadoPorCliente.query({ clienteId })
      .then((r: OrcLegado[]) => { if (!cancel) setOrcs(r || []) })
      .catch(() => { if (!cancel) setOrcs([]) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [clienteId])

  if (!clienteId) return null
  if (loading) return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground py-3', className)}>
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico do legado…
    </div>
  )
  if (orcs.length === 0) return null

  return (
    <div className={cn('rounded-lg border border-border bg-card overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <Archive className="h-4 w-4 text-amber-500" />
        <span className="text-[13px] font-semibold">Orçamentos anteriores (sistema legado)</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{orcs.length}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">somente histórico</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-semibold px-4 py-2 w-[80px]">Nº</th>
              <th className="text-left font-semibold px-2 py-2 w-[110px]">Status</th>
              <th className="text-left font-semibold px-2 py-2 w-[100px]">Data</th>
              <th className="text-left font-semibold px-2 py-2">Serviço</th>
              <th className="text-right font-semibold px-4 py-2 w-[130px]">Valor</th>
            </tr>
          </thead>
          <tbody>
            {orcs.map(o => {
              const dataRef = fmtData(o.dtFinalizado || o.dtAprovado || o.dtNovo)
              return (
                <tr
                  key={o.id}
                  onClick={() => setSel(o)}
                  className="border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-2 font-semibold tabular-nums">#{o.numero}</td>
                  <td className="px-2 py-2"><span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap">{o.status || '—'}</span></td>
                  <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{dataRef || '—'}</td>
                  <td className="px-2 py-2 text-xs text-foreground/90"><span className="line-clamp-1">{servicoLabel(o)}</span></td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{fmtMoeda(o.valorTotal)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de detalhes do orçamento legado */}
      <Dialog open={!!sel} onOpenChange={(v) => { if (!v) setSel(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Archive} color="amber">
            <DialogTitle>Orçamento #{sel?.numero} <span className="text-xs font-normal text-muted-foreground">(legado)</span></DialogTitle>
            <DialogDescription>
              {[sel?.status, fmtData(sel?.dtFinalizado || sel?.dtAprovado || sel?.dtNovo || null)].filter(Boolean).join(' · ') || 'Histórico do sistema legado'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4 max-h-[min(70vh,640px)] nice-scrollbar">
            {sel && (
              <>
                {/* Resumo financeiro (com desconto, como no legado) */}
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm space-y-1">
                  {Number(sel.valorDesconto) > 0 ? (
                    <>
                      <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtMoeda(Number(sel.valorTotal || 0) + Number(sel.valorDesconto || 0))}</span></div>
                      <div className="flex justify-between text-rose-600 dark:text-rose-400"><span>Desconto</span><span className="tabular-nums">− {fmtMoeda(sel.valorDesconto)}</span></div>
                      <div className="flex justify-between font-semibold border-t border-border/60 pt-1"><span>Total</span><span className="tabular-nums text-emerald-700 dark:text-emerald-400">{fmtMoeda(sel.valorTotal)}</span></div>
                    </>
                  ) : (
                    <div className="flex justify-between font-semibold"><span>Valor total</span><span className="tabular-nums text-emerald-700 dark:text-emerald-400">{fmtMoeda(sel.valorTotal)}</span></div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
                  {sel.validadeDias ? <span>Validade: {sel.validadeDias} dias</span> : null}
                  {sel.contato ? <span>Contato: {sel.contato}</span> : null}
                </div>
                {sel.descricao && (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: sel.descricao }} />
                )}
                {/* Valores */}
                {sel.itens.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Receipt className="h-3 w-3" /> Valores</p>
                    <div className="rounded-md border border-border overflow-hidden">
                      {sel.itens.map((it, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-border/50 last:border-0">
                          <span className="flex-1 truncate">{it.descricao || it.tipo || 'Item'}</span>
                          {Number(it.quantidade) > 1 && <span className="text-muted-foreground text-xs tabular-nums">{Number(it.quantidade)}×</span>}
                          <span className="font-medium tabular-nums">{fmtMoeda(it.valorUnitario)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Decisão */}
                {sel.decisaoTipo && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">{sel.decisaoTipo === 'aprovado' ? 'Aprovado' : 'Recusado'}</span>
                    {sel.decisaoNome ? ` por ${sel.decisaoNome}` : ''}{fmtData(sel.decisaoEm) ? ` em ${fmtData(sel.decisaoEm)}` : ''}
                    {sel.decisaoObs ? ` — ${sel.decisaoObs}` : ''}
                  </p>
                )}
                {/* Mensagens */}
                {sel.mensagens.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Mensagens ({sel.mensagens.length})</p>
                    <div className="space-y-1.5">
                      {sel.mensagens.map((m, i) => (
                        <div key={i} className="text-xs rounded-md border border-border bg-muted/20 px-3 py-2">
                          <div className="[&_*]:text-xs [&_p]:m-0 break-words" dangerouslySetInnerHTML={{ __html: m.conteudo }} />
                          {fmtData(m.data) && <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(m.data!).toLocaleString('pt-BR')}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Histórico */}
                {sel.eventos.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><HistoryIcon className="h-3 w-3" /> Histórico ({sel.eventos.length})</p>
                    <div className="space-y-0.5">
                      {sel.eventos.map((e, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                          <span className="tabular-nums shrink-0 text-muted-foreground/70">{e.data ? new Date(e.data).toLocaleString('pt-BR') : ''}</span>
                          <span className="break-words">{e.evento}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  )
}
