'use client'

/**
 * Sheet de detalhamento de ticket — abre por cima do kanban (slide-from-right).
 * Mantém o contexto da listagem visível, evita um page navigation completo.
 *
 * Cobertura:
 *   - Header com #HLP, título, status, prioridade e botão "abrir página completa"
 *   - Sidebar compacta com infos principais (solicitante, responsável, SLA, área)
 *   - Descrição inicial em readonly
 *   - Thread de mensagens (sem dropdown de ações — uso o detalhe pra editar)
 *   - Composer pra responder com toggle público/interno + anexos
 *
 * Para edições complexas (status, prioridade, IA, watchers, CSAT, timeline),
 * o botão "abrir página completa" leva pro /helpdesk/[id].
 */

import { useEffect, useState } from 'react'
import {
  Loader2, ExternalLink, MessageSquare, Lock, FileText, Send, Paperclip,
  Headphones, Clock, CircleUser, UserCog, Building2, Tag, Calendar,
} from 'lucide-react'
import {
  Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle, SheetDescription,
  Button, Card, CardContent, Badge, cn, RichEditor,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import {
  HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS, HELPDESK_PRIORIDADE_COLORS,
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
  mensagens: Array<{
    id: string; conteudo: string; interna: boolean; createdAt: string; editadoEm: string | null
    autor: { id: string; name: string; image: string | null } | null
    anexos: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number }>
  }>
  anexos: Array<{ id: string; fileName: string; fileUrl: string; mimeType: string | null; tamanho: number }>
}

interface Props {
  ticketId: string | null
  onClose: () => void
  /** Chamado quando algo muda dentro do sheet — pai pode refetchar o kanban. */
  onChange?: () => void
}

const STATUS_BG_CLASS: Record<HelpdeskStatus, string> = {
  NOVO: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  AGUARDANDO_AUDITORIA: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  EM_ANDAMENTO: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  AGUARDANDO_SOLICITANTE: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  AGUARDANDO_TERCEIRO: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  RESOLVIDO: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  CONCLUIDO: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  CANCELADO: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
}

