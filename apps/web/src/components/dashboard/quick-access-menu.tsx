'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Zap, ChevronDown, X, Pin, PinOff, Sparkles } from 'lucide-react'
import { cn } from '@saas/ui'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from '@saas/ui'
import { useTabs, type Tab } from '@/lib/tabs-store'
import { alerts } from '@/lib/alerts'
import { MODULE_ICONS, getGroupHexForHref, getGroupLabelForHref } from '@/lib/navigation'
import { resolveRouteMeta } from '@/lib/route-meta'

const ICON_FALLBACK_KEY = 'dashboard'

function getIcon(iconKey: string | null | undefined) {
  if (!iconKey) return MODULE_ICONS[ICON_FALLBACK_KEY] ?? null
  return MODULE_ICONS[iconKey] ?? MODULE_ICONS[ICON_FALLBACK_KEY] ?? null
}

/**
 * Acesso rápido — sucessor da antiga guia de abas.
 *
 * Em vez de abrir uma aba a cada navegação, o usuário FIXA os módulos que usa
 * todo dia e eles ficam neste menu do header, a um clique. A persistência
 * reaproveita o backend das abas (`trpc.tabs`): item do Acesso rápido =
 * UserTab com pinned=true (o provider limpa as não-fixadas do modelo antigo).
 */
export function QuickAccessMenu() {
  const router = useRouter()
  const pathname = usePathname()
  const { tabs, maxTabs, fixar, close } = useTabs()
  const [open, setOpen] = useState(false)

  // Só as fixadas, na ordem salva
  const itens = useMemo(
    () => tabs.filter(t => t.pinned).sort((a, b) => a.ordem - b.ordem),
    [tabs],
  )

  const pathClean = pathname.split('?')[0]!.split('#')[0]!
  const atualFixada = itens.find(t => t.href.split('?')[0]!.split('#')[0] === pathClean)
  const metaAtual = resolveRouteMeta(pathClean)

  function navegar(href: string) {
    setOpen(false)
    if (href !== pathname) router.push(href)
  }

  async function fixarAtual() {
    if (!metaAtual) return
    try {
      await fixar({ href: pathClean, label: metaAtual.label, icon: metaAtual.icon })
    } catch (e) {
      alerts.error('Não foi possível fixar', (e as Error).message)
    }
  }

  function removerItem(t: Tab, e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    close(t.id).catch((err: Error) => alerts.error('Erro', err.message))
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-2.5 h-9 text-sm font-medium transition-colors outline-none',
            open ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-primary/10 hover:text-primary',
          )}
          title="Acesso rápido"
        >
          <Zap className="h-4 w-4" />
          <span className="hidden md:inline">Acesso rápido</span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-[400px] max-w-[calc(100vw-2rem)] p-0 overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-4 pt-3.5 pb-3 border-b border-border/60">
          <p className="text-sm font-semibold text-foreground">Acesso rápido</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Os módulos que você fixou, sempre a um clique.
          </p>
        </div>

        {/* Itens fixados */}
        {itens.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <Sparkles className="h-6 w-6 mx-auto text-muted-foreground/50" />
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Nada fixado ainda. Abra um módulo e use
              <br />
              <span className="font-medium text-foreground">&ldquo;Fixar página atual&rdquo;</span> aqui embaixo.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1 p-2 max-h-[320px] overflow-y-auto nice-scrollbar">
            {itens.map(t => {
              const Icon = getIcon(t.icon)
              const hex = getGroupHexForHref(t.href)
              const grupo = getGroupLabelForHref(t.href)
              const ativa = t.href.split('?')[0]!.split('#')[0] === pathClean
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navegar(t.href)}
                  className={cn(
                    'group/item relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    ativa ? 'bg-muted/70' : 'hover:bg-muted/50',
                  )}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `color-mix(in srgb, ${hex} 14%, transparent)`, color: hex }}
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground leading-tight">
                      {t.label}
                    </span>
                    {grupo && (
                      <span className="block truncate text-[11px] text-muted-foreground leading-tight mt-0.5">
                        {grupo}
                      </span>
                    )}
                  </span>
                  {/* Remover do Acesso rápido — aparece no hover */}
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => removerItem(t, e)}
                    className="absolute right-1.5 top-1.5 rounded p-0.5 opacity-0 group-hover/item:opacity-60 hover:!opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-opacity"
                    aria-label={`Remover ${t.label} do Acesso rápido`}
                  >
                    <X className="h-3 w-3" />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Rodapé — fixar/remover a página atual */}
        <div className="border-t border-border/60 bg-muted/30 px-2 py-2">
          {atualFixada ? (
            <button
              type="button"
              onClick={() => { close(atualFixada.id).catch((e: Error) => alerts.error('Erro', e.message)) }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
            >
              <PinOff className="h-3.5 w-3.5" />
              Remover esta página do Acesso rápido
            </button>
          ) : metaAtual ? (
            <button
              type="button"
              onClick={fixarAtual}
              disabled={itens.length >= maxTabs}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <Pin className="h-3.5 w-3.5" />
              {itens.length >= maxTabs
                ? `Limite de ${maxTabs} itens atingido — remova algum`
                : <>Fixar página atual <span className="truncate text-muted-foreground">({metaAtual.label})</span></>}
            </button>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
