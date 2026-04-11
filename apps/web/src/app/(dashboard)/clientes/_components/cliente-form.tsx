'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Handshake, Save, ArrowLeft, Search as SearchIcon, Camera,
  FileText, ShoppingCart, Receipt, ClipboardList, Plus, Send,
  Briefcase, FileBarChart, History, File, Calculator, Shield,
  ListChecks, StickyNote, FileInput, MessageSquareQuote, Users, ListTodo,
  ExternalLink, X, Loader2, Building2, Phone, MapPin, Star, Pencil, Trash2, Link2,
} from 'lucide-react'
import {
  cn, Button, Input, Label, Card, CardHeader, Checkbox, RichEditor,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks, numeroParaMoeda, moedaParaNumero } from '@/lib/masks'
import {
  createClienteSchema,
  SITUACAO_LABELS, SITUACAO_COLORS,
  STATUS_LABELS, STATUS_COLORS,
  REGIME_LABELS, AREA_CONTRATADA_OPTIONS,
  type CreateClienteInput,
} from '@saas/types'
import { taxRegimeLabels } from '@saas/types'

function RequiredMark() {
  return <span className="text-destructive ml-0.5">*</span>
}

function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-2 border-b border-border/40 pb-2">
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </h3>
  )
}

function PlaceholderTab({ icon: Icon, title, description }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="h-12 w-12 text-muted-foreground/20 mb-3" />
      <h4 className="text-sm font-semibold text-muted-foreground mb-1">{title}</h4>
      <p className="text-xs text-muted-foreground max-w-md">{description}</p>
    </Card>
  )
}

// Opções de enums do legado
const TIPO_CLIENTE_OPTIONS = [
  { value: 'A DEFINIR', label: 'A DEFINIR' },
  { value: 'MATRIZ', label: 'MATRIZ' },
  { value: 'FILIAL', label: 'FILIAL' },
  { value: 'UNICO', label: 'ÚNICO' },
]

const CATEGORIA_OPTIONS = [
  { value: 'NAO_INFORMADO', label: 'NÃO INFORMADO' },
  { value: 'STANDARD', label: 'STANDARD' },
  { value: 'ADVANCED', label: 'ADVANCED' },
  { value: 'PREMIUM', label: 'PREMIUM' },
]

const ORIGEM_OPTIONS = [
  { value: 'NAO_INFORMADO', label: 'NÃO INFORMADO' },
  { value: 'INDICACAO_CLIENTE', label: 'INDICAÇÃO DE CLIENTE' },
  { value: 'INDICACAO_COLABORADOR', label: 'INDICAÇÃO DE COLABORADOR' },
  { value: 'INDICACAO_PARCEIRO', label: 'INDICAÇÃO DE PARCEIRO' },
  { value: 'INTERNET', label: 'INTERNET' },
  { value: 'RADIO', label: 'RÁDIO' },
  { value: 'RNC', label: 'RNC' },
]

const TRIBUTACAO_OPTIONS = [
  { value: 'SIMPLES_NACIONAL', label: 'Simples Nacional' },
  { value: 'LUCRO_PRESUMIDO', label: 'Lucro Presumido' },
  { value: 'LUCRO_REAL', label: 'Lucro Real' },
  { value: 'MEI', label: 'MEI' },
]

interface ClienteFormProps {
  mode: 'create' | 'edit'
  clienteId?: string
  defaultValues?: Partial<CreateClienteInput> & { code?: number; version?: number; createdAt?: string }
}

const PROGRESS_FIELDS = [
  'razaoSocial', 'documento', 'nomeFantasia', 'tipoCliente',
  'situacao', 'status', 'grupo', 'tributacao',
  'cep', 'logradouro', 'bairro', 'cidade', 'uf',
  'telefone', 'email', 'areasContratadas', 'origem',
] as const

