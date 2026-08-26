'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, FileBox, Trash2, Pencil, Loader2, ExternalLink,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const PAGE_SIZES = [10, 20, 50]

interface Row {
  id: string
  legacyId: number | null
  nome: string
  processo: { id: string; nome: string } | null
  versaoAtual: { id: string; revisao: number; dataRegistro: string; emissor: string | null; link: string | null } | null
  _count: { versoes: number }
}
interface Opcao { id: string; nome: string }

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

const ehUrl = (s: string | null | undefined) => !!s && /^https?:\/\//i.test(s.trim())

/**
 * Documentos Externos da Qualidade — normas, leis e documentos de terceiros
 * que o SGQ controla, versionados. Port do `sgq_externos` do v1.
 */
export default function DocumentosExternosPage() {
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'documentos-externos')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: Row[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [processos, setProcessos] = useState<Opcao[]>([])

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    ;(trpc.documentoExterno as any).listarProcessos.query().then(setProcessos).catch(() => setProcessos([]))
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.documentoExterno as any).listar.query({
        page, limit,
        search: debounced || undefined,
        processoId: processoId || undefined,
      })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, processoId])
  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(d: Row) {
    const ok = await alerts.confirm({
      title: `Excluir "${d.nome}"?`,
      text: d._count.versoes === 1
        ? 'O documento e a sua única revisão serão apagados.'
        : `O documento e as suas ${d._count.versoes} revisões serão apagados.`,
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.documentoExterno as any).excluir.mutate({ id: d.id })
      alerts.success('Excluído', 'Documento removido.')
      fetchData()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const totalPages = data?.totalPages ?? 1
  const startRecord = data ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <FileBox className="h-6 w-6" />
          </div>
          <div>
            <h1>Documentos Externos</h1>
            <p className="text-sm text-muted-foreground">Normas, leis e documentos de terceiros controlados pelo SGQ, com histórico de revisões</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {podeEscrever && (
            <Button variant="success" size="sm" asChild>
              <Link href="/documentos-externos/new"><Plus className="h-4 w-4" />Novo Documento</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={processoId || '__all__'} onValueChange={(v) => { setProcessoId(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[190px] text-xs bg-card"><SelectValue placeholder="Processo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os processos</SelectItem>
                {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {processoId && (
              <Button variant="outline" size="xs" onClick={() => { setProcessoId(''); setPage(1) }}>
                Limpar (1)
              </Button>
            )}
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por nome ou emissor..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[55px]">Nº</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="hidden md:table-cell w-[170px]">Emissor</TableHead>
              <TableHead className="hidden lg:table-cell w-[190px]">Processo</TableHead>
              <TableHead className="w-[70px] text-center">Rev.</TableHead>
              <TableHead className="hidden sm:table-cell w-[105px]">Data</TableHead>
              <TableHead className="w-[110px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
              </TableCell></TableRow>
            ) : !data || data.data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum documento encontrado.
              </TableCell></TableRow>
            ) : (
              data.data.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => router.push(`/documentos-externos/${d.id}`)}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">{d.legacyId ?? '—'}</TableCell>
                  <TableCell className="font-medium text-sm">
                    <span className="block truncate" title={d.nome}>{d.nome}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {d._count.versoes} {d._count.versoes === 1 ? 'revisão' : 'revisões'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate">{d.versaoAtual?.emissor ?? '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground truncate">{d.processo?.nome ?? '—'}</TableCell>
                  <TableCell className="text-center text-sm tabular-nums">{d.versaoAtual?.revisao ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground tabular-nums">{dataBR(d.versaoAtual?.dataRegistro)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {ehUrl(d.versaoAtual?.link) && (
                        <Button variant="soft" size="icon-sm" asChild title="Abrir o documento no emissor">
                          <a href={d.versaoAtual!.link!.trim()} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/documentos-externos/${d.id}`)} title="Abrir">
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
