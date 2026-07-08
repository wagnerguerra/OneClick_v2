import { useEffect } from 'react'
import { Input } from '@saas/ui'
import { cn } from '@saas/ui'
import type { TreatmentDefinition } from '@saas/types'
import type { SetDef } from '../types'
import { EmptyHint } from '../ui'
import { soDigitos } from '../utils'

/** Mapa valor→conta corrente da coluna que identifica o banco (modo múltiplas contas). */
export function ContasCorrentesMap({ def, setDef, coluna, getDistinct }: { def: TreatmentDefinition; setDef: SetDef; coluna: string; getDistinct: (c: string) => string[] }) {
  const distinct = getDistinct(coluna)

  // Poda valores que não existem mais na coluna (ex.: ao trocar de coluna).
  useEffect(() => {
    if (!distinct.length) return
    setDef((d) => {
      const valid = new Set(distinct)
      const mapa = d.contasCorrentes.mapa.filter((m) => valid.has(m.valor))
      if (mapa.length === d.contasCorrentes.mapa.length) return d
      return { ...d, contasCorrentes: { ...d.contasCorrentes, mapa } }
    })
  }, [coluna, getDistinct, setDef])

  function setOne(valor: string, conta: string) {
    setDef((d) => {
      const mapa = d.contasCorrentes.mapa.filter((m) => m.valor !== valor)
      mapa.push({ valor, conta })
      return { ...d, contasCorrentes: { ...d.contasCorrentes, mapa } }
    })
  }

  const mapa = def.contasCorrentes.mapa
  const valores = distinct.length ? distinct : mapa.map((m) => m.valor)
  if (!valores.length) return <EmptyHint>Envie o arquivo para listar os valores distintos desta coluna.</EmptyHint>
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Para cada valor da coluna, informe a conta contábil:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {valores.map((val) => {
          const cur = mapa.find((m) => m.valor === val)?.conta ?? ''
          return (
            <div key={val} className="flex items-center gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-1.5">
              <span className="text-sm flex-1 truncate" title={val}>{val}</span>
              <Input
                className={cn('h-8 w-[150px] text-xs bg-card', !cur.trim() && 'border-r-2 border-r-destructive')}
                placeholder="Conta corrente"
                inputMode="numeric"
                value={cur}
                onChange={(e) => setOne(val, soDigitos(e.target.value))}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
