import { Logger } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { limparCnpj } from '@saas/types'

/**
 * Peças comuns às rotinas de certidões e alvarás (05/10/2026).
 *
 * As oito rotinas repetiam as mesmas decisões, cada uma do seu jeito — e com
 * os mesmos defeitos: estado global mutável compartilhado entre empresas,
 * navegador que não fechava no erro, CNPJ limpo com /\D/g (que apaga as letras
 * do CNPJ alfanumérico), certidão válida apagada quando a nova consulta
 * falhava. Uma regra em um lugar só.
 */

export const cndLogger = (contexto: string) => new Logger(`CND:${contexto}`)

/** Toda rotina trabalha para UMA empresa (tenant). Sem empresa, recusa. */
export function exigirEmpresa(empresaId: string | null | undefined): string {
  if (!empresaId) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Selecione a empresa antes de consultar certidões.' })
  return empresaId
}

/** Documento (CPF/CNPJ, inclusive alfanumérico) só com letras e dígitos. */
export function limparDoc(v: string | null | undefined): string {
  return limparCnpj(v)
}

/**
 * Progresso e etapa de consulta POR EMPRESA. Antes cada service guardava um
 * `loteProgress`/`consultaEtapa` único: o lote de um escritório bloqueava o de
 * outro e a tela mostrava razões sociais de outra empresa.
 */
export class PorEmpresa<T> {
  private readonly mapa = new Map<string, T>()
  constructor(private readonly inicial: () => T) {}
  get(empresaId: string): T {
    let v = this.mapa.get(empresaId)
    if (v === undefined) { v = this.inicial(); this.mapa.set(empresaId, v) }
    return v
  }
  set(empresaId: string, v: T) { this.mapa.set(empresaId, v) }
}

/** Estado de um lote em segundo plano. */
export interface ProgressoLote {
  running: boolean
  total: number
  atual: number
  sucesso: number
  falhas: number
  /** Razão social / documento em consulta agora. */
  item: string
  /** Pulados por já terem certidão válida (economia de captcha/consulta paga). */
  pulados: number
  erros: string[]
}
export const progressoVazio = (): ProgressoLote => ({ running: false, total: 0, atual: 0, sucesso: 0, falhas: 0, item: '', pulados: 0, erros: [] })

/**
 * Ainda vale reconsultar? Certidão bem-sucedida com validade conhecida e
 * folgada (mais de `folgaDias` à frente) não é reemitida no lote — cada
 * reemissão custa captcha pago ou consulta SERPRO. Sem validade conhecida,
 * vale o tempo desde a última emissão bem-sucedida.
 */
export function precisaReconsultar(
  ultima: { sucesso: boolean; dataValidade?: Date | string | null; criadoEm?: Date | string | null } | null | undefined,
  opts: { folgaDias?: number; semValidadeDias?: number } = {},
): boolean {
  if (!ultima || !ultima.sucesso) return true
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const dia = 86_400_000
  if (ultima.dataValidade) {
    const v = new Date(ultima.dataValidade)
    return v.getTime() - hoje.getTime() <= (opts.folgaDias ?? 15) * dia
  }
  if (ultima.criadoEm) {
    return hoje.getTime() - new Date(ultima.criadoEm).getTime() >= (opts.semValidadeDias ?? 15) * dia
  }
  return true
}

/** Data de validade "YYYY-MM-DD" ou "DD/MM/YYYY" → "YYYY-MM-DD" (para coluna DATE, sem fuso). */
export function dataIso(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

/**
 * Abre o Chromium, roda `fn` e FECHA sempre — também no erro e no tempo
 * esgotado. Antes, `browser.close()` ficava dentro do try: um portal que
 * travava deixava processos do Chromium acumulando na VPS.
 */
export async function comNavegador<T>(
  fn: (browser: import('puppeteer').Browser) => Promise<T>,
  opts: { timeoutMs?: number; ignorarTls?: boolean; disfarcarAutomacao?: boolean } = {},
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const puppeteer = require('puppeteer') as typeof import('puppeteer')
  const args = ['--no-sandbox', '--disable-setuid-sandbox']
  // Só para os portais municipais/estaduais com cadeia de certificado
  // incompleta. Cada rotina diz se precisa — não é mais o padrão de todas.
  if (opts.ignorarTls) args.push('--ignore-certificate-errors')
  // Portais atrás de WAF (CGU) nem renderizam com a marca de automação ligada.
  if (opts.disfarcarAutomacao) args.push('--disable-blink-features=AutomationControlled')
  const browser = await puppeteer.launch({ headless: true, args })
  const teto = opts.timeoutMs ?? 180_000
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      fn(browser),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`Tempo esgotado (${Math.round(teto / 1000)}s) — o portal não respondeu.`)), teto) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    await browser.close().catch(() => { try { browser.process()?.kill('SIGKILL') } catch { /* já morreu */ } })
  }
}

/**
 * Fila de UMA consulta com navegador por vez no processo. Cada clique abria o
 * seu Chromium em paralelo; dez cliques derrubavam a memória da VPS.
 */
let filaNavegador: Promise<unknown> = Promise.resolve()
export function naFilaDoNavegador<T>(fn: () => Promise<T>): Promise<T> {
  const r = filaNavegador.then(fn, fn)
  filaNavegador = r.catch(() => undefined)
  return r
}
