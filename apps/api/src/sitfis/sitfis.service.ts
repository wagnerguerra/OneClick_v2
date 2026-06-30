import { Injectable } from '@nestjs/common'
import { prisma, buildPaginatedResponse, getPrismaSkipTake } from '@saas/db'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
// Importar diretamente o lib para evitar o auto-run do index.js com Webpack
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>

// ============================================================
// Configuração
// ============================================================

const SERPRO_AUTH_URL = 'autenticacao.sapi.serpro.gov.br'
const SERPRO_GATEWAY = 'gateway.apiserpro.serpro.gov.br'
const INTEGRA_BASE = '/integra-contador/v1'
const REQUEST_TIMEOUT = 90000

// ============================================================
// Helpers
// ============================================================

interface SerproTokens {
  accessToken: string
  jwtToken: string
}

interface HttpResponse {
  status: number
  headers: Record<string, string>
  data: string
}

function httpsRequest(
  options: https.RequestOptions,
  postData?: string,
): Promise<HttpResponse> {
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

// ============================================================
// Service
// ============================================================

@Injectable()
export class SitfisService {
  // Cache de tokens em memória (evita re-autenticação a cada request)
  private tokenCache: { tokens: SerproTokens; expiresAt: number } | null = null

  /**
   * Lê configurações do SystemConfig (banco) com fallback para .env
   */
  private async getConfig(): Promise<{
    consumerKey: string
    consumerSecret: string
    certSenha: string
    cnpjContratante: string
    idServicoSolicitar: string
    idServicoEmitir: string
  }> {
    // Buscar do banco (SystemConfig)
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA', 'CNPJ_CONTRATANTE', 'SITFIS_ID_SERVICO_SOLICITAR', 'SITFIS_ID_SERVICO_EMITIR'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))

    // Fallback: variáveis de ambiente
    const consumerKey = map.get('CONSUMER_KEY') || process.env.CONSUMER_KEY || ''
    const consumerSecret = map.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET || ''
    const certSenha = map.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA || ''
    const cnpjContratante = (map.get('CNPJ_CONTRATANTE') || process.env.CNPJ_CONTRATANTE || '').replace(/\D/g, '')
    const idServicoSolicitar = map.get('SITFIS_ID_SERVICO_SOLICITAR') || process.env.SITFIS_ID_SERVICO_SOLICITAR || 'SOLICITARPROTOCOLO91'
    const idServicoEmitir = map.get('SITFIS_ID_SERVICO_EMITIR') || process.env.SITFIS_ID_SERVICO_EMITIR || 'RELATORIOSITFIS92'

    if (!consumerKey || !consumerSecret) throw new Error('Consumer Key/Secret não configurados. Acesse Configurações → Certificado Digital.')
    if (!cnpjContratante) throw new Error('CNPJ do contratante não configurado. Acesse Configurações → Certificado Digital.')

    return { consumerKey, consumerSecret, certSenha, cnpjContratante, idServicoSolicitar, idServicoEmitir }
  }

  /**
   * Retorna o caminho do certificado PFX
   */
  private getCertPath(): string {
    const certPath = path.resolve(process.cwd(), 'uploads', 'certificado.pfx')
    if (!fs.existsSync(certPath)) {
      throw new Error('Certificado digital (PFX) não encontrado. Envie-o em Configurações → Certificado Digital.')
    }
    return certPath
  }

  // ============================================================
  // OAuth2 Serpro
  // ============================================================

  private async autenticar(forceRefresh = false): Promise<SerproTokens> {
    // Retornar token em cache se ainda válido (margem de 60s)
    if (!forceRefresh && this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60000) {
      return this.tokenCache.tokens
    }

    const config = await this.getConfig()
    const certPath = this.getCertPath()
    const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
    const pfxBuffer = fs.readFileSync(certPath)
    const postData = 'grant_type=client_credentials'

    const res = await httpsRequest({
      hostname: SERPRO_AUTH_URL,
      port: 443,
      path: '/authenticate',
      method: 'POST',
      pfx: pfxBuffer,
      passphrase: config.certSenha,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Role-Type': 'TERCEIROS',
        'Accept': 'application/json',
        'User-Agent': 'OneClick-ERP/1.0',
        'Content-Length': String(Buffer.byteLength(postData)),
      },
      rejectUnauthorized: true,
    }, postData)

    if (res.status !== 200) {
      throw new Error(`Falha na autenticação SERPRO: HTTP ${res.status} — ${res.data.slice(0, 300)}`)
    }

    const data = JSON.parse(res.data) as { access_token: string; jwt_token?: string; expires_in?: number }
    const tokens: SerproTokens = {
      accessToken: data.access_token,
      jwtToken: data.jwt_token || data.access_token,
    }

    // Cachear token
    const expiresIn = data.expires_in || 3600
    this.tokenCache = { tokens, expiresAt: Date.now() + expiresIn * 1000 }

    return tokens
  }

  // ============================================================
  // Chamada genérica ao Integra Contador (reutilizável por outros módulos)
  // ============================================================

  async callIntegra(params: {
    documento: string; tipoDocumento: number
    idSistema: string; idServico: string; versaoSistema: string
    dados: string; endpoint: string
  }) {
    const config = await this.getConfig()
    const certPath = this.getCertPath()
    const pfxBuffer = fs.readFileSync(certPath)
    let tokens = await this.autenticar()

    const body = JSON.stringify({
      contratante: { numero: config.cnpjContratante, tipo: 2 },
      autorPedidoDados: { numero: config.cnpjContratante, tipo: 2 },
      contribuinte: { numero: params.documento, tipo: params.tipoDocumento },
      pedidoDados: {
        idSistema: params.idSistema,
        idServico: params.idServico,
        versaoSistema: params.versaoSistema,
        dados: params.dados,
      },
    })

    const makeReq = async (tkn: SerproTokens) => httpsRequest({
      hostname: SERPRO_GATEWAY,
      port: 443,
      path: `${INTEGRA_BASE}/${params.endpoint}`,
      method: 'POST',
      pfx: pfxBuffer,
      passphrase: config.certSenha,
      headers: {
        'Authorization': `Bearer ${tkn.accessToken}`,
        'jwt_token': tkn.jwtToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Role-Type': 'TERCEIROS',
        'User-Agent': 'OneClick-ERP/1.0',
        'Content-Length': String(Buffer.byteLength(body)),
      },
      rejectUnauthorized: true,
    }, body)

    let res = await makeReq(tokens)
    if (res.status === 401 || res.status === 403) {
      tokens = await this.autenticar(true)
      res = await makeReq(tokens)
    }

    try { return JSON.parse(res.data) } catch { return { status: res.status, data: res.data } }
  }

  // ============================================================
  // Etapa 1: Solicitar protocolo via /Apoiar
  // ============================================================

  private async solicitarProtocolo(
    tokens: SerproTokens,
    documento: string,
    tipoDocumento: number,
    cnpjContratante: string,
    idServicoSolicitar: string,
  ): Promise<{ protocolo: string; headers: Record<string, string>; data: string }> {
    const body = JSON.stringify({
      contratante: { numero: cnpjContratante, tipo: 2 },
      autorPedidoDados: { numero: cnpjContratante, tipo: 2 },
      contribuinte: { numero: documento, tipo: tipoDocumento },
      pedidoDados: {
        idSistema: 'SITFIS',
        idServico: idServicoSolicitar,
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
      rejectUnauthorized: true,
    }, body)

    if (res.status === 401 || res.status === 403) {
      throw new Error(`AUTH_EXPIRED:${res.status}`)
    }

    // Extrair protocolo do header ETag
    let protocolo: string | null = null
    const rawEtag = res.headers['etag'] || ''
    if (rawEtag) {
      const etagStr = String(rawEtag).replace(/^"/, '').replace(/"$/, '').trim()

      // Método 1: regex robusto
      const match = etagStr.match(/protocoloRelatorio[:\s]+(.+?)(?:"|$|\s|,|;)/i)
      if (match?.[1]) {
        protocolo = match[1].replace(/^["'\s]+|["'\s]+$/g, '').trim()
      }

      // Método 2: split por delimitador
      if (!protocolo) {
        const parts = etagStr.split(/protocoloRelatorio[:\s]+/i)
        if (parts.length > 1) {
          let extracted = (parts[1] || '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
          const invalidIndex = extracted.search(/[,\s;]/)
          if (invalidIndex > 0) extracted = extracted.substring(0, invalidIndex)
          if (extracted.length > 10) protocolo = extracted
        }
      }

      // Método 3: usar o ETag inteiro se contém "protocoloRelatorio"
      if (!protocolo && etagStr.includes('protocoloRelatorio')) {
        protocolo = etagStr
      }
    }

    // Fallback: buscar no body
    if (!protocolo && res.data) {
      try {
        const parsed = JSON.parse(res.data) as Record<string, unknown>
        if (parsed?.dados && typeof parsed.dados === 'string') {
          try {
            const dadosParsed = JSON.parse(parsed.dados) as Record<string, unknown>
            if (dadosParsed?.protocoloRelatorio) protocolo = String(dadosParsed.protocoloRelatorio)
          } catch { /* não é JSON */ }
        }
        const dados = parsed?.dados as Record<string, unknown> | undefined
        if (!protocolo && dados?.protocoloRelatorio) protocolo = String(dados.protocoloRelatorio)
        if (!protocolo && parsed?.protocoloRelatorio) protocolo = String(parsed.protocoloRelatorio)
      } catch { /* body não é JSON */ }
    }

    if (!protocolo) {
      throw new Error(`Protocolo não retornado pelo SERPRO. Status: ${res.status}. Resposta: ${res.data.slice(0, 300)}`)
    }

    return { protocolo, headers: res.headers, data: res.data }
  }

  // ============================================================
  // Etapa 2: Emitir relatório via /Emitir
  // ============================================================

  private async emitirRelatorio(
    tokens: SerproTokens,
    documento: string,
    tipoDocumento: number,
    cnpjContratante: string,
    protocolo: string,
    idServicoEmitir: string,
    cookies?: string,
  ): Promise<HttpResponse> {
    // Garantir formato com prefixo protocoloRelatorio:
    const protocoloParaDados = protocolo.startsWith('protocoloRelatorio:')
      ? protocolo.replace('protocoloRelatorio:', '')
      : protocolo

    const body = JSON.stringify({
      contratante: { numero: cnpjContratante, tipo: 2 },
      autorPedidoDados: { numero: cnpjContratante, tipo: 2 },
      contribuinte: { numero: documento, tipo: tipoDocumento },
      pedidoDados: {
        idSistema: 'SITFIS',
        idServico: idServicoEmitir,
        versaoSistema: '2.0',
        dados: JSON.stringify({ protocoloRelatorio: protocoloParaDados }),
      },
    })

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${tokens.accessToken}`,
      'jwt_token': tokens.jwtToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Role-Type': 'TERCEIROS',
      'User-Agent': 'OneClick-ERP/1.0',
      'Content-Length': String(Buffer.byteLength(body)),
    }
    if (cookies) headers['Cookie'] = cookies

    return httpsRequest({
      hostname: SERPRO_GATEWAY,
      port: 443,
      path: `${INTEGRA_BASE}/Emitir`,
      method: 'POST',
      headers,
      rejectUnauthorized: true,
    }, body)
  }

  // ============================================================
  // Extração de PDF e tipo de certidão
  // ============================================================

  private extrairPdf(obj: unknown, depth = 0): string | null {
    if (!obj || depth > 5) return null
    if (typeof obj === 'string' && obj.length > 500) return obj
    if (typeof obj !== 'object') return null

    const o = obj as Record<string, unknown>
    for (const key of ['pdf', 'PDF', 'pdfBase64', 'arquivo', 'conteudo']) {
      if (o[key] && typeof o[key] === 'string' && (o[key] as string).length > 500) return o[key] as string
    }

    for (const key of Object.keys(o)) {
      const result = this.extrairPdf(o[key], depth + 1)
      if (result) return result
    }
    return null
  }

  private detectarTipoCertidao(text: string): string {
    const t = text.toLowerCase()
    // Ordem importa: "Positiva com Efeitos de Negativa" deve vir antes de "Positiva" e "Negativa"
    if (/certid[aãoõ]o?\s+positiva\s+com\s+efeitos?\s+de\s+negativa/i.test(text)) return 'Positiva com Efeitos de Negativa'
    if (t.includes('positiva com efeito')) return 'Positiva com Efeitos de Negativa'
    if (/certid[aãoõ]o?\s+negativa/i.test(text)) return 'Negativa'
    if (/certid[aãoõ]o?\s+positiva/i.test(text)) return 'Positiva'
    if (t.includes('negativa') && !t.includes('positiva')) return 'Negativa'
    if (t.includes('positiva')) return 'Positiva'
    if (t.includes('pendente')) return 'Pendente'
    return 'Não identificada'
  }

  /**
   * Extrai texto do PDF via pdf-parse e retorna informações extraídas.
   */
  private async extrairDadosDoPdf(pdfBase64: string): Promise<{
    textoPdf: string
    tipoCertidao: string
    razaoSocial: string | null
    numeroCertidao: string | null
    dataEmissao: Date | null
    dataValidade: Date | null
  }> {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    let textoPdf = ''

    try {
      const parsed = await pdfParse(pdfBuffer)
      textoPdf = parsed.text || ''
    } catch (err) {
      console.error('[SITFIS] pdf-parse falhou:', (err as Error).message, '| typeof pdfParse:', typeof pdfParse, '| buffer length:', pdfBuffer.length)
      return { textoPdf: '', tipoCertidao: 'Não identificada', razaoSocial: null, numeroCertidao: null, dataEmissao: null, dataValidade: null }
    }

    // Tipo de certidão
    const tipoCertidao = this.detectarTipoCertidao(textoPdf)

    // Razão social — formato real: "11.318.082 - ACAI BRASIL INDUSTRIA..."
    let razaoSocial: string | null = null
    // Padrão 1: CNPJ raiz seguido de " - NOME" (formato SERPRO)
    const rsMatch1 = textoPdf.match(/\d{2}\.\d{3}\.\d{3}\s*-\s*([A-ZÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ][A-ZÁÀÂÃÉÈÊÍÏÓÔÕÚÜÇ\s&.,\-/]+?)(?:\n|Dados|CNPJ|$)/m)
    if (rsMatch1?.[1]) razaoSocial = rsMatch1[1].trim()
    // Padrão 2: "Nome Empresarial:" / "Razão Social:"
    if (!razaoSocial) {
      const rsMatch2 = textoPdf.match(/(?:Nome\s+Empresarial|Raz[aã]o\s+Social|Contribuinte)[:\s]+([^\n]+)/i)
      if (rsMatch2?.[1] && rsMatch2[1].trim().length > 3) razaoSocial = rsMatch2[1].trim()
    }

    // Número da certidão — formato: "Certidão Positiva com Efeitos de Negativa:  6E54.9DD2.8130.0EBC"
    let numeroCertidao: string | null = null
    const numMatch = textoPdf.match(/Certid[aãoõ]o?\s+(?:Negativa|Positiva[^:]*)[:\s]+([A-F0-9][A-F0-9.]+)/i)
    if (numMatch?.[1]) numeroCertidao = numMatch[1].trim()
    // Fallback: código de controle genérico
    if (!numeroCertidao) {
      const numMatch2 = textoPdf.match(/(?:C[oó]digo\s+de\s+[Cc]ontrole)[:\s]+([A-Z0-9./\-]+)/i)
      if (numMatch2?.[1]) numeroCertidao = numMatch2[1].trim()
    }

    // Data de emissão — formato: "Emissão: \n30/03/2026" ou "Emissão:\n30/03/2026"
    let dataEmissao: Date | null = null
    const emissaoMatch = textoPdf.match(/[Ee]miss[aã]o[:\s]*\n?\s*(\d{2}\/\d{2}\/\d{4})/m)
    if (emissaoMatch?.[1]) {
      const parts = emissaoMatch[1].split('/')
      if (parts.length === 3) dataEmissao = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    }

    // Data de validade — formato: "Data de Validade: \n26/09/2026"
    let dataValidade: Date | null = null
    const validadeMatch = textoPdf.match(/[Vv]alidade[:\s]*\n?\s*(\d{2}\/\d{2}\/\d{4})/m)
    if (validadeMatch?.[1]) {
      const parts = validadeMatch[1].split('/')
      if (parts.length === 3) dataValidade = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    }

    return { textoPdf, tipoCertidao, razaoSocial, numeroCertidao, dataEmissao, dataValidade }
  }

  // ============================================================
  // Cache: verificar consulta existente
  // ============================================================

  async verificarCache(documento: string, periodo?: string): Promise<{
    encontrado: boolean
    id?: string
    tipoCertidao?: string | null
    createdAt?: Date
  }> {
    const doc = documento.replace(/\D/g, '')
    const cached = await prisma.situacaoFiscal.findFirst({
      where: {
        documento: doc,
        etapa: 'concluido',
        sucesso: true,
        deletedAt: null,
        ...(periodo ? { periodo } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tipoCertidao: true, createdAt: true },
    })

    if (!cached) return { encontrado: false }
    return { encontrado: true, id: cached.id, tipoCertidao: cached.tipoCertidao, createdAt: cached.createdAt }
  }

  // ============================================================
  // Consulta completa (fluxo de 2 etapas com cache)
  // ============================================================

  async consultar(
    documento: string,
    opts?: {
      periodo?: string
      clienteId?: string
      userId?: string
      empresaId?: string
      forcarNova?: boolean
    },
  ): Promise<{ id: string; sucesso: boolean; tipoCertidao: string | null; erro: string | null; temPdf: boolean; consultaRecente?: boolean; consultaRecenteId?: string; consultaRecenteData?: string }> {
    const doc = documento.replace(/\D/g, '')
    const tipoDocumento = doc.length === 11 ? 1 : 2
    const periodo = opts?.periodo || null
    const clienteId = opts?.clienteId || null
    const userId = opts?.userId || null
    const empresaId = opts?.empresaId || null
    const forcarNova = opts?.forcarNova === true

    const config = await this.getConfig()

    // Verificar se já existe consulta bem-sucedida nas últimas 24 horas
    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const consultaRecente = await prisma.situacaoFiscal.findFirst({
      where: {
        documento: doc,
        etapa: 'concluido',
        sucesso: true,
        deletedAt: null,
        createdAt: { gte: limite24h },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, tipoCertidao: true, pdfBase64: true, createdAt: true },
    })

    if (consultaRecente && !forcarNova) {
      return {
        id: consultaRecente.id,
        sucesso: true,
        tipoCertidao: consultaRecente.tipoCertidao,
        erro: null,
        temPdf: !!consultaRecente.pdfBase64,
        consultaRecente: true,
        consultaRecenteId: consultaRecente.id,
        consultaRecenteData: consultaRecente.createdAt.toISOString(),
      }
    }

    // Criar registro pendente
    const registro = await prisma.situacaoFiscal.create({
      data: {
        documento: doc,
        periodo,
        tipoDocumento,
        cnpjContratante: config.cnpjContratante,
        etapa: 'autenticando',
        clienteId,
        empresaId,
        userId,
      },
    })

    try {
      // 1. Autenticar (com retry em 401)
      let tokens: SerproTokens
      try {
        tokens = await this.autenticar()
      } catch {
        tokens = await this.autenticar(true)
      }

      // 2. Solicitar protocolo
      await prisma.situacaoFiscal.update({ where: { id: registro.id }, data: { etapa: 'solicitando_protocolo' } })

      let apoiarResult: { protocolo: string; headers: Record<string, string>; data: string }
      try {
        apoiarResult = await this.solicitarProtocolo(tokens, doc, tipoDocumento, config.cnpjContratante, config.idServicoSolicitar)
      } catch (e) {
        // Retry com token novo se expirado
        if ((e as Error).message.startsWith('AUTH_EXPIRED')) {
          tokens = await this.autenticar(true)
          apoiarResult = await this.solicitarProtocolo(tokens, doc, tipoDocumento, config.cnpjContratante, config.idServicoSolicitar)
        } else { throw e }
      }

      const protocolo = apoiarResult.protocolo
      const cookies = apoiarResult.headers['set-cookie'] || ''
      await prisma.situacaoFiscal.update({
        where: { id: registro.id },
        data: { protocolo, headersResposta: apoiarResult.headers as object },
      })

      // 3. Aguardar 5 segundos para o SERPRO preparar o relatório
      await new Promise(r => setTimeout(r, 5000))

      // 4. Emitir relatório (com retry — SERPRO pode precisar de tempo)
      await prisma.situacaoFiscal.update({ where: { id: registro.id }, data: { etapa: 'emitindo_relatorio' } })

      let relatorio: HttpResponse | null = null
      let emitirSucesso = false
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        if (tentativa > 1) await new Promise(r => setTimeout(r, 5000))
        const res = await this.emitirRelatorio(tokens, doc, tipoDocumento, config.cnpjContratante, protocolo, config.idServicoEmitir, cookies)
        relatorio = res

        // Verificar se a resposta é de erro ou sucesso
        if (res.status === 401 || res.status === 403) {
          tokens = await this.autenticar(true)
          continue
        }

        try {
          const json = JSON.parse(res.data) as { mensagens?: Array<{ texto?: string; codigo?: string }> }
          const temErro = json.mensagens?.some(m => m.texto?.includes('Erro') || m.codigo === '303001')
          if (!temErro) { emitirSucesso = true; break }
        } catch { emitirSucesso = true; break }
      }

      if (!relatorio) throw new Error('Falha ao emitir relatório após 3 tentativas')
      if (!emitirSucesso) {
        let errMsg = 'Erro ao obter relatório do SERPRO após 3 tentativas'
        try {
          const j = JSON.parse(relatorio.data) as { mensagens?: Array<{ texto?: string }> }
          errMsg = j.mensagens?.[0]?.texto || errMsg
        } catch { /* ignorar */ }
        throw new Error(errMsg)
      }

      // 5. Processar resposta
      let respostaJson: Record<string, unknown> | null = null
      try { respostaJson = JSON.parse(relatorio.data) as Record<string, unknown> } catch { /* não é JSON */ }

      // Parsear campo dados se for string JSON
      if (respostaJson?.dados && typeof respostaJson.dados === 'string') {
        try { respostaJson.dados = JSON.parse(respostaJson.dados as string) } catch { /* manter como string */ }
      }

      // Extrair PDF base64
      let pdfBase64: string | null = null
      const dados = respostaJson?.dados as Record<string, unknown> | undefined
      if (dados?.pdf && typeof dados.pdf === 'string' && (dados.pdf as string).length > 100) {
        pdfBase64 = dados.pdf as string
      } else if (respostaJson?.pdf && typeof respostaJson.pdf === 'string' && (respostaJson.pdf as string).length > 100) {
        pdfBase64 = respostaJson.pdf as string
      } else {
        const dadosInner = dados?.dados as Record<string, unknown> | undefined
        if (dadosInner?.pdf && typeof dadosInner.pdf === 'string') {
          pdfBase64 = dadosInner.pdf as string
        } else {
          pdfBase64 = this.extrairPdf(respostaJson)
        }
      }

      // Extrair dados do PDF (tipo certidão, razão social, datas, etc.)
      let tipoCertidao: string | null = null
      let razaoSocial: string | null = null
      let numeroCertidao: string | null = null
      let dataEmissao: Date | null = new Date()
      let dataValidade: Date | null = null
      let dadosExtraidos: Record<string, unknown> | null = null

      if (pdfBase64) {
        try {
          const extraido = await this.extrairDadosDoPdf(pdfBase64)
          tipoCertidao = extraido.tipoCertidao
          razaoSocial = extraido.razaoSocial
          numeroCertidao = extraido.numeroCertidao
          if (extraido.dataEmissao) dataEmissao = extraido.dataEmissao
          dataValidade = extraido.dataValidade
          dadosExtraidos = { textoPdf: extraido.textoPdf.slice(0, 5000) }
        } catch {
          // Fallback: tentar detectar pelo JSON da resposta
          tipoCertidao = respostaJson ? this.detectarTipoCertidao(JSON.stringify(respostaJson)) : null
        }
      } else {
        // Sem PDF — tentar detectar pelo JSON da resposta
        tipoCertidao = respostaJson ? this.detectarTipoCertidao(JSON.stringify(respostaJson)) : null
      }

      // Fallback para razão social do JSON se não extraído do PDF
      if (!razaoSocial) {
        razaoSocial = (dados?.razaoSocial || dados?.nomeEmpresarial || null) as string | null
      }

      await prisma.situacaoFiscal.update({
        where: { id: registro.id },
        data: {
          etapa: 'concluido',
          sucesso: true,
          statusHttp: relatorio.status,
          tipoCertidao,
          numeroCertidao,
          pdfBase64: pdfBase64 || null,
          respostaCompleta: respostaJson ?? (relatorio.data ? JSON.parse(`{"raw":${JSON.stringify(relatorio.data)}}`) : undefined),
          razaoSocial: razaoSocial ? String(razaoSocial) : null,
          dataEmissao,
          dataValidade,
          dadosExtraidos: dadosExtraidos as object | undefined,
        },
      })

      // Log de API
      await prisma.apiLog.create({
        data: { source: 'integra-contador', endpoint: '/Emitir (SITFIS)', method: 'POST', status: relatorio.status, documento: doc, userId },
      }).catch(() => {})

      return { id: registro.id, sucesso: true, tipoCertidao, erro: null, temPdf: !!pdfBase64 }
    } catch (e) {
      const erro = (e as Error).message.replace(/^AUTH_EXPIRED:/, 'Autenticação expirada: HTTP ')
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
  // Consulta em lote
  // ============================================================

  async consultarLote(
    documentos: string[],
    opts?: { userId?: string; empresaId?: string; forcarNova?: boolean },
  ) {
    const results: Array<{ documento: string; id: string; sucesso: boolean; tipoCertidao: string | null; erro: string | null }> = []
    for (const doc of documentos) {
      const result = await this.consultar(doc, { userId: opts?.userId, empresaId: opts?.empresaId, forcarNova: opts?.forcarNova ?? true })
      results.push({ documento: doc.replace(/\D/g, ''), id: result.id, sucesso: result.sucesso, tipoCertidao: result.tipoCertidao, erro: result.erro })
    }
    return results
  }

  // ============================================================
  // Extração de PDF base64 de registro existente
  // ============================================================

  extrairPdfBase64DeConsulta(respostaCompleta: unknown): string | null {
    if (!respostaCompleta) return null

    const obj = respostaCompleta as Record<string, unknown>
    // Caminho 1: respostaCompleta.pdf
    if (obj.pdf && typeof obj.pdf === 'string' && (obj.pdf as string).length > 100) return obj.pdf as string

    // Caminho 2: respostaCompleta.dados (string ou objeto)
    if (obj.dados) {
      let dados = obj.dados
      if (typeof dados === 'string') {
        try { dados = JSON.parse(dados) } catch { return null }
      }
      const d = dados as Record<string, unknown>
      if (d.pdf && typeof d.pdf === 'string' && (d.pdf as string).length > 100) return d.pdf as string
      // Caminho 3: dados.dados.pdf
      if (d.dados && typeof d.dados === 'object') {
        const dd = d.dados as Record<string, unknown>
        if (dd.pdf && typeof dd.pdf === 'string') return dd.pdf as string
      }
    }

    // Busca recursiva
    return this.extrairPdf(respostaCompleta)
  }

  // ============================================================
  // CRUD de consultas
  // ============================================================

  async list(input: { page: number; limit: number; search?: string; clienteId?: string; situacao?: string }, empresaId?: string) {
    const { page, limit, search, clienteId, situacao } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Record<string, unknown> = {
      deletedAt: null,
      empresaId: empresaId ?? null,  // isolamento multi-tenant (default-deny). ISO-001
      ...(clienteId ? { clienteId } : {}),
      ...(situacao ? { tipoCertidao: situacao } : {}),
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
          id: true, documento: true, tipoDocumento: true, razaoSocial: true, periodo: true,
          tipoCertidao: true, etapa: true, sucesso: true, erro: true, protocolo: true,
          createdAt: true, pdfBase64: false,
          cliente: { select: { id: true, razaoSocial: true } },
          user: { select: { id: true, name: true } },
        },
      }),
      prisma.situacaoFiscal.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async listTrash(input: { page: number; limit: number; search?: string }, empresaId?: string) {
    const { page, limit, search } = input
    const { skip, take } = getPrismaSkipTake(page, limit)

    const where: Record<string, unknown> = {
      deletedAt: { not: null },
      empresaId: empresaId ?? null,  // isolamento multi-tenant (default-deny). ISO-001
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
        orderBy: { deletedAt: 'desc' },
        select: {
          id: true, documento: true, tipoDocumento: true, razaoSocial: true,
          tipoCertidao: true, etapa: true, sucesso: true, createdAt: true, deletedAt: true,
        },
      }),
      prisma.situacaoFiscal.count({ where }),
    ])

    return buildPaginatedResponse(data, total, page, limit)
  }

  async getById(id: string, isMaster = false, empresaId: string | null = null) {
    return prisma.situacaoFiscal.findFirstOrThrow({
      // isolamento multi-tenant: não-master só acessa registros do próprio tenant. ISO-001
      where: { id, ...(isMaster ? {} : { empresaId }) },
      select: {
        id: true, documento: true, tipoDocumento: true, razaoSocial: true, periodo: true,
        protocolo: true, etapa: true, tipoCertidao: true, numeroCertidao: true,
        dataEmissao: true, dataValidade: true, cnpjContratante: true,
        sucesso: true, erro: true, statusHttp: true,
        dadosExtraidos: true, createdAt: true,
        cliente: { select: { id: true, razaoSocial: true } },
        user: { select: { id: true, name: true } },
      },
    })
  }

  async getPdf(id: string, isMaster = false, empresaId: string | null = null): Promise<string | null> {
    const record = await prisma.situacaoFiscal.findFirstOrThrow({
      where: { id, ...(isMaster ? {} : { empresaId }) },  // isolamento multi-tenant. ISO-001
      select: { pdfBase64: true, respostaCompleta: true },
    })
    // Tentar pdfBase64 primeiro, depois extrair da respostaCompleta
    return record.pdfBase64 || this.extrairPdfBase64DeConsulta(record.respostaCompleta)
  }

  async getByClienteId(clienteId: string, empresaId: string | null = null) {
    return prisma.situacaoFiscal.findMany({
      where: { clienteId, deletedAt: null, empresaId: empresaId ?? null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, documento: true, razaoSocial: true,
        tipoCertidao: true, etapa: true, sucesso: true, erro: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    })
  }

  async certidoesAtencao(empresaId?: string) {
    return prisma.situacaoFiscal.findMany({
      where: {
        deletedAt: null,
        sucesso: true,
        etapa: 'concluido',
        tipoCertidao: { in: ['Positiva', 'Positiva com Efeitos de Negativa'] },
        empresaId: empresaId ?? null,  // isolamento multi-tenant (default-deny). ISO-001
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, documento: true, razaoSocial: true,
        tipoCertidao: true, createdAt: true,
        cliente: { select: { id: true, razaoSocial: true } },
      },
    })
  }

  async softDelete(id: string) {
    return prisma.situacaoFiscal.update({ where: { id }, data: { deletedAt: new Date() } })
  }

  async restore(id: string) {
    return prisma.situacaoFiscal.update({ where: { id }, data: { deletedAt: null } })
  }

  async findSocioByCpfAndCliente(cpf: string, clienteId: string) {
    return prisma.socio.findFirst({
      where: { cpf, clienteId },
      select: { id: true },
    })
  }

  // ============================================================
  // SICALC — Emissão de DARF (Guias de Pagamento)
  // ============================================================

  async consultarCodigoReceita(codigoReceita: string) {
    const config = await this.getConfig()
    let tokens = await this.autenticar()

    const body = JSON.stringify({
      contratante: { numero: config.cnpjContratante, tipo: 2 },
      autorPedidoDados: { numero: config.cnpjContratante, tipo: 2 },
      contribuinte: { numero: config.cnpjContratante, tipo: 2 },
      pedidoDados: {
        idSistema: 'SICALC',
        idServico: 'CONSULTAAPOIORECEITAS52',
        versaoSistema: '2.9',
        dados: JSON.stringify({ codigoReceita }),
      },
    })

    const makeRequest = async (tkn: SerproTokens) => {
      const certPath = this.getCertPath()
      const pfxBuffer = fs.readFileSync(certPath)
      const cfg = await this.getConfig()
      return httpsRequest({
        hostname: SERPRO_GATEWAY,
        port: 443,
        path: `${INTEGRA_BASE}/Apoiar`,
        method: 'POST',
        pfx: pfxBuffer,
        passphrase: cfg.certSenha,
        headers: {
          'Authorization': `Bearer ${tkn.accessToken}`,
          'jwt_token': tkn.jwtToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Role-Type': 'TERCEIROS',
          'User-Agent': 'OneClick-ERP/1.0',
          'Content-Length': String(Buffer.byteLength(body)),
        },
        rejectUnauthorized: true,
      }, body)
    }

    let res = await makeRequest(tokens)
    if (res.status === 401 || res.status === 403) {
      tokens = await this.autenticar(true)
      res = await makeRequest(tokens)
    }

    const parsed = JSON.parse(res.data)
    return parsed
  }

  async emitirDarf(
    documento: string,
    tipoDocumento: number,
    dados: {
      codigoReceita: string
      codigoReceitaExtensao?: string
      dataPA: string
      valorImposto: number
      dataConsolidacao: string
      tipoPA?: string
      vencimento?: string
      cota?: number
      uf?: string
      municipio?: string
      valorMulta?: number
      valorJuros?: number
      observacao?: string
    },
  ) {
    const config = await this.getConfig()
    const doc = documento.replace(/\D/g, '')
    let tokens = await this.autenticar()

    const dadosStr = JSON.stringify({
      codigoReceita: dados.codigoReceita,
      codigoReceitaExtensao: dados.codigoReceitaExtensao || '01',
      dataPA: dados.dataPA,
      valorImposto: String(dados.valorImposto),
      dataConsolidacao: dados.dataConsolidacao,
      ...(dados.tipoPA ? { tipoPA: dados.tipoPA } : {}),
      ...(dados.vencimento ? { vencimento: dados.vencimento } : {}),
      ...(dados.cota !== undefined ? { cota: String(dados.cota) } : {}),
      ...(dados.uf ? { uf: dados.uf } : {}),
      ...(dados.municipio ? { municipio: dados.municipio } : {}),
      ...(dados.valorMulta !== undefined ? { valorMulta: String(dados.valorMulta) } : {}),
      ...(dados.valorJuros !== undefined ? { valorJuros: String(dados.valorJuros) } : {}),
      ...(dados.observacao ? { observacao: dados.observacao } : {}),
    })

    const body = JSON.stringify({
      contratante: { numero: config.cnpjContratante, tipo: 2 },
      autorPedidoDados: { numero: config.cnpjContratante, tipo: 2 },
      contribuinte: { numero: doc, tipo: tipoDocumento },
      pedidoDados: {
        idSistema: 'SICALC',
        idServico: 'CONSOLIDARGERARDARF51',
        versaoSistema: '2.9',
        dados: dadosStr,
      },
    })

    const certPath = this.getCertPath()
    const pfxBuffer = fs.readFileSync(certPath)

    const makeRequest = async (tkn: SerproTokens) => {
      return httpsRequest({
        hostname: SERPRO_GATEWAY,
        port: 443,
        path: `${INTEGRA_BASE}/Emitir`,
        method: 'POST',
        pfx: pfxBuffer,
        passphrase: config.certSenha,
        headers: {
          'Authorization': `Bearer ${tkn.accessToken}`,
          'jwt_token': tkn.jwtToken,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Role-Type': 'TERCEIROS',
          'User-Agent': 'OneClick-ERP/1.0',
          'Content-Length': String(Buffer.byteLength(body)),
        },
        rejectUnauthorized: true,
      }, body)
    }

    let res = await makeRequest(tokens)
    if (res.status === 401 || res.status === 403) {
      tokens = await this.autenticar(true)
      res = await makeRequest(tokens)
    }

    const parsed = JSON.parse(res.data) as { status: number; dados?: string; mensagens?: Array<{ codigo: string; texto: string }> }

    if (parsed.status !== 200 || !parsed.dados) {
      const msg = parsed.mensagens?.map(m => m.texto).join('; ') || `Status ${parsed.status}`
      throw new Error(`Erro ao emitir DARF: ${msg}`)
    }

    const dadosResp = JSON.parse(parsed.dados) as {
      consolidado?: {
        valorPrincipalMoedaCorrente?: number
        valorTotalConsolidado?: number
        valorMultaMora?: number
        percentualMultaMora?: number
        valorJuros?: number
        percentualJuros?: number
        dataArrecadacaoConsolidacao?: string
        dataValidadeCalculo?: string
      }
      darf?: string
      numeroDocumento?: string
    }

    return {
      sucesso: true,
      consolidado: dadosResp.consolidado || null,
      darfPdfBase64: dadosResp.darf || null,
      numeroDocumento: dadosResp.numeroDocumento || null,
    }
  }

  async listClientesMensal(empresaId?: string, userId?: string, isMaster?: boolean) {
    // ISOLAMENTO MULTI-TENANT (ISO-001): SEMPRE filtra pela empresa da sessão.
    // `empresaId` nulo → default-deny (empresa_id IS NULL, ~vazio). NUNCA confiar
    // em empresaId do cliente — vem do ctx (sessão). O `select` (razaoSocial,
    // documento/CNPJ, alertaProcuracao) é PII de cliente — não pode vazar.
    const SELECT = { id: true, razaoSocial: true, documento: true, tipoDocumento: true, alertaProcuracao: true } as const
    const baseWhere = { deletedAt: null, situacao: 'MENSAL' as const, empresaId: empresaId ?? null }

    // Master vê todos os clientes mensais DA EMPRESA ATIVA.
    if (isMaster || !userId) {
      return prisma.cliente.findMany({ where: baseWhere, select: SELECT, orderBy: { razaoSocial: 'asc' } })
    }

    // Buscar role e areaId do usuário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, areaId: true },
    })
    if (!user) return []

    const { role, areaId } = user

    // Coordenador / Diretor: todos os clientes mensais com serviços contratados
    if (role === 'COORDENADOR' || role === 'DIRETOR') {
      return prisma.cliente.findMany({
        where: { ...baseWhere, servicosContratados: { some: { contratado: true } } },
        select: SELECT,
        orderBy: { razaoSocial: 'asc' },
      })
    }

    // Gestor: clientes que tenham a área dele contratada
    if (role === 'GESTOR') {
      if (!areaId) return []
      return prisma.cliente.findMany({
        where: { ...baseWhere, servicosContratados: { some: { contratado: true, areaId } } },
        select: SELECT,
        orderBy: { razaoSocial: 'asc' },
      })
    }

    // Colaborador Interno (e demais): clientes onde a área dele está contratada E ele é o responsável
    if (!areaId) return []
    return prisma.cliente.findMany({
      where: {
        ...baseWhere,
        servicosContratados: {
          some: {
            contratado: true,
            areaId,
            OR: [{ responsavelId: userId }, { substitutoId: userId }],
          },
        },
      },
      select: SELECT,
      orderBy: { razaoSocial: 'asc' },
    })
  }
}
