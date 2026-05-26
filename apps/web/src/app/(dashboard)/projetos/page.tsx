'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, FolderKanban, MoreVertical, Pencil, Trash2, ListChecks, Loader2,
  LayoutGrid, List, Settings,
} from 'lucide-react'
import {
  Button, Input, Label, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { ProjetosKanban, type KanbanProjeto } from './_components/projetos-kanban'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { PROJETO_STATUS_LABELS, type ProjetoStatus } from '@saas/types'

// Cor do bloco TI (fallback bate com FALLBACK_HEX do PageHeaderIcon e DEFAULT_MODULE_COLORS)
const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

type ProjetoStatusFilter = ProjetoStatus | 'TODOS'

interface ProjetoRow {
  id: string
  nome: string
  descricao: string | null
  cor: string
  status: ProjetoStatus
  dataPrevisao: Date | string | null
  responsavelId: string | null
  _count: { tarefas: number }
  createdAt: Date | string
}

export default function ProjetosPage() {
  const router = useRouter()
  const { isMaster, permissions } = useUserPermissions()
  const projetosPerm = permissions.find((p) => p.moduleSlug === 'projetos')
  const canWrite = isMaster || projetosPerm?.canWrite === true
  const canDelete = isMaster || projetosPerm?.canDelete === true
  const [items, setItems] = useState<ProjetoRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<ProjetoStatusFilter>('TODOS')
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('projetos-list-view-mode') as 'lista' | 'kanban') || 'lista'
    }
    return 'lista'
  })

  // Modal de criar/editar
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formNome, setFormNome] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formCor, setFormCor] = useState('#22d3ee')
  const [formStatus, setFormStatus] = useState<ProjetoStatus>('NOVO')
  const [formDataPrevisao, setFormDataPrevisao] = useState('')
  const [saving, setSaving] = useState(false)

  // Debounce do search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const input: Record<string, unknown> = { page: 1, limit: 100 }
      if (debouncedSearch) input.search = debouncedSearch
      // No modo Kanban, trazemos os 3 status pra montar as colunas; filtro
      // por status só vale no modo Lista.
      if (viewMode === 'lista' && status !== 'TODOS') input.status = status
      const res = await trpc.projetos.list.query(input as never)
      setItems(res.items as unknown as ProjetoRow[])
      setTotal(res.total)
    } catch (e) {
      alerts.error('Erro ao carregar projetos: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, status, viewMode])

  useEffect(() => { fetchData() }, [fetchData])

  function openCreate() {
    setEditingId(null)
    setFormNome('')
    setFormDescricao('')
    setFormCor('#22d3ee')
    setFormStatus('ATIVO')
    setFormDataPrevisao('')
    setModalOpen(true)
  }

  function openEdit(p: ProjetoRow) {
    setEditingId(p.id)
    setFormNome(p.nome)
    setFormDescricao(p.descricao ?? '')
    setFormCor(p.cor)
    setFormStatus(p.status)
    setFormDataPrevisao(p.dataPrevisao ? new Date(p.dataPrevisao).toISOString().slice(0, 10) : '')
    setModalOpen(true)
  }

  async function handleSubmit() {
    if (!formNome.trim()) {
      alerts.error('Informe o nome do projeto')
      return
    }
    setSaving(true)
    try {
      const data = {
        nome: formNome.trim(),
        descricao: formDescricao.trim() || null,
        cor: formCor,
        status: formStatus,
        dataPrevisao: formDataPrevisao || null,
      }
      if (editingId) {
        await trpc.projetos.update.mutate({ id: editingId, data })
        alerts.success('Projeto atualizado')
      } else {
        await trpc.projetos.create.mutate(data)
        alerts.success('Projeto criado')
      }
      setModalOpen(false)
      fetchData()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = await alerts.confirmDelete()
    if (!ok) return
    try {
      await trpc.projetos.delete.mutate({ id })
      alerts.success('Projeto excluído')
      fetchData()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    }
  }

  const statusOptions = useMemo(
    () =>
      [
        { value: 'TODOS' as ProjetoStatusFilter, label: 'Todos' },
        { value: 'NOVO' as ProjetoStatusFilter, label: 'Novos' },
        { value: 'ANDAMENTO' as ProjetoStatusFilter, label: 'Em andamento' },
        { value: 'PENDENTE' as ProjetoStatusFilter, label: 'Pendentes' },
        { value: 'CONCLUIDO' as ProjetoStatusFilter, label: 'Concluídos' },
      ] as const,
    [],
  )

  return (
    <div className="space-y-4">
      {/* Header — padrão da casa: PageHeaderIcon + h1 sem className + descrição text-sm */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="ti" icon={FolderKanban} />
          <div>
            <h1>Projetos</h1>
            <p className="text-sm text-muted-foreground">
              Gestão de projetos de desenvolvimento da TI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <Button size="sm" onClick={openCreate} className="gap-1.5 text-white" style={{ background: MODULE_COLOR }}>
              <Plus className="h-4 w-4" />
              Novo projeto
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/projetos/configuracoes')}
            title="Configurações do módulo"
            className="h-9 w-9"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filtros + toggle de visualização */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <Input
            placeholder="Buscar projeto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
        {/* Filtro de status só faz sentido no modo Lista — no Kanban, as 3 colunas mostram tudo */}
        {viewMode === 'lista' && (
          <Select value={status} onValueChange={(v) => setStatus(v as ProjetoStatusFilter)}>
            <SelectTrigger className="h-9 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-[12px] text-muted-foreground ml-auto">
          {total} {total === 1 ? 'projeto' : 'projetos'}
        </span>

        {/* Toggle Lista/Kanban */}
        <div className="flex items-center border border-border rounded-md overflow-hidden">
          <button
            type="button"
            title="Lista"
            onClick={() => { setViewMode('lista'); localStorage.setItem('projetos-list-view-mode', 'lista') }}
            className={cn(
              'p-1.5 transition-colors',
              viewMode === 'lista' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Kanban"
            onClick={() => { setViewMode('kanban'); localStorage.setItem('projetos-list-view-mode', 'kanban') }}
            className={cn(
              'p-1.5 transition-colors',
              viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Kanban — DndContext sempre montado quando viewMode === 'kanban' (evita removeChild do portal) */}
      {viewMode === 'kanban' ? (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {items.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
              <FolderKanban className="h-12 w-12 mb-3 opacity-30" />
              Nenhum projeto encontrado
            </div>
          ) : (
            <ProjetosKanban
              projetos={items as unknown as KanbanProjeto[]}
              onChange={fetchData}
              canWrite={canWrite}
              canDelete={canDelete}
              onEdit={(p) => openEdit(p as unknown as ProjetoRow)}
            />
          )}
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Carregando...
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
          <FolderKanban className="h-12 w-12 mb-3 opacity-30" />
          Nenhum projeto encontrado
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <Card
              key={p.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow border-l-4"
              style={{ borderLeftColor: p.cor || MODULE_COLOR }}
              onClick={() => router.push(`/projetos/${p.id}`)}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-[14px] font-semibold text-foreground line-clamp-1">{p.nome}</h3>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button className="p-1 rounded hover:bg-muted text-muted-foreground">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {canWrite && (
                      <DropdownMenuItem onClick={() => openEdit(p)}>
                        <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem onClick={() => handleDelete(p.id)} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                      </DropdownMenuItem>
                    )}
                    {!canWrite && !canDelete && (
                      <DropdownMenuItem disabled>
                        <span className="text-[11px]">Sem permissão</span>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {p.descricao && (
                <p className="text-[12px] text-muted-foreground line-clamp-2 mb-3">{p.descricao}</p>
              )}

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ListChecks className="h-3.5 w-3.5" />
                  {p._count.tarefas} {p._count.tarefas === 1 ? 'tarefa' : 'tarefas'}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide"
                  style={{
                    background: `color-mix(in srgb, ${p.cor || MODULE_COLOR} 15%, transparent)`,
                    color: p.cor || MODULE_COLOR,
                  }}
                >
                  {PROJETO_STATUS_LABELS[p.status]}
                </span>
                {p.dataPrevisao && (
                  <span className="ml-auto text-[11px]">
                    até {new Date(p.dataPrevisao).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={editingId ? Pencil : Plus} color={editingId ? 'sky' : 'emerald'}>
            <DialogTitle>{editingId ? 'Editar projeto' : 'Novo projeto'}</DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Atualize os dados do projeto.'
                : 'Crie um novo projeto de desenvolvimento.'}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome" className="text-[13px] font-semibold">Nome *</Label>
              <Input
                id="nome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                className="h-9 text-sm"
                placeholder="Ex: Módulo Fiscal v2"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="descricao" className="text-[13px] font-semibold">Descrição</Label>
              <textarea
                id="descricao"
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
                className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Objetivo do projeto..."
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cor" className="text-[13px] font-semibold">Cor</Label>
                <input
                  id="cor"
                  type="color"
                  value={formCor}
                  onChange={(e) => setFormCor(e.target.value)}
                  className="h-9 w-full rounded-md border border-border cursor-pointer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-[13px] font-semibold">Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as ProjetoStatus)}>
                  <SelectTrigger id="status" className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOVO">Novo</SelectItem>
                    <SelectItem value="ANDAMENTO">Em andamento</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                    <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prev" className="text-[13px] font-semibold">Previsão</Label>
                <Input
                  id="prev"
                  type="date"
                  value={formDataPrevisao}
                  onChange={(e) => setFormDataPrevisao(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={saving} style={{ background: MODULE_COLOR }}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Salvando...
                </>
              ) : editingId ? 'Atualizar' : 'Criar projeto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
