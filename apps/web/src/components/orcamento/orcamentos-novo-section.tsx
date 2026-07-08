'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileBarChart, Loader2, ExternalLink } from 'lucide-react'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

const MODULE_COLOR = 'var(--mod-comercial, #10b981)'

interface OrcItem { descricao: string | null }
interface OrcNovo {
  id: string; numero: number; status: string; totalGeral: string | number | null
  createdAt: string; arquivado: boolean; tipo: string | null; itens: OrcItem[]
}

const fmtMoeda = (v: unknown) => {
  const n = Number(v); if (!v || isNaN(n) || n === 0) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
const fmtData = (v: string | null) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'
const servicoLabel = (o: OrcNovo) => {
  if (!o.itens?.length) return '—'
  const first = o.itens[0]?.descricao || 'Serviço'
  return o.itens.length > 1 ? `${first} +${o.itens.length - 1}` : first
}

const STATUS_LABEL: Record<string, string> = {
  NOVO: 'Novo', A_ENVIAR: 'A enviar', ENVIADO: 'Enviado', APROVADO: 'Aprovado',
  LIBERADO: 'Liberado', FINALIZADO: 'Finalizado', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado',
}
const STATUS_STYLE: Record<string, string> = {
  NOVO: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
  A_ENVIAR: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  ENVIADO: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  APROVADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  LIBERADO: 'bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  FINALIZADO: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  ENCERRADO: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  CANCELADO: 'bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400',
}

/**
 * Histórico de orçamentos do SISTEMA NOVO do cliente. Mostra TODOS os status
 * (inclusive Encerrado/Recusado/Cancelado) — o histórico do cliente não filtra
 * nada. Clicar na linha abre o orçamento no módulo.
 */
export function OrcamentosNovoSection({ clienteId }: { clienteId?: string | null }) {
  const router = useRouter()
  const [orcs, setOrcs] = useState<OrcNovo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!clienteId) { setOrcs([]); return }
    let cancel = false
    setLoading(true)
    ;(trpc.orcamento as any).listOrcamentosDoCliente.query({ clienteId })
      .then((r: OrcNovo[]) => { if (!cancel) setOrcs(r || []) })
      .catch(() => { if (!cancel) setOrcs([]) })
      .finally(() => { if (!cancel) setLoading(false) })
    return () => { cancel = true }
  }, [clienteId])

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando orçamentos…
    </div>
  )
  if (orcs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
      <FileBarChart className="h-10 w-10 mb-2 opacity-20" />
      <p className="text-sm">Nenhum orçamento no sistema novo.</p>
    </div>
  )

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <FileBarChart className="h-4 w-4" style={{ color: MODULE_COLOR }} />
        <span className="text-[13px] font-semibold">Orçamentos</span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{orcs.length}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">todos os status</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-semibold px-4 py-2 w-[80px]">Nº</th>
              <th className="text-left font-semibold px-2 py-2 w-[120px]">Status</th>
              <th className="text-left font-semibold px-2 py-2 w-[100px]">Data</th>
              <th className="text-left font-semibold px-2 py-2">Serviço</th>
              <th className="text-right font-semibold px-2 py-2 w-[130px]">Valor</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {orcs.map(o => (
              <tr
                key={o.id}
                onClick={() => router.push(`/orcamentos/${o.id}`)}
                className={cn('border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/30 transition-colors', o.arquivado && 'opacity-60')}
              >
                <td className="px-4 py-2 font-semibold tabular-nums">#{o.numero}</td>
                <td className="px-2 py-2">
                  <span className={cn('text-[11px] px-2 py-0.5 rounded-full whitespace-nowrap font-medium', STATUS_STYLE[o.status] || 'bg-muted text-muted-foreground')}>
                    {STATUS_LABEL[o.status] || o.status}
                  </span>
                  {o.arquivado && <span className="ml-1 text-[10px] text-muted-foreground">arquivado</span>}
                </td>
                <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtData(o.createdAt)}</td>
                <td className="px-2 py-2 text-xs text-foreground/90"><span className="line-clamp-1">{servicoLabel(o)}</span></td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 whitespace-nowrap">{fmtMoeda(o.totalGeral)}</td>
                <td className="px-2 py-2 text-muted-foreground"><ExternalLink className="h-3.5 w-3.5" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
