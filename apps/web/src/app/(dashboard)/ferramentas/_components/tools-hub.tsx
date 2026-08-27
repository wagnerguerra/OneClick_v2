'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card, cn } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { toolsByArea, colorForArea, type ToolArea } from '../_config/catalog'

const GLASS = 'border border-border/50 bg-card/70 backdrop-blur-xl shadow-lg shadow-black/[0.04] dark:shadow-black/20'

const AREA_META: Record<ToolArea, { title: string; trilha: string }> = {
  fiscal: {
    title: 'Ferramentas Fiscais',
    trilha: 'Fiscal',
  },
  contabil: {
    title: 'Ferramentas Contábeis',
    trilha: 'Contábil',
  },
}

export function ToolsHub({ area }: { area: ToolArea }) {
  const meta = AREA_META[area]
  const tools = toolsByArea(area)
  const color = colorForArea(area) // cor do BLOCO (fiscal/contábil) conforme design system
  const accent = { background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 78%, #000))` } as const

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar>
        <h1 className="truncate">{meta.title}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/ferramentas" className="transition-colors hover:text-foreground">Ferramentas</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>{meta.trilha}</span>
        </p>
      </PageHeaderBar>

      <div className="relative isolate">
        <div aria-hidden className="pointer-events-none absolute -top-16 left-[10%] -z-10 h-72 w-2/3 rounded-full blur-3xl opacity-20"
          style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }} />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map((t) => {
            const Icon = t.icon
            return (
              <Link key={t.tool} href={t.href} className="group focus:outline-none">
                <Card className={cn('flex h-full flex-col gap-4 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl', GLASS)}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                      style={{ ...accent, boxShadow: `0 10px 24px -10px color-mix(in srgb, ${color} 55%, transparent)` }}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-[15px] font-bold leading-tight">{t.title}</h3>
                        {t.badge && (
                          <span className="shrink-0 rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">{t.badge}</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{t.subtitle}</p>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors" style={{ color }}>
                      Abrir ferramenta
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
