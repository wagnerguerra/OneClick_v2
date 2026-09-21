import type { HelpdeskStatus } from '@saas/types'
import { STRONG } from '@/lib/color-styles'

/**
 * Fonte única das cores do HelpDesk — status do chamado e tipo de conteúdo
 * (mensagem pública / nota interna). Importado por page.tsx (lista + kanban),
 * [id]/page.tsx (detalhe) e indicadores/page.tsx (gráficos), pra que as mesmas
 * coisas tenham sempre a mesma cor.
 *
 * Camada 2 do padrão de cores: cada status mapeia para uma ColorName da casa e
 * as classes do badge derivam do papel `STRONG` de `@/lib/color-styles` (fonte
 * única) — não repetimos os literais aqui. O hex (para estilo inline em
 * gráficos) fica no mapa próprio, porque o Tailwind não deriva classe de hex.
 *   - HELPDESK_STATUS_COR   → hex, pra estilo inline (barras, células de gráfico)
 *   - HELPDESK_STATUS_BADGE → classes do badge (papel STRONG, claro + escuro)
 */

// Cor semântica (hex) de cada status — cada uma reflete a função do estado:
//   NOVO         → azul       (entrada, aguardando triagem)
//   AGUARDANDO_AUDITORIA → ciano (IA respondeu, aguarda revisão)
//   EM_ANDAMENTO → âmbar      (trabalho ativo)
//   RESOLVIDO    → violeta    (aguardando confirmação/CSAT do solicitante;
//                  o label visível é 'Aguardando avaliação')
//   CONCLUIDO    → verde      (sucesso, fechado)
//   CANCELADO    → vermelho   (anulado)
export const HELPDESK_STATUS_COR: Record<HelpdeskStatus, string> = {
  NOVO: '#3b82f6',                 // blue-500
  AGUARDANDO_AUDITORIA: '#06b6d4', // cyan-500
  EM_ANDAMENTO: '#f59e0b',         // amber-500
  RESOLVIDO: '#a855f7',            // purple-500
  CONCLUIDO: '#10b981',            // emerald-500
  CANCELADO: '#ef4444',            // red-500
}

// Classes do badge de status — derivam do papel STRONG (fundo sólido, com borda,
// claro + escuro). O mapa status → ColorName espelha HELPDESK_STATUS_COR acima.
export const HELPDESK_STATUS_BADGE: Record<HelpdeskStatus, string> = {
  NOVO: STRONG.blue,
  AGUARDANDO_AUDITORIA: STRONG.cyan,
  EM_ANDAMENTO: STRONG.amber,
  RESOLVIDO: STRONG.purple,
  CONCLUIDO: STRONG.emerald,
  CANCELADO: STRONG.red,
}

// Classes por tipo de conteúdo/mensagem: pública (e descrição inicial) = ciano,
// nota interna = âmbar. Usado nos badges das mensagens e no seletor do compositor.
export const HELPDESK_MSG_BADGE = {
  publica: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  interna: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
} as const
