'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input, cn } from '@saas/ui'

/**
 * Combobox filtravel para selecionar cliente — busca por razao social
 * ou documento (CNPJ/CPF). Usado no modal de criacao e no detalhe do
 * orcamento.
 */
export function ClienteCombobox({ clientes, value, onSelect, placeholder, disabled }: {
  clientes: Array<{ id: string; razaoSocial: string; documento?: string | null }>
  value: string
  onSelect: (id: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const selected = clientes.find(c => c.id === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? clientes.filter(c =>
        c.razaoSocial.toLowerCase().includes(q) ||
        (c.documento?.toLowerCase().includes(q) ?? false))
    : clientes

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

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {selected ? (
          <span className="flex flex-col items-start min-w-0 flex-1 truncate">
            <span className="truncate text-sm font-medium leading-tight">{selected.razaoSocial}</span>
            {selected.documento && (
              <span className="text-[10px] text-muted-foreground font-mono leading-tight">{selected.documento}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder ?? 'Selecione'}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar cliente ou CNPJ/CPF..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum cliente encontrado</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-2 text-sm hover:bg-muted flex flex-col gap-0',
                  value === c.id && 'bg-accent text-accent-foreground',
                )}
                onClick={() => { onSelect(c.id); setOpen(false); setQuery('') }}
              >
                <span className="text-sm font-medium leading-tight truncate">{c.razaoSocial}</span>
                {c.documento && (
                  <span className="text-[10px] text-muted-foreground font-mono leading-tight">{c.documento}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
