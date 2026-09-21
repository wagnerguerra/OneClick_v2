'use client'

import { useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input, cn } from '@saas/ui'
import { resolveAssetUrl } from '@/lib/api-url'
import { useAnchoredDropdown } from '@/components/ui/use-anchored-dropdown'

/**
 * Combobox filtravel para selecionar usuario (solicitante / responsavel).
 * Mostra avatar (foto ou iniciais) na trigger e na lista.
 *
 * O dropdown usa `position: fixed` inline (via `useAnchoredDropdown`) — não é cortado
 * por ancestrais com `overflow-hidden` (ex.: card "Detalhes") e funciona dentro de modais.
 */
export function UserCombobox({ users, value, onSelect, disabled, placeholder }: {
  users: Array<{ id: string; name: string; image?: string | null }>
  value: string
  onSelect: (id: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const close = useCallback(() => { setOpen(false); setQuery('') }, [])
  const { anchorRef, popRef, posRef, reposition } = useAnchoredDropdown(open, close)
  const selected = users.find(u => u.id === value)
  const filtered = query.trim()
    ? users.filter(u => u.name.toLowerCase().includes(query.toLowerCase()))
    : users

  function toggle() {
    if (disabled) return
    if (!open) reposition()
    setOpen(o => !o)
  }

  function getInitials(name: string) {
    return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
  }

  return (
    <div ref={anchorRef} className="relative w-full">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          // Sem bg/borda próprios: herda o visual da regra global de
          // `button[role="combobox"]` (globals.css), idêntico aos inputs.
          'flex h-9 w-full items-center justify-between text-sm focus:outline-none',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            {selected.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveAssetUrl(selected.image)} alt={selected.name} className="h-5 w-5 rounded-full object-cover shrink-0" />
            ) : (
              <span className="h-5 w-5 rounded-full bg-muted flex items-center justify-center shrink-0">
                <span className="text-[8px] font-bold text-muted-foreground">{getInitials(selected.name)}</span>
              </span>
            )}
            <span className="truncate">{selected.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground truncate">{placeholder ?? 'Selecione'}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </button>
      {open && posRef.current && (
        <div
          ref={popRef}
          className="fixed z-[9999] overflow-hidden rounded-md border bg-popover shadow-md"
          style={{ top: posRef.current.top, left: posRef.current.left, width: posRef.current.width }}
        >
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar usuário..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto nice-scrollbar py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum usuário encontrado</p>
            ) : filtered.map(u => (
              <button
                key={u.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2',
                  value === u.id && 'bg-accent text-accent-foreground',
                )}
                onClick={() => { onSelect(u.id); close() }}
              >
                {u.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveAssetUrl(u.image)} alt={u.name} className="h-6 w-6 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-muted-foreground">{getInitials(u.name)}</span>
                  </span>
                )}
                <span className="truncate">{u.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
