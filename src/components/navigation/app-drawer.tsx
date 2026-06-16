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
import { Pressable, ScrollView, View } from 'react-native'
import { useColorScheme } from 'nativewind'
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
import { resolveAssetUrl } from '@/lib/api-url'
import { authClient, useSession } from '@/lib/auth-client'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'
import { usePermissions } from '@/lib/use-permissions'
import { destructiveFor, mutedForegroundFor, primaryFor } from '@/lib/theme-colors'

// Marca OneClick — fallback que SEMPRE existe (asset embarcado no bundle).
const ONECLICK_MARK = require('../../../assets/images/oneclick-mark.png')

// Resolve assets (logo/avatar) — relativas viram absolutas e hosts de dev
// (localhost/LAN) são reescritos pra base atual. Ver lib/api-url.
function resolveUrl(url: string | null | undefined): string | null {
  return resolveAssetUrl(url)
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

// Um bloco do menu — espelha os grupos da sidebar do sistema web (MODULE_GROUPS).
type BlocoMenu = {
  titulo: string
  itens: ItemModulo[]
}

// Início e Configurações ficam FORA dos blocos (topo e rodapé), como no web.
const ITEM_INICIO: ItemModulo = { label: 'Início', icon: 'home', route: 'dashboard', modulo: null }
const ITEM_CONFIG: ItemModulo = {
  label: 'Configurações',
  icon: 'settings-outline',
  route: 'configuracoes',
  modulo: null,
}

// Blocos navegáveis agrupados igual à sidebar do sistema (ordem dos grupos do web:
// Cadastros → … → Administrativo → … → TI). Cada item só aparece pra quem tem o
// módulo (podeVer); um bloco só é renderizado se tiver ≥1 item visível.
const BLOCOS: BlocoMenu[] = [
  {
    titulo: 'Cadastros',
    itens: [
      { label: 'Usuários', icon: 'people', route: 'usuarios', modulo: 'usuarios' },
      { label: 'Serviços', icon: 'briefcase', route: 'servicos', modulo: 'servicos' },
    ],
  },
  {
    titulo: 'Administrativo',
    itens: [
      { label: 'Agenda', icon: 'calendar', route: 'agenda', modulo: 'agenda' },
      { label: 'Tarefas', icon: 'checkbox', route: 'tarefas', modulo: 'agenda' },
      { label: 'Meus serviços', icon: 'clipboard', route: 'meus-servicos', modulo: 'meus-servicos' },
    ],
  },
  {
    titulo: 'TI',
    itens: [{ label: 'Helpdesk', icon: 'chatbubbles', route: 'helpdesk', modulo: 'helpdesk' }],
  },
]

// Linha de item navegável do drawer (chip de ícone + label, realce quando ativo).
// Extraído pra reuso entre Início, os blocos agrupados e Configurações.
function ItemLink({
  item,
  ativo,
  onPress,
  iconActive,
  iconMuted,
}: {
  item: ItemModulo
  ativo: boolean
  onPress: () => void
  iconActive: string
  iconMuted: string
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3 rounded-xl px-2 py-2.5',
        ativo ? 'bg-primary/10' : 'active:bg-muted',
      )}
    >
      <View
        className={cn(
          'h-9 w-9 items-center justify-center rounded-lg',
          ativo ? 'bg-primary/15' : 'bg-muted/60',
        )}
      >
        <Ionicons name={item.icon} size={18} color={ativo ? iconActive : iconMuted} />
      </View>
      <Text className={cn('flex-1 font-medium', ativo ? 'text-primary' : 'text-foreground')}>
        {item.label}
      </Text>
    </Pressable>
  )
}

export function AppDrawer(props: AppDrawerProps) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme().colorScheme === 'dark'

  // Cor literal pra ícones Ionicons (não herdam tokens do NativeWind).
  const iconActive = primaryFor(isDark) // primary (azul)
  const iconMuted = mutedForegroundFor(isDark) // muted-foreground
  const iconDanger = destructiveFor(isDark) // destructive

  // Empresa logada (header). Pode vir null se o user não tem empresa.
  const { data: empresa } = trpc.empresa.getMyEmpresa.useQuery()
  // Permissões do usuário — mesma fonte de verdade do sistema web.
  const { podeVer, isLoading: permsLoading, isError: permsError } = usePermissions()
  // Usuário logado (cartão de perfil).
  const { data: session } = useSession()
  const user = session?.user

  // Rota atualmente em foco no Drawer — pra realçar o item correspondente.
  const rotaAtual = props.state.routeNames[props.state.index]

  // Degrade gracioso: enquanto carrega OU se a query falhar, mostramos todos os
  // módulos (assim o menu nunca fica vazio/quebrado). Itens sem módulo (null)
  // são sempre visíveis.
  const mostrarTudo = permsLoading || permsError
  const podeMostrar = (modulo: string | null) =>
    modulo === null || mostrarTudo || podeVer(modulo)

  // Blocos com os itens filtrados por permissão; blocos vazios são descartados.
  const blocosVisiveis = BLOCOS.map((bloco) => ({
    titulo: bloco.titulo,
    itens: bloco.itens.filter((item) => podeMostrar(item.modulo)),
  })).filter((bloco) => bloco.itens.length > 0)

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
          <View className="flex-1 min-w-0">
            <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Empresa
            </Text>
            {/* Fonte menor + ellipsis: mantém o cabeçalho do drawer compacto mesmo
                com nomes longos (ex.: "CENTRAL SOLUCOES EMPRESARIAIS"). */}
            <Text
              className="text-[13px] font-bold text-foreground"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
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

        {/* ── Início (fora dos blocos, no topo) ── */}
        <View className="mt-4 gap-1">
          <ItemLink
            item={ITEM_INICIO}
            ativo={ITEM_INICIO.route === rotaAtual}
            onPress={() => props.navigation.navigate(ITEM_INICIO.route)}
            iconActive={iconActive}
            iconMuted={iconMuted}
          />
        </View>

        {/* ── Blocos agrupados (igual à sidebar do sistema), gated por permissão ── */}
        {blocosVisiveis.map((bloco) => (
          <View key={bloco.titulo} className="mt-3 gap-1">
            <Text className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {bloco.titulo}
            </Text>
            {bloco.itens.map((item) => (
              <ItemLink
                key={item.label}
                item={item}
                ativo={item.route === rotaAtual}
                onPress={() => props.navigation.navigate(item.route)}
                iconActive={iconActive}
                iconMuted={iconMuted}
              />
            ))}
          </View>
        ))}

        {/* ── Configurações (app-level, fora dos blocos) ── */}
        <View className="mt-3 gap-1">
          <ItemLink
            item={ITEM_CONFIG}
            ativo={ITEM_CONFIG.route === rotaAtual}
            onPress={() => props.navigation.navigate(ITEM_CONFIG.route)}
            iconActive={iconActive}
            iconMuted={iconMuted}
          />
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
