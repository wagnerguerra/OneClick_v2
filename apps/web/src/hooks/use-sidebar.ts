'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

const SIDEBAR_KEY = 'sidebar-collapsed'

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY)
    if (stored === 'true') {
      setCollapsed(true)
    }
    setMounted(true)
    // Painel "Configurações de layout" muda a preferência por fora
    const onPrefs = (e: Event) => {
      if ((e as CustomEvent).detail?.chave !== 'sidebar') return
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === 'true')
    }
    window.addEventListener('oc-prefs', onPrefs)
    return () => window.removeEventListener('oc-prefs', onPrefs)
  }, [])

  // Fechar sidebar mobile ao navegar
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      window.dispatchEvent(new CustomEvent('oc-prefs', { detail: { chave: 'sidebar' } }))
      return next
    })
  }, [])

  const openMobile = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return { collapsed, toggle, mobileOpen, openMobile, closeMobile, mounted }
}
