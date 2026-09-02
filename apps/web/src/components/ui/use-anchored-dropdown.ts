'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * Posicionamento de um dropdown ancorado a um gatilho, com `position: fixed`
 * (coordenadas calculadas da trigger), para o menu NÃO ser cortado por ancestrais
 * com `overflow-hidden`/`auto`. É `fixed` INLINE (renderizado no próprio DOM do
 * componente, sem `createPortal`): assim escapa do overflow — `fixed` só é cortado
 * por ancestral que crie containing block (`transform`/`filter`/`perspective`/
 * `contain`/`will-change:transform`/`backdrop-filter`), o que não ocorre no layout
 * do dashboard — E, por continuar no DOM do componente, funciona dentro de um
 * Radix Dialog modal de graça (fica no escopo interativo do modal). Nada de portal
 * no `document.body`, que exigiria furar o `pointer-events:none` do modal.
 *
 * - `anchorRef`: vai no wrapper do gatilho (a largura do menu = largura dele).
 * - `popRef`: vai no `<div>` do menu (inline, `className="fixed z-[9999] …"`).
 * - `posRef.current`: `{top,left,width}` calculado do gatilho — use no `style` do menu.
 * - `reposition()`: recalcula a posição; **chame ANTES de abrir** (síncrono, para o
 *   primeiro paint já sair posicionado).
 *
 * Ao **rolar a página** o menu FECHA (padrão dos `<select>` nativos) — em vez de
 * tentar segui-lo. Seguir um elemento `fixed` pelo evento de scroll roda na thread
 * principal, sempre um quadro atrás do scroll composto na GPU, e o menu "descola e
 * reencaixa". Fechar elimina esse jank. A rolagem DENTRO da própria lista do menu
 * não fecha; o `resize` reposiciona (evento pontual, sem jank).
 */
export function useAnchoredDropdown(open: boolean, close: () => void) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const posRef = useRef<{ top: number; left: number; width: number } | null>(null)

  const reposition = useCallback(() => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    posRef.current = { top: r.bottom + 4, left: r.left, width: r.width }
    const p = popRef.current
    if (p) {
      p.style.top = `${posRef.current.top}px`
      p.style.left = `${posRef.current.left}px`
      p.style.width = `${posRef.current.width}px`
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onMouse(e: MouseEvent) {
      const t = e.target as Node
      if (anchorRef.current?.contains(t) || popRef.current?.contains(t)) return
      close()
    }
    // O autoFocus no campo de busca pode disparar um scroll na abertura — ignora
    // os primeiros ~150ms para o menu não se fechar sozinho ao abrir.
    let armed = false
    const armTimer = setTimeout(() => { armed = true }, 150)
    function onScroll(e: Event) {
      // rolagem dentro da própria lista do menu não fecha
      if (popRef.current && e.target instanceof Node && popRef.current.contains(e.target)) return
      if (armed) close()
    }
    const onResize = () => reposition()
    document.addEventListener('mousedown', onMouse)
    window.addEventListener('scroll', onScroll, true) // capture: pega scroll de qualquer ancestral
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(armTimer)
      document.removeEventListener('mousedown', onMouse)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, close, reposition])

  return { anchorRef, popRef, posRef, reposition }
}
