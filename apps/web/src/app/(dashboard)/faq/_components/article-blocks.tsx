'use client'

import Link from 'next/link'
import {
  HelpCircle, Workflow, Lightbulb, AlertTriangle, Info, CheckCircle2, Pause, ArrowRight,
} from 'lucide-react'
import { Card, CardContent, Badge } from '@saas/ui'
import type { ComponentType, CSSProperties, ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────
// Blocos reusáveis para artigos do FAQ
// ─────────────────────────────────────────────────────────────

export function Section({ icon: Icon, titulo, cor, children }: {
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
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
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
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
        style={{ backgroundColor: `color-mix(in srgb, ${cor} 12%, transparent)`, color: cor }}
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

/**
 * Figura de apoio: uma reproducao da tela, desenhada em codigo.
 *
 * Nao e captura de imagem de proposito. O FAQ e comum a todas as empresas da
 * instalacao e nao tem permissao propria, entao um print real levaria o
 * faturamento de um cliente para quem nao tem acesso ao modulo. A figura
 * desenhada tambem acompanha o tema claro/escuro e nao envelhece como um PNG
 * solto no `public/`.
 *
 * Os numeros usados nas figuras sao ficticios, sempre redondos, para que
 * ninguem os confunda com dado real de cliente.
 */
export function Figura({ rota, legenda, children }: {
  rota?: string
  legenda: ReactNode
  children: ReactNode
}) {
  return (
    <figure className="my-3 space-y-1.5">
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
          <div className="flex gap-1 shrink-0">
            <span className="h-2 w-2 rounded-full bg-rose-400/70" />
            <span className="h-2 w-2 rounded-full bg-amber-400/70" />
            <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
          </div>
          {rota && <span className="truncate font-mono text-[10px] text-muted-foreground">{rota}</span>}
        </div>
        {/* Figura larga rola dentro do proprio quadro; a pagina nunca rola de lado. */}
        <div className="overflow-x-auto nice-scrollbar p-3.5">{children}</div>
      </div>
      <figcaption className="text-[11px] leading-relaxed text-muted-foreground">{legenda}</figcaption>
    </figure>
  )
}

/** Rotulo + valor, do jeito que os cards de resumo do sistema mostram. */
export function FiguraCampo({ label, valor, destaque, cor }: {
  label: string
  valor: string
  destaque?: boolean
  cor?: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`truncate tabular-nums ${destaque ? 'text-sm font-bold' : 'text-[12px] font-medium'}`}
        style={cor ? { color: cor } : undefined}
      >
        {valor}
      </p>
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
