'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2, Download, RotateCw, X, CheckCircle2,
  AlertOctagon, ExternalLink,
} from 'lucide-react'
import {
  Button, Card, cn,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-fiscal, #0369a1)'

const ITEM_STATUS_CHIP: Record<string, string> = {
  OK:         'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  DUPLICADO:  'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/30 dark:text-sky-300',
  INVALIDO:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
  ERRO_PDF:   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300',
}

const STATUS_CHIP: Record<string, string> = {
  PROCESSANDO: 'bg-sky-50 text-sky-700 border-sky-200',
  CONCLUIDO:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELADO:   'bg-rose-50 text-rose-700 border-rose-200',
}

export default function LoteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const [lote, setLote] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>('__all__')

  const fetchLote = useCallback(async () => {
    try {
      const l = await (trpc.danfe as any).lote.getById.query({ id })
      setLote(l)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { void fetchLote() }, [fetchLote])

  // SSE pra atualizar progresso em tempo real
  useEffect(() => {
    if (!id) return
    const es = new EventSource(`${getApiUrl()}/api/danfe/lote/events?loteId=${id}`)
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    es.onmessage = () => {
      // Debounce 300ms — durante batch grande, SSE dispara muito rápido
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => { void fetchLote() }, 300)
    }
    return () => {
      es.close()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [id, fetchLote])

  async function handleCancelar() {
    const ok = await alerts.confirm({
      title: 'Cancelar lote',
      text: 'Itens já processados serão mantidos. O processamento dos demais será interrompido.',
      confirmText: 'Cancelar lote',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await trpcMutate('danfe.lote.cancel', { id })
      await alerts.success('Cancelado', '')
      void fetchLote()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleReprocessar() {
    try {
      const r = await trpcMutate<{ regenerados: number; totalComErro: number }>('danfe.lote.reprocessarErros', { id })
      await alerts.success('Reprocessamento', `${r.regenerados} de ${r.totalComErro} foram regenerados com sucesso.`)
      void fetchLote()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (loading) return <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
  if (!lote) return <div className="py-20 text-center text-muted-foreground">Lote não encontrado.</div>

  const pct = lote.totalXmls > 0 ? Math.round((lote.processados / lote.totalXmls) * 100) : 0
  const itens = lote.itens ?? []
  const filteredItens = filterStatus === '__all__' ? itens : itens.filter((i: any) => i.status === filterStatus)

  return (
    <div className="space-y-0 pb-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {lote.status === 'CONCLUIDO' && lote.sucesso > 0 && (
            <a href={`${getApiUrl()}/api/danfe/lote/${id}/zip`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Baixar ZIP dos PDFs
              </Button>
            </a>
          )}
          {lote.status === 'CONCLUIDO' && lote.erros > 0 && (
            <Button size="sm" variant="outline" onClick={handleReprocessar} className="gap-1.5">
              <RotateCw className="h-3.5 w-3.5" /> Reprocessar erros
            </Button>
          )}
          {lote.status === 'PROCESSANDO' && (
            <Button size="sm" variant="outline" onClick={handleCancelar} className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          )}
          <BackButton href="/danfe/lotes" />
      </>}>
        <h1 className="truncate">{lote.nome}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Fiscal</span>
          <span className="text-muted-foreground/50">›</span>
          <span>DANFE (NFe → PDF)</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Lote · {new Date(lote.iniciadoEm).toLocaleString('pt-BR')}</span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase border', STATUS_CHIP[lote.status])}>
            {lote.status === 'PROCESSANDO' && <Loader2 className="h-3 w-3 animate-spin" />}
            {lote.status}
          </span>
        </div>
        {/* Progresso */}
        <div className="mt-2 max-w-[400px]">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>{lote.processados} / {lote.totalXmls} processados</span>
            <span className="tabular-nums font-semibold">{pct}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: MODULE_COLOR }} />
          </div>
          <div className="flex gap-4 mt-2 text-[11px]">
            <span className="text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="inline h-3 w-3 mr-1" />{lote.sucesso} OK</span>
            {lote.erros > 0 && <span className="text-rose-700 dark:text-rose-400"><AlertOctagon className="inline h-3 w-3 mr-1" />{lote.erros} erros</span>}
          </div>
        </div>
      </PageHeaderBar>

      {/* Tabela de itens */}
      <Card>
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
          <h5 className="text-[13px] font-semibold">Itens do lote</h5>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-[180px] text-xs bg-card"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              <SelectItem value="OK">OK</SelectItem>
              <SelectItem value="DUPLICADO">Duplicado</SelectItem>
              <SelectItem value="INVALIDO">Inválido</SelectItem>
              <SelectItem value="ERRO_PDF">Erro PDF</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Arquivo</TableHead>
              <TableHead className="text-xs">Chave / NFe</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Mensagem</TableHead>
              <TableHead className="text-xs text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItens.length === 0 ? (
              <TableRow><TableCell colSpan={5}><div className="text-center py-8 text-muted-foreground text-sm">{lote.status === 'PROCESSANDO' ? 'Aguardando processamento...' : 'Nenhum item neste filtro'}</div></TableCell></TableRow>
            ) : filteredItens.map((item: any) => (
              <TableRow key={item.id} className="hover:bg-muted/40">
                <TableCell className="text-[11px] font-mono max-w-[200px] truncate" title={item.fileName}>{item.fileName}</TableCell>
                <TableCell>
                  {item.chave ? (
                    <div className="text-[11px]">
                      {item.danfe && <p className="font-medium">{item.danfe.emitenteRazao} · NFe {item.danfe.numero}</p>}
                      <p className="font-mono text-muted-foreground">{item.chave}</p>
                    </div>
                  ) : <span className="text-[10px] text-muted-foreground italic">—</span>}
                </TableCell>
                <TableCell>
                  <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border', ITEM_STATUS_CHIP[item.status])}>
                    {item.status}
                  </span>
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground max-w-[280px] truncate" title={item.mensagem ?? ''}>{item.mensagem ?? '—'}</TableCell>
                <TableCell className="text-right">
                  {item.danfeId && (
                    <Link href={`/danfe/${item.danfeId}`}>
                      <Button variant="ghost" size="icon-sm" className="h-7 w-7" title="Ver DANFE"><ExternalLink className="h-3.5 w-3.5" /></Button>
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
