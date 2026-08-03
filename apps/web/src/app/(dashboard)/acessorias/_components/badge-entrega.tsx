'use client'

import { cn } from '@saas/ui'

/**
 * A data de entrega, colorida pela comparação com o vencimento.
 *
 * A tabela mostrava as duas datas lado a lado e deixava a conta para o leitor —
 * "16/07 é depois de 15/07?" — em dezenas de linhas seguidas. O selo responde
 * de relance: verde antes, âmbar no próprio dia, vermelho depois.
 *
 * A comparação é por DIA. As duas datas são de calendário (sem hora), então
 * comparar instantes traria diferença de fuso onde não existe diferença real.
 */
export function BadgeEntrega({ entrega, vencimento, className }: {
  entrega: string | null
  vencimento: string | null
  className?: string
}) {
  if (!entrega) return <span className="text-muted-foreground">—</span>

  const texto = new Date(entrega).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
  const dia = (v: string) => new Date(v).toISOString().slice(0, 10)

  // Sem vencimento não há com o que comparar: mostra a data sem veredito.
  if (!vencimento) {
    return <span className={cn('tabular-nums text-muted-foreground', className)}>{texto}</span>
  }

  const e = dia(entrega)
  const v = dia(vencimento)
  const cor = e < v
    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
    : e === v
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
      : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
  const titulo = e < v
    ? `Entregue antes do vencimento (${new Date(vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})`
    : e === v
      ? 'Entregue no próprio dia do vencimento'
      : `Entregue depois do vencimento (${new Date(vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })})`

  return (
    <span
      title={titulo}
      className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums', cor, className)}
    >
      {texto}
    </span>
  )
}
