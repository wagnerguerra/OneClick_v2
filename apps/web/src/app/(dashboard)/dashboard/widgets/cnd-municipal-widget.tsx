'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Landmark, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { EmptyState } from './empty-state'
import { KpiPill } from './kpi-pill'

interface T { total: number; negativas: number; positivas: number; naoEmitidas: number; vencidas: number; vencendo: number; vigentes: number }
interface ValidadeItem { id: string; documento: string; razaoSocial: string | null; municipio: string; tipoCertidao: string | null; dataValidade: string | null }

export function CndMunicipalWidget({ title, bloco }: { canRead?: boolean; title?: string; bloco?: string } = {}) {
  const titulo = title ?? "CND's Municipais — Validade"
  const [t, setT] = useState<T | null>(null)
  const [items, setItems] = useState<ValidadeItem[]>([])
  const [erro, setErro] = useState(false)
  useEffect(() => {
    trpc.cnd.municipal.totalizadores.query().then((d: unknown) => setT(d as T)).catch(() => setErro(true))
    trpc.cnd.municipal.validadeDashboard.query().then((d: unknown) => setItems(d as ValidadeItem[])).catch(() => {})
  }, [])
  if (erro) return <EmptyState color="amber" Icon={AlertTriangle} title={titulo} message="Não foi possível carregar" href="/certidoes-cnd?aba=municipal" bloco={bloco} />
  if (!t) return <EmptyState color="violet" Icon={Landmark} title={titulo} message="Carregando..." bloco={bloco} />
  if (t.total === 0) return <EmptyState color="violet" Icon={Landmark} title={titulo} message="Nenhuma certidão consultada" href="/certidoes-cnd?aba=municipal" bloco={bloco} />

  return (
    <Card className="h-full border-l-4 border-l-violet-500 overflow-hidden @container/widget" style={bloco ? { borderLeftColor: bloco } : undefined}>
      <CardContent className="p-3 @sm:p-4 h-full overflow-hidden flex flex-col gap-3">
        <div className="flex flex-col @[420px]:flex-row @[420px]:items-center @[420px]:justify-between gap-3">
          <Link href="/certidoes-cnd?aba=municipal" className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0">
            <div className="flex h-9 w-9 @sm:h-10 @sm:w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/20">
              <Landmark className="h-4 w-4 @sm:h-5 @sm:w-5 text-violet-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{titulo}</h3>
              <p className="text-xs text-muted-foreground truncate">{t.total} certidão(ões)</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap @[420px]:justify-end">
            {t.vigentes > 0    && <KpiPill color="emerald" Icon={CheckCircle2} count={t.vigentes}    label="Vigentes" />}
            {t.vencendo > 0    && <KpiPill color="amber"   Icon={Clock}        count={t.vencendo}    label="Vencendo" />}
            {t.vencidas > 0    && <KpiPill color="red"     Icon={XCircle}      count={t.vencidas}    label="Vencidas" />}
            {t.naoEmitidas > 0 && <KpiPill color="gray"    Icon={XCircle}      count={t.naoEmitidas} label="Não emitida" />}
          </div>
        </div>

        {items.length > 0 && (
          <div className="hidden @[480px]:block border rounded-md overflow-hidden text-[11px] min-h-0 flex-1">
            <div className="grid grid-cols-[1fr_120px_100px_80px] @[640px]:grid-cols-[1fr_140px_120px_90px] gap-2 px-3 py-1.5 bg-muted/40 font-semibold">
              <div>Cliente</div><div>Município</div><div className="hidden @[560px]:block">Tipo</div><div>Validade</div>
            </div>
            <div className="overflow-y-auto max-h-full">
              {items.slice(0, 8).map(i => (
                <div key={i.id} className="grid grid-cols-[1fr_120px_100px_80px] @[640px]:grid-cols-[1fr_140px_120px_90px] gap-2 px-3 py-1 border-t hover:bg-muted/20">
                  <div className="truncate">{i.razaoSocial || '—'}</div>
                  <div className="truncate">{i.municipio}</div>
                  <div className="truncate hidden @[560px]:block">{i.tipoCertidao || '—'}</div>
                  <div className="tabular-nums">{i.dataValidade ? new Date(i.dataValidade).toLocaleDateString('pt-BR') : '—'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
