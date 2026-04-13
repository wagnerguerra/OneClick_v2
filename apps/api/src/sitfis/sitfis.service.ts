import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================
// Configuração
// ============================================================

const SERPRO_AUTH_URL = 'autenticacao.sapi.serpro.gov.br'
const SERPRO_GATEWAY = 'gateway.apiserpro.serpro.gov.br'
const INTEGRA_BASE = '/integra-contador/v1'
const ID_SERVICO_SOLICITAR = 'SOLICITARPROTOCOLO91'
const ID_SERVICO_EMITIR = 'RELATORIOSITFIS92'
const REQUEST_TIMEOUT = 90000

// ============================================================
// Helpers
// ============================================================

function readEnvValues(): Map<string, string> {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
  ]
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue
    const content = fs.readFileSync(envPath, 'utf8')
    const values = new Map<string, string>()
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      values.set(key, val)
    }
    return values
  }
  return new Map()
}

function httpsRequest(
  options: https.RequestOptions,
  postData?: string,
): Promise<{ status: number; headers: Record<string, string>; data: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout de 90s na requisição SERPRO')), REQUEST_TIMEOUT)
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk: string) => (data += chunk))
      res.on('end', () => {
        clearTimeout(timer)
        const headers: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') headers[k] = v
          else if (Array.isArray(v)) headers[k] = v[0] || ''
        }
        resolve({ status: res.statusCode || 0, headers, data })
      })
    })
    req.on('error', (e) => { clearTimeout(timer); reject(e) })
    if (postData) req.write(postData)
    req.end()
  })
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class SitfisService {
  /**
   * Autenticação OAuth com certificado PFX no endpoint sapi do SERPRO.
   * Retorna access_token e jwt_token.
   */
  private async autenticar(): Promise<{ accessToken: string; jwtToken: string }> {
    const env = readEnvValues()
    const consumerKey = env.get('CONSUMER_KEY') || process.env.CONSUMER_KEY
    const consumerSecret = env.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET
    const certSenha = env.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA || ''
    const certPath = path.resolve(process.cwd(), 'uploads', 'certificado.pfx')

    if (!consumerKey || !consumerSecret) throw new Error('Consumer Key/Secret não configurados.')
    if (!fs.existsSync(certPath)) throw new Error('Certificado digital (PFX) não encontrado. Envie-o em Configurações → Certificado Digital.')

    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    const pfxBuffer = fs.readFileSync(certPath)
    const postData = 'grant_type=client_credentials'

    const res = await httpsRequest({
      hostname: SERPRO_AUTH_URL,
      port: 443,
      path: '/authenticate',
      method: 'POST',
      pfx: pfxBuffer,
      passphrase: certSenha,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Role-Type': 'TERCEIROS',
        'Accept': 'application/json',
        'User-Agent': 'OneClick-ERP/1.0',
        'Content-Length': String(Buffer.byteLength(postData)),
      },
      rejectUnauthorized: false,
    }, postData)

    if (res.status !== 200) {
      throw new Error(`Falha na autenticação SERPRO: HTTP ${res.status} — ${res.data.slice(0, 200)}`)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = JSON.parse(res.data)
    return {
      accessToken: data.access_token,
      jwtToken: data.jwt_token || data.access_token,
    }
  }

  /**
   * Etapa 1: Solicitar protocolo via /Apoiar
   */
  private async solicitarProtocolo(
    tokens: { accessToken: string; jwtToken: string },
    documento: string,
    tipoDocumento: number,
    cnpjContratante: string,
  ): Promise<{ protocolo: string; headers: Record<string, string>; data: string }> {
    const body = JSON.stringify({
      contratante: { numero: cnpjContratante, tipo: 2 },
      autorPedidoDados: { numero: cnpjContratante, tipo: 2 },
      contribuinte: { numero: documento, tipo: tipoDocumento },
      pedidoDados: {
        idSistema: 'SITFIS',
        idServico: ID_SERVICO_SOLICITAR,
        versaoSistema: '2.0',
        dados: '',
      },
    })

    const res = await httpsRequest({
      hostname: SERPRO_GATEWAY,
      port: 443,
      path: `${INTEGRA_BASE}/Apoiar`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'jwt_token': tokens.jwtToken,
        'Content-Type': 'application/json',
        'Accept': 'text/plain',
        'Role-Type': 'TERCEIROS',
        'User-Agent': 'OneClick-ERP/1.0',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      rejectUnauthorized: false,
    }, body)

    // Protocolo pode vir no header etag OU no body (campo dados)
    let protocolo: string | null = null

    // 1. Tentar extrair do header etag
    const rawEtag = res.headers['etag'] || ''
    if (rawEtag) {
      // Remover aspas e extrair valor após "protocoloRelatorio:"
      const etagStr = rawEtag.replace(/^"/, '').replace(/"$/, '').trim()
      const match = etagStr.match(/protocoloRelatorio[:\s]+(.+)/i)
      if (match?.[1]) {
        protocolo = match[1].replace(/^["'\s]+|["'\s]+$/g, '').trim()
      } else if (etagStr.includes('protocoloRelatorio')) {
        protocolo = etagStr
      }
    }

    // 2. Se não encontrou no etag, buscar no body
    if (!protocolo && res.data) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = JSON.parse(res.data)
        // Campo dados pode ser string JSON com protocoloRelatorio
        if (body?.dados && typeof body.dados === 'string') {
          try {
            const dadosParsed = JSON.parse(body.dados)
            if (dadosParsed?.protocoloRelatorio) protocolo = dadosParsed.protocoloRelatorio
          } catch { /* não é JSON */ }
        }
        // Busca direta no body
        if (!protocolo && body?.dados?.protocoloRelatorio) protocolo = body.dados.protocoloRelatorio
        if (!protocolo && body?.protocoloRelatorio) protocolo = body.protocoloRelatorio
      } catch { /* body não é JSON */ }
    }

    if (!protocolo) {
      throw new Error(`Protocolo não retornado pelo SERPRO. Status: ${res.status}. Resposta: ${res.data.slice(0, 300)}`)
    }

    // Reconstruir formato completo se necessário
    if (!protocolo.startsWith('protocoloRelatorio:')) {
      protocolo = `protocoloRelatorio:${protocolo}`
    }

    return { protocolo, headers: res.headers, data: res.data }
  }

  /**
   * Etapa 2: Emitir relatório via /Emitir
   */
  private async emitirRelatorio(
    tokens: { accessToken: string; jwtToken: string },
    documento: string,
    tipoDocumento: number,
    cnpjContratante: string,
    protocolo: string,
    cookies?: string,
  ): Promise<{ status: number; data: string }> {
    const body = JSON.stringify({
      contratante: { numero: cnpjContratante, tipo: 2 },
      autorPedidoDados: { numero: cnpjContratante, tipo: 2 },
      contribuinte: { numero: documento, tipo: tipoDocumento },
      pedidoDados: {
        idSistema: 'SITFIS',
        idServico: ID_SERVICO_EMITIR,
        versaoSistema: '2.0',
        dados: JSON.stringify({ protocoloRelatorio: protocolo }),
      },
    })

    const res = await httpsRequest({
      hostname: SERPRO_GATEWAY,
      port: 443,
      path: `${INTEGRA_BASE}/Emitir`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.accessToken}`,
        'jwt_token': tokens.jwtToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Role-Type': 'TERCEIROS',
        'User-Agent': 'OneClick-ERP/1.0',
        'Content-Length': String(Buffer.byteLength(body)),
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
      rejectUnauthorized: false,
    }, body)

    return { status: res.status, data: res.data }
  }

  /**
   * Extrai o PDF base64 da resposta (busca recursiva).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extrairPdf(obj: any, depth = 0): string | null {
    if (!obj || depth > 5) return null
    if (typeof obj === 'string' && obj.length > 500) return obj // Provavelmente é o PDF em base64
    if (typeof obj !== 'object') return null

    // Campos comuns para PDF
    for (const key of ['pdf', 'PDF', 'pdfBase64', 'arquivo', 'conteudo']) {
      if (obj[key] && typeof obj[key] === 'string' && obj[key].length > 500) return obj[key]
    }

    // Busca recursiva
    for (const key of Object.keys(obj)) {
      const result = this.extrairPdf(obj[key], depth + 1)
      if (result) return result
    }

    return null
  }

  /**
   * Detecta o tipo de certidão a partir do texto/dados.
   */
  private detectarTipoCertidao(text: string): string {
    if (/Certid[aãoõ]\s+Positiva\s+com\s+[Ee]feitos?\s+de\s+Negativa/i.test(text)) return 'Positiva com Efeitos de Negativa'
    if (/Certid[aãoõ]\s+Negativa/i.test(text)) return 'Negativa'
    if (/Certid[aãoõ]\s+Positiva/i.test(text)) return 'Positiva'
    if (/Pendente/i.test(text)) return 'Pendente'
    return 'Não identificada'
  }

  // ============================================================
  // Consulta completa (fluxo de 2 etapas)
  // ============================================================

  async consultar(
    documento: string,
    clienteId?: string,
    userId?: string,
    empresaId?: string,
  ): Promise<{ id: string; sucesso: boolean; tipoCertidao: string | null; erro: string | null; temPdf: boolean }> {
    const doc = documento.replace(/\D/g, '')
    const tipoDocumento = doc.length === 11 ? 1 : 2

    const env = readEnvValues()
    const cnpjContratante = (env.get('CNPJ_CONTRATANTE') || process.env.CNPJ_CONTRATANTE || '').replace(/\D/g, '')
    if (!cnpjContratante) throw new Error('CNPJ do contratante não configurado.')

    // Criar registro pendente
    const registro = await prisma.situacaoFiscal.create({
      data: {
        documento: doc,
        tipoDocumento,
        etapa: 'autenticando',
        clienteId: clienteId || null,
        empresaId: empresaId || null,
        userId: userId || null,
      },
    })

    try {
      // 1. Autenticar
      await prisma.situacaoFiscal.update({ where: { id: registro.id }, data: { etapa: 'autenticando' } })
      const tokens = await this.autenticar()

      // 2. Solicitar protocolo
      await prisma.situacaoFiscal.update({ where: { id: registro.id }, data: { etapa: 'solicitando_protocolo' } })
      const apoiarResult = await this.solicitarProtocolo(tokens, doc, tipoDocumento, cnpjContratante)
      const protocolo = apoiarResult.protocolo
      // Capturar cookies do load balancer F5 para reenviar no Emitir
      const cookies = apoiarResult.headers['set-cookie'] || ''
      await prisma.situacaoFiscal.update({ where: { id: registro.id }, data: { protocolo } })

      // 3. Emitir relatório (com retry — SERPRO pode precisar de tempo para preparar)
      await prisma.situacaoFiscal.update({ where: { id: registro.id }, data: { etapa: 'emitindo_relatorio' } })

      let relatorio: { status: number; data: string } | null = null
      let emitirSucesso = false
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        if (tentativa > 1) await new Promise(r => setTimeout(r, 5000))
        const res = await this.emitirRelatorio(tokens, doc, tipoDocumento, cnpjContratante, protocolo, cookies)
        relatorio = res
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const json: any = JSON.parse(res.data)
          const temErro = json.mensagens?.some((m: { texto?: string }) => m.texto?.includes('Erro'))
          if (!temErro) { emitirSucesso = true; break }
        } catch { emitirSucesso = true; break }
      }
      if (!relatorio) throw new Error('Falha ao emitir relatório após 3 tentativas')
      if (!emitirSucesso) {
        // Todas as tentativas falharam — salvar como erro
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let errMsg = 'Erro ao obter relatório do SERPRO após 3 tentativas'
        try { const j = JSON.parse(relatorio.data); errMsg = j.mensagens?.[0]?.texto || errMsg } catch {}
        throw new Error(errMsg)
      }

      // 4. Processar resposta
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let respostaJson: any = null
      try { respostaJson = JSON.parse(relatorio.data) } catch { /* não é JSON */ }

      // O campo "dados" pode vir como string JSON — parsear se necessário
      if (respostaJson?.dados && typeof respostaJson.dados === 'string') {
        try { respostaJson.dados = JSON.parse(respostaJson.dados) } catch { /* manter como string */ }
      }

      // Extrair PDF: buscar em dados.pdf, dados.dados.pdf, ou recursivamente
      let pdfBase64: string | null = null
      if (respostaJson?.dados?.pdf && typeof respostaJson.dados.pdf === 'string' && respostaJson.dados.pdf.length > 100) {
        pdfBase64 = respostaJson.dados.pdf
      } else if (respostaJson?.pdf && typeof respostaJson.pdf === 'string' && respostaJson.pdf.length > 100) {
        pdfBase64 = respostaJson.pdf
      } else if (respostaJson?.dados?.dados?.pdf && typeof respostaJson.dados.dados.pdf === 'string') {
        pdfBase64 = respostaJson.dados.dados.pdf
      } else {
        pdfBase64 = this.extrairPdf(respostaJson)
      }

      const tipoCertidao = respostaJson ? this.detectarTipoCertidao(JSON.stringify(respostaJson)) : null

      // Extrair razão social se disponível
      const razaoSocial = respostaJson?.dados?.razaoSocial || respostaJson?.dados?.nomeEmpresarial || null

      await prisma.situacaoFiscal.update({
        where: { id: registro.id },
        data: {
          etapa: 'concluido',
          sucesso: true,
          statusHttp: relatorio.status,
          tipoCertidao,
          pdfBase64: pdfBase64 || null,
          respostaCompleta: respostaJson || relatorio.data,
          razaoSocial: razaoSocial ? String(razaoSocial) : null,
          dataEmissao: new Date(),
        },
      })

      // Log
      await prisma.apiLog.create({
        data: { source: 'integra-contador', endpoint: '/Emitir (SITFIS)', method: 'POST', status: relatorio.status, documento: doc, userId },
      }).catch(() => {})

      return { id: registro.id, sucesso: true, tipoCertidao, erro: null, temPdf: !!pdfBase64 }
    } catch (e) {
      const erro = (e as Error).message
      await prisma.situacaoFiscal.update({
        where: { id: registro.id },
        data: { etapa: 'erro', sucesso: false, erro },
      })

      await prisma.apiLog.create({
        data: { source: 'integra-contador', endpoint: '/SITFIS', method: 'POST', status: 500, documento: doc, userId },
      }).catch(() => {})

      return { id: registro.id, sucesso: false, tipoCertidao: null, erro, temPdf: false }
    }
  }

  // ============================================================
  // CRUD de consultas
  // ============================================================

  async list(input: { page: number; limit: number; search?: string; clienteId?: string }, empresaId?: string) {
    const { page, limit, search, clienteId } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      deletedAt: null,
      ...(empresaId ? { empresaId } : {}),
      ...(clienteId ? { clienteId } : {}),
      ...(search ? {
        OR: [
          { documento: { contains: search } },
          { razaoSocial: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
    }

    const [data, total] = await Promise.all([
      prisma.situacaoFiscal.findMany({
        where, skip, take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, documento: true, tipoDocumento: true, razaoSocial: true,
          tipoCertidao: true, etapa: true, sucesso: true, erro: true,
          createdAt: true, pdfBase64: false,
          cliente: { select: { id: true, razaoSocial: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.situacaoFiscal.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string) {
    return prisma.situacaoFiscal.findUniqueOrThrow({
      where: { id },
      select: {
        id: true, documento: true, tipoDocumento: true, razaoSocial: true,
        protocolo: true, etapa: true, tipoCertidao: true, numeroCertidao: true,
        dataEmissao: true, dataValidade: true,
        sucesso: true, erro: true, statusHttp: true,
        dadosExtraidos: true, createdAt: true,
        cliente: { select: { id: true, razaoSocial: true } },
        user: { select: { id: true, name: true } },
      },
    })
  }

  async getPdf(id: string): Promise<string | null> {
    const record = await prisma.situacaoFiscal.findUniqueOrThrow({
      where: { id },
      select: { pdfBase64: true },
    })
    return record.pdfBase64
  }

  async getByClienteId(clienteId: string) {
    return prisma.situacaoFiscal.findMany({
      where: { clienteId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, documento: true, razaoSocial: true,
        tipoCertidao: true, etapa: true, sucesso: true, erro: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    })
  }

  async softDelete(id: string) {
    return prisma.situacaoFiscal.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }
}
