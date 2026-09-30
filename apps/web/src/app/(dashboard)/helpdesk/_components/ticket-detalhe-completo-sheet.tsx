'use client'

import { useEffect, useState } from 'react'
import { PainelPreview } from '@/components/kanban/painel-preview'
import { TicketDetalheCompleto } from './ticket-detalhe-completo'

/**
 * Preview do ticket (abre ao clicar num card do kanban): a PÁGINA DE DETALHE
 * COMPLETA (`TicketDetalheCompleto` em `variant="sheet"`, a mesma UI da rota
 * `/helpdesk/[id]`) dentro do painel animado dos quadros — véu, painel que se
 * desenrola, fade ao fechar (✕ da página, Esc ou clique fora). Mesmo padrão
 * do preview de /orcamentos e /crm.
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
  // Guarda o último id durante a animação de saída (o pai zera ao fechar).
  const [idVisivel, setIdVisivel] = useState(ticketId)
  useEffect(() => { if (ticketId) setIdVisivel(ticketId) }, [ticketId])
  return (
    <PainelPreview aberto={!!ticketId} onFechar={onClose} rotulo="Detalhe do ticket" className="w-[min(1280px,calc(100vw-16px))]">
      {idVisivel && (
        <div className="flex min-h-0 flex-1 flex-col">
          <TicketDetalheCompleto
            ticketId={idVisivel}
            variant="sheet"
            onClose={onClose}
            onChanged={onChange}
          />
        </div>
      )}
    </PainelPreview>
  )
}
