'use client'

/**
 * Sheet de detalhamento de ticket — abre por cima do kanban (slide-from-right).
 * Mantém o contexto da listagem visível, evita um page navigation completo.
 *
 * Layout inspirado no Planka — 2 colunas:
 *   ┌──────────────────────┬────────────────────┐
 *   │ Título grande        │  Comentários e     │
 *   │ Pills de info        │  atividade         │
 *   │ Membros              │                    │
 *   │ Descrição            │  [composer]        │
 *   │ Anexos               │  [comments+events] │
 *   └──────────────────────┴────────────────────┘
 *
 * Para edições complexas (status, prioridade, IA, watchers, CSAT, timeline),
 * o botão "abrir página completa" leva pro /helpdesk/[id].
 */

import { useEffect, useState, type ComponentType } from 'react'
import {
  Loader2, ExternalLink, MessageSquare, Lock, Send, Paperclip, AlignLeft,
  CircleDot, AlertTriangle, Tag, Clock, Users, Calendar, Building2,
  FileText, Activity,
} from 'lucide-react'
import {
  Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription,
  Button, cn, RichEditor,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import {
  HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'
import { linkifyHelpdesk } from './linkify'
import { AnexosDropzone, type AnexoStaged } from './anexos-dropzone'

interface TicketDetail {
  id: string
  numero: number
  titulo: string
  descricao: string
  status: HelpdeskStatus
  prioridade: HelpdeskPrioridade
  createdAt: string
  prazoSla: string | null
  solicitante: { id: string; name: string; email: string | null; image: string | null } | null
  responsavel: { id: string; name: string; email: string | null; image: string | null } | null
  categoria: { id: string; nome: string; parent: { id: string; nome: string } | null } | null
  area: { id: string; name: string } | null
  watchers: Array<{ user: { id: string; name: string; image: string | null } }>
  mensagens: Array<{
    id: string; conteudo: string; interna: boolean; createdAt: string; editadoEm: string | null
    autor: { id: string; name: string; image: string | null } | null
    anexos: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number }>
  }>
  anexos: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number; createdAt: string }>
  eventos: Array<{
    id: string; tipo: string; descricao: string; createdAt: string
    autor: { id: string; name: string; image: string | null } | null
  }>
}

interface Props {
  ticketId: string | null
  onClose: () => void
  /** Chamado quando algo muda dentro do sheet — pai pode refetchar o kanban. */
  onChange?: () => void
}

// Cores semânticas de status — usadas no pill do header
const STATUS_PILL: Record<HelpdeskStatus, string> = {
  NOVO: 'bg-blue-500/20 text-blue-300',
  AGUARDANDO_AUDITORIA: 'bg-cyan-500/20 text-cyan-300',
  EM_ANDAMENTO: 'bg-amber-500/20 text-amber-300',
  AGUARDANDO_SOLICITANTE: 'bg-amber-500/20 text-amber-300',
  AGUARDANDO_TERCEIRO: 'bg-amber-500/20 text-amber-300',
  RESOLVIDO: 'bg-violet-500/20 text-violet-300',
  CONCLUIDO: 'bg-emerald-500/20 text-emerald-300',
  CANCELADO: 'bg-rose-500/20 text-rose-300',
}

const PRIORIDADE_PILL: Record<HelpdeskPrioridade, string> = {
  BAIXA: 'bg-sky-500/20 text-sky-300',
  MEDIA: 'bg-amber-500/20 text-amber-300',
  ALTA: 'bg-orange-500/20 text-orange-300',
  URGENTE: 'bg-rose-500/20 text-rose-300',
}

