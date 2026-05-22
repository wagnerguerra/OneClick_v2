'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Card, CardContent, Button, cn } from '@saas/ui'

interface Props {
  children: React.ReactNode
  /** Nome do widget/módulo (mostrado no estado de erro). */
  label?: string
  /** Cor do border-l (default: amber). Use a cor do widget pra continuidade visual. */
  borderColor?: string
  /** Callback opcional disparado ao clicar em "Tentar novamente". */
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  resetKey: number
}

/**
 * Captura erros de runtime de qualquer widget filho e mostra estado
 * "indisponível" só naquele card — sem derrubar o resto do dashboard.
 *
 * Atenção: ErrorBoundary do React captura erros lançados durante renderização
 * e ciclo de vida. Para erros assíncronos (fetch), o widget filho precisa
 * propagar via throw ou via state que dispare re-render com throw.
 */
export class WidgetErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, resetKey: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[WidgetErrorBoundary]', this.props.label, error, info.componentStack)
  }

  handleRetry = () => {
    this.setState(s => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }))
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className={cn('h-full overflow-hidden border-l-4', this.props.borderColor ?? 'border-l-amber-500')}>
          <CardContent className="p-5 h-full flex flex-col items-center justify-center text-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">{this.props.label ?? 'Módulo'} indisponível</p>
              <p className="text-[11px] text-muted-foreground line-clamp-2 max-w-[260px]">
                {this.state.error?.message ?? 'Erro inesperado'}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={this.handleRetry} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )
    }
    // Force remount dos filhos quando user clica em "tentar novamente"
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>
  }
}
