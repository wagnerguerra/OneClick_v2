import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

const SIAT_GRID_URL = 'https://siat.cb.es.gov.br/siat/soa/service/grid.alvarapublico'

export interface AlvaraLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  encontrados: number
  naoEncontrados: number
  erros: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'encontrado' | 'nao_encontrado' | 'erro' | 'pendente' | 'processando'; erro?: string }>
}

export interface AlvaraResult {
  id: number
  razaoSocial: string
  nomeFantasia: string | null
  endereco: string | null
  municipio: string | null
  bairro: string | null
  status: string
  codigoValidacao: string | null
  dataInicioValidade: string | null
  dataFimValidade: string | null
  ocupacao: string | null
}

export interface AlvaraConsultaResult {
  sucesso: boolean
  total: number
  alvaras: AlvaraResult[]
  mensagem: string
}

@Injectable()
export class AlvaraBombeirosService {
  private tableChecked = false

  private loteProgress: AlvaraLoteProgress = {
    status: 'idle', total: 0, current: 0, encontrados: 0, naoEncontrados: 0, erros: 0,
    currentCliente: '', items: [],
  }

  getLoteProgress(): AlvaraLoteProgress {
    return { ...this.loteProgress }
  }

  async consultarLote(clientes: Array<{ razaoSocial: string; clienteId?: string }>, userId?: string): Promise<{ message: string }> {
    if (this.loteProgress.status === 'running') throw new Error('Consulta em lote já em andamento.')

    this.loteProgress = {
      status: 'running', total: clientes.length, current: 0, encontrados: 0, naoEncontrados: 0, erros: 0,
      currentCliente: 'Iniciando...', items: clientes.map(c => ({ razaoSocial: c.razaoSocial, status: 'pendente' as const })),
    }

    this.runLote(clientes, userId).catch(e => {
      console.error('[Alvará Lote] Erro:', (e as Error).message)
      this.loteProgress.status = 'done'
      this.loteProgress.currentCliente = `Erro: ${(e as Error).message}`
    })

    return { message: 'Consulta em lote iniciada' }
  }

  private async runLote(clientes: Array<{ razaoSocial: string; clienteId?: string }>, userId?: string) {
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      this.loteProgress.current = i + 1
      this.loteProgress.currentCliente = c.razaoSocial
      this.loteProgress.items[i] = { razaoSocial: c.razaoSocial, status: 'processando' }

      try {
        const result = await this.consultar(c.razaoSocial, c.clienteId, userId)
        if (result.sucesso) {
          this.loteProgress.encontrados++
          this.loteProgress.items[i] = { razaoSocial: c.razaoSocial, status: 'encontrado' }
        } else {
          this.loteProgress.naoEncontrados++
          this.loteProgress.items[i] = { razaoSocial: c.razaoSocial, status: 'nao_encontrado' }
        }
      } catch (e) {
        this.loteProgress.erros++
        this.loteProgress.items[i] = { razaoSocial: c.razaoSocial, status: 'erro', erro: (e as Error).message }
      }

      if (i < clientes.length - 1) await new Promise(r => setTimeout(r, 1000))
    }

