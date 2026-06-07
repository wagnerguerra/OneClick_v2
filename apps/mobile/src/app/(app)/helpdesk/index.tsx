// Tela de lista do Helpdesk (rota /helpdesk) — "meus chamados".
//
// Espelha o módulo do sistema: filtro de status por chips horizontais e lista
// dos tickets do solicitante logado. Cada ticket é um Card tocável que leva ao
// detalhe (/helpdesk/[id]). FAB "+" cria um novo chamado (/helpdesk/novo).

import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'

import {
  HELPDESK_STATUS,
  HELPDESK_STATUS_LABELS,
  HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_PRIORIDADE_COLORS,
  type HelpdeskStatus,
  type HelpdeskPrioridade,
} from '@saas/types'

import { MenuButton } from '@/components/navigation/menu-button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'
import { HELPDESK_STATUS_CLASSES } from '@/features/helpdesk/status-colors'

export default function HelpdeskScreen() {
  const router = useRouter()

  // Filtro de status ativo. `null` = "Todos" (sem filtro).
  const [filtroStatus, setFiltroStatus] = useState<HelpdeskStatus | null>(null)

  // Busca os tickets do solicitante logado. `incluirHistorico` traz também os
  // arquivados — coerente com a visão "meus chamados" do sistema.
  const query = trpc.helpdesk.listMeus.useQuery({
    status: filtroStatus ? [filtroStatus] : undefined,
    incluirHistorico: true,
  })
  const { isPending, isError, refetch } = query
  // Estreita o tipo pro shape que a UI consome — o retorno inferido do tRPC é
  // profundo demais e estoura o instanciador de tipos do TS (TS2589) ao mapear.
  const data = query.data as TicketResumo[] | undefined

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="w-full max-w-2xl mx-auto flex-1">
        {/* Header: botão de menu (abre o Drawer) + título. */}
        <View className="flex-row items-center gap-2 px-4 pt-2 pb-3">
          <MenuButton />
          <View className="flex-1 pl-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">
              Suporte
            </Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Helpdesk</Text>
          </View>
        </View>

        {/* Filtro de status: chips horizontais (Todos + cada status). */}
        <View className="border-b border-border pb-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {/* Chip "Todos" — desativa o filtro. */}
            <ChipStatus
              ativo={filtroStatus === null}
              label="Todos"
              onPress={() => setFiltroStatus(null)}
            />
            {HELPDESK_STATUS.map((status) => (
              <ChipStatus
                key={status}
                ativo={filtroStatus === status}
                label={HELPDESK_STATUS_LABELS[status]}
                onPress={() => setFiltroStatus(status)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Corpo: carregamento / erro / vazio / lista. */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Text className="text-center text-muted-foreground">
              Não foi possível carregar os chamados.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="h-9 px-4 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-foreground font-medium">Tentar novamente</Text>
            </Pressable>
          </View>
        ) : (data?.length ?? 0) === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-muted-foreground">Nenhum chamado</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {(data ?? []).map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                onPress={() => router.push(`/helpdesk/${ticket.id}`)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* FAB: abrir um novo chamado. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo chamado"
        onPress={() => router.push('/helpdesk/novo')}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
      >
        <Text className="text-3xl leading-none text-primary-foreground">+</Text>
      </Pressable>
    </SafeAreaView>
  )
}

/** Chip de filtro de status (pill). Ativo = primary; inativo = card/borda. */
function ChipStatus({
  ativo,
  label,
  onPress,
}: {
  ativo: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      className={cn(
        'h-9 px-3 items-center justify-center rounded-full border active:opacity-80',
        ativo ? 'bg-primary border-primary' : 'bg-card border-border',
      )}
    >
      <Text
        className={cn(
          'text-sm font-medium',
          ativo ? 'text-primary-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// Shape mínimo do ticket retornado por `helpdesk.listMeus` que a UI consome.
// Derivado do retorno do service (não inferimos via tipos da API pra evitar
// acoplamento de tipos profundos do tRPC nesta tela de lista).
type TicketResumo = {
  id: string
  numero: number
  titulo: string
  status: HelpdeskStatus
  prioridade: HelpdeskPrioridade
  createdAt: string | Date
  updatedAt: string | Date
  categoria?: { nome: string } | null
}

/** Card de um ticket na lista. Mostra número+título, status, prioridade, categoria e data. */
function TicketCard({
  ticket,
  onPress,
}: {
  ticket: TicketResumo
  onPress: () => void
}) {
  const statusClasses = HELPDESK_STATUS_CLASSES[ticket.status]
  const prioridadeColor = HELPDESK_PRIORIDADE_COLORS[ticket.prioridade]

  // Data de referência: última atualização (fallback pra criação), em pt-BR.
  const dataRef = new Date(ticket.updatedAt ?? ticket.createdAt)
  const dataFmt = dataRef.toLocaleDateString('pt-BR')

  // Número visível no padrão do sistema (#HLPNNNN).
  const numeroFmt = `#HLP${String(ticket.numero).padStart(4, '0')}`

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">
      <Card>
        <CardContent className="p-4 pt-4 gap-2">
          {/* Linha 1: número + título. */}
          <View className="gap-0.5">
            <Text className="text-xs text-muted-foreground">{numeroFmt}</Text>
            <Text className="text-foreground font-semibold" numberOfLines={2}>
              {ticket.titulo}
            </Text>
          </View>

          {/* Linha 2: badge de status + prioridade colorida. */}
          <View className="flex-row items-center gap-2">
            <View className={cn('rounded-full px-2.5 py-0.5', statusClasses.bg)}>
              <Text className={cn('text-xs font-semibold', statusClasses.text)}>
                {HELPDESK_STATUS_LABELS[ticket.status]}
              </Text>
            </View>
            <Text className="text-xs font-semibold" style={{ color: prioridadeColor }}>
              {HELPDESK_PRIORIDADE_LABELS[ticket.prioridade]}
            </Text>
          </View>

          {/* Linha 3: categoria (se houver) + data. */}
          <View className="flex-row items-center justify-between">
            {ticket.categoria?.nome ? (
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {ticket.categoria.nome}
              </Text>
            ) : (
              <View />
            )}
            <Text className="text-xs text-muted-foreground">{dataFmt}</Text>
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
}
