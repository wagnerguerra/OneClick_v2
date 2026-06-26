import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// Configuracao
// ============================================================

const SERPRO_GATEWAY = 'gateway.apiserpro.serpro.gov.br'
const CND_PATH = '/consulta-cnd/v1/certidao'
const TOKEN_PATH = '/token'
const REQUEST_TIMEOUT = 60000
const CACHE_HOURS = 24

// ============================================================
// Tipos
// ============================================================

interface HttpResponse { status: number; headers: Record<string, string>; data: string }

interface CndApiResponse {
  Status: number
  Mensagem: string
  Chave?: string
  Certidao?: {
    TipoContribuinte: number
    ContribuinteCertidao: string
    TipoCertidao: number // 1=Negativa, 2=Positiva com efeitos de Negativa
    CodigoControle: string
    DataEmissao: string
    DataValidade: string
    DocumentoPdf?: string
  }
}

// ============================================================
// Helpers
// ============================================================

function httpsRequest(options: https.RequestOptions, postData?: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout SERPRO (60s)')), REQUEST_TIMEOUT)
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => (data += chunk))
      res.on('end', () => {
        clearTimeout(timer)
        const headers: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k] = v
          else if (Array.isArray(v)) headers[k] = v.join('; ')
        }
        resolve({ status: res.statusCode || 0, headers, data })
      })
    })
    req.on('error', (e) => { clearTimeout(timer); reject(e) })
    if (postData) req.write(postData)
    req.end()
  })
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

