// Tela de lista da Agenda (rota /agenda) — visão semanal.
//
// Mostra uma faixa horizontal com os 7 dias da semana de referência (destacando
// hoje e o dia selecionado), navegação por semana (‹ ›) e a lista de eventos do
// dia selecionado. Cada evento é um Card tocável com borda esquerda colorida pelo
// tipo. Toque leva ao detalhe (/agenda/[id]).

import { useMemo, useState } from 'react'
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'

import { MenuButton } from '@/components/navigation/menu-button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { EventoDetalhe } from '@/features/agenda/evento-detalhe'

import {
  addDays,
  eachDayOfWeek,
  formatDiaMesExtenso,
  formatDiaSemana,
  formatHora,
  isSameDay,
  toISODate,
} from '@/features/agenda/date'
import { resolveTipoCores } from '@/features/agenda/color'
import { groupByDay } from '@/features/agenda/grouping'
import { useEventosDaSemana, type EventoAgenda } from '@/features/agenda/use-eventos'

export default function AgendaScreen() {
  const router = useRouter()

  // Layout responsivo: a partir de 900px (tablet landscape) usamos master-detail
  // (lista à esquerda + detalhe à direita); abaixo disso, navegação por rota.
  const { width } = useWindowDimensions()
  const isWide = width >= 900

  // Hoje (capturado uma vez por render do componente — não é util puro, ok aqui).
  const hoje = useMemo(() => new Date(), [])

  // Estado: data de referência da semana e dia selecionado. Iniciam em hoje.
  const [referencia, setReferencia] = useState<Date>(hoje)
  const [diaSelecionado, setDiaSelecionado] = useState<Date>(hoje)

  // Evento selecionado no painel direito (só relevante no modo isWide).
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)

  // Os 7 dias (domingo a sábado) da semana de referência.
  const diasDaSemana = useMemo(() => eachDayOfWeek(referencia), [referencia])

  // Busca os eventos da semana e normaliza `data` para 'yyyy-MM-dd'.
  const { eventos, isPending, isError, refetch } = useEventosDaSemana(referencia)

  // Eventos do dia selecionado, já ordenados (dia-inteiro primeiro, depois por hora).
  const eventosDoDia = useMemo(() => {
    const isoSelecionado = toISODate(diaSelecionado)
    const grupos = groupByDay<EventoAgenda>(eventos)
    const grupo = grupos.find((g) => g.dia === isoSelecionado)
    return grupo?.eventos ?? []
  }, [eventos, diaSelecionado])

  // Navega entre semanas (±7 dias) e leva o dia selecionado junto.
  function irParaSemana(deltaDias: number) {
    const novaRef = addDays(referencia, deltaDias)
    setReferencia(novaRef)
    setDiaSelecionado(addDays(diaSelecionado, deltaDias))
  }

  // Ação ao tocar num card: no modo largo seleciona o painel direito; senão navega.
  function abrirEvento(eventoId: string) {
    if (isWide) {
      setSelecionadoId(eventoId)
    } else {
      router.push(`/agenda/${eventoId}`)
    }
  }

  // Painel da lista (header de semana + faixa de dias + corpo de eventos).
  // É reutilizado no celular (largura máxima centralizada) e no tablet (coluna fixa).
  const painelLista = (
    <View
      className={cn(
        'flex-1',
        // Celular: centralizado com largura máxima. Tablet: coluna fixa à esquerda.
        isWide ? 'w-[380px] border-r border-border' : 'w-full max-w-2xl mx-auto',
      )}
    >
        {/* Header: título com o dia selecionado por extenso + navegação de semana. */}
        <View className="flex-row items-center justify-between px-4 pt-2 pb-3">
          {/* Botão de menu — abre o Drawer. */}
          <MenuButton />
          <View className="flex-1 pl-1 pr-2">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Agenda</Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">
              {formatDiaMesExtenso(diaSelecionado)}
            </Text>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Semana anterior"
              onPress={() => irParaSemana(-7)}
              className="h-9 w-9 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-lg text-foreground">‹</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Próxima semana"
              onPress={() => irParaSemana(7)}
              className="h-9 w-9 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-lg text-foreground">›</Text>
            </Pressable>
          </View>
        </View>

        {/* Faixa horizontal dos 7 dias da semana. */}
        <View className="border-b border-border pb-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {diasDaSemana.map((dia) => {
              const selecionado = isSameDay(dia, diaSelecionado)
              const ehHoje = isSameDay(dia, hoje)
              return (
                <Pressable
                  key={toISODate(dia)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selecionado }}
                  onPress={() => setDiaSelecionado(dia)}
                  className={cn(
                    'h-16 w-12 items-center justify-center rounded-xl border',
                    selecionado
                      ? 'bg-primary border-primary'
                      : 'bg-card border-border',
                  )}
                >
                  {/* Nome curto do dia (dom, seg, ...). */}
                  <Text
                    className={cn(
                      'text-[11px] font-medium',
                      selecionado ? 'text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {formatDiaSemana(dia)}
                  </Text>
                  {/* Número do dia. */}
                  <Text
                    className={cn(
                      'text-base font-bold',
                      selecionado ? 'text-primary-foreground' : 'text-foreground',
                    )}
                  >
                    {dia.getDate()}
                  </Text>
                  {/* Marcador de "hoje" quando não está selecionado (selecionado já tem destaque). */}
                  {ehHoje && !selecionado ? (
                    <View className="mt-0.5 h-1 w-1 rounded-full bg-primary" />
                  ) : (
                    <View className="mt-0.5 h-1 w-1" />
                  )}
                </Pressable>
              )
            })}
          </ScrollView>
        </View>

        {/* Corpo: estados de carregamento/erro/vazio + lista de eventos. */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Text className="text-center text-muted-foreground">
              Não foi possível carregar a agenda.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="h-9 px-4 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-foreground font-medium">Tentar novamente</Text>
            </Pressable>
          </View>
        ) : eventosDoDia.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-muted-foreground">Nenhum evento neste dia</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {eventosDoDia.map((evento) => (
              <EventoCard
                key={evento.id}
                evento={evento}
                // Realça o card aberto no painel direito (só ocorre no modo largo).
                selecionado={isWide && evento.id === selecionadoId}
                onPress={() => abrirEvento(evento.id)}
              />
            ))}
          </ScrollView>
        )}
    </View>
  )

  // Painel direito (só no modo largo): detalhe embutido ou estado vazio.
  const painelDetalhe = (
    <View className="flex-1">
      {selecionadoId ? (
        <EventoDetalhe
          // Remonta ao trocar de evento (reseta queries/estado internos).
          key={selecionadoId}
          id={selecionadoId}
          embutido
          onAposExcluir={() => setSelecionadoId(null)}
        />
      ) : (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-center text-muted-foreground">Selecione um evento</Text>
        </View>
      )}
    </View>
  )

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {isWide ? (
        // Tablet/tela larga: master-detail lado a lado.
        <View className="flex-1 flex-row">
          {painelLista}
          {painelDetalhe}
        </View>
      ) : (
        // Celular: apenas a lista (toque navega pra /agenda/[id]).
        painelLista
      )}

      {/* FAB: criar novo evento (em ambos os modos). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo evento"
        onPress={() => router.push('/agenda/novo')}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
      >
        <Text className="text-3xl leading-none text-primary-foreground">+</Text>
      </Pressable>
    </SafeAreaView>
  )
}

/** Card de um evento na lista do dia. Borda esquerda colorida pelo tipo. */
function EventoCard({
  evento,
  onPress,
  selecionado = false,
}: {
  evento: EventoAgenda
  onPress: () => void
  /** Realça o card quando aberto no painel direito (modo master-detail). */
  selecionado?: boolean
}) {
  // `tipo` pode vir ausente — resolveTipoCores trata null com fallback seguro.
  const cores = resolveTipoCores(evento.tipo)

  // Horário: "Dia inteiro" ou "HH:MM–HH:MM" (omite traço se faltar uma das pontas).
  const horario = evento.diaInteiro
    ? 'Dia inteiro'
    : [formatHora(evento.horaInicio), formatHora(evento.horaFim)].filter(Boolean).join(' – ')

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">
      <Card
        // Borda esquerda colorida via style — cor dinâmica do tipo (não dá pra Tailwind).
        // Realce do selecionado via tokens semânticos (preserva o dark mode).
        className={cn(selecionado && 'border-primary bg-muted/40')}
        style={{ borderLeftWidth: 4, borderLeftColor: cores.bg }}
      >
        <CardContent className="p-4 gap-1">
          <Text className="text-foreground font-semibold" numberOfLines={2}>
            {evento.titulo}
          </Text>

          {horario ? (
            <Text className="text-sm text-muted-foreground">{horario}</Text>
          ) : null}

          {evento.local ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={1}>
              {evento.local}
            </Text>
          ) : null}
        </CardContent>
      </Card>
    </Pressable>
  )
}
