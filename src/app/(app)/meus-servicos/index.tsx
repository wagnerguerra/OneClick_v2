// Painel "Meus Serviços" (rota /meus-servicos) — visão OPERACIONAL: execuções de
// serviço atribuídas/visíveis ao usuário logado (não é o cadastro de serviços).
//
// Espelha o painel do sistema web (servico.listMeusServicos), que aplica o escopo
// de visibilidade pessoal no backend (responsável direto, líder de área, par
// cliente×área, orçamento, master/diretor/coord veem tudo). O item do Drawer é
// gated por podeVer('meus-servicos'). Toque abre a execução (passos a concluir).

import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { PRIORIDADE_COLORS, PRIORIDADE_LABELS, type PrioridadeServico } from '@saas/types'

import { AppScreen } from '@/components/navigation/app-screen'
import { MenuButton } from '@/components/navigation/menu-button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'
import { statusClasses, statusLabel } from '@/features/servicos/execucao-status'

type Filtro = 'TODOS' | 'EM_ANDAMENTO' | 'ATRASADOS'

type PassoResumo = { concluido: boolean; ignorado: boolean; obrigatorio: boolean }
type ExecucaoResumo = {
  id: string
  status: string
  prioridade: string | null
  prazoLimite: string | Date | null
  servico?: { nome: string } | null
  cliente?: { razaoSocial: string } | null
  passos?: PassoResumo[]
}

const FILTROS: ReadonlyArray<{ value: Filtro; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'ATRASADOS', label: 'Atrasados' },
]

/** Progresso de uma execução: passos concluídos/ignorados sobre o total. */
function progresso(passos: PassoResumo[] | undefined) {
  const total = passos?.length ?? 0
  const feitos = (passos ?? []).filter((p) => p.concluido || p.ignorado).length
  return { feitos, total, pct: total ? feitos / total : 0 }
}

/** "Atrasado" quando o prazo passou e a execução ainda está em andamento. */
function estaAtrasado(e: ExecucaoResumo): boolean {
  if (!e.prazoLimite || e.status !== 'EM_ANDAMENTO') return false
  return new Date(e.prazoLimite).getTime() < Date.now()
}

export default function MeusServicosScreen() {
  const router = useRouter()
  const [filtro, setFiltro] = useState<Filtro>('TODOS')

  const input =
    filtro === 'EM_ANDAMENTO'
      ? { status: 'EM_ANDAMENTO' }
      : filtro === 'ATRASADOS'
        ? { atrasados: true }
        : {}

  const query = trpc.servico.listMeusServicos.useQuery(input)
  const { isPending, isError, refetch } = query
  const execucoes = (query.data as ExecucaoResumo[] | undefined) ?? []

  return (
    <AppScreen>
      <View className="w-full max-w-2xl mx-auto flex-1">
        {/* Header */}
        <View className="flex-row items-center gap-2 px-4 pt-2 pb-3">
          <MenuButton />
          <View className="flex-1 pl-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Administrativo</Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Meus serviços</Text>
          </View>
          {!isPending && !isError ? (
            <Text className="text-xs text-muted-foreground">
              {execucoes.length} {execucoes.length === 1 ? 'serviço' : 'serviços'}
            </Text>
          ) : null}
        </View>

        {/* Filtros */}
        <View className="border-b border-border pb-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            {FILTROS.map((f) => (
              <Pressable
                key={f.value}
                accessibilityRole="button"
                accessibilityState={{ selected: filtro === f.value }}
                onPress={() => setFiltro(f.value)}
                className={cn(
                  'h-9 px-3 items-center justify-center rounded-full border active:opacity-80',
                  filtro === f.value ? 'bg-primary border-primary' : 'bg-card border-border',
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-medium',
                    filtro === f.value ? 'text-primary-foreground' : 'text-muted-foreground',
                  )}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Corpo */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Text className="text-center text-muted-foreground">
              Não foi possível carregar seus serviços.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="h-9 px-4 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-foreground font-medium">Tentar novamente</Text>
            </Pressable>
          </View>
        ) : execucoes.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-muted-foreground">Nenhum serviço pra você por aqui 🎉</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {execucoes.map((e) => (
              <ExecucaoCard
                key={e.id}
                execucao={e}
                onPress={() => router.push(`/meus-servicos/${e.id}` as never)}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </AppScreen>
  )
}

/** Card de uma execução: serviço + cliente + status + prioridade + prazo + progresso. */
function ExecucaoCard({ execucao, onPress }: { execucao: ExecucaoResumo; onPress: () => void }) {
  const prioridade = execucao.prioridade as PrioridadeServico | null
  const sc = statusClasses(execucao.status)
  const { feitos, total, pct } = progresso(execucao.passos)
  const atrasado = estaAtrasado(execucao)
  const prazo = execucao.prazoLimite ? new Date(execucao.prazoLimite).toLocaleDateString('pt-BR') : null

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">
      <Card>
        <CardContent className="p-3 gap-2">
          <View className="flex-row items-start gap-2">
            <Text className="flex-1 text-foreground font-semibold" numberOfLines={2}>
              {execucao.servico?.nome ?? 'Serviço'}
            </Text>
            <View className={cn('rounded-full px-2 py-0.5', sc.bg)}>
              <Text className={cn('text-[10px] font-bold', sc.text)}>{statusLabel(execucao.status)}</Text>
            </View>
          </View>

          {execucao.cliente?.razaoSocial ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {execucao.cliente.razaoSocial}
            </Text>
          ) : null}

          {/* Barra de progresso */}
          {total > 0 ? (
            <View className="gap-1">
              <View className="h-1.5 rounded-full bg-muted overflow-hidden">
                <View
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(pct * 100)}%` }}
                />
              </View>
              <Text className="text-[11px] text-muted-foreground">
                {feitos}/{total} passos
              </Text>
            </View>
          ) : null}

          {/* Linha: prioridade + prazo */}
          <View className="flex-row items-center gap-3">
            {prioridade ? (
              <View className="flex-row items-center gap-1">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: PRIORIDADE_COLORS[prioridade] }} />
                <Text className="text-[11px] text-muted-foreground">{PRIORIDADE_LABELS[prioridade]}</Text>
              </View>
            ) : null}
            {prazo ? (
              <Text className={cn('text-[11px]', atrasado ? 'font-semibold text-red-500' : 'text-muted-foreground')}>
                {atrasado ? 'Atrasado · ' : 'Prazo '} {prazo}
              </Text>
            ) : null}
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
}
