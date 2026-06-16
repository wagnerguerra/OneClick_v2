'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  MessageSquare, Send, Loader2, Search, Check, CheckCheck, AlertTriangle,
  UserPlus, StickyNote, Phone,
} from 'lucide-react'
import { Button, Input, Badge, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { useTabLabel } from '@/hooks/use-tab-label'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'
const wa = () => (trpc as any).whatsapp

type Status = 'ABERTA' | 'PENDENTE' | 'RESOLVIDA' | 'FECHADA'
interface Conversa {
  id: string; status: Status; naFila: boolean; responsavelId: string | null; setorId: string | null
  naoLidas: number; ultimaMensagemEm: string | null; botPausado: boolean
  contatoId: string; contatoNome: string | null; contatoTelefone: string | null; contatoFoto: string | null
  waId: string; clienteId: string | null; ultimaPrevia: string | null
}
interface Mensagem {
  id: string; direcao: 'IN' | 'OUT'; autorId: string | null; porBot: boolean; tipo: string
  conteudo: string | null; midiaUrl: string | null; waMessageId: string | null; status: string; interna: boolean; createdAt: string
}

const FILTROS: { key: Status | null; label: string }[] = [
  { key: null, label: 'Todas' },
  { key: 'ABERTA', label: 'Abertas' },
  { key: 'PENDENTE', label: 'Pendentes' },
  { key: 'RESOLVIDA', label: 'Resolvidas' },
]

function iniciais(nome?: string | null, tel?: string | null) {
  const base = (nome || tel || '?').trim()
  return base.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
}
function horaCurta(d: string | null) {
  if (!d) return ''
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export default function WhatsappPage() {
  useTabLabel('WhatsApp')

  const [configurado, setConfigurado] = useState(true)
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [filtro, setFiltro] = useState<Status | null>(null)
  const [busca, setBusca] = useState('')
  const [selId, setSelId] = useState<string | null>(null)

  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loadingMsg, setLoadingMsg] = useState(false)
  const [texto, setTexto] = useState('')
  const [interna, setInterna] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const sel = useMemo(() => conversas.find(c => c.id === selId) ?? null, [conversas, selId])

  const loadConversas = useCallback(() => {
    wa().listConversas.query({ status: filtro ?? undefined, busca: busca.trim() || undefined })
      .then((r: Conversa[]) => setConversas(r))
      .catch(() => {})
      .finally(() => setLoadingList(false))
  }, [filtro, busca])

  useEffect(() => { loadConversas() }, [loadConversas])
  useEffect(() => { wa().statusIntegracao.query().then((r: { configurado: boolean }) => setConfigurado(r.configurado)).catch(() => {}) }, [])

  const loadMensagens = useCallback((conversaId: string) => {
    setLoadingMsg(true)
    wa().listMensagens.query({ conversaId })
      .then((r: Mensagem[]) => setMensagens(r))
      .catch(() => setMensagens([]))
      .finally(() => setLoadingMsg(false))
  }, [])

  useEffect(() => {
    if (!selId) { setMensagens([]); return }
    loadMensagens(selId)
    wa().marcarLida.mutate({ conversaId: selId }).then(() => {
      setConversas(prev => prev.map(c => c.id === selId ? { ...c, naoLidas: 0 } : c))
    }).catch(() => {})
  }, [selId, loadMensagens])

  // scroll pro fim quando mensagens mudam
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }) }, [mensagens])

  // SSE ao vivo
  useEffect(() => {
    let es: EventSource | null = null
    let closed = false
    let retry: ReturnType<typeof setTimeout>
    const connect = () => {
      if (closed) return
      try {
        es = new EventSource(`${getApiUrl()}/api/whatsapp/events`)
        es.onmessage = (msg) => {
          const ev = JSON.parse(msg.data)
          if (ev.type === 'ping') return
          if (ev.type === 'mensagem-nova') {
            if (ev.conversaId === selId) loadMensagens(ev.conversaId)
            loadConversas()
          } else if (ev.type === 'conversa-atualizada' || ev.type === 'atribuida') {
            loadConversas()
          }
        }
        es.onerror = () => { es?.close(); if (!closed) retry = setTimeout(connect, 15000) }
      } catch { if (!closed) retry = setTimeout(connect, 15000) }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retry) }
  }, [selId, loadConversas, loadMensagens])

  async function enviar() {
    if (!sel || !texto.trim()) return
    setEnviando(true)
    try {
      await wa().enviarMensagem.mutate({ conversaId: sel.id, texto: texto.trim(), interna })
      setTexto('')
      loadMensagens(sel.id)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviando(false) }
  }
  async function assumir() {
    if (!sel) return
    try { await wa().assumir.mutate({ conversaId: sel.id }); loadConversas() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }
  async function resolver() {
    if (!sel) return
    try { await wa().setStatus.mutate({ conversaId: sel.id, status: 'RESOLVIDA' }); loadConversas() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-90px)]">
      {!configurado && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 mb-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Integração do WhatsApp ainda não configurada. Preencha as credenciais da Meta em <a href="/configuracoes" className="underline font-medium">Configurações → WhatsApp</a>.
        </div>
      )}

      <div className="flex flex-1 min-h-0 rounded-xl border border-border overflow-hidden bg-card">
        {/* Coluna 1 — lista de conversas */}
        <div className="w-[320px] shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md text-white" style={{ background: MODULE_COLOR }}>
                <MessageSquare className="h-4 w-4" />
              </div>
              <span className="font-semibold text-sm">WhatsApp</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar contato..." className="h-8 pl-7 text-xs" />
            </div>
            <div className="flex items-center gap-1">
              {FILTROS.map(f => (
                <button key={f.label} onClick={() => setFiltro(f.key)}
                  className={cn('h-7 px-2.5 rounded-md text-xs font-medium', filtro === f.key ? 'text-white' : 'text-muted-foreground hover:bg-muted')}
                  style={filtro === f.key ? { background: MODULE_COLOR } : undefined}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto nice-scrollbar">
            {loadingList ? (
              <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : conversas.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10 italic">Nenhuma conversa.</p>
            ) : conversas.map(c => (
              <button key={c.id} onClick={() => setSelId(c.id)}
                className={cn('w-full flex items-start gap-2.5 px-3 py-2.5 border-b border-border/50 text-left hover:bg-muted/40', selId === c.id && 'bg-muted/60')}>
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold shrink-0">{iniciais(c.contatoNome, c.contatoTelefone)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{c.contatoNome || c.contatoTelefone || c.waId}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{horaCurta(c.ultimaMensagemEm)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground truncate">{c.ultimaPrevia || '—'}</span>
                    {c.naoLidas > 0 && <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold flex items-center justify-center" style={{ background: MODULE_COLOR }}>{c.naoLidas}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Coluna 2 — thread */}
        <div className="flex-1 min-w-0 flex flex-col">
          {!sel ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 opacity-30 mb-2" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          ) : (
            <>
              <div className="h-14 px-4 flex items-center justify-between border-b border-border shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold">{iniciais(sel.contatoNome, sel.contatoTelefone)}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{sel.contatoNome || sel.contatoTelefone || sel.waId}</p>
                    <p className="text-[11px] text-muted-foreground">{sel.contatoTelefone || '+' + sel.waId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {sel.naFila && <Button size="sm" variant="outline" onClick={assumir} className="gap-1.5"><UserPlus className="h-3.5 w-3.5" /> Assumir</Button>}
                  {sel.status !== 'RESOLVIDA' && <Button size="sm" variant="outline" onClick={resolver} className="gap-1.5"><Check className="h-3.5 w-3.5" /> Resolver</Button>}
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto nice-scrollbar p-4 space-y-2 bg-muted/20">
                {loadingMsg ? (
                  <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                ) : mensagens.map(m => (
                  <div key={m.id} className={cn('flex', m.direcao === 'OUT' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[72%] rounded-lg px-3 py-2 text-sm shadow-sm',
                      m.interna ? 'bg-amber-100 dark:bg-amber-900/40 border border-amber-300' :
                      m.direcao === 'OUT' ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-card border border-border')}>
                      {m.interna && <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-0.5 flex items-center gap-1"><StickyNote className="h-3 w-3" /> Nota interna</p>}
                      {m.midiaUrl && <a href={m.midiaUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline block mb-1">[{m.tipo}]</a>}
                      <p className="whitespace-pre-wrap break-words">{m.conteudo}</p>
                      <div className="flex items-center justify-end gap-1 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{horaCurta(m.createdAt)}</span>
                        {m.direcao === 'OUT' && !m.interna && (
                          m.status === 'lido' ? <CheckCheck className="h-3 w-3 text-sky-500" /> :
                          m.status === 'entregue' ? <CheckCheck className="h-3 w-3 text-muted-foreground" /> :
                          m.status === 'erro' ? <AlertTriangle className="h-3 w-3 text-rose-500" /> :
                          <Check className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-border shrink-0 space-y-2">
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer w-fit">
                  <input type="checkbox" checked={interna} onChange={e => setInterna(e.target.checked)} className="h-3.5 w-3.5" />
                  <StickyNote className="h-3 w-3" /> Nota interna (não envia ao cliente)
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    value={texto}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                    placeholder={interna ? 'Escreva uma nota interna…' : 'Digite uma mensagem…'}
                    rows={1}
                    className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-32"
                  />
                  <Button onClick={enviar} disabled={enviando || !texto.trim()} className="text-white gap-1.5 shrink-0" style={{ background: MODULE_COLOR }}>
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Coluna 3 — painel do contato */}
        {sel && (
          <div className="w-[260px] shrink-0 border-l border-border p-4 hidden xl:block">
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-lg font-semibold mb-2">{iniciais(sel.contatoNome, sel.contatoTelefone)}</div>
              <p className="font-semibold text-sm">{sel.contatoNome || 'Sem nome'}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Phone className="h-3 w-3" /> {sel.contatoTelefone || '+' + sel.waId}</p>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className="text-[10px]">{sel.status}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cliente CRM</span>
                {sel.clienteId
                  ? <a href={`/clientes/${sel.clienteId}`} className="text-primary hover:underline">Ver cliente</a>
                  : <span className="text-muted-foreground italic">não vinculado</span>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
