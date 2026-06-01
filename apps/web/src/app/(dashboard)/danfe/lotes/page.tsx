'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  History, Loader2, Eye, ChevronLeft, ChevronRight,
  CheckCircle2, AlertOctagon, RotateCw,
} from 'lucide-react'
import {
  Button, Card, cn, Badge,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

const STATUS_CHIP: Record<string, string> = {
  PROCESSANDO: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300',
  CONCLUIDO:   'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  CANCELADO:   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300',
}

export default function LotesPage() {
  const router = useRouter()
  const [data, setData] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 30
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await (trpc.danfe as any).lote.list.query({ page, limit })
      setData(r.data); setTotal(r.total)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { void fetchData() }, [fetchData])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: MODULE_COLOR }}>
            <History className="h-6 w-6" />
          </div>
          <div>
            <h1>Lotes de DANFE</h1>
            <p className="text-sm text-muted-foreground">Histórico de uploads em lote</p>
          </div>
        </div>
        <BackButton href="/danfe" />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Nome</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
              <TableHead className="text-xs text-right">Progresso</TableHead>
              <TableHead className="text-xs text-center">Sucesso</TableHead>
              <TableHead className="text-xs text-center">Erros</TableHead>
              <TableHead className="text-xs">Início</TableHead>
              <TableHead className="text-xs">Usuário</TableHead>
              <TableHead className="text-xs text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8}><div className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div></TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8}><div className="text-center py-10 text-muted-foreground"><History className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum lote ainda.</p></div></TableCell></TableRow>
            ) : data.map(lote => {
              const pct = lote.totalXmls > 0 ? Math.round((lote.processados / lote.totalXmls) * 100) : 0
              return (
                <TableRow key={lote.id} className="hover:bg-muted/40 cursor-pointer" onClick={() => router.push(`/danfe/lotes/${lote.id}`)}>
                  <TableCell className="text-[12px] font-medium max-w-[300px] truncate" title={lote.nome}>{lote.nome}</TableCell>
                  <TableCell className="text-center">
                    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', STATUS_CHIP[lote.status])}>
                      {lote.status === 'PROCESSANDO' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                      {lote.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="text-[11px] tabular-nums">{lote.processados}/{lote.totalXmls} ({pct}%)</div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden mt-1 w-[80px] ml-auto">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: MODULE_COLOR }} />
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-[12px] tabular-nums font-medium text-emerald-700 dark:text-emerald-400">{lote.sucesso}</TableCell>
                  <TableCell className="text-center text-[12px] tabular-nums font-medium text-rose-700 dark:text-rose-400">{lote.erros || '—'}</TableCell>
                  <TableCell className="text-[11px] text-muted-foreground tabular-nums">{new Date(lote.iniciadoEm).toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-[11px]">{lote.uploadedBy?.name ?? '—'}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Link href={`/danfe/lotes/${lote.id}`}>
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7"><Eye className="h-4 w-4" /></Button>
                    </Link>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-muted/20">
          <div className="text-[11px] text-muted-foreground tabular-nums">{total === 0 ? '0 lotes' : `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} de ${total}`}</div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-xs" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
            <span className="text-[11px] mx-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="ghost" size="icon-xs" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
