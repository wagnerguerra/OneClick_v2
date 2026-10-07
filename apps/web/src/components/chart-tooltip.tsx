'use client'

import type { ReactNode } from 'react'

/**
 * ChartTooltip — tooltip tematizado (dark-aware) para gráficos Recharts.
 *
 * O `<Tooltip>` cru do recharts renderiza uma caixa branca com texto escuro que
 * NÃO acompanha o tema (fica clara no dark). Este componente usa tokens
 * (`bg-popover`/`border-border`/`text-foreground`) e funciona nos dois temas.
 *
 * Uso (contagem/valor cru):
 *   <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-muted)' }} />
 * Uso (moeda ou outro formato):
 *   <Tooltip content={<ChartTooltip format={formatCurrency} />} />
 * Uso (série pintada por <Cell>, cor por item):
 *   <ChartTooltip seriesColor={(serie, linha) => serie === 'Qtd' ? String(linha.cor) : undefined} />
 *
 * O recharts injeta `active`/`payload`/`label` ao clonar o elemento passado em
 * `content`, então basta declarar `content={<ChartTooltip ... />}`.
 */

interface ChartTooltipEntry {
  name?: string
  value?: number | string
  color?: string
  fill?: string
  [k: string]: unknown
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipEntry[]
  label?: ReactNode
  /** Formata o valor de cada série (recebe também o `name` da série). Ausente = valor cru. */
  format?: (value: number, name?: string) => ReactNode
  /** Formata o rótulo (eixo X) do tooltip. Ausente = rótulo cru. */
  labelFormat?: (label: ReactNode) => ReactNode
  /**
   * Cor da bolinha de cada série, declarada pelo gráfico num lugar só. Use
   * quando a série não tem cor própria — ex.: barras pintadas por `<Cell>`
   * (uma cor por item), em que a cor está no dado da linha. Recebe o nome da
   * série e o dado da linha. Ausente (ou `undefined`) = cor da própria série.
   */
  seriesColor?: (name: string | undefined, row: Record<string, unknown>) => string | undefined
}

/**
 * Fundo do "cursor" (realce atrás da barra/coluna em hover). Tint do foreground:
 * no dark o foreground é claro → realce claro; no light é escuro → realce sutil.
 * Uso: <Tooltip content={<ChartTooltip />} cursor={{ fill: CHART_CURSOR_FILL }} />
 */
export const CHART_CURSOR_FILL = 'color-mix(in srgb, var(--color-foreground) 10%, transparent)'

// Cores INVERTIDAS de propósito (contraste com a página): no light o box é
// escuro; no dark o box é cinza-claro. Texto acompanha a inversão.
export function ChartTooltip({ active, payload, label, format, labelFormat, seriesColor }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border px-3 py-2 shadow-md text-xs border-slate-700 bg-slate-800 text-slate-100 dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900">
      {label != null && <p className="font-semibold mb-1 text-slate-50 dark:text-slate-900">{labelFormat ? labelFormat(label) : label}</p>}
      {payload.map((p, i) => {
        const row = (p.payload ?? {}) as Record<string, unknown>
        const dotColor = seriesColor?.(p.name, row)
          || p.color || (row as { fill?: string }).fill || p.fill
        return (
          <p key={i} className="flex items-center gap-1.5 text-slate-300 dark:text-slate-600">
            {dotColor && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dotColor }} />}
            <span>{p.name}: <span className="font-medium text-slate-50 dark:text-slate-900">{format ? format(Number(p.value), p.name) : p.value as ReactNode}</span></span>
          </p>
        )
      })}
    </div>
  )
}
