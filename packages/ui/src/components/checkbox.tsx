'use client'

import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

interface CheckboxProps extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /**
   * Cor de destaque quando marcado (fundo + borda + ring). Aceita qualquer
   * valor CSS de cor, inclusive var. Ausente = cor primária (padrão) — que é o
   * certo quase sempre; passe só quando a cor tem significado próprio.
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
    // (que pode ser uma var) resolve em runtime.
    style={accentColor ? ({ ...style, ['--cbx-accent']: accentColor } as React.CSSProperties) : style}
    className={cn(
      // Anatomia do LuminAux: canto de 5px, borda NEUTRA quando desmarcado e
      // a cor de destaque só ao marcar. A borda azul no estado vazio deixava
      // toda lista de opções com um enfileirado de contornos competindo com o
      // que de fato está selecionado.
      'peer h-4 w-4 shrink-0 rounded-[5px] border border-border bg-background transition-colors duration-200',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
      'disabled:cursor-not-allowed disabled:opacity-50',
      // accentColor OU primária: só afeta marcado/indeterminate + ring.
      accentColor
        ? 'focus-visible:ring-[var(--cbx-accent)] data-[state=checked]:bg-[var(--cbx-accent)] data-[state=checked]:border-[var(--cbx-accent)] data-[state=checked]:text-white data-[state=indeterminate]:bg-[var(--cbx-accent)] data-[state=indeterminate]:border-[var(--cbx-accent)] data-[state=indeterminate]:text-white'
        : 'focus-visible:ring-ring data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
      <Check className="h-3 w-3" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
