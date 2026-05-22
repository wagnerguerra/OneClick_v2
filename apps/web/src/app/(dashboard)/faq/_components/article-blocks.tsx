'use client'

import Link from 'next/link'
import {
  HelpCircle, Workflow, Lightbulb, AlertTriangle, Info, CheckCircle2, Pause, ArrowRight,
} from 'lucide-react'
import { Card, CardContent, Badge } from '@saas/ui'
import type { ComponentType, ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────
// Blocos reusáveis para artigos do FAQ
// ─────────────────────────────────────────────────────────────

export function Section({ icon: Icon, titulo, cor, children }: {
  icon: ComponentType<{ className?: string }>
  titulo: string
  cor: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Icon className="h-4 w-4" style={{ color: cor }} />
          <h3 className="text-sm font-bold" style={{ color: cor }}>{titulo}</h3>
        </div>
        {children}
      </CardContent>
    </Card>
  )
}

export function Step({ n, cor, icon: Icon, titulo, rota, children }: {
  n: number
  cor: string
  icon: ComponentType<{ className?: string }>
  titulo: string
  rota?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold shadow-sm"
            style={{ backgroundColor: cor }}
          >
            {n}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon className="h-4 w-4" style={{ color: cor }} />
              <h3 className="text-sm font-bold">{titulo}</h3>
              {rota && (
                <Badge variant="outline" className="text-[10px] h-5 font-mono">
                  {rota}
                </Badge>
              )}
            </div>
            <div className="text-sm text-foreground/80 space-y-2 [&_p]:leading-relaxed [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono">
              {children}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function DefRow({ termo, texto }: { termo: string; texto: string | ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
      <span className="font-semibold text-foreground sm:w-44 shrink-0">{termo}</span>
      <span className="text-foreground/70">{texto}</span>
    </div>
  )
}

export function FlagRow({ label, on, off }: { label: string; on: string; off: string }) {
  return (
    <div className="rounded-md border p-2.5 text-[12px] space-y-1">
      <p className="font-semibold">{label}</p>
      <p><CheckCircle2 className="inline h-3 w-3 text-emerald-600" /> Ativo: <span className="text-foreground/70">{on}</span></p>
      <p><Pause className="inline h-3 w-3 text-muted-foreground" /> Desativado: <span className="text-foreground/70">{off}</span></p>
    </div>
  )
}

export function Callout({ tipo, children }: { tipo: 'dica' | 'aviso' | 'info'; children: ReactNode }) {
  const styles = {
    dica:  { bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-l-emerald-400', text: 'text-emerald-900 dark:text-emerald-200', Icon: Lightbulb },
    aviso: { bg: 'bg-amber-50 dark:bg-amber-950/30',     border: 'border-l-amber-400',   text: 'text-amber-900 dark:text-amber-200',     Icon: AlertTriangle },
    info:  { bg: 'bg-sky-50 dark:bg-sky-950/30',         border: 'border-l-sky-400',     text: 'text-sky-900 dark:text-sky-200',         Icon: Info },
  }
  const s = styles[tipo]
  const Icon = s.Icon
  return (
    <div className={`rounded-md border-l-4 ${s.border} ${s.bg} ${s.text} p-3 text-[12px] mt-2`}>
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="space-y-1 [&_strong]:font-semibold">{children}</div>
      </div>
    </div>
  )
}

export function CascadeRow({ ordem, titulo, cor = '#8b5cf6', children }: {
  ordem: string; titulo: string; cor?: string; children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2">
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ backgroundColor: `${cor}20`, color: cor }}
      >
        {ordem}
      </div>
      <div className="flex-1 text-[12px]">
        <p className="font-semibold">{titulo}</p>
        <p className="text-foreground/70">{children}</p>
      </div>
    </div>
  )
}

export function CasoPratico({ titulo, descricao }: { titulo: string; descricao: ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm font-semibold mb-1">{titulo}</p>
      <div className="text-[12px] text-foreground/70 leading-relaxed">{descricao}</div>
    </div>
  )
}

export function QuickLink({ href, label, cor = '#8b5cf6' }: { href: string; label: string; cor?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-md border bg-card hover:shadow-sm transition-all p-2.5 text-sm group"
      style={{ ['--quicklink-color' as string]: cor }}
    >
      <span>{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  )
}

// Re-exports usados nas páginas (conveniência)
export { HelpCircle, Workflow, Lightbulb, AlertTriangle, Info, CheckCircle2 }
