import { Switch, Text as RNText, View } from 'react-native'
import { cn } from '@/lib/cn'
import { BRAND } from '@/lib/theme-colors'

export interface SwitchRowProps {
  /** Rótulo principal da opção. */
  label: string
  /** Descrição opcional abaixo do rótulo. */
  description?: string
  /** Estado atual do switch. */
  value: boolean
  /** Callback ao alternar. */
  onValueChange: (value: boolean) => void
  className?: string
}

/**
 * Linha com label/descrição e um Switch nativo à direita. As cores do trilho
 * usam o sky da marca via hex (o Switch do RN não aceita className).
 */
export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  className,
}: SwitchRowProps) {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between gap-3 rounded-xl bg-card px-3 py-3',
        className,
      )}
    >
      <View className="flex-1 gap-0.5">
        <RNText className="text-base font-medium text-foreground">{label}</RNText>
        {description ? (
          <RNText className="text-sm text-muted-foreground">{description}</RNText>
        ) : null}
      </View>

      {/* Trilho azul da marca (ligado) e cinza (desligado). */}
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: BRAND.switchTrackOff, true: BRAND.primary }}
        thumbColor={value ? BRAND.primaryDark : BRAND.switchThumbOff}
        ios_backgroundColor={BRAND.switchTrackOff}
      />
    </View>
  )
}
