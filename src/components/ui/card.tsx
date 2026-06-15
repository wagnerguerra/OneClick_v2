import {
  Text as RNText,
  View,
  type TextProps as RNTextProps,
  type ViewProps,
} from 'react-native'
import { cn } from '@/lib/cn'

export interface CardProps extends ViewProps {
  className?: string
}

export interface CardTextProps extends RNTextProps {
  className?: string
}

/** Container de cartão com borda e fundo do tema. */
export function Card({ className, ...props }: CardProps) {
  return <View className={cn('rounded-xl border border-border bg-card', className)} {...props} />
}

/** Cabeçalho do cartão. */
export function CardHeader({ className, ...props }: CardProps) {
  return <View className={cn('p-4 gap-1', className)} {...props} />
}

/** Conteúdo do cartão. */
export function CardContent({ className, ...props }: CardProps) {
  return <View className={cn('p-4 pt-0', className)} {...props} />
}

/** Título do cartão. */
export function CardTitle({ className, ...props }: CardTextProps) {
  return (
    <RNText
      className={cn('text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
}

/** Descrição/subtítulo do cartão. */
export function CardDescription({ className, ...props }: CardTextProps) {
  return <RNText className={cn('text-sm text-muted-foreground', className)} {...props} />
}
