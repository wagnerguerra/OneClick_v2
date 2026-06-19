'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { Loader2, Send, Sparkles, CheckCircle2, MessageCircle, CalendarClock, ArrowUp } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { MarkdownView } from '@/components/ui/markdown-view'

const COR = '#fb7185' // identidade comercial
const BG = `color-mix(in srgb, ${COR} 6%, var(--color-background, #fff))`

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
  const stickRef = useRef(true)            // gruda no fim só se o usuário já estiver embaixo
  const taRef = useRef<HTMLTextAreaElement>(null)
  const turnstileTokenRef = useRef<string | null>(null)
  const turnstileBoxRef = useRef<HTMLDivElement>(null)

  // Revelação suave (typewriter) do texto que chega via SSE
  const targetRef = useRef('')             // texto acumulado recebido
  const shownRef = useRef(0)               // qtde de chars já exibidos
  const doneRef = useRef(false)            // SSE terminou de chegar
  const rafRef = useRef<number | null>(null)

  const apiBase = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '')

  useEffect(() => {
    (trpc.lead as any).getConfigPublica.query({ slug })
      .then((c: ConfigPublica | null) => { if (!c) setErro('Atendimento indisponível.'); else setCfg(c) })
      .catch(() => setErro('Atendimento indisponível.'))
      .finally(() => setLoadingCfg(false))
  }, [slug])

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

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

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  function scrollToBottom(force = false) {
    const el = scrollRef.current
    if (!el || (!force && !stickRef.current)) return
    el.scrollTop = el.scrollHeight
  }

  function autoGrow() {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }

  // Lead quente → carrega horários sugeridos pra agendar reunião.
  useEffect(() => {
    if (fechamento !== 'quente' || slots.length || agendado) return
    ;(trpc.lead as any).sugestoesHorario.query().then((s: any[]) => setSlots(s || [])).catch(() => {})
  }, [fechamento, slots.length, agendado])

  useEffect(() => { scrollToBottom(true) }, [fechamento, slots.length, agendado])

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
      if (cfg?.mensagemBoasVindas) setMensagens([{ role: 'assistant', content: cfg.mensagemBoasVindas }])
      requestAnimationFrame(() => taRef.current?.focus())
    } catch (e) { setErro((e as Error).message) }
    finally { setIniciando(false) }
  }

  // Loop de revelação suave: avança o texto exibido em direção ao recebido.
  function pump() {
    const target = targetRef.current
    if (shownRef.current < target.length) {
      const remaining = target.length - shownRef.current
      const step = Math.max(1, Math.round(remaining / 8)) // ease-out: rápido quando atrasado, suave no fim
      const nextLen = Math.min(target.length, shownRef.current + step)
      shownRef.current = nextLen
      const slice = target.slice(0, nextLen)
      setMensagens(prev => {
        if (!prev.length) return prev
        const c = [...prev]
        const last = c[c.length - 1]
        if (last && last.role === 'assistant') c[c.length - 1] = { role: 'assistant', content: slice }
        return c
      })
      scrollToBottom()
    }
    if (doneRef.current && shownRef.current >= target.length) {
      rafRef.current = null
      if (!target.trim()) setMensagens(prev => prev.slice(0, -1)) // assistente vazio → remove placeholder
      setStreaming(false)
      return
    }
    rafRef.current = requestAnimationFrame(pump)
  }

  async function enviar() {
    const texto = input.trim()
    if (!texto || streaming || !token) return
    const base: Msg[] = [...mensagens, { role: 'user', content: texto }]
    setMensagens([...base, { role: 'assistant', content: '' }])
    setInput(''); setErro(null); setStreaming(true)
    requestAnimationFrame(() => { autoGrow(); scrollToBottom(true) })

    targetRef.current = ''; shownRef.current = 0; doneRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(pump)

    try {
      const res = await fetch(`${apiBase}/api/lead/chat/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: base }),
      })
      if (!res.ok || !res.body) throw new Error(res.status === 429 ? 'Você atingiu o limite de mensagens.' : 'Falha na conexão.')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''
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
            if (ev.type === 'text') targetRef.current += ev.text
            else if (ev.type === 'fechamento') setFechamento(ev.temperatura)
            else if (ev.type === 'error') throw new Error(ev.message)
          } catch (err) { if (err instanceof Error && !err.message.includes('JSON')) throw err }
        }
      }
      doneRef.current = true // pump finaliza ao terminar de revelar
    } catch (e) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
      setMensagens(prev => prev.slice(0, -1))
      setErro((e as Error).message)
      setStreaming(false)
    }
  }

  if (loadingCfg) return <div className="flex items-center justify-center min-h-screen" style={{ background: BG }}><Loader2 className="h-8 w-8 animate-spin" style={{ color: COR }} /></div>
  if (erro && !cfg) return <div className="flex items-center justify-center min-h-screen px-4" style={{ background: BG }}><div className="max-w-md text-center bg-card rounded-2xl shadow-xl p-8 border"><p className="text-sm text-muted-foreground">{erro}</p></div></div>
  if (!cfg) return null

  const Marca = cfg.logoUrl
    ? <img src={resolveAssetUrl(cfg.logoUrl)} alt={cfg.empresaNome} className="h-9 w-auto object-contain" />
    : <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: COR }}><Sparkles className="h-5 w-5" /></div>

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: BG }}>
      {/* ── Header fixo no topo, conteúdo centralizado ── */}
      <header className="shrink-0 border-b border-border/60 bg-card/70 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
          {Marca}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">{cfg.empresaNome}</p>
            <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" /> Atendimento online
            </p>
          </div>
        </div>
      </header>

      {!iniciado ? (
        // ── Tela inicial — boas-vindas + LGPD + Turnstile ──
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 px-6">
          <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ background: COR }}><MessageCircle className="h-8 w-8" /></div>
          <div className="max-w-md space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Vamos conversar?</h1>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{cfg.mensagemBoasVindas}</p>
          </div>
          {cfg.turnstileSiteKey && <div ref={turnstileBoxRef} />}
          {erro && <p className="text-xs text-rose-600">{erro}</p>}
          <button onClick={iniciar} disabled={iniciando} className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-white font-semibold shadow-lg transition-transform active:scale-95 disabled:opacity-60" style={{ background: COR }}>
            {iniciando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Iniciar conversa
          </button>
          {cfg.avisoLgpd && <p className="text-[10px] text-muted-foreground max-w-sm leading-relaxed">{cfg.avisoLgpd}</p>}
        </div>
      ) : (
        <main className="flex-1 min-h-0 w-full max-w-3xl mx-auto px-4 py-4 flex flex-col gap-3">
          {/* ── Área de mensagens: card com borda arredondada, rola por dentro ── */}
          <div className="flex-1 min-h-0 rounded-3xl border border-border/70 bg-card/30 overflow-hidden">
            <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 py-4 space-y-4">
              {mensagens.map((m, i) => {
                const live = streaming && i === mensagens.length - 1 && m.role === 'assistant'
                if (m.role === 'user') {
                  return (
                    <div key={i} className="flex justify-end">
                      <div className="rounded-3xl rounded-br-md px-4 py-2.5 max-w-[85%] text-sm text-white shadow-sm whitespace-pre-wrap leading-relaxed" style={{ background: COR }}>
                        {m.content}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-white shadow-sm" style={{ background: COR }}><Sparkles className="h-3.5 w-3.5" /></div>
                    <div className="rounded-3xl rounded-tl-md border border-border/70 bg-card px-4 py-2.5 max-w-[85%] text-sm shadow-sm leading-relaxed">
                      {m.content
                        ? (live
                            ? <span className="whitespace-pre-wrap">{m.content}<span className="ml-0.5 inline-block w-[2px] h-[1.05em] align-middle animate-pulse rounded-sm" style={{ background: COR }} /></span>
                            : <MarkdownView source={m.content} />)
                        : <span className="inline-flex items-center gap-1 py-0.5">
                            <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: COR, animationDelay: '0ms' }} />
                            <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: COR, animationDelay: '150ms' }} />
                            <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: COR, animationDelay: '300ms' }} />
                          </span>}
                    </div>
                  </div>
                )
              })}

              {/* ── Fechamento por temperatura ── */}
              {fechamento === 'morno' && cfg.whatsappComercial && (
                <div className="flex justify-center pt-2">
                  <a href={`https://wa.me/${cfg.whatsappComercial.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold shadow-md transition-transform active:scale-95" style={{ background: '#25D366' }}>
                    <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
                  </a>
                </div>
              )}
              {fechamento === 'quente' && (
                <div className="flex flex-col items-center gap-2.5 pt-2 text-center">
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
                              className="rounded-full border px-3 py-1.5 text-xs font-medium hover:text-white disabled:opacity-50 transition-colors"
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
          </div>

          {/* ── Composer (estilo Claude) ── */}
          <div className="shrink-0">
            {erro && <p className="text-xs text-rose-600 mb-2 text-center">{erro}</p>}
            <div className="rounded-[26px] border border-border bg-card shadow-xl shadow-black/10 transition-shadow focus-within:shadow-2xl">
              <textarea
                ref={taRef}
                value={input}
                onChange={e => { setInput(e.target.value); autoGrow() }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                placeholder="Escreva sua mensagem…" rows={1} disabled={streaming}
                className="block w-full resize-none border-0 bg-transparent px-5 pt-4 pb-1 text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:opacity-60 max-h-40"
              />
              <div className="flex items-center justify-between px-3 pb-3 pt-1">
                <span className="pl-2 text-[11px] text-muted-foreground">{streaming ? 'Respondendo…' : 'Enter envia · Shift+Enter quebra linha'}</span>
                <button onClick={enviar} disabled={streaming || !input.trim()}
                  className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm transition-transform active:scale-90 disabled:opacity-40 disabled:active:scale-100"
                  style={{ background: COR }}>
                  {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <p className="text-center text-[10px] text-muted-foreground mt-2">Powered by {cfg.empresaNome}</p>
          </div>
        </main>
      )}
    </div>
  )
}
