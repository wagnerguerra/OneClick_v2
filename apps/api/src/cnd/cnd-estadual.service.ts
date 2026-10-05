import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CaptchaService } from '../common/captcha.service'
import { cndLogger, limparDoc, PorEmpresa, precisaReconsultar } from './cnd-comum'

const SEFAZ_ES_URL = 'https://s2-internet.sefaz.es.gov.br/certidao/emitir-certidao-internet'
const SEFAZ_ES_PAGE = 'https://s2-internet.sefaz.es.gov.br/certidao/cnd'
const TURNSTILE_SITEKEY = '0x4AAAAAAB4i1okB7ECebDlO'

/**
 * A CND estadual do ES vale 60 dias a partir da emissão. A tabela não tem
 * coluna de validade (e a resposta da SEFAZ não a traz fora do PDF), então o
 * lote usa a regra "sem validade" de `precisaReconsultar`: reemite quando a
 * última emissão bem-sucedida passa de 60 − 15 (folga) = 45 dias.
 */
const DIAS_SEM_VALIDADE_ES = 45

const logger = cndLogger('CndEstadual')
/** Só os 4 últimos caracteres do documento vão para o log (LGPD). */
const fimDoc = (doc: string) => `…${doc.slice(-4)}`

export interface CndEstadualLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  /** Pulados por já terem certidão ainda válida (economia de captcha pago). */
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando' | 'pulada'; erro?: string }>
}

export interface CndEstadualResult {
  sucesso: boolean
  pdfBase64: string | null
  mensagem: string
}

const loteVazio = (): CndEstadualLoteProgress => ({
  status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, pulados: 0,
  currentCliente: '', items: [],
})

