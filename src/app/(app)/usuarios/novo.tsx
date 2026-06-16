// Tela de CRIAR/EDITAR usuário (rota /usuarios/novo).
//
// Sem `id` nos params → modo CRIAÇÃO. Com `id` → modo EDIÇÃO (busca via
// user.getById e preenche o form). Campos do escopo v1 mobile: nome, e-mail,
// senha, telefones/ramal, papel, perfil e ativo. Permissões finas (matriz de
// módulos), RH e documentos ficam no sistema web por enquanto.
//
// Gating: a tela só é alcançável por quem tem o módulo `usuarios` (Drawer +
// backend). Excluir só aparece pra quem tem canDelete; o backend revalida tudo.

import { useEffect, useMemo } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { USER_ROLE_LABELS, USER_PROFILE_LABELS } from '@saas/types'

import { trpc } from '@/lib/trpc'
import { usePermissions } from '@/lib/use-permissions'
import { cn } from '@/lib/cn'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'

const ROLE_KEYS = Object.keys(USER_ROLE_LABELS)
const PROFILE_KEYS = Object.keys(USER_PROFILE_LABELS)

const usuarioFormSchema = z.object({
  name: z.string().min(2, 'Informe o nome (mín. 2 letras)'),
  email: z.string().email('E-mail inválido'),
  password: z.string(),
  telefone: z.string(),
  celular: z.string(),
  ramal: z.string(),
  role: z.string().min(1, 'Escolha o papel'),
  profile: z.string().min(1, 'Escolha o perfil'),
  isActive: z.boolean(),
})

type UsuarioFormValues = z.infer<typeof usuarioFormSchema>

