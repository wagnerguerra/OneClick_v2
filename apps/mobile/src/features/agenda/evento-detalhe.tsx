// Componente reusável de DETALHE de um evento da Agenda (somente leitura).
//
// Usado em dois contextos:
//   - Tela própria /agenda/[id] (celular): renderizado dentro de um SafeAreaView
//     pelo pai, com botão "voltar" próprio (embutido=false).
//   - Painel direito do master-detail no tablet (embutido=true): SEM SafeAreaView
//     e SEM botão "voltar" — o pai (lista) cuida do chrome.
//
// Busca o evento via `agenda.getById` e os lembretes via `agenda.lembrete.list`
// (os lembretes não vêm embutidos no getById). Ações (Editar/Excluir) só aparecem
// quando `evento.editavel !== false`.

import { Alert, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

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

interface EventoDetalheProps {
  /** ID do evento a exibir. */
  id: string
  /**
   * Quando true, é o painel direito do master-detail (tablet): NÃO renderiza
   * botão "voltar" — o pai (lista) controla a navegação. Default: false (tela própria).
   */
  embutido?: boolean
  /**
   * Callback opcional disparado após excluir o evento com sucesso. No modo
   * embutido, o pai usa isso pra limpar a seleção. No modo não-embutido,
   * caímos no `router.back()` padrão.
   */
  onAposExcluir?: () => void
}

/**
 * Detalhe de um evento da Agenda (somente leitura), reusável entre a tela própria
 * e o painel direito do layout master-detail. Usa ScrollView internamente.
 */
export function EventoDetalhe({ id, embutido = false, onAposExcluir }: EventoDetalheProps) {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Sem transformer no client tRPC: datas chegam como string ISO.
  const eventoQuery = trpc.agenda.getById.useQuery({ id })
  // Lembretes ficam numa procedure separada (não vêm no getById).
  const lembretesQuery = trpc.agenda.lembrete.list.useQuery({ eventoId: id })

  // Mutation de exclusão — ao concluir, invalida a listagem e:
  //   - embutido: chama onAposExcluir (pai limpa a seleção);
  //   - não-embutido: volta pra tela anterior.
  const deleteEvento = trpc.agenda.delete.useMutation({
    onSuccess: () => {
      utils.agenda.listEventos.invalidate()
      if (embutido) {
        onAposExcluir?.()
      } else {
        router.back()
      }
    },
  })

  // Confirmação nativa antes de excluir (Cancelar / Excluir destrutivo).
  function confirmarExclusao() {
    Alert.alert('Excluir evento', 'Tem certeza que deseja excluir este evento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: () => deleteEvento.mutate({ id }),
      },
    ])
  }

  // Estado de carregamento do evento.
  if (eventoQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <Spinner />
      </View>
    )
  }

  // Erro ou evento inexistente.
  if (eventoQuery.isError || !eventoQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 p-6">
        <Text className="text-base text-muted-foreground">Evento não encontrado</Text>
        {/* No modo embutido não há "tela anterior" — só oferece voltar fora do painel. */}
        {!embutido ? (
          <Button variant="outline" size="sm" onPress={() => router.back()}>
            ‹ Voltar
          </Button>
        ) : null}
      </View>
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
    <ScrollView className="flex-1">
      <View className="w-full max-w-2xl mx-auto p-4 gap-4">
        {/* Topo: voltar (só fora do painel) + ações (editar/excluir, se editável) */}
        <View className="flex-row items-center justify-between">
          {/* Botão "voltar" só na tela própria — no painel do tablet o pai cuida. */}
          {!embutido ? (
            <Button variant="ghost" size="sm" className="px-0" onPress={() => router.back()}>
              ‹ Voltar
            </Button>
          ) : (
            <View />
          )}
          {evento.editavel !== false ? (
            <View className="flex-row items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onPress={() => router.push({ pathname: '/agenda/novo', params: { id } })}
              >
                Editar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={deleteEvento.isPending}
                onPress={confirmarExclusao}
              >
                Excluir
              </Button>
            </View>
          ) : null}
        </View>

        {/* Badge do tipo */}
        <View className="flex-row">
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
  )
}
