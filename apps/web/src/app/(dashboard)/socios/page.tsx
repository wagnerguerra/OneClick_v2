'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  UserPlus, FileUp, Download, Users,
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
import { TIPO_SOCIO_LABELS } from '@saas/types'
import { ImportModal } from './_components/import-modal'
import { QsaImportModal } from './_components/qsa-import-modal'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'

interface Socio {
  id: string
  code: number
  nomeCompleto: string
  cpf: string
  tipoSocio: string
  participacao: number | null
  email: string | null
  isActive: boolean
  cliente: { id: string; razaoSocial: string } | null
}

type SortDir = 'asc' | 'desc'
const PAGE_SIZES = [10, 20, 50, 100]

export default function SociosPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<{ column: string; dir: SortDir }>({ column: 'code', dir: 'asc' })
  const [data, setData] = useState<{ data: Socio[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [qsaOpen, setQsaOpen] = useState(false)

  useEffect(() => { const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try { setData(await trpc.socio.list.query({ page, limit, search: debouncedSearch || undefined, sortBy: sort.column, sortDir: sort.dir })) }
    catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => { fetchData() }, [fetchData])

  function toggleSort(col: string) { setSort(p => ({ column: col, dir: p.column === col && p.dir === 'asc' ? 'desc' : 'asc' })); setPage(1) }
  function SortIcon({ column }: { column: string }) {
    if (sort.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  async function handleDelete(id: string, name: string) {
    if (!await alerts.confirmDelete(name)) return
    try { await trpc.socio.delete.mutate({ id }); await alerts.success('Sócio excluído', `"${name}" foi removido.`); fetchData() }
    catch { alerts.error('Erro', 'Não foi possível excluir.') }
  }

  async function handleExport() {
    try {
      const all = await trpc.socio.exportAll.query() as (Socio & { cliente: { razaoSocial: string } | null })[]
      exportToExcel(all.map(s => ({
        Codigo: s.code, Nome: s.nomeCompleto, CPF: s.cpf,
        Tipo: TIPO_SOCIO_LABELS[s.tipoSocio] ?? s.tipoSocio,
        'Participação (%)': s.participacao ?? '', Empresa: s.cliente?.razaoSocial ?? '',
        Email: s.email ?? '',
      })), 'socios')
    } catch { alerts.error('Erro', 'Não foi possível exportar.') }
  }

  function formatCpf(cpf: string) { const d = cpf.replace(/\D/g, ''); return d.length === 11 ? `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}` : cpf }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  function getPageNumbers() { const p: number[] = []; let s = Math.max(1, page - 2); const e = Math.min(totalPages, s + 4); s = Math.max(1, e - 4); for (let i = s; i <= e; i++) p.push(i); return p }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="cadastros" icon={UserPlus} />
          <div><h1>Sócios</h1><p className="text-sm text-muted-foreground">Gerencie o quadro societário</p></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild><Link href="/socios/new"><Plus className="h-4 w-4" />Novo Sócio</Link></Button>
          <Button variant="default" size="sm" onClick={() => setQsaOpen(true)} className="gap-1"><Users className="h-4 w-4" />Importar QSA</Button>
          <Button variant="soft" size="sm" onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importar</Button>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4" />Excel</Button>
          <BackButton href="/dashboard" label="Voltar" />
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}><SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger><SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent></Select>
            <span className="hidden sm:inline">registros</span>
          </div>
          <div className="max-w-xs w-full sm:w-auto"><Input placeholder="Buscar por nome, CPF ou e-mail..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs bg-card" /></div>
        </div>

        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-[70px]"><button onClick={() => toggleSort('code')} className="flex items-center gap-1 hover:text-foreground transition-colors">ID <SortIcon column="code" /></button></TableHead>
            <TableHead><button onClick={() => toggleSort('nomeCompleto')} className="flex items-center gap-1 hover:text-foreground transition-colors">Nome <SortIcon column="nomeCompleto" /></button></TableHead>
            <TableHead className="hidden lg:table-cell w-[130px]">CPF</TableHead>
            <TableHead className="hidden md:table-cell">Tipo</TableHead>
            <TableHead className="hidden sm:table-cell w-[100px]">Participação</TableHead>
            <TableHead className="hidden xl:table-cell">Empresa/Cliente</TableHead>
            <TableHead className="w-[90px] text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10"><div className="flex items-center justify-center gap-2 text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...</div></TableCell></TableRow>
            ) : !data?.data.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum sócio encontrado</TableCell></TableRow>
            ) : data.data.map(s => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => router.push(`/socios/${s.id}`)}>
                <TableCell className="font-mono text-muted-foreground text-xs">{s.code}</TableCell>
                <TableCell className="font-medium text-sm">{s.nomeCompleto}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs font-mono text-muted-foreground">{formatCpf(s.cpf)}</TableCell>
                <TableCell className="hidden md:table-cell"><Badge variant="outline" className="text-[10px]">{TIPO_SOCIO_LABELS[s.tipoSocio] ?? s.tipoSocio}</Badge></TableCell>
                <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{s.participacao != null ? `${Number(s.participacao).toFixed(2)}%` : '—'}</TableCell>
                <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">{s.cliente?.razaoSocial ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/socios/${s.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(s.id, s.nomeCompleto)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{data.total === 0 ? 'Mostrando 0 registros' : (<>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span></>)}</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                {getPageNumbers().map(p => <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>)}
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchData} />
      <QsaImportModal open={qsaOpen} onClose={() => setQsaOpen(false)} onSuccess={fetchData} />
    </div>
  )
}
