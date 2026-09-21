'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm, Controller, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createEmpresaSchema, type CreateEmpresaInput } from '@saas/types'
import { HelpCircle, Scale, MapPin, Phone, Search, Loader2, Upload, X, Save, Building2, Plug, Users, ShieldCheck, RotateCcw, AlertTriangle, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react'
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  Switch,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { SectionCard } from '@/components/section-card'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)

const EMPRESA_TABS = [
  { key: 'dados-legais', label: 'Dados Legais', icon: Scale },
  { key: 'endereco',     label: 'Endereço',     icon: MapPin },
  { key: 'contato',      label: 'Contato',      icon: Phone },
  { key: 'logo',         label: 'Logomarca',    icon: Upload },
  { key: 'integracoes',  label: 'Integrações',  icon: Plug },
  { key: 'permissoes',   label: 'Permissões',   icon: ShieldCheck },
  { key: 'usuarios',     label: 'Usuários',     icon: Users },
] as const

type EmpresaTabKey = typeof EMPRESA_TABS[number]['key']

const REGIME_LABEL: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional',
  LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real',
  MEI: 'MEI',
}

/** Chip de vidro do hero — caixa alta, PADRAO_PAGINAS §3.2. */
const CHIP_HERO = 'rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur'

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
  /** Contagens do registro para os números do hero (só na edição). */
  resumo?: { clientes: number; usuariosInternos: number; usuariosDeClientes: number } | null
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

