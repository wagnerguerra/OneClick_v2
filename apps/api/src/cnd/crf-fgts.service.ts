import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

const CRF_URL = 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf'

export interface CrfResult {
  sucesso: boolean
  mensagem: string
  tipo: string | null
}

export interface CrfLoteProgress {
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
export class CrfFgtsService {
  private tableChecked = false
  private consultaEtapa = ''
  private loteProgress: CrfLoteProgress = {
    status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
    currentCliente: '', items: [],
  }

  getConsultaEtapa(): string { return this.consultaEtapa }
  getLoteProgress(): CrfLoteProgress { return { ...this.loteProgress } }

  private async ensureTable() {
    // Schema garantido por migração manual_2026_06_26_cnd_dte_tables.sql (R2-002).
    // Sem DDL no caminho de request — os métodos apenas LEEM.
    if (this.tableChecked) return
    this.tableChecked = true
  }

  // ── Consulta individual ──────────────────────────────

  async consultar(documento: string, clienteId?: string, userId?: string): Promise<CrfResult> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    const tag = '[CRF-FGTS]'
    this.consultaEtapa = 'Iniciando consulta...'
    console.log(`${tag} Consultando CRF/FGTS para ${doc}...`)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'] })

    try {
      const page = await browser.newPage()
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36')
      await page.setViewport({ width: 1200, height: 800 })

      this.consultaEtapa = 'Acessando portal da Caixa...'
      await page.goto(CRF_URL, { waitUntil: 'networkidle2', timeout: 30000 })
      this.consultaEtapa = 'Página carregada, consultando...'
      console.log(`${tag} Página carregada`)

      // Espera o form JSF terminar de renderizar (em rede lenta da VPS o
      // networkidle2 dispara antes do JSF compor os campos)
      await page.waitForSelector('#mainForm\\:txtInscricao1', { timeout: 20000 })
      await page.waitForSelector('#mainForm\\:btnConsultar', { timeout: 5000 })

      // Preencher CNPJ e consultar
      await page.evaluate(`document.getElementById("mainForm:txtInscricao1").value = "${doc}"`)
      await page.evaluate('document.getElementById("mainForm:btnConsultar").click()')
      this.consultaEtapa = 'Aguardando resposta da Caixa...'
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 8000))

      // Verificar resultado
      const textoRes: string = await page.evaluate('document.body.innerText')
      const isRegular = textoRes.includes('REGULAR') && !textoRes.includes('IRREGULAR')
      const isIrregular = textoRes.includes('IRREGULAR')

      let sucesso = false
      let tipo: string | null = null
      let mensagem = ''
      let numeroCertificado: string | null = null
      let dataValidade: string | null = null
      let pdfBase64: string | null = null

