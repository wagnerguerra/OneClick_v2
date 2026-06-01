'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Clock, RefreshCw, Loader2, CheckCircle2, AlertTriangle, AlertCircle,
  Calendar, Bell, Headphones, TrendingUp, ClipboardCheck, Database,
  HardDriveDownload, BellRing, FileSignature, Mailbox, ShieldCheck,
  Receipt, FileText, ArrowRight, ArrowLeft, type LucideIcon,
} from 'lucide-react'
import { Button, Card, Badge } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'

interface SchedulerItem {
  slug: string
  nome: string
  modulo: string
  descricao: string
  icon: string
  cron: string
  ativo: boolean
  proximaExecucao: string | null
  ultimaExecucao: { iniciadoEm: string | null; status: string | null; info: string | null }
  configHref: string | null
}

const ICONS: Record<string, LucideIcon> = {
  Calendar, Bell, Headphones, TrendingUp, ClipboardCheck, Database,
  HardDriveDownload, BellRing, FileSignature, Mailbox, ShieldCheck,
  Receipt, FileText,
}

const MODULO_ORDER = ['Fiscal', 'Agenda', 'TI', 'Comercial', 'Sistema']
const MODULO_COR: Record<string, string> = {
  Fiscal: '#10b981',
  Agenda: '#0ea5e9',
  TI: '#f43f5e',
  Comercial: '#fb7185',
  Sistema: '#6366f1',
}

export default function CentroAgendamentosPage() {
  const router = useRouter()
  const [items, setItems] = useState<SchedulerItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const r = await (trpc.agendamento as any).listAll.query()
      setItems(r as SchedulerItem[])
    } catch (e) {
      console.error('[CentroAgendamentos]', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const grupos = useMemo(() => {
    const map = new Map<string, SchedulerItem[]>()
    for (const item of items) {
      const arr = map.get(item.modulo) ?? []
      arr.push(item)
      map.set(item.modulo, arr)
    }
    // Ordena conforme MODULO_ORDER, depois alfabético pros não listados
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = MODULO_ORDER.indexOf(a)
      const ib = MODULO_ORDER.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b)
    })
  }, [items])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push('/configuracoes')} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <PageHeaderIcon icon={Clock} module="configuracoes" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Centro de agendamentos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Todos os processos automáticos do sistema — cron, próxima execução e última rodada num só lugar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 shrink-0">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Atualizar
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <Card className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <div className="space-y-5">
          {grupos.map(([modulo, lista]) => {
            const corModulo = MODULO_COR[modulo] || '#94a3b8'
            return (
              <div key={modulo}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: corModulo }} />
                  <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    {modulo}
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{lista.length}</Badge>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {lista.map(item => (
                    <SchedulerCard key={item.slug} item={item} corModulo={corModulo} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SchedulerCard({ item, corModulo }: { item: SchedulerItem; corModulo: string }) {
  const Icon = ICONS[item.icon] ?? Clock
  const ultima = item.ultimaExecucao
  const ultimaStatus = ultima.status
  const cronExplicado = explicarCron(item.cron)
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="flex">
        <div className="w-1 shrink-0" style={{ backgroundColor: corModulo }} />
        <div className="flex-1 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div
              className="h-10 w-10 rounded-lg shrink-0 flex items-center justify-center"
              style={{ backgroundColor: `${corModulo}18` }}
            >
              <Icon className="h-5 w-5" style={{ color: corModulo }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-semibold leading-tight">{item.nome}</h4>
                {item.ativo ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ativo
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    Inativo
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug mt-1">{item.descricao}</p>
            </div>
          </div>

          {/* Linha de info: cron / próxima / última */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded border border-border bg-muted/30 px-2.5 py-1.5">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Cron</div>
              <div className="font-mono font-semibold text-[11px] truncate">{item.cron}</div>
              {cronExplicado && (
                <div className="text-[10px] text-muted-foreground truncate">{cronExplicado}</div>
              )}
            </div>
            <div className="rounded border border-border bg-muted/30 px-2.5 py-1.5">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Próxima</div>
              <div className="font-medium text-[11px]">
                {item.proximaExecucao && item.ativo
                  ? formatDataHora(item.proximaExecucao)
                  : <span className="text-muted-foreground">—</span>}
              </div>
            </div>
            <div className="rounded border border-border bg-muted/30 px-2.5 py-1.5">
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Última</div>
              {ultima.iniciadoEm ? (
                <div>
                  <div className="flex items-center gap-1 font-medium text-[11px]">
                    <StatusIcon status={ultimaStatus} />
                    {formatDataHora(ultima.iniciadoEm)}
                  </div>
                  {ultima.info && (
                    <div className="text-[10px] text-muted-foreground truncate">{ultima.info}</div>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground">Sem registros</div>
              )}
            </div>
          </div>

          {/* Ações */}
          {item.configHref && (
            <div className="flex justify-end pt-1">
              <Link href={item.configHref}>
                <Button variant="outline" size="sm" className="gap-1 h-7 text-[11px]">
                  Configurar <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function StatusIcon({ status }: { status: string | null }) {
  if (!status) return null
  if (status === 'OK') return <CheckCircle2 className="h-3 w-3 text-emerald-600" />
  if (status === 'PARCIAL') return <AlertTriangle className="h-3 w-3 text-amber-600" />
  if (status === 'ERRO') return <AlertCircle className="h-3 w-3 text-rose-600" />
  if (status === 'RODANDO') return <Loader2 className="h-3 w-3 animate-spin text-sky-600" />
  return null
}

function formatDataHora(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

/**
 * Traduz cron expressions simples pra texto humano (best-effort).
 * Não cobre 100% dos formatos — só os usados no registry.
 */
function explicarCron(cron: string): string {
  if (!cron || cron === '—') return ''
  const parts = cron.split(/\s+/)
  if (parts.length !== 5) return ''
  const [min, hr, dia, mes, dsem] = parts
  // a cada minuto
  if (min === '*' && hr === '*' && dia === '*' && mes === '*' && dsem === '*') return 'A cada minuto'
  // a cada N minutos
  if (min?.startsWith('*/') && hr === '*') return `A cada ${min.slice(2)} min`
  // a cada hora num minuto X
  if (/^\d+$/.test(min ?? '') && hr === '*') return `Toda hora aos :${(min ?? '0').padStart(2, '0')}`
  // diário HH:MM
  if (/^\d+$/.test(min ?? '') && /^\d+$/.test(hr ?? '') && dia === '*' && mes === '*' && dsem === '*') {
    return `Todo dia às ${hr!.padStart(2, '0')}:${min!.padStart(2, '0')}`
  }
  // dia da semana específico
  if (/^\d+$/.test(min ?? '') && /^\d+$/.test(hr ?? '') && dia === '*' && mes === '*' && /^\d+$/.test(dsem ?? '')) {
    const dias = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
    return `${dias[parseInt(dsem!, 10)]} às ${hr!.padStart(2, '0')}:${min!.padStart(2, '0')}`
  }
  return ''
}