export function EmpresaForm({ mode, empresaId, title, defaultValues, resumo }: EmpresaFormProps) {
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
    watch,
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

  const isEdit = mode === 'edit'

  // Permissões e Usuários precisam de uma empresa salva. Na criação as demais
  // abas FICAM — os campos obrigatórios estão espalhados por Dados Legais,
  // Endereço e Contato, e escondê-las tornaria impossível criar a empresa.
  const abas = EMPRESA_TABS.filter(t => isEdit || (t.key !== 'permissoes' && t.key !== 'usuarios'))

  const [razaoSocialV, nomeFantasiaV, cnpjV, cidadeV, ufV, taxRegimeV, logoUrlV, telefoneV, emailV] = watch([
    'razaoSocial', 'nomeFantasia', 'cnpj', 'cidade', 'uf', 'taxRegime', 'logoUrl', 'telefone', 'email',
  ])

  // Módulos do portal que o cliente de fato enxerga: liberado E construído.
  // Refaz ao trocar de aba para refletir o que o master acabou de ligar em
  // Permissões, sem exigir recarregar a página.
  const [modulosLiberados, setModulosLiberados] = useState<number | null>(null)
  useEffect(() => {
    if (!isEdit || !empresaId) return
    ;(trpc as any).empresa.portalModulos.query({ empresaId })
      .then((m: Array<{ liberado: boolean; implementado: boolean }>) =>
        setModulosLiberados(m.filter(x => x.liberado && x.implementado).length))
      .catch(() => setModulosLiberados(null))
  }, [isEdit, empresaId, activeTab])

  const botoesDasAbas = (
    <div className="nice-scrollbar flex gap-1.5 overflow-x-auto py-2">
      {abas.map(tab => {
        const Icon = tab.icon
        return (
          // Botões simples, não `role="tablist"`: o CSS global impõe borda e
          // raio zero nos triggers e briga com a pílula (PADRAO_PAGINAS §3.2).
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />{tab.label}
          </button>
        )
      })}
    </div>
  )

  const linhasDoResumo: Array<[string, string]> = [
    ['ID', defaultValues?.code !== undefined ? String(defaultValues.code) : ''],
    ['CNPJ', cnpjV ? masks.cnpj(cnpjV) : ''],
    ['Regime', taxRegimeV ? (REGIME_LABEL[taxRegimeV] ?? taxRegimeV) : ''],
    ['Cidade/UF', [cidadeV, ufV].filter(Boolean).join('/')],
    ['Telefone', telefoneV ? masks.telefone(telefoneV) : ''],
    ['E-mail', emailV ?? ''],
  ]

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
      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex flex-col">
        {/* Barra da página — PADRAO_PAGINAS §3.1. `mb-0`: o espaço até o hero
            é o `mt-6` dele, e a margem própria da barra somaria à dele. */}
        <PageHeaderBar className="mb-0 sm:mb-0" actions={<>
            <Button size="sm" type="submit" disabled={saving} className="gap-1.5">
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
            <Link href="/empresas" className="transition-colors hover:text-foreground">Empresas</Link>
            <span className="text-muted-foreground/50">›</span>
            <span className="truncate">{isEdit ? (razaoSocialV || title) : 'Nova Empresa'}</span>
          </p>
        </PageHeaderBar>

        {error && (
          <div className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isEdit ? (
          /* Hero — PADRAO_PAGINAS §3.2. A empresa não tem capa própria, então
             vale o gradiente da cor do módulo, que é o que o padrão prevê. */
          <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="relative overflow-hidden">
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR} 0%, var(--color-primary) 100%)` }} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />

              <div className="relative z-10 px-5 pb-5 pt-24 text-white sm:px-6 sm:pt-28">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex min-w-0 items-end gap-4">
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-lg ring-4 ring-white/50">
                      {logoUrlV ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={resolveAssetUrl(logoUrlV)}
                          alt="Logomarca"
                          className="h-20 w-20 rounded-xl object-contain"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <Building2 className="h-10 w-10 text-emerald-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xl font-bold tracking-tight text-white drop-shadow">{razaoSocialV || 'Empresa'}</p>
                        <span className={CHIP_HERO}>{defaultValues?.isActive === false ? 'Inativa' : 'Ativa'}</span>
                        {taxRegimeV && <span className={CHIP_HERO}>{REGIME_LABEL[taxRegimeV] ?? taxRegimeV}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85">
                        {nomeFantasiaV && <span className="truncate">{nomeFantasiaV}</span>}
                        {cnpjV && (
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <Scale className="h-3.5 w-3.5" />{masks.cnpj(cnpjV)}
                          </span>
                        )}
                        {(cidadeV || ufV) && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />{[cidadeV, ufV].filter(Boolean).join('/')}
                          </span>
                        )}
                        {telefoneV && (
                          <span className="inline-flex items-center gap-1.5 tabular-nums">
                            <Phone className="h-3.5 w-3.5" />{masks.telefone(telefoneV)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Números do registro, à direita — o resumo do tenant. */}
                  <div className="flex gap-6">
                    {([
                      [resumo?.clientes, 'Clientes'],
                      [resumo?.usuariosInternos, 'Usuários'],
                      [resumo?.usuariosDeClientes, 'Usuários de clientes'],
                      [modulosLiberados, 'Módulos no portal'],
                    ] as Array<[number | null | undefined, string]>).map(([valor, rotulo]) => (
                      <div key={rotulo} className="text-center">
                        <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">
                          {valor ?? '—'}
                        </p>
                        <p className="text-xs text-white/75">{rotulo}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Abas na base do hero */}
            <div className="border-t border-border px-3">{botoesDasAbas}</div>
          </div>
        ) : (
          /* Na criação não há registro para o hero mostrar; as abas vêm soltas. */
          <div className="mt-6 rounded-2xl border border-border bg-card px-3">{botoesDasAbas}</div>
        )}

        {/* Conteúdo — PADRAO_PAGINAS §3.3: principal + lateral de 20rem. */}
        <div className={cn('mt-6', isEdit && 'grid items-start gap-6 lg:grid-cols-[1fr_20rem]')}>
          <div
            key={activeTab}
            className="min-w-0"
            style={{ animation: 'fadeSlideIn 0.25s ease-out' }}
          >

            {/* DADOS LEGAIS */}
            {activeTab === 'dados-legais' && (
              <SectionCard icon={<Scale />} title="Dados legais" description="Identificação da empresa na Receita Federal.">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mode === 'edit' && defaultValues?.code !== undefined && (
                  <div className="space-y-1.5">
                    <Label>ID</Label>
                    <Input value={defaultValues.code} disabled />
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
              </SectionCard>
            )}

            {/* ENDEREÇO */}
            {activeTab === 'endereco' && (
              <SectionCard icon={<MapPin />} title="Endereço" description="Sede da empresa.">
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
              </SectionCard>
            )}

            {/* CONTATO */}
            {activeTab === 'contato' && (
              <SectionCard icon={<Phone />} title="Contato" description="Como os clientes e a plataforma falam com a empresa.">
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
              </SectionCard>
            )}

            {/* LOGOMARCA */}
            {activeTab === 'logo' && (
              <SectionCard icon={<Upload />} title="Logomarca" description="Aparece no cabeçalho do sistema, no portal do cliente e nos documentos impressos.">
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
              </SectionCard>
            )}

            {/* INTEGRAÇÕES */}
            {activeTab === 'integracoes' && (
              <SectionCard icon={<Plug />} title="Integrações" description="Serviços externos usados por este tenant.">
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
              </SectionCard>
            )}

            {/* PERMISSÕES — módulos do Portal do Cliente para este tenant */}
            {activeTab === 'permissoes' && (
              <SectionCard
                icon={<ShieldCheck />}
                title="Permissões do Portal do Cliente"
                description="Quais módulos os usuários dos clientes deste tenant enxergam no portal."
              >
                <PermissoesDoPortal empresaId={empresaId} mode={mode} />
              </SectionCard>
            )}

            {/* USUÁRIOS */}
            {activeTab === 'usuarios' && (
              <SectionCard
                icon={<Users />}
                title="Usuários da empresa"
                description="A equipe do escritório e as pessoas dos clientes que acessam o portal. A equipe se cadastra no módulo Usuários; as pessoas dos clientes, no cadastro de cada cliente."
                actions={
                  <Link href="/usuarios" className={cn('text-[13px] font-medium hover:underline', TEXT.emerald)}>
                    Abrir Usuários
                  </Link>
                }
              >
                <UsuariosDaEmpresa empresaId={empresaId} mode={mode} />
              </SectionCard>
            )}
          </div>

          {/* Lateral: os dados que se quer ver de relance enquanto se edita
              outra aba — o CNPJ não some ao abrir Endereço. */}
          {isEdit && (
            <aside className="min-w-0">
              <SectionCard icon={<Building2 />} title="Resumo" collapsible={false}>
                <dl className="space-y-2 text-[13px]">
                  {linhasDoResumo.map(([rotulo, valor]) => (
                    <div key={rotulo} className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-muted-foreground">{rotulo}</dt>
                      <dd className="min-w-0 truncate text-right text-foreground">{valor || '—'}</dd>
                    </div>
                  ))}
                </dl>
              </SectionCard>
            </aside>
          )}
        </div>
      </form>
    </TooltipProvider>
  )
}

interface ModuloDoPortal {
  slug: string
  rotulo: string
  descricao: string
  implementado: boolean
  padrao: boolean
  liberado: boolean
  personalizado: boolean
}

/**
 * Permissões do tenant: quais módulos do Portal do Cliente os clientes dele
 * enxergam.
 *
 * O tenant do OneClick é a EMPRESA, e o que é dele mora no cadastro dela. Esta
 * aba viveu em `/admin/empresas` até 15/09/2026, numa tela que listava a tabela
 * `Tenant` — onde o único registro era um cadastro de teste de QA, e as quatro
 * empresas em operação não apareciam.
 *
 * Quem liga e desliga é o master da plataforma: liberar módulo do portal é
 * decisão comercial sobre o tenant, não do tenant sobre si mesmo. Os demais
 * veem a mesma lista, sem os interruptores — o administrador do escritório
 * precisa saber por que uma aba não aparece no portal dos clientes dele.
 *
 * A trava é o `masterProcedure` no servidor; esconder o interruptor aqui é só
 * para não oferecer o que vai ser recusado.
 */
function PermissoesDoPortal({ empresaId, mode }: { empresaId?: string; mode: 'create' | 'edit' }) {
  const { isMaster, loading: carregandoPermissao } = useUserPermissions()
  // Enquanto a permissão carrega, ninguém edita: mostrar interruptor que some
  // um instante depois é pior do que mostrá-lo um instante mais tarde.
  const editavel = isMaster && !carregandoPermissao

  const [modulos, setModulos] = useState<ModuloDoPortal[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  const carregar = () => {
    if (mode !== 'edit' || !empresaId) return
    ;(trpc as any).empresa.portalModulos.query({ empresaId })
      .then((m: ModuloDoPortal[]) => { setModulos(m); setErro(null) })
      .catch((e: Error) => setErro(e.message))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [empresaId, mode])

  async function alternar(m: ModuloDoPortal, liberado: boolean) {
    if (!empresaId) return
    setSalvando(m.slug)
    // Otimista: o interruptor precisa responder na hora, e o efeito de uma
    // liberação não é visível nesta tela mesmo.
    setModulos(l => l && l.map(x => (x.slug === m.slug ? { ...x, liberado, personalizado: true } : x)))
    try {
      await (trpc as any).empresa.definirPortalModulo.mutate({ empresaId, modulo: m.slug, liberado })
    } catch (e) {
      carregar()
      alerts.error('Não foi possível salvar', (e as Error).message)
    } finally { setSalvando(null) }
  }

  async function voltarAoPadrao(m: ModuloDoPortal) {
    if (!empresaId) return
    setSalvando(m.slug)
    try {
      await (trpc as any).empresa.voltarPortalModuloAoPadrao.mutate({ empresaId, modulo: m.slug })
      carregar()
    } catch (e) {
      alerts.error('Não foi possível restaurar', (e as Error).message)
    } finally { setSalvando(null) }
  }

  if (mode !== 'edit') {
    return (
      <p className="text-[13px] text-muted-foreground">
        As permissões do Portal do Cliente ficam disponíveis depois que a empresa for criada.
      </p>
    )
  }

  if (erro) return <p className="text-[13px] text-destructive">{erro}</p>
  if (!modulos) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
          {editavel
            ? 'O que os usuários dos clientes deste tenant enxergam no portal. Desligar um módulo o esconde do menu e faz as rotas dele deixarem de responder — não é só a tela.'
            : 'O que os usuários dos seus clientes veem ao entrar no portal. A liberação é feita pelo administrador da plataforma.'}
      </p>

      <div className="divide-y divide-border rounded-lg border border-border">
        {modulos.map(m => (
          <div key={m.slug} className={cn('flex flex-wrap items-start gap-3 px-3 py-2.5', !m.implementado && 'bg-muted/20')}>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-foreground">
                {m.rotulo}
                {/* Módulo ainda não construído não é o mesmo que bloqueado, e
                    confundir os dois faria o escritório pedir liberação de algo
                    que não existe. */}
                {!m.implementado && (
                  <span className="rounded-full border border-border px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                    em construção
                  </span>
                )}
                {m.personalizado && (
                  <span className="text-[10px] font-normal text-muted-foreground" title="Decisão específica para este tenant">
                    (definido para este tenant)
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{m.descricao}</p>
              {/* Ligar o que não existe produz item de menu que leva a uma
                  página em branco — pior que a ausência. */}
              {editavel && !m.implementado && m.liberado && (
                <p className={cn('mt-1 flex items-center gap-1 text-[11px]', TEXT.amber)}>
                  <AlertTriangle className="h-3 w-3" />
                  Ligado, mas sem tela ainda — o cliente não verá nada.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {editavel ? (
                <>
                  {m.personalizado && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => voltarAoPadrao(m)}
                      disabled={salvando !== null}
                      title={`Voltar ao padrão (${m.padrao ? 'liberado' : 'bloqueado'})`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {salvando === m.slug
                    ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    : (
                      <Switch
                        checked={m.liberado}
                        onCheckedChange={v => alternar(m, v)}
                        aria-label={`Liberar ${m.rotulo}`}
                      />
                    )}
                </>
              ) : (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    m.liberado
                      ? cn('bg-emerald-500/12', TEXT.emerald)
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {m.liberado ? 'Liberado' : 'Bloqueado'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
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
  /** Empresas-cliente a que a pessoa responde, quando é usuária do portal. */
  clientes?: Array<{ id: string; razaoSocial: string }>
}

const ROLE_LABEL: Record<string, string> = {
  COLABORADOR_INTERNO: 'Colaborador interno',
  PRESTADOR_SERVICO: 'Prestador de serviço',
  COLABORADOR_CLIENTE: 'Colaborador do cliente',
  GESTOR: 'Gestor',
  COORDENADOR: 'Coordenador',
  DIRETOR: 'Diretor',
}

/**
 * Usuários vinculados a esta empresa, em dois grupos.
 *
 * Só consulta: quem cria e edita usuário é o módulo Usuários, que tem as
 * regras de permissão, senha e perfil. Aqui a pergunta é outra — "quem está
 * nesta empresa?" —, e responder exigia sair da tela e filtrar em outro lugar.
 *
 * Separados porque são perguntas diferentes: a equipe diz quem TRABALHA no
 * escritório; os de clientes dizem quem, de fora, entra no portal. Misturados,
 * "Cliente Teste" aparecia entre a Aline e a Andreia como se fosse da equipe.
 *
 * A busca e o "Mostrar inativos" são um só para os dois grupos; a paginação é
 * de cada tabela, no servidor (PADRAO_PAGINAS §1.4).
 */
function UsuariosDaEmpresa({ empresaId, mode }: { empresaId?: string; mode: 'create' | 'edit' }) {
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)

  // Debounce de 400ms: sem ele cada tecla vira duas consultas, uma por tabela.
  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 400)
    return () => clearTimeout(t)
  }, [busca])

  if (mode !== 'edit' || !empresaId) {
    return (
      <p className="text-sm text-muted-foreground italic py-10 text-center">
        Salve a empresa primeiro para ver os usuários vinculados a ela.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Filtrar por nome ou e-mail..." className="h-9 pl-8 text-sm" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <Checkbox checked={incluirInativos}
            onCheckedChange={v => setIncluirInativos(v === true)} />
          Mostrar inativos
        </label>
      </div>

      <TabelaDeUsuarios
        empresaId={empresaId}
        tipo="internos"
        titulo="Usuários internos"
        vazio={termo ? 'Nenhum usuário interno com esse nome ou e-mail.' : 'Nenhum usuário interno.'}
        termo={termo}
        incluirInativos={incluirInativos}
      />
      <TabelaDeUsuarios
        empresaId={empresaId}
        tipo="clientes"
        titulo="Usuários de clientes"
        vazio={termo ? 'Nenhum usuário de cliente com esse nome ou e-mail.' : 'Nenhum cliente com acesso ao portal.'}
        termo={termo}
        incluirInativos={incluirInativos}
      />
    </div>
  )
}

/** Opções fixas do "Exibir N registros" (PADRAO_PAGINAS §1.4). */
const TAMANHOS_DE_PAGINA = [10, 20, 50, 100]

/**
 * Uma tabela de usuários com a própria página.
 *
 * Cada grupo pagina sozinho, no servidor: a equipe da Central tem dezenas de
 * pessoas e os clientes com portal são poucos, e amarrar os dois numa página
 * só faria um grupo empurrar o outro para fora da tela.
 *
 * Os botões levam `type="button"`: esta tabela vive DENTRO do formulário da
 * empresa, e um botão sem tipo é `submit` — trocar de página salvaria a empresa.
 */
function TabelaDeUsuarios({ empresaId, tipo, titulo, vazio, termo, incluirInativos }: {
  empresaId: string
  tipo: 'internos' | 'clientes'
  titulo: string
  vazio: string
  termo: string
  incluirInativos: boolean
}) {
  const [linhas, setLinhas] = useState<UsuarioDaEmpresa[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Busca, filtro ou tamanho mudou: volta à página 1. Sem isso, filtrar estando
  // na página 3 deixa a tabela vazia com o rodapé dizendo que há registros.
  useEffect(() => { setPage(1) }, [termo, incluirInativos, limit])

  useEffect(() => {
    let cancelado = false
    setCarregando(true)
    setErro(null)
    ;(trpc.user as any).list.query({
      page, limit, empresaId, tipo, incluirInativos,
      ...(termo ? { search: termo } : {}),
    })
      .then((r: { data?: UsuarioDaEmpresa[]; total?: number; totalPages?: number }) => {
        if (cancelado) return
        const dados = r?.data ?? []
        // Página que ficou vazia não fica na tela: volta para a anterior.
        if (dados.length === 0 && page > 1 && (r?.total ?? 0) > 0) {
          setPage(p => Math.max(1, p - 1))
          return
        }
        setLinhas(dados)
        setTotal(r?.total ?? 0)
        setTotalPages(r?.totalPages ?? 0)
      })
      // Quem edita empresa pode não ter acesso ao módulo Usuários. Melhor dizer
      // isso do que mostrar uma lista vazia, que parece "não há ninguém".
      .catch((e: Error) => { if (!cancelado) setErro(e.message) })
      .finally(() => { if (!cancelado) setCarregando(false) })
    return () => { cancelado = true }
  }, [empresaId, tipo, termo, incluirInativos, page, limit])

  const inicio = total === 0 ? 0 : (page - 1) * limit + 1
  const fim = Math.min(page * limit, total)

  // No máximo 5 números, com a janela deslizando em torno da página atual.
  const numeros = (() => {
    if (totalPages <= 1) return [] as number[]
    let start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    start = Math.max(1, end - 4)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  })()

  const deClientes = tipo === 'clientes'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-baseline gap-2 text-[13px] font-semibold text-foreground">
          {titulo}
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{total}</span>
        </h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">Exibir</span>
          <Select value={String(limit)} onValueChange={v => setLimit(Number(v))}>
            <SelectTrigger className="h-8 w-[68px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TAMANHOS_DE_PAGINA.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="hidden sm:inline">registros</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        {carregando ? (
          <div className="py-10 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : erro ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar os usuários.</p>
            <p className="mt-1 text-xs text-muted-foreground/70">{erro}</p>
          </div>
        ) : linhas.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground italic">{vazio}</p>
        ) : (
          <table className="w-full table-fixed">
            <thead>
              <tr className="bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2 w-[30%]">E-mail</th>
                {/* Para usuário de cliente o cargo é sempre o mesmo e a área é
                    sempre vazia: o que situa a pessoa é a empresa-cliente. */}
                {deClientes ? (
                  <th className="px-3 py-2 w-[35%]">Clientes</th>
                ) : (
                  <>
                    <th className="px-3 py-2 w-[20%]">Cargo</th>
                    <th className="px-3 py-2 w-[15%]">Área</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {linhas.map(u => {
                const clientes = u.clientes?.length ? u.clientes.map(c => c.razaoSocial).join(', ') : '—'
                return (
                  <tr key={u.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-[13px] truncate">
                      {/* Colaborador de cliente é gerido no cadastro do cliente, não em /usuarios. */}
                      {deClientes ? (
                        u.clientes?.[0]
                          ? <Link href={`/clientes/${u.clientes[0].id}`} className="hover:underline" title={`${u.name} — abrir o cadastro do cliente`}>{u.name}</Link>
                          : <span title={u.name}>{u.name}</span>
                      ) : (
                        <Link href={`/usuarios/${u.id}`} className="hover:underline" title={u.name}>{u.name}</Link>
                      )}
                      {!u.isActive && (
                        <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">inativo</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[13px] text-muted-foreground truncate" title={u.email}>{u.email}</td>
                    {deClientes ? (
                      <td className="px-3 py-2 text-[13px] text-muted-foreground truncate" title={clientes}>{clientes}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-[13px] truncate">{ROLE_LABEL[u.role] ?? u.role}</td>
                        <td className="px-3 py-2 text-[13px] text-muted-foreground truncate">{u.area?.name ?? '—'}</td>
                      </>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {!carregando && !erro && total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando <span className="font-medium">{inicio}</span> a <span className="font-medium">{fim}</span> de <span className="font-medium">{total}</span> registros
            </p>
            {/* A navegação some quando só há uma página: setas desabilitadas
                numa lista de dez linhas são ruído. */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)} aria-label="Primeira página">
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)} aria-label="Página anterior">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {numeros.map(n => (
                  <Button key={n} type="button" variant={n === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(n)}>
                    {n}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} aria-label="Próxima página">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)} aria-label="Última página">
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
