'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm, Controller, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createEmpresaSchema, type CreateEmpresaInput } from '@saas/types'
import { HelpCircle, Scale, MapPin, Phone, Search, Loader2, Upload, X, Save, Building2, Plug, Users } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Card,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Switch,
  Checkbox,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)

const EMPRESA_TABS = [
  { key: 'dados-legais', label: 'Dados Legais', icon: Scale },
  { key: 'endereco',     label: 'Endereço',     icon: MapPin },
  { key: 'contato',      label: 'Contato',      icon: Phone },
  { key: 'logo',         label: 'Logomarca',    icon: Upload },
  { key: 'integracoes',  label: 'Integrações',  icon: Plug },
  { key: 'usuarios',     label: 'Usuários',     icon: Users },
] as const

type EmpresaTabKey = typeof EMPRESA_TABS[number]['key']

// Mapeia cada campo do schema pra aba onde está renderizado — usado pra pular
// pro tab com erro quando o usuário tenta salvar sem preencher tudo.
const TAB_BY_FIELD: Record<string, EmpresaTabKey> = {
  razaoSocial: 'dados-legais', nomeFantasia: 'dados-legais', cnpj: 'dados-legais',
  inscricaoEstadual: 'dados-legais', inscricaoMunicipal: 'dados-legais', taxRegime: 'dados-legais',
  cep: 'endereco', logradouro: 'endereco', numero: 'endereco', complemento: 'endereco',
  bairro: 'endereco', cidade: 'endereco', uf: 'endereco',
  telefone: 'contato', email: 'contato', site: 'contato',
  logoUrl: 'logo', logoDarkUrl: 'logo', marcaDaguaUrl: 'logo',
}
import { cn } from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { masks } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { refreshEmpresaAtiva } from '@/hooks/use-empresa-ativa'

interface EmpresaFormProps {
  mode: 'create' | 'edit'
  empresaId?: string
  title: string
  /** Complemento do título (ex.: código do registro). Some no modo criação. */
  description?: string
  defaultValues?: Partial<CreateEmpresaInput> & { code?: number }
}

function RequiredMark() {
  return <span className="text-destructive ml-0.5">*</span>
}

function FieldHint({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

const UF_OPTIONS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC',
  'SP','SE','TO',
]

function LogoUpload({ control, setValue, fieldName = 'logoUrl' }: {
  control: Control<CreateEmpresaInput>
  setValue: ReturnType<typeof useForm<CreateEmpresaInput>>['setValue']
  fieldName?: 'logoUrl' | 'logoDarkUrl' | 'marcaDaguaUrl'
  label?: string
}) {
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      alerts.error('Arquivo muito grande', 'O tamanho máximo é 2MB.')
      return
    }

    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp']
    if (!allowed.includes(file.type)) {
      alerts.error('Tipo inválido', 'Use: PNG, JPG, GIF, SVG ou WebP.')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const apiUrl = getApiUrl()
      const res = await fetch(`${apiUrl}/api/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })

      if (!res.ok) throw new Error()

      const data = await res.json()
      setValue(fieldName, data.url, { shouldDirty: true })
    } catch {
      alerts.error('Erro no upload', 'Não foi possível enviar a imagem.')
    } finally {
      setUploading(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <Controller
      control={control}
      name={fieldName}
      render={({ field }) => {
        const url = field.value

        if (url) {
          return (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveAssetUrl(url)}
                alt="Logo"
                className="h-16 w-auto max-w-[180px] rounded-[2px] border border-border object-contain bg-white p-1.5"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => setValue(fieldName, '', { shouldDirty: true })}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )
        }

        return (
          <div
            className={`flex flex-col items-center justify-center gap-2 rounded-[2px] border-2 border-dashed px-6 py-5 transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:border-primary/50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp'
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (file) handleFile(file)
              }
              input.click()
            }}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                {uploading ? 'Enviando...' : 'Clique ou arraste a imagem'}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                PNG, JPG, SVG ou WebP (max 2MB)
              </p>
            </div>
          </div>
        )
      }}
    />
  )
}

