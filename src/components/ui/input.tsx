import { TextInput, type TextInputProps } from 'react-native'
import { cn } from '@/lib/cn'

export interface InputProps extends TextInputProps {
  className?: string
}

/** Campo de texto base — wrap de TextInput com tokens de tema. */
export function Input({ className, placeholderTextColor, ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColor={placeholderTextColor ?? '#94a3b8'}
      className={cn(
        'h-11 rounded-md border border-border bg-card px-3 text-base text-foreground',
        className,
      )}
      {...props}
    />
  )
}
