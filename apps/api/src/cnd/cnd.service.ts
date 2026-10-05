import { Injectable } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { semSegredos } from '../common/segredos'
import {
  cndLogger, exigirEmpresa, limparDoc, PorEmpresa, progressoVazio, precisaReconsultar, dataIso,
  type ProgressoLote,
} from './cnd-comum'

// ============================================================
// Configuracao
// ============================================================

const SERPRO_GATEWAY = 'gateway.apiserpro.serpro.gov.br'
const CND_PATH = '/consulta-cnd/v1/certidao'
const TOKEN_PATH = '/token'
const REQUEST_TIMEOUT = 60000
const CACHE_HOURS = 24
/** Folga do lote: a CND federal vale 180 dias; só reemite quando faltam 15 ou menos. */
const FOLGA_LOTE_DIAS = 15

const logger = cndLogger('Federal')

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
    TipoCertidao: number // 1=Negativa, 2=Positiva com efeitos de Negativa, 3=Positiva
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

/**
 * Rótulos do TipoCertidao do SERPRO. Os textos de 1 e 2 são os que já estão
 * gravados e filtrados pela tela/totalizadores — não mudar a grafia.
 * O 3 (Positiva) antes caía em "Tipo 3": é certidão emitida, mas com débito.
 */
const TIPO_CERTIDAO_LABELS: Record<number, string> = {
  1: 'Negativa',
  2: 'Positiva com Efeitos de Negativa',
  3: 'Positiva',
}

/** Só os 4 últimos caracteres do documento vão ao log (LGPD). */
const fimDoc = (doc: string) => `…${doc.slice(-4)}`

/**
 * `data_validade` é TIMESTAMPTZ nesta tabela. A data pura "YYYY-MM-DD" vira
 * meio-dia de Brasília: assim `::date` dá o mesmo dia em qualquer fuso de
 * sessão (UTC ou -03), e a certidão não "vence um dia antes" por causa da
 * meia-noite UTC.
 */
function meioDiaBrasilia(raw: string | null | undefined): string | null {
  const d = dataIso(raw)
  return d ? `${d}T12:00:00-03:00` : null
}

/** Emissão: se vier com hora, mantém o instante; se vier só a data, meio-dia de Brasília. */
function instanteEmissao(raw: string | null | undefined): string | null {
  if (!raw) return null
  if (/\d{1,2}:\d{2}/.test(raw)) {
    const t = new Date(raw)
    if (!Number.isNaN(t.getTime())) return t.toISOString()
  }
  return meioDiaBrasilia(raw)
}

/**
 * Normalização do documento do cadastro de clientes no SQL — mesma regra do
 * `limparDoc` (mantém letras: CNPJ alfanumérico). O antigo REPLACE de '.', '/'
 * e '-' deixava passar espaço e não casava caixa.
 */
const SQL_DOC_CLIENTE = `UPPER(REGEXP_REPLACE(documento, '[^0-9A-Za-z]', '', 'g'))`

