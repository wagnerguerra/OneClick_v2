// Rótulos e cores (classes Tailwind) dos status de execução de serviço.
// Espelha os status estendidos do ServicoExecucao do sistema (processo engine).

export const EXECUCAO_STATUS_LABELS: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_INICIO: 'Aguardando início',
  AGUARDANDO_RESPOSTA: 'Aguardando resposta',
  PAUSADO: 'Pausado',
  PAUSADA: 'Pausado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  PULADO: 'Pulado',
}

export const EXECUCAO_STATUS_CLASSES: Record<string, { bg: string; text: string }> = {
  EM_ANDAMENTO: { bg: 'bg-blue-500/15', text: 'text-blue-600' },
  AGUARDANDO_INICIO: { bg: 'bg-slate-500/15', text: 'text-slate-500' },
  AGUARDANDO_RESPOSTA: { bg: 'bg-amber-500/15', text: 'text-amber-600' },
  PAUSADO: { bg: 'bg-amber-500/15', text: 'text-amber-600' },
  PAUSADA: { bg: 'bg-amber-500/15', text: 'text-amber-600' },
  CONCLUIDO: { bg: 'bg-emerald-500/15', text: 'text-emerald-600' },
  CANCELADO: { bg: 'bg-red-500/15', text: 'text-red-600' },
  PULADO: { bg: 'bg-slate-500/15', text: 'text-slate-500' },
}

export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return EXECUCAO_STATUS_LABELS[s] ?? s
}

export function statusClasses(s: string | null | undefined): { bg: string; text: string } {
  return (s && EXECUCAO_STATUS_CLASSES[s]) || EXECUCAO_STATUS_CLASSES.EM_ANDAMENTO!
}
