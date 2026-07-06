/**
 * Datas no fuso de Brasília — helper único do módulo agenda. [QA #14]
 *
 * Convenção do módulo: AgendaEvento.data é gravado como MEIA-NOITE UTC do
 * dia-calendário (create usa new Date('YYYY-MM-DD')); horas são strings HH:MM
 * no horário local BR. Este helper produz a chave YYYY-MM-DD do dia-calendário
 * em América/São_Paulo — NÃO usar o relógio local do servidor (UTC no docker),
 * que entre 21h e 00h BR devolve o dia seguinte.
 */
export function dataBrKey(d: Date = new Date()): string {
  // en-CA => YYYY-MM-DD direto.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

/** HH:MM do instante em América/São_Paulo. */
export function horaBrKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}
