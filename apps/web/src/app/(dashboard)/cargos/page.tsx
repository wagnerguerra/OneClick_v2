'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, Briefcase, FileUp, FileDown,
  Loader2, Check, MoreVertical,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'
import { exportToExcel, exportToCsv, type ExportColumn } from '@/lib/export-data'

interface AreaOption { id: string; name: string }

interface Cargo {
  id: string; code: number; name: string; isActive: boolean; version: number
  area: { id: string; name: string } | null
  _count: { users: number }
}
type SortDir = 'asc' | 'desc'
const PAGE_SIZES = [10, 20, 50, 100]

// ── Célula de texto editável inline ──────────────

function EditableTextCell({ value, onSave, className }: {
  value: string; onSave: (v: string) => Promise<void>; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setText(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function save() {
    const trimmed = text.trim()
    if (!trimmed || trimmed === value) { setEditing(false); setText(value); return }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
      setFlash(true)
      setTimeout(() => setFlash(false), 1200)
    } catch { setText(value); setEditing(false) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setText(value); setEditing(false) } }}
          onBlur={save}
          disabled={saving}
          className="h-7 w-full rounded-[2px] border border-primary bg-background px-2 text-sm outline-none ring-1 ring-primary"
        />
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />}
      </div>
    )
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className={cn(
        'cursor-text rounded-[2px] px-1.5 py-0.5 -mx-1.5 transition-all duration-500',
        'hover:bg-primary/[0.06] hover:ring-1 hover:ring-primary/20',
        flash && 'bg-emerald-100 dark:bg-emerald-900/30 ring-1 ring-emerald-400/30',
        className,
      )}
      title="Clique para editar"
    >
      {value || '—'}
    </span>
  )
}

// ── Célula de select editável inline ──────────────

