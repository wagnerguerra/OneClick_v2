'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Filter, Megaphone, Target, Send, CheckCircle2, FileCheck, BarChart3, DollarSign, Users, Percent } from 'lucide-react'
import { Button, Card, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, cn } from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@saas/api/src/trpc/trpc.service'

const MODULE_COLOR = 'var(--mod-comercial, #fb7185)'

type FunilData = inferRouterOutputs<AppRouter>['orcamento']['reportFunilComercial']

const TABS = [
  { key: 'funil', label: 'Funil unificado', icon: Filter },
  { key: 'mrr', label: 'MRR recorrente vs. avulso', icon: DollarSign },
  { key: 'vendedores', label: 'Ranking de vendedores', icon: Users },
  { key: 'descontos', label: 'Descontos & margem', icon: Percent },
] as const
type TabKey = typeof TABS[number]['key']

const PERIODOS = [
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '180', label: 'Últimos 180 dias' },
  { value: '365', label: 'Último ano' },
  { value: 'all', label: 'Todos os tempos' },
]

const ICONES_ESTAGIO = [Megaphone, Target, Send, CheckCircle2, FileCheck]

export default function ComercialRelatoriosPage() {
  const [tab, setTab] = useState<TabKey>('funil')
  const [periodo, setPeriodo] = useState('90')
  const [funil, setFunil] = useState<FunilData | null>(null)
  const [loading, setLoading] = useState(false)

  const dias = periodo === 'all' ? undefined : Number(periodo)

  const load = useCallback(async () => {
    setLoading(true)
    try { setFunil(await trpc.orcamento.reportFunilComercial.query({ dias })) }
    catch { /* silent */ } finally { setLoading(false) }
  }, [dias])
  useEffect(() => { if (tab === 'funil') load() }, [tab, load])

  const maxCount = funil ? Math.max(...funil.funil.map(s => s.count), 1) : 1

  return (
    <div className="flex flex-col gap-5">
      {/* Header inline */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md" style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1>Relatórios Comerciais</h1>
            <p className="text-sm text-muted-foreground">Visão de gestor cruzando captação, CRM, orçamentos e contratos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="h-9 w-[180px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <BackButton href="/comercial" label="Voltar" />
        </div>
      </div>

      {/* Pills */}
      <div className="flex gap-1 border-b border-border/40 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                active ? 'text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
              style={active ? { borderBottomColor: MODULE_COLOR } : undefined}>
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      {tab === 'funil' ? (
        loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !funil ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">Não foi possível carregar o funil.</Card>
        ) : (
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-1">Jornada Lead → Oportunidade → Orçamento → Contrato</h3>
            <p className="text-[11px] text-muted-foreground mb-4">Volume por estágio no período e taxa de conversão para o estágio seguinte.</p>
            <div className="space-y-2">
              {funil.funil.map((s, i) => {
                const Icon = ICONES_ESTAGIO[i] ?? Filter
                const pct = (s.count / maxCount) * 100
                return (
                  <div key={s.label}>
                    {i > 0 && (
                      <div className="flex items-center gap-2 pl-[200px] py-0.5">
                        <span className="text-[10px] text-muted-foreground">↓ conversão</span>
                        <span className="text-[10px] font-semibold tabular-nums" style={{ color: MODULE_COLOR }}>
                          {s.conversao != null ? `${s.conversao}%` : '—'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-[190px] shrink-0 flex items-center gap-2 text-xs font-medium">
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: MODULE_COLOR }} />
                        <span className="truncate">{s.label}</span>
                      </div>
                      <div className="flex-1 h-8 bg-muted/30 rounded relative overflow-hidden">
                        <div className="h-full flex items-center justify-end pr-2 text-[11px] font-semibold text-white transition-all"
                          style={{ width: `${Math.max(pct, 6)}%`, backgroundColor: MODULE_COLOR }}>
                          {s.count}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-4">
              Funil macro (volume por estágio no período) — não rastreia o mesmo registro fluindo entre etapas; mostra onde o funil estreita.
            </p>
          </Card>
        )
      ) : (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium">Em breve</p>
          <p className="text-xs text-muted-foreground mt-1">Este relatório está no planejamento e será construído na próxima leva.</p>
        </Card>
      )}
    </div>
  )
}
