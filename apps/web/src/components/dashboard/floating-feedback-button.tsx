'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  Bug, Lightbulb, MessageSquare, X, Send, Loader2, Check, ExternalLink,
  ImagePlus, Paperclip, Plus, ChevronLeft, LifeBuoy, FileText, Search, Building2,
  CalendarPlus, Clock, Users,
} from 'lucide-react'
import { Button, cn, RichEditor } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'

/**
 * FAB ("Fale com a TI") — sempre visível no canto inferior direito.
 * Ao abrir, oferece dois serviços:
 *   • Ticket    → cria um chamado no Helpdesk (fluxo original).
 *   • Orçamento → solicita um novo orçamento ao comercial (cliente + detalhamento).
 */

type Tipo = 'INCIDENTE' | 'MELHORIA' | 'DUVIDA'
type Mode = 'menu' | 'ticket' | 'orcamento' | 'evento'

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
  const [mode, setMode] = useState<Mode>('menu')
  // Direção da transição entre telas: 'fwd' (menu → serviço) entra pela direita,
  // 'back' (serviço → menu) entra pela esquerda. Usado pela animação do corpo.
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')

  /** Troca de tela com direção da animação inferida (menu = raiz). */
  function goTo(next: Mode) {
    setDir(next === 'menu' ? 'back' : 'fwd')
    setMode(next)
  }
  // Começa SEM tipo — o usuário é obrigado a escolher um (nada vem marcado).
  const [tipo, setTipo] = useState<Tipo | null>(null)
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

  // Auto-foca no textarea ao entrar no formulário de ticket
  useEffect(() => {
    if (open && mode === 'ticket' && !ticketCriado) {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open, mode, ticketCriado])

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      // Aguarda animação de saída antes de resetar (evita "piscar" no fechamento)
      const t = setTimeout(() => {
        if (!open) {
          setMode('menu')
          setTexto('')
          setTipo(null)
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
    if (!tipo) {
      alerts.error('Selecione o tipo do chamado (Erro, Sugestão ou Outro)')
      return
    }
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

  // Cor do header/ícones por serviço selecionado
  const accent = mode === 'orcamento' ? 'var(--mod-comercial, #fb7185)' : mode === 'evento' ? 'var(--mod-administrativo, #38bdf8)' : 'var(--mod-ti, #22d3ee)'

  return (
    <>
      {/* Botão flutuante (FAB) */}
      <button
        id="floating-feedback-button"
        type="button"
        onClick={() => setOpenAnimated(!open)}
        aria-label="Fale com a TI"
        title="Abrir solicitação (ticket ou orçamento)"
        className={cn(
          // z-[60] mantém o FAB acima de Sheets/Dialogs (z-50) — o usuário
          // pode disparar 'Fale com a TI' mesmo com um modal aberto, ex.
          // pra reportar bug que descobriu no próprio modal.
          // pointer-events-auto: Radix Sheet/Dialog aplica pointer-events:
          // none no body quando aberto pra absorver cliques no overlay;
          // sem isso o click no FAB 'atravessa' pro elemento abaixo.
          'fixed bottom-5 right-5 lg:right-16 z-[60] pointer-events-auto h-12 w-12 rounded-full shadow-lg',
          'flex items-center justify-center text-white',
          'bg-[var(--mod-ti,#22d3ee)] hover:scale-105 active:scale-95',
          'transition-all duration-200 ease-out',
          open && 'ring-2 ring-offset-2 ring-[var(--mod-ti,#22d3ee)] ring-offset-background rotate-[135deg]',
        )}
      >
        {/* Crossfade entre os 2 ícones — '+' (fechado) ↔ 'X' (aberto) */}
        <span className="relative h-5 w-5">
          <Plus
            className={cn(
              'absolute inset-0 h-5 w-5 transition-all duration-200',
              open ? 'opacity-0 scale-50' : 'opacity-100 scale-100',
            )}
          />
          <X
            className={cn(
              'absolute inset-0 h-5 w-5 transition-all duration-200',
              open ? 'opacity-100 scale-100 -rotate-[135deg]' : 'opacity-0 scale-50',
            )}
          />
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div
          ref={popoverRef}
          className={cn(
            // Popover acompanha o FAB (z-[60] + pointer-events-auto) —
            // fica acima de modais e recebe cliques normalmente.
            'fixed bottom-20 right-5 lg:right-16 z-[60] pointer-events-auto w-[360px] max-w-[calc(100vw-2.5rem)]',
            'rounded-lg border border-border bg-card shadow-2xl overflow-hidden',
            // Transição manual (origin no canto inferior direito = "sai do botão FAB").
            'origin-bottom-right transition-all duration-200 ease-out',
            entered
              ? 'opacity-100 scale-100 translate-y-0'
              : 'opacity-0 scale-95 translate-y-2',
          )}
          style={{ willChange: 'transform, opacity' }}
        >
          {/* Header */}
          {!(mode === 'ticket' && ticketCriado) && (
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
              {mode !== 'menu' && (
                <button
                  type="button"
                  onClick={() => goTo('menu')}
                  className="h-6 w-6 -ml-1 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Voltar"
                  aria-label="Voltar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {mode === 'menu' ? 'Criar Novo' : mode === 'ticket' ? 'Abrir ticket' : mode === 'evento' ? 'Novo evento' : 'Solicitar orçamento'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {mode === 'menu'
                    ? 'O que você precisa hoje?'
                    : mode === 'ticket'
                      ? 'Criamos um ticket no Helpdesk pra você'
                      : mode === 'evento'
                        ? 'Adiciona um evento na agenda corporativa'
                        : 'Enviamos sua solicitação ao comercial'}
                </div>
              </div>
            </div>
          )}

          {/* Corpo das telas — anima a cada troca de `mode` (key força remount).
              Avança (fwd) entra pela direita; volta (back), pela esquerda. */}
          <div
            key={mode}
            className={cn(
              'animate-in fade-in-0 duration-200 ease-out',
              dir === 'fwd' ? 'slide-in-from-right-5' : 'slide-in-from-left-5',
            )}
          >
          {/* ── Menu: escolha do serviço ── */}
          {mode === 'menu' && (
            <div className="p-3 grid grid-cols-3 gap-2.5">
              <ServiceCard
                icon={LifeBuoy}
                title="Ticket"
                color="var(--mod-ti, #22d3ee)"
                onClick={() => goTo('ticket')}
              />
              <ServiceCard
                icon={FileText}
                title="Orçamento"
                color="var(--mod-comercial, #fb7185)"
                onClick={() => goTo('orcamento')}
              />
              <ServiceCard
                icon={CalendarPlus}
                title="Evento"
                color="var(--mod-administrativo, #38bdf8)"
                onClick={() => goTo('evento')}
              />
            </div>
          )}

          {/* ── Ticket (fluxo original) ── */}
          {mode === 'ticket' && (
            ticketCriado ? (
              <SuccessState
                titulo={`Ticket #${String(ticketCriado.numero).padStart(4, '0')} criado`}
                subtitulo="O time da TI já recebeu sua mensagem."
                href={`/helpdesk/${ticketCriado.id}`}
                ctaLabel="Ver ticket"
                color="var(--mod-ti, #22d3ee)"
                onClose={() => setOpenAnimated(false)}
              />
            ) : (
              <>
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
                  <Button variant="outline" size="sm" onClick={() => setOpenAnimated(false)} disabled={enviando}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleEnviar}
                    disabled={enviando || !texto.trim() || !tipo}
                    className="gap-1.5 text-white"
                    style={{ background: 'var(--mod-ti, #22d3ee)' }}
                  >
                    {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Enviar
                  </Button>
                </div>
              </>
            )
          )}

          {/* ── Orçamento (solicitação ao comercial) ── */}
          {mode === 'orcamento' && (
            <OrcamentoRequestForm
              accent={accent}
              onCancel={() => setOpenAnimated(false)}
              onClose={() => setOpenAnimated(false)}
            />
          )}

          {/* ── Evento (cria direto na agenda corporativa) ── */}
          {mode === 'evento' && (
            <EventoRequestForm
              accent={accent}
              onCancel={() => setOpenAnimated(false)}
              onClose={() => setOpenAnimated(false)}
            />
          )}
          </div>
        </div>
      )}
    </>
  )
}

/** Cartão de serviço no menu inicial. */
function ServiceCard({
  icon: Icon, title, color, onClick,
}: {
  icon: typeof Bug; title: string; color: string; onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted/30',
        'px-3 py-5 text-center transition-all hover:bg-muted hover:border-foreground/20 hover:-translate-y-0.5',
      )}
    >
      <span
        className="h-11 w-11 rounded-full flex items-center justify-center text-white shadow-sm transition-transform group-hover:scale-110"
        style={{ background: color }}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="text-sm font-semibold text-foreground">{title}</div>
    </button>
  )
}

