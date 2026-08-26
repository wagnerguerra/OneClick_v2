'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /**
   * Cor de destaque quando marcado (fundo + borda + ring). Aceita qualquer
   * valor CSS de cor, inclusive var — ex.: `var(--mod-comercial, #fb7185)`.
   * Substitui o antigo `accent-[var(--mod-x)]` dos checkboxes nativos.
   * Ausente = cor primária (padrão).
   */
  accentColor?: string
}

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, accentColor, style, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    // A cor custom entra via var local (--cbx-accent) consumida pelas classes
    // literais abaixo — assim o JIT do Tailwind enxerga as classes e a cor
    // (que pode ser um var de módulo) resolve em runtime.
    style={accentColor ? ({ ...style, ['--cbx-accent']: accentColor } as React.CSSProperties) : style}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50',
      accentColor
        ? 'border-[var(--cbx-accent)] focus-visible:ring-[var(--cbx-accent)] data-[state=checked]:bg-[var(--cbx-accent)] data-[state=checked]:border-[var(--cbx-accent)] data-[state=checked]:text-white'
        : 'border-primary focus-visible:ring-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
