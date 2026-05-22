'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { Check, X, Loader2, Pencil } from 'lucide-react'
import { Input, cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@saas/ui'

/**
 * Célula editável inline. Render padrão é só texto; ao clicar, vira input
 * (ou select). Enter salva, Esc cancela. onSave faz update otimista —
 * em caso de erro, o componente reseta pro `value` original.
 */

interface BaseProps {
  value: string | null | undefined
  display?: (v: string | null | undefined) => React.ReactNode
  onSave: (newValue: string) => Promise<void>
  disabled?: boolean
  className?: string
  /** Texto a exibir quando vazio */
  emptyLabel?: string
  /** Validação antes de salvar; retornar string com erro = abort */
  validate?: (v: string) => string | null
}

interface TextProps extends BaseProps {
  type: 'text' | 'email'
  options?: never
  placeholder?: string
}

interface SelectProps extends BaseProps {
  type: 'select'
  options: Array<{ value: string; label: string }>
  placeholder?: never
}

type Props = TextProps | SelectProps

export function InlineEditCell(props: Props) {
  const { value, display, onSave, disabled, className, emptyLabel = '—', validate } = props
  const [editing, setEditing] = useState(false)
  const [temp, setTemp] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset quando o valor externo muda fora de edição
  useEffect(() => {
    if (!editing) setTemp(value ?? '')
  }, [value, editing])

  // Foco automático
  useEffect(() => {
    if (editing && props.type !== 'select') {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing, props.type])

  const commit = useCallback(async (next: string) => {
    setError(null)
    if (validate) {
      const e = validate(next)
      if (e) { setError(e); return }
    }
    if ((next ?? '') === (value ?? '')) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(next)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message ?? 'Falha ao salvar')
      setTemp(value ?? '')
    } finally {
      setSaving(false)
    }
  }, [onSave, validate, value])

  function cancel() {
    setEditing(false)
    setTemp(value ?? '')
    setError(null)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { e.preventDefault(); commit(temp) }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  if (disabled || !editing) {
    return (
      <div
        className={cn(
          'group/edit inline-flex items-center gap-1.5 -mx-1 px-1 py-0.5 rounded-sm transition-colors min-h-[24px]',
          !disabled && 'hover:bg-muted/60 cursor-pointer',
          className,
        )}
        onClick={(e) => {
          if (disabled) return
          e.stopPropagation()
          setEditing(true)
        }}
        title={disabled ? undefined : 'Clique para editar'}
      >
        <span className="truncate">
          {display
            ? display(value)
            : (value && value.toString().trim()
              ? value
              : <span className="text-muted-foreground italic">{emptyLabel}</span>)}
        </span>
        {!disabled && (
          <Pencil className="h-3 w-3 text-muted-foreground/60 opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
        )}
      </div>
    )
  }

  // Edição
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {props.type === 'select' ? (
        <Select
          value={temp}
          onValueChange={(v) => { setTemp(v); commit(v) }}
          open
          onOpenChange={(o) => { if (!o && !saving) cancel() }}
        >
          <SelectTrigger className="h-7 text-xs min-w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          ref={inputRef}
          type={props.type === 'email' ? 'email' : 'text'}
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => { if (!saving) commit(temp) }}
          placeholder={props.placeholder}
          className="h-7 text-xs min-w-[160px]"
          disabled={saving}
          aria-invalid={!!error}
        />
      )}
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
      ) : props.type !== 'select' ? (
        <>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); commit(temp) }}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            title="Salvar (Enter)"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); cancel() }}
            className="h-6 w-6 inline-flex items-center justify-center rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            title="Cancelar (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
      {error && (
        <span className="text-[10px] text-rose-600 truncate max-w-[160px]" title={error}>{error}</span>
      )}
    </div>
  )
}
