import { useRouter } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Text } from '@/components/ui/text'
import { authClient } from '@/lib/auth-client'

// Verificação MFA (TOTP). Chamada após o login detectar twoFactorRedirect.
export default function TwoFactor() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function verificar() {
    if (loading) return
    setErro(null)
    setLoading(true)
    try {
      const { error } = await authClient.twoFactor.verifyTotp({ code: codigo.trim() })
      if (error) {
        setErro(error.message ?? 'Código inválido.')
        return
      }
      router.replace('/agenda')
    } catch {
      setErro('Falha de conexão. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 items-center justify-center p-6">
        <View className="w-full max-w-md gap-6">
          <View className="items-center gap-1">
            <Text className="text-2xl font-bold text-foreground">Verificação em duas etapas</Text>
            <Text className="text-center text-sm text-muted-foreground">
              Digite o código do seu app autenticador
            </Text>
          </View>

          <Card>
            <CardContent className="gap-4 p-5">
              <View className="gap-1.5">
                <Label>Código</Label>
                <Input
                  value={codigo}
                  onChangeText={setCodigo}
                  placeholder="000000"
                  keyboardType="number-pad"
                  inputMode="numeric"
                  maxLength={6}
                  onSubmitEditing={verificar}
                  returnKeyType="go"
                />
              </View>

              {erro ? <Text className="text-sm text-red-500">{erro}</Text> : null}

              <Button onPress={verificar} loading={loading} disabled={codigo.length < 6}>
                Verificar
              </Button>
              <Button variant="ghost" onPress={() => router.replace('/login')}>
                Voltar ao login
              </Button>
            </CardContent>
          </Card>
        </View>
      </View>
    </SafeAreaView>
  )
}
