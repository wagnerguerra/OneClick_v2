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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface AreaForSelect {
  id: string
  name: string
  code: number
}

interface AreaFormProps {
  mode: 'create' | 'edit'
  title: string
  description: string
  icon?: React.ReactNode
  iconBg?: string
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

export function AreaForm({ mode, areaId, title, description, icon, iconBg = 'from-emerald-500 to-emerald-600', defaultValues }: AreaFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [areas, setAreas] = useState<AreaForSelect[]>([])

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
          <Tabs defaultValue="identificacao" orientation="vertical" className="flex min-h-[500px]">
            <TabsList variant="pills" className="w-[124px] shrink-0 border-r border-border bg-muted/30 p-3 items-center">
              <TabsTrigger variant="pills" value="identificacao" icon={<Tag className="h-4 w-4" />}>
                Identificação
              </TabsTrigger>
              <TabsTrigger variant="pills" value="visibilidade" icon={<Eye className="h-4 w-4" />}>
                Visibilidade
              </TabsTrigger>
              <TabsTrigger variant="pills" value="hierarquia" icon={<Network className="h-4 w-4" />}>
                Hierarquia
              </TabsTrigger>
              <TabsTrigger variant="pills" value="custeio" icon={<Calculator className="h-4 w-4" />}>
                Custeio
              </TabsTrigger>
            </TabsList>
            <div className="flex-1 min-w-0">

            {/* IDENTIFICAÇÃO */}
            <TabsContent value="identificacao" className="p-5">
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
            </TabsContent>

            {/* VISIBILIDADE E CONTRATAÇÃO */}
            <TabsContent value="visibilidade" className="p-5">
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
            </TabsContent>

            {/* CONTATO E HIERARQUIA */}
            <TabsContent value="hierarquia" className="p-5">
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
            </TabsContent>

            {/* CUSTEIO POR CLIENTE */}
            <TabsContent value="custeio" className="p-5">
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
            </TabsContent>
            </div>
          </Tabs>
        </Card>

      </form>
    </TooltipProvider>
  )
}