    this.loteProgress.status = 'done'
    this.loteProgress.currentCliente = 'Concluído'
  }

  private async ensureTable() {
    if (this.tableChecked) return
    try {
      const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'alvaras_bombeiros')`,
      )
      if (exists[0]?.exists) {
        // Garante que a coluna pdf_base64 existe (adicionada lazy posteriormente
        // — sem isso o compilar-certidoes loga prisma:error mesmo com .catch())
        await prisma.$executeRawUnsafe(`ALTER TABLE alvaras_bombeiros ADD COLUMN IF NOT EXISTS pdf_base64 TEXT`).catch(() => {})
        this.tableChecked = true
        return
      }
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS alvaras_bombeiros (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          alvara_id INT,
          documento TEXT,
          razao_social TEXT,
          nome_fantasia TEXT,
          endereco TEXT,
          municipio TEXT,
          bairro TEXT,
          status TEXT,
          codigo_validacao TEXT,
          data_inicio_validade TEXT,
          data_fim_validade TEXT,
          ocupacao TEXT,
          cliente_id TEXT,
          user_id TEXT,
          pdf_base64 TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_alv_documento ON alvaras_bombeiros (documento)`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_alv_cliente ON alvaras_bombeiros (cliente_id)`)
    } catch (e) {
      if (!(e as Error).message?.includes('already exists')) throw e
    }
    this.tableChecked = true
  }

  async consultar(razaoSocial: string, clienteId?: string, userId?: string): Promise<AlvaraConsultaResult> {
    await this.ensureTable()

    console.log(`[Alvará CBMES] Consultando: ${razaoSocial}`)

    const url = `${SIAT_GRID_URL}?razaoSocial=${encodeURIComponent(razaoSocial)}`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    })

    if (!res.ok) throw new Error(`SIAT retornou HTTP ${res.status}`)

    const data = await res.json() as {
      records: string
      rows: Array<Record<string, unknown>>
    }

    const total = Number(data.records || 0)
    const alvaras: AlvaraResult[] = (data.rows || []).map(r => {
      const est = (r.estabelecimento || {}) as Record<string, unknown>
      const mun = (r.municipio || {}) as Record<string, unknown>
      const bairro = (r.bairro || {}) as Record<string, unknown>
      const razao = (r.razaoSocial as string) || (r.lookup as string) || ''
      return {
        id: Number(r.id),
        razaoSocial: razao,
        nomeFantasia: (est.nomeFantasia as string) || (r.nomeFantasia as string) || null,
        endereco: (r.endereco as string) || null,
        municipio: (mun.nome as string) || null,
        bairro: (bairro.nome as string) || null,
        status: (r.alvaraStr as string) || 'Desconhecido',
        codigoValidacao: (r.codigoValidacao as string) || null,
        dataInicioValidade: (r.dataIniValidade as string) || null,
        dataFimValidade: (r.dataFimValidade as string) || (r.dataFimValidadeAux as string) || null,
        ocupacao: (r.ocupacao as string) || null,
      }
    })

    console.log(`[Alvará CBMES] ${total} resultado(s) para "${razaoSocial}"`)

    // Selecionar apenas o mais recente (por dataFimValidade mais recente)
    let maisRecente: AlvaraResult | null = null
    if (alvaras.length > 0) {
      maisRecente = alvaras.reduce((best, curr) => {
        const bestDate = best.dataFimValidade || '0'
        const currDate = curr.dataFimValidade || '0'
        return currDate > bestDate ? curr : best
      })
    }

    // Buscar documento e razão social do cliente
    let documento: string | null = null
    if (clienteId) {
      const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { documento: true } })
      documento = cli?.documento?.replace(/\D/g, '') ?? null
    } else {
      // Tentar encontrar cliente pela razão social (sem acentos para match mais robusto)
      const searchTerms = razaoSocial.split('/')[0]!.trim().split(' ').slice(0, 3).join(' ')
      const cli = await prisma.$queryRawUnsafe<Array<{ id: string; documento: string }>>(
        `SELECT id, documento FROM clientes WHERE deleted_at IS NULL AND razao_social ILIKE $1 LIMIT 1`,
        `%${searchTerms.normalize('NFD').replace(/[\u0300-\u036f]/g, '')}%`,
      ).then(rows => rows[0] || null)
      if (cli) {
        clienteId = cli.id
        documento = cli.documento?.replace(/\D/g, '') ?? null
      }
    }

    // Salvar apenas o mais recente no banco
    if (maisRecente) {
      // Remover registros anteriores deste cliente/razão social
      if (clienteId) {
        await prisma.$executeRawUnsafe(`DELETE FROM alvaras_bombeiros WHERE cliente_id = $1`, clienteId)
      } else {
        await prisma.$executeRawUnsafe(`DELETE FROM alvaras_bombeiros WHERE alvara_id = $1`, maisRecente.id)
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO alvaras_bombeiros (alvara_id, documento, razao_social, nome_fantasia, endereco, municipio, bairro, status, codigo_validacao, data_inicio_validade, data_fim_validade, ocupacao, cliente_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        maisRecente.id, documento, maisRecente.razaoSocial, maisRecente.nomeFantasia, maisRecente.endereco,
        maisRecente.municipio, maisRecente.bairro, maisRecente.status, maisRecente.codigoValidacao,
        maisRecente.dataInicioValidade, maisRecente.dataFimValidade, maisRecente.ocupacao,
        clienteId || null, userId || null,
      )
    }

    return {
      sucesso: total > 0,
      total,
      alvaras: maisRecente ? [maisRecente] : [],
      mensagem: total > 0
        ? `${total} alvará(s) encontrado(s)${total > 1 ? ' — salvo o mais recente' : ''}`
        : 'Nenhum alvará encontrado para esta razão social',
    }
  }

  async list(input: { page: number; limit: number; search?: string }) {
    await this.ensureTable()
    const { page, limit, search } = input
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIdx = 1

    if (search) {
      conditions.push(`(razao_social ILIKE $${paramIdx} OR documento ILIKE $${paramIdx} OR municipio ILIKE $${paramIdx})`)
      params.push(`%${search}%`); paramIdx++
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM alvaras_bombeiros ${where}`, ...params,
    )
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM alvaras_bombeiros ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        alvaraId: r.alvara_id as number,
        documento: r.documento as string | null,
        razaoSocial: r.razao_social as string,
        nomeFantasia: r.nome_fantasia as string | null,
        endereco: r.endereco as string | null,
        municipio: r.municipio as string | null,
        bairro: r.bairro as string | null,
        status: r.status as string,
        codigoValidacao: r.codigo_validacao as string | null,
        dataInicioValidade: r.data_inicio_validade as string | null,
        dataFimValidade: r.data_fim_validade as string | null,
        ocupacao: r.ocupacao as string | null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  /** Baixa o PDF do alvará via SIAT autenticado */
  async getPdf(alvaraId: number): Promise<{ pdfBase64: string | null }> {
    // Verificar se já temos PDF salvo
    const cached = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM alvaras_bombeiros WHERE alvara_id = $1`, alvaraId,
    )
    if (cached[0]?.pdf_base64) return { pdfBase64: cached[0].pdf_base64 }

    // Buscar via SIAT autenticado
    const tag = '[Alvará PDF]'
    console.log(`${tag} Buscando PDF do alvará ${alvaraId} via SIAT...`)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'] })

    try {
      const page = await browser.newPage()

      // Login
      await page.goto('https://siat.cb.es.gov.br/', { waitUntil: 'networkidle2', timeout: 30000 })

      // Buscar credenciais do banco
      const creds = await prisma.systemConfig.findMany({ where: { key: { in: ['SIAT_USER', 'SIAT_PASS'] } } })
      const siatUser = creds.find((c: { key: string }) => c.key === 'SIAT_USER')?.value || '82078742791'
      const siatPass = creds.find((c: { key: string }) => c.key === 'SIAT_PASS')?.value || '820787'

      await page.type('#id_j_username', siatUser)
      await page.type('input[name=j_password]', siatPass)
      await page.evaluate('document.querySelector("form").submit()')
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 5000))

      // Buscar razão social do alvará
      const alvaraRow = await prisma.$queryRawUnsafe<Array<{ razao_social: string }>>(
        `SELECT razao_social FROM alvaras_bombeiros WHERE alvara_id = $1`, alvaraId,
      )
      const razao = alvaraRow[0]?.razao_social
      if (!razao) { await browser.close(); return { pdfBase64: null } }

      // Navegar para Imprimir Alvará
      await page.goto('https://siat.cb.es.gov.br/siat/f/n/alvarapublico', { waitUntil: 'networkidle2', timeout: 30000 })
      await page.evaluate(`document.getElementById("corpo:formulario:razaoSocial").value = "${razao.split('/')[0]!.trim().slice(0, 40)}"`)
      await page.evaluate('document.getElementById("corpo:formulario:botaoAcaoPesquisar").click()')
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 8000))

      // Chamar chamarImprimirAlvara com o ID
      console.log(`${tag} Gerando PDF para alvará ${alvaraId}...`)
      const newPagePromise = new Promise<unknown>(resolve => browser.once('targetcreated', async (t: { page: () => Promise<unknown> }) => resolve(await t.page())))
      await page.evaluate(`chamarImprimirAlvara('ALVARA_LICENCA',${alvaraId})`)

      const pdfPage = await Promise.race([newPagePromise, new Promise((_, rej) => setTimeout(() => rej('timeout'), 15000))]) as { createCDPSession: () => Promise<{ send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>; on: (event: string, handler: (...args: unknown[]) => void) => void }>; reload: (opts: Record<string, unknown>) => Promise<void> }
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 3000))

      // CDP Fetch + reload para capturar o PDF
      const client = await pdfPage.createCDPSession()
      await client.send('Fetch.enable', { patterns: [{ urlPattern: '*alvarapublico*', requestStage: 'Response' }] })

      let pdfBase64: string | null = null
      client.on('Fetch.requestPaused', async (event: { requestId: string; responseHeaders?: Array<{ name: string; value: string }> }) => {
        const ct = (event.responseHeaders || []).find(h => h.name.toLowerCase() === 'content-type')
        if (ct && ct.value.includes('pdf') && !pdfBase64) {
          try {
            const body = await client.send('Fetch.getResponseBody', { requestId: event.requestId }) as { body: string; base64Encoded: boolean }
            const buf = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8')
            if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
              pdfBase64 = buf.toString('base64')
              console.log(`${tag} PDF capturado: ${buf.length} bytes`)
            }
          } catch { /* */ }
        }
        await client.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
      })

      await pdfPage.reload({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 5000))

      await browser.close()

      // Salvar PDF no banco para cache
      if (pdfBase64) {
        await prisma.$executeRawUnsafe(`ALTER TABLE alvaras_bombeiros ADD COLUMN IF NOT EXISTS pdf_base64 TEXT`).catch(() => {})
        await prisma.$executeRawUnsafe(`UPDATE alvaras_bombeiros SET pdf_base64 = $1 WHERE alvara_id = $2`, pdfBase64, alvaraId)
      }

      return { pdfBase64 }
    } catch (e) {
      await browser.close()
      console.error(`${tag} Erro:`, (e as Error).message)
      return { pdfBase64: null }
    }
  }

  async totalizadores() {
    await this.ensureTable()
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'Regular')::int as regulares,
        COUNT(*) FILTER (WHERE status != 'Regular')::int as irregulares
      FROM alvaras_bombeiros
    `)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      regulares: Number(r.regulares ?? 0),
      irregulares: Number(r.irregulares ?? 0),
    }
  }

  async deleteAlvara(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM alvaras_bombeiros WHERE id = $1`, id)
    return { ok: true }
  }

  async deleteLote(ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    await prisma.$executeRawUnsafe(`DELETE FROM alvaras_bombeiros WHERE id IN (${placeholders})`, ...ids)
    return { deleted: ids.length }
  }
}
