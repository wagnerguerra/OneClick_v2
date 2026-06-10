import { useMemo } from 'react'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Card, Screen, Stat, colors } from '@/components/ui'
import { useSession } from '@/lib/auth-client'
import { toISODate } from '@/lib/date'
import { trpc } from '@/lib/trpc'

export default function DashboardScreen() {
  const { data: session } = useSession()
  const hoje = useMemo(() => toISODate(new Date()), [])
  const primeiroNome = session?.user?.name?.trim().split(/\s+/)[0]

  const eventos = trpc.agenda.listEventos.useQuery({
    dataInicio: hoje,
    dataFim: hoje,
  })
  const tarefas = trpc.agenda.tarefa.list.useQuery({ apenasAbertas: true })

  const loading = eventos.isPending || tarefas.isPending
  const refreshing = eventos.isRefetching || tarefas.isRefetching

  async function refetchAll() {
    await Promise.all([eventos.refetch(), tarefas.refetch()])
  }

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refetchAll} />
          }
        >
          <View style={styles.header}>
            <Text style={styles.kicker}>OneClick ERP</Text>
            <Text style={styles.title}>
              {primeiroNome ? `Ola, ${primeiroNome}` : 'Ola'}
            </Text>
            <Text style={styles.subtitle}>Resumo rapido para hoje.</Text>
          </View>

          {loading ? (
            <Card style={styles.loadingCard}>
              <ActivityIndicator />
              <Text style={styles.muted}>Carregando indicadores...</Text>
            </Card>
          ) : (
            <View style={styles.stats}>
              <Stat
                icon="calendar-outline"
                label="Eventos hoje"
                value={String(eventos.isError ? 0 : eventos.data?.length ?? 0)}
              />
              <Stat
                icon="checkbox-outline"
                label="Tarefas abertas"
                value={String(tarefas.isError ? 0 : tarefas.data?.length ?? 0)}
              />
            </View>
          )}

          <Card style={styles.panel}>
            <Text style={styles.panelTitle}>Agenda</Text>
            <Text style={styles.panelText}>
              A primeira versao do Android paralelo prioriza consulta semanal,
              detalhe do evento e criacao simples de compromissos.
            </Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    gap: 18,
    padding: 18,
    paddingBottom: 32,
  },
  header: {
    gap: 4,
    paddingTop: 6,
  },
  kicker: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
  },
  loadingCard: {
    alignItems: 'center',
    gap: 10,
  },
  muted: {
    color: colors.muted,
  },
  stats: {
    flexDirection: 'row',
    gap: 12,
  },
  panel: {
    gap: 8,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  panelText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
})
