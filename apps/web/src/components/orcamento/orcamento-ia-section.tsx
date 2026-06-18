'use client'

import { useRef, useState } from 'react'
import { Sparkles, Send, Loader2, Wand2, Copy, Check, FileText, RotateCcw } from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { alerts } from '@/lib/alerts'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

const ACOES_RAPIDAS = [
  { label: 'Analisar e redigir proposta', prompt: 'Analise este orçamento (itens, valores, condições e o histórico do cliente) e redija o texto completo da proposta para enviar ao cliente. Use HTML simples (parágrafos, negrito).' },
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
  const scrollRef = useRef<HTMLDivElement>(null)

  function scrollToBottom() {
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  async function enviar(texto: string) {
    const conteudo = texto.trim()
    if (!conteudo || streaming) return

    const base: ChatMsg[] = [...mensagens, { role: 'user', content: conteudo }]
    // adiciona um balão vazio do assistant que será preenchido pelo stream
    setMensagens([...base, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)
    setStatus('Conectando…')
    scrollToBottom()

    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')
      const res = await fetch(`${apiBase}/api/orcamentos/${orcamentoId}/ai-chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: base }),
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
    <div className="flex flex-col rounded-lg border bg-card" style={{ height: 'min(70vh, 640px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Assistente de proposta (IA)</p>
            <p className="text-xs text-muted-foreground leading-tight">Analisa o orçamento e o histórico e redige a proposta para o cliente</p>
          </div>
        </div>
        {mensagens.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMensagens([])} disabled={streaming} className="gap-1.5 shrink-0">
            <RotateCcw className="h-3.5 w-3.5" /> Limpar
          </Button>
        )}
      </div>

      {/* Conversa */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {vazio ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
              <Wand2 className="h-6 w-6" />
            </div>
            <div className="max-w-sm">
              <p className="text-sm font-medium">Peça para a IA analisar este orçamento</p>
              <p className="text-xs text-muted-foreground mt-1">Ela considera itens, valores, mensagens, anexos e o histórico de orçamentos anteriores do cliente para compor o texto da proposta.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {ACOES_RAPIDAS.slice(0, 1).map(a => (
                <Button key={a.label} size="sm" onClick={() => enviar(a.prompt)} disabled={streaming} className="gap-1.5 bg-violet-600 hover:bg-violet-700 text-white">
                  <Sparkles className="h-3.5 w-3.5" /> {a.label}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          mensagens.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'rounded-2xl px-4 py-2.5 max-w-[85%] text-sm',
                m.role === 'user'
                  ? 'bg-violet-600 text-white rounded-br-sm'
                  : 'bg-muted/60 rounded-bl-sm',
              )}>
                {m.role === 'assistant' ? (
                  m.content
                    ? (
                      <>
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1.5 [&_ul]:my-1.5 [&_li]:my-0.5"
                          dangerouslySetInnerHTML={{ __html: m.content }}
                        />
                        {!streaming && (
                          <div className="mt-2 flex items-center gap-1.5 border-t border-border/50 pt-2">
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                              onClick={() => { onAplicar(m.content); alerts.success('Texto aplicado', 'O texto foi enviado para o campo da proposta na aba Detalhes. Revise e salve.') }}>
                              <FileText className="h-3.5 w-3.5" /> Aplicar à proposta
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5" onClick={() => copiar(m.content, i)}>
                              {copiado === i ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                              {copiado === i ? 'Copiado' : 'Copiar'}
                            </Button>
                          </div>
                        )}
                      </>
                    )
                    : <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {status || 'Pensando…'}</span>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
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

      {/* Input */}
      <div className="flex items-end gap-2 border-t px-4 py-3">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(input) } }}
          placeholder="Peça uma análise ou ajuste no texto…  (Enter envia, Shift+Enter quebra linha)"
          rows={1}
          disabled={streaming}
          className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 max-h-32"
        />
        <Button size="icon" onClick={() => enviar(input)} disabled={streaming || !input.trim()} className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white">
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}
