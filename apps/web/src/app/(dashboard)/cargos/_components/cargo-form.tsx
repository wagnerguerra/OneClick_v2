'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCargoSchema, type CreateCargoInput } from '@saas/types'
import { Briefcase, GraduationCap, Save, ArrowLeft, Users, FileText, Clock } from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tabs, TabsList, TabsTrigger, TabsContent,
  TooltipProvider, Avatar, AvatarFallback, Badge,
  RichEditor,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface AreaOption { id: string; name: string }
interface LinkedUser { id: string; name: string; email: string; profile: string; image: string | null }
interface CargoEventItem {
  id: string
  type: string
  version: number
  changes: Record<string, { from: unknown; to: unknown }> | null
  createdAt: string
  user: { id: string; name: string } | null
}

const EVENT_TYPE_LABELS: Record<string, string> = { created: 'Criação do cargo', updated: 'Atualização do cargo', deleted: 'Exclusão do cargo' }
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', areaId: 'Área relacionada', showInOrgChart: 'Organograma',
  descricaoSumaria: 'Descrição sumária', responsabilidades: 'Responsabilidades',
  habilidades: 'Habilidades', autoridades: 'Autoridades', experiencias: 'Experiências',
  treinamentos: 'Treinamentos', educacao: 'Educação', isActive: 'Status',
}