export function ClienteForm({ mode, clienteId, defaultValues }: ClienteFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clienteLogo, setClienteLogo] = useState<string | null>(defaultValues?.logoUrl || null)
  const [chatMsg, setChatMsg] = useState('')
  const [chatAsCliente, setChatAsCliente] = useState(false)

  const { register, handleSubmit, formState: { errors }, control, setValue, watch } = useForm<CreateClienteInput>({
    resolver: zodResolver(createClienteSchema),
    defaultValues: {
      razaoSocial: '', nomeFantasia: '', documento: '', tipoDocumento: 'CNPJ',
      tipoCliente: 'A DEFINIR', situacao: 'MENSAL', status: 'ATIVA', grupo: '', origem: '',
      dataEntrada: '', dataSaida: '', observacoes: '',
      tributacao: undefined, regime: undefined,
      inscricaoEstadual: '', inscricaoMunicipal: '',
      areasContratadas: '',
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
      telefone: '', email: '', isActive: true,
      ...defaultValues,
    },
  })

  const tipoDocumento = watch('tipoDocumento')
  const watchedValues = watch()

  const progress = useMemo(() => {
    let filled = 0
    for (const field of PROGRESS_FIELDS) {
      const val = watchedValues[field]
      if (val && String(val).trim() !== '') filled++
    }
    return { filled, total: PROGRESS_FIELDS.length, percent: Math.round((filled / PROGRESS_FIELDS.length) * 100) }
  }, [watchedValues])

  async function buscarCnpj() {
    const doc = watch('documento')?.replace(/\D/g, '')
    if (!doc || doc.length < 14) return alerts.error('CNPJ inválido', 'Informe um CNPJ com 14 dígitos.')
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.razao_social) setValue('razaoSocial', data.razao_social)
      if (data.nome_fantasia) setValue('nomeFantasia', data.nome_fantasia)
      if (data.cep) setValue('cep', masks.cep(String(data.cep)))
      if (data.logradouro) setValue('logradouro', data.logradouro)
      if (data.numero) setValue('numero', data.numero)
      if (data.complemento) setValue('complemento', data.complemento)
      if (data.bairro) setValue('bairro', data.bairro)
      if (data.municipio) setValue('cidade', data.municipio)
      if (data.uf) setValue('uf', data.uf)
    } catch { alerts.error('Erro', 'Não foi possível consultar o CNPJ.') }
  }

  async function buscarCep() {
    const cep = watch('cep')?.replace(/\D/g, '')
    if (!cep || cep.length < 8) return
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.street) setValue('logradouro', data.street)
      if (data.neighborhood) setValue('bairro', data.neighborhood)
      if (data.city) setValue('cidade', data.city)
      if (data.state) setValue('uf', data.state)
    } catch { /* silencioso */ }
  }

  async function onSubmit(data: CreateClienteInput) {
    setSaving(true)
    setError(null)
    try {
      if (mode === 'create') {
        const created = await trpc.cliente.create.mutate(data)
        await alerts.success('Cliente criado', 'O cliente foi cadastrado com sucesso.')
        router.push(`/clientes/${created.id}`)
      } else {
        await trpc.cliente.update.mutate({ id: clienteId!, data })
        await alerts.success('Cliente atualizado', 'Os dados foram salvos com sucesso.')
      }
    } catch {
      setError(mode === 'create' ? 'Erro ao criar o cliente.' : 'Erro ao atualizar o cliente.')
    } finally { setSaving(false) }
  }

  const areasValue = watch('areasContratadas') || ''
  const selectedAreas = areasValue ? areasValue.split(';').filter(Boolean) : []

  function toggleArea(value: string) {
    const current = selectedAreas.includes(value)
      ? selectedAreas.filter((a) => a !== value)
      : [...selectedAreas, value]
    setValue('areasContratadas', current.join(';'))
  }

  const isEdit = mode === 'edit' && defaultValues?.code

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className={isEdit ? 'space-y-0' : 'space-y-5'}>

        {/* ============================================================ */}
        {/* HEADER                                                       */}
        {/* ============================================================ */}
        {isEdit ? (
          <div className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-5" style={{ backgroundColor: 'rgba(106, 218, 125, .18)' }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative group">
                <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full bg-white dark:bg-gray-800 overflow-hidden shadow-lg" style={{ boxShadow: 'inset 0 0 0 3px #d4d4d4' }}>
                  {clienteLogo ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={clienteLogo.startsWith('http') ? clienteLogo : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${clienteLogo.startsWith('/') ? '' : '/api/upload/'}${clienteLogo}`}
                      alt="Logo"
                      className="h-[70px] w-[70px] object-contain rounded-full"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <Handshake className="h-10 w-10 text-emerald-500" />
                  )}
                </div>
                <button
                  type="button"
                  className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md hover:bg-emerald-600 transition-colors border-2 border-white dark:border-gray-800"
                  onClick={async () => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/*'
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0]
                      if (!file) return
                      const formData = new FormData()
                      formData.append('file', file)
                      try {
                        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
                        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData })
                        if (!res.ok) { alerts.error('Erro', 'Falha no upload.'); return }
                        const data = await res.json()
                        // A URL retornada pode ser absoluta ou relativa
                        const logoUrl = data.url && data.url.startsWith('http') ? data.url : `${apiUrl}/api/upload/${data.filename}`
                        setClienteLogo(logoUrl)
                        if (clienteId) {
                          await trpc.cliente.update.mutate({ id: clienteId, data: { logoUrl } as never })
                        }
                      } catch { alerts.error('Erro', 'Falha no upload da imagem.') }
                    }
                    input.click()
                  }}
                >
                  <Camera className="h-3.5 w-3.5" />
                </button>
              </div>
              <div>
                <h1 className="text-xl font-semibold">{defaultValues?.razaoSocial || 'Cliente'}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  #{defaultValues.code}
                  &nbsp;&nbsp;|&nbsp;&nbsp;
                  CNPJ: {tipoDocumento === 'CPF' ? masks.cpf(defaultValues.documento || '') : masks.cnpj(defaultValues.documento || '')}
                  &nbsp;&nbsp;|&nbsp;&nbsp;
                  Criado em: {defaultValues.createdAt ? new Date(defaultValues.createdAt).toLocaleDateString('pt-BR') + ', ' + new Date(defaultValues.createdAt).toLocaleTimeString('pt-BR') : '—'}
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <Controller control={control} name="situacao" render={({ field }) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                          style={{ backgroundColor: SITUACAO_COLORS[field.value as keyof typeof SITUACAO_COLORS]?.bg || '#e5e5e5', color: SITUACAO_COLORS[field.value as keyof typeof SITUACAO_COLORS]?.color || '#666' }}>
                          <ShoppingCart className="h-3 w-3" />
                          {SITUACAO_LABELS[field.value as keyof typeof SITUACAO_LABELS] || field.value}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {Object.entries(SITUACAO_LABELS).map(([v, l]) => (
                          <DropdownMenuItem key={v} onClick={() => field.onChange(v)} className={field.value === v ? 'font-bold' : ''}>{l}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )} />
                  <Controller control={control} name="status" render={({ field }) => (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80"
                          style={{ backgroundColor: STATUS_COLORS[field.value as keyof typeof STATUS_COLORS]?.bg || '#e5e5e5', color: STATUS_COLORS[field.value as keyof typeof STATUS_COLORS]?.color || '#666' }}>
                          {STATUS_LABELS[field.value as keyof typeof STATUS_LABELS] || field.value}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {Object.entries(STATUS_LABELS).map(([v, l]) => (
                          <DropdownMenuItem key={v} onClick={() => field.onChange(v)} className={field.value === v ? 'font-bold' : ''}>{l}</DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )} />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 px-3 py-1 text-xs font-medium">
                    <Handshake className="h-3 w-3" />
                    {watchedValues.tipoCliente || 'A DEFINIR'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="success" size="icon-sm" type="submit" disabled={saving}><Save className="h-4 w-4" /></Button>
              <Button type="button" variant="outline" size="icon-sm" onClick={() => router.push('/clientes')}><ArrowLeft className="h-4 w-4" /></Button>
            </div>
          </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-emerald-500 text-white shadow-md">
                <Handshake className="h-6 w-6" />
              </div>
              <div>
                <h1>Novo Cliente</h1>
                <p className="text-sm text-muted-foreground">Preencha os dados para cadastrar um novo cliente</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="success" size="sm" type="submit" disabled={saving}><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => router.push('/clientes')}><ArrowLeft className="h-4 w-4" />Voltar</Button>
            </div>
          </div>
        )}

        {error && <div className={cn('rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive', isEdit && 'mx-4 sm:mx-6 mt-4')}>{error}</div>}

        {/* ============================================================ */}
        {/* TABS PRINCIPAIS (12 tabs como no legado)                     */}
        {/* ============================================================ */}
        <Tabs defaultValue="detalhes">
          <div className={cn('overflow-x-auto', isEdit ? '-mx-4 sm:-mx-6 px-4 sm:px-6' : '')} style={isEdit ? { backgroundColor: 'rgba(106, 218, 125, .18)' } : undefined}>
            <TabsList className="min-w-max">
              <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
              <TabsTrigger value="comercial">Comercial</TabsTrigger>
              <TabsTrigger value="fiscal">Fiscal</TabsTrigger>
              <TabsTrigger value="contabil">Contábil</TabsTrigger>
              <TabsTrigger value="legalizacao">Legalização</TabsTrigger>
              <TabsTrigger value="obrigacoes">Obrigações</TabsTrigger>
              <TabsTrigger value="servicos">Serviços</TabsTrigger>
              <TabsTrigger value="particularidades">Particularidades</TabsTrigger>
              <TabsTrigger value="protocolos">Protocolos</TabsTrigger>
              <TabsTrigger value="reclamacoes">Reclamações</TabsTrigger>
              <TabsTrigger value="usuarios">Usuários</TabsTrigger>
              <TabsTrigger value="logs">Log&apos;s</TabsTrigger>
            </TabsList>
          </div>

          {/* Layout 2 colunas */}
          <div className={cn('mt-5', isEdit ? 'grid gap-5 lg:grid-cols-[1fr_320px]' : '')}>
            <div className="min-w-0">

              {/* ======================================================== */}
              {/* TAB: DETALHES (card com pills laterais)                   */}
              {/* ======================================================== */}
              <TabsContent value="detalhes" className="mt-0">
                <DetalhesCard
                  register={register} control={control} watch={watch} errors={errors}
                  setValue={setValue} clienteId={clienteId}
                  watchedValues={watchedValues} tipoDocumento={tipoDocumento}
                  buscarCnpj={buscarCnpj} buscarCep={buscarCep}
                />
              </TabsContent>

              {/* ======================================================== */}
              {/* TAB: COMERCIAL (card com pills laterais)                  */}
              {/* ======================================================== */}
              <TabsContent value="comercial" className="mt-0">
                <ComercialCard
                  register={register} control={control} watch={watch} errors={errors}
                  chatMsg={chatMsg} setChatMsg={setChatMsg}
                  chatAsCliente={chatAsCliente} setChatAsCliente={setChatAsCliente}
                  clienteId={clienteId}
                />
              </TabsContent>

              {/* ======================================================== */}
              {/* TAB: FISCAL                                               */}
              {/* ======================================================== */}
              <TabsContent value="fiscal" className="mt-0">
                <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
                  {/* Atalhos rápidos */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Atalhos</p>
                    <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.open('https://agenciavirtual.sefaz.es.gov.br', '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5" /> Agência Virtual
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => window.open('https://cav.receita.fazenda.gov.br', '_blank')}>
                      <ExternalLink className="h-3.5 w-3.5" /> e-CAC Receita Federal
                    </Button>
                  </div>
                  {/* Campos fiscais */}
                  <Card className="p-5">
                    <SectionTitle icon={Receipt}>Dados Fiscais</SectionTitle>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Tributação</Label>
                        <Controller control={control} name="tributacao" render={({ field }) => (
                          <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Não informado</SelectItem>
                              {TRIBUTACAO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Regime</Label>
                        <Controller control={control} name="regime" render={({ field }) => (
                          <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}>
                            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Não informado</SelectItem>
                              {Object.entries(REGIME_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Inscrição Estadual</Label>
                        <Input placeholder="IE" {...register('inscricaoEstadual')} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Inscrição Municipal</Label>
                        <Input placeholder="IM" {...register('inscricaoMunicipal')} />
                      </div>
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* ======================================================== */}
              {/* TABS PLACEHOLDER (futuras)                                */}
              {/* ======================================================== */}
              <TabsContent value="contabil" className="mt-0">
                <PlaceholderTab icon={Calculator} title="Contábil" description="Configurações contábeis do cliente. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="legalizacao" className="mt-0">
                <PlaceholderTab icon={Shield} title="Legalização" description="Registros e documentos de legalização do cliente. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="obrigacoes" className="mt-0">
                <PlaceholderTab icon={ListChecks} title="Obrigações" description="Obrigações fiscais e trabalhistas do cliente. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="servicos" className="mt-0">
                <PlaceholderTab icon={Briefcase} title="Serviços" description="Serviços contratados pelo cliente. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="particularidades" className="mt-0">
                <PlaceholderTab icon={StickyNote} title="Particularidades" description="Particularidades e observações específicas do cliente. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="protocolos" className="mt-0">
                <PlaceholderTab icon={FileInput} title="Protocolos" description="Protocolos e documentações protocoladas. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="reclamacoes" className="mt-0">
                <PlaceholderTab icon={MessageSquareQuote} title="Reclamações" description="Registro de reclamações e tratativas. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="usuarios" className="mt-0">
                <PlaceholderTab icon={Users} title="Usuários" description="Usuários vinculados ao cliente. Este módulo será implementado em breve." />
              </TabsContent>
              <TabsContent value="logs" className="mt-0">
                {isEdit && clienteId ? <LogsTab clienteId={clienteId} /> : (
                  <PlaceholderTab icon={ListTodo} title="Log's" description="Salve o cliente primeiro para visualizar o histórico." />
                )}
              </TabsContent>
            </div>

            {/* ============================================================ */}
            {/* SIDEBAR (modo edit)                                          */}
            {/* ============================================================ */}
            {isEdit && (
              <div className="space-y-5">
                {/* Progresso */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">Progresso do cadastro</h4>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{progress.percent}%</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${progress.percent}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{progress.filled} de {progress.total} campos preenchidos</p>
                </Card>

                {/* Atividades e Benefícios */}
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold">Atividades e Benefícios</h4>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm"><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem><Briefcase className="h-3.5 w-3.5" /> Atividade</DropdownMenuItem>
                        <DropdownMenuItem><Receipt className="h-3.5 w-3.5" /> Benefício Fiscal</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {/* Tags das areas contratadas */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedAreas.length > 0 ? (
                      selectedAreas.map((area) => {
                        const opt = AREA_CONTRATADA_OPTIONS.find((o) => o.value === area)
                        return (
                          <button key={area} type="button" onClick={() => toggleArea(area)}
                            className={cn('inline-flex items-center rounded px-2 py-1 text-xs font-medium cursor-pointer hover:opacity-70', opt?.color || 'bg-muted')}>
                            {opt?.label || area} ×
                          </button>
                        )
                      })
                    ) : (
                      <p className="text-xs text-muted-foreground">Nenhuma atividade/benefício cadastrado ainda.</p>
                    )}
                  </div>
                  {selectedAreas.length === 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="outline" size="sm" className="w-full"><Plus className="h-3.5 w-3.5" /> Adicionar Área</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        {AREA_CONTRATADA_OPTIONS.map((area) => (
                          <DropdownMenuItem key={area.value} onClick={() => toggleArea(area.value)}>
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium mr-2 ${area.color}`}>{area.label}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </Card>

                {/* Arquivos */}
                {clienteId && <ArquivosSidebar clienteId={clienteId} />}

              </div>
            )}
          </div>
        </Tabs>
      </form>
    </TooltipProvider>
  )
}

// ================================================================
// Sub-componentes funcionais
// ================================================================

