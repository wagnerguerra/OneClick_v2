import { Ionicons } from '@expo/vector-icons'
import { Text as RNText, View } from 'react-native'
import { cn } from '@/lib/cn'
import { BRAND } from '@/lib/theme-colors'

export interface StatCardProps {
  /** Rótulo do indicador (ex.: "Eventos hoje"). */
  label: string
  /** Valor principal já formatado (ex.: "8", "R$ 12.345,67"). */
  value: string
  /** Variação opcional vs. período anterior. */
  delta?: { value: string; up: boolean }
  /** Ícone Ionicons exibido num chip arredondado. */
  icon?: keyof typeof Ionicons.glyphMap
  className?: string
}

/**
 * Cartão de KPI — superfície elevada com ícone em chip, valor grande em
 * números tabulares e variação semântica (verde/vermelho) com seta.
 */
export function StatCard({ label, value, delta, icon, className }: StatCardProps) {
  return (
    <View
      className={cn(
        'gap-3 rounded-2xl border border-border bg-elevated p-4',
        className,
      )}
    >
      {/* Linha do topo: ícone em chip + delta alinhado à direita. */}
      <View className="flex-row items-center justify-between">
        {icon ? (
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Ionicons name={icon} size={20} color={BRAND.primary} />
          </View>
        ) : (
          <View />
        )}

        {delta ? (
          <View
            className={cn(
              'flex-row items-center gap-0.5 rounded-full px-2 py-0.5',
              delta.up ? 'bg-success/10' : 'bg-destructive/10',
            )}
          >
            <Ionicons
              name={delta.up ? 'arrow-up' : 'arrow-down'}
              size={12}
              color={delta.up ? BRAND.success : BRAND.destructive}
            />
            <RNText
              className={cn(
                'text-xs font-semibold',
                delta.up ? 'text-success' : 'text-destructive',
              )}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {delta.value}
            </RNText>
          </View>
        ) : null}
      </View>

      {/* Valor + rótulo. */}
      <View className="gap-0.5">
        <RNText
          className="text-2xl font-bold text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {value}
        </RNText>
        <RNText className="text-sm text-muted-foreground">{label}</RNText>
      </View>
    </View>
  )
}
