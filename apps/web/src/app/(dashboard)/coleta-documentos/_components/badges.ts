import { BADGE } from '@/lib/color-styles'

/** Cores dos badges de situação — um tom por etapa do trâmite. */
export const SITUACAO_BADGE: Record<string, string> = {
  AGUARDANDO_ROTA: BADGE.amber,
  ROTA_CONFIRMADA: BADGE.sky,
  NA_RECEPCAO: BADGE.indigo,
  ENTREGUE_ARQUIVO: BADGE.violet,
  EM_TRIAGEM: BADGE.cyan,
  NO_SETOR: BADGE.blue,
  DEVOLVIDO_ARQUIVO: BADGE.fuchsia,
  RETIRADA_DISPONIVEL: BADGE.lime,
  ENTREGUE_CLIENTE: BADGE.emerald,
  DEVOLVIDO_CLIENTE: BADGE.teal,
  PROTOCOLO_ENTREGUE: BADGE.orange,
  PROTOCOLO_ARQUIVADO: BADGE.slate,
}

export const TIPO_BADGE: Record<string, string> = {
  ENTREGA: BADGE.sky,
  COLETA: BADGE.amber,
  RECEBIMENTO: BADGE.emerald,
}