/* ================================================================== */
/* DetalhesCard — pills laterais (padrão igual ComercialCard)         */
/* ================================================================== */
function DetalhesCard({ register, control, watch, errors, setValue, clienteId, watchedValues, tipoDocumento, buscarCnpj, buscarCep }: {
  register: ReturnType<typeof useForm<CreateClienteInput>>['register']
  control: ReturnType<typeof useForm<CreateClienteInput>>['control']
  watch: ReturnType<typeof useForm<CreateClienteInput>>['watch']
  errors: ReturnType<typeof useForm<CreateClienteInput>>['formState']['errors']
  setValue: ReturnType<typeof useForm<CreateClienteInput>>['setValue']
  clienteId?: string
  watchedValues: CreateClienteInput
  tipoDocumento: string
  buscarCnpj: () => void
  buscarCep: () => void
}) {
  const [activeTab, setActiveTab] = useState('dados')

  const tabs = [
    { key: 'dados', label: 'Dados Gerais', icon: Building2 },
    { key: 'contato', label: 'Contatos', icon: Phone },
    { key: 'endereco', label: 'Endereço', icon: MapPin },
    { key: 'integracoes', label: 'Integrações', icon: Link2 },
  ]

  return (
    <Card>
      <CardHeader>
        <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" /> Detalhes do Cliente
        </h5>
      </CardHeader>
      <div className="flex min-h-[450px]">
        {/* Pills laterais */}
        <div className="w-[170px] shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[#f8f9fa] p-3 overflow-y-auto">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                    activeTab === tab.key
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-white hover:text-foreground'
                  )}
                  style={activeTab === tab.key ? { backgroundColor: '#10b981' } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div key={activeTab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>

          {/* ---- SUB-TAB: DADOS GERAIS ---- */}
          {activeTab === 'dados' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Dados Gerais</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                {/* Razão Social (8) + CNPJ (4) */}
                <div className="col-span-12 md:col-span-8 space-y-1.5">
                  <Label>Razão Social<RequiredMark /></Label>
                  <Input placeholder="Razão Social / Nome" {...register('razaoSocial')} />
                  {errors.razaoSocial && <p className="text-xs text-destructive">{errors.razaoSocial.message}</p>}
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>CNPJ</Label>
                  <div className="flex" style={{ borderRadius: '0.25rem', overflow: 'hidden' }}>
                    <Controller control={control} name="documento" render={({ field }) => (
                      <Input
                        placeholder={tipoDocumento === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                        value={tipoDocumento === 'CPF' ? masks.cpf(field.value || '') : masks.cnpj(field.value || '')}
                        onChange={(e) => field.onChange(tipoDocumento === 'CPF' ? masks.cpf(e.target.value) : masks.cnpj(e.target.value))}
                        style={{ borderRadius: '0.25rem 0 0 0.25rem', borderRight: 'none' }}
                      />
                    )} />
                    <button type="button" onClick={buscarCnpj} className="shrink-0 whitespace-nowrap" style={{ padding: '0.55rem 0.75rem', fontSize: '.77rem', fontWeight: 500, backgroundColor: '#5ea3cb', color: '#fff', border: '1px solid #5ea3cb', borderLeft: 'none', cursor: 'pointer' }}>
                      Completar
                    </button>
                    <button type="button" onClick={buscarCnpj} className="shrink-0 whitespace-nowrap flex items-center gap-1" style={{ padding: '0.55rem 0.75rem', fontSize: '.77rem', fontWeight: 500, backgroundColor: '#fff', color: '#212529', border: '1px solid #ced4da', borderLeft: 'none', borderRadius: '0 0.25rem 0.25rem 0', cursor: 'pointer' }}>
                      <SearchIcon className="h-3.5 w-3.5" /> Consultar
                    </button>
                  </div>
                  {errors.documento && <p className="text-xs text-destructive">{errors.documento.message}</p>}
                </div>

                {/* Nome Fantasia (9) + Tipo (3) */}
                <div className="col-span-12 md:col-span-9 space-y-1.5">
                  <Label>Nome Fantasia</Label>
                  <Input placeholder="Nome Fantasia" {...register('nomeFantasia')} />
                </div>
                <div className="col-span-12 md:col-span-3 space-y-1.5">
                  <Label>Tipo<RequiredMark /></Label>
                  <Controller control={control} name="tipoCliente" render={({ field }) => (
                    <Select value={field.value || 'A DEFINIR'} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPO_CLIENTE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
              </div>
            </div>
          )}

          {/* ---- SUB-TAB: CONTATOS ---- */}
          {activeTab === 'contato' && (
            <ContatosTab clienteId={clienteId} />
          )}

          {/* ---- SUB-TAB: ENDEREÇO ---- */}
          {activeTab === 'endereco' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Dados do Endereço</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-2 space-y-1.5">
                  <Label>CEP</Label>
                  <Input placeholder="00000-000" {...register('cep')}
                    onChange={(e) => { e.target.value = masks.cep(e.target.value); register('cep').onChange(e) }}
                    onBlur={buscarCep} />
                </div>
                <div className="col-span-12 md:col-span-8 space-y-1.5">
                  <Label>Endereço</Label>
                  <Input placeholder="Rua / Avenida" {...register('logradouro')} />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-1.5">
                  <Label>Número</Label>
                  <Input placeholder="Nº" {...register('numero')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Bairro</Label>
                  <Input placeholder="Bairro" {...register('bairro')} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>Cidade</Label>
                  <Input placeholder="Cidade" {...register('cidade')} />
                </div>
                <div className="col-span-12 md:col-span-2 space-y-1.5">
                  <Label>Estado</Label>
                  <Input placeholder="ES" maxLength={2} {...register('uf')} />
                </div>
                <div className="col-span-12 space-y-1.5">
                  <Label>Complemento</Label>
                  <Input placeholder="Apto / Sala / Bloco..." {...register('complemento')} />
                </div>

                {/* Google Maps */}
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-[rgba(0,0,0,0.08)]">
                    <h4 className="text-[13px] font-semibold text-foreground">Posição no Google Maps</h4>
                  </div>
                </div>
                <div className="col-span-12">
                  <GoogleMapsEmbed
                    logradouro={watchedValues.logradouro}
                    numero={watchedValues.numero}
                    bairro={watchedValues.bairro}
                    cidade={watchedValues.cidade}
                    uf={watchedValues.uf}
                    cep={watchedValues.cep}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ---- SUB-TAB: INTEGRAÇÕES ---- */}
          {activeTab === 'integracoes' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Integrações com Sistemas Externos</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                {/* ID SCI (6) + botão importar */}
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>ID SCI</Label>
                  <div className="flex" style={{ borderRadius: '0.25rem', overflow: 'hidden' }}>
                    <Input placeholder="ID no SCI (Sistema Contábil Integrado)" {...register('idSistema')} style={{ borderRadius: '0.25rem 0 0 0.25rem', borderRight: 'none' }} />
                    <button
                      type="button"
                      title="Importar ID do SCI pelo CNPJ"
                      className="shrink-0 flex items-center gap-1.5"
                      style={{ padding: '0.55rem 0.75rem', fontSize: '.77rem', fontWeight: 500, backgroundColor: '#5ea3cb', color: '#fff', border: '1px solid #5ea3cb', borderLeft: 'none', borderRadius: '0 0.25rem 0.25rem 0', cursor: 'pointer' }}
                      onClick={async () => {
                        if (!clienteId) { alerts.error('Salve o cliente', 'Salve o cliente antes de importar o ID SCI.'); return }
                        const currentId = watch('idSistema')
                        let force = false
                        if (currentId) {
                          const confirm = await alerts.confirmDelete(`O ID SCI atual é "${currentId}". Deseja sobrescrever com o valor do SCI?`)
                          if (!confirm) return
                          force = true
                        }
                        try {
                          const result = await trpc.cliente.atualizarIdSistemaSci.mutate({ clienteId, force }) as Record<string, unknown>
                          if (result.needsConfirmation) {
                            const confirm = await alerts.confirmDelete(String(result.message))
                            if (!confirm) return
                            const r2 = await trpc.cliente.atualizarIdSistemaSci.mutate({ clienteId, force: true }) as Record<string, unknown>
                            setValue('idSistema', String(r2.idSistema))
                            await alerts.success('ID SCI atualizado', `ID ${r2.idSistema} importado do SCI (${r2.metodo}).${r2.idAnterior ? ` Anterior: ${r2.idAnterior}` : ''}`)
                          } else {
                            setValue('idSistema', String(result.idSistema))
                            await alerts.success('ID SCI importado', `ID ${result.idSistema} importado do SCI (${result.metodo}).${result.idAnterior ? ` Anterior: ${result.idAnterior}` : ''}`)
                          }
                        } catch (e) {
                          const msg = (e as Error).message || ''
                          if (msg.includes('CNPJ')) alerts.error('CNPJ inválido', msg)
                          else if (msg.includes('SCI')) alerts.error('Erro SCI', msg)
                          else if (msg.includes('encontrado')) alerts.error('Não encontrado', msg)
                          else alerts.error('Erro', msg || 'Não foi possível importar o ID SCI.')
                        }
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 rotate-[270deg]" /> Importar
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Identificador no Sistema Contábil Integrado (Firebird)</p>
                </div>

                {/* ID OneClick (6) */}
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>ID OneClick</Label>
                  <Input placeholder="ID no OneClick" {...register('idOneClick')} />
                  <p className="text-[11px] text-muted-foreground">Identificador no sistema OneClick legado</p>
                </div>

                {/* Subtítulo Omie */}
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-[rgba(0,0,0,0.08)]">
                    <h4 className="text-[13px] font-semibold text-foreground">Omie ERP</h4>
                  </div>
                </div>

                {/* ID Omie (6) + Empresa Omie (6) */}
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>ID Omie</Label>
                  <Input placeholder="Código do cliente no Omie" {...register('idOmie')} />
                  <p className="text-[11px] text-muted-foreground">Código do cliente na plataforma Omie</p>
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>Empresa Omie</Label>
                  <Controller control={control} name="omieEmpresa" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        <SelectItem value="CENTRAL">Central</SelectItem>
                        <SelectItem value="LL">L&amp;L</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                  <p className="text-[11px] text-muted-foreground">Empresa vinculada no Omie para este cliente</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function ComercialCard({ register, control, watch, errors, chatMsg, setChatMsg, chatAsCliente, setChatAsCliente, clienteId }: {
  register: ReturnType<typeof useForm<CreateClienteInput>>['register']
  control: ReturnType<typeof useForm<CreateClienteInput>>['control']
  watch: ReturnType<typeof useForm<CreateClienteInput>>['watch']
  errors: ReturnType<typeof useForm<CreateClienteInput>>['formState']['errors']
  chatMsg: string; setChatMsg: (v: string) => void
  chatAsCliente: boolean; setChatAsCliente: (v: boolean) => void
  clienteId?: string
}) {
  const [activeTab, setActiveTab] = useState('cadastros')
  const [historicos, setHistoricos] = useState<Array<{ id: string; mensagem: string; tipo: string; createdAt: string; user: { id: string; name: string } | null }>>([])
  const [histLoaded, setHistLoaded] = useState(false)
  const [histSending, setHistSending] = useState(false)

  // Lazy load historicos
  useEffect(() => {
    if (activeTab === 'historicos' && clienteId && !histLoaded) {
      trpc.cliente.listHistoricos.query({ clienteId }).then((data: unknown) => {
        setHistoricos(data as typeof historicos)
        setHistLoaded(true)
      }).catch(() => setHistLoaded(true))
    }
  }, [activeTab, clienteId, histLoaded])

  async function sendHistorico() {
    if (!clienteId || !chatMsg.trim()) return
    setHistSending(true)
    try {
      const item = await trpc.cliente.createHistorico.mutate({
        clienteId, mensagem: chatMsg, tipo: chatAsCliente ? 'cliente' : 'equipe',
      })
      setHistoricos(prev => [...prev, item as typeof historicos[0]])
      setChatMsg('')
    } catch { alerts.error('Erro', 'Não foi possível enviar.') }
    finally { setHistSending(false) }
  }

  async function deleteHistorico(id: string) {
    const ok = await alerts.confirmDelete('esta mensagem')
    if (!ok) return
    try {
      await trpc.cliente.deleteHistorico.mutate({ id })
      setHistoricos(prev => prev.filter(h => h.id !== id))
    } catch {}
  }

  const tabs = [
    { key: 'cadastros', label: 'Cadastros', icon: Briefcase },
    { key: 'contratos', label: 'Contratos', icon: File },
    { key: 'orcamentos', label: 'Orçamentos', icon: FileBarChart },
    { key: 'historicos', label: 'Históricos', icon: History },
  ]

  return (
    <Card>
      <CardHeader>
        <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" /> Comercial
        </h5>
      </CardHeader>
      <div className="flex min-h-[450px]">
        {/* Pills laterais */}
        <div className="w-[170px] shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[#f8f9fa] p-3 overflow-y-auto">
          <div className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                    activeTab === tab.key
                      ? 'text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-white hover:text-foreground'
                  )}
                  style={activeTab === tab.key ? { backgroundColor: '#10b981' } : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div key={activeTab} className="flex-1 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
          {activeTab === 'cadastros' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Dados Comerciais</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <Label>Grupo Empresarial</Label>
                  <div className="flex" style={{ borderRadius: '0.25rem', overflow: 'hidden' }}>
                    <Input placeholder="Ex: EMPRESA ÚNICA" {...register('grupo')} style={{ borderRadius: '0.25rem 0 0 0.25rem', borderRight: 'none' }} />
                    <button type="button" className="shrink-0 whitespace-nowrap" style={{ padding: '0.55rem 0.75rem', fontSize: '.77rem', fontWeight: 500, backgroundColor: '#fff', color: '#212529', border: '1px solid #ced4da', borderLeft: 'none', borderRadius: '0 0.25rem 0.25rem 0', cursor: 'pointer' }}>+ Novo</button>
                  </div>
                </div>
                <div className="col-span-6 md:col-span-3 space-y-1.5">
                  <Label>Data Entrada</Label>
                  <Input type="date" {...register('dataEntrada')} />
                </div>
                <div className="col-span-6 md:col-span-3 space-y-1.5">
                  <Label>Data Saída</Label>
                  <Input type="date" {...register('dataSaida')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Categoria<RequiredMark /></Label>
                  <Controller control={control} name="categoria" render={({ field }) => (
                    <Select value={field.value || 'NAO_INFORMADO'} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIA_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Situação<RequiredMark /></Label>
                  <Controller control={control} name="situacao" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(SITUACAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Origem</Label>
                  <Controller control={control} name="origem" render={({ field }) => (
                    <Select value={field.value || 'NAO_INFORMADO'} onValueChange={(v) => field.onChange(v === 'NAO_INFORMADO' ? '' : v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{ORIGEM_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 -mx-5 mt-1">
                  <div className="px-5 py-2 border-t border-[rgba(0,0,0,0.08)]">
                    <h4 className="text-[13px] font-semibold text-foreground">Observações gerais</h4>
                  </div>
                </div>
                <div className="col-span-12" style={{ marginTop: 'calc(var(--spacing) * -5)' }}>
                  <Controller control={control} name="observacoes" render={({ field }) => (
                    <RichEditor
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Informações relevantes sobre o cliente..."
                    />
                  )} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'contratos' && (
            <ContratosPanel clienteId={clienteId} />
          )}

          {activeTab === 'orcamentos' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-foreground">Orçamentos</h4>
                <Button type="button" variant="outline" size="sm"><Plus className="h-3.5 w-3.5" /> Novo Orçamento</Button>
              </div>
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileBarChart className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm">Nenhum orçamento cadastrado.</p>
              </div>
            </div>
          )}

          {activeTab === 'historicos' && (
            <div className="-m-5">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Histórico de negociações</h4>
              </div>
              <div className="p-5">
                <p className="text-xs text-muted-foreground mb-4">Registros em formato de chat. Use para anotar falas e acordos com o cliente.</p>
                {/* Chat messages */}
                <div className="border border-border rounded-lg bg-muted/10 min-h-[200px] max-h-[400px] overflow-y-auto p-4 mb-4 space-y-3 scrollbar-none">
                  {!histLoaded ? (
                    <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                  ) : historicos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground text-sm py-10">
                      <History className="h-8 w-8 mb-2 opacity-30" />
                      Nenhum registro ainda.
                    </div>
                  ) : (
                    historicos.map((h) => (
                      <div key={h.id} className={cn('flex', h.tipo === 'cliente' ? 'justify-start' : 'justify-end')}>
                        <div className={cn(
                          'max-w-[80%] rounded-lg px-4 py-2.5 relative group',
                          h.tipo === 'cliente'
                            ? 'bg-white border border-border/60 dark:bg-gray-800'
                            : 'text-white'
                        )} style={h.tipo !== 'cliente' ? { backgroundColor: '#10b981' } : undefined}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-semibold" style={h.tipo !== 'cliente' ? { color: 'rgba(255,255,255,0.8)' } : { color: '#495057' }}>
                              {h.tipo === 'cliente' ? 'Cliente' : (h.user?.name || 'Equipe')}
                            </span>
                            <span className="text-[9px]" style={h.tipo !== 'cliente' ? { color: 'rgba(255,255,255,0.6)' } : { color: '#878a99' }}>
                              {new Date(h.createdAt).toLocaleString('pt-BR')}
                            </span>
                          </div>
                          <div className="text-xs prose prose-sm max-w-none" style={h.tipo !== 'cliente' ? { color: '#fff' } : undefined} dangerouslySetInnerHTML={{ __html: h.mensagem }} />
                          <button
                            type="button"
                            onClick={() => deleteHistorico(h.id)}
                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
                            title="Excluir"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {/* Compose */}
                <div className="space-y-3">
                  <RichEditor
                    value={chatMsg}
                    onChange={setChatMsg}
                    placeholder="Digite uma mensagem..."
                  />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground">
                      <Checkbox checked={chatAsCliente} onCheckedChange={(v) => setChatAsCliente(!!v)} />
                      Registrar como fala do cliente
                    </label>
                    <Button type="button" size="sm" disabled={!chatMsg.trim() || histSending} onClick={sendHistorico} style={{ backgroundColor: '#10b981', color: '#fff' }}>
                      {histSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      {histSending ? 'Enviando...' : 'Enviar'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function ContratosPanel({ clienteId }: { clienteId?: string }) {
  const [showParamModal, setShowParamModal] = useState(false)
  const [params, setParams] = useState({ honorario: 0, lancamentos: 0, faturamento: 0, nfEntrada: 0, nfSaida: 0, nfPrestado: 0, nfTomado: 0, funcionarios: 0 })
  const [loadingParams, setLoadingParams] = useState(false)
  const [savingParams, setSavingParams] = useState(false)
  const [fetchingSuggested, setFetchingSuggested] = useState(false)
  const [suggestedInfo, setSuggestedInfo] = useState<string | null>(null)

  // Verificar no ERP
  const [showErpModal, setShowErpModal] = useState(false)
  const [erpDatei, setErpDatei] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().slice(0, 10) })
  const [erpDatef, setErpDatef] = useState(() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10) })
  const [erpIndicadores, setErpIndicadores] = useState<string[]>(['lancamentos', 'faturamento', 'nf_entrada', 'nf_saida', 'nf_prestado', 'nf_tomado', 'vidas'])
  const [erpLoading, setErpLoading] = useState(false)
  const [erpResult, setErpResult] = useState<Record<string, unknown> | null>(null)

  // Graficos
  const [showChartModal, setShowChartModal] = useState(false)
  const [chartDatei, setChartDatei] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10) })
  const [chartDatef, setChartDatef] = useState(() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10) })
  const [chartData, setChartData] = useState<Record<string, unknown> | null>(null)
  const [chartLoading, setChartLoading] = useState(false)

  // Arquivos do contrato
  const [showFilesModal, setShowFilesModal] = useState(false)
  const [files, setFiles] = useState<Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; createdAt: string; user: { name: string } | null }>>([])
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function openParamModal() {
    if (!clienteId) return
    setShowParamModal(true)
    setLoadingParams(true)
    setSuggestedInfo(null)
    try {
      const data = await trpc.cliente.getContratoParams.query({ clienteId })
      if (data) {
        setParams({
          honorario: (data as Record<string, number>).honorario || 0,
          lancamentos: (data as Record<string, number>).lancamentos || 0,
          faturamento: (data as Record<string, number>).faturamento || 0,
          nfEntrada: (data as Record<string, number>).nfEntrada || 0,
          nfSaida: (data as Record<string, number>).nfSaida || 0,
          nfPrestado: (data as Record<string, number>).nfPrestado || 0,
          nfTomado: (data as Record<string, number>).nfTomado || 0,
          funcionarios: (data as Record<string, number>).funcionarios || 0,
        })
      }
    } catch {}
    finally { setLoadingParams(false) }
  }

  async function fetchSuggested() {
    if (!clienteId) return
    setFetchingSuggested(true)
    setSuggestedInfo(null)
    try {
      const result = await trpc.cliente.getParametrosSugeridos.query({ clienteId }) as {
        parametros: Record<string, number>; periodo: { datai: string; dataf: string }; origem: string
      }
      setParams(prev => ({
        ...prev,
        lancamentos: result.parametros.lancamentos ?? prev.lancamentos,
        faturamento: result.parametros.faturamento ?? prev.faturamento,
        nfEntrada: result.parametros.nfEntrada ?? prev.nfEntrada,
        nfSaida: result.parametros.nfSaida ?? prev.nfSaida,
        nfPrestado: result.parametros.nfPrestado ?? prev.nfPrestado,
        nfTomado: result.parametros.nfTomado ?? prev.nfTomado,
        funcionarios: result.parametros.funcionarios ?? prev.funcionarios,
      }))
      setSuggestedInfo(`Dados obtidos do SCI (${result.origem}). Periodo: ${result.periodo.datai} a ${result.periodo.dataf}`)
    } catch (e) {
      alerts.error('Erro ao obter parametros', (e as Error).message || 'Nao foi possivel consultar o SCI.')
    } finally { setFetchingSuggested(false) }
  }

  function toggleErpIndicador(ind: string) {
    setErpIndicadores(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind])
  }

  async function runErpVerification() {
    if (!clienteId || erpIndicadores.length === 0) return
    setErpLoading(true)
    setErpResult(null)
    try {
      const result = await trpc.cliente.buscarMetricasSci.query({
        clienteId, datai: erpDatei, dataf: erpDatef, indicadores: erpIndicadores,
      })
      setErpResult(result as Record<string, unknown>)
    } catch (e) {
      alerts.error('Erro SCI', (e as Error).message || 'Nao foi possivel consultar o ERP.')
    } finally { setErpLoading(false) }
  }

  async function loadChartData() {
    if (!clienteId) return
    setChartLoading(true)
    try {
      const result = await trpc.cliente.buscarMetricasSci.query({
        clienteId, datai: chartDatei, dataf: chartDatef,
        indicadores: ['lancamentos', 'faturamento', 'nf_entrada', 'nf_saida', 'nf_prestado', 'nf_tomado', 'vidas'],
      })
      setChartData(result as Record<string, unknown>)
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Nao foi possivel carregar dados para os graficos.')
    } finally { setChartLoading(false) }
  }

  async function loadFiles() {
    if (!clienteId) return
    try {
      const data = await trpc.cliente.listArquivos.query({ clienteId })
      setFiles(data as typeof files)
      setFilesLoaded(true)
    } catch { setFilesLoaded(true) }
  }

  async function openFilesModal() {
    setShowFilesModal(true)
    if (!filesLoaded) loadFiles()
  }

  async function uploadFiles(fileList: FileList | File[]) {
    if (!clienteId || !fileList || (fileList as FileList).length === 0) return
    setUploading(true)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
    let uploaded = 0
    for (const file of Array.from(fileList)) {
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData })
        if (res.ok) {
          const data = await res.json()
          const url = data.url || data.filename || ''
          if (url) {
            await trpc.cliente.addArquivo.mutate({ clienteId: clienteId!, fileName: file.name, fileUrl: url, fileSize: file.size, mimeType: file.type })
            uploaded++
          }
        }
      } catch { /* skip */ }
    }
    setUploading(false)
    // Forcar reload da lista
    setFilesLoaded(false)
    try {
      const freshData = await trpc.cliente.listArquivos.query({ clienteId: clienteId! })
      setFiles(freshData as typeof files)
      setFilesLoaded(true)
    } catch { setFilesLoaded(true) }
    if (uploaded > 0) alerts.success('Upload concluido', `${uploaded} arquivo(s) enviado(s) com sucesso.`)
  }

  function handleFileClick() {
    if (!clienteId) return
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = (e) => {
      const fl = (e.target as HTMLInputElement).files
      if (fl) uploadFiles(fl)
    }
    input.click()
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.classList.remove('border-emerald-400')
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  async function deleteFile(id: string, name: string) {
    const ok = await alerts.confirmDelete(name)
    if (!ok) return
    try {
      await trpc.cliente.removeArquivo.mutate({ arquivoId: id })
      setFiles(prev => prev.filter(f => f.id !== id))
    } catch {}
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  function getFileIcon(mime: string | null, name: string) {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    if (mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return '🖼️'
    if (mime === 'application/pdf' || ext === 'pdf') return '📄'
    if (['doc', 'docx'].includes(ext)) return '📝'
    if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
    if (['zip', 'rar', '7z'].includes(ext)) return '📦'
    return '📎'
  }

  async function openChartModal() {
    setShowChartModal(true)
    if (!chartData) loadChartData()
  }

  async function saveParams() {
    if (!clienteId) return
    setSavingParams(true)
    try {
      await trpc.cliente.saveContratoParams.mutate({ clienteId, ...params })
      await alerts.success('Parametros salvos', 'Os parametros do contrato foram atualizados.')
      setShowParamModal(false)
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Nao foi possivel salvar.')
    } finally { setSavingParams(false) }
  }

  return (
    <>
      <div className="-m-5">
        <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
          <h4 className="text-[13px] font-semibold text-foreground">Contratos</h4>
        </div>
        <div className="p-5 grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col items-center text-center p-5 rounded border border-dashed border-border/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3"><FileText className="h-6 w-6 text-muted-foreground" /></div>
            <h4 className="font-semibold text-xs mb-1">Parametros</h4>
            <p className="text-[10px] text-muted-foreground mb-3">Parametros do contrato para acompanhamento no grafico.</p>
            <div className="flex flex-col gap-2 w-full">
              <Button type="button" size="sm" onClick={openParamModal} style={{ backgroundColor: '#10b981', color: '#fff' }} className="w-full">→ Atualizar Parametros</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowErpModal(true)} className="w-full"><ExternalLink className="h-3 w-3" /> Verificar no ERP</Button>
            </div>
          </div>
          <div className="flex flex-col items-center text-center p-5 rounded border border-dashed border-border/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3"><FileBarChart className="h-6 w-6 text-muted-foreground" /></div>
            <h4 className="font-semibold text-xs mb-1">Graficos</h4>
            <p className="text-[10px] text-muted-foreground mb-3">Indicadores do cliente (Contrato x ERP).</p>
            <Button type="button" variant="outline" size="sm" onClick={openChartModal}>→ Abrir Graficos</Button>
          </div>
          <div className="flex flex-col items-center text-center p-5 rounded border border-dashed border-border/60">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted mb-3"><File className="h-6 w-6 text-muted-foreground" /></div>
            <h4 className="font-semibold text-xs mb-1">Arquivos</h4>
            <p className="text-[10px] text-muted-foreground mb-3">Contratos, aditivos e documentos.</p>
            <Button type="button" size="sm" onClick={openFilesModal} style={{ backgroundColor: '#10b981', color: '#fff' }}>
              → Gerenciar Arquivos {filesLoaded && files.length > 0 && <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/30 px-1 text-[10px]">{files.length}</span>}
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de Parametros */}
      {showParamModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => setShowParamModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-lg modal-content" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Parametros do Contrato
                </h4>
                <button type="button" onClick={() => setShowParamModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {/* Body */}
              <div className="p-5">
                {loadingParams ? (
                  <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Honorário (R$)</Label>
                      <Input
                        placeholder="0,00"
                        value={numeroParaMoeda(params.honorario)}
                        onChange={(e) => { e.target.value = masks.moeda(e.target.value); setParams(p => ({ ...p, honorario: moedaParaNumero(e.target.value) || 0 })) }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Lancamentos</Label>
                      <Input type="number" value={params.lancamentos} onChange={(e) => setParams(p => ({ ...p, lancamentos: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Faturamento (R$)</Label>
                      <Input
                        placeholder="0,00"
                        value={numeroParaMoeda(params.faturamento)}
                        onChange={(e) => { e.target.value = masks.moeda(e.target.value); setParams(p => ({ ...p, faturamento: moedaParaNumero(e.target.value) || 0 })) }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>NF Entrada</Label>
                      <Input type="number" value={params.nfEntrada} onChange={(e) => setParams(p => ({ ...p, nfEntrada: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>NF Saida</Label>
                      <Input type="number" value={params.nfSaida} onChange={(e) => setParams(p => ({ ...p, nfSaida: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>NF Prestado</Label>
                      <Input type="number" value={params.nfPrestado} onChange={(e) => setParams(p => ({ ...p, nfPrestado: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>NF Tomado</Label>
                      <Input type="number" value={params.nfTomado} onChange={(e) => setParams(p => ({ ...p, nfTomado: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Funcionarios</Label>
                      <Input type="number" value={params.funcionarios} onChange={(e) => setParams(p => ({ ...p, funcionarios: Number(e.target.value) }))} />
                    </div>
                  </div>
                )}
                {suggestedInfo && (
                  <div className="mt-3 rounded bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                    {suggestedInfo}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={fetchSuggested} disabled={fetchingSuggested || loadingParams}>
                  {fetchingSuggested ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />}
                  {fetchingSuggested ? 'Consultando SCI...' : 'Obter parametros iniciais'}
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowParamModal(false)}>Fechar</Button>
                  <Button type="button" size="sm" onClick={saveParams} disabled={savingParams || loadingParams} style={{ backgroundColor: '#10b981', color: '#fff' }}>
                    {savingParams ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {savingParams ? 'Salvando...' : 'Salvar'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Verificar no ERP */}
      {showErpModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => !erpLoading && setShowErpModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col modal-content" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between shrink-0">
                <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                  <ExternalLink className="h-4 w-4 text-muted-foreground" /> Verificar no ERP (SCI)
                </h4>
                <button type="button" onClick={() => !erpLoading && setShowErpModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {/* Filtros */}
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] shrink-0">
                <div className="grid grid-cols-12 gap-3 items-end">
                  <div className="col-span-4 space-y-1.5">
                    <Label>Data Inicial</Label>
                    <Input type="date" value={erpDatei} onChange={(e) => setErpDatei(e.target.value)} />
                  </div>
                  <div className="col-span-4 space-y-1.5">
                    <Label>Data Final</Label>
                    <Input type="date" value={erpDatef} onChange={(e) => setErpDatef(e.target.value)} />
                  </div>
                  <div className="col-span-4">
                    <Button type="button" size="sm" onClick={runErpVerification} disabled={erpLoading} className="w-full" style={{ backgroundColor: '#10b981', color: '#fff' }}>
                      {erpLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />}
                      {erpLoading ? 'Consultando...' : 'Consultar'}
                    </Button>
                  </div>
                  <div className="col-span-12">
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'lancamentos', label: 'Lancamentos' },
                        { key: 'nf_entrada', label: 'NF Entrada' },
                        { key: 'nf_saida', label: 'NF Saida' },
                        { key: 'nf_prestado', label: 'NF Prestado' },
                        { key: 'nf_tomado', label: 'NF Tomado' },
                        { key: 'faturamento', label: 'Faturamento' },
                        { key: 'vidas', label: 'Funcionarios' },
                      ].map((ind) => (
                        <label key={ind.key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <Checkbox checked={erpIndicadores.includes(ind.key)} onCheckedChange={() => toggleErpIndicador(ind.key)} />
                          {ind.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Resultado */}
              <div className="flex-1 overflow-y-auto p-5 scrollbar-none">
                {erpLoading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
                    <p className="text-sm text-muted-foreground">Consultando SCI Firebird...</p>
                  </div>
                ) : !erpResult ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <ExternalLink className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">Selecione o periodo e clique em Consultar.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                      Periodo: {(erpResult.periodo as Record<string, string>)?.datai} a {(erpResult.periodo as Record<string, string>)?.dataf} | CNPJ: {erpResult.cnpj as string}
                    </div>
                    {erpIndicadores.map((ind) => {
                      const rows = erpResult[ind] as Array<Record<string, unknown>> | undefined
                      if (!rows || rows.length === 0) return (
                        <div key={ind} className="text-xs text-muted-foreground">
                          <strong className="text-foreground">{ind}</strong>: Sem dados no periodo
                        </div>
                      )
                      const total = rows.reduce((s, r) => s + (Number(r.movimentacao) || 0), 0)
                      const media = rows.length > 0 ? total / rows.length : 0
                      return (
                        <div key={ind}>
                          <div className="flex items-center justify-between mb-1">
                            <h5 className="text-xs font-semibold text-foreground capitalize">{ind.replace(/_/g, ' ')}</h5>
                            <div className="text-[10px] text-muted-foreground">
                              Total: <strong>{ind === 'faturamento' ? `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : total.toLocaleString('pt-BR')}</strong>
                              &nbsp;|&nbsp;Media: <strong>{ind === 'faturamento' ? `R$ ${media.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : Math.round(media).toLocaleString('pt-BR')}</strong>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="border-b border-border/40">
                                  <th className="text-left py-1 pr-3 font-semibold text-muted-foreground">Mes/Ano</th>
                                  <th className="text-right py-1 font-semibold text-muted-foreground">Valor</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r, i) => (
                                  <tr key={i} className="border-b border-border/20">
                                    <td className="py-1 pr-3">{String(r.mes).padStart(2, '0')}/{r.ano}</td>
                                    <td className="py-1 text-right font-mono">
                                      {ind === 'faturamento'
                                        ? `R$ ${Number(r.movimentacao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                        : Number(r.movimentacao || 0).toLocaleString('pt-BR')
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] flex justify-end shrink-0">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowErpModal(false)}>Fechar</Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Gerenciar Arquivos */}
      {showFilesModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => setShowFilesModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col modal-content" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between shrink-0">
                <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                  <File className="h-4 w-4 text-muted-foreground" /> Arquivos do Contrato
                  {files.length > 0 && <span className="text-[10px] font-normal text-muted-foreground">({files.length})</span>}
                </h4>
                <button type="button" onClick={() => setShowFilesModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              {/* Upload area */}
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] shrink-0">
                <div
                  className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border/60 px-4 py-5 cursor-pointer hover:border-emerald-400/50 transition-colors"
                  onClick={handleFileClick}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add('border-emerald-400') }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-emerald-400') }}
                  onDrop={handleFileDrop}
                >
                  {uploading ? (
                    <><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /><p className="text-xs text-muted-foreground">Enviando arquivos...</p></>
                  ) : (
                    <><FileText className="h-6 w-6 text-muted-foreground/40" /><p className="text-xs font-medium">Clique ou arraste arquivos aqui</p><p className="text-[10px] text-muted-foreground">PDF, Word, Excel, imagens, ZIP</p></>
                  )}
                </div>
              </div>
              {/* Lista de arquivos */}
              <div className="flex-1 overflow-y-auto scrollbar-none">
                {!filesLoaded ? (
                  <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
                ) : files.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <File className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">Nenhum arquivo enviado.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {files.map((f) => {
                      const isImage = f.mimeType?.startsWith('image/')
                      const isPdf = f.mimeType === 'application/pdf' || f.fileName.endsWith('.pdf')
                      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
                      const fullUrl = f.fileUrl.startsWith('http') ? f.fileUrl : `${apiUrl}${f.fileUrl}`
                      return (
                        <div key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 group">
                          {/* Preview / Icon */}
                          <div className="shrink-0">
                            {isImage ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={fullUrl} alt={f.fileName} className="h-10 w-10 rounded object-cover border border-border/40" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-lg">
                                {getFileIcon(f.mimeType, f.fileName)}
                              </div>
                            )}
                          </div>
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <InlineFileName
                              fileName={f.fileName}
                              fileUrl={fullUrl}
                              onRename={async (newName) => {
                                await trpc.cliente.renameArquivo.mutate({ arquivoId: f.id, fileName: newName })
                                setFiles(prev => prev.map(x => x.id === f.id ? { ...x, fileName: newName } : x))
                              }}
                            />
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                              {f.fileSize && <span>{formatFileSize(f.fileSize)}</span>}
                              {f.user && <span>por {f.user.name}</span>}
                              <span>{new Date(f.createdAt).toLocaleDateString('pt-BR')}</span>
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <a href={fullUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground" title="Visualizar">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button type="button" onClick={() => deleteFile(f.id, f.fileName)} className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600" title="Excluir">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Footer */}
              <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] flex items-center justify-between shrink-0">
                <span className="text-[10px] text-muted-foreground">{files.length} arquivo(s)</span>
                <Button type="button" variant="outline" size="sm" onClick={() => setShowFilesModal(false)}>Fechar</Button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal Graficos */}
      {showChartModal && (
        <ChartModal
          chartDatei={chartDatei} setChartDatei={setChartDatei}
          chartDatef={chartDatef} setChartDatef={setChartDatef}
          chartData={chartData} chartLoading={chartLoading}
          params={params}
          onLoad={loadChartData}
          onClose={() => setShowChartModal(false)}
          onOpenErp={() => { setShowChartModal(false); setShowErpModal(true) }}
        />
      )}
    </>
  )
}

// Modal de Graficos completo
function ChartModal({ chartDatei, setChartDatei, chartDatef, setChartDatef, chartData, chartLoading, params, onLoad, onClose, onOpenErp }: {
  chartDatei: string; setChartDatei: (v: string) => void
  chartDatef: string; setChartDatef: (v: string) => void
  chartData: Record<string, unknown> | null; chartLoading: boolean
  params: Record<string, number>
  onLoad: () => void; onClose: () => void; onOpenErp: () => void
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const [sections, setSections] = useState({
    parametros: true, comparativo: true,
    lancamentos: true, faturamento: true, nf_entrada: true, nf_saida: true,
    nf_prestado: true, nf_tomado: true, vidas: true,
  })
  const [Charts, setCharts] = useState<{ Bar: React.ComponentType<Record<string, unknown>> } | null>(null)

  useEffect(() => {
    Promise.all([
      import('chart.js').then(mod => {
        mod.Chart.register(mod.CategoryScale, mod.LinearScale, mod.BarElement, mod.LineElement, mod.PointElement, mod.Title, mod.Tooltip, mod.Legend, mod.Filler)
      }),
      import('react-chartjs-2'),
    ]).then(([, c]) => setCharts({ Bar: c.Bar as React.ComponentType<Record<string, unknown>> }))
  }, [])

  const INDICATORS = [
    { key: 'lancamentos', label: 'Lancamentos', paramKey: 'lancamentos', color: '#5ea3cb', isMoney: false },
    { key: 'faturamento', label: 'Faturamento', paramKey: 'faturamento', color: '#10b981', isMoney: true },
    { key: 'nf_entrada', label: 'NF Entrada', paramKey: 'nfEntrada', color: '#f59e0b', isMoney: false },
    { key: 'nf_saida', label: 'NF Saida', paramKey: 'nfSaida', color: '#8b5cf6', isMoney: false },
    { key: 'nf_prestado', label: 'NF Prestado', paramKey: 'nfPrestado', color: '#06b6d4', isMoney: false },
    { key: 'nf_tomado', label: 'NF Tomado', paramKey: 'nfTomado', color: '#ec4899', isMoney: false },
    { key: 'vidas', label: 'Funcionarios', paramKey: 'funcionarios', color: '#f97316', isMoney: false },
  ]

  const fmtVal = (v: number, money: boolean) => money ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : v.toLocaleString('pt-BR')

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => !chartLoading && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className={cn('bg-card rounded-lg shadow-xl flex flex-col modal-content transition-all', fullscreen ? 'w-full h-full max-w-none max-h-none rounded-none' : 'w-full max-w-5xl max-h-[90vh]')} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between shrink-0">
            <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
              <FileBarChart className="h-4 w-4 text-muted-foreground" /> Graficos — Contrato x ERP
            </h4>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setFullscreen(!fullscreen)} className="text-muted-foreground hover:text-foreground" title={fullscreen ? 'Restaurar' : 'Tela cheia'}>
                {fullscreen ? <ArrowLeft className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
              </button>
              <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          </div>
          {/* Filtros + Checkboxes */}
          <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] shrink-0 space-y-2">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1"><Label>Inicio</Label><Input type="date" value={chartDatei} onChange={(e) => setChartDatei(e.target.value)} /></div>
              <div className="space-y-1"><Label>Fim</Label><Input type="date" value={chartDatef} onChange={(e) => setChartDatef(e.target.value)} /></div>
              <Button type="button" size="sm" onClick={onLoad} disabled={chartLoading} style={{ backgroundColor: '#10b981', color: '#fff' }}>
                {chartLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SearchIcon className="h-3.5 w-3.5" />} Atualizar
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">Exibir:</span>
              {[
                { k: 'parametros', l: 'Parametros' }, { k: 'comparativo', l: 'Comparativo' },
                ...INDICATORS.map(i => ({ k: i.key, l: i.label })),
              ].map(s => (
                <label key={s.k} className="flex items-center gap-1 text-[10px] cursor-pointer">
                  <Checkbox checked={sections[s.k as keyof typeof sections] ?? true} onCheckedChange={(v) => setSections(prev => ({ ...prev, [s.k]: !!v }))} />
                  {s.l}
                </label>
              ))}
            </div>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5 scrollbar-none">
            {chartLoading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-3" />
                <p className="text-sm text-muted-foreground">Carregando dados do SCI...</p>
              </div>
            ) : !chartData ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileBarChart className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm mb-3">Nenhuma consulta ERP salva para este periodo.</p>
                <Button type="button" variant="outline" size="sm" onClick={onOpenErp}>Executar Verificar no ERP</Button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Parametros do contrato */}
                {sections.parametros && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {INDICATORS.map(ind => {
                      const paramVal = params[ind.paramKey] || 0
                      const rows = chartData[ind.key] as Array<Record<string, unknown>> | undefined
                      const total = rows ? (rows as Array<Record<string, unknown>>).reduce((s: number, r) => s + (Number(r.movimentacao) || 0), 0) : 0
                      const avg = rows && rows.length > 0 ? total / rows.length : 0
                      const status = paramVal > 0 && avg > paramVal ? 'defasado' : 'ok'
                      return (
                        <div key={ind.key} className="rounded border border-border/40 p-3">
                          <p className="text-[10px] text-muted-foreground uppercase">{ind.label}</p>
                          <p className="text-lg font-bold" style={{ color: ind.color }}>{fmtVal(Math.round(ind.isMoney ? avg : avg), ind.isMoney)}</p>
                          {paramVal > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-[9px] text-muted-foreground">Contrato: {fmtVal(paramVal, ind.isMoney)}</span>
                              <span className={cn('text-[9px] font-bold px-1 rounded', status === 'ok' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                                {status === 'ok' ? 'OK' : 'DEFASADO'}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Comparativo */}
                {sections.comparativo && (
                  <div className="rounded border border-border/40 overflow-hidden">
                    <div className="px-4 py-2 bg-muted/30 border-b border-border/40">
                      <h5 className="text-xs font-semibold">Comparativo: Contrato x ERP (media mensal)</h5>
                    </div>
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-border/40 bg-muted/10">
                        <th className="text-left py-2 px-3 font-semibold">Indicador</th>
                        <th className="text-right py-2 px-3 font-semibold">Contrato</th>
                        <th className="text-right py-2 px-3 font-semibold">ERP (media)</th>
                        <th className="text-center py-2 px-3 font-semibold">Status</th>
                      </tr></thead>
                      <tbody>
                        {INDICATORS.map(ind => {
                          const paramVal = params[ind.paramKey] || 0
                          const rows = chartData[ind.key] as Array<Record<string, unknown>> | undefined
                          const total = rows ? rows.reduce((s: number, r) => s + (Number(r.movimentacao) || 0), 0) : 0
                          const avg = rows && rows.length > 0 ? total / rows.length : 0
                          const status = !paramVal ? 'sem parametro' : avg > paramVal ? 'defasado' : 'ok'
                          return (
                            <tr key={ind.key} className="border-b border-border/20">
                              <td className="py-1.5 px-3 font-medium">{ind.label}</td>
                              <td className="py-1.5 px-3 text-right font-mono">{paramVal ? fmtVal(paramVal, ind.isMoney) : '—'}</td>
                              <td className="py-1.5 px-3 text-right font-mono">{fmtVal(ind.isMoney ? avg : Math.round(avg), ind.isMoney)}</td>
                              <td className="py-1.5 px-3 text-center">
                                <span className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded',
                                  status === 'ok' ? 'bg-emerald-100 text-emerald-700' :
                                  status === 'defasado' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-500'
                                )}>{status === 'ok' ? 'OK' : status === 'defasado' ? 'DEFASADO' : 'SEM PARAM'}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Graficos por indicador */}
                {Charts && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {INDICATORS.filter(ind => sections[ind.key as keyof typeof sections]).map((ind) => {
                      const rows = (chartData[ind.key] as Array<Record<string, unknown>> | undefined || [])
                        .sort((a: Record<string, unknown>, b: Record<string, unknown>) => (Number(a.ano) * 100 + Number(a.mes)) - (Number(b.ano) * 100 + Number(b.mes)))
                      if (rows.length === 0) return null
                      const labels = rows.map((r: Record<string, unknown>) => `${String(r.mes).padStart(2, '0')}/${r.ano}`)
                      const values = rows.map((r: Record<string, unknown>) => Number(r.movimentacao) || 0)
                      const paramVal = params[ind.paramKey] || 0

                      const cData = {
                        labels,
                        datasets: [
                          { label: 'ERP (SCI)', data: values, backgroundColor: ind.color + '80', borderColor: ind.color, borderWidth: 1, borderRadius: 3 },
                          ...(paramVal > 0 ? [{ label: 'Limite contrato', data: labels.map(() => paramVal), type: 'line' as const, borderColor: '#ef4444', borderWidth: 2, borderDash: [6, 3], pointRadius: 0, fill: false }] : []),
                        ],
                      }
                      const opts = {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                          legend: { position: 'top' as const, labels: { font: { size: 10 }, usePointStyle: true, pointStyleWidth: 8 } },
                          title: { display: true, text: ind.label, font: { size: 12, weight: '600' as const }, color: '#212529' },
                        },
                        scales: {
                          y: { beginAtZero: true, ticks: { font: { size: 9 }, callback: (v: number) => ind.isMoney ? `R$ ${(v/1000).toFixed(0)}k` : String(v) } },
                          x: { ticks: { font: { size: 9 } } },
                        },
                      }
                      return (
                        <div key={ind.key} className="rounded border border-border/40 p-4">
                          <div style={{ height: fullscreen ? '350px' : '220px' }}>
                            <Charts.Bar data={cData} options={opts} />
                          </div>
                          {/* Mini tabela abaixo */}
                          <div className="mt-2 max-h-[120px] overflow-y-auto scrollbar-none">
                            <table className="w-full text-[10px]">
                              <tbody>
                                {rows.map((r: Record<string, unknown>, i: number) => (
                                  <tr key={i} className="border-b border-border/10">
                                    <td className="py-0.5">{String(r.mes).padStart(2, '0')}/{r.ano}</td>
                                    <td className="py-0.5 text-right font-mono">{fmtVal(Number(r.movimentacao) || 0, ind.isMoney)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Footer */}
          <div className="px-5 py-3 border-t border-[rgba(0,0,0,0.08)] flex justify-end shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>Fechar</Button>
          </div>
        </div>
      </div>
    </>
  )
}

function InlineFileName({ fileName, fileUrl, onRename }: { fileName: string; fileUrl: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Separar nome e extensao
  const dotIdx = fileName.lastIndexOf('.')
  const baseName = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName
  const extension = dotIdx > 0 ? fileName.slice(dotIdx) : ''
  const [value, setValue] = useState(baseName)

  async function save() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === baseName) { setEditing(false); setValue(baseName); return }
    setSaving(true)
    try {
      await onRename(trimmed + extension)
      setEditing(false)
    } catch { setValue(baseName); setEditing(false) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          autoFocus
          className="text-xs font-medium border border-primary rounded px-1.5 py-0.5 flex-1 outline-none min-w-0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setValue(baseName) } }}
          onBlur={save}
          disabled={saving}
          onFocus={(e) => e.target.select()}
        />
        <span className="text-[10px] text-muted-foreground shrink-0">{extension}</span>
      </div>
    )
  }

  return (
    <span
      className="text-xs font-medium truncate block cursor-text hover:text-primary"
      onClick={() => { setValue(baseName); setEditing(true) }}
      title="Clique para renomear"
    >
      {fileName}
    </span>
  )
}

function GoogleMapsEmbed({ logradouro, numero, bairro, cidade, uf, cep }: {
  logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string
}) {
  const address = [logradouro, numero, bairro, cidade, uf, cep].filter(Boolean).join(', ')

  if (!address || address.replace(/,\s*/g, '').trim().length < 5) {
    return (
      <div className="flex items-center justify-center rounded bg-muted/30 border border-dashed border-border/60 py-12 text-sm text-muted-foreground">
        Preencha o endereço para visualizar no mapa
      </div>
    )
  }

  const query = encodeURIComponent(address)
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`

  return (
    <div className="space-y-2">
      <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        Abrir no Maps <ExternalLink className="h-3 w-3" />
      </a>
      <div className="relative w-full overflow-hidden rounded" style={{ aspectRatio: '21/9' }}>
        <iframe
          title="Mapa do cliente"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          style={{ border: 0, width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          allowFullScreen
          src={`https://maps.google.com/maps?q=${query}&z=15&output=embed`}
        />
      </div>
    </div>
  )
}

function LogsTab({ clienteId }: { clienteId: string }) {
  const [events, setEvents] = useState<Array<{
    id: string; type: string; version: number; changes: Record<string, { from: unknown; to: unknown }> | null
    createdAt: string; user: { id: string; name: string } | null
  }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    trpc.cliente.getEvents.query({ clienteId })
      .then((data: unknown) => setEvents(data as typeof events))
      .finally(() => setLoading(false))
  }, [clienteId])

  const typeLabels: Record<string, { label: string; color: string }> = {
    created: { label: 'Criado', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    updated: { label: 'Atualizado', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
    deleted: { label: 'Excluído', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
    restored: { label: 'Restaurado', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  }

  if (loading) return <Card className="flex items-center justify-center py-16"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></Card>

  if (events.length === 0) return <PlaceholderTab icon={ListTodo} title="Sem registros" description="Nenhuma alteração registrada ainda." />

  return (
    <Card className="p-5">
      <h4 className="text-sm font-semibold mb-4">Histórico de alterações</h4>
      <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-none">
        {events.map((evt) => {
          const t = typeLabels[evt.type] || { label: evt.type, color: 'bg-muted text-muted-foreground' }
          return (
            <div key={evt.id} className="flex gap-3 text-sm border-b border-border/30 pb-3 last:border-0">
              <div className="shrink-0 mt-0.5">
                <span className={cn('inline-flex rounded px-2 py-0.5 text-[10px] font-medium', t.color)}>{t.label}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  {evt.user?.name || 'Sistema'} &middot; v{evt.version} &middot; {new Date(evt.createdAt).toLocaleDateString('pt-BR')} {new Date(evt.createdAt).toLocaleTimeString('pt-BR')}
                </p>
                {evt.changes && Object.keys(evt.changes).length > 0 && (
                  <div className="mt-1.5 space-y-1">
                    {Object.entries(evt.changes).map(([field, change]) => (
                      <div key={field} className="text-xs">
                        <span className="font-medium">{field}</span>: <span className="text-muted-foreground line-through">{String(change.from || '—')}</span> → <span className="text-foreground">{String(change.to || '—')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function ArquivosSidebar({ clienteId }: { clienteId: string }) {
  const [arquivos, setArquivos] = useState<Array<{ id: string; fileName: string; fileUrl: string; fileSize: number | null; mimeType: string | null; createdAt: string; user: { name: string } | null }>>([])
  const [loading, setLoading] = useState(true)

  function load() {
    trpc.cliente.listArquivos.query({ clienteId })
      .then((data: unknown) => setArquivos(data as typeof arquivos))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [clienteId])

  async function handleUpload() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files) return
      for (const file of Array.from(files)) {
        const formData = new FormData()
        formData.append('file', file)
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/upload`, { method: 'POST', body: formData })
          const { url } = await res.json()
          await trpc.cliente.addArquivo.mutate({
            clienteId, fileName: file.name, fileUrl: url,
            fileSize: file.size, mimeType: file.type,
          })
        } catch { /* skip */ }
      }
      load()
      alerts.success('Upload concluído', 'Arquivos enviados com sucesso.')
    }
    input.click()
  }

  async function handleRemove(id: string, name: string) {
    const ok = await alerts.confirmDelete(name)
    if (!ok) return
    await trpc.cliente.removeArquivo.mutate({ arquivoId: id })
    load()
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold">Arquivos</h4>
        <Button type="button" variant="outline" size="sm" onClick={handleUpload}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : arquivos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum arquivo enviado.</p>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-none">
          {arquivos.map((arq) => (
            <div key={arq.id} className="flex items-center gap-2 text-xs group">
              <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a href={arq.fileUrl} target="_blank" rel="noopener noreferrer" className="truncate block hover:text-primary font-medium">{arq.fileName}</a>
                <span className="text-muted-foreground">{formatSize(arq.fileSize)}</span>
              </div>
              <button type="button" onClick={() => handleRemove(arq.id, arq.fileName)} className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ================================================================== */
/* ContatosTab — tabela de contatos dentro da sub-tab Contato         */
/* ================================================================== */
type ContatoRow = {
  id: string; nome: string; cargo: string | null; telefone: string | null
  email: string | null; observacoes: string | null; principal: boolean
  areaId: string | null; area: { id: string; name: string } | null
}
type AreaOption = { id: string; name: string }

function ContatosTab({ clienteId }: { clienteId?: string }) {
  const [contatos, setContatos] = useState<ContatoRow[]>([])
  const [areas, setAreas] = useState<AreaOption[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // form fields
  const [fNome, setFNome] = useState('')
  const [fCargo, setFCargo] = useState('')
  const [fTelefone, setFTelefone] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fObs, setFObs] = useState('')
  const [fAreaId, setFAreaId] = useState('')

  function load() {
    if (!clienteId) { setLoading(false); return }
    trpc.cliente.listContatos.query({ clienteId })
      .then((data) => setContatos(data as ContatoRow[]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    trpc.area.listForSelect.query()
      .then((data: unknown) => setAreas(data as AreaOption[]))
      .catch(() => {})
  }, [clienteId])

  function resetForm() {
    setFNome(''); setFCargo(''); setFTelefone(''); setFEmail(''); setFObs(''); setFAreaId('')
  }

  function startEdit(c: ContatoRow) {
    setEditingId(c.id)
    setFNome(c.nome)
    setFCargo(c.cargo || '')
    setFTelefone(c.telefone || '')
    setFEmail(c.email || '')
    setFObs(c.observacoes || '')
    setFAreaId(c.areaId || '')
    setAdding(false)
  }

  function cancelEdit() {
    setEditingId(null)
    resetForm()
  }

  function startAdd() {
    setAdding(true)
    setEditingId(null)
    resetForm()
  }

  async function handleAdd() {
    if (!clienteId || !fNome.trim()) return
    await trpc.cliente.addContato.mutate({
      clienteId, nome: fNome, cargo: fCargo || undefined,
      telefone: fTelefone || undefined, email: fEmail || undefined,
      observacoes: fObs || undefined, areaId: fAreaId || undefined,
    })
    resetForm()
    setAdding(false)
    load()
  }

  async function handleUpdate() {
    if (!editingId || !fNome.trim()) return
    await trpc.cliente.updateContato.mutate({
      contatoId: editingId, nome: fNome, cargo: fCargo || undefined,
      telefone: fTelefone || undefined, email: fEmail || undefined,
      observacoes: fObs || undefined, areaId: fAreaId || null,
    })
    cancelEdit()
    load()
  }

  async function handleRemove(id: string, nome: string) {
    const ok = await alerts.confirmDelete(nome)
    if (!ok) return
    await trpc.cliente.removeContato.mutate({ contatoId: id })
    if (editingId === id) cancelEdit()
    load()
  }

  async function handleSetPrincipal(id: string) {
    await trpc.cliente.setPrincipalContato.mutate({ contatoId: id })
    load()
  }

  /* Select de área reutilizável */
  function AreaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
      <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
        <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Nenhuma</SelectItem>
          {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    )
  }

  if (!clienteId) {
    return (
      <div className="-m-5">
        <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
          <h4 className="text-[13px] font-semibold text-foreground">Contatos do Cliente</h4>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Users className="h-10 w-10 mb-2 opacity-20" />
          <p className="text-sm">Salve o cliente primeiro para gerenciar contatos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="-m-5">
      <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
        <h4 className="text-[13px] font-semibold text-foreground">Contatos do Cliente</h4>
        <Button type="button" variant="outline" size="sm" onClick={startAdd}>
          <Plus className="h-3.5 w-3.5" /> Novo Contato
        </Button>
      </div>

      <div className="p-5">
        {/* Form inline para adicionar */}
        {adding && (
          <div className="mb-4 p-4 rounded-lg border border-emerald-200 bg-emerald-50/50">
            <h5 className="text-xs font-semibold text-foreground mb-3">Novo Contato</h5>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Nome *</Label>
                <Input placeholder="Nome do contato" value={fNome} onChange={(e) => setFNome(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Cargo</Label>
                <Input placeholder="Ex: Diretor, Gerente..." value={fCargo} onChange={(e) => setFCargo(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Área Vinculada</Label>
                <AreaSelect value={fAreaId} onChange={setFAreaId} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Telefone</Label>
                <Input placeholder="(xx) xxxxx-xxxx" value={fTelefone} onChange={(e) => setFTelefone(masks.telefone(e.target.value))} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="email@empresa.com" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Observações</Label>
                <Input placeholder="Observações sobre este contato..." value={fObs} onChange={(e) => setFObs(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button type="button" size="sm" className="bg-emerald-500 text-white hover:bg-emerald-600" onClick={handleAdd} disabled={!fNome.trim()}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAdding(false); resetForm() }}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Form inline para editar */}
        {editingId && (
          <div className="mb-4 p-4 rounded-lg border border-sky-200 bg-sky-50/50">
            <h5 className="text-xs font-semibold text-foreground mb-3">Editar Contato</h5>
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Nome *</Label>
                <Input placeholder="Nome do contato" value={fNome} onChange={(e) => setFNome(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Cargo</Label>
                <Input placeholder="Ex: Diretor, Gerente..." value={fCargo} onChange={(e) => setFCargo(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Área Vinculada</Label>
                <AreaSelect value={fAreaId} onChange={setFAreaId} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Telefone</Label>
                <Input placeholder="(xx) xxxxx-xxxx" value={fTelefone} onChange={(e) => setFTelefone(masks.telefone(e.target.value))} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" placeholder="email@empresa.com" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label>Observações</Label>
                <Input placeholder="Observações sobre este contato..." value={fObs} onChange={(e) => setFObs(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button type="button" size="sm" className="bg-sky-500 text-white hover:bg-sky-600" onClick={handleUpdate} disabled={!fNome.trim()}>
                <Save className="h-3.5 w-3.5" /> Salvar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Tabela de contatos */}
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : contatos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm">Nenhum contato cadastrado.</p>
            <p className="text-xs mt-1">Clique em &quot;Novo Contato&quot; para adicionar.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[rgba(0,0,0,0.08)]">
                  <th className="text-left py-2.5 px-3 font-semibold w-[40px]"></th>
                  <th className="text-left py-2.5 px-3 font-semibold">Nome</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Cargo</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Área</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Telefone</th>
                  <th className="text-left py-2.5 px-3 font-semibold">E-mail</th>
                  <th className="text-left py-2.5 px-3 font-semibold">Observações</th>
                  <th className="text-center py-2.5 px-3 font-semibold w-[90px]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {contatos.map((c) => (
                  <tr key={c.id} className={cn(
                    'border-b border-[rgba(0,0,0,0.05)] group transition-colors',
                    c.principal ? 'bg-emerald-50/60' : 'hover:bg-muted/30'
                  )}>
                    {/* Estrela principal */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        title={c.principal ? 'Contato principal' : 'Definir como principal'}
                        onClick={() => !c.principal && handleSetPrincipal(c.id)}
                        className={cn(
                          'transition-colors',
                          c.principal
                            ? 'text-amber-500 cursor-default'
                            : 'text-muted-foreground/30 hover:text-amber-400 cursor-pointer'
                        )}
                      >
                        <Star className={cn('h-4 w-4', c.principal && 'fill-amber-500')} />
                      </button>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-medium">{c.nome}</span>
                      {c.principal && <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium">Principal</span>}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.cargo || '—'}</td>
                    <td className="py-2.5 px-3">
                      {c.area ? (
                        <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-2 py-0.5 text-[10px] font-medium border border-sky-200">
                          {c.area.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.telefone || '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{c.email || '—'}</td>
                    <td className="py-2.5 px-3 text-muted-foreground max-w-[180px] truncate">{c.observacoes || '—'}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" title="Editar" onClick={() => startEdit(c)}
                          className="p-1 rounded hover:bg-sky-100 text-sky-600 transition-colors">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" title="Excluir" onClick={() => handleRemove(c.id, c.nome)}
                          className="p-1 rounded hover:bg-red-100 text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
