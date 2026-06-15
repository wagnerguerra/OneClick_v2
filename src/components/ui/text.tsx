import { Text as RNText, type TextProps as RNTextProps } from 'react-native'
import { cn } from '@/lib/cn'

export interface TextProps extends RNTextProps {
  className?: string
}

/** Texto base do app — herda os tokens semânticos de tema. */
export function Text({ className, ...props }: TextProps) {
  return <RNText className={cn('text-foreground text-base', className)} {...props} />
}
