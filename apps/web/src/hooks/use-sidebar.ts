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
  }, [])

  // Fechar sidebar mobile ao navegar
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem(SIDEBAR_KEY, String(next))
      return next
    })
  }, [])

  const openMobile = useCallback(() => setMobileOpen(true), [])
  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return { collapsed, toggle, mobileOpen, openMobile, closeMobile, mounted }
}
