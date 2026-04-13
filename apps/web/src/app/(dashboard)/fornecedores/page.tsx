'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  Package, ArrowLeft, FileUp, Download,
} from 'lucide-react'
import {
  Button, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { exportToExcel } from '@/lib/export-data'
import { TIPO_FORNECEDOR_LABELS } from '@saas/types'
import { ImportModal } from './_components/import-modal'

interface Fornecedor {
  id: string
  code: number
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  tipoDocumento: string
  tipoFornecedor: string
  telefone: string | null
  email: string | null
  cidade: string | null
  uf: string | null
  isActive: boolean
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }

const PAGE_SIZES = [10, 20, 50, 100]

export default function FornecedoresPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'code', dir: 'asc' })
  const [data, setData] = useState<{
    data: Fornecedor[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.fornecedor.list.query({
        page, limit, search: debouncedSearch || undefined, sortBy: sort.column, sortDir: sort.dir,
      })
      setData(result)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleSort(column: string) {
    setSort((prev) => ({ column, dir: prev.column === column && prev.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function SortIcon({ column }: { column: string }) {
    if (sort.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = await alerts.confirmDelete(name)
    if (!confirmed) return
    try {
      await trpc.fornecedor.delete.mutate({ id })
      await alerts.success('Fornecedor excluído', `"${name}" foi removido com sucesso.`)
      fetchData()
    } catch { alerts.error('Erro ao excluir', 'Não foi possível excluir o fornecedor.') }
  }

  async function handleExport() {
    try {
      const all = await trpc.fornecedor.exportAll.query() as Fornecedor[]
      const rows = all.map((f) => ({
        Codigo: f.code, 'Razão Social': f.razaoSocial, 'Nome Fantasia': f.nomeFantasia ?? '',
        Documento: f.documento, Tipo: TIPO_FORNECEDOR_LABELS[f.tipoFornecedor] ?? f.tipoFornecedor,
        Telefone: f.telefone ?? '', Email: f.email ?? '', Cidade: f.cidade ?? '', UF: f.uf ?? '',
      }))
      exportToExcel(rows, 'fornecedores')
    } catch { alerts.error('Erro', 'Não foi possível exportar.') }
  }

  function formatDoc(doc: string, tipo: string) {
    const d = doc.replace(/\D/g, '')
    if (tipo === 'CPF' && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    return doc
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <h1>Fornecedores</h1>
            <p className="text-sm text-muted-foreground">Gerencie os fornecedores da empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild>
            <Link href="/fornecedores/new"><Plus className="h-4 w-4" />Novo Fornecedor</Link>
          </Button>
          <Button variant="soft" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" />Importar
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4" />Excel
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Voltar</Link>
          </Button>
        </div>
      </div>

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
            <Input placeholder="Buscar por nome, CNPJ ou e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">
                <button onClick={() => toggleSort('code')} className="flex items-center gap-1 hover:text-foreground transition-colors">ID <SortIcon column="code" /></button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('razaoSocial')} className="flex items-center gap-1 hover:text-foreground transition-colors">Razão Social <SortIcon column="razaoSocial" /></button>
              </TableHead>
              <TableHead className="hidden lg:table-cell w-[160px]">CNPJ/CPF</TableHead>
              <TableHead className="hidden md:table-cell">Cidade/UF</TableHead>
              <TableHead className="hidden xl:table-cell w-[120px]">Tipo</TableHead>
              <TableHead className="w-[90px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...</div>
              </TableCell></TableRow>
            ) : !data?.data.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum fornecedor encontrado</TableCell></TableRow>
            ) : (
              data.data.map((f) => (
                <TableRow key={f.id} className="cursor-pointer" onClick={() => router.push(`/fornecedores/${f.id}`)}>
                  <TableCell className="font-mono text-muted-foreground text-xs">{f.code}</TableCell>
                  <TableCell className="font-medium text-sm">
                    {f.razaoSocial}
                    {f.nomeFantasia && <span className="text-muted-foreground text-xs ml-1">({f.nomeFantasia})</span>}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">{formatDoc(f.documento, f.tipoDocumento)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{f.cidade && f.uf ? `${f.cidade}/${f.uf}` : '—'}</TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <Badge variant="outline" className="text-[10px]">{TIPO_FORNECEDOR_LABELS[f.tipoFornecedor] ?? f.tipoFornecedor}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/fornecedores/${f.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(f.id, f.razaoSocial)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers().map((p) => (<Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>))}
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchData} />
    </div>
  )
}
