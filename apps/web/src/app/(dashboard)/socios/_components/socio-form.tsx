'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createSocioSchema, type CreateSocioInput, TIPO_SOCIO_LABELS, ESTADO_CIVIL_LABELS } from '@saas/types'
import {
  User, MapPin, Briefcase, Phone, Save, ArrowLeft,
  FileText, MessageSquare, Upload, Trash2, Pencil, Send, Loader2,
} from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card, Badge,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  TooltipProvider,
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'

interface SelectOption { id: string; razaoSocial?: string; nomeCompleto?: string }

interface Arquivo {
  id: string; fileName: string; fileUrl: string; fileSize: number | null
  mimeType: string | null; vencimento: string | null; createdAt: string
  user: { id: string; name: string } | null
}

interface Mensagem {
  id: string; mensagem: string; tipo: string; createdAt: string; updatedAt: string
  user: { id: string; name: string } | null
}

interface SocioFormProps {
  mode: 'create' | 'edit'
  title: string
  description: string
  icon?: React.ReactNode
  socioId?: string
  defaultValues?: Partial<CreateSocioInput> & { code?: number }
}

const UF_OPTIONS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export function SocioForm({ mode, socioId, title, description, icon, defaultValues }: SocioFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [clientes, setClientes] = useState<SelectOption[]>([])

  // Arquivos
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [uploading, setUploading] = useState(false)

  // Mensagens
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoTexto, setEditandoTexto] = useState('')

  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<CreateSocioInput>({
    resolver: zodResolver(createSocioSchema),
    defaultValues: {
      nomeCompleto: '', cpf: '', rg: '', orgaoEmissor: '', dataNascimento: '',
      nacionalidade: 'Brasileira', estadoCivil: null, profissao: '',
      email: '', telefone: '', celular: '',
      cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
      tipoSocio: 'SOCIO_QUOTISTA', participacao: null, valorQuotas: null,
      dataEntrada: '', dataSaida: '', assinaNaEmpresa: false, responsavelLegal: false,
      observacoes: '', clienteId: '', isActive: true,
      ...defaultValues,
    },
  })

  useEffect(() => {
    trpc.cliente.listForSelect.query().then(c => setClientes(c as SelectOption[])).catch(() => {})
  }, [])

  const loadArquivos = useCallback(async () => {
    if (!socioId) return
    try { setArquivos(await trpc.socio.listArquivos.query({ socioId }) as Arquivo[]) } catch { /* silencioso */ }
  }, [socioId])

  const loadMensagens = useCallback(async () => {
    if (!socioId) return
    try { setMensagens(await trpc.socio.listMensagens.query({ socioId }) as Mensagem[]) } catch { /* silencioso */ }
  }, [socioId])

  useEffect(() => {
    if (mode === 'edit' && socioId) { loadArquivos(); loadMensagens() }
  }, [mode, socioId, loadArquivos, loadMensagens])

  async function onSubmit(data: CreateSocioInput) {
    setSaving(true)
    try {
      if (mode === 'create') { await trpc.socio.create.mutate(data); await alerts.success('Sócio cadastrado', 'Registro salvo.') }
      else if (socioId) { await trpc.socio.update.mutate({ id: socioId, data }); await alerts.success('Sócio atualizado', 'Alterações salvas.') }
      router.push('/socios')
    } catch (e) { alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.') }
    finally { setSaving(false) }
  }

  // ── Arquivos handlers ──────────────────────────────────
  async function handleUpload() {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (!files || !socioId) return
      setUploading(true)
      for (const file of Array.from(files)) {
        try {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/upload`, { method: 'POST', body: formData, credentials: 'include' })
          if (!res.ok) throw new Error('Falha no upload')
          const { url, filename } = await res.json() as { url: string; filename: string }
          await trpc.socio.addArquivo.mutate({ socioId, fileName: file.name, fileUrl: url, fileSize: file.size, mimeType: file.type })
        } catch { alerts.error('Erro', `Falha ao enviar ${file.name}`) }
      }
      setUploading(false)
      loadArquivos()
    }
    input.click()
  }

  async function handleRemoveArquivo(id: string, name: string) {
    if (!await alerts.confirmDelete(name)) return
    try { await trpc.socio.removeArquivo.mutate({ arquivoId: id }); loadArquivos() }
    catch { alerts.error('Erro', 'Não foi possível remover.') }
  }

  // ── Mensagens handlers ─────────────────────────────────
  async function handleEnviarMensagem() {
    if (!novaMensagem.trim() || !socioId) return
    setEnviando(true)
    try {
      await trpc.socio.createMensagem.mutate({ socioId, mensagem: novaMensagem.trim(), tipo: 'interna' })
      setNovaMensagem('')
      loadMensagens()
    } catch { alerts.error('Erro', 'Não foi possível enviar.') }
    finally { setEnviando(false) }
  }

  async function handleUpdateMensagem() {
    if (!editandoId || !editandoTexto.trim()) return
    try {
      await trpc.socio.updateMensagem.mutate({ id: editandoId, mensagem: editandoTexto.trim() })
      setEditandoId(null); setEditandoTexto('')
      loadMensagens()
    } catch { alerts.error('Erro', 'Não foi possível atualizar.') }
  }

  async function handleDeleteMensagem(id: string) {
    if (!await alerts.confirmDelete('esta mensagem')) return
    try { await trpc.socio.deleteMensagem.mutate({ id }); loadMensagens() }
    catch { alerts.error('Erro', 'Não foi possível excluir.') }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const isEdit = mode === 'edit' && !!socioId

  return (
    <TooltipProvider>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {icon && <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-md">{icon}</div>}
            <div><h1>{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="success" size="sm" type="submit" disabled={saving}><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar'}</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push('/socios')}><ArrowLeft className="h-4 w-4" />Voltar</Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <Tabs defaultValue="pessoal" orientation="vertical" className="flex min-h-[550px]">
            <TabsList variant="pills" className="w-[140px] shrink-0 border-r border-border bg-muted/30 p-3 items-center">
              <TabsTrigger variant="pills" value="pessoal" icon={<User className="h-4 w-4" />}>Dados Pessoais</TabsTrigger>
              <TabsTrigger variant="pills" value="contato" icon={<Phone className="h-4 w-4" />}>Contato</TabsTrigger>
              <TabsTrigger variant="pills" value="endereco" icon={<MapPin className="h-4 w-4" />}>Endereço</TabsTrigger>
              <TabsTrigger variant="pills" value="societario" icon={<Briefcase className="h-4 w-4" />}>Societário</TabsTrigger>
              {isEdit && <TabsTrigger variant="pills" value="arquivos" icon={<FileText className="h-4 w-4" />}>Arquivos</TabsTrigger>}
              {isEdit && <TabsTrigger variant="pills" value="mensagens" icon={<MessageSquare className="h-4 w-4" />}>Mensagens</TabsTrigger>}
            </TabsList>
            <div className="flex-1 min-w-0">

              {/* DADOS PESSOAIS */}
              <TabsContent value="pessoal" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  {isEdit && defaultValues?.code !== undefined && (
                    <div className="col-span-2"><Label>ID</Label><Input value={defaultValues.code} disabled className="bg-muted mt-1.5" /></div>
                  )}
                  <div className={isEdit ? 'col-span-10' : 'col-span-12'}>
                    <Label htmlFor="nomeCompleto">Nome Completo *</Label>
                    <Input id="nomeCompleto" placeholder="Nome completo do sócio" {...register('nomeCompleto')} className="mt-1.5" />
                    {errors.nomeCompleto && <p className="text-xs text-destructive mt-1">{errors.nomeCompleto.message}</p>}
                  </div>
                  <div className="col-span-4"><Label htmlFor="cpf">CPF *</Label><Input id="cpf" placeholder="000.000.000-00" {...register('cpf')} onChange={e => setValue('cpf', masks.cpf(e.target.value))} className="mt-1.5" />{errors.cpf && <p className="text-xs text-destructive mt-1">{errors.cpf.message}</p>}</div>
                  <div className="col-span-3"><Label htmlFor="rg">RG</Label><Input id="rg" {...register('rg')} className="mt-1.5" /></div>
                  <div className="col-span-2"><Label htmlFor="orgaoEmissor">Órgão</Label><Input id="orgaoEmissor" placeholder="SSP/SP" {...register('orgaoEmissor')} className="mt-1.5" /></div>
                  <div className="col-span-3"><Label htmlFor="dataNascimento">Nascimento</Label><Input id="dataNascimento" type="date" {...register('dataNascimento')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label>Estado Civil</Label><Controller control={control} name="estadoCivil" render={({ field }) => (<Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? null : v)}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="__none__">Não informado</SelectItem>{Object.entries(ESTADO_CIVIL_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>)} /></div>
                  <div className="col-span-4"><Label htmlFor="nacionalidade">Nacionalidade</Label><Input id="nacionalidade" {...register('nacionalidade')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="profissao">Profissão</Label><Input id="profissao" {...register('profissao')} className="mt-1.5" /></div>
                </div>
              </TabsContent>

              {/* CONTATO */}
              <TabsContent value="contato" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-6"><Label htmlFor="email">E-mail</Label><Input id="email" type="email" {...register('email')} className="mt-1.5" /></div>
                  <div className="col-span-3"><Label htmlFor="telefone">Telefone</Label><Input id="telefone" {...register('telefone')} onChange={e => setValue('telefone', masks.telefone(e.target.value))} className="mt-1.5" /></div>
                  <div className="col-span-3"><Label htmlFor="celular">Celular</Label><Input id="celular" {...register('celular')} onChange={e => setValue('celular', masks.telefone(e.target.value))} className="mt-1.5" /></div>
                </div>
              </TabsContent>

              {/* ENDEREÇO */}
              <TabsContent value="endereco" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-3"><Label htmlFor="cep">CEP</Label><Input id="cep" {...register('cep')} onChange={e => setValue('cep', masks.cep(e.target.value))} className="mt-1.5" /></div>
                  <div className="col-span-7"><Label htmlFor="logradouro">Logradouro</Label><Input id="logradouro" {...register('logradouro')} className="mt-1.5" /></div>
                  <div className="col-span-2"><Label htmlFor="numero">Nº</Label><Input id="numero" {...register('numero')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="complemento">Complemento</Label><Input id="complemento" {...register('complemento')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="bairro">Bairro</Label><Input id="bairro" {...register('bairro')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="cidade">Cidade</Label><Input id="cidade" {...register('cidade')} className="mt-1.5" /></div>
                  <div className="col-span-3"><Label>UF</Label><Controller control={control} name="uf" render={({ field }) => (<Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}><SelectTrigger className="mt-1.5"><SelectValue placeholder="UF" /></SelectTrigger><SelectContent><SelectItem value="__none__">—</SelectItem>{UF_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>)} /></div>
                </div>
              </TabsContent>

              {/* SOCIETÁRIO */}
              <TabsContent value="societario" className="p-5">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-4"><Label>Tipo de Sócio</Label><Controller control={control} name="tipoSocio" render={({ field }) => (<Select value={field.value} onValueChange={field.onChange}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TIPO_SOCIO_LABELS).map(([k,v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>)} /></div>
                  <div className="col-span-4"><Label htmlFor="participacao">Participação (%)</Label><Input id="participacao" type="number" step="0.01" min="0" max="100" {...register('participacao')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="valorQuotas">Valor das Quotas (R$)</Label><Input id="valorQuotas" type="number" step="0.01" min="0" {...register('valorQuotas')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="dataEntrada">Data de Entrada</Label><Input id="dataEntrada" type="date" {...register('dataEntrada')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label htmlFor="dataSaida">Data de Saída</Label><Input id="dataSaida" type="date" {...register('dataSaida')} className="mt-1.5" /></div>
                  <div className="col-span-4"><Label>Empresa/Cliente</Label><Controller control={control} name="clienteId" render={({ field }) => (<Select value={field.value || '__none__'} onValueChange={v => field.onChange(v === '__none__' ? '' : v)}><SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="__none__">Nenhum</SelectItem>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.razaoSocial || c.nomeCompleto}</SelectItem>)}</SelectContent></Select>)} /></div>
                  <div className="col-span-4 flex items-end pb-1"><Controller control={control} name="assinaNaEmpresa" render={({ field }) => (<label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={field.value} onCheckedChange={field.onChange} /><span className="text-sm">Assina pela empresa</span></label>)} /></div>
                  <div className="col-span-4 flex items-end pb-1"><Controller control={control} name="responsavelLegal" render={({ field }) => (<label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={field.value} onCheckedChange={field.onChange} /><span className="text-sm">Responsável legal</span></label>)} /></div>
                  <div className="col-span-4 flex items-end pb-1"><Controller control={control} name="isActive" render={({ field }) => (<label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={field.value} onCheckedChange={field.onChange} /><span className="text-sm">Sócio ativo</span></label>)} /></div>
                  <div className="col-span-12"><Label htmlFor="observacoes">Observações</Label><textarea id="observacoes" rows={3} {...register('observacoes')} className="mt-1.5 w-full rounded border border-[#ced4da] bg-transparent px-3 py-2 text-sm focus:border-[#5ea3cb] focus:outline-none" /></div>
                </div>
              </TabsContent>

              {/* ARQUIVOS */}
              {isEdit && (
                <TabsContent value="arquivos" className="p-5">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Documentos do Sócio</h4>
                        <p className="text-xs text-muted-foreground">{arquivos.length} arquivo(s) anexado(s)</p>
                      </div>
                      <Button type="button" variant="success" size="sm" onClick={handleUpload} disabled={uploading} className="gap-1.5">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? 'Enviando...' : 'Enviar Arquivo'}
                      </Button>
                    </div>

                    {arquivos.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Nenhum arquivo anexado</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {arquivos.map((arq) => (
                          <div key={arq.id} className="flex items-center justify-between p-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-muted/10 hover:bg-muted/20 transition-colors">
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <a href={arq.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:text-[#5ea3cb] truncate block">
                                  {arq.fileName}
                                </a>
                                <p className="text-[11px] text-muted-foreground">
                                  {formatFileSize(arq.fileSize)} {arq.user && `· ${arq.user.name}`} · {formatDate(arq.createdAt)}
                                </p>
                              </div>
                            </div>
                            <Button type="button" variant="soft-destructive" size="icon-sm" onClick={() => handleRemoveArquivo(arq.id, arq.fileName)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              )}

              {/* MENSAGENS */}
              {isEdit && (
                <TabsContent value="mensagens" className="p-5">
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-foreground">Histórico de Mensagens</h4>

                    {/* Lista de mensagens */}
                    <div className="space-y-3 max-h-[350px] overflow-y-auto">
                      {mensagens.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">Nenhuma mensagem registrada</p>
                        </div>
                      ) : mensagens.map((msg) => (
                        <div key={msg.id} className="p-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-muted/10">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-semibold text-foreground">{msg.user?.name ?? 'Sistema'}</span>
                                <Badge variant="outline" className="text-[9px]">{msg.tipo === 'socio' ? 'Sócio' : 'Interna'}</Badge>
                                <span className="text-[10px] text-muted-foreground">{formatDate(msg.createdAt)}</span>
                              </div>
                              {editandoId === msg.id ? (
                                <div className="flex items-center gap-2">
                                  <Input value={editandoTexto} onChange={(e) => setEditandoTexto(e.target.value)} className="text-xs flex-1" />
                                  <Button type="button" variant="success" size="icon-sm" onClick={handleUpdateMensagem}><Save className="h-3.5 w-3.5" /></Button>
                                  <Button type="button" variant="outline" size="icon-sm" onClick={() => setEditandoId(null)}><ArrowLeft className="h-3.5 w-3.5" /></Button>
                                </div>
                              ) : (
                                <p className="text-sm text-foreground whitespace-pre-wrap">{msg.mensagem}</p>
                              )}
                            </div>
                            {editandoId !== msg.id && (
                              <div className="flex items-center gap-1 shrink-0">
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => { setEditandoId(msg.id); setEditandoTexto(msg.mensagem) }}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleDeleteMensagem(msg.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Campo de nova mensagem */}
                    <div className="flex items-center gap-2 pt-3 border-t border-[rgba(0,0,0,0.08)]">
                      <textarea
                        rows={2}
                        placeholder="Escreva uma mensagem..."
                        value={novaMensagem}
                        onChange={(e) => setNovaMensagem(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviarMensagem() } }}
                        className="flex-1 rounded border border-[#ced4da] bg-transparent px-3 py-2 text-sm focus:border-[#5ea3cb] focus:outline-none resize-none"
                      />
                      <Button type="button" variant="success" size="sm" onClick={handleEnviarMensagem} disabled={enviando || !novaMensagem.trim()} className="gap-1.5 self-end">
                        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Enviar
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              )}

            </div>
          </Tabs>
        </Card>
      </form>
    </TooltipProvider>
  )
}
