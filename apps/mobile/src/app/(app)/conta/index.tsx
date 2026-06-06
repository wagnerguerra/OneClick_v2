import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import { authClient, useSession } from '@/lib/auth-client'

// Tela de Conta: dados do usuário logado + sair.
export default function Conta() {
  const router = useRouter()
  const { data: session } = useSession()
  const [saindo, setSaindo] = useState(false)

  const user = session?.user

  async function sair() {
    if (saindo) return
    setSaindo(true)
    try {
      await authClient.signOut()
    } catch {
      /* mesmo se falhar no server, segue pro login (cookie local é limpo) */
    } finally {
      router.replace('/login')
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-2xl mx-auto flex-1 p-4 gap-4">
        <View className="pt-2">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">Conta</Text>
          <Text className="text-xl sm:text-2xl font-bold text-foreground">Minha conta</Text>
        </View>

        <Card>
          <CardContent className="p-4 gap-1">
            <Text className="text-base font-semibold text-foreground">
              {user?.name ?? 'Usuário'}
            </Text>
            <Text className="text-sm text-muted-foreground">{user?.email ?? ''}</Text>
          </CardContent>
        </Card>

        <Button variant="destructive" onPress={sair} loading={saindo}>
          Sair
        </Button>
      </View>
    </SafeAreaView>
  )
}
