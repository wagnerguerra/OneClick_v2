import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * Textarea padrão. Fundo, borda e foco vêm da regra base de campos do
 * globals.css (a mesma do Input) — por isso NÃO traz bg-/border-/ring aqui:
 * utilitário vence a camada base e deixava o campo transparente no dark.
 * Só dimensões/tipografia ficam no componente. Aceita todas as props de <textarea>.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'flex min-h-[72px] w-full rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'

export { Textarea }
