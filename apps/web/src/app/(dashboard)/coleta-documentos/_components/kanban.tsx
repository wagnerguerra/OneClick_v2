'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, Loader2, Hash, Users, CalendarDays } from 'lucide-react'
import { Badge, cn } from '@saas/ui'
import {
  DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors, useDroppable,
  type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { COLETA_SITUACOES, COLETA_SITUACAO_LABEL, COLETA_TIPO_LABEL, COLETA_TRANSICOES, type ColetaTransicao } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useAutoHideScrollbar } from '@/hooks/use-autohide-scrollbar'
import { TIPO_BADGE } from './badges'

export interface KanbanRow {
  id: string
  numero: number
  tipo: string
  situacao: string
  prioridade: number
  competencia: string | null
  contato: string | null
  registradoEm: string
  categoria?: { id: string; nome: string } | null
  clienteNomeResolvido?: string | null
  solicitanteNomeResolvido?: string | null
  transicoesDisponiveis: ColetaTransicao[]
}

/** Cor de cada situação — o mesmo tom do badge da lista, em hex pra dot/pill. */
const SITUACAO_HEX: Record<string, string> = {
  AGUARDANDO_ROTA: '#f59e0b', ROTA_CONFIRMADA: '#0ea5e9', RETIRADA_DISPONIVEL: '#6366f1', ENTREGUE_CLIENTE: '#8b5cf6',
  NA_RECEPCAO: '#06b6d4', EM_TRIAGEM: '#3b82f6', NO_SETOR: '#d946ef', DEVOLVIDO_ARQUIVO: '#84cc16',
  DEVOLVIDO_CLIENTE: '#10b981', PROTOCOLO_ARQUIVADO: '#64748b', ENTREGUE_ARQUIVO: '#14b8a6', PROTOCOLO_ENTREGUE: '#f97316',
}

const dataBR = (d: string) => new Date(d).toLocaleDateString('pt-BR')

/** A transição que leva ESTE card até a coluna alvo — ou null se não há caminho permitido. */
function transicaoPara(row: KanbanRow, destino: string): ColetaTransicao | null {
  for (const t of row.transicoesDisponiveis) {
    if (COLETA_TRANSICOES[t]?.destino === destino) return t
  }
  return null
}

export function ColetaKanban({ rows, loading, onChanged }: { rows: KanbanRow[]; loading: boolean; onChanged: () => void }) {
  const router = useRouter()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const porSituacao = useMemo(() => {
    const m: Record<string, KanbanRow[]> = {}
    for (const s of COLETA_SITUACOES) m[s] = []
    for (const r of rows) (m[r.situacao] ??= []).push(r)
    return m
  }, [rows])
  const activeRow = activeId ? rows.find((r) => r.id === activeId) ?? null : null

  async function mover(row: KanbanRow, destino: string) {
    const transicao = transicaoPara(row, destino)
    if (!transicao) return
    try {
      await (trpc as any).coleta.transitar.mutate({ id: row.id, transicao })
      alerts.success('Movido', `#${row.numero} → ${COLETA_SITUACAO_LABEL[destino] ?? destino}`)
      onChanged()
    } catch (e) {
      alerts.error('Não foi possível mover', (e as Error).message)
    }
  }

  function colunaDe(id: string | null): string | null {
    if (!id) return null
    if ((COLETA_SITUACOES as readonly string[]).includes(id)) return id
    return rows.find((r) => r.id === id)?.situacao ?? null
  }

  function onDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)) }
  function onDragOver(e: DragOverEvent) { setOverCol(colunaDe(e.over ? String(e.over.id) : null)) }
  function onDragEnd(e: DragEndEvent) {
    const row = activeRow
    const destino = colunaDe(e.over ? String(e.over.id) : null)
    setActiveId(null); setOverCol(null)
    if (!row || !destino || destino === row.situacao) return
    mover(row, destino)
  }

  return (
    <div className="relative min-h-[420px]">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[1px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActiveId(null); setOverCol(null) }}>
        <div className="overflow-x-auto pb-4 -mx-1 nice-scrollbar">
          <div className="flex gap-4 px-1 w-max">
            {COLETA_SITUACOES.map((sit) => {
              const items = porSituacao[sit] ?? []
              // Com um card em arraste, só as colunas que são transição permitida ficam abertas
              const dropDisabled = !!activeRow && activeRow.situacao !== sit && !transicaoPara(activeRow, sit)
              return (
                <Coluna key={sit} situacao={sit} items={items} isOver={overCol === sit} dropDisabled={dropDisabled} activeId={activeId}
                  onOpen={(id) => router.push(`/coleta-documentos/${id}`)} />
              )
            })}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeRow && (
            <div className="w-[288px] rounded-xl bg-white dark:bg-card overflow-hidden" style={{ transform: 'rotate(2deg) scale(1.02)', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
              <CardConteudo row={activeRow} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function Coluna({ situacao, items, isOver, dropDisabled, activeId, onOpen }: {
  situacao: string; items: KanbanRow[]; isOver: boolean; dropDisabled: boolean; activeId: string | null; onOpen: (id: string) => void
}) {
  const { setNodeRef } = useDroppable({ id: situacao, disabled: dropDisabled })
  const cor = SITUACAO_HEX[situacao] ?? '#94a3b8'
  const label = COLETA_SITUACAO_LABEL[situacao] ?? situacao
  const scrollRef = useAutoHideScrollbar<HTMLDivElement>()
  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Padrão do /crm (LuminAux): coluna aberta, sem caixa; véu só no alvo do drop
        'w-[300px] shrink-0 flex flex-col rounded-xl transition-colors relative',
        isOver && !dropDisabled && 'bg-black/[0.03] dark:bg-white/[0.04]',
        dropDisabled && 'opacity-40 grayscale',
      )}
      style={isOver && !dropDisabled ? { boxShadow: `0 0 0 2px ${cor}55` } : undefined}
      title={dropDisabled ? `Este registro não pode ir para "${label}" a partir da situação atual (ou você não tem o papel para isso).` : undefined}
    >
      <div className="px-1.5 py-2 flex items-center gap-2 min-w-0">
        <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
        <span className="text-sm font-semibold truncate">{label}</span>
        <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-semibold tabular-nums shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}>
          {items.length}
        </span>
      </div>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto scrollbar-autohide max-h-[calc(100vh-320px)] min-h-[120px] px-1.5 pt-0.5 pb-2">
          {items.map((r) => <Card key={r.id} row={r} isDraggingAny={!!activeId} onOpen={onOpen} />)}
        </div>
      </SortableContext>
    </div>
  )
}

