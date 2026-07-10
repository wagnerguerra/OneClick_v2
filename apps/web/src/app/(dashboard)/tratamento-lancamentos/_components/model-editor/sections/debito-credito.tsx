import { useEffect } from 'react'
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { cn } from '@saas/ui'
import type { TreatmentDefinition, Direcao } from '@saas/types'
import type { SetDef } from '../types'
import { EmptyHint } from '../ui'
import { invalidCls } from '../utils'

/** Mapa valor→direção da coluna de Débito/Crédito (sem default; direção obrigatória). */
export function DebitoCreditoColunaMap({ def, setDef, coluna, getDistinct, revisar }: { def: TreatmentDefinition; setDef: SetDef; coluna: string; getDistinct: (c: string) => string[]; revisar?: boolean }) {
  const distinct = getDistinct(coluna)

  // Poda valores que não existem mais na coluna (ex.: ao trocar de coluna).
  // NÃO semeia defaults — cada direção começa sem seleção (obrigatória).
  useEffect(() => {
    if (!distinct.length) return
    setDef((d) => {
      const valid = new Set(distinct)
      const mapa = d.debitoCredito.mapa.filter((m) => valid.has(m.valor))
      if (mapa.length === d.debitoCredito.mapa.length) return d
      return { ...d, debitoCredito: { ...d.debitoCredito, mapa } }
    })
  }, [coluna, getDistinct, setDef])

  function setOne(valor: string, direcao: Direcao) {
    setDef((d) => {
      const mapa = d.debitoCredito.mapa.filter((m) => m.valor !== valor)
      mapa.push({ valor, direcao })
      return { ...d, debitoCredito: { ...d.debitoCredito, mapa } }
    })
  }

  const mapa = def.debitoCredito.mapa
  const valores = distinct.length ? distinct : mapa.map((m) => m.valor)
  if (!valores.length) return <EmptyHint>Envie o arquivo para listar os valores distintos desta coluna.</EmptyHint>
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Para cada valor da coluna, defina a direção:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {valores.map((val) => {
          const cur = mapa.find((m) => m.valor === val)?.direcao ?? ''
          return (
            <div key={val} className="flex items-center gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-1.5">
              <span className="text-sm flex-1 truncate" title={val}>{val}</span>
              <Select value={cur} onValueChange={(v) => setOne(val, v as Direcao)}>
                <SelectTrigger className={cn('h-8 w-[130px] text-xs bg-card', !cur && invalidCls(revisar))}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBITO">Débito</SelectItem>
                  <SelectItem value="CREDITO">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
