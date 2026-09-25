/**
 * Para quem vai o lembrete de uma tarefa.
 *
 * Até 25/09/2026 ia só para o criador — do tempo em que tarefa não tinha
 * participantes. Com os membros (e, no CRM, com as Ações e seus responsáveis),
 * isso avisava justamente quem menos precisava: quem criou a ação para outra
 * pessoa fazer.
 *
 * Regra: avisa os membros que ainda NÃO deram ciência — quem já concluiu a
 * parte dele não precisa ser lembrado. Tarefa antiga, sem nenhum membro
 * gravado, cai no criador, como antes.
 */
export interface MembroDoLembrete {
  usuarioId: string
  ciente: boolean
}

export function destinatariosDoLembreteDeTarefa(membros: MembroDoLembrete[], criadorId: string): string[] {
  if (membros.length === 0) return [criadorId]
  return [...new Set(membros.filter(m => !m.ciente).map(m => m.usuarioId))]
}
