import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CaptchaService } from '../common/captcha.service'

const CNDT_URL = 'https://cndt-certidao.tst.jus.br/gerarCertidao.faces'

export interface CndtResult {
  sucesso: boolean
  mensagem: string
  tipo: string | null
}

export interface CndtLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando'; erro?: string }>
}

@Injectable()
export class CndtTrabalhistaService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  private tableChecked = false
  private consultaEtapa = ''
  private loteProgress: CndtLoteProgress = {
    status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
    currentCliente: '', items: [],
  }

  getConsultaEtapa(): string { return this.consultaEtapa }
  getLoteProgress(): CndtLoteProgress { return { ...this.loteProgress } }

  private async ensureTable() {
    if (this.tableChecked) return
    try {
      const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'certidoes_cndt')`,
      )
      if (exists[0]?.exists) { this.tableChecked = true; return }
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS certidoes_cndt (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          documento TEXT NOT NULL,
          razao_social TEXT,
          sucesso BOOLEAN NOT NULL DEFAULT false,
          tipo_certidao TEXT,
          mensagem TEXT,
          numero_certidao TEXT,
          data_validade DATE,
          pdf_base64 TEXT,
          cliente_id TEXT,
          user_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_cndt_doc ON certidoes_cndt (documento)`)
    } catch (e) {
      if (!(e as Error).message?.includes('already exists')) throw e
    }
    this.tableChecked = true
  }

  private async extrairValidadePdf(pdfBase64: string): Promise<string | null> {
    try {
      const buf = Buffer.from(pdfBase64, 'base64')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const data = await require('pdf-parse')(buf)
      const texto = data.text || ''

      const patterns = [
        /Validade\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
        /V[aá]lid[ao]\s*(?:at[eé])?\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
        /vencimento\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
      ]
      for (const p of patterns) {
        const m = texto.match(p)
        if (m) {
          const [dd, mm, yyyy] = m[1]!.split('/')
          return `${yyyy}-${mm}-${dd}`
        }
      }
      // Fallback: segunda data no texto
      const datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g)
      if (datas && datas.length >= 2) {
        const [dd, mm, yyyy] = datas[1]!.split('/')
        return `${yyyy}-${mm}-${dd}`
      }
      return null
    } catch { return null }
  }

  // ── Consulta individual ──────────────────────────────

  async consultar(documento: string, clienteId?: string, userId?: string): Promise<CndtResult> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    const tag = '[CNDT]'
    this.consultaEtapa = 'Iniciando consulta...'
    console.log(`${tag} Consultando CNDT para ${doc}...`)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })

    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1200, height: 800 })

      // CDP Fetch para interceptar o PDF (attachment)
      const client = await page.createCDPSession()
      await client.send('Fetch.enable', { patterns: [{ urlPattern: '*emissaoCertidao*', requestStage: 'Response' }] })

      let pdfBase64: string | null = null
      let numeroCertidao: string | null = null
      client.on('Fetch.requestPaused', async (event: { requestId: string; request: { url: string }; responseStatusCode: number }) => {
        try {
          const body = await client.send('Fetch.getResponseBody', { requestId: event.requestId })
          const buf = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8')
          if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
            pdfBase64 = buf.toString('base64')
            console.log(`${tag} PDF capturado: ${buf.length} bytes`)
          }
        } catch { /* */ }
        await client.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
      })

      this.consultaEtapa = 'Acessando portal do TST...'
      await page.goto(CNDT_URL, { waitUntil: 'networkidle2', timeout: 30000 })
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 2000))
      this.consultaEtapa = 'Página carregada'
      console.log(`${tag} Página carregada`)

      // Capturar captcha base64 da imagem
      const captchaSrc: string = await page.evaluate('document.getElementById("idImgBase64")?.src || ""')
      const b64Match = captchaSrc.match(/base64,\s*(.+)/)
      if (!b64Match) throw new Error('Captcha não carregou na página')

      this.consultaEtapa = 'Resolvendo captcha via 2Captcha...'
      console.log(`${tag} Captcha capturado, enviando para 2Captcha...`)
      const captchaText = await this.captcha.resolveImage(b64Match[1]!, { caseSensitive: true, minLen: 5, maxLen: 7, lang: 'en' })

      // Preencher campos
      await page.evaluate(`document.getElementById("gerarCertidaoForm:cpfCnpj").value="${doc}"`)
      await page.evaluate(`document.getElementById("idCampoResposta").value="${captchaText}"`)
      this.consultaEtapa = 'Emitindo certidão...'
      console.log(`${tag} Captcha: "${captchaText}", clicando Emitir...`)

      await page.evaluate('document.getElementById("gerarCertidaoForm:btnEmitirCertidao").click()')
      this.consultaEtapa = 'Aguardando resposta do TST...'
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 12000))

      // Verificar resultado
      const texto: string = await page.evaluate('document.body.innerText')
      this.consultaEtapa = 'Verificando resultado...'

      let sucesso = false
      let tipo: string | null = null
      let mensagem = ''

      if (texto.includes('EMITIDA com sucesso') || texto.includes('Certidão EMITIDA')) {
        sucesso = true
        tipo = 'Negativa'
        mensagem = 'CNDT emitida com sucesso'
      } else if (texto.includes('Positiva')) {
        sucesso = false
        tipo = 'Positiva'
        mensagem = 'Existem débitos trabalhistas pendentes'
      } else if (texto.includes('captcha') || texto.includes('incorret') || texto.includes('inválid')) {
        // Retry captcha
        this.consultaEtapa = 'Captcha incorreto, tentando novamente...'
        console.log(`${tag} Captcha incorreto, retry...`)

        await page.evaluate('loadCaptcha()')
        await new Promise((r: (v: unknown) => void) => setTimeout(r, 3000))

        const newSrc: string = await page.evaluate('document.getElementById("idImgBase64")?.src || ""')
        const newB64 = newSrc.match(/base64,\s*(.+)/)
        if (newB64) {
          this.consultaEtapa = 'Resolvendo novo captcha...'
          const newText = await this.captcha.resolveImage(newB64[1]!, { caseSensitive: true, minLen: 5, maxLen: 7, lang: 'en' })
          await page.evaluate(`document.getElementById("idCampoResposta").value="${newText}"`)
          await page.evaluate('document.getElementById("gerarCertidaoForm:btnEmitirCertidao").click()')
          await new Promise((r: (v: unknown) => void) => setTimeout(r, 12000))

          const texto2: string = await page.evaluate('document.body.innerText')
          if (texto2.includes('EMITIDA com sucesso') || texto2.includes('Certidão EMITIDA')) {
            sucesso = true; tipo = 'Negativa'; mensagem = 'CNDT emitida com sucesso'
          } else if (texto2.includes('Positiva')) {
            sucesso = false; tipo = 'Positiva'; mensagem = 'Existem débitos trabalhistas pendentes'
          } else {
            sucesso = false; tipo = null; mensagem = 'Falha na emissão — captcha incorreto ou erro no portal'
          }
        } else {
          sucesso = false; tipo = null; mensagem = 'Captcha incorreto — tente novamente'
        }
      } else if (texto.includes('não encontrad') || texto.includes('inválido')) {
        sucesso = false; tipo = null; mensagem = 'CNPJ/CPF não encontrado'
      } else {
        sucesso = false; tipo = null; mensagem = 'Não foi possível emitir a certidão'
      }

      console.log(`${tag} ${doc}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)
      await browser.close()

      // Extrair número da certidão e validade do PDF
      let dataValidade: string | null = null
      if (pdfBase64) {
        dataValidade = await this.extrairValidadePdf(pdfBase64)
        if (dataValidade) console.log(`${tag} Validade: ${dataValidade}`)

        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfData = await require('pdf-parse')(Buffer.from(pdfBase64, 'base64'))
          const numMatch = (pdfData.text as string).match(/Certidão\s*n[°º]\s*[:.]?\s*([\d/]+)/i)
          if (numMatch) numeroCertidao = numMatch[1]!
        } catch { /* */ }
      }

      // Resolver cliente
      let razaoSocial: string | null = null
      let resolvedClienteId = clienteId || null
      if (clienteId) {
        const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } })
        razaoSocial = cli?.razaoSocial ?? null
      } else {
        const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
          `SELECT id, razao_social FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
        ).then(rows => rows[0] ? { id: rows[0].id, razaoSocial: rows[0].razao_social } : null)
        if (cli) { razaoSocial = cli.razaoSocial; resolvedClienteId = cli.id }
      }

      // Salvar (manter apenas a mais recente por documento)
      await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cndt WHERE documento = $1`, doc)
      await prisma.$executeRawUnsafe(
        `INSERT INTO certidoes_cndt (documento, razao_social, sucesso, tipo_certidao, mensagem, numero_certidao, data_validade, pdf_base64, cliente_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10)`,
        doc, razaoSocial, sucesso, tipo, mensagem, numeroCertidao, dataValidade, pdfBase64, resolvedClienteId, userId || null,
      )

      return { sucesso, mensagem, tipo }
    } catch (e) {
      await browser.close()
      throw e
    }
  }

  // ── Lote ─────────────────────────────────────────────

  async consultarLote(documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>, userId?: string): Promise<{ message: string }> {
    if (this.loteProgress.status === 'running') throw new Error('Consulta em lote já em andamento.')

    this.loteProgress = {
      status: 'running', total: documentos.length, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
      currentCliente: 'Iniciando...', items: documentos.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }

    // Executa em background
    ;(async () => {
      for (let i = 0; i < documentos.length; i++) {
        const c = documentos[i]!
        this.loteProgress.current = i + 1
        this.loteProgress.currentCliente = c.razaoSocial || c.documento
        this.loteProgress.items[i]!.status = 'processando'

        try {
          const result = await this.consultar(c.documento, c.clienteId, userId)
          if (result.sucesso) {
            this.loteProgress.emitidas++
            this.loteProgress.items[i]!.status = 'emitida'
          } else {
            this.loteProgress.naoEmitidas++
            this.loteProgress.items[i]!.status = 'nao_emitida'
            this.loteProgress.items[i]!.erro = result.mensagem
          }
        } catch (e) {
          this.loteProgress.erros++
          this.loteProgress.items[i]!.status = 'erro'
          this.loteProgress.items[i]!.erro = (e as Error).message
        }

        // Delay entre consultas
        if (i < documentos.length - 1) {
          await new Promise((r: (v: unknown) => void) => setTimeout(r, 3000))
        }
      }
      this.loteProgress.status = 'done'
      this.loteProgress.currentCliente = 'Concluído'
    })()

    return { message: `Consulta em lote iniciada para ${documentos.length} documento(s)` }
  }

  // ── Listagem ────────────────────────────────────────

  async list(input: { page: number; limit: number; search?: string; filtroStatus?: string }) {
    await this.ensureTable()
    const { page, limit, search, filtroStatus } = input
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    if (filtroStatus === 'negativa') conditions.push(`sucesso = true AND tipo_certidao = 'Negativa'`)
    else if (filtroStatus === 'positiva') conditions.push(`sucesso = true AND tipo_certidao != 'Negativa'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false`)
    else if (filtroStatus === 'vigente') conditions.push(`data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencendo') conditions.push(`data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencida') conditions.push(`data_validade IS NOT NULL AND data_validade < CURRENT_DATE`)

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

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

  async totalizadores() {
    await this.ensureTable()
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
    `)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0), negativas: Number(r.negativas ?? 0), positivas: Number(r.positivas ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0), vencidas: Number(r.vencidas ?? 0),
      vencendo: Number(r.vencendo ?? 0), vigentes: Number(r.vigentes ?? 0),
    }
  }

  async getPdf(id: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cndt WHERE id = $1`, id,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteCndt(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cndt WHERE id = $1`, id)
    return { ok: true }
  }

  async deleteLote(ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cndt WHERE id IN (${placeholders})`, ...ids)
    return { deleted: ids.length }
  }
}
