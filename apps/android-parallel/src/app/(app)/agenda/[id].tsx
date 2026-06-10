import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Card, EmptyState, Screen, colors } from '@/components/ui'
import { formatTime } from '@/lib/date'
import { trpc } from '@/lib/trpc'

export default function EventoDetalheScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const eventoQuery = trpc.agenda.getById.useQuery({ id: params.id })

  if (eventoQuery.isPending) {
    return (
      <Screen>
        <SafeAreaView style={styles.center}>
          <ActivityIndicator />
        </SafeAreaView>
      </Screen>
    )
  }

  if (eventoQuery.isError || !eventoQuery.data) {
    return (
      <Screen>
        <SafeAreaView style={styles.safe}>
          <Header onBack={() => router.back()} />
          <EmptyState text="Evento nao encontrado." />
        </SafeAreaView>
      </Screen>
    )
  }

  const evento = eventoQuery.data
  const horario = evento.diaInteiro
    ? 'Dia inteiro'
    : [formatTime(evento.horaInicio), formatTime(evento.horaFim)]
        .filter(Boolean)
        .join(' - ')
  const data = new Date(evento.data).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  })

  return (
    <Screen>
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <View
              style={[
                styles.colorBar,
                { backgroundColor: evento.tipo?.cor || colors.primary },
              ]}
            />
            <Text style={styles.title}>{evento.titulo}</Text>
            {evento.tipo?.nome ? <Text style={styles.type}>{evento.tipo.nome}</Text> : null}
          </Card>

          <Card style={styles.details}>
            <Detail icon="calendar-outline" label="Data" value={data} />
            {horario ? <Detail icon="time-outline" label="Horario" value={horario} /> : null}
            {evento.local ? (
              <Detail icon="location-outline" label="Local" value={evento.local} />
            ) : null}
            {evento.link ? (
              <Pressable onPress={() => Linking.openURL(evento.link!)}>
                <Detail icon="link-outline" label="Link" value={evento.link} />
              </Pressable>
            ) : null}
            {evento.descricao ? (
              <Detail icon="document-text-outline" label="Descricao" value={evento.descricao} />
            ) : null}
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Screen>
  )
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Detalhe</Text>
      <View style={styles.backButton} />
    </View>
  )
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  value: string
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 18,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  content: {
    gap: 14,
    padding: 18,
    paddingTop: 0,
  },
  card: {
    gap: 8,
    overflow: 'hidden',
  },
  colorBar: {
    height: 5,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 8,
  },
  type: {
    color: colors.primaryDark,
    fontSize: 13,
    fontWeight: '800',
  },
  details: {
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 12,
  },
  detailIcon: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  detailText: {
    flex: 1,
    gap: 2,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailValue: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
})
