import { useState, useEffect, type ReactNode } from 'react'
import { Save, Loader2, ArrowLeft, HelpCircle, type LucideIcon } from 'lucide-react'
import {
  Button,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Tooltip, TooltipTrigger, TooltipContent,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { NONE, MODE_ACCENT } from './types'

/**
 * Ação primária (Salvar / Criar modelo) fixada no rodapé, sempre acessível na
 * visão geral do modelo — sem precisar rolar até o topo. Fica no centro-baixo
 * da tela para não colidir com o FAB "Fale com a TI" (canto inferior direito)
 * nem com o rail de tarefas. z-40 mantém abaixo de modais/alertas (z-50).
 */
export function FloatingActionBar({
  primaryLabel, onPrimary, loading = false, primaryIcon: Icon = Save, primaryIconRight = false, onBack,
}: {
  primaryLabel: string; onPrimary: () => void; loading?: boolean
  primaryIcon?: LucideIcon; primaryIconRight?: boolean; onBack?: () => void
}) {
  // Anima a entrada: monta "escondida" (deslocada + transparente) e no próximo
  // frame passa para o estado visível, deixando a transição do CSS rolar.
  // Mesmo padrão do FAB — usa só utilitários core do Tailwind (sem plugin).
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  const glyph = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-6 z-40 flex items-center justify-center gap-2 pointer-events-none',
        'transition-all duration-500 ease-out will-change-transform',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      {onBack && (
        <Button
          variant="outline"
          onClick={onBack}
          className="pointer-events-auto h-11 gap-2 rounded-full bg-card px-5 text-sm font-semibold shadow-lg shadow-black/20 ring-1 ring-black/5 transition-all duration-100 active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" /> Etapa anterior
        </Button>
      )}
      <Button
        variant="success"
        onClick={onPrimary}
        disabled={loading}
        className="pointer-events-auto h-11 gap-2 rounded-full px-6 text-sm font-semibold shadow-lg shadow-black/25 ring-1 ring-black/5 transition-all duration-100 active:scale-95"
      >
        {!primaryIconRight && glyph}
        {primaryLabel}
        {primaryIconRight && glyph}
      </Button>
    </div>
  )
}

/** Ajuda colapsada: "?" que revela o texto no hover. */
export function HelpTip({ text, side = 'top' }: { text: string; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground cursor-help transition-colors" />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Cabeçalho de etapa: ícone colorido + título + ajuda colapsada (tooltip no "?").
 * `color` é uma classe de fundo Tailwind (mantém dark mode, sem hex hardcoded).
 */
export function StepHeader({ icon: Icon, title, hint, color }: { icon: LucideIcon; title: string; hint: string; color: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2 -mx-5 px-5">
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-white', color)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
      <HelpTip text={hint} side="right" />
    </div>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground italic">{children}</p>
}

/** Barra de etapas do wizard — clicável para etapas já alcançadas. */
export function Stepper({ labels, current, maxStep, onGo }: { labels: string[]; current: number; maxStep: number; onGo: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {labels.map((label, i) => {
        const active = i === current
        const reachable = i <= maxStep
        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onGo(i)}
              className={cn(
                'flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'text-white'
                  : reachable
                    ? 'bg-muted/50 text-foreground hover:bg-muted cursor-pointer'
                    : 'bg-muted/30 text-muted-foreground/60 cursor-not-allowed',
              )}
              style={active ? { backgroundColor: 'var(--mod-contabil, #a78bfa)' } : undefined}
            >
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', active ? 'bg-white/25' : 'bg-foreground/10')}>{i + 1}</span>
              {label}
            </button>
            {i < labels.length - 1 && <span className="px-1 text-muted-foreground/40">›</span>}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Seletor EXCLUSIVO (radio-cards) das etapas de 2 modos. Cada opção é um card com
 * bolinha de radio; só um fica ativo (destacado com a cor da etapa). Deixa claro
 * que é "um OU outro" — em testes com usuários o segmented control antigo parecia
 * abas, dando a impressão de que as duas precisavam ser preenchidas.
 */
export function ModeCards({ value, options, onChange, accent }: {
  value: string
  options: Array<{ value: string; label: string; hint?: string }>
  onChange: (v: string) => void
  accent: keyof typeof MODE_ACCENT
}) {
  const A = MODE_ACCENT[accent]
  return (
    <div role="radiogroup" className={cn('grid gap-2 max-w-2xl', options.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-[4px] border px-3 py-2.5 text-left transition-colors',
              active ? cn(A.border, A.bg, 'ring-1', A.ring) : 'border-border/60 bg-muted/20 hover:bg-muted/40',
            )}
          >
            <span className={cn(
              'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
              active ? A.border : 'border-muted-foreground/40',
            )}>
              {active && <span className={cn('h-2 w-2 rounded-full', A.dot)} />}
            </span>
            <span>
              <span className={cn('block text-xs font-medium', active ? A.text : 'text-foreground')}>{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{o.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function ColumnSelect({ headers, value, optional, onChange, placeholder = 'Selecione a coluna', className }: { headers: string[]; value: string; optional?: boolean; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  const options = value && !headers.includes(value) ? [value, ...headers] : headers
  // Obrigatório: sem seleção → value '' (Radix exibe o placeholder).
  // Opcional: NONE é o sentinela do item "— Nenhuma —".
  const selectValue = optional ? (value || NONE) : value
  return (
    <Select value={selectValue} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className={cn('h-9 text-sm bg-card', className)}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {optional && <SelectItem value={NONE}>— Nenhuma —</SelectItem>}
        {options.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
