'use client'

/**
 * Casca do painel de preview dos quadros (kanban): véu claro sobre o quadro,
 * painel flutuante à direita que se "desenrola" de cima para baixo e some com
 * fade ao fechar (✕, Esc ou clique fora). Mesmas animações do preview de
 * orçamentos (classes preview-* do globals.css).
 *
 * O conteúdo fica por conta de quem usa. Termina a 80px da base da tela: o
 * botão + de feedback (fixo, acima de modais) cobriria o rodapé.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@saas/ui'

export function PainelPreview({ aberto, onFechar, rotulo, className, children }: {
  aberto: boolean
  onFechar: () => void
  /** Nome acessível do diálogo. */
  rotulo: string
  /** Largura etc. — padrão: até 1100px. */
  className?: string
  children: ReactNode
}) {
  // Mantém montado durante a animação de saída.
  const [montado, setMontado] = useState(aberto)
  const [saindo, setSaindo] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (aberto) { setSaindo(false); setMontado(true) }
    else if (montado) {
      setSaindo(true)
      timer.current = setTimeout(() => { setMontado(false); setSaindo(false) }, 240)
    }
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc fecha — a menos que haja outra camada aberta por cima (select,
  // dropdown, diálogo do Radix): o Esc é dela.
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="alertdialog"], .swal2-container')) return
      e.preventDefault()
      onFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  if (!montado) return null
  return (
    <div className="fixed inset-0 z-50" aria-modal="true" aria-label={rotulo}>
      <div
        className={cn('absolute inset-0 bg-background/55 backdrop-blur-[1.5px]', saindo ? 'preview-veu-out' : 'preview-veu-in')}
        onClick={onFechar}
      />
      <aside
        className={cn(
          'absolute bottom-20 right-2 top-2 flex w-[min(1100px,calc(100vw-16px))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl',
          saindo ? 'preview-painel-out' : 'preview-painel-in',
          className,
        )}
      >
        {children}
      </aside>
    </div>
  )
}
