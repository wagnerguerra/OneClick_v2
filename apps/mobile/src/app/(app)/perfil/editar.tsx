// Tela de EDITAR PERFIL (rota /perfil/editar).
//
// Prefill via user.getMyProfile e gravação via user.updateMyProfile (whitelist no
// backend — só campos do próprio usuário). Foco nos campos que fazem sentido no
// celular: identidade, contato, endereço e redes. Avatar/MFA ficam de fora (sem
// image-picker instalado; segurança tem tela própria).
import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SectionHeader } from '@/components/ui/section-header'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { trpc } from '@/lib/trpc'

// Configuração dos campos do formulário — dirige a renderização e o payload.
type CampoCfg = {
  key: string
  label: string
  placeholder?: string
  keyboardType?: 'default' | 'email-address' | 'phone-pad' | 'url' | 'numeric'
  autoCapitalize?: 'none' | 'sentences' | 'words'
  multiline?: boolean
}

const SECOES: ReadonlyArray<{ titulo: string; campos: ReadonlyArray<CampoCfg> }> = [
  {
    titulo: 'Identidade',
    campos: [
      { key: 'name', label: 'Nome', placeholder: 'Seu nome completo', autoCapitalize: 'words' },
      { key: 'bio', label: 'Bio', placeholder: 'Uma breve descrição sobre você', multiline: true },
    ],
  },
  {
    titulo: 'Contato',
    campos: [
      { key: 'telefone', label: 'Telefone', placeholder: '(00) 0000-0000', keyboardType: 'phone-pad' },
      { key: 'celular', label: 'Celular', placeholder: '(00) 00000-0000', keyboardType: 'phone-pad' },
      { key: 'whatsapp', label: 'WhatsApp', placeholder: '(00) 00000-0000', keyboardType: 'phone-pad' },
      { key: 'ramal', label: 'Ramal', placeholder: 'Ex.: 201', keyboardType: 'numeric' },
    ],
  },
  {
    titulo: 'Endereço',
    campos: [
      { key: 'cep', label: 'CEP', placeholder: '00000-000', keyboardType: 'numeric' },
      { key: 'logradouro', label: 'Logradouro', placeholder: 'Rua / Avenida', autoCapitalize: 'words' },
      { key: 'numero', label: 'Número', placeholder: 'Nº' },
      { key: 'complemento', label: 'Complemento', placeholder: 'Apto, sala...' },
      { key: 'bairro', label: 'Bairro', autoCapitalize: 'words' },
      { key: 'cidade', label: 'Cidade', autoCapitalize: 'words' },
      { key: 'uf', label: 'UF', placeholder: 'ES', autoCapitalize: 'words' },
      { key: 'pais', label: 'País', placeholder: 'Brasil', autoCapitalize: 'words' },
    ],
  },
  {
    titulo: 'Redes',
    campos: [
      { key: 'siteUrl', label: 'Site', placeholder: 'https://...', keyboardType: 'url', autoCapitalize: 'none' },
      { key: 'linkedinUrl', label: 'LinkedIn', keyboardType: 'url', autoCapitalize: 'none' },
      { key: 'githubUrl', label: 'GitHub', keyboardType: 'url', autoCapitalize: 'none' },
      { key: 'instagramUrl', label: 'Instagram', autoCapitalize: 'none' },
      { key: 'facebookUrl', label: 'Facebook', keyboardType: 'url', autoCapitalize: 'none' },
    ],
  },
]

// Todas as chaves editáveis (pra inicializar o estado e montar o payload).
const TODAS_CHAVES = SECOES.flatMap((s) => s.campos.map((c) => c.key))

export default function EditarPerfilScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()

  const profileQuery = trpc.user.getMyProfile.useQuery()

  // Estado controlado do formulário (string por campo). Inicializa quando o
  // perfil carrega — `null` enquanto não inicializado.
  const [valores, setValores] = useState<Record<string, string> | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (profileQuery.data && valores === null) {
      const d = profileQuery.data as Record<string, unknown>
      const init: Record<string, string> = {}
      for (const k of TODAS_CHAVES) init[k] = d[k] == null ? '' : String(d[k])
      setValores(init)
    }
  }, [profileQuery.data, valores])

  const update = trpc.user.updateMyProfile.useMutation({
    onSuccess: () => {
      void utils.user.getMyProfile.invalidate()
      router.back()
    },
    onError: (e) => setErro(e.message || 'Não foi possível salvar.'),
  })

  function set(key: string, v: string) {
    setValores((prev) => (prev ? { ...prev, [key]: v } : prev))
  }

  // '' → null (limpa o campo); senão, valor aparado.
  function orNull(v: string | undefined): string | null {
    const t = (v ?? '').trim()
    return t.length ? t : null
  }

  function salvar() {
    if (!valores) return
    setErro(null)
    const name = (valores.name ?? '').trim()
    if (name.length < 2) {
      setErro('Informe um nome com ao menos 2 caracteres.')
      return
    }
    update.mutate({
      name,
      bio: orNull(valores.bio),
      telefone: orNull(valores.telefone),
      celular: orNull(valores.celular),
      whatsapp: orNull(valores.whatsapp),
      ramal: orNull(valores.ramal),
      cep: orNull(valores.cep),
      logradouro: orNull(valores.logradouro),
      numero: orNull(valores.numero),
      complemento: orNull(valores.complemento),
      bairro: orNull(valores.bairro),
      cidade: orNull(valores.cidade),
      uf: orNull(valores.uf),
      pais: orNull(valores.pais),
      siteUrl: orNull(valores.siteUrl),
      linkedinUrl: orNull(valores.linkedinUrl),
      githubUrl: orNull(valores.githubUrl),
      instagramUrl: orNull(valores.instagramUrl),
      facebookUrl: orNull(valores.facebookUrl),
    })
  }

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
          <Text className="text-xl font-bold text-foreground">Editar perfil</Text>
        </View>

        {profileQuery.isPending || valores === null ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : profileQuery.isError ? (
          <View className="flex-1 items-center justify-center gap-3 px-6">
            <Text className="text-center text-muted-foreground">
              Não foi possível carregar seu perfil.
            </Text>
            <Button variant="outline" size="sm" onPress={() => profileQuery.refetch()}>
              Tentar novamente
            </Button>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="w-full max-w-2xl mx-auto p-4 gap-5">
              {SECOES.map((secao) => (
                <View key={secao.titulo} className="gap-3">
                  <SectionHeader title={secao.titulo} />
                  {secao.campos.map((campo) => (
                    <View key={campo.key} className="gap-1.5">
                      <Label>{campo.label}</Label>
                      <Input
                        value={valores[campo.key] ?? ''}
                        onChangeText={(v) => set(campo.key, v)}
                        placeholder={campo.placeholder}
                        keyboardType={campo.keyboardType ?? 'default'}
                        autoCapitalize={campo.autoCapitalize ?? 'sentences'}
                        multiline={campo.multiline}
                        className={campo.multiline ? 'h-24 py-2' : undefined}
                        style={campo.multiline ? { textAlignVertical: 'top' } : undefined}
                      />
                    </View>
                  ))}
                </View>
              ))}

              {erro ? (
                <Card className="border-red-500/40">
                  <CardContent className="p-3 pt-3">
                    <Text className="text-sm text-red-500">{erro}</Text>
                  </CardContent>
                </Card>
              ) : null}

              <Button loading={update.isPending} onPress={salvar} className="mt-1">
                Salvar
              </Button>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
