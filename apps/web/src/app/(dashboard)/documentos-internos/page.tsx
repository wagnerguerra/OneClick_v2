'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Pencil, Download, Loader2, Settings,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { DOCUMENTO_SITUACAO_LABEL } from '@saas/types'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const PAGE_SIZES = [10, 20, 50]

/** As cores vêm do próprio v1 (`sgq_doc_sit.cor`), traduzidas para o tema. */
export const SITUACAO_COLORS: Record<string, string> = {
  NOVO: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  EM_APROVACAO: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  APROVADO: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  SUBSTITUIDO: 'bg-muted text-muted-foreground border-border',
  CANCELADO: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
  REJEITADO: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
}
const SITUACAO_OPCOES = ['NOVO', 'EM_APROVACAO', 'APROVADO', 'SUBSTITUIDO', 'CANCELADO', 'REJEITADO']

interface DocumentoRow {
  id: string
  legacyId: number | null
  nome: string
  tipo: { id: string; nome: string } | null
  processo: { id: string; nome: string } | null
  versaoAtual: {
    id: string; revisao: number; situacao: string; dataVersao: string
    arquivoPath: string; arquivoNome: string | null; aprovadoEm: string | null
  } | null
  _count: { versoes: number }
}
interface Opcao { id: string; nome: string }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export default function DocumentosInternosPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find((p) => p.moduleSlug === 'documentos-internos')?.subPermissions ?? {}) as Record<string, boolean>
  const podeGerenciar = isMaster || isEmpresaMaster || subs.gerenciar === true
  const podeExcluir = isMaster || isEmpresaMaster || subs.excluir === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [situacao, setSituacao] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: DocumentoRow[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [tipos, setTipos] = useState<Opcao[]>([])
  const [processos, setProcessos] = useState<Opcao[]>([])

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.documentoInterno as any).listarTipos.query({}).then(setTipos).catch(() => setTipos([]))
    ;(trpc.documentoInterno as any).listarProcessos.query({}).then(setProcessos).catch(() => setProcessos([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.documentoInterno as any).listar.query({
        page, limit,
        search: debounced || undefined,
        situacao: situacao || undefined,
        tipoId: tipoId || undefined,
        processoId: processoId || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, situacao, tipoId, processoId])
  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(d: DocumentoRow) {
    const ok = await alerts.confirm({
      title: `Excluir "${d.nome}"?`,
      text: d._count.versoes === 1
        ? 'O documento e a sua única revisão serão apagados.'
        : `O documento e as suas ${d._count.versoes} revisões serão apagados.`,
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.documentoInterno as any).excluir.mutate({ id: d.id })
      alerts.success('Excluído', 'Documento removido.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  const filtrosAtivos = [situacao, tipoId, processoId].filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {podeGerenciar && (
            <Button variant="success" size="sm" asChild>
              <Link href="/documentos-internos/new"><Plus className="h-4 w-4" />Novo Documento</Link>
            </Button>
          )}
          {podeGerenciar && (
            <Button variant="outline" size="icon-sm" asChild title="Tipos e processos">
              <Link href="/documentos-internos/configuracoes"><Settings className="h-4 w-4" /></Link>
            </Button>
          )}
      </>}>
        <h1 className="truncate">Documentos Internos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Documentos Internos</span>
        </p>
      </PageHeaderBar>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={situacao || '__all__'} onValueChange={(v) => { setSituacao(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-card"><SelectValue placeholder="Situação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as situações</SelectItem>
                {SITUACAO_OPCOES.map((s) => <SelectItem key={s} value={s}>{DOCUMENTO_SITUACAO_LABEL[s as keyof typeof DOCUMENTO_SITUACAO_LABEL]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tipoId || '__all__'} onValueChange={(v) => { setTipoId(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[160px] text-xs bg-card"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={processoId || '__all__'} onValueChange={(v) => { setProcessoId(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[190px] text-xs bg-card"><SelectValue placeholder="Processo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os processos</SelectItem>
                {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {filtrosAtivos > 0 && (
              <Button variant="outline" size="xs" onClick={() => { setSituacao(''); setTipoId(''); setProcessoId(''); setPage(1) }}>
                Limpar ({filtrosAtivos})
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar pelo nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60px]">Nº</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="hidden md:table-cell w-[150px]">Tipo</TableHead>
              <TableHead className="hidden lg:table-cell w-[200px]">Processo</TableHead>
              <TableHead className="w-[70px] text-center">Rev.</TableHead>
              <TableHead className="w-[150px]">Situação</TableHead>
              <TableHead className="hidden sm:table-cell w-[110px]">Data</TableHead>
              <TableHead className="w-[110px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum documento encontrado.
              </TableCell></TableRow>
            ) : (
              data.data.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(`/documentos-internos/${d.id}`)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{d.legacyId ?? '—'}</TableCell>
                  <TableCell className="font-medium text-sm">
                    <span className="block truncate" title={d.nome}>{d.nome}</span>
                    {/* O total de revisões é o que diz se o documento tem história —
                        num módulo de ISO, isso conta tanto quanto o nome. */}
                    <span className="text-[11px] text-muted-foreground">
                      {/* O plural troca a sílaba inteira: revisão → revisões.
                          Concatenar o sufixo produzia "revisãoões". */}
                      {d._count.versoes} {d._count.versoes === 1 ? 'revisão' : 'revisões'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate">{d.tipo?.nome ?? '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate">{d.processo?.nome ?? '—'}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{d.versaoAtual?.revisao ?? '—'}</TableCell>
                  <TableCell>
                    {d.versaoAtual && (
                      <Badge variant="outline" className={`text-[10px] ${SITUACAO_COLORS[d.versaoAtual.situacao] ?? ''}`}>
                        {DOCUMENTO_SITUACAO_LABEL[d.versaoAtual.situacao as keyof typeof DOCUMENTO_SITUACAO_LABEL] ?? d.versaoAtual.situacao}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(d.versaoAtual?.dataVersao)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {d.versaoAtual && (
                        <Button variant="soft" size="icon-sm" asChild title="Baixar a versão vigente">
                          <a href={`${getApiUrl()}${d.versaoAtual.arquivoPath}`} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/documentos-internos/${d.id}`)} title="Abrir">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {podeExcluir && (
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(d)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && (
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
    </div>
  )
}