function Card({ row, isDraggingAny, onOpen }: { row: KanbanRow; isDraggingAny: boolean; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }
  return (
    <div
      ref={setNodeRef} style={style} {...attributes} {...listeners}
      onClick={() => { if (!isDraggingAny) onOpen(row.id) }}
      className={cn(
        'rounded-xl bg-white dark:bg-card shadow-sm group touch-none overflow-hidden cursor-grab active:cursor-grabbing',
        isDragging ? 'border border-transparent' : 'border border-border/60',
        !isDragging && !isDraggingAny && 'hover:shadow-md transition-shadow',
      )}
    >
      <CardConteudo row={row} />
    </div>
  )
}

function CardConteudo({ row }: { row: KanbanRow }) {
  const cor = SITUACAO_HEX[row.situacao] ?? '#94a3b8'
  return (
    <div className="flex">
      <div className="w-1 shrink-0" style={{ backgroundColor: cor }} />
      <div className="flex-1 min-w-0 px-3 pt-2.5 pb-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Hash className="h-3 w-3" />{row.numero}
          {row.prioridade === 3 && <Flag className="ml-auto h-3.5 w-3.5 text-rose-500" aria-label="Prioridade alta" />}
        </div>
        <p className="mt-0.5 text-[13px] font-semibold leading-tight line-clamp-2">{row.clienteNomeResolvido ?? row.contato ?? '—'}</p>
        {row.clienteNomeResolvido && row.contato && <p className="truncate text-[11px] text-muted-foreground">{row.contato}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn('text-[10px]', TIPO_BADGE[row.tipo])}>{COLETA_TIPO_LABEL[row.tipo] ?? row.tipo}</Badge>
          {row.categoria?.nome && <span className="rounded-full bg-muted px-2 py-px text-[10px] font-medium text-muted-foreground">{row.categoria.nome}</span>}
          {row.competencia && <span className="rounded-full bg-muted px-2 py-px text-[10px] font-medium tabular-nums text-muted-foreground">{row.competencia}</span>}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1 truncate"><Users className="h-3 w-3 shrink-0" />{row.solicitanteNomeResolvido ?? '—'}</span>
          <span className="flex items-center gap-1 shrink-0 tabular-nums"><CalendarDays className="h-3 w-3" />{dataBR(row.registradoEm)}</span>
        </div>
      </div>
    </div>
  )
}
