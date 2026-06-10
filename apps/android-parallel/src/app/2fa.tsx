import { useRouter } from 'expo-router'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Button, Card, Input, Label, colors } from '@/components/ui'
import { authClient } from '@/lib/auth-client'

export default function TwoFactorScreen() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function verificar() {
    if (loading) return
    setErro(null)
    setLoading(true)

    try {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: codigo.trim(),
      })

      if (error) {
        setErro(error.message ?? 'Codigo invalido.')
        return
      }

      router.replace('/dashboard')
    } catch {
      setErro('Falha de conexao. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Verificacao</Text>
            <Text style={styles.subtitle}>Digite o codigo do app autenticador.</Text>
          </View>

          <Card style={styles.form}>
            <View>
              <Label>Codigo</Label>
              <Input
                keyboardType="number-pad"
                maxLength={6}
                onChangeText={setCodigo}
                onSubmitEditing={verificar}
                placeholder="000000"
                returnKeyType="go"
                style={styles.codeInput}
                value={codigo}
              />
            </View>

            {erro ? <Text style={styles.error}>{erro}</Text> : null}

            <Button
              disabled={codigo.length < 6 || loading}
              loading={loading}
              onPress={verificar}
            >
              Verificar
            </Button>
            <Button variant="ghost" onPress={() => router.replace('/login')}>
              Voltar ao login
            </Button>
          </Card>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 6,
  },
  form: {
    gap: 16,
  },
  codeInput: {
    fontSize: 24,
    letterSpacing: 0,
    textAlign: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 14,
  },
})
