import { useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { Input } from '@/components/ui'
import { authClient } from '@/lib/auth-client'

export default function LoginScreen() {
  const router = useRouter()
  const scheme = useColorScheme()
  const isDark = scheme === 'dark'
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function entrar() {
    if (loading) return
    setErro(null)
    setLoading(true)

    try {
      const { data, error } = await authClient.signIn.email({
        email: email.trim(),
        password: senha,
      })

      if (error) {
        setErro(error.message ?? 'Nao foi possivel entrar.')
        return
      }

      if (
        data &&
        typeof data === 'object' &&
        'twoFactorRedirect' in data &&
        data.twoFactorRedirect
      ) {
        router.push('/2fa')
        return
      }

      router.replace('/dashboard')
    } catch {
      setErro('Falha de conexao. Verifique a rede e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, isDark && styles.safeDark]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <View style={styles.header}>
          <View style={styles.statusSpacer} />
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>OneClick ERP</Text>
            <Text style={styles.headerSubtitle}>Acesse sua rotina em poucos toques</Text>

            <View style={styles.toolbar}>
              <View style={styles.roundAction}>
                <Ionicons name="apps" size={17} color="#3775f6" />
              </View>
              <View style={styles.modulePill}>
                <Text style={styles.moduleText}>Area interna</Text>
                <Ionicons name="chevron-down" size={13} color="#fff" />
              </View>
              <View style={styles.roundAction}>
                <Ionicons name="shield-checkmark" size={17} color="#3775f6" />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.container}>
          <View style={[styles.formCard, isDark && styles.formCardDark]}>
            <View style={styles.formHeader}>
              <Text style={[styles.formTitle, isDark && styles.textDark]}>Entrar</Text>
              <Text style={[styles.formSubtitle, isDark && styles.mutedDark]}>
                Use o mesmo login do sistema web.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isDark && styles.textDark]}>E-mail</Text>
              <Input
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="voce@empresa.com"
                placeholderTextColor={isDark ? '#64748b' : '#a5adbc'}
                style={[styles.input, isDark && styles.inputDark]}
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, isDark && styles.textDark]}>Senha</Text>
              <Input
                autoCapitalize="none"
                onChangeText={setSenha}
                onSubmitEditing={entrar}
                placeholder="********"
                placeholderTextColor={isDark ? '#64748b' : '#a5adbc'}
                returnKeyType="go"
                secureTextEntry
                style={[styles.input, isDark && styles.inputDark]}
                value={senha}
              />
            </View>

            {erro ? <Text style={styles.error}>{erro}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={!email || !senha || loading}
              onPress={entrar}
              style={({ pressed }) => [
                styles.submit,
                (!email || !senha || loading) && styles.submitDisabled,
                pressed && email && senha && !loading && styles.submitPressed,
              ]}
            >
              <Text style={styles.submitText}>{loading ? 'Entrando...' : 'Entrar'}</Text>
            </Pressable>

            <Text style={[styles.forgot, isDark && styles.mutedDark]}>Esqueci minha senha</Text>
          </View>

          <View style={[styles.quickCard, isDark && styles.quickCardDark]}>
            <View style={styles.quickIcon}>
              <Ionicons name="calendar" size={18} color="#3775f6" />
            </View>
            <View style={styles.quickText}>
              <Text style={[styles.quickTitle, isDark && styles.textDark]}>Agenda e tarefas</Text>
              <Text style={[styles.quickSubtitle, isDark && styles.mutedDark]}>
                Dashboard, compromissos e pendencias no Android.
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#ffffff',
    flex: 1,
  },
  safeDark: {
    backgroundColor: '#0f172a',
  },
  keyboard: {
    flex: 1,
  },
  header: {
    backgroundColor: '#20376f',
    minHeight: 238,
    paddingHorizontal: 26,
    paddingTop: 18,
  },
  statusSpacer: {
    height: 18,
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    marginTop: 6,
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
  },
  roundAction: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 24,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  modulePill: {
    alignItems: 'center',
    backgroundColor: '#3775f6',
    borderRadius: 24,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 46,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  moduleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  container: {
    flex: 1,
    gap: 14,
    padding: 24,
    paddingTop: 26,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    elevation: 8,
    gap: 16,
    marginTop: -56,
    padding: 20,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
  },
  formCardDark: {
    backgroundColor: '#1e293b',
    shadowOpacity: 0.28,
  },
  formHeader: {
    gap: 4,
  },
  formTitle: {
    color: '#121826',
    fontSize: 24,
    fontWeight: '900',
  },
  formSubtitle: {
    color: '#7b8494',
    fontSize: 13,
  },
  field: {
    gap: 6,
  },
  label: {
    color: '#121826',
    fontSize: 13,
    fontWeight: '800',
  },
  textDark: {
    color: '#f8fafc',
  },
  mutedDark: {
    color: '#94a3b8',
  },
  input: {
    backgroundColor: '#eaf0fa',
    borderColor: 'transparent',
    borderRadius: 14,
    color: '#121826',
    height: 50,
  },
  inputDark: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: '#3775f6',
    borderRadius: 24,
    height: 50,
    justifyContent: 'center',
    marginTop: 2,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitPressed: {
    opacity: 0.78,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  forgot: {
    color: '#7b8494',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickCard: {
    alignItems: 'center',
    backgroundColor: '#eaf0fa',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  quickCardDark: {
    backgroundColor: '#1e293b',
  },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  quickText: {
    flex: 1,
  },
  quickTitle: {
    color: '#121826',
    fontSize: 14,
    fontWeight: '900',
  },
  quickSubtitle: {
    color: '#7b8494',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
})
