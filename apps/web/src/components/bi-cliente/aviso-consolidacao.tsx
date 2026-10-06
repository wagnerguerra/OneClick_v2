'use client'

import { Layers } from 'lucide-react'
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@saas/ui'
import { formatCnpj } from '@saas/types'
import { BADGE } from '@/lib/color-styles'

/** Mês do balancete consolidado com filiais (ClienteBiConsolidacao). */
export interface PeriodoConsolidado {
  periodo: string
  filiais: Array<{ clienteId: string; cnpj: string; razaoSocial: string }>
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "jun–ago/2026" (meses seguidos viram faixa; buracos viram vírgula). */
export function faixasDeMeses(periodos: string[]): string {
  const refs = [...new Set(periodos)].map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  const faixas: Array<[number, number]> = []
  for (const r of refs) {
    const ult = faixas[faixas.length - 1]
    const seguinte = ult && (r === ult[1] + 1 || (ult[1] % 100 === 12 && r === ult[1] + 89))
    if (ult && seguinte) ult[1] = r
    else faixas.push([r, r])
  }
  const nome = (r: number) => MESES[(r % 100) - 1] ?? String(r % 100)
  return faixas
    .map(([a, b]) => (a === b ? `${nome(a)}/${Math.floor(a / 100)}` : `${nome(a)}–${nome(b)}/${Math.floor(b / 100)}`))
    .join(', ')
}

/**
 * Selo "Resultados consolidados na matriz" (06/10/2026). Aparece no
 * /bi-faturamento e no BI Financeiro do portal quando o ano exibido tem meses
 * importados CONSOLIDADOS. Compacto, na linha do título; o detalhe (filiais e
 * meses) fica na dica — a faixa larga anterior empurrava o dashboard.
 */
export function AvisoConsolidacao({ periodos, publico }: { periodos: PeriodoConsolidado[]; publico: 'interno' | 'cliente' }) {
  if (periodos.length === 0) return null
  const filiais = new Map<string, { cnpj: string; razaoSocial: string }>()
  for (const p of periodos) for (const f of p.filiais) filiais.set(f.clienteId || f.cnpj, f)
  const lista = [...filiais.values()]
  const meses = faixasDeMeses(periodos.map(p => p.periodo))

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="note"
            tabIndex={0}
            className={cn('inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium', BADGE.sky)}
          >
            <Layers className="h-3 w-3" />
            Resultados consolidados na matriz
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          <p>Em {meses}, {publico === 'interno' ? 'o balancete desta matriz soma' : 'os números incluem'} {lista.length === 1 ? 'a filial' : 'as filiais'}:</p>
          <ul className="mt-1 list-disc pl-4">
            {lista.map(f => <li key={f.cnpj}>{f.razaoSocial} — CNPJ {formatCnpj(f.cnpj)}</li>)}
          </ul>
          {publico === 'interno' && <p className="mt-1 text-muted-foreground">Para separar, reimporte o período escolhendo “Individualizar”.</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