// Rótulos amigáveis pra eventos do sistema na timeline de atividade
const EVENTO_LABEL: Record<string, string> = {
  status_alterado: 'mudou o status',
  prioridade_alterada: 'mudou a prioridade',
  categoria_alterada: 'mudou a categoria',
  prazo_alterado: 'alterou o prazo',
  atribuido: 'atribuiu o ticket',
  arquivado: 'arquivou o ticket',
  desarquivado: 'desarquivou o ticket',
  criado: 'criou o ticket',
  titulo_editado: 'editou o título',
  descricao_editada: 'editou a descrição',
  mensagem_editada: 'editou uma mensagem',
  mensagem_deletada: 'excluiu uma mensagem',
  anexo_adicionado: 'anexou um arquivo',
  anexo_deletado: 'excluiu um anexo',
  csat_recebido: 'avaliou o ticket',
}

export function TicketDetailSheet({ ticketId, onClose, onChange }: Props) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [novaMsg, setNovaMsg] = useState('')
  const [interna, setInterna] = useState(false)
  const [msgAnexos, setMsgAnexos] = useState<AnexoStaged[]>([])
  const [enviando, setEnviando] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [mostrarDetalhes, setMostrarDetalhes] = useState(false)

  useEffect(() => {
    if (!ticketId) {
      setTicket(null)
      setNovaMsg('')
      setInterna(false)
      setMsgAnexos([])
      setComposerOpen(false)
      return
    }
    let alive = true
    setLoading(true)
    ;(async () => {
      try {
        const t = await (trpc.helpdesk as any).getById.query({ id: ticketId })
        if (alive) setTicket(t as TicketDetail)
      } catch (e) {
        if (alive) alerts.error('Erro', (e as Error).message)
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [ticketId])

  async function enviarMensagem() {
    if (!ticket) return
    const limpo = novaMsg.replace(/<[^>]+>/g, '').trim()
    const temAnexo = msgAnexos.some(a => a.status === 'ready')
    if (!limpo && !temAnexo) {
      alerts.error('Vazio', 'Adicione um texto ou um anexo antes de enviar.')
      return
    }
    setEnviando(true)
    try {
      const msg = await (trpc.helpdesk as any).addMensagem.mutate({
        ticketId: ticket.id,
        conteudo: novaMsg,
        interna,
      })
      const prontos = msgAnexos.filter(a => a.status === 'ready')
      for (const a of prontos) {
        await (trpc.helpdesk as any).addAnexo.mutate({
          ticketId: ticket.id,
          mensagemId: (msg as { id: string }).id,
          fileName: a.fileName,
          fileUrl: a.fileUrl,
          mimeType: a.mimeType,
          tamanho: a.tamanho,
        })
      }
      setNovaMsg('')
      setMsgAnexos([])
      setComposerOpen(false)
      const atualizado = await (trpc.helpdesk as any).getById.query({ id: ticket.id })
      setTicket(atualizado as TicketDetail)
      onChange?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  // Membros = solicitante + responsável + watchers, sem duplicar
  const membros = (() => {
    if (!ticket) return [] as Array<{ id: string; name: string; image: string | null; tipo: string }>
    const map = new Map<string, { id: string; name: string; image: string | null; tipo: string }>()
    if (ticket.solicitante) map.set(ticket.solicitante.id, { ...ticket.solicitante, tipo: 'Solicitante' })
    if (ticket.responsavel) {
      const ex = map.get(ticket.responsavel.id)
      map.set(ticket.responsavel.id, { ...ticket.responsavel, tipo: ex ? 'Solicitante · Responsável' : 'Responsável' })
    }
    for (const w of ticket.watchers) {
      if (!map.has(w.user.id)) map.set(w.user.id, { ...w.user, tipo: 'Observador' })
    }
    return Array.from(map.values())
  })()

  return (
    <Sheet open={!!ticketId} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        size="xl"
        className="w-[80vw] max-w-[1280px] dark:bg-[#242528] p-0 overflow-hidden"
      >
        {loading || !ticket ? (
          <div className="flex items-center justify-center flex-1 py-16">
            <SheetTitle className="sr-only">Carregando ticket</SheetTitle>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Header slim — ID maior à esquerda, botões do tamanho do close (do shadcn) à direita */}
            <SheetHeader className="px-5 py-2.5 border-b border-white/[0.06] dark:border-white/[0.06]">
              <div className="flex items-center justify-between gap-2 pr-12">
                <span className="text-base font-mono font-semibold text-foreground">
                  #HLP{String(ticket.numero).padStart(4, '0')}
                </span>
                <a
                  href={`/helpdesk/${ticket.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-7 w-7 items-center justify-center rounded-md opacity-60 ring-offset-background transition-all hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  title="Abrir em nova aba"
                  aria-label="Abrir em nova aba"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <SheetTitle className="sr-only">Ticket #{ticket.numero}: {ticket.titulo}</SheetTitle>
              <SheetDescription className="sr-only">Detalhes do ticket {ticket.numero}</SheetDescription>
            </SheetHeader>

            <SheetBody className="p-0 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] h-full overflow-hidden">
                {/* ─────────────── COLUNA ESQUERDA — Conteúdo principal ─────────────── */}
                <div className="overflow-y-auto px-7 py-6 space-y-6 min-w-0">
                  {/* Título grande com circle icon */}
                  <div className="flex items-start gap-3">
                    <CircleDot className="h-6 w-6 text-muted-foreground/60 mt-1 shrink-0" strokeWidth={1.5} />
                    <h1 className="text-[22px] leading-tight font-bold text-foreground">
                      {ticket.titulo}
                    </h1>
                  </div>

                  {/* Pills de info — equivalente aos "Adicionar/Etiquetas/Datas/Checklist/Anexo" do Planka */}
                  <div className="flex flex-wrap gap-2 pl-9">
                    <InfoPill
                      icon={Activity}
                      label={HELPDESK_STATUS_LABELS[ticket.status]}
                      className={STATUS_PILL[ticket.status]}
                    />
                    <InfoPill
                      icon={AlertTriangle}
                      label={HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
                      className={PRIORIDADE_PILL[ticket.prioridade]}
                    />
                    {ticket.categoria && (
                      <InfoPill
                        icon={Tag}
                        label={`${ticket.categoria.parent ? ticket.categoria.parent.nome + ' › ' : ''}${ticket.categoria.nome}`}
                      />
                    )}
                    {ticket.area && (
                      <InfoPill icon={Building2} label={ticket.area.name} />
                    )}
                    {ticket.prazoSla && (
                      <InfoPill
                        icon={Clock}
                        label={`SLA ${new Date(ticket.prazoSla).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                      />
                    )}
                    <InfoPill
                      icon={Calendar}
                      label={`Criado ${new Date(ticket.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`}
                    />
                  </div>

                  {/* Membros */}
                  <Section icon={Users} title="Membros">
                    <div className="flex items-center gap-2 flex-wrap pl-9">
                      {membros.map(m => (
                        <Avatar key={m.id} user={m} tooltip={`${m.name} · ${m.tipo}`} />
                      ))}
                    </div>
                  </Section>

                  {/* Descrição */}
                  <Section icon={AlignLeft} title="Descrição">
                    <div className="pl-9">
                      <div
                        className="text-sm leading-relaxed text-foreground/90 prose prose-sm prose-neutral dark:prose-invert max-w-none [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_a]:text-cyan-400 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(ticket.descricao) }}
                      />
                    </div>
                  </Section>

                  {/* Anexos */}
                  {ticket.anexos.length > 0 && (
                    <Section icon={Paperclip} title="Anexos">
                      <div className="pl-9 space-y-2">
                        <p className="text-[11px] font-semibold text-muted-foreground/80 uppercase tracking-wide">Arquivos</p>
                        <div className="space-y-1.5">
                          {ticket.anexos.map(a => <AnexoRow key={a.id} anexo={a} />)}
                        </div>
                      </div>
                    </Section>
                  )}
                </div>

                {/* ─────────────── COLUNA DIREITA — Comentários e atividade ─────────────── */}
                <div className="overflow-y-auto border-l border-white/[0.06] dark:border-white/[0.06] bg-black/[0.08] dark:bg-black/[0.15] flex flex-col min-w-0">
                  <div className="sticky top-0 z-10 px-5 py-3 border-b border-white/[0.06] dark:border-white/[0.06] bg-inherit backdrop-blur flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-muted-foreground/80" />
                      <h3 className="text-[13px] font-bold text-foreground">Comentários e atividade</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMostrarDetalhes(v => !v)}
                      className="text-[11px] font-medium px-2.5 h-7 rounded-md text-foreground/70 hover:text-foreground hover:bg-white/[0.06] transition-colors"
                    >
                      {mostrarDetalhes ? 'Ocultar Detalhes' : 'Mostrar Detalhes'}
                    </button>
                  </div>

                  <div className="px-4 py-4 space-y-3 flex-1">
                    {/* Composer */}
                    {!composerOpen ? (
                      <button
                        type="button"
                        onClick={() => setComposerOpen(true)}
                        className="w-full text-left px-3 py-2.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-[12px] text-muted-foreground transition-colors"
                      >
                        Escrever um comentário…
                      </button>
                    ) : (
                      <div className="rounded-md bg-white/[0.04] p-2.5 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setInterna(false)}
                            className={cn(
                              'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                              !interna ? 'bg-cyan-500/30 text-cyan-200' : 'text-muted-foreground hover:bg-white/[0.06]',
                            )}
                          >
                            <MessageSquare className="inline h-3 w-3 mr-1" /> Pública
                          </button>
                          <button
                            type="button"
                            onClick={() => setInterna(true)}
                            className={cn(
                              'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                              interna ? 'bg-amber-500/30 text-amber-200' : 'text-muted-foreground hover:bg-white/[0.06]',
                            )}
                          >
                            <Lock className="inline h-3 w-3 mr-1" /> Nota interna
                          </button>
                        </div>
                        <RichEditor
                          value={novaMsg}
                          onChange={(html) => setNovaMsg(html)}
                          placeholder={interna ? 'Nota privada (só agentes veem)' : 'Resposta visível ao solicitante'}
                          className="min-h-[90px]"
                        />
                        <AnexosDropzone value={msgAnexos} onChange={setMsgAnexos} compact />
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setComposerOpen(false); setNovaMsg(''); setMsgAnexos([]) }}
                            disabled={enviando}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={enviarMensagem}
                            disabled={enviando || (!novaMsg.replace(/<[^>]+>/g, '').trim() && !msgAnexos.some(a => a.status === 'ready'))}
                            className="gap-1.5"
                          >
                            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Enviar
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Feed de mensagens + (opcional) eventos */}
                    <FeedAtividade
                      mensagens={ticket.mensagens}
                      eventos={ticket.eventos}
                      mostrarEventos={mostrarDetalhes}
                    />
                  </div>
                </div>
              </div>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────────────

function InfoPill({ icon: Icon, label, className }: { icon: ComponentType<{ className?: string }>; label: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-medium',
        'bg-white/[0.06] text-foreground/85',
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[260px]">{label}</span>
    </span>
  )
}

function Section({ icon: Icon, title, action, children }: {
  icon: ComponentType<{ className?: string }>
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <h3 className="text-[14px] font-bold text-foreground">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  )
}

function Avatar({ user, tooltip }: { user: { name: string; image: string | null }; tooltip?: string }) {
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveAssetUrl(user.image)}
        alt={user.name}
        title={tooltip || user.name}
        className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10"
      />
    )
  }
  const initials = (user.name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div
      title={tooltip || user.name}
      className="h-8 w-8 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-xs font-bold flex items-center justify-center ring-1 ring-white/10"
    >
      {initials}
    </div>
  )
}

function AnexoRow({ anexo }: { anexo: { id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number; createdAt: string } }) {
  const isImg = (anexo.mimeType || '').startsWith('image/')
  const url = resolveAssetUrl(anexo.fileUrl)
  return (
    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-white/[0.04] transition-colors">
      {isImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={anexo.fileName} className="h-12 w-16 object-cover rounded shrink-0 bg-black/20" />
      ) : (
        <div className="h-12 w-16 rounded bg-white/[0.06] flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-foreground truncate">{anexo.fileName}</p>
        <p className="text-[11px] text-muted-foreground">
          Adicionado em {new Date(anexo.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
        title="Abrir em nova aba"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  )
}

function FeedAtividade({ mensagens, eventos, mostrarEventos }: {
  mensagens: TicketDetail['mensagens']
  eventos: TicketDetail['eventos']
  mostrarEventos: boolean
}) {
  // Une mensagens e eventos em uma só timeline (mais recente primeiro).
  // Eventos só aparecem com mostrarEventos=true; mensagens sempre aparecem.
  type Item =
    | { kind: 'msg'; createdAt: string; data: TicketDetail['mensagens'][number] }
    | { kind: 'evt'; createdAt: string; data: TicketDetail['eventos'][number] }
  const items: Item[] = []
  for (const m of mensagens) items.push({ kind: 'msg', createdAt: m.createdAt, data: m })
  if (mostrarEventos) {
    for (const e of eventos) items.push({ kind: 'evt', createdAt: e.createdAt, data: e })
  }
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  if (items.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground italic text-center py-6">
        Sem mensagens ainda.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {items.map(item => item.kind === 'msg'
        ? <ComentarioItem key={`m_${item.data.id}`} msg={item.data} />
        : <EventoItem key={`e_${item.data.id}`} evt={item.data} />
      )}
    </div>
  )
}

function ComentarioItem({ msg }: { msg: TicketDetail['mensagens'][number] }) {
  return (
    <div className="flex gap-2.5">
      <div className="shrink-0">
        <Avatar user={{ name: msg.autor?.name ?? 'Externo', image: msg.autor?.image ?? null }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 text-[11px]">
          <span className="font-bold text-foreground">{msg.autor?.name ?? 'Externo'}</span>
          {msg.interna && (
            <span className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/25 text-amber-200 font-semibold">
              <Lock className="h-2 w-2" /> Interna
            </span>
          )}
          <span className="text-cyan-400 hover:underline cursor-default">
            {new Date(msg.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
          {msg.editadoEm && <span className="text-muted-foreground italic">(editada)</span>}
        </div>
        <div
          className={cn(
            'rounded-md px-3 py-2 text-[13px] leading-relaxed',
            msg.interna ? 'bg-amber-500/[0.08]' : 'bg-white/[0.04]',
          )}
          dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(msg.conteudo) }}
        />
        {msg.anexos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.anexos.map(a => {
              const isImg = (a.mimeType || '').startsWith('image/')
              const url = resolveAssetUrl(a.fileUrl)
              return isImg ? (
                <a key={a.id} href={url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={a.fileName} className="max-h-[180px] rounded-md border border-white/10 hover:border-white/30 transition-colors" />
                </a>
              ) : (
                <a key={a.id} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border border-white/10 hover:bg-white/[0.06] transition-colors">
                  <Paperclip className="h-2.5 w-2.5" /> {a.fileName}
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function EventoItem({ evt }: { evt: TicketDetail['eventos'][number] }) {
  const label = EVENTO_LABEL[evt.tipo] ?? evt.tipo.replace(/_/g, ' ')
  return (
    <div className="flex gap-2.5 items-start">
      <div className="shrink-0 mt-1">
        <Avatar user={{ name: evt.autor?.name ?? 'Sistema', image: evt.autor?.image ?? null }} />
      </div>
      <div className="flex-1 min-w-0 pt-1.5">
        <p className="text-[12px] text-foreground/80">
          <span className="font-semibold text-foreground">{evt.autor?.name ?? 'Sistema'}</span>{' '}
          {label}
          {evt.descricao && evt.descricao !== label && (
            <span className="text-muted-foreground"> — {evt.descricao}</span>
          )}
        </p>
        <p className="text-[10px] text-cyan-400/80 mt-0.5">
          {new Date(evt.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}
