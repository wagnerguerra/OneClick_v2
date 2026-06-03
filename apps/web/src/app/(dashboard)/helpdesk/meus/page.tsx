'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Headphones, Plus, Loader2, Clock, CheckCircle2, AlertTriangle,
  MessageSquare, ChevronRight, Filter, Archive, ListChecks,
} from 'lucide-react'
import { Card, Badge, Button, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  HELPDESK_STATUS, HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS, HELPDESK_PRIORIDADE_COLORS,
  type HelpdeskStatus,
} from '@saas/types'
import { NovoTicketModal } from '../_components/novo-ticket-modal'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

interface TicketMeu {
  id: string
  numero: number
  titulo: string
  status: HelpdeskStatus
  prioridade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE'
  tipo: 'INCIDENTE' | 'REQUISICAO' | 'DUVIDA' | 'MELHORIA'
  prazoSla: string | null
  resolvidoEm: string | null
  concluidoEm: string | null
  csatRespondidoEm: string | null
  arquivado: boolean
  createdAt: string
  responsavel: { id: string; name: string; image: string | null } | null
  categoria: { id: string; nome: string; cor: string | null } | null
  _count: { mensagens: number }
}

// Cores semânticas das pills — alinhadas com STATUS_COR do kanban
// (NOVO=blue · EM_ANDAMENTO=amber · RESOLVIDO/Pendente=purple ·
//  CONCLUIDO=emerald · CANCELADO=red)
const STATUS_BADGE: Record<HelpdeskStatus, string> = {
  NOVO: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400',
  AGUARDANDO_AUDITORIA: 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-400',
  EM_ANDAMENTO: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
  RESOLVIDO: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400',
  CONCLUIDO: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400',
  CANCELADO: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400',
}

type FilterKind = 'abertos' | 'historico' | 'todos'

