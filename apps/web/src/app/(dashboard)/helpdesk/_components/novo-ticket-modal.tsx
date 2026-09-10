'use client'

import { Loader2, Plus, Headphones, Trash2 } from 'lucide-react'
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
            Se precisar sair para buscar alguma informação, o que já foi escrito fica salvo.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody>
          <TicketFormFields form={form} variant="modal" />
        </DialogBody>
        <DialogFooter className="sm:justify-between">
          {/* Descartar fica separado do par Cancelar/Criar: "Cancelar" so fecha
              e o rascunho continua la — quem quer jogar fora precisa dizer. */}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={form.descartarRascunho}
            disabled={form.salvando || !form.temConteudo}
            title="Apagar o que foi digitado"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Descartar
          </Button>
          <div className="flex items-center gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
