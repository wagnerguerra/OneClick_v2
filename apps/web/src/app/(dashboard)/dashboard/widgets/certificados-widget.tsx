'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileLock, Clock, XCircle } from 'lucide-react'
import { Card, CardContent } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { EmptyState } from './empty-state'
import { KpiPill } from './kpi-pill'

interface Stats { ativos: number; vencendo60: number; vencendo30: number; vencidos: number; revogados: number }

export function CertificadosWidget({ canRead, title, bloco }: { canRead: boolean; title?: string; bloco?: string }) {
  const titulo = title ?? 'Certificados Digitais'
  const [s, setS] = useState<Stats | null>(null)
  useEffect(() => {
    if (!canRead) return
    ;(trpc.certificadoDigital as any).getStats.query()
      .then((d: Stats) => setS(d))
      .catch(() => {})
  }, [canRead])

  if (!canRead) return <EmptyState color="fuchsia" Icon={FileLock} title={titulo} message="Sem permissão" bloco={bloco} />
  if (!s) return <EmptyState color="fuchsia" Icon={FileLock} title={titulo} message="Carregando..." bloco={bloco} />
  const total = s.ativos + s.vencendo60 + s.vencendo30 + s.vencidos + s.revogados
  if (total === 0) return <EmptyState color="fuchsia" Icon={FileLock} title={titulo} message="Nenhum certificado cadastrado" href="/gestao-certificados" bloco={bloco} />
  const vencendo = s.vencendo60 + s.vencendo30

  return (
    <Card className="h-full border-l-4 border-l-fuchsia-500 overflow-hidden @container/widget" style={bloco ? { borderLeftColor: bloco } : undefined}>
      <CardContent className="p-3 @sm:p-4 h-full overflow-hidden">
        <div className="flex flex-col @[420px]:flex-row @[420px]:items-center @[420px]:justify-between gap-3">
          <Link href="/gestao-certificados" className="flex items-center gap-3 hover:opacity-80 transition-opacity min-w-0">
            <div className="flex h-9 w-9 @sm:h-10 @sm:w-10 shrink-0 items-center justify-center rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/20">
              <FileLock className="h-4 w-4 @sm:h-5 @sm:w-5 text-fuchsia-600" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{titulo}</h3>
              <p className="text-xs text-muted-foreground truncate">{total} cadastrado(s)</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap @[420px]:justify-end">
            {vencendo > 0     && <KpiPill color="amber" Icon={Clock}   count={vencendo}    label="Vencendo"  href="/gestao-certificados?filtro=vencendo" />}
            {s.vencidos > 0   && <KpiPill color="red"   Icon={XCircle} count={s.vencidos}  label="Vencidos"  href="/gestao-certificados?status=EXPIRADO" />}
            {s.revogados > 0  && <KpiPill color="gray"  Icon={XCircle} count={s.revogados} label="Revogados" href="/gestao-certificados?status=REVOGADO" />}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
