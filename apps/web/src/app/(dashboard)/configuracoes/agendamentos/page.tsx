'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Clock, RefreshCw, Loader2, CheckCircle2, AlertTriangle, AlertCircle,
  Calendar, Bell, Headphones, TrendingUp, ClipboardCheck, Database,
  HardDriveDownload, BellRing, FileSignature, Mailbox, ShieldCheck,
  Receipt, FileText, ArrowRight, UserMinus, FileSearch, type LucideIcon,
} from 'lucide-react'
import { Button, Card, Badge, cn } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { BackButton } from '@/components/ui/back-button'
import { navigation, groupColorVar } from '@/lib/navigation'

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
  Receipt, FileText, UserMinus, FileSearch,
}

/**
 * Os blocos são os MESMOS da sidebar — ordem, cor e ícone saem de `navigation`.
 *
 * Antes esta tela tinha a própria lista ('Fiscal', 'Agenda', 'TI', 'Sistema')
 * com hex chumbado. Isso criava uma segunda taxonomia: o disparo da agenda ficava
 * num bloco "Agenda" que não existe no menu, e a cor não acompanhava o que o
 * usuário troca em Tokens & cores. Agora quem procura o job de um módulo procura
 * no bloco onde a tela dele mora.
 */
const BLOCOS = navigation.map(g => ({
  label: g.label,
  icon: g.icon,
  cor: groupColorVar(g.label),
}))
const ORDEM_BLOCOS = BLOCOS.map(b => b.label)
const COR_PADRAO = 'var(--muted-foreground, #94a3b8)'

