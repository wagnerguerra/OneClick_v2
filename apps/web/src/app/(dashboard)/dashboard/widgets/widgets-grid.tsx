'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { Layout } from 'react-grid-layout'
import { Pencil, Save, X, Plus, Loader2, Maximize2 } from 'lucide-react'
import { Button, cn, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogBody, Input, Label } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { WIDGET_REGISTRY, DEFAULT_LAYOUT, COLOR_CLASSES } from './registry'
import { CompactPendingFlag } from './compact-pending-flag'
import { WidgetErrorBoundary } from '@/components/dashboard/widget-error-boundary'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { useEmpresaAtiva } from '@/hooks/use-empresa-ativa'
import { useCurrentUserProfile } from '@/hooks/use-current-user-profile'
import { getGroupHexForHref } from '@/lib/navigation'
import { Users, User as UserIcon, MapPin, Search as SearchIcon, Check as CheckIcon } from 'lucide-react'

// react-grid-layout v1 é CJS — usa dynamic com ssr:false pra evitar interop SSR
const ResponsiveGrid = dynamic(
  async () => {
    const mod: any = await import('react-grid-layout')
    const GridLayout = mod.default ?? mod
    const WP = GridLayout.WidthProvider ?? mod.WidthProvider
    return { default: WP(GridLayout) }
  },
  { ssr: false, loading: () => <div className="py-12 text-center text-xs text-muted-foreground">Carregando grid...</div> },
) as any

type VisibilityScope = 'all' | 'users' | 'areas'
interface Visibility { scope: VisibilityScope; userIds: string[]; areaIds: string[] }
interface SavedItem {
  i: string; x: number; y: number; w: number; h: number
  minW?: number; minH?: number
  customLabel?: string
  visibility?: Visibility
}

/**
 * Decide se um usuário pode VER um widget (não é o mesmo de canRead — esse é
 * controle por widget, configurável via modal "Editar widget"). Master e
 * EmpresaMaster sempre veem. Default ausente = scope 'all'.
 */
function passVisibility(
  vis: Visibility | undefined,
  userId: string | null | undefined,
  areaId: string | null | undefined,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true
  if (!vis || vis.scope === 'all') return true
  if (vis.scope === 'users') return !!userId && vis.userIds.includes(userId)
  if (vis.scope === 'areas') return !!areaId && vis.areaIds.includes(areaId)
  return true
}

