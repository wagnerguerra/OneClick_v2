import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import type { CaixaPostalPrioridade, CaixaPostalRegra } from '@saas/db'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { classificarMensagens, DEFAULT_CONFIG, type RawMessage, type ClassifiedMessage, type ClassifierConfig } from './caixapostal.classifier'
import { EmailService } from '../common/email.service'

// ============================================================
// Configuração
// ============================================================

const SERPRO_AUTH_URL = 'autenticacao.sapi.serpro.gov.br'
const SERPRO_GATEWAY = 'gateway.apiserpro.serpro.gov.br'
const INTEGRA_BASE = '/integra-contador/v1'
const REQUEST_TIMEOUT = 30000
const LOTE_DELAY_MS = Number(process.env.CAIXA_POSTAL_LOTE_DELAY_MS) || 3000

// ============================================================
// Helpers
// ============================================================

interface SerproTokens { accessToken: string; jwtToken: string }
interface HttpResponse { status: number; headers: Record<string, string>; data: string }

function httpsRequest(options: https.RequestOptions, postData?: string): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout SERPRO')), REQUEST_TIMEOUT)
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

function limparDocumento(doc: string | undefined | null): string {
  return (doc || '').toString().replace(/\D/g, '')
}

function validarDocumento(doc: string | undefined, tipo: number | string | undefined): string {
  if (!doc) throw new Error('Documento não informado')
  if (!tipo) throw new Error('Tipo de documento não informado (1=CPF, 2=CNPJ)')
  const d = limparDocumento(doc)
  const t = Number(tipo)
  if (t === 2 && d.length !== 14) throw new Error(`CNPJ inválido: esperado 14 dígitos, recebido ${d.length}`)
  if (t === 1 && d.length !== 11) throw new Error(`CPF inválido: esperado 11 dígitos, recebido ${d.length}`)
  if (t !== 1 && t !== 2) throw new Error(`Tipo inválido: ${tipo}`)
  return d
}

// ============================================================
// Service
// ============================================================

@Injectable()
export class CaixaPostalService {
  constructor(@Inject(EmailService) private readonly emailService: EmailService) {}

  private tokenCache: { tokens: SerproTokens; expiresAt: number } | null = null

