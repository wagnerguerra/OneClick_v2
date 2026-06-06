import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

// Tela placeholder — prova que NativeWind (className) + monorepo compilam.
// Será substituída pela Agenda assim que a fundação (auth/tRPC) estiver pronta.
export default function Home() {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center gap-2 p-6">
        <Text className="text-2xl font-bold text-foreground">OneClick ERP</Text>
        <Text className="text-base text-muted-foreground">Agenda — em construção</Text>
      </View>
    </SafeAreaView>
  )
}
