'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  Building2, MoreVertical, FileUp, FileDown, Loader2,
} from 'lucide-react'
import {
  Button,
  Input,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Card,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'
import { exportToExcel, type ExportColumn } from '@/lib/export-data'

interface Empresa {
  id: string
  code: number
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string
  cidade: string | null
  uf: string | null
  telefone: string | null
  email: string | null
  isActive: boolean
  version: number
}

type SortDir = 'asc' | 'desc'

interface SortState {
  column: string
  dir: SortDir
}

const PAGE_SIZES = [10, 20, 50, 100]

export default function EmpresasPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'code', dir: 'asc' })
  const [data, setData] = useState<{
    data: Empresa[]
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Debounce de busca — 400ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchEmpresas = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.empresa.list.query({
        page,
        limit,
        search: debouncedSearch || undefined,
        sortBy: sort.column,
        sortDir: sort.dir,
      })
      setData(result)
    } catch {
      // erro silencioso
    } finally {
      setLoading(false)
    }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => {
    fetchEmpresas()
  }, [fetchEmpresas])

  function toggleSort(column: string) {
    setSort((prev) => ({
      column,
      dir: prev.column === column && prev.dir === 'asc' ? 'desc' : 'asc',
    }))
    setPage(1)
  }

  function SortIcon({ column }: { column: string }) {
    if (sort.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5" />
      : <ArrowDown className="h-3.5 w-3.5" />
  }

  const EXPORT_COLUMNS: ExportColumn[] = [
    { header: 'Razão Social', accessor: 'razaoSocial' },
    { header: 'Nome Fantasia', accessor: 'nomeFantasia' },
    { header: 'CNPJ', accessor: 'cnpj' },
    { header: 'IE', accessor: 'inscricaoEstadual' },
    { header: 'IM', accessor: 'inscricaoMunicipal' },
    { header: 'Regime', accessor: 'taxRegime' },
    { header: 'CEP', accessor: 'cep' },
    { header: 'Logradouro', accessor: 'logradouro' },
    { header: 'Número', accessor: 'numero' },
    { header: 'Bairro', accessor: 'bairro' },
    { header: 'Cidade', accessor: 'cidade' },
    { header: 'UF', accessor: 'uf' },
    { header: 'Telefone', accessor: 'telefone' },
    { header: 'E-mail', accessor: 'email' },
    { header: 'Site', accessor: 'site' },
    { header: 'Versão', accessor: 'version' },
  ]

  async function handleExport() {
    setExporting(true)
    try {
      const all = await trpc.empresa.exportAll.query()
      exportToExcel(all as Record<string, unknown>[], EXPORT_COLUMNS, `empresas-${new Date().toISOString().slice(0, 10)}`)
    } catch { alerts.error('Erro', 'Não foi possível exportar.') }
    finally { setExporting(false) }
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await alerts.confirmDelete(name)
    if (!confirmed) return
    try {
      await trpc.empresa.delete.mutate({ id })
      await alerts.success('Empresa excluída', `"${name}" foi removida com sucesso.`)
      fetchEmpresas()
    } catch {
      alerts.error('Erro ao excluir', 'Não foi possível excluir a empresa.')
    }
  }

  function formatCnpj(cnpj: string) {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) return cnpj
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  // Gerar botões de página (max 5 visíveis)
  function getPageNumbers() {
    const pages: number[] = []
    let start = Math.max(1, page - 2)
    const end = Math.min(totalPages, start + 4)
    start = Math.max(1, end - 4)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-emerald-500 text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1>Empresas</h1>
            <p className="text-sm text-muted-foreground">Gerencie as empresas cadastradas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild>
            <Link href="/empresas/new"><Plus className="h-4 w-4" />Nova Empresa</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm"><MoreVertical className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importar</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport()} disabled={exporting}><FileDown className="h-4 w-4" />Exportar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* DataTable Card */}
      <Card>
        {/* Toolbar */}
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

        {/* Table */}
        <Table className="table-fixed">
          <TableHeader className="[&_th]:whitespace-nowrap">
            <TableRow>
              <TableHead className="w-[70px]">
                <button onClick={() => toggleSort('code')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  ID <SortIcon column="code" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('razaoSocial')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Razão Social <SortIcon column="razaoSocial" />
                </button>
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                <button onClick={() => toggleSort('cnpj')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  CNPJ <SortIcon column="cnpj" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <button onClick={() => toggleSort('cidade')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Cidade/UF <SortIcon column="cidade" />
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell">Telefone</TableHead>
              <TableHead className="hidden md:table-cell w-[80px] text-center">Versão</TableHead>
              <TableHead className="w-[90px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  Nenhuma empresa encontrada
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((empresa) => (
                <TableRow
                  key={empresa.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/empresas/${empresa.id}`)}
                >
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {empresa.code}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{empresa.razaoSocial}</p>
                      {empresa.nomeFantasia && (
                        <p className="text-xs text-muted-foreground">{empresa.nomeFantasia}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell font-mono text-xs text-muted-foreground">
                    {formatCnpj(empresa.cnpj)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {empresa.cidade && empresa.uf
                      ? `${empresa.cidade}/${empresa.uf}`
                      : '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {empresa.telefone ?? '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-center">
                    <span className="text-xs text-muted-foreground">v{empresa.version}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="soft-info"
                        size="icon-sm"
                        onClick={() => router.push(`/empresas/${empresa.id}`)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="soft-destructive"
                        size="icon-sm"
                        onClick={() => handleDelete(empresa.id, empresa.razaoSocial)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
              Mostrando <span className="font-medium">{startRecord}</span> a{' '}
              <span className="font-medium">{endRecord}</span> de{' '}
              <span className="font-medium">{data.total}</span> registros
            </p>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                {/* Primeira página */}
                <Button
                  variant="outline"
                  size="icon"
                  size="icon-xs"
                  disabled={page === 1}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                {/* Anterior */}
                <Button
                  variant="outline"
                  size="icon"
                  size="icon-xs"
                  disabled={!data.hasPrev}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                {/* Números de página */}
                {getPageNumbers().map((p) => (
                  <Button
                    key={p}
                    variant={p === page ? 'soft' : 'outline'}
                    size="icon-xs"
                    className="text-xs"
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                ))}

                {/* Próxima */}
                <Button
                  variant="outline"
                  size="icon"
                  size="icon-xs"
                  disabled={!data.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                {/* Última página */}
                <Button
                  variant="outline"
                  size="icon"
                  size="icon-xs"
                  disabled={page === totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchEmpresas} />
    </div>
  )
}
