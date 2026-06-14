// Tela inicial (Dashboard) pós-login — rota /dashboard.
//
// Identidade nova (referência aprovada):
//   • Logo OneClick centralizada no topo (clara/escura conforme o tema).
//   • Saudação personalizada + avatar do usuário.
//   • Card HERO coral com anel de progresso (plano de hoje, derivado das tarefas).
//   • KPIs numa única linha (Eventos, Tarefas e — só com permissão — Chamados).
//   • Agenda do dia (grade de 30 min) no lugar dos antigos "Atalhos": eventos de
//     HOJE em blocos coloridos pela COR DO TIPO do evento; hora atual destacada;
//     slot "Toque para adicionar um evento". Tocar num evento abre a Agenda.
//
// Segue o Design System: tokens semânticos (preserva dark mode), expo-image,
// Pressable/View/Text (RN). Dados reais via tRPC (sem mocks).

import { useMemo } from 'react'
import { Pressable, ScrollView, useColorScheme, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'

import { HELPDESK_STATUS_FINAIS, type HelpdeskStatus } from '@saas/types'

import { AppScreen } from '@/components/navigation/app-screen'
import { MenuButton } from '@/components/navigation/menu-button'
import { Spinner } from '@/components/ui/spinner'
import { StatCard } from '@/components/ui/stat-card'
import { Text } from '@/components/ui/text'
import { useSession } from '@/lib/auth-client'
import { usePermissions } from '@/lib/use-permissions'
import { trpc } from '@/lib/trpc'

import { toISODate } from '@/features/agenda/date'
import { resolveTipoCores } from '@/features/agenda/color'
import type { EventoAgenda } from '@/features/agenda/use-eventos'

// Logo OneClick do topo. Versão colorida (clara) e versão branca (pra fundo escuro).
const LOGO_TOPO = require('../../../../assets/images/logo_topo.png')
const LOGO_TOPO_DARK = require('../../../../assets/images/logo-light.png')

/** Iniciais (até 2 letras) a partir do nome — fallback do avatar. */
function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}

