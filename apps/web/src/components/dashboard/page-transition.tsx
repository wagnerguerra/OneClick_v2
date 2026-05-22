'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

/**
 * Fade-out/in suave entre páginas. Anima só a opacidade — children é renderizado
 * direto, sem ser clonado num state (clonar causava reconciliação dupla e
 * "removeChild on null" quando portals/effects de uma página eram desmontados).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    setVisible(false)
    const t = setTimeout(() => setVisible(true), 150)
    return () => clearTimeout(t)
  }, [pathname])

  return (
    <div
      className="transition-opacity duration-200 ease-in-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {children}
    </div>
  )
}
