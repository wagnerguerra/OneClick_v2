// Tela de lista do módulo USUÁRIOS (rota /usuarios).
//
// Só é acessível por quem tem permissão no módulo `usuarios` (o item do Drawer
// é filtrado por podeVer('usuarios') e o backend valida de novo em user.list).
// Lista paginada (mesma query da web: user.list) com busca por nome/e-mail,
// avatar, papel, e badges de master/inativo. Toque abre o cadastro/edição;
// FAB "+" cria um novo usuário.

import { useState } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { USER_ROLE_LABELS, type UserRole } from '@saas/types'

import { AppScreen } from '@/components/navigation/app-screen'
import { MenuButton } from '@/components/navigation/menu-button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'
import { resolveAssetUrl } from '@/lib/api-url'

// Shape mínimo do usuário que a lista consome (de user.list). Não inferimos do
// tRPC pra evitar acoplamento de tipos profundos (TS2589) ao mapear.
type UsuarioResumo = {
  id: string
  name: string | null
  email: string | null
  role: string | null
  isMaster: boolean
  isActive: boolean
  image?: string | null
  area?: { id: string; name: string } | null
}

/** Iniciais (até 2 letras) — fallback do avatar. */
function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}

function papelLabel(role: string | null): string {
  if (!role) return 'Colaborador'
  return USER_ROLE_LABELS[role as UserRole] ?? role
}

export default function UsuariosScreen() {
  const router = useRouter()

  const [busca, setBusca] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)

  const query = trpc.user.list.useQuery({
    page: 1,
    limit: 100,
    search: busca.trim() || undefined,
    incluirInativos,
  })
  const { isPending, isError, refetch } = query

  const pagina = query.data as { data: UsuarioResumo[]; total: number } | undefined
  const usuarios = pagina?.data ?? []
  const total = pagina?.total ?? 0

  return (
    <AppScreen>
      <View className="w-full max-w-2xl mx-auto flex-1">
        {/* Header */}
        <View className="flex-row items-center gap-2 px-4 pt-2 pb-3">
          <MenuButton />
          <View className="flex-1 pl-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Cadastros</Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Usuários</Text>
          </View>
          {!isPending && !isError ? (
            <Text className="text-xs text-muted-foreground">
              {total} {total === 1 ? 'usuário' : 'usuários'}
            </Text>
          ) : null}
        </View>

        {/* Busca + filtro de inativos */}
        <View className="px-4 pb-3 gap-2 border-b border-border">
          <Input
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar por nome ou e-mail…"
            autoCapitalize="none"
          />
          <View className="flex-row">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: incluirInativos }}
              onPress={() => setIncluirInativos((v) => !v)}
              className={cn(
                'h-8 px-3 items-center justify-center rounded-full border active:opacity-80',
                incluirInativos ? 'bg-primary border-primary' : 'bg-card border-border',
              )}
            >
              <Text
                className={cn(
                  'text-xs font-medium',
                  incluirInativos ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                Incluir inativos
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Corpo */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Text className="text-center text-muted-foreground">
              Não foi possível carregar os usuários.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="h-9 px-4 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-foreground font-medium">Tentar novamente</Text>
            </Pressable>
          </View>
        ) : usuarios.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-muted-foreground">Nenhum usuário encontrado</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {usuarios.map((u) => (
              <UsuarioCard
                key={u.id}
                usuario={u}
                onPress={() => router.push({ pathname: '/usuarios/novo', params: { id: u.id } })}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* FAB: novo usuário */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo usuário"
        onPress={() => router.push('/usuarios/novo')}
        className="absolute bottom-4 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
      >
        <Text className="text-3xl leading-none text-primary-foreground">+</Text>
      </Pressable>
    </AppScreen>
  )
}

/** Card de um usuário: avatar + nome + e-mail + papel, com badges de master/inativo. */
function UsuarioCard({ usuario, onPress }: { usuario: UsuarioResumo; onPress: () => void }) {
  const avatar = resolveAssetUrl(usuario.image)
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">
      <Card>
        <CardContent className="p-3 flex-row items-center gap-3">
          {avatar ? (
            <Image source={{ uri: avatar }} className="h-11 w-11 rounded-full bg-muted" />
          ) : (
            <View className="h-11 w-11 items-center justify-center rounded-full bg-primary">
              <Text className="text-sm font-bold text-primary-foreground">
                {iniciais(usuario.name)}
              </Text>
            </View>
          )}

          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-foreground font-semibold" numberOfLines={1}>
                {usuario.name || 'Sem nome'}
              </Text>
              {usuario.isMaster ? (
                <View className="rounded-full bg-amber-500/15 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-amber-600">MASTER</Text>
                </View>
              ) : null}
              {!usuario.isActive ? (
                <View className="rounded-full bg-muted px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-muted-foreground">INATIVO</Text>
                </View>
              ) : null}
            </View>
            {usuario.email ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {usuario.email}
              </Text>
            ) : null}
            <Text className="text-[11px] text-muted-foreground" numberOfLines={1}>
              {papelLabel(usuario.role)}
              {usuario.area?.name ? ` · ${usuario.area.name}` : ''}
            </Text>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
}
