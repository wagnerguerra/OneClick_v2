'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Plus, ShoppingCart, Trash2, Pencil,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import {
  Button, Input, Badge, Card,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { STATUS_COMPRA_LABELS } from '@saas/types'
import { BackButton } from '@/components/ui/back-button'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'
const PAGE_SIZES = [10, 20, 50]

const STATUS_COLORS: Record<string, string> = {
  NOVO: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700',
  AGUARDANDO_APROVACAO: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800',
  APROVADO: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-800',
  REPROVADO: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-800',
  RECEBIDO: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-800',
  AVALIADO: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800',
  CANCELADO: 'bg-muted text-muted-foreground border-border',
}
const STATUS_OPCOES = ['NOVO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REPROVADO', 'RECEBIDO', 'AVALIADO']

interface CompraRow {
  id: string
  code: number
  status: string
  fornecedor: { id: string; razaoSocial: string } | null
  total: number
  qtdItens: number
  createdAt: string
  _count: { anexos: number; mensagens: number }
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function AquisicoesPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [data, setData] = useState<{ data: CompraRow[]; total: number; totalPages: number; hasNext: boolean; hasPrev: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await (trpc.compra as any).list.query({ page, limit, search: debounced || undefined, status: status || undefined })
      setData(res)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }, [page, limit, debounced, status])
  useEffect(() => { fetchData() }, [fetchData])

  async function handleDelete(id: string, code: number) {
    const ok = await alerts.confirm({ title: `Excluir o pedido #${code}?`, text: 'O pedido será arquivado.', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try { await (trpc.compra as any).delete.mutate({ id }); alerts.success('Excluído', 'Pedido arquivado.'); fetchData() }
    catch (e) { alerts.error('Erro', (e as Error).message) }
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
            <ShoppingCart className="h-6 w-6" />
          </div>
          <div>
            <h1>Aquisições</h1>
            <p className="text-sm text-muted-foreground">Pedidos de compra e avaliação de fornecimento</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" asChild><Link href="/aquisicoes/new"><Plus className="h-4 w-4" />Novo Pedido</Link></Button>
          <BackButton href="/dashboard" label="Voltar" />
        </div>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Select value={status || '__all__'} onValueChange={(v) => { setStatus(v === '__all__' ? '' : v); setPage(1) }}>
              <SelectTrigger className="h-8 w-[190px] text-xs bg-card"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os status</SelectItem>
                {STATUS_OPCOES.map((s) => <SelectItem key={s} value={s}>{STATUS_COMPRA_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
              <SelectTrigger className="h-8 w-[60px] text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>{PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-w-xs w-full sm:w-auto">
            <Input placeholder="Buscar por nº ou fornecedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs bg-card" />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[70px]">Nº</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="w-[170px]">Status</TableHead>
              <TableHead className="hidden md:table-cell w-[80px] text-center">Itens</TableHead>
              <TableHead className="hidden sm:table-cell w-[140px] text-right">Total</TableHead>
              <TableHead className="hidden lg:table-cell w-[110px]">Data</TableHead>
              <TableHead className="w-[90px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10">
                <div className="flex items-center justify-center gap-2 text-muted-foreground"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />Carregando...</div>
              </TableCell></TableRow>
            ) : !data?.data.length ? (
              <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhum pedido encontrado</TableCell></TableRow>
            ) : (
              data.data.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/aquisicoes/${c.id}`)}>
                  <TableCell className="font-mono text-muted-foreground text-xs">{c.code}</TableCell>
                  <TableCell className="font-medium text-sm">{c.fornecedor?.razaoSocial ?? '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[c.status] ?? ''}`}>{STATUS_COMPRA_LABELS[c.status] ?? c.status}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-center text-sm text-muted-foreground">{c.qtdItens}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right text-sm tabular-nums">{brl(c.total)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground tabular-nums">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="soft-info" size="icon-sm" onClick={() => router.push(`/aquisicoes/${c.id}`)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => handleDelete(c.id, c.code)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data && (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/20 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{data.total === 0 ? 'Mostrando 0 registros' : (<>Mostrando <span className="font-medium">{startRecord}</span> a <span className="font-medium">{endRecord}</span> de <span className="font-medium">{data.total}</span> registros</>)}</p>
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