@Injectable()
export class CndEstadualService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  // Um lote por EMPRESA: antes o progresso era único e um escritório via (e
  // bloqueava) o lote do outro.
  private readonly loteProgress = new PorEmpresa<CndEstadualLoteProgress>(loteVazio)

  getLoteProgress(empresaId: string): CndEstadualLoteProgress {
    const p = this.loteProgress.get(empresaId)
    return { ...p, items: [...p.items] }
  }

  /** Cliente da MESMA empresa — pelo id informado ou pelo documento. */
  private async resolverCliente(empresaId: string, doc: string, clienteId?: string): Promise<{ clienteId: string | null; razaoSocial: string | null }> {
    if (clienteId) {
      // findFirst com empresaId: um id de cliente de outra empresa não é vinculado.
      const cli = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId }, select: { razaoSocial: true } })
      return cli ? { clienteId, razaoSocial: cli.razaoSocial } : { clienteId: null, razaoSocial: null }
    }
    // Compara só letras e dígitos (CNPJ alfanumérico), com ou sem máscara gravada.
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
      `SELECT id, razao_social FROM clientes
        WHERE empresa_id = $1 AND status = 'ATIVO'
          AND regexp_replace(upper(documento), '[^0-9A-Z]', '', 'g') = $2
        LIMIT 1`,
      empresaId, doc,
    )
    return rows[0] ? { clienteId: rows[0].id, razaoSocial: rows[0].razao_social } : { clienteId: null, razaoSocial: null }
  }

  /**
   * Grava o resultado sem perder certidão válida:
   * - sucesso: insere a nova e apaga as anteriores do documento (na empresa), em transação;
   * - falha com certidão bem-sucedida anterior: não toca em nada (devolve só a falha);
   * - falha sem nenhuma bem-sucedida: substitui as falhas anteriores, para aparecer na tela.
   * Devolve se gravou.
   */
  private async gravar(empresaId: string, doc: string, dados: { razaoSocial: string | null; sucesso: boolean; mensagem: string; pdfBase64: string | null; clienteId: string | null; userId: string | null }): Promise<boolean> {
    const insert = () => prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cnd_estadual (documento, razao_social, uf, sucesso, mensagem, pdf_base64, cliente_id, user_id, empresa_id)
       VALUES ($1, $2, 'ES', $3, $4, $5, $6, $7, $8)`,
      doc, dados.razaoSocial, dados.sucesso, dados.mensagem, dados.pdfBase64, dados.clienteId, dados.userId, empresaId,
    )
    if (dados.sucesso) {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_estadual WHERE empresa_id = $1 AND documento = $2`, empresaId, doc),
        insert(),
      ])
      return true
    }
    const validas = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM certidoes_cnd_estadual WHERE empresa_id = $1 AND documento = $2 AND sucesso = true LIMIT 1`, empresaId, doc,
    )
    if (validas.length > 0) {
      logger.warn(`Falha na consulta de ${fimDoc(doc)} — certidão anterior válida mantida: ${dados.mensagem}`)
      return false
    }
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_estadual WHERE empresa_id = $1 AND documento = $2 AND sucesso = false`, empresaId, doc),
      insert(),
    ])
    return true
  }

  async consultar(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CndEstadualResult> {
    const doc = limparDoc(documento)
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido (CPF ou CNPJ)')

    logger.log(`Iniciando consulta para ${fimDoc(doc)} — resolvendo Turnstile...`)
    const captchaToken = await this.captcha.resolveTurnstile(TURNSTILE_SITEKEY, SEFAZ_ES_PAGE)

    const res = await fetch(SEFAZ_ES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json',
        'Referer': SEFAZ_ES_PAGE,
        'Origin': 'https://s2-internet.sefaz.es.gov.br',
      },
      body: new URLSearchParams({ numIdentificacao: doc, captcha: captchaToken }).toString(),
    })

    let sucesso = false
    let pdfBase64: string | null = null
    let mensagem: string
    if (!res.ok) {
      // Portal fora/instável devolve HTML de erro — res.json() estouraria com
      // uma mensagem incompreensível para o usuário.
      mensagem = `SEFAZ-ES indisponível (HTTP ${res.status}). Tente novamente mais tarde.`
    } else {
      type RespostaSefaz = { success?: boolean; error?: boolean; message?: string; data?: { blbCertidao?: string } }
      const data = await res.json().then(j => j as RespostaSefaz | null).catch(() => null)
      if (!data) {
        mensagem = 'Resposta inesperada da SEFAZ-ES (não veio no formato esperado).'
      } else {
        sucesso = !!data.success && !!data.data?.blbCertidao
        pdfBase64 = sucesso ? (data.data?.blbCertidao ?? null) : null
        mensagem = data.message || (sucesso ? 'Certidão emitida com sucesso' : 'Não foi possível emitir a certidão')
      }
    }

    logger.log(`Resultado ${fimDoc(doc)}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

    const cli = await this.resolverCliente(empresaId, doc, clienteId)
    const gravado = await this.gravar(empresaId, doc, {
      razaoSocial: cli.razaoSocial, sucesso, mensagem, pdfBase64, clienteId: cli.clienteId, userId: userId ?? null,
    })
    if (!sucesso && !gravado) mensagem = `${mensagem} (a certidão anterior, ainda válida, foi mantida)`

    return { sucesso, pdfBase64, mensagem }
  }

  async consultarLote(
    empresaId: string,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId?: string,
    forcarNova = false,
  ): Promise<{ message: string }> {
    if (this.loteProgress.get(empresaId).status === 'running') throw new Error('Consulta em lote já em andamento.')

    const progresso: CndEstadualLoteProgress = {
      ...loteVazio(),
      status: 'running', total: documentos.length, currentCliente: 'Iniciando...',
      items: documentos.map(d => ({ razaoSocial: d.razaoSocial || d.documento, status: 'pendente' as const })),
    }
    this.loteProgress.set(empresaId, progresso)

    // Segundo plano: o erro inesperado é logado e o lote sempre termina como 'done'.
    this.runLote(empresaId, progresso, documentos, userId, forcarNova)
      .catch(e => {
        logger.error(`Lote interrompido: ${(e as Error).message}`)
        progresso.currentCliente = `Erro: ${(e as Error).message}`
      })
      .finally(() => {
        progresso.status = 'done'
        if (!progresso.currentCliente.startsWith('Erro')) progresso.currentCliente = 'Concluído'
      })

    return { message: 'Consulta em lote iniciada' }
  }

  private async runLote(
    empresaId: string,
    progresso: CndEstadualLoteProgress,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId: string | undefined,
    forcarNova: boolean,
  ) {
    for (let i = 0; i < documentos.length; i++) {
      const item = documentos[i]!
      const doc = limparDoc(item.documento)
      const nome = item.razaoSocial || doc

      progresso.current = i + 1
      progresso.currentCliente = nome
      progresso.items[i] = { razaoSocial: nome, status: 'processando' }

      try {
        // Cada reemissão custa um Turnstile pago: certidão ainda folgada não é reemitida.
        if (!forcarNova) {
          const ultima = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; created_at: Date }>>(
            `SELECT sucesso, created_at FROM certidoes_cnd_estadual WHERE empresa_id = $1 AND documento = $2 ORDER BY created_at DESC LIMIT 1`,
            empresaId, doc,
          )
          const u = ultima[0]
          if (u && !precisaReconsultar({ sucesso: u.sucesso, criadoEm: u.created_at }, { semValidadeDias: DIAS_SEM_VALIDADE_ES })) {
            progresso.pulados++
            progresso.items[i] = { razaoSocial: nome, status: 'pulada', erro: 'Certidão ainda válida — não reemitida' }
            continue
          }
        }

        const result = await this.consultar(empresaId, doc, item.clienteId, userId)
        if (result.sucesso) {
          progresso.emitidas++
          progresso.items[i] = { razaoSocial: nome, status: 'emitida' }
        } else {
          progresso.naoEmitidas++
          progresso.items[i] = { razaoSocial: nome, status: 'nao_emitida', erro: result.mensagem }
        }
      } catch (e) {
        progresso.erros++
        progresso.items[i] = { razaoSocial: nome, status: 'erro', erro: (e as Error).message }
        logger.warn(`Lote: erro em ${fimDoc(doc)}: ${(e as Error).message}`)
      }

      // Intervalo entre consultas para não sobrecarregar o portal.
      if (i < documentos.length - 1) {
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }

  async list(empresaId: string, input: { page: number; limit: number; search?: string }) {
    const { page, limit, search } = input
    const offset = (page - 1) * limit

    const conditions: string[] = ['empresa_id = $1']
    const params: unknown[] = [empresaId]
    let paramIdx = 2

    if (search) {
      conditions.push(`(documento ILIKE $${paramIdx} OR razao_social ILIKE $${paramIdx})`)
      params.push(`%${search}%`); paramIdx++
    }

    const where = `WHERE ${conditions.join(' AND ')}`

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

  async getPdf(empresaId: string, id: string): Promise<string | null> {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cnd_estadual WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    return rows[0]?.pdf_base64 ?? null
  }

  async totalizadores(empresaId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true)::int as emitidas,
        COUNT(*) FILTER (WHERE sucesso = false)::int as nao_emitidas
      FROM certidoes_cnd_estadual
      WHERE empresa_id = $1
    `, empresaId)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      emitidas: Number(r.emitidas ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0),
    }
  }

  async deleteEstadual(empresaId: string, id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_estadual WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    return { ok: true }
  }

  async deleteLote(empresaId: string, ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM certidoes_cnd_estadual WHERE empresa_id = $1 AND id IN (${placeholders})`, empresaId, ...ids,
    )
    return { deleted }
  }
}
