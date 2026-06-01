'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createColaboradorSchema,
  type CreateColaboradorInput,
  TIPO_CONTRATO_LABELS,
  ESTADO_CIVIL_LABELS,
  SEXO_LABELS,
} from '@saas/types'
import {
  User, FileText, MapPin, Briefcase, Phone,
  Save, HelpCircle,
} from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@saas/ui'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)

const COLAB_TABS = [
  { key: 'identificacao', label: 'Identificação', icon: User },
  { key: 'documentos',    label: 'Documentos',    icon: FileText },
  { key: 'endereco',      label: 'Endereço',      icon: MapPin },
  { key: 'contrato',      label: 'Contrato / RH', icon: Briefcase },
  { key: 'contato',       label: 'Contato',       icon: Phone },
] as const
import { cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'

interface SelectOption { id: string; name: string }

interface ColaboradorFormProps {
  mode: 'create' | 'edit'
  title: string
  description: string
  icon?: React.ReactNode
  colaboradorId?: string
  defaultValues?: Partial<CreateColaboradorInput> & { code?: number }
}

function FieldHint({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

export function ColaboradorForm({
  mode, colaboradorId, title, description, icon, defaultValues,
}: ColaboradorFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [areas, setAreas] = useState<SelectOption[]>([])
  const [cargos, setCargos] = useState<SelectOption[]>([])
  const [activeTab, setActiveTab] = useState<typeof COLAB_TABS[number]['key']>('identificacao')

  const {
    register, handleSubmit, control, setValue, watch,
    formState: { errors },
  } = useForm<CreateColaboradorInput>({
    resolver: zodResolver(createColaboradorSchema),
    defaultValues: {
      nomeCompleto: '',
      cpf: '',
      rg: '',
      orgaoEmissor: '',
      dataNascimento: '',
      sexo: null,
      estadoCivil: null,
      nacionalidade: 'Brasileira',
      naturalidade: '',
      fotoUrl: '',
      pis: '',
      ctps: '',
      ctpsSerie: '',
      tituloEleitor: '',
      reservista: '',
      email: '',
      telefone: '',
      celular: '',
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      tipoContrato: 'CLT',
      dataAdmissao: '',
      dataDemissao: '',
      salario: null,
      cargaHoraria: 44,
      incluirFerias: true,
      observacoes: '',
      areaId: '',
      cargoId: '',
      userId: '',
      isActive: true,
      ...defaultValues,
    },
  })

  useEffect(() => {
    Promise.all([
      trpc.area.listForSelect.query(),
      trpc.cargo.listForSelect.query(),
    ]).then(([a, c]) => {
      setAreas(a as SelectOption[])
      setCargos(c as SelectOption[])
    }).catch(() => {})
  }, [])

  async function onSubmit(data: CreateColaboradorInput) {
    setSaving(true)
    try {
      if (mode === 'create') {
        await trpc.colaborador.create.mutate(data)
        await alerts.success('Colaborador cadastrado', 'O registro foi salvo com sucesso.')
      } else if (colaboradorId) {
        await trpc.colaborador.update.mutate({ id: colaboradorId, data })
        await alerts.success('Colaborador atualizado', 'As alterações foram salvas.')
      }
      router.push('/colaboradores')
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  const UF_OPTIONS = [
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
  ]

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Header */}
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
            <BackButton href="/colaboradores" label="Voltar" />
          </div>
        </div>

        <Card>
          <div className="flex items-center gap-2 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <h5 className="text-[13px] font-semibold">Detalhes do Colaborador</h5>
          </div>
          <div className="flex min-h-[500px]">
            {/* Pills laterais — padrão dos demais módulos */}
            <div className="w-[170px] shrink-0 border-r border-border bg-muted/40 p-3 overflow-y-auto">
              <div className="space-y-1">
                {COLAB_TABS.map(tab => {
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
            <div key={activeTab} className="flex-1 min-w-0" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>

              {/* ── IDENTIFICAÇÃO ─────────────────────── */}
              {activeTab === 'identificacao' && (
              <div>
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Identificação</h4>
                </div>
                <div className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  {mode === 'edit' && defaultValues?.code !== undefined && (
                    <div className="col-span-2">
                      <Label>ID</Label>
                      <Input value={defaultValues.code} disabled className="bg-muted mt-1.5" />
                    </div>
                  )}
                  <div className={mode === 'edit' ? 'col-span-10' : 'col-span-12'}>
                    <Label htmlFor="nomeCompleto">Nome Completo *</Label>
                    <Input id="nomeCompleto" placeholder="Nome completo do colaborador" {...register('nomeCompleto')} className="mt-1.5" />
                    {errors.nomeCompleto && <p className="text-xs text-destructive mt-1">{errors.nomeCompleto.message}</p>}
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="cpf">CPF *</Label>
                    <Input
                      id="cpf"
                      placeholder="000.000.000-00"
                      {...register('cpf')}
                      onChange={(e) => setValue('cpf', masks.cpf(e.target.value))}
                      className="mt-1.5"
                    />
                    {errors.cpf && <p className="text-xs text-destructive mt-1">{errors.cpf.message}</p>}
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="dataNascimento">Data de Nascimento</Label>
                    <Input id="dataNascimento" type="date" {...register('dataNascimento')} className="mt-1.5" />
                  </div>

                  <div className="col-span-4">
                    <Label>Sexo</Label>
                    <Controller
                      control={control}
                      name="sexo"
                      render={({ field }) => (
                        <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Não informado</SelectItem>
                            {Object.entries(SEXO_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="col-span-4">
                    <Label>Estado Civil</Label>
                    <Controller
                      control={control}
                      name="estadoCivil"
                      render={({ field }) => (
                        <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? null : v)}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Não informado</SelectItem>
                            {Object.entries(ESTADO_CIVIL_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="nacionalidade">Nacionalidade</Label>
                    <Input id="nacionalidade" placeholder="Brasileira" {...register('nacionalidade')} className="mt-1.5" />
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="naturalidade">Naturalidade</Label>
                    <Input id="naturalidade" placeholder="Cidade/UF" {...register('naturalidade')} className="mt-1.5" />
                  </div>
                </div>
                </div>
              </div>
              )}

              {/* ── DOCUMENTOS ────────────────────────── */}
              {activeTab === 'documentos' && (
              <div>
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Documentos</h4>
                </div>
                <div className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4">
                    <Label htmlFor="rg">RG</Label>
                    <Input id="rg" placeholder="Número do RG" {...register('rg')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="orgaoEmissor">Órgão Emissor</Label>
                    <Input id="orgaoEmissor" placeholder="SSP/SP" {...register('orgaoEmissor')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="pis">PIS/PASEP</Label>
                    <Input id="pis" placeholder="Número do PIS" {...register('pis')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="ctps">CTPS (Número)</Label>
                    <Input id="ctps" placeholder="Número da CTPS" {...register('ctps')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="ctpsSerie">CTPS (Série)</Label>
                    <Input id="ctpsSerie" placeholder="Série" {...register('ctpsSerie')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="tituloEleitor">Título de Eleitor</Label>
                    <Input id="tituloEleitor" placeholder="Número" {...register('tituloEleitor')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="reservista">Certificado de Reservista</Label>
                    <Input id="reservista" placeholder="Número" {...register('reservista')} className="mt-1.5" />
                  </div>
                </div>
                </div>
              </div>
              )}

              {/* ── ENDEREÇO ──────────────────────────── */}
              {activeTab === 'endereco' && (
              <div>
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Endereço</h4>
                </div>
                <div className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-3">
                    <Label htmlFor="cep">CEP</Label>
                    <Input
                      id="cep"
                      placeholder="00000-000"
                      {...register('cep')}
                      onChange={(e) => setValue('cep', masks.cep(e.target.value))}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="col-span-7">
                    <Label htmlFor="logradouro">Logradouro</Label>
                    <Input id="logradouro" placeholder="Rua, Avenida..." {...register('logradouro')} className="mt-1.5" />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="numero">Número</Label>
                    <Input id="numero" placeholder="Nº" {...register('numero')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="complemento">Complemento</Label>
                    <Input id="complemento" placeholder="Apto, Bloco..." {...register('complemento')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="bairro">Bairro</Label>
                    <Input id="bairro" placeholder="Bairro" {...register('bairro')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input id="cidade" placeholder="Cidade" {...register('cidade')} className="mt-1.5" />
                  </div>
                  <div className="col-span-3">
                    <Label>UF</Label>
                    <Controller
                      control={control}
                      name="uf"
                      render={({ field }) => (
                        <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="UF" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {UF_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
                </div>
              </div>
              )}

              {/* ── CONTRATO / RH ─────────────────────── */}
              {activeTab === 'contrato' && (
              <div>
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Contrato / RH</h4>
                </div>
                <div className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4">
                    <Label>Tipo de Contrato</Label>
                    <Controller
                      control={control}
                      name="tipoContrato"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(TIPO_CONTRATO_LABELS).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="dataAdmissao">Data de Admissão</Label>
                    <Input id="dataAdmissao" type="date" {...register('dataAdmissao')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="dataDemissao">Data de Demissão</Label>
                    <Input id="dataDemissao" type="date" {...register('dataDemissao')} className="mt-1.5" />
                  </div>

                  <div className="col-span-4">
                    <Label htmlFor="salario">Salário (R$)</Label>
                    <Input id="salario" type="number" step="0.01" min="0" placeholder="0,00" {...register('salario')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="cargaHoraria">Carga Horária (h/sem)</Label>
                      <FieldHint text="Carga horária semanal em horas" />
                    </div>
                    <Input id="cargaHoraria" type="number" min="0" max="168" {...register('cargaHoraria')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4 flex items-end pb-1">
                    <Controller
                      control={control}
                      name="incluirFerias"
                      render={({ field }) => (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          <span className="text-sm">Incluir no controle de férias</span>
                        </label>
                      )}
                    />
                  </div>

                  <div className="col-span-6">
                    <Label>Área</Label>
                    <Controller
                      control={control}
                      name="areaId"
                      render={({ field }) => (
                        <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a área" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhuma</SelectItem>
                            {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="col-span-6">
                    <Label>Cargo</Label>
                    <Controller
                      control={control}
                      name="cargoId"
                      render={({ field }) => (
                        <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                          <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Nenhum</SelectItem>
                            {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="col-span-12">
                    <Label htmlFor="observacoes">Observações</Label>
                    <textarea
                      id="observacoes"
                      rows={3}
                      placeholder="Observações adicionais sobre o colaborador..."
                      {...register('observacoes')}
                      className="mt-1.5 w-full rounded border border-[#ced4da] bg-transparent px-3 py-2 text-sm focus:border-[#5ea3cb] focus:outline-none"
                    />
                  </div>

                  <div className="col-span-12">
                    <Controller
                      control={control}
                      name="isActive"
                      render={({ field }) => (
                        <label className="flex items-center gap-2 cursor-pointer">
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          <span className="text-sm">Colaborador ativo</span>
                        </label>
                      )}
                    />
                  </div>
                </div>
                </div>
              </div>
              )}

              {/* ── CONTATO ───────────────────────────── */}
              {activeTab === 'contato' && (
              <div>
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Contato</h4>
                </div>
                <div className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-6">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" placeholder="colaborador@email.com" {...register('email')} className="mt-1.5" />
                    {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
                  </div>
                  <div className="col-span-3">
                    <Label htmlFor="telefone">Telefone</Label>
                    <Input
                      id="telefone"
                      placeholder="(00) 0000-0000"
                      {...register('telefone')}
                      onChange={(e) => setValue('telefone', masks.telefone(e.target.value))}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="col-span-3">
                    <Label htmlFor="celular">Celular</Label>
                    <Input
                      id="celular"
                      placeholder="(00) 00000-0000"
                      {...register('celular')}
                      onChange={(e) => setValue('celular', masks.telefone(e.target.value))}
                      className="mt-1.5"
                    />
                  </div>
                </div>
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
