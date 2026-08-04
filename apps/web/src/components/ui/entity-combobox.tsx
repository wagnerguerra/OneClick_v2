'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input, cn } from '@saas/ui'

export interface EntityOption {
  id: string
  /** Linha principal — é por ela que a busca casa primeiro. */
  label: string
  /** Linha secundária (documento, código, e-mail...). Também entra na busca. */
  sublabel?: string | null
}

/** Normaliza para comparação: sem acento, sem pontuação, minúsculo. */
function norm(v: string) {
  return v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}
/** Só letras e números — deixa "07.567/0001-95" casar com "075670001". */
function alnum(v: string) {
  return v.replace(/[^0-9a-zA-Z]/g, '').toLowerCase()
}

/**
 * Select filtrável genérico — dropdown com campo de busca no topo. Use quando a
 * lista é longa o bastante para rolar (fornecedores, clientes, serviços...), no
 * lugar de um `<Select>` puro, que só permite achar o item rolando.
 *
 * A busca casa na `label` (sem acento) e na `sublabel` (com e sem pontuação),
 * então o usuário acha tanto por "aliança" quanto por "07567".
 */
export function EntityCombobox({
  items, value, onSelect, placeholder, searchPlaceholder, emptyText, disabled, className,
}: {
  items: EntityOption[]
  value: string
  onSelect: (id: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = items.find((i) => i.id === value)

  const filtered = useMemo(() => {
    const q = norm(query)
    if (!q) return items
    const qa = alnum(query)
    return items.filter((i) => {
      if (norm(i.label).includes(q)) return true
      if (!i.sublabel) return false
      if (norm(i.sublabel).includes(q)) return true
      return qa.length > 0 && alnum(i.sublabel).includes(qa)
    })
  }, [items, query])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          // Sem bg/borda próprios: herda o visual da regra global de
          // `button[role="combobox"]` (globals.css), idêntico aos inputs.
          'flex h-9 w-full items-center justify-between text-sm focus:outline-none',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {selected ? (
          <span className="flex min-w-0 flex-1 flex-col items-start truncate">
            <span className="truncate text-sm font-medium leading-tight">{selected.label}</span>
            {selected.sublabel && (
              <span className="font-mono text-[11px] leading-tight text-muted-foreground">{selected.sublabel}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder ?? 'Selecione'}</span>
        )}
        <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <div className="sticky top-0 border-b border-border bg-popover p-1.5">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? 'Buscar...'}
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">{emptyText ?? 'Nenhum resultado'}</p>
            ) : filtered.map((i) => (
              <button
                key={i.id}
                type="button"
                className={cn(
                  'flex w-full flex-col gap-0 px-3 py-2 text-left text-sm hover:bg-muted',
                  value === i.id && 'bg-accent text-accent-foreground',
                )}
                onClick={() => { onSelect(i.id); setOpen(false); setQuery('') }}
              >
                <span className="truncate text-sm font-medium leading-tight">{i.label}</span>
                {i.sublabel && (
                  <span className="font-mono text-[11px] leading-tight text-muted-foreground">{i.sublabel}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
