// Tela de SEGURANÇA / MFA (rota /perfil/seguranca).
//
// Três blocos:
//   1. Alterar senha   → user.changeMyPassword
//   2. MFA (2FA TOTP)  → authClient.twoFactor.enable/verifyTotp/disable
//      (sem lib de QR/SVG no app → exibimos a CHAVE secreta para inserção manual
//       no app autenticador, além do URI otpauth).
//   3. Dispositivos confiáveis → user.listMyTrustedDevices / revoke / revokeAll
import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SectionHeader } from '@/components/ui/section-header'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { authClient } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

// Extrai a chave secreta (base32) de um URI otpauth://totp/...?secret=XXXX
function extrairSecret(uri: string): string | null {
  const m = uri.match(/[?&]secret=([^&]+)/i)
  return m && m[1] ? decodeURIComponent(m[1]) : null
}

// Data/hora curta em pt-BR a partir de string|Date (sem transformer no client).
function fmtData(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type MfaModo = 'idle' | 'ativar-senha' | 'ativar-codigo' | 'desativar'

export default function SegurancaScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()

  const profileQuery = trpc.user.getMyProfile.useQuery()
  const mfaAtivo = (profileQuery.data as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled === true

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Topo: voltar + título. */}
        <View className="flex-row items-center gap-2 px-4 pt-2 pb-1">
          <Button variant="ghost" size="sm" className="px-2" onPress={() => router.back()}>
            <Text className="text-lg text-foreground">‹</Text>
          </Button>
          <Text className="text-xl font-bold text-foreground">Segurança</Text>
        </View>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-2xl mx-auto p-4 gap-6">
            <AlterarSenha />
            <BlocoMFA ativo={mfaAtivo} onMudou={() => utils.user.getMyProfile.invalidate()} />
            <DispositivosConfiaveis />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── Bloco 1: Alterar senha ───────────────────────────────────────────
function AlterarSenha() {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const change = trpc.user.changeMyPassword.useMutation({
    onSuccess: () => {
      setAtual('')
      setNova('')
      setConf('')
      setErro(null)
      Alert.alert('Senha alterada', 'Sua senha foi atualizada com sucesso.')
    },
    onError: (e) => setErro(e.message || 'Não foi possível alterar a senha.'),
  })

  function alterar() {
    setErro(null)
    if (nova.length < 8) {
      setErro('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (nova !== conf) {
      setErro('A confirmação não confere com a nova senha.')
      return
    }
    change.mutate({ currentPassword: atual, newPassword: nova })
  }

  return (
    <View className="gap-3">
      <SectionHeader title="Alterar senha" />
      <View className="gap-1.5">
        <Label>Senha atual</Label>
        <Input value={atual} onChangeText={setAtual} secureTextEntry autoCapitalize="none" placeholder="••••••••" />
      </View>
      <View className="gap-1.5">
        <Label>Nova senha</Label>
        <Input value={nova} onChangeText={setNova} secureTextEntry autoCapitalize="none" placeholder="Mínimo 8 caracteres" />
      </View>
      <View className="gap-1.5">
        <Label>Confirmar nova senha</Label>
        <Input value={conf} onChangeText={setConf} secureTextEntry autoCapitalize="none" placeholder="Repita a nova senha" />
      </View>
      {erro ? <Text className="text-sm text-red-500">{erro}</Text> : null}
      <Button
        loading={change.isPending}
        disabled={!atual || !nova || !conf}
        onPress={alterar}
        className="mt-1"
      >
        Alterar senha
      </Button>
    </View>
  )
}

// ── Bloco 2: MFA (2FA TOTP) ──────────────────────────────────────────
function BlocoMFA({ ativo, onMudou }: { ativo: boolean; onMudou: () => void }) {
  const [modo, setModo] = useState<MfaModo>('idle')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [secret, setSecret] = useState<string | null>(null)
  const [uri, setUri] = useState<string | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function reset() {
    setModo('idle')
    setSenha('')
    setCodigo('')
    setSecret(null)
    setUri(null)
    setBackupCodes([])
    setErro(null)
  }

  // Passo 1 do "ativar": valida senha e gera o segredo/URI + backup codes.
  async function gerarSegredo() {
    if (!senha) {
      setErro('Informe sua senha.')
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const res = await authClient.twoFactor.enable({ password: senha })
      const data = ((res as { data?: unknown }).data ?? res) as {
        totpURI?: string
        backupCodes?: string[]
      }
      if ((res as { error?: unknown }).error || !data.totpURI) {
        throw new Error('Senha incorreta ou falha ao habilitar.')
      }
      setUri(data.totpURI)
      setSecret(extrairSecret(data.totpURI))
      setBackupCodes(data.backupCodes ?? [])
      setModo('ativar-codigo')
    } catch (e) {
      setErro((e as Error).message || 'Falha ao habilitar o MFA.')
    } finally {
      setLoading(false)
    }
  }

  // Passo 2 do "ativar": confirma o código de 6 dígitos do app autenticador.
  async function confirmarCodigo() {
    if (!/^\d{6}$/.test(codigo)) {
      setErro('Informe o código de 6 dígitos do app.')
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const res = await authClient.twoFactor.verifyTotp({ code: codigo })
      if ((res as { error?: unknown }).error) {
        throw new Error('Código inválido. Confira no app autenticador.')
      }
      onMudou()
      reset()
      Alert.alert('MFA ativado', 'Autenticação em dois fatores habilitada com sucesso.')
    } catch (e) {
      setErro((e as Error).message || 'Código inválido.')
    } finally {
      setLoading(false)
    }
  }

  // Desativar: exige a senha.
  async function desativar() {
    if (!senha) {
      setErro('Informe sua senha.')
      return
    }
    setLoading(true)
    setErro(null)
    try {
      const res = await authClient.twoFactor.disable({ password: senha })
      if ((res as { error?: unknown }).error) {
        throw new Error('Senha incorreta.')
      }
      onMudou()
      reset()
      Alert.alert('MFA desativado', 'Autenticação em dois fatores foi desabilitada.')
    } catch (e) {
      setErro((e as Error).message || 'Falha ao desativar o MFA.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="gap-3">
      <SectionHeader
        title="Verificação em duas etapas"
        action={
          <Badge variant={ativo ? 'default' : 'secondary'}>
            <Text className={ativo ? 'text-xs font-semibold text-primary-foreground' : 'text-xs font-semibold text-muted-foreground'}>
              {ativo ? 'Ativado' : 'Desativado'}
            </Text>
          </Badge>
        }
      />

      {/* Estado ocioso: descrição + botão de ativar/desativar. */}
      {modo === 'idle' ? (
        <Card>
          <CardContent className="gap-3 p-4 pt-4">
            <Text className="text-sm text-muted-foreground">
              {ativo
                ? 'O MFA está ativo. A cada login será pedido um código do seu app autenticador.'
                : 'Adicione uma camada extra de segurança exigindo um código do app autenticador no login.'}
            </Text>
            {ativo ? (
              <Button variant="destructive" onPress={() => setModo('desativar')}>
                Desativar MFA
              </Button>
            ) : (
              <Button onPress={() => setModo('ativar-senha')}>Ativar MFA</Button>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Ativar — passo senha. */}
      {modo === 'ativar-senha' ? (
        <Card>
          <CardContent className="gap-3 p-4 pt-4">
            <Label>Confirme sua senha</Label>
            <Input value={senha} onChangeText={setSenha} secureTextEntry autoCapitalize="none" placeholder="••••••••" />
            {erro ? <Text className="text-sm text-red-500">{erro}</Text> : null}
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={reset}>
                Cancelar
              </Button>
              <Button className="flex-1" loading={loading} onPress={gerarSegredo}>
                Continuar
              </Button>
            </View>
          </CardContent>
        </Card>
      ) : null}

      {/* Ativar — passo código (mostra segredo + backup codes). */}
      {modo === 'ativar-codigo' ? (
        <Card>
          <CardContent className="gap-3 p-4 pt-4">
            <Text className="text-sm text-foreground">
              Adicione a chave abaixo no seu app autenticador (Google Authenticator, Authy...) e
              digite o código gerado.
            </Text>

            {secret ? (
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">Chave secreta</Text>
                <View className="rounded-lg bg-muted px-3 py-2">
                  <Text className="text-base font-semibold tracking-widest text-foreground" selectable>
                    {secret}
                  </Text>
                </View>
              </View>
            ) : null}

            {uri ? (
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">URI (otpauth)</Text>
                <Text className="text-xs text-muted-foreground" selectable numberOfLines={2}>
                  {uri}
                </Text>
              </View>
            ) : null}

            {backupCodes.length > 0 ? (
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">
                  Códigos de backup (guarde em local seguro)
                </Text>
                <View className="rounded-lg bg-muted px-3 py-2">
                  <Text className="text-sm tracking-wider text-foreground" selectable>
                    {backupCodes.join('   ')}
                  </Text>
                </View>
              </View>
            ) : null}

            <View className="gap-1.5">
              <Label>Código do app</Label>
              <Input
                value={codigo}
                onChangeText={setCodigo}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="000000"
                className="text-center text-xl tracking-[6px]"
              />
            </View>
            {erro ? <Text className="text-sm text-red-500">{erro}</Text> : null}
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={reset}>
                Cancelar
              </Button>
              <Button className="flex-1" loading={loading} disabled={codigo.length < 6} onPress={confirmarCodigo}>
                Confirmar
              </Button>
            </View>
          </CardContent>
        </Card>
      ) : null}

      {/* Desativar — pede a senha. */}
      {modo === 'desativar' ? (
        <Card>
          <CardContent className="gap-3 p-4 pt-4">
            <Label>Confirme sua senha para desativar</Label>
            <Input value={senha} onChangeText={setSenha} secureTextEntry autoCapitalize="none" placeholder="••••••••" />
            {erro ? <Text className="text-sm text-red-500">{erro}</Text> : null}
            <View className="flex-row gap-2">
              <Button variant="outline" className="flex-1" onPress={reset}>
                Cancelar
              </Button>
              <Button variant="destructive" className="flex-1" loading={loading} onPress={desativar}>
                Desativar
              </Button>
            </View>
          </CardContent>
        </Card>
      ) : null}
    </View>
  )
}

// ── Bloco 3: Dispositivos confiáveis ─────────────────────────────────
function DispositivosConfiaveis() {
  const utils = trpc.useUtils()
  const query = trpc.user.listMyTrustedDevices.useQuery()

  const revoke = trpc.user.revokeMyTrustedDevice.useMutation({
    onSuccess: () => utils.user.listMyTrustedDevices.invalidate(),
  })
  const revokeAll = trpc.user.revokeAllMyTrustedDevices.useMutation({
    onSuccess: () => utils.user.listMyTrustedDevices.invalidate(),
  })

  const devices = (query.data ?? []) as Array<{
    id: string
    label: string | null
    userAgent: string | null
    lastUsedAt: string | Date | null
    expiresAt: string | Date | null
  }>

  function confirmarRevogarTodos() {
    Alert.alert('Revogar todos', 'Remover todos os dispositivos confiáveis? O MFA será pedido novamente neles.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Revogar', style: 'destructive', onPress: () => revokeAll.mutate() },
    ])
  }

  return (
    <View className="gap-3">
      <SectionHeader
        title="Dispositivos confiáveis"
        action={
          devices.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={confirmarRevogarTodos} className="active:opacity-70">
              <Text className="text-xs font-semibold text-red-500">Revogar todos</Text>
            </Pressable>
          ) : null
        }
      />

      {query.isPending ? (
        <View className="items-center justify-center py-6">
          <Spinner />
        </View>
      ) : query.isError ? (
        <Text className="text-sm text-muted-foreground">Não foi possível carregar os dispositivos.</Text>
      ) : devices.length === 0 ? (
        <Text className="text-sm text-muted-foreground">Nenhum dispositivo confiável.</Text>
      ) : (
        <View className="gap-2">
          {devices.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex-row items-center gap-3 p-3">
                <View className="flex-1 gap-0.5">
                  <Text className="font-medium text-foreground" numberOfLines={1}>
                    {d.label || d.userAgent || 'Dispositivo'}
                  </Text>
                  <Text className="text-xs text-muted-foreground">
                    {`Último uso: ${fmtData(d.lastUsedAt)} · Expira: ${fmtData(d.expiresAt)}`}
                  </Text>
                </View>
                <Button
                  variant="outline"
                  size="sm"
                  loading={revoke.isPending && revoke.variables?.id === d.id}
                  onPress={() => revoke.mutate({ id: d.id })}
                >
                  Revogar
                </Button>
              </CardContent>
            </Card>
          ))}
        </View>
      )}
    </View>
  )
}
