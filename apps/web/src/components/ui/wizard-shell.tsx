'use client'

/**
 * WizardShell — casca reutilizável de assistente passo-a-passo (stepper).
 *
 * Padrão que não existia no projeto: um foco por tela, indicador de progresso
 * no topo (círculos numerados ligados por trilha, ativo = cor do módulo),
 * corpo animado (`fadeSlideIn`, keyed pelo passo atual) e rodapé Voltar/Próximo/
 * Concluir. É controlado — o pai gerencia `current` e os handlers.
 *
 * Usado pelo wizard de cadastro base (`servico-wizard`) e pelo assistente de
 * fluxo (`fluxo-assistant`). Só chrome — nenhuma regra de negócio aqui.
 */

import type { ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button, cn } from '@saas/ui'

export interface WizardStep {
  key: string
  title: string
  /** Passo pulável — mostra "(opcional)" no rótulo. */
  optional?: boolean
}

export interface WizardShellProps {
  steps: WizardStep[]
  /** Índice do passo atual (0-based). */
  current: number
  /** Cor do módulo (CSS var). Default = cadastros (emerald). */
  color?: string
  /** Corpo do passo atual. */
  children: ReactNode
  /** Clique num passo já visitado (≤ current) navega até ele. */
  onNavigate?: (index: number) => void
  onBack?: () => void
  onNext?: () => void
  backLabel?: string
  nextLabel?: string
  /** Desabilita o botão de avançar (ex.: campo obrigatório vazio). */
  nextDisabled?: boolean
  loading?: boolean
  hideFooter?: boolean
  className?: string
}

export function WizardShell({
  steps,
  current,
  color = 'var(--mod-cadastros, #10b981)',
  children,
  onNavigate,
  onBack,
  onNext,
  backLabel = 'Voltar',
  nextLabel,
  nextDisabled = false,
  loading = false,
  hideFooter = false,
  className,
}: WizardShellProps) {
  const isFirst = current <= 0
  const isLast = current >= steps.length - 1
  const resolvedNextLabel = nextLabel ?? (isLast ? 'Concluir' : 'Próximo')

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Indicador de passos */}
      <div className="flex items-center gap-1 px-1 pb-5">
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          const clickable = !!onNavigate && i <= current && i !== current
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1 last:flex-none">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onNavigate?.(i)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors',
                  clickable ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default',
                )}
                title={s.title}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-colors',
                    !done && !active && 'bg-muted text-muted-foreground',
                  )}
                  style={done || active ? { backgroundColor: color, color: '#fff' } : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'hidden text-[13px] sm:block',
                    active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.title}
                  {s.optional && <span className="ml-1 text-[11px] text-muted-foreground/70">(opcional)</span>}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  className={cn('h-px flex-1 transition-colors', done ? '' : 'bg-border')}
                  style={done ? { backgroundColor: color } : undefined}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Corpo do passo — re-anima a cada troca */}
      <div key={current} className="min-h-[220px]" style={{ animation: 'fadeSlideIn 0.25s ease' }}>
        {children}
      </div>

      {/* Rodapé de navegação */}
      {!hideFooter && (
        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <Button variant="outline" size="sm" onClick={onBack} disabled={isFirst || loading} className="gap-1.5">
            <ChevronLeft className="h-4 w-4" />
            {backLabel}
          </Button>
          <Button variant="success" size="sm" onClick={onNext} disabled={nextDisabled || loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {resolvedNextLabel}
            {!isLast && !loading && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      )}
    </div>
  )
}
