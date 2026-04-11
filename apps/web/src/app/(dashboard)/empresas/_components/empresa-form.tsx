'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createEmpresaSchema, type CreateEmpresaInput } from '@saas/types'
import { HelpCircle, Scale, MapPin, Phone, Search, Loader2, Upload, X, Save, ArrowLeft } from 'lucide-react'
import {
  Button,
  Input,
  Label,
  Checkbox,
  Card,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { masks } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { refreshEmpresaAtiva } from '@/hooks/use-empresa-ativa'

interface EmpresaFormProps {
  mode: 'create' | 'edit'
  empresaId?: string
  title: string
  description: string
  icon?: React.ReactNode
  iconBg?: string
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

function LogoUpload({ control, setValue, fieldName = 'logoUrl', label }: {
  control: Control<CreateEmpresaInput>
  setValue: ReturnType<typeof useForm<CreateEmpresaInput>>['setValue']
  fieldName?: 'logoUrl' | 'logoDarkUrl'
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

      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
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
                src={url}
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

export function EmpresaForm({ mode, empresaId, title, description, icon, iconBg = 'from-emerald-500 to-emerald-600', defaultValues }: EmpresaFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
      if (!res.ok) {
        setCnpjError('CNPJ não encontrado na Receita Federal')
        return
      }
      const data = await res.json()

      setValue('razaoSocial', data.razao_social ?? '', { shouldDirty: true })
      setValue('nomeFantasia', data.nome_fantasia ?? '', { shouldDirty: true })
      setValue('cep', data.cep?.replace(/\D/g, '') ?? '', { shouldDirty: true })
      setValue('logradouro', data.logradouro ?? '', { shouldDirty: true })
      setValue('numero', data.numero ?? '', { shouldDirty: true })
      setValue('complemento', data.complemento ?? '', { shouldDirty: true })
      setValue('bairro', data.bairro ?? '', { shouldDirty: true })
      setValue('cidade', data.municipio ?? '', { shouldDirty: true })
      setValue('uf', data.uf ?? '', { shouldDirty: true })

      if (data.ddd_telefone_1) {
        const tel = data.ddd_telefone_1.replace(/\D/g, '')
        setValue('telefone', tel, { shouldDirty: true })
      }
    } catch {
      setCnpjError('Erro ao consultar CNPJ. Tente novamente.')
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

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {icon && (
              <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white bg-gradient-to-br shadow-md', iconBg)}>
                {icon}
              </div>
            )}
            <div>
              <h1>{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="success" size="sm" type="submit" disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/empresas')}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="overflow-hidden">
          <Tabs defaultValue="dados-legais" orientation="vertical" className="flex min-h-[500px]">
            <TabsList variant="pills" className="w-[124px] shrink-0 border-r border-border bg-muted/30 p-3 items-center">
              <TabsTrigger variant="pills" value="dados-legais" icon={<Scale className="h-4 w-4" />}>
                Dados Legais
              </TabsTrigger>
              <TabsTrigger variant="pills" value="endereco" icon={<MapPin className="h-4 w-4" />}>
                Endereço
              </TabsTrigger>
              <TabsTrigger variant="pills" value="contato" icon={<Phone className="h-4 w-4" />}>
                Contato
              </TabsTrigger>
              <TabsTrigger variant="pills" value="logo" icon={<Upload className="h-4 w-4" />}>
                Logomarca
              </TabsTrigger>
            </TabsList>
            <div className="flex-1 min-w-0">

            {/* DADOS LEGAIS */}
            <TabsContent value="dados-legais" className="p-5">
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
            </TabsContent>

            {/* ENDEREÇO */}
            <TabsContent value="endereco" className="p-5">
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
            </TabsContent>

            {/* CONTATO */}
            <TabsContent value="contato" className="p-5">
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
            </TabsContent>

            {/* LOGOMARCA */}
            <TabsContent value="logo" className="p-5">
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
              </div>
            </TabsContent>
            </div>
          </Tabs>
        </Card>

      </form>
    </TooltipProvider>
  )
}
