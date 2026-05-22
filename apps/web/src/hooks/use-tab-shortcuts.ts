'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTabs } from '@/lib/tabs-store'

/**
 * Atalhos de teclado para o sistema de abas:
 *   Ctrl/Cmd + W       → fecha a aba ativa (se não for fixada)
 *   Ctrl/Cmd + T       → vai para o dashboard (proxy de "nova aba")
 *   Ctrl/Cmd + Tab     → próxima aba
 *   Ctrl/Cmd + Shift+Tab → aba anterior
 *   Ctrl/Cmd + 1..9    → pula para aba na posição N
 *
 * Ignora atalhos quando o foco está em <input>, <textarea> ou contenteditable.
 */
export function useTabShortcuts() {
  const router = useRouter()
  const pathname = usePathname()
  const { tabs, close } = useTabs()

  useEffect(() => {
    function isEditableTarget(t: EventTarget | null) {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      if (t.isContentEditable) return true
      return false
    }

    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      // Ordenadas: pinned primeiro, depois normais por ordem
      const ordenadas = [...tabs].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return a.ordem - b.ordem
      })
      const activeIdx = ordenadas.findIndex(t => {
        const tClean = t.href.split('?')[0]!.split('#')[0]
        const pClean = pathname.split('?')[0]!.split('#')[0]
        return tClean === pClean
      })

      // Ctrl+W → fecha ativa
      if ((e.key === 'w' || e.key === 'W') && !e.shiftKey && !e.altKey) {
        if (isEditableTarget(e.target)) return
        if (activeIdx === -1) return
        const ativa = ordenadas[activeIdx]!
        if (ativa.pinned) return // não fecha pinada
        e.preventDefault()
        // Navega antes de fechar pra evitar tela em branco
        const proxima = ordenadas[activeIdx + 1] || ordenadas[activeIdx - 1]
        if (proxima) router.push(proxima.href)
        else router.push('/dashboard')
        close(ativa.id)
        return
      }

      // Ctrl+T → ir ao dashboard (placeholder de "nova aba")
      if ((e.key === 't' || e.key === 'T') && !e.shiftKey && !e.altKey) {
        if (isEditableTarget(e.target)) return
        e.preventDefault()
        router.push('/dashboard')
        return
      }

      // Ctrl+Tab / Ctrl+Shift+Tab → próxima/anterior
      if (e.key === 'Tab') {
        if (ordenadas.length < 2) return
        e.preventDefault()
        const idx = activeIdx === -1 ? 0 : activeIdx
        const next = e.shiftKey
          ? ordenadas[(idx - 1 + ordenadas.length) % ordenadas.length]!
          : ordenadas[(idx + 1) % ordenadas.length]!
        router.push(next.href)
        return
      }

      // Ctrl+1..9 → pula para aba N
      if (/^[1-9]$/.test(e.key) && !e.shiftKey && !e.altKey) {
        if (isEditableTarget(e.target)) return
        const n = parseInt(e.key, 10) - 1
        if (ordenadas[n]) {
          e.preventDefault()
          router.push(ordenadas[n].href)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabs, pathname, router, close])
}
