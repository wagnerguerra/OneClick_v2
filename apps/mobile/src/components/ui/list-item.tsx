import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { Pressable, Text as RNText, View } from 'react-native'
import { cn } from '@/lib/cn'

export interface ListItemProps {
  /** Ícone Ionicons exibido num chip à esquerda. */
  icon?: keyof typeof Ionicons.glyphMap
  /** Título principal da linha. */
  title: string
  /** Subtítulo opcional (texto secundário). */
  subtitle?: string
  /**
   * Conteúdo à direita: passe uma string para texto simples, um nó próprio,
   * ou omita para exibir o chevron padrão.
   */
  trailing?: ReactNode
  /** Callback de toque — quando ausente, a linha não é pressionável. */
  onPress?: () => void
  className?: string
}

/**
 * Linha de lista no estilo "configurações" — ícone em chip, título/subtítulo
 * e área à direita (texto, nó custom ou chevron). Feedback de toque via opacidade.
 */
export function ListItem({
  icon,
  title,
  subtitle,
  trailing,
  onPress,
  className,
}: ListItemProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={cn(
        'flex-row items-center gap-3 rounded-xl bg-card px-3 py-3',
        'active:opacity-70',
        className,
      )}
    >
      {icon ? (
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Ionicons name={icon} size={20} color="#0ea5e9" />
        </View>
      ) : null}

      {/* Bloco de textos — ocupa o espaço central e trunca se necessário. */}
      <View className="flex-1 gap-0.5">
        <RNText className="text-base font-medium text-foreground" numberOfLines={1}>
          {title}
        </RNText>
        {subtitle ? (
          <RNText className="text-sm text-muted-foreground" numberOfLines={1}>
            {subtitle}
          </RNText>
        ) : null}
      </View>

      {/* Trailing: string vira texto; nó custom passa direto; senão, chevron. */}
      {typeof trailing === 'string' ? (
        <RNText className="text-sm text-muted-foreground">{trailing}</RNText>
      ) : trailing !== undefined ? (
        trailing
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      )}
    </Pressable>
  )
}
