'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createFornecedorSchema,
  type CreateFornecedorInput,
  TIPO_FORNECEDOR_LABELS,
} from '@saas/types'
import {
  Building2, FileText, MapPin, CreditCard, Phone,
  Save, HelpCircle,
} from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // emerald (Cadastros)

interface FornecedorFormProps {
  mode: 'create' | 'edit'
  title: string
  description: string
  icon?: React.ReactNode
  fornecedorId?: string
  defaultValues?: Partial<CreateFornecedorInput> & { code?: number }
}

function FieldHint({ text }: { text: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">{text}</TooltipContent>
    </Tooltip>
  )
}

const UF_OPTIONS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function FornecedorForm({ mode, fornecedorId, title, description, icon, defaultValues }: FornecedorFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<CreateFornecedorInput>({
    resolver: zodResolver(createFornecedorSchema),
    defaultValues: {
      razaoSocial: '', nomeFantasia: '', documento: '', tipoDocumento: 'CNPJ',
      inscricaoEstadual: '', inscricaoMunicipal: '', tipoFornecedor: 'AMBOS', categoria: '', logoUrl: '',
      telefone: '', celular: '', email: '', site: '', contatoPrincipal: '', cargoContato: '',
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
      banco: '', agencia: '', conta: '', tipoConta: '', pixChave: '', pixTipo: '',
      observacoes: '', isActive: true,
      ...defaultValues,
    },
  })

  async function onSubmit(data: CreateFornecedorInput) {
    setSaving(true)
    try {
      if (mode === 'create') {
        await trpc.fornecedor.create.mutate(data)
        await alerts.success('Fornecedor cadastrado', 'O registro foi salvo com sucesso.')
      } else if (fornecedorId) {
        await trpc.fornecedor.update.mutate({ id: fornecedorId, data })
        await alerts.success('Fornecedor atualizado', 'As alterações foram salvas.')
      }
      router.push('/fornecedores')
    } catch (e) { alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
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
            <div><h1>{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="success" size="sm" type="submit" disabled={saving}><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}</Button>
            <BackButton href="/fornecedores" label="Voltar" />
          </div>
        </div>

        <Card className="overflow-hidden">
          <Tabs defaultValue="identificacao" orientation="vertical" className="flex min-h-[550px]">
            <TabsList variant="pills" className="w-[140px] shrink-0 border-r border-border bg-muted/30 p-3 items-center">
              <TabsTrigger variant="pills" value="identificacao" icon={<Building2 className="h-4 w-4" />}>Identificação</TabsTrigger>
              <TabsTrigger variant="pills" value="contato" icon={<Phone className="h-4 w-4" />}>Contato</TabsTrigger>
              <TabsTrigger variant="pills" value="endereco" icon={<MapPin className="h-4 w-4" />}>Endereço</TabsTrigger>
              <TabsTrigger variant="pills" value="bancario" icon={<CreditCard className="h-4 w-4" />}>Dados Bancários</TabsTrigger>
              <TabsTrigger variant="pills" value="observacoes" icon={<FileText className="h-4 w-4" />}>Observações</TabsTrigger>
            </TabsList>

            <div className="flex-1 min-w-0">
              {/* IDENTIFICAÇÃO */}
              <TabsContent value="identificacao" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  {mode === 'edit' && defaultValues?.code !== undefined && (
                    <div className="col-span-2"><Label>ID</Label><Input value={defaultValues.code} disabled className="bg-muted mt-1.5" /></div>
                  )}
                  <div className={mode === 'edit' ? 'col-span-10' : 'col-span-12'}>
                    <Label htmlFor="razaoSocial">Razão Social *</Label>
                    <Input id="razaoSocial" placeholder="Razão social do fornecedor" {...register('razaoSocial')} className="mt-1.5" />
                    {errors.razaoSocial && <p className="text-xs text-destructive mt-1">{errors.razaoSocial.message}</p>}
                  </div>
                  <div className="col-span-6">
                    <Label htmlFor="nomeFantasia">Nome Fantasia</Label>
                    <Input id="nomeFantasia" placeholder="Nome fantasia" {...register('nomeFantasia')} className="mt-1.5" />
                  </div>
                  <div className="col-span-3">
                    <Label>Tipo Documento</Label>
                    <Controller control={control} name="tipoDocumento" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="CNPJ">CNPJ</SelectItem><SelectItem value="CPF">CPF</SelectItem></SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="col-span-3">
                    <Label htmlFor="documento">Documento *</Label>
                    <Input id="documento" placeholder="00.000.000/0000-00" {...register('documento')} onChange={(e) => setValue('documento', masks.cnpj(e.target.value))} className="mt-1.5" />
                    {errors.documento && <p className="text-xs text-destructive mt-1">{errors.documento.message}</p>}
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="inscricaoEstadual">Inscrição Estadual</Label>
                    <Input id="inscricaoEstadual" {...register('inscricaoEstadual')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="inscricaoMunicipal">Inscrição Municipal</Label>
                    <Input id="inscricaoMunicipal" {...register('inscricaoMunicipal')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4">
                    <Label>Tipo de Fornecedor</Label>
                    <Controller control={control} name="tipoFornecedor" render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(TIPO_FORNECEDOR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="col-span-4">
                    <Label htmlFor="categoria">Categoria</Label>
                    <Input id="categoria" placeholder="Ex: Materiais, TI, Consultoria..." {...register('categoria')} className="mt-1.5" />
                  </div>
                  <div className="col-span-4 flex items-end pb-1">
                    <Controller control={control} name="isActive" render={({ field }) => (
                      <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={field.value} onCheckedChange={field.onChange} /><span className="text-sm">Fornecedor ativo</span></label>
                    )} />
                  </div>
                </div>
              </TabsContent>

              {/* CONTATO */}
              <TabsContent value="contato" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-6"><Label htmlFor="contatoPrincipal">Contato Principal</Label><Input id="contatoPrincipal" placeholder="Nome do contato" {...register('contatoPrincipal')} className="mt-1.5" /></div>
                  <div className="col-span-6"><Label htmlFor="cargoContato">Cargo do Contato</Label><Input id="cargoContato" placeholder="Cargo" {...register('cargoContato')} className="mt-1.5" /></div>
                  <div className="col-span-6"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" placeholder="fornecedor@email.com" {...register('email')} className="mt-1.5" />{errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}</div>
                  <div className="col-span-3"><Label htmlFor="telefone">Telefone</Label><Input id="telefone" placeholder="(00) 0000-0000" {...register('telefone')} onChange={(e) => setValue('telefone', masks.telefone(e.target.value))} className="mt-1.5" /></div>
                  <div className="col-span-3"><Label htmlFor="celular">Celular</Label><Input id="celular" placeholder="(00) 00000-0000" {...register('celular')} onChange={(e) => setValue('celular', masks.telefone(e.target.value))} className="mt-1.5" /></div>
                  <div className="col-span-6"><Label htmlFor="site">Site</Label><Input id="site" placeholder="https://www.fornecedor.com.br" {...register('site')} className="mt-1.5" /></div>
                </div>
              </TabsContent>

              {/* ENDEREÇO */}
              <TabsContent value="endereco" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-3"><Label htmlFor="cep">CEP</Label><Input id="cep" placeholder="00000-000" {...register('cep')} onChange={(e) => setValue('cep', masks.cep(e.target.value))} className="mt-1.5" /></div>
                  <div className="col-span-7"><Label htmlFor="logradouro">Logradouro</Label><Input id="logradouro" placeholder="Rua, Avenida..." {...register('logradouro')} className="mt-1.5" /></div>
                  <div className="col-span-2"><Label htmlFor="numero">Número</Label><Input id="numero" placeholder="Nº" {...register('numero')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="complemento">Complemento</Label><Input id="complemento" placeholder="Sala, Andar..." {...register('complemento')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="bairro">Bairro</Label><Input id="bairro" {...register('bairro')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="cidade">Cidade</Label><Input id="cidade" {...register('cidade')} className="mt-1.5" /></div>
                  <div className="col-span-3">
                    <Label>UF</Label>
                    <Controller control={control} name="uf" render={({ field }) => (
                      <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="UF" /></SelectTrigger>
                        <SelectContent><SelectItem value="__none__">—</SelectItem>{UF_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    )} />
                  </div>
                </div>
              </TabsContent>

              {/* DADOS BANCÁRIOS */}
              <TabsContent value="bancario" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4"><Label htmlFor="banco">Banco</Label><Input id="banco" placeholder="Nome do banco" {...register('banco')} className="mt-1.5" /></div>
                  <div className="col-span-3"><Label htmlFor="agencia">Agência</Label><Input id="agencia" placeholder="0000" {...register('agencia')} className="mt-1.5" /></div>
                  <div className="col-span-3"><Label htmlFor="conta">Conta</Label><Input id="conta" placeholder="00000-0" {...register('conta')} className="mt-1.5" /></div>
                  <div className="col-span-2">
                    <Label>Tipo Conta</Label>
                    <Controller control={control} name="tipoConta" render={({ field }) => (
                      <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Tipo" /></SelectTrigger>
                        <SelectContent><SelectItem value="__none__">—</SelectItem><SelectItem value="corrente">Corrente</SelectItem><SelectItem value="poupanca">Poupança</SelectItem></SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="col-span-12 -mx-5 px-5 py-3 border-t border-[rgba(0,0,0,0.08)]"><h4 className="text-[13px] font-semibold text-foreground">PIX</h4></div>
                  <div className="col-span-4">
                    <Label>Tipo de Chave PIX</Label>
                    <Controller control={control} name="pixTipo" render={({ field }) => (
                      <Select value={field.value || '__none__'} onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Tipo" /></SelectTrigger>
                        <SelectContent><SelectItem value="__none__">—</SelectItem><SelectItem value="cpf">CPF/CNPJ</SelectItem><SelectItem value="email">E-mail</SelectItem><SelectItem value="telefone">Telefone</SelectItem><SelectItem value="aleatoria">Aleatória</SelectItem></SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="col-span-8"><Label htmlFor="pixChave">Chave PIX</Label><Input id="pixChave" placeholder="Chave PIX" {...register('pixChave')} className="mt-1.5" /></div>
                </div>
              </TabsContent>

              {/* OBSERVAÇÕES */}
              <TabsContent value="observacoes" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12">
                    <Label htmlFor="observacoes">Observações</Label>
                    <textarea id="observacoes" rows={6} placeholder="Observações sobre o fornecedor..." {...register('observacoes')} className="mt-1.5 w-full rounded border border-[#ced4da] bg-transparent px-3 py-2 text-sm focus:border-[#5ea3cb] focus:outline-none" />
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
