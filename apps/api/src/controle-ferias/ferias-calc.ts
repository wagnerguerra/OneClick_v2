/**
 * Regras do Controle de Férias em um só lugar.
 *
 * A listagem, os relatórios e o alerta do sino chamam daqui. Saldo e prazo
 * legal são conta de negócio: se cada tela refizer a sua, elas divergem — e
 * divergência em prazo de férias custa pagamento em dobro (art. 137 da CLT).
 */

/** Dias corridos do gozo, inclusivos (17→23 = 7 dias). */
export function diasDoEvento(inicio: Date, fim: Date): number {
  return Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000) + 1
}

/** Saldo do período: dias de direito + saldo que veio do anterior − gozados. */
export function saldoDoPeriodo(p: {
  dias: number
  saldoAnterior: number
  eventos: Array<{ dataInicio: Date; dataFim: Date }>
}): { gozados: number; saldo: number } {
  const gozados = p.eventos.reduce((acc, e) => acc + diasDoEvento(e.dataInicio, e.dataFim), 0)
  return { gozados, saldo: p.dias + p.saldoAnterior - gozados }
}

/**
 * Data-limite do período concessivo (art. 134 da CLT): a empresa tem 12 meses
 * depois de encerrado o aquisitivo para conceder as férias.
 *
 * Com a data de admissão a conta sai exata — o aquisitivo fecha no aniversário
 * de admissão do ano `periodoFinal`, e o concessivo vai até o aniversário
 * seguinte. Sem a admissão no cadastro só dá para aproximar pelo ano (31/12 do
 * ano seguinte ao fim do período); nesse caso a linha vem marcada como
 * APROXIMADA, para ninguém tomar a data por exata.
 *
 * Detalhe: admissão em 29/02 cai em 01/03 nos anos não bissextos, que é como
 * a folha costuma tratar.
 */
export function limiteConcessivo(
  periodoFinal: number,
  dataAdmissao: Date | null | undefined,
): { limite: Date; aproximado: boolean } {
  if (dataAdmissao) {
    const adm = new Date(dataAdmissao)
    const limite = new Date(Date.UTC(periodoFinal + 1, adm.getUTCMonth(), adm.getUTCDate()))
    return { limite, aproximado: false }
  }
  return { limite: new Date(Date.UTC(periodoFinal + 1, 11, 31)), aproximado: true }
}

export type Farol = 'VENCIDO' | 'CRITICO' | 'ATENCAO' | 'OK'

export const FAROL_LABELS: Record<Farol, string> = {
  VENCIDO: 'Vencido',
  CRITICO: 'Vence em 30 dias',
  ATENCAO: 'Vence em 90 dias',
  OK: 'Em dia',
}

/**
 * Onde o período está em relação ao prazo legal. VENCIDO significa que o
 * concessivo passou — a partir daí as férias são devidas em dobro.
 */
export function farolVencimento(limite: Date, hoje = new Date()): { farol: Farol; diasRestantes: number } {
  const h = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  const diasRestantes = Math.round((new Date(limite).getTime() - h) / 86400000)
  const farol: Farol = diasRestantes < 0 ? 'VENCIDO'
    : diasRestantes <= 30 ? 'CRITICO'
      : diasRestantes <= 90 ? 'ATENCAO'
        : 'OK'
  return { farol, diasRestantes }
}

/** Dias do gozo que caem dentro de um mês (para a escala anual). */
export function diasNoMes(inicio: Date, fim: Date, ano: number, mes: number): number {
  const ini = new Date(inicio).getTime()
  const fim0 = new Date(fim).getTime()
  const mesIni = Date.UTC(ano, mes, 1)
  const mesFim = Date.UTC(ano, mes + 1, 0)
  const de = Math.max(ini, mesIni)
  const ate = Math.min(fim0, mesFim)
  if (ate < de) return 0
  return Math.round((ate - de) / 86400000) + 1
}

/**
 * Prazo de pagamento das férias: até 2 dias ANTES do início do gozo
 * (art. 145 da CLT).
 */
export function limitePagamento(inicioGozo: Date): Date {
  return new Date(new Date(inicioGozo).getTime() - 2 * 86400000)
}

/** yyyy-mm-dd em UTC — o formato que as telas e os exports usam. */
export function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString().slice(0, 10) : null
}
