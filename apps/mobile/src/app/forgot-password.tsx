// Tela de recuperação de senha (rota pública /forgot-password).
//
// Espelha o fluxo da web: envia o e-mail via Better Auth (forgetPassword) e, por
// segurança, SEMPRE mostra a tela de sucesso (não revela se o e-mail existe). O
// link do e-mail aponta pra /reset-password (página web) — o usuário redefine a
// senha no navegador e volta a entrar no app.
import { Ionicons } from '@expo/vector-icons'
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
import { BRAND } from '@/lib/theme-colors'

export default function ForgotPassword() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [loading, setLoading] = useState(false)

  async function enviar() {
    if (loading || !email.trim()) return
    setLoading(true)
    try {
      // O generic do expoClient estreita o tipo do authClient e oculta
      // `forgetPassword` (presente em runtime — é o mesmo método do web).
      await (
        authClient as unknown as {
          forgetPassword: (args: { email: string; redirectTo?: string }) => Promise<unknown>
        }
      ).forgetPassword({ email: email.trim(), redirectTo: '/reset-password' })
    } catch {
      // Silencioso de propósito: não revela se o e-mail existe.
    } finally {
      setLoading(false)
      setEnviado(true)
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 top-0 h-72 rounded-b-[40px] bg-primary/10"
        />

        <View className="flex-1 items-center justify-center p-6">
          <View className="w-full max-w-md gap-8">
            <BrandHeader subtitle="Recuperar senha" />

            <Card className="rounded-2xl">
              <CardContent className="gap-4 p-6 pt-6">
                {enviado ? (
                  // Estado de sucesso (sempre exibido após enviar).
                  <View className="items-center gap-3 py-2">
                    <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <Ionicons name="mail-outline" size={26} color={BRAND.primary} />
                    </View>
                    <Text className="text-lg font-bold text-foreground">Verifique seu e-mail</Text>
                    <Text className="text-center text-sm text-muted-foreground">
                      Se {email.trim() ? `o endereço ${email.trim()}` : 'o endereço informado'} estiver
                      cadastrado, você receberá um link para redefinir sua senha.
                    </Text>
                    <Button
                      variant="outline"
                      className="mt-2 w-full"
                      onPress={() => router.replace('/login')}
                    >
                      Voltar ao login
                    </Button>
                  </View>
                ) : (
                  <>
                    <Text className="text-sm text-muted-foreground">
                      Informe seu e-mail e enviaremos um link para redefinir sua senha.
                    </Text>

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
                        onSubmitEditing={enviar}
                        returnKeyType="send"
                        accessibilityLabelledBy="emailLabel"
                        accessibilityLabel="E-mail"
                      />
                    </View>

                    <Button
                      size="lg"
                      className="mt-1"
                      onPress={enviar}
                      loading={loading}
                      disabled={!email.trim()}
                    >
                      Enviar link de recuperação
                    </Button>

                    <Button variant="ghost" onPress={() => router.replace('/login')}>
                      Voltar ao login
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
