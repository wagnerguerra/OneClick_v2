'use client'

/**
 * Relatório de Tickets — /configuracoes → "Relatório de Tickets".
 * Mesma pegada do Relatório de QA, mas lendo os tickets do Helpdesk em aberto.
 * Permite mudar o status (dá baixa) direto daqui e abrir o ticket. Master-only
 * (a página já gateia). Fonte: trpc.helpdesk.relatorio.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import {
  Button, Input, Badge, cn,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@saas/ui'
import {
  HELPDESK_STATUS, HELPDESK_STATUS_LABELS, HELPDESK_PRIORIDADE_LABELS, HELPDESK_TIPO_LABELS,
  type HelpdeskStatus, type HelpdeskPrioridade,
} from '@saas/types'
import { Headphones, Loader2, ChevronDown, ChevronRight, MessageSquare, Paperclip, ExternalLink, AlertTriangle } from 'lucide-react'

type TicketRel = {
  id: string
  numero: number
  titulo: string
  descricao: string | null
  tipo: 'INCIDENTE' | 'REQUISICAO' | 'DUVIDA' | 'MELHORIA'
  prioridade: HelpdeskPrioridade
  status: HelpdeskStatus
  prazoSla: string | null
  createdAt: string
  solicitante: { name: string } | null
  solicitanteExternoNome: string | null
  responsavel: { name: string } | null
  categoria: { nome: string; parent: { nome: string } | null } | null
  _count: { mensagens: number; anexos: number }
}

const PRIO_STYLE: Record<HelpdeskPrioridade, string> = {
  URGENTE: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  ALTA: 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  MEDIA: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  BAIXA: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
}
const STATUS_STYLE: Record<HelpdeskStatus, string> = {
  NOVO: 'text-sky-600',
  EM_ANDAMENTO: 'text-violet-600',
  AGUARDANDO_AUDITORIA: 'text-amber-600',
  RESOLVIDO: 'text-cyan-600',
  CONCLUIDO: 'text-emerald-600',
  CANCELADO: 'text-muted-foreground',
}
const PRIO_ORDER: Record<HelpdeskPrioridade, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 }
const resolvido = (s: HelpdeskStatus) => s === 'CONCLUIDO' || s === 'CANCELADO'

export function TicketsSection() {
  const [itens, setItens] = useState<TicketRel[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>('__all__')
  const [filtroPrio, setFiltroPrio] = useState<string>('__all__')
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await (trpc.helpdesk as any).relatorio.query() as TicketRel[]
      setItens(data)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  async function setStatus(id: string, status: HelpdeskStatus) {
    const antes = itens
    setItens(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    try { await (trpc.helpdesk as any).update.mutate({ id, data: { status } }) }
    catch (e) { setItens(antes); alerts.error('Erro', (e as Error).message) }
  }

  const num = (t: TicketRel) => `#HLP${String(t.numero).padStart(4, '0')}`
  const solicitanteNome = (t: TicketRel) => t.solicitante?.name || t.solicitanteExternoNome || '—'
  const categoriaNome = (t: TicketRel) => t.categoria ? `${t.categoria.parent ? t.categoria.parent.nome + ' › ' : ''}${t.categoria.nome}` : null
  const slaEstourado = (t: TicketRel) => !!t.prazoSla && new Date(t.prazoSla).getTime() < Date.now() && !resolvido(t.status)

  const filtrados = itens.filter(t => {
    if (filtroStatus !== '__all__' && t.status !== filtroStatus) return false
    if (filtroPrio !== '__all__' && t.prioridade !== filtroPrio) return false
    if (busca && !`${num(t)} ${t.titulo} ${t.descricao ?? ''} ${solicitanteNome(t)} ${categoriaNome(t) ?? ''}`.toLowerCase().includes(busca.toLowerCase())) return false
    return true
  }).sort((a, b) => PRIO_ORDER[a.prioridade] - PRIO_ORDER[b.prioridade] || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())

  const contagem = {
    total: itens.length,
    urgentesAltas: itens.filter(t => t.prioridade === 'URGENTE' || t.prioridade === 'ALTA').length,
    sla: itens.filter(slaEstourado).length,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header interno */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border">
        <div>
          <h4 className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
            <Headphones className="h-4 w-4" /> Relatório de Tickets
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {contagem.total} em aberto · {contagem.urgentesAltas} de prioridade alta/urgente · {contagem.sla} com SLA estourado
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <Loader2 className={cn('h-4 w-4', loading && 'animate-spin')} /> Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-border bg-muted/20">
        <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="h-8 text-xs w-[220px]" />
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            {HELPDESK_STATUS.filter(s => s !== 'CONCLUIDO' && s !== 'CANCELADO').map(s => (
              <SelectItem key={s} value={s}>{HELPDESK_STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroPrio} onValueChange={setFiltroPrio}>
          <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Prioridade</SelectItem>
            <SelectItem value="URGENTE">Urgente</SelectItem>
            <SelectItem value="ALTA">Alta</SelectItem>
            <SelectItem value="MEDIA">Média</SelectItem>
            <SelectItem value="BAIXA">Baixa</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto">{filtrados.length} ticket(s)</span>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtrados.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">Nenhum ticket em aberto. 🎉</p>
        ) : filtrados.map(t => {
          const aberto = expandido === t.id
          const cat = categoriaNome(t)
          return (
            <div key={t.id} className={cn('rounded-lg border border-border bg-card transition-colors', aberto && 'ring-1 ring-border')}>
              {/* Linha principal */}
              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" onClick={() => setExpandido(aberto ? null : t.id)}>
                {aberto ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="text-[11px] font-mono font-semibold text-muted-foreground shrink-0 w-14">{num(t)}</span>
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0', PRIO_STYLE[t.prioridade])}>{HELPDESK_PRIORIDADE_LABELS[t.prioridade]}</span>
                {cat && <Badge variant="outline" className="text-[10px] shrink-0 max-w-[160px] truncate">{cat}</Badge>}
                <span className="text-[13px] font-medium flex-1 min-w-0 truncate">{t.titulo}</span>
                {slaEstourado(t) && <span title="SLA estourado" className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600"><AlertTriangle className="h-3 w-3" /> SLA</span>}
                {t._count.mensagens > 0 && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><MessageSquare className="h-3 w-3" />{t._count.mensagens}</span>}
                {t._count.anexos > 0 && <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground"><Paperclip className="h-3 w-3" />{t._count.anexos}</span>}
                <div onClick={e => e.stopPropagation()}>
                  <Select value={t.status} onValueChange={v => void setStatus(t.id, v as HelpdeskStatus)}>
                    <SelectTrigger className={cn('h-7 text-[11px] w-[150px] font-medium', STATUS_STYLE[t.status])}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {HELPDESK_STATUS.map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{HELPDESK_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Detalhe expandido */}
              {aberto && (
                <div className="px-9 pb-3 space-y-2 text-[12px]">
                  {t.descricao && <p className="text-muted-foreground whitespace-pre-wrap line-clamp-6">{t.descricao.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span><span className="font-semibold text-foreground">Tipo:</span> {HELPDESK_TIPO_LABELS[t.tipo]}</span>
                    <span><span className="font-semibold text-foreground">Solicitante:</span> {solicitanteNome(t)}</span>
                    <span><span className="font-semibold text-foreground">Responsável:</span> {t.responsavel?.name || 'Não atribuído'}</span>
                    <span><span className="font-semibold text-foreground">Aberto em:</span> {new Date(t.createdAt).toLocaleDateString('pt-BR')}</span>
                    {t.prazoSla && <span><span className="font-semibold text-foreground">Prazo SLA:</span> {new Date(t.prazoSla).toLocaleString('pt-BR')}</span>}
                  </div>
                  <div className="flex justify-end">
                    <Button asChild variant="ghost" size="xs" className="h-6 gap-1 text-[11px]">
                      <Link href={`/helpdesk/${t.id}`}><ExternalLink className="h-3 w-3" /> Abrir ticket</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