const TIPO_CERTIDAO_LABELS: Record<number, string> = {
  1: 'Negativa',
  2: 'Positiva com Efeitos de Negativa',
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class CndService {
  private tokenCache: { accessToken: string; expiresAt: number } | null = null

  // ── Configuracao ──────────────────────────────────────

  private async getConfig() {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA', 'CNPJ_CONTRATANTE'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const consumerKey = map.get('CONSUMER_KEY') || process.env.CONSUMER_KEY || ''
    const consumerSecret = map.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET || ''
    const certSenha = map.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA || ''

    if (!consumerKey || !consumerSecret) throw new Error('Consumer Key/Secret nao configurados. Acesse Configuracoes > Certificado Digital.')

    return { consumerKey, consumerSecret, certSenha }
  }

  private getCertPath(): string | null {
    const certPath = path.resolve(process.cwd(), 'uploads', 'certificado.pfx')
    return fs.existsSync(certPath) ? certPath : null
  }

  // ── OAuth2 Token ──────────────────────────────────────

  private async obterToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60000) {
      return this.tokenCache.accessToken
    }

    const config = await this.getConfig()
    const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
    const postData = 'grant_type=client_credentials'

    const certPath = this.getCertPath()
    const pfxBuffer = certPath ? fs.readFileSync(certPath) : undefined

    const res = await httpsRequest({
      hostname: SERPRO_GATEWAY,
      port: 443,
      path: TOKEN_PATH,
      method: 'POST',
      ...(pfxBuffer ? { pfx: pfxBuffer, passphrase: config.certSenha } : {}),
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(Buffer.byteLength(postData)),
      },
      rejectUnauthorized: true,
    }, postData)

    if (res.status !== 200) {
      throw new Error(`Falha na autenticacao SERPRO: HTTP ${res.status} - ${res.data.slice(0, 200)}`)
    }

    const data = JSON.parse(res.data) as { access_token: string; expires_in?: number }
    const expiresIn = data.expires_in || 3600
    this.tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + expiresIn * 1000 }

    return data.access_token
  }

  // ── Consulta CND API ─────────────────────────────────

  private async consultarApi(documento: string, tipoContribuinte: number, gerarPdf = true, chave?: string): Promise<CndApiResponse> {
    const token = await this.obterToken()
    const codId = tipoContribuinte === 1 ? '9001' : tipoContribuinte === 2 ? '9002' : '9003'

    const body = JSON.stringify({
      TipoContribuinte: tipoContribuinte,
      ContribuinteConsulta: documento.replace(/\D/g, ''),
      CodigoIdentificacao: codId,
      GerarCertidaoPdf: gerarPdf,
      ...(chave ? { Chave: chave } : {}),
    })

    const res = await httpsRequest({
      hostname: SERPRO_GATEWAY,
      port: 443,
      path: CND_PATH,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      rejectUnauthorized: true,
    }, body)

    // Token expirado — renovar e tentar novamente
    if (res.status === 401) {
      const newToken = await this.obterToken(true)
      const res2 = await httpsRequest({
        hostname: SERPRO_GATEWAY,
        port: 443,
        path: CND_PATH,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': String(Buffer.byteLength(body)),
        },
        rejectUnauthorized: true,
      }, body)
      return JSON.parse(res2.data) as CndApiResponse
    }

    return JSON.parse(res.data) as CndApiResponse
  }

  // ── Consultar com retry (Status 7 = processando) ─────

  private async consultarComRetry(documento: string, tipoContribuinte: number): Promise<CndApiResponse> {
    let result = await this.consultarApi(documento, tipoContribuinte, true)

    // Status 7 = "Em processamento" — usar Chave para polling
    let tentativas = 0
    while (result.Status === 7 && result.Chave && tentativas < 5) {
      tentativas++
      await sleep(2000) // esperar pelo menos 500ms (usamos 2s para seguranca)
      result = await this.consultarApi(documento, tipoContribuinte, true, result.Chave)
    }

    return result
  }

  // ── Tabela (criacao automatica) ───────────────────────

  private tableChecked = false
  async ensureTable() {
    // Schema garantido por migração manual_2026_06_26_cnd_dte_tables.sql (R2-002).
    // Sem DDL no caminho de request — os métodos apenas LEEM.
    if (this.tableChecked) return
    this.tableChecked = true
  }

  // ── Verificar cache ──────────────────────────────────

  async verificarCache(documento: string): Promise<{ temCache: boolean; registro?: Record<string, unknown> }> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM certidoes_cnd
       WHERE documento = $1 AND deleted_at IS NULL AND sucesso = true
       AND created_at > NOW() - INTERVAL '${CACHE_HOURS} hours'
       ORDER BY created_at DESC LIMIT 1`,
      doc,
    )
    if (rows.length > 0) return { temCache: true, registro: rows[0] }
    return { temCache: false }
  }

  // ── Consultar (principal) ────────────────────────────

  async consultar(
    documento: string,
    tipoDocumento: number,
    opts?: { clienteId?: string; empresaId?: string; userId?: string; forcarNova?: boolean },
  ) {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')

    // Verificar cache (24h) se nao forcar nova
    if (!opts?.forcarNova) {
      const cache = await this.verificarCache(doc)
      if (cache.temCache && cache.registro) {
        return { fromCache: true, ...this.formatarRegistro(cache.registro) }
      }
    }

    // Buscar razao social do cliente
    let razaoSocial: string | null = null
    if (opts?.clienteId) {
      const cli = await prisma.cliente.findUnique({ where: { id: opts.clienteId }, select: { razaoSocial: true } })
      razaoSocial = cli?.razaoSocial || null
    } else {
      const cli = await prisma.$queryRawUnsafe<Array<{ razao_social: string }>>(
        `SELECT razao_social FROM clientes WHERE deleted_at IS NULL
         AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
      )
      razaoSocial = cli[0]?.razao_social || null
    }

    // Remover registros anteriores do mesmo documento (manter apenas a consulta mais recente)
    await prisma.$executeRawUnsafe(
      `DELETE FROM certidoes_cnd WHERE documento = $1 AND deleted_at IS NULL`,
      doc,
    )

    // Criar registro pendente
    const id = `cnd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cnd (id, documento, tipo_documento, razao_social, etapa, cliente_id, empresa_id, user_id)
       VALUES ($1, $2, $3, $4, 'autenticando', $5, $6, $7)`,
      id, doc, tipoDocumento, razaoSocial,
      opts?.clienteId || null, opts?.empresaId || null, opts?.userId || null,
    )

    try {
      // Atualizar etapa
      await prisma.$executeRawUnsafe(`UPDATE certidoes_cnd SET etapa = 'consultando', updated_at = NOW() WHERE id = $1`, id)

      const result = await this.consultarComRetry(doc, tipoDocumento)

      // Status 1 ou 2 = sucesso (certidao encontrada/emitida)
      if ((result.Status === 1 || result.Status === 2) && result.Certidao) {
        const cert = result.Certidao
        const tipoCertidao = TIPO_CERTIDAO_LABELS[cert.TipoCertidao] || `Tipo ${cert.TipoCertidao}`
        const dataEmissao = cert.DataEmissao ? new Date(cert.DataEmissao) : null
        const dataValidade = cert.DataValidade ? new Date(cert.DataValidade) : null

        await prisma.$executeRawUnsafe(
          `UPDATE certidoes_cnd SET
            etapa = 'concluido', sucesso = true,
            tipo_certidao = $2, codigo_controle = $3,
            data_emissao = $4, data_validade = $5,
            pdf_base64 = $6, status_api = $7, mensagem_api = $8,
            resposta_completa = $9::jsonb, updated_at = NOW()
           WHERE id = $1`,
          id, tipoCertidao, cert.CodigoControle,
          dataEmissao, dataValidade,
          cert.DocumentoPdf || null, result.Status, result.Mensagem,
          JSON.stringify(result),
        )

        return { fromCache: false, ...this.formatarRegistro(await this.getRegistroById(id)) }
      }

      // Status 3 ou 4 = certidao nao emitida
      if (result.Status === 3 || result.Status === 4) {
        await prisma.$executeRawUnsafe(
          `UPDATE certidoes_cnd SET etapa = 'concluido', sucesso = false,
            status_api = $2, mensagem_api = $3, erro = $3,
            resposta_completa = $4::jsonb, updated_at = NOW()
           WHERE id = $1`,
          id, result.Status, result.Mensagem, JSON.stringify(result),
        )
        return { fromCache: false, ...this.formatarRegistro(await this.getRegistroById(id)) }
      }

      // Outros status = erro
      const erroMsg = result.Mensagem || `Status ${result.Status}`
      await prisma.$executeRawUnsafe(
        `UPDATE certidoes_cnd SET etapa = 'erro', sucesso = false,
          status_api = $2, mensagem_api = $3, erro = $3,
          resposta_completa = $4::jsonb, updated_at = NOW()
         WHERE id = $1`,
        id, result.Status, erroMsg, JSON.stringify(result),
      )
      throw new Error(erroMsg)

    } catch (e) {
      // Atualizar registro com erro se ainda nao foi atualizado
      await prisma.$executeRawUnsafe(
        `UPDATE certidoes_cnd SET etapa = 'erro', sucesso = false, erro = $2, updated_at = NOW()
         WHERE id = $1 AND etapa NOT IN ('concluido', 'erro')`,
        id, (e as Error).message,
      )
      throw e
    }
  }

  // ── Log de execucao ───────────────────────────────────

  private execLogTableChecked = false
  private async ensureExecLogTable() {
    // Schema (cnd_exec_log) garantido por migração manual_2026_06_26_cnd_dte_tables.sql
    // (R2-002). Sem DDL no caminho de request.
    if (this.execLogTableChecked) return
    this.execLogTableChecked = true
  }

  async listarExecLogs(limit = 20, offset = 0) {
    await this.ensureExecLogTable()
    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM cnd_exec_log`,
    )
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, tipo, iniciado_por, nome_usuario, iniciado_em, finalizado_em,
              total, sucesso, falhas, status, itens::text
       FROM cnd_exec_log ORDER BY iniciado_em DESC LIMIT $1 OFFSET $2`,
      limit, offset,
    )
    return {
      logs: rows.map(r => ({
        id: r.id as string,
        tipo: r.tipo as string,
        iniciadoPor: r.iniciado_por as string | null,
        nomeUsuario: r.nome_usuario as string | null,
        iniciadoEm: r.iniciado_em instanceof Date ? r.iniciado_em.toISOString() : String(r.iniciado_em),
        finalizadoEm: r.finalizado_em ? (r.finalizado_em instanceof Date ? r.finalizado_em.toISOString() : String(r.finalizado_em)) : null,
        total: r.total as number,
        sucesso: r.sucesso as number,
        falhas: r.falhas as number,
        status: r.status as string,
        itens: typeof r.itens === 'string' ? JSON.parse(r.itens) : r.itens,
      })),
      total: countRows[0]?.total || 0,
    }
  }

  // ── Consulta em lote ─────────────────────────────────

  async consultarLote(documentos: string[], empresaId: string | null, userId: string) {
    await this.ensureExecLogTable()

    const logId = `cndlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const startedAt = new Date().toISOString()

    // Buscar nome do usuario
    let nomeUsuario: string | null = null
    if (userId) {
      const userRows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM users WHERE id = $1 LIMIT 1`, userId,
      )
      nomeUsuario = userRows[0]?.name || null
    }

    // Buscar razao social dos documentos para o log
    const docsLimpos = documentos.map(d => d.replace(/\D/g, ''))
    const clientesInfo = await prisma.$queryRawUnsafe<Array<{ documento: string; razao_social: string }>>(
      `SELECT REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') as documento, razao_social
       FROM clientes WHERE deleted_at IS NULL
       AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = ANY($1::text[])`,
      docsLimpos,
    )
    const nomeMap: Record<string, string> = {}
    for (const c of clientesInfo) nomeMap[c.documento] = c.razao_social

    // Criar log
    await prisma.$executeRawUnsafe(
      `INSERT INTO cnd_exec_log (id, tipo, iniciado_por, nome_usuario, iniciado_em, total, status)
       VALUES ($1, 'manual', $2, $3, $4::timestamptz, $5, 'running')`,
      logId, userId, nomeUsuario, startedAt, documentos.length,
    )

    const resultados: Array<{ documento: string; sucesso: boolean; erro?: string }> = []
    const logItens: Array<{ razaoSocial: string; documento: string; status: string; erro?: string; duracaoMs?: number }> = []
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < documentos.length; i++) {
      const doc = documentos[i]!
      const docLimpo = doc.replace(/\D/g, '')
      const tipo = docLimpo.length === 11 ? 2 : 1
      const razaoSocial = nomeMap[docLimpo] || docLimpo
      const itemStart = Date.now()

      try {
        await this.consultar(docLimpo, tipo, { empresaId: empresaId || undefined, userId })
        resultados.push({ documento: docLimpo, sucesso: true })
        logItens.push({ razaoSocial, documento: docLimpo, status: 'ok', duracaoMs: Date.now() - itemStart })
        successCount++
      } catch (e) {
        const erro = (e as Error).message
        resultados.push({ documento: docLimpo, sucesso: false, erro })
        logItens.push({ razaoSocial, documento: docLimpo, status: 'erro', erro, duracaoMs: Date.now() - itemStart })
        failCount++
      }

      // Delay entre consultas
      if (i < documentos.length - 1) await sleep(3000)
    }

    // Finalizar log
    await prisma.$executeRawUnsafe(
      `UPDATE cnd_exec_log SET finalizado_em = NOW(), sucesso = $2, falhas = $3, status = 'completed', itens = $4::jsonb
       WHERE id = $1`,
      logId, successCount, failCount, JSON.stringify(logItens),
    )

    return resultados
  }

  // ── Listagem paginada ────────────────────────────────

  async totalizadores(empresaId: string | null = null) {
    await this.ensureTable()
    // Isolamento multi-tenant: conta apenas certidões da empresa do tenant.
    // Sem empresa no contexto → default-deny (empresa_id IS NULL).
    const empFilter = empresaId ? 'AND empresa_id = $1' : 'AND empresa_id IS NULL'
    const params = empresaId ? [empresaId] : []
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao = 'Negativa')::int as negativas,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao = 'Positiva com Efeitos de Negativa')::int as positivas_efeitos,
        COUNT(*) FILTER (WHERE sucesso = false AND etapa = 'concluido')::int as nao_emitidas,
        COUNT(*) FILTER (WHERE sucesso = true AND data_validade IS NOT NULL AND data_validade < NOW())::int as vencidas,
        COUNT(*) FILTER (WHERE sucesso = true AND data_validade IS NOT NULL AND data_validade >= NOW() AND data_validade <= NOW() + INTERVAL '15 days')::int as vencendo,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int as lixeira
      FROM certidoes_cnd WHERE deleted_at IS NULL ${empFilter}
    `, ...params)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      negativas: Number(r.negativas ?? 0),
      positivasEfeitos: Number(r.positivas_efeitos ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0),
      vencidas: Number(r.vencidas ?? 0),
      vencendo: Number(r.vencendo ?? 0),
      lixeira: Number(r.lixeira ?? 0),
    }
  }

  async list(input: { page: number; limit: number; search?: string; sortBy?: string; sortDir?: string; clienteId?: string; tipoCertidao?: string; lixeira?: boolean }) {
    await this.ensureTable()
    const { page, limit, search, sortBy, sortDir, clienteId, tipoCertidao, lixeira } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIdx = 1

    if (lixeira) {
      conditions.push('c.deleted_at IS NOT NULL')
    } else {
      conditions.push('c.deleted_at IS NULL')
    }

    if (clienteId) { conditions.push(`c.cliente_id = $${paramIdx}`); params.push(clienteId); paramIdx++ }
    if (tipoCertidao === '__nao_emitida__') {
      conditions.push(`c.sucesso = false AND c.etapa = 'concluido'`)
    } else if (tipoCertidao === '__vencidas__') {
      conditions.push(`c.sucesso = true AND c.data_validade IS NOT NULL AND c.data_validade < NOW()`)
    } else if (tipoCertidao === '__vencendo__') {
      conditions.push(`c.sucesso = true AND c.data_validade IS NOT NULL AND c.data_validade >= NOW() AND c.data_validade <= NOW() + INTERVAL '15 days'`)
    } else if (tipoCertidao) {
      conditions.push(`c.tipo_certidao = $${paramIdx}`); params.push(tipoCertidao); paramIdx++
    }
    if (search) {
      conditions.push(`(c.documento ILIKE $${paramIdx} OR c.razao_social ILIKE $${paramIdx} OR c.codigo_controle ILIKE $${paramIdx})`)
      params.push(`%${search}%`); paramIdx++
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderCol = sortBy === 'razaoSocial' ? 'c.razao_social' : sortBy === 'documento' ? 'c.documento' : sortBy === 'tipoCertidao' ? 'c.tipo_certidao' : sortBy === 'dataValidade' ? 'c.data_validade' : 'c.created_at'
    const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC'

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM certidoes_cnd c ${where}`, ...params,
    )
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT c.* FROM certidoes_cnd c ${where}
       ORDER BY ${orderCol} ${orderDir} NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params, take, skip,
    )

    return buildPaginatedResponse(
      rows.map(r => this.formatarRegistro(r)),
      total,
      page,
      limit,
    )
  }

  // ── CRUD ─────────────────────────────────────────────

  async getById(id: string) {
    await this.ensureTable()
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM certidoes_cnd WHERE id = $1`, id,
    )
    if (!rows.length) throw new Error('Registro nao encontrado')
    return this.formatarRegistro(rows[0]!)
  }

  async getPdf(id: string): Promise<string | null> {
    await this.ensureTable()
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cnd WHERE id = $1`, id,
    )
    return rows[0]?.pdf_base64 || null
  }

  async softDelete(id: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE certidoes_cnd SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, id,
    )
    return { success: true }
  }

  async restore(id: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE certidoes_cnd SET deleted_at = NULL, updated_at = NOW() WHERE id = $1`, id,
    )
    return { success: true }
  }

  async hardDelete(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd WHERE id = $1`, id)
    return { success: true }
  }

  // ── Helpers internos ─────────────────────────────────

  private async getRegistroById(id: string): Promise<Record<string, unknown>> {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM certidoes_cnd WHERE id = $1`, id,
    )
    if (!rows.length) throw new Error('Registro nao encontrado')
    return rows[0]!
  }

  private formatarRegistro(row: Record<string, unknown>) {
    return {
      id: row.id as string,
      documento: row.documento as string,
      tipoDocumento: row.tipo_documento as number,
      razaoSocial: row.razao_social as string | null,
      etapa: row.etapa as string,
      tipoCertidao: row.tipo_certidao as string | null,
      codigoControle: row.codigo_controle as string | null,
      dataEmissao: row.data_emissao ? (row.data_emissao instanceof Date ? row.data_emissao.toISOString() : String(row.data_emissao)) : null,
      dataValidade: row.data_validade ? (row.data_validade instanceof Date ? row.data_validade.toISOString() : String(row.data_validade)) : null,
      temPdf: !!row.pdf_base64,
      statusApi: row.status_api as number | null,
      mensagemApi: row.mensagem_api as string | null,
      sucesso: row.sucesso as boolean,
      erro: row.erro as string | null,
      clienteId: row.cliente_id as string | null,
      empresaId: row.empresa_id as string | null,
      userId: row.user_id as string | null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || ''),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at || ''),
      deletedAt: row.deleted_at ? (row.deleted_at instanceof Date ? row.deleted_at.toISOString() : String(row.deleted_at)) : null,
    }
  }

  // ── Clientes mensais (para scheduler) ────────────────

  async listarClientesMensais() {
    return prisma.cliente.findMany({
      where: { deletedAt: null, situacao: 'MENSAL' },
      select: { id: true, razaoSocial: true, documento: true, tipoDocumento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  // ── Resolver empresaId fallback ──────────────────────

  async resolverEmpresaId(): Promise<string> {
    const emp = await prisma.empresa.findFirst({ select: { id: true } })
    return emp?.id || ''
  }
}
