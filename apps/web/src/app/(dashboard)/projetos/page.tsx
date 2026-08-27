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
import { ProjetosKanban, type KanbanProjeto } from './_components/projetos-kanban'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { PROJETO_STATUS_LABELS, type ProjetoStatus } from '@saas/types'

// Cor do bloco TI (fallback bate com FALLBACK_HEX do PageHeaderIcon e DEFAULT_MODULE_COLORS)
const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

type ProjetoStatusFilter = ProjetoStatus | 'TODOS'

// O Select do Radix não aceita item com value vazio — este é o marcador de
// "nenhum", traduzido para null antes de ir ao backend.
const SEM_VINCULO = '__nenhum__'

interface ProjetoRow {
  id: string
  nome: string
  descricao: string | null
  cor: string
  status: ProjetoStatus
  dataPrevisao: Date | string | null
  responsavelId: string | null
  clienteId?: string | null
  participantes?: Array<{ id: string; name: string; image: string | null }>
  cliente?: { id: string; razaoSocial: string; nomeFantasia: string | null } | null
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
  const [formResponsavelId, setFormResponsavelId] = useState<string>('')
  const [formParticipantes, setFormParticipantes] = useState<string[]>([])
  const [formClienteId, setFormClienteId] = useState<string>('')
  // Listas dos campos de vínculo. Carregam uma vez, ao abrir o modal pela
  // primeira vez — são poucas dezenas de linhas e não mudam durante a edição.
  const [pessoas, setPessoas] = useState<Array<{ id: string; name: string; image: string | null }>>([])
  const [clientesMensais, setClientesMensais] = useState<Array<{ id: string; razaoSocial: string; nomeFantasia: string | null }>>([])
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

  // Carrega as opções de vínculo na primeira abertura do modal.
  useEffect(() => {
    if (!modalOpen || pessoas.length > 0) return
    void (async () => {
      try {
        const [ps, cs] = await Promise.all([
          (trpc.projetos as never as { listPessoas: { query: () => Promise<typeof pessoas> } }).listPessoas.query(),
          (trpc.projetos as never as { listClientesVinculaveis: { query: () => Promise<typeof clientesMensais> } }).listClientesVinculaveis.query(),
        ])
        setPessoas(ps)
        setClientesMensais(cs)
      } catch { /* sem as listas o resto do formulário continua utilizável */ }
    })()
  }, [modalOpen, pessoas.length])

  function openCreate() {
    setEditingId(null)
    setFormNome('')
    setFormDescricao('')
    setFormCor('#22d3ee')
    setFormStatus('NOVO')
    setFormDataPrevisao('')
    setFormResponsavelId('')
    setFormParticipantes([])
    setFormClienteId('')
    setModalOpen(true)
  }

  function openEdit(p: ProjetoRow) {
    setEditingId(p.id)
    setFormNome(p.nome)
    setFormDescricao(p.descricao ?? '')
    setFormCor(p.cor)
    setFormStatus(p.status)
    setFormDataPrevisao(p.dataPrevisao ? new Date(p.dataPrevisao).toISOString().slice(0, 10) : '')
    setFormResponsavelId(p.responsavelId ?? '')
    setFormParticipantes((p.participantes ?? []).map(u => u.id))
    setFormClienteId(p.clienteId ?? '')
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
        responsavelId: formResponsavelId || null,
        participantesIds: formParticipantes,
        clienteId: formClienteId || null,
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
    // No kanban a página ganha altura fixa e as colunas rolam por dentro, como
    // no /orcamentos — senão o trilho cresce e a rolagem vira a da página
    // inteira, levando o cabeçalho junto. Na lista, a rolagem normal serve.
    <div className={cn(viewMode === 'kanban' ? 'flex flex-col gap-4 h-[calc(100vh-98px)]' : 'space-y-4')}>
      {/* Topo — PADRAO_PAGINAS §1.1: secundárias, depois a primária. */}
      <PageHeaderBar className={cn(viewMode === 'kanban' && 'mb-0 shrink-0 sm:mb-0')} actions={<>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => router.push('/projetos/configuracoes')}
          title="Configurações do módulo"
        >
          <Settings className="h-4 w-4" />
        </Button>
        {canWrite && (
          <Button variant="success" size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Novo projeto
          </Button>
        )}
      </>}>
        <h1 className="truncate">Projetos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>TI</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Projetos</span>
        </p>
      </PageHeaderBar>

      {/* Filtros + toggle de visualização */}
      <div className="flex shrink-0 items-center gap-3">
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
        <div className="relative flex min-h-0 flex-1 flex-col">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="responsavel" className="text-[13px] font-semibold">Responsável</Label>
                <Select value={formResponsavelId || SEM_VINCULO} onValueChange={(v) => setFormResponsavelId(v === SEM_VINCULO ? '' : v)}>
                  <SelectTrigger id="responsavel" className="h-9 text-sm">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VINCULO}>Sem responsável</SelectItem>
                    {pessoas.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cliente" className="text-[13px] font-semibold">Cliente</Label>
                <Select value={formClienteId || SEM_VINCULO} onValueChange={(v) => setFormClienteId(v === SEM_VINCULO ? '' : v)}>
                  <SelectTrigger id="cliente" className="h-9 text-sm">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_VINCULO}>Projeto interno (sem cliente)</SelectItem>
                    {clientesMensais.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Só clientes mensais e ativos aparecem aqui.</p>
              </div>
            </div>

            {/* Participantes — o time em volta do responsável. Lista de marcar,
                e não um select: escolher cinco nomes num select é sofrimento. */}
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">
                Outras pessoas envolvidas
                {formParticipantes.length > 0 && (
                  <span className="ml-1.5 font-normal text-muted-foreground">({formParticipantes.length})</span>
                )}
              </Label>
              <div className="nice-scrollbar max-h-[160px] space-y-0.5 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                {pessoas.filter((u) => u.id !== formResponsavelId).length === 0 && (
                  <p className="py-2 text-center text-xs text-muted-foreground">Nenhuma pessoa disponível.</p>
                )}
                {pessoas.filter((u) => u.id !== formResponsavelId).map((u) => {
                  const marcado = formParticipantes.includes(u.id)
                  return (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm transition-colors hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => setFormParticipantes((atual) =>
                          marcado ? atual.filter((id) => id !== u.id) : [...atual, u.id],
                        )}
                        className="h-3.5 w-3.5 accent-current"
                      />
                      <span className="truncate">{u.name}</span>
                    </label>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                O responsável não entra nesta lista — ele já aparece à parte no card.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="success" onClick={handleSubmit} disabled={saving} className="gap-1.5">
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
