import { useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BrandHeader } from '@/components/brand/brand-header'
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
      // Hidrata a sessão no store reativo ANTES de navegar. Sem isso, o guard do
      // (app)/_layout lê a sessão ainda nula (o store não atualiza no mesmo tick
      // do signIn) e rebota pro /login — só a 2ª tentativa entrava. Falha aqui
      // não bloqueia: o próprio guard refaz o fetch.
      try {
        await authClient.getSession()
      } catch {
        // segue — o guard refaz o fetch da sessão
      }
      router.replace('/dashboard')
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
        {/* Realce sutil no topo, atrás da marca — gradiente "fake" via token bg-primary com baixa opacidade. */}
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 top-0 h-72 rounded-b-[40px] bg-primary/10"
        />

        <View className="flex-1 items-center justify-center p-6">
          <View className="w-full max-w-md gap-8">
            {/* Cabeçalho de marca */}
            <BrandHeader subtitle="Entre na sua conta" />

            {/* Card central com os campos de autenticação */}
            <Card className="rounded-2xl">
              <CardContent className="gap-4 p-6 pt-6">
                <View className="gap-1.5">
                  <Label nativeID="emailLabel">E-mail</Label>
                  <Input
                    value={email}
                    onChangeText={setEmail}
                    placeholder="voce@empresa.com"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    inputMode="email"
                    accessibilityLabelledBy="emailLabel"
                    accessibilityLabel="E-mail"
                  />
                </View>

                <View className="gap-1.5">
                  <Label nativeID="senhaLabel">Senha</Label>
                  <Input
                    value={senha}
                    onChangeText={setSenha}
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    onSubmitEditing={entrar}
                    returnKeyType="go"
                    accessibilityLabelledBy="senhaLabel"
                    accessibilityLabel="Senha"
                  />
                </View>

                {/* Mensagem de erro com token semântico */}
                {erro ? <Text className="text-sm text-destructive">{erro}</Text> : null}

                <Button
                  size="lg"
                  className="mt-1"
                  onPress={entrar}
                  loading={loading}
                  disabled={!email || !senha}
                >
                  Entrar
                </Button>

                {/* Link para a recuperação de senha. */}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/forgot-password' as never)}
                  className="mt-1 self-center active:opacity-70"
                >
                  <Text className="text-center text-xs font-medium text-primary">
                    Esqueci minha senha
                  </Text>
                </Pressable>
              </CardContent>
            </Card>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
