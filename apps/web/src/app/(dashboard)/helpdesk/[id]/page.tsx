'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  Headphones, Loader2, ArrowLeft, MessageSquare, Lock, Send, Paperclip, Clock,
  AlertTriangle, CheckCircle2, XCircle, History, Layers, FileText, UserCog,
  Eye, Star, Save, Tag, Building2, Download, ExternalLink, Image as ImageIcon,
  FileVideo, FileAudio, File as FileIcon, FileSpreadsheet,
} from 'lucide-react'
import {
  Button, Card, CardContent, Badge, Label, cn, RichEditor,
  Tabs, TabsTrigger, TabsContent, SlidingTabsList,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { useSession } from '@/lib/auth-client'
import { linkifyHelpdesk } from '../_components/linkify'
import { AnexosDropzone, type AnexoStaged } from '../_components/anexos-dropzone'
import {
  HELPDESK_STATUS, HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE, HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_PRIORIDADE_COLORS, HELPDESK_TIPO_LABELS,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

interface Mensagem {
  id: string
  conteudo: string
  interna: boolean
  createdAt: string
  autor: { id: string; name: string; image: string | null } | null
}

interface Evento {
  id: string
  tipo: string
  descricao: string
  createdAt: string
  autor: { id: string; name: string; image: string | null } | null
}

interface Anexo {
  id: string
  fileName: string
  fileUrl: string
  mimeType: string | null
  tamanho: number
  createdAt: string
  autor: { id: string; name: string } | null
}

interface Ticket {
  id: string
  numero: number
  titulo: string
  descricao: string
  status: HelpdeskStatus
  prioridade: HelpdeskPrioridade
  tipo: 'INCIDENTE' | 'REQUISICAO' | 'DUVIDA' | 'MELHORIA'
  prazoSla: string | null
  resolvidoEm: string | null
  concluidoEm: string | null
  csatNota: number | null
  csatRespondidoEm: string | null
  tags: string[]
  createdAt: string
  solicitante: { id: string; name: string; email: string | null; image: string | null } | null
  responsavel: { id: string; name: string; email: string | null; image: string | null } | null
  categoria: { id: string; nome: string; cor: string | null; parent: { id: string; nome: string } | null } | null
  area: { id: string; name: string } | null
  watchers: Array<{ id: string; user: { id: string; name: string; image: string | null } }>
  mensagens: Mensagem[]
  anexos: Anexo[]
  eventos: Evento[]
}

// Mesmas cores semânticas do kanban (STATUS_COR em ../page.tsx)
const STATUS_BADGE: Record<HelpdeskStatus, string> = {
  NOVO: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 text-blue-700',
  EM_ANDAMENTO: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 text-amber-700',
  RESOLVIDO: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 text-purple-700',
  CONCLUIDO: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 text-emerald-700',
  CANCELADO: 'bg-red-50 dark:bg-red-900/20 border-red-200 text-red-700',
}

export default function HelpdeskTicketDetailPage() {
  const router = useRouter()
  const params = useParams() as { id: string }
  const id = params.id
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? null

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'visao' | 'conversa' | 'anexos' | 'timeline'>('conversa')

  // Mensagem nova
  const [novaMsg, setNovaMsg] = useState('')
  const [interna, setInterna] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [msgAnexos, setMsgAnexos] = useState<AnexoStaged[]>([])
  const [anexoSelecionadoId, setAnexoSelecionadoId] = useState<string | null>(null)

  // Sidebar — edição inline
  const [savingField, setSavingField] = useState<string | null>(null)
  const [agentes, setAgentes] = useState<Array<{ id: string; name: string; image: string | null; areaName: string | null }>>([])

  // Quem pode atuar (mover status, trocar prioridade, atribuir responsável):
  // mesma regra de /helpdesk → probeAtuarAgente. Colaborador (incluindo
  // solicitante do próprio ticket) tem sidebar read-only.
  const [podeAtuar, setPodeAtuar] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(trpc.helpdesk as any).probeAtuarAgente.query()
      .then((r: { ok: boolean }) => { if (!cancelled) setPodeAtuar(!!r?.ok) })
      .catch(() => { if (!cancelled) setPodeAtuar(false) })
    return () => { cancelled = true }
  }, [])

  // CSAT
  const [csatNota, setCsatNota] = useState<number>(5)
  const [csatComentario, setCsatComentario] = useState('')
  const [csatEnviando, setCsatEnviando] = useState(false)

  // Cancelar ticket — solicitante pode cancelar o próprio enquanto aberto
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await (trpc.helpdesk as any).getById.query({ id }) as Ticket | null
      setTicket(data)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-seleciona o primeiro anexo quando carrega ou quando o anexo selecionado
  // não existe mais (foi removido). Garante que o painel de preview nunca fica vazio
  // se há pelo menos 1 anexo.
  useEffect(() => {
    if (!ticket || ticket.anexos.length === 0) {
      setAnexoSelecionadoId(null)
      return
    }
    if (!anexoSelecionadoId || !ticket.anexos.some(a => a.id === anexoSelecionadoId)) {
      setAnexoSelecionadoId(ticket.anexos[0]!.id)
    }
  }, [ticket, anexoSelecionadoId])

  // Carrega agentes atribuíveis (filtrado pela área da categoria)
  useEffect(() => {
    if (!ticket) return
    ;(trpc.helpdesk as any).listAgentesAtribuiveis.query({ ticketId: ticket.id })
      .then((data: typeof agentes) => setAgentes(data || []))
      .catch(() => setAgentes([]))
  }, [ticket])

  async function patch(data: Record<string, unknown>, field: string) {
    setSavingField(field)
    try {
      await (trpc.helpdesk as any).update.mutate({ id, data })
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSavingField(null)
    }
  }

  async function enviarMensagem() {
    const conteudo = novaMsg.trim()
    // Strip HTML tags pra validar conteúdo de texto
    const texto = conteudo.replace(/<[^>]+>/g, '').trim()
    const temAnexos = msgAnexos.some(a => a.status === 'ready')
    if (!texto && !temAnexos) return
    if (msgAnexos.some(a => a.status === 'uploading')) {
      alerts.error('Aguarde', 'Aguarde o upload dos anexos terminar.')
      return
    }
    setEnviando(true)
    try {
      const msg = await (trpc.helpdesk as any).addMensagem.mutate({
        ticketId: id,
        conteudo: conteudo || '<p>(anexo)</p>',
        interna,
      })
      // Grava anexos vinculados à mensagem
      const prontos = msgAnexos.filter(a => a.status === 'ready' && a.fileUrl)
      for (const a of prontos) {
        try {
          await (trpc.helpdesk as any).addAnexo.mutate({
            ticketId: id,
            mensagemId: msg.id,
            fileName: a.fileName,
            fileUrl: a.fileUrl,
            mimeType: a.mimeType,
            tamanho: a.tamanho,
          })
        } catch (e) {
          console.warn('[Helpdesk] addAnexo falhou:', (e as Error).message)
        }
      }
      setNovaMsg('')
      setMsgAnexos([])
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function cancelarTicket() {
    setCancelando(true)
    try {
      await (trpc.helpdesk as any).update.mutate({
        id,
        data: { status: 'CANCELADO' },
      })
      setCancelOpen(false)
      await alerts.success('Ticket cancelado', 'O ticket foi marcado como cancelado.')
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setCancelando(false)
    }
  }

  async function enviarCsat() {
    setCsatEnviando(true)
    try {
      await (trpc.helpdesk as any).responderCsat.mutate({
        ticketId: id,
        nota: csatNota,
        comentario: csatComentario.trim() || null,
      })
      await alerts.success('Obrigado!', 'Sua avaliação foi registrada.')
      await fetchData(true)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setCsatEnviando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!ticket) {
    return (
      <div className="text-center py-24 text-muted-foreground">
        <p>Ticket não encontrado</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/helpdesk/meus')}>
          Voltar
        </Button>
      </div>
    )
  }

  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const corPrioridade = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]
  const podeAvaliar = ticket.status === 'RESOLVIDO' && !ticket.csatRespondidoEm
  // Solicitante pode cancelar o próprio ticket enquanto está aberto.
  // TI também pode cancelar (via sidebar/select de status), então aqui foco no solicitante.
  const isSolicitante = !!currentUserId && ticket.solicitante?.id === currentUserId
  const ticketAberto = !['CONCLUIDO', 'CANCELADO'].includes(ticket.status)
  const podeCancelar = isSolicitante && ticketAberto

  return (
    <div className="space-y-0 pb-6">
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as typeof activeTab)} className="space-y-0">
        {/* Header bleed-edge */}
        <div
          className="relative -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 overflow-hidden"
          style={{ backgroundColor: `color-mix(in srgb, ${MODULO_COLOR} 12%, transparent)` }}
        >
          <div
            className="absolute inset-0"
            style={{ backgroundImage: `linear-gradient(to right, color-mix(in srgb, ${MODULO_COLOR} 0%, transparent) 0%, color-mix(in srgb, ${MODULO_COLOR} 80%, transparent) 100%)` }}
          />
          <div className="relative z-10 px-4 sm:px-6 pt-4 sm:pt-6 pb-2">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg"
                  style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}
                >
                  <Headphones className="h-10 w-10" style={{ color: MODULO_COLOR }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-mono text-muted-foreground tabular-nums">{ticketNum}</p>
                  <h1 className="text-xl font-semibold truncate">{ticket.titulo}</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {HELPDESK_TIPO_LABELS[ticket.tipo]}
                    {ticket.categoria && ` · ${ticket.categoria.parent ? `${ticket.categoria.parent.nome} › ` : ''}${ticket.categoria.nome}`}
                    {ticket.solicitante && ` · Solicitante: ${ticket.solicitante.name}`}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase border ${STATUS_BADGE[ticket.status]}`}>
                      {HELPDESK_STATUS_LABELS[ticket.status]}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase text-white"
                      style={{ backgroundColor: corPrioridade }}
                    >
                      {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {podeCancelar && (
                  <Button
                    variant="outline" size="sm"
                    onClick={() => setCancelOpen(true)}
                    className="gap-1.5 text-xs text-rose-600 bg-white/70 hover:bg-rose-50 dark:bg-black/30 dark:hover:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                    title="Cancelar este ticket"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Cancelar
                  </Button>
                )}
                <BackButton href="/helpdesk" />
              </div>
            </div>
          </div>
          {/* Tabs — padrão SlidingTabsList (mesmo de /orcamentos/[id]) com
              indicador deslizante animado entre os triggers. */}
          <div className="relative z-10 px-4 sm:px-6 pb-2 overflow-x-auto flex justify-center">
            <SlidingTabsList activeValue={activeTab} className="min-w-max !shadow-sm !border !border-b !border-white/80 dark:!border-white/25 gap-1.5 !p-1 !bg-white/40 dark:!bg-black/30 !rounded-full backdrop-blur-sm w-fit">
              <TabsTrigger value="conversa" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Conversação
                {ticket.mensagens.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1.5 h-4 px-1.5">{ticket.mensagens.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="visao" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Visão geral
              </TabsTrigger>
              <TabsTrigger value="anexos" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <Paperclip className="h-3.5 w-3.5" /> Anexos
                {ticket.anexos.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] ml-1.5 h-4 px-1.5">{ticket.anexos.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="timeline" className="!relative !z-10 !rounded-full !border-b-0 !px-4 !py-1.5 !text-xs !font-semibold !text-foreground/70 hover:!text-foreground transition-colors data-[state=active]:!bg-transparent data-[state=active]:!shadow-none data-[state=active]:!text-cyan-700 dark:data-[state=active]:!text-cyan-300 gap-1.5">
                <History className="h-3.5 w-3.5" /> Histórico
              </TabsTrigger>
            </SlidingTabsList>
          </div>
        </div>

        {/* Body em 2 colunas: conteúdo + sidebar */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="min-w-0 space-y-4">
            {/* CSAT — destacado se pendente */}
            {podeAvaliar && ticket.solicitante && (
              <Card className="border-l-4 border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/20">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <h3 className="text-sm font-semibold">Como foi seu atendimento?</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sua avaliação encerra o ticket — obrigatória para fechamento (auto-fecha em 3 dias úteis com nota neutra).
                  </p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCsatNota(n)}
                        className="p-1 hover:scale-110 transition-transform"
                        title={`${n} estrela${n > 1 ? 's' : ''}`}
                      >
                        <Star
                          className={cn('h-7 w-7', n <= csatNota ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')}
                        />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={csatComentario}
                    onChange={e => setCsatComentario(e.target.value)}
                    placeholder="Comentário opcional sobre o atendimento..."
                    rows={2}
                    className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <Button
                    size="sm"
                    onClick={enviarCsat}
                    disabled={csatEnviando}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                  >
                    {csatEnviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />}
                    Enviar avaliação
                  </Button>
                </CardContent>
              </Card>
            )}

            <TabsContent value="conversa" className="space-y-3 mt-0">
              {/* Descrição inicial */}
              <Card className="border-l-4 border-l-cyan-500/70 overflow-hidden">
                {/* Header com avatar + autor + timestamp */}
                <div className="px-4 py-3 bg-muted/30 border-b flex items-center gap-3">
                  {ticket.solicitante?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={resolveAssetUrl(ticket.solicitante.image)}
                      alt={ticket.solicitante.name}
                      className="h-9 w-9 rounded-full object-cover shrink-0 ring-2 ring-card"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 text-white text-xs font-bold flex items-center justify-center shrink-0 ring-2 ring-card">
                      {(ticket.solicitante?.name ?? '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">
                        {ticket.solicitante?.name ?? 'Solicitante externo'}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-cyan-700 dark:text-cyan-400 px-1.5 py-0.5 rounded bg-cyan-500/10">
                        <FileText className="h-2.5 w-2.5" /> Descrição inicial
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {ticket.solicitante?.email && (
                        <span className="mr-2">{ticket.solicitante.email}</span>
                      )}
                      <span>{new Date(ticket.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </p>
                  </div>
                </div>
                {/* Conteúdo da descrição */}
                <CardContent className="px-5 py-4">
                  <div
                    className="text-sm leading-relaxed prose prose-sm prose-neutral dark:prose-invert max-w-none [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_a]:text-cyan-600 [&_a]:underline"
                    dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(ticket.descricao) }}
                  />
                </CardContent>
              </Card>

              {/* Thread */}
              {ticket.mensagens.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">
                  Nenhuma mensagem ainda. Use o composer abaixo pra iniciar a conversa.
                </CardContent></Card>
              ) : ticket.mensagens.map(msg => (
                <Card
                  key={msg.id}
                  className={cn(
                    msg.interna && 'border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20',
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2 text-[11px]">
                      {msg.interna ? (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 font-semibold text-[10px]">
                          <Lock className="h-2.5 w-2.5" /> NOTA INTERNA
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-cyan-100 text-cyan-800 font-semibold text-[10px]">
                          <MessageSquare className="h-2.5 w-2.5" /> PÚBLICA
                        </span>
                      )}
                      <span className="text-muted-foreground font-medium">{msg.autor?.name || 'Externo'}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{new Date(msg.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                    <div
                      className="text-sm whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: linkifyHelpdesk(msg.conteudo) }}
                    />
                  </CardContent>
                </Card>
              ))}

              {/* Composer */}
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setInterna(false)}
                      className={cn(
                        'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                        !interna
                          ? 'bg-cyan-100 text-cyan-800'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <MessageSquare className="inline h-3 w-3 mr-1" /> Mensagem pública
                    </button>
                    <button
                      type="button"
                      onClick={() => setInterna(true)}
                      className={cn(
                        'text-[11px] px-2 py-1 rounded font-medium transition-colors',
                        interna
                          ? 'bg-amber-100 text-amber-800'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Lock className="inline h-3 w-3 mr-1" /> Nota interna
                    </button>
                  </div>
                  <RichEditor
                    value={novaMsg}
                    onChange={(html) => setNovaMsg(html)}
                    placeholder={interna ? 'Nota privada (só agentes veem)' : 'Resposta visível ao solicitante'}
                    className="min-h-[100px]"
                  />
                  <AnexosDropzone value={msgAnexos} onChange={setMsgAnexos} compact />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={enviarMensagem}
                      disabled={enviando || (!novaMsg.replace(/<[^>]+>/g, '').trim() && !msgAnexos.some(a => a.status === 'ready'))}
                      style={{ backgroundColor: MODULO_COLOR }}
                      className="text-white gap-1.5"
                    >
                      {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Enviar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="visao" className="mt-0">
              <Card>
                <CardContent className="p-4 space-y-3 text-sm">
                  <InfoLine label="Solicitante" value={ticket.solicitante?.name || '—'} />
                  <InfoLine label="Responsável" value={ticket.responsavel?.name || 'Não atribuído'} />
                  <InfoLine label="Categoria" value={ticket.categoria ? `${ticket.categoria.parent ? ticket.categoria.parent.nome + ' › ' : ''}${ticket.categoria.nome}` : '—'} />
                  <InfoLine label="Área" value={ticket.area?.name || '—'} />
                  <InfoLine label="Criado em" value={new Date(ticket.createdAt).toLocaleString('pt-BR')} />
                  {ticket.prazoSla && (
                    <InfoLine label="Prazo SLA" value={new Date(ticket.prazoSla).toLocaleString('pt-BR')} />
                  )}
                  {ticket.resolvidoEm && <InfoLine label="Resolvido em" value={new Date(ticket.resolvidoEm).toLocaleString('pt-BR')} />}
                  {ticket.concluidoEm && <InfoLine label="Concluído em" value={new Date(ticket.concluidoEm).toLocaleString('pt-BR')} />}
                  {ticket.csatNota && (
                    <InfoLine label="CSAT" value={`${ticket.csatNota}/5${ticket.csatRespondidoEm ? ` (em ${new Date(ticket.csatRespondidoEm).toLocaleDateString('pt-BR')})` : ''}`} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="anexos" className="mt-0">
              <AnexosViewer
                ticketId={ticket.id}
                anexos={ticket.anexos}
                selecionadoId={anexoSelecionadoId}
                onSelect={setAnexoSelecionadoId}
                onUploaded={() => fetchData(true)}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-0">
              {ticket.eventos.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">
                  Sem eventos registrados.
                </CardContent></Card>
              ) : (
                <Card><CardContent className="p-0 divide-y">
                  {ticket.eventos.map(ev => (
                    <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="shrink-0 mt-0.5">
                        {ev.tipo === 'criado' && <FileText className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'atribuido' && <UserCog className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'status_alterado' && <Layers className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'mensagem_publica' && <MessageSquare className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'nota_interna' && <Lock className="h-4 w-4 text-amber-600" />}
                        {ev.tipo === 'anexo_adicionado' && <Paperclip className="h-4 w-4 text-cyan-600" />}
                        {ev.tipo === 'csat_recebido' && <Star className="h-4 w-4 text-emerald-600" />}
                        {!['criado','atribuido','status_alterado','mensagem_publica','nota_interna','anexo_adicionado','csat_recebido'].includes(ev.tipo) && (
                          <History className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{ev.descricao}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {ev.autor?.name || 'Sistema'} · {new Date(ev.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </CardContent></Card>
              )}
            </TabsContent>
          </div>

          {/* Sidebar — propriedades editáveis */}
          <aside className="space-y-3 min-w-0">
            <Card>
              <CardContent className="p-3 space-y-3">
                <SideField label="Status" icon={Layers}>
                  {podeAtuar ? (
                    <Select
                      value={ticket.status}
                      onValueChange={v => patch({ status: v }, 'status')}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HELPDESK_STATUS.map(s => (
                          <SelectItem key={s} value={s}>{HELPDESK_STATUS_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={`text-[10px] h-5 ${STATUS_BADGE[ticket.status]}`}>
                      {HELPDESK_STATUS_LABELS[ticket.status]}
                    </Badge>
                  )}
                </SideField>

                <SideField label="Prioridade" icon={AlertTriangle}>
                  {podeAtuar ? (
                    <Select
                      value={ticket.prioridade}
                      onValueChange={v => patch({ prioridade: v }, 'prioridade')}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HELPDESK_PRIORIDADE.map(p => (
                          <SelectItem key={p} value={p}>
                            <span className="inline-flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HELPDESK_PRIORIDADE_COLORS[p] }} />
                              {HELPDESK_PRIORIDADE_LABELS[p]}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: HELPDESK_PRIORIDADE_COLORS[ticket.prioridade] }} />
                      {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
                    </span>
                  )}
                </SideField>

                <SideField label="Responsável" icon={UserCog}>
                  {!podeAtuar ? (
                    <p className="text-xs">{ticket.responsavel?.name || <span className="text-muted-foreground italic">Não atribuído</span>}</p>
                  ) : savingField === 'responsavel' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (
                    <Select
                      value={ticket.responsavel?.id ?? '__null__'}
                      onValueChange={v => patch({ responsavelId: v === '__null__' ? null : v }, 'responsavel')}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Não atribuído" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">— Sem responsável</SelectItem>
                        {agentes.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            <span className="flex flex-col">
                              <span>{a.name}</span>
                              {a.areaName && <span className="text-[9px] text-muted-foreground">{a.areaName}</span>}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </SideField>

                {ticket.area && (
                  <SideField label="Área" icon={Building2}>
                    <p className="text-xs">{ticket.area.name}</p>
                  </SideField>
                )}

                {ticket.prazoSla && (
                  <SideField label="Prazo SLA" icon={Clock}>
                    <p className="text-xs tabular-nums">{new Date(ticket.prazoSla).toLocaleString('pt-BR')}</p>
                  </SideField>
                )}

                {ticket.tags.length > 0 && (
                  <SideField label="Tags" icon={Tag}>
                    <div className="flex flex-wrap gap-1">
                      {ticket.tags.map(t => (
                        <Badge key={t} variant="outline" className="text-[9px]">{t}</Badge>
                      ))}
                    </div>
                  </SideField>
                )}

                {ticket.watchers.length > 0 && (
                  <SideField label="Observadores" icon={Eye}>
                    <div className="flex flex-wrap gap-1">
                      {ticket.watchers.map(w => (
                        <span key={w.id} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                          {w.user.name}
                        </span>
                      ))}
                    </div>
                  </SideField>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </Tabs>

      {/* Dialog: solicitante cancela o próprio ticket */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeaderIcon icon={XCircle} color="rose">
            <DialogTitle>Cancelar ticket</DialogTitle>
            <DialogDescription>
              Tem certeza que quer cancelar o ticket <strong>{ticketNum}</strong>?
              O atendimento será encerrado sem resolução. Não pode ser desfeito —
              se precisar do suporte depois, abra um novo ticket.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            <p className="text-xs text-muted-foreground">
              A TI será notificada e o ticket sairá do kanban ativo.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancelando}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={cancelarTicket}
              disabled={cancelando}
              className="gap-1.5"
            >
              {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Sim, cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Label className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      <p className="col-span-2 text-sm">{value}</p>
    </div>
  )
}

function SideField({ label, icon: Icon, children }: { label: string; icon: typeof Layers; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</Label>
      </div>
      {children}
    </div>
  )
}

// ============================================================
// Visualizador inline de anexos — lista à esquerda + preview à direita.
// Detecta o tipo pelo mimeType e renderiza embed apropriado (img/iframe/video/audio).
// Tipos sem preview nativo (zip, docx, exe...) caem no fallback com botão de download.
// ============================================================

function categoriaArquivo(mime: string | null): 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other' {
  if (!mime) return 'other'
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') return 'text'
  return 'other'
}

function iconeDoArquivo(mime: string | null) {
  switch (categoriaArquivo(mime)) {
    case 'image': return ImageIcon
    case 'pdf': return FileText
    case 'video': return FileVideo
    case 'audio': return FileAudio
    case 'text': return FileSpreadsheet
    default: return FileIcon
  }
}

function formatarBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function AnexosViewer({ ticketId, anexos, selecionadoId, onSelect, onUploaded }: {
  ticketId: string
  anexos: Anexo[]
  selecionadoId: string | null
  onSelect: (id: string) => void
  onUploaded: () => void
}) {
  const ativo = anexos.find(a => a.id === selecionadoId) ?? anexos[0]

  return (
    <Card>
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-[480px]">
          {/* Lista lateral de anexos + dropzone no topo */}
          <div className="border-b md:border-b-0 md:border-r flex flex-col max-h-[680px]">
            <AnexosDropArea ticketId={ticketId} onUploaded={onUploaded} />
            <div className="px-3 py-2 bg-muted/30 border-b border-t">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                {anexos.length === 0 ? 'Sem arquivos' : `${anexos.length} arquivo${anexos.length > 1 ? 's' : ''}`}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto divide-y">
              {anexos.length === 0 ? (
                <div className="px-3 py-6 text-center text-[11px] text-muted-foreground italic">
                  Arraste ou clique acima<br />pra adicionar.
                </div>
              ) : anexos.map(a => {
                const Icon = iconeDoArquivo(a.mimeType)
                const isAtivo = a.id === ativo?.id
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onSelect(a.id)}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors',
                      isAtivo ? 'bg-cyan-500/10 border-l-2 border-cyan-500' : 'hover:bg-muted/40 border-l-2 border-transparent',
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0 mt-0.5', isAtivo ? 'text-cyan-600 dark:text-cyan-400' : 'text-muted-foreground')} />
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[12px] truncate leading-tight', isAtivo ? 'font-semibold text-foreground' : 'font-medium')}>{a.fileName}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                        {a.tamanho > 0 ? formatarBytes(a.tamanho) : '—'}
                        {a.autor?.name && ` · ${a.autor.name}`}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Painel de preview */}
          <div className="flex flex-col bg-muted/10 min-w-0">
            {!ativo ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-xs text-muted-foreground">
                Selecione um arquivo à esquerda pra visualizar
              </div>
            ) : (
              <>
                {/* Toolbar superior do preview */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-card">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ativo.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ativo.mimeType || 'tipo desconhecido'}
                      {ativo.tamanho > 0 && ` · ${formatarBytes(ativo.tamanho)}`}
                      {' · '}{new Date(ativo.createdAt).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <a
                    href={resolveAssetUrl(ativo.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Abrir em nova aba"
                  >
                    <ExternalLink className="h-3 w-3" /> Abrir
                  </a>
                  <a
                    href={resolveAssetUrl(ativo.fileUrl)}
                    download={ativo.fileName}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-cyan-600 hover:bg-cyan-700 text-white transition-colors"
                    title="Baixar"
                  >
                    <Download className="h-3 w-3" /> Baixar
                  </a>
                </div>

                {/* Corpo do preview por tipo */}
                <div className="flex-1 overflow-auto p-3 min-h-[400px]">
                  <AnexoPreview anexo={ativo} />
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AnexoPreview({ anexo }: { anexo: Anexo }) {
  const url = resolveAssetUrl(anexo.fileUrl)
  const cat = categoriaArquivo(anexo.mimeType)

  if (cat === 'image') {
    return (
      <div className="flex items-center justify-center h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={anexo.fileName} className="max-w-full max-h-[600px] object-contain rounded shadow-sm" />
      </div>
    )
  }
  if (cat === 'pdf') {
    return (
      <iframe src={url} title={anexo.fileName} className="w-full h-[640px] rounded border border-border bg-white" />
    )
  }
  if (cat === 'video') {
    return (
      <div className="flex items-center justify-center h-full">
        <video src={url} controls className="max-w-full max-h-[600px] rounded shadow-sm bg-black">
          Seu navegador não suporta vídeo HTML5.
        </video>
      </div>
    )
  }
  if (cat === 'audio') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <FileAudio className="h-16 w-16 text-muted-foreground/50" strokeWidth={1.5} />
        <audio src={url} controls className="w-full max-w-md">
          Seu navegador não suporta áudio HTML5.
        </audio>
      </div>
    )
  }
  // Fallback: ícone + mensagem + CTA
  const Icon = iconeDoArquivo(anexo.mimeType)
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3 p-8">
      <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center">
        <Icon className="h-10 w-10 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Pré-visualização não disponível</p>
        <p className="text-xs text-muted-foreground mt-1">
          Este tipo de arquivo não pode ser exibido inline. Use os botões acima pra abrir ou baixar.
        </p>
      </div>
    </div>
  )
}

/**
 * Área dropzone embarcada no topo do painel de anexos. Click → file picker;
 * drop → upload direto. Cada arquivo: POST /api/upload → trpc helpdesk.addAnexo
 * (que dispara notificação pro outro lado: TI↔solicitante).
 */
function AnexosDropArea({ ticketId, onUploaded }: { ticketId: string; onUploaded: () => void }) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return
    // Bloqueia executáveis no client
    const blocked = ['.exe', '.bat', '.cmd', '.sh', '.msi', '.dll']
    const MAX_BYTES = 20 * 1024 * 1024
    const ok = files.filter(f => {
      const ext = '.' + (f.name.split('.').pop() || '').toLowerCase()
      if (blocked.includes(ext)) {
        alerts.error('Bloqueado', `${f.name}: tipo não permitido.`)
        return false
      }
      if (f.size > MAX_BYTES) {
        alerts.error('Muito grande', `${f.name}: ${(f.size / 1024 / 1024).toFixed(1)}MB > 20MB.`)
        return false
      }
      return true
    })
    if (ok.length === 0) return

    setUploading(ok.length)
    const apiUrl = (await import('@/lib/api-url')).getApiUrl()
    let sucessos = 0
    for (const file of ok) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: fd, credentials: 'include' })
        if (!res.ok) throw new Error(`Upload falhou (${res.status})`)
        const data = await res.json() as { url?: string; filename?: string }
        const fileUrl = data.url || (data.filename ? `${apiUrl}/api/upload/${data.filename}` : null)
        if (!fileUrl) throw new Error('URL ausente na resposta')
        await (trpc.helpdesk as any).addAnexo.mutate({
          ticketId,
          fileName: file.name,
          fileUrl,
          mimeType: file.type || null,
          tamanho: file.size,
        })
        sucessos++
      } catch (e) {
        alerts.error('Erro no anexo', `${file.name}: ${(e as Error).message}`)
      }
    }
    setUploading(0)
    if (sucessos > 0) {
      onUploaded()
    }
  }, [ticketId, onUploaded])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    function onDragEnter(e: DragEvent) { e.preventDefault(); setDragging(true) }
    function onDragOver(e: DragEvent) { e.preventDefault() }
    function onDragLeave(e: DragEvent) {
      e.preventDefault()
      const r = el!.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) setDragging(false)
    }
    function onDrop(e: DragEvent) {
      e.preventDefault(); setDragging(false)
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length > 0) void handleFiles(files)
    }
    el.addEventListener('dragenter', onDragEnter)
    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', onDragEnter)
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [handleFiles])

  return (
    <div
      ref={areaRef}
      onClick={() => uploading === 0 && fileInputRef.current?.click()}
      className={cn(
        'cursor-pointer m-2 rounded-md border-2 border-dashed transition-colors px-3 py-4 flex flex-col items-center gap-1.5 text-center',
        dragging
          ? 'border-cyan-400 bg-cyan-50/50 dark:bg-cyan-950/30'
          : 'border-border/60 hover:border-cyan-300 hover:bg-muted/30',
      )}
    >
      {uploading > 0 ? (
        <>
          <Loader2 className="h-5 w-5 text-cyan-600 animate-spin" />
          <span className="text-[11px] text-muted-foreground">Enviando {uploading}…</span>
        </>
      ) : (
        <>
          <Paperclip className={cn('h-5 w-5', dragging ? 'text-cyan-600' : 'text-muted-foreground')} />
          <div className="text-[11px] leading-tight text-muted-foreground">
            <span className="font-medium text-foreground">Clique pra anexar</span>
            <br />ou solte aqui
          </div>
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length > 0) void handleFiles(files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
