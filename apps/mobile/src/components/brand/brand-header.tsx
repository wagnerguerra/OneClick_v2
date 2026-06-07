import { Image } from 'expo-image'
import { View } from 'react-native'

import { Text } from '@/components/ui/text'

export interface BrandHeaderProps {
  /** Subtítulo opcional exibido abaixo do nome da marca. */
  subtitle?: string
}

// Bloco de marca do OneClick ERP — logo em quadrado arredondado + nome + subtítulo.
// Centralizado, com respiro generoso entre os elementos.
export function BrandHeader({ subtitle }: BrandHeaderProps) {
  return (
    <View className="items-center gap-3">
      {/* "Logo" do app: ícone num quadrado arredondado com leve sombra/realce. */}
      <View
        className="h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
        // Sombra sutil multiplataforma (iOS via shadow*, Android via elevation).
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <Image
          source={require('../../../assets/images/oneclick-mark.png')}
          // Marca OneClick (logo-sm). Mantém a proporção dentro do quadrado.
          style={{ width: 64, height: 64 }}
          contentFit="contain"
          accessibilityLabel="Logo do OneClick ERP"
        />
      </View>

      {/* Nome da marca + subtítulo opcional. */}
      <View className="items-center gap-1">
        <Text className="text-2xl font-bold text-foreground">OneClick ERP</Text>
        {subtitle ? (
          <Text className="text-center text-sm text-muted-foreground">{subtitle}</Text>
        ) : null}
      </View>
    </View>
  )
}
