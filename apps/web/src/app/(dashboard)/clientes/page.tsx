'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search, Filter,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  Handshake, MoreVertical, FileUp, FileDown,
  ChevronDown, RotateCcw, Archive, X, Database, Loader2,
} from 'lucide-react'
import {
  Button, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Card, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Checkbox,
  cn,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'
import { exportToExcel, type ExportColumn } from '@/lib/export-data'
import { SITUACAO_LABELS, SITUACAO_COLORS, AREA_CONTRATADA_OPTIONS } from '@saas/types'
import { masks } from '@/lib/masks'

interface Cliente {
  id: string; code: number; razaoSocial: string; nomeFantasia: string | null
  documento: string; tipoDocumento: string; situacao: string; status: string
  grupo: string | null; tributacao: string | null; areasContratadas: string | null
  cidade: string | null; uf: string | null; isActive: boolean; deletedAt?: string | null
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }
const PAGE_SIZES = [10, 20, 50, 100]

const TRIBUTACAO_LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real', MEI: 'MEI',
}

export default function ClientesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'razaoSocial', dir: 'asc' })
  const [data, setData] = useState<{ data: Cliente[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Filtros
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterSituacao, setFilterSituacao] = useState('')
  const [filterTributacao, setFilterTributacao] = useState('')
  const [filterGrupo, setFilterGrupo] = useState('')
  const [filterCidade, setFilterCidade] = useState('')
  const [filterUf, setFilterUf] = useState('')
  const [filterOptions, setFilterOptions] = useState<{ grupos: string[]; cidades: string[]; estados: string[] }>({ grupos: [], cidades: [], estados: [] })

  // Lixeira
  const [trashMode, setTrashMode] = useState(false)

  // Importação legado
  const [legacyImporting, setLegacyImporting] = useState(false)

  // Seleção em lote
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [search])

  // Carregar opções de filtro
  useEffect(() => {
    trpc.cliente.getFilterOptions.query().then(setFilterOptions).catch(() => {})
  }, [])

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const input = {
        page, limit, search: debouncedSearch || undefined, sortBy: sort.column, sortDir: sort.dir,
        ...(filterSituacao ? { situacao: filterSituacao as 'MENSAL' } : {}),
        ...(filterTributacao ? { tributacao: filterTributacao as 'SIMPLES_NACIONAL' } : {}),
      }
      const result = trashMode
        ? await trpc.cliente.listTrash.query(input)
        : await trpc.cliente.list.query(input)
      setData(result)
      setSelected(new Set())
    } catch { /* silent */ } finally { setLoading(false) }
  }, [page, limit, debouncedSearch, sort, filterSituacao, filterTributacao, trashMode])

  useEffect(() => { fetchClientes() }, [fetchClientes])

  function toggleSort(column: string) {
    setSort((prev) => ({ column, dir: prev.column === column && prev.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function SortIcon({ column }: { column: string }) {
    if (sort.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  function clearFilters() {
    setFilterSituacao(''); setFilterTributacao(''); setFilterGrupo(''); setFilterCidade(''); setFilterUf('')
    setSearch(''); setPage(1)
  }

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })
  }

  function toggleSelectAll() {
    if (!data?.data) return
    if (selected.size === data.data.length) setSelected(new Set())
    else setSelected(new Set(data.data.map(c => c.id)))
  }

  const EXPORT_COLUMNS: ExportColumn[] = [
    { header: 'ID', accessor: 'code' }, { header: 'Situação', accessor: 'situacao' },
    { header: 'Razão Social', accessor: 'razaoSocial' }, { header: 'Nome Fantasia', accessor: 'nomeFantasia' },
    { header: 'Documento', accessor: 'documento' }, { header: 'Tributação', accessor: 'tributacao' },
    { header: 'Grupo', accessor: 'grupo' }, { header: 'Áreas Contratadas', accessor: 'areasContratadas' },
    { header: 'Cidade', accessor: 'cidade' }, { header: 'UF', accessor: 'uf' },
    { header: 'Telefone', accessor: 'telefone' }, { header: 'E-mail', accessor: 'email' },
  ]

  async function handleExport() {
    setExporting(true)
    try {
      const all = await trpc.cliente.exportAll.query()
      exportToExcel(all as Record<string, unknown>[], EXPORT_COLUMNS, `clientes-${new Date().toISOString().slice(0, 10)}`)
    } catch { alerts.error('Erro', 'Não foi possível exportar.') }
    finally { setExporting(false) }
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await alerts.confirmDelete(name)
    if (!confirmed) return
    try {
      await trpc.cliente.delete.mutate({ id })
      await alerts.success('Movido para lixeira', `"${name}" foi movido para a lixeira.`)
      fetchClientes()
    } catch { alerts.error('Erro', 'Não foi possível excluir.') }
  }

  async function handleRestore(id: string, name: string) {
    try {
      await trpc.cliente.restore.mutate({ id })
      await alerts.success('Restaurado', `"${name}" foi restaurado com sucesso.`)
      fetchClientes()
    } catch { alerts.error('Erro', 'Não foi possível restaurar.') }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    const confirmed = await alerts.confirmDelete(`${selected.size} clientes selecionados`)
    if (!confirmed) return
    let ok = 0
    for (const id of selected) {
      try { await trpc.cliente.delete.mutate({ id }); ok++ } catch { /* skip */ }
    }
    await alerts.success('Lixeira', `${ok} clientes movidos para a lixeira.`)
    fetchClientes()
  }

  async function handleLegacyImport() {
    const confirmed = await alerts.confirmDelete('Isso importará todos os clientes do sistema legado. Clientes existentes serão atualizados.')
    if (!confirmed) return
    setLegacyImporting(true)
    try {
      const result = await trpc.cliente.legacyImport.mutate()
      await alerts.success(
        'Importação concluída',
        `${result.imported} importados, ${result.updated} atualizados${result.errors.length ? `, ${result.errors.length} erros` : ''} de ${result.total} clientes.`
      )
      fetchClientes()
    } catch (e) {
      alerts.error('Erro na importação', (e as Error).message || 'Não foi possível conectar ao banco legado.')
    } finally { setLegacyImporting(false) }
  }

  function formatDocumento(doc: string, tipo: string) {
    return tipo === 'CPF' ? masks.cpf(doc) : masks.cnpj(doc)
  }

  function renderAreas(areas: string | null) {
    if (!areas) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {areas.split(';').map((area) => {
          const trimmed = area.trim()
          const opt = AREA_CONTRATADA_OPTIONS.find((o) => o.value.toLowerCase() === trimmed.toLowerCase())
          return (
            <span key={trimmed} className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${opt?.color || 'bg-muted text-muted-foreground'}`}>
              {opt?.label || trimmed}
            </span>
          )
        })}
      </div>
    )
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  function getPageNumbers() {
    const pages: number[] = []
    let start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  const hasActiveFilters = filterSituacao || filterTributacao || filterGrupo || filterCidade || filterUf

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-emerald-500 text-white shadow-md">
            <Handshake className="h-6 w-6" />
          </div>
          <div>
            <h1>{trashMode ? 'Lixeira — Clientes' : 'Clientes'}</h1>
            <p className="text-sm text-muted-foreground">
              {trashMode ? 'Clientes excluídos. Restaure ou exclua permanentemente.' : 'Gerencie os clientes cadastrados'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!trashMode && (
            <>
              <Button variant="success" size="sm" asChild>
                <Link href="/clientes/new"><Plus className="h-4 w-4" />Novo Cliente</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importar Excel/CSV</DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLegacyImport} disabled={legacyImporting}>
                    {legacyImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                    {legacyImporting ? 'Importando...' : 'Importar do Legado'}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport} disabled={exporting}><FileDown className="h-4 w-4" />Exportar</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setTrashMode(true); setPage(1) }}><Archive className="h-4 w-4" />Lixeira</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {trashMode && (
            <Button variant="outline" size="sm" onClick={() => { setTrashMode(false); setPage(1) }}>
              <ArrowUp className="h-4 w-4" />Voltar aos ativos
            </Button>
          )}
        </div>
      </div>

      {/* Filtros colapsáveis */}
      {!trashMode && (
        <Card className={cn('overflow-hidden transition-all', filtersOpen ? '' : 'cursor-pointer')} onClick={() => !filtersOpen && setFiltersOpen(true)}>
          <div className="flex items-center justify-between px-4 py-3 bg-muted/20" onClick={(e) => { e.stopPropagation(); setFiltersOpen(!filtersOpen) }}>
            <div className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Filtros
              {hasActiveFilters && <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500">{[filterSituacao, filterTributacao, filterGrupo, filterCidade, filterUf].filter(Boolean).length}</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); clearFilters() }}>
                  <X className="h-3 w-3" />Limpar
                </Button>
              )}
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', filtersOpen && 'rotate-180')} />
            </div>
          </div>
          {filtersOpen && (
            <div className="px-4 py-3 border-t border-border/40">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Situação</label>
                  <Select value={filterSituacao || '__all__'} onValueChange={(v) => { setFilterSituacao(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {Object.entries(SITUACAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tributação</label>
                  <Select value={filterTributacao || '__all__'} onValueChange={(v) => { setFilterTributacao(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {Object.entries(TRIBUTACAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Grupo</label>
                  <Select value={filterGrupo || '__all__'} onValueChange={(v) => { setFilterGrupo(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.grupos.map((g) => <SelectItem key={g} value={g!}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Município</label>
                  <Select value={filterCidade || '__all__'} onValueChange={(v) => { setFilterCidade(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.cidades.map((c) => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Estado</label>
                  <Select value={filterUf || '__all__'} onValueChange={(v) => { setFilterUf(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.estados.map((e) => <SelectItem key={e} value={e!}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Seleção em lote */}
      {selected.size > 0 && !trashMode && (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5 text-sm">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">{selected.size} selecionado{selected.size > 1 ? 's' : ''}</span>
          <Button variant="soft-destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-3.5 w-3.5" />Excluir selecionados
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
        </div>
      )}

      {/* DataTable */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <span className="hidden sm:inline">registros</span>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              {!trashMode && (
                <TableHead className="w-[40px]">
                  <Checkbox checked={data?.data && data.data.length > 0 && selected.size === data.data.length} onCheckedChange={toggleSelectAll} />
                </TableHead>
              )}
              <TableHead className="w-[60px]">
                <button onClick={() => toggleSort('code')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Nº <SortIcon column="code" />
                </button>
              </TableHead>
              <TableHead className="w-[110px]">
                <button onClick={() => toggleSort('situacao')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Situação <SortIcon column="situacao" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('razaoSocial')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Cliente <SortIcon column="razaoSocial" />
                </button>
              </TableHead>
              <TableHead className="hidden xl:table-cell w-[170px]">CNPJ/CPF</TableHead>
              <TableHead className="hidden lg:table-cell">Tributação</TableHead>
              <TableHead className="hidden lg:table-cell">Grupo</TableHead>
              <TableHead className="hidden md:table-cell">Município</TableHead>
              <TableHead className="hidden md:table-cell w-[50px]">UF</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={trashMode ? 9 : 10} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={trashMode ? 9 : 10} className="text-center py-10 text-muted-foreground">
                  {trashMode ? 'Nenhum cliente na lixeira' : 'Nenhum cliente encontrado'}
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((cliente) => (
                <TableRow key={cliente.id} className="cursor-pointer" onClick={() => !trashMode && router.push(`/clientes/${cliente.id}`)}>
                  {!trashMode && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(cliente.id)} onCheckedChange={() => toggleSelect(cliente.id)} />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-muted-foreground text-xs">{cliente.code}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <InlineSituacaoSelect
                      clienteId={cliente.id}
                      value={cliente.situacao}
                      onUpdated={(newVal) => {
                        setData((prev) => prev ? {
                          ...prev,
                          data: prev.data.map((c) => c.id === cliente.id ? { ...c, situacao: newVal } : c),
                        } : prev)
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{cliente.razaoSocial}</p>
                      {renderAreas(cliente.areasContratadas)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell font-mono text-xs text-muted-foreground">
                    {formatDocumento(cliente.documento, cliente.tipoDocumento)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {cliente.tributacao ? (TRIBUTACAO_LABELS[cliente.tributacao] || cliente.tributacao) : '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{cliente.grupo || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.cidade || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{cliente.uf || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {trashMode ? (
                        <>
                          <Button variant="soft" size="icon-sm" onClick={() => handleRestore(cliente.id, cliente.razaoSocial)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/clientes/${cliente.id}`)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(cliente.id, cliente.razaoSocial)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Footer */}
        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers().map((p) => (
                  <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>
                ))}
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchClientes} />
    </div>
  )
}

// Componente inline para editar Situação direto na tabela
function InlineSituacaoSelect({ clienteId, value, onUpdated }: { clienteId: string; value: string; onUpdated: (v: string) => void }) {
  const [saving, setSaving] = useState(false)

  async function handleChange(newValue: string) {
    if (newValue === value) return
    setSaving(true)
    try {
      await trpc.cliente.update.mutate({ id: clienteId, data: { situacao: newValue as 'MENSAL' } })
      onUpdated(newValue)
    } catch { /* silent */ }
    finally { setSaving(false) }
  }

  const sc = SITUACAO_COLORS[value as keyof typeof SITUACAO_COLORS]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="block w-full rounded-full px-3 py-1 text-[10px] font-medium text-center cursor-pointer transition-opacity hover:opacity-80"
          style={{ backgroundColor: sc?.bg || '#e5e5e5', color: sc?.color || '#666' }}
        >
          {saving ? '...' : (SITUACAO_LABELS[value as keyof typeof SITUACAO_LABELS] || value)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-1 min-w-[140px]">
        {Object.entries(SITUACAO_LABELS).map(([v, l]) => {
          const c = SITUACAO_COLORS[v as keyof typeof SITUACAO_COLORS]
          return (
            <DropdownMenuItem key={v} onClick={() => handleChange(v)} className="p-1 focus:bg-transparent">
              <span
                className={`block w-full rounded-full px-3 py-1 text-[10px] font-medium text-center ${v === value ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                style={{ backgroundColor: c?.bg || '#e5e5e5', color: c?.color || '#666' }}
              >
                {l}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
