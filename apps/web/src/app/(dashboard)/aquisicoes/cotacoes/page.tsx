'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, FileSpreadsheet, Loader2, Trash2, ShoppingCart,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Badge, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { STATUS_COTACAO_LABELS } from '@saas/types'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const PAGE_SIZES = [10, 20, 50]

const STATUS_COLORS: Record<string, string> = {
  RASCUNHO: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700',
  ENVIADA: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  APURACAO: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  CONVERTIDA: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  CANCELADA: 'bg-muted text-muted-foreground border-border',
}
const STATUS_OPCOES = ['RASCUNHO', 'ENVIADA', 'APURACAO', 'CONVERTIDA', 'CANCELADA']

interface CotacaoRow {
  id: string
  code: number
  status: string
  titulo: string | null
  prazoResposta: string | null
  createdAt: string
  qtdItens: number
  qtdItensPremiados: number
  qtdFornecedores: number
  qtdRespostas: number
  fornecedores: string[]
  pedidosGerados: Array<{ id: string; code: number }>
}
interface Pagina { data: CotacaoRow[]; total: number; page: number; limit: number; totalPages: number }

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

export default function CotacoesPage() {
  const router = useRouter()
  const [data, setData] = useState<Pagina | null>(null)
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.compra as any).listCotacoes.query({ page, limit, search: debounced || undefined, status: status || undefined })
      .then((d: Pagina) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [page, limit, debounced, status])
  useEffect(() => { carregar() }, [carregar])

  async function nova() {
    setCriando(true)
    try {
      const res = await (trpc.compra as any).createCotacao.mutate({})
      router.push(`/aquisicoes/cotacoes/${res.id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) } finally { setCriando(false) }
  }

  async function excluir(c: CotacaoRow) {
    const ok = await alerts.confirm({
      title: `Excluir a cotação #${c.code}?`,
      text: 'Ela sai da lista. Os pedidos já gerados não são afetados.',
      icon: 'warning', confirmText: 'Excluir',
    })
    if (!ok) return
    try { await (trpc.compra as any).deleteCotacao.mutate({ id: c.id }); carregar() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  const startRecord = data && data.total ? (page - 1) * limit + 1 : 0
  const endRecord = data ? Math.min(page * limit, data.total) : 0
  const totalPages = data?.totalPages ?? 1
  const paginas = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    const inicio = Math.max(1, Math.min(page - 2, totalPages - 4))
    return inicio + i
  }).filter((p) => p >= 1 && p <= totalPages)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1>Cotações</h1>
            <p className="text-sm text-muted-foreground">Peça preços a vários fornecedores antes de montar o pedido</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button variant="success" size="sm" onClick={nova} disabled={criando}>
            {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Nova Cotação
          </Button>
          <BackButton href="/aquisicoes" label="Voltar" />
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Select value={status || '__all__'} onValueChange={(v) => { setStatus(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[190px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                {STATUS_OPCOES.map((s) => <SelectItem key={s} value={s}>{STATUS_COTACAO_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:w-72">
            <Input placeholder="Buscar por nº ou título..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <div className="relative">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[70px] text-xs font-semibold uppercase tracking-wider">Nº</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Título</TableHead>
                <TableHead className="w-[150px] text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="hidden md:table-cell w-[110px] text-xs font-semibold uppercase tracking-wider">Itens</TableHead>
                <TableHead className="hidden md:table-cell w-[130px] text-xs font-semibold uppercase tracking-wider">Respostas</TableHead>
                <TableHead className="hidden lg:table-cell w-[110px] text-xs font-semibold uppercase tracking-wider">Prazo</TableHead>
                <TableHead className="hidden lg:table-cell w-[130px] text-xs font-semibold uppercase tracking-wider">Pedidos</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell></TableRow>
              ) : !data?.data.length ? (
                <TableRow><TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  Nenhuma cotação encontrada.
                </TableCell></TableRow>
              ) : data.data.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/aquisicoes/cotacoes/${c.id}`)}>
                  <TableCell className="text-sm font-medium tabular-nums">#{c.code}</TableCell>
                  <TableCell className="truncate text-sm">
                    {c.titulo || <span className="text-muted-foreground">sem título</span>}
                    {c.fornecedores.length > 0 && (
                      <p className="truncate text-[11px] text-muted-foreground">{c.fornecedores.join(' · ')}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[11px]', STATUS_COLORS[c.status])}>
                      {STATUS_COTACAO_LABELS[c.status] ?? c.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm tabular-nums">
                    {c.qtdItensPremiados > 0
                      ? <span>{c.qtdItensPremiados}/{c.qtdItens} <span className="text-[11px] text-muted-foreground">premiados</span></span>
                      : c.qtdItens}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm tabular-nums">
                    {c.qtdRespostas}/{c.qtdFornecedores}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm tabular-nums">{fmtData(c.prazoResposta)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {c.pedidosGerados.length ? (
                      <div className="flex flex-wrap gap-1">
                        {c.pedidosGerados.map((p) => (
                          <Link key={p.id} href={`/aquisicoes/${p.id}`} onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums hover:bg-muted/70">
                            <ShoppingCart className="h-3 w-3" />{p.code}
                          </Link>
                        ))}
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Button variant="soft-destructive" size="icon-sm"
                      onClick={(e) => { e.stopPropagation(); excluir(c) }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {data && data.total > 0 && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Mostrando {startRecord} a {endRecord} de {data.total} registro(s)
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={page === 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              {paginas.map((p) => (
                <Button key={p} variant={p === page ? 'soft' : 'outline'} size="icon-xs" onClick={() => setPage(p)}>{p}</Button>
              ))}
              <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              <Button variant="outline" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
