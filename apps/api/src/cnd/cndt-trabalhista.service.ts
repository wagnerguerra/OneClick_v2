import { Injectable, Inject } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type { Page } from 'puppeteer'
import { CaptchaService } from '../common/captcha.service'
import {
  PorEmpresa, cndLogger, comNavegador, dataIso, exigirEmpresa, limparDoc, naFilaDoNavegador, precisaReconsultar,
} from './cnd-comum'

const CNDT_URL = 'https://cndt-certidao.tst.jus.br/gerarCertidao.faces'
const log = cndLogger('CNDT')

export interface CndtResult {
  sucesso: boolean
  mensagem: string
  tipo: string | null
  /** A consulta falhou, mas havia certidão válida anterior — ela foi mantida (não sobrescrita). */
  mantidaAnterior?: boolean
}

export interface CndtLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  /** Pulados por já terem certidão válida (cada emissão custa um captcha pago). */
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando' | 'pulada'; erro?: string }>
}

const loteVazio = (): CndtLoteProgress => ({
  status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, pulados: 0, currentCliente: '', items: [],
})

/** Resultado bruto da navegação no portal (antes de gravar). */
interface Emissao {
  sucesso: boolean
  tipo: string | null
  mensagem: string
  pdfBase64: string | null
}

const fim4 = (doc: string) => `…${doc.slice(-4)}`
const espera = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

/** Data local de hoje em 'YYYY-MM-DD' (sem passar por UTC). */
function hojeIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function textoDoPdf(pdfBase64: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const parse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text?: string }>
    const data = await parse(Buffer.from(pdfBase64, 'base64'))
    return data.text || ''
  } catch { return '' }
}

/**
 * Classifica a CNDT pelo TÍTULO do PDF. Antes toda emissão era gravada como
 * 'Negativa' — uma certidão positiva (com débito trabalhista) aparecia como
 * regular na tela. Pega o título que aparece PRIMEIRO no texto, para que uma
 * nota de rodapé que cite outro tipo não vença o cabeçalho.
 */
export function classificarCndt(texto: string): string | null {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ')
  const candidatos: Array<{ tipo: string; re: RegExp }> = [
    { tipo: 'Positiva com efeito de negativa', re: /\bCERTIDAO POSITIVA DE DEBITOS TRABALHISTAS,? COM EFEITOS? DE NEGATIVA\b/ },
    { tipo: 'Positiva', re: /\bCERTIDAO POSITIVA DE DEBITOS TRABALHISTAS\b/ },
    { tipo: 'Negativa', re: /\bCERTIDAO NEGATIVA DE DEBITOS TRABALHISTAS\b/ },
  ]
  let melhor: { tipo: string; idx: number } | null = null
  for (const c of candidatos) {
    const m = c.re.exec(t)
    // Empate de posição: a ordem da lista dá preferência ao "com efeito de negativa".
    if (m && (!melhor || m.index < melhor.idx)) melhor = { tipo: c.tipo, idx: m.index }
  }
  return melhor?.tipo ?? null
}

/** Validade 'YYYY-MM-DD' lida do PDF; a "segunda data" só vale se for futura. */
function validadeDoPdf(texto: string): string | null {
  const patterns = [
    /Validade\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /V[aá]lid[ao]\s*(?:at[eé])?\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
    /vencimento\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
  ]
  for (const p of patterns) {
    const m = texto.match(p)
    if (m) return dataIso(m[1])
  }
  // Fallback: segunda data do texto. A primeira costuma ser a expedição, mas
  // nada garante — só aceita se for posterior a hoje (senão grava a expedição
  // como validade e a certidão nasce "vencida").
  const datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g)
  if (datas && datas.length >= 2) {
    const iso = dataIso(datas[1])
    if (iso && iso > hojeIso()) return iso
  }
  return null
}

/**
 * Mensagem de erro do portal: só os contêineres de mensagem do JSF/PrimeFaces
 * (e afins). Antes a decisão olhava `document.body.innerText` inteiro — e a
 * própria página tem os rótulos "captcha"/"inválido" nas instruções, então o
 * ramo de retentativa disparava sempre e o "não encontrado" era inalcançável.
 */
