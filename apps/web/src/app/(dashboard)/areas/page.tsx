'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  LayoutGrid, ArrowLeft, FileUp,
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
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'

interface Area {
  id: string
  code: number
  name: string
  isActive: boolean
  email: string | null
  leader: { id: string; name: string; email: string } | null
  parent: { id: string; name: string } | null
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }

const PAGE_SIZES = [10, 20, 50, 100]

export default function AreasPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'code', dir: 'asc' })
  const [data, setData] = useState<{
    data: Area[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)

  // Debounce busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchAreas = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.area.list.query({
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
    fetchAreas()
  }, [fetchAreas])

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

  async function handleDelete(id: string, name: string) {
    const confirmed = await alerts.confirmDelete(name)
    if (!confirmed) return
    try {
      await trpc.area.delete.mutate({ id })
      await alerts.success('Área excluída', `"${name}" foi removida com sucesso.`)
      fetchAreas()
    } catch {
      alerts.error('Erro ao excluir', 'Não foi possível excluir a área.')
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <div>
            <h1>Áreas</h1>
            <p className="text-sm text-muted-foreground">Gerencie as áreas da empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild>
            <Link href="/areas/new"><Plus className="h-4 w-4" />Nova Área</Link>
          </Button>
          <Button variant="soft" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" />Importar
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Voltar</Link>
          </Button>
        </div>
      </div>

      {/* DataTable */}
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">
                <button onClick={() => toggleSort('code')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  ID <SortIcon column="code" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Nome <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">Líder</TableHead>
              <TableHead className="hidden sm:table-cell">Área Superior</TableHead>
              <TableHead className="w-[90px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  Nenhuma área encontrada
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((area) => (
                <TableRow
                  key={area.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/areas/${area.id}`)}
                >
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {area.code}
                  </TableCell>
                  <TableCell className="font-medium text-sm">{area.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {area.leader?.name ?? '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {area.parent?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="soft-info"
                        size="icon-sm"
                        onClick={() => router.push(`/areas/${area.id}`)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="soft-destructive"
                        size="icon-sm"
                        onClick={() => handleDelete(area.id, area.name)}
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
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}>
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
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
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}>
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Modal de importação */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={fetchAreas}
      />
    </div>
  )
}
