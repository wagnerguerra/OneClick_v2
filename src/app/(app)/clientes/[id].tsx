// Detalhe do CLIENTE (rota /clientes/[id]) — preserva a estrutura de ABAS de topo
// e PILLS dentro de cada aba, como no sistema web. v1 cobre as abas com dados do
// getById: Detalhes (Dados Gerais / Endereço / Contato), Comercial (Cadastro /
// Observações) e Fiscal (Tributação / Inscrições). Editar/Excluir são gated por
// permissão (write/delete) — o backend revalida.

import { useMemo, useState } from 'react'
import { Alert, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'

import {
  SITUACAO_COLORS,
  SITUACAO_LABELS,
  STATUS_LABELS,
  REGIME_LABELS,
  type ClienteSituacao,
  type ClienteStatus,
} from '@saas/types'

import { trpc } from '@/lib/trpc'
import { usePermissions } from '@/lib/use-permissions'
import { cn } from '@/lib/cn'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { HtmlView } from '@/components/ui/html-view'
import {
  formatDocumento,
  parseAreas,
  tributacaoLabel,
  TIPO_CLIENTE_LABELS,
} from '@/features/clientes/labels'

// Abas de topo (espelham o web) e as pills internas de cada uma.
const ABAS = [
  { key: 'detalhes', label: 'Detalhes', pills: ['Dados Gerais', 'Endereço', 'Contato'] },
  { key: 'comercial', label: 'Comercial', pills: ['Cadastro', 'Observações'] },
  { key: 'fiscal', label: 'Fiscal', pills: ['Tributação', 'Inscrições'] },
] as const

type AbaKey = (typeof ABAS)[number]['key']

function fmtData(v: unknown): string | null {
  if (!v) return null
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR')
}

export default function ClienteDetalheScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { podeAcao } = usePermissions()

  const query = trpc.cliente.getById.useQuery({ id })

  const [aba, setAba] = useState<AbaKey>('detalhes')
  const [pill, setPill] = useState(0)

  const remover = trpc.cliente.delete.useMutation({
    onSuccess: () => {
      utils.cliente.list.invalidate()
      router.back()
    },
    onError: (e) => Alert.alert('Não foi possível excluir', e.message),
  })

  const abaAtual = useMemo(() => ABAS.find((a) => a.key === aba)!, [aba])

  if (query.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-6">
          <Spinner />
        </View>
      </SafeAreaView>
    )
  }
  if (query.isError || !query.data) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-base text-muted-foreground">Cliente não encontrado</Text>
          <Button variant="outline" size="sm" onPress={() => router.back()}>
            ‹ Voltar
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  const c = query.data as Record<string, any>
  const sit = c.situacao as ClienteSituacao | null
  const cor = sit ? SITUACAO_COLORS[sit] : null
  const podeEditar = podeAcao('clientes', 'write')
  const podeExcluir = podeAcao('clientes', 'delete')

  function confirmarExclusao() {
    Alert.alert('Excluir cliente', `Mover "${c.razaoSocial}" para a lixeira?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => remover.mutate({ id }) },
    ])
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Topo: voltar + ações */}
      <View className="flex-row items-center justify-between px-4 pt-2">
        <Button variant="ghost" size="sm" className="px-0" onPress={() => router.back()}>
          ‹ Voltar
        </Button>
        <View className="flex-row items-center gap-2">
          {podeEditar ? (
            <Button
              variant="outline"
              size="sm"
              onPress={() => router.push(`/clientes/novo?id=${id}` as never)}
            >
              Editar
            </Button>
          ) : null}
          {podeExcluir ? (
            <Button variant="destructive" size="sm" loading={remover.isPending} onPress={confirmarExclusao}>
              Excluir
            </Button>
          ) : null}
        </View>
      </View>

      {/* Cabeçalho do cliente */}
      <View className="px-4 pt-2 pb-3 gap-1">
        <View className="flex-row items-center gap-2">
          <Text className="flex-1 text-xl font-bold text-foreground" numberOfLines={2}>
            {c.razaoSocial}
          </Text>
          {sit && cor ? (
            <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: cor.bg }}>
              <Text className="text-[11px] font-bold" style={{ color: cor.color }}>
                {SITUACAO_LABELS[sit]}
              </Text>
            </View>
          ) : null}
        </View>
        {c.nomeFantasia ? <Text className="text-sm text-muted-foreground">{c.nomeFantasia}</Text> : null}
        {c.documento ? (
          <Text className="text-xs text-muted-foreground">{formatDocumento(c.documento)}</Text>
        ) : null}
      </View>

      {/* Abas de topo (pills) */}
      <View className="border-b border-border">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 10 }}>
          {ABAS.map((a) => (
            <Selecionavel
              key={a.key}
              ativo={aba === a.key}
              label={a.label}
              onPress={() => {
                setAba(a.key)
                setPill(0)
              }}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
        {/* Pills internas da aba */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {abaAtual.pills.map((p, i) => (
            <Selecionavel key={p} ativo={pill === i} label={p} tom="suave" onPress={() => setPill(i)} />
          ))}
        </ScrollView>

        {/* Conteúdo da pill ativa */}
        <Card>
          <CardContent className="p-4 gap-0">
            {aba === 'detalhes' && pill === 0 ? (
              <>
                <Campo label="Razão social" valor={c.razaoSocial} />
                <Campo label="Nome fantasia" valor={c.nomeFantasia} />
                <Campo label="Documento" valor={formatDocumento(c.documento)} />
                {/* Só exibe tipo de cliente quando mapeável (ignora códigos legados como "1"). */}
                <Campo label="Tipo de cliente" valor={c.tipoCliente ? TIPO_CLIENTE_LABELS[c.tipoCliente] ?? null : null} />
                <Campo label="Situação" valor={sit ? SITUACAO_LABELS[sit] : null} />
                <Campo label="Status" valor={c.status ? STATUS_LABELS[c.status as ClienteStatus] ?? c.status : null} />
              </>
            ) : null}

            {aba === 'detalhes' && pill === 1 ? (
              <>
                <Campo label="CEP" valor={c.cep} />
                <Campo label="Logradouro" valor={c.logradouro} />
                <Campo label="Número" valor={c.numero} />
                <Campo label="Complemento" valor={c.complemento} />
                <Campo label="Bairro" valor={c.bairro} />
                <Campo label="Cidade" valor={c.cidade} />
                <Campo label="UF" valor={c.uf} />
              </>
            ) : null}

            {aba === 'detalhes' && pill === 2 ? (
              <>
                <Campo label="Telefone" valor={c.telefone} />
                <Campo label="E-mail" valor={c.email} />
              </>
            ) : null}

            {aba === 'comercial' && pill === 0 ? (
              <>
                <Campo label="Grupo" valor={c.grupo} />
                <Campo label="Categoria" valor={c.categoria && c.categoria !== 'NAO_INFORMADO' ? c.categoria : null} />
                <Campo label="Origem" valor={c.origem} />
                <Campo label="Entrada" valor={fmtData(c.dataEntrada)} />
                <Campo label="Saída" valor={fmtData(c.dataSaida)} />
                <Campo label="Áreas contratadas" valor={parseAreas(c.areasContratadas).join(' · ') || null} />
              </>
            ) : null}

            {aba === 'comercial' && pill === 1 ? (
              c.observacoes ? (
                <HtmlView html={String(c.observacoes)} />
              ) : (
                <Text className="text-sm text-muted-foreground">Sem observações.</Text>
              )
            ) : null}

            {aba === 'fiscal' && pill === 0 ? (
              <>
                <Campo label="Tributação" valor={tributacaoLabel(c.tributacao)} />
                <Campo label="Regime" valor={c.regime ? REGIME_LABELS[c.regime as keyof typeof REGIME_LABELS] ?? c.regime : null} />
              </>
            ) : null}

            {aba === 'fiscal' && pill === 1 ? (
              <>
                <Campo label="Inscrição estadual" valor={c.inscricaoEstadual} />
                <Campo label="Inscrição municipal" valor={c.inscricaoMunicipal} />
              </>
            ) : null}
          </CardContent>
        </Card>
      </ScrollView>
    </SafeAreaView>
  )
}

/** Linha label + valor; não renderiza se o valor for vazio. */
function Campo({ label, valor }: { label: string; valor: string | null | undefined }) {
  if (!valor) return null
  return (
    <View className="py-2 border-b border-border/60">
      <Text className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Text className="text-sm text-foreground">{valor}</Text>
    </View>
  )
}

/** Pill selecionável (aba ou sub-seção). tom 'suave' = realce leve (pills internas). */
function Selecionavel({
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
        'h-9 px-3.5 items-center justify-center rounded-full border active:opacity-80',
        ativo
          ? tom === 'forte'
            ? 'bg-primary border-primary'
            : 'bg-primary/15 border-primary'
          : 'bg-card border-border',
      )}
    >
      <Text
        className={cn(
          'text-sm font-medium',
          ativo ? (tom === 'forte' ? 'text-primary-foreground' : 'text-primary') : 'text-muted-foreground',
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}
