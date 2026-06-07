// Tela inicial (Dashboard) pós-login — rota /dashboard.
//
// Visão de boas-vindas com saudação personalizada, três KPIs com dados reais
// (eventos de hoje, tarefas abertas e chamados abertos) e uma lista de atalhos
// para os módulos principais. Segue o Design System: SafeAreaView + ScrollView,
// container centralizado com largura máxima, StatCard/SectionHeader/ListItem e
// tokens semânticos de tema (preserva o dark mode).

import { useMemo } from 'react'
import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'

import { HELPDESK_STATUS_FINAIS, type HelpdeskStatus } from '@saas/types'

import { MenuButton } from '@/components/navigation/menu-button'
import { SectionHeader } from '@/components/ui/section-header'
import { Spinner } from '@/components/ui/spinner'
import { StatCard } from '@/components/ui/stat-card'
import { ListItem } from '@/components/ui/list-item'
import { Text } from '@/components/ui/text'
import { useSession } from '@/lib/auth-client'
import { trpc } from '@/lib/trpc'

import { toISODate } from '@/features/agenda/date'

export default function DashboardScreen() {
  const router = useRouter()
  const { data: session } = useSession()

  // Primeiro nome do usuário logado (quando disponível) para a saudação.
  const primeiroNome = session?.user?.name?.trim().split(/\s+/)[0] ?? ''

  // Data de hoje em 'yyyy-MM-dd' — capturada uma vez por render do componente.
  const hoje = useMemo(() => toISODate(new Date()), [])

  // ── KPIs (dados reais) ──────────────────────────────────────────
  // Eventos de hoje: intervalo de um único dia (início = fim = hoje).
  const eventosQuery = trpc.agenda.listEventos.useQuery({
    dataInicio: hoje,
    dataFim: hoje,
  })

  // Tarefas em aberto do usuário.
  const tarefasQuery = trpc.agenda.tarefa.list.useQuery({ apenasAbertas: true })

  // Meus chamados — filtramos depois pelos que ainda não estão em status final.
  const chamadosQuery = trpc.helpdesk.listMeus.useQuery({})

  // Conta apenas tickets cujo status NÃO é final (CONCLUIDO/CANCELADO).
  // Estreitamos o tipo para { status } antes de filtrar — o tipo inferido pelo
  // tRPC é profundo demais e dispara TS2589 (instanciação recursiva) no filter.
  const chamados = (chamadosQuery.data ?? []) as Array<{ status: HelpdeskStatus }>
  const chamadosAbertos = chamados.filter(
    (ticket) => !HELPDESK_STATUS_FINAIS.includes(ticket.status),
  ).length

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Container centralizado com largura máxima em telas largas/tablet. */}
        <View className="w-full max-w-3xl mx-auto p-4 gap-6">
          {/* Cabeçalho — botão de menu (abre o Drawer) + saudação. */}
          <View className="flex-row items-center">
            <MenuButton />
            <View className="flex-1 pl-1">
              <Text className="text-xs uppercase tracking-wide text-muted-foreground">
                Bem-vindo ao OneClick ERP
              </Text>
              <Text className="text-xl sm:text-2xl font-bold text-foreground">
                {primeiroNome ? `Olá, ${primeiroNome}` : 'Olá'}
              </Text>
            </View>
          </View>

          {/* KPIs — 1 coluna no celular, lado a lado a partir do tablet (md). */}
          <View className="gap-3 md:flex-row">
            <KpiCard
              label="Eventos hoje"
              icon="calendar"
              loading={eventosQuery.isPending}
              // Em caso de erro, mostramos 0 (degradação suave do widget).
              value={eventosQuery.isError ? 0 : eventosQuery.data?.length ?? 0}
            />
            <KpiCard
              label="Tarefas abertas"
              icon="checkbox"
              loading={tarefasQuery.isPending}
              value={tarefasQuery.isError ? 0 : tarefasQuery.data?.length ?? 0}
            />
            <KpiCard
              label="Chamados abertos"
              icon="chatbubbles"
              loading={chamadosQuery.isPending}
              value={chamadosQuery.isError ? 0 : chamadosAbertos}
            />
          </View>

          {/* Atalhos para os módulos principais. */}
          <View className="gap-3">
            <SectionHeader title="Atalhos" />
            <View className="gap-2">
              <ListItem
                icon="calendar"
                title="Agenda"
                subtitle="Seus eventos e compromissos"
                onPress={() => router.push('/agenda')}
              />
              <ListItem
                icon="checkbox"
                title="Tarefas"
                subtitle="Pendências e prazos"
                onPress={() => router.push('/tarefas')}
              />
              <ListItem
                icon="chatbubbles"
                title="Helpdesk"
                subtitle="Abra e acompanhe chamados"
                onPress={() => router.push('/helpdesk')}
              />
              <ListItem
                icon="person"
                title="Perfil"
                subtitle="Conta e preferências"
                onPress={() => router.push('/perfil')}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/**
 * Wrapper do StatCard para os KPIs do dashboard: exibe um Spinner enquanto a
 * query carrega e, quando pronto, o valor numérico formatado. Ocupa o espaço
 * disponível para alinhar bem na grade responsiva (1 col → md:flex-row).
 */
function KpiCard({
  label,
  icon,
  value,
  loading,
}: {
  label: string
  icon: React.ComponentProps<typeof StatCard>['icon']
  value: number
  loading: boolean
}) {
  // Durante o carregamento mostramos um Spinner no lugar do número grande.
  if (loading) {
    return (
      <View className="flex-1 gap-3 rounded-2xl border border-border bg-elevated p-4">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Spinner />
        </View>
        <View className="gap-0.5">
          <View className="h-8 justify-center">
            <Spinner size="small" />
          </View>
          <Text className="text-sm text-muted-foreground">{label}</Text>
        </View>
      </View>
    )
  }

  return <StatCard className="flex-1" label={label} value={String(value)} icon={icon} />
}
