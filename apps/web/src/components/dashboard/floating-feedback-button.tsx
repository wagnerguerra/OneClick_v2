'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  MessageCircle, Bug, Lightbulb, MessageSquare, X, Send, Loader2, Check, ExternalLink,
  ImagePlus, Paperclip,
} from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'

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

interface AnexoPendente {
  id: string
  fileName: string
  fileUrl: string       // relativo, ex: /api/upload/uuid.png
  mimeType: string
  tamanho: number
  uploading?: boolean
}

export function FloatingFeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // `entered`: estado de animação. false = invisível (mounting OR closing),
  // true = totalmente aberto. Permite controlar entrada (false→true após mount)
  // e saída (true→false antes do unmount em 200ms).
  const [entered, setEntered] = useState(false)
  const [tipo, setTipo] = useState<Tipo>('INCIDENTE')
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<AnexoPendente[]>([])
  const [enviando, setEnviando] = useState(false)
  const [ticketCriado, setTicketCriado] = useState<{ numero: number; id: string; hash: string } | null>(null)

  const popoverRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Toggle com animação de entrada/saída — atrasa o unmount em 200ms pra rolar o fade-out. */
  function setOpenAnimated(next: boolean) {
    if (next) {
      setOpen(true)
      // Começa visível (entered=false) e dispara entered=true no próximo frame
      // pra CSS aplicar a transição. Sem isso, mounta já no estado "aberto"
      // e a animação de entrada não aparece.
      setEntered(false)
      requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)))
    } else if (open) {
      setEntered(false)
      setTimeout(() => setOpen(false), 200)
    }
  }

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        // Não fecha se o clique foi no botão FAB (que tem onClick próprio pra toggle)
        const fabBtn = document.getElementById('floating-feedback-button')
        if (fabBtn?.contains(e.target as Node)) return
        setOpenAnimated(false)
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
          setAnexos([])
          setTicketCriado(null)
          setEnviando(false)
        }
      }, 250)
      return () => clearTimeout(t)
    }
  }, [open])

  /**
   * Upload de um arquivo (imagem do paste ou file picker) → POST /api/upload.
   * Aceita File ou Blob (paste do clipboard vem como Blob sem nome).
   */
  async function uploadFile(file: File | Blob, fallbackName?: string): Promise<AnexoPendente | null> {
    const fileName = (file as File).name || fallbackName || `print-${Date.now()}.png`
    const mimeType = file.type || 'image/png'
    const placeholderId = crypto.randomUUID()
    // Adiciona placeholder com flag uploading=true (mostra spinner no thumbnail)
    setAnexos(prev => [...prev, {
      id: placeholderId,
      fileName,
      fileUrl: '',
      mimeType,
      tamanho: file.size,
      uploading: true,
    }])
    try {
      const fd = new FormData()
      fd.append('file', file, fileName)
      const res = await fetch(`${getApiUrl()}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const data = await res.json() as { url: string; filename: string }
      const final: AnexoPendente = {
        id: placeholderId,
        fileName,
        fileUrl: data.url,
        mimeType,
        tamanho: file.size,
      }
      setAnexos(prev => prev.map(a => a.id === placeholderId ? final : a))
      return final
    } catch (e) {
      setAnexos(prev => prev.filter(a => a.id !== placeholderId))
      alerts.error('Erro ao enviar imagem', (e as Error).message)
      return null
    }
  }

  /** Captura Ctrl+V de imagem do clipboard (prints colados direto no textarea). */
  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items
    if (!items) return
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()  // evita colar nome de arquivo no texto
        const blob = item.getAsFile()
        if (blob) {
          const ext = item.type.split('/')[1] || 'png'
          uploadFile(blob, `print-${Date.now()}.${ext}`)
        }
      }
    }
  }

  /** Botão "anexar imagem" pra quem não sabe usar Ctrl+V. */
  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    for (const f of files) uploadFile(f)
    e.target.value = ''  // permite re-selecionar o mesmo arquivo
  }

  function removerAnexo(id: string) {
    setAnexos(prev => prev.filter(a => a.id !== id))
  }

  async function handleEnviar() {
    if (!texto.trim()) {
      alerts.error('Descreva o que aconteceu')
      return
    }
    // Bloqueia envio enquanto upload de algum anexo está em andamento
    if (anexos.some(a => a.uploading)) {
      alerts.error('Aguarde', 'Ainda enviando imagem(ns) anexada(s)...')
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

      // Anexa as imagens enviadas (paste/upload) ao ticket recém-criado.
      // Roda em paralelo — falhas são logadas mas não impedem o sucesso geral.
      const anexosProntos = anexos.filter(a => !a.uploading && a.fileUrl)
      if (anexosProntos.length > 0) {
        await Promise.allSettled(
          anexosProntos.map(a =>
            trpc.helpdesk.addAnexo.mutate({
              ticketId: ticket.id,
              fileName: a.fileName,
              fileUrl: a.fileUrl,
              mimeType: a.mimeType,
              tamanho: a.tamanho,
            }),
          ),
        )
      }

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
        onClick={() => setOpenAnimated(!open)}
        aria-label="Fale com a TI"
        title="Reportar erro, sugestão ou mensagem"
        className={cn(
          // z-[60] mantém o FAB acima de Sheets/Dialogs (z-50) — o usuário
          // pode disparar 'Fale com a TI' mesmo com um modal aberto, ex.
          // pra reportar bug que descobriu no próprio modal.
          'fixed bottom-5 right-5 z-[60] h-12 w-12 rounded-full shadow-lg',
          'flex items-center justify-center text-white',
          'bg-[var(--mod-ti,#22d3ee)] hover:scale-105 active:scale-95',
          'transition-all duration-200 ease-out',
          open && 'ring-2 ring-offset-2 ring-[var(--mod-ti,#22d3ee)] ring-offset-background rotate-90',
        )}
      >
        {/* Crossfade entre os 2 ícones — fica mais suave que troca direta */}
        <span className="relative h-5 w-5">
          <MessageCircle
            className={cn(
              'absolute inset-0 h-5 w-5 transition-all duration-200',
              open ? 'opacity-0 scale-50 rotate-90' : 'opacity-100 scale-100 rotate-0',
            )}
          />
          <X
            className={cn(
              'absolute inset-0 h-5 w-5 transition-all duration-200',
              open ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90',
            )}
          />
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className={cn(
            // Popover acompanha o FAB (z-[60]) — fica acima de modais.
            'fixed bottom-20 right-5 z-[60] w-[360px] max-w-[calc(100vw-2.5rem)]',
            'rounded-lg border border-border bg-card shadow-2xl overflow-hidden',
            // Transição manual (origin no canto inferior direito = "sai do botão FAB").
            // closing=true → animation reversa (fade-out + shrink + slide-down)
            'origin-bottom-right transition-all duration-200 ease-out',
            entered
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 translate-y-2',
          )}
          style={{ willChange: 'transform, opacity' }}
        >
          {ticketCriado ? (
            <SuccessState ticket={ticketCriado} onClose={() => setOpenAnimated(false)} />
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

              {/* Textarea + anexos */}
              <div className="px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleEnviar()
                    }
                  }}
                  rows={5}
                  placeholder="Descreva o que aconteceu ou sua sugestão... (cole prints com Ctrl+V)"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />

                {/* Thumbnails dos anexos */}
                {anexos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {anexos.map(a => (
                      <div
                        key={a.id}
                        className="relative h-16 w-16 rounded-md border border-border bg-muted/40 overflow-hidden group/anexo"
                        title={a.fileName}
                      >
                        {a.uploading ? (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : a.mimeType.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={resolveAssetUrl(a.fileUrl)}
                            alt={a.fileName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-1">
                            <Paperclip className="h-5 w-5" />
                            <span className="text-[8px] truncate w-full text-center mt-0.5">
                              {a.fileName.split('.').pop()?.toUpperCase()}
                            </span>
                          </div>
                        )}
                        {!a.uploading && (
                          <button
                            type="button"
                            onClick={() => removerAnexo(a.id)}
                            className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover/anexo:opacity-100 transition-opacity"
                            title="Remover"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    title="Anexar imagem"
                  >
                    <ImagePlus className="h-3 w-3" /> Anexar imagem
                  </button>
                  <span className="text-[10px] text-muted-foreground">Ctrl+Enter pra enviar</span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  📍 Inclui automaticamente: <code className="bg-muted px-1 rounded">{pathname || '/'}</code>
                </div>

                {/* Input file invisível controlado pelo botão acima */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFilePick}
                  className="hidden"
                />
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
