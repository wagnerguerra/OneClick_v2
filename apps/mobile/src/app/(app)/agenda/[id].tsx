import { ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { trpc } from '@/lib/trpc'
import { resolveTipoCores } from '@/features/agenda/color'
import { fromISODate, formatDiaMesExtenso, formatHora } from '@/features/agenda/date'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'

// Rótulos de modalidade (campo `presenca` do evento).
const PRESENCA_LABEL: Record<string, string> = {
  PRESENCIAL: 'Presencial',
  ONLINE: 'Online',
  HIBRIDO: 'Híbrido',
}

// Rótulos de canal de lembrete.
const CANAL_LABEL: Record<string, string> = {
  POPUP: 'Popup',
  EMAIL: 'E-mail',
}

/**
 * Formata a antecedência de um lembrete (em minutos) de forma legível em pt-BR.
 * Ex.: 30 -> "30 min antes", 60 -> "1 h antes", 1440 -> "1 dia antes".
 */
function formatAntecedencia(minutosAntes: number): string {
  if (minutosAntes < 60) {
    return `${minutosAntes} min antes`
  }
  if (minutosAntes < 1440) {
    const h = minutosAntes / 60
    const valor = Number.isInteger(h) ? String(h) : h.toFixed(1)
    return `${valor} h antes`
  }
  const d = minutosAntes / 1440
  const valor = Number.isInteger(d) ? String(d) : d.toFixed(1)
  return `${valor} ${d === 1 ? 'dia' : 'dias'} antes`
}

/**
 * Tela de DETALHE de um evento da Agenda (rota /agenda/[id]), somente leitura.
 * Busca o evento via `agenda.getById` e os lembretes via `agenda.lembrete.list`
 * (os lembretes não vêm embutidos no getById).
 */
export default function AgendaEventoDetalhe() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  // Sem transformer no client tRPC: datas chegam como string ISO.
  const eventoQuery = trpc.agenda.getById.useQuery({ id })
  // Lembretes ficam numa procedure separada (não vêm no getById).
  const lembretesQuery = trpc.agenda.lembrete.list.useQuery({ eventoId: id })

  // Estado de carregamento do evento.
  if (eventoQuery.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-6">
          <Spinner />
        </View>
      </SafeAreaView>
    )
  }

  // Erro ou evento inexistente.
  if (eventoQuery.isError || !eventoQuery.data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-base text-muted-foreground">Evento não encontrado</Text>
          <Button variant="outline" size="sm" onPress={() => router.back()}>
            ‹ Voltar
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  const evento = eventoQuery.data
  const cores = resolveTipoCores(evento.tipo)

  // Horário: "Dia inteiro" ou intervalo HH:MM–HH:MM (omite o traço se faltar fim).
  const horario = evento.diaInteiro
    ? 'Dia inteiro'
    : evento.horaInicio
      ? `${formatHora(evento.horaInicio)}${evento.horaFim ? `–${formatHora(evento.horaFim)}` : ''}`
      : 'Dia inteiro'

  // Há algum dado de local pra mostrar o card de Local?
  const temLocal = Boolean(evento.local || evento.contato || evento.link || evento.presenca)

  const lembretes = lembretesQuery.data ?? []

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView>
        <View className="w-full max-w-2xl mx-auto p-4 gap-4">
          {/* Topo: voltar + badge do tipo */}
          <View className="flex-row items-center justify-between">
            <Button variant="ghost" size="sm" className="px-0" onPress={() => router.back()}>
              ‹ Voltar
            </Button>
            <Badge
              variant="outline"
              style={{ backgroundColor: cores.bg, borderColor: cores.border }}
            >
              <Text className="text-xs font-semibold" style={{ color: cores.text }}>
                {evento.tipo.nome}
              </Text>
            </Badge>
          </View>

          {/* Título + data/hora */}
          <View className="gap-1">
            <Text className="text-2xl font-bold text-foreground">{evento.titulo}</Text>
            <Text className="text-sm text-muted-foreground">
              {`${formatDiaMesExtenso(fromISODate(evento.data.slice(0, 10)))} · ${horario}`}
            </Text>
          </View>

          {/* Local / modalidade */}
          {temLocal ? (
            <Card>
              <CardHeader>
                <CardTitle>Local</CardTitle>
              </CardHeader>
              <CardContent className="gap-2">
                {evento.local ? (
                  <View className="gap-0.5">
                    <Text className="text-xs text-muted-foreground">Local</Text>
                    <Text className="text-sm text-foreground">{evento.local}</Text>
                  </View>
                ) : null}
                {evento.contato ? (
                  <View className="gap-0.5">
                    <Text className="text-xs text-muted-foreground">Contato</Text>
                    <Text className="text-sm text-foreground">{evento.contato}</Text>
                  </View>
                ) : null}
                {evento.link ? (
                  <View className="gap-0.5">
                    <Text className="text-xs text-muted-foreground">Link</Text>
                    <Text className="text-sm text-foreground">{evento.link}</Text>
                  </View>
                ) : null}
                {evento.presenca ? (
                  <View className="gap-0.5">
                    <Text className="text-xs text-muted-foreground">Modalidade</Text>
                    <Text className="text-sm text-foreground">
                      {PRESENCA_LABEL[evento.presenca] ?? evento.presenca}
                    </Text>
                  </View>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* Participantes */}
          {evento.participantes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Participantes</CardTitle>
              </CardHeader>
              <CardContent className="gap-1.5">
                {evento.participantes.map((p) => (
                  <Text key={p.id} className="text-sm text-foreground">
                    {p.usuario?.name ?? p.nomeAvulso ?? 'Sem nome'}
                  </Text>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* Descrição */}
          {evento.descricao ? (
            <Card>
              <CardHeader>
                <CardTitle>Descrição</CardTitle>
              </CardHeader>
              <CardContent>
                <Text className="text-sm text-foreground">{evento.descricao}</Text>
              </CardContent>
            </Card>
          ) : null}

          {/* Lembretes (procedure separada) */}
          {lembretes.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Lembretes</CardTitle>
              </CardHeader>
              <CardContent className="gap-1.5">
                {lembretes.map((l) => (
                  <Text key={l.id} className="text-sm text-foreground">
                    {`${CANAL_LABEL[l.canal] ?? l.canal} · ${formatAntecedencia(l.minutosAntes)}`}
                  </Text>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
