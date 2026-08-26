'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, Loader2, MoreVertical, ListChecks, Check, Power, PowerOff, Users,
  Pencil, Search, X, ListPlus, Filter, List, LayoutGrid,
} from 'lucide-react'
import { CalendarioObrigacoesCliente } from './calendario-obrigacoes-cliente'
import {
  Button, Input, Label, Badge, Card, CardHeader, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { useClientesPerms } from './use-clientes-perms'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

interface ClienteObrigacao {
  id: string
  ativo: boolean
  observacao: string | null
  ajusteVencimentoOverride: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR' | null
  servico: {
    id: string
    nome: string
    categoria: string | null
    recorrencia: {
      frequencia: string
      ancoragem: string
      valorAncoragem: number
      competenciaOffset: number
      ajusteVencimento: string
    } | null
  }
}

// ServicoGrupo(tipo=OBRIGACOES) — a fonte dos grupos aplicáveis ao cliente.
interface Grupo {
  id: string
  nome: string
  descricao: string | null
  cor: string | null
  tipo: string
  ativo: boolean
  itens: Array<{ servico: { id: string; nome: string } }>
}

interface Obrigacao { id: string; nome: string; categoria: string | null }

interface AreaResponsavel {
  areaId: string
  areaNome: string
  contratado: boolean
  responsavelId: string | null
  responsavelNome: string | null
  substitutoId: string | null
  substitutoNome: string | null
}

const CATEGORIA_CORES: Record<string, string> = {
  Fiscal: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Trabalhista: 'bg-lime-50 text-lime-700 border-lime-200',
  'Contábil': 'bg-violet-50 text-violet-700 border-violet-200',
}

/** Cor da pílula de área (área = Categoria). Sempre a cor da categoria/area. */
const AREA_CORES: Record<string, { bg: string; border: string; text: string }> = {
  Fiscal:       { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700' },
  Trabalhista:  { bg: 'bg-lime-50',    border: 'border-lime-200',    text: 'text-lime-700' },
  'Contábil':   { bg: 'bg-violet-50',  border: 'border-violet-200',  text: 'text-violet-700' },
  Legalização:  { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', text: 'text-fuchsia-700' },
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}

// Recomendação automática por tributação/CNAE foi removida na unificação dos
// grupos (o ServicoGrupo não carrega esses campos). Ver comentário-espelho em
// cliente-obrigacao.service.ts para como revisitar a ideia no futuro.

export function ObrigacoesClienteSection({ clienteId }: { clienteId: string }) {
  const { canManageResponsible } = useClientesPerms()
  const [items, setItems] = useState<ClienteObrigacao[]>([])
  const [loading, setLoading] = useState(true)
  const [areasResponsaveis, setAreasResponsaveis] = useState<AreaResponsavel[]>([])
  const [usuariosArea, setUsuariosArea] = useState<Array<{ id: string; name: string; areaId: string | null }>>([])
  const [editArea, setEditArea] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Filtros da tabela
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<'TODAS' | string>('TODAS')
  const [filtroStatus, setFiltroStatus] = useState<'TODOS' | 'ATIVAS' | 'INATIVAS'>('TODOS')
  const [view, setView] = useState<'tabela' | 'calendario'>('tabela')

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 250); return () => clearTimeout(t) }, [search])

  // Dialog Aplicar template
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [loadingGrupos, setLoadingGrupos] = useState(false)
  const [grupoSelecionado, setGrupoSelecionado] = useState<string | null>(null)
  const [manterExistentes, setManterExistentes] = useState(true)
  const [aplicando, setAplicando] = useState(false)

  // Dialog Adicionar individual
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([])
  const [loadingObr, setLoadingObr] = useState(false)
  const [obrSearch, setObrSearch] = useState('')
  const [obrSelecionada, setObrSelecionada] = useState<string | null>(null)
  const [obrObservacao, setObrObservacao] = useState('')
  const [adicionando, setAdicionando] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [res, servicos] = await Promise.all([
        (trpc as any).clienteObrigacao.listDoCliente.query({ clienteId }),
        (trpc as any).cliente.servicosListar.query({ clienteId }).catch(() => null),
      ])
      setItems(res as ClienteObrigacao[])
      // servicosListar devolve { areas: [...], usuarios: [...] } — filtra só contratadas
      const areasList = (servicos?.areas ?? []) as AreaResponsavel[]
      setAreasResponsaveis(areasList.filter((a) => a.contratado))
      setUsuariosArea((servicos?.usuarios ?? []) as Array<{ id: string; name: string; areaId: string | null }>)
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao carregar obrigações.')
    } finally { setLoading(false) }
  }, [clienteId])

  useEffect(() => { fetchData() }, [fetchData])

  // Usuários elegíveis para uma área (lotados nela ou sem área definida).
  const usersForArea = (areaId: string) => usuariosArea.filter((u) => !u.areaId || u.areaId === areaId)

  // Salva responsável/substituto de UMA área (popover do card). Salva na hora.
  async function setAreaResp(ar: AreaResponsavel, field: 'resp' | 'sub', value: string | null) {
    const responsavelId = field === 'resp' ? value : ar.responsavelId
    const substitutoId = field === 'sub' ? value : ar.substitutoId
    try {
      await (trpc as any).cliente.setAreaResponsavel.mutate({ clienteId, areaId: ar.areaId, responsavelId, substitutoId })
      await fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Não foi possível salvar o responsável.') }
  }

  async function abrirGrupo() {
    setGrupoSelecionado(null) // sempre abre sem seleção (o manterExistentes é preservado de propósito)
    setLoadingGrupos(true)
    setTemplateDialogOpen(true)
    try {
      // Só grupos do tipo OBRIGACOES podem ser aplicados no cliente.
      const res = await (trpc as any).servico.listGrupos.query()
      setGrupos((res as Grupo[]).filter((g) => g.tipo === 'OBRIGACOES'))
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao carregar grupos.')
    } finally { setLoadingGrupos(false) }
  }

  async function aplicarGrupo() {
    if (!grupoSelecionado) return
    // "Substituir" agora é um wipe TOTAL das obrigações do cliente (inclusive as
    // manuais) — o vínculo de origem por-template não existe mais. Confirma forte.
    if (!manterExistentes) {
      const ok = await alerts.confirm({
        title: 'Substituir todas as obrigações?',
        text: 'Isto REMOVE todas as obrigações atuais do cliente — inclusive as adicionadas manualmente — antes de aplicar o grupo. Não dá pra desfazer.',
        confirmText: 'Substituir tudo', icon: 'warning',
      })
      if (!ok) return
    }
    setAplicando(true)
    try {
      const res = await (trpc as any).clienteObrigacao.aplicarGrupo.mutate({
        clienteId,
        grupoId: grupoSelecionado,
        manterExistentes,
      })
      await alerts.success(
        'Grupo aplicado',
        `${res.criadas} criada(s)${res.removidas ? ` · ${res.removidas} removida(s)` : ''}.`,
      )
      setTemplateDialogOpen(false)
      setGrupoSelecionado(null)
      fetchData()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao aplicar grupo.')
    } finally { setAplicando(false) }
  }

  async function abrirAdicionar() {
    setLoadingObr(true)
    setAddDialogOpen(true)
    setObrSelecionada(null)
    setObrObservacao('')
    setObrSearch('')
    try {
      const res = await (trpc as any).servico.listObrigacoesAcessorias.query()
      setObrigacoes((res as any[]).map((o) => ({ id: o.id, nome: o.nome, categoria: o.categoria ?? null })))
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao carregar obrigações.')
    } finally { setLoadingObr(false) }
  }

  async function adicionarObrigacao() {
    if (!obrSelecionada) return
    setAdicionando(true)
    try {
      await (trpc as any).clienteObrigacao.addAoCliente.mutate({
        clienteId,
        servicoId: obrSelecionada,
        observacao: obrObservacao.trim() || null,
      })
      await alerts.success('Adicionada', 'Obrigação vinculada ao cliente.')
      setAddDialogOpen(false)
      fetchData()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Falha ao adicionar.')
    } finally { setAdicionando(false) }
  }

  async function toggleAtivo(item: ClienteObrigacao) {
    try {
      await (trpc as any).clienteObrigacao.updateDoCliente.mutate({
        id: item.id,
        data: { ativo: !item.ativo },
      })
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao atualizar.') }
  }

  async function remover(item: ClienteObrigacao) {
    if (!await alerts.confirmDelete(item.servico.nome)) return
    try {
      await (trpc as any).clienteObrigacao.removeDoCliente.mutate({ id: item.id })
      await alerts.success('Removida', `"${item.servico.nome}" foi desvinculada.`)
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao remover.') }
  }

  async function bulkRemove() {
    const ok = await alerts.confirm({
      title: `Desvincular ${selected.size} obrigação(ões)?`,
      text: 'O vínculo será removido. Você pode reaplicar um grupo de obrigações depois, se precisar.',
      confirmText: 'Desvincular', icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc as any).clienteObrigacao.bulkRemoveDoCliente.mutate({ ids: Array.from(selected) })
      setSelected(new Set())
      await alerts.success('Removidas', `${selected.size} obrigação(ões) desvinculada(s).`)
      fetchData()
    } catch (e: any) { alerts.error('Erro', e?.message ?? 'Falha ao remover em lote.') }
  }

  const totalAtivas = items.filter((i) => i.ativo).length

  // Áreas realmente presentes nas obrigações do cliente — alimenta o filtro
  // (antes eram 3 áreas fixas chumbadas; agora reflete as áreas de fato).
  const areasPresentes = Array.from(
    new Set(items.map((i) => i.servico.categoria).filter((c): c is string => !!c)),
  ).sort((a, b) => a.localeCompare(b))

  // Filtragem em memória — universo total ≤ ~30 obrigações por cliente,
  // não compensa server-side. Aplica busca + categoria + origem + status.
  const itemsFiltrados = items.filter((i) => {
    if (filtroStatus === 'ATIVAS' && !i.ativo) return false
    if (filtroStatus === 'INATIVAS' && i.ativo) return false
    if (filtroCategoria !== 'TODAS' && i.servico.categoria !== filtroCategoria) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      const nome = i.servico.nome.toLowerCase()
      const obs = (i.observacao ?? '').toLowerCase()
      if (!nome.includes(q) && !obs.includes(q)) return false
    }
    return true
  })

  const filtrosAtivos =
    (filtroCategoria !== 'TODAS' ? 1 : 0) +
    (filtroStatus !== 'TODOS' ? 1 : 0) +
    (debouncedSearch ? 1 : 0)

  const allChecked = itemsFiltrados.length > 0 && itemsFiltrados.every((i) => selected.has(i.id))
  const obrigacoesFiltradas = obrSearch
    ? obrigacoes.filter((o) => o.nome.toLowerCase().includes(obrSearch.toLowerCase()))
    : obrigacoes

  return (
    <div className="space-y-4">
      {/* Banner de recomendação automática removido na unificação dos grupos —
          ver comentário em cliente-obrigacao.service.ts para revisitar a ideia. */}

      {/* Painel de responsáveis por área (do ClienteAreaContratada) */}
      {areasResponsaveis.length > 0 && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            <Users className="h-3 w-3" />
            Responsáveis por área
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {areasResponsaveis.map((ar) => {
              const cores = AREA_CORES[ar.areaNome] ?? { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-700' }
              return (
                <div key={ar.areaId} className="relative">
                  <button
                    type="button"
                    disabled={!canManageResponsible}
                    onClick={() => { if (!canManageResponsible) return; setEditArea(editArea === ar.areaId ? null : ar.areaId) }}
                    className={cn('group w-full text-left rounded-md border p-2.5 flex items-center gap-2.5 transition', canManageResponsible && 'hover:brightness-[0.97]', cores.bg, cores.border)}
                    title={canManageResponsible ? 'Clique para atribuir responsável/substituto' : 'Sem permissão para gerenciar responsáveis'}
                  >
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                      ar.responsavelNome ? 'bg-white text-foreground border-2 ' + cores.border : 'bg-white/60 text-muted-foreground border border-dashed',
                    )}>
                      {ar.responsavelNome ? iniciais(ar.responsavelNome) : '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-[10px] uppercase tracking-wide font-semibold', cores.text)}>
                        {ar.areaNome}
                      </div>
                      {ar.responsavelNome ? (
                        <div className="text-xs font-medium text-foreground truncate" title={ar.responsavelNome}>
                          {ar.responsavelNome}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground italic">Não atribuído</div>
                      )}
                      {ar.substitutoNome && (
                        <div className="text-[10px] text-muted-foreground truncate" title={`Substituto: ${ar.substitutoNome}`}>
                          Subs.: {ar.substitutoNome}
                        </div>
                      )}
                    </div>
                    {canManageResponsible && <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground" />}
                  </button>

                  {editArea === ar.areaId && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setEditArea(null)} />
                      <div className="absolute left-0 top-full z-50 mt-1 w-64 space-y-2.5 rounded-md border border-border bg-popover p-3 shadow-lg">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Responsável</Label>
                          <Select value={ar.responsavelId || '__none__'} onValueChange={(v) => setAreaResp(ar, 'resp', v === '__none__' ? null : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Não atribuído</SelectItem>
                              {usersForArea(ar.areaId).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                              {ar.responsavelId && !usersForArea(ar.areaId).some((u) => u.id === ar.responsavelId) && (
                                <SelectItem value={ar.responsavelId}>{ar.responsavelNome || ar.responsavelId} (fora da área)</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px]">Substituto</Label>
                          <Select value={ar.substitutoId || '__none__'} onValueChange={(v) => setAreaResp(ar, 'sub', v === '__none__' ? null : v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">Nenhum</SelectItem>
                              {usersForArea(ar.areaId).map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                              {ar.substitutoId && !usersForArea(ar.areaId).some((u) => u.id === ar.substitutoId) && (
                                <SelectItem value={ar.substitutoId}>{ar.substitutoNome || ar.substitutoId} (fora da área)</SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Card>
        {/* Header do card — título + ações */}
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
            <h5 className="text-sm font-semibold mb-0">Obrigações do cliente</h5>
            <Badge variant="outline" className="h-5 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">
              {totalAtivas} ativa{totalAtivas === 1 ? '' : 's'}
            </Badge>
            {items.length > totalAtivas && (
              <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
                {items.length - totalAtivas} inativa{items.length - totalAtivas === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            {/* Toggle Tabela ↔ Calendário */}
            <div className="flex items-center rounded border border-border/60 bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setView('tabela')}
                title="Visualização em tabela"
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  view === 'tabela' ? 'text-white' : 'text-muted-foreground hover:text-foreground',
                )}
                style={view === 'tabela' ? { backgroundColor: MODULE_COLOR } : undefined}
              >
                <List className="h-3.5 w-3.5" />Tabela
              </button>
              <button
                type="button"
                onClick={() => setView('calendario')}
                title="Visualização em calendário"
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium transition-colors border-l border-border/60',
                  view === 'calendario' ? 'text-white' : 'text-muted-foreground hover:text-foreground',
                )}
                style={view === 'calendario' ? { backgroundColor: MODULE_COLOR } : undefined}
              >
                <LayoutGrid className="h-3.5 w-3.5" />Calendário
              </button>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={abrirGrupo}>
              <ListPlus className="h-4 w-4 text-orange-500" />Aplicar grupo
            </Button>
            <Button type="button" size="sm" onClick={abrirAdicionar} style={{ backgroundColor: MODULE_COLOR, color: 'white' }}>
              <Plus className="h-4 w-4" />Adicionar individual
            </Button>
          </div>
        </CardHeader>

        {view === 'calendario' ? (
          <CalendarioObrigacoesCliente clienteId={clienteId} />
        ) : (
        <>
        {/* Toolbar de filtros */}
        <div className="flex flex-col gap-3 border-y border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filtros</span>
              {filtrosAtivos > 0 && (
                <Badge variant="outline" className="h-5 text-[10px]">{filtrosAtivos}</Badge>
              )}
            </div>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="h-8 w-[140px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as áreas</SelectItem>
                {areasPresentes.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
              <SelectTrigger className="h-8 w-[120px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="ATIVAS">Ativas</SelectItem>
                <SelectItem value="INATIVAS">Inativas</SelectItem>
              </SelectContent>
            </Select>
            {filtrosAtivos > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFiltroCategoria('TODAS')
                  setFiltroStatus('TODOS')
                  setSearch('')
                }}
                className="h-8 text-xs"
              >
                <X className="h-3.5 w-3.5" />Limpar
              </Button>
            )}
          </div>
          <div className="relative max-w-xs w-full sm:w-[240px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar obrigação..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2">
            <span className="text-xs font-medium text-amber-900">
              {selected.size} obrigação(ões) selecionada(s)
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar</Button>
              <Button type="button" variant="destructive" size="sm" onClick={bulkRemove}>
                <Trash2 className="h-3.5 w-3.5" />Desvincular
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
                  onCheckedChange={(v) => v ? setSelected(new Set(itemsFiltrados.map((i) => i.id))) : setSelected(new Set())}
                />
              </TableHead>
              <TableHead className="w-auto whitespace-nowrap">Obrigação</TableHead>
              <TableHead className="hidden sm:table-cell w-[110px] whitespace-nowrap">Área</TableHead>
              <TableHead className="hidden sm:table-cell w-[80px] text-center whitespace-nowrap">Status</TableHead>
              <TableHead className="w-[70px] text-right whitespace-nowrap">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" /> Carregando...
                </div>
              </TableCell></TableRow>
            ) : !items.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                <ListChecks className="h-10 w-10 mx-auto text-muted-foreground/30 mb-2" />
                <p>Nenhuma obrigação vinculada ainda.</p>
                <p className="text-xs mt-1">
                  Clique em <strong>Aplicar grupo</strong> pra herdar de um grupo de obrigações,
                  ou <strong>Adicionar individual</strong> pra cadastrar caso a caso.
                </p>
              </TableCell></TableRow>
            ) : !itemsFiltrados.length ? (
              <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                <Filter className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p>Nenhuma obrigação corresponde aos filtros aplicados.</p>
              </TableCell></TableRow>
            ) : itemsFiltrados.map((i) => (
              <TableRow key={i.id} className={cn('hover:bg-muted/30', !i.ativo && 'opacity-50')}>
                <TableCell className="w-[36px]" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(i.id)}
                    onCheckedChange={(v) => {
                      const next = new Set(selected)
                      if (v) next.add(i.id); else next.delete(i.id)
                      setSelected(next)
                    }}
                  />
                </TableCell>
                <TableCell className="truncate" title={i.observacao ?? i.servico.nome}>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-medium text-sm leading-tight truncate">{i.servico.nome}</span>
                    {i.observacao && (
                      <span className="text-[11px] text-muted-foreground line-clamp-1 leading-tight italic">
                        {i.observacao}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell whitespace-nowrap">
                  {i.servico.categoria && (
                    <Badge variant="outline" className={cn('h-5 px-1.5 text-[10px] font-medium border', CATEGORIA_CORES[i.servico.categoria] ?? 'bg-slate-50 text-slate-700 border-slate-200')}>
                      {i.servico.categoria}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center whitespace-nowrap">
                  <Badge variant="outline" className={cn('h-5 text-[10px]', i.ativo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'text-muted-foreground')}>
                    {i.ativo ? 'Ativa' : 'Inativa'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon-sm"><MoreVertical className="h-3.5 w-3.5" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => toggleAtivo(i)}>
                          {i.ativo ? <><PowerOff className="h-4 w-4" />Desativar</> : <><Power className="h-4 w-4" />Reativar</>}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => remover(i)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-4 w-4" />Desvincular
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Footer com contador */}
        <div className="border-t border-border/60 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{itemsFiltrados.length}</span> de {items.length} obrigação(ões){filtrosAtivos > 0 && <> · com filtros</>}
        </div>
        </>
        )}
      </Card>

      {/* Dialog: Aplicar grupo */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
          <DialogHeaderIcon icon={ListPlus} color="orange">
            <DialogTitle>Aplicar grupo</DialogTitle>
            <DialogDescription className="text-xs">
              Vincula em lote todas as obrigações do grupo selecionado a este cliente.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3 overflow-auto">
            {loadingGrupos ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
              </div>
            ) : grupos.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10">
                Nenhum grupo de obrigações cadastrado. Crie em /servicos/grupos (tipo "Obrigações acessórias").
              </div>
            ) : (
              <div className="space-y-2">
                {grupos.map((g) => {
                  const ativo = grupoSelecionado === g.id
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGrupoSelecionado(g.id)}
                      className={cn(
                        'w-full text-left rounded-md border p-3 transition-all',
                        ativo ? 'border-orange-400 bg-orange-50 dark:border-orange-500/60 dark:bg-orange-950/30' : 'hover:bg-muted/40',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="inline-block w-3 h-3 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: g.cor ?? '#10b981' }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{g.nome}</span>
                            <span className="text-[10px] text-muted-foreground">{g.itens.length} obrigações</span>
                          </div>
                          {g.descricao && (
                            <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{g.descricao}</p>
                          )}
                        </div>
                        {ativo && <Check className="h-4 w-4 text-orange-500 shrink-0" />}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <div className="border-t pt-3">
              <label className="flex items-start gap-2 text-xs cursor-pointer">
                <Checkbox checked={manterExistentes} onCheckedChange={(v) => setManterExistentes(!!v)} className="mt-0.5" />
                <div>
                  <span className="font-medium">Manter obrigações já existentes</span>
                  <p className="text-muted-foreground mt-0.5">
                    {manterExistentes
                      ? 'Ativado: adiciona só as que faltam. O que o cliente já tem fica intacto.'
                      : 'Desativado: remove TODAS as obrigações atuais do cliente (inclusive as manuais) antes de aplicar o grupo.'}
                  </p>
                </div>
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
              <X className="h-4 w-4" />Cancelar
            </Button>
            <Button
              type="button"
              onClick={aplicarGrupo}
              disabled={!grupoSelecionado || aplicando}
              style={{ backgroundColor: '#f97316', color: 'white' }}
            >
              {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListPlus className="h-4 w-4" />}
              Aplicar grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Adicionar individual */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] flex flex-col">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Adicionar obrigação individual</DialogTitle>
            <DialogDescription className="text-xs">
              Vincula uma obrigação específica ao cliente, sem usar template.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3 overflow-auto">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Obrigação <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Filtrar..."
                  value={obrSearch}
                  onChange={(e) => setObrSearch(e.target.value)}
                  className="h-8 pl-8 text-xs bg-card"
                />
              </div>
              <div className="border rounded max-h-[280px] overflow-y-auto divide-y">
                {loadingObr ? (
                  <div className="text-center text-muted-foreground py-6">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  </div>
                ) : obrigacoesFiltradas.length === 0 ? (
                  <div className="text-center text-muted-foreground text-xs py-4">Nenhuma encontrada</div>
                ) : obrigacoesFiltradas.map((o) => {
                  const ativo = obrSelecionada === o.id
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setObrSelecionada(o.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted/40 transition-colors',
                        ativo && 'bg-emerald-50 dark:bg-emerald-900/20',
                      )}
                    >
                      <span className="flex-1 truncate font-medium">{o.nome}</span>
                      {o.categoria && (
                        <Badge variant="outline" className={cn('h-4 text-[9px] font-normal', CATEGORIA_CORES[o.categoria])}>
                          {o.categoria}
                        </Badge>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Observação</Label>
              <Input
                value={obrObservacao}
                onChange={(e) => setObrObservacao(e.target.value)}
                placeholder="Particularidade deste cliente (opcional)"
                className="h-9 text-sm"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
              <X className="h-4 w-4" />Cancelar
            </Button>
            <Button
              type="button"
              onClick={adicionarObrigacao}
              disabled={!obrSelecionada || adicionando}
              style={{ backgroundColor: MODULE_COLOR, color: 'white' }}
            >
              {adicionando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
