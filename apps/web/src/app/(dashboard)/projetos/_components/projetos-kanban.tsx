'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { resolveAssetUrl } from '@/lib/api-url'
import {
  DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useRouter } from 'next/navigation'
import { ListChecks, MoreVertical, Pencil, Trash2, Calendar, AlertCircle, Building2, Layers, User as UserIcon } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { stripHtml } from '@/lib/html'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { PROJETO_STATUS_LABELS, PROJETO_STATUS_ORDEM, type ProjetoStatus } from '@saas/types'

const STATUS_ORDEM = PROJETO_STATUS_ORDEM

// Cores semânticas: NOVO=cinza (novidade fria), ANDAMENTO=âmbar (em movimento),
// PENDENTE=roxo (aguardando algo), CONCLUIDO=verde (sucesso).
const STATUS_COLOR: Record<ProjetoStatus, string> = {
  NOVO: '#64748b',        // slate
  ANDAMENTO: '#f59e0b',   // amber
  PENDENTE: '#a855f7',    // violet
  CONCLUIDO: '#16a34a',   // green
}

export interface KanbanProjeto {
  id: string
  nome: string
  descricao: string | null
  cor: string
  status: ProjetoStatus
  dataPrevisao: Date | string | null
  _count: { tarefas: number }
  responsavel: { id: string; name: string; image: string | null } | null
  /** Quantas frentes de trabalho e quanta gente somada nelas. */
  execucoes?: number
  envolvidos?: number
  /** Empresas-cliente envolvidas. Lista vazia = projeto interno. */
  clientes?: Array<{ id: string; razaoSocial: string; nomeFantasia: string | null }>
  tarefaProximoVencimento: { id: string; titulo: string; prazo: Date | string } | null
}

interface Props {
  projetos: KanbanProjeto[]
  onChange: () => void
  canWrite: boolean
  canDelete: boolean
  onEdit: (p: KanbanProjeto) => void
}

export function ProjetosKanban({ projetos, onChange, canWrite, canDelete, onEdit }: Props) {
  const [local, setLocal] = useState<KanbanProjeto[]>(projetos)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeWidth, setActiveWidth] = useState<number | null>(null)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const lastDragXRef = useRef(0)

  // Sincroniza local com prop quando a prop muda (refetch, criar/excluir, filtro).
  // NÃO depende de activeId — isso causava "card volta pra origem" porque o
  // useEffect rodava logo após setActiveId(null), sobrescrevendo o otimistic
  // update aplicado no dragEnd com a versão antiga ainda no parent.
  useEffect(() => {
    setLocal(projetos)
  }, [projetos])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const colunas = useMemo(() => {
    const map: Record<ProjetoStatus, KanbanProjeto[]> = { NOVO: [], ANDAMENTO: [], PENDENTE: [], CONCLUIDO: [] }
    for (const p of local) map[p.status].push(p)
    return map
  }, [local])

  const activeCard = activeId ? local.find((p) => p.id === activeId) ?? null : null

  function handleDragStart(event: DragStartEvent) {
    if (!canWrite) return
    const cardId = event.active.id as string
    setActiveId(cardId)
    // Mede a largura REAL do card no DOM (mais confiável que event.active.rect).
    // Mantém o overlay com o mesmo tamanho visual do card original.
    const node = document.querySelector(`[data-kanban-card-id="${cardId}"]`) as HTMLElement | null
    const wDom = node?.getBoundingClientRect().width
    const initial = (event.active as unknown as { rect?: { current?: { initial?: { width: number } } } }).rect?.current?.initial
    setActiveWidth(wDom ?? initial?.width ?? null)
    setDragDeltaX(0)
    lastDragXRef.current = 0
  }

  function handleDragMove(event: { delta: { x: number; y: number } }) {
    const dx = event.delta.x - lastDragXRef.current
    lastDragXRef.current = event.delta.x
    setDragDeltaX(dx)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    if (!over || !canWrite) return

    const cardId = active.id as string
    const overId = over.id as string

    const card = local.find((p) => p.id === cardId)
    if (!card) return

    const isColumn = STATUS_ORDEM.includes(overId as ProjetoStatus)
    let targetStatus: ProjetoStatus
    if (isColumn) {
      targetStatus = overId as ProjetoStatus
    } else {
      const overCard = local.find((p) => p.id === overId)
      if (!overCard) return
      targetStatus = overCard.status
    }

    if (card.status === targetStatus) return

    // Otimista
    setLocal((prev) => prev.map((p) => (p.id === cardId ? { ...p, status: targetStatus } : p)))
    try {
      await trpc.projetos.update.mutate({ id: cardId, data: { status: targetStatus } })
      onChange()
    } catch (e) {
      alerts.error('Erro ao mover projeto: ' + (e as Error).message)
      onChange()
    }
  }

  function handleDragCancel() {
    setActiveId(null)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {/* Trilho no padrão /orcamentos: rolagem horizontal do container, com a
          scrollbar tematizada. As três colunas dividem a largura em partes
          iguais (mesma decisão do /meus-servicos, que também tem poucas
          colunas); o piso de 280px devolve a rolagem em tela estreita. */}
      <div className="nice-scrollbar -mx-1 flex-1 overflow-x-auto overflow-y-hidden pb-4">
        <div className="flex h-full w-full gap-4 px-1">
        {STATUS_ORDEM.map((status) => (
          <KanbanColuna
            key={status}
            status={status}
            projetos={colunas[status]}
            isDraggingAny={!!activeId}
            canWrite={canWrite}
            canDelete={canDelete}
            onEdit={onEdit}
            onChange={onChange}
          />
        ))}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeCard && <KanbanCardOverlay projeto={activeCard} velocityX={dragDeltaX} width={activeWidth} />}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Coluna ────────────────────────────────────────────────

