import type { ReactNode } from 'react'
import { Text as RNText, View, type ViewProps } from 'react-native'
import { cn } from '@/lib/cn'

type BadgeVariant = 'default' | 'outline' | 'secondary'

export interface BadgeProps extends Omit<ViewProps, 'children'> {
  variant?: BadgeVariant
  className?: string
  children?: ReactNode
}

const VARIANT_CONTAINER: Record<BadgeVariant, string> = {
  default: 'bg-primary',
  outline: 'border border-border bg-transparent',
  secondary: 'bg-muted',
}

const VARIANT_TEXT: Record<BadgeVariant, string> = {
  default: 'text-primary-foreground',
  outline: 'text-foreground',
  secondary: 'text-muted-foreground',
}

/** Selo/etiqueta compacta com variantes de cor. */
export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <View
      className={cn(
        'flex-row items-center self-start rounded-full px-2.5 py-0.5',
        VARIANT_CONTAINER[variant],
        className,
      )}
      {...props}
    >
      {typeof children === 'string' ? (
        <RNText className={cn('text-xs font-semibold', VARIANT_TEXT[variant])}>
          {children}
        </RNText>
      ) : (
        children
      )}
    </View>
  )
}