export default function CentroAgendamentosPage() {
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

  // Ligado é o estado interessante: quem abre esta tela quer saber o que está
  // rodando. O desligado continua a um clique, porque some é pior que estorvar.
  const [soAtivos, setSoAtivos] = useState(false)

  const visiveis = useMemo(
    () => (soAtivos ? items.filter(i => i.ativo) : items),
    [items, soAtivos],
  )

  const grupos = useMemo(() => {
    const map = new Map<string, SchedulerItem[]>()
    for (const item of visiveis) {
      const arr = map.get(item.modulo) ?? []
      arr.push(item)
      map.set(item.modulo, arr)
    }
    for (const lista of map.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    // Ordem da sidebar; um bloco que não esteja lá (job de módulo removido, por
    // exemplo) cai no fim em vez de sumir da tela.
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ia = ORDEM_BLOCOS.indexOf(a)
      const ib = ORDEM_BLOCOS.indexOf(b)
      if (ia >= 0 && ib >= 0) return ia - ib
      if (ia >= 0) return -1
      if (ib >= 0) return 1
      return a.localeCompare(b, 'pt-BR')
    })
  }, [visiveis])

  const resumo = useMemo(() => {
    const ativos = items.filter(i => i.ativo)
    const proximas = ativos
      .map(i => i.proximaExecucao)
      .filter((d): d is string => !!d)
      .sort()
    const comFalha = items.filter(i => i.ultimaExecucao.status === 'ERRO' || i.ultimaExecucao.status === 'PARCIAL')
    return {
      total: items.length,
      ativos: ativos.length,
      inativos: items.length - ativos.length,
      proxima: proximas[0] ?? null,
      comFalha: comFalha.length,
    }
  }, [items])

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button
            variant={soAtivos ? 'soft' : 'outline'} size="sm"
            onClick={() => setSoAtivos(v => !v)}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {soAtivos ? 'Mostrando só as ligadas' : 'Só as ligadas'}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar
          </Button>
          <BackButton href="/configuracoes" label="Voltar" />
      </>}>
        <h1 className="truncate">Centro de agendamentos</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Configurações</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Centro de Agendamentos</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <p className="text-sm text-muted-foreground">
              Todos os processos automáticos do sistema — cron, próxima execução e última rodada num só lugar.
            </p>
        </div>
      </PageHeaderBar>

      {loading && items.length === 0 ? (
        <Card className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      ) : (
        <>
          {/* Resumo — o que a tela responde antes de alguém ler card por card */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Resumo rotulo="Automações" valor={String(resumo.total)} detalhe={`em ${grupos.length} bloco(s)`} />
            <Resumo
              rotulo="Ligadas" valor={String(resumo.ativos)}
              detalhe={resumo.inativos > 0 ? `${resumo.inativos} desligada(s)` : 'nenhuma desligada'}
              tom={resumo.ativos > 0 ? 'ok' : undefined}
            />
            <Resumo
              rotulo="Próxima a rodar"
              valor={resumo.proxima ? formatDataHora(resumo.proxima) : '—'}
              detalhe={resumo.proxima ? 'entre as ligadas' : 'nada agendado'}
            />
            <Resumo
              rotulo="Última rodada com falha" valor={String(resumo.comFalha)}
              detalhe={resumo.comFalha > 0 ? 'confira os cards marcados' : 'tudo certo'}
              tom={resumo.comFalha > 0 ? 'alerta' : 'ok'}
            />
          </div>

          <div className="space-y-6">
            {grupos.map(([modulo, lista]) => {
              const bloco = BLOCOS.find(b => b.label === modulo)
              const cor = bloco?.cor ?? COR_PADRAO
              const IconeBloco = bloco?.icon
              return (
                <section key={modulo}>
                  {/* Cabeçalho do bloco: mesmo ícone e mesma cor da sidebar */}
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px]"
                      style={{ backgroundColor: `color-mix(in srgb, ${cor} 15%, transparent)`, color: cor }}
                    >
                      {IconeBloco ? <IconeBloco className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                    </span>
                    <h3 className="text-[13px] font-semibold text-foreground">{modulo}</h3>
                    <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">{lista.length}</Badge>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {lista.map(item => (
                      <SchedulerCard key={item.slug} item={item} corModulo={cor} />
                    ))}
                  </div>
                </section>
              )
            })}

            {grupos.length === 0 && (
              <Card className="py-12 text-center text-sm text-muted-foreground">
                {soAtivos ? 'Nenhuma automação ligada no momento.' : 'Nenhuma automação registrada.'}
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Resumo({ rotulo, valor, detalhe, tom }: {
  rotulo: string
  valor: string
  detalhe: string
  tom?: 'ok' | 'alerta'
}) {
  return (
    <Card className="p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className={cn(
        'mt-0.5 text-lg font-semibold tabular-nums',
        tom === 'alerta' && 'text-rose-600 dark:text-rose-400',
        tom === 'ok' && 'text-emerald-600 dark:text-emerald-400',
      )}>
        {valor}
      </div>
      <div className="text-[11px] text-muted-foreground">{detalhe}</div>
    </Card>
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
              <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Agendamento</div>
              {cronExplicado ? (
                <>
                  <div className="font-semibold text-[11px] truncate" title={item.cron}>{cronExplicado}</div>
                  <div className="font-mono text-[10px] text-muted-foreground truncate">{item.cron}</div>
                </>
              ) : (
                <div className="font-mono font-semibold text-[11px] truncate">{item.cron}</div>
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
  const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
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
  // lista de dias da semana (ex.: 1,2,3,4,5) — formata HH:MM + dias abreviados
  if (
    /^\d+$/.test(min ?? '')
    && /^\d+$/.test(hr ?? '')
    && dia === '*'
    && mes === '*'
    && /^\d+(,\d+)*$/.test(dsem ?? '')
  ) {
    const horario = `${hr!.padStart(2, '0')}:${min!.padStart(2, '0')}`
    const nums = dsem!.split(',').map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6)
    // Atalhos pra conjuntos canônicos
    const key = nums.slice().sort().join(',')
    if (key === '1,2,3,4,5') return `${horario}, seg a sex`
    if (key === '0,1,2,3,4,5,6') return `${horario}, todo dia`
    if (key === '0,6') return `${horario}, fins de semana`
    return `${horario}, ${nums.map(n => DIAS[n]).join(', ')}`
  }
  return ''
}
