'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Search, Eye,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown, ShieldCheck, ShieldOff,
  UserCog, MoreVertical, FileUp, FileDown, Loader2, Copy,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ImportModal } from './_components/import-modal'
import { InlineEditCell } from './_components/inline-edit-cell'
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
  const [importingV1, setImportingV1] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    ;(trpc.area as any).listForSelect.query()
      .then((data: Array<{ id: string; name: string }>) => setAreas(data ?? []))
      .catch(() => setAreas([]))
  }, [])

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
      setSelected(new Set()) // limpa seleção ao refetch (mudou página/filtro)
    } catch { /* silencioso */ } finally { setLoading(false) }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function toggleSelectAll() {
    if (!data) return
    if (selected.size === data.data.length) setSelected(new Set())
    else setSelected(new Set(data.data.map(u => u.id)))
  }

  /**
   * Update otimista de um único campo do usuário. Aplica a mudança local
   * imediatamente; em caso de erro, faz rollback e propaga (pra o
   * InlineEditCell mostrar o erro inline).
   */
  async function inlineUpdate(id: string, patch: Record<string, unknown>) {
    const original = data?.data.find(u => u.id === id)
    if (!original) return
    setData(prev => prev ? {
      ...prev,
      data: prev.data.map(u => u.id === id ? { ...u, ...patch } : u),
    } : prev)
    try {
      await trpc.user.update.mutate({ id, data: patch as any })
    } catch (e) {
      // Rollback
      setData(prev => prev ? {
        ...prev,
        data: prev.data.map(u => u.id === id ? original : u),
      } : prev)
      throw e
    }
  }

  /**
   * Update específico de área — além de setar areaId, atualiza o objeto
   * `area: { id, name }` localmente pra display imediato (sem refetch).
   */
  async function inlineUpdateArea(id: string, areaId: string) {
    const original = data?.data.find(u => u.id === id)
    if (!original) return
    const novaArea = areaId ? areas.find(a => a.id === areaId) ?? null : null
    setData(prev => prev ? {
      ...prev,
      data: prev.data.map(u => u.id === id ? { ...u, area: novaArea } : u),
    } : prev)
    try {
      await trpc.user.update.mutate({ id, data: { areaId: areaId || null } as any })
    } catch (e) {
      setData(prev => prev ? {
        ...prev,
        data: prev.data.map(u => u.id === id ? original : u),
      } : prev)
      throw e
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    const confirmed = await alerts.confirm({
      title: `Desativar ${selected.size} usuário${selected.size > 1 ? 's' : ''}?`,
      text: 'Os usuários selecionados serão desativados (soft-delete) e suas sessões encerradas. Master/Empresa Master e seu próprio usuário serão automaticamente pulados.',
      confirmText: 'Desativar selecionados',
      icon: 'warning',
    })
    if (!confirmed) return
    try {
      const result = await (trpc.user as any).deleteBulk.mutate({ ids: Array.from(selected) })
      const partes = [`${result.desativados} desativados`]
      if (result.pulados?.length > 0) partes.push(`${result.pulados.length} pulados`)
      await alerts.success('Exclusão em lote', partes.join(' · '))
      fetchUsers()
    } catch (e) {
      alerts.error('Erro', (e as Error).message ?? 'Falha ao desativar usuários.')
    }
  }

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

  async function importarDoIntranetV1() {
    setImportingV1(true)
    try {
      const preview = await (trpc.user as any).importarDoIntranetV1.mutate({ dryRun: true })
      const plano = preview.plano as Array<{ userName: string; campos: Record<string, { de: unknown; para: unknown; pulado?: string }> }>
      const planoDesativar = preview.planoDesativar as Array<{ userName: string; motivo: string }>
      const planoCriar = preview.planoCriar as Array<{ legacyId: number; nome: string; email: string }>
      const aRealizar = plano.filter(p => Object.values(p.campos).some(c => !c.pulado))

      const camposPorTipo: Record<string, number> = {}
      for (const p of aRealizar) {
        for (const [k, v] of Object.entries(p.campos)) {
          if (!v.pulado) camposPorTipo[k] = (camposPorTipo[k] || 0) + 1
        }
      }

      const totalAcoes = aRealizar.length + planoDesativar.length + planoCriar.length

      const linhasResumo = [
        `📊 ${preview.totalLegado} ativos no db_intranet`,
        '',
        `✏️  ATUALIZAR — ${aRealizar.length} usuários`,
        ...Object.entries(camposPorTipo).map(([c, n]) => `      • ${c}: ${n}`),
        '',
        `➕ CRIAR — ${planoCriar.length} novos usuários`,
        ...planoCriar.slice(0, 6).map(c => `      • ${c.nome} <${c.email}>`),
        planoCriar.length > 6 ? `      ... +${planoCriar.length - 6} outros` : '',
        '',
        `🚫 DESATIVAR — ${planoDesativar.length} usuários`,
        ...planoDesativar.slice(0, 6).map(d => `      • ${d.userName} (${d.motivo})`),
        planoDesativar.length > 6 ? `      ... +${planoDesativar.length - 6} outros` : '',
      ].filter(Boolean).join('\n')

      if (totalAcoes === 0) {
        await alerts.success('Tudo sincronizado', 'Nada a atualizar, criar ou desativar.')
        return
      }

      const ok = await alerts.confirm({
        title: 'Confirmar sincronização',
        text: linhasResumo,
        confirmText: `Aplicar ${totalAcoes} ações`,
        icon: 'info',
      })
      if (!ok) return

      const result = await (trpc.user as any).importarDoIntranetV1.mutate({ dryRun: false })
      const partes = [
        `${result.aplicadas} atualizados`,
        `${result.criados} criados`,
        `${result.desativados} desativados`,
      ]
      if (result.errosCriacao?.length > 0) {
        partes.push(`${result.errosCriacao.length} falhas`)
      }
      await alerts.success('Sincronização concluída', partes.join(' · '))
      fetchUsers()
    } catch (e) {
      alerts.error('Erro', (e as Error).message ?? 'Falha ao sincronizar com db_intranet.')
    } finally {
      setImportingV1(false)
    }
  }

  async function handleDelete(id: string, name: string, isMaster: boolean) {
    if (isMaster) {
      alerts.error('Ação bloqueada', 'Rebaixe o usuário MASTER antes de desativá-lo.')
      return
    }
    const confirmed = await alerts.confirm({
      title: `Desativar "${name}"?`,
      text: 'O usuário será desativado e suas sessões encerradas. Os registros vinculados (eventos da agenda, histórico, etc.) são preservados. Você pode reativá-lo depois alterando "Ativo" no formulário de edição.',
      confirmText: 'Desativar',
      icon: 'warning',
    })
    if (!confirmed) return
    try {
      await trpc.user.delete.mutate({ id })
      await alerts.success('Usuário desativado', `"${name}" foi desativado com sucesso.`)
      fetchUsers()
    } catch (e) {
      alerts.error('Erro', (e as Error).message ?? 'Não foi possível desativar o usuário.')
    }
  }

  /** Toggle inline da flag "exibir como colaborador" — atualização otimista, sem refetch. */
  async function handleToggleColaborador(id: string, current: boolean) {
    const next = !current
    // Atualiza estado local imediatamente
    setData(prev => prev ? {
      ...prev,
      data: prev.data.map(u => u.id === id ? { ...u, exibirComoColaborador: next } : u),
    } : prev)
    try {
      await trpc.user.update.mutate({ id, data: { exibirComoColaborador: next } as any })
    } catch (e) {
      // Rollback em caso de erro
      setData(prev => prev ? {
        ...prev,
        data: prev.data.map(u => u.id === id ? { ...u, exibirComoColaborador: current } : u),
      } : prev)
      alerts.error('Erro', (e as Error).message ?? 'Não foi possível alterar.')
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-emerald-500 text-white shadow-md">
            <UserCog className="h-6 w-6" />
          </div>
          <div>
            <h1>Usuários</h1>
            <p className="text-sm text-muted-foreground">
              Cadastre, edite permissões e sincronize com o OneClick v1
            </p>
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
                <FileUp className="h-4 w-4" />Importar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => importarDoIntranetV1()} disabled={importingV1}>
                <FileUp className="h-4 w-4" />Sincronizar Intranet v1
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

      {/* Banner de seleção em lote */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 px-4 py-2.5 text-sm border border-emerald-200/60 dark:border-emerald-900/40">
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            {selected.size} selecionado{selected.size > 1 ? 's' : ''}
          </span>
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-3.5 w-3.5" />Excluir selecionados
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

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
            <TableRow className="whitespace-nowrap">
              <TableHead className="w-[40px] text-center">
                <Checkbox
                  checked={!!data?.data.length && selected.size === data.data.length}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Selecionar todos"
                />
              </TableHead>
              <TableHead className="w-[150px] whitespace-nowrap">
                <button onClick={() => toggleSort('role')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Tipo <SortIcon column="role" />
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[110px] whitespace-nowrap">Perfil</TableHead>
              <TableHead className="whitespace-nowrap">
                <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Usuário <SortIcon column="name" />
                </button>
              </TableHead>
              <TableHead className="hidden md:table-cell whitespace-nowrap">
                <button onClick={() => toggleSort('email')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  E-mail <SortIcon column="email" />
                </button>
              </TableHead>
              <TableHead className="hidden lg:table-cell whitespace-nowrap">Área</TableHead>
              <TableHead className="hidden lg:table-cell w-[120px] text-center whitespace-nowrap">Colaborador</TableHead>
              <TableHead className="w-[60px] text-right whitespace-nowrap">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...
                  </div>
                </TableCell>
              </TableRow>
            ) : !data?.data.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum usuário encontrado</TableCell></TableRow>
            ) : (
              data.data.map((user) => {
                return (
                <TableRow key={user.id} className="cursor-pointer" onClick={() => router.push(`/usuarios/${user.id}`)}>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(user.id)}
                      onCheckedChange={() => toggleSelect(user.id)}
                      aria-label={`Selecionar ${user.name}`}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      type="select"
                      value={user.role}
                      options={Object.entries(ROLE_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
                      disabled={user.isMaster}
                      onSave={(v) => inlineUpdate(user.id, { role: v })}
                      display={(v) => (
                        <span className={cn('inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', ROLE_CONFIG[v ?? '']?.color ?? 'bg-muted text-muted-foreground')}>
                          {ROLE_CONFIG[v ?? '']?.label ?? v}
                        </span>
                      )}
                    />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      type="select"
                      value={user.profile}
                      options={Object.entries(PROFILE_CONFIG).map(([v, c]) => ({ value: v, label: c.label }))}
                      disabled={user.isMaster}
                      onSave={(v) => inlineUpdate(user.id, { profile: v })}
                      display={(v) => (
                        <span className={cn('inline-block rounded-[2px] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap', PROFILE_CONFIG[v ?? '']?.color ?? 'bg-muted text-muted-foreground')}>
                          {PROFILE_CONFIG[v ?? '']?.label ?? v}
                        </span>
                      )}
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <InlineEditCell
                        type="text"
                        value={user.name}
                        disabled={user.isMaster}
                        validate={(v) => v.trim().length < 2 ? 'Mínimo 2 caracteres' : null}
                        onSave={(v) => inlineUpdate(user.id, { name: v.trim() })}
                        className="font-medium text-sm"
                      />
                      {user.isMaster && <span className="inline-block rounded-[2px] bg-amber-500 text-white px-1.5 py-0 text-[10px] font-bold">MASTER</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      type="email"
                      value={user.email}
                      disabled={user.isMaster}
                      validate={(v) => /\S+@\S+\.\S+/.test(v) ? null : 'E-mail inválido'}
                      onSave={(v) => inlineUpdate(user.id, { email: v.trim().toLowerCase() })}
                    />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <InlineEditCell
                      type="select"
                      value={user.area?.id ?? 'none'}
                      options={[{ value: 'none', label: '— Sem área' }, ...areas.map(a => ({ value: a.id, label: a.name }))]}
                      disabled={user.isMaster}
                      onSave={(v) => inlineUpdateArea(user.id, v === 'none' ? '' : v)}
                      display={() => <span>{user.area?.name ?? '—'}</span>}
                      emptyLabel="— Sem área"
                    />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-center" onClick={(e) => e.stopPropagation()}>
                    {(() => {
                      const isOn = !!(user as any).exibirComoColaborador
                      return (
                        <button
                          type="button"
                          onClick={() => handleToggleColaborador(user.id, isOn)}
                          className={cn(
                            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
                            isOn ? 'bg-emerald-500' : 'bg-muted-foreground/20',
                          )}
                          title={isOn ? 'Exibido em Colaboradores — clique para desmarcar' : 'Não exibido em Colaboradores — clique para marcar'}
                          aria-label="Alternar exibição em Colaboradores"
                        >
                          <span className={cn(
                            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5',
                            isOn ? 'translate-x-4 ml-0.5' : 'translate-x-0.5',
                          )} />
                        </button>
                      )
                    })()}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" title="Ações">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => router.push(`/usuarios/${user.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-2" /> Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/usuarios/${user.id}/editar`)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                        </DropdownMenuItem>
                        {user.isMaster ? (
                          <DropdownMenuItem onClick={() => handleToggleMaster(user.id, user.name, true)}>
                            <ShieldOff className="h-3.5 w-3.5 mr-2" /> Rebaixar MASTER
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleToggleMaster(user.id, user.name, false)}>
                            <ShieldCheck className="h-3.5 w-3.5 mr-2" /> Promover a MASTER
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(user.id, user.name, user.isMaster)}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Desativar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
