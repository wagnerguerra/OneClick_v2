import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  type PressableProps,
} from 'react-native'
import { cn } from '@/lib/cn'

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'success'
type ButtonSize = 'sm' | 'default' | 'lg'

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  className?: string
  children?: ReactNode
}

const VARIANT_CONTAINER: Record<ButtonVariant, string> = {
  default: 'bg-primary',
  outline: 'border border-border bg-transparent',
  ghost: 'bg-transparent',
  destructive: 'bg-red-600',
  success: 'bg-success',
}

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  default: 'text-primary-foreground',
  outline: 'text-foreground',
  ghost: 'text-foreground',
  destructive: 'text-white',
  success: 'text-success-foreground',
}

const SIZE_CONTAINER: Record<ButtonSize, string> = {
  sm: 'h-9 px-3',
  default: 'h-11 px-4',
  lg: 'h-12 px-6',
}

const SIZE_TEXT: Record<ButtonSize, string> = {
  sm: 'text-sm',
  default: 'text-base',
  lg: 'text-base',
}

const SPINNER_COLOR: Record<ButtonVariant, string> = {
  default: '#ffffff',
  outline: '#64748b',
  ghost: '#64748b',
  destructive: '#ffffff',
  success: '#ffffff',
}

/** Botão primário do app — wrap de Pressable com variantes, tamanhos e estado de loading. */
export function Button({
  variant = 'default',
  size = 'default',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled ?? false, busy: loading }}
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-md',
        SIZE_CONTAINER[size],
        VARIANT_CONTAINER[variant],
        isDisabled && 'opacity-50',
        className,
      )}
      style={({ pressed }) => (pressed && !isDisabled ? { opacity: 0.7 } : undefined)}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color={SPINNER_COLOR[variant]} /> : null}
      {typeof children === 'string' ? (
        <RNText className={cn('font-semibold', SIZE_TEXT[size], VARIANT_TEXT[variant])}>
          {children}
        </RNText>
      ) : (
        children
      )}
    </Pressable>
  )
}