export function TicketDetailSheet({ ticketId, onClose, onChange }: Props) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [novaMsg, setNovaMsg] = useState('')
  const [interna, setInterna] = useState(false)
  const [msgAnexos, setMsgAnexos] = useState<AnexoStaged[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!ticketId) {
      setTicket(null)
      setNovaMsg('')
      setInterna(false)
      setMsgAnexos([])
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
      // Vincula anexos prontos à nova mensagem
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
      // Refetcha o ticket dentro do sheet pra mostrar a mensagem nova
      const atualizado = await (trpc.helpdesk as any).getById.query({ id: ticket.id })
      setTicket(atualizado as TicketDetail)
      onChange?.()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Sheet open={!!ticketId} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent side="right" size="xl" className="w-[75vw] max-w-[1100px]">
        {loading || !ticket ? (
          <div className="flex items-center justify-center flex-1 py-16">
            <SheetTitle className="sr-only">Carregando ticket</SheetTitle>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b">
              <div className="flex items-start gap-3 pr-12">
                <div className="h-9 w-9 shrink-0 rounded-md bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 flex items-center justify-center">
                  <Headphones className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono text-muted-foreground">
                      #HLP{String(ticket.numero).padStart(4, '0')}
                    </span>
                    <span className={cn('inline-flex items-center text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', STATUS_BG_CLASS[ticket.status])}>
                      {HELPDESK_STATUS_LABELS[ticket.status]}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5" style={{ borderColor: HELPDESK_PRIORIDADE_COLORS[ticket.prioridade], color: HELPDESK_PRIORIDADE_COLORS[ticket.prioridade] }}>
                      {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
                    </Badge>
                  </div>
                  <SheetTitle className="text-base leading-snug truncate">{ticket.titulo}</SheetTitle>
                  <SheetDescription className="sr-only">
                    Detalhes do ticket {ticket.numero}
                  </SheetDescription>
                </div>
                <a
                  href={`/helpdesk/${ticket.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 inline-flex items-center gap-1.5 px-2.5 h-7 rounded-md border border-border text-[11px] font-medium hover:bg-muted transition-colors"
                  title="Abrir em nova aba"
                >
                  <ExternalLink className="h-3 w-3" /> Página inteira
                </a>
              </div>
            </SheetHeader>

            <SheetBody className="px-5 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-5">
                {/* ── Coluna principal: descrição + thread + composer ── */}
                <div className="space-y-3 min-w-0">
                  {/* Descrição inicial */}
                  <Card className="overflow-hidden">
                    <div className="px-3 py-2 bg-muted/30 border-b flex items-center gap-2">
                      {ticket.solicitante?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveAssetUrl(ticket.solicitante.image)} alt={ticket.solicitante.name} className="h-7 w-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {(ticket.solicitante?.name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-semibold truncate">{ticket.solicitante?.name ?? 'Solicitante externo'}</span>
                          <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold text-cyan-700 dark:text-cyan-400 px-1 py-0.5 rounded bg-cyan-500/10">
                            <FileText className="h-2.5 w-2.5" /> Descrição inicial
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(ticket.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <CardContent className="px-4 py-3">
                      <div
                        className="text-[13px] leading-relaxed prose prose-sm prose-neutral dark:prose-invert max-w-none [&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_a]:text-cyan-600 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(ticket.descricao) }}
                      />
                    </CardContent>
                  </Card>

                  {/* Thread de mensagens */}
                  {ticket.mensagens.length > 0 && (
                    <div className="space-y-2">
                      {ticket.mensagens.map(msg => (
                        <Card key={msg.id} className={cn(msg.interna && 'border-l-4 border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/15')}>
                          <CardContent className="p-3">
                            <div className="flex items-center gap-2 mb-1.5 text-[10px]">
                              {msg.interna ? (
                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 font-semibold text-[9px]">
                                  <Lock className="h-2.5 w-2.5" /> NOTA INTERNA
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-cyan-100 text-cyan-800 font-semibold text-[9px]">
                                  <MessageSquare className="h-2.5 w-2.5" /> PÚBLICA
                                </span>
                              )}
                              <span className="text-muted-foreground font-medium">{msg.autor?.name || 'Externo'}</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">{new Date(msg.createdAt).toLocaleString('pt-BR')}</span>
                              {msg.editadoEm && <span className="text-muted-foreground italic">(editada)</span>}
                            </div>
                            <div
                              className="text-[13px] whitespace-pre-wrap"
                              dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(msg.conteudo) }}
                            />
                            {msg.anexos.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {msg.anexos.map(a => (
                                  <a key={a.id} href={resolveAssetUrl(a.fileUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted transition-colors">
                                    <Paperclip className="h-2.5 w-2.5" /> {a.fileName}
                                  </a>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}

                  {/* Composer */}
                  <Card>
                    <CardContent className="p-2.5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInterna(false)}
                          className={cn(
                            'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                            !interna ? 'bg-cyan-100 text-cyan-800' : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <MessageSquare className="inline h-3 w-3 mr-1" /> Pública
                        </button>
                        <button
                          type="button"
                          onClick={() => setInterna(true)}
                          className={cn(
                            'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                            interna ? 'bg-amber-100 text-amber-800' : 'text-muted-foreground hover:bg-muted',
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
                      <div className="flex justify-end">
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
                    </CardContent>
                  </Card>
                </div>

                {/* ── Sidebar compacta ── */}
                <div className="space-y-3 lg:sticky lg:top-0 h-fit">
                  <Card>
                    <CardContent className="p-3 space-y-2.5 text-[12px]">
                      <InfoCompactRow icon={CircleUser} label="Solicitante" value={ticket.solicitante?.name ?? '—'} />
                      <InfoCompactRow icon={UserCog} label="Responsável" value={ticket.responsavel?.name ?? 'Não atribuído'} />
                      <InfoCompactRow
                        icon={Tag}
                        label="Categoria"
                        value={ticket.categoria ? `${ticket.categoria.parent ? ticket.categoria.parent.nome + ' › ' : ''}${ticket.categoria.nome}` : '—'}
                      />
                      <InfoCompactRow icon={Building2} label="Área" value={ticket.area?.name ?? '—'} />
                      <InfoCompactRow icon={Calendar} label="Criado em" value={new Date(ticket.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                      {ticket.prazoSla && (
                        <InfoCompactRow icon={Clock} label="Prazo SLA" value={new Date(ticket.prazoSla).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} />
                      )}
                    </CardContent>
                  </Card>

                  {ticket.anexos.length > 0 && (
                    <Card>
                      <CardContent className="p-3 space-y-1.5">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                          Anexos do ticket · {ticket.anexos.length}
                        </p>
                        {ticket.anexos.map(a => (
                          <a
                            key={a.id}
                            href={resolveAssetUrl(a.fileUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-[11px] px-2 py-1.5 rounded hover:bg-muted transition-colors min-w-0"
                          >
                            <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate">{a.fileName}</span>
                          </a>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function InfoCompactRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-[12px] font-medium truncate">{value}</p>
      </div>
    </div>
  )
}
