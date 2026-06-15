// Barra de navegação inferior (bottom tab bar) — navegação principal do app.
//
// Marca registrada da identidade nova: 4 destinos fixos no rodapé (Início,
// Agenda, Helpdesk, Perfil). É renderizada nas telas autenticadas; o Drawer (☰)
// continua disponível como acesso secundário (todos os módulos).
//
// NÃO reestrutura o roteamento pra (tabs) — navega entre as rotas existentes via
// `router.push`, evitando risco no bundle do SDK 56. O destino ativo é detectado
// por `usePathname()` e realçado em azul (primary). Helpdesk só aparece quando o
// usuário tem permissão no módulo (mesma fonte do Drawer: usePermissions).

import { Ionicons } from '@expo/vector-icons'
import { usePathname, useRouter } from 'expo-router'
import { Pressable, View } from 'react-native'
import { useColorScheme } from 'nativewind'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { mutedForegroundFor, primaryFor } from '@/lib/theme-colors'
import { usePermissions } from '@/lib/use-permissions'

type Tab = {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  /** Rota de destino (expo-router). */
  href: string
  /** Prefixos de rota que mantêm esta tab ativa (ex.: detalhe/novo). */
  match: string[]
  /** Slug do módulo cuja permissão libera a tab (`null` = sempre visível). */
  modulo: string | null
}

const TABS: Tab[] = [
  { label: 'Início', icon: 'home', href: '/dashboard', match: ['/dashboard'], modulo: null },
  { label: 'Agenda', icon: 'calendar', href: '/agenda', match: ['/agenda', '/tarefas'], modulo: 'agenda' },
  { label: 'Helpdesk', icon: 'chatbubbles', href: '/helpdesk', match: ['/helpdesk'], modulo: 'helpdesk' },
  { label: 'Perfil', icon: 'person', href: '/perfil', match: ['/perfil'], modulo: null },
]

export function BottomTabBar() {
  const router = useRouter()
  const pathname = usePathname()
  const insets = useSafeAreaInsets()
  const isDark = useColorScheme().colorScheme === 'dark'
  const { podeVer } = usePermissions()

  const corAtiva = primaryFor(isDark)
  const corMuted = mutedForegroundFor(isDark)

  // Helpdesk só entra na barra com permissão (degrada ocultando, não mostrando).
  const tabsVisiveis = TABS.filter((t) => t.modulo === null || podeVer(t.modulo))

  return (
    <View
      className="flex-row items-stretch border-t border-border bg-card px-2 pt-1.5"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {tabsVisiveis.map((tab) => {
        const ativo = tab.match.some(
          (m) => pathname === m || pathname.startsWith(`${m}/`),
        )
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: ativo }}
            onPress={() => router.push(tab.href as never)}
            className="flex-1 items-center gap-1 py-1.5 active:opacity-70"
          >
            <View
              className={cn(
                'h-9 w-12 items-center justify-center rounded-full',
                ativo && 'bg-primary/10',
              )}
            >
              <Ionicons name={tab.icon} size={22} color={ativo ? corAtiva : corMuted} />
            </View>
            <Text
              className={cn(
                'text-[10px] font-semibold leading-none',
                ativo ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
