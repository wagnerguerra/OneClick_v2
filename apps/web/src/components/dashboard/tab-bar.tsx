'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { X, Plus, Pin, PinOff, Copy, RefreshCw, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@saas/ui'
import { useTabs, type Tab } from '@/lib/tabs-store'
import { alerts } from '@/lib/alerts'
import { MODULE_ICONS, getGroupHexForHref } from '@/lib/navigation'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const ICON_FALLBACK_KEY = 'dashboard'

function getIcon(iconKey: string | null | undefined) {
  if (!iconKey) return MODULE_ICONS[ICON_FALLBACK_KEY] ?? null
  return MODULE_ICONS[iconKey] ?? MODULE_ICONS[ICON_FALLBACK_KEY] ?? null
}

interface ContextMenuState {
  tabId: string
  x: number
  y: number
}

export function TabBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { tabs, loading, maxTabs, close, closeMultiple, setPinned, reorder } = useTabs()
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  // Quando há drag ativo, suprime a animação de hover das abas pinadas
  // (evita "escorrer" o nome enquanto o user está reorganizando).
  const [draggingAny, setDraggingAny] = useState(false)

  // Indicador de "Carregando" na aba clicada.
  // `pendingHref` é setado imediatamente no clique, mas só vira `showPendingSpinner`
  // após 150ms — evita flash em navegação instantânea (cache hit do Next).
  // Limpa ao detectar que o pathname efetivamente mudou para a rota pedida.
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [showPendingSpinner, setShowPendingSpinner] = useState(false)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingSafetyRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearPendingState() {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    if (pendingSafetyRef.current) clearTimeout(pendingSafetyRef.current)
    pendingTimerRef.current = null
    pendingSafetyRef.current = null
    setPendingHref(null)
    setShowPendingSpinner(false)
  }

  // Quando o pathname efetivamente muda, encerra o estado de "Carregando".
  useEffect(() => {
    if (!pendingHref) return
    const pendingClean = pendingHref.split('?')[0]!.split('#')[0]
    const currClean = pathname.split('?')[0]!.split('#')[0]
    if (pendingClean === currClean) clearPendingState()
  }, [pathname, pendingHref])

  // Limpa timers ao desmontar
  useEffect(() => () => {
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    if (pendingSafetyRef.current) clearTimeout(pendingSafetyRef.current)
  }, [])

  // Aba ativa = a que tem href === pathname (ignora query/hash)
  const activeId = (() => {
    const pathClean = pathname.split('?')[0]!.split('#')[0]
    return tabs.find(t => {
      const tClean = t.href.split('?')[0]!.split('#')[0]
      return tClean === pathClean
    })?.id ?? null
  })()

  // Ordena: pinned primeiro, depois por ordem
  const ordenadas = [...tabs].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return a.ordem - b.ordem
  })
  const pinnedIds = ordenadas.filter(t => t.pinned).map(t => t.id)
  const normalIds = ordenadas.filter(t => !t.pinned).map(t => t.id)

  // Sensors para drag-and-drop horizontal
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Detecta scroll horizontal disponível
  const checkScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll)
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      ro.disconnect()
    }
  }, [tabs.length, checkScroll])

  function scrollBy(dx: number) {
    listRef.current?.scrollBy({ left: dx, behavior: 'smooth' })
  }

  function activate(href: string) {
    if (pathname === href) return
    // Marca a aba como "Carregando" — spinner aparece após 150ms se a
    // navegação ainda não tiver concluído (evita flash em rotas instantâneas).
    if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current)
    if (pendingSafetyRef.current) clearTimeout(pendingSafetyRef.current)
    setPendingHref(href)
    setShowPendingSpinner(false)
    pendingTimerRef.current = setTimeout(() => setShowPendingSpinner(true), 150)
    // Timeout de segurança — caso a navegação trave, esconde após 8s.
    pendingSafetyRef.current = setTimeout(() => clearPendingState(), 8000)
    router.push(href)
  }

  function handleClose(id: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    const t = tabs.find(x => x.id === id)
    if (!t) return
    // Se está fechando a aba ativa, navega para outra
    if (id === activeId) {
      const idx = ordenadas.findIndex(x => x.id === id)
      const next = ordenadas[idx + 1] || ordenadas[idx - 1]
      if (next) router.push(next.href)
      else router.push('/dashboard')
    }
    close(id).catch((err: Error) => alerts.error('Erro', err.message))
  }

  async function handlePin(id: string, pinned: boolean) {
    try {
      await setPinned(id, pinned)
    } catch (e) {
      alerts.error('Não foi possível fixar', (e as Error).message)
    }
  }

  function handleDuplicate(id: string) {
    const t = tabs.find(x => x.id === id)
    if (!t) return
    // Duplicar significa abrir em "outra aba" = só navega na URL
    // (já que cada href é único — duplicar não cria novo registro)
    alerts.warning('Duplicar', 'Cada rota gera apenas uma aba — abra outra rota se precisar.')
  }

  function handleCloseOthers(id: string) {
    const idsParaFechar = tabs.filter(t => t.id !== id && !t.pinned).map(t => t.id)
    if (idsParaFechar.length === 0) return
    closeMultiple(idsParaFechar)
    const t = tabs.find(x => x.id === id)
    if (t && t.href !== pathname) router.push(t.href)
  }

  function handleCloseRight(id: string) {
    const idx = ordenadas.findIndex(t => t.id === id)
    if (idx === -1) return
    const idsParaFechar = ordenadas.slice(idx + 1).filter(t => !t.pinned).map(t => t.id)
    if (idsParaFechar.length === 0) return
    closeMultiple(idsParaFechar)
    if (activeId && idsParaFechar.includes(activeId)) {
      const t = tabs.find(x => x.id === id)
      if (t) router.push(t.href)
    }
  }

  function handleCloseAll() {
    const idsParaFechar = tabs.filter(t => !t.pinned).map(t => t.id)
    if (idsParaFechar.length === 0) return
    closeMultiple(idsParaFechar)
    // Se a ativa não é pinned, navega para a primeira pinned ou dashboard
    const activeTab = tabs.find(x => x.id === activeId)
    if (activeTab && !activeTab.pinned) {
      const primeiraPinada = tabs.find(t => t.pinned)
      router.push(primeiraPinada?.href ?? '/dashboard')
    }
  }

  // Drag-and-drop — só reordena dentro do mesmo grupo (pinned/normal)
  function handleDragStart(_e: DragStartEvent) {
    setDraggingAny(true)
  }
  function handleDragCancel() {
    setDraggingAny(false)
  }
  function handleDragEnd(e: DragEndEvent) {
    setDraggingAny(false)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const activeTab = tabs.find(t => t.id === active.id)
    const overTab = tabs.find(t => t.id === over.id)
    if (!activeTab || !overTab) return
    if (activeTab.pinned !== overTab.pinned) return // não muda grupo via drag

    const grupo = activeTab.pinned ? pinnedIds : normalIds
    const oldIdx = grupo.indexOf(active.id as string)
    const newIdx = grupo.indexOf(over.id as string)
    if (oldIdx === -1 || newIdx === -1) return
    const reordenado = arrayMove(grupo, oldIdx, newIdx)
    // Constrói lista completa: pinned primeiro, normal depois
    const novaOrdem = activeTab.pinned
      ? [...reordenado, ...normalIds]
      : [...pinnedIds, ...reordenado]
    reorder(novaOrdem)
  }

  // Fechar context menu ao clicar fora
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('#tab-ctx-menu')) setCtxMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [ctxMenu])

  if (loading) {
    return (
      <div className="h-[42px] border-b bg-card flex items-center px-4 text-xs text-muted-foreground">
        Carregando abas...
      </div>
    )
  }

  if (tabs.length === 0) {
    return (
      <div className="sticky top-14 z-20 h-[42px] border-b bg-card flex items-center px-4 text-xs text-muted-foreground">
        Nenhuma aba aberta. Use o menu lateral para abrir um módulo.
      </div>
    )
  }

  return (
    <>
      <div className="sticky top-14 z-20 h-[42px] border-b bg-card flex items-stretch overflow-hidden">
        {/* Botão scroll esquerda */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollBy(-200)}
            className="px-2 hover:bg-muted/40 flex items-center text-muted-foreground"
            aria-label="Rolar para esquerda"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Lista de abas */}
        <div
          ref={listRef}
          className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden scrollbar-none"
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {/* Pinadas */}
            <SortableContext items={pinnedIds} strategy={horizontalListSortingStrategy}>
              {ordenadas.filter(t => t.pinned).map(t => (
                <SortableTab
                  key={t.id}
                  tab={t}
                  active={t.id === activeId}
                  draggingAny={draggingAny}
                  pending={showPendingSpinner && pendingHref === t.href}
                  onActivate={() => activate(t.href)}
                  onContextMenu={(x, y) => setCtxMenu({ tabId: t.id, x, y })}
                  onClose={(e) => handleClose(t.id, e)}
                />
              ))}
            </SortableContext>
            {/* Separador entre pinadas e normais */}
            {pinnedIds.length > 0 && normalIds.length > 0 && (
              <div className="my-2 w-px bg-border self-center mx-1" style={{ height: '24px' }} />
            )}
            {/* Normais */}
            <SortableContext items={normalIds} strategy={horizontalListSortingStrategy}>
              {ordenadas.filter(t => !t.pinned).map(t => (
                <SortableTab
                  key={t.id}
                  tab={t}
                  active={t.id === activeId}
                  draggingAny={draggingAny}
                  pending={showPendingSpinner && pendingHref === t.href}
                  onActivate={() => activate(t.href)}
                  onContextMenu={(x, y) => setCtxMenu({ tabId: t.id, x, y })}
                  onClose={(e) => handleClose(t.id, e)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        {/* Botão scroll direita */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollBy(200)}
            className="px-2 hover:bg-muted/40 flex items-center text-muted-foreground"
            aria-label="Rolar para direita"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Botão + nova aba (atalho rápido pro dashboard) */}
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="px-3 hover:bg-muted/40 flex items-center text-muted-foreground"
          title="Ir ao dashboard (Ctrl+T)"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Context menu */}
      {ctxMenu && (() => {
        const t = tabs.find(x => x.id === ctxMenu.tabId)
        if (!t) return null
        return (
          <div
            id="tab-ctx-menu"
            style={{ left: ctxMenu.x, top: ctxMenu.y, position: 'fixed' }}
            className="z-[200] min-w-[200px] rounded-md border bg-card shadow-lg py-1"
          >
            <button
              type="button"
              onClick={() => { router.refresh(); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              Recarregar aba
            </button>
            <button
              type="button"
              onClick={() => { handlePin(t.id, !t.pinned); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-2"
            >
              {t.pinned ? <PinOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Pin className="h-3.5 w-3.5 text-muted-foreground" />}
              {t.pinned ? 'Desafixar aba' : 'Fixar aba'}
            </button>
            <button
              type="button"
              onClick={() => { handleDuplicate(t.id); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-2"
            >
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              Duplicar aba
            </button>
            <div className="my-1 border-t" />
            <button
              type="button"
              onClick={() => { handleClose(t.id); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 flex items-center gap-2"
            >
              <X className="h-3.5 w-3.5" />
              Fechar (Ctrl+W)
            </button>
            <button
              type="button"
              onClick={() => { handleCloseOthers(t.id); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 flex items-center gap-2"
            >
              <X className="h-3.5 w-3.5" />
              Fechar outras
            </button>
            <button
              type="button"
              onClick={() => { handleCloseRight(t.id); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 flex items-center gap-2"
            >
              <X className="h-3.5 w-3.5" />
              Fechar à direita
            </button>
            <button
              type="button"
              onClick={() => { handleCloseAll(); setCtxMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 flex items-center gap-2"
            >
              <X className="h-3.5 w-3.5" />
              Fechar todas
            </button>
          </div>
        )
      })()}
    </>
  )
}

// ──────────────────────────────────────────────────────────
// SortableTab — uma aba individual com suporte a drag-and-drop
// ──────────────────────────────────────────────────────────

function SortableTab({
  tab,
  active,
  draggingAny,
  pending,
  onActivate,
  onContextMenu,
  onClose,
}: {
  tab: Tab
  active: boolean
  draggingAny: boolean
  pending: boolean
  onActivate: () => void
  onContextMenu: (x: number, y: number) => void
  onClose: (e?: React.MouseEvent) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }
  const Icon = getIcon(tab.icon)

  // Hover controlado por JS: só expande se o mouse ficar parado 250ms.
  // Movimentos rápidos cancelam o timer antes de disparar — sem tremedeira.
  const [expanded, setExpanded] = useState(false)
  const expandTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handlePointerEnter() {
    if (!tab.pinned || draggingAny) return
    if (expandTimer.current) clearTimeout(expandTimer.current)
    expandTimer.current = setTimeout(() => setExpanded(true), 250)
  }
  function handlePointerLeave() {
    if (expandTimer.current) { clearTimeout(expandTimer.current); expandTimer.current = null }
    setExpanded(false)
  }
  useEffect(() => () => { if (expandTimer.current) clearTimeout(expandTimer.current) }, [])
  // Cor do grupo da sidebar a que esta rota pertence (Cadastros=verde, Comercial=rosa, etc.)
  const groupHex = getGroupHexForHref(tab.href)

  // Quando ativa OU pinada, aplica a cor do grupo no texto/ícone.
  // Pinada inativa: fundo mais sutil (6%); ativa: fundo mais visível (12%).
  const inlineActiveStyle: React.CSSProperties = active
    ? { backgroundColor: `color-mix(in srgb, ${groupHex} 12%, transparent)`, color: groupHex }
    : tab.pinned
      ? { backgroundColor: `color-mix(in srgb, ${groupHex} 6%, transparent)`, color: groupHex }
      : {}

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ...inlineActiveStyle }}
      {...attributes}
      {...listeners}
      onClick={onActivate}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e.clientX, e.clientY) }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      className={cn(
        'group/tab relative flex items-center select-none flex-shrink-0 touch-none overflow-hidden',
        'border-r border-border/50 text-[13px]',
        // Aba pinada: expansão controlada pelo state `expanded` (JS, com timer de 250ms).
        // Movimentos rápidos não disparam (timer cancelado no leave).
        tab.pinned
          // Padding e justify FIXOS (px-3 + justify-start) — só max-width e gap mudam.
          // max-width é interpolável (width:auto NÃO é) → garante animação suave
          // tanto ao expandir quanto ao recolher.
          ? draggingAny
            ? 'max-w-[40px] min-w-[40px] justify-start px-3 gap-0'
            : expanded
              ? 'max-w-[200px] min-w-[40px] justify-start px-3 gap-2 transition-[max-width,gap] duration-200 ease-out'
              : 'max-w-[40px] min-w-[40px] justify-start px-3 gap-0 transition-[max-width,gap] duration-200 ease-out'
          : 'max-w-[200px] px-3 gap-2 transition-colors',
        // Cursor: pointer no hover (uso principal é clicar pra navegar);
        // grabbing apenas quando o user realmente está arrastando pra reordenar.
        isDragging ? 'cursor-grabbing shadow-md bg-card' : 'cursor-pointer',
        // Pinadas e ativas: texto bold pra destacar; demais: peso normal e cor muted
        active || tab.pinned
          ? 'font-semibold'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {/* Indicador de aba ativa — barra inferior na cor do grupo */}
      {active && (
        <div
          className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ backgroundColor: groupHex }}
        />
      )}
      {pending ? (
        // Spinner substitui o ícone enquanto a navegação para esta aba está em curso.
        <Loader2
          className="h-3.5 w-3.5 shrink-0 animate-spin"
          style={{ color: active || tab.pinned ? groupHex : undefined }}
        />
      ) : Icon && (
        <Icon
          className="h-4 w-4 shrink-0"
          style={{ color: active || tab.pinned ? groupHex : undefined }}
        />
      )}
      {tab.pinned ? (
        // Label da pinada — começa colapsado (max-w-0, opacity 0); no hover
        // do container .group/tab, max-w expande e opacity sobe.
        // Durante drag (draggingAny), o group-hover é desativado pra não
        // "escorrer" o nome enquanto o user reorganiza.
        <span
          className={cn(
            'overflow-hidden whitespace-nowrap transition-all duration-200 ease-out',
            !draggingAny && expanded
              ? 'max-w-[160px] opacity-100'
              : 'max-w-0 opacity-0',
          )}
        >
          {tab.label}
        </span>
      ) : (
        <span className="truncate">{tab.label}</span>
      )}
      {!tab.pinned && (
        <button
          type="button"
          onClick={(e) => onClose(e)}
          onPointerDown={(e) => e.stopPropagation()}
          className="opacity-0 group-hover:opacity-70 hover:!opacity-100 hover:bg-black/10 rounded p-0.5 transition-opacity shrink-0"
          aria-label="Fechar aba"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
