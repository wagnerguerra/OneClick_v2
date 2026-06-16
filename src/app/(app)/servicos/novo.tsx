// Tela de CRIAR/EDITAR serviço (rota /servicos/novo).
//
// Sem `id` = criação; com `id` = edição (busca via servico.getServico). Espelha a
// aba "Visão Geral" do sistema web no nível principal + uma seção "Configurações
// avançadas" (espelho do Acessórias). Fluxo/etapas/passos/grupos/vencimentos e
// atribuição de responsáveis ficam no sistema web por enquanto.

import { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import {
  PRIORIDADE_LABELS,
  TIPO_DIAS_ANTES_LABELS,
  type PrioridadeServico,
} from '@saas/types'

import { trpc } from '@/lib/trpc'
import { usePermissions } from '@/lib/use-permissions'
import { cn } from '@/lib/cn'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'

const PRIORIDADES = Object.keys(PRIORIDADE_LABELS) as PrioridadeServico[]

// No form os números ficam como string (TextInput) e são convertidos no submit.
const servicoFormSchema = z.object({
  nome: z.string().min(1, 'Informe o nome do serviço'),
  descricao: z.string(),
  categoriaServico: z.enum(['MENSAL', 'EXTRA']),
  prioridadePadrao: z.string(),
  slaHoras: z.string(),
  valorPadrao: z.string(),
  disponivelOrcamento: z.boolean(),
  ehServicoInterno: z.boolean(),
  ativo: z.boolean(),
  // Avançado
  mininome: z.string(),
  tempoPrevistoMinutos: z.string(),
  lembrarDiasAntes: z.string(),
  tipoDiasAntes: z.enum(['CORRIDOS', 'UTEIS']),
  sabadoEhUtil: z.boolean(),
  exigirRobo: z.boolean(),
  passivelDeMulta: z.boolean(),
  alertaGuiaNaoLida: z.boolean(),
  comentarioPadrao: z.string(),
})

type ServicoFormValues = z.infer<typeof servicoFormSchema>

/** Converte string numérica do form pra number|null (vazio = null). */
function numOuNull(s: string): number | null {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export default function ServicoNovoScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { podeAcao } = usePermissions()

  const { id } = useLocalSearchParams<{ id?: string }>()
  const isEdicao = !!id
  const [avancadoAberto, setAvancadoAberto] = useState(false)

  const servicoQuery = trpc.servico.getServico.useQuery({ id: id as string }, { enabled: isEdicao })

  const form = useForm<ServicoFormValues>({
    resolver: zodResolver(servicoFormSchema),
    defaultValues: {
      nome: '',
      descricao: '',
      categoriaServico: 'EXTRA',
      prioridadePadrao: 'MEDIA',
      slaHoras: '',
      valorPadrao: '',
      disponivelOrcamento: false,
      ehServicoInterno: false,
      ativo: true,
      mininome: '',
      tempoPrevistoMinutos: '',
      lembrarDiasAntes: '',
      tipoDiasAntes: 'CORRIDOS',
      sabadoEhUtil: false,
      exigirRobo: false,
      passivelDeMulta: false,
      alertaGuiaNaoLida: false,
      comentarioPadrao: '',
    },
  })
  const { control, reset, formState } = form
  const { errors } = formState

  useEffect(() => {
    const s = servicoQuery.data as Record<string, unknown> | null | undefined
    if (!s) return
    const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
    reset({
      nome: str(s.nome),
      descricao: str(s.descricao),
      categoriaServico: s.categoriaServico === 'MENSAL' ? 'MENSAL' : 'EXTRA',
      prioridadePadrao: str(s.prioridadePadrao) || 'MEDIA',
      slaHoras: str(s.slaHoras),
      valorPadrao: str(s.valorPadrao),
      disponivelOrcamento: !!s.disponivelOrcamento,
      ehServicoInterno: !!s.ehServicoInterno,
      ativo: s.ativo !== false,
      mininome: str(s.mininome),
      tempoPrevistoMinutos: str(s.tempoPrevistoMinutos),
      lembrarDiasAntes: str(s.lembrarDiasAntes),
      tipoDiasAntes: s.tipoDiasAntes === 'UTEIS' ? 'UTEIS' : 'CORRIDOS',
      sabadoEhUtil: !!s.sabadoEhUtil,
      exigirRobo: !!s.exigirRobo,
      passivelDeMulta: !!s.passivelDeMulta,
      alertaGuiaNaoLida: !!s.alertaGuiaNaoLida,
      comentarioPadrao: str(s.comentarioPadrao),
    })
  }, [servicoQuery.data, reset])

  const create = trpc.servico.createServico.useMutation({
    onSuccess: () => {
      utils.servico.listServicos.invalidate()
      router.back()
    },
  })
  const update = trpc.servico.updateServico.useMutation({
    onSuccess: () => {
      utils.servico.listServicos.invalidate()
      if (id) utils.servico.getServico.invalidate({ id })
      router.back()
    },
  })
  const remover = trpc.servico.deleteServico.useMutation({
    onSuccess: () => {
      utils.servico.listServicos.invalidate()
      router.back()
    },
  })

  const mutationAtiva = isEdicao ? update : create
  const salvando = mutationAtiva.isPending
  const podeExcluir = isEdicao && podeAcao('servicos', 'delete')

  function onSubmit(v: ServicoFormValues) {
    const payload = {
      nome: v.nome.trim(),
      descricao: v.descricao.trim() || null,
      categoriaServico: v.categoriaServico,
      prioridadePadrao: v.prioridadePadrao as PrioridadeServico,
      slaHoras: numOuNull(v.slaHoras),
      valorPadrao: numOuNull(v.valorPadrao),
      disponivelOrcamento: v.disponivelOrcamento,
      ehServicoInterno: v.ehServicoInterno,
      mininome: v.mininome.trim() || null,
      tempoPrevistoMinutos: numOuNull(v.tempoPrevistoMinutos),
      lembrarDiasAntes: numOuNull(v.lembrarDiasAntes) ?? 0,
      tipoDiasAntes: v.tipoDiasAntes,
      sabadoEhUtil: v.sabadoEhUtil,
      exigirRobo: v.exigirRobo,
      passivelDeMulta: v.passivelDeMulta,
      alertaGuiaNaoLida: v.alertaGuiaNaoLida,
      comentarioPadrao: v.comentarioPadrao.trim() || null,
    }
    if (isEdicao && id) {
      update.mutate({ id, data: { ...payload, ativo: v.ativo } })
    } else {
      create.mutate(payload)
    }
  }

  function confirmarExclusao() {
    Alert.alert('Excluir serviço', `Excluir "${(servicoQuery.data as { nome?: string } | null)?.nome ?? 'este serviço'}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => id && remover.mutate({ id }) },
    ])
  }

  if (isEdicao && servicoQuery.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-6">
          <Spinner />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="w-full max-w-2xl mx-auto p-4 gap-4">
            {/* Topo */}
            <View className="flex-row items-center gap-2">
              <Button variant="ghost" size="sm" accessibilityLabel="Voltar" onPress={() => router.back()} className="px-2">
                <Text className="text-lg text-foreground">‹</Text>
              </Button>
              <Text className="text-xl font-bold text-foreground">
                {isEdicao ? 'Editar serviço' : 'Novo serviço'}
              </Text>
            </View>

            {/* Nome */}
            <Campo label="Nome" erro={errors.nome?.message}>
              <Controller
                control={control}
                name="nome"
                render={({ field }) => (
                  <Input value={field.value} onChangeText={field.onChange} placeholder="Nome do serviço" />
                )}
              />
            </Campo>

            {/* Descrição */}
            <Campo label="Descrição">
              <Controller
                control={control}
                name="descricao"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChangeText={field.onChange}
                    placeholder="O que esse serviço entrega…"
                    multiline
                    numberOfLines={3}
                    className="h-20 py-2"
                    style={{ textAlignVertical: 'top' }}
                  />
                )}
              />
            </Campo>

            {/* Cobrança (categoriaServico) */}
            <Campo label="Tipo de cobrança">
              <Controller
                control={control}
                name="categoriaServico"
                render={({ field }) => (
                  <View className="flex-row gap-2">
                    {(['MENSAL', 'EXTRA'] as const).map((c) => (
                      <SegBtn
                        key={c}
                        ativo={field.value === c}
                        label={c === 'MENSAL' ? 'Mensal (recorrente)' : 'Extra (pontual)'}
                        onPress={() => field.onChange(c)}
                      />
                    ))}
                  </View>
                )}
              />
            </Campo>

            {/* Prioridade */}
            <Campo label="Prioridade padrão">
              <Controller
                control={control}
                name="prioridadePadrao"
                render={({ field }) => (
                  <ChipSelect
                    opcoes={PRIORIDADES}
                    rotulo={(k) => PRIORIDADE_LABELS[k as PrioridadeServico]}
                    valor={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Campo>

            {/* SLA + Valor */}
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Campo label="SLA (horas)">
                  <Controller
                    control={control}
                    name="slaHoras"
                    render={({ field }) => (
                      <Input value={field.value} onChangeText={field.onChange} placeholder="0" keyboardType="numeric" />
                    )}
                  />
                </Campo>
              </View>
              <View className="flex-1">
                <Campo label="Valor padrão (R$)">
                  <Controller
                    control={control}
                    name="valorPadrao"
                    render={({ field }) => (
                      <Input value={field.value} onChangeText={field.onChange} placeholder="0,00" keyboardType="numeric" />
                    )}
                  />
                </Campo>
              </View>
            </View>

            {/* Switches principais */}
            <SwitchRow control={control} name="disponivelOrcamento" label="Disponível em orçamentos" />
            <SwitchRow control={control} name="ehServicoInterno" label="Serviço interno (não entra no catálogo)" />
            {isEdicao ? <SwitchRow control={control} name="ativo" label="Ativo" /> : null}

            {/* Seção avançada (colapsável) */}
            <Pressable
              accessibilityRole="button"
              onPress={() => setAvancadoAberto((v) => !v)}
              className="flex-row items-center justify-between rounded-xl border border-border bg-card px-3 py-3 active:opacity-80"
            >
              <Text className="text-[13px] font-semibold text-foreground">Configurações avançadas</Text>
              <Ionicons name={avancadoAberto ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
            </Pressable>

            {avancadoAberto ? (
              <View className="gap-4">
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Campo label="Apelido (mininome)">
                      <Controller
                        control={control}
                        name="mininome"
                        render={({ field }) => (
                          <Input value={field.value} onChangeText={field.onChange} placeholder="Até 10 letras" maxLength={10} />
                        )}
                      />
                    </Campo>
                  </View>
                  <View className="flex-1">
                    <Campo label="Tempo previsto (min)">
                      <Controller
                        control={control}
                        name="tempoPrevistoMinutos"
                        render={({ field }) => (
                          <Input value={field.value} onChangeText={field.onChange} placeholder="0" keyboardType="numeric" />
                        )}
                      />
                    </Campo>
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Campo label="Lembrar (dias antes)">
                      <Controller
                        control={control}
                        name="lembrarDiasAntes"
                        render={({ field }) => (
                          <Input value={field.value} onChangeText={field.onChange} placeholder="0" keyboardType="numeric" />
                        )}
                      />
                    </Campo>
                  </View>
                  <View className="flex-1">
                    <Campo label="Contagem dos dias">
                      <Controller
                        control={control}
                        name="tipoDiasAntes"
                        render={({ field }) => (
                          <View className="flex-row gap-2">
                            {(['CORRIDOS', 'UTEIS'] as const).map((t) => (
                              <SegBtn
                                key={t}
                                ativo={field.value === t}
                                label={TIPO_DIAS_ANTES_LABELS[t]}
                                onPress={() => field.onChange(t)}
                              />
                            ))}
                          </View>
                        )}
                      />
                    </Campo>
                  </View>
                </View>

                <SwitchRow control={control} name="sabadoEhUtil" label="Sábado é dia útil" />
                <SwitchRow control={control} name="exigirRobo" label="Exigir entrega pelo robô" />
                <SwitchRow control={control} name="passivelDeMulta" label="Passível de multa" />
                <SwitchRow control={control} name="alertaGuiaNaoLida" label="Alertar guia não lida" />

                <Campo label="Comentário padrão">
                  <Controller
                    control={control}
                    name="comentarioPadrao"
                    render={({ field }) => (
                      <Input
                        value={field.value}
                        onChangeText={field.onChange}
                        placeholder="Pré-preenche a entrega manual…"
                        multiline
                        numberOfLines={3}
                        className="h-20 py-2"
                        maxLength={300}
                        style={{ textAlignVertical: 'top' }}
                      />
                    )}
                  />
                </Campo>
              </View>
            ) : null}

            {/* Erro */}
            {mutationAtiva.isError ? (
              <Card className="border-red-500/40">
                <CardContent className="p-3">
                  <Text className="text-red-500 text-sm">{mutationAtiva.error?.message}</Text>
                </CardContent>
              </Card>
            ) : null}

            <Button loading={salvando} onPress={form.handleSubmit(onSubmit)} className="mt-2">
              Salvar
            </Button>

            {podeExcluir ? (
              <Button variant="destructive" loading={remover.isPending} onPress={confirmarExclusao}>
                Excluir serviço
              </Button>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Campo({ label, erro, children }: { label: string; erro?: string; children: React.ReactNode }) {
  return (
    <View className="gap-1.5">
      <Label>{label}</Label>
      {children}
      {erro ? <Text className="text-red-500 text-sm">{erro}</Text> : null}
    </View>
  )
}

/** Botão de segmento (ocupa largura igual). */
function SegBtn({ ativo, label, onPress }: { ativo: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      className={cn(
        'flex-1 h-9 items-center justify-center rounded-md border px-2 active:opacity-80',
        ativo ? 'border-primary bg-primary/15' : 'border-border bg-card',
      )}
    >
      <Text className={cn('text-xs font-medium', ativo ? 'text-primary' : 'text-muted-foreground')} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

function ChipSelect({
  opcoes,
  rotulo,
  valor,
  onChange,
}: {
  opcoes: string[]
  rotulo: (k: string) => string
  valor: string
  onChange: (v: string) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {opcoes.map((k) => {
        const ativo = valor === k
        return (
          <Pressable
            key={k}
            accessibilityRole="button"
            accessibilityState={{ selected: ativo }}
            onPress={() => onChange(k)}
            className={cn('h-9 px-3 items-center justify-center rounded-full border active:opacity-80', ativo ? 'bg-primary border-primary' : 'bg-card border-border')}
          >
            <Text className={cn('text-sm font-medium', ativo ? 'text-primary-foreground' : 'text-muted-foreground')}>
              {rotulo(k)}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

/** Linha label + Switch ligada a um campo boolean do form. */
function SwitchRow({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<ServicoFormValues>>['control']
  name: keyof ServicoFormValues
  label: string
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Label>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Switch value={!!field.value} onValueChange={field.onChange} />
        )}
      />
    </View>
  )
}
