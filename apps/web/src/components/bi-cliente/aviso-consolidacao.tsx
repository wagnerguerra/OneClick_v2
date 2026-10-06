'use client'

import { Layers } from 'lucide-react'
import { cn } from '@saas/ui'
import { formatCnpj } from '@saas/types'
import { BORDER, SURFACE, TEXT } from '@/lib/color-styles'

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
 * Aviso de que o BI soma filiais na matriz (06/10/2026). Aparece no
 * /bi-faturamento (texto para a equipe) e no BI Financeiro do portal (texto
 * para o cliente) quando o ano exibido tem meses importados CONSOLIDADOS.
 */
export function AvisoConsolidacao({ periodos, publico }: { periodos: PeriodoConsolidado[]; publico: 'interno' | 'cliente' }) {
  if (periodos.length === 0) return null
  const filiais = new Map<string, { cnpj: string; razaoSocial: string }>()
  for (const p of periodos) for (const f of p.filiais) filiais.set(f.clienteId || f.cnpj, f)
  const lista = [...filiais.values()]
  const meses = faixasDeMeses(periodos.map(p => p.periodo))
  const nomes = lista.map(f => `${f.razaoSocial} (CNPJ ${formatCnpj(f.cnpj)})`).join('; ')

  return (
    <div role="note" className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-[12.5px] leading-relaxed', SURFACE.sky, BORDER.sky)}>
      <Layers className={cn('mt-0.5 h-4 w-4 shrink-0', TEXT.sky)} />
      <p className="text-foreground">
        <span className="font-semibold">Valores consolidados</span>
        {publico === 'interno' ? (
          <> — em {meses}, o balancete desta matriz soma {lista.length === 1 ? 'a filial' : 'as filiais'} {nomes}.
            Para separar, reimporte o período escolhendo “Individualizar”.</>
        ) : (
          <> — em {meses}, os números incluem {lista.length === 1 ? 'a filial' : 'as filiais'} {nomes}, somadas à matriz,
            como no balancete consolidado do escritório.</>
        )}
      </p>
    </div>
  )
}
