'use client'

import { Loader2, Plus, Headphones } from 'lucide-react'
import {
  Button, Dialog, DialogContent, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { alerts } from '@/lib/alerts'
import { useTicketForm, TicketFormFields } from './ticket-form'

const MODULO_COLOR = 'var(--mod-ti, #22d3ee)'

/**
 * Modal completa de novo ticket. Desde o #HLP0330 os campos e a submissão vêm do
 * formulário COMPARTILHADO (`useTicketForm`/`TicketFormFields`), o mesmo usado
 * pelo balão do FAB — aqui só montamos a moldura (Dialog + rodapé) e tratamos o
 * sucesso (aviso + fecha + callback pro pai atualizar a lista).
 */
export function NovoTicketModal({ open, onOpenChange, onCreated, permitePrioridade }: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated?: (ticketId: string) => void
  /**
   * Override opcional da visibilidade de prioridade. Quando omitido, o hook
   * decide pelo perfil (agentes classificam; solicitantes não veem o campo).
   */
  permitePrioridade?: boolean
}) {
  const form = useTicketForm({
    active: open,
    permitePrioridade,
    onCreated: async (t) => {
      await alerts.success('Ticket criado', `#HLP${String(t.numero).padStart(4, '0')} registrado.`)
      onOpenChange(false)
      onCreated?.(t.id)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeaderIcon icon={Headphones} color="cyan">
          <DialogTitle>Novo Ticket</DialogTitle>
          <DialogDescription>
            Descreva o problema ou solicitação. A equipe da TI será notificada.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          <TicketFormFields form={form} variant="modal" />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={form.salvando}>
            Cancelar
          </Button>
          <Button
            onClick={form.submit}
            disabled={form.salvando || !form.canSubmit}
            style={{ backgroundColor: MODULO_COLOR }}
            className="text-white gap-1.5"
          >
            {form.salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
