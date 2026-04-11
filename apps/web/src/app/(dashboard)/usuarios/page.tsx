'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, ShieldCheck, ShieldOff,
  UserCog, MoreVertical, FileUp, FileDown, Loader2, Copy,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'
import { CopyPermissionsModal } from './_components/copy-permissions-modal'
import { exportToExcel, type ExportColumn } from '@/lib/export-data'

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  profile: string
  isMaster: boolean
  isActive: boolean
  empresaId: string | null
  empresa: { id: string; razaoSocial: string; nomeFantasia: string | null } | null
  area: { id: string; name: string } | null
  _count: { permissions: number }
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }
const PAGE_SIZES = [10, 20, 50, 100]

const ROLE_CONFIG: Record<string, { label: string; color: string }> = {
  COLABORADOR_INTERNO: { label: 'Colaborador Interno', color: 'bg-emerald-500 text-white' },
  PRESTADOR_SERVICO: { label: 'Prestador de Serviço', color: 'bg-sky-500 text-white' },
  COLABORADOR_CLIENTE: { label: 'Colaborador de Cliente', color: 'bg-violet-500 text-white' },
  GESTOR: { label: 'Gestor', color: 'bg-amber-500 text-white' },
  COORDENADOR: { label: 'Coordenador', color: 'bg-orange-500 text-white' },
  DIRETOR: { label: 'Diretor', color: 'bg-rose-500 text-white' },
}

