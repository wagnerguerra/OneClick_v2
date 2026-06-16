// Catálogo de SERVIÇOS (rota /servicos) — espelha a listagem do sistema web.
//
// Visível no Drawer só p/ quem tem o módulo `servicos` (podeVer('servicos')); o
// backend revalida em servico.listServicos. Filtros: tipo (Comerciais/Internos/
// Todos) — vai na query — e cobrança (Todos/Mensal/Extra) + busca por nome, no
// cliente. Cada serviço é um card tocável que abre o cadastro/edição.

import { useMemo, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import {
  PRIORIDADE_COLORS,
  PRIORIDADE_LABELS,
  type PrioridadeServico,
} from '@saas/types'

import { AppScreen } from '@/components/navigation/app-screen'
import { MenuButton } from '@/components/navigation/menu-button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'

type ServicoTipo = 'comerciais' | 'internos' | 'todos'
type CobrancaFiltro = 'TODOS' | 'MENSAL' | 'EXTRA'

// Shape mínimo do serviço consumido pela lista (de servico.listServicos).
type ServicoResumo = {
  id: string
  nome: string
  descricao: string | null
  categoriaServico: string | null
  prioridadePadrao: string | null
  slaHoras: number | null
  valorPadrao: string | number | null
  disponivelOrcamento: boolean
  ehServicoInterno: boolean
  recorrenteMensal: boolean
  _count?: { execucoes?: number }
}

const TIPOS: ReadonlyArray<{ value: ServicoTipo; label: string }> = [
  { value: 'comerciais', label: 'Comerciais' },
  { value: 'internos', label: 'Internos' },
  { value: 'todos', label: 'Todos' },
]

const COBRANCAS: ReadonlyArray<{ value: CobrancaFiltro; label: string }> = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'EXTRA', label: 'Extra' },
]

/** Formata um valor em reais (vem como Decimal string do tRPC) pra "R$ 1.234,56". */
function formatBRL(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ServicosScreen() {
  const router = useRouter()

  const [tipo, setTipo] = useState<ServicoTipo>('comerciais')
  const [cobranca, setCobranca] = useState<CobrancaFiltro>('TODOS')
  const [busca, setBusca] = useState('')

  const query = trpc.servico.listServicos.useQuery({ tipo })
  const { isPending, isError, refetch } = query

  const todos = (query.data as ServicoResumo[] | undefined) ?? []

  // Filtros client-side: cobrança (categoriaServico) + busca por nome.
  const servicos = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return todos.filter((s) => {
      if (cobranca !== 'TODOS' && s.categoriaServico !== cobranca) return false
      if (q && !(s.nome ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [todos, cobranca, busca])

  return (
    <AppScreen>
      <View className="w-full max-w-2xl mx-auto flex-1">
        {/* Header */}
        <View className="flex-row items-center gap-2 px-4 pt-2 pb-3">
          <MenuButton />
          <View className="flex-1 pl-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Cadastros</Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Serviços</Text>
          </View>
          {!isPending && !isError ? (
            <Text className="text-xs text-muted-foreground">
              {servicos.length} {servicos.length === 1 ? 'serviço' : 'serviços'}
            </Text>
          ) : null}
        </View>

        {/* Busca + filtros */}
        <View className="px-4 pb-3 gap-2 border-b border-border">
          <Input
            value={busca}
            onChangeText={setBusca}
            placeholder="Buscar serviço pelo nome…"
            autoCapitalize="none"
          />
          <View className="flex-row gap-2">
            {TIPOS.map((t) => (
              <Chip key={t.value} ativo={tipo === t.value} label={t.label} onPress={() => setTipo(t.value)} />
            ))}
          </View>
          <View className="flex-row gap-2">
            {COBRANCAS.map((c) => (
              <Chip
                key={c.value}
                ativo={cobranca === c.value}
                label={c.label}
                onPress={() => setCobranca(c.value)}
                tom="suave"
              />
            ))}
          </View>
        </View>

        {/* Corpo */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Text className="text-center text-muted-foreground">
              Não foi possível carregar os serviços.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="h-9 px-4 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-foreground font-medium">Tentar novamente</Text>
            </Pressable>
          </View>
        ) : servicos.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-muted-foreground">Nenhum serviço encontrado</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {servicos.map((s) => (
              <ServicoCard
                key={s.id}
                servico={s}
                // Cast: typedRoutes ainda não gerou /servicos/novo (rota nova).
                onPress={() => router.push(`/servicos/novo?id=${s.id}` as never)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* FAB: novo serviço */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo serviço"
        onPress={() => router.push('/servicos/novo' as never)}
        className="absolute bottom-4 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
      >
        <Text className="text-3xl leading-none text-primary-foreground">+</Text>
      </Pressable>
    </AppScreen>
  )
}

/** Chip de filtro (pill). tom 'suave' = realce mais leve (linha secundária). */
function Chip({
  ativo,
  label,
  onPress,
  tom = 'forte',
}: {
  ativo: boolean
  label: string
  onPress: () => void
  tom?: 'forte' | 'suave'
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      className={cn(
        'h-8 px-3 items-center justify-center rounded-full border active:opacity-80',
        ativo
          ? tom === 'forte'
            ? 'bg-primary border-primary'
            : 'bg-primary/15 border-primary'
          : 'bg-card border-border',
      )}
    >
      <Text
        className={cn(
          'text-xs font-medium',
          ativo ? (tom === 'forte' ? 'text-primary-foreground' : 'text-primary') : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** Card de um serviço: nome + descrição + badges (cobrança, prioridade, interno, valor, SLA). */
function ServicoCard({ servico, onPress }: { servico: ServicoResumo; onPress: () => void }) {
  const prioridade = servico.prioridadePadrao as PrioridadeServico | null
  const valor = servico.disponivelOrcamento ? formatBRL(servico.valorPadrao) : null
  const ehMensal = servico.categoriaServico === 'MENSAL'

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">
      <Card>
        <CardContent className="p-3 gap-2">
          <View className="flex-row items-start gap-2">
            <Text className="flex-1 text-foreground font-semibold" numberOfLines={1}>
              {servico.nome}
            </Text>
            {servico.ehServicoInterno ? (
              <View className="rounded-full bg-violet-500/15 px-2 py-0.5">
                <Text className="text-[10px] font-bold text-violet-600">INTERNO</Text>
              </View>
            ) : null}
          </View>

          {servico.descricao ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={2}>
              {servico.descricao}
            </Text>
          ) : null}

          {/* Linha de badges */}
          <View className="flex-row items-center flex-wrap gap-2">
            <View className={cn('rounded-full px-2 py-0.5', ehMensal ? 'bg-blue-500/15' : 'bg-amber-500/15')}>
              <Text className={cn('text-[10px] font-bold', ehMensal ? 'text-blue-600' : 'text-amber-600')}>
                {ehMensal ? 'MENSAL' : 'EXTRA'}
              </Text>
            </View>

            {prioridade ? (
              <View className="flex-row items-center gap-1">
                <View
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: PRIORIDADE_COLORS[prioridade] }}
                />
                <Text className="text-[11px] text-muted-foreground">{PRIORIDADE_LABELS[prioridade]}</Text>
              </View>
            ) : null}

            {typeof servico.slaHoras === 'number' ? (
              <Text className="text-[11px] text-muted-foreground">SLA {servico.slaHoras}h</Text>
            ) : null}

            {valor ? <Text className="text-[11px] font-medium text-foreground">{valor}</Text> : null}

            {servico._count?.execucoes ? (
              <Text className="text-[11px] text-muted-foreground">
                {servico._count.execucoes} exec.
              </Text>
            ) : null}
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
}
