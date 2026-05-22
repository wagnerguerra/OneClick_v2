'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, AlertTriangle, Star } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { EmptyState } from './empty-state'
import { KpiPill } from './kpi-pill'

interface Totais {
  total: number; lidas: number; naoLidas: number
  naoLidasP0: number; naoLidasP1: number; naoLidasP2: number; naoLidasP3: number
  importantes: number
}

export function CaixaPostalWidget({ canRead, title, bloco }: { canRead: boolean; title?: string; bloco?: string }) {
  const titulo = title ?? 'Caixa Postal e-CAC'
  const [t, setT] = useState<Totais | null>(null)
  useEffect(() => {
    if (!canRead) return
    trpc.caixaPostal.totalizadores.query()
      .then((d: unknown) => setT(d as Totais))
      .catch(() => {})
  }, [canRead])

  if (!canRead) return <EmptyState color="sky" Icon={Mail} title={titulo} message="Sem permissão" bloco={bloco} />
  if (!t) return <EmptyState color="sky" Icon={Mail} title={titulo} message="Carregando..." bloco={bloco} />

  if (t.naoLidas === 0 && t.importantes === 0) {
    return <EmptyState color="sky" Icon={Mail} title={titulo} message="Tudo em dia" href="/caixapostal" showCheck bloco={bloco} />
  }

  return (
    <Card className="h-full border-l-4 border-l-sky-500 overflow-hidden @container/widget" style={bloco ? { borderLeftColor: bloco } : undefined}>
      <CardContent className="p-3 @sm:p-4 h-full overflow-hidden">
        <div className="flex flex-col @[420px]:flex-row @[420px]:items-center @[420px]:justify-between gap-3">
          <Link href="/caixapostal" className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0">
            <div className="flex h-9 w-9 @sm:h-10 @sm:w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-900/20">
              <Mail className="h-4 w-4 @sm:h-5 @sm:w-5 text-sky-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{titulo}</h3>
              <p className="text-xs text-muted-foreground truncate">{t.naoLidas} não lida(s)</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap @[420px]:justify-end">
            {t.naoLidasP0 > 0 && <KpiPill color="red"    Icon={AlertTriangle} count={t.naoLidasP0} label="P0"         href="/caixapostal?prioridade=P0" />}
            {t.naoLidasP1 > 0 && <KpiPill color="orange" Icon={AlertTriangle} count={t.naoLidasP1} label="P1"         href="/caixapostal?prioridade=P1" />}
            {t.naoLidasP2 > 0 && <KpiPill color="amber"  Icon={AlertTriangle} count={t.naoLidasP2} label="P2"         href="/caixapostal?prioridade=P2" />}
            {t.naoLidasP3 > 0 && <KpiPill color="gray"   Icon={AlertTriangle} count={t.naoLidasP3} label="P3"         href="/caixapostal?prioridade=P3" />}
            {t.importantes  > 0 && <KpiPill color="amber"  Icon={Star}          count={t.importantes}  label="Importante" href="/caixapostal?importante=1" />}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
