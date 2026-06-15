// Tela de Perfil do usuário (rota /perfil) — substitui a antiga aba "Conta".
//
// Reúne identidade do usuário (avatar, nome, e-mail, papel), empresa vinculada,
// preferências (placeholders visuais por enquanto) e ações de conta + logout.
// Aplica o Design System (componentes em @/components/ui/*) e tokens semânticos
// de tema (sem hex hardcoded, exceto cores de ícone/Image que o RN exige).

import { useState } from 'react'
import { Image, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { AppScreen } from '@/components/navigation/app-screen'
import { MenuButton } from '@/components/navigation/menu-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ListItem } from '@/components/ui/list-item'
import { SectionHeader } from '@/components/ui/section-header'
import { Text } from '@/components/ui/text'
import { resolveAssetUrl } from '@/lib/api-url'
import { authClient, useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

// Rótulos amigáveis pros papéis (role) do Better Auth (additionalField).
const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  USER: 'Usuário',
  COLABORADOR_INTERNO: 'Colaborador',
  COLABORADOR_EXTERNO: 'Colaborador externo',
}

/** Formata o papel pra exibição; cai num "Title Case" simples se desconhecido. */
function formatRole(role?: string | null): string {
  if (!role) return 'Usuário'
  return ROLE_LABELS[role] ?? role.charAt(0) + role.slice(1).toLowerCase()
}

/** Iniciais do nome (até 2 letras) pro fallback do avatar. */
function getInitials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0]!.charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : ''
  return (first + last).toUpperCase()
}

/** Resolve assets (avatar/logo) — relativas e hosts de dev (localhost/LAN). */
function resolveAsset(url?: string | null): string | null {
  return resolveAssetUrl(url)
}

export default function PerfilScreen() {
  const router = useRouter()
  const { data: session } = useSession()

  // A empresa é complementar: não trava a tela enquanto carrega.
  const { data: empresa } = trpc.empresa.getMyEmpresa.useQuery()

  // Estado do logout (loading no botão).
  const [signingOut, setSigningOut] = useState(false)

  // `role` é um additionalField não inferido no client → acesso defensivo.
  const user = session?.user as
    | { name?: string | null; email?: string | null; image?: string | null; role?: string | null }
    | undefined

  const nome = user?.name ?? 'Usuário'
  const email = user?.email ?? ''
  const avatarUrl = resolveAsset(user?.image)
  const roleLabel = formatRole(user?.role)

  // Nome e logo da empresa (logo relativa → prefixada).
  const empresaNome = empresa?.nomeFantasia || empresa?.razaoSocial || null
  const empresaLogo = resolveAsset(empresa?.logoUrl)

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
      router.replace('/login')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <AppScreen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Container centralizado e com largura máxima (responsivo). */}
        <View className="w-full max-w-2xl mx-auto p-4 gap-4">
          {/* Header: menu (drawer) à esquerda + título. */}
          <View className="flex-row items-center gap-3">
            <MenuButton />
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Perfil</Text>
          </View>

          {/* Card de identidade: avatar, nome, e-mail, papel e empresa. */}
          <Card>
            <CardContent className="p-4 pt-4 items-center gap-3">
              {/* Avatar: imagem circular ou círculo com iniciais. */}
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  className="h-16 w-16 rounded-full bg-muted"
                  accessibilityLabel="Foto do perfil"
                />
              ) : (
                <View className="h-16 w-16 items-center justify-center rounded-full bg-primary">
                  <Text className="text-xl font-bold text-primary-foreground">
                    {getInitials(nome)}
                  </Text>
                </View>
              )}

              <View className="items-center gap-1">
                <Text className="text-xl font-bold text-foreground" numberOfLines={1}>
                  {nome}
                </Text>
                {email ? (
                  <Text className="text-sm text-muted-foreground" numberOfLines={1}>
                    {email}
                  </Text>
                ) : null}
                <Badge variant="secondary" className="mt-1">
                  {roleLabel}
                </Badge>
              </View>

              {/* Empresa vinculada (logo pequena + nome), quando disponível. */}
              {empresaNome ? (
                <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
                  {empresaLogo ? (
                    <Image
                      source={{ uri: empresaLogo }}
                      className="h-6 w-6 rounded bg-card"
                      resizeMode="contain"
                      accessibilityLabel="Logo da empresa"
                    />
                  ) : null}
                  <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
                    {empresaNome}
                  </Text>
                </View>
              ) : null}
            </CardContent>
          </Card>

          {/* Seção: Conta — navega para as telas próprias (chevron padrão).
              As preferências (push/tema/idioma) e atualizações foram pra aba
              Configurações. */}
          <View className="gap-2">
            <SectionHeader title="Conta" />
            <ListItem
              icon="settings-outline"
              title="Configurações"
              onPress={() => router.push('/configuracoes' as never)}
            />
            <ListItem
              icon="person-circle-outline"
              title="Editar perfil"
              onPress={() => router.push('/perfil/editar' as never)}
            />
            <ListItem
              icon="shield-checkmark-outline"
              title="Segurança / MFA"
              onPress={() => router.push('/perfil/seguranca' as never)}
            />
          </View>

          {/* Botão de logout. */}
          <Button
            variant="destructive"
            loading={signingOut}
            onPress={handleSignOut}
            className="mt-2"
          >
            Sair
          </Button>
        </View>
      </ScrollView>
    </AppScreen>
  )
}
