'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Headphones, Plus, Loader2, Search, Filter, AlertTriangle, Clock, MessageSquare,
  CheckCircle2, ListChecks, LayoutGrid, List as ListIcon, Inbox, Settings, Archive,
  Paperclip,
} from 'lucide-react'
import {
  DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Button, Card, Badge, Input, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import {
  HELPDESK_STATUS, HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE, HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_PRIORIDADE_COLORS, HELPDESK_TIPO_LABELS,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'
import { NovoTicketModal } from './_components/novo-ticket-modal'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

interface Ticket {
  id: string
  numero: number
  titulo: string
  status: HelpdeskStatus
  prioridade: HelpdeskPrioridade
  tipo: 'INCIDENTE' | 'REQUISICAO' | 'DUVIDA' | 'MELHORIA'
  prazoSla: string | null
  createdAt: string
  solicitante: { id: string; name: string; image: string | null } | null
  responsavel: { id: string; name: string; image: string | null } | null
  categoria: { id: string; nome: string; cor: string | null } | null
  area: { id: string; name: string } | null
  _count: { mensagens: number; anexos: number }
  /** Primeiro anexo de imagem do ticket — usado como capa do card no kanban. */
  capa: { id: string; fileName: string; fileUrl: string; mimeType: string | null } | null
}

// Colunas do kanban — ordem visual horizontal
const COLUNAS: HelpdeskStatus[] = [
  'NOVO',
  'EM_ANDAMENTO',
  'RESOLVIDO',
  'CONCLUIDO',
  'CANCELADO',
]

const STATUS_COR: Record<HelpdeskStatus, string> = {
  NOVO: '#0ea5e9',
  EM_ANDAMENTO: '#06b6d4',
  RESOLVIDO: '#10b981',
  CONCLUIDO: '#94a3b8',
  CANCELADO: '#f43f5e',
}

export default function HelpdeskPage() {
  const router = useRouter()
  // Estados independentes:
  //   - isAgente: tem permissão helpdesk.canRead → vê o módulo (qualquer um que tenha o slug)
  //   - podeAtuar: É TI/DIRETOR/COORDENADOR ou tem sub-permissão atuar_agente — vê tudo,
  //     pode arrastar, configurar, etc. É o critério REAL pra distinguir "TI" dos demais.
  // Colaborador comum: isAgente=true (vê módulo) MAS podeAtuar=false (vê só os próprios).
  const [isAgente, setIsAgente] = useState<boolean | null>(null)
  const [podeAtuar, setPodeAtuar] = useState<boolean | null>(null)
  const [items, setItems] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<'MEUS' | 'AREA' | 'TODOS'>('MEUS')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState<HelpdeskPrioridade | ''>('')
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>(() => {
    if (typeof window === 'undefined') return 'kanban'
    return (window.localStorage.getItem('helpdesk:viewMode') as 'kanban' | 'lista') || 'kanban'
  })
  const [novoOpen, setNovoOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') window.localStorage.setItem('helpdesk:viewMode', viewMode)
  }, [viewMode])

  // Não-TI (sem podeAtuar) só veem em modo Lista — força quando descobrir o papel
  useEffect(() => {
    if (podeAtuar === false && viewMode !== 'lista') setViewMode('lista')
  }, [podeAtuar, viewMode])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Probe 1 — canRead: vê painel completo (não só os próprios tickets)
  useEffect(() => {
    let cancelled = false
    ;(trpc.helpdesk as any).probeAccess.query()
      .then(() => { if (!cancelled) setIsAgente(true) })
      .catch(() => { if (!cancelled) setIsAgente(false) })
    return () => { cancelled = true }
  }, [])

  // Probe 2 — atuar_agente: pode mover cards, atribuir, classificar prioridade
  useEffect(() => {
    let cancelled = false
    ;(trpc.helpdesk as any).probeAtuarAgente.query()
      .then((r: { ok: boolean }) => { if (!cancelled) setPodeAtuar(!!r?.ok) })
      .catch(() => { if (!cancelled) setPodeAtuar(false) })
    return () => { cancelled = true }
  }, [])

  const fetchData = useCallback(async () => {
    // Aguarda descobrir o papel real (podeAtuar = TI vs colaborador comum)
    if (podeAtuar === null) return
    setLoading(true)
    try {
      if (podeAtuar) {
        // TI: vê painel completo conforme escopo
        const res = await (trpc.helpdesk as any).list.query({
          scope,
          search: debouncedSearch || undefined,
          prioridade: filtroPrioridade ? [filtroPrioridade] : undefined,
          page: 1,
          limit: 200,
        })
        setItems(res.data || [])
      } else {
        // Colaborador comum: vê APENAS os próprios tickets em formato lista
        const data = await (trpc.helpdesk as any).listMeus.query({ incluirHistorico: true })
        const q = (debouncedSearch || '').trim().toLowerCase()
        const filtered = (data || []).filter((t: Ticket) => {
          if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false
          if (q) {
            const hit = t.titulo.toLowerCase().includes(q)
            if (!hit) return false
          }
          return true
        })
        setItems(filtered)
      }
    } catch (e) {
      alerts.error('Erro ao listar', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [podeAtuar, scope, debouncedSearch, filtroPrioridade])

  useEffect(() => { fetchData() }, [fetchData])

  // Refetch em back/forward + retorno de aba — App Router preserva o
  // componente em soft navigation; sem isso a lista fica stale após
  // criar/abrir/voltar de um ticket.
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

  // ── DnD ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeCard = useMemo(() => items.find(t => t.id === activeId) || null, [items, activeId])

  const handleDragStart = (e: DragStartEvent) => {
    if (!podeAtuar) return // só TI/diretor/coordenador move cards
    setActiveId(e.active.id as string)
  }
  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    if (!podeAtuar) return
    const { active, over } = e
    if (!over) return
    const ticketId = String(active.id)
    const overId = String(over.id)
    // overId pode ser uma coluna (status) ou outro card
    let novoStatus: HelpdeskStatus | null = null
    if (COLUNAS.includes(overId as HelpdeskStatus)) {
      novoStatus = overId as HelpdeskStatus
    } else {
      const overTicket = items.find(t => t.id === overId)
      if (overTicket) novoStatus = overTicket.status
    }
    if (!novoStatus) return
    const atual = items.find(t => t.id === ticketId)
    if (!atual || atual.status === novoStatus) return

    // Otimismo
    setItems(prev => prev.map(t => t.id === ticketId ? { ...t, status: novoStatus! } : t))
    try {
      await (trpc.helpdesk as any).update.mutate({
        id: ticketId,
        data: { status: novoStatus },
      })
    } catch (err) {
      alerts.error('Erro', (err as Error).message)
      // Reverte
      setItems(prev => prev.map(t => t.id === ticketId ? { ...t, status: atual.status } : t))
    }
  }

  // Agrupa por status
  const porStatus = useMemo(() => {
    const map = new Map<HelpdeskStatus, Ticket[]>()
    for (const s of COLUNAS) map.set(s, [])
    for (const t of items) {
      const arr = map.get(t.status) ?? []
      arr.push(t)
      map.set(t.status, arr)
    }
    return map
  }, [items])

  if (isAgente === null) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 h-[calc(100vh-90px)]">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULO_COLOR}, color-mix(in srgb, ${MODULO_COLOR} 87%, transparent))` }}
          >
            <Headphones className="h-6 w-6" />
          </div>
          <div>
            <h1>HelpDesk</h1>
            <p className="text-sm text-muted-foreground">
              {podeAtuar
                ? 'Atendimento — arraste cards para mudar o status. Filtros por escopo, prioridade e busca.'
                : isAgente
                ? 'Acompanhamento do painel — somente leitura.'
                : 'Acompanhe seus tickets. Para abrir um novo, clique em "Novo Ticket".'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Toggle Kanban/Lista — só TI (podeAtuar). Demais usuários veem só Lista. */}
          {podeAtuar && (
            <div className="flex items-center border rounded-[2px] overflow-hidden">
              <button
                type="button"
                className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
                onClick={() => setViewMode('kanban')}
                title="Kanban"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={cn('p-1.5 transition-colors', viewMode === 'lista' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
                onClick={() => setViewMode('lista')}
                title="Lista"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          <Button
            size="sm"
            onClick={() => setNovoOpen(true)}
            style={{ backgroundColor: MODULO_COLOR }}
            className="text-white gap-1.5"
          >
            <Plus className="h-4 w-4" /> Novo Ticket
          </Button>
          {/* Configurações — só TI (podeAtuar) */}
          {podeAtuar && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push('/helpdesk/configuracoes')}
              title="Configurações do HelpDesk"
              className="h-9 w-9"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Filtros — escopo e prioridade só pra TI */}
      <div className="flex flex-wrap gap-2 shrink-0 items-center">
        {podeAtuar && (
          <Select value={scope} onValueChange={v => setScope(v as 'MEUS' | 'AREA' | 'TODOS')}>
            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MEUS">Meus tickets</SelectItem>
              <SelectItem value="AREA">Minha área</SelectItem>
              <SelectItem value="TODOS">Todos</SelectItem>
            </SelectContent>
          </Select>
        )}
        {podeAtuar && (
          <Select value={filtroPrioridade || '__all__'} onValueChange={v => setFiltroPrioridade(v === '__all__' ? '' : v as HelpdeskPrioridade)}>
            <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Prioridade" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas prioridades</SelectItem>
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
        )}
        <div className="relative flex-1 max-w-xs">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAgente ? 'Buscar título, descrição, tags...' : 'Buscar nos meus tickets...'}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {items.length} ticket{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Body */}
      {loading ? (
        <Card className="flex-1 flex items-center justify-center py-16">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando tickets...
          </div>
        </Card>
      ) : items.length === 0 ? (
        <Card className="flex-1 flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Inbox className="h-10 w-10 opacity-30 mb-2" />
          <p className="text-sm">Nenhum ticket encontrado</p>
        </Card>
      ) : viewMode === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto overflow-y-hidden pb-4 -mx-1 flex-1">
            <div className="flex gap-3 px-1 h-full" style={{ minWidth: `${COLUNAS.length * 240}px` }}>
              {COLUNAS.map(status => (
                <KanbanColumn
                  key={status}
                  status={status}
                  cor={STATUS_COR[status]}
                  tickets={porStatus.get(status) ?? []}
                  onCardClick={(id) => router.push(`/helpdesk/${id}`)}
                  podeArquivarLote={!!podeAtuar && (status === 'CANCELADO' || status === 'CONCLUIDO')}
                  onArchiveAll={async () => {
                    const labelStatus = HELPDESK_STATUS_LABELS[status]
                    const qtd = porStatus.get(status)?.length ?? 0
                    if (qtd === 0) return
                    const ok = await alerts.confirm({
                      title: `Arquivar ${qtd} ticket${qtd > 1 ? 's' : ''}?`,
                      text: `Todos os tickets da coluna "${labelStatus}" serão arquivados (somem do kanban mas continuam acessíveis pelo histórico).`,
                      confirmText: 'Arquivar tudo',
                      icon: 'warning',
                    })
                    if (!ok) return
                    try {
                      const r = await (trpc.helpdesk as any).arquivarPorStatus.mutate({ status }) as { count: number }
                      alerts.success('Arquivados', `${r.count} ticket${r.count > 1 ? 's' : ''} arquivado${r.count > 1 ? 's' : ''}.`)
                      fetchData()
                    } catch (e) {
                      alerts.error('Erro', (e as Error).message)
                    }
                  }}
                />
              ))}
            </div>
          </div>
          <DragOverlay>
            {activeCard && <KanbanCard ticket={activeCard} dragging cor={STATUS_COR[activeCard.status]} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <Card className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {items.map(t => (
              <TicketRow key={t.id} ticket={t} onClick={() => router.push(`/helpdesk/${t.id}`)} />
            ))}
          </div>
        </Card>
      )}

      <NovoTicketModal
        open={novoOpen}
        onOpenChange={setNovoOpen}
        permitePrioridade={podeAtuar}
        onCreated={(id) => {
          fetchData()
          // Quem pode atuar vai direto pro detalhe (triagem); demais ficam na lista
          if (podeAtuar) router.push(`/helpdesk/${id}`)
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Coluna Kanban (droppable, contém SortableContext com cards)
// ─────────────────────────────────────────────────────────────────
function KanbanColumn({ status, cor, tickets, onCardClick, podeArquivarLote, onArchiveAll }: {
  status: HelpdeskStatus
  cor: string
  tickets: Ticket[]
  onCardClick: (id: string) => void
  podeArquivarLote?: boolean
  onArchiveAll?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[240px] flex flex-col border border-border/40 overflow-hidden rounded transition-colors',
        isOver && 'ring-2 ring-offset-1',
      )}
      style={isOver ? { boxShadow: `0 0 0 2px ${cor}55` } : undefined}
    >
      <div
        className="px-3 py-2.5 border-b flex items-center justify-between gap-2"
        style={{ backgroundColor: `${cor}12` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-sm font-semibold truncate">{HELPDESK_STATUS_LABELS[status]}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">{tickets.length}</Badge>
          {podeArquivarLote && tickets.length > 0 && (
            <button
              type="button"
              onClick={onArchiveAll}
              title={`Arquivar todos os ${tickets.length} ticket${tickets.length > 1 ? 's' : ''} desta coluna`}
              className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-background/60 hover:text-foreground transition-colors"
            >
              <Archive className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 p-2 space-y-2 overflow-y-auto nice-scrollbar min-h-[120px]">
        <SortableContext items={tickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tickets.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 italic">Vazio</p>
          ) : tickets.map(t => (
            <SortableCard key={t.id} ticket={t} cor={cor} onClick={() => onCardClick(t.id)} />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

function SortableCard({ ticket, cor, onClick }: { ticket: Ticket; cor: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}>
      <KanbanCard ticket={ticket} cor={cor} />
    </div>
  )
}

function KanbanCard({ ticket, cor, dragging = false }: { ticket: Ticket; cor: string; dragging?: boolean }) {
  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const corPrioridade = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]
  const prazoAtrasado = ticket.prazoSla && new Date(ticket.prazoSla).getTime() < Date.now()
    && !['CONCLUIDO', 'CANCELADO', 'RESOLVIDO'].includes(ticket.status)
  const temCapa = !!ticket.capa
  return (
    <div
      className={cn(
        'rounded-sm bg-white dark:bg-card cursor-grab active:cursor-grabbing group overflow-hidden border border-border/50',
        dragging ? 'shadow-lg' : 'hover:shadow-md transition-shadow',
      )}
    >
      {/* Capa — primeira imagem anexada. Imagem fica DENTRO do card com
          padding em volta e bordas arredondadas (estilo Notion). Chip com
          o total de anexos no canto da imagem quando há mais de 1. */}
      {temCapa && (
        <div className="px-2 pt-2">
          <div className="relative w-full aspect-[16/9] bg-muted overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAssetUrl(ticket.capa!.fileUrl)}
              alt={ticket.capa!.fileName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {ticket._count.anexos > 1 && (
              <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 bg-black/55 backdrop-blur-sm text-white text-[9px] font-semibold rounded-full px-1.5 py-0.5">
                <Paperclip className="h-2.5 w-2.5" />
                {ticket._count.anexos}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: cor }} />
        <div className="flex-1 min-w-0 flex flex-col p-2 gap-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{ticketNum}</span>
            <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: corPrioridade }}>
              {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
            </span>
            {prazoAtrasado && (
              <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] text-rose-600 font-semibold">
                <AlertTriangle className="h-2.5 w-2.5" /> SLA
              </span>
            )}
          </div>
          <p className="text-[12px] font-semibold leading-tight line-clamp-2">{ticket.titulo}</p>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="truncate">{ticket.solicitante?.name || 'Externo'}</span>
            <span className="inline-flex items-center gap-1.5 shrink-0">
              {/* Quando não há capa, mostra contador de anexos aqui (do lado das mensagens) */}
              {!temCapa && ticket._count.anexos > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Paperclip className="h-3 w-3" /> {ticket._count.anexos}
                </span>
              )}
              {ticket._count.mensagens > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <MessageSquare className="h-3 w-3" /> {ticket._count.mensagens}
                </span>
              )}
              {ticket.responsavel ? (
                ticket.responsavel.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveAssetUrl(ticket.responsavel.image)} alt={ticket.responsavel.name} className="h-4 w-4 rounded-full object-cover" />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-[#5ea3cb] text-white text-[7px] flex items-center justify-center font-bold">
                    {ticket.responsavel.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                )
              ) : (
                <span className="h-4 w-4 rounded-full bg-muted text-muted-foreground text-[8px] flex items-center justify-center font-bold">?</span>
              )}
            </span>
          </div>
          {ticket.categoria && (
            <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
              {ticket.categoria.cor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ticket.categoria.cor }} />}
              {ticket.categoria.nome}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function TicketRow({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const corPrioridade = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]
  return (
    <div onClick={onClick} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 group">
      <div className="w-1 h-12 rounded-full shrink-0" style={{ backgroundColor: corPrioridade }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{ticketNum}</span>
          <Badge variant="outline" className="text-[10px] h-5">
            {HELPDESK_STATUS_LABELS[ticket.status]}
          </Badge>
          {ticket.tipo && (
            <span className="text-[10px] text-muted-foreground">{HELPDESK_TIPO_LABELS[ticket.tipo]}</span>
          )}
          {ticket.categoria && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              {ticket.categoria.cor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ticket.categoria.cor }} />}
              {ticket.categoria.nome}
            </span>
          )}
        </div>
        <p className="text-sm font-semibold truncate">{ticket.titulo}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>Solicitante: {ticket.solicitante?.name || '—'}</span>
          {ticket.responsavel && <span>· Resp: {ticket.responsavel.name}</span>}
          {ticket._count.mensagens > 0 && (
            <span>· <MessageSquare className="inline h-3 w-3" /> {ticket._count.mensagens}</span>
          )}
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
        {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
      </span>
    </div>
  )
}
