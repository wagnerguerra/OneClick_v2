'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@saas/ui'

/**
 * Card de seção — padrão LuminAux (/settings/mail), 20/08/2026.
 *
 * Cabeçalho com título + descrição (truncados), ações opcionais e o botão de
 * recolher (chevron que gira). Corpo separado por `border-t`, com `p-5` por
 * padrão (`bodyClassName` troca — ex.: `p-0` para listas que sangram).
 *
 * Uso:
 *   <SectionCard title="Configuração" description="Detalhes da conexão." icon={<Mail />}>
 *     <div className="grid gap-4 sm:grid-cols-2">…</div>
 *   </SectionCard>
 */
export function SectionCard({
  title,
  description,
  icon,
  actions,
  defaultOpen = true,
  collapsible = true,
  className,
  bodyClassName,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  actions?: React.ReactNode
  defaultOpen?: boolean
  collapsible?: boolean
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={cn('flex flex-col rounded-lg border border-border bg-card shadow-sm', className)}>
      <div className="flex items-center gap-2 px-4 py-3">
        {icon && <span className="shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          {collapsible && (
            <button
              type="button"
              aria-label={open ? 'Recolher' : 'Expandir'}
              aria-expanded={open}
              onClick={() => setOpen(v => !v)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronDown
                className={cn('h-4 w-4 transition-transform duration-[250ms] ease-[cubic-bezier(.16,1,.3,1)]', open && 'rotate-180')}
              />
            </button>
          )}
        </div>
      </div>
      {/* Animação do modelo (framer-motion: height 0↔auto + opacity 0↔1, 0.25s,
          ease cubic-bezier(.16,1,.3,1)) reproduzida em CSS puro: o grid anima
          `grid-template-rows` de 0fr a 1fr — o único jeito de transicionar até
          a altura automática sem JS — e a opacidade acompanha. O conteúdo fica
          montado (estado de formulários preservado ao recolher/expandir). */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-[250ms] ease-[cubic-bezier(.16,1,.3,1)]"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={cn('relative border-t border-border p-5 text-sm', bodyClassName)} inert={open ? undefined : true}>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
