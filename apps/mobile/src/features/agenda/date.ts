// Helpers de data para a Agenda (pt-BR).
//
// Todas as funções são determinísticas e PURAS: nunca usam Date.now() nem
// `new Date()` sem argumento. A data de referência sempre chega por parâmetro,
// o que torna os helpers triviais de testar. Trabalhamos sempre em horário
// LOCAL (sem conversão para UTC), pra evitar o clássico "shift de um dia".

/** Nomes curtos dos dias da semana, índice = getDay() (0 = domingo). */
const DIAS_SEMANA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/** Nomes dos meses por extenso, índice = getMonth() (0 = janeiro). */
const MESES_EXTENSO = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

/** Preenche um número com zero à esquerda até atingir o tamanho desejado. */
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Converte uma Date para 'yyyy-MM-dd' usando os componentes LOCAIS.
 * Não usamos toISOString() de propósito — ele converte pra UTC e pode
 * "voltar" um dia dependendo do fuso.
 */
export function toISODate(d: Date): string {
  const ano = d.getFullYear()
  const mes = pad2(d.getMonth() + 1)
  const dia = pad2(d.getDate())
  return `${ano}-${mes}-${dia}`
}

/**
 * Converte 'yyyy-MM-dd' para uma Date no INÍCIO do dia local (00:00:00.000).
 * Construímos via componentes numéricos pra garantir interpretação local
 * (passar a string direto ao construtor a interpretaria como UTC).
 */
export function fromISODate(s: string): Date {
  const [ano, mes, dia] = s.split('-').map((parte) => Number(parte))
  return new Date(ano, mes - 1, dia, 0, 0, 0, 0)
}

/**
 * Retorna o início do dia (00:00:00.000) de uma data, preservando o horário local.
 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

/**
 * Soma (ou subtrai, com n negativo) `n` dias a uma data.
 * Não muta a Date original; respeita transições de mês/ano automaticamente.
 */
export function addDays(d: Date, n: number): Date {
  const resultado = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  resultado.setDate(resultado.getDate() + n)
  return resultado
}

/**
 * Início da semana (00:00:00.000 do primeiro dia).
 * `weekStartsOn`: 0 = domingo (default), 1 = segunda, ... 6 = sábado.
 */
export function startOfWeek(d: Date, weekStartsOn = 0): Date {
  const base = startOfDay(d)
  // Distância (em dias) do dia atual até o início desejado da semana.
  const diff = (base.getDay() - weekStartsOn + 7) % 7
  return addDays(base, -diff)
}

/**
 * Fim da semana (00:00:00.000 do último dia, 6 dias após o início).
 * Mantemos no início do dia pra consistência — quem precisar do fim do dia
 * que ajuste no chamador.
 */
export function endOfWeek(d: Date, weekStartsOn = 0): Date {
  return addDays(startOfWeek(d, weekStartsOn), 6)
}

/**
 * Os 7 dias da semana que contém `d`, em ordem crescente, começando no domingo.
 */
export function eachDayOfWeek(d: Date): Date[] {
  const inicio = startOfWeek(d, 0)
  const dias: Date[] = []
  for (let i = 0; i < 7; i++) {
    dias.push(addDays(inicio, i))
  }
  return dias
}

/**
 * true se `a` e `b` caem no mesmo dia do calendário local (ignora horário).
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Nome curto do dia da semana em pt-BR: 'dom','seg','ter','qua','qui','sex','sáb'.
 */
export function formatDiaSemana(d: Date): string {
  return DIAS_SEMANA_CURTO[d.getDay()]
}

/**
 * Dia e mês por extenso em pt-BR. Ex.: '6 de junho'.
 */
export function formatDiaMesExtenso(d: Date): string {
  return `${d.getDate()} de ${MESES_EXTENSO[d.getMonth()]}`
}

/**
 * Formata 'HH:MM' de forma segura. Retorna '' quando null.
 * Normaliza para sempre devolver 'HH:MM' (2 dígitos na hora).
 */
export function formatHora(hhmm: string | null): string {
  if (hhmm === null) return ''
  const [hora, minuto] = hhmm.split(':')
  // Caso a string venha malformada, devolvemos o que recebemos sem quebrar.
  if (hora === undefined || minuto === undefined) return hhmm
  return `${pad2(Number(hora))}:${pad2(Number(minuto))}`
}

/**
 * Monta o intervalo ISO ('yyyy-MM-dd') para alimentar o endpoint listEventos.
 * `dataInicio` <= `dataFim` é responsabilidade do chamador.
 */
export function rangeISO(inicio: Date, fim: Date): { dataInicio: string; dataFim: string } {
  return {
    dataInicio: toISODate(inicio),
    dataFim: toISODate(fim),
  }
}
