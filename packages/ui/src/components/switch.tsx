import * as React from 'react'
import { cn } from '../lib/utils'

/**
 * Switch (toggle) com a API do shadcn/Radix (`checked` / `onCheckedChange`),
 * porém self-contained — sem dependência de @radix-ui/react-switch (que não
 * está instalado no monorepo). Suporta uso controlado e não-controlado.
 */
interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
  name?: string
  title?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, defaultChecked, onCheckedChange, disabled, className, ...props }, ref) => {
    const isControlled = checked !== undefined
    const [internal, setInternal] = React.useState(!!defaultChecked)
    const value = isControlled ? !!checked : internal

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (!isControlled) setInternal(v => !v)
          onCheckedChange?.(!value)
        }}
        className={cn(
          // Espelha o toggle de /usuarios (aba Permissões), eleito o melhor: sem
          // border-2 (que desalinhava o thumb), off theme-aware, thumb branco.
          // Padding do thumb via px-0.5 + items-center (mais robusto que mt-0.5).
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          value ? 'bg-primary' : 'bg-muted-foreground/25',
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform',
            value ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
    )
  },
)
Switch.displayName = 'Switch'

export { Switch }
