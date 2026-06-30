import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@saas/ui'

/**
 * Status da detecção de lançamentos em um arquivo enviado.
 * Verde quando há lançamentos; âmbar (alerta) quando nenhum foi detectado.
 * Compartilhado entre o fluxo principal e o editor de Modelo.
 */
export function DetectedRowsStatus({
  rows,
  truncated,
  className,
}: {
  rows: number
  truncated?: boolean
  className?: string
}) {
  if (rows > 0) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400', className)}>
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {rows} lançamentos detectados no arquivo{truncated ? ' (prévia limitada)' : ''}.
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400', className)}>
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      Nenhum lançamento detectado — verifique o arquivo.
    </span>
  )
}
