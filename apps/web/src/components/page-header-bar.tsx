'use client'

import { useLayoutEffect, useRef } from 'react'
import { cn } from '@saas/ui'
import { useLayoutPrefs } from '@/lib/layout-prefs'

/**
 * Barra de cabeçalho de página — padrão LuminAux (20/08/2026).
 *
 * Faixa que sangra até as bordas do <main> (compensa o p-4/p-6 do layout),
 * fundo igual ao do corpo da página (bg-background — decisão do Wagner 20/08:
 * a barra não é branca) e borda inferior separando do conteúdo. À esquerda vai o
 * título + trilha (`children`); à direita as ações (`actions`).
 *
 * Uso:
 *   <PageHeaderBar actions={<Button>…</Button>}>
 *     <h1 className="truncate">Título</h1>
 *     <p className="mt-0.5 text-xs text-muted-foreground">Página inicial › …</p>
 *   </PageHeaderBar>
 */
export function PageHeaderBar({
  children,
  actions,
  className,
}: {
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  const { prefs } = useLayoutPrefs()
  const fixa = prefs.barraPaginaFixa && prefs.headerFixo
  const ref = useRef<HTMLDivElement>(null)

  // Fixa, a barra ocupa a faixa logo abaixo do header: publica a própria altura
  // em --page-bar-offset para o que gruda no conteúdo (--app-sticky-top) ficar
  // abaixo dela, e não escondido atrás. A altura muda quando a barra quebra linha.
  useLayoutEffect(() => {
    const el = ref.current
    const root = document.documentElement
    if (!fixa || !el) return
    const publica = () => root.style.setProperty('--page-bar-offset', `${el.offsetHeight}px`)
    publica()
    // Sem ResizeObserver (ex.: jsdom dos testes), publica uma vez e não observa.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publica) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); root.style.removeProperty('--page-bar-offset') }
  }, [fixa])

  return (
    <div
      ref={ref}
      className={cn(
        fixa && 'sticky top-[var(--app-header-offset)] z-20',
        '-mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-4 sm:mb-5',
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
        'border-b border-border bg-background px-4 sm:px-6 py-3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {/* `shrink-0` só a partir de `sm`: no celular o grupo de ações precisa
          quebrar em linha, senão empurra a barra inteira para fora da tela. */}
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  )
}
