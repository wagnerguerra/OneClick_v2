'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@saas/ui'
import { TEXT } from '@/lib/color-styles'

/**
 * Campo de múltiplos e-mails em chips, com sugestões e validação leve.
 *
 * O valor é uma STRING (e-mails separados por "; ") — mesmo formato do campo
 * "E-mails dos Contatos" dos Orçamentos, de onde este componente foi extraído.
 * A migração dos demais módulos para este componente compartilhado é uma task
 * futura (fora do escopo do refactor do HelpDesk).
 */
export function EmailChipsInput({ value, onChange, suggestions = [], placeholder, disabled }: {
  value: string
  onChange: (next: string) => void
  suggestions?: string[]
  placeholder?: string
  disabled?: boolean
}) {
  const emails = value ? value.split(/[,;]/).map(e => e.trim()).filter(Boolean) : []
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = (() => {
    const q = draft.trim().toLowerCase()
    return suggestions.filter(s => !emails.includes(s) && (q ? s.toLowerCase().includes(q) : true)).slice(0, 8)
  })()

  useEffect(() => { setHighlight(0) }, [draft, value])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Regex pragmática (RFC 5322 simplificada): casa "a@b.c", rejeita sem @ ou TLD.
  const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

  function commitDraft(raw?: string) {
    const candidate = (raw ?? draft).trim().replace(/[,;]+$/, '')
    if (!candidate) { setDraft(''); return }
    if (emails.includes(candidate)) { setDraft(''); return }
    if (!EMAIL_RE.test(candidate)) return // mantém no draft pra o usuário corrigir
    onChange([...emails, candidate].join('; '))
    setDraft('')
  }

  function removeAt(i: number) {
    onChange(emails.filter((_, idx) => idx !== i).join('; '))
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (open && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commitDraft(filtered[highlight]); setOpen(false); return }
    }
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === ' ' || e.key === 'Tab') {
      if (draft.trim()) { e.preventDefault(); commitDraft() }
      return
    }
    if (e.key === 'Backspace' && !draft && emails.length > 0) {
      e.preventDefault()
      removeAt(emails.length - 1)
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData('text')
    if (txt && /[,;\s]/.test(txt)) {
      e.preventDefault()
      const parts = txt.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean)
      onChange(Array.from(new Set([...emails, ...parts])).join('; '))
      setDraft('')
    }
  }

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          'flex flex-wrap gap-1.5 items-center min-h-[36px] px-2 py-1 border border-input rounded-md bg-transparent text-sm focus-within:ring-1 focus-within:ring-ring cursor-text',
          disabled && 'opacity-60 pointer-events-none',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {emails.map((email, i) => (
          <span
            key={`${email}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-muted text-foreground pl-2.5 pr-1 py-0.5 text-xs font-medium"
          >
            {email}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { e.stopPropagation(); removeAt(i) }}
              className="rounded-full hover:bg-foreground/10 p-0.5"
              title="Remover"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="email"
          disabled={disabled}
          value={draft}
          onChange={e => { setDraft(e.target.value); setOpen(true) }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setOpen(true)}
          onBlur={() => { if (draft.trim()) commitDraft() }}
          placeholder={emails.length === 0 ? placeholder : ''}
          className={cn(
            'flex-1 min-w-[140px] border-none bg-transparent outline-none shadow-none p-0 py-1 h-auto rounded-none focus:outline-none text-sm',
            draft.trim() && !EMAIL_RE.test(draft.trim()) && TEXT.rose,
          )}
          style={{ width: 'auto', display: 'inline-block' }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 overflow-hidden rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); commitDraft(s); setOpen(false) }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'w-full text-left px-3 py-1.5 text-sm flex items-center gap-2',
                i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <span className="h-5 w-5 rounded-full bg-muted text-foreground flex items-center justify-center text-[9px] font-bold shrink-0">
                {s[0]?.toUpperCase() || '?'}
              </span>
              <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
