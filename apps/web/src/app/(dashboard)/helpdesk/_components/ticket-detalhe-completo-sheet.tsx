'use client'

import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@saas/ui'
import { TicketDetalheCompleto } from './ticket-detalhe-completo'

/**
 * Modal lateral do ticket (abre ao clicar num card do kanban): renderiza a
 * PÁGINA DE DETALHE COMPLETA (`TicketDetalheCompleto` em `variant="sheet"`)
 * dentro de um Sheet, reaproveitando a mesma UI da rota `/helpdesk/[id]`.
 */
export function TicketDetalheCompletoSheet({
  ticketId,
  onClose,
  onChange,
}: {
  ticketId: string | null
  onClose: () => void
  onChange?: () => void
}) {
  return (
    <Sheet open={!!ticketId} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        size="xl"
        className="w-[80vw] max-w-[1280px] p-0 overflow-hidden flex flex-col"
      >
        {/* Radix exige um título acessível no Content; o header visível é o
            próprio da página completa. */}
        <SheetTitle className="sr-only">Detalhe do ticket</SheetTitle>
        <SheetDescription className="sr-only">Página completa do ticket exibida em modal lateral.</SheetDescription>
        {ticketId && (
          <TicketDetalheCompleto
            ticketId={ticketId}
            variant="sheet"
            onClose={onClose}
            onChanged={onChange}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
