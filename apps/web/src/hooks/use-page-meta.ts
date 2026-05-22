'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { navigation } from '@/lib/navigation'

// Cor hex por grupo (mesmas do sidebar-group)
const GROUP_HEX: Record<string, string> = {
  'Cadastros': '#34d399', 'Comercial': '#fb7185', 'Administrativo': '#38bdf8',
  'Legalização': '#e879f9', 'Trabalhista': '#a3e635', 'Fiscal': '#818cf8',
  'Contábil': '#a78bfa', 'TI': '#22d3ee', 'Qualidade': '#fbbf24', 'Configurações': '#fb923c',
}

const DEFAULT_COLOR = '#5ea3cb'
const APP_NAME = 'OneClick'

function findCurrentPage(pathname: string): { label: string; groupLabel: string; hex: string } | null {
  for (const group of navigation) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        return {
          label: item.label,
          groupLabel: group.label,
          hex: GROUP_HEX[group.label] ?? DEFAULT_COLOR,
        }
      }
    }
  }
  return null
}

function buildFaviconSvg(hex: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="${hex}"/><text x="16" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-weight="bold" font-size="18" fill="white">O</text></svg>`
}

/**
 * Reutiliza o <link rel="icon"> que o Next.js coloca no SSR.
 * NÃO removemos o elemento — fazer .remove() invalida a ref interna do Next,
 * que depois bate em null no commitDeletionEffectsOnFiber (removeChild).
 */
function setFavicon(hex: string) {
  if (typeof document === 'undefined') return

  const svg = buildFaviconSvg(hex)
  const blob = new Blob([svg], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }

  const oldUrl = link.href
  link.type = 'image/svg+xml'
  link.href = url
  if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl)
}

export function usePageMeta() {
  const pathname = usePathname()

  useEffect(() => {
    // Rotas que controlam seu próprio document.title (ex.: páginas de impressão
    // usam o título como nome sugerido do PDF). Não sobrescrever.
    const isPrintPage = /\/imprimir(?:$|\/|\?)/.test(pathname)
    if (isPrintPage) {
      setFavicon(DEFAULT_COLOR)
      return
    }

    const page = findCurrentPage(pathname)
    const title = page
      ? `${page.label} · ${APP_NAME}`
      : pathname === '/dashboard'
        ? `Dashboard · ${APP_NAME}`
        : APP_NAME
    const hex = page?.hex ?? DEFAULT_COLOR

    document.title = title
    setFavicon(hex)
  }, [pathname])
}
