'use client'

import { useEffect, useState } from 'react'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

export interface AreaNotificavel { areaId: string; nome: string }

/**
 * Áreas que podem ser notificadas na criação de um orçamento. A lista é ÚNICA
 * (configurada em Orçamentos → Configurações → "Notificação de áreas") e
 * alimenta tanto o balão do FAB quanto o cadastro dedicado — por isso o fetch
 * mora aqui, num só lugar. Fica separado do picker de propósito: a tela precisa
 * saber se há áreas para decidir se o campo é obrigatório.
 */
export function useAreasNotificaveis(): AreaNotificavel[] {
  const [areas, setAreas] = useState<AreaNotificavel[]>([])
  useEffect(() => {
    (trpc.orcamento as unknown as { listAreasSelecionaveis: { query: () => Promise<AreaNotificavel[]> } })
      .listAreasSelecionaveis.query()
      .then(setAreas)
      .catch(() => setAreas([]))
  }, [])
  return areas
}

interface PickerProps {
  areas: AreaNotificavel[]
  /** IDs das áreas marcadas (controlado). */
  value: string[]
  onChange: (next: string[]) => void
  /** Cor de destaque das pills marcadas — a cor do módulo do contexto. */
  accent: string
  /** Marca visualmente como obrigatório e ajusta o texto de apoio. */
  required?: boolean
  className?: string
}

/**
 * Pills de seleção das áreas a notificar. Apresentacional e controlado: recebe
 * a lista (via `useAreasNotificaveis`) e o valor. Não renderiza nada quando não
 * há áreas configuradas — nesse caso a tela não deve exigir seleção.
 */
export function AreasNotificarPicker({ areas, value, onChange, accent, required = false, className }: PickerProps) {
  if (areas.length === 0) return null

  const toggle = (areaId: string) =>
    onChange(value.includes(areaId) ? value.filter(x => x !== areaId) : [...value, areaId])

  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="text-[13px] font-semibold text-foreground">
        Notificar as seguintes áreas:{required && <span className="text-rose-500"> *</span>}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {areas.map(a => {
          const sel = value.includes(a.areaId)
          return (
            <button
              key={a.areaId}
              type="button"
              onClick={() => toggle(a.areaId)}
              className={cn(
                'px-2.5 h-7 rounded-full text-xs font-medium border transition-colors',
                sel ? 'border-transparent text-white' : 'border-border text-muted-foreground hover:bg-muted',
              )}
              style={sel ? { background: accent } : undefined}
            >
              {a.nome}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cada área marcada notifica o líder responsável para detalhar (e executar) a parte dela.
        {required && <> <span className="text-rose-500">Obrigatório.</span></>}
      </p>
    </div>
  )
}
