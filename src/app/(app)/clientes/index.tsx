// Lista de CLIENTES (rota /clientes) — espelha a listagem do sistema web.
//
// Gated por podeVer('clientes') no Drawer; o backend revalida em cliente.list.
// Busca full-text (razão/fantasia) + filtro de situação. Cada cliente é um card
// tocável que abre o detalhe (abas Detalhes/Comercial/Fiscal). FAB cria.

import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useRouter } from 'expo-router'

import { SITUACAO_COLORS, SITUACAO_LABELS, type ClienteSituacao } from '@saas/types'

import { AppScreen } from '@/components/navigation/app-screen'
import { MenuButton } from '@/components/navigation/menu-button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'
import { formatDocumento, tributacaoLabel } from '@/features/clientes/labels'

type ClienteResumo = {
  id: string
  code?: number | string | null
  razaoSocial: string
  nomeFantasia?: string | null
  documento?: string | null
  situacao?: string | null
  tributacao?: string | null
  cidade?: string | null
  uf?: string | null
}

const SITUACOES = Object.keys(SITUACAO_LABELS) as ClienteSituacao[]

export default function ClientesScreen() {
  const router = useRouter()
  const [busca, setBusca] = useState('')
  // Inicia com o filtro "Mensal" marcado (pedido do negócio).
  const [situacao, setSituacao] = useState<ClienteSituacao | null>('MENSAL')

  const query = trpc.cliente.list.useQuery({
    page: 1,
    limit: 50,
    // Ordem alfabética por razão social.
    sortBy: 'razaoSocial',
    sortDir: 'asc',
    search: busca.trim() || undefined,
    ...(situacao ? { situacao } : {}),
  })
  const { isPending, isError, refetch } = query

  const pagina = query.data as { data: ClienteResumo[]; total: number } | undefined
  const clientes = pagina?.data ?? []
  const total = pagina?.total ?? 0

  return (
    <AppScreen>
      <View className="w-full max-w-2xl mx-auto flex-1">
        {/* Header */}
        <View className="flex-row items-center gap-2 px-4 pt-2 pb-3">
          <MenuButton />
          <View className="flex-1 pl-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Cadastros</Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Clientes</Text>
          </View>
          {!isPending && !isError ? (
            <Text className="text-xs text-muted-foreground">
              {total} {total === 1 ? 'cliente' : 'clientes'}
            </Text>
          ) : null}
        </View>

        {/* Busca + filtro de situação */}
        <View className="gap-2 pb-3 border-b border-border">
          <View className="px-4">
            <Input
              value={busca}
              onChangeText={setBusca}
              placeholder="Buscar por razão social ou fantasia…"
              autoCapitalize="none"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          >
            <Chip ativo={situacao === null} label="Todas" onPress={() => setSituacao(null)} />
            {SITUACOES.map((s) => (
              <Chip
                key={s}
                ativo={situacao === s}
                label={SITUACAO_LABELS[s]}
                onPress={() => setSituacao(s)}
              />
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
              Não foi possível carregar os clientes.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="h-9 px-4 items-center justify-center rounded-md border border-border bg-card active:opacity-70"
            >
              <Text className="text-foreground font-medium">Tentar novamente</Text>
            </Pressable>
          </View>
        ) : clientes.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-muted-foreground">Nenhum cliente encontrado</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 10 }}
            showsVerticalScrollIndicator={false}
          >
            {clientes.map((c) => (
              <ClienteCard key={c.id} cliente={c} onPress={() => router.push(`/clientes/${c.id}` as never)} />
            ))}
          </ScrollView>
        )}
      </View>

      {/* FAB: novo cliente */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo cliente"
        onPress={() => router.push('/clientes/novo' as never)}
        className="absolute bottom-4 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg active:opacity-80"
      >
        <Text className="text-3xl leading-none text-primary-foreground">+</Text>
      </Pressable>
    </AppScreen>
  )
}

function Chip({ ativo, label, onPress }: { ativo: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      className={cn(
        'h-8 px-3 items-center justify-center rounded-full border active:opacity-80',
        ativo ? 'bg-primary border-primary' : 'bg-card border-border',
      )}
    >
      <Text className={cn('text-xs font-medium', ativo ? 'text-primary-foreground' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  )
}

function ClienteCard({ cliente, onPress }: { cliente: ClienteResumo; onPress: () => void }) {
  const sit = cliente.situacao as ClienteSituacao | null
  const cor = sit ? SITUACAO_COLORS[sit] : null
  const doc = formatDocumento(cliente.documento)
  const local = [cliente.cidade, cliente.uf].filter(Boolean).join(' / ')
  const trib = tributacaoLabel(cliente.tributacao)

  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">
      <Card>
        <CardContent className="p-3 gap-1.5">
          <View className="flex-row items-start gap-2">
            <Text className="flex-1 text-foreground font-semibold" numberOfLines={2}>
              {cliente.razaoSocial}
            </Text>
            {sit && cor ? (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: cor.bg }}>
                <Text className="text-[10px] font-bold" style={{ color: cor.color }}>
                  {SITUACAO_LABELS[sit]}
                </Text>
              </View>
            ) : null}
          </View>

          {cliente.nomeFantasia ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {cliente.nomeFantasia}
            </Text>
          ) : null}

          <View className="flex-row items-center flex-wrap gap-x-3 gap-y-0.5">
            {doc ? <Text className="text-[11px] text-muted-foreground">{doc}</Text> : null}
            {trib ? <Text className="text-[11px] text-muted-foreground">{trib}</Text> : null}
            {local ? <Text className="text-[11px] text-muted-foreground">{local}</Text> : null}
          </View>
        </CardContent>
      </Card>
    </Pressable>
  )
}
