'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search, Filter, Settings2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  MoreVertical, FileUp, FileDown, Plug,
  ChevronDown, RotateCcw, Archive, X, Database, Loader2, Sparkles, UserCog,
  Building2, ExternalLink,
  Calculator, FileText, Users, Briefcase, ClipboardList, Wallet, Tag,
  type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Card, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Checkbox,
  cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'
import { IntegracoesModal } from './_components/integracoes-modal'
import { exportToExcel, type ExportColumn } from '@/lib/export-data'
import { SITUACAO_LABELS, SITUACAO_COLORS, AREA_CONTRATADA_OPTIONS } from '@saas/types'
import { masks } from '@/lib/masks'
import { EnriquecerCnaeDialog } from './_components/enriquecer-cnae-dialog'
import { SincronizarResponsaveisDialog } from './_components/sincronizar-responsaveis-dialog'

interface Cliente {
  id: string; code: number; razaoSocial: string; nomeFantasia: string | null
  documento: string; tipoDocumento: string; situacao: string; status: string
  grupo: string | null; tributacao: string | null; areasContratadas: string | null
  cidade: string | null; uf: string | null; isActive: boolean; deletedAt?: string | null
  /** Qtd de filiais quando o cliente é matriz (CNPJ ordem 0001). 0 caso contrário. */
  filiaisCount?: number
}

interface Filial {
  id: string; documento: string; razaoSocial: string; nomeFantasia: string | null
  cidade: string | null; uf: string | null; status: string; situacao: string
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }
const PAGE_SIZES = [10, 20, 50, 100]