export default function UsuarioNovoScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { podeAcao } = usePermissions()

  const { id } = useLocalSearchParams<{ id?: string }>()
  const isEdicao = !!id

  const usuarioQuery = trpc.user.getById.useQuery({ id: id as string }, { enabled: isEdicao })

  const form = useForm<UsuarioFormValues>({
    resolver: zodResolver(usuarioFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      telefone: '',
      celular: '',
      ramal: '',
      role: 'COLABORADOR_INTERNO',
      profile: 'OPERADOR',
      isActive: true,
    },
  })
  const { reset, control, formState } = form
  const { errors } = formState

  // Edição: preenche o form quando o usuário carrega (senha sempre em branco).
  useEffect(() => {
    const u = usuarioQuery.data
    if (!u) return
    reset({
      name: u.name ?? '',
      email: u.email ?? '',
      password: '',
      telefone: u.telefone ?? '',
      celular: u.celular ?? '',
      ramal: u.ramal ?? '',
      role: u.role ?? 'COLABORADOR_INTERNO',
      profile: u.profile ?? 'OPERADOR',
      isActive: u.isActive ?? true,
    })
  }, [usuarioQuery.data, reset])

  const create = trpc.user.create.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate()
      router.back()
    },
  })
  const update = trpc.user.update.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate()
      if (id) utils.user.getById.invalidate({ id })
      router.back()
    },
  })
  const remover = trpc.user.delete.useMutation({
    onSuccess: () => {
      utils.user.list.invalidate()
      router.back()
    },
  })

  const mutationAtiva = isEdicao ? update : create
  const salvando = mutationAtiva.isPending

  const podeExcluir = isEdicao && podeAcao('usuarios', 'delete') && !usuarioQuery.data?.isMaster

  function onSubmit(values: UsuarioFormValues) {
    const base = {
      name: values.name.trim(),
      email: values.email.trim(),
      telefone: values.telefone.trim() || undefined,
      celular: values.celular.trim() || undefined,
      ramal: values.ramal.trim() || undefined,
      role: values.role,
      profile: values.profile,
      isActive: values.isActive,
    }
    const senha = values.password.trim()

    if (isEdicao && id) {
      // Em edição, só manda a senha se foi preenchida (senão mantém a atual).
      update.mutate({ id, data: { ...base, ...(senha ? { password: senha } : {}) } })
    } else {
      create.mutate({ ...base, ...(senha ? { password: senha } : {}) })
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir usuário', `Excluir "${usuarioQuery.data?.name ?? 'este usuário'}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => id && remover.mutate({ id }) },
    ])
  }

  if (isEdicao && usuarioQuery.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-6">
          <Spinner />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-2xl mx-auto p-4 gap-4">
            {/* Topo */}
            <View className="flex-row items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                accessibilityLabel="Voltar"
                onPress={() => router.back()}
                className="px-2"
              >
                <Text className="text-lg text-foreground">‹</Text>
              </Button>
              <Text className="text-xl font-bold text-foreground">
                {isEdicao ? 'Editar usuário' : 'Novo usuário'}
              </Text>
            </View>

            {/* Nome */}
            <Campo label="Nome" erro={errors.name?.message}>
              <Controller
                control={control}
                name="name"
                render={({ field }) => (
                  <Input value={field.value} onChangeText={field.onChange} placeholder="Nome completo" />
                )}
              />
            </Campo>

            {/* E-mail */}
            <Campo label="E-mail" erro={errors.email?.message}>
              <Controller
                control={control}
                name="email"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder="usuario@empresa.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                )}
              />
            </Campo>

            {/* Senha */}
            <Campo label={isEdicao ? 'Nova senha' : 'Senha inicial'}>
              <Controller
                control={control}
                name="password"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder={isEdicao ? 'Deixe em branco para manter' : 'Mínimo 8 caracteres'}
                    secureTextEntry
                    autoCapitalize="none"
                  />
                )}
              />
            </Campo>

            {/* Telefones */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Campo label="Celular">
                  <Controller
                    control={control}
                    name="celular"
                    render={({ field }) => (
                      <Input
                        value={field.value}
                        onChangeText={field.onChange}
                        placeholder="(00) 00000-0000"
                        keyboardType="phone-pad"
                      />
                    )}
                  />
                </Campo>
              </View>
              <View className="w-28">
                <Campo label="Ramal">
                  <Controller
                    control={control}
                    name="ramal"
                    render={({ field }) => (
                      <Input
                        value={field.value}
                        onChangeText={field.onChange}
                        placeholder="000"
                        keyboardType="numbers-and-punctuation"
                      />
                    )}
                  />
                </Campo>
              </View>
            </View>

            {/* Papel */}
            <Campo label="Papel" erro={errors.role?.message}>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <ChipSelect
                    opcoes={ROLE_KEYS}
                    rotulo={(k) => USER_ROLE_LABELS[k as keyof typeof USER_ROLE_LABELS]}
                    valor={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Campo>

            {/* Perfil */}
            <Campo label="Perfil de acesso" erro={errors.profile?.message}>
              <Controller
                control={control}
                name="profile"
                render={({ field }) => (
                  <ChipSelect
                    opcoes={PROFILE_KEYS}
                    rotulo={(k) => USER_PROFILE_LABELS[k as keyof typeof USER_PROFILE_LABELS]}
                    valor={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Campo>

            {/* Ativo */}
            <View className="flex-row items-center justify-between">
              <Label>Usuário ativo</Label>
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch value={field.value} onValueChange={field.onChange} />
                )}
              />
            </View>

            {/* Erro de mutation */}
            {mutationAtiva.isError ? (
              <Card className="border-red-500/40">
                <CardContent className="p-3">
                  <Text className="text-red-500 text-sm">{mutationAtiva.error?.message}</Text>
                </CardContent>
              </Card>
            ) : null}

            {/* Salvar */}
            <Button loading={salvando} onPress={form.handleSubmit(onSubmit)} className="mt-2">
              Salvar
            </Button>

            {/* Excluir (edição + permissão) */}
            {podeExcluir ? (
              <Button
                variant="destructive"
                loading={remover.isPending}
                onPress={confirmarExclusao}
              >
                Excluir usuário
              </Button>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** Wrapper de campo: label + conteúdo + mensagem de erro. */
function Campo({
  label,
  erro,
  children,
}: {
  label: string
  erro?: string
  children: React.ReactNode
}) {
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      {children}
      {erro ? <Text className="text-red-500 text-sm">{erro}</Text> : null}
    </View>
  )
}

/** Seletor de opção única em chips horizontais. */
function ChipSelect({
  opcoes,
  rotulo,
  valor,
  onChange,
}: {
  opcoes: string[]
  rotulo: (k: string) => string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {opcoes.map((k) => {
        const ativo = valor === k
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
            onPress={() => onChange(k)}
            className={cn(
              'h-9 px-3 items-center justify-center rounded-full border active:opacity-80',
              ativo ? 'bg-primary border-primary' : 'bg-card border-border',
            )}
          >
            <Text
              className={cn(
                'text-sm font-medium',
                ativo ? 'text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {rotulo(k)}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
