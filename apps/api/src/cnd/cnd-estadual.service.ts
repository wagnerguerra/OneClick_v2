import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CaptchaService } from '../common/captcha.service'

const SEFAZ_ES_URL = 'https://s2-internet.sefaz.es.gov.br/certidao/emitir-certidao-internet'
const SEFAZ_ES_PAGE = 'https://s2-internet.sefaz.es.gov.br/certidao/cnd'
const TURNSTILE_SITEKEY = '0x4AAAAAAB4i1okB7ECebDlO'

export interface CndEstadualLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando'; erro?: string }>
}

export interface CndEstadualResult {
  sucesso: boolean
  pdfBase64: string | null
  mensagem: string
}

@Injectable()
export class CndEstadualService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  private loteProgress: CndEstadualLoteProgress = {
    status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
    currentCliente: '', items: [],
  }

  getLoteProgress(): CndEstadualLoteProgress {
    return { ...this.loteProgress }
  }

  private tableChecked = false
  private async ensureTable() {
    if (this.tableChecked) return
    try {
      const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'certidoes_cnd_estadual')`,
      )
      if (exists[0]?.exists) { this.tableChecked = true; return }
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS certidoes_cnd_estadual (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          documento TEXT NOT NULL,
          razao_social TEXT,
          uf TEXT NOT NULL DEFAULT 'ES',
          sucesso BOOLEAN NOT NULL DEFAULT false,
          mensagem TEXT,
          pdf_base64 TEXT,
          cliente_id TEXT,
          empresa_id TEXT,
          user_id TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_cnd_est_documento ON certidoes_cnd_estadual (documento)`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_cnd_est_created ON certidoes_cnd_estadual (created_at DESC)`)
    } catch (e) {
      if (!(e as Error).message?.includes('already exists')) throw e
    }
    this.tableChecked = true
  }

  async consultar(documento: string, clienteId?: string, userId?: string): Promise<CndEstadualResult> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido (CPF ou CNPJ)')

    console.log(`[CND-ES] Iniciando consulta para ${doc}...`)

    // Resolver captcha via 2Captcha
    console.log(`[CND-ES] Resolvendo captcha Turnstile...`)
    const captchaToken = await this.captcha.resolveTurnstile(TURNSTILE_SITEKEY, SEFAZ_ES_PAGE)

    // Consultar SEFAZ ES
    console.log(`[CND-ES] Captcha resolvido, consultando SEFAZ ES...`)
    const res = await fetch(SEFAZ_ES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
        'Referer': SEFAZ_ES_PAGE,
        'Origin': 'https://s2-internet.sefaz.es.gov.br',
      },
      body: `numIdentificacao=${doc}&captcha=${encodeURIComponent(captchaToken)}`,
    })

    const data = await res.json() as { success?: boolean; error?: boolean; message?: string; data?: { blbCertidao?: string } }

    const sucesso = !!data.success && !!data.data?.blbCertidao
    const pdfBase64 = data.data?.blbCertidao || null
    const mensagem = data.message || (sucesso ? 'Certidão emitida com sucesso' : 'Não foi possível emitir a certidão')

    console.log(`[CND-ES] Resultado: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

    // Buscar razão social e clienteId pelo documento
    let razaoSocial: string | null = null
    let resolvedClienteId = clienteId || null
    if (clienteId) {
      const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } })
      razaoSocial = cli?.razaoSocial ?? null
    } else {
      // Buscar pelo documento (CNPJ/CPF) — match exato com ou sem formatação
      const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
        `SELECT id, razao_social FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`,
        doc,
      ).then(rows => rows[0] ? { id: rows[0].id, razaoSocial: rows[0].razao_social } : null)
      if (cli) {
        razaoSocial = cli.razaoSocial
        resolvedClienteId = cli.id
      }
    }

    // Remover consultas anteriores do mesmo documento e manter apenas a mais recente
    await prisma.$executeRawUnsafe(
      `DELETE FROM certidoes_cnd_estadual WHERE documento = $1`, doc,
    )

    // Salvar no banco
    await prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cnd_estadual (documento, razao_social, uf, sucesso, mensagem, pdf_base64, cliente_id, user_id)
       VALUES ($1, $2, 'ES', $3, $4, $5, $6, $7)`,
      doc, razaoSocial, sucesso, mensagem, pdfBase64, resolvedClienteId, userId || null,
    )

    return { sucesso, pdfBase64, mensagem }
  }

  async consultarLote(documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>, userId?: string): Promise<{ message: string }> {
    if (this.loteProgress.status === 'running') throw new Error('Consulta em lote já em andamento.')

    this.loteProgress = {
      status: 'running', total: documentos.length, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
      currentCliente: 'Iniciando...', items: documentos.map(d => ({ razaoSocial: d.razaoSocial || d.documento, status: 'pendente' as const })),
    }

    // Executar em background
    this.runLote(documentos, userId).catch(e => {
      console.error('[CND-ES Lote] Erro:', (e as Error).message)
      this.loteProgress.status = 'done'
      this.loteProgress.currentCliente = `Erro: ${(e as Error).message}`
    })

    return { message: 'Consulta em lote iniciada' }
  }

  private async runLote(documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>, userId?: string) {
    for (let i = 0; i < documentos.length; i++) {
      const item = documentos[i]!
      const doc = item.documento.replace(/\D/g, '')
      const nome = item.razaoSocial || doc

      this.loteProgress.current = i + 1
      this.loteProgress.currentCliente = nome
      this.loteProgress.items[i] = { razaoSocial: nome, status: 'processando' }

      try {
        const result = await this.consultar(doc, item.clienteId, userId)
        if (result.sucesso) {
          this.loteProgress.emitidas++
          this.loteProgress.items[i] = { razaoSocial: nome, status: 'emitida' }
        } else {
          this.loteProgress.naoEmitidas++
          this.loteProgress.items[i] = { razaoSocial: nome, status: 'nao_emitida', erro: result.mensagem }
        }
      } catch (e) {
        this.loteProgress.erros++
        this.loteProgress.items[i] = { razaoSocial: nome, status: 'erro', erro: (e as Error).message }
      }

      // Delay entre consultas
      if (i < documentos.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }

    this.loteProgress.status = 'done'
    this.loteProgress.currentCliente = 'Concluído'
  }

  async list(input: { page: number; limit: number; search?: string }) {
    await this.ensureTable()
    const { page, limit, search } = input
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const params: unknown[] = []
    let paramIdx = 1

    if (search) {
      conditions.push(`(documento ILIKE $${paramIdx} OR razao_social ILIKE $${paramIdx})`)
      params.push(`%${search}%`); paramIdx++
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM certidoes_cnd_estadual ${where}`, ...params,
    )
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM certidoes_cnd_estadual ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        documento: r.documento as string,
        razaoSocial: r.razao_social as string | null,
        uf: r.uf as string,
        sucesso: r.sucesso as boolean,
        mensagem: r.mensagem as string | null,
        temPdf: !!(r.pdf_base64),
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async getPdf(id: string): Promise<string | null> {
    await this.ensureTable()
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cnd_estadual WHERE id = $1`, id,
    )
    return rows[0]?.pdf_base64 ?? null
  }

  async totalizadores() {
    await this.ensureTable()
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true)::int as emitidas,
        COUNT(*) FILTER (WHERE sucesso = false)::int as nao_emitidas
      FROM certidoes_cnd_estadual
    `)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      emitidas: Number(r.emitidas ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0),
    }
  }

  async deleteEstadual(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_estadual WHERE id = $1`, id)
    return { ok: true }
  }

  async deleteLote(ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_estadual WHERE id IN (${placeholders})`, ...ids)
    return { deleted: ids.length }
  }
}