const TRIBUTACAO_LABELS: Record<string, string> = {
  SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido',
  LUCRO_REAL: 'Lucro Real', MEI: 'MEI', IMUNE: 'Imune', ISENTA: 'Isenta',
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
  const [enriquecimentoOpen, setEnriquecimentoOpen] = useState(false)
  const [responsaveisOpen, setResponsaveisOpen] = useState(false)
  const [integracoesOpen, setIntegracoesOpen] = useState(false)

  // Modal de filiais (grupo CNPJ — mesma raiz, ordens != 0001)
  const [filiaisModal, setFiliaisModal] = useState<{ documento: string; matrizNome: string } | null>(null)
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [filiaisLoading, setFiliaisLoading] = useState(false)

  useEffect(() => {
    if (!filiaisModal) { setFiliais([]); return }
    let cancelled = false
    setFiliaisLoading(true)
    ;(trpc.cliente as any).listFiliais.query({ documento: filiaisModal.documento })
      .then((r: Filial[]) => { if (!cancelled) setFiliais(r) })
      .catch(() => { if (!cancelled) setFiliais([]) })
      .finally(() => { if (!cancelled) setFiliaisLoading(false) })
    return () => { cancelled = true }
  }, [filiaisModal])

  // Gerenciador de opcoes (Atividade, Origem)
  const [opcoesModal, setOpcoesModal] = useState(false)
  const [opcoesTab, setOpcoesTab] = useState<'ATIVIDADE' | 'ORIGEM'>('ATIVIDADE')
  const [opcoes, setOpcoes] = useState<Array<{ id: string; tipo: string; valor: string; ordem: number }>>([])
  const [opcoesLoading, setOpcoesLoading] = useState(false)
  const [novaOpcao, setNovaOpcao] = useState('')

  const loadOpcoes = useCallback(async (tipo: string) => {
    setOpcoesLoading(true)
    try {
      const data = await (trpc.cliente as any).listOpcoes.query({ tipo }) as typeof opcoes
      setOpcoes(data)
    } catch { /* */ }
    finally { setOpcoesLoading(false) }
  }, [])

  const openOpcoesModal = () => { setOpcoesModal(true); loadOpcoes(opcoesTab) }

  const handleAddOpcao = async () => {
    if (!novaOpcao.trim()) return
    try {
      await (trpc.cliente as any).createOpcao.mutate({ tipo: opcoesTab, valor: novaOpcao.trim() })
      setNovaOpcao('')
      loadOpcoes(opcoesTab)
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  const handleUpdateOpcao = async (id: string, valor: string) => {
    try { await (trpc.cliente as any).updateOpcao.mutate({ id, valor }) } catch { /* */ }
  }

  const handleDeleteOpcao = async (id: string, valor: string) => {
    const ok = await alerts.confirmDelete(valor)
    if (!ok) return
    try {
      await (trpc.cliente as any).deleteOpcao.mutate({ id })
      setOpcoes(prev => prev.filter(o => o.id !== id))
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }
  const [exporting, setExporting] = useState(false)

  // Filtros
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterSituacao, setFilterSituacao] = useState('')
  // Status (ativo/inativo/...). Vazio = padrão (backend oculta INATIVA).
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTributacao, setFilterTributacao] = useState('')
  const [filterGrupo, setFilterGrupo] = useState('')
  const [filterCidade, setFilterCidade] = useState('')
  const [filterUf, setFilterUf] = useState('')
  // Novos filtros
  const [filterNumero, setFilterNumero] = useState('')
  const [filterTipo, setFilterTipo] = useState('')
  const [filterAtividade, setFilterAtividade] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [filterBeneficio, setFilterBeneficio] = useState('')
  const [debouncedNumero, setDebouncedNumero] = useState('')
  const [filterOptions, setFilterOptions] = useState<{ grupos: string[]; cidades: string[]; estados: string[]; tipos: string[]; atividades: string[]; beneficios: string[]; areas: string[] }>({ grupos: [], cidades: [], estados: [], tipos: [], atividades: [], beneficios: [], areas: [] })

  // Filtro persistente: somente mensais
  const [onlyMensal, setOnlyMensal] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('clientes_only_mensal') === '1'
    return false
  })
  function toggleOnlyMensal() {
    setOnlyMensal(prev => {
      const next = !prev
      localStorage.setItem('clientes_only_mensal', next ? '1' : '0')
      if (next) setFilterSituacao('')
      setPage(1)
      return next
    })
  }

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

  // Campo "Número" (texto) — debounce próprio pra não refazer a query a cada tecla
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedNumero(filterNumero); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [filterNumero])

  // Carregar opções de filtro
  useEffect(() => {
    trpc.cliente.getFilterOptions.query().then(setFilterOptions).catch(() => {})
  }, [])

  // Monta o input de filtros da listagem — reusado pela exportação (exporta o
  // conjunto filtrado, não todos os clientes).
  const buildListInput = useCallback(() => {
    const situacaoFinal = onlyMensal ? 'MENSAL' : (filterSituacao || undefined)
    return {
      page, limit, search: debouncedSearch || undefined, sortBy: sort.column, sortDir: sort.dir,
      ...(situacaoFinal ? { situacao: situacaoFinal as 'MENSAL' } : {}),
      ...(filterStatus ? { status: filterStatus as 'ATIVA' } : {}),
      ...(filterTributacao ? { tributacao: filterTributacao as 'SIMPLES_NACIONAL' } : {}),
      ...(filterGrupo ? { grupo: filterGrupo } : {}),
      ...(filterCidade ? { cidade: filterCidade } : {}),
      ...(filterUf ? { uf: filterUf } : {}),
      ...(debouncedNumero.trim() ? { numero: debouncedNumero.trim() } : {}),
      ...(filterTipo ? { tipoCliente: filterTipo } : {}),
      ...(filterAtividade ? { atividade: filterAtividade } : {}),
      ...(filterArea ? { areaContratada: filterArea } : {}),
      ...(filterBeneficio ? { comBeneficio: filterBeneficio } : {}),
    }
  }, [page, limit, debouncedSearch, sort, filterSituacao, filterStatus, filterTributacao, filterGrupo, filterCidade, filterUf, debouncedNumero, filterTipo, filterAtividade, filterArea, filterBeneficio, onlyMensal])

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      const input = buildListInput()
      const result = trashMode
        ? await trpc.cliente.listTrash.query(input)
        : await trpc.cliente.list.query(input)
      setData(result)
      setSelected(new Set())
    } catch { /* silent */ } finally { setLoading(false) }
  }, [buildListInput, trashMode])

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
    setFilterSituacao(''); setFilterStatus(''); setFilterTributacao(''); setFilterGrupo(''); setFilterCidade(''); setFilterUf('')
    setFilterNumero(''); setFilterTipo(''); setFilterAtividade(''); setFilterArea(''); setFilterBeneficio('')
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
      // Exporta exatamente o conjunto filtrado (mesmos filtros da listagem).
      const all = await trpc.cliente.exportAll.query(buildListInput())
      const sufixo = hasActiveFilters || debouncedSearch ? '-filtrados' : ''
      exportToExcel(all as Record<string, unknown>[], EXPORT_COLUMNS, `clientes${sufixo}-${new Date().toISOString().slice(0, 10)}`)
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

  async function handleEmptyTrash() {
    const confirmed = await alerts.confirmDelete('TODOS os clientes da lixeira permanentemente')
    if (!confirmed) return
    try {
      const result = await (trpc.cliente.emptyTrash as any).mutate() as { deleted: number; total: number; errors?: string[] }
      if (result.errors && result.errors.length > 0) {
        await alerts.error(
          `${result.deleted}/${result.total} excluídos`,
          `Alguns registros falharam:\n${result.errors.slice(0, 5).join('\n')}`
        )
      } else {
        await alerts.success('Lixeira esvaziada', `${result.deleted} cliente${result.deleted !== 1 ? 's' : ''} excluído${result.deleted !== 1 ? 's' : ''} permanentemente.`)
      }
      fetchClientes()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível esvaziar a lixeira.')
    }
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

  // Identidade visual dos badges de área: cor base + ícone (chave normalizada
  // sem acento). Pílula com fundo suave tintado, texto/borda na cor, rótulo = nome.
  const AREA_BADGE_MAP: Record<string, { color: string; Icon: LucideIcon }> = {
    contabil: { color: '#0284c7', Icon: Calculator },
    fiscal: { color: '#475569', Icon: FileText },
    trabalhista: { color: '#16a34a', Icon: Users },
    societario: { color: '#7c3aed', Icon: Briefcase },
    legalizacao: { color: '#e11d48', Icon: Building2 },
    administrativo: { color: '#64748b', Icon: ClipboardList },
    financeiro: { color: '#0891b2', Icon: Wallet },
    pessoal: { color: '#ea580c', Icon: UserCog },
    dp: { color: '#ea580c', Icon: UserCog },
  }

  function renderAreas(areas: string | null) {
    if (!areas) return <span className="text-muted-foreground">—</span>
    return (
      <div className="flex flex-wrap gap-1 mt-0.5">
        {areas.split(';').map((area) => {
          const trimmed = area.trim()
          if (!trimmed) return null
          const key = trimmed.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          const conf = AREA_BADGE_MAP[key]
          const color = conf?.color || '#6b7280'
          const Icon = conf?.Icon || Tag
          return (
            <span
              key={trimmed}
              title={trimmed}
              className="inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[1px] text-[9px] font-semibold uppercase leading-tight tracking-wide"
              style={{ backgroundColor: `${color}14`, color, borderColor: `${color}40` }}
            >
              <Icon className="h-2.5 w-2.5 shrink-0" style={{ color }} />
              {trimmed}
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

  const hasActiveFilters = filterSituacao || filterStatus || filterTributacao || filterGrupo || filterCidade || filterUf || filterNumero || filterTipo || filterAtividade || filterArea || filterBeneficio || onlyMensal

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/materiais/icon_clients.png" alt="Clientes" className="h-12 w-12 object-contain shrink-0" />
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
              <Button variant="outline" size="sm" onClick={openOpcoesModal} className="gap-1.5">
                <Settings2 className="h-4 w-4" /> Opcoes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIntegracoesOpen(true)} className="gap-1.5">
                <Plug className="h-4 w-4" />Integrações
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
                  <DropdownMenuItem onClick={() => setEnriquecimentoOpen(true)}>
                    <Sparkles className="h-4 w-4 text-orange-500" />Enriquecer CNAE
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setResponsaveisOpen(true)}>
                    <UserCog className="h-4 w-4 text-orange-500" />Sincronizar Responsáveis
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setTrashMode(true); setPage(1) }}><Archive className="h-4 w-4" />Lixeira</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          {trashMode && (
            <>
              <Button variant="destructive" size="sm" onClick={handleEmptyTrash}>
                <Trash2 className="h-4 w-4" />Esvaziar Lixeira
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setTrashMode(false); setPage(1) }}>
                <ArrowUp className="h-4 w-4" />Voltar aos ativos
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filtros colapsáveis */}
      {!trashMode && (
        <Card className={cn('overflow-hidden transition-all', filtersOpen ? '' : 'cursor-pointer')} onClick={() => !filtersOpen && setFiltersOpen(true)}>
          <div className="flex items-center justify-between px-4 py-3 bg-muted/20" onClick={(e) => { e.stopPropagation(); setFiltersOpen(!filtersOpen) }}>
            <div className="flex items-center gap-3 text-sm font-medium cursor-pointer">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                Filtros
                {hasActiveFilters && (() => { const count = [filterSituacao, filterStatus, filterTributacao, filterGrupo, filterCidade, filterUf, filterNumero, filterTipo, filterAtividade, filterArea, filterBeneficio].filter(Boolean).length + (onlyMensal ? 1 : 0); return count > 0 ? <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-emerald-500">{count}</Badge> : null })()}
              </div>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleOnlyMensal() }}
                className={cn(
                  'flex items-center gap-1.5 rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold transition-all',
                  onlyMensal
                    ? 'bg-[#5ea3cb] text-white shadow-sm'
                    : 'bg-transparent text-muted-foreground border border-border/60 hover:border-[#5ea3cb] hover:text-[#5ea3cb]',
                )}
              >
                Somente Mensais
              </button>
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {/* Linha 1: Número · Grupo · Atividade · Município · Estado · Tributação */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Número</label>
                  <Input value={filterNumero} onChange={(e) => setFilterNumero(e.target.value.replace(/\D/g, ''))} placeholder="Nº do cliente" inputMode="numeric" className="h-8 text-xs bg-card" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Grupo Empresarial</label>
                  <Select value={filterGrupo || '__all__'} onValueChange={(v) => { setFilterGrupo(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.grupos.map((g) => <SelectItem key={g} value={g!}>{g}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Atividade</label>
                  <Select value={filterAtividade || '__all__'} onValueChange={(v) => { setFilterAtividade(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {filterOptions.atividades.map((a) => <SelectItem key={a} value={a!}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Município</label>
                  <Select value={filterCidade || '__all__'} onValueChange={(v) => { setFilterCidade(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.cidades.map((c) => <SelectItem key={c} value={c!}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Estado</label>
                  <Select value={filterUf || '__all__'} onValueChange={(v) => { setFilterUf(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.estados.map((e) => <SelectItem key={e} value={e!}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tributação</label>
                  <Select value={filterTributacao || '__all__'} onValueChange={(v) => { setFilterTributacao(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {Object.entries(TRIBUTACAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Linha 2: Áreas Contratadas · Tipo de Cliente · Situação · Cliente com Benefício · Cliente Ativo/Inativo */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Áreas Contratadas</label>
                  <Select value={filterArea || '__all__'} onValueChange={(v) => { setFilterArea(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {filterOptions.areas.map((a) => <SelectItem key={a} value={a!}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Tipo de Cliente</label>
                  <Select value={filterTipo || '__all__'} onValueChange={(v) => { setFilterTipo(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {filterOptions.tipos.map((t) => <SelectItem key={t} value={t!}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Situação</label>
                  <Select value={onlyMensal ? 'MENSAL' : (filterSituacao || '__all__')} onValueChange={(v) => { setFilterSituacao(v === '__all__' ? '' : v); setPage(1) }} disabled={onlyMensal}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {Object.entries(SITUACAO_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cliente com Benefício</label>
                  <Select value={filterBeneficio || '__all__'} onValueChange={(v) => { setFilterBeneficio(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="__com__">Com benefício (qualquer)</SelectItem>
                      <SelectItem value="__sem__">Sem benefício</SelectItem>
                      {filterOptions.beneficios.map((b) => <SelectItem key={b} value={b!}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Cliente Ativo / Inativo</label>
                  {/* Padrão (vazio) já oculta INATIVA no backend; "Inativo" mostra só inativos. */}
                  <Select value={filterStatus || '__all__'} onValueChange={(v) => { setFilterStatus(v === '__all__' ? '' : v); setPage(1) }}>
                    <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos (ativos)</SelectItem>
                      <SelectItem value="ATIVA">Ativo</SelectItem>
                      <SelectItem value="INATIVA">Inativo</SelectItem>
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
                  <Checkbox checked={!!(data?.data && data.data.length > 0 && selected.size === data.data.length)} onCheckedChange={toggleSelectAll} />
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{cliente.razaoSocial}</p>
                        {(cliente.filiaisCount ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setFiliaisModal({ documento: cliente.documento, matrizNome: cliente.razaoSocial }) }}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
                            title={`Ver ${cliente.filiaisCount} ${cliente.filiaisCount === 1 ? 'filial' : 'filiais'} deste grupo`}
                          >
                            <Building2 className="h-2.5 w-2.5" />
                            {cliente.filiaisCount} {cliente.filiaisCount === 1 ? 'filial' : 'filiais'}
                          </button>
                        )}
                      </div>
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
      <IntegracoesModal open={integracoesOpen} onClose={() => setIntegracoesOpen(false)} onRefreshList={fetchClientes} />
      <EnriquecerCnaeDialog
        open={enriquecimentoOpen}
        onOpenChange={setEnriquecimentoOpen}
        onAfterRun={fetchClientes}
      />
      <SincronizarResponsaveisDialog
        open={responsaveisOpen}
        onOpenChange={setResponsaveisOpen}
        onAfterRun={fetchClientes}
      />

      {/* Modal de filiais do grupo (CNPJ raiz comum, ordem != 0001) */}
      <Dialog open={!!filiaisModal} onOpenChange={o => { if (!o) setFiliaisModal(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Building2} color="violet">
            <DialogTitle className="text-[15px]">Filiais do grupo</DialogTitle>
            <DialogDescription className="text-[11px]">
              {filiaisModal?.matrizNome ?? ''}
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {filiaisLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando filiais...
              </div>
            ) : filiais.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">
                Nenhuma filial encontrada com a mesma raiz de CNPJ.
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-muted/30 text-[11px] text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">CNPJ</th>
                      <th className="text-left px-3 py-2 font-medium">Razão Social</th>
                      <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Cidade/UF</th>
                      <th className="text-right px-3 py-2 font-medium w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {filiais.map(f => (
                      <tr key={f.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2 font-mono text-muted-foreground">{formatDocumento(f.documento, 'CNPJ')}</td>
                        <td className="px-3 py-2 font-medium text-foreground">{f.razaoSocial}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                          {[f.cidade, f.uf].filter(Boolean).join('/') || '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <a
                            href={`/clientes/${f.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Abrir filial"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" type="button" onClick={() => setFiliaisModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gerenciador de Opcoes (Atividade / Origem) */}
      <Dialog open={opcoesModal} onOpenChange={setOpcoesModal}>
        <DialogContent className="max-w-[500px]">
          <DialogHeaderIcon icon={Settings2} color="emerald">
            <DialogTitle className="text-[15px]">Opcoes de Cadastro</DialogTitle>
            <DialogDescription className="text-[11px]">Gerencie as opcoes dos campos Atividade e Origem</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody>
            {/* Tabs */}
            <div className="flex gap-1 mb-4 border-b">
              {(['ATIVIDADE', 'ORIGEM'] as const).map(tab => (
                <button key={tab} type="button"
                  className={cn('px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px', opcoesTab === tab ? 'border-emerald-500 text-emerald-700' : 'border-transparent text-muted-foreground hover:text-foreground')}
                  onClick={() => { setOpcoesTab(tab); loadOpcoes(tab) }}
                >
                  {tab === 'ATIVIDADE' ? 'Atividades' : 'Origens'}
                </button>
              ))}
            </div>
            {/* Lista */}
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {opcoesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : opcoes.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Nenhuma opcao cadastrada</p>
              ) : opcoes.map(op => (
                <div key={op.id} className="flex items-center gap-2 p-2 rounded-lg border hover:bg-muted/30">
                  <Input
                    value={op.valor}
                    onChange={e => setOpcoes(prev => prev.map(o => o.id === op.id ? { ...o, valor: e.target.value } : o))}
                    onBlur={() => handleUpdateOpcao(op.id, op.valor)}
                    className="h-8 text-sm flex-1"
                  />
                  <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDeleteOpcao(op.id, op.valor)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            {/* Adicionar */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t">
              <Input placeholder={opcoesTab === 'ATIVIDADE' ? 'Nova atividade...' : 'Nova origem...'} value={novaOpcao} onChange={e => setNovaOpcao(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddOpcao() }} className="h-8 text-sm flex-1" />
              <Button size="sm" variant="outline" className="h-8 gap-1 shrink-0" onClick={handleAddOpcao} disabled={!novaOpcao.trim()}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpcoesModal(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const isSolid = value === 'MENSAL'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="block w-full rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold text-center cursor-pointer transition-opacity hover:opacity-80"
          style={isSolid
            ? { backgroundColor: sc?.bg || '#e5e5e5', color: sc?.color || '#666' }
            : { backgroundColor: 'transparent', color: sc?.bg || '#666', border: `1.5px solid ${sc?.bg || '#ccc'}` }
          }
        >
          {saving ? '...' : (SITUACAO_LABELS[value as keyof typeof SITUACAO_LABELS] || value)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-1 min-w-[140px]">
        {Object.entries(SITUACAO_LABELS).map(([v, l]) => {
          const c = SITUACAO_COLORS[v as keyof typeof SITUACAO_COLORS]
          const solid = v === 'MENSAL'
          return (
            <DropdownMenuItem key={v} onClick={() => handleChange(v)} className="p-1 focus:bg-transparent">
              <span
                className={`block w-full rounded-[3px] px-2.5 py-[3px] text-[10px] font-semibold text-center ${v === value ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                style={solid
                  ? { backgroundColor: c?.bg || '#e5e5e5', color: c?.color || '#666' }
                  : { backgroundColor: 'transparent', color: c?.bg || '#666', border: `1.5px solid ${c?.bg || '#ccc'}` }
                }
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
