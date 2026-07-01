'use client'

import { useState } from 'react'
import { FileBarChart } from 'lucide-react'
import { cn } from '@saas/ui'
import { OrcamentosLegadoSection } from '@/components/orcamento/orcamentos-legado-section'

const MODULE_COLOR = 'var(--mod-cadastros, #10b981)'

/**
 * Aba "Orçamentos" do cliente, dividida em duas: os do SISTEMA NOVO e os
 * LEGADOS (só leitura, importados do v1). Sem botão de criar aqui — orçamentos
 * são criados no módulo /orcamentos.
 */
export function OrcamentosTab({ clienteId }: { clienteId?: string }) {
  const [tab, setTab] = useState<'novo' | 'legado'>('novo')

  return (
    <div className="-m-5">
      <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between gap-3">
        <h4 className="text-[13px] font-semibold text-foreground">Orçamentos</h4>
        <div className="flex items-center gap-1 rounded-md bg-muted/40 p-0.5">
          {([
            { k: 'novo', label: 'Sistema novo' },
            { k: 'legado', label: 'Legados' },
          ] as const).map((t) => {
            const active = tab === t.k
            return (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={cn(
                  'px-3 py-1 rounded text-xs font-medium transition-colors',
                  active ? 'text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
                style={active ? { backgroundColor: MODULE_COLOR } : undefined}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <div key={tab} className="p-5" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
        {tab === 'novo' ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <FileBarChart className="h-10 w-10 mb-2 opacity-20" />
            <p className="text-sm">Nenhum orçamento no sistema novo.</p>
          </div>
        ) : clienteId ? (
          <OrcamentosLegadoSection clienteId={clienteId} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Salve o cliente para ver os orçamentos legados.</p>
        )}
      </div>
    </div>
  )
}
