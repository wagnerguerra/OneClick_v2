/**
 * Helpers de data — padronizam a conversão UTC no front. [QA #37]
 *
 * As datas do backend (Prisma DateTime) chegam como ISO em UTC; o dia de calendário
 * deve ser extraído SEMPRE em UTC pra não deslocar ±1 dia conforme o fuso do
 * navegador. Use estes helpers em vez de espalhar `toISOString().slice(0,10)` /
 * `toLocaleDateString` solto pelo código.
 */

/** Valor `YYYY-MM-DD` pra `<input type="date">`, extraindo o dia em UTC. */
export function toDateInputValue(d: string | Date | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return dt.toISOString().slice(0, 10)
}

/** Data formatada em pt-BR (dd/mm/aaaa) usando o dia de calendário em UTC. */
export function fmtDateBR(d: string | Date | null | undefined): string {
  if (!d) return ''
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}
