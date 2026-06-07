// Conteúdo customizado do Drawer da área autenticada.
//
// Estrutura (de cima para baixo):
//   1. Header da empresa logada (logo + nome) — trpc.empresa.getMyEmpresa.
//      A logo SEMPRE aparece: logo da empresa → marca OneClick → inicial.
//   2. Cartão do usuário (avatar + nome + e-mail) — useSession; toca → Perfil.
//   3. Módulos navegáveis, filtrados pelas permissões do usuário
//      (trpc.user.getMyPermissions) — exatamente como o sistema web.
//   4. Rodapé: Perfil e Sair.
//
// Visual seguindo o Design System: tokens semânticos (sem hex, exceto onde
// Ionicons/Image exigem cor literal), espaçamento arejado, cantos arredondados.

import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, useColorScheme, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// SDK 56: o expo-router vendoriza o react-navigation; importar
// `@react-navigation/drawer` direto quebra o bundle. Por isso tipamos os props
// do drawerContent localmente (shape mínimo que usamos) e usamos ScrollView
// comum no lugar do DrawerContentScrollView.
type AppDrawerProps = {
  state: { routeNames: string[]; index: number }
  navigation: { navigate: (name: string) => void; closeDrawer: () => void }
}

import { Text } from '@/components/ui/text'
import { getApiUrl } from '@/lib/api-url'
import { authClient, useSession } from '@/lib/auth-client'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'

// Marca OneClick — fallback que SEMPRE existe (asset embarcado no bundle).
const ONECLICK_MARK = require('../../../assets/images/oneclick-mark.png')