/** Saudação conforme a hora local (bom dia / boa tarde / boa noite). */
function saudacao(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function DashboardScreen() {
  const router = useRouter()
  const isDark = useColorScheme() === 'dark'
  const { data: session } = useSession()
  const { podeVer } = usePermissions()

  // Primeiro nome do usuário logado (quando disponível) para a saudação.
  const primeiroNome = session?.user?.name?.trim().split(/\s+/)[0] ?? ''
  const userImage = (session?.user as { image?: string | null } | undefined)?.image ?? null

  // Agora (capturado uma vez por render) — saudação + hora atual da grade.
  const agora = useMemo(() => new Date(), [])
  const hoje = useMemo(() => toISODate(agora), [agora])

  // ── KPIs (dados reais) ──────────────────────────────────────────
  // Eventos de hoje: intervalo de um único dia (início = fim = hoje).
  const eventosQuery = trpc.agenda.listEventos.useQuery({
    dataInicio: hoje,
    dataFim: hoje,
  })

  // Tarefas em aberto do usuário.
  const tarefasQuery = trpc.agenda.tarefa.list.useQuery({ apenasAbertas: true })
  // Total de tarefas (pra derivar o progresso do "plano de hoje").
  const tarefasTodasQuery = trpc.agenda.tarefa.list.useQuery({})

  // Meus chamados — filtramos depois pelos que ainda não estão em status final.
  const chamadosQuery = trpc.helpdesk.listMeus.useQuery({})

  // Conta apenas tickets cujo status NÃO é final (CONCLUIDO/CANCELADO).
  // Estreitamos o tipo para { status } antes de filtrar — o tipo inferido pelo
  // tRPC é profundo demais e dispara TS2589 (instanciação recursiva) no filter.
  const chamados = (chamadosQuery.data ?? []) as Array<{ status: HelpdeskStatus }>
  const chamadosAbertos = chamados.filter(
    (ticket) => !HELPDESK_STATUS_FINAIS.includes(ticket.status),
  ).length

  // Permissão de Helpdesk — controla o KPI/atalho de chamados.
  const temHelpdesk = podeVer('helpdesk')

  // Eventos de hoje normalizados (mesma forma que a tela Agenda consome).
  const eventosHoje: EventoAgenda[] = useMemo(() => {
    return (eventosQuery.data ?? []).map((ev) => ({
      ...ev,
      data: String(ev.data).slice(0, 10),
    })) as EventoAgenda[]
  }, [eventosQuery.data])

  // ── Progresso do "plano de hoje" (derivado das tarefas) ──────────
  const totalTarefas = tarefasTodasQuery.data?.length ?? 0
  const tarefasAbertas = tarefasQuery.data?.length ?? 0
  const feitas = Math.max(0, totalTarefas - tarefasAbertas)
  const progresso = totalTarefas > 0 ? feitas / totalTarefas : 0

  return (
    <AppScreen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="w-full max-w-3xl mx-auto p-4 gap-5">
          {/* ── Logo OneClick no topo (centralizada) ── */}
          <View className="items-center pt-1">
            <Image
              source={isDark ? LOGO_TOPO_DARK : LOGO_TOPO}
              style={{ width: 150, height: 44 }}
              contentFit="contain"
              transition={150}
            />
          </View>

          {/* ── Cabeçalho: menu + saudação + avatar ── */}
          <View className="flex-row items-center gap-2">
            <MenuButton />
            <View className="flex-1 pl-1">
              <Text className="text-2xl font-bold leading-tight text-primary">
                {primeiroNome ? `${saudacao(agora)}, ${primeiroNome}!` : `${saudacao(agora)}!`}
              </Text>
              <Text className="text-[13px] text-muted-foreground">
                Vamos começar o seu dia
              </Text>
            </View>
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
                  {iniciais(session?.user?.name)}
                </Text>
              </View>
            )}
          </View>

          {/* ── Card HERO coral com anel de progresso ── */}
          <View className="flex-row items-center gap-4 rounded-3xl bg-accent p-5">
            <View className="flex-1">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-accent-foreground/80">
                Plano de hoje
              </Text>
              <Text className="mt-0.5 text-lg font-bold leading-tight text-accent-foreground">
                {feitas} de {totalTarefas} concluídas
              </Text>
              <Text className="mt-1 text-[12px] text-accent-foreground/85">
                Continue assim, falta pouco!
              </Text>
            </View>
            <ProgressRing progress={progresso} />
          </View>

          {/* ── KPIs em UMA linha (cards compactos lado a lado) ── */}
          <View className="flex-row gap-2">
            <KpiCard
              label="Eventos"
              icon="calendar"
              loading={eventosQuery.isPending}
              value={eventosQuery.isError ? 0 : eventosQuery.data?.length ?? 0}
            />
            <KpiCard
              label="Tarefas"
              icon="checkbox"
              loading={tarefasQuery.isPending}
              value={tarefasQuery.isError ? 0 : tarefasAbertas}
            />
            {/* Card de Chamados só com permissão de Helpdesk (master inclui). */}
            {temHelpdesk ? (
              <KpiCard
                label="Chamados"
                icon="chatbubbles"
                loading={chamadosQuery.isPending}
                value={chamadosQuery.isError ? 0 : chamadosAbertos}
              />
            ) : null}
          </View>

          {/* ── Agenda do dia (substitui "Atalhos") ── */}
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-[13px] font-semibold text-foreground">Agenda de hoje</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/agenda')}
                className="active:opacity-70"
              >
                <Text className="text-[12px] font-semibold text-primary">Ver tudo</Text>
              </Pressable>
            </View>

            <DayAgenda
              eventos={eventosHoje}
              loading={eventosQuery.isPending}
              isDark={isDark}
              onVerEvento={(id) => router.push(`/agenda/${id}`)}
              onAdicionar={() => router.push('/agenda/novo')}
            />
          </View>
        </View>
      </ScrollView>
    </AppScreen>
  )
}

/**
 * Anel de progresso circular SEM dependências (sem react-native-svg).
 *
 * Técnica do "pie" com dois semicírculos giratórios sobre um trilho:
 *   - Trilho: anel completo translúcido (borda grossa).
 *   - Progresso (warning/amarelo): dois semicírculos clipados que, girados, varrem
 *     de 0 a 360°. Até 50% gira só a metade direita; acima de 50% a metade
 *     direita fica fixa a 180° e a esquerda completa o restante.
 * O percentual fica centralizado por cima. Sobre o card coral (accent).
 */
function ProgressRing({ progress }: { progress: number }) {
  const size = 72
  const stroke = 8
  const p = Math.max(0, Math.min(1, progress))
  const half = size / 2
  const corBar = '#fbbf24' // warning
  const corTrilho = 'rgba(255,255,255,0.25)'

  // Ângulos das duas metades (cada uma cobre no máx. 180°).
  const grausDireita = Math.min(p, 0.5) * 360 // 0..180
  const grausEsquerda = Math.max(0, p - 0.5) * 360 // 0..180

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      {/* Trilho (anel completo). */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: stroke,
          borderColor: corTrilho,
        }}
      />

      {/* Metade ESQUERDA do progresso (clip à esquerda). */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: half,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: half,
            height: size,
            transform: [{ rotate: `${grausEsquerda}deg` }],
          }}
        >
          <ArcoSemi lado="esquerda" size={size} stroke={stroke} cor={corBar} />
        </View>
      </View>

      {/* Metade DIREITA do progresso (clip à direita). */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: half,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: half,
            height: size,
            transform: [{ rotate: `${grausDireita}deg` }],
          }}
        >
          <ArcoSemi lado="direita" size={size} stroke={stroke} cor={corBar} />
        </View>
      </View>

      {/* Percentual central. */}
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-base font-bold text-accent-foreground">
          {Math.round(p * 100)}%
        </Text>
      </View>
    </View>
  )
}

