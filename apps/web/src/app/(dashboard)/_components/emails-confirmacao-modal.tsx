'use client'

/**
 * EmailsConfirmacaoModal — modal exibido após togglePasso quando o passo
 * concluído tem templates de e-mail que exigem confirmação.
 *
 * Cada template aparece como um card editável: usuário pode revisar o
 * conteúdo, ajustar destinatários, adicionar extras e marcar/desmarcar
 * para envio. Os e-mails são disparados via enviarEmailsDoPasso quando o
 * usuário clica em "Enviar selecionados". Se cancelar/pular, os e-mails
 * simplesmente não saem — o passo já foi marcado como concluído.
 */
import { useState, useEffect } from 'react'
import {
  Button, Checkbox, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { Mail, Send, X, Loader2, SkipForward } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

export interface EmailPendente {
  id: string
  nome: string
  assunto: string
  corpo: string
  destinatarios: string[]
}

interface Props {
  open: boolean
  execPassoId: string | null
  emails: EmailPendente[]
  onClose: () => void
  /** Callback após envio bem-sucedido (ou pulo). */
  onDone?: () => void
}

export function EmailsConfirmacaoModal({ open, execPassoId, emails, onClose, onDone }: Props) {
  // Estado por template: incluir?, destinatários (default+extras combinados).
  // Inicializa toda vez que `emails` muda (modal abrindo com nova lista).
  const [state, setState] = useState<Record<string, {
    included: boolean
    destinatarios: string[]
    extraDraft: string
  }>>({})
  const [sending, setSending] = useState(false)

  // Reinicia o state quando a modal abre com uma nova lista de e-mails.
  // emailsKey muda quando a identidade dos templates pendentes muda.
  const emailsKey = emails.map(e => e.id).join('|')
  useEffect(() => {
    if (!open) return
    const initial: typeof state = {}
    for (const e of emails) {
      initial[e.id] = { included: true, destinatarios: [...e.destinatarios], extraDraft: '' }
    }
    setState(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, emailsKey])

  function updateRow(id: string, patch: Partial<{ included: boolean; destinatarios: string[]; extraDraft: string }>) {
    setState(prev => ({ ...prev, [id]: { ...(prev[id] ?? { included: true, destinatarios: [], extraDraft: '' }), ...patch } }))
  }

  function removeDestinatario(id: string, idx: number) {
    const row = state[id]
    if (!row) return
    updateRow(id, { destinatarios: row.destinatarios.filter((_, i) => i !== idx) })
  }

  function commitDraft(id: string) {
    const row = state[id]
    if (!row) return
    const raw = row.extraDraft.trim().replace(/[,;]+$/, '')
    if (!raw) { updateRow(id, { extraDraft: '' }); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      alerts.error('E-mail inválido', `"${raw}" não é um e-mail válido.`)
      return
    }
    if (row.destinatarios.includes(raw)) { updateRow(id, { extraDraft: '' }); return }
    updateRow(id, { destinatarios: [...row.destinatarios, raw], extraDraft: '' })
  }

  async function handleEnviar() {
    if (!execPassoId) return
    const selecionados = emails.filter(e => state[e.id]?.included)
    if (selecionados.length === 0) {
      alerts.warning('Nenhum e-mail selecionado', 'Marque ao menos um modelo para enviar ou clique em "Pular envio".')
      return
    }
    // Coleta extras: e-mails que foram adicionados além dos destinatários originais.
    // O backend mescla destinatarios do template + extras. Para não duplicar,
    // mandamos como "extra" apenas o que não estava na lista padrão original.
    const extrasGlobais = new Set<string>()
    for (const e of selecionados) {
      const original = new Set(e.destinatarios)
      const atuais = state[e.id]?.destinatarios ?? []
      for (const d of atuais) {
        if (!original.has(d)) extrasGlobais.add(d)
      }
    }

    setSending(true)
    try {
      await (trpc.servico as any).enviarEmailsDoPasso.mutate({
        execPassoId,
        somenteTemplateIds: selecionados.map(e => e.id),
        extraDestinatarios: Array.from(extrasGlobais),
      })
      await alerts.success('E-mails enviados', `${selecionados.length} mensagem${selecionados.length > 1 ? 's' : ''} enviada${selecionados.length > 1 ? 's' : ''}.`)
      setState({})
      onDone?.()
      onClose()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSending(false)
    }
  }

  function handlePular() {
    setState({})
    onDone?.()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) { setState({}); onClose() } }}>
      <DialogContent className="sm:max-w-[680px] max-h-[88vh] overflow-y-auto">
        <DialogHeaderIcon icon={Mail} color="indigo">
          <DialogTitle>Confirmar envio de e-mails — passo concluído</DialogTitle>
          <DialogDescription>
            O passo foi marcado como concluído. Revise os e-mails abaixo antes de enviar. Você pode editar os destinatários ou pular o envio.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {emails.map(e => {
            const row = state[e.id] ?? { included: true, destinatarios: e.destinatarios, extraDraft: '' }
            return (
              <div
                key={e.id}
                className={cn(
                  'rounded-md border p-3 transition-colors',
                  row.included
                    ? 'border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/10'
                    : 'border-muted bg-muted/20 opacity-70',
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={row.included}
                    onCheckedChange={(v) => updateRow(e.id, { included: !!v })}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <h4 className="text-[13px] font-semibold text-foreground">{e.nome}</h4>
                      <p className="text-[12px] text-foreground mt-0.5">
                        <span className="font-semibold">Assunto:</span> {e.assunto}
                      </p>
                    </div>

                    {/* Corpo do e-mail (read-only, scrollable) */}
                    <div className="rounded border bg-card p-2.5 text-[11px] text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
                      {e.corpo}
                    </div>

                    {/* Destinatários: chips removíveis + input pra adicionar extras */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-muted-foreground">Destinatários</label>
                      <div
                        className="flex flex-wrap gap-1.5 items-center min-h-[32px] px-2 py-1 border border-input rounded-md bg-background text-sm focus-within:ring-1 focus-within:ring-ring cursor-text"
                        onClick={(ev) => {
                          const input = ev.currentTarget.querySelector('input') as HTMLInputElement | null
                          input?.focus()
                        }}
                      >
                        {row.destinatarios.map((email, i) => (
                          <span
                            key={`${email}-${i}`}
                            className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 pl-2 pr-1 py-0.5 text-[11px] font-medium"
                          >
                            {email}
                            <button
                              type="button"
                              onClick={(ev) => { ev.stopPropagation(); removeDestinatario(e.id, i) }}
                              className="rounded-full hover:bg-rose-200 dark:hover:bg-rose-900/50 p-0.5"
                              title="Remover"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                        <input
                          type="email"
                          value={row.extraDraft}
                          onChange={ev => updateRow(e.id, { extraDraft: ev.target.value })}
                          onKeyDown={ev => {
                            if (ev.key === 'Enter' || ev.key === ',' || ev.key === ';' || ev.key === 'Tab') {
                              if (row.extraDraft.trim()) {
                                ev.preventDefault()
                                commitDraft(e.id)
                              }
                            } else if (ev.key === 'Backspace' && !row.extraDraft && row.destinatarios.length > 0) {
                              ev.preventDefault()
                              removeDestinatario(e.id, row.destinatarios.length - 1)
                            }
                          }}
                          onBlur={() => { if (row.extraDraft.trim()) commitDraft(e.id) }}
                          placeholder={row.destinatarios.length === 0 ? 'Adicionar destinatário...' : 'Adicionar outro...'}
                          className="flex-1 min-w-[140px] border-none bg-transparent outline-none shadow-none p-0 py-0.5 h-auto rounded-none focus:border-none focus:shadow-none focus:outline-none text-[12px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {emails.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6 italic">
              Nenhum e-mail pendente de confirmação.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handlePular} disabled={sending} className="gap-1.5 mr-auto">
            <SkipForward className="h-4 w-4" /> Pular envio
          </Button>
          <Button
            size="sm"
            onClick={handleEnviar}
            disabled={sending || emails.length === 0}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar selecionados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
