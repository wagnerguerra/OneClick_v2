// Criar/editar CLIENTE (rota /clientes/novo). Sem id = criação; com id = edição
// (cliente.getById → reset). Cobre a aba "Dados Gerais" do web (identificação,
// fiscal, comercial, endereço, contato, observações em HTML). Backend valida
// canWrite (writeProcedure) — usuário sem permissão recebe erro ao salvar.

import { useEffect, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Controller, useForm } from 'react-hook-form'

import {
  SITUACAO_LABELS,
  STATUS_LABELS,
  REGIME_LABELS,
  type ClienteSituacao,
  type ClienteStatus,
} from '@saas/types'

import { trpc } from '@/lib/trpc'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Text } from '@/components/ui/text'
import { Card, CardContent } from '@/components/ui/card'
import { DateField } from '@/components/ui/native-pickers'
import { HtmlEditor } from '@/components/ui/html-editor'
import { TRIBUTACAO_LABELS, TIPO_CLIENTE_LABELS } from '@/features/clientes/labels'

type Form = {
  razaoSocial: string
  nomeFantasia: string
  documento: string
  tipoCliente: string
  situacao: string
  status: string
  tributacao: string
  regime: string
  inscricaoEstadual: string
  inscricaoMunicipal: string
  grupo: string
  origem: string
  dataEntrada: string
  dataSaida: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  telefone: string
  email: string
  observacoes: string
}

const VAZIO: Form = {
  razaoSocial: '', nomeFantasia: '', documento: '', tipoCliente: '', situacao: 'MENSAL', status: 'ATIVA',
  tributacao: '', regime: '', inscricaoEstadual: '', inscricaoMunicipal: '', grupo: '', origem: '',
  dataEntrada: '', dataSaida: '', cep: '', logradouro: '', numero: '', complemento: '', bairro: '',
  cidade: '', uf: '', telefone: '', email: '', observacoes: '',
}

const SITUACOES = Object.keys(SITUACAO_LABELS)
const STATUSES = Object.keys(STATUS_LABELS)
const TRIBUTACOES = Object.keys(TRIBUTACAO_LABELS)
const REGIMES = Object.keys(REGIME_LABELS)
const TIPOS_CLIENTE = Object.keys(TIPO_CLIENTE_LABELS)

