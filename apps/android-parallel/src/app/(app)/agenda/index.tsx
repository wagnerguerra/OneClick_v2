import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Card, EmptyState, Screen, colors } from '@/components/ui'
import {
  addDays,
  formatDateTitle,
  formatShortWeekday,
  formatTime,
  sameDay,
  toISODate,
  weekDays,
} from '@/lib/date'
import { trpc } from '@/lib/trpc'

type Evento = {
  id: string
  titulo: string
  data: Date | string
  horaInicio?: string | null
  horaFim?: string | null
  diaInteiro?: boolean | null
  local?: string | null
  tipo?: { nome?: string | null; cor?: string | null } | null
}

export default function AgendaScreen() {
  const router = useRouter()
  const hoje = useMemo(() => new Date(), [])
  const [referencia, setReferencia] = useState(hoje)
  const [selecionado, setSelecionado] = useState(hoje)

  const dias = useMemo(() => weekDays(referencia), [referencia])
  const dataInicio = toISODate(dias[0]!)
  const dataFim = toISODate(dias[dias.length - 1]!)
  const selecionadoIso = toISODate(selecionado)

  const eventosQuery = trpc.agenda.listEventos.useQuery({ dataInicio, dataFim })
  const eventos = ((eventosQuery.data ?? []) as Evento[]).filter((evento) => {
    const data = evento.data instanceof Date ? evento.data : new Date(evento.data)
    return toISODate(data) === selecionadoIso
  })

  function moverSemana(delta: number) {
    setReferencia((current) => addDays(current, delta))
    setSelecionado((current) => addDays(current, delta))
  }

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Agenda</Text>
            <Text style={styles.title}>{formatDateTitle(selecionado)}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/agenda/novo')}
            style={styles.newButton}
          >
            <Ionicons name="add" color="#fff" size={24} />
          </Pressable>
        </View>

        <View style={styles.weekNav}>
          <Pressable style={styles.navButton} onPress={() => moverSemana(-7)}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Text style={styles.weekTitle}>
            {toISODate(dias[0]!)} a {toISODate(dias[6]!)}
          </Text>
          <Pressable style={styles.navButton} onPress={() => moverSemana(7)}>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.days}>
          {dias.map((dia) => {
            const active = sameDay(dia, selecionado)
            const today = sameDay(dia, hoje)
            return (
              <Pressable
                key={toISODate(dia)}
                onPress={() => setSelecionado(dia)}
                style={[styles.day, active && styles.dayActive]}
              >
                <Text style={[styles.dayName, active && styles.dayTextActive]}>
                  {formatShortWeekday(dia)}
                </Text>
                <Text style={[styles.dayNumber, active && styles.dayTextActive]}>
                  {dia.getDate()}
                </Text>
                {today && !active ? <View style={styles.todayDot} /> : null}
              </Pressable>
            )
          })}
        </View>

        {eventosQuery.isPending ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : eventosQuery.isError ? (
          <EmptyState text="Nao foi possivel carregar a agenda." />
        ) : eventos.length === 0 ? (
          <EmptyState text="Nenhum evento neste dia." />
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={eventosQuery.isRefetching}
                onRefresh={() => eventosQuery.refetch()}
              />
            }
          >
            {eventos.map((evento) => (
              <EventoCard
                evento={evento}
                key={evento.id}
                onPress={() =>
                  router.push({ pathname: '/agenda/[id]', params: { id: evento.id } })
                }
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Screen>
  )
}

function EventoCard({ evento, onPress }: { evento: Evento; onPress: () => void }) {
  const horario = evento.diaInteiro
    ? 'Dia inteiro'
    : [formatTime(evento.horaInicio), formatTime(evento.horaFim)]
        .filter(Boolean)
        .join(' - ')

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <Card
        style={[
          styles.eventCard,
          { borderLeftColor: evento.tipo?.cor || colors.primary },
        ]}
      >
        <Text style={styles.eventTitle}>{evento.titulo}</Text>
        {horario ? <Text style={styles.eventMeta}>{horario}</Text> : null}
        {evento.local ? <Text style={styles.eventMeta}>{evento.local}</Text> : null}
        {evento.tipo?.nome ? <Text style={styles.eventType}>{evento.tipo.nome}</Text> : null}
      </Card>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
    paddingBottom: 12,
  },
  kicker: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  newButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  weekNav: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  weekTitle: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    textAlign: 'center',
  },
  days: {
    flexDirection: 'row',
    gap: 8,
    padding: 18,
  },
  day: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    height: 64,
    justifyContent: 'center',
  },
  dayActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayName: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  dayNumber: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  dayTextActive: {
    color: '#fff',
  },
  todayDot: {
    backgroundColor: colors.primary,
    borderRadius: 2,
    height: 4,
    marginTop: 2,
    width: 4,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    gap: 12,
    padding: 18,
    paddingTop: 0,
  },
  pressed: {
    opacity: 0.75,
  },
  eventCard: {
    borderLeftWidth: 5,
    gap: 4,
  },
  eventTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  eventMeta: {
    color: colors.muted,
    fontSize: 14,
  },
  eventType: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
})
