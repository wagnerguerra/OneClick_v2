'use client'

import { ehMatrizCnpj, finalCnpj } from '@saas/types'
import { cn } from '@saas/ui'

/**
 * Razão social + final do CNPJ + selo Matriz/Filial, para listas onde matriz e
 * filiais de uma mesma empresa apareceriam com o nome idêntico (#HLP0410).
 * Cliente pessoa física (ou sem documento) mostra só o nome.
 */
export interface ClienteDoc {
  razaoSocial: string
  documento?: string | null
  tipoDocumento?: string | null
  ehMatriz?: boolean | null
}

/**
 * `linha` (tabela): uma linha só — o nome encurta e o selo fica sempre visível.
 * `bloco` (card de kanban): o nome quebra linha e o selo segue o texto.
 */
export function ClienteIdentificacao({ cliente, variante = 'linha', className }: {
  cliente: ClienteDoc
  variante?: 'linha' | 'bloco'
  className?: string
}) {
  const final = finalCnpj(cliente.documento, cliente.tipoDocumento)
  const matriz = final ? ehMatrizCnpj(cliente.documento, cliente.ehMatriz, cliente.tipoDocumento) : false
  const selo = final ? (
    <span
      className={cn(
        'whitespace-nowrap rounded border border-border px-1 py-px font-mono text-[10px] font-normal leading-none text-muted-foreground',
        variante === 'linha' ? 'shrink-0' : 'ml-1 inline-block align-middle',
      )}
      title={`${matriz ? 'Matriz' : 'Filial'} — final do CNPJ ${final}`}
    >
      {final} · {matriz ? 'Matriz' : 'Filial'}
    </span>
  ) : null
  if (variante === 'bloco') {
    return <span className={className}>{cliente.razaoSocial}{selo}</span>
  }
  return (
    <span className={cn('inline-flex max-w-full min-w-0 items-center gap-1.5', className)}>
      <span className="truncate">{cliente.razaoSocial}</span>
      {selo}
    </span>
  )
}
