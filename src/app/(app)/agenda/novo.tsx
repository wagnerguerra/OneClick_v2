// Tela de CRIAR/EDITAR evento na Agenda (rota /agenda/novo).
//
// Sem `id` nos params → modo CRIAÇÃO. Com `id` → modo EDIÇÃO: busca o evento via
// `agenda.getById` e preenche o form via `reset()`.
//
// Formulário enxuto (v1): título, tipo, data, dia-inteiro, horários e local +
// descrição. Participantes, sala, recorrência e lembretes ficam pra depois.
//
// Validação via react-hook-form + zod. Datas/horas trafegam como string crua
// (yyyy-MM-dd e HH:MM) — o client tRPC não tem transformer, então nada de Date.

import { useEffect, useMemo, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import { trpc } from '@/lib/trpc'
import { toISODate } from '@/features/agenda/date'
import { resolveTipoCores } from '@/features/agenda/color'
import { LembretesEditor, type LembreteItem } from '@/features/agenda/lembretes-editor'
import { ParticipantesPicker } from '@/features/agenda/participantes-picker'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { DateField, TimeField } from '@/components/ui/native-pickers'
import { HtmlEditor } from '@/components/ui/html-editor'
import { cn } from '@/lib/cn'

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
    // Reunião / modalidade (espelha a agenda do sistema)
    presenca: z.enum(['PRESENCIAL', 'ONLINE', 'HIBRIDO']),
    link: z.string(),
    contato: z.string(),
    participanteIds: z.array(z.string()),
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

  // `id` opcional nos params define o modo: presente = edição, ausente = criação.
  const { id } = useLocalSearchParams<{ id?: string }>()
  const isEdicao = !!id

  // Tipos pro seletor de categoria (chips horizontais).
  const tiposQuery = trpc.agenda.listTipos.useQuery()

  // Em modo edição, busca o evento pra preencher o form (enabled só se houver id).
  const eventoQuery = trpc.agenda.getById.useQuery({ id: id as string }, { enabled: isEdicao })

  // Lembretes vivem em estado à parte do RHF/zod (são salvos por mutation própria).
  const [lembretes, setLembretes] = useState<LembreteItem[]>([])

  // Em modo edição, carrega os lembretes existentes do evento.
  const lembretesQuery = trpc.agenda.lembrete.list.useQuery(
    { eventoId: id as string },
    { enabled: isEdicao },
  )

  // Quando os lembretes chegam (edição), popula o estado — mapeando só canal+minutos.
  useEffect(() => {
    const data = lembretesQuery.data
    if (!data) return
    setLembretes(
      data.map((l) => ({ canal: l.canal, minutosAntes: l.minutosAntes })),
    )
  }, [lembretesQuery.data])

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
      presenca: 'PRESENCIAL',
      link: '',
      contato: '',
      participanteIds: [],
    },
  })

  const { reset } = form

  // Quando os dados do evento chegam (modo edição), preenche o form via reset().
  // Mapeia só os campos do escopo v1; data vem como ISO, então fatiamos yyyy-MM-dd.
  useEffect(() => {
    const evento = eventoQuery.data
    if (!evento) return
    reset({
      titulo: evento.titulo ?? '',
      tipoId: evento.tipoId ?? '',
      data: evento.data ? evento.data.slice(0, 10) : hojeISO,
      diaInteiro: evento.diaInteiro ?? false,
      horaInicio: evento.horaInicio ?? '',
      horaFim: evento.horaFim ?? '',
      local: evento.local ?? '',
      descricao: evento.descricao ?? '',
      presenca: (evento.presenca as 'PRESENCIAL' | 'ONLINE' | 'HIBRIDO' | null) ?? 'PRESENCIAL',
      link: evento.link ?? '',
      contato: evento.contato ?? '',
      // Participantes que são usuários do sistema (ignora avulsos no v1).
      participanteIds: (evento.participantes ?? [])
        .map((p) => p.usuarioId)
        .filter((id): id is string => !!id),
    })
  }, [eventoQuery.data, reset, hojeISO])

  // Salva o conjunto de lembretes (substitui tudo no back). Compartilhada por
  // criação e edição — chamada via mutateAsync depois de salvar o evento.
  const lembreteSave = trpc.agenda.lembrete.save.useMutation()

  const create = trpc.agenda.create.useMutation({
    onSuccess: async (novo) => {
      // `create` retorna um evento único OU um array (recorrência). Este form não
      // expõe recorrência, mas normalizamos pra pegar sempre o primeiro id.
      const eventoCriado = Array.isArray(novo) ? novo[0] : novo
      // Se há lembretes, salva no evento recém-criado ANTES de voltar.
      if (eventoCriado && lembretes.length) {
        await lembreteSave.mutateAsync({ eventoId: eventoCriado.id, lembretes })
      }
      // Invalida a listagem pra a nova entrada aparecer ao voltar.
      utils.agenda.listEventos.invalidate()
      router.back()
    },
  })

  const update = trpc.agenda.update.useMutation({
    onSuccess: async () => {
      // Em edição sempre regrava o conjunto (mesmo vazio — `save` substitui tudo).
      if (id) {
        await lembreteSave.mutateAsync({ eventoId: id, lembretes })
      }
      // Invalida listagem + detalhe + lembretes pra refletir a edição ao voltar.
      utils.agenda.listEventos.invalidate()
      if (id) {
        utils.agenda.getById.invalidate({ id })
        utils.agenda.lembrete.list.invalidate({ eventoId: id })
      }
      router.back()
    },
  })

  // Mutation ativa conforme o modo — usada pro loading/erro no botão e no card.
  const mutationAtiva = isEdicao ? update : create

  // Loading do botão Salvar = qualquer mutation em andamento (evento ou lembretes).
  const salvando = mutationAtiva.isPending || lembreteSave.isPending

  // `errors` reativos do RHF — usados pra mostrar a mensagem abaixo de cada campo.
  const { errors } = form.formState

  // Detecção de "reunião" pelo NOME do tipo (igual à agenda web) — revela os
  // campos de modalidade/link. Participantes ficam disponíveis sempre.
  const tipoSelecionado = (tiposQuery.data ?? []).find((t) => t.id === form.watch('tipoId'))
  const isReuniao = /reuni|treinamento interno/i.test(tipoSelecionado?.nome ?? '')
  const precisaLink = form.watch('presenca') === 'ONLINE' || form.watch('presenca') === 'HIBRIDO'

  function onSubmit(values: EventoFormValues) {
    // Monta o payload no shape dos campos do escopo v1. Strings vazias viram
    // null (o backend já normaliza, mas mantemos limpo).
    const data = {
      titulo: values.titulo.trim(),
      tipoId: values.tipoId,
      data: values.data,
      diaInteiro: values.diaInteiro,
      horaInicio: values.diaInteiro ? null : values.horaInicio,
      horaFim: values.diaInteiro ? null : values.horaFim,
      local: values.local.trim() || null,
      descricao: values.descricao.trim() || null,
      // Modalidade + reunião (paridade com a agenda do sistema).
      presenca: values.presenca,
      link: values.link.trim() || null,
      contato: values.contato.trim() || null,
      participanteIds: values.participanteIds,
    }

    if (isEdicao && id) {
      // Edição: update espera { id, data: {...mesmos campos do create} }.
      update.mutate({ id, data })
    } else {
      // Criação: create espera os campos no nível raiz.
      create.mutate(data)
    }
  }

  // Em modo edição, enquanto o evento carrega mostramos só um spinner.
  if (isEdicao && eventoQuery.isPending) {
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
              <Text className="text-xl font-bold text-foreground">
                {isEdicao ? 'Editar evento' : 'Novo evento'}
              </Text>
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
                      <TimeField value={field.value} onChange={field.onChange} />
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
                      <TimeField value={field.value} onChange={field.onChange} />
                    )}
                  />
                  {errors.horaFim ? (
                    <Text className="text-red-500 text-sm">{errors.horaFim.message}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Data — abre o calendário nativo. */}
            <View className="gap-1.5">
              <Label>Data</Label>
              <Controller
                control={form.control}
                name="data"
                render={({ field }) => (
                  <DateField value={field.value} onChange={field.onChange} />
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

            {/* Reunião: modalidade (presença) + link + contato — só pra tipos de
                reunião, espelhando a agenda do sistema. */}
            {isReuniao ? (
              <View className="gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <Text className="text-[13px] font-semibold text-foreground">
                  Configurações da reunião
                </Text>

                {/* Modalidade (segmentado). */}
                <View className="gap-1.5">
                  <Label>Modalidade</Label>
                  <Controller
                    control={form.control}
                    name="presenca"
                    render={({ field }) => (
                      <View className="flex-row gap-2">
                        {([
                          { v: 'PRESENCIAL', l: 'Presencial', icon: 'business-outline' },
                          { v: 'ONLINE', l: 'Online', icon: 'videocam-outline' },
                          { v: 'HIBRIDO', l: 'Híbrido', icon: 'desktop-outline' },
                        ] as const).map((opt) => {
                          const ativo = field.value === opt.v
                          return (
                            <Pressable
                              key={opt.v}
                              accessibilityRole="button"
                              accessibilityState={{ selected: ativo }}
                              onPress={() => field.onChange(opt.v)}
                              className={cn(
                                'flex-1 h-9 flex-row items-center justify-center gap-1.5 rounded-md border active:opacity-80',
                                ativo ? 'border-primary bg-primary/15' : 'border-border bg-card',
                              )}
                            >
                              <Ionicons
                                name={opt.icon}
                                size={15}
                                color={ativo ? '#2563eb' : '#94a3b8'}
                              />
                              <Text
                                className={cn(
                                  'text-xs font-medium',
                                  ativo ? 'text-primary' : 'text-muted-foreground',
                                )}
                              >
                                {opt.l}
                              </Text>
                            </Pressable>
                          )
                        })}
                      </View>
                    )}
                  />
                </View>

                {/* Link da reunião — quando Online/Híbrido. */}
                {precisaLink ? (
                  <View className="gap-1.5">
                    <Label>Link da reunião</Label>
                    <Controller
                      control={form.control}
                      name="link"
                      render={({ field }) => (
                        <Input
                          value={field.value}
                          onChangeText={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="https://meet.google.com/…"
                          autoCapitalize="none"
                          keyboardType="url"
                        />
                      )}
                    />
                  </View>
                ) : null}

                {/* Contato. */}
                <View className="gap-1.5">
                  <Label>Contato</Label>
                  <Controller
                    control={form.control}
                    name="contato"
                    render={({ field }) => (
                      <Input
                        value={field.value}
                        onChangeText={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="Responsável / telefone"
                      />
                    )}
                  />
                </View>
              </View>
            ) : null}

            {/* Participantes (usuários do sistema). */}
            <View className="gap-1.5">
              <Label>Participantes</Label>
              <Controller
                control={form.control}
                name="participanteIds"
                render={({ field }) => (
                  <ParticipantesPicker value={field.value} onChange={field.onChange} />
                )}
              />
            </View>

            {/* Descrição — editor rich text (salva HTML, igual à agenda web). */}
            <View className="gap-1.5">
              <Label>Descrição</Label>
              <Controller
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <HtmlEditor
                    initialValue={isEdicao ? (eventoQuery.data?.descricao ?? '') : ''}
                    onChange={field.onChange}
                  />
                )}
              />
            </View>

            {/* Lembretes do evento (estado à parte do RHF). */}
            <View className="gap-1.5">
              <Label>Lembretes</Label>
              {isEdicao && lembretesQuery.isPending ? (
                <View className="h-12 justify-center">
                  <Spinner />
                </View>
              ) : (
                <LembretesEditor value={lembretes} onChange={setLembretes} />
              )}
            </View>

            {/* Erro de mutation (ex.: data passada, conflito de agenda, falha ao
                salvar lembretes). */}
            {mutationAtiva.isError || lembreteSave.isError ? (
              <Card className="border-red-500/40">
                <CardContent className="p-3">
                  <Text className="text-red-500 text-sm">
                    {(mutationAtiva.error ?? lembreteSave.error)?.message}
                  </Text>
                </CardContent>
              </Card>
            ) : null}

            {/* Salvar. */}
            <Button
              loading={salvando}
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
