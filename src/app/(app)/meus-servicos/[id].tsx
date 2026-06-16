// Detalhe/execução de "Meus Serviços" (rota /meus-servicos/[id]).
//
// Núcleo OPERACIONAL: lista os passos da execução (agrupados por etapa) e permite
// CONCLUIR/DESFAZER cada passo (servico.togglePasso) e, ao final, concluir o
// serviço inteiro (servico.concluirExecucao). Espelha o checklist de execução do
// sistema web. Acesso validado no backend (assertCanAccessExecucao).

import { Alert, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/cn'
import { Text } from '@/components/ui/text'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { statusClasses, statusLabel } from '@/features/servicos/execucao-status'

type Passo = {
  id: string
  ordem: number
  etapaNome: string | null
  passoNome: string | null
  obrigatorio: boolean
  concluido: boolean
  ignorado: boolean
  concluidoPorUsuario?: { name: string | null } | null
}

/** Agrupa os passos por etapa preservando a ordem de aparição. */
function agruparPorEtapa(passos: Passo[]): { etapa: string; passos: Passo[] }[] {
  const grupos: { etapa: string; passos: Passo[] }[] = []
  const idx = new Map<string, number>()
  for (const p of passos) {
    const key = p.etapaNome ?? 'Passos'
    if (!idx.has(key)) {
      idx.set(key, grupos.length)
      grupos.push({ etapa: key, passos: [] })
    }
    grupos[idx.get(key)!]!.passos.push(p)
  }
  return grupos
}

export default function MeuServicoExecucaoScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { id } = useLocalSearchParams<{ id: string }>()

  const query = trpc.servico.getExecucao.useQuery({ id })

  function invalidar() {
    utils.servico.getExecucao.invalidate({ id })
    utils.servico.listMeusServicos.invalidate()
  }

  const togglePasso = trpc.servico.togglePasso.useMutation({
    onSuccess: invalidar,
    onError: (e) => Alert.alert('Não foi possível atualizar o passo', e.message),
  })
  const concluir = trpc.servico.concluirExecucao.useMutation({
    onSuccess: () => {
      invalidar()
      router.back()
    },
    onError: (e) => Alert.alert('Não foi possível concluir', e.message),
  })

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
          <Text className="text-base text-muted-foreground">Serviço não encontrado</Text>
          <Button variant="outline" size="sm" onPress={() => router.back()}>
            ‹ Voltar
          </Button>
        </View>
      </SafeAreaView>
    )
  }

  const exec = query.data as {
    status: string
    prazoLimite: string | Date | null
    servico?: { nome: string; descricao: string | null } | null
    cliente?: { razaoSocial: string; documento: string | null } | null
    passos: Passo[]
  }

  const passos = exec.passos ?? []
  const total = passos.length
  const feitos = passos.filter((p) => p.concluido || p.ignorado).length
  const pct = total ? feitos / total : 0
  const grupos = agruparPorEtapa(passos)

  const sc = statusClasses(exec.status)
  const prazo = exec.prazoLimite ? new Date(exec.prazoLimite).toLocaleDateString('pt-BR') : null

  // Pode concluir o serviço quando está em andamento e todos os passos
  // OBRIGATÓRIOS já foram concluídos ou ignorados.
  const obrigatoriosPendentes = passos.some((p) => p.obrigatorio && !p.concluido && !p.ignorado)
  const podeConcluir = exec.status === 'EM_ANDAMENTO' && !obrigatoriosPendentes && total > 0

  const passoEmEdicao = togglePasso.isPending ? togglePasso.variables?.id : null

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="w-full max-w-2xl mx-auto p-4 gap-4">
          {/* Topo */}
          <View className="flex-row items-center justify-between">
            <Button variant="ghost" size="sm" className="px-0" onPress={() => router.back()}>
              ‹ Voltar
            </Button>
            <View className={cn('rounded-full px-2.5 py-0.5', sc.bg)}>
              <Text className={cn('text-xs font-semibold', sc.text)}>{statusLabel(exec.status)}</Text>
            </View>
          </View>

          {/* Cabeçalho: serviço + cliente + prazo + progresso */}
          <View className="gap-1">
            <Text className="text-2xl font-bold text-foreground">{exec.servico?.nome ?? 'Serviço'}</Text>
            {exec.cliente?.razaoSocial ? (
              <Text className="text-sm text-muted-foreground">{exec.cliente.razaoSocial}</Text>
            ) : null}
            {prazo ? <Text className="text-xs text-muted-foreground">Prazo: {prazo}</Text> : null}
          </View>

          {/* Progresso geral */}
          {total > 0 ? (
            <View className="gap-1">
              <View className="h-2 rounded-full bg-muted overflow-hidden">
                <View className="h-full rounded-full bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
              </View>
              <Text className="text-[11px] text-muted-foreground">
                {feitos} de {total} passos concluídos
              </Text>
            </View>
          ) : null}

          {/* Passos por etapa */}
          {grupos.map((grupo) => (
            <Card key={grupo.etapa}>
              <CardContent className="p-0">
                <Text className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {grupo.etapa}
                </Text>
                {grupo.passos.map((p, i) => (
                  <PassoRow
                    key={p.id}
                    passo={p}
                    primeira={i === 0}
                    carregando={passoEmEdicao === p.id}
                    desabilitado={togglePasso.isPending || exec.status !== 'EM_ANDAMENTO'}
                    onToggle={() => togglePasso.mutate({ id: p.id })}
                  />
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Concluir serviço */}
          {exec.status === 'EM_ANDAMENTO' ? (
            <Button
              loading={concluir.isPending}
              disabled={!podeConcluir}
              onPress={() =>
                Alert.alert('Concluir serviço', 'Marcar este serviço como concluído?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Concluir', onPress: () => concluir.mutate({ id }) },
                ])
              }
              className="mt-2"
            >
              {obrigatoriosPendentes ? 'Conclua os passos obrigatórios' : 'Concluir serviço'}
            </Button>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

/** Linha de um passo: checkbox + nome (+ obrigatório/ignorado/quem concluiu). */
function PassoRow({
  passo,
  primeira,
  carregando,
  desabilitado,
  onToggle,
}: {
  passo: Passo
  primeira: boolean
  carregando: boolean
  desabilitado: boolean
  onToggle: () => void
}) {
  const feito = passo.concluido
  const ignorado = passo.ignorado

  return (
    <View
      className={cn(
        'flex-row items-center gap-3 px-3 py-3',
        !primeira && 'border-t border-border',
      )}
    >
      {/* Checkbox */}
      <View accessibilityRole="button">
        {carregando ? (
          <Spinner size="small" />
        ) : (
          <Ionicons
            name={feito ? 'checkmark-circle' : ignorado ? 'remove-circle' : 'ellipse-outline'}
            size={24}
            color={feito ? '#10b981' : ignorado ? '#94a3b8' : '#94a3b8'}
            onPress={ignorado || desabilitado ? undefined : onToggle}
          />
        )}
      </View>

      <View className="flex-1">
        <Text
          className={cn(
            'text-sm',
            feito ? 'text-muted-foreground line-through' : ignorado ? 'text-muted-foreground' : 'text-foreground',
          )}
          numberOfLines={2}
        >
          {passo.passoNome ?? 'Passo'}
        </Text>
        <View className="flex-row items-center gap-2">
          {passo.obrigatorio ? (
            <Text className="text-[10px] font-medium text-amber-600">Obrigatório</Text>
          ) : (
            <Text className="text-[10px] text-muted-foreground">Opcional</Text>
          )}
          {ignorado ? <Text className="text-[10px] text-muted-foreground">· Ignorado</Text> : null}
          {feito && passo.concluidoPorUsuario?.name ? (
            <Text className="text-[10px] text-muted-foreground" numberOfLines={1}>
              · {passo.concluidoPorUsuario.name}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}
