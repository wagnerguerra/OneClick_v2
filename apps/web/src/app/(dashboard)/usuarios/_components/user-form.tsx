'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createUserSchema, updateUserSchema,
  type CreateUserInput, type UpdateUserInput, type PermissionInput,
  MODULE_GROUPS, MODULE_LABELS, USER_ROLE_LABELS, USER_PROFILE_LABELS,
  MODULE_SUB_PERMISSIONS,
} from '@saas/types'
import { HelpCircle, User, Briefcase, Calendar, Building2, Shield, ChevronDown, X, ShieldCheck, Save, ArrowLeft, Handshake, Loader2, Download, Search, Settings } from 'lucide-react'
import Link from 'next/link'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogBody, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { MODULE_ICONS, GROUP_ICONS } from '@/lib/navigation'
import { masks, moedaParaNumero, numeroParaMoeda, dataParaISO, isoParaData } from '@/lib/masks'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface EmpresaOption { id: string; razaoSocial: string; nomeFantasia: string | null }
interface SelectOption { id: string; name: string }

interface UserFormProps {
  mode: 'create' | 'edit'
  userId?: string
  title: string
  description: string
  icon?: React.ReactNode
  defaultValues?: Partial<CreateUserInput> & { isMaster?: boolean; permissions?: PermissionInput[] }
}

// Cores por grupo de permissões
const GROUP_COLORS: Record<string, {
  bar: string; title: string; toggle: string; icon: string
  activeBg: string; activeBorder: string
  hoverBg: string; hoverBorder: string; decoration: string
}> = {
  'Cadastros': {
    bar: 'bg-emerald-500', title: 'text-emerald-700 dark:text-emerald-400', toggle: 'bg-emerald-500', icon: 'text-emerald-600 dark:text-emerald-400',
    activeBg: 'bg-emerald-50 dark:bg-emerald-950/30', activeBorder: 'border-emerald-200 dark:border-emerald-800/50',
    hoverBg: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10', hoverBorder: 'hover:border-emerald-200/60',
    decoration: 'decoration-emerald-400/40',
  },
  'Comercial': {
    bar: 'bg-sky-500', title: 'text-sky-700 dark:text-sky-400', toggle: 'bg-sky-500', icon: 'text-sky-600 dark:text-sky-400',
    activeBg: 'bg-sky-50 dark:bg-sky-950/30', activeBorder: 'border-sky-200 dark:border-sky-800/50',
    hoverBg: 'hover:bg-sky-50/50 dark:hover:bg-sky-950/10', hoverBorder: 'hover:border-sky-200/60',
    decoration: 'decoration-sky-400/40',
  },
  'Administrativo': {
    bar: 'bg-indigo-500', title: 'text-indigo-700 dark:text-indigo-400', toggle: 'bg-indigo-500', icon: 'text-indigo-600 dark:text-indigo-400',
    activeBg: 'bg-indigo-50 dark:bg-indigo-950/30', activeBorder: 'border-indigo-200 dark:border-indigo-800/50',
    hoverBg: 'hover:bg-indigo-50/50 dark:hover:bg-indigo-950/10', hoverBorder: 'hover:border-indigo-200/60',
    decoration: 'decoration-indigo-400/40',
  },
  'Legalização': {
    bar: 'bg-violet-500', title: 'text-violet-700 dark:text-violet-400', toggle: 'bg-violet-500', icon: 'text-violet-600 dark:text-violet-400',
    activeBg: 'bg-violet-50 dark:bg-violet-950/30', activeBorder: 'border-violet-200 dark:border-violet-800/50',
    hoverBg: 'hover:bg-violet-50/50 dark:hover:bg-violet-950/10', hoverBorder: 'hover:border-violet-200/60',
    decoration: 'decoration-violet-400/40',
  },
  'Trabalhista': {
    bar: 'bg-teal-500', title: 'text-teal-700 dark:text-teal-400', toggle: 'bg-teal-500', icon: 'text-teal-600 dark:text-teal-400',
    activeBg: 'bg-teal-50 dark:bg-teal-950/30', activeBorder: 'border-teal-200 dark:border-teal-800/50',
    hoverBg: 'hover:bg-teal-50/50 dark:hover:bg-teal-950/10', hoverBorder: 'hover:border-teal-200/60',
    decoration: 'decoration-teal-400/40',
  },
  'Fiscal': {
    bar: 'bg-rose-500', title: 'text-rose-700 dark:text-rose-400', toggle: 'bg-rose-500', icon: 'text-rose-600 dark:text-rose-400',
    activeBg: 'bg-rose-50 dark:bg-rose-950/30', activeBorder: 'border-rose-200 dark:border-rose-800/50',
    hoverBg: 'hover:bg-rose-50/50 dark:hover:bg-rose-950/10', hoverBorder: 'hover:border-rose-200/60',
    decoration: 'decoration-rose-400/40',
  },
  'Contábil': {
    bar: 'bg-cyan-500', title: 'text-cyan-700 dark:text-cyan-400', toggle: 'bg-cyan-500', icon: 'text-cyan-600 dark:text-cyan-400',
    activeBg: 'bg-cyan-50 dark:bg-cyan-950/30', activeBorder: 'border-cyan-200 dark:border-cyan-800/50',
    hoverBg: 'hover:bg-cyan-50/50 dark:hover:bg-cyan-950/10', hoverBorder: 'hover:border-cyan-200/60',
    decoration: 'decoration-cyan-400/40',
  },
  'TI': {
    bar: 'bg-slate-500', title: 'text-slate-700 dark:text-slate-400', toggle: 'bg-slate-500', icon: 'text-slate-600 dark:text-slate-400',
    activeBg: 'bg-slate-50 dark:bg-slate-950/30', activeBorder: 'border-slate-200 dark:border-slate-800/50',
    hoverBg: 'hover:bg-slate-50/50 dark:hover:bg-slate-950/10', hoverBorder: 'hover:border-slate-200/60',
    decoration: 'decoration-slate-400/40',
  },
  'Qualidade': {
    bar: 'bg-amber-500', title: 'text-amber-700 dark:text-amber-400', toggle: 'bg-amber-500', icon: 'text-amber-600 dark:text-amber-400',
    activeBg: 'bg-amber-50 dark:bg-amber-950/30', activeBorder: 'border-amber-200 dark:border-amber-800/50',
    hoverBg: 'hover:bg-amber-50/50 dark:hover:bg-amber-950/10', hoverBorder: 'hover:border-amber-200/60',
    decoration: 'decoration-amber-400/40',
  },
  'Configurações': {
    bar: 'bg-orange-700', title: 'text-orange-800 dark:text-orange-400', toggle: 'bg-orange-700', icon: 'text-orange-700 dark:text-orange-400',
    activeBg: 'bg-orange-50 dark:bg-orange-950/30', activeBorder: 'border-orange-200 dark:border-orange-800/50',
    hoverBg: 'hover:bg-orange-50/50 dark:hover:bg-orange-950/10', hoverBorder: 'hover:border-orange-200/60',
    decoration: 'decoration-orange-400/40',
  },
  'default': {
    bar: 'bg-muted-foreground', title: 'text-foreground', toggle: 'bg-primary', icon: 'text-primary',
    activeBg: 'bg-primary/[0.04]', activeBorder: 'border-primary/20',
    hoverBg: 'hover:bg-muted/30', hoverBorder: 'hover:border-border',
    decoration: 'decoration-primary/40',
  },
}

