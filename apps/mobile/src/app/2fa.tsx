import { useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BrandHeader } from '@/components/brand/brand-header'
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
      router.replace('/dashboard')
    } catch {
      setErro('Falha de conexão. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        {/* Realce sutil no topo, atrás da marca — mesma identidade da tela de login. */}
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 top-0 h-72 rounded-b-[40px] bg-primary/10"
        />

        <View className="flex-1 items-center justify-center p-6">
          <View className="w-full max-w-md gap-8">
            {/* Cabeçalho de marca */}
            <BrandHeader subtitle="Verificação em duas etapas" />

            {/* Card central com o input do código de 6 dígitos */}
            <Card className="rounded-2xl">
              <CardContent className="gap-4 p-6 pt-6">
                <View className="gap-1.5">
                  <Label nativeID="codigoLabel">Código</Label>
                  <Input
                    value={codigo}
                    onChangeText={setCodigo}
                    placeholder="000000"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={6}
                    onSubmitEditing={verificar}
                    returnKeyType="go"
                    // Dígitos grandes e espaçados para leitura do código do autenticador.
                    className="text-center text-2xl tracking-[8px]"
                    accessibilityLabelledBy="codigoLabel"
                    accessibilityLabel="Código de verificação"
                  />
                  <Text className="text-center text-xs text-muted-foreground">
                    Digite o código do seu app autenticador
                  </Text>
                </View>

                {/* Mensagem de erro com token semântico */}
                {erro ? <Text className="text-sm text-destructive">{erro}</Text> : null}

                <Button
                  size="lg"
                  className="mt-1"
                  onPress={verificar}
                  loading={loading}
                  disabled={codigo.length < 6}
                >
                  Verificar
                </Button>
                <Button variant="ghost" onPress={() => router.replace('/login')}>
                  Voltar ao login
                </Button>
              </CardContent>
            </Card>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