interface CargoFormProps {
  mode: 'create' | 'edit'
  cargoId?: string
  title: string
  description: string
  icon?: React.ReactNode
  iconBg?: string
  defaultValues?: Partial<CreateCargoInput> & { code?: number }
  linkedUsers?: LinkedUser[]
  events?: CargoEventItem[]
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

const PROFILE_LABELS: Record<string, string> = {
  OPERADOR: 'Operador', SUPERVISOR: 'Supervisor', GERENTE: 'Gerente', ADMIN: 'Admin',
}

export function CargoForm({ mode, cargoId, title, description, icon, iconBg = 'from-emerald-500 to-emerald-600', defaultValues, linkedUsers = [], events = [] }: CargoFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [areas, setAreas] = useState<AreaOption[]>([])

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<CreateCargoInput>({
    resolver: zodResolver(createCargoSchema),
    defaultValues: {
      name: '', isActive: true, areaId: '', showInOrgChart: false,
      descricaoSumaria: '', responsabilidades: '', habilidades: '',
      autoridades: '', experiencias: '', treinamentos: '', educacao: '',
      ...defaultValues,
    },
  })

  useEffect(() => {
    trpc.area.listForSelect.query().then(setAreas).catch(() => {})
  }, [])

  async function onSubmit(data: CreateCargoInput) {
    setSaving(true)
    try {
      if (mode === 'create') { await trpc.cargo.create.mutate(data); await alerts.success('Cargo criado', 'Registro salvo.') }
      else if (cargoId) { await trpc.cargo.update.mutate({ id: cargoId, data }); await alerts.success('Cargo atualizado', 'Alterações salvas.') }
      router.push('/cargos')
    } catch { alerts.error('Erro', 'Não foi possível salvar.') }
    finally { setSaving(false) }
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
              <Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/cargos')}>
              <ArrowLeft className="h-4 w-4" />Voltar
            </Button>
          </div>
        </div>

        {/* Layout: form + sidebar */}
        <div className={cn('grid gap-5', mode === 'edit' ? 'lg:grid-cols-[1fr_320px]' : '')}>
          {/* Main form */}
          <Card className="overflow-hidden">
            <Tabs defaultValue="detalhes" orientation="vertical" className="flex min-h-[500px]">
              <TabsList variant="pills" className="w-[124px] shrink-0 border-r border-border bg-muted/30 p-3 items-center">
                <TabsTrigger variant="pills" value="detalhes" icon={<Briefcase className="h-4 w-4" />}>Detalhes</TabsTrigger>
                <TabsTrigger variant="pills" value="competencias" icon={<GraduationCap className="h-4 w-4" />}>Competências</TabsTrigger>
              </TabsList>
              <div className="flex-1 min-w-0">
              {/* TAB 1: DETALHES */}
              <TabsContent value="detalhes" className="p-5 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  {mode === 'edit' && defaultValues?.code !== undefined && (
                    <div className="space-y-1.5">
                      <Label>ID</Label>
                      <Input value={defaultValues.code} disabled className="bg-muted" />
                    </div>
                  )}
                  <div className={cn('space-y-1.5', mode === 'create' && 'sm:col-span-2')}>
                    <Label htmlFor="name">Cargo *</Label>
                    <Input id="name" placeholder="Nome do cargo" {...register('name')} />
                    {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Área relacionada</Label>
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
                  <div className="flex items-end pb-1">
                    <Controller control={control} name="showInOrgChart" render={({ field }) => (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        <div>
                          <span className="text-sm">Exibir no organograma</span>
                          <p className="text-xs text-muted-foreground">Se desmarcado, este cargo não aparecerá no organograma.</p>
                        </div>
                      </label>
                    )} />
                  </div>
                </div>

                {/* Rich text fields */}
                <div className="space-y-1.5">
                  <Label>Descrição Sumária</Label>
                  <Controller control={control} name="descricaoSumaria" render={({ field }) => (
                    <RichEditor value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                </div>

                <div className="space-y-1.5">
                  <Label>Responsabilidades inerentes ao Cargo</Label>
                  <Controller control={control} name="responsabilidades" render={({ field }) => (
                    <RichEditor value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                </div>
              </TabsContent>

              {/* TAB 2: COMPETÊNCIAS */}
              <TabsContent value="competencias" className="p-5 space-y-5">
                <div className="space-y-1.5">
                  <Label>Habilidades desejáveis para o Cargo</Label>
                  <Controller control={control} name="habilidades" render={({ field }) => (
                    <RichEditor value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                </div>

                <div className="space-y-1.5">
                  <Label>Autoridades exercidas pelo Cargo</Label>
                  <Controller control={control} name="autoridades" render={({ field }) => (
                    <RichEditor value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                </div>

                <div className="space-y-1.5">
                  <Label>Experiências</Label>
                  <Controller control={control} name="experiencias" render={({ field }) => (
                    <RichEditor value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                </div>

                <div className="space-y-1.5">
                  <Label>Treinamentos</Label>
                  <Controller control={control} name="treinamentos" render={({ field }) => (
                    <RichEditor value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                </div>

                <div className="space-y-1.5">
                  <Label>Educação</Label>
                  <Controller control={control} name="educacao" render={({ field }) => (
                    <RichEditor value={field.value ?? ''} onChange={field.onChange} />
                  )} />
                </div>
              </TabsContent>
              </div>
            </Tabs>
          </Card>

          {/* Sidebar — somente no edit */}
          {mode === 'edit' && (
            <div className="space-y-4">
              {/* Colaboradores vinculados */}
              <Card>
                <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Colaboradores</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{linkedUsers.length}</span>
                </div>
                <div className="p-3">
                  {linkedUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Nenhum colaborador vinculado</p>
                  ) : (
                    <div className="space-y-2">
                      {linkedUsers.map(user => (
                        <div key={user.id} className="flex items-center gap-3 rounded-[2px] border border-border/30 p-2 hover:bg-muted/20 transition-colors">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {getInitials(user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{user.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {PROFILE_LABELS[user.profile] ?? user.profile}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              {/* Arquivos — placeholder */}
              <Card>
                <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Arquivos</span>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-xs text-muted-foreground text-center">Nenhum arquivo anexado</p>
                </div>
              </Card>

              {/* Eventos / Histórico de auditoria */}
              <Card>
                <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Eventos</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{events.length} registros</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {events.length === 0 ? (
                    <div className="p-4"><p className="text-xs text-muted-foreground text-center">Nenhum evento registrado</p></div>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {events.map(evt => {
                        const date = new Date(evt.createdAt)
                        const day = String(date.getDate()).padStart(2, '0')
                        const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase()
                        const changeKeys = evt.changes ? Object.keys(evt.changes) : []

                        return (
                          <div key={evt.id} className="flex gap-3 px-3 py-3">
                            {/* Data badge */}
                            <div className="flex flex-col items-center shrink-0 w-10">
                              <span className="text-lg font-bold leading-none text-foreground">{day}</span>
                              <span className="text-[10px] text-muted-foreground uppercase">{weekday}</span>
                            </div>
                            {/* Conteúdo */}
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-medium text-foreground">
                                {EVENT_TYPE_LABELS[evt.type] ?? evt.type}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {evt.user?.name ?? 'Sistema'} — {date.toLocaleString('pt-BR')}
                              </p>
                              {/* Tags de campos alterados + versão */}
                              <div className="flex flex-wrap gap-1 mt-1">
                                {evt.type === 'created' && (
                                  <Badge variant="success" className="text-[10px] px-1.5 py-0">{EVENT_TYPE_LABELS.created}</Badge>
                                )}
                                {evt.type === 'updated' && changeKeys.map(key => (
                                  <Badge key={key} variant="outline" className="text-[10px] px-1.5 py-0">
                                    {FIELD_LABELS[key] ?? key}
                                  </Badge>
                                ))}
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {evt.type === 'updated' ? `v${evt.version - 1} → v${evt.version}` : `v${evt.version}`}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      </form>
    </TooltipProvider>
  )
}
