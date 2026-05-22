'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  Button, Input, Label,
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Execucao {
  id: string
  servico: { nome: string; mininome: string | null }
  cliente: { razaoSocial: string } | null
}

interface EntregarDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  execucao: Execucao | null
  onEntregue: () => void
}

export function EntregarDialog({ open, onOpenChange, execucao, onEntregue }: EntregarDialogProps) {
  const [observacao, setObservacao] = useState('')
  const [anexoUrl, setAnexoUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) { setObservacao(''); setAnexoUrl('') }
  }, [open])

  async function handleSubmit() {
    if (!execucao) return
    setSaving(true)
    try {
      await trpc.minhasObrigacoes.entregar.mutate({
        execucaoId: execucao.id,
        observacao: observacao.trim() || null,
        anexoUrl: anexoUrl.trim() || null,
      })
      alerts.success('Entregue', 'Obrigação marcada como entregue.')
      onEntregue()
    } catch (e: any) {
      alerts.error('Erro', e?.message ?? 'Não foi possível registrar a entrega.')
    } finally {
      setSaving(false)
    }
  }

  if (!execucao) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeaderIcon icon={CheckCircle2} color="emerald">
          <DialogTitle>Marcar como entregue</DialogTitle>
          <DialogDescription>
            {execucao.servico.mininome ?? execucao.servico.nome}
            {execucao.cliente && <span className="block text-[11px] mt-0.5">{execucao.cliente.razaoSocial}</span>}
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Observação (opcional)</Label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Detalhes sobre a entrega, número de protocolo, observações..."
              rows={3}
              maxLength={500}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
            <span className="text-[10px] text-muted-foreground">{observacao.length}/500</span>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">URL do anexo (opcional)</Label>
            <Input
              type="url"
              value={anexoUrl}
              onChange={(e) => setAnexoUrl(e.target.value)}
              placeholder="https://..."
              className="h-9 text-sm"
            />
            <span className="text-[10px] text-muted-foreground">Link para PDF, recibo ou comprovante</span>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando</> : <><CheckCircle2 className="h-4 w-4" />Confirmar entrega</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
