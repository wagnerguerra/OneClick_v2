'use client'

import { useParams } from 'next/navigation'
import { TicketDetalheCompleto } from '../_components/ticket-detalhe-completo'

// A rota é um wrapper fino: o corpo do detalhe vive em `TicketDetalheCompleto`
// (compartilhado com o modal lateral, Versão C). Aqui roda como `variant="page"`.
export default function HelpdeskTicketDetailPage() {
  const { id } = useParams() as { id: string }
  return <TicketDetalheCompleto ticketId={id} variant="page" />
}
