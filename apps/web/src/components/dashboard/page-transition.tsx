'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const [content, setContent] = useState(children)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    // Fade out rápido, troca conteúdo, fade in
    setVisible(false)
    const timeout = setTimeout(() => {
      setContent(children)
      setVisible(true)
    }, 150)

    return () => clearTimeout(timeout)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sempre atualizar o conteúdo quando children muda (ex: dados carregados)
  useEffect(() => {
    setContent(children)
  }, [children])

  return (
    <div
      className="transition-opacity duration-200 ease-in-out"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {content}
    </div>
  )
}
