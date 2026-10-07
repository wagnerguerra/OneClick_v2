'use client'

/**
 * WizardShell — casca reutilizável de assistente passo-a-passo (stepper).
 *
 * Padrão que não existia no projeto: um foco por tela, indicador de progresso
 * no topo (círculos numerados ligados por trilha, nome embaixo; ativo = cor do
 * contexto via `color`, concluído = verde semântico),
 * corpo animado (`fadeSlideIn`, keyed pelo passo atual) e rodapé Voltar/Próximo/
 * Concluir. É controlado — o pai gerencia `current` e os handlers.
 *
 * Usado pelo wizard de cadastro base (`servico-wizard`) e pelo assistente de
 * fluxo (`fluxo-assistant`). Só chrome — nenhuma regra de negócio aqui.
 */

import type { ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button, cn } from '@saas/ui'
import { FILL } from '@/lib/color-styles'

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
      {/* Indicador de passos — colunas iguais: círculo em cima, nome embaixo
          (centralizado, pode quebrar em 2 linhas). Assim muitos passos cabem na
          largura sem scroll horizontal e sem cortar os nomes. A trilha entre os
          círculos é desenhada por coluna (do centro dela ao centro da próxima). */}
      <div className="grid gap-x-1 px-1 pb-5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const done = i < current
          const active = i === current
          const clickable = !!onNavigate && i <= current && i !== current
          return (
            <div key={s.key} className="relative min-w-0">
              {i < steps.length - 1 && (
                <span
                  className={cn('absolute top-[18px] left-[calc(50%+18px)] right-[calc(-50%+14px)] h-px transition-colors', done ? '' : 'bg-border')}
                  style={done ? { backgroundColor: color } : undefined}
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onNavigate?.(i)}
                className={cn(
                  'relative flex w-full flex-col items-center gap-1.5 rounded-md px-1 py-1 text-center transition-colors',
                  clickable ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default',
                )}
                title={s.title}
              >
                {/* Concluído = verde semântico (progresso); ativo = cor do contexto. */}
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-colors',
                    done && cn(FILL.emerald, 'text-white'),
                    !done && !active && 'bg-muted text-muted-foreground',
                  )}
                  style={active ? { backgroundColor: color, color: '#fff' } : undefined}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'hidden text-[12px] leading-tight break-words sm:block',
                    active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {s.title}
                  {s.optional && <span className="block text-[10px] text-muted-foreground/70">(opcional)</span>}
                </span>
              </button>
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
