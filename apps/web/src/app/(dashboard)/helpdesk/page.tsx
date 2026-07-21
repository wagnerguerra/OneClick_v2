'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Loader2, Search, Filter, AlertTriangle, Clock, MessageSquare,
  CheckCircle2, ListChecks, LayoutGrid, List as ListIcon, Inbox, Settings, Archive,
  Paperclip, Bot, BarChart3,
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
import { TicketDetailSheet } from './_components/ticket-detail-sheet'

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
  /** Solicitante mandou a última mensagem pública ⇒ card destacado (aguarda o agente). */
  aguardandoResposta?: boolean
  // Score da triagem IA (#HLP0083) — exibido como badge no card do kanban.
  // aiElegivel=true → atingiu o threshold (cor violeta), false → não elegível (cinza).
  aiScore?: number | null
  aiElegivel?: boolean | null
  aiPlanoStatus?: 'pendente' | 'aprovado' | 'rejeitado' | null
}

// Colunas do kanban — ordem visual horizontal
const COLUNAS: HelpdeskStatus[] = [
  'NOVO',
  'AGUARDANDO_AUDITORIA',
  'EM_ANDAMENTO',
  'RESOLVIDO',
  'CONCLUIDO',
  'CANCELADO',
]

// Cores semânticas das colunas — cada uma reflete a função do estado:
//   NOVO         → azul       (entrada, aguardando triagem)
//   EM_ANDAMENTO → âmbar      (trabalho ativo)
//   RESOLVIDO    → violeta    (aguardando confirmação/CSAT do solicitante)
//                  o label visível é 'Aguardando avaliação' (HELPDESK_STATUS_LABELS)
//   CONCLUIDO    → verde      (sucesso, fechado)
//   CANCELADO    → vermelho   (anulado)
const STATUS_COR: Record<HelpdeskStatus, string> = {
  NOVO: '#3b82f6',                 // blue-500
  AGUARDANDO_AUDITORIA: '#06b6d4', // cyan-500 (IA respondeu, aguarda revisão)
  EM_ANDAMENTO: '#f59e0b',         // amber-500
  RESOLVIDO: '#a855f7',            // purple-500 (= 'Aguardando avaliação' na UI)
  CONCLUIDO: '#10b981',            // emerald-500
  CANCELADO: '#ef4444',            // red-500
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
  // Modo "Arquivados" — quando true, fetcha só os arquivados (lista) e o
  // botão de cada card vira "Desarquivar" no lugar do drag.
  const [verArquivados, setVerArquivados] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroPrioridade, setFiltroPrioridade] = useState<HelpdeskPrioridade | ''>('')
  const [viewMode, setViewMode] = useState<'kanban' | 'lista'>(() => {
    if (typeof window === 'undefined') return 'kanban'
    return (window.localStorage.getItem('helpdesk:viewMode') as 'kanban' | 'lista') || 'kanban'
  })
  const [novoOpen, setNovoOpen] = useState(false)
  // Ticket aberto no sheet de detalhe (click esquerdo no card do kanban)
  const [openTicketId, setOpenTicketId] = useState<string | null>(null)

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

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    // Aguarda descobrir o papel real (podeAtuar = TI vs colaborador comum)
    if (podeAtuar === null) return
    // #HLP0182: refetch silencioso (foco de aba / back-forward) NÃO seta loading —
    // assim as colunas do kanban não desmontam e o scroll de cada coluna é
    // preservado. Só o carregamento inicial/troca de filtro mostra o spinner.
    if (opts?.silent !== true) setLoading(true)
    try {
      if (podeAtuar) {
        // TI: vê painel completo conforme escopo
        const res = await (trpc.helpdesk as any).list.query({
          scope,
          search: debouncedSearch || undefined,
          prioridade: filtroPrioridade ? [filtroPrioridade] : undefined,
          arquivado: verArquivados, // false=ativos | true=arquivados
          page: 1,
          limit: 200,
        })
        setItems(res.data || [])
      } else {
        // Colaborador comum: vê APENAS os próprios tickets em formato lista
        const data = await (trpc.helpdesk as any).listMeus.query({ incluirHistorico: true })
        const q = (debouncedSearch || '').trim().toLowerCase()
        const digits = q.replace(/\D/g, '')
        const filtered = (data || []).filter((t: Ticket) => {
          if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false
          if (q) {
            const numFmt = `#hlp${String(t.numero).padStart(4, '0')}`
            const hit =
              t.titulo.toLowerCase().includes(q) ||
              numFmt.includes(q) ||
              (!!digits && String(t.numero).includes(digits)) ||
              (t.categoria?.nome?.toLowerCase().includes(q) ?? false) ||
              (t.responsavel?.name?.toLowerCase().includes(q) ?? false) ||
              (t.solicitante?.name?.toLowerCase().includes(q) ?? false)
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
  }, [podeAtuar, scope, debouncedSearch, filtroPrioridade, verArquivados])
  // Nota: no finally o setLoading(false) é inofensivo mesmo no modo silent
  // (loading já estava false). O que importa é NÃO subir pra true no silent.

  useEffect(() => { fetchData() }, [fetchData])

  // Refetch em back/forward + retorno de aba — App Router preserva o
  // componente em soft navigation; sem isso a lista fica stale após
  // criar/abrir/voltar de um ticket.
  useEffect(() => {
    // #HLP0182: refetch silencioso ao voltar (back-forward / foco de aba) — não
    // recarrega as colunas nem perde o scroll; só atualiza os dados em segundo plano.
    function refresh() { fetchData({ silent: true }) }
    function onVis() { if (!document.hidden) fetchData({ silent: true }) }
    window.addEventListener('popstate', refresh)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('popstate', refresh)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [fetchData])

  // ── DnD — segue PADRAO_KANBAN_DND.md (mesma sensação de peso do CRM/orçamentos) ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const lastDragXRef = useRef(0)
  const activeCard = useMemo(() => items.find(t => t.id === activeId) || null, [items, activeId])

  const handleDragStart = (e: DragStartEvent) => {
    if (!podeAtuar) return // só TI/diretor/coordenador move cards
    setActiveId(e.active.id as string)
    // Captura largura real do card pra o overlay não "encolher" (colunas usam flex-1)
    const initial = (e.active as unknown as { rect?: { current?: { initial?: { width: number } } } }).rect?.current?.initial
    setActiveCardWidth(initial?.width ?? null)
    setDragDeltaX(0)
    lastDragXRef.current = 0
  }
  const handleDragMove = (e: { delta: { x: number; y: number } }) => {
    const dx = e.delta.x - lastDragXRef.current
    lastDragXRef.current = e.delta.x
    setDragDeltaX(dx)
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/materiais/icon_helpdesk.png" alt="HelpDesk" className="h-12 w-12 object-contain shrink-0" />
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
          {/* Toggle arquivados — só TI (podeAtuar). Ativa modo de visualização
              dos tickets arquivados, com possibilidade de desarquivar. */}
          {podeAtuar && (
            <Button
              variant={verArquivados ? 'default' : 'outline'}
              size="sm"
              onClick={() => setVerArquivados(v => !v)}
              title={verArquivados ? 'Voltar pros tickets ativos' : 'Ver tickets arquivados'}
              className={cn('gap-1.5', verArquivados && 'bg-amber-500 hover:bg-amber-600 text-white')}
            >
              <Archive className="h-4 w-4" />
              {verArquivados ? 'Saindo do arquivo' : 'Arquivados'}
            </Button>
          )}
          {/* Indicadores (dashboard + relatórios) — só TI (podeAtuar) */}
          {podeAtuar && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => router.push('/helpdesk/indicadores')}
              title="Indicadores e relatórios"
              className="h-9 w-9"
            >
              <BarChart3 className="h-4 w-4" />
            </Button>
          )}
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

      {/* Banner do modo arquivado — sinaliza que a visão é distinta */}
      {verArquivados && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 shrink-0">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs">
            <Archive className="h-3.5 w-3.5" />
            <span>Você está vendo <strong>tickets arquivados</strong>. Eles não aparecem no kanban normal — use o botão de desarquivar pra trazer um ticket de volta.</span>
          </div>
          <button
            type="button"
            onClick={() => setVerArquivados(false)}
            className="text-[11px] text-amber-700 dark:text-amber-300 hover:underline shrink-0"
          >
            Voltar pros ativos
          </button>
        </div>
      )}

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
      ) : (viewMode === 'kanban' && !verArquivados) ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto overflow-y-hidden pb-4 -mx-1 flex-1">
            <div className="flex gap-3 px-1 h-full" style={{ minWidth: `${COLUNAS.length * 240}px` }}>
              {COLUNAS.map(status => (
                <KanbanColumn
                  key={status}
                  status={status}
                  cor={STATUS_COR[status]}
                  tickets={porStatus.get(status) ?? []}
                  onCardClick={(id) => setOpenTicketId(id)}
                  onCardAuxClick={(id) => window.open(`/helpdesk/${id}`, '_blank', 'noopener,noreferrer')}
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
          <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activeCard && <KanbanCardOverlay ticket={activeCard} cor={STATUS_COR[activeCard.status]} velocityX={dragDeltaX} width={activeCardWidth} />}
          </DragOverlay>
        </DndContext>
      ) : (
        <Card className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {items.map(t => (
              <TicketRow
                key={t.id}
                ticket={t}
                onClick={() => router.push(`/helpdesk/${t.id}`)}
                // Em modo arquivado, oferece desarquivar in-place (sem entrar no ticket)
                onUnarchive={verArquivados && podeAtuar ? async () => {
                  try {
                    await (trpc.helpdesk as any).update.mutate({ id: t.id, data: { arquivado: false } })
                    alerts.success('Desarquivado', 'Ticket voltou pra lista ativa.')
                    fetchData()
                  } catch (e) { alerts.error('Erro', (e as Error).message) }
                } : undefined}
              />
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

      {/* Sheet de detalhe — abre por click esquerdo no card. Mantém o
          kanban visível por baixo. Botão do meio abre o detalhe completo
          em nova aba via SortableCard.onAuxClick. */}
      <TicketDetailSheet
        ticketId={openTicketId}
        onClose={() => setOpenTicketId(null)}
        onChange={fetchData}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Coluna Kanban (droppable, contém SortableContext com cards)
// ─────────────────────────────────────────────────────────────────
function KanbanColumn({ status, cor, tickets, onCardClick, onCardAuxClick, podeArquivarLote, onArchiveAll }: {
  status: HelpdeskStatus
  cor: string
  tickets: Ticket[]
  onCardClick: (id: string) => void
  onCardAuxClick?: (id: string) => void
  podeArquivarLote?: boolean
  onArchiveAll?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Coluna sem borda visível, com overlay sutil sobre o fundo do dashboard:
        // - light: leve sombra preta (cinza-claro)
        // - dark: leve overlay branco que clareia o cinza-azulado base
        'flex-1 min-w-[240px] flex flex-col overflow-hidden rounded-lg transition-colors bg-black/[0.04] dark:bg-white/[0.04]',
        isOver && 'ring-2 ring-offset-1',
      )}
      style={isOver ? { boxShadow: `0 0 0 2px ${cor}55` } : undefined}
    >
      {/* Header sem bg colorido nem border-b — só o dot da cor + título + pill */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-sm font-semibold truncate">{HELPDESK_STATUS_LABELS[status]}</span>
          <span
            className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold text-white shrink-0"
            style={{ backgroundColor: cor }}
          >
            {tickets.length}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
            <SortableCard
              key={t.id}
              ticket={t}
              cor={cor}
              onClick={() => onCardClick(t.id)}
              onAuxClick={onCardAuxClick ? () => onCardAuxClick(t.id) : undefined}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  )
}

function SortableCard({ ticket, cor, onClick, onAuxClick }: { ticket: Ticket; cor: string; onClick: () => void; onAuxClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ticket.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      // Botão do meio (scroll wheel) → abre o ticket em nova aba do navegador.
      // onAuxClick dispara pra qualquer botão não-primário; filtro por button===1.
      onAuxClick={onAuxClick ? (e) => { if (e.button === 1) { e.preventDefault(); onAuxClick() } } : undefined}
      // Previne o autoscroll do botão do meio (cursor de scroll) no Chromium/Firefox
      onMouseDown={onAuxClick ? (e) => { if (e.button === 1) e.preventDefault() } : undefined}
    >
      <KanbanCard ticket={ticket} cor={cor} />
    </div>
  )
}

/**
 * Overlay do card durante o drag — replica o efeito de "peso" do kanban
 * do CRM e dos orçamentos: simulador de mola-amortecedor que faz o card
 * inclinar levemente na direção do movimento (-8°..+8°), com damping 0.82
 * (perto do crítico) pra balançar UMA vez e estabilizar.
 *
 * Doc completo: docs/PADRAO_KANBAN_DND.md
 */
function KanbanCardOverlay({ ticket, cor, velocityX, width }: { ticket: Ticket; cor: string; velocityX: number; width?: number | null }) {
  const [rotation, setRotation] = useState(0)
  const rotRef = useRef(0)
  const angVelRef = useRef(0)
  const rafRef = useRef(0)
  const inputVelRef = useRef(0)

  useEffect(() => { inputVelRef.current = velocityX * 0.3 }, [velocityX])

  useEffect(() => {
    const tick = () => {
      angVelRef.current += inputVelRef.current * 0.06
      inputVelRef.current *= 0.3
      // mola puxa de volta pra 0
      angVelRef.current += -rotRef.current * 0.04
      // damping forte (0.82) — perto do crítico: card balança uma vez e estabiliza
      angVelRef.current *= 0.82
      rotRef.current += angVelRef.current
      rotRef.current = Math.max(-8, Math.min(8, rotRef.current))
      if (Math.abs(rotRef.current) < 0.02 && Math.abs(angVelRef.current) < 0.02) {
        rotRef.current = 0
        angVelRef.current = 0
      }
      setRotation(rotRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      // Largura dinâmica — vem do measurement no dragStart. Fallback 260px.
      style={{
        width: width ?? 260,
        transform: `rotate(${rotation.toFixed(2)}deg) scale(1.02)`,
        transformOrigin: 'top center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
      }}
    >
      <KanbanCard ticket={ticket} cor={cor} dragging />
    </div>
  )
}

function KanbanCard({ ticket, cor, dragging = false }: { ticket: Ticket; cor: string; dragging?: boolean }) {
  const ticketNum = `#HLP${String(ticket.numero).padStart(4, '0')}`
  const corPrioridade = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]
  const prazoAtrasado = ticket.prazoSla && new Date(ticket.prazoSla).getTime() < Date.now()
    && !['CONCLUIDO', 'CANCELADO', 'RESOLVIDO'].includes(ticket.status)
  const temCapa = !!ticket.capa
  // Quando o ticket tem capa, a imagem fica acima da barra colorida (modelo
  // de cards visuais — Hero/Trello). Quando não tem, a barra fica grossa no
  // topo do card (modelo simples — Landing page).
  return (
    <div
      className={cn(
        // Card escuro um pouco mais preto que o bg-card global, pra destacar sobre
        // o overlay sutil da coluna no dark.
        // cursor-pointer indica "clicável" (ação primária = abrir ticket).
        // O drag continua funcionando mesmo com pointer — só muda a aparência.
        'rounded-md bg-white dark:bg-[#1f242e] cursor-pointer group overflow-hidden border border-border/50 relative',
        dragging ? 'shadow-lg' : 'hover:shadow-md transition-shadow',
        // Solicitante respondeu — destaca o card (bola do lado do agente).
        ticket.aguardandoResposta && 'ring-2 ring-cyan-400 dark:ring-cyan-500 border-cyan-400/50 shadow-[0_0_0_3px] shadow-cyan-400/15',
      )}
    >
      {/* Selo "nova resposta" — solicitante respondeu, aguarda o agente */}
      {ticket.aguardandoResposta && (
        <div className="absolute top-1.5 right-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-cyan-500 text-white text-[9px] font-semibold px-1.5 py-0.5 shadow-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/80 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
          </span>
          Respondeu
        </div>
      )}

      {/* Capa (opcional) — primeira imagem anexada, com padding e cantos arredondados */}
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
          </div>
        </div>
      )}
      {/* Barra colorida da coluna — ocupa 1/3 da largura, alinhada à esquerda */}
      <div
        className={cn('ml-2.5 w-1/3 rounded-full h-1.5', temCapa ? 'mt-2 mb-2' : 'mt-2.5 mb-2')}
        style={{ backgroundColor: cor }}
      />

      {/* Conteúdo */}
      <div className="px-2.5 pb-2 flex flex-col gap-1.5">
        {/* Linha 1: ticket# + prioridade + SLA atrasado */}
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

        {/* Linha 2: título — com ícone de check à esquerda como nos modelos */}
        <div className="flex items-start gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 mt-[1px] text-muted-foreground/70 shrink-0" />
          <p className="text-[12px] font-semibold leading-tight line-clamp-2 flex-1">{ticket.titulo}</p>
        </div>

        {/* Linha 3: tag de categoria (estilo pill colorida, igual ao 'Illustration' do modelo) */}
        {ticket.categoria && (
          <div>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-white rounded-full px-2 py-0.5"
              style={{ backgroundColor: ticket.categoria.cor || '#5ea3cb' }}
            >
              {ticket.categoria.nome}
            </span>
          </div>
        )}

        {/* Linha 4 (rodapé): avatar do responsável (+ nome) à esquerda · indicadores à direita.
            Padding maior + tipos um pouco maiores pra melhorar legibilidade — antes ficava
            apertado e com fontes 9-10px que cansavam a vista. */}
        <div className="flex items-center justify-between gap-2 mt-1 pt-1.5 border-t border-border/40">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {ticket.responsavel ? (
              ticket.responsavel.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveAssetUrl(ticket.responsavel.image)} alt={ticket.responsavel.name} className="h-6 w-6 rounded-full object-cover shrink-0" />
              ) : (
                <span className="h-6 w-6 rounded-full bg-[#5ea3cb] text-white text-[10px] flex items-center justify-center font-bold shrink-0">
                  {ticket.responsavel.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </span>
              )
            ) : (
              <span className="h-6 w-6 rounded-full bg-muted text-muted-foreground text-[10px] flex items-center justify-center font-bold shrink-0">?</span>
            )}
            <span className="text-[12px] text-muted-foreground truncate min-w-0">
              {ticket.responsavel?.name || ticket.solicitante?.name || 'Não atribuído'}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground shrink-0">
            {/* Score da triagem IA (#HLP0083). Violeta = atingiu threshold ou
                tem plano; cinza = não-elegível. Tooltip via title detalha. */}
            {ticket.aiScore != null && <ScoreIaBadge ticket={ticket} />}
            {ticket._count.anexos > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="h-3.5 w-3.5" /> {ticket._count.anexos}
              </span>
            )}
            {ticket._count.mensagens > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="h-3.5 w-3.5" /> {ticket._count.mensagens}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Badge minúscula com o score IA do ticket (#HLP0083). Cor reflete elegibilidade:
 *  - violeta: elegível (atingiu o threshold) — IA chamou a API e gerou plano
 *  - cinza: não-elegível — score baixo, ticket não consumiu crédito
 */
function ScoreIaBadge({ ticket }: { ticket: Ticket }) {
  const elegivel = ticket.aiElegivel === true || !!ticket.aiPlanoStatus
  const title = elegivel
    ? `IA: score ${ticket.aiScore}${ticket.aiPlanoStatus ? ' · plano ' + ticket.aiPlanoStatus : ' · elegível'}`
    : `IA: score ${ticket.aiScore} (abaixo do threshold — não chamou API)`
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums',
        elegivel
          ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
          : 'bg-muted text-muted-foreground/70',
      )}
    >
      <Bot className="h-3 w-3" />
      {ticket.aiScore}
    </span>
  )
}

function TicketRow({ ticket, onClick, onUnarchive }: { ticket: Ticket; onClick: () => void; onUnarchive?: () => void }) {
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
      {onUnarchive && (
        <Button
          variant="outline" size="sm"
          onClick={e => { e.stopPropagation(); onUnarchive() }}
          className="h-7 gap-1 text-[11px] shrink-0"
          title="Desarquivar ticket"
        >
          <Archive className="h-3 w-3 rotate-180" />
          Desarquivar
        </Button>
      )}
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
        {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
      </span>
    </div>
  )
}
