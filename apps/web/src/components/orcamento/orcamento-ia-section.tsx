'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, Loader2, Wand2, Copy, Check, FileText, RotateCcw, Paperclip, X, Image as ImageIcon } from 'lucide-react'
import { marked } from 'marked'
import { Button, cn } from '@saas/ui'
import { alerts } from '@/lib/alerts'
import { trpc } from '@/lib/trpc'
import { MarkdownView } from '@/components/ui/markdown-view'

/** Converte a resposta (markdown ou HTML) em HTML, p/ aplicar no campo da proposta. */
function mdToHtml(s: string): string {
  try { return marked.parse(s || '', { async: false, gfm: true, breaks: true }) as string }
  catch { return s || '' }
}

type ChatMsg = { role: 'user' | 'assistant'; content: string }
type Anexo = { name: string; mediaType: string; kind: 'image' | 'pdf'; data: string; size: number }

const MAX_ANEXOS = 5
const MAX_MB = { image: 5, pdf: 20 }

/** Lê um File como base64 puro (sem o prefixo data:...;base64,). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      const c = s.indexOf(',')
      resolve(c >= 0 ? s.slice(c + 1) : s)
    }
    r.onerror = () => reject(new Error('Falha ao ler o arquivo'))
    r.readAsDataURL(file)
  })
}

// Espelha o MODEL do backend (OrcamentoAiService). Exibido no header do painel.
const MODELO_LABEL = 'Claude Sonnet 4.6'
const MODELO_ID = 'claude-sonnet-4-6'

// Cor do módulo Comercial (design system). Sólidos usam a var direta; tints
// suaves via color-mix. Nunca hardcodear cor de accent fora do token.
const MOD = 'var(--mod-comercial, #fb7185)'
const MOD_SOFT = 'color-mix(in srgb, var(--mod-comercial, #fb7185) 14%, transparent)'
const MOD_BORDER = 'color-mix(in srgb, var(--mod-comercial, #fb7185) 35%, transparent)'

const ACOES_RAPIDAS = [
  { label: 'Analisar e redigir proposta', prompt: 'Analise este orçamento (itens, valores, condições e o histórico do cliente) e redija o texto completo da proposta para enviar ao cliente. Formate em Markdown simples (parágrafos, negrito, listas) — sem HTML e sem blocos de código.' },
  { label: 'Mais formal', prompt: 'Reescreva a última proposta com um tom mais formal e institucional, mantendo as mesmas informações.' },
  { label: 'Mais direto', prompt: 'Reescreva a última proposta de forma mais curta e objetiva, indo direto ao ponto.' },
  { label: 'Destacar o desconto', prompt: 'Reescreva a última proposta destacando o desconto/condição comercial oferecida como um diferencial para o cliente.' },
]

const STATUS_LABEL: Record<string, string> = {
  preparando: 'Lendo o orçamento…',
  chamando_ia: 'Pensando…',
}

/**
 * Assistente de IA do orçamento — chat conversacional (Claude) que analisa o
 * orçamento + histórico e compõe o texto da proposta. Streaming via SSE sobre
 * fetch (POST /api/orcamentos/:id/ai-chat). "Aplicar à proposta" entrega o
 * HTML pro pai, que preenche o campo textoCorpoCliente pra revisão/salvamento.
 */