export default function ClienteNovoScreen() {
  const router = useRouter()
  const utils = trpc.useUtils()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const isEdicao = !!id

  const clienteQuery = trpc.cliente.getById.useQuery({ id: id as string }, { enabled: isEdicao })

  const { control, handleSubmit, reset, formState } = useForm<Form>({ defaultValues: VAZIO })
  const erroNome = formState.errors.razaoSocial

  useEffect(() => {
    const c = clienteQuery.data as Record<string, any> | undefined | null
    if (!c) return
    const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
    reset({
      razaoSocial: s(c.razaoSocial), nomeFantasia: s(c.nomeFantasia), documento: s(c.documento),
      tipoCliente: s(c.tipoCliente), situacao: s(c.situacao) || 'MENSAL', status: s(c.status) || 'ATIVA',
      tributacao: s(c.tributacao), regime: s(c.regime), inscricaoEstadual: s(c.inscricaoEstadual),
      inscricaoMunicipal: s(c.inscricaoMunicipal), grupo: s(c.grupo), origem: s(c.origem),
      dataEntrada: c.dataEntrada ? String(c.dataEntrada).slice(0, 10) : '',
      dataSaida: c.dataSaida ? String(c.dataSaida).slice(0, 10) : '',
      cep: s(c.cep), logradouro: s(c.logradouro), numero: s(c.numero), complemento: s(c.complemento),
      bairro: s(c.bairro), cidade: s(c.cidade), uf: s(c.uf), telefone: s(c.telefone), email: s(c.email),
      observacoes: s(c.observacoes),
    })
  }, [clienteQuery.data, reset])

  const create = trpc.cliente.create.useMutation({
    onSuccess: () => {
      utils.cliente.list.invalidate()
      router.back()
    },
  })
  const update = trpc.cliente.update.useMutation({
    onSuccess: () => {
      utils.cliente.list.invalidate()
      if (id) utils.cliente.getById.invalidate({ id })
      router.back()
    },
  })
  const mutationAtiva = isEdicao ? update : create

  function onSubmit(v: Form) {
    const t = (x: string) => x.trim() || undefined
    const payload: Record<string, unknown> = {
      razaoSocial: v.razaoSocial.trim(),
      nomeFantasia: t(v.nomeFantasia),
      documento: t(v.documento),
      tipoCliente: t(v.tipoCliente),
      situacao: v.situacao || 'MENSAL',
      status: v.status || 'ATIVA',
      tributacao: v.tributacao || undefined,
      regime: v.regime || undefined,
      inscricaoEstadual: t(v.inscricaoEstadual),
      inscricaoMunicipal: t(v.inscricaoMunicipal),
      grupo: t(v.grupo),
      origem: t(v.origem),
      dataEntrada: t(v.dataEntrada),
      dataSaida: t(v.dataSaida),
      cep: t(v.cep), logradouro: t(v.logradouro), numero: t(v.numero), complemento: t(v.complemento),
      bairro: t(v.bairro), cidade: t(v.cidade), uf: t(v.uf),
      telefone: t(v.telefone), email: t(v.email),
      observacoes: t(v.observacoes),
    }
    if (isEdicao && id) update.mutate({ id, data: payload as never })
    else create.mutate(payload as never)
  }

  if (isEdicao && clienteQuery.isPending) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center p-6"><Spinner /></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="w-full max-w-2xl mx-auto p-4 gap-4">
            <View className="flex-row items-center gap-2">
              <Button variant="ghost" size="sm" className="px-2" onPress={() => router.back()}>
                <Text className="text-lg text-foreground">‹</Text>
              </Button>
              <Text className="text-xl font-bold text-foreground">
                {isEdicao ? 'Editar cliente' : 'Novo cliente'}
              </Text>
            </View>

            {/* Identificação */}
            <Secao titulo="Identificação" />
            <Campo label="Razão social" erro={erroNome?.message}>
              <Controller control={control} name="razaoSocial" rules={{ required: 'Informe a razão social' }}
                render={({ field }) => <Input value={field.value} onChangeText={field.onChange} placeholder="Razão social" />} />
            </Campo>
            <Campo label="Nome fantasia">
              <Controller control={control} name="nomeFantasia" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} placeholder="Nome fantasia" />} />
            </Campo>
            <Campo label="Documento (CPF/CNPJ)">
              <Controller control={control} name="documento" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} placeholder="Somente números" keyboardType="numbers-and-punctuation" />} />
            </Campo>
            <Campo label="Tipo de cliente">
              <Controller control={control} name="tipoCliente" render={({ field }) => (
                <Chips opcoes={TIPOS_CLIENTE} rotulo={(k) => TIPO_CLIENTE_LABELS[k]} valor={field.value} onChange={field.onChange} limpavel />
              )} />
            </Campo>
            <Campo label="Situação">
              <Controller control={control} name="situacao" render={({ field }) => (
                <Chips opcoes={SITUACOES} rotulo={(k) => SITUACAO_LABELS[k as ClienteSituacao]} valor={field.value} onChange={field.onChange} />
              )} />
            </Campo>
            <Campo label="Status">
              <Controller control={control} name="status" render={({ field }) => (
                <Chips opcoes={STATUSES} rotulo={(k) => STATUS_LABELS[k as ClienteStatus]} valor={field.value} onChange={field.onChange} />
              )} />
            </Campo>

            {/* Fiscal */}
            <Secao titulo="Fiscal" />
            <Campo label="Tributação">
              <Controller control={control} name="tributacao" render={({ field }) => (
                <Chips opcoes={TRIBUTACOES} rotulo={(k) => TRIBUTACAO_LABELS[k]} valor={field.value} onChange={field.onChange} limpavel />
              )} />
            </Campo>
            <Campo label="Regime contábil">
              <Controller control={control} name="regime" render={({ field }) => (
                <Chips opcoes={REGIMES} rotulo={(k) => REGIME_LABELS[k as keyof typeof REGIME_LABELS]} valor={field.value} onChange={field.onChange} limpavel />
              )} />
            </Campo>
            <View className="flex-row gap-3">
              <View className="flex-1"><Campo label="Inscr. estadual"><Controller control={control} name="inscricaoEstadual" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
              <View className="flex-1"><Campo label="Inscr. municipal"><Controller control={control} name="inscricaoMunicipal" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
            </View>

            {/* Comercial */}
            <Secao titulo="Comercial" />
            <View className="flex-row gap-3">
              <View className="flex-1"><Campo label="Grupo"><Controller control={control} name="grupo" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
              <View className="flex-1"><Campo label="Origem"><Controller control={control} name="origem" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1"><Campo label="Entrada"><Controller control={control} name="dataEntrada" render={({ field }) => <DateField value={field.value} onChange={field.onChange} placeholder="—" />} /></Campo></View>
              <View className="flex-1"><Campo label="Saída"><Controller control={control} name="dataSaida" render={({ field }) => <DateField value={field.value} onChange={field.onChange} placeholder="—" />} /></Campo></View>
            </View>

            {/* Endereço */}
            <Secao titulo="Endereço" />
            <View className="flex-row gap-3">
              <View className="w-28"><Campo label="CEP"><Controller control={control} name="cep" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} keyboardType="numbers-and-punctuation" />} /></Campo></View>
              <View className="flex-1"><Campo label="Logradouro"><Controller control={control} name="logradouro" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
            </View>
            <View className="flex-row gap-3">
              <View className="w-24"><Campo label="Número"><Controller control={control} name="numero" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
              <View className="flex-1"><Campo label="Complemento"><Controller control={control} name="complemento" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
            </View>
            <Campo label="Bairro"><Controller control={control} name="bairro" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo>
            <View className="flex-row gap-3">
              <View className="flex-1"><Campo label="Cidade"><Controller control={control} name="cidade" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} />} /></Campo></View>
              <View className="w-20"><Campo label="UF"><Controller control={control} name="uf" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} autoCapitalize="characters" maxLength={2} />} /></Campo></View>
            </View>

            {/* Contato */}
            <Secao titulo="Contato" />
            <View className="flex-row gap-3">
              <View className="flex-1"><Campo label="Telefone"><Controller control={control} name="telefone" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" />} /></Campo></View>
              <View className="flex-1"><Campo label="E-mail"><Controller control={control} name="email" render={({ field }) => <Input value={field.value} onChangeText={field.onChange} autoCapitalize="none" keyboardType="email-address" />} /></Campo></View>
            </View>

            {/* Observações (HTML) */}
            <Secao titulo="Observações" />
            <Controller control={control} name="observacoes" render={({ field }) => (
              <HtmlEditor initialValue={isEdicao ? String((clienteQuery.data as any)?.observacoes ?? '') : ''} onChange={field.onChange} placeholder="Observações do cliente…" />
            )} />

            {mutationAtiva.isError ? (
              <Card className="border-red-500/40">
                <CardContent className="p-3"><Text className="text-red-500 text-sm">{mutationAtiva.error?.message}</Text></CardContent>
              </Card>
            ) : null}

            <Button loading={mutationAtiva.isPending} onPress={handleSubmit(onSubmit)} className="mt-2 mb-2">
              Salvar
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Secao({ titulo }: { titulo: string }) {
  return <Text className="text-[13px] font-semibold text-foreground mt-1">{titulo}</Text>
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

/** Chips de seleção única. `limpavel` permite desmarcar (tocar no ativo = vazio). */
function Chips({
  opcoes, rotulo, valor, onChange, limpavel = false,
}: {
  opcoes: string[]
  rotulo: (k: string) => string
  valor: string
  onChange: (v: string) => void
  limpavel?: boolean
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
            onPress={() => onChange(limpavel && ativo ? '' : k)}
            className={cn('h-9 px-3 items-center justify-center rounded-full border active:opacity-80', ativo ? 'bg-primary border-primary' : 'bg-card border-border')}
          >
            <Text className={cn('text-sm font-medium', ativo ? 'text-primary-foreground' : 'text-muted-foreground')}>{rotulo(k)}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
