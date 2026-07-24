'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createAreaSchema, type CreateAreaInput } from '@saas/types'
import { HelpCircle, Tag, Eye, Network, Calculator, Save, ArrowLeft } from 'lucide-react'
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
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface AreaForSelect {
  id: string
  name: string
  code: number
}

interface UserForSelect {
  id: string
  name: string
}

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)

// Sub-abas laterais (padrão da casa: pills compactas na cor do módulo).
const AREA_TABS = [
  { id: 'identificacao', label: 'Identificação', icon: Tag },
  { id: 'visibilidade', label: 'Visibilidade', icon: Eye },
  { id: 'hierarquia', label: 'Hierarquia', icon: Network },
  { id: 'custeio', label: 'Custeio', icon: Calculator },
] as const

interface AreaFormProps {
  mode: 'create' | 'edit'
  title: string
  description: string
  icon?: React.ReactNode
  areaId?: string
  defaultValues?: Partial<CreateAreaInput> & { code?: number }
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

export function AreaForm({ mode, areaId, title, description, icon, defaultValues }: AreaFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [areas, setAreas] = useState<AreaForSelect[]>([])
  const [users, setUsers] = useState<UserForSelect[]>([])
  const [activeTab, setActiveTab] = useState<string>('identificacao')

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<CreateAreaInput>({
    resolver: zodResolver(createAreaSchema),
    defaultValues: {
      name: '',
      isActive: true,
      availableForHiring: false,
      showInOrgChart: false,
      email: '',
      leaderId: '',
      parentId: '',
      costType: 'DIRECT',
      costWeight: 1,
      excludeFromCosting: false,
      ...defaultValues,
    },
  })

  useEffect(() => {
    trpc.area.listForSelect.query().then(setAreas).catch(() => {})
    // Colaboradores para o Select de líder da área (antes ficava vazio → não
    // dava pra atribuir gestor, e as particularidades por área ficavam travadas).
    trpc.user.listForSelect.query().then((list: UserForSelect[]) => setUsers(list.map((u) => ({ id: u.id, name: u.name })))).catch(() => {})
  }, [])

  async function onSubmit(data: CreateAreaInput) {
    setError(null)
    setSaving(true)
    try {
      if (mode === 'create') {
        await trpc.area.create.mutate(data)
        await alerts.success('Área criada', 'O registro foi salvo com sucesso.')
      } else if (areaId) {
        await trpc.area.update.mutate({ id: areaId, data })
        await alerts.success('Área atualizada', 'As alterações foram salvas.')
      }
      router.push('/areas')
    } catch {
      alerts.error('Erro', mode === 'create' ? 'Não foi possível criar a área.' : 'Não foi possível atualizar a área.')
    } finally {
      setSaving(false)
    }
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
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/areas')}>
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
          <div className="flex min-h-[450px]">
            {/* Pills laterais — padrão da casa (w-170, bg-muted/40, ativa = cor do módulo) */}
            <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 space-y-1">
              {AREA_TABS.map((t) => {
                const Icon = t.icon
                const active = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={cn(
                      'flex items-center gap-2 w-full rounded-md px-3 py-2 text-[11px] font-medium transition-colors text-left',
                      active ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/60',
                    )}
                    style={active ? { backgroundColor: MODULE_COLOR } : undefined}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1 truncate">{t.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Conteúdo — key={activeTab} + fadeSlideIn (padrão da casa) */}
            <div key={activeTab} className="flex-1 min-w-0 p-5" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>

            {/* IDENTIFICAÇÃO */}
            {activeTab === 'identificacao' && (
              <div className="grid gap-4 sm:grid-cols-[100px_1fr]">
                {mode === 'edit' && defaultValues?.code !== undefined && (
                  <div className="space-y-1.5">
                    <Label>ID</Label>
                    <Input value={defaultValues.code} disabled className="bg-muted" />
                  </div>
                )}
                <div className={`space-y-1.5 ${mode === 'create' ? 'sm:col-span-2' : ''}`}>
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    placeholder="Nome da área"
                    {...register('name')}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
                  )}
                </div>
              </div>
            )}

            {/* VISIBILIDADE E CONTRATAÇÃO */}
            {activeTab === 'visibilidade' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="availableForHiring"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <span className="text-sm">Disponível para contratação de clientes</span>
                      <FieldHint text="Quando ativo, esta área estará disponível para ser selecionada na contratação de serviços por clientes." />
                    </label>
                  )}
                />
                <Controller
                  control={control}
                  name="showInOrgChart"
                  render={({ field }) => (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <span className="text-sm">Exibir no organograma</span>
                      <FieldHint text="Quando ativo, esta área será exibida no organograma da empresa." />
                    </label>
                  )}
                />
              </div>
            )}

            {/* CONTATO E HIERARQUIA */}
            {activeTab === 'hierarquia' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="email">Email da área</Label>
                    <FieldHint text="E-mail de contato geral da área." />
                  </div>
                  <Input
                    id="email"
                    type="email"
                    placeholder="area@empresa.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive mt-1">{errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Líder da área</Label>
                    <FieldHint text="Colaborador responsável por liderar esta área." />
                  </div>
                  <Controller
                    control={control}
                    name="leaderId"
                    render={({ field }) => (
                      <Select
                        value={field.value || '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o líder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {users.map((u) => (
                            <SelectItem key={u.id} value={u.id}>
                              {u.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Área superior</Label>
                    <FieldHint text="Área hierarquicamente superior a esta." />
                  </div>
                  <Controller
                    control={control}
                    name="parentId"
                    render={({ field }) => (
                      <Select
                        value={field.value || '__none__'}
                        onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a área superior" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhuma</SelectItem>
                          {areas
                            .filter((a) => a.id !== areaId)
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
              </div>
            )}

            {/* CUSTEIO POR CLIENTE */}
            {activeTab === 'custeio' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label>Tipo</Label>
                    <FieldHint text="Define se a alocação de custo é direta ou indireta." />
                  </div>
                  <Controller
                    control={control}
                    name="costType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DIRECT">Direta</SelectItem>
                          <SelectItem value="INDIRECT">Indireta</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="costWeight">Peso (alocação direta)</Label>
                    <FieldHint text="Peso utilizado no cálculo de alocação direta de custos." />
                  </div>
                  <Input
                    id="costWeight"
                    type="number"
                    step="0.01"
                    min="0"
                    {...register('costWeight')}
                  />
                  {errors.costWeight && (
                    <p className="text-xs text-destructive mt-1">{errors.costWeight.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Controller
                    control={control}
                    name="excludeFromCosting"
                    render={({ field }) => (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                        <span className="text-sm">Desconsiderar no custeio</span>
                        <FieldHint text="Quando ativo, esta área será excluída dos cálculos de custeio por cliente." />
                      </label>
                    )}
                  />
                </div>
              </div>
            )}
            </div>
          </div>
        </Card>

      </form>
    </TooltipProvider>
  )
}