export function OrcamentoIaSection({ orcamentoId, onAplicar }: {
  orcamentoId: string
  onAplicar: (html: string) => void
}) {
  const [mensagens, setMensagens] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState('')
  const [copiado, setCopiado] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Carrega o histórico persistido do chat ao montar (persiste entre reloads/visitas).
  useEffect(() => {
    let vivo = true
    ;(trpc.orcamento as any).iaMensagens.query({ id: orcamentoId })
      .then((rows: { role: 'user' | 'assistant'; conteudo: string }[]) => {
        if (!vivo) return
        setMensagens((rows || []).map(r => ({ role: r.role, content: r.conteudo })))
      })
      .catch(() => {})
      .finally(() => { if (vivo) { setCarregando(false); scrollToBottom() } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamentoId])

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // permite re-selecionar o mesmo arquivo
    let count = anexos.length
    for (const f of files) {
      const isImg = f.type.startsWith('image/')
      const isPdf = f.type === 'application/pdf'
      if (!isImg && !isPdf) { alerts.error('Tipo não suportado', `"${f.name}": envie imagem ou PDF.`); continue }
      if (count >= MAX_ANEXOS) { alerts.error('Limite de anexos', `Máximo de ${MAX_ANEXOS} anexos por mensagem.`); break }
      const maxMb = isImg ? MAX_MB.image : MAX_MB.pdf
      if (f.size > maxMb * 1024 * 1024) { alerts.error('Arquivo muito grande', `"${f.name}": limite de ${maxMb}MB.`); continue }
      try {
        const data = await fileToBase64(f)
        const anexo: Anexo = { name: f.name, mediaType: f.type, kind: isImg ? 'image' : 'pdf', data, size: f.size }
        setAnexos(prev => (prev.length >= MAX_ANEXOS ? prev : [...prev, anexo]))
        count++
      } catch { alerts.error('Erro', `Não foi possível ler "${f.name}".`) }
    }
  }

  async function enviar(texto: string) {
    const conteudo = texto.trim()
    const anexosAtuais = anexos
    if ((!conteudo && anexosAtuais.length === 0) || streaming) return

    // Marcadores dos anexos no texto exibido/persistido (o binário só vai à API agora).
    const markers = anexosAtuais.map(a => `📎 ${a.name}`).join('\n')
    const conteudoExibido = [conteudo, markers].filter(Boolean).join('\n\n')

    const base: ChatMsg[] = [...mensagens, { role: 'user', content: conteudoExibido }]
    // adiciona um balão vazio do assistant que será preenchido pelo stream
    setMensagens([...base, { role: 'assistant', content: '' }])
    setInput('')
    setAnexos([])
    setStreaming(true)
    setStatus('Conectando…')
    scrollToBottom()

    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/orcamentos/${orcamentoId}/ai-chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: base,
          anexos: anexosAtuais.map(a => ({ name: a.name, mediaType: a.mediaType, kind: a.kind, data: a.data })),
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error(res.status === 401 ? 'Sessão expirada — recarregue a página.' : `Falha ao conectar (HTTP ${res.status}).`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let acumulado = ''

      const aplicarDelta = (txt: string) => {
        acumulado += txt
        setMensagens(prev => {
          const copia = [...prev]
          copia[copia.length - 1] = { role: 'assistant', content: acumulado }
          return copia
        })
        scrollToBottom()
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocos = buffer.split('\n\n')
        buffer = blocos.pop() || ''
        for (const bloco of blocos) {
          const linha = bloco.split('\n').find(l => l.startsWith('data: '))
          if (!linha) continue
          try {
            const ev = JSON.parse(linha.slice(6))
            if (ev.type === 'text') aplicarDelta(ev.text)
            else if (ev.type === 'status') setStatus(STATUS_LABEL[ev.stage] || ev.stage)
            else if (ev.type === 'done') setStatus('')
            else if (ev.type === 'error') throw new Error(ev.message)
          } catch (err) {
            // se foi erro de evento 'error', propaga; senão ignora linha inválida
            if (err instanceof Error && err.message && !err.message.includes('JSON')) throw err
          }
        }
      }

      if (!acumulado.trim()) {
        // nada veio — remove o balão vazio
        setMensagens(prev => prev.slice(0, -1))
        alerts.error('Sem resposta', 'A IA não retornou conteúdo. Verifique se a chave da API está configurada.')
      }
    } catch (e) {
      setMensagens(prev => prev.slice(0, -1)) // remove balão do assistant
      alerts.error('Erro no assistente', (e as Error).message)
    } finally {
      setStreaming(false)
      setStatus('')
    }
  }

  async function limparConversa() {
    const ok = await alerts.confirm({
      title: 'Limpar conversa',
      text: 'Apagar todo o histórico desta conversa com a IA? Esta ação não pode ser desfeita.',
      confirmText: 'Limpar',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.orcamento as any).limparIaChat.mutate({ id: orcamentoId })
      setMensagens([])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function copiar(texto: string, idx: number) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(idx)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      alerts.error('Erro', 'Não foi possível copiar.')
    }
  }

  const vazio = mensagens.length === 0

  return (
    <div className="flex flex-col h-full min-h-0 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3 pr-12">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: MOD_SOFT, color: MOD }}>
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold leading-tight">Assistente de proposta (IA)</p>
              <span
                title={`Modelo: ${MODELO_ID}`}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: MOD_SOFT, color: MOD, borderColor: MOD_BORDER }}
              >
                <Sparkles className="h-2.5 w-2.5" /> {MODELO_LABEL}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-tight">Analisa o orçamento e o histórico e redige a proposta para o cliente</p>
          </div>
        </div>
        {mensagens.length > 0 && (
          <Button variant="ghost" size="sm" onClick={limparConversa} disabled={streaming} className="gap-1.5 shrink-0">
            <RotateCcw className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </div>

      {/* Conversa */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {carregando ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : vazio ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: MOD_SOFT, color: MOD }}>
              <Wand2 className="h-6 w-6" />
            </div>
            <div className="max-w-sm">
              <p className="text-sm font-medium">Peça para a IA analisar este orçamento</p>
              <p className="text-xs text-muted-foreground mt-1">Ela considera itens, valores, mensagens, anexos e o histórico de orçamentos anteriores do cliente para compor o texto da proposta.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {ACOES_RAPIDAS.slice(0, 1).map(a => (
                <Button key={a.label} size="sm" onClick={() => enviar(a.prompt)} disabled={streaming} className="gap-1.5 text-white" style={{ backgroundColor: MOD }}>
                  <Sparkles className="h-3.5 w-3.5" /> {a.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          mensagens.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 max-w-[85%] text-sm',
                  m.role === 'user' ? 'text-white rounded-br-sm' : 'bg-muted/60 rounded-bl-sm',
                )}
                style={m.role === 'user' ? { backgroundColor: MOD } : undefined}
              >
                {m.role === 'assistant' ? (
                  !m.content
                    ? <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {status || 'Pensando…'}</span>
                    : (streaming && i === mensagens.length - 1)
                      // Enquanto digita: texto puro (sem reparse) p/ um streaming suave + cursor.
                      ? (
                        <div className="whitespace-pre-wrap break-words leading-relaxed">
                          {m.content}
                          <span className="ml-0.5 inline-block w-[2px] h-[1em] translate-y-[2px] animate-pulse rounded-sm" style={{ backgroundColor: MOD }} />
                        </div>
                      )
                      // Concluído: renderiza markdown/HTML formatado + ações.
                      : (
                        <>
                          <MarkdownView source={m.content} />
                          <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-2">
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5 hover:bg-muted" style={{ color: MOD }}
                              onClick={() => { onAplicar(mdToHtml(m.content)); alerts.success('Texto aplicado', 'O texto foi enviado para o campo da proposta na aba Detalhes. Revise e salve.') }}>
                              <FileText className="h-3.5 w-3.5" /> Aplicar à proposta
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => copiar(m.content, i)}>
                              {copiado === i ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                              {copiado === i ? 'Copiado' : 'Copiar'}
                            </Button>
                          </div>
                        </>
                      )
                ) : (
                  <span className="whitespace-pre-wrap break-words">{m.content}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Ações rápidas (quando já há conversa) */}
      {!vazio && (
        <div className="flex flex-wrap gap-1.5 border-t px-4 py-2">
          {ACOES_RAPIDAS.map(a => (
            <button key={a.label} type="button" onClick={() => enviar(a.prompt)} disabled={streaming}
              className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors">
              {a.label}
            </button>
          ))}
        </div>
      )}

      {/* Anexos pendentes (chips) */}
      {anexos.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-4 pt-2">
          {anexos.map((a, i) => (
            <span key={i} title={a.name} className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-[11px] max-w-[200px]">
              {a.kind === 'image' ? <ImageIcon className="h-3 w-3 shrink-0 text-sky-500" /> : <FileText className="h-3 w-3 shrink-0 text-rose-500" />}
              <span className="truncate">{a.name}</span>
              <button type="button" onClick={() => setAnexos(prev => prev.filter((_, j) => j !== i))} disabled={streaming} className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2 border-t px-4 py-3">
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onPickFiles} />
        <Button
          type="button" size="icon" variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={streaming || anexos.length >= MAX_ANEXOS}
          title={anexos.length >= MAX_ANEXOS ? `Máximo de ${MAX_ANEXOS} anexos` : 'Anexar imagem ou PDF'}
          className="shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(input) } }}
          placeholder="Peça uma análise ou ajuste no texto…  (Enter envia, Shift+Enter quebra linha)"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 max-h-32"
        />
        <Button size="icon" onClick={() => enviar(input)} disabled={streaming || (!input.trim() && anexos.length === 0)} className="shrink-0 text-white" style={{ backgroundColor: MOD }}>
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