export function WidgetsGrid({ header }: { header?: React.ReactNode }) {
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const { empresa: empresaAtiva } = useEmpresaAtiva()
  const { profile } = useCurrentUserProfile()
  const isAdmin = isMaster || isEmpresaMaster
  const empresaIdAtual = empresaAtiva?.id
  const myUserId = profile?.id ?? null
  const myAreaId = profile?.area?.id ?? null

  const [layout, setLayout] = useState<SavedItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftLayout, setDraftLayout] = useState<SavedItem[] | null>(null)
  const [expandedWidget, setExpandedWidget] = useState<string | null>(null)

  // Modal "Editar widget" — gerencia label + visibility juntos
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editScope, setEditScope] = useState<VisibilityScope>('all')
  const [editUserIds, setEditUserIds] = useState<string[]>([])
  const [editAreaIds, setEditAreaIds] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [areaSearch, setAreaSearch] = useState('')

  // Cache de users e áreas pra popular os pickers (só carrega uma vez por sessão da modal)
  const [usuariosOpcoes, setUsuariosOpcoes] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [areasOpcoes, setAreasOpcoes] = useState<Array<{ id: string; name: string }>>([])
  const [pickersLoaded, setPickersLoaded] = useState(false)

  // Carrega layout salvo no mount (e quando empresa ativa muda — master pode trocar)
  const fetchLayout = useCallback(() => {
    return (trpc.dashboardLayout as any).get.query(empresaIdAtual ? { empresaId: empresaIdAtual } : undefined)
      .then((data: { layout: SavedItem[]; updatedAt: Date } | null) => {
        setLayout(data && data.layout && data.layout.length > 0 ? data.layout : DEFAULT_LAYOUT)
      })
      .catch(() => setLayout(DEFAULT_LAYOUT))
  }, [empresaIdAtual])

  useEffect(() => {
    fetchLayout().finally(() => setLoaded(true))
  }, [fetchLayout])

  // SSE — recarrega layout em tempo real quando outro cliente da MESMA empresa
  // salva ou reseta. Ignora eventos sem empresaId casando e ignora se o usuário
  // está editando (evita sobrescrever o draft no meio do trabalho dele — quando
  // ele sair do modo edição, o próximo evento traz o estado mais recente).
  useEffect(() => {
    if (!empresaIdAtual) return
    let es: EventSource | null = null
    let retryTimeout: ReturnType<typeof setTimeout>
    let closed = false

    const connect = () => {
      if (closed) return
      try {
        const apiUrl = getApiUrl()
        es = new EventSource(`${apiUrl}/api/dashboard-layout/events`)
        es.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data) as { type: string; empresaId: string; actorUserId?: string | null }
            if (ev.empresaId !== empresaIdAtual) return
            if (editing) return // não atropela edição em andamento
            fetchLayout()
          } catch { /* payload inválido — ignora */ }
        }
        es.onerror = () => {
          es?.close()
          if (!closed) retryTimeout = setTimeout(connect, 15000)
        }
      } catch {
        if (!closed) retryTimeout = setTimeout(connect, 15000)
      }
    }
    connect()
    return () => { closed = true; es?.close(); clearTimeout(retryTimeout) }
  }, [empresaIdAtual, editing, fetchLayout])

  // Filtra widgets desconhecidos (id que saiu do registry). Visibility só filtra
  // widgets SEM requiresModule (a regra do widget). Widgets com módulo são
  // controlados unicamente pela permissão do módulo — viram placeholder pra quem
  // não tem leitura, não somem do layout. Admin em modo edição vê tudo.
  const visibleLayout = useMemo(() => {
    const source = editing && draftLayout ? draftLayout : layout
    return source
      .filter(item => {
        const def = WIDGET_REGISTRY[item.i]
        if (!def) return false
        if (editing && isAdmin) return true
        // Widgets com requiresModule passam aqui (placeholder cuida do "sem acesso")
        if (def.requiresModule) return true
        // Widgets sem módulo seguem visibility
        return passVisibility(item.visibility, myUserId, myAreaId, isAdmin)
      })
      .map(item => {
        const def = WIDGET_REGISTRY[item.i]!
        return {
          ...item,
          minW: def.defaultLayout.minW,
          minH: def.defaultLayout.minH,
        }
      })
  }, [layout, draftLayout, editing, isAdmin, myUserId, myAreaId])

  // IDs ainda não no layout (pra menu "Adicionar widget")
  const widgetsDisponiveis = useMemo(() => {
    const usados = new Set(visibleLayout.map(i => i.i))
    return Object.values(WIDGET_REGISTRY).filter(w => !usados.has(w.id))
  }, [visibleLayout])

  function handleEntrarEdicao() {
    setDraftLayout([...layout])
    setEditing(true)
  }

  function handleCancelar() {
    setDraftLayout(null)
    setEditing(false)
  }

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    if (!editing) return
    // mescla mudanças preservando widgets escondidos pelo filtro de permissão
    setDraftLayout(prev => {
      const base = prev ?? layout
      const updated = base.map(it => {
        const found = newLayout.find(n => n.i === it.i)
        return found ? { ...it, x: found.x, y: found.y, w: found.w, h: found.h } : it
      })
      return updated
    })
  }, [editing, layout])

  function handleAdicionar(widgetId: string) {
    const def = WIDGET_REGISTRY[widgetId]
    if (!def) return
    setDraftLayout(prev => {
      const base = prev ?? layout
      // Coloca no final (bottom-left) — o grid empurra pra cima se possível
      const maxY = base.reduce((m, i) => Math.max(m, i.y + i.h), 0)
      return [...base, {
        i: widgetId,
        x: 0,
        y: maxY,
        w: def.defaultLayout.w,
        h: def.defaultLayout.h,
        minW: def.defaultLayout.minW,
        minH: def.defaultLayout.minH,
      }]
    })
  }

  function handleRemover(widgetId: string) {
    setDraftLayout(prev => (prev ?? layout).filter(i => i.i !== widgetId))
  }

  async function abrirEditar(widgetId: string) {
    const item = (draftLayout ?? layout).find(i => i.i === widgetId)
    setEditLabel(item?.customLabel ?? '')
    const vis = item?.visibility
    setEditScope(vis?.scope ?? 'all')
    setEditUserIds(vis?.userIds ?? [])
    setEditAreaIds(vis?.areaIds ?? [])
    setUserSearch('')
    setAreaSearch('')
    setEditingWidgetId(widgetId)

    // Carrega usuários e áreas sob demanda (uma vez por sessão da página)
    if (!pickersLoaded) {
      try {
        const [users, areas] = await Promise.all([
          (trpc.user as any).listForSelect.query(),
          (trpc.area as any).listForSelect.query(),
        ])
        setUsuariosOpcoes(users || [])
        setAreasOpcoes(areas || [])
      } catch {
        // pickers podem ficar vazios — admin ainda consegue salvar 'all'
      } finally {
        setPickersLoaded(true)
      }
    }
  }

  function salvarEditar() {
    if (!editingWidgetId) return
    const labelLimpo = editLabel.trim()
    setDraftLayout(prev => {
      const base = prev ?? layout
      return base.map(i => {
        if (i.i !== editingWidgetId) return i
        const next: SavedItem = { ...i }
        // Label
        if (labelLimpo) next.customLabel = labelLimpo
        else delete next.customLabel
        // Visibility — sempre persiste, mesmo 'all'. Isso marca que o admin
        // configurou explicitamente, fazendo o widget ignorar o requiresModule
        // do registry e usar só esta regra.
        next.visibility = {
          scope: editScope,
          userIds: editScope === 'users' ? editUserIds : [],
          areaIds: editScope === 'areas' ? editAreaIds : [],
        }
        return next
      })
    })
    setEditingWidgetId(null)
  }

  function toggleUserId(id: string) {
    setEditUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleAreaId(id: string) {
    setEditAreaIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSalvar() {
    if (!draftLayout) return
    setSaving(true)
    try {
      // Não envia campos opcionais que viraram null. Visibility é persistida
      // sempre que existir (incluindo 'all') — sinaliza configuração explícita
      // do admin, que tem precedência sobre o requiresModule do registry.
      const payload = draftLayout.map(({ i, x, y, w, h, minW, minH, customLabel, visibility }) => {
        const item: SavedItem = { i, x, y, w, h }
        if (typeof minW === 'number') item.minW = minW
        if (typeof minH === 'number') item.minH = minH
        if (customLabel && customLabel.trim()) item.customLabel = customLabel.trim()
        if (visibility) item.visibility = visibility
        return item
      })
      await (trpc.dashboardLayout as any).save.mutate({
        layout: payload,
        ...(empresaIdAtual ? { empresaId: empresaIdAtual } : {}),
      })
      setLayout(payload)
      setDraftLayout(null)
      setEditing(false)
      await alerts.success('Layout salvo', 'Configuração aplicada para toda a empresa.')
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando dashboard...
      </div>
    )
  }

  return (
    <div className="relative">
      {/* Header + Toolbar de edição — botões alinhados ao topo (com o título) */}
      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
        <div className="min-w-0 flex-1">{header}</div>
        {isAdmin && (
          <div className="flex items-center gap-2 pt-1">
          {!editing ? (
            <Button size="sm" variant="outline" onClick={handleEntrarEdicao} className="gap-1.5">
              <Pencil className="h-4 w-4" /> Editar Dashboard
            </Button>
          ) : (
            <>
              {widgetsDisponiveis.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="h-4 w-4" /> Adicionar Widget
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    {widgetsDisponiveis.map(w => {
                      const Icon = w.icon
                      return (
                        <DropdownMenuItem key={w.id} onClick={() => handleAdicionar(w.id)}>
                          <Icon className="h-3.5 w-3.5 mr-2" /> {w.label}
                        </DropdownMenuItem>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button size="sm" variant="ghost" onClick={handleCancelar} disabled={saving} className="gap-1.5">
                <X className="h-4 w-4" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSalvar} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
            </>
          )}
          </div>
        )}
      </div>

      <ResponsiveGrid
        className={cn('layout', editing && 'is-editing')}
        layout={visibleLayout as Layout[]}
        cols={12}
        rowHeight={40}
        margin={[16, 16]}
        containerPadding={[2, 0]}
        isDraggable={editing}
        isResizable={editing}
        onLayoutChange={handleLayoutChange}
        draggableCancel=".widget-no-drag"
        // compactType={null} permite deixar linhas e colunas vazias entre widgets
        // (sem isso, vertical compaction puxa tudo pra cima automaticamente e
        // não dá pra "reservar" espaço). preventCollision impede sobreposição
        // durante o drag.
        compactType={null}
        preventCollision
      >
        {visibleLayout.map(item => {
          const def = WIDGET_REGISTRY[item.i]
          if (!def) return null
          const Component = def.Component
          const Icon = def.icon
          const c = COLOR_CLASSES[def.color]
          // Cor do bloco da sidebar — usada na borda esquerda dos widgets.
          // Derivada do groupHref (override explícito) ou do requiresModule.
          const blocoHref = def.groupHref ?? (def.requiresModule ? `/${def.requiresModule}` : '/')
          const blocoHex = getGroupHexForHref(blocoHref)
          // Regra de acesso:
          //  - Widget COM requiresModule → controle único é a permissão do módulo.
          //    Visibility da modal é ignorada (não tem efeito em runtime; o admin
          //    só consegue liberar via /usuarios → permissões do módulo).
          //  - Widget SEM requiresModule → visibility configurada na modal é o
          //    controle único. Default (sem visibility) = todos veem.
          const canRead = def.requiresModule
            ? isMaster || !!permissions.find(p => p.moduleSlug === def.requiresModule)?.canRead
            : item.visibility
              ? isAdmin || passVisibility(item.visibility, myUserId, myAreaId, isAdmin)
              : true
          // Modo compacto: 1×1 ou 1×2 vira botão pra abrir modal
          const isCompact = item.w === 1 && item.h <= 2
          return (
            <div key={item.i} className="relative group">
              {editing && (
                <>
                  {/* Botões de ação no canto direito (não disparam drag) */}
                  <div className="widget-no-drag absolute top-2 right-2 z-20 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => abrirEditar(item.i)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-fuchsia-500 text-white shadow-md hover:bg-fuchsia-600 transition-colors"
                      title="Editar widget (título e acesso)"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemover(item.i)}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600 transition-colors"
                      title="Remover widget"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {/* Overlay no modo edit — borda tracejada e cursor de mover */}
                  <div className="absolute inset-0 z-[5] pointer-events-none border-2 border-dashed border-fuchsia-400/60 rounded-lg" />
                  {/* Cursor "move" sobre todo o widget durante edição */}
                  <div className="absolute inset-0 z-[6] pointer-events-none" style={{ cursor: 'move' }} />
                </>
              )}
              {!canRead ? (
                // Placeholder pra widgets sem permissão — slot tracejado com nome
                // e ícone esmaecidos. Usuário enxerga que algo existe ali mas não
                // acessa o conteúdo. Não é clicável (nem no modo compacto).
                (() => {
                  const labelPlaceholder = item.customLabel ?? def.label
                  return (
                    <div
                      className={cn(
                        'h-full w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-muted/30 text-muted-foreground/70 px-3',
                        'border-muted-foreground/30',
                      )}
                      title="Você não tem permissão para acessar este widget"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40">
                        <Icon className="h-4 w-4 opacity-60" />
                      </div>
                      <span className="text-xs font-semibold text-center leading-tight line-clamp-2">
                        {labelPlaceholder}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider opacity-70">
                        Sem acesso
                      </span>
                    </div>
                  )
                })()
              ) : isCompact ? (
                // Modo compacto: botão clean no estilo Card (mesmo padrão dos outros widgets)
                (() => {
                  const labelBotao = item.customLabel ?? def.label
                  return (
                    <button
                      type="button"
                      onClick={() => !editing && setExpandedWidget(item.i)}
                      disabled={editing}
                      className={cn(
                        'group/btn relative h-full w-full flex flex-col items-center justify-center gap-2 rounded-lg border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow border-l-4 overflow-hidden',
                        editing ? 'pointer-events-none opacity-95' : 'cursor-pointer',
                      )}
                      style={{ borderLeftColor: blocoHex }}
                      title={`Abrir ${labelBotao}`}
                    >
                      <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', c.bgIcon)}>
                        <Icon className={cn('h-4 w-4', c.text)} />
                      </div>
                      <span className="text-xs font-semibold text-foreground/80 text-center px-2 leading-tight line-clamp-2">
                        {labelBotao}
                      </span>
                      {/* Flag de pendência — só renderiza se o widget tem
                          vencidos/vencendo (e o widget id é mapeado). */}
                      {!editing && <CompactPendingFlag widgetId={item.i} />}
                    </button>
                  )
                })()
              ) : (
                <div className={cn('h-full relative group/widget', editing && 'pointer-events-none opacity-95')}>
                  {/* Botão "Ampliar" — aparece no hover, fora do modo edição.
                      Abre o widget no modal expandido (componentes que suportam
                      a prop `expanded` renderizam uma versão mais detalhada). */}
                  {!editing && canRead && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpandedWidget(item.i) }}
                      title="Ampliar"
                      aria-label="Ampliar widget"
                      className="absolute top-2 right-2 z-10 inline-flex items-center justify-center h-7 w-7 rounded-md bg-card/80 backdrop-blur-sm border border-border/60 text-muted-foreground opacity-0 group-hover/widget:opacity-100 hover:bg-card hover:text-foreground hover:border-border transition-all shadow-sm"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <WidgetErrorBoundary label={def.label} borderColor={c.borderLeft}>
                    <Component canRead={canRead} title={item.customLabel} bloco={blocoHex} />
                  </WidgetErrorBoundary>
                </div>
              )}
            </div>
          )
        })}
      </ResponsiveGrid>

      {/* Modal de widget expandido (quando 1×1 é clicado) */}
      <Dialog open={!!expandedWidget} onOpenChange={(o) => !o && setExpandedWidget(null)}>
        <DialogContent
          // Calendário precisa de espaço pra mostrar 6 rows × 120px + header
          // + painel lateral de 300px. Pra outros widgets, o sm:max-w-[900px]
          // continua funcionando — só fica menos largo na proporção.
          className={cn(
            'overflow-hidden flex flex-col',
            expandedWidget === 'calendario'
              ? 'sm:max-w-[1200px] h-[90vh]'
              : 'sm:max-w-[900px] max-h-[85vh]',
          )}
        >
          {expandedWidget && WIDGET_REGISTRY[expandedWidget] && (() => {
            const def = WIDGET_REGISTRY[expandedWidget]!
            const Icon = def.icon
            const Component = def.Component
            const c = COLOR_CLASSES[def.color]
            const item = (editing && draftLayout ? draftLayout : layout).find(i => i.i === expandedWidget)
            // Mesma regra do render principal
            const canRead = def.requiresModule
              ? isMaster || !!permissions.find(p => p.moduleSlug === def.requiresModule)?.canRead
              : item?.visibility
                ? isAdmin || passVisibility(item.visibility, myUserId, myAreaId, isAdmin)
                : true
            if (!canRead) return null
            const titulo = item?.customLabel ?? def.label
            return (
              <>
                <DialogHeaderIcon icon={Icon} color={def.color}>
                  <DialogTitle className="leading-tight">{titulo}</DialogTitle>
                  <DialogDescription className="leading-tight mt-0.5">Visão expandida do widget</DialogDescription>
                </DialogHeaderIcon>
                <div className="flex-1 min-h-[400px] overflow-hidden p-4 pt-2">
                  <WidgetErrorBoundary label={def.label} borderColor={c.borderLeft}>
                    <Component canRead={canRead} title={item?.customLabel} expanded />
                  </WidgetErrorBoundary>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Modal de editar widget — título + visibilidade */}
      <Dialog open={!!editingWidgetId} onOpenChange={(o) => !o && setEditingWidgetId(null)}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeaderIcon icon={Pencil} color="sky">
            <DialogTitle>Editar widget</DialogTitle>
            <DialogDescription>
              Personalize o título e defina quem enxerga esse widget no dashboard.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-5 overflow-y-auto">
            {/* Título */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Título do widget</Label>
              <Input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                placeholder={editingWidgetId ? (WIDGET_REGISTRY[editingWidgetId]?.label ?? '') : ''}
                maxLength={80}
                autoFocus
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Padrão: <span className="font-medium">{editingWidgetId ? WIDGET_REGISTRY[editingWidgetId]?.label : ''}</span>
                {' · '}Deixe em branco pra usar o padrão.
              </p>
            </div>

            {/* Quem vê — escopo */}
            {(() => {
              const moduleSlug = editingWidgetId ? WIDGET_REGISTRY[editingWidgetId]?.requiresModule : undefined
              const hasModule = !!moduleSlug
              return (
                <div className="space-y-2">
                  <Label className="text-[13px] font-semibold">Quem pode ver este widget</Label>
                  {hasModule ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-3 py-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                      <strong>Controlado pela permissão de módulo.</strong> O acesso a este widget é definido pela permissão do módulo <span className="font-mono text-[10px] bg-amber-100 dark:bg-amber-900/50 px-1 py-0.5 rounded">{moduleSlug}</span> no cadastro de cada usuário. Para liberar ou bloquear, vá em <span className="font-medium">Usuários → Permissões</span>.
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { v: 'all',   label: 'Todos',     icon: Users },
                          { v: 'users', label: 'Usuários',  icon: UserIcon },
                          { v: 'areas', label: 'Áreas',     icon: MapPin },
                        ] as const).map(opt => {
                          const Icon = opt.icon
                          const active = editScope === opt.v
                          return (
                            <button
                              key={opt.v}
                              type="button"
                              onClick={() => setEditScope(opt.v)}
                              className={cn(
                                'inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                                active
                                  ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300'
                                  : 'border-border/60 hover:border-border bg-card text-muted-foreground hover:text-foreground',
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {editScope === 'all' && 'Qualquer usuário enxerga.'}
                        {editScope === 'users' && 'Apenas os usuários selecionados enxergam (master sempre vê).'}
                        {editScope === 'areas' && 'Apenas usuários cuja área cadastrada está na lista (master sempre vê).'}
                      </p>
                    </>
                  )}
                </div>
              )
            })()}

            {/* Lista de usuários (se scope = users) — só pra widgets sem módulo */}
            {editScope === 'users' && editingWidgetId && !WIDGET_REGISTRY[editingWidgetId]?.requiresModule && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[13px] font-semibold">Usuários selecionados</Label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {editUserIds.length} / {usuariosOpcoes.length}
                  </span>
                </div>
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Buscar por nome ou e-mail..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="rounded border border-border/60 max-h-[220px] overflow-y-auto divide-y divide-border/40">
                  {!pickersLoaded ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">Carregando...</div>
                  ) : usuariosOpcoes.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">Nenhum usuário disponível</div>
                  ) : (() => {
                    const q = userSearch.trim().toLowerCase()
                    const filtrados = q
                      ? usuariosOpcoes.filter(u =>
                          u.name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q),
                        )
                      : usuariosOpcoes
                    if (filtrados.length === 0) {
                      return <div className="py-6 text-center text-xs text-muted-foreground">Sem resultados</div>
                    }
                    return filtrados.map(u => {
                      const sel = editUserIds.includes(u.id)
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleUserId(u.id)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30',
                            sel && 'bg-sky-50 dark:bg-sky-950/30',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded border shrink-0',
                              sel
                                ? 'bg-sky-500 border-sky-500 text-white'
                                : 'border-muted-foreground/40',
                            )}
                            aria-pressed={sel}
                          >
                            {sel && <CheckIcon className="h-3 w-3" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{u.name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
                          </div>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            )}

            {/* Lista de áreas (se scope = areas) — só pra widgets sem módulo */}
            {editScope === 'areas' && editingWidgetId && !WIDGET_REGISTRY[editingWidgetId]?.requiresModule && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-[13px] font-semibold">Áreas selecionadas</Label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {editAreaIds.length} / {areasOpcoes.length}
                  </span>
                </div>
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={areaSearch}
                    onChange={e => setAreaSearch(e.target.value)}
                    placeholder="Buscar área..."
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <div className="rounded border border-border/60 max-h-[220px] overflow-y-auto divide-y divide-border/40">
                  {!pickersLoaded ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">Carregando...</div>
                  ) : areasOpcoes.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">Nenhuma área cadastrada</div>
                  ) : (() => {
                    const q = areaSearch.trim().toLowerCase()
                    const filtrados = q
                      ? areasOpcoes.filter(a => a.name.toLowerCase().includes(q))
                      : areasOpcoes
                    if (filtrados.length === 0) {
                      return <div className="py-6 text-center text-xs text-muted-foreground">Sem resultados</div>
                    }
                    return filtrados.map(a => {
                      const sel = editAreaIds.includes(a.id)
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggleAreaId(a.id)}
                          className={cn(
                            'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30',
                            sel && 'bg-sky-50 dark:bg-sky-950/30',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 items-center justify-center rounded border shrink-0',
                              sel
                                ? 'bg-sky-500 border-sky-500 text-white'
                                : 'border-muted-foreground/40',
                            )}
                            aria-pressed={sel}
                          >
                            {sel && <CheckIcon className="h-3 w-3" />}
                          </span>
                          <span className="font-medium">{a.name}</span>
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWidgetId(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarEditar}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editing && visibleLayout.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
          Nenhum widget no dashboard. Use <strong>Adicionar Widget</strong> acima.
        </div>
      )}
    </div>
  )
}
