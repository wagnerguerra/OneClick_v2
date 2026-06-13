'use client'

import * as React from 'react'
import { Card } from '@saas/ui'

export interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  /** Cor de destaque (hex ou CSS var). Usada no ícone e na barra inferior. */
  color: string
  /** Texto auxiliar abaixo do valor (ex.: "12 a vencer em 30d"). */
  sub?: string
  /** Mostra um placeholder pulsando no lugar do valor. */
  loading?: boolean
}

/**
 * Cartão de KPI reutilizável (padrão do CRM). Ícone em quadro colorido,
 * label em caixa alta + valor em destaque e barra fina da cor do módulo na base.
 */
export function StatCard({ icon: Icon, label, value, color, sub, loading }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}18` }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          {loading ? (
            <div className="mt-1 h-5 w-16 rounded bg-muted animate-pulse" />
          ) : (
            <p className="text-lg font-bold leading-tight mt-0.5">{value}</p>
          )}
          {sub && !loading && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{sub}</p>}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[3px]" style={{ backgroundColor: color }} />
    </Card>
  )
}
