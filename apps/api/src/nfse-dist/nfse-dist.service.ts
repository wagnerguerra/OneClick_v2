import { Injectable } from '@nestjs/common'
import { prisma, Prisma } from '@saas/db'
import * as https from 'node:https'
import * as zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { carregarCertificadoCliente } from '../fiscal-dist/cert-loader'
import { registrarSyncLog } from '../fiscal-dist/sync-log'
import { parseNFSeXml, XmlNFSeInvalidoError, type ParsedNFSe } from './nfse.parser'
import { gerarPdfNFSe } from './nfse-pdf'
import { DanfeStorage } from '../danfe/danfe.storage'

/** Extrai os campos do ParsedNFSe que não têm coluna dedicada e empacota em JSON. */
function serializarDadosExtras(p: ParsedNFSe): Record<string, unknown> {
  return {
    localEmissaoNome: p.localEmissaoNome,
    localPrestacaoNome: p.localPrestacaoNome,
    localIncidenciaIbge: p.localIncidenciaIbge,
    localIncidenciaNome: p.localIncidenciaNome,
    descTributacaoNacional: p.descTributacaoNacional,
    ambienteGerador: p.ambienteGerador,
    tipoEmissao: p.tipoEmissao,
    cStat: p.cStat,
    dataProcessamento: p.dataProcessamento?.toISOString() ?? null,
    numeroDFSe: p.numeroDFSe,
    numeroDPS: p.numeroDPS,
    serieDPS: p.serieDPS,
    dataEmissaoDPS: p.dataEmissaoDPS?.toISOString() ?? null,
    prestador: p.prestador,
    tomador: p.tomador,
    intermediario: p.intermediario,
    baseCalculo: p.baseCalculo,
    totalTribFed: p.totalTribFed,
    totalTribEst: p.totalTribEst,
    totalTribMun: p.totalTribMun,
    codigoNBS: p.codigoNBS,
    codigoTributacaoMunicipal: p.codigoTributacaoMunicipal,
    tributacaoISSQN: p.tributacaoISSQN,
    retencaoISSQN: p.retencaoISSQN,
    tipoImunidadeISSQN: p.tipoImunidadeISSQN,
    pisCofinsCST: p.pisCofinsCST,
  }
}

/**
 * NFS-e Distribuição via ADN (Ambiente de Dados Nacional do Sistema Nacional NFS-e).
 *
 * Endpoint oficial documentado em https://www.gov.br/nfse/.../manual-contribuintes-apis-adn.pdf:
 *  - `GET https://adn.nfse.gov.br/contribuintes/DFe/{NSU}` (produção)
 *  - `GET https://adn.producaorestrita.nfse.gov.br/contribuintes/DFe/{NSU}` (homologação)
 *
 * Autenticação: mTLS com certificado A1 cujo CNPJ raiz coincide com o tomador
 * dos documentos consultados. A SEFAZ identifica o contribuinte pelo cert.
 *
 * Resposta JSON:
 *   {
 *     StatusProcessamento: "DOCUMENTOS_LOCALIZADOS" | "NENHUM_DOCUMENTO_LOCALIZADO",
 *     LoteDFe: [{ NSU, ChaveAcesso, TipoDocumento, ArquivoXml: <gzip-base64> }],
 *     Alertas: [],
 *     Erros: [{ Codigo, Descricao }],
 *     TipoAmbiente: "PRODUCAO" | "HOMOLOGACAO",
 *     DataHoraProcessamento: ISO8601
 *   }
 *
 * Comportamento:
 *  - HTTP 200 + LoteDFe[] = lote de docs a processar (paginar até esgotar)
 *  - HTTP 404 + Erros[E2220] = nenhum documento novo a partir do NSU (fim do lote, OK)
 *
 * Pipeline:
 *  1. Carrega cert A1 do cliente
 *  2. Cria https.Agent com PFX + passphrase (mTLS)
 *  3. Consulta `GET /contribuintes/DFe/{ultimoNsu}` em loop até StatusProcessamento != DOCUMENTOS_LOCALIZADOS
 *  4. Descompacta cada `ArquivoXml` (GZip+Base64), parseia via `parseNFSeXml`
 *  5. Gera PDF, salva XML+PDF no S3 (DanfeStorage compartilhado)
 *  6. Cria registro em NotaServicoImportada (dedup por chave única)
 *  7. Atualiza `Cliente.nfseDistUltimoNsu` e `nfseDistSyncedAt`
 */
@Injectable()
export class NfseDistService {
  // Reaproveita o storage do DANFE (mesma config S3)
  private readonly storage = new DanfeStorage()