interface ClienteOpcao { id: string; razaoSocial: string; nomeFantasia: string | null; documento: string }

/** Formulário de solicitação de orçamento ao comercial — cliente + detalhamento. */
function OrcamentoRequestForm({
  accent, onCancel, onClose,
}: {
  accent: string; onCancel: () => void; onClose: () => void
}) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ClienteOpcao[]>([])
  const [buscando, setBuscando] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [clienteSel, setClienteSel] = useState<ClienteOpcao | null>(null)
  const [detalhamento, setDetalhamento] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [criado, setCriado] = useState<{ numero: number; id: string } | null>(null)
  // Áreas envolvidas — pills (cada área marcada notifica o líder pra detalhar a parte dela).
  const [areasDisp, setAreasDisp] = useState<Array<{ areaId: string; nome: string }>>([])
  const [areasSel, setAreasSel] = useState<string[]>([])
  useEffect(() => {
    (trpc.orcamento as any).listAreasSelecionaveis.query()
      .then((d: Array<{ areaId: string; nome: string }>) => setAreasDisp(d))
      .catch(() => setAreasDisp([]))
  }, [])

  // Anexos (múltiplos, drag-and-drop) — mesmo padrão do balão de ticket.
  const [anexos, setAnexos] = useState<AnexoPendente[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadAnexo(file: File): Promise<void> {
    const placeholderId = crypto.randomUUID()
    setAnexos(prev => [...prev, { id: placeholderId, fileName: file.name, fileUrl: '', mimeType: file.type || 'application/octet-stream', tamanho: file.size, uploading: true }])
    try {
      const fd = new FormData()
      fd.append('file', file, file.name)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const data = await res.json() as { url: string }
      setAnexos(prev => prev.map(a => a.id === placeholderId ? { ...a, fileUrl: data.url, uploading: false } : a))
    } catch (e) {
      setAnexos(prev => prev.filter(a => a.id !== placeholderId))
      alerts.error('Erro ao anexar', (e as Error).message)
    }
  }
  function addFiles(files: FileList | File[]) { for (const f of Array.from(files)) void uploadAnexo(f) }
  function removerAnexo(id: string) { setAnexos(prev => prev.filter(a => a.id !== id)) }

  // Busca de clientes (debounced) — só dispara enquanto não há cliente escolhido.
  useEffect(() => {
    if (clienteSel) return
    const termo = busca.trim()
    if (termo.length < 2) { setResultados([]); return }
    setBuscando(true)
    const t = setTimeout(async () => {
      try {
        const data = await trpc.orcamento.buscarClientes.query({ search: termo })
        setResultados(data as ClienteOpcao[])
        setDropdownOpen(true)
      } catch {
        setResultados([])
      } finally {
        setBuscando(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [busca, clienteSel])

  function escolherCliente(c: ClienteOpcao) {
    setClienteSel(c)
    setBusca(c.razaoSocial)
    setDropdownOpen(false)
  }

  function limparCliente() {
    setClienteSel(null)
    setBusca('')
    setResultados([])
  }

  // RichEditor entrega HTML — valida o texto puro (evita aceitar "<p></p>" vazio).
  const detTexto = detalhamento.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim()

  async function handleEnviar() {
    const det = detalhamento.trim()
    const nome = busca.trim()
    if (!clienteSel && !nome) {
      alerts.error('Informe o cliente', 'Selecione um cliente cadastrado ou digite o nome.')
      return
    }
    if (detTexto.length < 3) {
      alerts.error('Detalhe a solicitação', 'Descreva o que o comercial precisa orçar.')
      return
    }
    if (anexos.some(a => a.uploading)) {
      alerts.error('Aguarde', 'Ainda enviando anexo(s)...')
      return
    }
    setEnviando(true)
    try {
      const anexosProntos = anexos.filter(a => !a.uploading && a.fileUrl)
      const res = await trpc.orcamento.solicitar.mutate({
        clienteId: clienteSel?.id ?? null,
        clienteNome: clienteSel ? null : nome,
        detalhamento: det,
        areaIds: areasSel,
        anexos: anexosProntos.map(a => ({ fileName: a.fileName, fileUrl: a.fileUrl, fileSize: a.tamanho, mimeType: a.mimeType })),
      }) as { id: string; numero: number }
      setCriado({ numero: res.numero, id: res.id })
    } catch (e) {
      alerts.error('Erro ao enviar', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (criado) {
    return (
      <SuccessState
        titulo={`Solicitação enviada · #${String(criado.numero).padStart(4, '0')}`}
        subtitulo="O comercial já recebeu seu pedido de orçamento."
        href={`/orcamentos/${criado.id}`}
        ctaLabel="Ver orçamento"
        color={accent}
        onClose={onClose}
      />
    )
  }

  return (
    <>
      <div className="px-4 py-3 space-y-3">
        {/* Cliente */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground">Cliente</label>
          {clienteSel ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 h-9">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground truncate flex-1">{clienteSel.razaoSocial}</span>
              <button
                type="button"
                onClick={limparCliente}
                className="h-5 w-5 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Trocar cliente"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setDropdownOpen(true) }}
                  onFocus={() => { if (resultados.length) setDropdownOpen(true) }}
                  placeholder="Buscar cliente ou digitar o nome..."
                  className="w-full h-9 rounded-md border border-border bg-background pl-8 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {buscando && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {dropdownOpen && resultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-44 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                  {resultados.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => escolherCliente(c)}
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b border-border last:border-0"
                    >
                      <div className="text-sm text-foreground truncate">{c.razaoSocial}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {c.nomeFantasia ? `${c.nomeFantasia} · ` : ''}{c.documento}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                Cliente não cadastrado? Digite o nome — cadastramos automaticamente como prospect.
              </p>
            </div>
          )}
        </div>

        {/* Detalhamento (RichEditor — aceita formatação HTML) */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground">Detalhamento</label>
          <RichEditor
            value={detalhamento}
            onChange={setDetalhamento}
            placeholder="Quais serviços/itens orçar, contexto, prazo desejado..."
          />
        </div>

        {/* Anexos (múltiplos, drag-and-drop) */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground">Anexos</label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files) }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'rounded-md border border-dashed px-3 py-3 text-center cursor-pointer transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
            )}
          >
            <ImagePlus className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[11px] text-muted-foreground">Arraste arquivos aqui ou clique para anexar</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = '' }}
            />
          </div>
          {anexos.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {anexos.map(a => (
                <div key={a.id} className="relative h-16 w-16 rounded-md border border-border bg-muted/40 overflow-hidden group/anx" title={a.fileName}>
                  {a.uploading ? (
                    <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                  ) : a.mimeType.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAssetUrl(a.fileUrl)} alt={a.fileName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-1">
                      <Paperclip className="h-5 w-5" />
                      <span className="text-[8px] truncate w-full text-center mt-0.5">{a.fileName.split('.').pop()?.toUpperCase()}</span>
                    </div>
                  )}
                  {!a.uploading && (
                    <button type="button" onClick={() => removerAnexo(a.id)} className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover/anx:opacity-100 transition-opacity" title="Remover">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Áreas envolvidas (pills) — marca quem precisa detalhar a parte dela */}
        {areasDisp.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground">Áreas envolvidas</label>
            <div className="flex flex-wrap gap-1.5">
              {areasDisp.map((a) => {
                const sel = areasSel.includes(a.areaId)
                return (
                  <button
                    key={a.areaId}
                    type="button"
                    onClick={() => setAreasSel((s) => (sel ? s.filter((x) => x !== a.areaId) : [...s, a.areaId]))}
                    className={cn(
                      'px-2.5 h-7 rounded-full text-xs font-medium border transition-colors',
                      sel ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    style={sel ? { background: accent } : undefined}
                  >
                    {a.nome}
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">Cada área marcada notifica o líder responsável para detalhar a parte dele.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={handleEnviar}
          disabled={enviando || detTexto.length < 3 || (!clienteSel && !busca.trim()) || anexos.some(a => a.uploading)}
          className="gap-1.5 text-white"
          style={{ background: accent }}
        >
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Solicitar
        </Button>
      </div>
    </>
  )
}

/** Formulário rápido de criação de evento na agenda corporativa. */
function EventoRequestForm({
  accent, onCancel, onClose,
}: {
  accent: string; onCancel: () => void; onClose: () => void
}) {
  const hojeStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  const [titulo, setTitulo] = useState('')
  const [tipos, setTipos] = useState<Array<{ id: string; nome: string; cor: string }>>([])
  const [tipoId, setTipoId] = useState('')
  const [data, setData] = useState(hojeStr)
  const [diaInteiro, setDiaInteiro] = useState(false)
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [horaFim, setHoraFim] = useState('10:00')
  const [descricao, setDescricao] = useState('')
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string }>>([])
  const [buscaUser, setBuscaUser] = useState('')
  const [participantes, setParticipantes] = useState<Array<{ id: string; name: string }>>([])
  const [userDropdown, setUserDropdown] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [criado, setCriado] = useState<{ id: string; titulo: string } | null>(null)

  useEffect(() => {
    (trpc.agenda as any).listTipos.query().then((d: Array<{ id: string; nome: string; cor: string }>) => { setTipos(d); if (d[0]) setTipoId(d[0].id) }).catch(() => setTipos([]))
    ;(trpc.agenda as any).listUsuarios.query().then((d: Array<{ id: string; name: string }>) => setUsuarios(d)).catch(() => setUsuarios([]))
  }, [])

  const usuariosFiltrados = buscaUser.trim()
    ? usuarios.filter(u => u.name.toLowerCase().includes(buscaUser.trim().toLowerCase()) && !participantes.some(p => p.id === u.id)).slice(0, 6)
    : []

  async function handleCriar() {
    if (titulo.trim().length < 1) return alerts.error('Informe o título', 'Dê um nome ao evento.')
    if (!tipoId) return alerts.error('Selecione o tipo', 'Escolha o tipo do evento.')
    if (!data) return alerts.error('Informe a data', 'Selecione a data do evento.')
    setEnviando(true)
    try {
      const res = await (trpc.agenda as any).create.mutate({
        titulo: titulo.trim(),
        tipoId,
        data,
        diaInteiro,
        horaInicio: diaInteiro ? null : horaInicio,
        horaFim: diaInteiro ? null : horaFim,
        descricao: descricao.trim() || null,
        participanteIds: participantes.map(p => p.id),
      }) as { id: string }
      setCriado({ id: res.id, titulo: titulo.trim() })
    } catch (e) {
      alerts.error('Erro ao criar evento', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (criado) {
    return (
      <SuccessState
        titulo="Evento criado"
        subtitulo={`"${criado.titulo}" foi adicionado à agenda.`}
        href="/agenda"
        ctaLabel="Ver na agenda"
        color={accent}
        onClose={onClose}
      />
    )
  }

  return (
    <>
      <div className="px-4 py-3 space-y-3">
        {/* Título */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground">Título</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Nome do evento" className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>

        {/* Tipo + Data */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground">Tipo</label>
            <select value={tipoId} onChange={e => setTipoId(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
              {tipos.length === 0 && <option value="">—</option>}
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground">Data</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} className="w-full h-9 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
        </div>

        {/* Horário / dia inteiro */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Horário</label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={diaInteiro} onChange={e => setDiaInteiro(e.target.checked)} className="h-3.5 w-3.5 rounded border-border" /> Dia inteiro
            </label>
          </div>
          {!diaInteiro && (
            <div className="flex items-center gap-2">
              <input type="time" value={horaInicio} onChange={e => { setHoraInicio(e.target.value); if (e.target.value >= horaFim) { const [h, m] = e.target.value.split(':'); setHoraFim(`${String((Number(h) + 1) % 24).padStart(2, '0')}:${m}`) } }} className="h-9 rounded-md border border-border bg-background px-2 text-sm flex-1" />
              <span className="text-muted-foreground text-sm">—</span>
              <input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-sm flex-1" />
            </div>
          )}
        </div>

        {/* Participantes */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Participantes</label>
          {participantes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {participantes.map(p => (
                <span key={p.id} className="inline-flex items-center gap-1 pl-2 pr-1 h-6 rounded-full bg-muted text-xs">
                  {p.name}
                  <button type="button" onClick={() => setParticipantes(s => s.filter(x => x.id !== p.id))} className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-rose-500 hover:text-white"><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input value={buscaUser} onChange={e => { setBuscaUser(e.target.value); setUserDropdown(true) }} onFocus={() => setUserDropdown(true)} placeholder="Adicionar participante..." className="w-full h-9 rounded-md border border-border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            {userDropdown && usuariosFiltrados.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-h-40 overflow-auto rounded-md border border-border bg-popover shadow-lg">
                {usuariosFiltrados.map(u => (
                  <button key={u.id} type="button" onClick={() => { setParticipantes(s => [...s, u]); setBuscaUser(''); setUserDropdown(false) }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted">{u.name}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Descrição */}
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground">Descrição</label>
          <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} placeholder="Detalhes do evento (opcional)..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={enviando}>Cancelar</Button>
        <Button size="sm" onClick={handleCriar} disabled={enviando || !titulo.trim() || !tipoId} className="gap-1.5 text-white" style={{ background: accent }}>
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
          Criar evento
        </Button>
      </div>
    </>
  )
}

/** Tela de sucesso genérica (ticket ou orçamento). */
function SuccessState({
  titulo, subtitulo, href, ctaLabel, color, onClose,
}: {
  titulo: string; subtitulo: string; href: string; ctaLabel: string; color: string; onClose: () => void
}) {
  return (
    <div className="px-4 py-6 flex flex-col items-center text-center gap-3">
      <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
        <Check className="h-6 w-6" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{titulo}</div>
        <div className="text-[12px] text-muted-foreground">{subtitulo}</div>
      </div>
      <div className="flex gap-2 w-full">
        <Button variant="outline" size="sm" onClick={onClose} className="flex-1">
          Fechar
        </Button>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium text-white"
          style={{ background: color }}
        >
          {ctaLabel} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
