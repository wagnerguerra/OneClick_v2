'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Search, Loader2, MoreVertical, Pencil, FolderKanban, Save, X,
  Filter, Check, GripVertical,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { TAX_REGIME, TAX_REGIME_LABELS, type TaxRegime } from '@saas/types'

const MODULE_COLOR = 'var(--mod-configuracoes, #f97316)'

interface GrupoItem {
  servico: { id: string; nome: string; categoria: string | null }
}
interface Grupo {
  id: string
  nome: string
  slug: string
  descricao: string | null
  tributacao: TaxRegime | null
  segmentoSlug: string | null
  area: string | null
  cor: string | null
  ativo: boolean
  itens: GrupoItem[]
  _count: { clienteObrigacoes: number }
}
interface Obrigacao {
  id: string
  nome: string
  categoria: string | null
}

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function GruposObrigacaoSection() {
  const [items, setItems] = useState<Grupo[]>([])
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroTrib, setFiltroTrib] = useState<'TODAS' | TaxRegime>('TODAS')
  const [filtroAtivo, setFiltroAtivo] = useState<'TODOS' | 'ATIVOS' | 'INATIVOS'>('TODOS')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Grupo | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formSlug, setFormSlug] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formTrib, setFormTrib] = useState<TaxRegime | 'NONE'>('NONE')
  const [formArea, setFormArea] = useState<string>('NONE')
  const [formCor, setFormCor] = useState('#10b981')
  const [formAtivo, setFormAtivo] = useState(true)
  const [formObrigacoes, setFormObrigacoes] = useState<Set<string>>(new Set())
  const [obrSearch, setObrSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t) }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [list, obrigs] = await Promise.all([
        (trpc as any).grupoObrigacao.list.query({
          search: debouncedSearch || undefined,
          tributacao: filtroTrib === 'TODAS' ? undefined : filtroTrib,
          ativo: filtroAtivo === 'TODOS' ? undefined : filtroAtivo === 'ATIVOS',
        }),
        (trpc as any).obrigacao.list.query({}),
      ])
      setItems(list as Grupo[])
      setObrigacoes((obrigs as any[]).map((o) => ({ id: o.id, nome: o.nome, categoria: o.categoria })))
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao carregar templates.')
    } finally { setLoading(false) }
  }, [debouncedSearch, filtroTrib, filtroAtivo])

  useEffect(() => { void fetchData() }, [fetchData])

  function abrirNovo() {
    setEditing(null)
    setFormNome('')
    setFormSlug('')
    setFormDescricao('')
    setFormTrib('NONE')
    setFormArea('NONE')
    setFormCor('#10b981')
    setFormAtivo(true)
    setFormObrigacoes(new Set())
    setObrSearch('')
    setDialogOpen(true)
  }

  function abrirEdicao(g: Grupo) {
    setEditing(g)
    setFormNome(g.nome)
    setFormSlug(g.slug)
    setFormDescricao(g.descricao ?? '')
    setFormTrib((g.tributacao ?? 'NONE') as any)
    setFormArea(g.area ?? 'NONE')
    setFormCor(g.cor ?? '#10b981')
    setFormAtivo(g.ativo)
    setFormObrigacoes(new Set(g.itens.map((i) => i.servico.id)))
    setObrSearch('')
    setDialogOpen(true)
  }

  async function salvar() {
    if (!formNome.trim() || !formSlug.trim()) {
      alerts.error('Campos obrigatórios', 'Nome e slug são obrigatórios.')
      return
    }
    if (formObrigacoes.size === 0) {
      alerts.error('Sem obrigações', 'Adicione ao menos uma obrigação ao template.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        nome: formNome.trim(),
        slug: formSlug.trim(),
        descricao: formDescricao.trim() || null,
        tributacao: formTrib === 'NONE' ? null : formTrib,
        area: formArea === 'NONE' ? null : formArea,
        cor: formCor,
        ativo: formAtivo,
        servicoIds: Array.from(formObrigacoes),
      }
      if (editing) {
        await (trpc as any).grupoObrigacao.update.mutate({ id: editing.id, data: payload })
        await alerts.success('Atualizado', `"${formNome}" foi atualizado.`)
      } else {
        await (trpc as any).grupoObrigacao.create.mutate(payload)
        await alerts.success('Criado', `"${formNome}" foi adicionado.`)
      }
      setDialogOpen(false)
      fetchData()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao salvar.')
    } finally { setSaving(false) }
  }

  async function excluir(id: string, nome: string) {
    if (!await alerts.confirmDelete(nome)) return
    try {
      await (trpc as any).grupoObrigacao.delete.mutate({ id })
      await alerts.success('Excluído', `"${nome}" foi removido.`)
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao excluir.') }
  }

  async function bulkDelete() {
    const ok = await alerts.confirm({
      title: `Excluir ${selected.size} template(s)?`,
      text: 'Os templates serão removidos. Vínculos ClienteObrigacao já criados a partir deles ficam, mas perdem a referência ao template.',
      confirmText: 'Excluir', icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc as any).grupoObrigacao.bulkDelete.mutate({ ids: Array.from(selected) })
      setSelected(new Set())
      await alerts.success('Excluídos', `${selected.size} template(s) removido(s).`)
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao excluir em lote.') }
  }

  const allChecked = items.length > 0 && items.every((i) => selected.has(i.id))
  const obrigacoesFiltradas = obrSearch
    ? obrigacoes.filter((o) => o.nome.toLowerCase().includes(obrSearch.toLowerCase()))
    : obrigacoes

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
        <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-muted-foreground" /> Templates de Obrigações
        </h4>
        <Button size="sm" onClick={abrirNovo} style={{ backgroundColor: MODULE_COLOR, color: 'white' }}>
          <Plus className="h-4 w-4" />Novo template
        </Button>
      </div>

      <div className="p-5 space-y-4">
        <Card>
          <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Filtros</span>
              </div>
              <Select value={filtroTrib} onValueChange={(v) => setFiltroTrib(v as any)}>
                <SelectTrigger className="h-8 w-[180px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODAS">Todas as tributações</SelectItem>
                  {TAX_REGIME.map((t) => <SelectItem key={t} value={t}>{TAX_REGIME_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroAtivo} onValueChange={(v) => setFiltroAtivo(v as any)}>
                <SelectTrigger className="h-8 w-[120px] text-xs bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="ATIVOS">Ativos</SelectItem>
                  <SelectItem value="INATIVOS">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="relative max-w-xs w-full sm:w-[220px]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar template..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs bg-card"
              />
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
              <span className="text-xs font-medium text-amber-900">
                {selected.size} template{selected.size > 1 ? 's' : ''} selecionado{selected.size > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
                <Button variant="destructive" size="sm" onClick={bulkDelete}>
                  <Trash2 className="h-3.5 w-3.5" />Excluir selecionados
                </Button>
              </div>
            </div>
          )}

          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]">
                  <Checkbox
                    checked={allChecked}
                    onCheckedChange={(v) => v ? setSelected(new Set(items.map((i) => i.id))) : setSelected(new Set())}
                  />
                </TableHead>
                <TableHead className="w-auto whitespace-nowrap">Template</TableHead>
                <TableHead className="hidden sm:table-cell w-[150px] whitespace-nowrap">Tributação</TableHead>
                <TableHead className="hidden md:table-cell w-[100px] whitespace-nowrap">Área</TableHead>
                <TableHead className="hidden lg:table-cell w-[90px] text-center whitespace-nowrap">Obrigações</TableHead>
                <TableHead className="hidden lg:table-cell w-[90px] text-center whitespace-nowrap">Aplicados</TableHead>
                <TableHead className="hidden sm:table-cell w-[80px] text-center whitespace-nowrap">Status</TableHead>
                <TableHead className="w-[70px] text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> Carregando...
                  </div>
                </TableCell></TableRow>
              ) : !items.length ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nenhum template encontrado
                </TableCell></TableRow>
              ) : items.map((g) => (
                <TableRow key={g.id} className="hover:bg-muted/30">
                  <TableCell className="w-[36px]" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(g.id)}
                      onCheckedChange={(v) => {
                        const next = new Set(selected)
                        if (v) next.add(g.id); else next.delete(g.id)
                        setSelected(next)
                      }}
                    />
                  </TableCell>
                  <TableCell className="truncate" title={g.descricao ?? g.nome}>
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.cor ?? '#10b981' }} />
                      <span className="font-medium text-sm truncate">{g.nome}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell whitespace-nowrap text-xs text-muted-foreground">
                    {g.tributacao ? TAX_REGIME_LABELS[g.tributacao] : '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell whitespace-nowrap text-xs text-muted-foreground">
                    {g.area ?? '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center text-xs tabular-nums">{g.itens.length}</TableCell>
                  <TableCell className="hidden lg:table-cell text-center text-xs tabular-nums text-muted-foreground">{g._count.clienteObrigacoes}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center">
                    <Badge variant="outline" className={cn('h-5 text-[10px]', g.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-muted-foreground')}>
                      {g.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm"><MoreVertical className="h-3.5 w-3.5" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => abrirEdicao(g)}><Pencil className="h-4 w-4" />Editar</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => excluir(g.id, g.nome)} className="text-destructive focus:text-destructive">
                            <Trash2 className="h-4 w-4" />Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="border-t border-border/60 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{items.length}</span> template{items.length === 1 ? '' : 's'}
          </div>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[90vh] flex flex-col">
          <DialogHeaderIcon icon={editing ? Pencil : Plus} color={editing ? 'sky' : 'emerald'}>
            <DialogTitle>{editing ? 'Editar template' : 'Novo template de obrigações'}</DialogTitle>
            <DialogDescription className="text-xs">
              Templates agrupam obrigações que serão aplicadas em lote ao cliente. Útil pra padronizar por regime tributário.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4 overflow-auto">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-8 space-y-1.5">
                <Label className="text-[13px] font-semibold">Nome <span className="text-red-500">*</span></Label>
                <Input
                  value={formNome}
                  onChange={(e) => { setFormNome(e.target.value); if (!editing) setFormSlug(slugify(e.target.value)) }}
                  placeholder="Ex.: Lucro Presumido · Indústria"
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="col-span-12 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Slug <span className="text-red-500">*</span></Label>
                <Input value={formSlug} onChange={(e) => setFormSlug(e.target.value)} className="h-9 text-sm" placeholder="lucro-presumido-industria" />
              </div>

              <div className="col-span-12 space-y-1.5">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <textarea
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Para que serve este template, qual público atende..."
                  className="w-full min-h-[60px] rounded-[4px] border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="col-span-6 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Tributação</Label>
                <Select value={formTrib} onValueChange={(v) => setFormTrib(v as any)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">(qualquer)</SelectItem>
                    {TAX_REGIME.map((t) => <SelectItem key={t} value={t}>{TAX_REGIME_LABELS[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-6 sm:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Área</Label>
                <Select value={formArea} onValueChange={setFormArea}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">(qualquer)</SelectItem>
                    <SelectItem value="Fiscal">Fiscal</SelectItem>
                    <SelectItem value="Trabalhista">Trabalhista</SelectItem>
                    <SelectItem value="Contábil">Contábil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-4 sm:col-span-2 space-y-1.5">
                <Label className="text-[13px] font-semibold">Cor</Label>
                <input
                  type="color"
                  value={formCor}
                  onChange={(e) => setFormCor(e.target.value)}
                  className="h-9 w-full rounded-[4px] border border-input bg-background cursor-pointer"
                />
              </div>
              <div className="col-span-8 sm:col-span-2 flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                  <Checkbox checked={formAtivo} onCheckedChange={(v) => setFormAtivo(!!v)} />
                  Ativo
                </label>
              </div>
            </div>

            {/* Seletor de obrigações */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[13px] font-semibold">
                  Obrigações <span className="text-red-500">*</span>
                  <span className="ml-2 text-[11px] text-muted-foreground font-normal">
                    {formObrigacoes.size} selecionada{formObrigacoes.size === 1 ? '' : 's'} de {obrigacoes.length}
                  </span>
                </Label>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setFormObrigacoes(new Set(obrigacoes.map((o) => o.id)))}>
                    Selecionar todas
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setFormObrigacoes(new Set())}>
                    Limpar
                  </Button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filtrar obrigações..."
                  value={obrSearch}
                  onChange={(e) => setObrSearch(e.target.value)}
                  className="h-8 pl-8 text-xs bg-card"
                />
              </div>
              <div className="border rounded max-h-[260px] overflow-y-auto divide-y">
                {obrigacoesFiltradas.length === 0 ? (
                  <div className="text-center text-muted-foreground text-xs py-4">Nenhuma obrigação encontrada</div>
                ) : obrigacoesFiltradas.map((o) => {
                  const ativo = formObrigacoes.has(o.id)
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        const next = new Set(formObrigacoes)
                        if (ativo) next.delete(o.id); else next.add(o.id)
                        setFormObrigacoes(next)
                      }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/40 transition-colors',
                        ativo && 'bg-emerald-50 dark:bg-emerald-900/20',
                      )}
                      aria-pressed={ativo}
                    >
                      {/* Indicador visual de checkbox — <span>, não <Checkbox> (componente Radix renderiza
                          <button>, ilegal dentro de outro <button>; registry §3.8) */}
                      <span
                        className={cn(
                          'h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center transition-colors',
                          ativo
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-input bg-background',
                        )}
                      >
                        {ativo && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 truncate font-medium">{o.nome}</span>
                      {o.categoria && (
                        <Badge variant="outline" className="h-4 text-[9px] font-normal">{o.categoria}</Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="h-4 w-4" />Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving} style={{ backgroundColor: MODULE_COLOR, color: 'white' }}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editing ? 'Salvar' : 'Criar template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
