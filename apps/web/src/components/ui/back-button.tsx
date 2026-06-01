'use client'

/**
 * BackButton — botão padronizado de "voltar" para headers de páginas de detalhe.
 *
 * Padrão da casa: SEMPRE usar esse componente em vez de copiar
 *   <Button variant="outline" size="icon-sm" onClick={() => router.push(...)}>
 *
 * Resolve dois bugs recorrentes:
 *   1. Hover sumir o ícone no tema claro (hover:bg-white + ícone branco).
 *   2. Botão branco gritante sobre o gradiente do header no dark mode.
 *
 * Comportamento:
 *   - href: navega via router.push (recomendado — destino determinístico).
 *   - sem href: tenta router.back(); se não houver histórico, cai pra "/".
 *
 * Uso:
 *   <BackButton href="/helpdesk" />          // ícone só
 *   <BackButton href="/clientes" label="Voltar" />  // ícone + texto
 *   <BackButton />                            // history.back com fallback
 */

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button, cn } from '@saas/ui'

export interface BackButtonProps {
  /** Destino. Se omitido, usa router.back() com fallback pra "/". */
  href?: string
  /** Texto opcional. Se ausente, renderiza só o ícone (size icon-sm). */
  label?: string
  /** Fallback de history.back quando não há histórico (default "/"). */
  fallbackHref?: string
  className?: string
  title?: string
}

export function BackButton({
  href,
  label,
  fallbackHref = '/',
  className,
  title = 'Voltar',
}: BackButtonProps) {
  const router = useRouter()

  const onClick = () => {
    if (href) {
      router.push(href)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push(fallbackHref)
    }
  }

  // Cores do design system para "botão voltar sobre header colorido":
  // - Light: bg branco quase-opaco, hover desliga 10% (mantém o ícone visível)
  // - Dark: bg do card (escuro), hover 90% — não vira clarão branco sobre gradiente
  // - Borda e ícone sempre `foreground` (nunca branco fixo)
  const baseClass = cn(
    'bg-white text-foreground hover:bg-white/90',
    'dark:bg-card dark:hover:bg-card/90 dark:border-white/15',
    className,
  )

  if (label) {
    return (
      <Button variant="outline" size="sm" onClick={onClick} title={title} className={cn('gap-1.5', baseClass)}>
        <ArrowLeft className="h-4 w-4" />
        {label}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="icon-sm" onClick={onClick} title={title} className={baseClass}>
      <ArrowLeft className="h-4 w-4" />
    </Button>
  )
}
