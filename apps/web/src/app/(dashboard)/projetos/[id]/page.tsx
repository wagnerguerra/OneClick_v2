'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  Plus, MoreVertical, Pencil, Trash2, Loader2,
  ListChecks, Flag, Search, LayoutGrid, List,
  Info, MessageSquare, Kanban,
  FolderKanban, Building2, Calendar, User as UserIcon, Users, PackageCheck,
} from 'lucide-react'
import { cn } from '@saas/ui'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { fmtDateBR } from '@/lib/date'
import { BackButton } from '@/components/ui/back-button'
import { ProjetoKanban, type KanbanTarefa } from './_components/projeto-kanban'
import { TarefaDetalheModal } from './_components/tarefa-detalhe-modal'
import { ProjetoTabDetalhes } from './_components/projeto-tab-detalhes'
import { ProjetoTabMensagens } from './_components/projeto-tab-mensagens'
import { ProjetoTabEnvolvidos } from './_components/projeto-tab-envolvidos'
import { ProjetoTabRodadas } from './_components/projeto-tab-rodadas'
import { ProjetoSidebar } from './_components/projeto-sidebar'
import {
  Button, Input, Card, Badge,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Tabs, TabsContent,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import {
  PROJETO_STATUS_LABELS,
  TAREFA_STATUS_LABELS,
  TAREFA_PRIORIDADE_LABELS,
  type TarefaStatus,
  type TarefaPrioridade,
  type ProjetoStatus,
} from '@saas/types'

const STATUS_COLOR: Record<TarefaStatus, string> = {
  BACKLOG: '#94a3b8',
  A_FAZER: '#6b7280',
  EM_ANDAMENTO: '#3b82f6',
  EM_REVISAO: '#a855f7',
  CONCLUIDO: '#16a34a',
  CANCELADO: '#dc2626',
}

const PRIORIDADE_COLOR: Record<TarefaPrioridade, string> = {
  URGENTE: '#dc2626',
  ALTA: '#f97316',
  MEDIA: '#3b82f6',
  BAIXA: '#6b7280',
}

interface ProjetoDetail {
  id: string
  nome: string
  descricao: string | null
  cor: string
  status: ProjetoStatus
  dataInicio: Date | string | null
  dataPrevisao: Date | string | null
  responsavelId: string | null
  responsavel: { id: string; name: string; image: string | null } | null
  participantes?: Array<{ id: string; name: string; image: string | null; papel?: string }>
  clientes?: Array<{ id: string; razaoSocial: string; nomeFantasia: string | null }>
  createdAt?: Date | string
  _count: { tarefas: number; mensagens?: number; anexos?: number }
}

interface TarefaRow {
  id: string
  titulo: string
  descricao: string | null
  status: TarefaStatus
  prioridade: TarefaPrioridade
  responsavelId: string | null
  prazo: Date | string | null
  estimativa: number | null
  _count: { anexos: number; eventos: number; children: number }
}

type TabKey = 'detalhes' | 'mensagens' | 'tarefas' | 'rodadas' | 'envolvidos'

export default function ProjetoDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const projetoId = params.id
  const { isMaster, permissions } = useUserPermissions()
  const projetosPerm = permissions.find((p) => p.moduleSlug === 'projetos')
  const canWrite = isMaster || projetosPerm?.canWrite === true
  const canDelete = isMaster || projetosPerm?.canDelete === true

  const [projeto, setProjeto] = useState<ProjetoDetail | null>(null)
  const [tarefas, setTarefas] = useState<TarefaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TarefaStatus | 'TODOS'>('TODOS')
  const [activeTab, setActiveTab] = useState<TabKey>('detalhes')
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('projetos-view-mode') as 'lista' | 'kanban') || 'lista'
    }
    return 'lista'
  })

  // Modal tarefa
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchProjeto = useCallback(async () => {
    try {
      const p = await trpc.projetos.getById.query({ id: projetoId })
      setProjeto(p as unknown as ProjetoDetail)
    } catch (e) {
      alerts.error('Erro ao carregar projeto: ' + (e as Error).message)
      router.push('/projetos')
    }
  }, [projetoId, router])

  const fetchTarefas = useCallback(async () => {
    setLoading(true)
    try {
      if (viewMode === 'kanban') {
        const items = await trpc.projetos.listTarefasKanban.query({ projetoId })
        setTarefas(items as unknown as TarefaRow[])
      } else {
        const input: Record<string, unknown> = { projetoId, page: 1, limit: 100 }
        if (debouncedSearch) input.search = debouncedSearch
        if (statusFilter !== 'TODOS') input.status = statusFilter
        const res = await trpc.projetos.listTarefas.query(input as never)
        setTarefas(res.items as unknown as TarefaRow[])
      }
    } catch (e) {
      alerts.error('Erro ao carregar tarefas: ' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [projetoId, debouncedSearch, statusFilter, viewMode])

  useEffect(() => { fetchProjeto() }, [fetchProjeto])
  useEffect(() => { if (activeTab === 'tarefas') fetchTarefas() }, [fetchTarefas, activeTab])

  function openCreateTarefa() { setEditingId(null); setModalOpen(true) }
  function openEditTarefa(t: TarefaRow) { setEditingId(t.id); setModalOpen(true) }
  function onModalSaved() { fetchTarefas(); fetchProjeto() }

  async function handleDelete(id: string) {
    const ok = await alerts.confirmDelete()
    if (!ok) return
    try {
      await trpc.projetos.deleteTarefa.mutate({ id })
      alerts.success('Tarefa excluída')
      fetchTarefas()
      fetchProjeto()
    } catch (e) {
      alerts.error('Erro: ' + (e as Error).message)
    }
  }

  const tarefasByStatus = useMemo(() => {
    const counts: Record<TarefaStatus, number> = {
      BACKLOG: 0, A_FAZER: 0, EM_ANDAMENTO: 0, EM_REVISAO: 0, CONCLUIDO: 0, CANCELADO: 0,
    }
    for (const t of tarefas) counts[t.status]++
    return counts
  }, [tarefas])

  if (!projeto) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Carregando projeto...
      </div>
    )
  }

  const projetoCor = projeto.cor || '#22d3ee'

  return (
    <div className="space-y-0 pb-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="space-y-0">
        {/* Topo — PADRAO_PAGINAS §1.1 */}
        <PageHeaderBar actions={<>
            {activeTab === 'tarefas' && canWrite && (
              <Button variant="success" size="sm" onClick={openCreateTarefa} className="gap-1.5">
                <Plus className="h-4 w-4" /> Nova tarefa
              </Button>
            )}
            <BackButton href="/projetos" label="Voltar" />
        </>}>
          <h1 className="truncate">{projeto.nome}</h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
            <span className="text-muted-foreground/50">›</span>
            <span>TI</span>
            <span className="text-muted-foreground/50">›</span>
            <Link href="/projetos" className="transition-colors hover:text-foreground">Projetos</Link>
            <span className="text-muted-foreground/50">›</span>
            <span className="truncate">{projeto.nome}</span>
          </p>
        </PageHeaderBar>

        {/* ═══════════ Hero — PADRAO_PAGINAS §3.2, modelo /clientes/[id] ═══════════
            Capa em gradiente da cor DO PROJETO (e não do módulo: aqui a cor é
            do registro, escolhida no formulário), ícone em quadro claro, nome
            com chips de vidro, meta em linha e os números à direita. */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative overflow-hidden">
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${projetoCor} 0%, var(--color-primary) 100%)` }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/25" />

            <div className="relative z-10 px-5 pb-5 pt-24 text-white sm:px-6 sm:pt-28">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex items-end gap-4">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card shadow-lg ring-4 ring-white/50">
                    <FolderKanban className="h-10 w-10" style={{ color: projetoCor }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-bold tracking-tight text-white drop-shadow">{projeto.nome}</p>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                        {PROJETO_STATUS_LABELS[projeto.status]}
                      </span>
                      {(projeto.clientes ?? []).slice(0, 2).map(c => (
                        <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase text-white ring-1 ring-white/25 backdrop-blur">
                          <Building2 className="h-3 w-3" />
                          {c.nomeFantasia || c.razaoSocial}
                        </span>
                      ))}
                      {(projeto.clientes?.length ?? 0) > 2 && (
                        <span
                          className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/25 backdrop-blur"
                          title={(projeto.clientes ?? []).map(c => c.nomeFantasia || c.razaoSocial).join(', ')}
                        >
                          +{(projeto.clientes?.length ?? 0) - 2}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/85">
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="h-3.5 w-3.5" />
                        {projeto.responsavel?.name ?? 'Sem responsável'}
                        {(projeto.participantes?.length ?? 0) > 0 && (
                          <span className="ml-0.5 opacity-80" title={`Também no projeto: ${(projeto.participantes ?? []).map(u => u.name).join(', ')}`}>
                            +{projeto.participantes?.length}
                          </span>
                        )}
                      </span>
                      {projeto.dataPrevisao && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Previsão {fmtDateBR(projeto.dataPrevisao)}
                        </span>
                      )}
                      {projeto.createdAt && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          Criado em {fmtDateBR(projeto.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="text-center">
                    <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{projeto._count.tarefas}</p>
                    <p className="text-xs text-white/75">{projeto._count.tarefas === 1 ? 'Tarefa' : 'Tarefas'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tracking-tight text-white drop-shadow tabular-nums">{projeto._count.mensagens ?? 0}</p>
                    <p className="text-xs text-white/75">Mensagens</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tira de abas na base do hero — botões simples, como no /clientes/[id] */}
          <div className="border-t border-border px-3">
            <div className="nice-scrollbar flex gap-1.5 overflow-x-auto py-2">
              <button type="button" onClick={() => setActiveTab('detalhes')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'detalhes' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Info className="h-4 w-4" /> Detalhes
              </button>
              <button type="button" onClick={() => setActiveTab('mensagens')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'mensagens' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <MessageSquare className="h-4 w-4" /> Mensagens
                {(projeto._count.mensagens ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{projeto._count.mensagens}</Badge>
                )}
              </button>
              <button type="button" onClick={() => setActiveTab('tarefas')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'tarefas' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Kanban className="h-4 w-4" /> Tarefas
                {projeto._count.tarefas > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{projeto._count.tarefas}</Badge>
                )}
              </button>
              <button type="button" onClick={() => setActiveTab('rodadas')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'rodadas' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <PackageCheck className="h-4 w-4" /> Rodadas
              </button>
              <button type="button" onClick={() => setActiveTab('envolvidos')} className={cn('inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors', activeTab === 'envolvidos' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <Users className="h-4 w-4" /> Envolvidos
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                  {(projeto.participantes?.length ?? 0) + (projeto.responsavel ? 1 : 0) + (projeto.clientes?.length ?? 0)}
                </Badge>
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════ Conteúdo das abas ══════════════════════ */}
        <div className="pt-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
            <div className="min-w-0">
              <TabsContent value="rodadas" className="mt-0">
                <ProjetoTabRodadas
                  projetoId={projeto.id}
                  canWrite={canWrite}
                  canDelete={canDelete}
                  corProjeto={projetoCor}
                />
              </TabsContent>

              <TabsContent value="envolvidos" className="mt-0">
                <ProjetoTabEnvolvidos
                  responsavel={projeto.responsavel}
                  participantes={projeto.participantes ?? []}
                  clientes={projeto.clientes ?? []}
                  corProjeto={projetoCor}
                />
              </TabsContent>

              <TabsContent value="detalhes" className="mt-0">
                <ProjetoTabDetalhes
                  projeto={projeto}
                  canWrite={canWrite}
                  onSaved={fetchProjeto}
                />
              </TabsContent>

              <TabsContent value="mensagens" className="mt-0">
                <ProjetoTabMensagens
                  projetoId={projetoId}
                  projetoCor={projetoCor}
                  canWrite={canWrite}
                />
              </TabsContent>

              <TabsContent value="tarefas" className="mt-0 space-y-4">
                {/* Filtros + toggle */}
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                    <Input
                      placeholder="Buscar tarefa..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-9 pl-9 text-sm"
                    />
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {tarefas.length} {tarefas.length === 1 ? 'tarefa' : 'tarefas'}
                  </span>

                  <div className="flex items-center border border-border rounded-md overflow-hidden ml-2">
                    <button
                      type="button" title="Lista"
                      onClick={() => { setViewMode('lista'); localStorage.setItem('projetos-view-mode', 'lista') }}
                      className={cn('p-1.5 transition-colors', viewMode === 'lista' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button
                      type="button" title="Kanban"
                      onClick={() => { setViewMode('kanban'); localStorage.setItem('projetos-view-mode', 'kanban') }}
                      className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')}
                    >
                      <LayoutGrid className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Pills de status pra filtrar */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {(['BACKLOG', 'A_FAZER', 'EM_ANDAMENTO', 'EM_REVISAO', 'CONCLUIDO'] as TarefaStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(statusFilter === s ? 'TODOS' : s)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-colors ${
                        statusFilter === s ? 'border-foreground/30 bg-muted' : 'border-border bg-background hover:bg-muted/60'
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                      <span className="font-medium text-foreground">{tarefasByStatus[s]}</span>
                      <span className="text-muted-foreground">{TAREFA_STATUS_LABELS[s]}</span>
                    </button>
                  ))}
                </div>

                {viewMode === 'kanban' ? (
                  <div className="relative">
                    {loading && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-[2px]">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {tarefas.length === 0 && !loading ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
                        <ListChecks className="h-12 w-12 mb-3 opacity-30" />
                        Nenhuma tarefa
                        <Button variant="outline" size="sm" onClick={openCreateTarefa} className="mt-4">
                          <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar primeira tarefa
                        </Button>
                      </div>
                    ) : (
                      <ProjetoKanban
                        projetoId={projetoId}
                        projetoCor={projetoCor}
                        tarefas={tarefas as unknown as KanbanTarefa[]}
                        onChange={fetchTarefas}
                        onOpenTarefa={(t) => openEditTarefa(t as unknown as TarefaRow)}
                        onDeleteTarefa={handleDelete}
                      />
                    )}
                  </div>
                ) : (
                  <Card className="overflow-hidden">
                    {loading ? (
                      <div className="flex items-center justify-center py-20 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Carregando...
                      </div>
                    ) : tarefas.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-sm">
                        <ListChecks className="h-12 w-12 mb-3 opacity-30" />
                        Nenhuma tarefa
                        {canWrite && (
                          <Button variant="outline" size="sm" onClick={openCreateTarefa} className="mt-4">
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar primeira tarefa
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40%]">Tarefa</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="hidden lg:table-cell">Prioridade</TableHead>
                            <TableHead className="hidden md:table-cell">Prazo</TableHead>
                            <TableHead className="hidden xl:table-cell text-right">Est.</TableHead>
                            <TableHead className="w-[60px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tarefas.map((t) => (
                            <TableRow
                              key={t.id}
                              className={canWrite ? 'cursor-pointer hover:bg-muted/40' : 'hover:bg-muted/40'}
                              onClick={() => { if (canWrite) openEditTarefa(t) }}
                            >
                              <TableCell>
                                <div className="font-medium text-[13px] text-foreground">{t.titulo}</div>
                                {t.descricao && (
                                  <div className="text-[11px] text-muted-foreground line-clamp-1">{t.descricao}</div>
                                )}
                              </TableCell>
                              <TableCell>
                                <span
                                  className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
                                  style={{
                                    background: `color-mix(in srgb, ${STATUS_COLOR[t.status]} 18%, transparent)`,
                                    color: STATUS_COLOR[t.status],
                                  }}
                                >
                                  {TAREFA_STATUS_LABELS[t.status]}
                                </span>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <span className="flex items-center gap-1 text-[12px]" style={{ color: PRIORIDADE_COLOR[t.prioridade] }}>
                                  <Flag className="h-3 w-3" />
                                  {TAREFA_PRIORIDADE_LABELS[t.prioridade]}
                                </span>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-[12px] text-muted-foreground">
                                {t.prazo ? new Date(t.prazo).toLocaleDateString('pt-BR') : '—'}
                              </TableCell>
                              <TableCell className="hidden xl:table-cell text-right text-[12px] text-muted-foreground">
                                {t.estimativa ?? '—'}
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <button className="p-1 rounded hover:bg-muted text-muted-foreground">
                                      <MoreVertical className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                                    {canWrite && (
                                      <DropdownMenuItem onClick={() => openEditTarefa(t)}>
                                        <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                                      </DropdownMenuItem>
                                    )}
                                    {canDelete && (
                                      <DropdownMenuItem onClick={() => handleDelete(t.id)} className="text-destructive focus:text-destructive">
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
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </Card>
                )}
              </TabsContent>
            </div>

            {/* Sidebar — visível em todas as abas */}
            <ProjetoSidebar projetoId={projetoId} canWrite={canWrite} />
          </div>
        </div>
      </Tabs>

      {/* Modal de tarefa */}
      <TarefaDetalheModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        projetoId={projetoId}
        projetoCor={projetoCor}
        tarefaId={editingId}
        onSaved={onModalSaved}
      />
    </div>
  )
}