  /**
   * Base URL do ADN. Produção por padrão; sobrescreva via env `NFSE_ADN_BASE_URL`
   * pra apontar pra homologação (`https://adn.producaorestrita.nfse.gov.br`).
   */
  private adnBaseUrl(): string {
    return process.env.NFSE_ADN_BASE_URL ?? 'https://adn.nfse.gov.br'
  }

  /** Quantos lotes consecutivos pode buscar numa rodada (cada lote vem com até N docs). */
  private readonly MAX_PAGINAS = 50

  async processarCliente(clienteId: string): Promise<{
    clienteId: string
    arquivosNovos: number
    arquivosOk: number
    arquivosIgnorados: number
    arquivosErro: number
    novoUltNsu: string | null
  }> {
    const t0 = Date.now()
    const iniciadoEm = new Date()
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        razaoSocial: true,
        documento: true,
        empresaId: true,
        nfseDistEnabled: true,
        nfseDistUltimoNsu: true,
        nfseDistCertificadoId: true,
      },
    })
    if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado.`)
    if (!cliente.nfseDistEnabled) {
      throw new Error(`Cliente ${cliente.razaoSocial}: NFS-e Distribuição desabilitada.`)
    }

    let arquivosOk = 0
    let arquivosIgnorados = 0
    let arquivosErro = 0
    let novoUltNsu: string | null = cliente.nfseDistUltimoNsu ? String(cliente.nfseDistUltimoNsu) : null

    try {
      await this.atualizarProgresso(cliente.id, { etapa: 'cert', mensagem: 'Carregando certificado A1...', atual: 0, total: 0, pct: 5 })
      const cert = await carregarCertificadoCliente(cliente.id, cliente.nfseDistCertificadoId)
      if (cert.expiraEm < new Date()) {
        throw new Error(`Certificado vencido em ${cert.expiraEm.toISOString().slice(0, 10)}.`)
      }

      const uploadedById = await this.resolveSystemUserId()
      if (!uploadedById) throw new Error('Nenhum usuário master ativo pra atribuir como uploader.')

      const agent = new https.Agent({
        pfx: cert.pfxBuffer,
        passphrase: cert.passphrase,
        keepAlive: false,
      })

      await this.atualizarProgresso(cliente.id, { etapa: 'consultar', mensagem: `Consultando ADN (último NSU: ${cliente.nfseDistUltimoNsu ?? '0'})...`, atual: 0, total: 0, pct: 20 })

      // Paginação: chama /DFe/{NSU} repetidamente até StatusProcessamento != DOCUMENTOS_LOCALIZADOS
      const documentos: Array<{ nsu: string; xml: string; chave?: string }> = []
      let cursor = cliente.nfseDistUltimoNsu ? String(cliente.nfseDistUltimoNsu) : '0'
      for (let pagina = 0; pagina < this.MAX_PAGINAS; pagina++) {
        const url = `${this.adnBaseUrl()}/contribuintes/DFe/${cursor}`
        const resp = await this.httpGetJson(url, agent)
        const status = String(resp.StatusProcessamento ?? '')
        const lote = Array.isArray(resp.LoteDFe) ? resp.LoteDFe as Array<Record<string, unknown>> : []

        // Fim do lote — sem mais docs
        if (status === 'NENHUM_DOCUMENTO_LOCALIZADO' || lote.length === 0) break

        for (const item of lote) {
          const xml = this.descompactar(item.ArquivoXml)
          if (!xml) continue
          const nsu = String(item.NSU ?? '')
          documentos.push({ nsu, xml, chave: typeof item.ChaveAcesso === 'string' ? item.ChaveAcesso : undefined })
          if (nsu && (!novoUltNsu || BigInt(nsu) > BigInt(novoUltNsu))) novoUltNsu = nsu
        }

        // Próximo cursor = maior NSU do lote
        cursor = novoUltNsu ?? cursor
        if (status !== 'DOCUMENTOS_LOCALIZADOS') break

        await this.atualizarProgresso(cliente.id, {
          etapa: 'consultar',
          mensagem: `Baixando lote ${pagina + 1} (${documentos.length} docs até agora)...`,
          atual: documentos.length, total: 0, pct: Math.min(20 + pagina * 2, 45),
        })
      }

      await this.atualizarProgresso(cliente.id, {
        etapa: 'processar',
        mensagem: documentos.length > 0 ? `Processando ${documentos.length} NFS-e...` : 'Nenhum documento novo no ADN',
        atual: 0, total: documentos.length, pct: 50,
      })

      let docIdx = 0
      for (const doc of documentos) {
        docIdx++
        try {
          const xmlString = doc.xml
          const sha = createHash('sha256').update(xmlString).digest('hex')

          let parsed: ParsedNFSe
          try {
            parsed = parseNFSeXml(xmlString)
          } catch (e) {
            if (e instanceof XmlNFSeInvalidoError) {
              arquivosIgnorados++
              continue
            }
            throw e
          }

          // Dedup por chave (se houver) ou hash
          if (parsed.chave) {
            const dup = await prisma.notaServicoImportada.findUnique({ where: { chave: parsed.chave }, select: { id: true } })
            if (dup) { arquivosIgnorados++; continue }
          }

          // Salva XML no S3
          const xmlKey = await this.storage.saveXml(`nfse/${parsed.chave ?? sha}`, xmlString)

          // Tenta DANFSe oficial primeiro. Se a API gov.br responder com PDF, esse
          // é o doc canônico (layout v1.0 com QR). Se não, gera PDF auxiliar interno.
          let pdfKey: string | null = null
          let pdfOficial = false
          if (parsed.chave) {
            const oficial = await this.baixarDanfseOficial(parsed.chave, agent).catch(() => null)
            if (oficial) {
              pdfKey = await this.storage.savePdf(`nfse/${parsed.chave}`, oficial)
              pdfOficial = true
            }
          }
          if (!pdfKey) {
            try {
              const pdfBuf = await gerarPdfNFSe(parsed)
              pdfKey = await this.storage.savePdf(`nfse/${parsed.chave ?? sha}`, pdfBuf)
            } catch (e) {
              console.warn(`[NfseDist] PDF falhou (chave=${parsed.chave}): ${(e as Error).message}`)
            }
          }

          await prisma.notaServicoImportada.create({
            data: {
              chave: parsed.chave ?? null,
              numero: parsed.numero,
              serie: parsed.serie ?? null,
              codigoVerificacao: parsed.codigoVerificacao ?? null,
              prestadorCnpj: parsed.prestadorCnpj,
              prestadorRazao: parsed.prestadorRazao,
              prestadorMunicipio: parsed.prestadorMunicipio ?? null,
              tomadorCnpjCpf: parsed.tomadorCnpjCpf ?? null,
              tomadorRazao: parsed.tomadorRazao ?? null,
              valorServicos: parsed.valorServicos.toString(),
              valorIss: parsed.valorIss?.toString() ?? null,
              valorLiquido: parsed.valorLiquido?.toString() ?? null,
              aliquotaIss: parsed.aliquotaIss?.toString() ?? null,
              itemListaServico: parsed.itemListaServico ?? null,
              cnae: parsed.cnae ?? null,
              discriminacao: parsed.discriminacao ?? null,
              dataEmissao: parsed.dataEmissao,
              competencia: parsed.competencia ?? null,
              status: parsed.status,
              xmlKey,
              pdfKey,
              pdfOficial,
              dadosExtras: serializarDadosExtras(parsed) as Prisma.InputJsonValue,
              padrao: 'NACIONAL',
              municipio: parsed.prestadorMunicipio ?? null,
              clienteId: cliente.id,
              empresaId: cliente.empresaId,
              uploadedById,
            },
          })
          arquivosOk++
        } catch (e) {
          arquivosErro++
          console.error(`[NfseDist] falha ao processar doc: ${(e as Error).message}`)
        }

        await this.atualizarProgresso(cliente.id, {
          etapa: 'processar',
          mensagem: `Processado ${docIdx} de ${documentos.length}`,
          atual: docIdx,
          total: documentos.length,
          pct: documentos.length > 0 ? 50 + Math.round((docIdx / documentos.length) * 45) : 95,
        })
      }

      await this.atualizarProgresso(cliente.id, { etapa: 'finalizar', mensagem: 'Salvando estado...', atual: documentos.length, total: documentos.length, pct: 98 })

      // Persiste estado
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          nfseDistUltimoNsu: novoUltNsu ? BigInt(novoUltNsu) : cliente.nfseDistUltimoNsu,
          nfseDistSyncedAt: new Date(),
          nfseDistSyncStatus: arquivosErro > 0 ? 'erro' : 'ok',
        },
      })

      console.log(`[NfseDist] [${cliente.razaoSocial}] +${Date.now() - t0}ms ok=${arquivosOk} ign=${arquivosIgnorados} err=${arquivosErro} ultNsu=${novoUltNsu}`)

      await registrarSyncLog({
        clienteId: cliente.id,
        tipo: 'nfse-nacional',
        iniciadoEm,
        resultado: {
          status: arquivosErro > 0 ? 'error' : 'completed',
          arquivosVistos: arquivosOk + arquivosIgnorados + arquivosErro,
          arquivosOk,
          arquivosIgnorados,
          arquivosErro,
        },
      })

      return { clienteId: cliente.id, arquivosNovos: arquivosOk, arquivosOk, arquivosIgnorados, arquivosErro, novoUltNsu }
    } catch (e) {
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { nfseDistSyncStatus: 'erro', nfseDistSyncedAt: new Date() },
      }).catch(() => {})
      await registrarSyncLog({
        clienteId: cliente.id,
        tipo: 'nfse-nacional',
        iniciadoEm,
        resultado: {
          status: 'error',
          arquivosVistos: arquivosOk + arquivosIgnorados + arquivosErro,
          arquivosOk,
          arquivosIgnorados,
          arquivosErro,
          erroMensagem: (e as Error).message ?? String(e),
        },
      })
      throw e
    } finally {
      await this.limparProgresso(cliente.id)
    }
  }

  /**
   * GET HTTPS com mTLS — agent fornece cert.
   * O ADN retorna JSON estruturado tanto em 200 (DOCUMENTOS_LOCALIZADOS) quanto
   * em 404 (NENHUM_DOCUMENTO_LOCALIZADO). Por isso aceitamos 2xx e 404; outros
   * status são erro real (500, 403, etc.).
   */
  private httpGetJson(url: string, agent: https.Agent): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const req = https.request({
        agent,
        method: 'GET',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OneClick-ERP/1.0',
        },
        timeout: 30_000,
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          const status = res.statusCode ?? 0
          // 200/2xx OK; 404 ADN = "sem docs" (vem com payload JSON normal)
          if (status >= 200 && status < 300) {
            return resolve(body.trim() ? JSON.parse(body) : {})
          }
          if (status === 404) {
            try { return resolve(body.trim() ? JSON.parse(body) : {}) } catch { /* fallthrough */ }
          }
          reject(new Error(`HTTP ${status}: ${body.slice(0, 200)}`))
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout 30s')) })
      req.end()
    })
  }

  /**
   * Baixa o DANFSe oficial (PDF v1.0 padronizado nacional, com QR code) via API
   * `GET /danfse/{chave}` do gov.br. Retorna null se a API estiver indisponível,
   * 502/500/404 etc — chamador deve ter fallback pro PDF auxiliar.
   *
   * Essa API será descontinuada em 01/07/2026 (NT 008/2026); a partir daí cada
   * sistema gera o DANFSe localmente seguindo o anexo I da NT.
   */
  private baixarDanfseOficial(chave: string, agent: https.Agent): Promise<Buffer | null> {
    const baseUrl = this.adnBaseUrl()  // produção ou restrita conforme env
    const url = `${baseUrl}/danfse/${chave}`
    return new Promise((resolve) => {
      const u = new URL(url)
      const req = https.request({
        agent,
        method: 'GET',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: {
          'Accept': 'application/pdf',
          'User-Agent': 'OneClick-ERP/1.0',
        },
        timeout: 30_000,
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          const status = res.statusCode ?? 0
          // Aceita só se for PDF de fato (magic bytes %PDF)
          if (status === 200 && buf.slice(0, 4).toString() === '%PDF') {
            return resolve(buf)
          }
          console.warn(`[NfseDist] DANFSe ${chave}: HTTP ${status}${buf.length > 0 ? ` (${buf.length}B, ${(res.headers['content-type'] ?? '?').toString().slice(0, 40)})` : ''}`)
          resolve(null)
        })
        res.on('error', () => resolve(null))
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
      req.end()
    })
  }

  /**
   * Re-gera o PDF da NFS-e:
   *  1. Tenta DANFSe oficial via API gov.br. Sucesso → pdfOficial=true.
   *  2. Se API estiver fora, gera DANFSe local seguindo NT 008/2026 a partir do
   *     XML salvo. Marca pdfOficial=false mas com layout v1.0 fiel.
   */
  async regerarPdf(notaId: string): Promise<{ ok: boolean; pdfOficial: boolean; mensagem: string }> {
    const nota = await prisma.notaServicoImportada.findUnique({
      where: { id: notaId },
      select: { id: true, chave: true, clienteId: true, pdfKey: true, pdfOficial: true, xmlKey: true },
    })
    if (!nota) return { ok: false, pdfOficial: false, mensagem: 'Nota não encontrada.' }
    if (nota.pdfOficial) return { ok: true, pdfOficial: true, mensagem: 'PDF já é o DANFSe oficial.' }

    // 1) Tenta API oficial primeiro (se tem cert + chave)
    if (nota.chave && nota.clienteId) {
      const { carregarCertificadoCliente } = await import('../fiscal-dist/cert-loader')
      try {
        const cert = await carregarCertificadoCliente(nota.clienteId)
        const agent = new https.Agent({ pfx: cert.pfxBuffer, passphrase: cert.passphrase, keepAlive: false })
        const oficial = await this.baixarDanfseOficial(nota.chave, agent)
        if (oficial) {
          const pdfKey = await this.storage.savePdf(`nfse/${nota.chave}`, oficial)
          await prisma.notaServicoImportada.update({
            where: { id: nota.id },
            data: { pdfKey, pdfOficial: true },
          })
          return { ok: true, pdfOficial: true, mensagem: 'DANFSe oficial baixado da API gov.br.' }
        }
      } catch (e) {
        console.warn(`[NfseDist] regerar — cert/API falhou: ${(e as Error).message}`)
      }
    }

    // 2) Fallback: gera DANFSe local seguindo NT 008/2026 a partir do XML
    try {
      const xmlBuffer = await this.storage.readBuffer(nota.xmlKey)
      const parsed = parseNFSeXml(xmlBuffer.toString('utf8'))
      const pdfBuf = await gerarPdfNFSe(parsed)
      const pdfKey = await this.storage.savePdf(`nfse/${nota.chave ?? notaId}`, pdfBuf)
      await prisma.notaServicoImportada.update({
        where: { id: nota.id },
        data: { pdfKey, pdfOficial: false },
      })
      return {
        ok: true,
        pdfOficial: false,
        mensagem: 'DANFSe local gerado (API gov.br indisponível). Layout NT 008/2026 v1.0.',
      }
    } catch (e) {
      return { ok: false, pdfOficial: false, mensagem: `Falha ao gerar DANFSe local: ${(e as Error).message}` }
    }
  }

  /** Descompacta GZip+Base64 (formato típico ADN) → string XML. */
  private descompactar(input: unknown): string | null {
    if (typeof input !== 'string' || !input) return null
    try {
      const buf = Buffer.from(input, 'base64')
      return zlib.gunzipSync(buf).toString('utf8')
    } catch {
      // Pode já vir XML puro
      if (input.includes('<')) return input
      return null
    }
  }

  async solicitarSync(clienteId: string): Promise<void> {
    const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nfseDistEnabled: true } })
    if (!c?.nfseDistEnabled) throw new Error('NFS-e Distribuição não habilitada para este cliente.')
    await prisma.cliente.update({ where: { id: clienteId }, data: { nfseDistSyncRequestedAt: new Date() } })
  }

  /**
   * Reset do NSU pra forçar re-sync a partir de um ponto específico.
   * Útil pra recuperar notas perdidas ou refazer histórico completo (NSU=0).
   */
  async resincronizarDesdeNsu(clienteId: string, novoNsu: string): Promise<void> {
    const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nfseDistEnabled: true } })
    if (!c?.nfseDistEnabled) throw new Error('NFS-e Distribuição não habilitada para este cliente.')
    const nsuLimpo = novoNsu.replace(/\D/g, '') || '0'
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        nfseDistUltimoNsu: BigInt(nsuLimpo),
        nfseDistSyncRequestedAt: new Date(),
        nfseDistSyncStatus: 'aguardando',
      },
    })
  }

  async limparSyncRequest(clienteId: string): Promise<void> {
    await prisma.cliente.update({ where: { id: clienteId }, data: { nfseDistSyncRequestedAt: null } }).catch(() => {})
  }

  async listarSyncRequests(): Promise<string[]> {
    const rows = await prisma.cliente.findMany({
      where: { nfseDistSyncRequestedAt: { not: null }, nfseDistEnabled: true, deletedAt: null },
      select: { id: true },
    })
    return rows.map(r => r.id)
  }

  async getProgressoAtual(clienteId: string): Promise<{
    etapa: string; mensagem: string; atual: number; total: number; pct: number
  } | null> {
    const c = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { nfseDistProgresso: true },
    })
    if (!c) return null
    return (c.nfseDistProgresso as null | {
      etapa: string; mensagem: string; atual: number; total: number; pct: number
    }) ?? null
  }

  private async atualizarProgresso(clienteId: string, p: { etapa: string; mensagem: string; atual: number; total: number; pct: number }): Promise<void> {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { nfseDistProgresso: p as unknown as object },
    }).catch(() => { /* */ })
  }

  private async limparProgresso(clienteId: string): Promise<void> {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { nfseDistProgresso: Prisma.DbNull },
    }).catch(() => { /* */ })
  }

  private async resolveSystemUserId(): Promise<string | null> {
    const m = await prisma.user.findFirst({
      where: { isActive: true, isMaster: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    return m?.id ?? null
  }
}