// Prefixa URLs relativas (ex.: "/uploads/logo.png") com a base da API.
function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${getApiUrl()}${url.startsWith('/') ? '' : '/'}${url}`
}

// Iniciais a partir de um nome (até 2 letras) — fallback de avatar/logo.
function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}

// Definição de um item de módulo navegável no drawer.
type ItemModulo = {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  // Nome da rota do Drawer.Screen.
  route: string
  // Slug do módulo cuja permissão libera o item. `null` = sempre visível.
  modulo: string | null
}

// Itens do menu — só os módulos implementados e navegáveis.
// A visibilidade é decidida em runtime via `podeVer(item.modulo)`.
//   - Início       → sempre (sem permissão)
//   - Agenda       → módulo 'agenda'
//   - Tarefas      → módulo 'agenda' (tarefas pertencem à agenda)
//   - Helpdesk     → módulo 'helpdesk'
const ITENS_MENU: ItemModulo[] = [
  { label: 'Início', icon: 'home', route: 'dashboard', modulo: null },
  { label: 'Agenda', icon: 'calendar', route: 'agenda', modulo: 'agenda' },
  { label: 'Tarefas', icon: 'checkbox', route: 'tarefas', modulo: 'agenda' },
  { label: 'Helpdesk', icon: 'chatbubbles', route: 'helpdesk', modulo: 'helpdesk' },
]

export function AppDrawer(props: AppDrawerProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme() === 'dark'

  // Cor literal pra ícones Ionicons (não herdam tokens do NativeWind).
  const iconActive = isDark ? '#38bdf8' : '#0ea5e9' // primary
  const iconMuted = isDark ? '#a1a1aa' : '#64748b' // muted-foreground
  const iconDanger = isDark ? '#fb7185' : '#f43f5e' // destructive

  // Empresa logada (header). Pode vir null se o user não tem empresa.
  const { data: empresa } = trpc.empresa.getMyEmpresa.useQuery()
  // Permissões do usuário — mesma fonte de verdade do sistema web.
  const { data: perms, isLoading: permsLoading, isError: permsError } =
    trpc.user.getMyPermissions.useQuery()
  // Usuário logado (cartão de perfil).
  const { data: session } = useSession()
  const user = session?.user

  // Rota atualmente em foco no Drawer — pra realçar o item correspondente.
  const rotaAtual = props.state.routeNames[props.state.index]

  // Helper de permissão — espelha o `podeVer(slug)` do sistema web.
  // Master/empresa-master enxergam tudo; demais precisam de canRead no módulo.
  function podeVer(slug: string | null): boolean {
    if (slug === null) return true
    if (!perms) return false
    if (perms.isMaster || perms.isEmpresaMaster) return true
    return perms.permissions.some((p) => p.moduleSlug === slug && p.canRead)
  }

  // Degrade gracioso: enquanto carrega OU se a query falhar, mostramos todos os
  // módulos (assim o menu nunca fica vazio/quebrado). Início é sempre visível.
  const mostrarTudo = permsLoading || permsError || !perms
  const itensVisiveis = ITENS_MENU.filter(
    (item) => item.modulo === null || mostrarTudo || podeVer(item.modulo),
  )

  // Logo da empresa: usa a versão dark quando disponível no tema escuro.
  const logo = resolveUrl(
    isDark ? empresa?.logoDarkUrl ?? empresa?.logoUrl : empresa?.logoUrl,
  )
  const nomeEmpresa = empresa?.nomeFantasia || empresa?.razaoSocial || 'Empresa'

  // Estado da cascata de fallback do logo no header:
  //   'logo'    → tenta a logo da empresa
  //   'mark'    → marca OneClick (sempre existe)
  //   'inicial' → bloco bg-primary com a inicial
  // Começa em 'logo' se há URL, senão já cai na marca OneClick.
  const [logoStage, setLogoStage] = useState<'logo' | 'mark' | 'inicial'>(
    logo ? 'logo' : 'mark',
  )

  // Avatar do usuário (Better Auth expõe user.image).
  const userImage = resolveUrl((user as { image?: string | null } | undefined)?.image)

  // Faz logout e volta pro login.
  async function sair() {
    await authClient.signOut()
    router.replace('/login')
  }

  return (
    <ScrollView
      className="flex-1 bg-card"
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <View className="px-4 pt-2 pb-4">
        {/* ── Header da empresa ── */}
        <View className="flex-row items-center gap-3 pb-4 mb-2 border-b border-border">
          {/* Cascata de logo: empresa → marca OneClick → inicial. Sempre há algo. */}
          {logo && logoStage === 'logo' ? (
            <Image
              source={{ uri: logo }}
              style={{ width: 48, height: 48, borderRadius: 12 }}
              contentFit="contain"
              transition={150}
              // Se a logo da empresa falhar, cai pra marca OneClick.
              onError={() => setLogoStage('mark')}
            />
          ) : logoStage !== 'inicial' ? (
            <Image
              source={ONECLICK_MARK}
              style={{ width: 48, height: 48, borderRadius: 12 }}
              contentFit="contain"
              transition={150}
              // Caso extremo (marca não carregue): cai pro bloco com inicial.
              onError={() => setLogoStage('inicial')}
            />
          ) : (
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary">
              <Text className="text-lg font-bold text-primary-foreground">
                {iniciais(nomeEmpresa)}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Empresa
            </Text>
            <Text className="font-bold text-foreground" numberOfLines={2}>
              {nomeEmpresa}
            </Text>
          </View>
        </View>

        {/* ── Cartão do usuário ── */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Abrir perfil"
          onPress={() => props.navigation.navigate('perfil')}
          className="flex-row items-center gap-3 rounded-2xl bg-muted/40 p-3 active:opacity-80"
        >
          {userImage ? (
            <Image
              source={{ uri: userImage }}
              style={{ width: 40, height: 40, borderRadius: 20 }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
              <Text className="text-sm font-bold text-primary-foreground">
                {iniciais(user?.name)}
              </Text>
            </View>
          )}
          <View className="flex-1">
            <Text className="font-semibold text-foreground" numberOfLines={1}>
              {user?.name || 'Usuário'}
            </Text>
            {user?.email ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={iconMuted} />
        </Pressable>

        {/* ── Módulos navegáveis (filtrados por permissão) ── */}
        <View className="mt-4 gap-1">
          {itensVisiveis.map((item) => {
            const ativo = item.route === rotaAtual

            return (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityState={{ selected: ativo }}
                onPress={() => props.navigation.navigate(item.route)}
                className={cn(
                  'flex-row items-center gap-3 rounded-xl px-2 py-2.5',
                  ativo ? 'bg-primary/10' : 'active:bg-muted',
                )}
              >
                {/* Chip do ícone. */}
                <View
                  className={cn(
                    'h-9 w-9 items-center justify-center rounded-lg',
                    ativo ? 'bg-primary/15' : 'bg-muted/60',
                  )}
                >
                  <Ionicons
                    name={item.icon}
                    size={18}
                    color={ativo ? iconActive : iconMuted}
                  />
                </View>

                <Text
                  className={cn(
                    'flex-1 font-medium',
                    ativo ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* ── Rodapé: Perfil + Sair ── */}
        <View className="mt-6 pt-4 gap-1 border-t border-border">
          <Pressable
            accessibilityRole="button"
            onPress={() => props.navigation.navigate('perfil')}
            className="flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-muted"
          >
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-muted/60">
              <Ionicons name="person" size={18} color={iconMuted} />
            </View>
            <Text className="flex-1 font-medium text-foreground">Perfil</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={sair}
            className="flex-row items-center gap-3 rounded-xl px-2 py-2.5 active:bg-muted"
          >
            <View className="h-9 w-9 items-center justify-center rounded-lg bg-destructive/10">
              <Ionicons name="log-out" size={18} color={iconDanger} />
            </View>
            <Text className="flex-1 font-medium text-destructive">Sair</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  )
}
