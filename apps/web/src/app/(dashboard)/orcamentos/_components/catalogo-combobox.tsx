'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { Input, cn } from '@saas/ui'
import { useAnchoredDropdown } from '@/components/ui/use-anchored-dropdown'

/**
 * Combobox do catálogo unificado de itens (serviços / taxas / despesas).
 * Usado no detalhe do orçamento (adicionar/editar item, filtrado por tipo) e
 * no filtro "Item" da lista de orçamentos (sem tipo = todos os itens).
 *
 * O dropdown usa `position: fixed` inline (`useAnchoredDropdown`) — escapa de containers
 * com overflow (não é recortado pela <Table> nem pelo painel de filtros, #HLP0088) e
 * funciona dentro de modais.
 */
export function CatalogoCombobox({ catalogo, tipo, selectedId, onSelect, disabled, currentLabel, placeholder }: {
  catalogo: Array<{ id: string; nome: string; tipo: string; valorPadrao: number | string | null }>
  // Informado = filtra por tipo (SERVICO/TAXA/DESPESA). Omitido = todos os itens.
  tipo?: string
  selectedId: string
  onSelect: (id: string) => void
  disabled?: boolean
  // Rótulo a exibir quando o valor atual não casa com nenhum item do catálogo
  // (ex.: edição de item com descrição livre/legada) — evita esconder o texto.
  currentLabel?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const close = useCallback(() => { setOpen(false); setQuery('') }, [])
  const { anchorRef, popRef, posRef, reposition } = useAnchoredDropdown(open, close)

  const opcoes = tipo ? catalogo.filter(c => c.tipo === tipo) : catalogo
  const filtered = query.trim()
    ? opcoes.filter(c => c.nome.toLowerCase().includes(query.toLowerCase()))
    : opcoes
  const selected = opcoes.find(c => c.id === selectedId)

  // Limpa busca/fecha quando o tipo muda externamente
  useEffect(() => { setQuery(''); setOpen(false) }, [tipo])

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => { if (disabled) return; if (!open) reposition(); setOpen(o => !o) }}
        className={cn(
          // Sem bg/borda próprios: herda o visual global de button[role="combobox"].
          'flex h-9 w-full items-center justify-between text-sm focus:outline-none',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className={cn('truncate', !selected && !currentLabel && 'text-muted-foreground', (selected || currentLabel) && 'uppercase')}>
          {disabled ? 'Selecione um tipo primeiro' : selected ? selected.nome : currentLabel || (placeholder ?? 'Selecione um item')}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
      </button>
      {open && posRef.current && (
        <div
          ref={popRef}
          style={{ top: posRef.current.top, left: posRef.current.left, width: posRef.current.width }}
          className="fixed z-[9999] overflow-hidden rounded-md border bg-popover shadow-md"
        >
          <div className="p-1.5 border-b bg-popover sticky top-0">
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="h-7 text-xs"
            />
          </div>
          <div className="max-h-56 overflow-y-auto nice-scrollbar py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">Nenhum item encontrado</p>
            ) : filtered.map(c => (
              <button
                key={c.id}
                type="button"
                className={cn(
                  'w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center justify-between gap-2 uppercase',
                  selectedId === c.id && 'bg-accent text-accent-foreground',
                )}
                onClick={() => { onSelect(c.id); close() }}
              >
                <span className="truncate">{c.nome}</span>
                {c.valorPadrao != null && (
                  <span className="text-muted-foreground whitespace-nowrap shrink-0">
                    R$ {Number(c.valorPadrao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
