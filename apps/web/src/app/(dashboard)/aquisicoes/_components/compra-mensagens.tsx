'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, Trash2, Pencil, Plus, MoreVertical, Check, Send, MessageSquare,
} from 'lucide-react'
import {
  Button, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Label, RichEditor, RichContent, sanitizeInlineTextColors,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'

/**
 * Mensagens do pedido no mesmo padrão das mensagens do orçamento: avatar,
 * balão com cauda angular, data relativa, menu ⋮ no hover, texto rico e um
 * modal para a nova mensagem — em vez da caixinha de texto solta que havia.
 *
 * O que NÃO veio do orçamento, por depender de coisas que este módulo não tem:
 * notificar destinatários por e-mail e restringir a visibilidade a certos
 * usuários. Ambos exigem colunas novas e o serviço de e-mail; a thread, que é
 * o que faz a conversa ser conversa, veio (coluna `parent_id`).
 */

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

export interface MensagemRow {
  id: string; texto: string; createdAt: string; updatedAt?: string | null
  autorId: string | null; parentId?: string | null
  autor: { id: string; name: string; image: string | null } | null
}

export function fmtData(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * As mensagens antigas do módulo foram gravadas como texto puro, e o
 * `RichContent` espera HTML: sem isto, as quebras de linha somem e um `<`
 * digitado viraria tag. Só embrulha o que claramente não é HTML — conteúdo
 * novo já sai pronto do editor.
 */
function comoHtml(texto: string): string {
  if (/<[a-z][\s\S]*>/i.test(texto)) return texto
  const esc = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br />')}</p>`).join('')
}

/** "há X" enquanto é recente; passada uma semana, a data cheia diz mais. */
function dataRelativa(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  const hora = Math.floor(min / 60)
  const dia = Math.floor(hora / 24)
  if (diff < 60000) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  if (hora < 24) return `há ${hora} h`
  if (dia < 7) return `há ${dia} dia${dia > 1 ? 's' : ''}`
  return fmtData(iso)
}

/** Vazio de verdade: o RichEditor emite `<p></p>` mesmo sem conteúdo. */
const richVazio = (v: string) => !v || v.replace(/<[^>]*>/g, '').trim() === ''

function MensagemItem({ msg, currentUserId, respostas = [], onExcluir, onEditar, onResponder, isReply = false }: {
  msg: MensagemRow
  currentUserId?: string
  respostas?: MensagemRow[]
  onExcluir: (id: string) => void
  onEditar: (id: string, texto: string) => Promise<void>
  onResponder?: (texto: string) => Promise<void>
  isReply?: boolean
}) {
  const html = useMemo(() => sanitizeInlineTextColors(comoHtml(msg.texto)), [msg.texto])
  const nome = msg.autor?.name ?? 'Usuário'
  const iniciais = nome.split(' ').map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  // "Editada" sai do updatedAt: o modelo não tem campo próprio, e um segundo de
  // folga evita marcar como editada a mensagem recém-criada.
  const editada = msg.updatedAt && new Date(msg.updatedAt).getTime() - new Date(msg.createdAt).getTime() > 1000
    ? fmtData(msg.updatedAt)
    : null

  const meu = !!currentUserId && msg.autorId === currentUserId
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(msg.texto)
  const [salvando, setSalvando] = useState(false)
  const [respondendo, setRespondendo] = useState(false)
  const [resposta, setResposta] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)

  async function salvar() {
    if (richVazio(texto)) return
    setSalvando(true)
    try { await onEditar(msg.id, texto); setEditando(false) } finally { setSalvando(false) }
  }
  async function enviarResposta() {
    if (richVazio(resposta) || !onResponder) return
    setEnviandoResposta(true)
    try { await onResponder(resposta); setResposta(''); setRespondendo(false) } finally { setEnviandoResposta(false) }
  }

  // Avatar menor na resposta: diferencia a conversa aninhada sem precisar de recuo.
  const avatar = isReply ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm'

  return (
    <div className={cn('group flex items-start', isReply ? 'gap-3' : 'gap-5')}>
      {msg.autor?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveAssetUrl(msg.autor.image)}
          alt={nome}
          className={cn(avatar, 'rounded-full object-cover shrink-0 ring-2 ring-background shadow-sm mt-0.5')}
        />
      ) : (
        <div
          className={cn(avatar, 'rounded-full shrink-0 flex items-center justify-center text-white font-bold ring-2 ring-background shadow-sm mt-0.5')}
          style={{ backgroundColor: MODULE_COLOR }}
        >
          {iniciais}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{nome}</span>
            <span className="text-[11px] text-muted-foreground" title={fmtData(msg.createdAt)}>{dataRelativa(msg.createdAt)}</span>
            {editada && (
              <span className="text-[11px] text-muted-foreground italic" title={`Editada em ${editada}`}>(editada {editada})</span>
            )}
          </div>
          {(meu || onResponder) && !editando && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-7 w-7 flex items-center justify-center rounded hover:bg-muted shrink-0">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onResponder && (
                  <DropdownMenuItem onClick={() => setRespondendo(true)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-2" /> Responder
                  </DropdownMenuItem>
                )}
                {meu && (
                  <DropdownMenuItem onClick={() => { setTexto(msg.texto); setEditando(true) }}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                  </DropdownMenuItem>
                )}
                {meu && (
                  <DropdownMenuItem className="text-destructive" onClick={() => onExcluir(msg.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Balão com a cauda angular no canto superior esquerdo — mesmo desenho
            das mensagens do orçamento, com a borda na cor do módulo. */}
        <div className="relative">
          <div className="relative -ml-px bg-muted/60 dark:bg-muted/30 rounded-2xl rounded-tl-none px-4 py-3 border border-amber-300/50 dark:border-amber-700/40">
            {editando ? (
              <div className="space-y-2">
                <RichEditor value={texto} onChange={setTexto} placeholder="Edite o conteúdo da mensagem..." />
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => { setTexto(msg.texto); setEditando(false) }} disabled={salvando}>
                    Cancelar
                  </Button>
                  <Button type="button" size="sm" className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }} onClick={salvar} disabled={salvando || richVazio(texto)}>
                    {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <RichContent className="text-sm text-foreground [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1" html={html} />
            )}
          </div>
          <svg className="absolute pointer-events-none overflow-visible" style={{ left: -11, top: 0 }} width="14" height="14" viewBox="0 0 14 14" aria-hidden>
            <path d="M 0 0 L 14 0 L 14 14 L 12 14 L 12 13 Z" className="fill-card" />
            <path d="M 0 0 L 14 0 L 14 14 L 12 14 L 12 13 Z" className="fill-muted/60 dark:fill-muted/30" />
            <path d="M 12 13 L 0 0 L 13 0" className="stroke-amber-300/50 dark:stroke-amber-700/40" fill="none" strokeWidth="1" strokeLinejoin="miter" />
          </svg>
        </div>

        {respondendo && onResponder && (
          <div className="mt-3 space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
            <Label className="text-[12px] font-semibold flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} /> Respondendo a {nome}
            </Label>
            <RichEditor value={resposta} onChange={setResposta} placeholder="Escreva sua resposta..." />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { setResposta(''); setRespondendo(false) }} disabled={enviandoResposta}>
                Cancelar
              </Button>
              <Button type="button" size="sm" className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }} onClick={enviarResposta} disabled={enviandoResposta || richVazio(resposta)}>
                {enviandoResposta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Responder
              </Button>
            </div>
          </div>
        )}

        {respostas.length > 0 && (
          <div className="mt-3 space-y-3">
            {respostas.map((r) => (
              <MensagemItem key={r.id} msg={r} currentUserId={currentUserId} isReply onExcluir={onExcluir} onEditar={onEditar} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function MensagensTab({ compraId, currentUserId }: { compraId: string; currentUserId?: string }) {
  const [msgs, setMsgs] = useState<MensagemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [novaAberta, setNovaAberta] = useState(false)
  const [nova, setNova] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.compra as any).listMensagens.query({ compraId })
      .then((d: MensagemRow[]) => setMsgs(d || [])).catch(() => setMsgs([])).finally(() => setLoading(false))
  }, [compraId])
  useEffect(() => { carregar() }, [carregar])

  // Originais na ordem que vêm do backend (mais recente em cima); respostas em
  // ordem cronológica, porque dentro de uma conversa lê-se de cima para baixo.
  const topo = msgs.filter((m) => !m.parentId)
  const porPai = msgs.reduce<Record<string, MensagemRow[]>>((acc, m) => {
    if (m.parentId) (acc[m.parentId] ??= []).push(m)
    return acc
  }, {})
  Object.values(porPai).forEach((arr) =>
    arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))

  async function adicionar() {
    if (richVazio(nova)) return
    setEnviando(true)
    try {
      await (trpc.compra as any).addMensagem.mutate({ compraId, texto: nova })
      setNova(''); setNovaAberta(false); carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setEnviando(false) }
  }
  async function responder(parentId: string, texto: string) {
    try { await (trpc.compra as any).addMensagem.mutate({ compraId, texto, parentId }); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message); throw e }
  }
  async function editar(id: string, texto: string) {
    try {
      await (trpc.compra as any).updateMensagem.mutate({ id, texto })
      // Troca só a mensagem editada no estado local, sem refetch da lista.
      setMsgs((prev) => prev.map((m) => m.id === id ? { ...m, texto, updatedAt: new Date().toISOString() } : m))
    } catch (e) { alerts.error('Erro', (e as Error).message); throw e }
  }
  async function excluir(id: string) {
    const ok = await alerts.confirm({ title: 'Excluir mensagem?', text: 'Esta ação não pode ser desfeita.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.compra as any).removeMensagem.mutate({ id })
      // Some com a mensagem e com as respostas dela — é o que o backend faz.
      setMsgs((prev) => prev.filter((m) => m.id !== id && m.parentId !== id))
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-[13px] font-semibold flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" style={{ color: MODULE_COLOR }} />
          Mensagens
          {msgs.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1 h-4 px-1.5">{msgs.length}</Badge>}
        </h5>
        <Button type="button" size="sm" className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }} onClick={() => setNovaAberta(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova mensagem
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : topo.length > 0 ? (
        <div className="space-y-3">
          {topo.map((m) => (
            <MensagemItem
              key={m.id}
              msg={m}
              currentUserId={currentUserId}
              respostas={porPai[m.id] || []}
              onExcluir={excluir}
              onEditar={editar}
              onResponder={(t) => responder(m.id, t)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/60 px-4 py-8 text-center">
          <MessageSquare className="h-6 w-6 mx-auto mb-2 text-muted-foreground/60" />
          <p className="text-xs text-muted-foreground mb-3">Nenhuma mensagem ainda.</p>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setNovaAberta(true)}>
            <Plus className="h-3.5 w-3.5" /> Adicionar a primeira mensagem
          </Button>
        </div>
      )}

      <Dialog open={novaAberta} onOpenChange={(o) => { if (!enviando) setNovaAberta(o) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={MessageSquare} color="sky">
            <DialogTitle>Nova mensagem</DialogTitle>
            <DialogDescription>Registre uma interação no pedido. Fica visível para quem acessa o pedido.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Texto da Mensagem</Label>
              <RichEditor value={nova} onChange={setNova} placeholder="Escreva aqui o conteúdo da mensagem..." />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => setNovaAberta(false)} disabled={enviando}>Cancelar</Button>
            <Button type="button" size="sm" className="gap-1.5 text-white" style={{ backgroundColor: MODULE_COLOR }} onClick={adicionar} disabled={enviando || richVazio(nova)}>
              {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Salvar mensagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