function KanbanColuna({
  status, projetos, isDraggingAny, canWrite, canDelete, onEdit, onChange,
}: {
  status: ProjetoStatus
  projetos: KanbanProjeto[]
  isDraggingAny: boolean
  canWrite: boolean
  canDelete: boolean
  onEdit: (p: KanbanProjeto) => void
  onChange: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !canWrite })
  const cor = STATUS_COLOR[status]

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Coluna ABERTA: sem caixa nem fundo, os cards flutuam sobre a página.
        // Só o alvo do arrasto ganha um véu. Igual ao /crm e ao /orcamentos.
        'flex h-full min-w-[280px] flex-1 flex-col rounded-xl transition-colors',
        isOver && 'bg-black/[0.03] dark:bg-white/[0.04]',
      )}
      style={isOver ? { boxShadow: `0 0 0 2px ${cor}55` } : undefined}
    >
      {/* Cabeçalho: dot da cor + nome + contador em pill tintada */}
      <div className="flex items-center justify-between gap-2 px-1.5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
          <span className="text-sm font-semibold truncate">{PROJETO_STATUS_LABELS[status]}</span>
          <span
            className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}
          >
            {projetos.length}
          </span>
        </div>
      </div>

      <SortableContext items={projetos.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        <div className="nice-scrollbar min-h-[120px] flex-1 space-y-2 overflow-y-auto px-1.5 pb-2">
          {projetos.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6 italic">Vazio</p>
          )}
          {projetos.map((p) => (
            <KanbanCard
              key={p.id}
              projeto={p}
              isDraggingAny={isDraggingAny}
              canWrite={canWrite}
              canDelete={canDelete}
              onEdit={onEdit}
              onChange={onChange}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

// ─── Card ──────────────────────────────────────────────────

function KanbanCard({
  projeto, isDraggingAny, canWrite, canDelete, onEdit, onChange,
}: {
  projeto: KanbanProjeto
  isDraggingAny: boolean
  canWrite: boolean
  canDelete: boolean
  onEdit: (p: KanbanProjeto) => void
  onChange: () => void
}) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: projeto.id,
    disabled: !canWrite,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  async function handleDelete() {
    const ok = await alerts.confirmDelete()
    if (!ok) return
    try {
      await trpc.projetos.delete.mutate({ id: projeto.id })
      onChange()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    }
  }

  return (
    <div
      ref={setNodeRef}
      data-kanban-card-id={projeto.id}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        // Padrão /orcamentos: cartão sem borda, cantos arredondados e sombra
        // no hover. A borda vinha do desenho antigo, de coluna com caixa.
        'rounded-xl bg-white dark:bg-card group touch-none overflow-hidden shadow-sm',
        canWrite ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging ? 'opacity-30' : '',
        !isDragging && !isDraggingAny && 'hover:shadow-md transition-shadow',
      )}
      onClick={() => { if (!isDraggingAny) router.push(`/projetos/${projeto.id}`) }}
    >
      <div className="flex">
        <div className="w-1 shrink-0" style={{ backgroundColor: projeto.cor || '#22d3ee' }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent
            projeto={projeto}
            canWrite={canWrite}
            canDelete={canDelete}
            onEdit={onEdit}
            onDelete={handleDelete}
            showMenu={!isDraggingAny}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Overlay ───────────────────────────────────────────────

function KanbanCardOverlay({
  projeto, velocityX, width,
}: { projeto: KanbanProjeto; velocityX: number; width: number | null }) {
  const [rotation, setRotation] = useState(0)
  const rotRef = useRef(0)
  const angVelRef = useRef(0)
  const inputVelRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => { inputVelRef.current = velocityX * 0.3 }, [velocityX])

  useEffect(() => {
    const tick = () => {
      angVelRef.current += inputVelRef.current * 0.06
      inputVelRef.current *= 0.3
      angVelRef.current += -rotRef.current * 0.04
      angVelRef.current *= 0.82
      rotRef.current += angVelRef.current
      rotRef.current = Math.max(-8, Math.min(8, rotRef.current))
      if (Math.abs(rotRef.current) < 0.02 && Math.abs(angVelRef.current) < 0.02) {
        rotRef.current = 0; angVelRef.current = 0
      }
      setRotation(rotRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div
      className="rounded-xl bg-white dark:bg-card overflow-hidden"
      style={{
        width: width ?? 300,
        transform: `rotate(${rotation.toFixed(2)}deg) scale(1.02)`,
        transformOrigin: 'top center',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
      }}
    >
      <div className="flex">
        <div className="w-1 shrink-0" style={{ backgroundColor: projeto.cor || '#22d3ee' }} />
        <div className="flex-1 min-w-0">
          <KanbanCardContent
            projeto={projeto}
            canWrite={false}
            canDelete={false}
            onEdit={() => {}}
            onDelete={() => {}}
            showMenu={false}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Conteúdo compartilhado ────────────────────────────────

function KanbanCardContent({
  projeto, canWrite, canDelete, onEdit, onDelete, showMenu,
}: {
  projeto: KanbanProjeto
  canWrite: boolean
  canDelete: boolean
  onEdit: (p: KanbanProjeto) => void
  onDelete: () => void
  showMenu: boolean
}) {
  const clientes = projeto.clientes ?? []
  return (
    <div className="flex flex-col">
      {/* Cabeçalho — título e menu, no espaçamento do /orcamentos */}
      <div className="flex items-start justify-between gap-1 px-3 pt-2.5 pb-1">
        <h4 className="min-w-0 text-[13px] font-semibold leading-tight line-clamp-2">
          {projeto.nome}
        </h4>
        <div className="h-6 w-6 shrink-0 -mr-1 -mt-0.5">
          {showMenu && (canWrite || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <button className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded hover:bg-muted">
                  <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {canWrite && (
                  <DropdownMenuItem onClick={() => onEdit(projeto)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Corpo */}
      <div className="px-3 pb-2 space-y-1">
        {/* Clientes envolvidos — nenhum quer dizer projeto interno, e aí nada aparece.
            No card cabe um nome; o resto vira "+N", com todos no title. */}
        {clientes.length > 0 && (
          <div
            className="flex items-center gap-1.5 text-[11px] text-foreground/75"
            title={clientes.map(c => c.nomeFantasia || c.razaoSocial).join(', ')}
          >
            <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/70" />
            <span className="truncate">{clientes[0]!.nomeFantasia || clientes[0]!.razaoSocial}</span>
            {clientes.length > 1 && (
              <span className="shrink-0 text-muted-foreground">+{clientes.length - 1}</span>
            )}
          </div>
        )}

        {/* A descrição é HTML (vem do RichEditor na aba de detalhes). No card
            ela é prévia de duas linhas, então vai achatada em texto puro —
            exceção prevista no CLAUDE.md. Sem isso a tag aparecia crua. */}
        {projeto.descricao && stripHtml(projeto.descricao) && (
          <div className="text-[11px] text-muted-foreground line-clamp-2">{stripHtml(projeto.descricao)}</div>
        )}

        <ContagemTarefas count={projeto._count.tarefas} />
      </div>

      <div className="px-3 pb-2.5">
        <CardFooter projeto={projeto} />
      </div>
    </div>
  )
}

function ContagemTarefas({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <ListChecks className="h-3 w-3" />
      {count} {count === 1 ? 'tarefa' : 'tarefas'}
    </span>
  )
}

// Footer: avatar + nome do responsável (à esquerda) + prazo que vence primeiro (à direita).
// Se a tarefa vencer antes do projeto, mostra a tarefa; senão, mostra o prazo do projeto.
// Vencido fica em vermelho.
function CardFooter({ projeto }: { projeto: KanbanProjeto }) {
  const agora = new Date()
  const prazoProjeto = projeto.dataPrevisao ? new Date(projeto.dataPrevisao) : null
  const prazoTarefa = projeto.tarefaProximoVencimento?.prazo
    ? new Date(projeto.tarefaProximoVencimento.prazo)
    : null

  // Escolhe a fonte de prazo: a que vencer primeiro (menor data).
  let fontePrazo: 'projeto' | 'tarefa' | null = null
  if (prazoTarefa && prazoProjeto) {
    fontePrazo = prazoTarefa < prazoProjeto ? 'tarefa' : 'projeto'
  } else if (prazoTarefa) {
    fontePrazo = 'tarefa'
  } else if (prazoProjeto) {
    fontePrazo = 'projeto'
  }

  const dataExibida =
    fontePrazo === 'tarefa' ? prazoTarefa! : fontePrazo === 'projeto' ? prazoProjeto! : null
  const vencido = dataExibida ? dataExibida < agora : false
  const dataFmt = dataExibida
    ? dataExibida.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : null

  return (
    <div className="flex items-center justify-between gap-2 pt-1 mt-1 border-t border-border/40">
      {/* Responsável e o time (esquerda). Os participantes vêm como pilha de
          avatares sobrepostos, para não roubar a linha do responsável, que é
          quem responde pelo projeto. */}
      {projeto.responsavel ? (
        <div className="flex items-center gap-1.5 min-w-0">
          <AvatarPequeno user={projeto.responsavel} />
          <span className="text-[10px] text-muted-foreground truncate">
            {projeto.responsavel.name.split(' ')[0]}
          </span>
          <ResumoFrentes execucoes={projeto.execucoes ?? 0} envolvidos={projeto.envolvidos ?? 0} />
        </div>
      ) : (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground italic">
            <UserIcon className="h-3 w-3" /> sem responsável
          </span>
          <ResumoFrentes execucoes={projeto.execucoes ?? 0} envolvidos={projeto.envolvidos ?? 0} />
        </div>
      )}

      {/* Prazo (direita) — mostra fonte se for da tarefa */}
      {dataFmt && (
        <div
          className={cn(
            'flex items-center gap-1 text-[10px] shrink-0',
            vencido ? 'text-destructive font-semibold' : 'text-muted-foreground',
          )}
          title={
            fontePrazo === 'tarefa'
              ? `Tarefa "${projeto.tarefaProximoVencimento?.titulo}" vence em ${dataFmt}`
              : `Previsão do projeto: ${dataFmt}`
          }
        >
          {vencido ? <AlertCircle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
          {fontePrazo === 'tarefa' && <span className="font-semibold uppercase tracking-wide">T:</span>}
          <span>{dataFmt}</span>
        </div>
      )}
    </div>
  )
}

/**
 * Resumo das frentes. O card não lista nomes: com várias execuções em paralelo,
 * a pilha de avatares viraria uma sopa de gente sem dizer de qual frente é
 * cada um. Quem é quem está na aba Envolvidos.
 */
function ResumoFrentes({ execucoes, envolvidos }: { execucoes: number; envolvidos: number }) {
  if (execucoes === 0) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground"
      title={`${execucoes} execução(ões) em andamento, ${envolvidos} pessoa(s) envolvida(s)`}
    >
      <Layers className="h-3 w-3" />
      {execucoes}
      {envolvidos > 0 && <span className="opacity-70">· {envolvidos}</span>}
    </span>
  )
}

function AvatarPequeno({ user }: { user: { name: string; image: string | null } }) {
  if (user.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveAssetUrl(user.image)} alt={user.name} className="h-5 w-5 rounded-full object-cover" />
  }
  const iniciais = user.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
  return (
    <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-semibold text-foreground/70 shrink-0">
      {iniciais || '?'}
    </div>
  )
}
