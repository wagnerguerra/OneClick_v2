'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  FileText, Loader2, Download, Trash2, RefreshCw,
} from 'lucide-react'
import { Button, Card, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'

const STATUS_CHIP: Record<string, string> = {
  AUTORIZADA: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
  CANCELADA:  'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300',
  DENEGADA:   'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300',
  INUTILIZADA: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950/30 dark:text-slate-300',
}

function fmtBRL(v: string | number): string {
  const n = typeof v === 'string' ? Number(v) : v
  if (isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtCnpj(doc: string): string {
  const digits = doc.toUpperCase().replace(/[^0-9A-Z]/g, '') // preserva letras (CNPJ alfanumérico)
  if (digits.length === 14) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`
  if (digits.length === 11) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9,11)}`
  return doc
}

export default function DanfeDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [danfe, setDanfe] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [regerando, setRegerando] = useState(false)

  useEffect(() => {
    setLoading(true)
    void (async () => {
      try {
        const d = await (trpc.danfe as any).getById.query({ id })
        setDanfe(d)
      } catch (e) {
        alerts.error('Erro', (e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  async function handleDelete() {
    const ok = await alerts.confirm({
      title: 'Excluir DANFE',
      text: `NFe ${danfe.numero}/${danfe.serie} será excluída permanentemente.`,
      confirmText: 'Excluir',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await trpcMutate('danfe.delete', { id })
      await alerts.success('Excluída', '')
      router.push('/danfe')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleRegerarPdf() {
    setRegerando(true)
    try {
      await trpcMutate('danfe.regerarPdf', { id })
      await alerts.success('Regerado', 'PDF atualizado.')
      // força reload do iframe
      const iframe = document.getElementById('danfe-pdf-iframe') as HTMLIFrameElement | null
      if (iframe) iframe.src = iframe.src
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setRegerando(false) }
  }

  if (loading) return <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
  if (!danfe) return <div className="py-20 text-center text-muted-foreground">DANFE não encontrada.</div>

  return (
    <div className="space-y-0 pb-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <a href={`${getApiUrl()}/api/danfe/${id}/pdf`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Baixar PDF
            </Button>
          </a>
          <a href={`${getApiUrl()}/api/danfe/${id}/xml`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Baixar XML
            </Button>
          </a>
          <Button size="sm" variant="outline" onClick={handleRegerarPdf} disabled={regerando} className="gap-1.5">
            {regerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Regerar PDF
          </Button>
          <Button size="sm" variant="outline" onClick={handleDelete} className="gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50">
            <Trash2 className="h-3.5 w-3.5" /> Excluir
          </Button>
          <BackButton href="/danfe" />
      </>}>
        <h1 className="truncate">NFe {danfe.numero}/{danfe.serie}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Fiscal</span>
          <span className="text-muted-foreground/50">›</span>
          <span>DANFE (NFe → PDF)</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono">{danfe.chave}</span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase border', STATUS_CHIP[danfe.status] ?? STATUS_CHIP.AUTORIZADA)}>
            {danfe.status}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 px-2.5 py-0.5 text-[11px] font-medium uppercase border border-slate-200 dark:border-slate-700">
            Modelo {danfe.modelo} ({danfe.modelo === '55' ? 'NFe' : 'NFCe'})
          </span>
          {danfe.protocolo && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 px-2.5 py-0.5 text-[11px] font-medium uppercase">
              Protocolo {danfe.protocolo}
            </span>
          )}
        </div>
      </PageHeaderBar>

      {/* Cards de metadata + viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1 p-4 space-y-3 h-fit">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Emitente</p>
            <p className="text-[13px] font-medium">{danfe.emitenteRazao}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(danfe.emitenteCnpj)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Destinatário</p>
            {danfe.destRazao ? (
              <>
                <p className="text-[13px] font-medium">{danfe.destRazao}</p>
                {danfe.destCnpjCpf && <p className="text-[11px] text-muted-foreground font-mono">{fmtCnpj(danfe.destCnpjCpf)}</p>}
              </>
            ) : <p className="text-[12px] text-muted-foreground italic">Não informado</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Valor Total</p>
            <p className="text-[18px] font-bold tabular-nums">{fmtBRL(danfe.valorTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Data de Emissão</p>
            <p className="text-[12px]">{new Date(danfe.dataEmissao).toLocaleString('pt-BR')}</p>
          </div>
          {danfe.dataAutorizacao && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Autorização SEFAZ</p>
              <p className="text-[12px]">{new Date(danfe.dataAutorizacao).toLocaleString('pt-BR')}</p>
            </div>
          )}
          {danfe.uploadedBy && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Enviado por</p>
              <p className="text-[12px]">{danfe.uploadedBy.name}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(danfe.createdAt).toLocaleString('pt-BR')}</p>
            </div>
          )}
          {danfe.lote && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lote de origem</p>
              <a href={`/danfe/lotes/${danfe.lote.id}`} className="text-[12px] text-sky-600 hover:underline">{danfe.lote.nome}</a>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2 overflow-hidden h-[800px]">
          {danfe.pdfKey ? (
            <iframe id="danfe-pdf-iframe" src={`${getApiUrl()}/api/danfe/${id}/pdf`} className="w-full h-full border-0" title="DANFE PDF" />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
              <FileText className="h-10 w-10 opacity-30" />
              <p className="text-sm">PDF não disponível</p>
              <Button size="sm" variant="outline" onClick={handleRegerarPdf} disabled={regerando} className="gap-1.5 mt-2">
                {regerando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Gerar PDF agora
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
