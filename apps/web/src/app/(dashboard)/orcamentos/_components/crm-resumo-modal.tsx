'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription, Badge, RichContent } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Target, Loader2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'

interface Evento { id: string; tipo: string; descricao: string; createdAt: string }
interface Mensagem { id: string; mensagem: string; autor: string | null; createdAt: string }
interface Resumo {
  id: string; numero: number | null; titulo: string; valor: number | null
  cliente: string | null; responsavel: string | null
  etapa: string | null; ehGanho: boolean; ehPerda: boolean
  createdAt: string; eventos: Evento[]
  /** #HLP0353 — o que foi ESCRITO no card, não só o log de alterações. */
  descricao: string | null
  mensagens: Mensagem[]
}

/** True quando o HTML do editor não tem conteúdo de fato (só tags vazias). */
const semConteudo = (html: string | null) =>
  !html || !html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

const brl = (n: number | null) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')

export function CrmResumoModal({ oportunidadeId, open, onClose }: { oportunidadeId: string; open: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [r, setR] = useState<Resumo | null>(null)

  useEffect(() => {
    if (!open || !oportunidadeId) return
    setLoading(true)
    ;(trpc.orcamento as unknown as { resumoOportunidade: { query: (i: { oportunidadeId: string }) => Promise<Resumo | null> } })
      .resumoOportunidade.query({ oportunidadeId })
      .then(setR).catch(() => setR(null)).finally(() => setLoading(false))
  }, [open, oportunidadeId])

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh]">
        <DialogHeaderIcon icon={Target} color="fuchsia">
          <DialogTitle>Resumo do CRM</DialogTitle>
          <DialogDescription>Card de CRM vinculado a este orçamento.</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Carregando...</div>
          ) : !r ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Card de CRM não encontrado.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold">{r.numero != null ? `#${r.numero} · ` : ''}{r.titulo}</h3>
                {r.etapa && (
                  <Badge variant="outline" className={`mt-1 text-[10px] ${r.ehGanho ? 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' : r.ehPerda ? 'border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400' : ''}`}>
                    {r.etapa}
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Cliente</p><p className="font-medium">{r.cliente ?? '—'}</p></div>
                <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Valor</p><p className="font-medium tabular-nums">{r.valor != null ? brl(r.valor) : '—'}</p></div>
                <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Responsável</p><p className="font-medium">{r.responsavel ?? '—'}</p></div>
                <div><p className="text-[11px] uppercase tracking-wider text-muted-foreground">Criado em</p><p className="font-medium">{dt(r.createdAt)}</p></div>
              </div>

              {/* #HLP0353 — a descrição do card é HTML do RichEditor, então sai
                  por RichContent (nunca `prose`, que é inerte neste projeto). */}
              {!semConteudo(r.descricao) && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Descrição do card</p>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <RichContent html={r.descricao!} />
                  </div>
                </div>
              )}

              {r.mensagens.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                    Anotações do card
                    <span className="ml-1.5 normal-case tracking-normal text-muted-foreground/70">
                      ({r.mensagens.length} mais recente{r.mensagens.length === 1 ? '' : 's'})
                    </span>
                  </p>
                  <div className="space-y-2">
                    {r.mensagens.map(m => (
                      <div key={m.id} className="rounded-md border bg-card p-2.5">
                        <p className="whitespace-pre-line text-xs leading-relaxed text-foreground">{m.mensagem}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {m.autor ?? 'Sistema'} · {new Date(m.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(semConteudo(r.descricao) && r.mensagens.length === 0) && (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                  Este card não tem descrição nem anotações — só o histórico de alterações abaixo.
                </p>
              )}

              {r.eventos.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Atividade recente</p>
                  <div className="space-y-2">
                    {r.eventos.map(ev => (
                      <div key={ev.id} className="flex items-start gap-2 text-xs">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-fuchsia-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-foreground">{ev.descricao}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(ev.createdAt).toLocaleString('pt-BR')}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
