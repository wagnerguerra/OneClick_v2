'use client'

import { CheckCircle2, XCircle, Loader2, Circle, Download } from 'lucide-react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Button, cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'

export type ImportStepStatus = 'pending' | 'running' | 'done' | 'error'
export interface ImportStep {
  key: string
  label: string
  status: ImportStepStatus
  detail?: string
}

function StepIcon({ status }: { status: ImportStepStatus }) {
  if (status === 'running') return <Loader2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500 animate-spin" />
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
  if (status === 'error') return <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
  return <Circle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/40" />
}

/**
 * Modal de progresso da importação do OneClick (via Service Manager). Mostra as
 * etapas em tempo real; só fecha quando terminou (done). Fonte: legalizacao-card.
 */
export function ImportStatusModal({
  open, onClose, steps, done,
}: {
  open: boolean
  onClose: () => void
  steps: ImportStep[]
  done: boolean
}) {
  const houveErro = steps.some((s) => s.status === 'error')
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && done) onClose() }}>
      <DialogContent className="sm:max-w-[460px]" hideClose={!done}>
        <DialogHeaderIcon icon={Download} color="emerald">
          <DialogTitle>Importando do OneClick</DialogTitle>
          <DialogDescription>Trazendo o cadastro legado via Service Manager.</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {steps.map((s) => (
            <div key={s.key} className="flex items-start gap-2.5">
              <StepIcon status={s.status} />
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-sm leading-snug',
                  s.status === 'error' ? 'text-rose-600 dark:text-rose-400 font-medium'
                    : s.status === 'done' ? 'text-foreground'
                      : s.status === 'running' ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                )}>{s.label}</p>
                {s.detail && <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{s.detail}</p>}
              </div>
            </div>
          ))}
          {!done && (
            <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
              O Service Manager precisa estar aberto e conectado no PC do escritório.
            </p>
          )}
        </DialogBody>
        {done && (
          <DialogFooter>
            <Button variant={houveErro ? 'outline' : 'success'} size="sm" onClick={onClose}>Fechar</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
