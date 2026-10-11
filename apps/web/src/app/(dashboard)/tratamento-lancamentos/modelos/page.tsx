'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Copy, History, MoreVertical, FileJson, Download, Loader2, FileUp,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUpDown, ArrowUp, ArrowDown,
} from 'lucide-react'
import {
  Button, Input, Badge, Checkbox, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Card, Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { BackButton } from '@/components/ui/back-button'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { VersionHistoryDialog } from '../_components/version-history-dialog'
import { ImportarModelosDialog } from '../_components/importar-modelos-dialog'
import {
  buildModeloJson, downloadModeloJson, downloadArquivo, exportarModelosZip, nomeZipModelos,
} from '../lib/export-modelos'
import { esc } from '../_components/model-editor/utils'

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
  // Modelos selecionados para exportar (id → nome) e progresso da exportação (null = parado).
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  const [exportProgress, setExportProgress] = useState<{ feitos: number; total: number } | null>(null)
  // Modal de importação de modelos (.json/.zip exportados) — mesma UX de /areas.
  const [importOpen, setImportOpen] = useState(false)
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
      setSelected((prev) => { const next = new Map(prev); next.delete(id); return next })
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

  /** Exporta a versão atual de um modelo como `.json` (contrato de importação do Centria). */
  /** Devolve true se baixou o arquivo. */
  async function handleExportJson(id: string, nome: string): Promise<boolean> {
    try {
      const m = await trpc.tratamentoLancamentos.getById.query({ id })
      const r = buildModeloJson(m.nome, m.tipoArquivo, m.definition)
      if (!r.ok) { alerts.error('Não foi possível exportar', `"${nome}": ${r.error}`); return false }
      downloadModeloJson(r.fileName, r.json)
      return true
    } catch {
      alerts.error('Erro ao exportar', 'Não foi possível carregar o Modelo.')
      return false
    }
  }

  // ---- Seleção (padrão de /gestao-certificados; id → nome p/ o relatório) ----
  const pageRows = data?.data ?? []
  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id))

  function toggleRow(row: TreatmentModelRow) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(row.id)) next.delete(row.id)
      else next.set(row.id, row.nome)
      return next
    })
  }

  /** Todos da página já marcados → limpa a seleção; senão seleciona a página. */
  function togglePage() {
    setSelected((prev) =>
      pageRows.every((r) => prev.has(r.id)) ? new Map() : new Map(pageRows.map((r) => [r.id, r.nome])),
    )
  }

  /** Exporta os modelos selecionados num `.zip` (um `.json` por modelo). */
  async function handleExportSelected() {
    const modelos = [...selected].map(([id, nome]) => ({ id, nome }))
    if (!modelos.length) return
    // Um só → baixa o .json direto (sem .zip), como no "Exportar JSON" da linha.
    if (modelos.length === 1) {
      const [m] = modelos
      if (await handleExportJson(m!.id, m!.nome)) setSelected(new Map())
      return
    }

    setExportProgress({ feitos: 0, total: modelos.length })
    try {
      const res = await exportarModelosZip(
        modelos,
        async (id) => {
          const m = await trpc.tratamentoLancamentos.getById.query({ id })
          return { nome: m.nome, tipoArquivo: m.tipoArquivo, definition: m.definition }
        },
        (feitos, total) => setExportProgress({ feitos, total }),
      )
      if (res.zip) downloadArquivo(nomeZipModelos(), res.zip)
      const resumo = `${res.exportados} de ${modelos.length} ${modelos.length === 1 ? 'modelo exportado' : 'modelos exportados'}.`
      if (!res.falhas.length) {
        setSelected(new Map())
        await alerts.success('Modelos exportados', resumo)
      } else {
        await alerts.custom({
          title: res.exportados ? 'Exportação concluída com falhas' : 'Nenhum modelo exportado',
          icon: res.exportados ? 'warning' : 'error',
          showCancelButton: false,
          confirmButtonText: 'Entendi',
          html: `<div style="text-align:left"><p style="margin:0 0 8px">${resumo} Não foram exportados:</p><ul style="margin:0;padding-left:1.2em;line-height:1.6">${res.falhas.map((f) => `<li><b>${esc(f.nome)}</b> — ${esc(f.motivo)}</li>`).join('')}</ul></div>`,
        })
      }
    } finally {
      setExportProgress(null)
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
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button variant="soft" size="sm" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4" />Importar
          </Button>
          <Button variant="success" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />Novo Modelo
          </Button>
          <BackButton href="/tratamento-lancamentos" label="Voltar" />
      </>}>
        <h1 className="truncate">Modelos de Tratamento</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Ferramentas</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Tratamento de Lançamentos</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Modelos de Tratamento</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p className="text-sm text-muted-foreground">
              Crie e gerencie os modelos usados na conversão de lançamentos para o SCI
            </p>
        </div>
      </PageHeaderBar>

      <Card>
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Exibir</span>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <span className="hidden sm:inline">registros</span>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por nome ou conta corrente..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        {/* Barra de ações em massa — só aparece com seleção ativa */}
        {/* Mesmo padrão de /gestao-certificados. */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 border-b bg-primary/10 px-4 py-2">
            <div className="text-sm font-medium">
              {selected.size} selecionado(s)
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Map())} disabled={exportProgress !== null}>
                Limpar seleção
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportSelected} disabled={exportProgress !== null} className="gap-1.5">
                {exportProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                {exportProgress ? `Exportando ${exportProgress.feitos} de ${exportProgress.total}...` : `Exportar ${selected.size}`}
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">
                <Checkbox
                  checked={allPageSelected}
                  onCheckedChange={togglePage}
                  aria-label="Selecionar todos"
                />
              </TableHead>
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
                  Nenhum Modelo de Tratamento cadastrado
                </TableCell>
              </TableRow>
            ) : (
              data.data.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn('cursor-pointer hover:bg-muted/50', selected.has(row.id) && 'bg-primary/10')}
                  onClick={() => openEdit(row)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={() => toggleRow(row)}
                      aria-label={`Selecionar ${row.nome}`}
                    />
                  </TableCell>
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
                          <DropdownMenuItem onClick={() => handleExportJson(row.id, row.nome)}>
                            <FileJson className="h-4 w-4" />Exportar JSON
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

      <ImportarModelosDialog open={importOpen} onClose={() => setImportOpen(false)} onSuccess={fetchModels} />
    </div>
  )
}
