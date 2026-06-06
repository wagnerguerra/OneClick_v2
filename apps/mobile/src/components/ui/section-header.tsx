import type { ReactNode } from 'react'
import { Text as RNText, View } from 'react-native'
import { cn } from '@/lib/cn'

export interface SectionHeaderProps {
  /** Título da seção (renderizado em caixa-alta com tracking). */
  title: string
  /** Ação opcional alinhada à direita (ex.: link "ver tudo"). */
  action?: ReactNode
  className?: string
}

/**
 * Cabeçalho de seção — rótulo discreto em caixa-alta acompanhado de uma linha
 * divisória que preenche o espaço restante. Usado para agrupar blocos numa
 * tela rolável (estilo Material 3).
 */
export function SectionHeader({ title, action, className }: SectionHeaderProps) {
  return (
    <View className={cn('flex-row items-center gap-3', className)}>
      <RNText className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </RNText>
      {/* Linha sutil que ocupa o espaço entre o título e a ação. */}
      <View className="h-px flex-1 bg-border" />
      {action ? <View className="shrink-0">{action}</View> : null}
    </View>
  )
}
