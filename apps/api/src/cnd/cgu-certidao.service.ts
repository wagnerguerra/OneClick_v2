import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

export interface CguResult {
  sucesso: boolean
  mensagem: string
  tipo: string | null
}

export interface CguLoteProgress {
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
export class CguCertidaoService {
  private tableChecked = false
  private consultaEtapa = ''
  private loteProgress: CguLoteProgress = {
    status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
    currentCliente: '', items: [],
  }

  getConsultaEtapa(): string { return this.consultaEtapa }
  getLoteProgress(): CguLoteProgress { return { ...this.loteProgress } }

  private async ensureTable() {
    if (this.tableChecked) return
    try {
      const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'certidoes_cgu')`,
      )
      if (exists[0]?.exists) { this.tableChecked = true; return }
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS certidoes_cgu (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          documento TEXT NOT NULL,
          razao_social TEXT,
          sucesso BOOLEAN NOT NULL DEFAULT false,
          tipo_certidao TEXT,
          mensagem TEXT,
          situacao TEXT,
          data_consulta TIMESTAMPTZ,
          pdf_base64 TEXT,
          cliente_id TEXT,
          user_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_cgu_doc ON certidoes_cgu (documento)`)
    } catch (e) {
      if (!(e as Error).message?.includes('already exists')) throw e
    }
    this.tableChecked = true
  }

  private formatCnpj(doc: string): string {
    const d = doc.replace(/\D/g, '')
    if (d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
    return doc
  }

  // ── Consulta individual ──────────────────────────────

  async consultar(documento: string, clienteId?: string, userId?: string): Promise<CguResult> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    const tag = '[CGU]'
    this.consultaEtapa = 'Iniciando consulta...'
    console.log(`${tag} Consultando CGU para ${doc}...`)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    })

    try {
      const page = await browser.newPage()
      await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }) })
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36')
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' })

      // Interceptar response da API de emissão
      let pdfBase64: string | null = null
      page.on('response', async (res: { url: () => string; json: () => Promise<{ conteudo?: string; nomeArquivo?: string }> }) => {
        if (res.url().includes('/api/publico/emissao/')) {
          try {
            const data = await res.json()
            if (data.conteudo) {
              pdfBase64 = data.conteudo
              console.log(`${tag} PDF capturado via API: ${data.nomeArquivo || 'certidao.pdf'}`)
            }
          } catch { /* */ }
        }
      })

      this.consultaEtapa = 'Acessando portal da CGU...'
      await page.goto('https://certidoes.cgu.gov.br/', { waitUntil: 'networkidle2', timeout: 30000 })
      console.log(`${tag} Página inicial carregada`)

      // Clicar Emitir Certidão
      this.consultaEtapa = 'Navegando para emissão...'
      await page.click('button.btn-primary')
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 3000))

      // Selecionar Ente Privado
      this.consultaEtapa = 'Selecionando Ente Privado...'
      await page.click('#__BVID__26')
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 2000))

      // Preencher CNPJ formatado
      this.consultaEtapa = 'Preenchendo CNPJ...'
      await page.focus('#cpfCnpj')
      await page.keyboard.type(this.formatCnpj(doc), { delay: 30 })
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 500))

      // Consultar
      this.consultaEtapa = 'Consultando...'
      console.log(`${tag} Clicando Consultar...`)
      await page.click('#consultar')
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 8000))

      // Verificar resultado
      const texto: string = await page.evaluate('document.body.innerText')

      if (texto.includes('inválido')) {
        await browser.close()
        const msg = 'CNPJ/CPF inválido'
        await this.salvar(doc, null, false, null, msg, null, null, clienteId, userId)
        return { sucesso: false, mensagem: msg, tipo: null }
      }

      // Extrair razão social do texto
      let razaoSocialExtraida: string | null = null
      const razaoMatch = texto.match(/Consultado:\s*(.+?)\s+CPF\/CNPJ:/)
      if (razaoMatch) razaoSocialExtraida = razaoMatch[1]!.trim()

      // Verificar situação (Nada Consta / Consta)
      const nadaConsta = texto.includes('Nada Consta')
      const consta = texto.includes('Consta') && !nadaConsta

      // Pegar botão Certidão
      const btnId: string | null = await page.evaluate(`(function(){
        var btns = document.querySelectorAll('button');
        for(var i=0;i<btns.length;i++){ if(btns[i].id && btns[i].id.startsWith('btnEmitirCertidao')) return btns[i].id; }
        return null;
      })()`)

      if (btnId) {
        this.consultaEtapa = 'Emitindo certidão...'
        console.log(`${tag} Clicando ${btnId}...`)
        await page.click(`#${btnId}`)
        await new Promise((r: (v: unknown) => void) => setTimeout(r, 10000))
      }

      await browser.close()

      let sucesso = false
      let tipo: string | null = null
      let mensagem = ''
      let situacao: string | null = null

      if (pdfBase64) {
        sucesso = true
        tipo = nadaConsta ? 'Nada Consta' : consta ? 'Consta' : 'Emitida'
        situacao = tipo
        mensagem = 'Certidão CGU emitida com sucesso'
      } else if (nadaConsta) {
        sucesso = true
        tipo = 'Nada Consta'
        situacao = 'Nada Consta'
        mensagem = 'Nada consta — certidão negativa'
      } else if (consta) {
        sucesso = false
        tipo = 'Consta'
        situacao = 'Consta'
        mensagem = 'Consta registro nos sistemas da CGU'
      } else {
        sucesso = false
        tipo = null
        mensagem = 'Não foi possível emitir a certidão'
      }

      console.log(`${tag} ${doc}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

      // Resolver cliente
      let razaoSocial = razaoSocialExtraida
      let resolvedClienteId = clienteId || null
      if (clienteId) {
        const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } })
        if (cli?.razaoSocial) razaoSocial = cli.razaoSocial
      } else {
        const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
          `SELECT id, razao_social FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
        ).then(rows => rows[0] ? { id: rows[0].id, razaoSocial: rows[0].razao_social } : null)
        if (cli) { razaoSocial = cli.razaoSocial; resolvedClienteId = cli.id }
      }

      await this.salvar(doc, razaoSocial, sucesso, tipo, mensagem, situacao, pdfBase64, resolvedClienteId, userId)
      return { sucesso, mensagem, tipo }
    } catch (e) {
      await browser.close()
      throw e
    }
  }

  private async salvar(doc: string, razaoSocial: string | null, sucesso: boolean, tipo: string | null, mensagem: string, situacao: string | null, pdfBase64: string | null, clienteId: string | null, userId: string | null) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cgu WHERE documento = $1`, doc)
    await prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cgu (documento, razao_social, sucesso, tipo_certidao, mensagem, situacao, data_consulta, pdf_base64, cliente_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)`,
      doc, razaoSocial, sucesso, tipo, mensagem, situacao, pdfBase64, clienteId, userId || null,
    )
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

        if (i < documentos.length - 1) await new Promise((r: (v: unknown) => void) => setTimeout(r, 3000))
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

    if (filtroStatus === 'nada_consta') conditions.push(`sucesso = true AND tipo_certidao = 'Nada Consta'`)
    else if (filtroStatus === 'consta') conditions.push(`tipo_certidao = 'Consta'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false AND tipo_certidao IS NULL`)

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM certidoes_cgu ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, sucesso, tipo_certidao, mensagem, situacao, data_consulta, created_at FROM certidoes_cgu ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
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
        situacao: r.situacao as string | null,
        dataConsulta: r.data_consulta ? (r.data_consulta as Date).toISOString() : null,
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
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao = 'Nada Consta')::int as nada_consta,
        COUNT(*) FILTER (WHERE tipo_certidao = 'Consta')::int as consta,
        COUNT(*) FILTER (WHERE sucesso = false AND tipo_certidao IS NULL)::int as nao_emitidas
      FROM certidoes_cgu
    `)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0), nadaConsta: Number(r.nada_consta ?? 0),
      consta: Number(r.consta ?? 0), naoEmitidas: Number(r.nao_emitidas ?? 0),
    }
  }

  async getPdf(id: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cgu WHERE id = $1`, id,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteCgu(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cgu WHERE id = $1`, id)
    return { ok: true }
  }

  async deleteLote(ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cgu WHERE id IN (${placeholders})`, ...ids)
    return { deleted: ids.length }
  }
}
