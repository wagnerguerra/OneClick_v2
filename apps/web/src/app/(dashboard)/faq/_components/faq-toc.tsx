'use client'

import { useEffect, useState } from 'react'
import { cn } from '@saas/ui'

/**
 * Índice lateral (TOC) do artigo. Varre os títulos (h2/h3) dentro de
 * `[data-faq-body]`, atribui ids quando faltam e monta pills que rolam até a
 * seção. Funciona igual p/ artigos de código e do banco (lê o DOM renderizado).
 * Destaca a seção ativa via IntersectionObserver.
 */
interface TocItem { id: string; text: string; level: number }

function slugHeading(text: string, i: number): string {
  const base = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${base || 'sec'}-${i}`
}

export function FaqToc({ cor, className }: { cor: string; className?: string }) {
  const [items, setItems] = useState<TocItem[]>([])
  const [active, setActive] = useState('')

  useEffect(() => {
    const body = document.querySelector('[data-faq-body]')
    if (!body) return
    let io: IntersectionObserver | null = null

    const build = () => {
      const hs = Array.from(body.querySelectorAll('h2, h3')) as HTMLElement[]
      const list: TocItem[] = []
      hs.forEach((h, i) => {
        const text = (h.textContent || '').trim()
        if (!text) return
        if (!h.id) h.id = slugHeading(text, i)
        list.push({ id: h.id, text, level: h.tagName === 'H3' ? 3 : 2 })
      })
      setItems(list)
      io?.disconnect()
      io = new IntersectionObserver(
        (entries) => {
          const vis = entries.filter(e => e.isIntersecting)
            .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
          if (vis[0]) setActive((vis[0].target as HTMLElement).id)
        },
        { rootMargin: '-80px 0px -70% 0px' },
      )
      hs.forEach(h => { if (h.id) io!.observe(h) })
    }

    build()
    // Conteúdo pode chegar async (next/dynamic dos artigos de código).
    const mo = new MutationObserver(() => build())
    mo.observe(body, { childList: true, subtree: true })
    const t1 = setTimeout(build, 300)
    const t2 = setTimeout(build, 1200)
    return () => { mo.disconnect(); io?.disconnect(); clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (items.length < 2) return null

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <nav className={className}>
      <style dangerouslySetInnerHTML={{ __html: '[data-faq-body] h2,[data-faq-body] h3{scroll-margin-top:5rem}' }} />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-1">Nesta página</p>
      <div className="space-y-0.5">
        {items.map(it => (
          <button
            key={it.id}
            type="button"
            onClick={() => go(it.id)}
            title={it.text}
            className={cn(
              'block w-full text-left rounded-md px-2.5 py-1.5 text-xs transition-colors truncate',
              it.level === 3 && 'pl-4 text-[11px]',
              active === it.id ? 'font-semibold text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            style={active === it.id ? { backgroundColor: cor } : undefined}
          >
            {it.text}
          </button>
        ))}
      </div>
    </nav>
  )
}
