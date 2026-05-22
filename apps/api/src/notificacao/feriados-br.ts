/**
 * Feriados nacionais brasileiros (federais).
 *
 * Cobre os 8 feriados fixos da Lei 662/49 + Lei 6.802/80 (N. Sra. Aparecida)
 * e os 4 móveis derivados da Páscoa (Carnaval, Sexta-feira Santa, Corpus Christi).
 *
 * O dia da Páscoa é calculado pelo algoritmo de Meeus/Jones/Butcher — preciso
 * para qualquer ano do calendário gregoriano (1583+).
 *
 * Feriados estaduais e municipais NÃO estão aqui — quando virar requisito,
 * criar tabela `Feriado` no banco e carregar adicionalmente por empresaId.
 */

/**
 * Calcula a data da Páscoa (Domingo) para o ano dado.
 * Fonte: https://en.wikipedia.org/wiki/Date_of_Easter — método Anonymous Gregorian.
 */
export function dataPascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31) // 3=março, 4=abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia, 0, 0, 0, 0)
}

/**
 * Retorna o Set com as chaves `MM-DD` de todos os feriados nacionais do ano.
 * Cache leve por ano — feriados não mudam dentro do mesmo ano.
 */
const cacheFeriados = new Map<number, Set<string>>()

function chaveDoDia(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function feriadosDoAno(ano: number): Set<string> {
  const cached = cacheFeriados.get(ano)
  if (cached) return cached
  const lista = listarFeriadosNacionais(ano)
  const set = new Set<string>(lista.map((f) => chaveDoDia(f.data)))
  cacheFeriados.set(ano, set)
  return set
}

/**
 * Lista nomeada de todos os feriados nacionais brasileiros de um ano —
 * útil para UI (calendário visual) e relatórios. Retorna a data concreta
 * para cada feriado (incluindo móveis derivados da Páscoa).
 */
export function listarFeriadosNacionais(
  ano: number,
): Array<{ nome: string; data: Date; movel: boolean }> {
  const pascoa = dataPascoa(ano)
  const carnaval = new Date(pascoa); carnaval.setDate(pascoa.getDate() - 47)
  const sextaSanta = new Date(pascoa); sextaSanta.setDate(pascoa.getDate() - 2)
  const corpus = new Date(pascoa); corpus.setDate(pascoa.getDate() + 60)

  return [
    { nome: 'Confraternização Universal',  data: new Date(ano, 0, 1),  movel: false },
    { nome: 'Carnaval',                    data: carnaval,             movel: true  },
    { nome: 'Sexta-feira Santa',           data: sextaSanta,           movel: true  },
    { nome: 'Tiradentes',                  data: new Date(ano, 3, 21), movel: false },
    { nome: 'Dia do Trabalho',             data: new Date(ano, 4, 1),  movel: false },
    { nome: 'Corpus Christi',              data: corpus,               movel: true  },
    { nome: 'Independência do Brasil',     data: new Date(ano, 8, 7),  movel: false },
    { nome: 'N. Sra. Aparecida',           data: new Date(ano, 9, 12), movel: false },
    { nome: 'Finados',                     data: new Date(ano, 10, 2), movel: false },
    { nome: 'Proclamação da República',    data: new Date(ano, 10, 15), movel: false },
    { nome: 'Consciência Negra',           data: new Date(ano, 10, 20), movel: false },
    { nome: 'Natal',                       data: new Date(ano, 11, 25), movel: false },
  ]
}

/** True se a data é sábado ou domingo. */
export function ehFimDeSemana(d: Date): boolean {
  const dia = d.getDay()
  return dia === 0 || dia === 6
}

/** True se a data é feriado nacional brasileiro (federal). */
export function ehFeriadoNacional(d: Date): boolean {
  return feriadosDoAno(d.getFullYear()).has(chaveDoDia(d))
}

/** Chave para Set de dias específicos extras: `YYYY-MM-DD`. */
function chaveISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * True se a data NÃO é dia útil. Considera FDS + feriado nacional do util +
 * dias do Set `extras` (estaduais/municipais carregados em runtime).
 */
export function naoEhDiaUtil(d: Date, extras?: Set<string>): boolean {
  if (ehFimDeSemana(d)) return true
  if (ehFeriadoNacional(d)) return true
  if (extras && extras.has(chaveISO(d))) return true
  return false
}

/**
 * Retorna o próximo dia útil >= d (ou seja: se d já for útil, devolve d).
 * Preserva hora/minuto/segundo da entrada.
 */
export function proximoDiaUtil(d: Date, extras?: Set<string>): Date {
  const out = new Date(d)
  while (naoEhDiaUtil(out, extras)) {
    out.setDate(out.getDate() + 1)
  }
  return out
}

/**
 * Retorna o dia útil imediatamente anterior <= d (se d já é útil, devolve d).
 * Preserva hora/minuto/segundo da entrada.
 */
export function diaUtilAnterior(d: Date, extras?: Set<string>): Date {
  const out = new Date(d)
  while (naoEhDiaUtil(out, extras)) {
    out.setDate(out.getDate() - 1)
  }
  return out
}

/**
 * Aplica a política de ajuste à data calculada.
 * - MANTER: devolve d inalterado
 * - ANTECIPAR: se d cai em FDS/feriado, retorna o dia útil anterior
 * - POSTERGAR: se d cai em FDS/feriado, retorna o próximo dia útil
 *
 * O Set `extras` permite passar feriados estaduais/municipais carregados
 * em runtime (chaves `YYYY-MM-DD`) — assim o caller pode pré-carregar uma
 * única vez e usar em N cálculos sequenciais.
 */
export function aplicarAjusteVencimento(
  d: Date,
  ajuste: 'MANTER' | 'ANTECIPAR' | 'POSTERGAR',
  extras?: Set<string>,
): Date {
  if (ajuste === 'MANTER') return d
  if (!naoEhDiaUtil(d, extras)) return d
  return ajuste === 'ANTECIPAR' ? diaUtilAnterior(d, extras) : proximoDiaUtil(d, extras)
}