/** Meio-anel (semicírculo) colorido — peça do ProgressRing. */
function ArcoSemi({
  lado,
  size,
  stroke,
  cor,
}: {
  lado: 'esquerda' | 'direita'
  size: number
  stroke: number
  cor: string
}) {
  const half = size / 2
  // Renderiza o anel inteiro e desloca pra mostrar só a metade desejada.
  return (
    <View style={{ width: half, height: size, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          left: lado === 'direita' ? -half : 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: stroke,
          borderColor: cor,
        }}
      />
    </View>
  )
}

/**
 * Lista os eventos de HOJE (todos, em qualquer horário) — não mais uma grade
 * fixa de 09:00→12:30, que escondia eventos antes/depois da janela, dia-inteiro
 * ou em horário quebrado. Ordena dia-inteiro primeiro, depois por horaInicio.
 * Cada item é um bloco colorido pela cor do TIPO (mesma resolução da Agenda) com
 * o horário; sem eventos, mostra o atalho de adicionar. Tocar abre a Agenda.
 */
function DayAgenda({
  eventos,
  loading,
  isDark,
  onVerEvento,
  onAdicionar,
}: {
  eventos: EventoAgenda[]
  loading: boolean
  isDark: boolean
  onVerEvento: (id: string) => void
  onAdicionar: () => void
}) {
  // Ordena: dia-inteiro primeiro, depois por horaInicio crescente.
  const ordenados = useMemo(() => {
    return [...eventos].sort((a, b) => {
      if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1
      return (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '')
    })
  }, [eventos])

  if (loading) {
    return (
      <View className="items-center justify-center py-6">
        <Spinner />
      </View>
    )
  }

  if (ordenados.length === 0) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar um evento"
        onPress={onAdicionar}
        className="flex-row items-center gap-2.5 rounded-xl bg-muted p-3 active:opacity-80"
      >
        <View className="my-0.5 w-[3px] self-stretch rounded-full bg-muted-foreground" />
        <Text className="flex-1 text-[13px] text-muted-foreground">
          Nenhum evento hoje. Toque para adicionar.
        </Text>
      </Pressable>
    )
  }

  return (
    <View className="gap-1.5">
      {ordenados.map((ev) => (
        <EventoLinha key={ev.id} ev={ev} isDark={isDark} onPress={() => onVerEvento(ev.id)} />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar um evento"
        onPress={onAdicionar}
        className="flex-row items-center gap-2 rounded-xl bg-muted px-3 py-2 active:opacity-80"
      >
        <Text className="text-[13px] text-muted-foreground">+ Adicionar um evento</Text>
      </Pressable>
    </View>
  )
}

/** Bloco de um evento na lista do dia — tinta de fundo + barra na cor do tipo + horário. */
function EventoLinha({
  ev,
  isDark,
  onPress,
}: {
  ev: EventoAgenda
  isDark: boolean
  onPress: () => void
}) {
  const cores = resolveTipoCores(ev.tipo)
  const horario = ev.diaInteiro
    ? 'Dia inteiro'
    : [ev.horaInicio?.slice(0, 5), ev.horaFim?.slice(0, 5)].filter(Boolean).join(' – ')
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-stretch gap-2.5 rounded-xl pl-2.5 active:opacity-80"
      style={{ backgroundColor: tintHex(cores.bg, isDark ? 0.2 : 0.12) }}
    >
      <View className="my-2 w-[3px] rounded-full" style={{ backgroundColor: cores.bg }} />
      <View className="flex-1 py-2 pr-3">
        <Text className="text-[13px] font-semibold" numberOfLines={2} style={{ color: cores.bg }}>
          {ev.titulo}
        </Text>
        {horario ? (
          <Text
            className="mt-0.5 text-[11px] text-muted-foreground"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {horario}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

/** Converte um hex (#rrggbb ou #rgb) em rgba com o alpha dado (tinta de fundo). */
function tintHex(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(37,99,235,${alpha})`
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Wrapper do StatCard para os KPIs do dashboard: exibe um Spinner enquanto a
 * query carrega e, quando pronto, o valor numérico formatado. Ocupa o espaço
 * disponível para alinhar bem na linha (flex-1).
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
