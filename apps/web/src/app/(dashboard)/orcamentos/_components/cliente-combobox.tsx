'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Plus, Loader2 } from 'lucide-react'
import { Input, cn } from '@saas/ui'

/**
 * Formata documento (CPF 11 dígitos / CNPJ 14 dígitos) com máscara padrão.
 * Outros tamanhos retornam string sem formatação (#HLP0081).
 */
function formatDocumento(doc: string | null | undefined): string {
  if (!doc) return ''
  const d = doc.toUpperCase().replace(/[^0-9A-Z]/g, '') // preserva letras (CNPJ alfanumérico)
  if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  return doc
}

/**
 * Combobox filtravel para selecionar cliente — busca por razao social
 * ou documento (CNPJ/CPF). Usado no modal de criacao e no detalhe do
 * orcamento.
 */
export function ClienteCombobox({ clientes, value, onSelect, placeholder, disabled, onCreate }: {
  clientes: Array<{ id: string; razaoSocial: string; documento?: string | null }>
  value: string
  onSelect: (id: string) => void
  placeholder?: string
  disabled?: boolean
  /** Quando informado, mostra "Cadastrar '<nome>'" se a busca não casar com
   *  nenhum cliente. Deve criar o cliente e retornar o id (ou null se falhar). */
  onCreate?: (nome: string) => Promise<string | null>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = clientes.find(c => c.id === value)
  // Filtro busca tanto na razão social quanto no documento — com e sem
  // formatação. User pode digitar "07.567" ou "07567" e ambos casam.
  const q = query.trim().toLowerCase()
  const qDigits = query.replace(/\D/g, '')
  const filtered = q
    ? clientes.filter(c => {
        if (c.razaoSocial.toLowerCase().includes(q)) return true
        if (!c.documento) return false
        const docDigits = c.documento.replace(/\D/g, '')
        if (qDigits && docDigits.includes(qDigits)) return true
        return false
      })
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

  // Mostra o atalho de cadastro quando há texto digitado, há onCreate e o termo
  // não bate exatamente com a razão social de um cliente já listado.
  const nomeNovo = query.trim()
  const existeExato = clientes.some(c => c.razaoSocial.trim().toLowerCase() === nomeNovo.toLowerCase())
  const podeCadastrar = !!onCreate && nomeNovo.length >= 2 && !existeExato

  async function handleCreate() {
    if (!onCreate || creating) return
    setCreating(true)
    try {
      const id = await onCreate(nomeNovo)
      if (id) { onSelect(id); setOpen(false); setQuery('') }
    } finally {
      setCreating(false)
    }
  }

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
              <span className="text-[11px] text-muted-foreground font-mono leading-tight">{formatDocumento(selected.documento)}</span>
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
              !podeCadastrar && <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum cliente encontrado</p>
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
                  <span className="text-[11px] text-muted-foreground font-mono leading-tight">{formatDocumento(c.documento)}</span>
                )}
              </button>
            ))}
            {/* Atalho: cadastrar o nome digitado como novo cliente (lead/prospect) */}
            {podeCadastrar && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2 border-t mt-1 text-foreground disabled:opacity-60"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                <span className="truncate">
                  Cadastrar <span className="font-semibold">“{nomeNovo}”</span> como novo cliente
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
