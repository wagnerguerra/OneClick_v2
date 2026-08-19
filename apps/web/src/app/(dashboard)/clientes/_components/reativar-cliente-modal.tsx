'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription, Button, Input } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { RotateCcw, Loader2 } from 'lucide-react'

/**
 * Modal único de reativação de cliente (#HLP0209). Espelha o InativarClienteModal:
 * volta o cliente para ATIVO, limpa a data de saída e registra o MOTIVO
 * (obrigatório) no histórico. Reusado em /clientes e /clientes/[id].
 */
export function ReativarClienteModal({
  open, nome, onOpenChange, onConfirm,
}: {
  open: boolean
  nome?: string
  onOpenChange: (o: boolean) => void
  onConfirm: (motivo: string) => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { if (open) setMotivo('') }, [open])

  async function confirmar() {
    if (!motivo.trim()) return
    setSalvando(true)
    try {
      await onConfirm(motivo.trim())
      onOpenChange(false)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!salvando) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeaderIcon icon={RotateCcw} color="emerald">
          <DialogTitle className="text-[15px]">Reativar cliente</DialogTitle>
          <DialogDescription className="text-[11px]">
            {nome ? `"${nome}" voltará a ser um cliente ativo. A data de saída é limpa.` : 'O cliente volta a ser ativo e a data de saída é limpa.'}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground">Motivo <span className="text-rose-500">*</span></label>
            <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: retomou os serviços..." className="h-9 text-sm" />
            <p className="text-[11px] text-muted-foreground">Obrigatório — fica registrado no histórico do cliente.</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button variant="soft-success" size="sm" onClick={confirmar} disabled={salvando || !motivo.trim()}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Reativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