function RequiredMark() { return <span className="text-destructive ml-0.5">*</span> }

function FieldHint({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

function buildPermissionsMap(perms?: PermissionInput[]): Record<string, PermissionInput> {
  const map: Record<string, PermissionInput> = {}
  if (perms) for (const p of perms) map[p.moduleSlug] = p
  return map
}

export function UserForm({ mode, userId, title, description, icon, defaultValues }: UserFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([])
  const [areas, setAreas] = useState<SelectOption[]>([])
  const [cargos, setCargos] = useState<SelectOption[]>([])
  const [subModal, setSubModal] = useState<string | null>(null)
  const [permissionsMap, setPermissionsMap] = useState<Record<string, PermissionInput>>(
    () => buildPermissionsMap(defaultValues?.permissions)
  )
  const isMaster = defaultValues?.isMaster ?? false
  const schema = mode === 'create' ? createUserSchema : updateUserSchema

  const [importingLegado, setImportingLegado] = useState(false)

  const { register, handleSubmit, control, setValue, getValues, formState: { errors } } = useForm<CreateUserInput>({
    resolver: zodResolver(schema as typeof createUserSchema),
    defaultValues: {
      name: '', email: '', password: '', telefone: '',
      role: 'COLABORADOR_INTERNO', profile: 'OPERADOR',
      empresaId: '', areaId: '', cargoId: '',
      salario: '', dataAdmissao: '', idOneClick: '',
      incluirFerias: true, isActive: true, exibirComoColaborador: false,
      cpf: '', rg: '', orgaoEmissor: '',
      dataNascimento: '', sexo: '', estadoCivil: '',
      nacionalidade: 'Brasileira', naturalidade: '',
      celular: '', ramal: '',
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
      tipoContrato: 'CLT', dataDemissao: '', cargaHoraria: 44, observacoes: '',
      ...defaultValues,
    },
  })

  useEffect(() => {
    Promise.all([
      trpc.empresa.listForSelect.query().then(setEmpresas).catch(() => {}),
      trpc.area.listForSelect.query().then(setAreas).catch(() => {}),
      trpc.cargo.listForSelect.query().then(setCargos).catch(() => {}),
    ])
  }, [])

  // Sem helpers antigos — permissões são toggle inline no grid

  async function onSubmit(data: CreateUserInput) {
    setError(null); setSaving(true)
    const permissions = Object.values(permissionsMap)
    // Converter campos formatados para o backend.
    // Datas: dd/mm/yyyy → yyyy-mm-dd. Sem conversão o backend faz new Date() em
    // formato BR e gera Invalid Date, derrubando o update (500).
    const payload = {
      ...data,
      salario: moedaParaNumero(String(data.salario ?? '')) ?? undefined,
      dataAdmissao:    data.dataAdmissao    ? dataParaISO(String(data.dataAdmissao))    : '',
      dataNascimento:  data.dataNascimento  ? dataParaISO(String(data.dataNascimento))  : '',
      dataDemissao:    data.dataDemissao    ? dataParaISO(String(data.dataDemissao))    : '',
      permissions,
    }
    try {
      if (mode === 'create') {
        await trpc.user.create.mutate(payload)
        await alerts.success('Usuário criado', 'Registro salvo com sucesso.')
      } else if (userId) {
        await trpc.user.update.mutate({ id: userId, data: payload as UpdateUserInput })
        await alerts.success('Usuário atualizado', 'Alterações salvas.')
      }
      router.push('/usuarios')
    } catch { alerts.error('Erro', 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Header com ícone + título + botões */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {icon && (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
                style={{ backgroundColor: MODULE_COLOR }}
              >
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
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/usuarios')}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <UserDetailsCard
          mode={mode} userId={userId} register={register} control={control} errors={errors}
          areas={areas} cargos={cargos} empresas={empresas} isMaster={isMaster}
          permissionsMap={permissionsMap} setPermissionsMap={setPermissionsMap}
          subModal={subModal} setSubModal={setSubModal}
          setValue={setValue} getValues={getValues}
          importingLegado={importingLegado} setImportingLegado={setImportingLegado}
        />

      </form>
    </TooltipProvider>
  )
}

// ============================================================
// Card principal com pills laterais (padrão Cadastros)
// ============================================================

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // Cadastros = emerald

const USER_TABS = [
  { key: 'dados', label: 'Dados Pessoais', icon: User },
  { key: 'endereco', label: 'Endereço', icon: Building2 },
  { key: 'organizacional', label: 'Organizacional', icon: Briefcase },
  { key: 'ferias', label: 'Férias / RH', icon: Calendar },
  { key: 'empresa', label: 'Empresa', icon: Building2 },
  { key: 'permissoes', label: 'Permissões', icon: Shield },
  { key: 'clientes', label: 'Clientes', icon: Handshake },
] as const

function UserDetailsCard({ mode, userId, register, control, errors, areas, cargos, empresas, isMaster, permissionsMap, setPermissionsMap, subModal, setSubModal, setValue, getValues, importingLegado, setImportingLegado }: {
  mode: 'create' | 'edit'; userId?: string
  register: any; control: any; errors: any
  areas: SelectOption[]; cargos: SelectOption[]; empresas: EmpresaOption[]
  isMaster: boolean
  permissionsMap: Record<string, PermissionInput>; setPermissionsMap: React.Dispatch<React.SetStateAction<Record<string, PermissionInput>>>
  subModal: string | null; setSubModal: (v: string | null) => void
  setValue: any; getValues: any
  importingLegado: boolean; setImportingLegado: (v: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState('dados')
  const [permSearchQuery, setPermSearchQuery] = useState('')
  const [permGroupTab, setPermGroupTab] = useState(Object.keys(MODULE_GROUPS)[0] || 'Cadastros')
  const [permSaving, setPermSaving] = useState(false)
  const [permSaved, setPermSaved] = useState(false)
  const permSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { return () => { if (permSavedTimer.current) clearTimeout(permSavedTimer.current) } }, [])

  const autoSavePermissions = useCallback(async (newMap: Record<string, PermissionInput>) => {
    if (!userId || mode !== 'edit') return
    setPermSaving(true)
    try {
      const perms = Object.values(newMap).filter(p => p.canRead || p.canWrite || p.canDelete)
      await trpc.user.updatePermissions.mutate({ userId, permissions: perms })
      if (permSavedTimer.current) clearTimeout(permSavedTimer.current)
      setPermSaved(true)
      permSavedTimer.current = setTimeout(() => setPermSaved(false), 2000)
    } catch (e) {
      console.error('[Permissões] Falha ao salvar:', (e as Error).message)
      setPermSaved(false)
    } finally { setPermSaving(false) }
  }, [userId, mode])

  const visibleTabs = USER_TABS.filter(t => t.key !== 'clientes' || mode === 'edit')

  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
        <User className="h-4 w-4 text-muted-foreground" />
        <h5 className="text-[13px] font-semibold">Detalhes do Usuário</h5>
      </div>
      <div className="flex min-h-[500px]">
        {/* Pills laterais */}
        <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
          <div className="space-y-1">
            {visibleTabs.map(tab => {
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
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Conteúdo */}
        <div key={activeTab} className="flex-1" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>

          {/* DADOS PESSOAIS */}
          {activeTab === 'dados' && (
            <div className="-m-0">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Dados Pessoais</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-8 space-y-1.5">
                  <Label htmlFor="name">Nome<RequiredMark /></Label>
                  <Input id="name" placeholder="Nome completo" {...register('name')} />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                </div>
                <div className="col-span-12 md:col-span-4 flex items-end pb-1">
                  <Controller control={control} name="isActive" render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={field.value} onCheckedChange={field.onChange} /><span className="text-sm">Ativo</span></label>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="cpf">CPF</Label>
                  <Input id="cpf" placeholder="000.000.000-00" {...register('cpf')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="rg">RG</Label>
                  <Input id="rg" placeholder="0000000" {...register('rg')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="orgaoEmissor">Órgão Emissor</Label>
                  <Input id="orgaoEmissor" placeholder="SSP/UF" {...register('orgaoEmissor')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="dataNascimento">Data de Nascimento</Label>
                  <Input id="dataNascimento" type="date" {...register('dataNascimento')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Sexo</Label>
                  <Controller control={control} name="sexo" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        <SelectItem value="MASCULINO">Masculino</SelectItem>
                        <SelectItem value="FEMININO">Feminino</SelectItem>
                        <SelectItem value="OUTRO">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Estado Civil</Label>
                  <Controller control={control} name="estadoCivil" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Não informado</SelectItem>
                        <SelectItem value="SOLTEIRO">Solteiro(a)</SelectItem>
                        <SelectItem value="CASADO">Casado(a)</SelectItem>
                        <SelectItem value="DIVORCIADO">Divorciado(a)</SelectItem>
                        <SelectItem value="VIUVO">Viúvo(a)</SelectItem>
                        <SelectItem value="UNIAO_ESTAVEL">União Estável</SelectItem>
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="email">E-mail<RequiredMark /></Label>
                  <Input id="email" type="email" placeholder="usuario@empresa.com" {...register('email')} />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" placeholder="(00) 0000-0000" {...register('telefone')} onChange={e => { e.target.value = masks.telefone(e.target.value); register('telefone').onChange(e) }} />
                </div>
                <div className="col-span-12 md:col-span-3 space-y-1.5">
                  <Label htmlFor="celular">Celular</Label>
                  <Input id="celular" placeholder="(00) 00000-0000" {...register('celular')} onChange={e => { e.target.value = masks.telefone(e.target.value); register('celular').onChange(e) }} />
                </div>
                <div className="col-span-12 md:col-span-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="ramal">Ramal</Label>
                    <FieldHint text="Aparece no widget Ramais. Default = 4 últimos dígitos do telefone." />
                  </div>
                  <Input id="ramal" placeholder="0000" {...register('ramal')} />
                </div>
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="password">Senha{mode === 'create' && <RequiredMark />}</Label>
                    {mode === 'edit' && <FieldHint text="Deixe em branco para manter a senha atual." />}
                  </div>
                  <Input id="password" type="password" placeholder={mode === 'edit' ? 'Deixe vazio para manter' : 'Mínimo 8 caracteres'} autoComplete="new-password" {...register('password')} defaultValue="" />
                  {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
                </div>
              </div>
            </div>
          )}

          {/* ENDEREÇO */}
          {activeTab === 'endereco' && (
            <div className="-m-0">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Endereço</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-6 md:col-span-3 space-y-1.5">
                  <Label htmlFor="cep">CEP</Label>
                  <Input id="cep" placeholder="00000-000" {...register('cep')} />
                </div>
                <div className="col-span-12 md:col-span-7 space-y-1.5">
                  <Label htmlFor="logradouro">Logradouro</Label>
                  <Input id="logradouro" placeholder="Rua, Avenida..." {...register('logradouro')} />
                </div>
                <div className="col-span-6 md:col-span-2 space-y-1.5">
                  <Label htmlFor="numero">Número</Label>
                  <Input id="numero" placeholder="123" {...register('numero')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input id="complemento" placeholder="Apto, sala..." {...register('complemento')} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input id="bairro" {...register('bairro')} />
                </div>
                <div className="col-span-12 md:col-span-3 space-y-1.5">
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input id="cidade" {...register('cidade')} />
                </div>
                <div className="col-span-12 md:col-span-1 space-y-1.5">
                  <Label htmlFor="uf">UF</Label>
                  <Input id="uf" maxLength={2} placeholder="SP" {...register('uf')} />
                </div>
              </div>
            </div>
          )}

          {/* ORGANIZACIONAL */}
          {activeTab === 'organizacional' && (
            <div className="-m-0">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Organizacional</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label>Tipo de usuário</Label><FieldHint text="Define a categoria do usuário no sistema." /></div>
                  <Controller control={control} name="role" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(USER_ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label>Perfil</Label><FieldHint text="Define o nível operacional do usuário." /></div>
                  <Controller control={control} name="profile" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(USER_PROFILE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Área</Label>
                  <Controller control={control} name="areaId" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="__none__">Nenhuma</SelectItem>{areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label>Cargo</Label>
                  <Controller control={control} name="cargoId" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="__none__">Nenhum</SelectItem>{cargos.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label htmlFor="salario">Salário</Label><FieldHint text="Valor do salário bruto mensal." /></div>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-[2px] border border-r-0 border-input bg-muted text-sm text-muted-foreground">R$</span>
                    <Input id="salario" type="text" inputMode="decimal" placeholder="0,00" className="rounded-l-none" {...register('salario')} onChange={e => { e.target.value = masks.moeda(e.target.value); register('salario').onChange(e) }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FÉRIAS / RH */}
          {activeTab === 'ferias' && (
            <div className="-m-0">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-foreground">Férias / RH</h4>
                {mode === 'edit' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={importingLegado}
                    onClick={async () => {
                      const email = getValues('email')
                      if (!email) { alerts.error('Erro', 'Preencha o e-mail do usuário primeiro.'); return }
                      setImportingLegado(true)
                      try {
                        const res = await trpc.user.buscarDadosLegado.query({ email })
                        if (!res.encontrado || !res.dados) {
                          alerts.warning('Não encontrado', `Nenhum registro encontrado nos bancos legados para ${email}.`)
                          return
                        }
                        const d = res.dados as Record<string, unknown>
                        // Preencher campos do formulário com os dados encontrados
                        if (d.oneclickUsuarioId) setValue('idOneClick', String(d.oneclickUsuarioId))
                        if (d.dataAdmissao) {
                          const dt = new Date(d.dataAdmissao as string)
                          if (!isNaN(dt.getTime())) setValue('dataAdmissao', isoParaData(dt.toISOString()))
                        }
                        if (d.controleFerias !== undefined) setValue('incluirFerias', !!d.controleFerias)
                        if (d.salario) setValue('salario', numeroParaMoeda(Number(d.salario)) as string)
                        if (d.telefone && !getValues('telefone')) setValue('telefone', String(d.telefone))
                        // Tentar mapear área e cargo pelo nome
                        if (d.areaNome) {
                          const areaNorm = String(d.areaNome).toLowerCase()
                          const areaMatch = areas.find(a => a.name.toLowerCase() === areaNorm)
                          if (areaMatch) setValue('areaId', areaMatch.id)
                        }
                        if (d.cargoNome) {
                          const cargoNorm = String(d.cargoNome).toLowerCase()
                          const cargoMatch = cargos.find(c => c.name.toLowerCase() === cargoNorm)
                          if (cargoMatch) setValue('cargoId', cargoMatch.id)
                        }
                        // Mapear perfil legado
                        if (d.perfil) {
                          const perfilMap: Record<string, string> = {
                            'MASTER': 'ADMIN', 'ADMIN': 'ADMIN',
                            'OPERADOR': 'OPERADOR', 'VISUALIZADOR': 'OPERADOR',
                          }
                          const mapped = perfilMap[String(d.perfil).toUpperCase()]
                          if (mapped) setValue('profile', mapped)
                        }
                        alerts.success('Dados importados', `Dados carregados do ${res.fonte} com sucesso. Revise e salve.`)
                      } catch (e) {
                        alerts.error('Erro', (e as Error).message || 'Falha ao buscar dados legados.')
                      } finally {
                        setImportingLegado(false)
                      }
                    }}
                    className="gap-1.5 text-xs"
                  >
                    {importingLegado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Importar do Legado
                  </Button>
                )}
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <Label htmlFor="dataAdmissao">Data de admissão</Label>
                  <Input id="dataAdmissao" placeholder="00/00/0000" {...register('dataAdmissao')} onChange={e => { e.target.value = masks.data(e.target.value); register('dataAdmissao').onChange(e) }} />
                </div>
                <div className="col-span-12 md:col-span-4 space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label htmlFor="idOneClick">ID OneClick</Label><FieldHint text="Identificador do usuário no sistema legado." /></div>
                  <Input id="idOneClick" placeholder="Ex: 257" {...register('idOneClick')} />
                </div>
                <div className="col-span-12 md:col-span-4 flex items-end pb-1">
                  <Controller control={control} name="incluirFerias" render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={field.value} onCheckedChange={field.onChange} /><span className="text-sm">Incluir no controle de férias</span></label>
                  )} />
                </div>
                <div className="col-span-12 md:col-span-6 flex items-end pb-1">
                  <Controller control={control} name="exibirComoColaborador" render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
                      <span className="text-sm">Exibir no módulo Colaboradores</span>
                    </label>
                  )} />
                </div>
              </div>
            </div>
          )}

          {/* EMPRESA */}
          {activeTab === 'empresa' && (
            <div className="-m-0">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Empresa</h4>
              </div>
              <div className="p-5 grid grid-cols-12 gap-3">
                <div className="col-span-12 md:col-span-6 space-y-1.5">
                  <div className="flex items-center gap-1.5"><Label>Empresa</Label><FieldHint text="Empresa à qual este usuário pertence." /></div>
                  <Controller control={control} name="empresaId" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}><SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger><SelectContent><SelectItem value="__none__">Nenhuma</SelectItem>{empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia ?? e.razaoSocial}</SelectItem>)}</SelectContent></Select>
                  )} />
                  <p className="text-xs text-muted-foreground">Apenas usuários MASTER podem alterar a empresa</p>
                </div>
                {isMaster && (
                  <div className="col-span-12">
                    <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                      Este é o usuário MASTER. Ele possui acesso total ao sistema independente das permissões.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PERMISSÕES */}
          {activeTab === 'permissoes' && (
            <div className="-m-0">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between">
                <h4 className="text-[13px] font-semibold text-foreground">Permissões</h4>
                {permSaving && (
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Salvando...</span>
                )}
                {!permSaving && permSaved && (
                  <span className="flex items-center gap-1.5 text-[11px] text-emerald-600 animate-in fade-in duration-300"><ShieldCheck className="h-3.5 w-3.5" />Salvo</span>
                )}
              </div>
              <div>
                {isMaster ? (
                  <div className="p-5 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                    O usuário MASTER possui acesso total. As permissões não se aplicam.
                  </div>
                ) : (
                  <div>
                    {/* Abas horizontais dos grupos */}
                    <div className="flex items-center gap-0 border-b overflow-x-auto scrollbar-none px-2">
                      {Object.entries(MODULE_GROUPS).map(([groupName, slugs]) => {
                        const gc = GROUP_COLORS[groupName] || GROUP_COLORS['default']!
                        const GroupIcon = GROUP_ICONS[groupName]
                        const activeCount = slugs.filter(s => permissionsMap[s]?.canRead).length
                        const isActiveGroup = permGroupTab === groupName
                        return (
                          <button key={groupName} type="button" onClick={() => { setPermGroupTab(groupName); setPermSearchQuery('') }}
                            className={cn('flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                              isActiveGroup ? cn('border-current', gc.title) : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}>
                            {GroupIcon && <GroupIcon className="h-3.5 w-3.5" />}
                            {groupName}
                            {activeCount > 0 && (
                              <span className={cn('text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none',
                                isActiveGroup ? cn(gc.activeBg, gc.title) : 'bg-muted text-muted-foreground',
                              )}>{activeCount}/{slugs.length}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Conteúdo da aba ativa */}
                    <div className="p-5">
                      {Object.entries(MODULE_GROUPS).map(([groupName, slugs]) => {
                        if (groupName !== permGroupTab) return null
                        const filtered = slugs
                        const gc = GROUP_COLORS[groupName] || GROUP_COLORS['default']!
                        return (
                          <div key={groupName} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {filtered.map((slug) => {
                              const Icon = MODULE_ICONS[slug]
                              const label = MODULE_LABELS[slug] ?? slug
                              const isActive = !!permissionsMap[slug]?.canRead
                              const hasSubs = !!MODULE_SUB_PERMISSIONS[slug]
                              return (
                                <div key={slug} className={cn('group flex items-center justify-between rounded-[2px] border px-3 py-2.5 transition-all duration-300', isActive ? cn(gc.activeBg, gc.activeBorder) : cn('bg-card border-border/30', gc.hoverBg, gc.hoverBorder))}>
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {Icon && <Icon className={cn('h-4 w-4 shrink-0 transition-colors duration-300', isActive ? gc.icon : 'text-muted-foreground/40 group-hover:text-muted-foreground/60')} />}
                                    {hasSubs ? (
                                      <button type="button" className={cn('text-sm truncate transition-colors duration-300 underline decoration-dotted underline-offset-4', isActive ? cn('font-medium text-foreground', gc.decoration) : 'text-muted-foreground decoration-muted-foreground/30')} onClick={() => setSubModal(slug)}>
                                        {label}
                                        <Settings className="inline h-3 w-3 ml-1 opacity-40" />
                                      </button>
                                    ) : (
                                      <span className={cn('text-sm truncate transition-colors duration-300', isActive ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground/80')}>{label}</span>
                                    )}
                                  </div>
                                  <button type="button" onClick={() => {
                                    let newMap: Record<string, PermissionInput>
                                    if (isActive) {
                                      newMap = { ...permissionsMap }; delete newMap[slug]
                                    } else {
                                      newMap = { ...permissionsMap, [slug]: { moduleSlug: slug, canRead: true, canWrite: true, canDelete: true, subPermissions: {} } }
                                    }
                                    setPermissionsMap(newMap)
                                    autoSavePermissions(newMap)
                                  }} className={cn('relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-300', isActive ? gc.toggle : 'bg-muted-foreground/20')}>
                                    <span className={cn('pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 mt-0.5', isActive ? 'translate-x-4 ml-0.5' : 'translate-x-0.5')} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                    <SubPermissionsModal slug={subModal} permissionsMap={permissionsMap} setPermissionsMap={setPermissionsMap} onClose={() => setSubModal(null)} onSave={autoSavePermissions} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CLIENTES VINCULADOS */}
          {activeTab === 'clientes' && mode === 'edit' && userId && (
            <div className="-m-0">
              <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                <h4 className="text-[13px] font-semibold text-foreground">Clientes Vinculados</h4>
              </div>
              <div className="p-5">
                <ClientesVinculados userId={userId} />
              </div>
            </div>
          )}

        </div>
      </div>
    </Card>
  )
}

// ── Modal de sub-permissões por módulo ──────────────────

function SubPermissionsModal({ slug, permissionsMap, setPermissionsMap, onClose, onSave }: {
  slug: string | null
  permissionsMap: Record<string, PermissionInput>
  setPermissionsMap: React.Dispatch<React.SetStateAction<Record<string, PermissionInput>>>
  onClose: () => void
  onSave?: (map: Record<string, PermissionInput>) => void
}) {
  // Manter o último slug válido para que o conteúdo não desapareça durante o fade-out
  const [lastSlug, setLastSlug] = useState<string | null>(null)
  const activeSlug = slug ?? lastSlug

  useEffect(() => {
    if (slug) setLastSlug(slug)
  }, [slug])

  const isOpen = !!slug
  const subDefs = activeSlug ? MODULE_SUB_PERMISSIONS[activeSlug] : null

  if (!subDefs || !activeSlug) return null

  const perm = permissionsMap[activeSlug]
  const subs = (perm?.subPermissions ?? {}) as Record<string, boolean>
  const label = MODULE_LABELS[activeSlug] ?? activeSlug
  const Icon = MODULE_ICONS[activeSlug]

  const allChecked = subDefs.every(d => subs[d.key])

  function toggleSub(key: string, value: boolean) {
    const existing = permissionsMap[activeSlug!] ?? { moduleSlug: activeSlug!, canRead: true, canWrite: true, canDelete: true, subPermissions: {} }
    const newMap = {
      ...permissionsMap,
      [activeSlug!]: {
        ...existing,
        subPermissions: { ...(existing.subPermissions as Record<string, boolean> ?? {}), [key]: value },
      },
    }
    setPermissionsMap(newMap)
    onSave?.(newMap)
  }

  function toggleAllSubs(value: boolean) {
    const existing = permissionsMap[activeSlug!] ?? { moduleSlug: activeSlug!, canRead: true, canWrite: true, canDelete: true, subPermissions: {} }
    const newSubs: Record<string, boolean> = {}
    for (const d of subDefs) newSubs[d.key] = value
    const newMap = { ...permissionsMap, [activeSlug!]: { ...existing, subPermissions: newSubs } }
    setPermissionsMap(newMap)
    onSave?.(newMap)
  }

  // Agrupar por group
  const groups = new Map<string, typeof subDefs>()
  for (const d of subDefs) {
    const g = d.group ?? 'Geral'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(d)
  }

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {/* Header */}
        <DialogHeaderIcon icon={Icon || ShieldCheck} color="sky">
          <DialogTitle>Permissões — {label}</DialogTitle>
          <DialogDescription>Defina o que este usuário pode ver e fazer neste módulo.</DialogDescription>
        </DialogHeaderIcon>

        {/* Corpo scrollável */}
        <DialogBody className="space-y-4">
          {/* Marcar todas */}
          <label className="flex items-center gap-3 cursor-pointer py-1">
            <ToggleSwitch checked={allChecked} onChange={v => toggleAllSubs(v)} />
            <span className="text-sm font-medium">Marcar todas</span>
          </label>

          {/* Grupos de sub-permissões */}
          {Array.from(groups.entries()).map(([groupName, defs]) => (
            <div key={groupName} className="rounded-[2px] border border-primary/10 overflow-hidden transition-all duration-200">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-primary/10 bg-primary/[0.04]">
                <ShieldCheck className="h-4 w-4 text-primary/60" />
                <span className="text-sm font-semibold text-foreground">{groupName}</span>
              </div>
              <div className="grid gap-0 sm:grid-cols-2 px-4 py-3 bg-primary/[0.01]">
                {defs.map(d => (
                  <label key={d.key} className="flex items-start gap-2.5 py-2 cursor-pointer group">
                    <ToggleSwitch checked={!!subs[d.key]} onChange={v => toggleSub(d.key, v)} />
                    <span className="flex flex-col">
                      <span className={cn(
                        'text-sm transition-colors duration-200',
                        subs[d.key] ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground/80',
                      )}>{d.label}</span>
                      {d.observacao && (
                        <span className="text-[11px] italic text-muted-foreground/80 mt-0.5">
                          {d.observacao}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </DialogBody>

        {/* Footer */}
        <DialogFooter>
          <Button variant="success" size="sm" type="button" onClick={onClose}>Salvar</Button>
          <DialogClose asChild>
            <Button variant="outline" size="sm" type="button">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Toggle switch reutilizável ──────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-300',
        checked ? 'bg-primary' : 'bg-muted-foreground/20',
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 mt-0.5',
        checked ? 'translate-x-4 ml-0.5' : 'translate-x-0.5',
      )} />
    </button>
  )
}

// ============================================================
// Clientes Vinculados (responsável/substituto)
// ============================================================

interface AssignedClient {
  clienteId: string
  razaoSocial: string
  documento: string
  areaNome: string
  role: string
  encerrado: boolean
}

const PAGE_SIZE = 10

function ClientesVinculados({ userId }: { userId: string }) {
  const [data, setData] = useState<AssignedClient[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ vinculados: number; ignoradosSemCliente: number; totalLinhasOneClick: number; dryRun: boolean } | null>(null)
  const [onlyMyArea, setOnlyMyArea] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  function fetchData() {
    setLoading(true)
    ;(trpc.user as any).getAssignedClients.query({ userId })
      .then((r: AssignedClient[]) => setData(r))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [userId])

  // Filtro + paginacao client-side
  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const s = search.toLowerCase()
    return data.filter(item =>
      item.razaoSocial.toLowerCase().includes(s) ||
      item.documento.includes(s) ||
      item.areaNome.toLowerCase().includes(s)
    )
  }, [data, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset page ao buscar
  useEffect(() => { setPage(1) }, [search])

  function formatDoc(doc: string) {
    if (doc.length === 14) return masks.cnpj(doc)
    if (doc.length === 11) return masks.cpf(doc)
    return doc
  }

  async function handleImportOneClick(dryRun: boolean) {
    setImporting(true)
    setImportResult(null)
    try {
      const result = await (trpc.user as any).importarCarteiraOneClick.mutate({
        userId, dryRun, somenteAreaUsuario: onlyMyArea,
      })
      setImportResult(result)
      if (!dryRun && result.vinculados > 0) fetchData()
      if (!dryRun) await alerts.success('Importacao concluida', `${result.vinculados} vinculo(s) importado(s).`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setImporting(false) }
  }

  return (
    <div className="space-y-4">
      {/* Importar carteira */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => handleImportOneClick(true)} disabled={importing} className="gap-1.5 text-xs">
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Previa OneClick
          </Button>
          <Button type="button" variant="success" size="sm" onClick={() => handleImportOneClick(false)} disabled={importing} className="gap-1.5 text-xs">
            {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Importar Carteira
          </Button>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={onlyMyArea} onChange={e => setOnlyMyArea(e.target.checked)} className="h-3 w-3 rounded accent-emerald-600" />
          Somente a area deste usuario
        </label>
      </div>

      {importResult && (
        <div className={cn('rounded-lg px-4 py-3 text-xs', importResult.dryRun ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/20 dark:text-sky-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400')}>
          <span className="font-semibold">{importResult.dryRun ? 'Previa:' : 'Resultado:'}</span>{' '}
          {importResult.totalLinhasOneClick} no OneClick | {importResult.vinculados} vinculo(s) {importResult.dryRun ? 'encontrado(s)' : 'importado(s)'} | {importResult.ignoradosSemCliente} sem cliente local
        </div>
      )}

      {/* Busca */}
      {data.length > 0 && (
        <div className="flex items-center gap-3">
          <Input
            placeholder="Buscar cliente, CNPJ ou area..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 text-xs max-w-xs"
          />
          <span className="text-[11px] text-muted-foreground shrink-0">
            {filtered.length} de {data.length} registro(s)
          </span>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">Carregando...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Handshake className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Nenhum cliente vinculado.</p>
          <p className="text-xs mt-1">Use "Importar Carteira" ou vincule na aba Servicos do cliente.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Cliente</th>
                  <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">CNPJ/CPF</th>
                  <th className="text-left px-3 py-2 font-medium">Area</th>
                  <th className="text-left px-3 py-2 font-medium">Funcao</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {paginated.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground text-xs">Nenhum resultado para "{search}"</td></tr>
                ) : paginated.map((item, i) => (
                  <tr key={`${item.clienteId}-${item.areaNome}-${i}`} className={cn('hover:bg-muted/20', item.encerrado && 'opacity-50')}>
                    <td className="px-3 py-2">
                      <Link href={`/clientes/${item.clienteId}`} className="text-sm font-medium text-primary hover:underline">
                        {item.razaoSocial}
                      </Link>
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <span className="font-mono text-[11px] text-muted-foreground">{formatDoc(item.documento)}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{item.areaNome}</td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-flex items-center rounded-[3px] px-2 py-0.5 text-[10px] font-medium',
                        item.role === 'Responsável' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
                      )}>
                        {item.role}
                      </span>
                      {item.encerrado && <span className="ml-1 text-[10px] text-amber-600">Encerrado</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginacao */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                Pag. {page} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" disabled={page === 1} onClick={() => setPage(1)}>{'<<'}</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{'<'}</Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const p = start + i
                  if (p > totalPages) return null
                  return (
                    <Button key={p} type="button" variant={p === page ? 'soft' : 'outline'} size="sm" className="h-7 text-xs px-2.5" onClick={() => setPage(p)}>{p}</Button>
                  )
                })}
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>{'>'}</Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2" disabled={page === totalPages} onClick={() => setPage(totalPages)}>{'>>'}</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
