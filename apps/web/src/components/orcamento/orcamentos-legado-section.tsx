'use client'

import { useEffect, useState } from 'react'
import { Archive, ChevronDown, Loader2, MessageSquare, History as HistoryIcon, Receipt } from 'lucide-react'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

interface ItemLegado { descricao: string | null; tipo: string | null; quantidade: string | number | null; valorUnitario: string | number | null }
interface MsgLegado { conteudo: string; data: string | null }
interface EvLegado { evento: string; data: string | null }
interface OrcLegado {
  id: string; legacyId: number; numero: number; status: string | null; valorTotal: string | number | null
  contato: string | null; validadeDias: number | null; descricao: string | null
  decisaoTipo: string | null; decisaoNome: string | null; decisaoObs: string | null; decisaoEm: string | null
  dtNovo: string | null; dtFinalizado: string | null; dtAprovado: string | null; dtCancelado: string | null
  itens: ItemLegado[]; mensagens: MsgLegado[]; eventos: EvLegado[]
}

const fmtMoeda = (v: unknown) => {
  const n = Number(v); if (!v || isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
const fmtData = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR') : null

/**
 * Histórico de orçamentos do SISTEMA LEGADO (v4) do cliente. Somente leitura —
 * NÃO são orçamentos válidos do sistema novo; servem apenas como histórico.
 * Renderiza nada quando o cliente não tem registros legados.
 */
export function OrcamentosLegadoSection({ clienteId, className }: { clienteId?: string | null; className?: string }) {
  const [orcs, setOrcs] = useState<OrcLegado[]>([])
  const [loading, setLoading] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)

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
    <div className={cn('rounded-lg border border-border bg-muted/20', className)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <Archive className="h-4 w-4 text-amber-500" />
        <span className="text-[13px] font-semibold">Orçamentos anteriores (sistema legado)</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{orcs.length}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">somente histórico</span>
      </div>
      <div className="divide-y divide-border/60">
        {orcs.map(o => {
          const open = aberto === o.id
          const dataRef = fmtData(o.dtFinalizado || o.dtAprovado || o.dtNovo)
          return (
            <div key={o.id}>
              <button
                type="button"
                onClick={() => setAberto(open ? null : o.id)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm font-semibold tabular-nums shrink-0">#{o.numero}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">{o.status || '—'}</span>
                {dataRef && <span className="text-xs text-muted-foreground shrink-0">{dataRef}</span>}
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 ml-auto tabular-nums shrink-0">{fmtMoeda(o.valorTotal)}</span>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground shrink-0 transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="px-4 pb-4 pt-1 space-y-3 bg-muted/20">
                  {o.descricao && (
                    <div className="text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: o.descricao }} />
                  )}
                  {/* Itens / valores */}
                  {o.itens.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><Receipt className="h-3 w-3" /> Valores</p>
                      <div className="rounded-md border border-border/60 overflow-hidden">
                        {o.itens.map((it, i) => (
                          <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-xs border-b border-border/40 last:border-0">
                            <span className="flex-1 truncate">{it.descricao || it.tipo || 'Item'}</span>
                            {Number(it.quantidade) > 1 && <span className="text-muted-foreground tabular-nums">{Number(it.quantidade)}×</span>}
                            <span className="font-medium tabular-nums">{fmtMoeda(it.valorUnitario)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Decisão do cliente */}
                  {o.decisaoTipo && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">{o.decisaoTipo === 'aprovado' ? 'Aprovado' : 'Recusado'}</span>
                      {o.decisaoNome ? ` por ${o.decisaoNome}` : ''}{fmtData(o.decisaoEm) ? ` em ${fmtData(o.decisaoEm)}` : ''}
                      {o.decisaoObs ? ` — ${o.decisaoObs}` : ''}
                    </p>
                  )}
                  {/* Mensagens */}
                  {o.mensagens.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Mensagens ({o.mensagens.length})</p>
                      <div className="space-y-1.5">
                        {o.mensagens.map((m, i) => (
                          <div key={i} className="text-xs rounded-md border border-border/60 bg-card px-2.5 py-1.5">
                            <div className="[&_*]:text-xs [&_p]:m-0 break-words" dangerouslySetInnerHTML={{ __html: m.conteudo }} />
                            {fmtData(m.data) && <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(m.data!).toLocaleString('pt-BR')}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Histórico */}
                  {o.eventos.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1"><HistoryIcon className="h-3 w-3" /> Histórico ({o.eventos.length})</p>
                      <div className="space-y-0.5">
                        {o.eventos.map((e, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                            <span className="tabular-nums shrink-0 text-muted-foreground/70">{e.data ? new Date(e.data).toLocaleString('pt-BR') : ''}</span>
                            <span className="break-words">{e.evento}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