const novoId = () => `cnd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

export interface RegistroCnd {
  id: string
  documento: string
  tipoDocumento: number
  razaoSocial: string | null
  etapa: string
  tipoCertidao: string | null
  codigoControle: string | null
  dataEmissao: string | null
  dataValidade: string | null
  temPdf: boolean
  statusApi: number | null
  mensagemApi: string | null
  sucesso: boolean
  erro: string | null
  clienteId: string | null
  empresaId: string | null
  userId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
export type ResultadoConsultaCnd = RegistroCnd & {
  fromCache: boolean
  /** true quando a nova consulta falhou e a certidão válida anterior foi mantida. */
  consultaFalhou?: boolean
  /** Motivo da falha da nova consulta (só com `consultaFalhou`). */
  mensagemFalha?: string
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class CndService {
  private tokenCache: { accessToken: string; expiresAt: number } | null = null

  /**
   * Progresso do lote em segundo plano, por empresa. Antes o lote rodava até
   * 500 documentos DENTRO da mutation (requisição presa por horas, sem
   * progresso); agora a mutation só dispara e a tela acompanha por aqui.
   */
  private readonly loteProgress = new PorEmpresa<ProgressoLote>(progressoVazio)

  // ── Configuracao ──────────────────────────────────────

  private async getConfig() {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA', 'CNPJ_CONTRATANTE'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    const consumerKey = map.get('CONSUMER_KEY') || process.env.CONSUMER_KEY || ''
    const consumerSecret = map.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET || ''
    const certSenha = map.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA || ''

    if (!consumerKey || !consumerSecret) throw new Error('Consumer Key/Secret não configurados. Acesse Configurações > Certificado Digital.')

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
      throw new Error(`Falha na autenticação SERPRO: HTTP ${res.status} - ${semSegredos(res.data.slice(0, 200))}`)
    }

    const data = JSON.parse(res.data) as { access_token: string; expires_in?: number }
    const expiresIn = data.expires_in || 3600
    this.tokenCache = { accessToken: data.access_token, expiresAt: Date.now() + expiresIn * 1000 }

    return data.access_token
  }

  // ── Consulta CND API ─────────────────────────────────

  /** Convenção do SERPRO: TipoContribuinte 1 = CNPJ, 2 = CPF, 3 = NIRF/CIB. */
  private async consultarApi(documento: string, tipoContribuinte: number, gerarPdf = true, chave?: string): Promise<CndApiResponse> {
    const token = await this.obterToken()
    const codId = tipoContribuinte === 1 ? '9001' : tipoContribuinte === 2 ? '9002' : '9003'

    const body = JSON.stringify({
      TipoContribuinte: tipoContribuinte,
      ContribuinteConsulta: limparDoc(documento),
      CodigoIdentificacao: codId,
      GerarCertidaoPdf: gerarPdf,
      ...(chave ? { Chave: chave } : {}),
    })

    const enviar = (bearer: string) => httpsRequest({
      hostname: SERPRO_GATEWAY,
      port: 443,
      path: CND_PATH,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearer}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      rejectUnauthorized: true,
    }, body)

    let res = await enviar(token)
    // Token expirado — renovar e tentar novamente
    if (res.status === 401) res = await enviar(await this.obterToken(true))

    try {
      return JSON.parse(res.data) as CndApiResponse
    } catch {
      throw new Error(`Resposta inválida do SERPRO (HTTP ${res.status}): ${semSegredos(res.data.slice(0, 200))}`)
    }
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

  // ── Verificar cache ──────────────────────────────────

  async verificarCache(empresaId: string, documento: string): Promise<{ temCache: boolean; registro?: Record<string, unknown> }> {
    exigirEmpresa(empresaId)
    const doc = limparDoc(documento)
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM certidoes_cnd
       WHERE empresa_id = $1 AND documento = $2 AND deleted_at IS NULL AND sucesso = true
       AND created_at > NOW() - INTERVAL '${CACHE_HOURS} hours'
       ORDER BY created_at DESC LIMIT 1`,
      empresaId, doc,
    )
    if (rows.length > 0) return { temCache: true, registro: rows[0] }
    return { temCache: false }
  }

  /** Última certidão bem-sucedida (não excluída) do documento nesta empresa. */
  private async ultimaValida(empresaId: string, doc: string): Promise<Record<string, unknown> | null> {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM certidoes_cnd
       WHERE empresa_id = $1 AND documento = $2 AND sucesso = true AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      empresaId, doc,
    )
    return rows[0] ?? null
  }

  /**
   * O lote deve consultar este documento? Não, se a última certidão
   * bem-sucedida ainda vale por mais de 15 dias — cada reemissão é uma
   * consulta paga ao SERPRO. Usado pelo lote e pelo agendador.
   */
  async precisaConsultar(empresaId: string, documento: string): Promise<boolean> {
    const ultima = await this.ultimaValida(exigirEmpresa(empresaId), limparDoc(documento))
    if (!ultima) return true
    return precisaReconsultar(
      { sucesso: true, dataValidade: ultima.data_validade as Date | null, criadoEm: ultima.created_at as Date | null },
      { folgaDias: FOLGA_LOTE_DIAS, semValidadeDias: FOLGA_LOTE_DIAS },
    )
  }

  // ── Consultar (principal) ────────────────────────────

  /**
   * Consulta individual. Consulta quando pedido (o cache de 24h só evita o
   * clique duplo; `forcarNova` passa por cima dele).
   *
   * Falha não apaga certidão válida: se a nova consulta falhar e já houver uma
   * bem-sucedida deste documento na empresa, ela é mantida e devolvida com
   * `consultaFalhou: true` + `mensagemFalha`. Sem anterior válida, a falha é
   * gravada (substituindo falhas antigas) para aparecer na tela; "não emitida"
   * (Status 3/4) devolve o registro, demais erros lançam — como antes.
   */
  async consultar(
    empresaId: string,
    documento: string,
    tipoDocumento: number,
    opts?: { clienteId?: string; userId?: string; forcarNova?: boolean },
  ): Promise<ResultadoConsultaCnd> {
    exigirEmpresa(empresaId)
    const doc = limparDoc(documento)
    if (!doc) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Documento inválido.' })

    // Verificar cache (24h) se nao forcar nova
    if (!opts?.forcarNova) {
      const cache = await this.verificarCache(empresaId, doc)
      if (cache.temCache && cache.registro) {
        return { fromCache: true, ...this.formatarRegistro(cache.registro) }
      }
    }

    // Razão social: só de cliente DESTA empresa (o mesmo CNPJ pode existir em outro tenant)
    let razaoSocial: string | null = null
    let clienteId: string | null = null
    if (opts?.clienteId) {
      const cli = await prisma.cliente.findFirst({ where: { id: opts.clienteId, empresaId }, select: { id: true, razaoSocial: true } })
      razaoSocial = cli?.razaoSocial || null
      clienteId = cli?.id || null
    } else {
      const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
        `SELECT id, razao_social FROM clientes WHERE status = 'ATIVO' AND empresa_id = $1
         AND ${SQL_DOC_CLIENTE} = $2 LIMIT 1`, empresaId, doc,
      )
      razaoSocial = cli[0]?.razao_social || null
      clienteId = cli[0]?.id || null
    }

    let result: CndApiResponse | null = null
    let erroChamada: string | null = null
    try {
      result = await this.consultarComRetry(doc, tipoDocumento)
    } catch (e) {
      erroChamada = semSegredos((e as Error).message)
    }

    const id = novoId()
    const userId = opts?.userId || null

    // ── Sucesso: grava a nova e só ENTÃO apaga as anteriores (mesma empresa), em transação
    if (result && (result.Status === 1 || result.Status === 2) && result.Certidao) {
      const cert = result.Certidao
      const tipoCertidao = TIPO_CERTIDAO_LABELS[cert.TipoCertidao] ?? null
      // Tipo desconhecido: não inventa classificação — a certidão foi emitida
      // (tem PDF e código), mas a tela precisa saber que não deu para classificar.
      const mensagem = tipoCertidao
        ? result.Mensagem
        : `${result.Mensagem || 'Certidão emitida'} — não foi possível classificar o tipo da certidão (TipoCertidao ${cert.TipoCertidao}); confira o PDF.`

      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `INSERT INTO certidoes_cnd (id, documento, tipo_documento, razao_social, etapa, sucesso,
             tipo_certidao, codigo_controle, data_emissao, data_validade, pdf_base64,
             status_api, mensagem_api, resposta_completa, cliente_id, empresa_id, user_id)
           VALUES ($1, $2, $3, $4, 'concluido', true,
             $5, $6, $7::timestamptz, $8::timestamptz, $9,
             $10, $11, $12::jsonb, $13, $14, $15)`,
          id, doc, tipoDocumento, razaoSocial,
          tipoCertidao, cert.CodigoControle || null,
          instanteEmissao(cert.DataEmissao), meioDiaBrasilia(cert.DataValidade), cert.DocumentoPdf || null,
          result.Status, mensagem, JSON.stringify(result), clienteId, empresaId, userId,
        ),
        prisma.$executeRawUnsafe(
          `DELETE FROM certidoes_cnd WHERE empresa_id = $1 AND documento = $2 AND id <> $3 AND deleted_at IS NULL`,
          empresaId, doc, id,
        ),
      ])

      return { fromCache: false, ...this.formatarRegistro(await this.getRegistroById(empresaId, id)) }
    }

    // ── Falha (não emitida, erro do SERPRO ou falha de rede)
    const naoEmitida = !!result && (result.Status === 3 || result.Status === 4)
    const erroMsg = erroChamada ?? (result?.Mensagem || `Status ${result?.Status ?? '?'}`)

    const anterior = await this.ultimaValida(empresaId, doc)
    if (anterior) {
      logger.warn(`Consulta de ${fimDoc(doc)} falhou (${erroMsg}); certidão válida anterior mantida.`)
      return { fromCache: false, ...this.formatarRegistro(anterior), consultaFalhou: true, mensagemFalha: erroMsg }
    }

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `INSERT INTO certidoes_cnd (id, documento, tipo_documento, razao_social, etapa, sucesso,
           status_api, mensagem_api, erro, resposta_completa, cliente_id, empresa_id, user_id)
         VALUES ($1, $2, $3, $4, $5, false, $6, $7, $7, $8::jsonb, $9, $10, $11)`,
        id, doc, tipoDocumento, razaoSocial, naoEmitida ? 'concluido' : 'erro',
        result?.Status ?? null, erroMsg, result ? JSON.stringify(result) : null,
        clienteId, empresaId, userId,
      ),
      // Sem certidão válida para proteger: a falha substitui as falhas antigas.
      prisma.$executeRawUnsafe(
        `DELETE FROM certidoes_cnd WHERE empresa_id = $1 AND documento = $2 AND id <> $3 AND deleted_at IS NULL AND sucesso = false`,
        empresaId, doc, id,
      ),
    ])

    if (!naoEmitida) {
      logger.warn(`Consulta de ${fimDoc(doc)} falhou: ${erroMsg}`)
      throw new Error(erroMsg)
    }
    return { fromCache: false, ...this.formatarRegistro(await this.getRegistroById(empresaId, id)) }
  }

  // ── Log de execucao ───────────────────────────────────

  async listarExecLogs(empresaId: string, limit = 20, offset = 0) {
    exigirEmpresa(empresaId)
    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int as total FROM cnd_exec_log WHERE empresa_id = $1`, empresaId,
    )
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, tipo, iniciado_por, nome_usuario, iniciado_em, finalizado_em,
              total, sucesso, falhas, status, itens::text
       FROM cnd_exec_log WHERE empresa_id = $1 ORDER BY iniciado_em DESC LIMIT $2 OFFSET $3`,
      empresaId, limit, offset,
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

  // ── Consulta em lote (segundo plano) ─────────────────

  /** Progresso do lote desta empresa (cópia — a tela não mexe no estado). */
  progressoLote(empresaId: string): ProgressoLote {
    const p = this.loteProgress.get(exigirEmpresa(empresaId))
    return { ...p, erros: [...p.erros] }
  }

  /**
   * Dispara o lote em segundo plano e devolve na hora. Um lote por empresa.
   * Documento com certidão ainda válida (mais de 15 dias) é pulado, salvo
   * `forcarNova`. Erro de um documento não derruba o lote.
   */
  async consultarLote(empresaId: string, documentos: string[], userId?: string, forcarNova = false): Promise<{ message: string; total: number }> {
    exigirEmpresa(empresaId)
    const atual = this.loteProgress.get(empresaId)
    if (atual.running) throw new TRPCError({ code: 'CONFLICT', message: 'Já existe uma consulta em lote em andamento para esta empresa.' })

    const docs = [...new Set(documentos.map(limparDoc).filter(Boolean))]
    // Marca como rodando ANTES de qualquer await: dois cliques não abrem dois lotes.
    const progresso: ProgressoLote = { ...progressoVazio(), running: true, total: docs.length }
    this.loteProgress.set(empresaId, progresso)

    this.executarLote(empresaId, docs, userId, forcarNova, progresso)
      .catch(e => {
        logger.error(`Lote da empresa ${empresaId} interrompido: ${(e as Error).message}`)
        progresso.erros.push(`Erro geral: ${(e as Error).message}`)
      })
      .finally(() => { progresso.running = false; progresso.item = '' })

    return { message: 'Consulta em lote iniciada em segundo plano.', total: docs.length }
  }

  private async executarLote(empresaId: string, docs: string[], userId: string | undefined, forcarNova: boolean, progresso: ProgressoLote) {
    const logId = `cndlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const logItens: Array<{ razaoSocial: string; documento: string; status: string; erro?: string; duracaoMs?: number }> = []
    let logCriado = false

    try {
      // Buscar nome do usuario
      let nomeUsuario: string | null = null
      if (userId) {
        const userRows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
          `SELECT name FROM users WHERE id = $1 LIMIT 1`, userId,
        )
        nomeUsuario = userRows[0]?.name || null
      }

      // Razão social dos documentos — só clientes desta empresa
      const clientesInfo = await prisma.$queryRawUnsafe<Array<{ documento: string; razao_social: string }>>(
        `SELECT ${SQL_DOC_CLIENTE} as documento, razao_social
         FROM clientes WHERE status = 'ATIVO' AND empresa_id = $1
         AND ${SQL_DOC_CLIENTE} = ANY($2::text[])`,
        empresaId, docs,
      )
      const nomeMap: Record<string, string> = {}
      for (const c of clientesInfo) nomeMap[c.documento] = c.razao_social

      await prisma.$executeRawUnsafe(
        `INSERT INTO cnd_exec_log (id, empresa_id, tipo, iniciado_por, nome_usuario, iniciado_em, total, status)
         VALUES ($1, $2, 'manual', $3, $4, NOW(), $5, 'running')`,
        logId, empresaId, userId || null, nomeUsuario, docs.length,
      )
      logCriado = true

      let consultouAlgum = false
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i]!
        const tipo = doc.length === 11 ? 2 : 1 // SERPRO: 1 = CNPJ, 2 = CPF
        const razaoSocial = nomeMap[doc] || doc
        const itemStart = Date.now()
        progresso.atual = i + 1
        progresso.item = razaoSocial

        try {
          if (!forcarNova && !(await this.precisaConsultar(empresaId, doc))) {
            progresso.pulados++
            logItens.push({ razaoSocial, documento: doc, status: 'pulado', duracaoMs: Date.now() - itemStart })
            continue
          }

          // Pausa entre consultas reais ao SERPRO (as puladas não esperam).
          if (consultouAlgum) await sleep(3000)
          consultouAlgum = true

          const r = await this.consultar(empresaId, doc, tipo, { userId, forcarNova })
          if (r.consultaFalhou) throw new Error(r.mensagemFalha || 'Consulta falhou (certidão anterior mantida)')
          if (!r.sucesso) throw new Error(r.erro || r.mensagemApi || 'Certidão não emitida')
          progresso.sucesso++
          logItens.push({ razaoSocial, documento: doc, status: 'ok', duracaoMs: Date.now() - itemStart })
        } catch (e) {
          const erro = (e as Error).message
          progresso.falhas++
          if (progresso.erros.length < 100) progresso.erros.push(`${razaoSocial}: ${erro}`)
          logItens.push({ razaoSocial, documento: doc, status: 'erro', erro, duracaoMs: Date.now() - itemStart })
        }
      }

      await prisma.$executeRawUnsafe(
        `UPDATE cnd_exec_log SET finalizado_em = NOW(), sucesso = $3, falhas = $4, status = 'completed', itens = $5::jsonb
         WHERE id = $1 AND empresa_id = $2`,
        logId, empresaId, progresso.sucesso, progresso.falhas, JSON.stringify(logItens),
      )
      logger.log(`Lote concluído (empresa ${empresaId}): ${progresso.sucesso} ok, ${progresso.falhas} falhas, ${progresso.pulados} pulados de ${docs.length}`)
    } catch (e) {
      if (logCriado) {
        await prisma.$executeRawUnsafe(
          `UPDATE cnd_exec_log SET finalizado_em = NOW(), sucesso = $3, falhas = $4, status = 'error', itens = $5::jsonb
           WHERE id = $1 AND empresa_id = $2`,
          logId, empresaId, progresso.sucesso, progresso.falhas, JSON.stringify(logItens),
        ).catch(() => undefined)
      }
      throw e
    }
  }

  // ── Listagem paginada ────────────────────────────────

  async totalizadores(empresaId: string) {
    exigirEmpresa(empresaId)
    // `deleted_at` fica em cada FILTER (e não no WHERE) para a contagem da
    // lixeira enxergar as excluídas — antes ela saía sempre 0.
    // Vencida/vencendo comparam DATA com DATA (`::date`), sem fuso.
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int as total,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND sucesso = true AND tipo_certidao = 'Negativa')::int as negativas,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND sucesso = true AND tipo_certidao = 'Positiva com Efeitos de Negativa')::int as positivas_efeitos,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND sucesso = true AND tipo_certidao = 'Positiva')::int as positivas,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND sucesso = false AND etapa = 'concluido')::int as nao_emitidas,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND sucesso = true AND data_validade IS NOT NULL AND data_validade::date < CURRENT_DATE)::int as vencidas,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND sucesso = true AND data_validade IS NOT NULL AND data_validade::date >= CURRENT_DATE AND data_validade::date <= CURRENT_DATE + 15)::int as vencendo,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int as lixeira
      FROM certidoes_cnd WHERE empresa_id = $1
    `, empresaId)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      negativas: Number(r.negativas ?? 0),
      positivasEfeitos: Number(r.positivas_efeitos ?? 0),
      positivas: Number(r.positivas ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0),
      vencidas: Number(r.vencidas ?? 0),
      vencendo: Number(r.vencendo ?? 0),
      lixeira: Number(r.lixeira ?? 0),
    }
  }

  async list(empresaId: string, input: { page: number; limit: number; search?: string; sortBy?: string; sortDir?: string; clienteId?: string; tipoCertidao?: string; lixeira?: boolean }) {
    exigirEmpresa(empresaId)
    const { page, limit, search, sortBy, sortDir, clienteId, tipoCertidao, lixeira } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const conditions: string[] = ['c.empresa_id = $1']
    const params: unknown[] = [empresaId]
    let paramIdx = 2

    if (lixeira) {
      conditions.push('c.deleted_at IS NOT NULL')
    } else {
      conditions.push('c.deleted_at IS NULL')
    }

    if (clienteId) { conditions.push(`c.cliente_id = $${paramIdx}`); params.push(clienteId); paramIdx++ }
    if (tipoCertidao === '__nao_emitida__') {
      conditions.push(`c.sucesso = false AND c.etapa = 'concluido'`)
    } else if (tipoCertidao === '__vencidas__') {
      conditions.push(`c.sucesso = true AND c.data_validade IS NOT NULL AND c.data_validade::date < CURRENT_DATE`)
    } else if (tipoCertidao === '__vencendo__') {
      conditions.push(`c.sucesso = true AND c.data_validade IS NOT NULL AND c.data_validade::date >= CURRENT_DATE AND c.data_validade::date <= CURRENT_DATE + 15`)
    } else if (tipoCertidao) {
      conditions.push(`c.tipo_certidao = $${paramIdx}`); params.push(tipoCertidao); paramIdx++
    }
    if (search) {
      conditions.push(`(c.documento ILIKE $${paramIdx} OR c.razao_social ILIKE $${paramIdx} OR c.codigo_controle ILIKE $${paramIdx})`)
      params.push(`%${search}%`); paramIdx++
    }

    const where = `WHERE ${conditions.join(' AND ')}`
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

  async getById(empresaId: string, id: string) {
    return this.formatarRegistro(await this.getRegistroById(exigirEmpresa(empresaId), id))
  }

  async getPdf(empresaId: string, id: string): Promise<string | null> {
    exigirEmpresa(empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cnd WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    return rows[0]?.pdf_base64 || null
  }

  async softDelete(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    const n = await prisma.$executeRawUnsafe(
      `UPDATE certidoes_cnd SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    if (!n) throw new Error('Registro nao encontrado')
    return { success: true }
  }

  async restore(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    const n = await prisma.$executeRawUnsafe(
      `UPDATE certidoes_cnd SET deleted_at = NULL, updated_at = NOW() WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    if (!n) throw new Error('Registro nao encontrado')
    return { success: true }
  }

  async hardDelete(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    const n = await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    if (!n) throw new Error('Registro nao encontrado')
    return { success: true }
  }

  // ── Helpers internos ─────────────────────────────────

  private async getRegistroById(empresaId: string, id: string): Promise<Record<string, unknown>> {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM certidoes_cnd WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    if (!rows.length) throw new Error('Registro não encontrado')
    return rows[0]!
  }

  private formatarRegistro(row: Record<string, unknown>): RegistroCnd {
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

  async listarClientesMensais(empresaId: string) {
    return prisma.cliente.findMany({
      where: { status: 'ATIVO', situacao: 'MENSAL', empresaId: exigirEmpresa(empresaId) },
      select: { id: true, razaoSocial: true, documento: true, tipoDocumento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }

  // ── Resolver empresaId fallback ──────────────────────

  async resolverEmpresaId(): Promise<string> {
    // Empresa "home" determinística (a mais antiga) — alvo do cron automático.
    // Deve casar com o backfill da migração ISO-003 (ORDER BY created_at ASC).
    const emp = await prisma.empresa.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } })
    return emp?.id || ''
  }
}