function EditableSelectCell({ value, valueLabel, options, onSave, className }: {
  value: string; valueLabel: string; options: AreaOption[]; onSave: (v: string) => Promise<void>; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [flash, setFlash] = useState(false)

  async function handleChange(newId: string) {
    const resolved = newId === '__none__' ? '' : newId
    if (resolved === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(resolved)
      setEditing(false)
      setFlash(true)
      setTimeout(() => setFlash(false), 1200)
    } catch { setEditing(false) }
    finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="relative" onClick={e => e.stopPropagation()}>
        <Select
          defaultOpen
          value={value || '__none__'}
          onValueChange={handleChange}
          onOpenChange={open => { if (!open) setEditing(false) }}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="__none__">Nenhuma</SelectItem>
            {options.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      className={cn(
        'cursor-pointer rounded-[2px] px-1.5 py-0.5 -mx-1.5 transition-all duration-500',
        'hover:bg-primary/[0.06] hover:ring-1 hover:ring-primary/20',
        flash && 'bg-emerald-100 dark:bg-emerald-900/30 ring-1 ring-emerald-400/30',
        className,
      )}
      title="Clique para editar"
    >
      {valueLabel || '—'}
    </span>
  )
}

// ── Página principal ──────────────

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

export default function CargosPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<{ column: string; dir: SortDir }>({ column: 'name', dir: 'asc' })
  const [data, setData] = useState<{ data: Cargo[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [areas, setAreas] = useState<AreaOption[]>([])

  useEffect(() => { trpc.area.listForSelect.query().then(setAreas).catch(() => {}) }, [])
  useEffect(() => { const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400); return () => clearTimeout(t) }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try { setData(await trpc.cargo.list.query({ page, limit, search: debouncedSearch || undefined, sortBy: sort.column, sortDir: sort.dir })) }
    catch {} finally { setLoading(false) }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => { fetchData() }, [fetchData])

  const EXPORT_COLUMNS: ExportColumn[] = [
    { header: 'Código', accessor: 'code' },
    { header: 'Cargo', accessor: 'name' },
    { header: 'Área', accessor: (r) => (r.area as { name: string } | null)?.name ?? '' },
    { header: 'Colaboradores', accessor: (r) => (r._count as { users: number })?.users ?? 0 },
    { header: 'Versão', accessor: 'version' },
    { header: 'Organograma', accessor: (r) => r.showInOrgChart ? 'Sim' : 'Não' },
    { header: 'Descrição Sumária', accessor: (r) => stripHtml(String(r.descricaoSumaria ?? '')) },
    { header: 'Responsabilidades', accessor: (r) => stripHtml(String(r.responsabilidades ?? '')) },
    { header: 'Habilidades', accessor: (r) => stripHtml(String(r.habilidades ?? '')) },
    { header: 'Autoridades', accessor: (r) => stripHtml(String(r.autoridades ?? '')) },
    { header: 'Experiências', accessor: (r) => stripHtml(String(r.experiencias ?? '')) },
    { header: 'Treinamentos', accessor: (r) => stripHtml(String(r.treinamentos ?? '')) },
    { header: 'Educação', accessor: (r) => stripHtml(String(r.educacao ?? '')) },
  ]

  const [exporting, setExporting] = useState(false)

  async function handleExport(format: 'xlsx' | 'csv') {
    setExporting(true)
    try {
      const all = await trpc.cargo.exportAll.query()
      const fileName = `cargos-${new Date().toISOString().slice(0, 10)}`
      if (format === 'xlsx') exportToExcel(all as Record<string, unknown>[], EXPORT_COLUMNS, fileName)
      else exportToCsv(all as Record<string, unknown>[], EXPORT_COLUMNS, fileName)
    } catch { alerts.error('Erro', 'Não foi possível exportar os dados.') }
    finally { setExporting(false) }
  }

  // Atualizar um cargo localmente sem refetch
  function updateLocal(id: string, patch: Partial<Cargo>) {
    setData(prev => {
      if (!prev) return prev
      return { ...prev, data: prev.data.map(c => c.id === id ? { ...c, ...patch } : c) }
    })
  }

  async function saveField(id: string, field: string, value: unknown) {
    await trpc.cargo.update.mutate({ id, data: { [field]: value } })
  }

  function toggleSort(c: string) { setSort(p => ({ column: c, dir: p.column === c && p.dir === 'asc' ? 'desc' : 'asc' })); setPage(1) }
  function SortIcon({ column: c }: { column: string }) {
    if (sort.column !== c) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  async function handleDelete(id: string, name: string) {
    if (!await alerts.confirmDelete(name)) return
    try { await trpc.cargo.delete.mutate({ id }); await alerts.success('Cargo excluído', `"${name}" foi removido.`); fetchData() }
    catch { alerts.error('Erro', 'Não foi possível excluir.') }
  }

  const totalPages = data?.totalPages ?? 1
  const start = data ? (page - 1) * limit + 1 : 0
  const end = data ? Math.min(page * limit, data.total) : 0
  function getPages() { const p: number[] = []; let s = Math.max(1, page - 2); const e = Math.min(totalPages, s + 4); s = Math.max(1, e - 4); for (let i = s; i <= e; i++) p.push(i); return p }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-emerald-500 text-white shadow-md">
            <Briefcase className="h-6 w-6" />
          </div>
          <div>
            <h1>Cargos</h1>
            <p className="text-sm text-muted-foreground">Gerencie os cargos da empresa</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild><Link href="/cargos/new"><Plus className="h-4 w-4" />Novo Cargo</Link></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <FileUp className="h-4 w-4" />Importar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={exporting}>
                <FileDown className="h-4 w-4" />Exportar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="hidden sm:inline">Exibir</span><Select value={String(limit)} onValueChange={v => { setLimit(Number(v)); setPage(1) }}><SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger><SelectContent>{PAGE_SIZES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent></Select><span className="hidden sm:inline">registros</span></div>
          <div className="max-w-xs w-full sm:w-auto"><Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs bg-card" /></div>
        </div>
        <Table className="table-fixed">
          <TableHeader><TableRow>
            <TableHead className="w-[20%]">
              <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                Área <SortIcon column="name" />
              </button>
            </TableHead>
            <TableHead className="w-auto">
              <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                Cargo <SortIcon column="name" />
              </button>
            </TableHead>
            <TableHead className="hidden sm:table-cell w-[100px] text-center whitespace-nowrap">Colab.</TableHead>
            <TableHead className="hidden md:table-cell w-[80px] text-center">Versão</TableHead>
            <TableHead className="w-[90px] text-right">Ações</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="text-center py-10"><div className="flex items-center justify-center gap-2 text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...</div></TableCell></TableRow>
            : !data?.data.length ? <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Nenhum cargo encontrado</TableCell></TableRow>
            : data.data.map(c => (
              <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/cargos/${c.id}`)}>
                <TableCell className="text-sm text-muted-foreground">
                  <EditableSelectCell
                    value={c.area?.id ?? ''}
                    valueLabel={c.area?.name ?? '—'}
                    options={areas}
                    onSave={async (areaId) => {
                      await saveField(c.id, 'areaId', areaId)
                      const newArea = areas.find(a => a.id === areaId)
                      updateLocal(c.id, { area: newArea ? { id: newArea.id, name: newArea.name } : null })
                    }}
                  />
                </TableCell>
                <TableCell className="text-sm">
                  <EditableTextCell
                    value={c.name}
                    className="font-medium"
                    onSave={async (name) => {
                      await saveField(c.id, 'name', name)
                      updateLocal(c.id, { name })
                    }}
                  />
                </TableCell>
                <TableCell className="hidden sm:table-cell text-center">
                  <span className={c._count.users > 0 ? 'text-sm font-medium text-primary' : 'text-sm text-muted-foreground'}>
                    {c._count.users}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell text-center">
                  <span className="text-xs text-muted-foreground">v{c.version}</span>
                </TableCell>
                <TableCell className="text-right"><div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                  <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/cargos/${c.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(c.id, c.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Mostrando <span className="font-medium">{start}</span> a <span className="font-medium">{end}</span> de <span className="font-medium">{data.total}</span> registros</p>
            {totalPages > 1 && <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-xs" disabled={page===1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage(p => p-1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              {getPages().map(p => <Button key={p} variant={p===page?'soft':'outline'} size="icon-xs" className="text-xs" onClick={() => setPage(p)}>{p}</Button>)}
              <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage(p => p+1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={page===totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
            </div>}
          </div>
        )}
      </Card>

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchData} />
    </div>
  )
}
