import { Text as RNText, type TextProps as RNTextProps } from 'react-native'
import { cn } from '@/lib/cn'

export interface LabelProps extends RNTextProps {
  className?: string
}

/** Rótulo de campo de formulário. */
export function Label({ className, ...props }: LabelProps) {
  return (
    <RNText
      className={cn('text-[13px] font-semibold text-foreground', className)}
      {...props}
    />
  )
}
