'use client'

import { useEffect, useState } from 'react'

/**
 * `true` quando o tema atual é escuro. Observa a classe `dark` no `<html>`
 * (que o `useTheme` alterna), então reage a toggles de tema em tempo real.
 *
 * Para estilos inline que dependem do tema — ex.: a cor de um tipo de evento
 * adaptada ao dark (`chipTipoEvento`) — em componentes que não têm esse estado.
 */
export function useIsDark() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const el = document.documentElement
    const update = () => setIsDark(el.classList.contains('dark'))
    update()
    const obs = new MutationObserver(update)
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return isDark
}
