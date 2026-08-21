'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Loader2, Pencil, Trash2, Flag, Settings2,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search as SearchIcon, LayoutGrid, List,
} from 'lucide-react'
import {
  Button, Input, Label, Badge, Card, cn, Checkbox,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@saas/ui'
import Link from 'next/link'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { PageHeaderBar } from '@/components/page-header-bar'
import { ClienteCombobox } from '../orcamentos/_components/cliente-combobox'
import { COLETA_TIPO_LABEL, COLETA_SITUACAO_LABEL, COLETA_SITUACOES, COLETA_TIPOS, COLETA_PRIORIDADE_LABEL } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { SITUACAO_BADGE, TIPO_BADGE } from './_components/badges'
import { ColetaKanban, type KanbanRow } from './_components/kanban'

const PAGE_SIZES = [10, 20, 50]

interface Row {
  numero: number
  id: string
  tipo: string
  situacao: string
  competencia: string | null
  prioridade: number
  contato: string | null
  clienteNomeResolvido: string | null
  solicitanteNomeResolvido: string | null
  categoria: { id: string; nome: string } | null
  registradoEm: string
  _count: { logs: number }
}
interface Categoria { id: string; nome: string; areaId: string | null; areaNome: string | null; ativo: boolean }
interface ClienteOpt { id: string; razaoSocial: string; documento: string | null }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—'

/**
 * Coleta e Recebimento — port do crp_coleta do v1: o trâmite físico de
 * documentos entre cliente, recepção/rota, arquivo e setores. Quem pode fazer
 * o quê em cada situação é decidido no backend (papéis rota/arquivo).
 */
export default function ColetaDocumentosPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'coleta-documentos')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [fTipo, setFTipo] = useState('')
  const [fSituacao, setFSituacao] = useState('')
  const [fCategoria, setFCategoria] = useState('')
  const [fMinhas, setFMinhas] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [clientes, setClientes] = useState<ClienteOpt[]>([])

  // Modal novo registro
  const [aberta, setAberta] = useState(false)
  const [mTipo, setMTipo] = useState('COLETA')
  const [mCliente, setMCliente] = useState('')
  const [mContato, setMContato] = useState('')
  const [mCategoria, setMCategoria] = useState('')
  const [mCompetencia, setMCompetencia] = useState('')
  const [mPrioridade, setMPrioridade] = useState('2')
  const [mDescricao, setMDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal de categorias
  const [catAberta, setCatAberta] = useState(false)
  const [catNome, setCatNome] = useState('')
  const [catArea, setCatArea] = useState('')
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])
  const [catSalvando, setCatSalvando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const carregarApoios = useCallback(() => {
    ;(trpc as any).coleta.listarCategorias.query({}).then(setCategorias).catch(() => setCategorias([]))
    ;(trpc as any).coleta.listarClientes.query().then(setClientes).catch(() => setClientes([]))
    ;(trpc as any).coleta.listarAreas.query().then(setAreas).catch(() => setAreas([]))
  }, [])
  useEffect(() => { carregarApoios() }, [carregarApoios])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc as any).coleta.listar.query({
        page, limit,
        search: debounced || undefined,
        tipo: fTipo || undefined,
        situacao: fSituacao || undefined,
        categoriaId: fCategoria || undefined,
        somenteMinhas: fMinhas || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, fTipo, fSituacao, fCategoria, fMinhas])
  useEffect(() => { fetchData() }, [fetchData])

  // ── Kanban (como no /crm): preferência persistida; mesmas filtragens da lista ──
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>('lista')
  useEffect(() => {
    const v = typeof window !== 'undefined' ? localStorage.getItem('coleta-view-mode') : null
    if (v === 'kanban') setViewMode('kanban')
  }, [])
  const [kanbanRows, setKanbanRows] = useState<KanbanRow[]>([])
  const [kanbanLoading, setKanbanLoading] = useState(false)
  const fetchKanban = useCallback(async () => {
    setKanbanLoading(true)
    try {
      const res = await (trpc as any).coleta.listarKanban.query({
        search: debounced || undefined,
        tipo: fTipo || undefined,
        situacao: fSituacao || undefined,
        categoriaId: fCategoria || undefined,
        somenteMinhas: fMinhas || undefined,
      })
      setKanbanRows(res ?? [])
    } catch { /* silencioso */ }
    finally { setKanbanLoading(false) }
  }, [debounced, fTipo, fSituacao, fCategoria, fMinhas])
  useEffect(() => { if (viewMode === 'kanban') fetchKanban() }, [viewMode, fetchKanban])

  async function salvar() {
    if (!mCliente && !mContato.trim()) { alerts.error('Falta o cliente', 'Informe o cliente ou ao menos o contato.'); return }
    setSalvando(true)
    try {
      const { id } = await (trpc as any).coleta.criar.mutate({
        tipo: mTipo,
        clienteId: mCliente || null,
        contato: mContato || null,
        categoriaId: mCategoria || null,
        competencia: mCompetencia || null,
        prioridade: Number(mPrioridade),
        descricao: mDescricao || null,
      })
      alerts.success('Registrado', mTipo === 'RECEBIMENTO' ? 'Documento entregue ao Arquivo.' : 'Solicitação aguardando rota.')
      setAberta(false)
      router.push(`/coleta-documentos/${id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function salvarCategoria() {
    if (catNome.trim().length < 2) return
    setCatSalvando(true)
    try {
      await (trpc as any).coleta.criarCategoria.mutate({ nome: catNome.trim(), areaId: catArea || null })
      setCatNome(''); setCatArea('')
      ;(trpc as any).coleta.listarCategorias.query({}).then(setCategorias).catch(() => {})
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setCatSalvando(false) }
  }

  async function desativarCategoria(c: Categoria) {
    try {
      await (trpc as any).coleta.atualizarCategoria.mutate({ id: c.id, ativo: false })
      ;(trpc as any).coleta.listarCategorias.query({}).then(setCategorias).catch(() => {})
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const filtrosAtivos = !!(fTipo || fSituacao || fCategoria || fMinhas)
  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  return (
    <div className="space-y-6">
      {/* Header padrão (como o /crm): barra full-bleed, título + trilha, ações à direita */}
      <PageHeaderBar
        actions={<>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nº, cliente, contato..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-60 pl-8 text-sm" />
          </div>
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'kanban' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('kanban'); localStorage.setItem('coleta-view-mode', 'kanban') }} title="Kanban">
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" className={cn('p-1.5 transition-colors', viewMode === 'lista' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => { setViewMode('lista'); localStorage.setItem('coleta-view-mode', 'lista') }} title="Lista">
              <List className="h-4 w-4" />
            </button>
          </div>
          {podeEscrever && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5"><Settings2 className="h-4 w-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setCatAberta(true)}>
                  <Settings2 className="h-4 w-4 mr-2" />Categorias
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {podeEscrever && (
            <Button size="sm" className="gap-1.5" onClick={() => setAberta(true)}>
              <Plus className="h-4 w-4" />Novo Registro
            </Button>
          )}
        </>}
      >
        <h1 className="truncate">Coleta e Recebimento</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administrativo</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Coleta e Recebimento</span>
        </p>
      </PageHeaderBar>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={fTipo || '__all__'} onValueChange={(v) => { setFTipo(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[135px] text-xs bg-card"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {COLETA_TIPOS.map((t) => <SelectItem key={t} value={t}>{COLETA_TIPO_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fSituacao || '__all__'} onValueChange={(v) => { setFSituacao(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[175px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {COLETA_SITUACOES.map((s) => <SelectItem key={s} value={s}>{COLETA_SITUACAO_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={fCategoria || '__all__'} onValueChange={(v) => { setFCategoria(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[175px] text-xs bg-card"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <Checkbox checked={fMinhas} onCheckedChange={(v) => { setFMinhas(v === true); setPage(1) }} />
              Só as minhas
            </label>
            {filtrosAtivos && (
              <Button variant="outline" size="xs" onClick={() => { setFTipo(''); setFSituacao(''); setFCategoria(''); setFMinhas(false); setPage(1) }}>
                Limpar
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {!search && !fSituacao && (
            <p className="text-[11px] text-muted-foreground">
              Protocolos arquivados ficam ocultos — busque ou filtre pela situação para vê-los.
            </p>
          )}
        </div>

        {viewMode === 'kanban' ? (
          <div className="px-4 pt-4">
            <ColetaKanban rows={kanbanRows} loading={kanbanLoading} onChanged={() => { fetchKanban(); fetchData() }} />
          </div>
        ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="[&_th]:whitespace-nowrap">
              <TableHead className="w-[76px]">#</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-[125px]">Tipo</TableHead>
              <TableHead className="hidden md:table-cell w-[150px]">Categoria</TableHead>
              <TableHead className="hidden sm:table-cell w-[125px] text-center">Competência</TableHead>
              <TableHead className="w-[175px]">Situação</TableHead>
              <TableHead className="hidden lg:table-cell w-[150px]">Solicitante</TableHead>
              <TableHead className="hidden sm:table-cell w-[110px] text-center">Registro</TableHead>
              <TableHead className="w-[80px] pr-5 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum registro encontrado.
              </TableCell></TableRow>
            ) : (
              data.data.map((r) => (
                <TableRow key={r.id} className="cursor-pointer [&_td]:whitespace-nowrap [&_td]:py-2" onClick={() => router.push(`/coleta-documentos/${r.id}`)}>
                  <TableCell className="text-xs font-semibold tabular-nums text-muted-foreground">#{r.numero}</TableCell>
                  <TableCell className="text-sm">
                    <span className="flex items-center gap-1.5 min-w-0">
                      {r.prioridade === 3 && <Flag className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-label="Prioridade alta" />}
                      <span className="truncate font-medium" title={r.contato ?? undefined}>{r.clienteNomeResolvido ?? r.contato ?? '—'}</span>
                      {r.clienteNomeResolvido && r.contato && <span className="truncate text-[11px] text-muted-foreground">· {r.contato}</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', TIPO_BADGE[r.tipo])}>{COLETA_TIPO_LABEL[r.tipo] ?? r.tipo}</Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate">{r.categoria?.nome ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center text-xs tabular-nums">{r.competencia ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', SITUACAO_BADGE[r.situacao])}>
                      {COLETA_SITUACAO_LABEL[r.situacao] ?? r.situacao}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate">{r.solicitanteNomeResolvido ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-center text-xs text-muted-foreground tabular-nums">{dataBR(r.registradoEm)}</TableCell>
                  <TableCell className="pr-5 text-right">
                    <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/coleta-documentos/${r.id}`)} title="Abrir">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        )}

        {viewMode === 'lista' && data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {data.total === 0 ? 'Mostrando 0 registros' : (<>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</>)}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={!data.hasPrev} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <span className="text-xs text-muted-foreground px-2 tabular-nums">{page} / {totalPages}</span>
                <Button variant="outline" size="icon-xs" disabled={!data.hasNext} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="icon-xs" disabled={page === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Modal: novo registro ── */}
      <Dialog open={aberta} onOpenChange={(o) => { if (!salvando) setAberta(o) }}>
        <DialogContent className="max-w-xl">
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Novo registro de coleta</DialogTitle>
            <DialogDescription>
              Entrega e Coleta entram na rota; Recebimento já vai direto ao Arquivo.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 sm:col-span-5">
                <Label className="text-[13px] font-semibold">Tipo <span className="text-rose-500">*</span></Label>
                <Select value={mTipo} onValueChange={setMTipo}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLETA_TIPOS.map((t) => <SelectItem key={t} value={t}>{COLETA_TIPO_LABEL[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Categoria</Label>
                <Select value={mCategoria || '__none__'} onValueChange={(v) => setMCategoria(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Cliente</Label>
                <div className="mt-1.5">
                  <ClienteCombobox clientes={clientes} value={mCliente} onSelect={setMCliente} placeholder="Busque por razão social ou CNPJ" />
                </div>
              </div>
              <div className="col-span-12 sm:col-span-7">
                <Label className="text-[13px] font-semibold">Contato</Label>
                <Input value={mContato} onChange={(e) => setMContato(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={160} placeholder="Quem entrega/retira" />
              </div>
              <div className="col-span-6 sm:col-span-3">
                <Label className="text-[13px] font-semibold">Competência</Label>
                <Input value={mCompetencia}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setMCompetencia(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
                  }}
                  className="h-9 text-sm mt-1.5" placeholder="MM/AAAA" />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <Label className="text-[13px] font-semibold">Prioridade</Label>
                <Select value={mPrioridade} onValueChange={setMPrioridade}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{COLETA_PRIORIDADE_LABEL[n]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12">
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <Input value={mDescricao} onChange={(e) => setMDescricao(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={500} placeholder="O que será coletado/entregue" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAberta(false)} disabled={salvando}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal: categorias ── */}
      <Dialog open={catAberta} onOpenChange={setCatAberta}>
        <DialogContent className="max-w-lg">
          <DialogHeaderIcon icon={Settings2} color="slate">
            <DialogTitle>Categorias de coleta</DialogTitle>
            <DialogDescription>A área vinculada recebe o documento na triagem.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-[13px] font-semibold">Nova categoria</Label>
                <Input value={catNome} onChange={(e) => setCatNome(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={160} placeholder="Nome" />
              </div>
              <div className="w-[160px]">
                <Label className="text-[13px] font-semibold">Área</Label>
                <Select value={catArea || '__none__'} onValueChange={(v) => setCatArea(v === '__none__' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem área" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem área</SelectItem>
                    {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="success" size="sm" className="h-9" onClick={salvarCategoria} disabled={catSalvando || catNome.trim().length < 2}>
                {catSalvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="max-h-[300px] overflow-y-auto nice-scrollbar rounded border border-border">
              {categorias.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma categoria.</p>
              ) : categorias.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.nome}</p>
                    <p className="text-[11px] text-muted-foreground">{c.areaNome ?? 'Sem área vinculada'}</p>
                  </div>
                  <Button variant="soft-destructive" size="icon-sm" title="Desativar" onClick={() => desativarCategoria(c)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCatAberta(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
