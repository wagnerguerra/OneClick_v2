// Tela de CRIAR chamado no Helpdesk (rota /helpdesk/novo).
//
// Formulário enxuto espelhando o `create` do sistema: título, descrição,
// categoria (seletor via listCategorias), prioridade e tipo (chips). Validação
// via react-hook-form + zod, reusando o createTicketSchema compartilhado de
// @saas/types pra manter o front em sync com o DTO do backend.

import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'

import {
  createTicketSchema,
  HELPDESK_PRIORIDADE,
  HELPDESK_PRIORIDADE_LABELS,
  HELPDESK_PRIORIDADE_COLORS,
  HELPDESK_TIPO,
  HELPDESK_TIPO_LABELS,
} from '@saas/types'

import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/cn'

// Valores do form = inferência do schema compartilhado (mesmo DTO do backend).
type TicketFormValues = z.infer<typeof createTicketSchema>

export default function HelpdeskNovoChamado() {
  const router = useRouter()
  const utils = trpc.useUtils()

  // Categorias disponíveis pro seletor (chips). Catálogo do tenant + globais.
  const categoriasQuery = trpc.helpdesk.listCategorias.useQuery()

  const form = useForm<TicketFormValues>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      titulo: '',
      descricao: '',
      tipo: 'DUVIDA',
      prioridade: 'MEDIA',
      categoriaId: null,
      tags: [],
    },
  })

  const { errors } = form.formState

  const create = trpc.helpdesk.create.useMutation({
    onSuccess: () => {
      // Atualiza a lista "meus chamados" pra o novo ticket aparecer ao voltar.
      utils.helpdesk.listMeus.invalidate()
      router.back()
    },
  })

  function onSubmit(values: TicketFormValues) {
    create.mutate({
      titulo: values.titulo.trim(),
      descricao: values.descricao.trim(),
      tipo: values.tipo,
      prioridade: values.prioridade,
      // String vazia/none → null (sem categoria).
      categoriaId: values.categoriaId || null,
      tags: values.tags ?? [],
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
              <Text className="text-xl font-bold text-foreground">Novo chamado</Text>
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
                    placeholder="Resumo do problema ou solicitação"
                    returnKeyType="next"
                  />
                )}
              />
              {errors.titulo ? (
                <Text className="text-red-500 text-sm">{errors.titulo.message}</Text>
              ) : null}
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
                    placeholder="Descreva o que aconteceu, com o máximo de detalhes…"
                    multiline
                    numberOfLines={5}
                    className="h-28 py-2"
                    style={{ textAlignVertical: 'top' }}
                  />
                )}
              />
              {errors.descricao ? (
                <Text className="text-red-500 text-sm">{errors.descricao.message}</Text>
              ) : null}
            </View>

            {/* Categoria (chips horizontais). Opcional — roteia a área no backend. */}
            <View className="gap-1.5">
              <Label>Categoria</Label>
              {categoriasQuery.isPending ? (
                <View className="h-12 justify-center">
                  <Spinner />
                </View>
              ) : categoriasQuery.isError ? (
                <Text className="text-red-500 text-sm">
                  Não foi possível carregar as categorias.
                </Text>
              ) : (categoriasQuery.data?.length ?? 0) === 0 ? (
                <Text className="text-sm text-muted-foreground">
                  Nenhuma categoria disponível.
                </Text>
              ) : (
                <Controller
                  control={form.control}
                  name="categoriaId"
                  render={({ field }) => (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                    >
                      {(categoriasQuery.data ?? []).map((cat) => {
                        const selecionado = field.value === cat.id
                        return (
                          <Pressable
                            key={cat.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: selecionado }}
                            // Toque na categoria já selecionada desmarca (volta a "sem categoria").
                            onPress={() => field.onChange(selecionado ? null : cat.id)}
                            className={cn(
                              'h-9 px-3 items-center justify-center rounded-full border active:opacity-80',
                              selecionado ? 'bg-primary border-primary' : 'bg-card border-border',
                            )}
                          >
                            <Text
                              className={cn(
                                'text-sm font-medium',
                                selecionado ? 'text-primary-foreground' : 'text-muted-foreground',
                              )}
                            >
                              {cat.nome}
                            </Text>
                          </Pressable>
                        )
                      })}
                    </ScrollView>
                  )}
                />
              )}
            </View>

            {/* Prioridade (chips). Default MEDIA. */}
            <View className="gap-1.5">
              <Label>Prioridade</Label>
              <Controller
                control={form.control}
                name="prioridade"
                render={({ field }) => (
                  <View className="flex-row flex-wrap gap-2">
                    {HELPDESK_PRIORIDADE.map((p) => {
                      const selecionado = field.value === p
                      const cor = HELPDESK_PRIORIDADE_COLORS[p]
                      return (
                        <Pressable
                          key={p}
                          accessibilityRole="button"
                          accessibilityState={{ selected: selecionado }}
                          onPress={() => field.onChange(p)}
                          className="h-9 px-3 items-center justify-center rounded-full border active:opacity-80"
                          style={{
                            backgroundColor: selecionado ? cor : 'transparent',
                            borderColor: cor,
                          }}
                        >
                          <Text
                            className="text-sm font-medium"
                            style={{ color: selecionado ? '#ffffff' : cor }}
                          >
                            {HELPDESK_PRIORIDADE_LABELS[p]}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                )}
              />
              {errors.prioridade ? (
                <Text className="text-red-500 text-sm">{errors.prioridade.message}</Text>
              ) : null}
            </View>

            {/* Tipo (chips). Default DUVIDA. */}
            <View className="gap-1.5">
              <Label>Tipo</Label>
              <Controller
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <View className="flex-row flex-wrap gap-2">
                    {HELPDESK_TIPO.map((t) => {
                      const selecionado = field.value === t
                      return (
                        <Pressable
                          key={t}
                          accessibilityRole="button"
                          accessibilityState={{ selected: selecionado }}
                          onPress={() => field.onChange(t)}
                          className={cn(
                            'h-9 px-3 items-center justify-center rounded-full border active:opacity-80',
                            selecionado ? 'bg-primary border-primary' : 'bg-card border-border',
                          )}
                        >
                          <Text
                            className={cn(
                              'text-sm font-medium',
                              selecionado ? 'text-primary-foreground' : 'text-muted-foreground',
                            )}
                          >
                            {HELPDESK_TIPO_LABELS[t]}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                )}
              />
              {errors.tipo ? (
                <Text className="text-red-500 text-sm">{errors.tipo.message}</Text>
              ) : null}
            </View>

            {/* Erro da mutation (ex.: falha de rede/validação no backend). */}
            {create.isError ? (
              <Card className="border-red-500/40">
                <CardContent className="p-3 pt-3">
                  <Text className="text-red-500 text-sm">{create.error?.message}</Text>
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
