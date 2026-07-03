'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Copy, History, MoreVertical,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
  FileSpreadsheet,
} from 'lucide-react'
import {
  Button, Input, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Card, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { VersionHistoryDialog } from '../_components/version-history-dialog'

interface TreatmentModelRow {
  id: string
  code: number
  nome: string
  contaCorrente: string | null
  version: number
  isActive: boolean
}

type SortDir = 'asc' | 'desc'
interface SortState { column: string; dir: SortDir }

const PAGE_SIZES = [10, 20, 50, 100]

export default function ModelosTratamentoPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [sort, setSort] = useState<SortState>({ column: 'code', dir: 'desc' })
  const [data, setData] = useState<{
    data: TreatmentModelRow[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean
  } | null>(null)
  const [loading, setLoading] = useState(true)
  // Modelo cujo histórico de versões está aberto (null = fechado).
  const [historyModel, setHistoryModel] = useState<{ id: string; nome: string } | null>(null)
  const router = useRouter()

  // Gerenciar Modelos é restrito à sub-permissão "gerenciar_modelos".
  // Sem ela, manda de volta ao fluxo principal (que segue acessível com leitura).
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const canManage =
    isMaster || isEmpresaMaster ||
    permissions.find((p) => p.moduleSlug === 'tratamento-lancamentos')?.subPermissions?.['gerenciar_modelos'] === true

  useEffect(() => {
    if (!permsLoading && !canManage) router.replace('/tratamento-lancamentos')
  }, [permsLoading, canManage, router])

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 400)
    return () => clearTimeout(timer)
  }, [search])

  const fetchModels = useCallback(async () => {
    setLoading(true)
    try {
      const result = await trpc.tratamentoLancamentos.list.query({
        page, limit,
        search: debouncedSearch || undefined,
        sortBy: sort.column, sortDir: sort.dir,
      })
      setData(result as typeof data)
    } catch {
      // erro silencioso
    } finally {
      setLoading(false)
    }
  }, [page, limit, debouncedSearch, sort])

  useEffect(() => { fetchModels() }, [fetchModels])

  function toggleSort(column: string) {
    setSort((prev) => ({ column, dir: prev.column === column && prev.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  function SortIcon({ column }: { column: string }) {
    if (sort.column !== column) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
  }

  const FROM = encodeURIComponent('/tratamento-lancamentos/modelos')
  function openCreate() { router.push(`/tratamento-lancamentos/modelos/new?from=${FROM}`) }
  function openEdit(row: TreatmentModelRow) { router.push(`/tratamento-lancamentos/modelos/${row.id}?from=${FROM}`) }

  async function handleDelete(id: string, nome: string) {
    const confirmed = await alerts.confirmDelete(nome)
    if (!confirmed) return
    try {
      await trpc.tratamentoLancamentos.delete.mutate({ id })
      await alerts.success('Modelo excluído', `"${nome}" foi movido para a lixeira.`)
      fetchModels()
    } catch {
      alerts.error('Erro ao excluir', 'Não foi possível excluir o Modelo.')
    }
  }

  async function handleDuplicate(id: string, nome: string) {
    const ok = await alerts.confirm({
      title: 'Duplicar modelo',
      text: `Criar uma cópia de "${nome}"? A cópia poderá ser editada de forma independente.`,
      confirmText: 'Duplicar',
      icon: 'question',
    })
    if (!ok) return
    try {
      await trpc.tratamentoLancamentos.duplicate.mutate({ id })
      await alerts.success('Modelo duplicado', `Uma cópia de "${nome}" foi criada.`)
      fetchModels()
    } catch {
      alerts.error('Erro ao duplicar', 'Não foi possível duplicar o Modelo.')
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

  // Enquanto resolve a permissão (ou durante o redirect de quem não tem acesso),
  // não renderiza a tela de gestão.
  if (permsLoading || !canManage) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
        Carregando...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="contabil" icon={FileSpreadsheet} />
          <div>
            <h1>Modelos de Tratamento</h1>
            <p className="text-sm text-muted-foreground">
              Crie e gerencie os modelos usados na conversão de lançamentos para o SCI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />Novo Modelo
          </Button>
          <BackButton href="/tratamento-lancamentos" label="Voltar" />
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
            <Input placeholder="Buscar por nome ou conta..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        {/* Table */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">
                <button onClick={() => toggleSort('code')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  ID <SortIcon column="code" />
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => toggleSort('nome')} className="flex items-center gap-1 hover:text-foreground transition-colors">
                  Nome <SortIcon column="nome" />
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell w-[180px]">Conta corrente</TableHead>
              <TableHead className="hidden md:table-cell w-[90px]">Versão</TableHead>
              <TableHead className="w-[130px] text-right">Ações</TableHead>
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
                  Nenhum Modelo de Tratamento cadastrado
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => openEdit(row)}>
                  <TableCell className="font-mono text-muted-foreground text-xs">{row.code}</TableCell>
                  <TableCell className="font-medium text-sm truncate">
                    {row.nome}
                    {!row.isActive && <Badge variant="secondary" className="ml-2 text-[10px]">Inativo</Badge>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {row.contaCorrente || '—'}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    v{row.version}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => openEdit(row)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(row.id, row.nome)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="soft" size="icon-sm" title="Mais ações">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => handleDuplicate(row.id, row.nome)}>
                            <Copy className="h-4 w-4" />Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHistoryModel({ id: row.id, nome: row.nome })}>
                            <History className="h-4 w-4" />Ver histórico
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

      {historyModel && (
        <VersionHistoryDialog
          modelId={historyModel.id}
          modelNome={historyModel.nome}
          open
          onOpenChange={(o) => { if (!o) setHistoryModel(null) }}
          canManage={canManage}
          onRestored={fetchModels}
        />
      )}
    </div>
  )
}
