import type { HelpdeskStatus } from '@saas/types'

/**
 * Fonte única das cores do HelpDesk — status do chamado e tipo de conteúdo
 * (mensagem pública / nota interna). Importado por page.tsx (lista + kanban),
 * [id]/page.tsx (detalhe) e indicadores/page.tsx (gráficos), pra que as mesmas
 * coisas tenham sempre a mesma cor.
 *
 * São dois "formatos" do mesmo conceito porque o Tailwind precisa de classes
 * estáticas (não dá pra derivar `bg-blue-100` do hex em runtime):
 *   - HELPDESK_STATUS_COR   → hex, pra estilo inline (barras, células de gráfico)
 *   - HELPDESK_STATUS_BADGE → classes do badge (fundo sólido, claro + escuro)
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

// Classes do badge de status (fundo sólido, com variantes claro/escuro).
export const HELPDESK_STATUS_BADGE: Record<HelpdeskStatus, string> = {
  NOVO: 'bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-200',
  AGUARDANDO_AUDITORIA: 'bg-cyan-100 dark:bg-cyan-900 border-cyan-200 dark:border-cyan-700 text-cyan-700 dark:text-cyan-200',
  EM_ANDAMENTO: 'bg-amber-100 dark:bg-amber-900 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-200',
  RESOLVIDO: 'bg-purple-100 dark:bg-purple-900 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-200',
  CONCLUIDO: 'bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-200',
  CANCELADO: 'bg-red-100 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-700 dark:text-red-200',
}

// Classes por tipo de conteúdo/mensagem: pública (e descrição inicial) = ciano,
// nota interna = âmbar. Usado nos badges das mensagens e no seletor do compositor.
export const HELPDESK_MSG_BADGE = {
  publica: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  interna: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
} as const
