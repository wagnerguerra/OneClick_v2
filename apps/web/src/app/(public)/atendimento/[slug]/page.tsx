'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2, Send, Sparkles, CheckCircle2, MessageCircle, CalendarClock } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { MarkdownView } from '@/components/ui/markdown-view'

const COR = '#fb7185' // identidade comercial

interface ConfigPublica {
  slug: string
  mensagemBoasVindas: string | null
  avisoLgpd: string | null
  empresaNome: string
  logoUrl: string | null
  whatsappComercial: string | null
  turnstileSiteKey: string | null
}
type Msg = { role: 'user' | 'assistant'; content: string }

declare global { interface Window { turnstile?: any } }

export default function AtendimentoPublicoPage() {
  const params = useParams<{ slug: string }>()
  const slug = params?.slug as string
  const searchParams = useSearchParams()
  const origem = searchParams?.get('origem') || searchParams?.get('utm_source') || searchParams?.get('ref') || null

  const [cfg, setCfg] = useState<ConfigPublica | null>(null)
  const [loadingCfg, setLoadingCfg] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [iniciado, setIniciado] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  const [mensagens, setMensagens] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [fechamento, setFechamento] = useState<string | null>(null) // temperatura
  const [slots, setSlots] = useState<Array<{ data: string; horaInicio: string; label: string }>>([])
  const [agendando, setAgendando] = useState(false)
  const [agendado, setAgendado] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const turnstileTokenRef = useRef<string | null>(null)
  const turnstileBoxRef = useRef<HTMLDivElement>(null)

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

  useEffect(() => {
    (trpc.lead as any).getConfigPublica.query({ slug })
      .then((c: ConfigPublica | null) => { if (!c) setErro('Atendimento indisponível.'); else setCfg(c) })
      .catch(() => setErro('Atendimento indisponível.'))
      .finally(() => setLoadingCfg(false))
  }, [slug])

  // Turnstile (Cloudflare) — só renderiza se a empresa tiver site key configurada.
  useEffect(() => {
    if (!cfg?.turnstileSiteKey || iniciado) return
    const id = 'cf-turnstile-script'
    const render = () => {
      if (!window.turnstile || !turnstileBoxRef.current) return
      window.turnstile.render(turnstileBoxRef.current, {
        sitekey: cfg.turnstileSiteKey,
        callback: (t: string) => { turnstileTokenRef.current = t },
        'expired-callback': () => { turnstileTokenRef.current = null },
      })
    }
    if (!document.getElementById(id)) {
      const s = document.createElement('script')
      s.id = id; s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; s.async = true; s.defer = true
      s.onload = render
      document.head.appendChild(s)
    } else { render() }
  }, [cfg, iniciado])

  function scrollToBottom() {
    requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight })
  }

  // Lead quente → carrega horários sugeridos pra agendar reunião.
  useEffect(() => {
    if (fechamento !== 'quente' || slots.length || agendado) return
    ;(trpc.lead as any).sugestoesHorario.query().then((s: any[]) => setSlots(s || [])).catch(() => {})
  }, [fechamento, slots.length, agendado])

  async function agendar(data: string, horaInicio: string, label: string) {
    if (!token || agendando) return
    setAgendando(true); setErro(null)
    try {
      const res = await fetch(`${apiBase}/api/lead/${token}/agendar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, horaInicio }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || 'Não foi possível agendar.')
      setAgendado(label)
    } catch (e) { setErro((e as Error).message) }
    finally { setAgendando(false) }
  }

  async function iniciar() {
    if (cfg?.turnstileSiteKey && !turnstileTokenRef.current) { setErro('Confirme que você não é um robô.'); return }
    setIniciando(true); setErro(null)
    try {
      const res = await fetch(`${apiBase}/api/lead/${slug}/iniciar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem, turnstileToken: turnstileTokenRef.current }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Falha ao iniciar.')
      setToken(data.token); setIniciado(true)
      // saudação inicial do assistente
      if (cfg?.mensagemBoasVindas) setMensagens([{ role: 'assistant', content: cfg.mensagemBoasVindas }])
    } catch (e) { setErro((e as Error).message) }
    finally { setIniciando(false) }
  }

  async function enviar() {
    const texto = input.trim()
    if (!texto || streaming || !token) return
    const base: Msg[] = [...mensagens, { role: 'user', content: texto }]
    setMensagens([...base, { role: 'assistant', content: '' }])
    setInput(''); setStreaming(true); scrollToBottom()
    try {
      const res = await fetch(`${apiBase}/api/lead/chat/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: base }),
      })
      if (!res.ok || !res.body) throw new Error(res.status === 429 ? 'Você atingiu o limite de mensagens.' : 'Falha na conexão.')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buffer = '', acc = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        const blocos = buffer.split('\n\n'); buffer = blocos.pop() || ''
        for (const b of blocos) {
          const linha = b.split('\n').find(l => l.startsWith('data: '))
          if (!linha) continue
          try {
            const ev = JSON.parse(linha.slice(6))
            if (ev.type === 'text') { acc += ev.text; setMensagens(prev => { const c = [...prev]; c[c.length - 1] = { role: 'assistant', content: acc }; return c }); scrollToBottom() }
            else if (ev.type === 'fechamento') setFechamento(ev.temperatura)
            else if (ev.type === 'error') throw new Error(ev.message)
          } catch (err) { if (err instanceof Error && !err.message.includes('JSON')) throw err }
        }
      }
      if (!acc.trim()) setMensagens(prev => prev.slice(0, -1))
    } catch (e) {
      setMensagens(prev => prev.slice(0, -1))
      setErro((e as Error).message)
    } finally { setStreaming(false) }
  }

  if (loadingCfg) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" style={{ color: COR }} /></div>
  if (erro && !cfg) return <div className="flex items-center justify-center min-h-screen px-4"><div className="max-w-md text-center bg-white dark:bg-slate-800 rounded-lg shadow-xl p-8"><p className="text-sm text-muted-foreground">{erro}</p></div></div>
  if (!cfg) return null

  return (
    <div className="min-h-screen flex flex-col" style={{ background: `color-mix(in srgb, ${COR} 6%, var(--color-background, #fff))` }}>
      {/* Header */}
      <div className="shrink-0 border-b bg-card/80 backdrop-blur px-4 py-3 flex items-center gap-3">
        {cfg.logoUrl
          ? <img src={resolveAssetUrl(cfg.logoUrl)} alt={cfg.empresaNome} className="h-9 w-auto object-contain" />
          : <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white" style={{ background: COR }}><Sparkles className="h-5 w-5" /></div>}
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{cfg.empresaNome}</p>
          <p className="text-[11px] text-muted-foreground">Atendimento online</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto">
        {!iniciado ? (
          // Tela inicial — boas-vindas + LGPD + Turnstile
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 px-6 py-10">
            <div className="h-16 w-16 rounded-full flex items-center justify-center text-white" style={{ background: COR }}><MessageCircle className="h-8 w-8" /></div>
            <div className="max-w-md space-y-2">
              <h1 className="text-xl font-bold">Vamos conversar?</h1>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{cfg.mensagemBoasVindas}</p>
            </div>
            {cfg.turnstileSiteKey && <div ref={turnstileBoxRef} />}
            {erro && <p className="text-xs text-rose-600">{erro}</p>}
            <button onClick={iniciar} disabled={iniciando} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-white font-semibold disabled:opacity-60" style={{ background: COR }}>
              {iniciando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Iniciar conversa
            </button>
            {cfg.avisoLgpd && <p className="text-[10px] text-muted-foreground max-w-sm">{cfg.avisoLgpd}</p>}
          </div>
        ) : (
          <>
            {/* Conversa */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {mensagens.map((m, i) => {
                const live = streaming && i === mensagens.length - 1 && m.role === 'assistant'
                return (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`rounded-2xl px-4 py-2.5 max-w-[85%] text-sm ${m.role === 'user' ? 'text-white rounded-br-sm' : 'bg-card border rounded-bl-sm'}`} style={m.role === 'user' ? { background: COR } : undefined}>
                      {m.role === 'assistant'
                        ? (m.content ? (live ? <span className="whitespace-pre-wrap">{m.content}<span className="ml-0.5 inline-block w-[2px] h-[1em] align-middle animate-pulse rounded-sm" style={{ background: COR }} /></span> : <MarkdownView source={m.content} />)
                          : <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> digitando…</span>)
                        : <span className="whitespace-pre-wrap">{m.content}</span>}
                    </div>
                  </div>
                )
              })}

              {/* Fechamento por temperatura */}
              {fechamento === 'morno' && cfg.whatsappComercial && (
                <div className="flex justify-center pt-2">
                  <a href={`https://wa.me/${cfg.whatsappComercial.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-white text-sm font-semibold" style={{ background: '#25D366' }}>
                    <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
                  </a>
                </div>
              )}
              {fechamento === 'quente' && (
                <div className="flex flex-col items-center gap-2 pt-2 text-center">
                  {agendado ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: COR }}>
                      <CheckCircle2 className="h-4 w-4" /> Reunião solicitada para <strong>{agendado}</strong>. Até lá! 🎉
                    </span>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: COR }}><CalendarClock className="h-4 w-4" /> Quer agendar uma reunião com um consultor?</span>
                      {slots.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-1.5 max-w-md">
                          {slots.map(sl => (
                            <button key={sl.data + sl.horaInicio} type="button" disabled={agendando}
                              onClick={() => agendar(sl.data, sl.horaInicio, sl.label)}
                              className="rounded-md border px-2.5 py-1 text-xs font-medium hover:text-white disabled:opacity-50 transition-colors"
                              style={{ borderColor: COR, color: COR }}
                              onMouseEnter={e => { e.currentTarget.style.background = COR; e.currentTarget.style.color = '#fff' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = COR }}>
                              {sl.label}
                            </button>
                          ))}
                        </div>
                      ) : <span className="text-[11px] text-muted-foreground">Um consultor já vai entrar em contato. 🙂</span>}
                      {agendando && <Loader2 className="h-4 w-4 animate-spin" style={{ color: COR }} />}
                    </>
                  )}
                </div>
              )}
              {fechamento === 'frio' && (
                <div className="flex items-center justify-center gap-1.5 pt-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" style={{ color: COR }} /> Obrigado pelo contato!</div>
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t bg-card/80 backdrop-blur px-4 py-3">
              {erro && <p className="text-xs text-rose-600 mb-1.5">{erro}</p>}
              <div className="flex items-end gap-2 max-w-2xl mx-auto">
                <textarea
                  value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                  placeholder="Escreva sua mensagem…" rows={1} disabled={streaming}
                  className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 max-h-32"
                />
                <button onClick={enviar} disabled={streaming || !input.trim()} className="shrink-0 h-9 w-9 rounded-md flex items-center justify-center text-white disabled:opacity-50" style={{ background: COR }}>
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
