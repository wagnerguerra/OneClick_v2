'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '../lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: 'default' | 'pills' }
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      variant === 'pills'
        ? 'flex flex-col gap-1.5 bg-transparent'
        : 'inline-flex items-center w-full bg-transparent border-b border-[#e9ebec]',
      className,
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

function PillArrow() {
  return (
    <svg
      className="absolute -right-[6px] top-1/2 -translate-y-1/2 text-primary opacity-0 transition-opacity group-data-[state=active]:opacity-100"
      width="6"
      height="12"
      viewBox="0 0 6 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M0 0L6 6L0 12V0Z" />
    </svg>
  )
}

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    icon?: React.ReactNode
    variant?: 'default' | 'pills'
  }
>(({ className, icon, children, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      variant === 'pills'
        ? [
            'group relative flex flex-col items-center justify-center',
            'w-[100px] h-[100px] rounded-md',
            'text-[11px] font-medium leading-tight text-center transition-all',
            'text-muted-foreground',
            'hover:bg-muted hover:text-foreground',
            'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm',
            'focus-visible:outline-none',
          ]
        : [
            'inline-flex items-center gap-2 cursor-pointer',
            'focus-visible:outline-none',
          ],
      className,
    )}
    style={variant === 'default' ? undefined : undefined}
    data-tab-variant={variant}
    {...props}
  >
    {variant === 'pills' ? (
      <>
        {icon && <span className="shrink-0 mb-1.5 [&_svg]:h-7 [&_svg]:w-7">{icon}</span>}
        <span className="px-1">{children}</span>
        <PillArrow />
      </>
    ) : (
      <>
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </>
    )}
  </TabsPrimitive.Trigger>
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'focus-visible:outline-none animate-in fade-in-0 duration-200',
      className,
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

// ─────────────────────────────────────────────────────────────────
// SlidingTabsList — TabsList com pill flutuante que desliza ao trocar
// de tab. Usado no header de páginas de detalhe (orçamentos, clientes,
// perfil, etc.).
//
// Como funciona: um <span> absoluto é posicionado sobre a tab ativa.
// A cada mudança de `activeValue` (ou resize), medimos a posição da
// trigger com [data-state="active"] e atualizamos transform/width.
// CSS transition nas propriedades garante o slide.
//
// IMPORTANTE: nas TabsTrigger filhas, NÃO use `data-[state=active]:!bg-*`
// nem `!shadow-sm` no estado ativo — o pill flutuante é a indicação
// visual. Mantenha apenas `data-[state=active]:!text-<cor>` e adicione
// `relative z-10` para o texto ficar acima do indicador.
// ─────────────────────────────────────────────────────────────────
type SlidingTabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
  activeValue: string
  indicatorClassName?: string
  /** Encolhe o indicador verticalmente em N pixels (somando topo+base).
   *  Útil quando o indicador parece "alto demais" comparado ao texto inativo. */
  indicatorInsetY?: number
}

const SlidingTabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  SlidingTabsListProps
>(({ className, activeValue, indicatorClassName, indicatorInsetY = 0, children, ...props }, ref) => {
  const innerRef = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    innerRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [ref])

  const measure = React.useCallback(() => {
    const list = innerRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('[data-state="active"]')
    if (!active) {
      setPos(null)
      return
    }
    const lr = list.getBoundingClientRect()
    const ar = active.getBoundingClientRect()
    setPos({ x: ar.left - lr.left, y: ar.top - lr.top, w: ar.width, h: ar.height })
  }, [])

  React.useLayoutEffect(() => {
    measure()
    // Re-mede depois que o layout/animação de container assenta. Necessário
    // quando o componente é montado dentro de um Radix Dialog/Sheet que abre
    // com transform: scale — o getBoundingClientRect() na primeira passada
    // retorna valores escalados e a pill fica deslocada até a animação acabar.
    // rAF cobre o caso comum (next frame); o timeout pega animações ~250ms.
    const raf = requestAnimationFrame(() => measure())
    const t = setTimeout(() => measure(), 300)
    return () => { cancelAnimationFrame(raf); clearTimeout(t) }
  }, [activeValue, measure])

  React.useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    // ResizeObserver para mudanças de layout (ex: badge aparece dentro de uma trigger)
    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && innerRef.current) {
      ro = new ResizeObserver(() => measure())
      ro.observe(innerRef.current)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [measure])

  return (
    <TabsPrimitive.List
      ref={setRefs}
      className={cn('relative inline-flex items-center bg-transparent', className)}
      {...props}
    >
      {pos && (
        <span
          aria-hidden
          className={cn(
            'absolute top-0 left-0 z-0 rounded-full bg-white shadow-sm dark:bg-card pointer-events-none',
            'transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
            indicatorClassName,
          )}
          style={{
            transform: `translate3d(${pos.x}px, ${pos.y + indicatorInsetY / 2}px, 0)`,
            width: pos.w,
            height: Math.max(0, pos.h - indicatorInsetY),
          }}
        />
      )}
      {children}
    </TabsPrimitive.List>
  )
})
SlidingTabsList.displayName = 'SlidingTabsList'

export { Tabs, TabsList, TabsTrigger, TabsContent, SlidingTabsList }