async function lerErroDoPortal(page: Page): Promise<string> {
  return page.evaluate(() => {
    const sel = [
      '.ui-messages-error', '.ui-message-error', '.ui-growl-message', '.rf-msgs', '.rich-messages',
      '.alert-danger', '.alert-error', '.erro', '.error', '.mensagemErro',
      '[id*="mensage" i]', '[class*="mensage" i]', '[id*="messages" i]', '[id*="erro" i]',
    ].join(',')
    const textos = new Set<string>()
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const h = el as HTMLElement
      const txt = (h.innerText || '').trim()
      if (txt && h.offsetParent !== null) textos.add(txt)
    }
    return Array.from(textos).join(' | ').slice(0, 500)
  })
}

const ehErroDeCaptcha = (msg: string) =>
  /(captcha|c[oó]digo|resposta|caracteres|imagem)/i.test(msg) && /(incorret|inv[aá]lid|n[aã]o confere|errad|diverg)/i.test(msg)
const ehDocNaoEncontrado = (msg: string) =>
  /n[aã]o (foi )?encontrad/i.test(msg) || (/(cpf|cnpj)/i.test(msg) && /inv[aá]lid/i.test(msg))

@Injectable()
export class CndtTrabalhistaService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  /** Etapa e lote POR EMPRESA — um escritório não vê nem bloqueia o do outro. */
  private readonly consultaEtapa = new PorEmpresa<string>(() => '')
  private readonly loteProgress = new PorEmpresa<CndtLoteProgress>(loteVazio)

  getConsultaEtapa(empresaId: string): string { return this.consultaEtapa.get(exigirEmpresa(empresaId)) }
  getLoteProgress(empresaId: string): CndtLoteProgress {
    const p = this.loteProgress.get(exigirEmpresa(empresaId))
    return { ...p, items: p.items.map(i => ({ ...i })) }
  }

  // ── Navegação no portal ───────────────────────────────

  private async emitirNoPortal(empresaId: string, page: Page, doc: string): Promise<Emissao> {
    const etapa = (s: string) => this.consultaEtapa.set(empresaId, s)
    await page.setViewport({ width: 1200, height: 800 })

    // CDP Fetch para interceptar o PDF (vem como attachment, não abre na aba).
    const client = await page.createCDPSession()
    await client.send('Fetch.enable', { patterns: [{ urlPattern: '*emissaoCertidao*', requestStage: 'Response' }] })
    const captura: { pdf: string | null } = { pdf: null }
    client.on('Fetch.requestPaused', async (event) => {
      try {
        const body = await client.send('Fetch.getResponseBody', { requestId: event.requestId })
        const buf = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8')
        if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
          captura.pdf = buf.toString('base64')
          log.log(`PDF capturado: ${buf.length} bytes`)
        }
      } catch { /* resposta sem corpo — segue */ }
      await client.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
    })

    // Alguns erros do portal saem em alert(); guarda o texto e fecha o diálogo
    // (um alert aberto trava o page.evaluate seguinte).
    const dialogos: string[] = []
    page.on('dialog', d => { dialogos.push(d.message()); d.dismiss().catch(() => {}) })

    etapa('Acessando portal do TST...')
    await page.goto(CNDT_URL, { waitUntil: 'networkidle2', timeout: 30000 })
    await espera(2000)
    etapa('Página carregada')

    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const captchaSrc = await page.evaluate(() => (document.getElementById('idImgBase64') as HTMLImageElement | null)?.src || '')
      const b64 = captchaSrc.match(/base64,\s*(.+)/)
      if (!b64) {
        if (tentativa === 1) throw new Error('Captcha não carregou na página')
        return { sucesso: false, tipo: null, mensagem: 'Captcha incorreto — tente novamente', pdfBase64: null }
      }

      etapa(tentativa === 1 ? 'Resolvendo captcha via 2Captcha...' : 'Resolvendo novo captcha...')
      const resposta = await this.captcha.resolveImage(b64[1]!, { caseSensitive: true, minLen: 5, maxLen: 7, lang: 'en' })

      // Valores como ARGUMENTO do evaluate — nunca interpolados no código
      // (o texto do captcha vem de terceiro e pode conter aspas).
      dialogos.length = 0
      await page.evaluate((d: string, c: string) => {
        (document.getElementById('gerarCertidaoForm:cpfCnpj') as HTMLInputElement).value = d
        ;(document.getElementById('idCampoResposta') as HTMLInputElement).value = c
        ;(document.getElementById('gerarCertidaoForm:btnEmitirCertidao') as HTMLElement).click()
      }, doc, resposta)
      etapa('Aguardando resposta do TST...')
      for (let t = 0; t < 24 && !captura.pdf; t++) await espera(500)
      await espera(captura.pdf ? 1000 : 0)

      etapa('Verificando resultado...')
      const corpo = await page.evaluate(() => document.body.innerText)
      if (captura.pdf || corpo.includes('EMITIDA com sucesso') || corpo.includes('Certidão EMITIDA')) {
        return this.classificar(captura.pdf)
      }

      const erro = [await lerErroDoPortal(page), ...dialogos].filter(Boolean).join(' | ')
      if (ehErroDeCaptcha(erro)) {
        if (tentativa < 2) {
          etapa('Captcha incorreto, tentando novamente...')
          log.warn(`Captcha incorreto para ${fim4(doc)}, nova tentativa`)
          await page.evaluate(() => { (window as unknown as { loadCaptcha?: () => void }).loadCaptcha?.() })
          await espera(3000)
          continue
        }
        return { sucesso: false, tipo: null, mensagem: 'Falha na emissão — captcha incorreto', pdfBase64: null }
      }
      if (ehDocNaoEncontrado(erro)) return { sucesso: false, tipo: null, mensagem: 'CNPJ/CPF não encontrado', pdfBase64: null }
      if (erro) return { sucesso: false, tipo: null, mensagem: `Portal do TST: ${erro.slice(0, 200)}`, pdfBase64: null }
      return { sucesso: false, tipo: null, mensagem: 'Não foi possível emitir a certidão', pdfBase64: null }
    }
    return { sucesso: false, tipo: null, mensagem: 'Não foi possível emitir a certidão', pdfBase64: null }
  }

  /** O portal confirmou a emissão: o tipo sai do texto do PDF, não da página. */
  private async classificar(pdfBase64: string | null): Promise<Emissao> {
    if (!pdfBase64) {
      return { sucesso: false, tipo: null, mensagem: 'O TST indicou emissão, mas o PDF não foi capturado — tente novamente', pdfBase64: null }
    }
    const tipo = classificarCndt(await textoDoPdf(pdfBase64))
    if (!tipo) {
      // Certidão emitida (temos o PDF), mas não inventamos o tipo.
      return { sucesso: true, tipo: null, mensagem: 'CNDT emitida, mas não foi possível classificar (negativa/positiva) pelo PDF — confira o documento', pdfBase64 }
    }
    const mensagem = tipo === 'Negativa'
      ? 'CNDT negativa emitida com sucesso'
      : tipo === 'Positiva'
        ? 'CNDT emitida — POSITIVA: existem débitos trabalhistas pendentes'
        : 'CNDT emitida — positiva com efeito de negativa'
    return { sucesso: true, tipo, mensagem, pdfBase64 }
  }

  // ── Consulta individual ──────────────────────────────

  async consultar(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CndtResult> {
    exigirEmpresa(empresaId)
    const doc = limparDoc(documento)
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    // Cliente: sempre dentro da empresa (antes, por documento em qualquer tenant).
    let razaoSocial: string | null = null
    let resolvedClienteId: string | null = clienteId || null
    if (clienteId) {
      const cli = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId }, select: { razaoSocial: true } })
      if (!cli) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado nesta empresa.' })
      razaoSocial = cli.razaoSocial
    } else {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
        `SELECT id, razao_social FROM clientes
          WHERE status = 'ATIVO' AND empresa_id = $2
            AND UPPER(REGEXP_REPLACE(documento, '[^0-9A-Za-z]', '', 'g')) = $1
          LIMIT 1`, doc, empresaId,
      )
      if (rows[0]) { razaoSocial = rows[0].razao_social; resolvedClienteId = rows[0].id }
    }

    this.consultaEtapa.set(empresaId, 'Aguardando a vez do navegador...')
    log.log(`Consultando CNDT para ${fim4(doc)}`)

    let emissao: Emissao
    try {
      emissao = await naFilaDoNavegador(() => comNavegador(async browser => {
        this.consultaEtapa.set(empresaId, 'Iniciando consulta...')
        return this.emitirNoPortal(empresaId, await browser.newPage(), doc)
      }, { timeoutMs: 150_000 }))
    } finally {
      this.consultaEtapa.set(empresaId, '')
    }

    let numeroCertidao: string | null = null
    let dataValidade: string | null = null
    if (emissao.pdfBase64) {
      const texto = await textoDoPdf(emissao.pdfBase64)
      dataValidade = validadeDoPdf(texto)
      const numMatch = texto.match(/Certid[aã]o\s*n[°º]\s*[:.]?\s*([\d/]+)/i)
      if (numMatch) numeroCertidao = numMatch[1]!
    }
    log.log(`${fim4(doc)}: ${emissao.sucesso ? 'SUCESSO' : 'FALHA'} — ${emissao.mensagem}${dataValidade ? ` (validade ${dataValidade})` : ''}`)

    const insert = () => prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cndt (documento, razao_social, sucesso, tipo_certidao, mensagem, numero_certidao, data_validade, pdf_base64, cliente_id, user_id, empresa_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)`,
      doc, razaoSocial, emissao.sucesso, emissao.tipo, emissao.mensagem, numeroCertidao, dataValidade, emissao.pdfBase64,
      resolvedClienteId, userId || null, empresaId,
    )

    if (!emissao.sucesso) {
      // Falha (captcha, portal fora...) NÃO apaga certidão válida: antes a
      // rotina fazia DELETE + INSERT da falha e o cliente "perdia" a CNDT.
      const validas = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM certidoes_cndt WHERE documento = $1 AND empresa_id = $2 AND sucesso = true LIMIT 1`, doc, empresaId,
      )
      if (validas.length > 0) {
        log.warn(`${fim4(doc)}: falha mantendo a certidão anterior — ${emissao.mensagem}`)
        return { sucesso: false, mensagem: `${emissao.mensagem} (mantida a certidão anterior)`, tipo: null, mantidaAnterior: true }
      }
    }

    // Sucesso (ou falha sem nenhuma válida anterior): substitui as anteriores
    // do mesmo documento DESTA empresa, atomicamente.
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`DELETE FROM certidoes_cndt WHERE documento = $1 AND empresa_id = $2`, doc, empresaId),
      insert(),
    ])

    return { sucesso: emissao.sucesso, mensagem: emissao.mensagem, tipo: emissao.tipo }
  }

  // ── Lote ─────────────────────────────────────────────

  async consultarLote(
    empresaId: string,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId?: string,
    forcarNova = false,
  ): Promise<{ message: string }> {
    exigirEmpresa(empresaId)
    if (this.loteProgress.get(empresaId).status === 'running') throw new Error('Consulta em lote já em andamento.')

    const prog: CndtLoteProgress = {
      ...loteVazio(), status: 'running', total: documentos.length, currentCliente: 'Iniciando...',
      items: documentos.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }
    this.loteProgress.set(empresaId, prog)

    this.runLote(empresaId, prog, documentos, userId, forcarNova)
      .catch(e => log.error(`Lote CNDT interrompido: ${(e as Error).message}`))
      .finally(() => { prog.status = 'done'; prog.currentCliente = 'Concluído' })

    return { message: `Consulta em lote iniciada para ${documentos.length} documento(s)` }
  }

  private async runLote(
    empresaId: string, prog: CndtLoteProgress,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId: string | undefined, forcarNova: boolean,
  ) {
    for (let i = 0; i < documentos.length; i++) {
      const c = documentos[i]!
      const item = prog.items[i]!
      prog.current = i + 1
      prog.currentCliente = c.razaoSocial || c.documento
      item.status = 'processando'

      try {
        // Certidão ainda válida não é reemitida (cada emissão custa captcha).
        if (!forcarNova) {
          const ultima = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; data_validade: Date | null; created_at: Date | null }>>(
            `SELECT sucesso, data_validade, created_at FROM certidoes_cndt
              WHERE documento = $1 AND empresa_id = $2 AND sucesso = true
              ORDER BY created_at DESC LIMIT 1`, limparDoc(c.documento), empresaId,
          )
          const u = ultima[0]
          if (u && !precisaReconsultar({ sucesso: u.sucesso, dataValidade: u.data_validade, criadoEm: u.created_at })) {
            prog.pulados++
            item.status = 'pulada'
            item.erro = 'Certidão ainda válida'
            continue
          }
        }

        const result = await this.consultar(empresaId, c.documento, c.clienteId, userId)
        if (result.sucesso) {
          prog.emitidas++
          item.status = 'emitida'
        } else {
          prog.naoEmitidas++
          item.status = 'nao_emitida'
          item.erro = result.mensagem
        }
      } catch (e) {
        prog.erros++
        item.status = 'erro'
        item.erro = (e as Error).message
        log.error(`Lote CNDT, item ${i + 1}/${documentos.length}: ${(e as Error).message}`)
      }

      // Intervalo entre consultas (só depois de consultar de fato)
      if (i < documentos.length - 1) await espera(3000)
    }
  }

  // ── Listagem ────────────────────────────────────────

  async list(empresaId: string, input: { page: number; limit: number; search?: string; filtroStatus?: string }) {
    exigirEmpresa(empresaId)
    const { page, limit, search, filtroStatus } = input
    const offset = (page - 1) * limit
    const conditions: string[] = ['empresa_id = $1']
    const params: unknown[] = [empresaId]
    let idx = 2

    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    if (filtroStatus === 'negativa') conditions.push(`sucesso = true AND tipo_certidao = 'Negativa'`)
    else if (filtroStatus === 'positiva') conditions.push(`sucesso = true AND tipo_certidao != 'Negativa'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false`)
    else if (filtroStatus === 'vigente') conditions.push(`data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencendo') conditions.push(`data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencida') conditions.push(`data_validade IS NOT NULL AND data_validade < CURRENT_DATE`)

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM certidoes_cndt ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, sucesso, tipo_certidao, mensagem, numero_certidao, data_validade, created_at FROM certidoes_cndt ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        documento: r.documento as string,
        razaoSocial: r.razao_social as string | null,
        sucesso: r.sucesso as boolean,
        tipoCertidao: r.tipo_certidao as string | null,
        mensagem: r.mensagem as string | null,
        numeroCertidao: r.numero_certidao as string | null,
        dataValidade: r.data_validade ? (r.data_validade as Date).toISOString().split('T')[0] : null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  async totalizadores(empresaId: string) {
    exigirEmpresa(empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao = 'Negativa')::int as negativas,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao != 'Negativa')::int as positivas,
        COUNT(*) FILTER (WHERE sucesso = false)::int as nao_emitidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade < CURRENT_DATE)::int as vencidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days')::int as vencendo,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days')::int as vigentes
      FROM certidoes_cndt
      WHERE empresa_id = $1
    `, empresaId)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0), negativas: Number(r.negativas ?? 0), positivas: Number(r.positivas ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0), vencidas: Number(r.vencidas ?? 0),
      vencendo: Number(r.vencendo ?? 0), vigentes: Number(r.vigentes ?? 0),
    }
  }

  async getPdf(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cndt WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteCndt(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cndt WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    return { ok: true }
  }

  async deleteLote(empresaId: string, ids: string[]) {
    exigirEmpresa(empresaId)
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM certidoes_cndt WHERE empresa_id = $1 AND id IN (${placeholders})`, empresaId, ...ids,
    )
    return { deleted }
  }
}
