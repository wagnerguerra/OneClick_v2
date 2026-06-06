// Tela de Tarefas (rota /tarefas) — listar, criar e concluir tarefas.
//
// Estilo Google Tasks: cada tarefa tem um checkbox redondo, título (riscado
// quando concluída), prazo por extenso (+ hora opcional) e um selo de prioridade.
// No topo: barra de criação rápida (título + data) e um toggle de filtro
// Abertas/Concluídas que controla o input da query da agenda.tarefa.list.

import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { MenuButton } from '@/components/navigation/menu-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/cn'
import { trpc } from '@/lib/trpc'

import { formatDiaMesExtenso, formatHora, fromISODate, toISODate } from '@/features/agenda/date'

// Filtro ativo da lista: tarefas em aberto ou já concluídas.
type Filtro = 'abertas' | 'concluidas'

type Prioridade = 'BAIXA' | 'NORMAL' | 'ALTA'

export default function TarefasScreen() {
  // Estado do filtro de listagem.
  const [filtro, setFiltro] = useState<Filtro>('abertas')

  // Campos do formulário de criação rápida. Data inicia em hoje (yyyy-MM-dd).
  const [titulo, setTitulo] = useState('')
  const [prazo, setPrazo] = useState(() => toISODate(new Date()))

  const utils = trpc.useUtils()

  // Lista de tarefas conforme o filtro ativo. Sem transformer: datas são string.
  const { data, isPending, isError, refetch } = trpc.agenda.tarefa.list.useQuery({
    apenasAbertas: filtro === 'abertas',
    apenasConcluidas: filtro === 'concluidas',
  })

  // Marca/desmarca a tarefa como concluída e revalida a lista.
  const toggleConcluida = trpc.agenda.tarefa.toggleConcluida.useMutation({
    onSuccess: () => {
      void utils.agenda.tarefa.list.invalidate()
    },
  })

  // Cria a tarefa, limpa o título e revalida a lista.
  const create = trpc.agenda.tarefa.create.useMutation({
    onSuccess: () => {
      setTitulo('')
      void utils.agenda.tarefa.list.invalidate()
    },
  })

  // Validação simples: título não-vazio (e não estamos no meio de outro create).
  const tituloLimpo = titulo.trim()
  function adicionar() {
    if (tituloLimpo.length === 0 || create.isPending) return
    create.mutate({ titulo: tituloLimpo, prazo })
  }

  const tarefas = data ?? []

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {/* Container centralizado e com largura máxima em telas largas/tablet. */}
      <View className="w-full max-w-2xl mx-auto flex-1">
        {/* Cabeçalho — botão de menu (abre o Drawer) à esquerda do título. */}
        <View className="flex-row items-center px-4 pt-2 pb-3">
          <MenuButton />
          <View className="flex-1 pl-1">
            <Text className="text-xs uppercase tracking-wide text-muted-foreground">Tarefas</Text>
            <Text className="text-xl sm:text-2xl font-bold text-foreground">Minhas tarefas</Text>
          </View>
        </View>

        {/* Barra de criação rápida. */}
        <View className="px-4 pb-3 gap-2">
          <Input
            value={titulo}
            onChangeText={setTitulo}
            placeholder="Nova tarefa..."
            returnKeyType="done"
            onSubmitEditing={adicionar}
          />
          <View className="flex-row items-end gap-2">
            <View className="flex-1 gap-1">
              <Label>Prazo</Label>
              <Input
                value={prazo}
                onChangeText={setPrazo}
                placeholder="aaaa-mm-dd"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Button
              onPress={adicionar}
              loading={create.isPending}
              disabled={tituloLimpo.length === 0}
            >
              Adicionar
            </Button>
          </View>
          {/* Erro de criação — texto simples em vermelho. */}
          {create.isError ? (
            <Text className="text-sm text-red-600">Não foi possível criar a tarefa.</Text>
          ) : null}
        </View>

        {/* Toggle de filtro Abertas / Concluídas. */}
        <View className="flex-row gap-2 px-4 pb-3">
          <Button
            size="sm"
            variant={filtro === 'abertas' ? 'default' : 'outline'}
            onPress={() => setFiltro('abertas')}
            className="flex-1"
          >
            Abertas
          </Button>
          <Button
            size="sm"
            variant={filtro === 'concluidas' ? 'default' : 'outline'}
            onPress={() => setFiltro('concluidas')}
            className="flex-1"
          >
            Concluídas
          </Button>
        </View>

        {/* Corpo: carregamento / erro / vazio / lista. */}
        {isPending ? (
          <View className="flex-1 items-center justify-center">
            <Spinner size="large" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6 gap-3">
            <Text className="text-center text-muted-foreground">
              Não foi possível carregar as tarefas.
            </Text>
            <Button variant="outline" size="sm" onPress={() => refetch()}>
              Tentar novamente
            </Button>
          </View>
        ) : tarefas.length === 0 ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-center text-muted-foreground">Nenhuma tarefa</Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 16, gap: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {tarefas.map((tarefa) => (
              <TarefaCard
                key={tarefa.id}
                id={tarefa.id}
                titulo={tarefa.titulo}
                prazo={tarefa.prazo}
                horaPrazo={tarefa.horaPrazo}
                concluida={tarefa.concluida}
                // O backend tipa prioridade como o enum Prisma; estreitamos para o nosso union.
                prioridade={tarefa.prioridade as Prioridade}
                onToggle={() =>
                  toggleConcluida.mutate({ id: tarefa.id, concluida: !tarefa.concluida })
                }
              />
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  )
}

