'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  MessageCircle, Bug, Lightbulb, MessageSquare, X, Send, Loader2, Check, ExternalLink,
} from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/**
 * FAB ("Fale com a TI") — sempre visível no canto inferior direito.
 * Abre um popover compacto pra criar ticket de Helpdesk direto, sem precisar
 * navegar até o módulo. Captura URL atual automaticamente no corpo.
 */

type Tipo = 'INCIDENTE' | 'MELHORIA' | 'DUVIDA'

const TIPOS: Array<{ valor: Tipo; label: string; icon: typeof Bug; cor: string }> = [
  { valor: 'INCIDENTE', label: 'Erro',     icon: Bug,         cor: '#dc2626' },
  { valor: 'MELHORIA',  label: 'Sugestão', icon: Lightbulb,   cor: '#f59e0b' },
  { valor: 'DUVIDA',    label: 'Outro',    icon: MessageSquare, cor: '#3b82f6' },
]

export function FloatingFeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<Tipo>('INCIDENTE')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ticketCriado, setTicketCriado] = useState<{ numero: number; id: string; hash: string } | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        // Não fecha se o clique foi no botão FAB (que tem onClick próprio pra toggle)
        const fabBtn = document.getElementById('floating-feedback-button')
        if (fabBtn?.contains(e.target as Node)) return
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Auto-foca no textarea ao abrir
  useEffect(() => {
    if (open && !ticketCriado) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open, ticketCriado])

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      // Aguarda animação de saída antes de resetar (evita "piscar" no fechamento)
      const t = setTimeout(() => {
        if (!open) {
          setTexto('')
          setTipo('INCIDENTE')
          setTicketCriado(null)
          setEnviando(false)
        }
      }, 250)
      return () => clearTimeout(t)
    }
  }, [open])

  async function handleEnviar() {
    if (!texto.trim()) {
      alerts.error('Descreva o que aconteceu')
      return
    }
    setEnviando(true)
    try {
      const tipoLabel = TIPOS.find((t) => t.valor === tipo)?.label ?? 'Outro'
      // Título: primeira linha truncada (máx 80 chars) — depois o time da TI ajusta no triagem.
      // Mínimo 3 chars exigido pelo schema.
      const tituloBase = texto.trim().split('\n')[0]?.slice(0, 80) || 'Sem título'
      const titulo = `[${tipoLabel}] ${tituloBase}`
      // Corpo: descrição em HTML (compatível com RichEditor) + contexto da URL atual.
      const url = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'
      const textoEscapado = escapeHtml(texto.trim()).replace(/\n/g, '<br>')
      const descricao = `<p>${textoEscapado}</p><hr><p><small>📍 Página: <code>${escapeHtml(url)}</code></small></p>`

      const ticket = await trpc.helpdesk.create.mutate({
        titulo,
        descricao,
        tipo,
        prioridade: 'MEDIA',
        tags: ['fab-feedback'],
      }) as { id: string; numero: number; hash: string }

      setTicketCriado({ numero: ticket.numero, id: ticket.id, hash: ticket.hash })
    } catch (e) {
      alerts.error('Erro ao enviar: ' + (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      {/* Botão flutuante (FAB) */}
      <button
        id="floating-feedback-button"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Fale com a TI"
        title="Reportar erro, sugestão ou mensagem"
        className={cn(
          'fixed bottom-5 right-5 z-50 h-12 w-12 rounded-full shadow-lg transition-all',
          'flex items-center justify-center text-white',
          'bg-[var(--mod-ti,#22d3ee)] hover:scale-105 active:scale-95',
          open && 'ring-2 ring-offset-2 ring-[var(--mod-ti,#22d3ee)] ring-offset-background',
        )}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className="fixed bottom-20 right-5 z-50 w-[360px] max-w-[calc(100vw-2.5rem)] rounded-lg border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          {ticketCriado ? (
            <SuccessState ticket={ticketCriado} onClose={() => setOpen(false)} />
          ) : (
            <>
              {/* Header */}
              <div className="px-4 py-3 border-b border-border bg-muted/30">
                <div className="text-sm font-semibold text-foreground">Fale com a TI</div>
                <div className="text-[11px] text-muted-foreground">Criamos um ticket no Helpdesk pra você</div>
              </div>

              {/* Chips */}
              <div className="px-4 py-3 flex gap-2 border-b border-border">
                {TIPOS.map(({ valor, label, icon: Icon, cor }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setTipo(valor)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 h-8 px-2 rounded-md border text-[12px] font-medium transition-colors',
                      tipo === valor
                        ? 'border-foreground/30 bg-muted'
                        : 'border-border hover:bg-muted/60',
                    )}
                    style={tipo === valor ? { color: cor } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Textarea */}
              <div className="px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleEnviar()
                    }
                  }}
                  rows={5}
                  placeholder="Descreva o que aconteceu ou sua sugestão..."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-muted-foreground">
                    📍 Inclui automaticamente: <code className="bg-muted px-1 rounded">{pathname || '/'}</code>
                  </span>
                  <span className="text-[10px] text-muted-foreground">Ctrl+Enter pra enviar</span>
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={enviando}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleEnviar}
                  disabled={enviando || !texto.trim()}
                  className="gap-1.5 text-white"
                  style={{ background: 'var(--mod-ti, #22d3ee)' }}
                >
                  {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}

function SuccessState({ ticket, onClose }: { ticket: { numero: number; hash: string; id: string }; onClose: () => void }) {
  return (
    <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
      <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
        <Check className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">Ticket #{String(ticket.numero).padStart(4, '0')} criado</div>
        <div className="text-[12px] text-muted-foreground">O time da TI já recebeu sua mensagem.</div>
      </div>
      <div className="flex gap-2 w-full">
        <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
          Fechar
        </Button>
        <a
          href={`/helpdesk/${ticket.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium text-white"
          style={{ background: 'var(--mod-ti, #22d3ee)' }}
        >
          Ver ticket <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
