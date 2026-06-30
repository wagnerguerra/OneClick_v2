'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  Users, FileUp, Download,
} from 'lucide-react'
import {
  Button, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { exportToExcel, exportToCsv } from '@/lib/export-data'
import { TIPO_CONTRATO_LABELS } from '@saas/types'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { ImportModal } from './_components/import-modal'

interface Colaborador {
  id: string
  code: number
  nomeCompleto: string
  cpf: string
  email: string | null
  telefone: string | null
  celular: string | null
  tipoContrato: string
  isActive: boolean
  area: { id: string; name: string } | null
  cargo: { id: string; name: string } | null
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }

const PAGE_SIZES = [10, 20, 50, 100]

export default function ColaboradoresPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'name', dir: 'asc' })
  const [data, setData] = useState<{
    data: Colaborador[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.colaborador.list.query({
        page, limit,
        search: debouncedSearch || undefined,
        sortBy: sort.column,
        sortDir: sort.dir,
      })
      setData(result)
    } catch (e) {
      console.error('[Colaboradores] Erro ao listar:', e)
    } finally {
      setLoading(false)
    }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => { fetchData() }, [fetchData])

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
      await trpc.colaborador.delete.mutate({ id })
      await alerts.success('Colaborador excluído', `"${name}" foi removido com sucesso.`)
      fetchData()
    } catch {
      alerts.error('Erro ao excluir', 'Não foi possível excluir o colaborador.')
    }
  }

  async function handleExport(format: 'excel' | 'csv') {
    try {
      const all = await trpc.colaborador.exportAll.query() as Array<Colaborador & { dataNascimento: string | null; dataAdmissao: string | null; salario: number | null }>
      const rows = all.map((c) => ({
        Codigo: c.code,
        Nome: c.nomeCompleto,
        CPF: c.cpf,
        Email: c.email ?? '',
        Telefone: c.telefone ?? '',
        Celular: c.celular ?? '',
        Contrato: TIPO_CONTRATO_LABELS[c.tipoContrato] ?? c.tipoContrato,
        Area: c.area?.name ?? '',
        Cargo: c.cargo?.name ?? '',
        Ativo: c.isActive ? 'Sim' : 'Não',
      }))
      if (format === 'excel') exportToExcel(rows, 'colaboradores')
      else exportToCsv(rows, 'colaboradores')
    } catch {
      alerts.error('Erro', 'Não foi possível exportar.')
    }
  }

  function formatCpf(cpf: string | null | undefined) {
    if (!cpf) return '—'
    const d = cpf.replace(/\D/g, '')
    if (d.length !== 11) return cpf
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
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
          <PageHeaderIcon module="cadastros" icon={Users} />
          <div>
            <h1>Colaboradores</h1>
            <p className="text-sm text-muted-foreground">Gerencie os colaboradores da empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild>
            <Link href="/colaboradores/new"><Plus className="h-4 w-4" />Novo Colaborador</Link>
          </Button>
          <Button variant="soft" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" />Importar
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('excel')}>
            <Download className="h-4 w-4" />Excel
          </Button>
          <BackButton href="/dashboard" label="Voltar" />
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
            <Input placeholder="Buscar por nome, CPF, e-mail, cargo ou área..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Nome <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead className="hidden lg:table-cell w-[130px]">
                <button onClick={() => toggleSort('cpf')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  CPF <SortIcon column="cpf" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <button onClick={() => toggleSort('cargo')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Cargo <SortIcon column="cargo" />
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell">
                <button onClick={() => toggleSort('area')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Área <SortIcon column="area" />
                </button>
              </TableHead>
              <TableHead className="hidden xl:table-cell w-[110px]">
                <button onClick={() => toggleSort('tipoContrato')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Contrato <SortIcon column="tipoContrato" />
                </button>
              </TableHead>
              <TableHead className="w-[90px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : !data?.data.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Nenhum colaborador encontrado
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((col) => (
                <TableRow
                  key={col.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/colaboradores/${col.id}`)}
                >
                  <TableCell className="font-medium text-sm">{col.nomeCompleto}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">
                    {formatCpf(col.cpf)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {col.cargo?.name ?? '—'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {col.area?.name ?? '—'}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <Badge variant="outline" className="text-[10px]">
                      {TIPO_CONTRATO_LABELS[col.tipoContrato] ?? col.tipoContrato}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/colaboradores/${col.id}`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(col.id, col.nomeCompleto)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Footer / Pagination */}
        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? 'Mostrando 0 registros' : (
                <>Mostrando <span className="font-medium">{startRecord}</span> a{' '}
                <span className="font-medium">{endRecord}</span> de{' '}
                <span className="font-medium">{data.total}</span> registros</>
              )}
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
                  <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>
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

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchData} />
    </div>
  )
}
