import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'

import { useSession } from '@/lib/auth-client'

// Gate de entrada: enquanto carrega a sessão mostra spinner; depois redireciona
// pro app (logado) ou pro login.
export default function Index() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    )
  }

  return <Redirect href={session ? '/agenda' : '/login'} />
}