const PROFILE_CONFIG: Record<string, { label: string; color: string }> = {
  OPERADOR: { label: 'Operador', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  SUPERVISOR: { label: 'Supervisor', color: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  GERENTE: { label: 'Gerente', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  ADMIN: { label: 'Admin', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' },
}

export default function UsuariosPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'name', dir: 'asc' })
  const [data, setData] = useState<{
    data: UserRow[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [importOpen, setImportOpen] = useState(false)
  const [copyPermsOpen, setCopyPermsOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.user.list.query({
        page, limit, search: debouncedSearch || undefined, sortBy: sort.column, sortDir: sort.dir,
      })
      setData(result)
    } catch { /* silencioso */ } finally { setLoading(false) }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function toggleSort(column: string) {
    setSort((prev) => ({ column, dir: prev.column === column && prev.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function SortIcon({ column }: { column: string }) {
    if (sort.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  const EXPORT_COLUMNS: ExportColumn[] = [
    { header: 'Nome', accessor: 'name' },
    { header: 'E-mail', accessor: 'email' },
    { header: 'Telefone', accessor: 'telefone' },
    { header: 'Tipo de Usuário', accessor: 'role' },
    { header: 'Perfil', accessor: 'profile' },
    { header: 'Empresa', accessor: (r) => (r.empresa as { razaoSocial: string } | null)?.razaoSocial ?? '' },
    { header: 'Área', accessor: (r) => (r.area as { name: string } | null)?.name ?? '' },
    { header: 'Cargo', accessor: (r) => (r.cargo as { name: string } | null)?.name ?? '' },
    { header: 'Salário', accessor: (r) => r.salario ? Number(r.salario).toFixed(2) : '' },
    { header: 'Data Admissão', accessor: (r) => r.dataAdmissao ? new Date(String(r.dataAdmissao)).toLocaleDateString('pt-BR') : '' },
    { header: 'ID OneClick', accessor: 'idOneClick' },
    { header: 'Controle de Férias', accessor: (r) => r.incluirFerias ? 'Sim' : 'Não' },
    { header: 'MASTER', accessor: (r) => r.isMaster ? 'Sim' : 'Não' },
    { header: 'Ativo', accessor: (r) => r.isActive ? 'Sim' : 'Não' },
  ]

  async function handleExport() {
    setExporting(true)
    try {
      const all = await trpc.user.exportAll.query()
      exportToExcel(all as Record<string, unknown>[], EXPORT_COLUMNS, `usuarios-${new Date().toISOString().slice(0, 10)}`)
    } catch { alerts.error('Erro', 'Não foi possível exportar.') }
    finally { setExporting(false) }
  }

  async function handleDelete(id: string, name: string, isMaster: boolean) {
    if (isMaster) {
      alerts.error('Ação bloqueada', 'Rebaixe o usuário MASTER antes de excluí-lo.')
      return
    }
    const confirmed = await alerts.confirmDelete(name)
    if (!confirmed) return
    try {
      await trpc.user.delete.mutate({ id })
      await alerts.success('Usuário excluído', `"${name}" foi removido com sucesso.`)
      fetchUsers()
    } catch (e) {
      alerts.error('Erro ao excluir', (e as Error).message ?? 'Não foi possível excluir o usuário.')
    }
  }

  async function handleToggleMaster(id: string, name: string, currentlyMaster: boolean) {
    const action = currentlyMaster ? 'rebaixar' : 'promover a MASTER'
    const result = await alerts.confirmDelete(`${action} o usuário "${name}"`)
    if (!result) return
    try {
      await trpc.user.toggleMaster.mutate({ id })
      await alerts.success(
        currentlyMaster ? 'MASTER removido' : 'MASTER concedido',
        currentlyMaster
          ? `"${name}" não é mais MASTER.`
          : `"${name}" agora é MASTER.`,
      )
      fetchUsers()
    } catch (e) {
      alerts.error('Erro', (e as Error).message ?? 'Não foi possível alterar o status MASTER.')
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md">
            <UserCog className="h-6 w-6" />
          </div>
          <div>
            <h1>Usuários</h1>
            <p className="text-sm text-muted-foreground">Gerencie os usuários do sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild>
            <Link href="/usuarios/new"><Plus className="h-4 w-4" />Novo Usuário</Link>
          </Button>
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
              <DropdownMenuItem onClick={() => handleExport()} disabled={exporting}>
                <FileDown className="h-4 w-4" />Exportar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCopyPermsOpen(true)}>
                <Copy className="h-4 w-4" />Copiar Permissões
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

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

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">
                <button onClick={() => toggleSort('role')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Tipo <SortIcon column="role" />
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[110px]">Perfil</TableHead>
              <TableHead>
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Usuário <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell">
                <button onClick={() => toggleSort('email')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  E-mail <SortIcon column="email" />
                </button>
              </TableHead>
              <TableHead className="hidden lg:table-cell">Área</TableHead>
              <TableHead className="w-[80px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : !data?.data.length ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Nenhum usuário encontrado</TableCell></TableRow>
            ) : (
              data.data.map((user) => {
                const roleConf = ROLE_CONFIG[user.role]
                const profileConf = PROFILE_CONFIG[user.profile]
                return (
                <TableRow key={user.id} className="cursor-pointer" onClick={() => router.push(`/usuarios/${user.id}`)}>
                  <TableCell>
                    <span className={cn('inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', roleConf?.color ?? 'bg-muted text-muted-foreground')}>
                      {roleConf?.label ?? user.role}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className={cn('inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', profileConf?.color ?? 'bg-muted text-muted-foreground')}>
                      {profileConf?.label ?? user.profile}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-medium text-sm">{user.name}</span>
                      {user.isMaster && <span className="inline-block rounded-[2px] bg-amber-500 text-white px-1.5 py-0 text-[10px] font-bold">MASTER</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">{user.email}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                    {user.area?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {user.isMaster ? (
                        <Button
                          variant="soft-warning"
                          size="icon-sm"
                          title="Rebaixar MASTER"
                          onClick={() => handleToggleMaster(user.id, user.name, true)}
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="soft-success"
                          size="icon-sm"
                          title="Promover a MASTER"
                          onClick={() => handleToggleMaster(user.id, user.name, false)}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/usuarios/${user.id}`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(user.id, user.name, user.isMaster)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )})
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

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchUsers} />
      <CopyPermissionsModal
        open={copyPermsOpen}
        onClose={() => setCopyPermsOpen(false)}
        onSuccess={fetchUsers}
      />
    </div>
  )
}
