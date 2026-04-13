'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createUserSchema, updateUserSchema,
  type CreateUserInput, type UpdateUserInput, type PermissionInput,
  MODULE_GROUPS, MODULE_LABELS, USER_ROLE_LABELS, USER_PROFILE_LABELS,
  MODULE_SUB_PERMISSIONS,
} from '@saas/types'
import { HelpCircle, User, Briefcase, Calendar, Building2, Shield, ChevronDown, X, ShieldCheck, Save, ArrowLeft } from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { MODULE_ICONS } from '@/lib/navigation'
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
  iconBg?: string
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
  'Corporativo': {
    bar: 'bg-sky-500', title: 'text-sky-700 dark:text-sky-400', toggle: 'bg-sky-500', icon: 'text-sky-600 dark:text-sky-400',
    activeBg: 'bg-sky-50 dark:bg-sky-950/30', activeBorder: 'border-sky-200 dark:border-sky-800/50',
    hoverBg: 'hover:bg-sky-50/50 dark:hover:bg-sky-950/10', hoverBorder: 'hover:border-sky-200/60',
    decoration: 'decoration-sky-400/40',
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

export function UserForm({ mode, userId, title, description, icon, iconBg = 'from-emerald-500 to-emerald-600', defaultValues }: UserFormProps) {
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

  const { register, handleSubmit, control, formState: { errors } } = useForm<CreateUserInput>({
    resolver: zodResolver(schema as typeof createUserSchema),
    defaultValues: {
      name: '', email: '', password: '', telefone: '',
      role: 'COLABORADOR_INTERNO', profile: 'OPERADOR',
      empresaId: '', areaId: '', cargoId: '',
      salario: '', dataAdmissao: '', idOneClick: '',
      incluirFerias: true, isActive: true,
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
    // Converter campos formatados para o backend
    const payload = {
      ...data,
      salario: moedaParaNumero(String(data.salario ?? '')) ?? undefined,
      dataAdmissao: data.dataAdmissao ? dataParaISO(String(data.dataAdmissao)) : '',
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
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/usuarios')}>
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>
        </div>

        {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        <Card className="overflow-hidden">
          <Tabs defaultValue="dados" orientation="vertical" className="flex min-h-[500px]">
            {/* Sidebar de tabs */}
            <TabsList variant="pills" className="w-[124px] shrink-0 border-r border-border bg-muted/30 p-3 items-center">
              <TabsTrigger variant="pills" value="dados" icon={<User className="h-4 w-4" />}>Dados Pessoais</TabsTrigger>
              <TabsTrigger variant="pills" value="organizacional" icon={<Briefcase className="h-4 w-4" />}>Organizacional</TabsTrigger>
              <TabsTrigger variant="pills" value="ferias" icon={<Calendar className="h-4 w-4" />}>Férias / RH</TabsTrigger>
              <TabsTrigger variant="pills" value="empresa" icon={<Building2 className="h-4 w-4" />}>Empresa</TabsTrigger>
              <TabsTrigger variant="pills" value="permissoes" icon={<Shield className="h-4 w-4" />}>Permissões</TabsTrigger>
            </TabsList>
            {/* Conteúdo */}
            <div className="flex-1 min-w-0">

            {/* TAB 1: DADOS PESSOAIS */}
            <TabsContent value="dados" className="p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
                  <Label htmlFor="name">Nome<RequiredMark /></Label>
                  <Input id="name" placeholder="Nome completo" {...register('name')} />
                  {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                </div>
                <div className="flex items-end pb-1">
                  <Controller control={control} name="isActive" render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={field.value} onCheckedChange={field.onChange} /><span className="text-sm">Ativo</span></label>
                  )} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail<RequiredMark /></Label>
                  <Input id="email" type="email" placeholder="usuario@empresa.com" {...register('email')} />
                  {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" placeholder="(00) 00000-0000" {...register('telefone')} onChange={e => { e.target.value = masks.telefone(e.target.value); register('telefone').onChange(e) }} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="password">Senha{mode === 'create' && <RequiredMark />}</Label>
                    {mode === 'edit' && <FieldHint text="Deixe em branco para manter a senha atual." />}
                  </div>
                  <Input id="password" type="password" placeholder={mode === 'edit' ? 'Deixe vazio para manter' : 'Mínimo 8 caracteres'} autoComplete="new-password" {...register('password')} defaultValue="" />
                  {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
                </div>
              </div>
            </TabsContent>

            {/* TAB 2: DADOS ORGANIZACIONAIS */}
            <TabsContent value="organizacional" className="p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Tipo de usuário</Label>
                    <FieldHint text="Define a categoria do usuário no sistema." />
                  </div>
                  <Controller control={control} name="role" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(USER_ROLE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Perfil</Label>
                    <FieldHint text="Define o nível operacional do usuário." />
                  </div>
                  <Controller control={control} name="profile" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(USER_PROFILE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-1.5">
                  <Label>Área</Label>
                  <Controller control={control} name="areaId" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhuma</SelectItem>
                        {areas.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cargo</Label>
                  <Controller control={control} name="cargoId" render={({ field }) => (
                    <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {cargos.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="salario">Salário</Label>
                    <FieldHint text="Valor do salário bruto mensal." />
                  </div>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-[2px] border border-r-0 border-input bg-muted text-sm text-muted-foreground">R$</span>
                    <Input id="salario" type="text" inputMode="decimal" placeholder="0,00" className="rounded-l-none" {...register('salario')} onChange={e => { e.target.value = masks.moeda(e.target.value); register('salario').onChange(e) }} />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* TAB 3: FÉRIAS / RH */}
            <TabsContent value="ferias" className="p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="dataAdmissao">Data de admissão</Label>
                  <Input id="dataAdmissao" placeholder="00/00/0000" {...register('dataAdmissao')} onChange={e => { e.target.value = masks.data(e.target.value); register('dataAdmissao').onChange(e) }} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="idOneClick">ID usuário OneClick</Label>
                    <FieldHint text="Identificador do usuário no sistema legado OneClick." />
                  </div>
                  <Input id="idOneClick" placeholder="Ex: 257" {...register('idOneClick')} />
                </div>
                <div className="flex items-end pb-1">
                  <Controller control={control} name="incluirFerias" render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      <span className="text-sm">Incluir no controle de férias</span>
                    </label>
                  )} />
                </div>
              </div>
            </TabsContent>

            {/* TAB 4: EMPRESA */}
            <TabsContent value="empresa" className="p-5">
              <div className="space-y-1.5 max-w-md">
                <div className="flex items-center gap-1.5">
                  <Label>Empresa</Label>
                  <FieldHint text="Empresa à qual este usuário pertence. Ele terá acesso apenas aos dados desta empresa." />
                </div>
                <Controller control={control} name="empresaId" render={({ field }) => (
                  <Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {empresas.map(e => <SelectItem key={e.id} value={e.id}>{e.nomeFantasia ?? e.razaoSocial}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )} />
                <p className="text-xs text-muted-foreground">Apenas usuários MASTER podem alterar a empresa</p>
              </div>
              {isMaster && (
                <div className="mt-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                  Este é o usuário MASTER. Ele possui acesso total ao sistema independente das permissões.
                </div>
              )}
            </TabsContent>

            {/* TAB 5: PERMISSÕES */}
            <TabsContent value="permissoes" className="p-5">
              {isMaster ? (
                <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400">
                  O usuário MASTER possui acesso total. As permissões não se aplicam.
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.entries(MODULE_GROUPS).map(([groupName, slugs]) => {
                    const gc = GROUP_COLORS[groupName] ?? GROUP_COLORS['default']
                    return (
                    <div key={groupName}>
                      <div className="flex items-center gap-2 mb-3">
                        <div className={cn('h-4 w-1 rounded-full', gc.bar)} />
                        <h4 className={cn('text-sm font-semibold', gc.title)}>{groupName}</h4>
                        <span className="text-xs text-muted-foreground">({slugs.filter(s => permissionsMap[s]?.canRead).length}/{slugs.length})</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {slugs.map((slug) => {
                          const Icon = MODULE_ICONS[slug]
                          const label = MODULE_LABELS[slug] ?? slug
                          const isActive = !!permissionsMap[slug]?.canRead
                          const hasSubs = !!MODULE_SUB_PERMISSIONS[slug]

                          return (
                            <div
                              key={slug}
                              className={cn(
                                'group flex items-center justify-between rounded-[2px] border px-3 py-2.5 transition-all duration-300',
                                isActive
                                  ? cn(gc.activeBg, gc.activeBorder)
                                  : cn('bg-card border-border/30', gc.hoverBg, gc.hoverBorder),
                              )}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {Icon && <Icon className={cn('h-4 w-4 shrink-0 transition-colors duration-300', isActive ? gc.icon : 'text-muted-foreground/40 group-hover:text-muted-foreground/60')} />}
                                {hasSubs ? (
                                  <button
                                    type="button"
                                    className={cn(
                                      'text-sm truncate transition-colors duration-300 underline decoration-dotted underline-offset-2',
                                      isActive ? cn('font-medium text-foreground', gc.decoration) : 'text-muted-foreground decoration-muted-foreground/30',
                                    )}
                                    onClick={() => setSubModal(slug)}
                                  >
                                    {label}
                                  </button>
                                ) : (
                                  <span className={cn('text-sm truncate transition-colors duration-300', isActive ? 'text-foreground font-medium' : 'text-muted-foreground group-hover:text-foreground/80')}>
                                    {label}
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isActive) {
                                    setPermissionsMap(prev => { const n = { ...prev }; delete n[slug]; return n })
                                  } else {
                                    setPermissionsMap(prev => ({
                                      ...prev,
                                      [slug]: { moduleSlug: slug, canRead: true, canWrite: true, canDelete: true, subPermissions: {} },
                                    }))
                                  }
                                }}
                                className={cn(
                                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-300',
                                  isActive ? gc.toggle : 'bg-muted-foreground/20',
                                )}
                              >
                                <span className={cn(
                                  'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-300 mt-0.5',
                                  isActive ? 'translate-x-4 ml-0.5' : 'translate-x-0.5',
                                )} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )})}

                  {/* Sub-permissions modal */}
                  <SubPermissionsModal
                    slug={subModal}
                    permissionsMap={permissionsMap}
                    setPermissionsMap={setPermissionsMap}
                    onClose={() => setSubModal(null)}
                  />
                </div>
              )}
            </TabsContent>
            </div>
          </Tabs>
        </Card>

      </form>
    </TooltipProvider>
  )
}

// ── Modal de sub-permissões por módulo ──────────────────

function SubPermissionsModal({ slug, permissionsMap, setPermissionsMap, onClose }: {
  slug: string | null
  permissionsMap: Record<string, PermissionInput>
  setPermissionsMap: React.Dispatch<React.SetStateAction<Record<string, PermissionInput>>>
  onClose: () => void
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
    setPermissionsMap(prev => {
      const existing = prev[activeSlug!] ?? { moduleSlug: slug!, canRead: true, canWrite: true, canDelete: true, subPermissions: {} }
      return {
        ...prev,
        [activeSlug!]: {
          ...existing,
          subPermissions: { ...(existing.subPermissions as Record<string, boolean> ?? {}), [key]: value },
        },
      }
    })
  }

  function toggleAllSubs(value: boolean) {
    setPermissionsMap(prev => {
      const existing = prev[activeSlug!] ?? { moduleSlug: slug!, canRead: true, canWrite: true, canDelete: true, subPermissions: {} }
      const newSubs: Record<string, boolean> = {}
      for (const d of subDefs) newSubs[d.key] = value
      return { ...prev, [activeSlug!]: { ...existing, subPermissions: newSubs } }
    })
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
        <DialogHeader className="border-b border-border/60 bg-muted/30">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              {Icon ? <Icon className="h-4.5 w-4.5 text-primary" /> : <ShieldCheck className="h-4.5 w-4.5 text-primary" />}
            </div>
            <div>
              <span>Permissões — {label}</span>
              <DialogDescription className="mt-0.5">Defina o que este usuário pode ver e fazer neste módulo.</DialogDescription>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Corpo scrollável */}
        <div className="px-6 pb-2 space-y-4 max-h-[60vh] overflow-y-auto">
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
                  <label key={d.key} className="flex items-center gap-2.5 py-2 cursor-pointer group">
                    <ToggleSwitch checked={!!subs[d.key]} onChange={v => toggleSub(d.key, v)} />
                    <span className={cn(
                      'text-sm transition-colors duration-200',
                      subs[d.key] ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground/80',
                    )}>{d.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border/60 bg-muted/30">
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