  // ── Config ──────────────────────────────────────────────
  private async getConfig() {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA', 'CNPJ_CONTRATANTE'] } },
    })
    const map = new Map(configs.map(c => [c.key, c.value]))
    const consumerKey = map.get('CONSUMER_KEY') || process.env.CONSUMER_KEY || ''
    const consumerSecret = map.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET || ''
    const certSenha = map.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA || ''
    const cnpjContratante = (map.get('CNPJ_CONTRATANTE') || process.env.CNPJ_CONTRATANTE || '').replace(/\D/g, '')
    if (!consumerKey || !consumerSecret) throw new Error('Consumer Key/Secret não configurados.')
    if (!cnpjContratante || cnpjContratante.length !== 14) throw new Error('CNPJ do contratante inválido.')
    return { consumerKey, consumerSecret, certSenha, cnpjContratante }
  }

  private getCertPath(): string {
    const p = path.resolve(process.cwd(), 'uploads', 'certificado.pfx')
    if (!fs.existsSync(p)) throw new Error('Certificado digital (PFX) não encontrado.')
    return p
  }

  // ── OAuth2 ──────────────────────────────────────────────
  private async autenticar(forceRefresh = false): Promise<SerproTokens> {
    if (!forceRefresh && this.tokenCache && Date.now() < this.tokenCache.expiresAt - 60000) {
      return this.tokenCache.tokens
    }
    const config = await this.getConfig()
    const pfxBuffer = fs.readFileSync(this.getCertPath())
    const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64')
    const postData = 'grant_type=client_credentials'

    const res = await httpsRequest({
      hostname: SERPRO_AUTH_URL, port: 443, path: '/authenticate', method: 'POST',
      pfx: pfxBuffer, passphrase: config.certSenha,
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Role-Type': 'TERCEIROS',
        'Accept': 'application/json',
        'Content-Length': String(Buffer.byteLength(postData)),
      },
      rejectUnauthorized: true,
    }, postData)

    if (res.status !== 200) throw new Error(`Auth SERPRO falhou: HTTP ${res.status}`)
    const data = JSON.parse(res.data) as { access_token: string; jwt_token?: string; expires_in?: number }
    const tokens: SerproTokens = { accessToken: data.access_token, jwtToken: data.jwt_token || data.access_token }
    this.tokenCache = { tokens, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
    return tokens
  }

  // ── Chamada genérica SERPRO ──────────────────────────────
  private async callSerpro(body: object, endpoint: 'Consultar' | 'Monitorar'): Promise<{ status: number; data: unknown }> {
    let tokens = await this.autenticar()
    const bodyStr = JSON.stringify(body)

    const makeRequest = async (t: SerproTokens) => {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${t.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'text/plain',
        'Content-Length': String(Buffer.byteLength(bodyStr)),
      }
      if (t.jwtToken) headers['jwt_token'] = t.jwtToken

      return httpsRequest({
        hostname: SERPRO_GATEWAY, port: 443, path: `${INTEGRA_BASE}/${endpoint}`, method: 'POST',
        headers, rejectUnauthorized: true,
      }, bodyStr)
    }

    let res = await makeRequest(tokens)
    // Retry com token novo em 401
    if (res.status === 401) {
      tokens = await this.autenticar(true)
      res = await makeRequest(tokens)
    }

    let parsed: unknown
    try { parsed = JSON.parse(res.data) } catch { parsed = res.data }

    console.log(`[CaixaPostal] ${endpoint} HTTP ${res.status}`)
    return { status: res.status, data: parsed }
  }

  // ── Registrar cache ──────────────────────────────────────
  private async registrarCache(tipoOperacao: 'LISTAR' | 'DETALHAR' | 'INDICADOR', payload: object, resposta: unknown, sucesso: boolean, info: {
    isn?: string; statusLeitura?: string; contratante: string; contribuinte: string; statusHttp: number; erro?: string | null
  }) {
    try {
      await prisma.caixaPostalMensagem.create({
        data: {
          tipoOperacao, isn: info.isn, statusLeitura: info.statusLeitura,
          contratante: info.contratante, autorPedido: info.contratante, contribuinte: info.contribuinte,
          payloadRequisicao: payload as object, resposta: resposta as object,
          sucesso, erro: info.erro, statusHttp: info.statusHttp,
        },
      })
    } catch (e) {
      console.warn('[CaixaPostal] Falha ao registrar cache:', (e as Error).message)
    }
  }

  // ============================================================
  // API SERPRO — Caixa Postal
  // ============================================================

  private getContratante() {
    const cnpj = (process.env.CNPJ_CONTRATANTE || '').replace(/\D/g, '')
    return { contratante: { numero: cnpj, tipo: 2 }, autorPedidoDados: { numero: cnpj, tipo: 2 } }
  }

  async listarMensagens(contribuinte: { numero: string; tipo: number }, statusLeitura = '0', indicadorPagina = '0', ponteiroPagina = '00000000000000') {
    const { contratante, autorPedidoDados } = this.getContratante()
    const doc = validarDocumento(contribuinte.numero, contribuinte.tipo)

    const body = {
      contratante, autorPedidoDados,
      contribuinte: { numero: doc, tipo: contribuinte.tipo },
      pedidoDados: {
        idSistema: 'CAIXAPOSTAL', idServico: 'MSGCONTRIBUINTE61', versaoSistema: '2.0',
        dados: JSON.stringify({ statusLeitura, indicadorPagina, ponteiroPagina }),
      },
    }

    const res = await this.callSerpro(body, 'Consultar')
    const ok = res.status === 200
    await this.registrarCache('LISTAR', body, res.data, ok, {
      statusLeitura, contratante: contratante.numero, contribuinte: doc, statusHttp: res.status,
      erro: ok ? null : JSON.stringify(res.data).slice(0, 500),
    })
    if (!ok) throw new Error(`Erro SERPRO: HTTP ${res.status}`)
    return res.data
  }

  async detalharMensagem(contribuinte: { numero: string; tipo: number }, isn: string) {
    const { contratante, autorPedidoDados } = this.getContratante()
    const doc = validarDocumento(contribuinte.numero, contribuinte.tipo)

    const body = {
      contratante, autorPedidoDados,
      contribuinte: { numero: doc, tipo: contribuinte.tipo },
      pedidoDados: {
        idSistema: 'CAIXAPOSTAL', idServico: 'MSGDETALHAMENTO62', versaoSistema: '2.0',
        dados: JSON.stringify({ isn }),
      },
    }

    const res = await this.callSerpro(body, 'Consultar')
    const ok = res.status === 200
    await this.registrarCache('DETALHAR', body, res.data, ok, {
      isn, contratante: contratante.numero, contribuinte: doc, statusHttp: res.status,
      erro: ok ? null : JSON.stringify(res.data).slice(0, 500),
    })
    if (!ok) throw new Error(`Erro SERPRO: HTTP ${res.status}`)
    return res.data
  }

  async indicadorNovas(contribuinte: { numero: string; tipo: number }) {
    const { contratante, autorPedidoDados } = this.getContratante()
    const doc = validarDocumento(contribuinte.numero, contribuinte.tipo)

    const body = {
      contratante, autorPedidoDados,
      contribuinte: { numero: doc, tipo: contribuinte.tipo },
      pedidoDados: {
        idSistema: 'CAIXAPOSTAL', idServico: 'INNOVAMSG63', versaoSistema: '2.0', dados: '',
      },
    }

    const res = await this.callSerpro(body, 'Monitorar')
    const ok = res.status === 200
    await this.registrarCache('INDICADOR', body, res.data, ok, {
      contratante: contratante.numero, contribuinte: doc, statusHttp: res.status,
      erro: ok ? null : JSON.stringify(res.data).slice(0, 500),
    })
    if (!ok) throw new Error(`Erro SERPRO: HTTP ${res.status}`)
    return res.data
  }

  // ============================================================
  // Extração e classificação
  // ============================================================

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&aacute;/gi, 'á').replace(/&Aacute;/gi, 'Á')
      .replace(/&eacute;/gi, 'é').replace(/&Eacute;/gi, 'É')
      .replace(/&iacute;/gi, 'í').replace(/&Iacute;/gi, 'Í')
      .replace(/&oacute;/gi, 'ó').replace(/&Oacute;/gi, 'Ó')
      .replace(/&uacute;/gi, 'ú').replace(/&Uacute;/gi, 'Ú')
      .replace(/&agrave;/gi, 'à').replace(/&Agrave;/gi, 'À')
      .replace(/&atilde;/gi, 'ã').replace(/&Atilde;/gi, 'Ã')
      .replace(/&otilde;/gi, 'õ').replace(/&Otilde;/gi, 'Õ')
      .replace(/&ccedil;/gi, 'ç').replace(/&Ccedil;/gi, 'Ç')
      .replace(/&acirc;/gi, 'â').replace(/&Acirc;/gi, 'Â')
      .replace(/&ecirc;/gi, 'ê').replace(/&Ecirc;/gi, 'Ê')
      .replace(/&ocirc;/gi, 'ô').replace(/&Ocirc;/gi, 'Ô')
      .replace(/&uuml;/gi, 'ü').replace(/&Uuml;/gi, 'Ü')
      .replace(/&ntilde;/gi, 'ñ').replace(/&Ntilde;/gi, 'Ñ')
      .replace(/&ordm;/gi, 'º').replace(/&ordf;/gi, 'ª')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  }

  private resolverVariaveis(msg: RawMessage): RawMessage {
    let assunto = msg.assuntoModelo
    let descOrigem = msg.descricaoOrigem
    let origemMod = msg.origemModelo

    // Decodificar entidades HTML em todos os campos de texto
    if (assunto && typeof assunto === 'string') assunto = this.decodeHtmlEntities(assunto)
    if (descOrigem && typeof descOrigem === 'string') descOrigem = this.decodeHtmlEntities(descOrigem)
    if (origemMod && typeof origemMod === 'string') origemMod = this.decodeHtmlEntities(origemMod)

    let result = assunto || ''

    // Substituir ++1++, ++2++, etc. com valorParametroAssunto (pipe-separated)
    if (result.includes('++')) {
      const valorParam = (msg.valorParametroAssunto ?? msg.valorParametro) as string | undefined
      if (valorParam && typeof valorParam === 'string') {
        const params = valorParam.split('|')
        params.forEach((p, i) => {
          if (p) result = result.replace(new RegExp(`\\+\\+${i + 1}\\+\\+`, 'g'), p)
        })
      }

      // Fallback: usar outros campos conhecidos
      if (result.includes('++1++')) {
        const sub = (msg.niUsuario || msg.numeroControle || '') as string
        if (sub) result = result.replace(/\+\+1\+\+/g, sub)
      }
      if (result.includes('++2++')) {
        const dataStr = (msg.dataExpiracao || msg.dataEnvio || '') as string
        if (dataStr) result = result.replace(/\+\+2\+\+/g, dataStr)
      }

      // Tratar ++VARIAVEL++ genérico (sem número)
      result = result.replace(/\+\+VARIAVEL\+\+/g, () => {
        if (valorParam) return valorParam.split('|')[0] || ''
        return (msg.niUsuario || msg.numeroControle || '') as string
      })

      // Limpar qualquer placeholder restante
      result = result.replace(/\+\+[A-Z0-9_]+\+\+/g, '').replace(/\+\+\d+\+\+/g, '').trim()
    }

    return { ...msg, assuntoModelo: result, descricaoOrigem: descOrigem, origemModelo: origemMod }
  }

  private extrairMensagens(respostaApi: unknown): RawMessage[] {
    let dados = respostaApi
    if (typeof dados === 'string') {
      try { dados = JSON.parse(dados) } catch { return [] }
    }

    const obj = dados as Record<string, unknown>

    // conteudo[0].listaMensagens
    if (obj?.conteudo && Array.isArray(obj.conteudo) && obj.conteudo.length > 0) {
      const primeiro = obj.conteudo[0] as Record<string, unknown>
      if (Array.isArray(primeiro?.listaMensagens)) return primeiro.listaMensagens as RawMessage[]
    }

    // dados.dados aninhado
    if (obj?.dados) {
      const inner = typeof obj.dados === 'string' ? JSON.parse(obj.dados as string) : obj.dados
      const innerObj = inner as Record<string, unknown>
      if (innerObj?.conteudo && Array.isArray(innerObj.conteudo) && (innerObj.conteudo[0] as Record<string, unknown>)?.listaMensagens) {
        return ((innerObj.conteudo[0] as Record<string, unknown>).listaMensagens) as RawMessage[]
      }
    }

    return []
  }

  async consultarClassificadas(
    contribuinte: { numero: string; tipo: number },
    empresaId: string | null,
    opts?: { statusLeitura?: string; indicadorPagina?: string; ponteiroPagina?: string },
  ) {
    // 1. Buscar mensagens na API
    const dadosRaw = await this.listarMensagens(contribuinte, opts?.statusLeitura, opts?.indicadorPagina, opts?.ponteiroPagina)

    // 2. Parse (pode estar duplamente encodado)
    let dadosParsed = dadosRaw
    const raw = dadosRaw as Record<string, unknown>
    if (raw?.dados && typeof (raw.dados as Record<string, unknown>)?.dados === 'string') {
      dadosParsed = JSON.parse((raw.dados as Record<string, unknown>).dados as string)
    } else if (typeof dadosRaw === 'string') {
      dadosParsed = JSON.parse(dadosRaw)
    }

    // 3. Extrair mensagens e resolver variáveis nos assuntos
    const mensagensRaw = this.extrairMensagens(dadosParsed)
    if (mensagensRaw.length === 0) return { mensagens: [], mensagensClassificadas: [], totalMensagens: 0 }
    const mensagens = mensagensRaw.map(m => this.resolverVariaveis(m))

    // 4. Buscar regras e config da empresa
    const [regras, config] = await Promise.all([
      empresaId
        ? prisma.caixaPostalRegra.findMany({ where: { empresaId, ativo: true }, orderBy: { ordem: 'asc' } })
        : Promise.resolve([]),
      this.loadConfig(empresaId),
    ])

    // 5. Classificar
    const classificadas = await classificarMensagens(mensagens, regras, config)

    // 6. Salvar no banco
    await this.salvarMensagensClassificadas(classificadas, limparDocumento(contribuinte.numero), empresaId)

    // 6b. Executar ações automáticas
    const regrasComAcao = regras.filter(r => r.autoNotificar || r.autoNotificarLider || r.autoNotificarGerente || r.autoCriarTarefa || r.autoMarcarLida)
    if (regrasComAcao.length > 0) {
      const doc = limparDocumento(contribuinte.numero)
      const itemsSalvos = await prisma.caixaPostalItem.findMany({ where: { contribuinte: doc, ...(empresaId ? { empresaId } : {}) } })
      for (const item of itemsSalvos) {
        try {
          await this.executarAcoesAutomaticas(
            { ...item, acaoRecomendada: item.acaoRecomendada },
            regrasComAcao, empresaId,
          )
        } catch (e) { console.error(`[CaixaPostal] Ação automática falhou para item ${item.id}:`, (e as Error).message) }
      }
    }

    // 7. Mesclar com status de leitura do banco (incluindo arquivadas para filtrar)
    const doBanco = await this.buscarItemsDoBanco(limparDocumento(contribuinte.numero), empresaId, true)

    // Separar ISNs arquivados
    const arquivadosSet = new Set(
      doBanco.filter(d => d.arquivada === true).map(d => d.isn as string),
    )

    // Mesclar dados do banco com as classificadas (excluindo arquivadas)
    const mescladas = classificadas
      .filter(msg => !arquivadosSet.has(this.extrairIsn(msg) || ''))
      .map(msg => {
        const isn = this.extrairIsn(msg)
        const db = doBanco.find(m => m.isn === isn)
        if (db) return { ...msg, id: db.id, lida: db.lida, data_leitura: db.data_leitura ?? db.dataLeitura, usuario_id: db.user_id ?? db.userId, arquivada: db.arquivada ?? false, importante: db.importante ?? false }
        return msg
      })

    return { mensagens, mensagensClassificadas: mescladas, totalMensagens: mescladas.length }
  }

  // ============================================================
  // CRUD local (banco)
  // ============================================================

  private extrairIsn(msg: RawMessage): string | null {
    return msg.isn || msg.ISN || msg.id as string ||
      (msg.codigoSistemaRemetente && msg.dataEnvio && msg.horaEnvio
        ? `${msg.codigoSistemaRemetente}${msg.dataEnvio}${msg.horaEnvio}`
        : msg.numeroControle?.trim() || null)
  }

  private async salvarMensagensClassificadas(mensagens: ClassifiedMessage[], contribuinte: string, empresaId: string | null) {
    // Buscar ISNs arquivados para não sobrescrever
    const arquivados = await prisma.$queryRawUnsafe<Array<{ isn: string }>>(
      `SELECT isn FROM caixa_postal_item WHERE contribuinte = $1 AND arquivada = true`,
      contribuinte,
    )
    const isnsArquivados = new Set(arquivados.map(a => a.isn))

    for (const msg of mensagens) {
      const isn = this.extrairIsn(msg)
      if (!isn) continue

      // Não sobrescrever mensagens arquivadas
      if (isnsArquivados.has(isn)) continue

      const data = {
        mensagemOriginal: msg as object,
        prioridade: msg.prioridade as CaixaPostalPrioridade,
        score: msg.score,
        motivos: msg.motivos as object,
        acaoRecomendada: msg.acao_recomendada,
        slaDias: msg.sla_dias,
        prazoUrgente: msg.prazo_urgente,
        precisaTriagemHumana: msg.precisa_triagem_humana,
        empresaId,
      }

      await prisma.caixaPostalItem.upsert({
        where: { isn_contribuinte: { isn, contribuinte } },
        create: { isn, contribuinte, ...data },
        update: data,
      })
    }
  }

  private async buscarItemsDoBanco(contribuinte: string, empresaId: string | null, incluirArquivadas = false) {
    const params: unknown[] = [contribuinte]
    let paramIdx = 2
    let empFilter = 'AND empresa_id IS NULL'
    if (empresaId) { empFilter = `AND empresa_id = $${paramIdx}`; params.push(empresaId); paramIdx++ }
    const archFilter = !incluirArquivadas ? 'AND arquivada = false' : ''
    return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM caixa_postal_item
       WHERE contribuinte = $1 ${empFilter} ${archFilter}
       ORDER BY importante DESC, COALESCE(mensagem_original->>'dataEnvio', '') DESC, created_at DESC`,
      ...params,
    )
  }

  async listCache(contribuinte: { numero: string; tipo: number }, empresaId: string | null, incluirArquivadas = false) {
    const doc = validarDocumento(contribuinte.numero, contribuinte.tipo)
    const items = await this.buscarItemsDoBanco(doc, empresaId, incluirArquivadas)
    if (items.length === 0) throw new Error('Nenhuma mensagem em cache. Consulte primeiro.')

    return {
      mensagensClassificadas: items.map(row => {
        const original = (row.mensagem_original || row.mensagemOriginal) as RawMessage
        const resolved = this.resolverVariaveis(original)
        return {
          ...resolved,
          id: row.id,
          isn: row.isn,
          prioridade: row.prioridade,
          score: row.score,
          motivos: row.motivos,
          acao_recomendada: row.acao_recomendada ?? row.acaoRecomendada,
          sla_dias: row.sla_dias ?? row.slaDias,
          prazo_urgente: row.prazo_urgente ?? row.prazoUrgente,
          precisa_triagem_humana: row.precisa_triagem_humana ?? row.precisaTriagemHumana,
          lida: row.lida,
          data_leitura: row.data_leitura ?? row.dataLeitura,
          usuario_id: row.user_id ?? row.userId,
          arquivada: row.arquivada ?? false,
          importante: row.importante ?? false,
        }
      }),
      totalMensagens: items.length,
    }
  }

  async marcarLida(isn: string, contribuinte: string, userId?: string) {
    const doc = limparDocumento(contribuinte)
    const existing = await prisma.caixaPostalItem.findUnique({ where: { isn_contribuinte: { isn, contribuinte: doc } } })
    const wasUnread = existing ? !existing.lida : true

    await prisma.caixaPostalItem.upsert({
      where: { isn_contribuinte: { isn, contribuinte: doc } },
      create: { isn, contribuinte: doc, mensagemOriginal: {}, prioridade: 'P3', lida: true, dataLeitura: new Date(), userId },
      update: { lida: true, dataLeitura: new Date(), userId },
    })

    // Registrar evento de leitura apenas se estava não lida
    if (wasUnread && existing && userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      await this.registrarEvento(existing.id, userId, 'LEITURA', `Mensagem lida por ${user?.name || 'Usuário'}`)
    }

    return { mensagem: 'Mensagem marcada como lida' }
  }

  async marcarLidasLote(itemIds: string[], userId: string) {
    const items = await prisma.caixaPostalItem.findMany({
      where: { id: { in: itemIds }, lida: false },
      select: { id: true },
    })
    if (items.length === 0) return { total: 0 }

    await prisma.caixaPostalItem.updateMany({
      where: { id: { in: itemIds } },
      data: { lida: true, dataLeitura: new Date(), userId },
    })

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    for (const item of items) {
      await this.registrarEvento(item.id, userId, 'LEITURA', `Mensagem lida por ${user?.name || 'Usuário'} (lote)`)
    }

    return { total: items.length }
  }

  async marcarNaoLidasLote(itemIds: string[], userId: string) {
    await prisma.caixaPostalItem.updateMany({
      where: { id: { in: itemIds } },
      data: { lida: false, dataLeitura: null },
    })

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    for (const id of itemIds) {
      await this.registrarEvento(id, userId, 'LEITURA', `Mensagem marcada como não lida por ${user?.name || 'Usuário'} (lote)`)
    }

    return { total: itemIds.length }
  }

  async marcarNaoLida(isn: string, contribuinte: string) {
    const doc = limparDocumento(contribuinte)
    const result = await prisma.caixaPostalItem.updateMany({
      where: { isn, contribuinte: doc },
      data: { lida: false, dataLeitura: null },
    })
    if (result.count === 0) throw new Error(`Mensagem ${isn} não encontrada`)
    return { mensagem: 'Mensagem marcada como não lida' }
  }

  // ============================================================
  // Resolver empresa (fallback para a primeira empresa ativa)
  // ============================================================

  async resolverEmpresaId(): Promise<string> {
    const empresa = await prisma.empresa.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
    if (!empresa) throw new Error('Nenhuma empresa cadastrada no sistema.')
    return empresa.id
  }

  // ============================================================
  // Configuração do classificador
  // ============================================================

  async getClassifierConfig(empresaId: string): Promise<ClassifierConfig> {
    const rows = await prisma.$queryRawUnsafe<Array<{ config: unknown }>>(
      `SELECT config FROM caixa_postal_config WHERE empresa_id = $1 LIMIT 1`,
      empresaId,
    )
    if (!rows.length) return { ...DEFAULT_CONFIG }
    return this.mergeConfig(rows[0]!.config as Partial<ClassifierConfig>)
  }

  async updateClassifierConfig(empresaId: string, config: ClassifierConfig): Promise<ClassifierConfig> {
    const json = JSON.stringify(config)
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM caixa_postal_config WHERE empresa_id = $1 LIMIT 1`,
      empresaId,
    )
    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE caixa_postal_config SET config = $1::jsonb, updated_at = NOW() WHERE empresa_id = $2`,
        json, empresaId,
      )
    } else {
      const id = `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      await prisma.$executeRawUnsafe(
        `INSERT INTO caixa_postal_config (id, empresa_id, config, updated_at) VALUES ($1, $2, $3::jsonb, NOW())`,
        id, empresaId, json,
      )
    }
    return config
  }

  async resetClassifierConfig(empresaId: string): Promise<ClassifierConfig> {
    await prisma.$executeRawUnsafe(
      `DELETE FROM caixa_postal_config WHERE empresa_id = $1`,
      empresaId,
    )
    return { ...DEFAULT_CONFIG }
  }

  private mergeConfig(partial: Partial<ClassifierConfig>): ClassifierConfig {
    return {
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...partial.thresholds },
      keywords: {
        criticas: { ...DEFAULT_CONFIG.keywords.criticas, ...partial.keywords?.criticas },
        medias: { ...DEFAULT_CONFIG.keywords.medias, ...partial.keywords?.medias },
        baixas: { ...DEFAULT_CONFIG.keywords.baixas, ...partial.keywords?.baixas },
      },
      deadline: { ...DEFAULT_CONFIG.deadline, ...partial.deadline },
      relevance: { ...DEFAULT_CONFIG.relevance, ...partial.relevance },
      unread: { ...DEFAULT_CONFIG.unread, ...partial.unread },
      acoesRecomendadas: { ...DEFAULT_CONFIG.acoesRecomendadas, ...partial.acoesRecomendadas },
    }
  }

  private async loadConfig(empresaId: string | null): Promise<ClassifierConfig> {
    if (!empresaId) return { ...DEFAULT_CONFIG }
    return this.getClassifierConfig(empresaId)
  }

  // ============================================================
  // Totalizadores e status
  // ============================================================

  async totalizadores(empresaId: string | null) {
    const params: unknown[] = []
    // Default-deny: sem empresa no contexto, nunca conta itens de outra empresa
    let empFilter = 'AND empresa_id IS NULL'
    if (empresaId) { empFilter = 'AND empresa_id = $1'; params.push(empresaId) }
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE lida = true)::int as lidas,
        COUNT(*) FILTER (WHERE lida = false AND prioridade = 'P0')::int as p0,
        COUNT(*) FILTER (WHERE lida = false AND prioridade = 'P1')::int as p1,
        COUNT(*) FILTER (WHERE lida = false AND prioridade = 'P2')::int as p2,
        COUNT(*) FILTER (WHERE lida = false AND prioridade = 'P3')::int as p3,
        COUNT(*) FILTER (WHERE importante = true)::int as importantes
      FROM caixa_postal_item WHERE arquivada = false ${empFilter}
    `, ...params)
    const r = rows[0]!
    const total = Number(r.total ?? 0)
    const lidas = Number(r.lidas ?? 0)
    return {
      total, lidas, naoLidas: total - lidas,
      naoLidasP0: Number(r.p0 ?? 0), naoLidasP1: Number(r.p1 ?? 0),
      naoLidasP2: Number(r.p2 ?? 0), naoLidasP3: Number(r.p3 ?? 0),
      importantes: Number(r.importantes ?? 0),
    }
  }

  async status(contribuinte: string, empresaId: string | null) {
    const doc = limparDocumento(contribuinte)
    const params: unknown[] = [doc]
    let empFilter = 'AND empresa_id IS NULL'
    if (empresaId) { empFilter = 'AND empresa_id = $2'; params.push(empresaId) }
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE lida = true)::int as lidas,
              MAX(updated_at) as ultima_sync
       FROM caixa_postal_item WHERE contribuinte = $1 AND arquivada = false ${empFilter}`,
      ...params,
    )
    const total = Number(rows[0]?.total ?? 0)
    const lidas = Number(rows[0]?.lidas ?? 0)
    const naoLidas = total - lidas
    const ultimaSync = rows[0]?.ultima_sync ? (rows[0].ultima_sync instanceof Date ? rows[0].ultima_sync.toISOString() : String(rows[0].ultima_sync)) : null
    if (total === 0) return { status: null, total: 0, lidas: 0, nao_lidas: 0, ultima_sync: null }
    return { status: naoLidas === 0 ? 'TODAS LIDAS' : 'NÃO LIDAS', total, lidas, nao_lidas: naoLidas, ultima_sync: ultimaSync }
  }

  async listarPorPrioridade(
    prioridade: string | undefined,
    empresaId: string | null,
    apenasImportantes = false,
  ) {
    const params: unknown[] = []
    let paramIdx = 1
    let empFilter = 'AND empresa_id IS NULL'
    let prioFilter = ''
    const impFilter = apenasImportantes ? 'AND importante = true' : ''
    if (empresaId) { empFilter = `AND empresa_id = $${paramIdx}`; params.push(empresaId); paramIdx++ }
    if (prioridade) { prioFilter = `AND prioridade = $${paramIdx}::"CaixaPostalPrioridade"`; params.push(prioridade); paramIdx++ }

    const items = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM caixa_postal_item
       WHERE arquivada = false ${apenasImportantes ? '' : 'AND lida = false'} ${empFilter} ${prioFilter} ${impFilter}
       ORDER BY importante DESC, COALESCE(mensagem_original->>'dataEnvio', '') DESC, created_at DESC`,
      ...params,
    )

    // Buscar nomes dos clientes pelo contribuinte
    const contribuintes = [...new Set(items.map(i => i.contribuinte as string))]
    const clientes = contribuintes.length > 0
      ? await prisma.$queryRawUnsafe<Array<{ documento: string; razao_social: string; situacao: string }>>(
          `SELECT documento, razao_social, situacao FROM clientes
           WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = ANY($1::text[])
           ORDER BY CASE situacao WHEN 'MENSAL' THEN 0 ELSE 1 END, razao_social`,
          contribuintes,
        )
      : []
    const nomeMap: Record<string, string> = {}
    for (const c of clientes) {
      const docLimpo = c.documento.replace(/\D/g, '')
      // ORDER BY já garante MENSAL primeiro + alfabético; pegar o primeiro
      if (!nomeMap[docLimpo]) {
        nomeMap[docLimpo] = c.razao_social
      }
    }

    return {
      mensagens: items.map(row => {
        const resolved = this.resolverVariaveis((row.mensagem_original || row.mensagemOriginal) as RawMessage)
        return {
          ...resolved,
          id: row.id,
          isn: row.isn,
          contribuinte: row.contribuinte as string,
          clienteNome: nomeMap[row.contribuinte as string] || row.contribuinte,
          prioridade: row.prioridade,
          score: row.score,
          motivos: row.motivos,
          acao_recomendada: row.acao_recomendada ?? row.acaoRecomendada,
          sla_dias: row.sla_dias ?? row.slaDias,
          prazo_urgente: row.prazo_urgente ?? row.prazoUrgente,
          precisa_triagem_humana: row.precisa_triagem_humana ?? row.precisaTriagemHumana,
          lida: row.lida,
          importante: row.importante ?? false,
          data_leitura: row.data_leitura ?? row.dataLeitura,
        }
      }),
      total: items.length,
    }
  }

  async statusLote(documentos: string[], empresaId: string | null) {
    const docs = documentos.map(d => limparDocumento(d)).filter(Boolean)
    const resultado: Record<string, { status: string | null; total: number; lidas: number; nao_lidas: number }> = {}
    for (const doc of docs) {
      resultado[doc] = await this.status(doc, empresaId)
    }
    return resultado
  }

  // ============================================================
  // Inativação de clientes
  // ============================================================

  async inativarCliente(clienteId: string) {
    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: clienteId } })
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { situacao: 'PARALIZADO' },
    })
    return { id: clienteId, razaoSocial: cliente.razaoSocial }
  }

  async inativarClientesLote(clienteIds: string[]) {
    const result = await prisma.cliente.updateMany({
      where: { id: { in: clienteIds }, situacao: 'MENSAL' },
      data: { situacao: 'PARALIZADO' },
    })
    return { total: result.count }
  }

  // ============================================================
  // Operações em lote
  // ============================================================

  async consultarNovasLote(empresaId: string | null) {
    const clientes = await prisma.cliente.findMany({
      where: { deletedAt: null, ...(empresaId ? { empresaId } : {}) },
      select: { documento: true, tipoDocumento: true },
    })
    const resultados: Array<{ documento: string; sucesso: boolean; dados?: unknown; erro?: string }> = []
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      const tipo = c.tipoDocumento === 'CPF' ? 1 : 2
      try {
        const dados = await this.indicadorNovas({ numero: c.documento, tipo })
        resultados.push({ documento: c.documento, sucesso: true, dados })
      } catch (e) {
        resultados.push({ documento: c.documento, sucesso: false, erro: (e as Error).message })
      }
      if (i < clientes.length - 1) await sleep(LOTE_DELAY_MS)
    }
    return resultados
  }

  async classificarLote(empresaId: string | null) {
    const clientes = await prisma.cliente.findMany({
      where: { deletedAt: null, ...(empresaId ? { empresaId } : {}) },
      select: { documento: true, tipoDocumento: true },
    })
    const resultados: Array<{ documento: string; sucesso: boolean; total?: number; erro?: string }> = []
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      const tipo = c.tipoDocumento === 'CPF' ? 1 : 2
      try {
        const res = await this.consultarClassificadas({ numero: c.documento, tipo }, empresaId)
        resultados.push({ documento: c.documento, sucesso: true, total: res.totalMensagens })
      } catch (e) {
        resultados.push({ documento: c.documento, sucesso: false, erro: (e as Error).message })
      }
      if (i < clientes.length - 1) await sleep(LOTE_DELAY_MS)
    }
    return resultados
  }

  // ============================================================
  // Limpeza
  // ============================================================

  async excluirCache(documentos: string[]) {
    const docs = documentos.map(d => limparDocumento(d)).filter(Boolean)
    if (docs.length === 0) throw new Error('Nenhum documento informado')

    const [resMensagens, resItens] = await Promise.all([
      prisma.caixaPostalMensagem.deleteMany({ where: { contribuinte: { in: docs } } }),
      prisma.caixaPostalItem.deleteMany({ where: { contribuinte: { in: docs } } }),
    ])
    return { contribuintes: docs.length, removidosMensagens: resMensagens.count, removidosItens: resItens.count }
  }

  async limparTudo() {
    const [totalItens, totalCache] = await Promise.all([
      prisma.caixaPostalItem.count(),
      prisma.caixaPostalMensagem.count(),
    ])
    await Promise.all([
      prisma.caixaPostalItem.deleteMany(),
      prisma.caixaPostalMensagem.deleteMany(),
    ])
    return { itensExcluidos: totalItens, cacheExcluido: totalCache, totalExcluido: totalItens + totalCache }
  }

  // ============================================================
  // CRUD Regras de classificação
  // ============================================================

  async listarRegras(empresaId: string) {
    return prisma.caixaPostalRegra.findMany({ where: { empresaId }, orderBy: [{ ordem: 'asc' }, { createdAt: 'desc' }] })
  }

  async buscarRegra(id: string, empresaId: string) {
    return prisma.caixaPostalRegra.findFirst({ where: { id, empresaId } })
  }

  async criarRegra(dados: {
    nome: string; descricao?: string; tipo: 'PRIORIDADE' | 'RELEVANCIA' | 'DESCONSIDERAR'
    ativo?: boolean; ordem?: number; palavrasChave?: string; origemContem?: string
    assuntoContem?: string; codigoSistema?: string; pesoScore?: number
    prioridadeMinima?: CaixaPostalPrioridade; marcarRelevante?: boolean; desconsiderarSePesoMenor?: number
    autoNotificar?: boolean; autoNotificarLider?: boolean; autoNotificarGerente?: boolean
    autoCriarTarefa?: boolean; autoMarcarLida?: boolean; emailsExtras?: string
  }, empresaId: string, userId?: string) {
    return prisma.caixaPostalRegra.create({
      data: {
        empresaId,
        nome: dados.nome,
        descricao: dados.descricao,
        tipo: dados.tipo,
        ativo: dados.ativo ?? true,
        ordem: dados.ordem ?? 0,
        palavrasChave: dados.palavrasChave,
        origemContem: dados.origemContem,
        assuntoContem: dados.assuntoContem,
        codigoSistema: dados.codigoSistema,
        pesoScore: dados.pesoScore ?? 0,
        prioridadeMinima: dados.prioridadeMinima,
        marcarRelevante: dados.marcarRelevante ?? false,
        desconsiderarSePesoMenor: dados.desconsiderarSePesoMenor,
        autoNotificar: dados.autoNotificar ?? false,
        autoNotificarLider: dados.autoNotificarLider ?? false,
        autoNotificarGerente: dados.autoNotificarGerente ?? false,
        autoCriarTarefa: dados.autoCriarTarefa ?? false,
        autoMarcarLida: dados.autoMarcarLida ?? false,
        emailsExtras: dados.emailsExtras,
        criadoPor: userId,
      },
    })
  }

  async atualizarRegra(id: string, dados: Record<string, unknown>, empresaId: string) {
    const existing = await prisma.caixaPostalRegra.findFirst({ where: { id, empresaId } })
    if (!existing) throw new Error('Regra não encontrada')
    return prisma.caixaPostalRegra.update({ where: { id }, data: dados })
  }

  async excluirRegra(id: string, empresaId: string) {
    const existing = await prisma.caixaPostalRegra.findFirst({ where: { id, empresaId } })
    if (!existing) throw new Error('Regra não encontrada')
    await prisma.caixaPostalRegra.delete({ where: { id } })
    return true
  }

  // ============================================================
  // Ações automáticas
  // ============================================================

  async executarAcoesAutomaticas(
    item: { id: string; isn: string; contribuinte: string; prioridade: string; score: number; acaoRecomendada: string | null; mensagemOriginal: unknown },
    regrasAplicadas: CaixaPostalRegra[],
    empresaId: string | null,
  ) {
    for (const regra of regrasAplicadas) {
      if (!regra.autoNotificar && !regra.autoNotificarLider && !regra.autoNotificarGerente && !regra.autoCriarTarefa && !regra.autoMarcarLida) continue

      const msg = item.mensagemOriginal as Record<string, unknown>
      const assunto = (msg.assuntoModelo || 'Mensagem e-CAC') as string

      // Auto marcar lida
      if (regra.autoMarcarLida) {
        try {
          await prisma.caixaPostalItem.update({ where: { id: item.id }, data: { lida: true, dataLeitura: new Date() } })
          await this.registrarAcaoLog(item.id, regra.id, empresaId, 'AUTO_LIDA', { regra: regra.nome })
        } catch (e) {
          await this.registrarAcaoLog(item.id, regra.id, empresaId, 'AUTO_LIDA', { regra: regra.nome }, false, (e as Error).message)
        }
      }

      // Notificações por e-mail
      const destinatarios: string[] = []

      if (regra.autoNotificar && empresaId) {
        // Buscar responsável fiscal (usuários ativos da empresa)
        const users = await prisma.user.findMany({ where: { empresaId, isActive: true }, select: { email: true } })
        destinatarios.push(...users.map(u => u.email))
      }

      if (regra.autoNotificarLider && empresaId) {
        // Buscar líderes de área
        const areas = await prisma.area.findMany({ where: { empresaId }, select: { email: true } })
        destinatarios.push(...areas.filter(a => a.email).map(a => a.email!))
      }

      if (regra.autoNotificarGerente) {
        // Buscar MASTER/ADMIN
        const admins = await prisma.user.findMany({
          where: { role: { in: ['MASTER', 'ADMIN'] as never[] }, isActive: true },
          select: { email: true },
        })
        destinatarios.push(...admins.map(u => u.email))
      }

      if (regra.emailsExtras) {
        destinatarios.push(...regra.emailsExtras.split(',').map(e => e.trim()).filter(Boolean))
      }

      const emailsUnicos = [...new Set(destinatarios)].filter(Boolean)

      if (emailsUnicos.length > 0) {
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px">
            <h2 style="color:#0ea5e9">Caixa Postal e-CAC — ${item.prioridade}</h2>
            <p><strong>Contribuinte:</strong> ${item.contribuinte}</p>
            <p><strong>Assunto:</strong> ${assunto}</p>
            <p><strong>Prioridade:</strong> ${item.prioridade} (Score: ${item.score}/100)</p>
            ${item.acaoRecomendada ? `<p><strong>Ação recomendada:</strong> ${item.acaoRecomendada}</p>` : ''}
            <p><strong>Regra aplicada:</strong> ${regra.nome}</p>
            <hr style="border:none;border-top:1px solid #e5e5e5;margin:16px 0">
            <p style="font-size:12px;color:#999">Este e-mail foi enviado automaticamente pelo sistema OneClick ERP.</p>
          </div>
        `
        const ok = await this.emailService.sendMail({
          to: emailsUnicos,
          subject: `[${item.prioridade}] Caixa Postal e-CAC — ${assunto}`,
          html,
        })
        await this.registrarAcaoLog(item.id, regra.id, empresaId, 'NOTIFICACAO', { destinatarios: emailsUnicos, assunto }, ok, ok ? undefined : 'Falha no envio')
      }

      // Criar tarefa (log para integração futura com módulo Obrigações/HelpDesk)
      if (regra.autoCriarTarefa) {
        await this.registrarAcaoLog(item.id, regra.id, empresaId, 'TAREFA', {
          regra: regra.nome, assunto, prioridade: item.prioridade, contribuinte: item.contribuinte,
        })
      }
    }
  }

  private async registrarAcaoLog(
    itemId: string, regraId: string | null, empresaId: string | null,
    tipoAcao: string, detalhes: Record<string, unknown>, sucesso = true, erro?: string,
  ) {
    try {
      await prisma.caixaPostalAcaoLog.create({
        data: { itemId, regraId, empresaId, tipoAcao, detalhes: detalhes as object, sucesso, erro },
      })
    } catch (e) {
      console.error('[CaixaPostal] Erro ao registrar log de ação:', (e as Error).message)
    }
  }

  // ============================================================
  // Reclassificação
  // ============================================================

  async reclassificarMensagem(itemId: string, empresaId: string | null) {
    const item = await prisma.caixaPostalItem.findUniqueOrThrow({ where: { id: itemId } })
    const [regras, config] = await Promise.all([
      empresaId
        ? prisma.caixaPostalRegra.findMany({ where: { empresaId, ativo: true }, orderBy: { ordem: 'asc' } })
        : Promise.resolve([]),
      this.loadConfig(empresaId),
    ])

    const msg = item.mensagemOriginal as RawMessage
    const classificadas = await classificarMensagens([msg], regras, config)

    if (classificadas.length === 0) return item

    const c = classificadas[0]!
    const updated = await prisma.caixaPostalItem.update({
      where: { id: itemId },
      data: {
        prioridade: c.prioridade as CaixaPostalPrioridade,
        score: c.score,
        motivos: c.motivos as object,
        acaoRecomendada: c.acao_recomendada,
        slaDias: c.sla_dias,
        prazoUrgente: c.prazo_urgente,
        precisaTriagemHumana: c.precisa_triagem_humana,
      },
    })

    // Registrar log
    await this.registrarAcaoLog(itemId, null, empresaId, 'RECLASSIFICACAO', {
      prioridadeAnterior: item.prioridade, prioridadeNova: c.prioridade,
      scoreAnterior: item.score, scoreNovo: c.score,
    })

    // Executar ações automáticas das regras aplicadas
    const regrasComAcao = regras.filter(r => r.autoNotificar || r.autoNotificarLider || r.autoNotificarGerente || r.autoCriarTarefa || r.autoMarcarLida)
    if (regrasComAcao.length > 0) {
      await this.executarAcoesAutomaticas({ ...updated, mensagemOriginal: item.mensagemOriginal, acaoRecomendada: c.acao_recomendada }, regrasComAcao, empresaId)
    }

    return updated
  }

  async reclassificarTodas(contribuinte: string, empresaId: string | null) {
    const doc = limparDocumento(contribuinte)
    const items = await prisma.caixaPostalItem.findMany({
      where: { contribuinte: doc, ...(empresaId ? { empresaId } : {}) },
    })

    let reclassificados = 0
    for (const item of items) {
      await this.reclassificarMensagem(item.id, empresaId)
      reclassificados++
    }

    return { reclassificados, total: items.length }
  }

  // ============================================================
  // Log de eventos e gestão de mensagens
  // ============================================================

  private async registrarEvento(
    itemId: string, userId: string | undefined, tipo: string, descricao: string, detalhes?: object,
  ) {
    const id = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await prisma.$executeRawUnsafe(
      `INSERT INTO caixa_postal_event_log (id, item_id, user_id, tipo, descricao, detalhes, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
      id, itemId, userId || null, tipo, descricao, detalhes ? JSON.stringify(detalhes) : null,
    )
  }

  async listarEventos(itemId: string) {
    const eventos = await prisma.$queryRawUnsafe<Array<{
      id: string; item_id: string; user_id: string | null; tipo: string;
      descricao: string; detalhes: unknown; created_at: Date
    }>>(
      `SELECT e.id, e.item_id, e.user_id, e.tipo, e.descricao, e.detalhes, e.created_at,
              u.name as user_name, u.email as user_email
       FROM caixa_postal_event_log e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.item_id = $1
       ORDER BY e.created_at DESC`,
      itemId,
    )
    return eventos
  }

  async getItemByIsn(isn: string, contribuinte: string) {
    const doc = limparDocumento(contribuinte)
    const items = await prisma.caixaPostalItem.findMany({
      where: { isn, contribuinte: doc },
      take: 1,
    })
    return items[0] || null
  }

  async getItemDetalhes(itemId: string) {
    // Buscar item com campos extras via raw
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT i.*, i.responsavel_id, i.status, i.observacoes,
              ur.name as responsavel_nome, ur.email as responsavel_email,
              ul.name as leitor_nome
       FROM caixa_postal_item i
       LEFT JOIN users ur ON ur.id = i.responsavel_id
       LEFT JOIN users ul ON ul.id = i.user_id
       WHERE i.id = $1`,
      itemId,
    )
    if (!rows.length) throw new Error('Item não encontrado')
    const row = rows[0]!

    // Buscar eventos
    const eventos = await this.listarEventos(itemId)

    const resolved = this.resolverVariaveis(row.mensagem_original as RawMessage)

    return {
      id: row.id,
      isn: row.isn,
      contribuinte: row.contribuinte,
      empresaId: row.empresa_id,
      mensagemOriginal: resolved,
      prioridade: row.prioridade,
      score: row.score,
      motivos: row.motivos,
      acaoRecomendada: row.acao_recomendada,
      slaDias: row.sla_dias,
      prazoUrgente: row.prazo_urgente,
      precisaTriagemHumana: row.precisa_triagem_humana,
      lida: row.lida,
      dataLeitura: row.data_leitura,
      userId: row.user_id,
      responsavelId: row.responsavel_id,
      status: row.status || 'pendente',
      observacoes: row.observacoes,
      responsavelNome: row.responsavel_nome || null,
      leitorNome: row.leitor_nome || null,
      eventos,
    }
  }

  // Registrar leitura com evento
  async registrarLeitura(isn: string, contribuinte: string, userId: string) {
    const doc = limparDocumento(contribuinte)
    const item = await prisma.caixaPostalItem.findFirst({ where: { isn, contribuinte: doc } })
    if (!item) return

    // Marcar como lida
    await prisma.caixaPostalItem.update({
      where: { id: item.id },
      data: { lida: true, dataLeitura: new Date(), userId },
    })

    // Buscar nome do usuário
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })

    await this.registrarEvento(item.id, userId, 'LEITURA', `Mensagem lida por ${user?.name || 'Usuário'}`)
  }

  // Definir responsável
  async definirResponsavel(itemId: string, responsavelId: string, userId: string) {
    // Buscar responsavel anterior via raw
    const rows = await prisma.$queryRawUnsafe<Array<{ responsavel_id: string | null }>>(
      `SELECT responsavel_id FROM caixa_postal_item WHERE id = $1`, itemId,
    )
    if (!rows.length) throw new Error('Item não encontrado')
    const anteriorId = rows[0]!.responsavel_id

    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET responsavel_id = $1, updated_at = NOW() WHERE id = $2`,
      responsavelId, itemId,
    )

    const [responsavel, anterior, autor] = await Promise.all([
      prisma.user.findUnique({ where: { id: responsavelId }, select: { name: true } }),
      anteriorId ? prisma.user.findUnique({ where: { id: anteriorId }, select: { name: true } }) : null,
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ])

    const desc = anteriorId
      ? `Responsável alterado de "${anterior?.name || '—'}" para "${responsavel?.name || '—'}" por ${autor?.name || 'Usuário'}`
      : `Responsável definido como "${responsavel?.name || '—'}" por ${autor?.name || 'Usuário'}`

    await this.registrarEvento(itemId, userId, 'RESPONSAVEL', desc, {
      responsavelAnterior: anteriorId, responsavelNovo: responsavelId,
    })

    return { mensagem: 'Responsável definido com sucesso' }
  }

  // Alterar status
  async alterarStatus(itemId: string, status: string, userId: string) {
    const item = await prisma.caixaPostalItem.findUniqueOrThrow({ where: { id: itemId } })
    const statusAnterior = (item as Record<string, unknown>).status as string || 'pendente'

    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET status = $1, updated_at = NOW() WHERE id = $2`,
      status, itemId,
    )

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })

    const statusLabels: Record<string, string> = {
      pendente: 'Pendente', em_andamento: 'Em Andamento', concluido: 'Concluído', arquivado: 'Arquivado',
    }

    await this.registrarEvento(itemId, userId, 'STATUS', `Status alterado de "${statusLabels[statusAnterior] || statusAnterior}" para "${statusLabels[status] || status}" por ${user?.name || 'Usuário'}`, {
      statusAnterior, statusNovo: status,
    })

    return { mensagem: 'Status atualizado' }
  }

  // Adicionar observação
  async adicionarObservacao(itemId: string, texto: string, userId: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET observacoes = $1, updated_at = NOW() WHERE id = $2`,
      texto, itemId,
    )

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    await this.registrarEvento(itemId, userId, 'OBSERVACAO', `Observação adicionada por ${user?.name || 'Usuário'}`, { texto })

    return { mensagem: 'Observação salva' }
  }

  // Encaminhar mensagem (registrar evento + enviar e-mail opcional)
  async encaminharMensagem(itemId: string, destinatarioIds: string[], observacao: string | undefined, userId: string, enviarEmail = false) {
    const destinatarios = await prisma.user.findMany({
      where: { id: { in: destinatarioIds } },
      select: { id: true, name: true, email: true },
    })

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    const nomes = destinatarios.map(d => d.name).join(', ')

    // Buscar dados da mensagem para o e-mail
    const item = await prisma.caixaPostalItem.findUnique({ where: { id: itemId } })
    const original = item ? this.resolverVariaveis(item.mensagemOriginal as RawMessage) : null
    const assunto = original?.assuntoModelo || 'Mensagem da Caixa Postal e-CAC'
    const origem = original?.descricaoOrigem || original?.origemModelo || '—'
    const dataEnvio = original?.dataEnvio || '—'

    await this.registrarEvento(itemId, userId, 'ENCAMINHAMENTO', `Mensagem encaminhada para ${nomes} por ${user?.name || 'Usuário'}${enviarEmail ? ' (com e-mail)' : ''}`, {
      destinatarios: destinatarios.map(d => ({ id: d.id, name: d.name, email: d.email })),
      observacao,
      enviadoPorEmail: enviarEmail,
    })

    // Enviar e-mail para cada destinatário
    let emailsEnviados = 0
    if (enviarEmail) {
      const emails = destinatarios.map(d => d.email).filter(Boolean)
      if (emails.length > 0) {
        const obsHtml = observacao ? `<p style="margin-top:12px;padding:10px;background:#f8f9fa;border-radius:6px;font-size:13px;color:#555"><strong>Observação:</strong> ${observacao}</p>` : ''
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#0ea5e9;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0;font-size:16px">📬 Mensagem Encaminhada — Caixa Postal e-CAC</h2>
            </div>
            <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">
              <p style="margin:0 0 4px;font-size:13px;color:#888">Encaminhada por <strong>${user?.name || 'Usuário'}</strong></p>
              <hr style="border:none;border-top:1px solid #eee;margin:12px 0">
              <table style="width:100%;font-size:13px;border-collapse:collapse">
                <tr><td style="padding:4px 0;color:#888;width:80px">Assunto:</td><td style="padding:4px 0;font-weight:600">${assunto}</td></tr>
                <tr><td style="padding:4px 0;color:#888">Origem:</td><td style="padding:4px 0">${origem}</td></tr>
                <tr><td style="padding:4px 0;color:#888">Data:</td><td style="padding:4px 0">${typeof dataEnvio === 'string' && dataEnvio.length === 8 ? `${dataEnvio.slice(6, 8)}/${dataEnvio.slice(4, 6)}/${dataEnvio.slice(0, 4)}` : dataEnvio}</td></tr>
                <tr><td style="padding:4px 0;color:#888">Prioridade:</td><td style="padding:4px 0;font-weight:600">${item?.prioridade || '—'}</td></tr>
                ${item?.contribuinte ? `<tr><td style="padding:4px 0;color:#888">Contribuinte:</td><td style="padding:4px 0;font-family:monospace">${item.contribuinte}</td></tr>` : ''}
              </table>
              ${obsHtml}
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0 12px">
              <p style="font-size:11px;color:#aaa;margin:0">Enviado automaticamente pelo sistema OneClick ERP</p>
            </div>
          </div>`
        const sent = await this.emailService.sendMail({
          to: emails,
          subject: `[Caixa Postal e-CAC] ${assunto}`,
          html,
        })
        if (sent) emailsEnviados = emails.length
      }
    }

    const msgExtra = enviarEmail && emailsEnviados > 0 ? ` e e-mail enviado para ${emailsEnviados} destinatário(s)` : ''
    return { mensagem: `Encaminhada para ${destinatarios.length} usuário(s)${msgExtra}` }
  }

  // Criar obrigação a partir da mensagem
  async criarObrigacaoFromMensagem(
    itemId: string,
    dados: { nome: string; tipo: string; areaId?: string; responsavelId?: string; diaVencimento?: number; observacoes?: string },
    _empresaId: string | null,
    userId: string,
  ) {
    const item = await prisma.caixaPostalItem.findUniqueOrThrow({ where: { id: itemId } })

    // Buscar cliente pelo contribuinte
    const cliente = await prisma.cliente.findFirst({ where: { documento: item.contribuinte } })
    if (!cliente) throw new Error('Cliente não encontrado para o contribuinte desta mensagem')

    // Criar obrigação via raw SQL (não temos modelo prisma gerado)
    const obrigId = `obr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    await prisma.$executeRawUnsafe(
      `INSERT INTO cliente_obrigacao (id, cliente_id, nome, tipo, periodicidade, area_id, responsavel_id, dia_vencimento, status, observacoes, ativo, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'pontual', $5, $6, $7, 'pendente', $8, true, NOW(), NOW())`,
      obrigId, cliente.id, dados.nome, dados.tipo || 'sob_demanda',
      dados.areaId || null, dados.responsavelId || null,
      dados.diaVencimento || null, dados.observacoes || null,
    )

    // Atualizar status do item
    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET status = 'em_andamento', updated_at = NOW() WHERE id = $1`,
      itemId,
    )

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    await this.registrarEvento(itemId, userId, 'OBRIGACAO_CRIADA', `Obrigação "${dados.nome}" criada por ${user?.name || 'Usuário'}`, {
      obrigacaoId: obrigId, clienteId: cliente.id, tipo: dados.tipo,
    })

    return { mensagem: 'Obrigação criada com sucesso', obrigacaoId: obrigId }
  }

  // Listar usuários para selects (responsável, encaminhar)
  async listarUsuariosAtivos(empresaId?: string | null) {
    return prisma.user.findMany({
      // Isolamento multi-tenant: só usuários da empresa da sessão. ISO-001
      where: { isActive: true, empresaId: empresaId ?? null },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })
  }

  // ============================================================
  // Arquivamento de mensagens
  // ============================================================

  // ============================================================
  // Marcar como importante
  // ============================================================

  async toggleImportante(itemId: string, userId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ importante: boolean }>>(
      `SELECT importante FROM caixa_postal_item WHERE id = $1`, itemId,
    )
    if (!rows.length) throw new Error('Item não encontrado')
    const novo = !rows[0]!.importante

    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET importante = $1, updated_at = NOW() WHERE id = $2`,
      novo, itemId,
    )

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    await this.registrarEvento(itemId, userId, 'IMPORTANCIA',
      novo ? `Mensagem marcada como importante por ${user?.name || 'Usuário'}` : `Importância removida por ${user?.name || 'Usuário'}`,
    )

    return { importante: novo }
  }

  async marcarImportanteLote(itemIds: string[], importante: boolean, userId: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET importante = $1, updated_at = NOW() WHERE id = ANY($2::text[])`,
      importante, itemIds,
    )

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    const desc = importante
      ? `Mensagem marcada como importante por ${user?.name || 'Usuário'} (lote)`
      : `Importância removida por ${user?.name || 'Usuário'} (lote)`
    for (const id of itemIds) {
      await this.registrarEvento(id, userId, 'IMPORTANCIA', desc)
    }

    return { total: itemIds.length }
  }

  // ============================================================
  // Arquivamento de mensagens
  // ============================================================

  async arquivarMensagens(itemIds: string[], userId: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET arquivada = true, updated_at = NOW() WHERE id = ANY($1::text[])`,
      itemIds,
    )
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    for (const itemId of itemIds) {
      await this.registrarEvento(itemId, userId, 'ARQUIVAMENTO', `Mensagem arquivada por ${user?.name || 'Usuário'}`)
    }
    return { total: itemIds.length }
  }

  async desarquivarMensagens(itemIds: string[], userId: string) {
    await prisma.$executeRawUnsafe(
      `UPDATE caixa_postal_item SET arquivada = false, updated_at = NOW() WHERE id = ANY($1::text[])`,
      itemIds,
    )
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
    for (const itemId of itemIds) {
      await this.registrarEvento(itemId, userId, 'DESARQUIVAMENTO', `Mensagem desarquivada por ${user?.name || 'Usuário'}`)
    }
    return { total: itemIds.length }
  }

  async arquivarAntigas(contribuinte: string, diasAnteriores: number, empresaId: string | null, userId: string) {
    const doc = limparDocumento(contribuinte)
    const params: unknown[] = [doc, diasAnteriores]
    let paramIdx = 3
    let empFilter = 'AND empresa_id IS NULL'
    if (empresaId) { empFilter = `AND empresa_id = $${paramIdx}`; params.push(empresaId); paramIdx++ }

    const items = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM caixa_postal_item
       WHERE contribuinte = $1 AND arquivada = false AND lida = true
       AND created_at < NOW() - make_interval(days => $2::int)
       ${empFilter}`,
      ...params,
    )

    if (items.length === 0) return { total: 0 }

    const ids = items.map(i => i.id)
    return this.arquivarMensagens(ids, userId)
  }

  async listarArquivadas(contribuinte: string, empresaId: string | null) {
    const doc = limparDocumento(contribuinte)
    const params: unknown[] = [doc]
    let empFilter = 'AND empresa_id IS NULL'
    if (empresaId) { empFilter = 'AND empresa_id = $2'; params.push(empresaId) }

    const items = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM caixa_postal_item
       WHERE contribuinte = $1 AND arquivada = true ${empFilter}
       ORDER BY COALESCE(mensagem_original->>'dataEnvio', '') DESC, created_at DESC`,
      ...params,
    )

    return {
      mensagens: items.map(row => {
        const resolved = this.resolverVariaveis((row.mensagem_original || row.mensagemOriginal) as RawMessage)
        return {
          ...resolved,
          id: row.id,
          isn: row.isn,
          prioridade: row.prioridade,
          score: row.score,
          acao_recomendada: row.acao_recomendada,
          sla_dias: row.sla_dias,
          lida: row.lida,
          arquivada: true,
          created_at: row.created_at,
        }
      }),
      total: items.length,
    }
  }
}