function formatRelativo(d: string): string {
  const dt = new Date(d).getTime()
  const diff = Date.now() - dt
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const dias = Math.floor(h / 24)
  if (dias < 7) return `${dias}d`
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function MeusTicketsPage() {
  const router = useRouter()
  const [items, setItems] = useState<TicketMeu[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKind>('abertos')
  const [modalOpen, setModalOpen] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const statusFiltro = filter === 'abertos'
        ? HELPDESK_STATUS.filter(s => s !== 'CONCLUIDO' && s !== 'CANCELADO')
        : filter === 'historico'
        ? (['CONCLUIDO', 'CANCELADO'] as HelpdeskStatus[])
        : undefined
      const data = await (trpc.helpdesk as any).listMeus.query({
        status: statusFiltro,
        incluirHistorico: filter !== 'abertos',
      })
      setItems(data || [])
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchData() }, [fetchData])

  // Refetch quando a aba volta ao foco ou em back/forward — App Router
  // preserva o componente em soft navigation, então o useEffect inicial
  // não roda de novo ao voltar do detalhe do ticket.
  useEffect(() => {
    function refresh() { fetchData() }
    function onVis() { if (!document.hidden) fetchData() }
    window.addEventListener('popstate', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('popstate', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [fetchData])

  // Filtros visuais (chips horizontais)
  const filtros: Array<{ key: FilterKind; label: string; icon: typeof ListChecks; count?: number }> = [
    { key: 'abertos', label: 'Em aberto', icon: ListChecks, count: items.filter(t => !['CONCLUIDO', 'CANCELADO'].includes(t.status)).length },
    { key: 'historico', label: 'Histórico', icon: Archive, count: items.filter(t => ['CONCLUIDO', 'CANCELADO'].includes(t.status)).length },
    { key: 'todos', label: 'Todos', icon: Filter, count: items.length },
  ]

  // Solicitante precisa avaliar tickets RESOLVIDOS sem CSAT — banner destacado
  const pendentesCsat = items.filter(t => t.status === 'RESOLVIDO' && !t.csatRespondidoEm)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULO_COLOR}, color-mix(in srgb, ${MODULO_COLOR} 87%, transparent))` }}
          >
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <h1>Meus Tickets</h1>
            <p className="text-sm text-muted-foreground">
              Solicite suporte da TI — acompanhe o andamento e avalie o atendimento.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => setModalOpen(true)}
          style={{ backgroundColor: MODULO_COLOR }}
          className="text-white gap-1.5"
        >
          <Plus className="h-4 w-4" /> Novo Ticket
        </Button>
      </div>

      {/* Banner CSAT pendente */}
      {pendentesCsat.length > 0 && (
        <div className="rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 p-3">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            {pendentesCsat.length} ticket{pendentesCsat.length > 1 ? 's' : ''} aguardando sua avaliação
          </p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-1">
            Clique no ticket resolvido para avaliar o atendimento (CSAT obrigatório).
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        {filtros.map(f => {
          const Icon = f.icon
          const active = filter === f.key
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-2 h-8 px-3 rounded-md border text-xs font-medium transition-colors',
                active
                  ? 'border-foreground/20 bg-foreground/[0.04] text-foreground'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              style={active ? { borderColor: MODULO_COLOR, backgroundColor: `color-mix(in srgb, ${MODULO_COLOR} 6%, transparent)`, color: MODULO_COLOR } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {f.label}
              {f.count !== undefined && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-0.5 tabular-nums">
                  {f.count}
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      {/* Lista */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando tickets...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Headphones className="h-10 w-10 opacity-30 mb-2" />
            <p className="text-sm">Você ainda não abriu tickets</p>
            <Button
              size="sm"
              onClick={() => setModalOpen(true)}
              variant="outline"
              className="mt-3 gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Abrir o primeiro ticket
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {items.map(t => {
              const ticketNum = `#HLP${String(t.numero).padStart(4, '0')}`
              const corPrioridade = HELPDESK_PRIORIDADE_COLORS[t.prioridade]
              const prazoAtrasado = t.prazoSla && new Date(t.prazoSla).getTime() < Date.now() && !['CONCLUIDO', 'CANCELADO', 'RESOLVIDO'].includes(t.status)
              const precisaCsat = t.status === 'RESOLVIDO' && !t.csatRespondidoEm
              return (
                <div
                  key={t.id}
                  onClick={() => router.push(`/helpdesk/${t.id}`)}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors group',
                    precisaCsat
                      ? 'bg-emerald-50/40 dark:bg-emerald-900/10 hover:bg-emerald-50/70 dark:hover:bg-emerald-900/20'
                      : 'hover:bg-muted/30',
                  )}
                >
                  <div
                    className="w-1 h-14 rounded-full shrink-0"
                    style={{ backgroundColor: corPrioridade }}
                    title={`Prioridade: ${HELPDESK_PRIORIDADE_LABELS[t.prioridade]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{ticketNum}</span>
                      <Badge variant="outline" className={`text-[10px] h-5 ${STATUS_BADGE[t.status]}`}>
                        {HELPDESK_STATUS_LABELS[t.status]}
                      </Badge>
                      {t.categoria && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          {t.categoria.cor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.categoria.cor }} />}
                          {t.categoria.nome}
                        </span>
                      )}
                      {precisaCsat && (
                        <Badge className="text-[10px] h-5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Avaliar
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold truncate">{t.titulo}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                      <span>Criado {formatRelativo(t.createdAt)}</span>
                      {t.responsavel && (
                        <>
                          <span className="text-muted-foreground/40">•</span>
                          <span>Responsável: <span className="font-medium text-foreground/80">{t.responsavel.name}</span></span>
                        </>
                      )}
                      {t._count.mensagens > 0 && (
                        <>
                          <span className="text-muted-foreground/40">•</span>
                          <span className="inline-flex items-center gap-0.5">
                            <MessageSquare className="h-3 w-3" /> {t._count.mensagens}
                          </span>
                        </>
                      )}
                      {prazoAtrasado && (
                        <>
                          <span className="text-muted-foreground/40">•</span>
                          <span className="inline-flex items-center gap-0.5 text-rose-600 font-medium">
                            <AlertTriangle className="h-3 w-3" /> SLA estourado
                          </span>
                        </>
                      )}
                      {t.prazoSla && !prazoAtrasado && !['CONCLUIDO', 'CANCELADO'].includes(t.status) && (
                        <>
                          <span className="text-muted-foreground/40">•</span>
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" /> Vence {formatRelativo(t.prazoSla)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground shrink-0 mt-1" />
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <NovoTicketModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        permitePrioridade={false}
        onCreated={() => { fetchData() }}
      />
    </div>
  )
}
