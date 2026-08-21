'use client'

import { useEffect, useRef, type RefObject } from 'react'

/**
 * Barra de rolagem que só aparece enquanto o usuário rola.
 *
 * Use junto com a classe `.scrollbar-autohide` (globals.css): o hook liga
 * `data-scrolling` no container durante a rolagem e desliga `idleMs` depois do
 * último evento; o CSS revela/esconde o thumb com transição. Padrão dos kanbans
 * (CRM, Orçamentos) — a barra nativa permanente poluía as colunas longas.
 *
 *   const ref = useAutoHideScrollbar<HTMLDivElement>()
 *   <div ref={ref} className="overflow-y-auto scrollbar-autohide">…</div>
 */
export function useAutoHideScrollbar<T extends HTMLElement>(idleMs = 700): RefObject<T | null> {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      el.setAttribute('data-scrolling', 'true')
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => el.removeAttribute('data-scrolling'), idleMs)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (timer) clearTimeout(timer)
    }
  }, [idleMs])
  return ref
}
