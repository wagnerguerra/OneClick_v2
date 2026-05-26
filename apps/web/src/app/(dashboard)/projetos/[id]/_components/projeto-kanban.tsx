'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import {
  DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Flag, MoreVertical, Pencil, Trash2, Paperclip, MessageSquare } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Badge,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  TAREFA_STATUS_LABELS, TAREFA_STATUS_ORDEM, TAREFA_PRIORIDADE_LABELS,
  type TarefaStatus, type TarefaPrioridade,
} from '@saas/types'

const STATUS_COLOR: Record<TarefaStatus, string> = {
  BACKLOG: '#94a3b8',
  A_FAZER: '#6b7280',
  EM_ANDAMENTO: '#3b82f6',
  EM_REVISAO: '#a855f7',
  CONCLUIDO: '#16a34a',
  CANCELADO: '#dc2626',
}

const PRIORIDADE_COLOR: Record<TarefaPrioridade, string> = {
  URGENTE: '#dc2626',
  ALTA: '#f97316',
  MEDIA: '#3b82f6',
  BAIXA: '#6b7280',
}

export interface KanbanTarefa {
  id: string
  titulo: string
  descricao: string | null
  status: TarefaStatus
  prioridade: TarefaPrioridade
  prazo: Date | string | null
  estimativa: number | null
  ordem: number
  _count?: { anexos: number; eventos: number }
}

interface Props {
  projetoId: string
  projetoCor: string
  tarefas: KanbanTarefa[]
  onChange: () => void
  onOpenTarefa: (t: KanbanTarefa) => void
  onDeleteTarefa: (id: string) => void
}

