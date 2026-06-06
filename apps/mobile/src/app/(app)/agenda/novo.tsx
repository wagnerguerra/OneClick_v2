// Tela de CRIAR evento na Agenda (rota /agenda/novo).
//
// Formulário enxuto (v1): título, tipo, data, dia-inteiro, horários e local +
// descrição. Participantes, sala, recorrência e lembretes ficam pra depois.
//
// Validação via react-hook-form + zod. Datas/horas trafegam como string crua
// (yyyy-MM-dd e HH:MM) — o client tRPC não tem transformer, então nada de Date.

import { useMemo } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { trpc } from '@/lib/trpc'
import { toISODate } from '@/features/agenda/date'
import { resolveTipoCores } from '@/features/agenda/color'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'

// ── Validação ──────────────────────────────────────────────────────────────
// Regex de hora HH:MM (00:00 a 23:59) e de data yyyy-MM-dd.
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// Schema local refletindo só os campos do escopo v1. Quando NÃO é dia inteiro,
// exigimos horaInicio/horaFim no formato HH:MM (via superRefine pra anexar o
// erro no campo certo).
const eventoFormSchema = z
  .object({
    titulo: z.string().min(1, 'Informe um título'),
    tipoId: z.string().min(1, 'Escolha um tipo'),
    data: z.string().regex(DATA_RE, 'Data inválida (aaaa-mm-dd)'),
    diaInteiro: z.boolean(),
    horaInicio: z.string(),
    horaFim: z.string(),
    local: z.string(),
    descricao: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.diaInteiro) return
    if (!HORA_RE.test(val.horaInicio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['horaInicio'],
        message: 'Hora inválida (HH:MM)',
      })
    }
    if (!HORA_RE.test(val.horaFim)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['horaFim'],
        message: 'Hora inválida (HH:MM)',
      })
    }
  })

type EventoFormValues = z.infer<typeof eventoFormSchema>

