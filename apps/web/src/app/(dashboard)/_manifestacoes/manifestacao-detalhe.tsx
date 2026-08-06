'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Loader2, EyeOff, Send, MessageSquare, Lock, Globe, Building2, User as UserIcon, X,
} from 'lucide-react'
import {
  Button, Badge, cn,
  Sheet, SheetContent, SheetTitle, SheetDescription,
  RichEditor, RichContent,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { STATUS_LABEL } from './manifestacao-page'
import type { Config } from './tipos'

const MODULE_COLOR = 'var(--mod-qualidade, #f59e0b)'

/**
 * A tratativa de uma manifestação.
 *
 * Painel lateral, como no helpdesk e nos relatórios: o percurso aqui é ler o
 * relato, conversar e responder, e voltar à lista a cada passo quebraria isso.
 */
export function ManifestacaoDetalhe({ config, id, podeTratar, onClose, onMudou }: {
  config: Config
  id: string
  podeTratar: boolean
  onClose: () => void
  onMudou: () => void
}) {
  const api = (trpc as never as Record<string, any>)[config.router]

  const [m, setM] = useState<any>(null)
  const [carregando, setCarregando] = useState(true)
  const [resposta, setResposta] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [novaMsg, setNovaMsg] = useState('')
  const [msgInterna, setMsgInterna] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await api.getById.query({ id })
      setM(r)
      setResposta(r?.resposta ?? '')
    } catch (e) {
      await alerts.error('Não foi possível abrir', (e as Error).message)
      onClose()
    } finally {
      setCarregando(false)
    }
  }, [api, id, onClose])

  useEffect(() => { void carregar() }, [carregar])

  async function responder(encerrar: boolean) {
    const texto = resposta.replace(/<[^>]*>/g, '').trim()
    if (!texto) { await alerts.warning('Resposta', 'Escreva a resposta antes de enviar.'); return }
    setSalvando(true)
    try {
      await api.responder.mutate({ id, resposta, encerrar })
      await carregar()
      onMudou()
    } catch (e) {
      await alerts.error('Não foi possível responder', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function enviarMensagem() {
    if (!novaMsg.trim()) return
    try {
      await api.adicionarMensagem.mutate({ id, texto: novaMsg.trim(), interna: msgInterna })
      setNovaMsg('')
      await carregar()
    } catch (e) {
      await alerts.error('Não foi possível enviar', (e as Error).message)
    }
  }

  async function alternarMural() {
    try {
      await api.publicar.mutate({ id, publica: !m.publica })
      await carregar()
      onMudou()
    } catch (e) {
      await alerts.error('Não foi possível alterar', (e as Error).message)
    }
  }

  const st = m ? (STATUS_LABEL[m.status] ?? { texto: m.status, classe: 'bg-muted' }) : null

  return (
    <Sheet open onOpenChange={o => { if (!o) onClose() }}>
      <SheetContent side="right" size="xl" hideClose
        className="flex w-[72vw] max-w-[1040px] flex-col overflow-hidden p-0">
        <SheetTitle className="sr-only">{config.titulo}</SheetTitle>
        <SheetDescription className="sr-only">Detalhe e tratativa do registro.</SheetDescription>

        <div className="flex items-start gap-3 px-6 py-4 text-white"
          style={{ background: `linear-gradient(120deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 55%, #ef4444))` }}>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] uppercase tracking-[.14em] opacity-90">
              {m?.protocolo ?? '—'}
            </p>
            <h2 className="truncate text-xl font-bold">
              {m?.titulo || config.titulo}
            </h2>
            {m && (
              <p className="flex flex-wrap items-center gap-2 text-[12.5px] opacity-90">
                {m.anonima ? (
                  <span className="inline-flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> Anônima</span>
                ) : m.origem === 'CLIENTE' ? (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5" />
                    {m.cliente?.razaoSocial ?? m.informanteNome ?? 'Cliente'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <UserIcon className="h-3.5 w-3.5" /> {m.autor?.name ?? '—'}
                  </span>
                )}
                <span>·</span>
                <span>{new Date(m.criadoEm).toLocaleDateString('pt-BR')}</span>
                {m.area && <><span>·</span><span>{m.area.name}</span></>}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar"
            className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/20">
            <X className="h-4 w-4" />
          </button>
        </div>

        {carregando || !m ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="nice-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {st && <Badge variant="outline" className={cn('text-[11px]', st.classe)}>{st.texto}</Badge>}
              {config.temMural && (
                <Badge variant="outline" className="text-[11px]">
                  {m.publica ? <><Globe className="mr-1 h-3 w-3" />No mural</> : <><Lock className="mr-1 h-3 w-3" />Privada</>}
                </Badge>
              )}
              {config.temMural && podeTratar && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={alternarMural}>
                  {m.publica ? 'Tirar do mural' : 'Publicar no mural'}
                </Button>
              )}
            </div>

            {m.elogiados?.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                  Elogiados
                </p>
                <p className="text-[13px] text-amber-900 dark:text-amber-200">
                  {m.elogiados.map((e: { name: string }) => e.name).join(' · ')}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                O relato
              </p>
              <RichContent html={m.descricao} />
            </div>

            {m.resposta && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
                  Resposta da Qualidade
                  {m.respondidoEm && ` · ${new Date(m.respondidoEm).toLocaleDateString('pt-BR')}`}
                </p>
                <RichContent html={m.resposta} />
              </div>
            )}

            {/* Conversa. A nota interna não aparece na consulta por protocolo —
                é o que permite discutir o caso sem expor a discussão. */}
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                <MessageSquare className="h-3.5 w-3.5" /> Conversa
              </p>
              {m.mensagens?.length > 0 ? m.mensagens.map((msg: any) => (
                <div key={msg.id} className={cn('rounded-lg border px-3 py-2',
                  msg.interna ? 'border-dashed border-border bg-muted/30' : 'border-border')}>
                  <p className="mb-0.5 text-[11px] text-muted-foreground">
                    {msg.interna ? 'Nota interna' : 'Visível a quem registrou'}
                    {' · '}{new Date(msg.criadoEm).toLocaleString('pt-BR')}
                  </p>
                  <p className="whitespace-pre-wrap text-[13px]">{msg.texto}</p>
                </div>
              )) : (
                <p className="text-[12px] italic text-muted-foreground">Nada registrado ainda.</p>
              )}

              <div className="space-y-1.5 rounded-lg border border-border p-2.5">
                <textarea value={novaMsg} onChange={e => setNovaMsg(e.target.value)} rows={2}
                  placeholder="Escrever..."
                  className="nice-scrollbar w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm" />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                    <input type="checkbox" checked={msgInterna} className="h-3.5 w-3.5"
                      onChange={e => setMsgInterna(e.target.checked)} />
                    Nota interna
                  </label>
                  <Button size="sm" variant="outline" className="ml-auto gap-1.5"
                    onClick={enviarMensagem} disabled={!novaMsg.trim()}>
                    <Send className="h-3.5 w-3.5" /> Enviar
                  </Button>
                </div>
              </div>
            </div>

            {podeTratar && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <p className="text-[13px] font-semibold">Responder</p>
                <RichEditor value={resposta} onChange={setResposta}
                  placeholder="A resposta que quem registrou vai ler..." />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => responder(false)} disabled={salvando}>
                    Salvar sem encerrar
                  </Button>
                  <Button variant="success" size="sm" className="gap-1.5"
                    onClick={() => responder(true)} disabled={salvando}>
                    {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                    Responder e encerrar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