export function ProjetoKanban({ projetoId, projetoCor, tarefas, onChange, onOpenTarefa, onDeleteTarefa }: Props) {
  const [localTarefas, setLocalTarefas] = useState<KanbanTarefa[]>(tarefas)
  const [activeCardId, setActiveCardId] = useState<string | null>(null)
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const lastDragXRef = useRef(0)

  // Sincroniza local com prop quando a prop muda (refetch, criar/excluir).
  // NÃO depende de activeCardId — senão sobrescreve o otimistic update aplicado
  // no dragEnd e o card "pula" pra origem antes de assentar no destino.
  useEffect(() => {
    setLocalTarefas(tarefas)
  }, [tarefas])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const colunas = useMemo(() => {
    const map: Record<TarefaStatus, KanbanTarefa[]> = {
      BACKLOG: [], A_FAZER: [], EM_ANDAMENTO: [], EM_REVISAO: [], CONCLUIDO: [], CANCELADO: [],
    }
    for (const t of localTarefas) map[t.status].push(t)
    for (const s of TAREFA_STATUS_ORDEM) map[s].sort((a, b) => a.ordem - b.ordem)
    return map
  }, [localTarefas])

  const activeCard = activeCardId ? localTarefas.find((t) => t.id === activeCardId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as string
    setActiveCardId(cardId)
    // Mede a largura REAL do card no DOM — mantém overlay com tamanho idêntico
    const node = document.querySelector(`[data-kanban-card-id="${cardId}"]`) as HTMLElement | null
    const wDom = node?.getBoundingClientRect().width
    const initial = (event.active as unknown as { rect?: { current?: { initial?: { width: number } } } }).rect?.current?.initial
    setActiveCardWidth(wDom ?? initial?.width ?? null)
    setDragDeltaX(0)
    lastDragXRef.current = 0
  }

  function handleDragMove(event: { delta: { x: number; y: number } }) {
    const dx = event.delta.x - lastDragXRef.current
    lastDragXRef.current = event.delta.x
    setDragDeltaX(dx)
  }

  function handleDragOver(_event: DragOverEvent) {
    // não usado — sem FSM
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveCardId(null)
    if (!over) return

    const cardId = active.id as string
    const overId = over.id as string

    const card = localTarefas.find((t) => t.id === cardId)
    if (!card) return

    // overId pode ser uma coluna (status) ou outro card
    const isColumn = TAREFA_STATUS_ORDEM.includes(overId as TarefaStatus)
    let targetStatus: TarefaStatus
    if (isColumn) {
      targetStatus = overId as TarefaStatus
    } else {
      const overCard = localTarefas.find((t) => t.id === overId)
      if (!overCard) return
      targetStatus = overCard.status
    }

    const sameColumn = card.status === targetStatus

    if (sameColumn) {
      // Reordenar dentro da mesma coluna
      const columnCards = colunas[targetStatus]
      const oldIndex = columnCards.findIndex((t) => t.id === cardId)
      const newIndex = isColumn ? columnCards.length - 1 : columnCards.findIndex((t) => t.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return

      const reordered = arrayMove(columnCards, oldIndex, newIndex)
      // Otimista
      setLocalTarefas((prev) => {
        const others = prev.filter((t) => t.status !== targetStatus)
        return [...others, ...reordered.map((t, i) => ({ ...t, ordem: i }))]
      })
      try {
        await trpc.projetos.reordenarTarefas.mutate({
          projetoId,
          status: targetStatus,
          ids: reordered.map((t) => t.id),
        })
        onChange()
      } catch (e) {
        alerts.error('Erro ao reordenar: ' + (e as Error).message)
        onChange()
      }
    } else {
      // Mover pra outra coluna
      setLocalTarefas((prev) => prev.map((t) => (t.id === cardId ? { ...t, status: targetStatus } : t)))
      try {
        await trpc.projetos.moverTarefa.mutate({ id: cardId, status: targetStatus })
        onChange()
      } catch (e) {
        alerts.error('Erro ao mover: ' + (e as Error).message)
        onChange()
      }
    }
  }

  function handleDragCancel() {
    setActiveCardId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TAREFA_STATUS_ORDEM.map((status) => (
          <KanbanColuna
            key={status}
            status={status}
            tarefas={colunas[status]}
            isDraggingAny={!!activeCardId}
            onOpenTarefa={onOpenTarefa}
            onDeleteTarefa={onDeleteTarefa}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}
      >
        {activeCard && (
          <KanbanCardOverlay tarefa={activeCard} velocityX={dragDeltaX} width={activeCardWidth} projetoCor={projetoCor} />
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Coluna ───────────────────────────────────────────────────

function KanbanColuna({
  status, tarefas, isDraggingAny, onOpenTarefa, onDeleteTarefa,
}: {
  status: TarefaStatus
  tarefas: KanbanTarefa[]
  isDraggingAny: boolean
  onOpenTarefa: (t: KanbanTarefa) => void
  onDeleteTarefa: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const cor = STATUS_COLOR[status]

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-1 min-w-[180px] flex flex-col border border-border/40 overflow-hidden transition-colors duration-200 rounded',
        isOver && 'border-foreground/30',
      )}
    >
      <div
        className="px-3 py-2.5 border-b flex items-center justify-between"
        style={{ backgroundColor: `${cor}12` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-sm font-semibold truncate">{TAREFA_STATUS_LABELS[status]}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 shrink-0">{tarefas.length}</Badge>
      </div>

      <SortableContext items={tarefas.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
          {tarefas.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 italic">Nenhuma tarefa</p>
          )}
          {tarefas.map((t) => (
            <KanbanCard
              key={t.id}
              tarefa={t}
              isDraggingAny={isDraggingAny}
              onOpenTarefa={onOpenTarefa}
              onDeleteTarefa={onDeleteTarefa}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────

function KanbanCard({
  tarefa, isDraggingAny, onOpenTarefa, onDeleteTarefa,
}: {
  tarefa: KanbanTarefa
  isDraggingAny: boolean
  onOpenTarefa: (t: KanbanTarefa) => void
  onDeleteTarefa: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tarefa.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  // Cor lateral: cor do status (mais semântico que cor do projeto pra Kanban de tarefas)
  const corLateral = STATUS_COLOR[tarefa.status]

  return (
    <div
      ref={setNodeRef}
      data-kanban-card-id={tarefa.id}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'rounded-sm bg-white dark:bg-card cursor-grab active:cursor-grabbing group touch-none overflow-hidden',
        isDragging ? 'border border-transparent opacity-30' : 'border border-border/50',
        !isDragging && !isDraggingAny && 'hover:shadow-md transition-shadow',
      )}
      onClick={() => { if (!isDraggingAny) onOpenTarefa(tarefa) }}
    >
      <div className="flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: corLateral }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent tarefa={tarefa} onDeleteTarefa={onDeleteTarefa} showMenu={!isDraggingAny} />
        </div>
      </div>
    </div>
  )
}

// ─── Overlay (card que segue o cursor) ────────────────────────

function KanbanCardOverlay({
  tarefa, velocityX, width, projetoCor,
}: {
  tarefa: KanbanTarefa
  velocityX: number
  width: number | null
  projetoCor: string
}) {
  const [rotation, setRotation] = useState(0)
  const rotRef = useRef(0)
  const angVelRef = useRef(0)
  const inputVelRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    inputVelRef.current = velocityX * 0.3
  }, [velocityX])

  useEffect(() => {
    const tick = () => {
      angVelRef.current += inputVelRef.current * 0.06
      inputVelRef.current *= 0.3
      angVelRef.current += -rotRef.current * 0.04
      // Damping 0.82 — recipe da casa (docs/PADRAO_KANBAN_DND.md)
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

  const corLateral = STATUS_COLOR[tarefa.status]

  return (
    <div
      className="rounded-sm bg-white dark:bg-card overflow-hidden"
      style={{
        width: width ?? 260,
        transform: `rotate(${rotation.toFixed(2)}deg) scale(1.02)`,
        transformOrigin: 'top center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
      }}
    >
      <div className="flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: corLateral }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent tarefa={tarefa} onDeleteTarefa={() => {}} showMenu={false} />
        </div>
      </div>
    </div>
  )
}

// ─── Conteúdo compartilhado entre Card e Overlay ──────────────

function KanbanCardContent({
  tarefa, onDeleteTarefa, showMenu,
}: {
  tarefa: KanbanTarefa
  onDeleteTarefa: (id: string) => void
  showMenu: boolean
}) {
  const prazoTexto = tarefa.prazo
    ? new Date(tarefa.prazo).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : null
  const prazoVencido = tarefa.prazo ? new Date(tarefa.prazo) < new Date() && tarefa.status !== 'CONCLUIDO' : false

  return (
    <div className="p-2.5 flex flex-col gap-2">
      {/* Header: prioridade + menu */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide"
             style={{ color: PRIORIDADE_COLOR[tarefa.prioridade] }}>
          <Flag className="h-3 w-3" />
          {TAREFA_PRIORIDADE_LABELS[tarefa.prioridade]}
        </div>
        {showMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <button className="p-0.5 rounded hover:bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => onDeleteTarefa(tarefa.id)} className="text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Título */}
      <div className="text-[13px] font-medium text-foreground leading-tight line-clamp-3">
        {tarefa.titulo}
      </div>

      {/* Footer: prazo + estimativa + anexos/comentários */}
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {prazoTexto && (
            <span className={cn('font-medium', prazoVencido && 'text-destructive')}>
              {prazoTexto}
            </span>
          )}
          {tarefa.estimativa != null && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-foreground font-medium">
              {tarefa.estimativa}pt
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {tarefa._count?.anexos ? (
            <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{tarefa._count.anexos}</span>
          ) : null}
          {tarefa._count?.eventos ? (
            <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{tarefa._count.eventos}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
