'use client'

/**
 * Página de gerenciamento de Grupos de Serviço.
 *
 * Padrão visual: igual ao /servicos (header com gradient icon + título,
 * cards KPI, tabela com dropdown de ações por linha).
 *
 * Grupo é um rótulo M→N: agrega serviços que pertencem à mesma operação
 * (ex: "Constituição de Cliente Mensal" contém vários serviços top-level).
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Pencil, Loader2, Edit, Trash2, Layers, Search, GripVertical, X,
  MoreVertical,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn, Textarea,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { GRUPO_TIPO, GRUPO_TIPO_LABELS, GRUPO_TIPO_HINTS, type GrupoTipo } from '@saas/types'
import { BackButton } from '@/components/ui/back-button'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)' // Emerald (Cadastros)

interface ServicoLite {
  id: string
  nome: string
  area: { name: string } | null
  tipo?: string
  categoriaServico?: 'MENSAL' | 'EXTRA' | 'FLUXO'
  ehObrigacaoAcessoria?: boolean
  disponivelOrcamento?: boolean
  slaHoras?: number | null
  ativo?: boolean
}

interface GrupoItem {
  ordem: number
  servico: ServicoLite
}

interface Grupo {
  id: string
  nome: string
  descricao: string | null
  tipo: GrupoTipo
  cor: string | null
  ordem: number
  ativo: boolean
  itens: GrupoItem[]
  _count?: { itens: number }
}

const PALETA_PADRAO = ['#10b981', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#22c55e', '#06b6d4']

export default function GruposPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // Modal create/edit
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Grupo | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formTipo, setFormTipo] = useState<GrupoTipo>('GERAL')
  const [formCor, setFormCor] = useState(PALETA_PADRAO[0])
  const [formServicoIds, setFormServicoIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Catalogo de servicos pra picker do form
  const [todosServicos, setTodosServicos] = useState<ServicoLite[]>([])
  const [pickerSearch, setPickerSearch] = useState('')

  // ── Loaders ──
  const fetchGrupos = useCallback(async () => {
    setLoading(true)
    try {
      const result = await (trpc.servico as any).listGrupos.query()
      setGrupos((result as Grupo[]) || [])
    } catch (e) {
      console.warn('[grupos] erro:', (e as Error).message)
      setGrupos([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchTodosServicos = useCallback(async () => {
    try {
      const result = await (trpc.servico as any).listServicos.query()
      setTodosServicos(result || [])
    } catch { setTodosServicos([]) }
  }, [])

  useEffect(() => { fetchGrupos(); fetchTodosServicos() }, [fetchGrupos, fetchTodosServicos])

  // ── Actions ──
  function openCreate() {
    setEditing(null)
    setFormNome('')
    setFormDescricao('')
    setFormTipo('GERAL')
    setFormCor(PALETA_PADRAO[Math.floor(Math.random() * PALETA_PADRAO.length)])
    setFormServicoIds([])
    setPickerSearch('')
    setModalOpen(true)
  }

  function openEdit(g: Grupo) {
    setEditing(g)
    setFormNome(g.nome)
    setFormDescricao(g.descricao || '')
    setFormTipo(g.tipo)
    setFormCor(g.cor || PALETA_PADRAO[0])
    setFormServicoIds(g.itens.map(i => i.servico.id))
    setPickerSearch('')
    setModalOpen(true)
  }

  // Um serviço só pode entrar num grupo se casar com o tipo do grupo.
  function servicoCasaTipo(s: ServicoLite, tipo: GrupoTipo): boolean {
    if (tipo === 'OBRIGACOES') return s.ehObrigacaoAcessoria === true
    if (tipo === 'ORCAMENTO') return s.disponivelOrcamento === true
    return true // GERAL
  }

  // Ao trocar o tipo, remove da seleção os serviços que não casam mais.
  function trocarTipo(t: GrupoTipo) {
    setFormTipo(t)
    setFormServicoIds(prev => prev.filter(sid => {
      const s = todosServicos.find(x => x.id === sid)
      return !s || servicoCasaTipo(s, t)
    }))
  }

  async function handleSave() {
    if (!formNome.trim()) {
      alerts.error('Validação', 'Informe o nome do grupo.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await (trpc.servico as any).updateGrupo.mutate({
          id: editing.id,
          nome: formNome.trim(),
          descricao: formDescricao.trim() || null,
          tipo: formTipo,
          cor: formCor,
        })
        await (trpc.servico as any).setGrupoServicos.mutate({
          grupoId: editing.id,
          servicoIds: formServicoIds,
        })
        await alerts.success('Salvo', 'Grupo atualizado.')
      } else {
        await (trpc.servico as any).createGrupo.mutate({
          nome: formNome.trim(),
          descricao: formDescricao.trim() || null,
          tipo: formTipo,
          cor: formCor,
          servicoIds: formServicoIds,
        })
        await alerts.success('Criado', 'Grupo criado com sucesso.')
      }
      setModalOpen(false)
      void fetchGrupos()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(g: Grupo) {
    const ok = await alerts.confirm({
      title: `Remover grupo "${g.nome}"`,
      text: 'Os serviços continuam intactos — só perdem o vínculo com o grupo.',
      confirmText: 'Remover',
    })
    if (!ok) return
    try {
      await (trpc.servico as any).deleteGrupo.mutate({ id: g.id })
      await alerts.success('Removido', 'Grupo desativado.')
      void fetchGrupos()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  function toggleServico(sid: string) {
    setFormServicoIds(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid])
  }

  function handleReorderServicos(ev: DragEndEvent) {
    const { active, over } = ev
    if (!over || active.id === over.id) return
    setFormServicoIds(prev => {
      const oldI = prev.indexOf(active.id as string)
      const newI = prev.indexOf(over.id as string)
      if (oldI === -1 || newI === -1) return prev
      return arrayMove(prev, oldI, newI)
    })
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const filtered = grupos.filter(g =>
    !search || g.nome.toLowerCase().includes(search.toLowerCase()) ||
    g.itens.some(i => i.servico.nome.toLowerCase().includes(search.toLowerCase())),
  )

  // KPIs
  const totalGrupos = grupos.length
  const totalVinculos = grupos.reduce((s, g) => s + g.itens.length, 0)
  const grupoMaior = grupos.reduce((max, g) => g.itens.length > (max?.itens.length ?? 0) ? g : max, null as Grupo | null)
  const gruposVazios = grupos.filter(g => g.itens.length === 0).length

  // Catálogo no picker, filtrado por busca
  const servicosCatalogoFiltrado = todosServicos
    .filter(s => servicoCasaTipo(s, formTipo))
    .filter(s => !pickerSearch || s.nome.toLowerCase().includes(pickerSearch.toLowerCase()))

  // Versão "ordenada" da lista de serviços no grupo (preserva a ordem do form)
  const servicosNoGrupo = formServicoIds
    .map(sid => todosServicos.find(s => s.id === sid))
    .filter((s): s is ServicoLite => !!s)

  return (
    <div className="space-y-6">
      {/* Header — padrão do módulo Cadastros (ícone + gradiente + título + descrição + ações à direita) */}
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button variant="success" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />Novo Grupo
          </Button>
          <BackButton href="/servicos" />
      </>}>
        <h1 className="truncate">Grupos de Serviço</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Cadastros</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Serviços e Obrigações</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Grupos de Serviço</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p className="text-sm text-muted-foreground">
              Agrupe serviços por operação — facilita iniciar tudo de uma vez para um cliente
            </p>
        </div>
      </PageHeaderBar>

      {/* KPIs compactos */}
      <Card className="p-0 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total de grupos</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{totalGrupos}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Vínculos ativos</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">{totalVinculos}</p>
            <p className="text-[10px] text-muted-foreground">serviço × grupo</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Maior grupo</p>
            <p className="text-sm font-semibold mt-0.5 truncate">
              {grupoMaior ? grupoMaior.nome : <span className="text-muted-foreground font-normal italic">—</span>}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              {grupoMaior ? `${grupoMaior.itens.length} serviço${grupoMaior.itens.length === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Grupos vazios</p>
            <p className="text-2xl font-semibold tabular-nums mt-0.5">
              {gruposVazios > 0 ? <span className={TEXT.amber}>{gruposVazios}</span> : gruposVazios}
            </p>
            <p className="text-[10px] text-muted-foreground">sem serviços</p>
          </div>
        </div>
      </Card>

      {/* Listagem — toolbar + tabela */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-border/60">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nome do grupo ou serviço incluído"
              className="h-9 text-sm pl-9 bg-card"
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {filtered.length} grupo{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="whitespace-nowrap">Nome</TableHead>
              <TableHead className="hidden lg:table-cell whitespace-nowrap">Descrição</TableHead>
              <TableHead className="w-[100px] text-center whitespace-nowrap">Serviços</TableHead>
              <TableHead className="hidden xl:table-cell whitespace-nowrap">Conteúdo</TableHead>
              <TableHead className="w-[50px] text-right whitespace-nowrap">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Carregando...
                </div>
              </TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                <Layers className="h-8 w-8 mx-auto mb-2 opacity-30" />
                {search ? 'Nenhum grupo encontrado pra essa busca.' : 'Nenhum grupo cadastrado ainda.'}
              </TableCell></TableRow>
            ) : filtered.map(g => (
              <TableRow
                key={g.id}
                className="cursor-pointer hover:bg-muted/40 group"
                onClick={() => openEdit(g)}
              >
                <TableCell>
                  <span
                    className="inline-block w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background"
                    style={{ backgroundColor: g.cor || '#94a3b8', boxShadow: `0 0 0 1px ${g.cor || '#94a3b8'}33` }}
                  />
                </TableCell>
                <TableCell className="text-sm font-medium whitespace-nowrap">
                  {g.nome}
                  {g.tipo !== 'GERAL' && (
                    <Badge variant="outline" className="ml-1.5 text-[9px] h-4 px-1 align-middle">{GRUPO_TIPO_LABELS[g.tipo]}</Badge>
                  )}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[280px] truncate">
                  {g.descricao || <span className="italic">—</span>}
                </TableCell>
                <TableCell className="text-center whitespace-nowrap">
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {g._count?.itens ?? g.itens.length}
                  </Badge>
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  <div className="flex flex-wrap gap-1 max-w-[420px]">
                    {g.itens.slice(0, 4).map(item => (
                      <Badge key={item.servico.id} variant="outline" className="text-[10px] h-5 px-1.5">
                        {item.servico.nome}
                      </Badge>
                    ))}
                    {g.itens.length > 4 && (
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-muted-foreground">
                        +{g.itens.length - 4}
                      </Badge>
                    )}
                    {g.itens.length === 0 && (
                      <span className="text-[10px] text-muted-foreground italic">vazio</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity h-7 w-7 inline-flex items-center justify-center rounded hover:bg-muted">
                        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(g)}>
                        <Edit className="h-3.5 w-3.5 mr-2" />Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(g)}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* ── Modal Create/Edit ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeaderIcon
            icon={editing ? Pencil : Plus}
            color={editing ? 'sky' : 'emerald'}
            className="px-6 pt-5 pb-3 shrink-0 border-b border-border/40"
          >
            <DialogTitle>{editing ? 'Editar Grupo' : 'Novo Grupo'}</DialogTitle>
            <DialogDescription>
              Configure o nome, cor e os serviços que pertencem a este grupo.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="px-6 pt-4 pb-2 flex-1 min-h-0 overflow-hidden flex flex-col gap-4">
            {/* Linha 1: Nome + Cor */}
            <div className="grid grid-cols-12 gap-3 shrink-0">
              <div className="col-span-12 md:col-span-8 space-y-1.5">
                <Label className="text-[13px] font-semibold">Nome *</Label>
                <Input
                  value={formNome}
                  onChange={e => setFormNome(e.target.value)}
                  placeholder="Ex: Constituição de Cliente Mensal"
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <div className="col-span-12 md:col-span-4 space-y-1.5">
                <Label className="text-[13px] font-semibold">Cor</Label>
                <div className="flex items-center gap-2 h-9">
                  {PALETA_PADRAO.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormCor(c)}
                      className={cn(
                        'h-6 w-6 rounded-full border-2 transition-all',
                        formCor === c ? 'border-foreground scale-110' : 'border-transparent hover:scale-105',
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {/* Tipo de grupo — restringe quais serviços entram e onde o grupo é usado */}
            <div className="space-y-1.5 shrink-0">
              <Label className="text-[13px] font-semibold">Tipo de grupo</Label>
              <Select value={formTipo} onValueChange={v => trocarTipo(v as GrupoTipo)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GRUPO_TIPO.map(t => <SelectItem key={t} value={t}>{GRUPO_TIPO_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{GRUPO_TIPO_HINTS[formTipo]}</p>
            </div>
            {/* Descrição */}
            <div className="space-y-1.5 shrink-0">
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <Textarea
                value={formDescricao}
                onChange={e => setFormDescricao(e.target.value)}
                placeholder="Pra que serve este grupo? Quando deve ser iniciado?"
                rows={2}
                className="resize-none"
              />
            </div>
            {/* Serviços do grupo + catálogo lado a lado */}
            <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
              {/* Esquerda: serviços JÁ no grupo, drag-and-drop pra ordenar */}
              <div className="col-span-12 md:col-span-6 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[13px] font-semibold">
                    Serviços do grupo
                    <Badge variant="secondary" className="text-[10px] ml-1.5">{servicosNoGrupo.length}</Badge>
                  </Label>
                  <p className="text-[10px] text-muted-foreground">arraste pra ordenar</p>
                </div>
                <div className="flex-1 overflow-y-auto rounded-lg border bg-muted/10 p-2 min-h-0">
                  {servicosNoGrupo.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic text-center py-6">
                      Nenhum serviço selecionado. Use o catálogo à direita pra adicionar.
                    </p>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorderServicos}>
                      <SortableContext items={servicosNoGrupo.map(s => s.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1.5">
                          {servicosNoGrupo.map((s, idx) => (
                            <SortableGrupoItem key={s.id} servico={s} ordem={idx + 1} onRemove={() => toggleServico(s.id)} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              </div>
              {/* Direita: catálogo completo, clique pra adicionar */}
              <div className="col-span-12 md:col-span-6 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-[13px] font-semibold">Catálogo de serviços</Label>
                </div>
                <div className="relative shrink-0 mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    placeholder="Buscar serviço"
                    className="h-9 text-sm pl-9"
                  />
                </div>
                <div className="flex-1 overflow-y-auto rounded-lg border bg-card p-1 min-h-0">
                  {servicosCatalogoFiltrado.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic text-center py-6">Nenhum serviço encontrado.</p>
                  ) : (
                    <div className="space-y-0.5">
                      {servicosCatalogoFiltrado.map(s => {
                        const selected = formServicoIds.includes(s.id)
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleServico(s.id)}
                            className={cn(
                              'w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors',
                              selected
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                                : 'hover:bg-muted/40',
                            )}
                          >
                            <span className="truncate flex-1">{s.nome}</span>
                            {s.area?.name && <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">{s.area.name}</Badge>}
                            {selected && (
                              <span className="text-[10px] font-medium shrink-0">✓ no grupo</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter className="px-6 py-3 shrink-0 border-t border-border/40">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5" style={{ backgroundColor: MODULE_COLOR }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Sortable item ──
function SortableGrupoItem({ servico, ordem, onRemove }: { servico: ServicoLite; ordem: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: servico.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : undefined,
    zIndex: isDragging ? 10 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 rounded bg-card border text-xs hover:bg-muted/30 transition-colors"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0"
        title="Arrastar"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-[10px] font-bold text-muted-foreground tabular-nums w-5 shrink-0">{ordem}.</span>
      <span className="flex-1 truncate">{servico.nome}</span>
      {servico.area?.name && <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">{servico.area.name}</Badge>}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        title="Remover do grupo"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