// Mapeia a prioridade para o visual do selo. ALTA fica em vermelho.
const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  BAIXA: 'Baixa',
  NORMAL: 'Normal',
  ALTA: 'Alta',
}

/** Card de uma tarefa: checkbox redondo + título + prazo + selo de prioridade. */
function TarefaCard(props: {
  id: string
  titulo: string
  // O `prazo` vem como string ISO (datetime); usamos só a parte da data.
  prazo: string
  horaPrazo: string | null
  concluida: boolean
  prioridade: Prioridade
  onToggle: () => void
}) {
  const { titulo, prazo, horaPrazo, concluida, prioridade, onToggle } = props

  // Prazo por extenso (ex.: "6 de junho") + hora opcional.
  const dataExtenso = formatDiaMesExtenso(fromISODate(prazo.slice(0, 10)))
  const hora = formatHora(horaPrazo)
  const prazoTexto = hora ? `${dataExtenso} · ${hora}` : dataExtenso

  return (
    <Card>
      <CardContent className="p-4 flex-row items-start gap-3">
        {/* Checkbox redondo — preenche quando concluída. */}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: concluida }}
          onPress={onToggle}
          hitSlop={8}
          className={cn(
            'mt-0.5 h-6 w-6 items-center justify-center rounded-full border-2 active:opacity-70',
            concluida ? 'border-primary bg-primary' : 'border-border bg-transparent',
          )}
        >
          {concluida ? (
            <Text className="text-xs font-bold text-primary-foreground">✓</Text>
          ) : null}
        </Pressable>

        {/* Conteúdo da tarefa. */}
        <View className="flex-1 gap-1">
          <Text
            className={cn(
              'font-semibold',
              concluida ? 'line-through text-muted-foreground' : 'text-foreground',
            )}
            numberOfLines={2}
          >
            {titulo}
          </Text>
          <Text className="text-sm text-muted-foreground">{prazoTexto}</Text>
        </View>

        {/* Selo de prioridade. ALTA destaca em vermelho. */}
        {prioridade === 'ALTA' ? (
          <Badge className="bg-red-100">
            <Text className="text-xs font-semibold text-red-700">{PRIORIDADE_LABEL.ALTA}</Text>
          </Badge>
        ) : (
          <Badge variant={prioridade === 'NORMAL' ? 'secondary' : 'outline'}>
            {PRIORIDADE_LABEL[prioridade]}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