export function EmpresaForm({ mode, empresaId, title, description, defaultValues }: EmpresaFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<EmpresaTabKey>('dados-legais')

  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CreateEmpresaInput>({
    resolver: zodResolver(createEmpresaSchema),
    defaultValues: {
      razaoSocial: '',
      nomeFantasia: '',
      cnpj: '',
      inscricaoEstadual: '',
      inscricaoMunicipal: '',
      taxRegime: undefined,
      isActive: true,
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      telefone: '',
      email: '',
      site: '',
      logoUrl: '',
      logoDarkUrl: '',
      marcaDaguaUrl: '',
      serproHabilitado: false,
      serproOrcamentoMensal: null,
      ...defaultValues,
    },
  })

  const [fetching, setFetching] = useState(false)
  const [cnpjError, setCnpjError] = useState<string | null>(null)

  async function fetchCnpj() {
    const rawCnpj = getValues('cnpj')
    const digits = rawCnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      setCnpjError('CNPJ deve ter 14 dígitos')
      return
    }

    setCnpjError(null)
    setFetching(true)
    try {
      // Via backend (tRPC) — evita CORS, extensões do browser e centraliza fallback BrasilAPI/SERPRO.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await (trpc.socio as any).consultarCnpj.query({ cnpj: digits }) as {
        razaoSocial: string | null
        nomeFantasia: string | null
        cep: string | null
        logradouro: string | null
        numero: string | null
        complemento: string | null
        bairro: string | null
        municipio: string | null
        uf: string | null
      }

      if (data.razaoSocial) setValue('razaoSocial', data.razaoSocial, { shouldDirty: true })
      if (data.nomeFantasia) setValue('nomeFantasia', data.nomeFantasia, { shouldDirty: true })
      if (data.cep) setValue('cep', String(data.cep).replace(/\D/g, ''), { shouldDirty: true })
      if (data.logradouro) setValue('logradouro', data.logradouro, { shouldDirty: true })
      if (data.numero) setValue('numero', data.numero, { shouldDirty: true })
      if (data.complemento) setValue('complemento', data.complemento, { shouldDirty: true })
      if (data.bairro) setValue('bairro', data.bairro, { shouldDirty: true })
      if (data.municipio) setValue('cidade', data.municipio, { shouldDirty: true })
      if (data.uf) setValue('uf', data.uf, { shouldDirty: true })
    } catch (err) {
      const msg = (err as Error).message || ''
      setCnpjError(msg.includes('não encontrado') || msg.includes('404')
        ? 'CNPJ não encontrado na Receita Federal'
        : 'Erro ao consultar CNPJ. Tente novamente.',
      )
    } finally {
      setFetching(false)
    }
  }

  async function onSubmit(data: CreateEmpresaInput) {
    setError(null)
    setSaving(true)
    try {
      if (mode === 'create') {
        await trpc.empresa.create.mutate(data)
        await alerts.success('Empresa criada', 'O registro foi salvo com sucesso.')
      } else if (empresaId) {
        await trpc.empresa.update.mutate({ id: empresaId, data })
        await alerts.success('Empresa atualizada', 'As alterações foram salvas.')
      }
      // Atualizar logo/nome no header
      refreshEmpresaAtiva()
      router.push('/empresas')
    } catch {
      alerts.error('Erro', mode === 'create' ? 'Não foi possível criar a empresa.' : 'Não foi possível atualizar a empresa.')
    } finally {
      setSaving(false)
    }
  }

  // Pula pra primeira aba com erro + mostra toast quando a validação falha.
  // Sem isso, o clique no Salvar parecia não fazer nada porque o erro estava em
  // aba não-visível (ex: telefone faltando em "Contato" mas usuário em "Dados Legais").
  function onInvalid(errs: Record<string, unknown>) {
    const firstErrorField = Object.keys(errs)[0]
    const targetTab = firstErrorField ? TAB_BY_FIELD[firstErrorField] : undefined
    if (targetTab && targetTab !== activeTab) setActiveTab(targetTab)
    alerts.warning(
      'Campos obrigatórios',
      'Preencha os campos destacados em vermelho antes de salvar.',
    )
  }

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-5">
        {/* Topo — PADRAO_PAGINAS §1.1 */}
        <PageHeaderBar actions={<>
            <Button variant="success" size="sm" type="submit" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            <BackButton href="/empresas" />
        </>}>
          <h1 className="truncate">{title}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
            <span className="text-muted-foreground/50">›</span>
            <span>Cadastros</span>
            <span className="text-muted-foreground/50">›</span>
            <span>Empresas</span>
          </p>
          {description && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{description}</div>
          )}
        </PageHeaderBar>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h5 className="text-[13px] font-semibold">Detalhes da Empresa</h5>
          </div>
          <div className="flex min-h-[500px]">
            {/* Pills laterais — padrão dos demais módulos */}
            <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto nice-scrollbar">
              <div className="space-y-1">
                {EMPRESA_TABS.map(tab => {
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
                          : 'text-muted-foreground hover:bg-white dark:hover:bg-muted/60 hover:text-foreground',
                      )}
                      style={activeTab === tab.key ? { backgroundColor: MODULE_COLOR } : undefined}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div
              key={activeTab}
              className="flex-1 min-w-0 p-5"
              style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
            >

            {/* DADOS LEGAIS */}
            {activeTab === 'dados-legais' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mode === 'edit' && defaultValues?.code !== undefined && (
                  <div className="space-y-1.5">
                    <Label>ID</Label>
                    <Input value={defaultValues.code} disabled className="bg-muted" />
                  </div>
                )}
                <div className={`space-y-1.5 ${mode === 'create' ? 'sm:col-span-2' : ''}`}>
                  <Label htmlFor="razaoSocial">Razão Social<RequiredMark /></Label>
                  <Input
                    id="razaoSocial"
                    placeholder="Razão social da empresa"
                    {...register('razaoSocial')}
                  />
                  {errors.razaoSocial && (
                    <p className="text-xs text-destructive mt-1">{errors.razaoSocial.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nomeFantasia">Nome Fantasia</Label>
                  <Input
                    id="nomeFantasia"
                    placeholder="Nome fantasia"
                    {...register('nomeFantasia')}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="cnpj">CNPJ<RequiredMark /></Label>
                    <FieldHint text="Digite o CNPJ e clique na lupa para consultar automaticamente os dados da empresa na Receita Federal." />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="cnpj"
                      placeholder="00.000.000/0000-00"
                      {...register('cnpj')}
                      onChange={e => { e.target.value = masks.cnpj(e.target.value); register('cnpj').onChange(e) }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="soft"
                      size="icon"
                      className="shrink-0"
                      onClick={fetchCnpj}
                      disabled={fetching}
                    >
                      {fetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {errors.cnpj && (
                    <p className="text-xs text-destructive mt-1">{errors.cnpj.message}</p>
                  )}
                  {cnpjError && (
                    <p className="text-xs text-destructive mt-1">{cnpjError}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="inscricaoEstadual">Inscrição Estadual</Label>
                    <FieldHint text="Número de registro estadual da empresa." />
                  </div>
                  <Input
                    id="inscricaoEstadual"
                    placeholder="Inscrição estadual"
                    {...register('inscricaoEstadual')}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="inscricaoMunicipal">Inscrição Municipal</Label>
                    <FieldHint text="Número de registro municipal da empresa." />
                  </div>
                  <Input
                    id="inscricaoMunicipal"
                    placeholder="Inscrição municipal"
                    {...register('inscricaoMunicipal')}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Regime Tributário</Label>
                    <FieldHint text="Regime de tributação adotado pela empresa." />
                  </div>
                  <Controller
                    control={control}
                    name="taxRegime"
                    render={({ field }) => (
                      <Select
                        value={field.value || '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? undefined : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Não informado</SelectItem>
                          <SelectItem value="SIMPLES_NACIONAL">Simples Nacional</SelectItem>
                          <SelectItem value="LUCRO_PRESUMIDO">Lucro Presumido</SelectItem>
                          <SelectItem value="LUCRO_REAL">Lucro Real</SelectItem>
                          <SelectItem value="MEI">MEI</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            )}

            {/* ENDEREÇO */}
            {activeTab === 'endereco' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="cep">CEP</Label>
                  <Input
                    id="cep"
                    placeholder="00000-000"
                    {...register('cep')}
                    onChange={e => { e.target.value = masks.cep(e.target.value); register('cep').onChange(e) }}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                  <Label htmlFor="logradouro">Logradouro<RequiredMark /></Label>
                  <Input
                    id="logradouro"
                    placeholder="Rua, Avenida, etc."
                    {...register('logradouro')}
                  />
                  {errors.logradouro && (
                    <p className="text-xs text-destructive mt-1">{errors.logradouro.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    placeholder="Nº"
                    {...register('numero')}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input
                    id="complemento"
                    placeholder="Sala, Andar, etc."
                    {...register('complemento')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bairro">Bairro<RequiredMark /></Label>
                  <Input
                    id="bairro"
                    placeholder="Bairro"
                    {...register('bairro')}
                  />
                  {errors.bairro && (
                    <p className="text-xs text-destructive mt-1">{errors.bairro.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cidade">Cidade<RequiredMark /></Label>
                  <Input
                    id="cidade"
                    placeholder="Cidade"
                    {...register('cidade')}
                  />
                  {errors.cidade && (
                    <p className="text-xs text-destructive mt-1">{errors.cidade.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>UF<RequiredMark /></Label>
                  <Controller
                    control={control}
                    name="uf"
                    render={({ field }) => (
                      <Select
                        value={field.value || '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="UF" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Selecione</SelectItem>
                          {UF_OPTIONS.map((uf) => (
                            <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.uf && (
                    <p className="text-xs text-destructive mt-1">{errors.uf.message}</p>
                  )}
                </div>
              </div>
            )}

            {/* CONTATO */}
            {activeTab === 'contato' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="telefone">Telefone<RequiredMark /></Label>
                  <Input
                    id="telefone"
                    placeholder="(00) 00000-0000"
                    {...register('telefone')}
                    onChange={e => { e.target.value = masks.telefone(e.target.value); register('telefone').onChange(e) }}
                  />
                  {errors.telefone && (
                    <p className="text-xs text-destructive mt-1">{errors.telefone.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail<RequiredMark /></Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contato@empresa.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="site">Site</Label>
                  <Input
                    id="site"
                    placeholder="https://www.empresa.com"
                    {...register('site')}
                  />
                </div>
              </div>
            )}

            {/* LOGOMARCA */}
            {activeTab === 'logo' && (
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Logomarca (modo claro)</Label>
                    <FieldHint text="Logo para fundo claro. Será exibida no cabeçalho quando o tema claro estiver ativo." />
                  </div>
                  <LogoUpload control={control} setValue={setValue} fieldName="logoUrl" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Logomarca (modo escuro)</Label>
                    <FieldHint text="Logo para fundo escuro. Será exibida no cabeçalho quando o tema escuro estiver ativo. Se não informada, usa a logo do modo claro." />
                  </div>
                  <LogoUpload control={control} setValue={setValue} fieldName="logoDarkUrl" />
                </div>
                <div className="space-y-1.5 sm:col-span-2 pt-4 border-t border-border/40">
                  <div className="flex items-center gap-1.5">
                    <Label>Marca d&apos;água</Label>
                    <FieldHint text="Imagem grande exibida no fundo dos documentos impressos (ex: orçamento). Idealmente uma versão monocromática ou com transparência da logo da empresa, em PNG. Aparece com baixa opacidade, centralizada na página." />
                  </div>
                  <LogoUpload control={control} setValue={setValue} fieldName="marcaDaguaUrl" />
                </div>
              </div>
            )}

            {/* INTEGRAÇÕES */}
            {activeTab === 'integracoes' && (
              <div className="space-y-6 max-w-2xl">
                <div className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-[13px] font-semibold">Consulta CNPJ via Serpro (paga)</Label>
                        <FieldHint text="Quando ligado, as consultas de CNPJ deste tenant usam a API paga do Serpro (dados completos, com CPF dos sócios). Desligado, usam apenas a base gratuita (BrasilAPI). O custo do Serpro é da plataforma." />
                      </div>
                      <p className="text-xs text-muted-foreground">Desligado = somente a base gratuita, sem custo.</p>
                    </div>
                    <Controller
                      control={control}
                      name="serproHabilitado"
                      render={({ field }) => (
                        <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                  </div>

                  <div className="space-y-1.5 border-t border-border/40 pt-4">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-[13px] font-semibold">Orçamento mensal Serpro (R$)</Label>
                      <FieldHint text="Teto de gasto por mês-calendário. Ao atingir o limite, as consultas voltam automaticamente para a base gratuita e o usuário é avisado. Deixe em branco para não impor teto." />
                    </div>
                    <Controller
                      control={control}
                      name="serproOrcamentoMensal"
                      render={({ field }) => (
                        <Input
                          type="number" step="0.01" min="0" placeholder="Sem teto"
                          className="h-9 text-sm max-w-[200px]"
                          value={field.value ?? ''}
                          onChange={e => field.onChange(e.target.value === '' ? null : Number(e.target.value))}
                        />
                      )}
                    />
                    <p className="text-xs text-muted-foreground">Custo atual por consulta CNPJ: <span className="font-medium">R$ 1,1717</span>. Reseta no dia 1º de cada mês.</p>
                  </div>
                </div>
              </div>
            )}

            {/* USUÁRIOS */}
            {activeTab === 'usuarios' && <UsuariosDaEmpresa empresaId={empresaId} mode={mode} />}
            </div>
          </div>
        </Card>

      </form>
    </TooltipProvider>
  )
}

/** Uma linha da listagem — só o que identifica e situa a pessoa. */
interface UsuarioDaEmpresa {
  id: string
  name: string
  email: string
  role: string
  profile: string | null
  isActive: boolean
  area: { id: string; name: string } | null
}

/** Teto da paginação do projeto (packages/types/src/pagination.ts). */
const LIMITE_PAGINA = 100

const ROLE_LABEL: Record<string, string> = {
  COLABORADOR_INTERNO: 'Colaborador interno',
  PRESTADOR_SERVICO: 'Prestador de serviço',
  COLABORADOR_CLIENTE: 'Colaborador do cliente',
  GESTOR: 'Gestor',
  COORDENADOR: 'Coordenador',
  DIRETOR: 'Diretor',
}

/**
 * Usuários vinculados a esta empresa.
 *
 * Só consulta: quem cria e edita usuário é o módulo Usuários, que tem as
 * regras de permissão, senha e perfil. Aqui a pergunta é outra — "quem está
 * nesta empresa?" —, e responder exigia sair da tela e filtrar em outro lugar.
 */
function UsuariosDaEmpresa({ empresaId, mode }: { empresaId?: string; mode: 'create' | 'edit' }) {
  const [usuarios, setUsuarios] = useState<UsuarioDaEmpresa[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)
  /** Total no servidor — pode ser maior que o carregado. */
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (mode !== 'edit' || !empresaId) return
    let cancelado = false
    setCarregando(true)
    setErro(null)
    // LIMITE_PAGINA é o teto da paginação do projeto; pedir mais faz a
    // validação recusar a chamada inteira.
    ;(trpc.user as any).list.query({ page: 1, limit: LIMITE_PAGINA, empresaId, incluirInativos })
      .then((r: { data?: UsuarioDaEmpresa[]; total?: number }) => {
        if (cancelado) return
        setUsuarios(r?.data ?? [])
        setTotal(r?.total ?? r?.data?.length ?? 0)
      })
      // Quem edita empresa pode não ter acesso ao módulo Usuários. Melhor dizer
      // isso do que mostrar uma lista vazia, que parece "não há ninguém".
      .catch((e: Error) => { if (!cancelado) setErro(e.message) })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [empresaId, mode, incluirInativos])

  if (mode !== 'edit') {
    return (
      <p className="text-sm text-muted-foreground italic py-10 text-center">
        Salve a empresa primeiro para ver os usuários vinculados a ela.
      </p>
    )
  }

  const filtrados = busca.trim()
    ? usuarios.filter(u =>
        u.name.toLowerCase().includes(busca.trim().toLowerCase())
        || u.email.toLowerCase().includes(busca.trim().toLowerCase()))
    : usuarios

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h6 className="text-[13px] font-semibold text-foreground">Usuários da empresa</h6>
          <p className="text-xs text-muted-foreground">
            Quem está vinculado a esta empresa. O cadastro é feito no módulo Usuários.
          </p>
        </div>
        <Link href="/usuarios" className={cn('text-[13px] font-medium hover:underline', TEXT.emerald)}>
          Abrir Usuários
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Filtrar por nome ou e-mail..." className="h-9 pl-8 text-sm" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Checkbox checked={incluirInativos}
            onCheckedChange={(v) => setIncluirInativos(!!v)} />
          Mostrar inativos
        </label>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtrados.length} {filtrados.length === 1 ? 'usuário' : 'usuários'}
          {total > usuarios.length && ` de ${total}`}
        </span>
      </div>

      {/* A lista traz uma página. Acima disso o número some sem avisar, e
          alguém concluiria que a empresa tem menos gente do que tem. */}
      {total > usuarios.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando os {usuarios.length} primeiros. Use o módulo Usuários para ver a lista completa.
        </p>
      )}

      {carregando ? (
        <div className="py-10 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : erro ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Não foi possível carregar os usuários.</p>
          <p className="mt-1 text-xs text-muted-foreground/70">{erro}</p>
        </div>
      ) : filtrados.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground italic">
          {usuarios.length === 0 ? 'Nenhum usuário vinculado a esta empresa.' : 'Nenhum usuário com esse nome ou e-mail.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed">
            <thead>
              <tr className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2 w-[30%]">E-mail</th>
                <th className="px-3 py-2 w-[20%]">Cargo</th>
                <th className="px-3 py-2 w-[15%]">Área</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtrados.map(u => (
                <tr key={u.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-[13px] truncate">
                    <Link href={`/usuarios/${u.id}`} className="hover:underline" title={u.name}>{u.name}</Link>
                    {!u.isActive && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">inativo</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[13px] text-muted-foreground truncate" title={u.email}>{u.email}</td>
                  <td className="px-3 py-2 text-[13px] truncate">{ROLE_LABEL[u.role] ?? u.role}</td>
                  <td className="px-3 py-2 text-[13px] text-muted-foreground truncate">{u.area?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