export default function AgendaNovoEvento() {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Tipos pro seletor de categoria (chips horizontais).
  const tiposQuery = trpc.agenda.listTipos.useQuery()

  // Data padrão = hoje (yyyy-MM-dd local).
  const hojeISO = useMemo(() => toISODate(new Date()), [])

  const form = useForm<EventoFormValues>({
    resolver: zodResolver(eventoFormSchema),
    defaultValues: {
      titulo: '',
      tipoId: '',
      data: hojeISO,
      diaInteiro: false,
      horaInicio: '',
      horaFim: '',
      local: '',
      descricao: '',
    },
  })

  const create = trpc.agenda.create.useMutation({
    onSuccess: () => {
      // Invalida a listagem pra a nova entrada aparecer ao voltar.
      utils.agenda.listEventos.invalidate()
      router.back()
    },
  })

  // `errors` reativos do RHF — usados pra mostrar a mensagem abaixo de cada campo.
  const { errors } = form.formState

  function onSubmit(values: EventoFormValues) {
    // Monta o input no shape exato da procedure `create`. Strings vazias viram
    // null/undefined (o backend já normaliza, mas mantemos limpo).
    create.mutate({
      titulo: values.titulo.trim(),
      tipoId: values.tipoId,
      data: values.data,
      diaInteiro: values.diaInteiro,
      horaInicio: values.diaInteiro ? null : values.horaInicio,
      horaFim: values.diaInteiro ? null : values.horaFim,
      local: values.local.trim() || null,
      descricao: values.descricao.trim() || null,
    })
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-2xl mx-auto p-4 gap-4">
            {/* Topo: voltar + título da tela. */}
            <View className="flex-row items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                accessibilityLabel="Voltar"
                onPress={() => router.back()}
                className="px-2"
              >
                <Text className="text-lg text-foreground">‹</Text>
              </Button>
              <Text className="text-xl font-bold text-foreground">Novo evento</Text>
            </View>

            {/* Seletor de TIPO (chips horizontais). Controlado por Controller. */}
            <View className="gap-1.5">
              <Label>Tipo</Label>
              {tiposQuery.isPending ? (
                <View className="h-12 justify-center">
                  <Spinner />
                </View>
              ) : tiposQuery.isError ? (
                <Text className="text-red-500 text-sm">Não foi possível carregar os tipos.</Text>
              ) : (
                <Controller
                  control={form.control}
                  name="tipoId"
                  render={({ field }) => (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                    >
                      {(tiposQuery.data ?? []).map((tipo) => {
                        const selecionado = field.value === tipo.id
                        const cores = resolveTipoCores(tipo)
                        return (
                          <Pressable
                            key={tipo.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: selecionado }}
                            onPress={() => field.onChange(tipo.id)}
                            className="h-9 px-3 items-center justify-center rounded-full border active:opacity-80"
                            style={{
                              backgroundColor: selecionado ? cores.bg : 'transparent',
                              borderColor: cores.border,
                            }}
                          >
                            <Text
                              className="text-sm font-medium"
                              style={{ color: selecionado ? cores.text : cores.bg }}
                            >
                              {tipo.nome}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </ScrollView>
                  )}
                />
              )}
              {errors.tipoId ? (
                <Text className="text-red-500 text-sm">{errors.tipoId.message}</Text>
              ) : null}
            </View>

            {/* Título. */}
            <View className="gap-1.5">
              <Label>Título</Label>
              <Controller
                control={form.control}
                name="titulo"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Reunião com o cliente"
                    returnKeyType="next"
                  />
                )}
              />
              {errors.titulo ? (
                <Text className="text-red-500 text-sm">{errors.titulo.message}</Text>
              ) : null}
            </View>

            {/* Dia inteiro (Switch). */}
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Label>Dia inteiro</Label>
                <Controller
                  control={form.control}
                  name="diaInteiro"
                  render={({ field }) => (
                    <Switch value={field.value} onValueChange={field.onChange} />
                  )}
                />
              </View>
            </View>

            {/* Horários — só quando NÃO é dia inteiro. */}
            {!form.watch('diaInteiro') ? (
              <View className="flex-row gap-3">
                <View className="flex-1 gap-1.5">
                  <Label>Início</Label>
                  <Controller
                    control={form.control}
                    name="horaInicio"
                    render={({ field }) => (
                      <Input
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="09:00"
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    )}
                  />
                  {errors.horaInicio ? (
                    <Text className="text-red-500 text-sm">{errors.horaInicio.message}</Text>
                  ) : null}
                </View>

                <View className="flex-1 gap-1.5">
                  <Label>Fim</Label>
                  <Controller
                    control={form.control}
                    name="horaFim"
                    render={({ field }) => (
                      <Input
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="10:00"
                        keyboardType="numbers-and-punctuation"
                        maxLength={5}
                      />
                    )}
                  />
                  {errors.horaFim ? (
                    <Text className="text-red-500 text-sm">{errors.horaFim.message}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Data. */}
            <View className="gap-1.5">
              <Label>Data</Label>
              <Controller
                control={form.control}
                name="data"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="aaaa-mm-dd"
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                  />
                )}
              />
              {errors.data ? (
                <Text className="text-red-500 text-sm">{errors.data.message}</Text>
              ) : null}
            </View>

            {/* Local. */}
            <View className="gap-1.5">
              <Label>Local</Label>
              <Controller
                control={form.control}
                name="local"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Sala de reuniões, endereço…"
                  />
                )}
              />
            </View>

            {/* Descrição (multiline). */}
            <View className="gap-1.5">
              <Label>Descrição</Label>
              <Controller
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <Input
                    value={field.value}
                    onChangeText={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="Detalhes do evento…"
                    multiline
                    numberOfLines={4}
                    className="h-24 py-2"
                    style={{ textAlignVertical: 'top' }}
                  />
                )}
              />
            </View>

            {/* Erro de mutation (ex.: data passada, conflito de agenda). */}
            {create.isError ? (
              <Card className="border-red-500/40">
                <CardContent className="p-3">
                  <Text className="text-red-500 text-sm">{create.error.message}</Text>
                </CardContent>
              </Card>
            ) : null}

            {/* Salvar. */}
            <Button
              loading={create.isPending}
              onPress={form.handleSubmit(onSubmit)}
              className="mt-2"
            >
              Salvar
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
