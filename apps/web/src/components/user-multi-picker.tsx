'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Input, cn } from '@saas/ui'
import { resolveAssetUrl } from '@/lib/api-url'

/**
 * Multi-select de usuários com chips e checklist.
 *
 * Nasceu dentro da tela de orçamentos (notificar/restringir mensagens) e mora
 * aqui porque outros módulos precisam do mesmo controle — Documentos Internos
 * usa para os elaboradores da revisão. Duas cópias divergiriam na primeira
 * melhoria feita de um lado só.
 *
 * `accentClass` deixa a marca do checkbox na cor do módulo; sem ela, cai no
 * primário do tema.
 */
export function UserMultiPicker({ users, value, onChange, placeholder, disabled, accentClass }: {
  users: Array<{ id: string; name: string; email?: string | null; image?: string | null }>
  value: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  disabled?: boolean
  accentClass?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase()) || (u.email || '').toLowerCase().includes(query.toLowerCase()))
    : users
  const selected = users.filter((u) => value.includes(u.id))

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }
  function remove(id: string) {
    onChange(value.filter((v) => v !== id))
  }
  function getInitials(name: string) {
    return (name || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
  }

  const marca = accentClass ?? 'bg-primary border-primary'

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-sm gap-1 flex-wrap',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="flex items-center gap-1 flex-wrap min-h-7">
          {selected.length === 0 ? (
            <span className="text-muted-foreground text-xs">{placeholder ?? 'Selecione usuários'}</span>
          ) : selected.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 bg-muted rounded-full pl-1 pr-1.5 py-0.5 text-[11px]">
              {u.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveAssetUrl(u.image)} alt={u.name} className="h-4 w-4 rounded-full object-cover" />
              ) : (
                <span className="h-4 w-4 rounded-full bg-background flex items-center justify-center">
                  <span className="text-[7px] font-bold text-muted-foreground">{getInitials(u.name)}</span>
                </span>
              )}
              <span className="truncate max-w-[120px]">{u.name}</span>
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); remove(u.id) }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); remove(u.id) } }}
                className="ml-0.5 hover:text-destructive cursor-pointer"
                aria-label={`Remover ${u.name}`}
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ))}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar usuário..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto nice-scrollbar py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum usuário encontrado</p>
            ) : filtered.map((u) => {
              const isSelected = value.includes(u.id)
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggle(u.id)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2',
                    isSelected && 'bg-accent/40',
                  )}
                >
                  <span className={cn(
                    'h-4 w-4 rounded border flex items-center justify-center shrink-0',
                    isSelected ? marca : 'border-border',
                  )}>
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </span>
                  {u.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveAssetUrl(u.image)} alt={u.name} className="h-6 w-6 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-muted-foreground">{getInitials(u.name)}</span>
                    </span>
                  )}
                  <span className="truncate flex-1">{u.name}</span>
                  {u.email && <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{u.email}</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
