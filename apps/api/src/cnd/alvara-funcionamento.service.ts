import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CaptchaService } from '../common/captcha.service'

const URLS: Record<string, { url: string; prefix: string }> = {
  'VITÓRIA': { url: 'https://tributacao.vilavelha.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabReemissaoAlvara', prefix: 'i27' }, // Vitória ainda não confirmado — usar Vila Velha como referência
  'VILA VELHA': { url: 'https://tributacao.vilavelha.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabReemissaoAlvara', prefix: 'i27' },
  'SERRA': { url: 'https://tributacao.serra.es.gov.br:8080/tbserra/loginWeb.jsp?execobj=ServicosWebSite&tab=tabReemissaoAlvara', prefix: 'i53' },
  'CARIACICA': { url: 'https://sistemas.cariacica.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabReemissaoAlvara', prefix: 'i27' },
}

export interface AlvaraFuncLoteProgress {
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
export class AlvaraFuncionamentoService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  private tableChecked = false
  private consultaEtapa = ''
  private loteProgress: AlvaraFuncLoteProgress = {
    status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
    currentCliente: '', items: [],
  }

  getConsultaEtapa(): string { return this.consultaEtapa }
  getLoteProgress(): AlvaraFuncLoteProgress { return { ...this.loteProgress } }

  private async ensureTable() {
    if (this.tableChecked) return
    try {
      const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alvaras_funcionamento')`,
      )
      if (exists[0]?.exists) { this.tableChecked = true; return }
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS alvaras_funcionamento (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          documento TEXT NOT NULL,
          razao_social TEXT,
          municipio TEXT NOT NULL,
          sucesso BOOLEAN NOT NULL DEFAULT false,
          mensagem TEXT,
          pdf_base64 TEXT,
          cliente_id TEXT,
          user_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_alv_func_doc ON alvaras_funcionamento (documento)`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_alv_func_mun ON alvaras_funcionamento (municipio)`)
    } catch (e) {
      if (!(e as Error).message?.includes('already exists')) throw e
    }
    this.tableChecked = true
  }

  // ── Consulta individual ──────────────────────────────

  async consultar(documento: string, municipio: string, clienteId?: string, userId?: string): Promise<{ sucesso: boolean; mensagem: string }> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    const mun = municipio.toUpperCase()
    const config = URLS[mun]
    if (!config) throw new Error(`Município "${municipio}" não suportado para alvará de funcionamento`)

    const tag = `[ALV-FUNC-${mun.replace(' ', '')}]`
    this.consultaEtapa = 'Iniciando consulta...'
    console.log(`${tag} Consultando alvará de funcionamento para ${doc}...`)

    // Buscar inscrição municipal do cliente
    let inscricaoMunicipal: string | null = null
    if (clienteId) {
      const rows = await prisma.$queryRawUnsafe<Array<{ inscricao_municipal: string | null }>>(
        `SELECT inscricao_municipal FROM clientes WHERE id = $1`, clienteId,
      )
      inscricaoMunicipal = rows[0]?.inscricao_municipal || null
    }
    if (!inscricaoMunicipal) {
      const rows = await prisma.$queryRawUnsafe<Array<{ inscricao_municipal: string | null }>>(
        `SELECT inscricao_municipal FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
      )
      inscricaoMunicipal = rows[0]?.inscricao_municipal || null
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'] })

    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1400, height: 900 })

      // Interceptar captcha raw
      let captchaRawB64: string | null = null
      page.on('response', async (res: { url: () => string; buffer: () => Promise<Buffer> }) => {
        if (res.url().includes('getCaptcha')) {
          try { const buf = await res.buffer(); captchaRawB64 = buf.toString('base64') } catch { /* */ }
        }
      })

      this.consultaEtapa = 'Acessando portal da prefeitura...'
      await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 })
      this.consultaEtapa = 'Página carregada'
      console.log(`${tag} Página carregada`)

      const prefix = config.prefix

      // Selecionar tipo = LicencaFuncionamento (valor 6)
      const tipoSelectId = `${prefix}idtpalvara`
      const licFuncValue: string | null = await page.evaluate(`(function(){
        var sel = document.getElementById("${tipoSelectId}");
        if(!sel) return null;
        for(var i=0;i<sel.options.length;i++){
          if(sel.options[i].text.toLowerCase().includes('funcionamento')) return sel.options[i].value;
        }
        return null;
      })()`)

      if (!licFuncValue) {
        await browser.close()
        return { sucesso: false, mensagem: 'Tipo "Licença de Funcionamento" não encontrado neste município' }
      }

      await page.select(`#${tipoSelectId}`, licFuncValue)
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 1000))

      // Preencher inscrição municipal
      if (inscricaoMunicipal) {
        const inscField = `${prefix}inscricao`
        const exists = await page.evaluate(`!!document.getElementById("${inscField}")`)
        if (exists) {
          await page.evaluate(`document.getElementById("${inscField}").value = ""`)
          await page.type(`#${inscField}`, inscricaoMunicipal)
          console.log(`${tag} Inscrição municipal: ${inscricaoMunicipal}`)
        }
      }

      // Preencher CNPJ
      const cnpjField = `${prefix}cnpj`
      await page.evaluate(`document.getElementById("${cnpjField}").value = ""`)
      await page.type(`#${cnpjField}`, doc)
      this.consultaEtapa = 'Dados preenchidos, resolvendo captcha...'
      console.log(`${tag} CNPJ preenchido`)

      // Captcha
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 1000))
      let captchaB64 = captchaRawB64
      if (!captchaB64) {
        captchaB64 = await page.evaluate(`(function(){ var img = document.getElementById("${prefix}captchaimg"); if (!img) return null; var c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext("2d").drawImage(img, 0, 0); return c.toDataURL("image/png").split(",")[1]; })()`) as string | null
      }
      if (!captchaB64) throw new Error('Captcha não encontrado na página')

      this.consultaEtapa = 'Resolvendo captcha via 2Captcha...'
      const captchaText = await this.captcha.resolveImage(captchaB64, { caseSensitive: true, minLen: 5, maxLen: 6, lang: 'en' })

      await page.evaluate(`document.getElementById("${prefix}captchafield").value = ""`)
      await page.type(`#${prefix}captchafield`, captchaText)
      this.consultaEtapa = 'Gerando alvará...'
      console.log(`${tag} Captcha: "${captchaText}", clicando Gerar...`)

      await page.click(`#${prefix}btngerar`)
      this.consultaEtapa = 'Aguardando resposta...'
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 15000))

      // Verificar resultado — abas com PDF
      const allPages = await browser.pages()
      let pdfBase64: string | null = null

      for (const p of allPages) {
        const pUrl = p.url()
        if (pUrl.includes('.pdf') || pUrl.includes('resultados')) {
          // Capturar PDF via page.evaluate(fetch) no contexto do browser
          try {
            const pdfHex: string | null = await page.evaluate(async (fetchUrl: string) => {
              try {
                const res = await fetch(fetchUrl, { credentials: 'include' })
                if (!res.ok) return null
                const ab = await res.arrayBuffer()
                const arr = new Uint8Array(ab)
                let hex = ''
                for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0')
                return hex
              } catch { return null }
            }, pUrl)
            if (pdfHex) {
              const buf = Buffer.from(pdfHex, 'hex')
              if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
                pdfBase64 = buf.toString('base64')
                console.log(`${tag} PDF capturado: ${buf.length} bytes`)
              }
            }
          } catch { /* */ }
        }
      }

      // Verificar texto da página
      const texto: string = await page.evaluate('document.body.innerText')
      await browser.close()

      let sucesso = false
      let mensagem = ''

      if (pdfBase64) {
        sucesso = true
        mensagem = 'Alvará de funcionamento emitido com sucesso'
      } else if (texto.includes('NENHUM REGISTRO') || texto.includes('Nenhum registro')) {
        sucesso = false
        mensagem = 'Nenhum alvará de funcionamento encontrado para este contribuinte'
      } else if (texto.includes('incorreto') || texto.includes('inválido')) {
        sucesso = false
        mensagem = 'Captcha incorreto — tente novamente'
      } else {
        sucesso = false
        mensagem = 'Não foi possível emitir o alvará de funcionamento'
      }

      console.log(`${tag} ${doc}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

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

      // Salvar
      await prisma.$executeRawUnsafe(`DELETE FROM alvaras_funcionamento WHERE documento = $1 AND UPPER(municipio) = UPPER($2)`, doc, municipio)
      await prisma.$executeRawUnsafe(
        `INSERT INTO alvaras_funcionamento (documento, razao_social, municipio, sucesso, mensagem, pdf_base64, cliente_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        doc, razaoSocial, municipio, sucesso, mensagem, pdfBase64, resolvedClienteId, userId || null,
      )

      return { sucesso, mensagem }
    } catch (e) {
      await browser.close()
      throw e
    }
  }

  // ── Lote ─────────────────────────────────────────────

  async consultarLote(municipio: string, clientes: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>, userId?: string): Promise<{ message: string }> {
    if (this.loteProgress.status === 'running') throw new Error('Consulta em lote já em andamento.')

    this.loteProgress = {
      status: 'running', total: clientes.length, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
      currentCliente: 'Iniciando...', items: clientes.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }

    ;(async () => {
      for (let i = 0; i < clientes.length; i++) {
        const c = clientes[i]!
        this.loteProgress.current = i + 1
        this.loteProgress.currentCliente = c.razaoSocial || c.documento
        this.loteProgress.items[i]!.status = 'processando'

        try {
          const result = await this.consultar(c.documento, municipio, c.clienteId, userId)
          if (result.sucesso) { this.loteProgress.emitidas++; this.loteProgress.items[i]!.status = 'emitida' }
          else { this.loteProgress.naoEmitidas++; this.loteProgress.items[i]!.status = 'nao_emitida'; this.loteProgress.items[i]!.erro = result.mensagem }
        } catch (e) {
          this.loteProgress.erros++; this.loteProgress.items[i]!.status = 'erro'; this.loteProgress.items[i]!.erro = (e as Error).message
        }

        if (i < clientes.length - 1) await new Promise((r: (v: unknown) => void) => setTimeout(r, 3000))
      }
      this.loteProgress.status = 'done'; this.loteProgress.currentCliente = 'Concluído'
    })()

    return { message: `Consulta em lote iniciada para ${clientes.length} documento(s)` }
  }

  // ── Listagem ────────────────────────────────────────

  async list(input: { page: number; limit: number; search?: string; municipio?: string }) {
    await this.ensureTable()
    const { page, limit, search, municipio } = input
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (municipio) { conditions.push(`UPPER(municipio) = UPPER($${idx})`); params.push(municipio); idx++ }
    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM alvaras_funcionamento ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, municipio, sucesso, mensagem, created_at FROM alvaras_funcionamento ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        documento: r.documento as string,
        razaoSocial: r.razao_social as string | null,
        municipio: r.municipio as string,
        sucesso: r.sucesso as boolean,
        mensagem: r.mensagem as string | null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  async totalizadores(municipio?: string) {
    await this.ensureTable()
    const mFilter = municipio ? `WHERE UPPER(municipio) = UPPER('${municipio}')` : ''
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true)::int as emitidos,
        COUNT(*) FILTER (WHERE sucesso = false)::int as nao_emitidos
      FROM alvaras_funcionamento ${mFilter}
    `)
    const r = rows[0]!
    return { total: Number(r.total ?? 0), emitidos: Number(r.emitidos ?? 0), naoEmitidos: Number(r.nao_emitidos ?? 0) }
  }

  async getPdf(id: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM alvaras_funcionamento WHERE id = $1`, id,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteAlvara(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM alvaras_funcionamento WHERE id = $1`, id)
    return { ok: true }
  }

  async deleteLote(ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    await prisma.$executeRawUnsafe(`DELETE FROM alvaras_funcionamento WHERE id IN (${placeholders})`, ...ids)
    return { deleted: ids.length }
  }

  async listarClientesMunicipio(municipio: string) {
    return prisma.cliente.findMany({
      where: { cidade: { equals: municipio, mode: 'insensitive' }, situacao: 'ATIVO', deletedAt: null },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }
}