      if (isRegular) {
        this.consultaEtapa = 'Empresa regular, obtendo certificado...'
        console.log(`${tag} Empresa REGULAR, clicando CRF...`)

        // Clicar para obter CRF
        const crfLinkId: string | null = await page.evaluate(`(function(){
          var links = document.querySelectorAll('a');
          for (var i = 0; i < links.length; i++) {
            if (links[i].innerText.includes('Certificado') || links[i].innerText.includes('CRF')) return links[i].id;
          }
          return null;
        })()`)

        if (crfLinkId) {
          await page.evaluate(`document.getElementById("${crfLinkId}").click()`)
          await new Promise((r: (v: unknown) => void) => setTimeout(r, 5000))

          const textoCrf: string = await page.evaluate('document.body.innerText')

          // Extrair validade (formato: "Validade: DD/MM/YYYY a DD/MM/YYYY")
          const validadeMatch = textoCrf.match(/Validade:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/)
          if (validadeMatch) {
            const [dd, mm, yyyy] = validadeMatch[2]!.split('/')
            dataValidade = `${yyyy}-${mm}-${dd}`
          }

          // Extrair número do certificado
          const certMatch = textoCrf.match(/Certificado\s*N[úu]mero:\s*(\d+)/)
          if (certMatch) numeroCertificado = certMatch[1]!

          // Clicar em "Visualizar" para gerar o PDF real da Caixa
          this.consultaEtapa = 'Gerando PDF do certificado...'
          const vizBtnId: string | null = await page.evaluate(`(function(){
            var btn = document.getElementById("mainForm:btnVisualizar");
            return btn ? btn.id : null;
          })()`)

          if (vizBtnId) {
            // Interceptar PDF via CDP Fetch
            const cdpClient = await page.createCDPSession()
            await cdpClient.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Response' }] })

            let pdfCaptured = false
            cdpClient.on('Fetch.requestPaused', async (event: { requestId: string; request: { url: string }; responseHeaders?: Array<{ name: string; value: string }>; responseStatusCode?: number }) => {
              const ct = (event.responseHeaders || []).find(h => h.name.toLowerCase() === 'content-type')
              if (ct && ct.value.includes('pdf') && !pdfCaptured) {
                try {
                  const body = await cdpClient.send('Fetch.getResponseBody', { requestId: event.requestId })
                  const buf = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8')
                  if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
                    pdfBase64 = buf.toString('base64')
                    pdfCaptured = true
                    console.log(`${tag} PDF real capturado via Visualizar: ${buf.length} bytes`)
                  }
                } catch { /* */ }
              }
              await cdpClient.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
            })

            console.log(`${tag} Clicando Visualizar...`)
            await page.evaluate(`document.getElementById("${vizBtnId}").click()`)
            await new Promise((r: (v: unknown) => void) => setTimeout(r, 10000))

            // Fallback: se o PDF não foi interceptado via Fetch, usar page.pdf()
            if (!pdfBase64) {
              console.log(`${tag} PDF não interceptado via Fetch, usando page.pdf()`)
              const pdfRaw = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
              pdfBase64 = Buffer.from(pdfRaw).toString('base64')
              console.log(`${tag} PDF print gerado: ${pdfRaw.length} bytes`)
            }

            await cdpClient.detach().catch(() => {})
          } else {
            // Fallback sem botão Visualizar
            console.log(`${tag} Botão Visualizar não encontrado, usando page.pdf()`)
            const pdfRaw = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } })
            pdfBase64 = Buffer.from(pdfRaw).toString('base64')
          }
        }

        sucesso = true
        tipo = 'Regular'
        mensagem = 'CRF emitido — empresa regular perante o FGTS'
        if (dataValidade) console.log(`${tag} Validade: ${dataValidade}, Cert: ${numeroCertificado}`)
      } else if (isIrregular) {
        sucesso = false
        tipo = 'Irregular'
        mensagem = 'Empresa IRREGULAR perante o FGTS'
      } else if (textoRes.includes('não encontrad') || textoRes.includes('inválid')) {
        sucesso = false
        tipo = null
        mensagem = 'Inscrição não encontrada'
      } else {
        sucesso = false
        tipo = null
        mensagem = 'Não foi possível consultar o CRF'
      }

      console.log(`${tag} ${doc}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)
      await browser.close()

      // Resolver cliente
      let razaoSocial: string | null = null
      let resolvedClienteId = clienteId || null
      // Extrair razão social do texto
      const razaoMatch = textoRes.match(/Raz[aã]o\s*[Ss]ocial\s*[:.]?\s*(.+)/i)
      if (razaoMatch) razaoSocial = razaoMatch[1]!.trim()

      if (clienteId) {
        const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } })
        if (cli?.razaoSocial) razaoSocial = cli.razaoSocial
      } else {
        const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
          `SELECT id, razao_social FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
        ).then(rows => rows[0] ? { id: rows[0].id, razaoSocial: rows[0].razao_social } : null)
        if (cli) { razaoSocial = cli.razaoSocial; resolvedClienteId = cli.id }
      }

      // Salvar
      await prisma.$executeRawUnsafe(`DELETE FROM certidoes_crf_fgts WHERE documento = $1`, doc)
      await prisma.$executeRawUnsafe(
        `INSERT INTO certidoes_crf_fgts (documento, razao_social, sucesso, tipo_certidao, mensagem, numero_certificado, data_validade, pdf_base64, cliente_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10)`,
        doc, razaoSocial, sucesso, tipo, mensagem, numeroCertificado, dataValidade, pdfBase64, resolvedClienteId, userId || null,
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

    ;(async () => {
      for (let i = 0; i < documentos.length; i++) {
        const c = documentos[i]!
        this.loteProgress.current = i + 1
        this.loteProgress.currentCliente = c.razaoSocial || c.documento
        this.loteProgress.items[i]!.status = 'processando'

        try {
          const result = await this.consultar(c.documento, c.clienteId, userId)
          if (result.sucesso) { this.loteProgress.emitidas++; this.loteProgress.items[i]!.status = 'emitida' }
          else { this.loteProgress.naoEmitidas++; this.loteProgress.items[i]!.status = 'nao_emitida'; this.loteProgress.items[i]!.erro = result.mensagem }
        } catch (e) {
          this.loteProgress.erros++; this.loteProgress.items[i]!.status = 'erro'; this.loteProgress.items[i]!.erro = (e as Error).message
        }

        if (i < documentos.length - 1) await new Promise((r: (v: unknown) => void) => setTimeout(r, 2000))
      }
      this.loteProgress.status = 'done'; this.loteProgress.currentCliente = 'Concluído'
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

    if (filtroStatus === 'regular') conditions.push(`sucesso = true AND tipo_certidao = 'Regular'`)
    else if (filtroStatus === 'irregular') conditions.push(`sucesso = false AND tipo_certidao = 'Irregular'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false AND (tipo_certidao IS NULL OR tipo_certidao != 'Irregular')`)
    else if (filtroStatus === 'vigente') conditions.push(`data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencendo') conditions.push(`data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencida') conditions.push(`data_validade IS NOT NULL AND data_validade < CURRENT_DATE`)

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM certidoes_crf_fgts ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, sucesso, tipo_certidao, mensagem, numero_certificado, data_validade, created_at FROM certidoes_crf_fgts ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
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
        numeroCertificado: r.numero_certificado as string | null,
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
        COUNT(*) FILTER (WHERE sucesso = true)::int as regulares,
        COUNT(*) FILTER (WHERE sucesso = false AND tipo_certidao = 'Irregular')::int as irregulares,
        COUNT(*) FILTER (WHERE sucesso = false AND (tipo_certidao IS NULL OR tipo_certidao != 'Irregular'))::int as nao_emitidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade < CURRENT_DATE)::int as vencidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days')::int as vencendo,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days')::int as vigentes
      FROM certidoes_crf_fgts
    `)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0), regulares: Number(r.regulares ?? 0), irregulares: Number(r.irregulares ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0), vencidas: Number(r.vencidas ?? 0),
      vencendo: Number(r.vencendo ?? 0), vigentes: Number(r.vigentes ?? 0),
    }
  }

  async getPdf(id: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_crf_fgts WHERE id = $1`, id,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteCrf(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_crf_fgts WHERE id = $1`, id)
    return { ok: true }
  }

  async deleteLote(ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_crf_fgts WHERE id IN (${placeholders})`, ...ids)
    return { deleted: ids.length }
  }
}
