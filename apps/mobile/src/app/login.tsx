import { useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Text } from '@/components/ui/text'
import { authClient } from '@/lib/auth-client'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function entrar() {
    if (loading) return
    setErro(null)
    setLoading(true)
    try {
      const { data, error } = await authClient.signIn.email({ email: email.trim(), password: senha })
      if (error) {
        setErro(error.message ?? 'Não foi possível entrar.')
        return
      }
      // MFA habilitado → Better Auth devolve twoFactorRedirect e não cria sessão.
      if (data && typeof data === 'object' && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
        router.push('/2fa')
        return
      }
      router.replace('/agenda')
    } catch {
      setErro('Falha de conexão. Verifique a rede e tente de novo.')
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
        <View className="flex-1 items-center justify-center p-6">
          <View className="w-full max-w-md gap-6">
            <View className="items-center gap-1">
              <Text className="text-2xl font-bold text-foreground">OneClick ERP</Text>
              <Text className="text-sm text-muted-foreground">Entre na sua conta</Text>
            </View>

            <Card>
              <CardContent className="gap-4 p-5">
                <View className="gap-1.5">
                  <Label>E-mail</Label>
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    placeholder="voce@empresa.com"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    inputMode="email"
                  />
                </View>

                <View className="gap-1.5">
                  <Label>Senha</Label>
                  <Input
                    value={senha}
                    onChangeText={setSenha}
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    onSubmitEditing={entrar}
                    returnKeyType="go"
                  />
                </View>

                {erro ? <Text className="text-sm text-red-500">{erro}</Text> : null}

                <Button onPress={entrar} loading={loading} disabled={!email || !senha}>
                  Entrar
                </Button>
              </CardContent>
            </Card>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
