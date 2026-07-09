import { Injectable, Inject } from '@nestjs/common'
import { prisma, Prisma } from '@saas/db'
import * as https from 'node:https'
import * as zlib from 'node:zlib'
import { createHash } from 'node:crypto'
import { XMLParser } from 'fast-xml-parser'
import { DanfeService } from '../danfe/danfe.service'
import { carregarCertificadoCliente } from '../fiscal-dist/cert-loader'
import { registrarSyncLog } from '../fiscal-dist/sync-log'
import { XmlInvalidoError } from '../danfe/danfe.parser'

/**
 * NFe Distribuição via SEFAZ Nacional (web service NFeDistribuicaoDFe).
 *
 * Endpoint SOAP oficial:
 *   - Produção:   https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx
 *   - Homologação: https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx
 *
 * Operação: nfeDistDFeInteresse (SOAP 1.2). Envelope montado na unha — sem dep
 * de libs nativas. Auth via mTLS (cert A1 do CNPJ destinatário).
 *
 * Resposta vem como SOAP envelope com `retDistDFeInt`:
 *   - cStat=138  → DOCUMENTOS_LOCALIZADOS (loteDistDFeInt.docZip[] tem os XMLs)
 *   - cStat=137  → NENHUM_DOCUMENTO (fim do lote, ok)
 *   - outros     → erro real
 *
 * Cada `docZip` é o XML completo da NFe (ou evento) compactado em GZip + Base64.
 *
 * Pipeline:
 *  1. Carrega cert A1 do cliente (PFX + senha)
 *  2. Cria https.Agent com PFX + passphrase (mTLS)
 *  3. POST do envelope SOAP em loop até cStat=137 ou MAX_PAGINAS
 *  4. Pra cada docZip: descompacta → DanfeService.processarXml (parse+PDF+S3+DB)
 *  5. Dedup duplo: por SHA-256 (driveSyncedFile) e por chave (Danfe)
 *  6. Atualiza Cliente.nfeDistUltimoNsu e nfeDistSyncedAt
 */
@Injectable()
export class NfeDistService {
  private readonly MAX_PAGINAS = 50
  private readonly NS_SOAP = 'http://www.w3.org/2003/05/soap-envelope'
  private readonly NS_NFE = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe'

  constructor(
    @Inject(DanfeService) private readonly danfeSvc: DanfeService,
  ) {}

  private soapBaseUrl(): string {
    // 1 = Produção, 2 = Homologação
    const ambiente = process.env.NFE_DIST_AMBIENTE === '2' ? 2 : 1
    return ambiente === 1
      ? 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
      : 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
  }

  private ambiente(): 1 | 2 {
    return process.env.NFE_DIST_AMBIENTE === '2' ? 2 : 1
  }

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
        uf: true,
        empresaId: true,
        nfeDistEnabled: true,
        nfeDistUltimoNsu: true,
        nfeDistCertificadoId: true,
      },
    })
    if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado.`)
    if (!cliente.nfeDistEnabled) {
      throw new Error(`Cliente ${cliente.razaoSocial}: NFe Distribuição desabilitada.`)
    }
    if (!cliente.uf) {
      throw new Error(`Cliente ${cliente.razaoSocial}: UF não cadastrada (necessária pro cUFAutor SEFAZ).`)
    }

    let arquivosOk = 0
    let arquivosIgnorados = 0
    let arquivosErro = 0
    let novoUltNsu: string | null = cliente.nfeDistUltimoNsu ? String(cliente.nfeDistUltimoNsu) : null

    try {
      await this.atualizarProgresso(cliente.id, { etapa: 'cert', mensagem: 'Carregando certificado A1...', atual: 0, total: 0, pct: 5 })
      const cert = await carregarCertificadoCliente(cliente.id, cliente.nfeDistCertificadoId)
      if (cert.expiraEm < new Date()) {
        throw new Error(`Certificado vencido em ${cert.expiraEm.toISOString().slice(0, 10)}.`)
      }

      const uploadedById = await this.resolveSystemUserId()
      if (!uploadedById) throw new Error('Nenhum usuário master ativo pra atribuir como uploader.')

      await this.atualizarProgresso(cliente.id, { etapa: 'conectar', mensagem: 'Conectando à SEFAZ (mTLS)...', atual: 0, total: 0, pct: 12 })
      const agent = new https.Agent({
        // key/cert em PEM (node-forge) em vez de pfx — evita "Unsupported PKCS12
        // PFX data" do OpenSSL 3 com A1 legado. cert = folha + cadeia do cliente;
        // NÃO passar `ca` (usa o trust store padrão pra verificar o servidor).
        key: cert.keyPem,
        cert: cert.certChainPem,
        keepAlive: false,
        // SEFAZ AN exige TLS 1.2 ou superior
        minVersion: 'TLSv1.2',
      })

      // Paginação: chama nfeDistDFeInteresse repetidamente enquanto cStat=138
      const docs: Array<{ nsu: string; schema: string; xml: string }> = []
      let cursor = cliente.nfeDistUltimoNsu ? String(cliente.nfeDistUltimoNsu) : '0'

      for (let pagina = 0; pagina < this.MAX_PAGINAS; pagina++) {
        await this.atualizarProgresso(cliente.id, {
          etapa: 'consultar',
          mensagem: `Consultando SEFAZ (lote ${pagina + 1}, NSU=${cursor})...`,
          atual: docs.length, total: 0, pct: Math.min(15 + pagina * 2, 45),
        })

        const ret = await this.consultarDistDFeInt({
          agent,
          cUFAutor: this.codigoUF(cliente.uf!),
          cnpj: cert.cnpj,
          ultNSU: cursor,
        })

        // cStat=137 → fim. cStat=138 → tem docs e talvez mais lotes.
        // Outros cStats são erro (108=serviço paralisado, 656=consumo indevido, etc.)
        if (ret.cStat === '137') break
        if (ret.cStat !== '138') {
          throw new Error(`SEFAZ cStat=${ret.cStat}: ${ret.xMotivo}`)
        }

        for (const d of ret.docZip) {
          docs.push(d)
          if (!novoUltNsu || BigInt(d.nsu) > BigInt(novoUltNsu)) novoUltNsu = d.nsu
        }

        // Próximo cursor = maxNSU (SEFAZ pode ter mais docs além desse lote)
        if (ret.maxNSU && BigInt(ret.maxNSU) > BigInt(ret.ultNSU || '0')) {
          cursor = ret.ultNSU || cursor
        } else {
          break  // ultNSU >= maxNSU = não há mais lotes
        }
      }

      await this.atualizarProgresso(cliente.id, {
        etapa: 'processar',
        mensagem: docs.length > 0 ? `Processando ${docs.length} documento(s)...` : 'Nenhum documento novo na SEFAZ',
        atual: 0, total: docs.length, pct: 50,
      })

      for (let idx = 0; idx < docs.length; idx++) {
        const doc = docs[idx]!
        try {
          const sha = createHash('sha256').update(doc.xml).digest('hex')

          // Dedup por SHA — evita reprocessar XML idêntico
          const jaVisto = await prisma.driveSyncedFile.findFirst({
            where: { clienteId: cliente.id, sha256: sha },
            select: { id: true },
          })
          if (jaVisto) { arquivosIgnorados++; continue }

          try {
            const r = await this.danfeSvc.processarXml(doc.xml, {
              uploadedById,
              empresaId: cliente.empresaId,
              clienteId: cliente.id,
            })
            await prisma.driveSyncedFile.create({
              data: {
                clienteId: cliente.id,
                fileId: `nfe-sefaz:${sha}`,
                sha256: sha,
                fileName: `${doc.nsu}-${doc.schema}.xml`,
                pathDrive: `sefaz/distribuicao/${doc.nsu}.xml`,
                status: 'ok',
                danfeId: r.id,
              },
            })
            arquivosOk++
          } catch (e: unknown) {
            const err = e as { code?: string; message?: string }
            if (err.code === 'DUPLICADO') {
              arquivosIgnorados++  // chave já existe em Danfe
            } else if (e instanceof XmlInvalidoError) {
              // Eventos (cancelamento, CCe, resNFe, etc.) — esperado, ignora
              await prisma.driveSyncedFile.create({
                data: {
                  clienteId: cliente.id,
                  fileId: `nfe-sefaz:${sha}`,
                  sha256: sha,
                  fileName: `${doc.nsu}-${doc.schema}.xml`,
                  pathDrive: `sefaz/distribuicao/${doc.nsu}.xml`,
                  status: 'ignorado',
                  tipoIgnorado: 'evento',
                },
              })
              arquivosIgnorados++
            } else {
              arquivosErro++
              console.error(`[NfeDist] erro ao processar NSU=${doc.nsu}: ${err.message}`)
            }
          }
        } catch (e) {
          arquivosErro++
          console.error(`[NfeDist] falha geral NSU=${doc.nsu}: ${(e as Error).message}`)
        }

        await this.atualizarProgresso(cliente.id, {
          etapa: 'processar',
          mensagem: `Processado ${idx + 1} de ${docs.length} (NSU=${doc.nsu})`,
          atual: idx + 1,
          total: docs.length,
          pct: 50 + Math.round(((idx + 1) / docs.length) * 45),
        })
      }

      await this.atualizarProgresso(cliente.id, { etapa: 'finalizar', mensagem: 'Salvando estado...', atual: docs.length, total: docs.length, pct: 98 })

      await prisma.cliente.update({
        where: { id: cliente.id },
        data: {
          nfeDistUltimoNsu: novoUltNsu ? BigInt(novoUltNsu) : cliente.nfeDistUltimoNsu,
          nfeDistSyncedAt: new Date(),
          nfeDistSyncStatus: arquivosErro > 0 ? 'erro' : 'ok',
        },
      })

      console.log(`[NfeDist] [${cliente.razaoSocial}] +${Date.now() - t0}ms ok=${arquivosOk} ign=${arquivosIgnorados} err=${arquivosErro} ultNsu=${novoUltNsu}`)

      await registrarSyncLog({
        clienteId: cliente.id,
        tipo: 'nfe-sefaz',
        iniciadoEm,
        resultado: {
          status: arquivosErro > 0 ? 'error' : 'completed',
          arquivosVistos: arquivosOk + arquivosIgnorados + arquivosErro,
          arquivosOk,
          arquivosIgnorados,
          arquivosErro,
        },
      })

      return {
        clienteId: cliente.id,
        arquivosNovos: arquivosOk,
        arquivosOk,
        arquivosIgnorados,
        arquivosErro,
        novoUltNsu,
      }
    } catch (e) {
      await prisma.cliente.update({
        where: { id: cliente.id },
        data: { nfeDistSyncStatus: 'erro', nfeDistSyncedAt: new Date() },
      }).catch(() => {})
      await registrarSyncLog({
        clienteId: cliente.id,
        tipo: 'nfe-sefaz',
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
   * Faz UM POST SOAP no NFeDistribuicaoDFe e retorna o conteúdo de retDistDFeInt.
   * Lança erro em HTTP != 200 ou XML malformado. cStat é retornado pra caller decidir
   * (137 = fim, 138 = tem docs, demais = erro).
   */
  private async consultarDistDFeInt(opts: {
    agent: https.Agent
    cUFAutor: number
    cnpj: string
    ultNSU: string
  }): Promise<{
    cStat: string
    xMotivo: string
    ultNSU: string
    maxNSU: string
    docZip: Array<{ nsu: string; schema: string; xml: string }>
  }> {
    const envelope = this.montarEnvelopeSOAP({
      tpAmb: this.ambiente(),
      cUFAutor: opts.cUFAutor,
      cnpj: opts.cnpj,
      ultNSU: opts.ultNSU.padStart(15, '0'),
    })

    const respXml = await this.httpPostSoap(this.soapBaseUrl(), envelope, opts.agent)

    // Parse SOAP envelope → retDistDFeInt
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,  // tira soap:Body → Body
      parseTagValue: false,  // mantém tudo string (preserva NSU zero-padded)
      trimValues: true,
    })
    const parsed = parser.parse(respXml) as Record<string, unknown>
    const env = (parsed.Envelope ?? parsed.envelope) as Record<string, unknown> | undefined
    const body = env?.Body as Record<string, unknown> | undefined
    // Pode vir como nfeDistDFeInteresseResponse > nfeDistDFeInteresseResult > retDistDFeInt
    const respWrap = (body?.nfeDistDFeInteresseResponse ?? body?.nfeDistDFeInteresseResult) as Record<string, unknown> | undefined
    const ret = (respWrap?.nfeDistDFeInteresseResult ?? respWrap?.retDistDFeInt ?? respWrap) as Record<string, unknown> | undefined
    const retDist = (ret?.retDistDFeInt ?? ret) as Record<string, unknown> | undefined

    if (!retDist) {
      throw new Error(`Resposta SOAP sem retDistDFeInt. Body=${JSON.stringify(body).slice(0, 300)}`)
    }

    const cStat = String(retDist.cStat ?? '')
    const xMotivo = String(retDist.xMotivo ?? '')
    const ultNSU = String(retDist.ultNSU ?? '')
    const maxNSU = String(retDist.maxNSU ?? '')

    // docZip: pode ser objeto único (1 doc) ou array (N docs)
    const docZip: Array<{ nsu: string; schema: string; xml: string }> = []
    const lote = retDist.loteDistDFeInt as Record<string, unknown> | undefined
    if (lote) {
      const raw = lote.docZip
      const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
      for (const item of arr as Array<Record<string, unknown>>) {
        const nsu = String(item['@_NSU'] ?? '')
        const schema = String(item['@_schema'] ?? '')
        // fast-xml-parser põe o texto da tag em #text quando há atributos
        const b64 = String(item['#text'] ?? item._text ?? '')
        const xml = this.descompactar(b64)
        if (xml) docZip.push({ nsu, schema, xml })
      }
    }

    return { cStat, xMotivo, ultNSU, maxNSU, docZip }
  }

  /** Monta o envelope SOAP do nfeDistDFeInteresse (versão 1.01). */
  private montarEnvelopeSOAP(p: {
    tpAmb: 1 | 2
    cUFAutor: number
    cnpj: string
    ultNSU: string
  }): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="${this.NS_SOAP}">
  <soap:Body>
    <nfeDistDFeInteresse xmlns="${this.NS_NFE}">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${p.tpAmb}</tpAmb>
          <cUFAutor>${p.cUFAutor}</cUFAutor>
          <CNPJ>${p.cnpj}</CNPJ>
          <distNSU>
            <ultNSU>${p.ultNSU}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap:Body>
</soap:Envelope>`
  }

  /** POST do envelope SOAP. Aceita 200; outros são erro com body como contexto. */
  private httpPostSoap(url: string, envelope: string, agent: https.Agent): Promise<string> {
    return new Promise((resolve, reject) => {
      const u = new URL(url)
      const body = Buffer.from(envelope, 'utf8')
      const req = https.request({
        agent,
        method: 'POST',
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: {
          'Content-Type': 'application/soap+xml; charset=UTF-8',
          'Content-Length': String(body.length),
          'SOAPAction': '',
          'User-Agent': 'OneClick-ERP/1.0',
        },
        timeout: 60_000,
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const respBody = Buffer.concat(chunks).toString('utf8')
          if ((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300) {
            return resolve(respBody)
          }
          reject(new Error(`HTTP ${res.statusCode}: ${respBody.slice(0, 400)}`))
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout 60s')) })
      req.write(body)
      req.end()
    })
  }

  /** Descompacta GZip+Base64 → string XML. */
  private descompactar(input: string): string | null {
    if (!input) return null
    try {
      const buf = Buffer.from(input, 'base64')
      return zlib.gunzipSync(buf).toString('utf8')
    } catch {
      if (input.includes('<')) return input  // já é XML
      return null
    }
  }

  // ─── Sync requests / progresso ────────────────────────────

  async limparSyncRequest(clienteId: string): Promise<void> {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { nfeDistSyncRequestedAt: null },
    }).catch(() => {})
  }

  async solicitarSync(clienteId: string): Promise<void> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { nfeDistEnabled: true },
    })
    if (!cliente?.nfeDistEnabled) {
      throw new Error('NFe Distribuição não está habilitada para este cliente.')
    }
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { nfeDistSyncRequestedAt: new Date() },
    })
  }

  /**
   * Reset do NSU pra forçar re-sync a partir de um ponto específico.
   * Útil pra recuperar notas perdidas ou refazer histórico completo (NSU=0).
   * Dedup automática via DriveSyncedFile evita duplicar notas já no banco.
   */
  async resincronizarDesdeNsu(clienteId: string, novoNsu: string): Promise<void> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { nfeDistEnabled: true },
    })
    if (!cliente?.nfeDistEnabled) {
      throw new Error('NFe Distribuição não está habilitada para este cliente.')
    }
    // Aceita string vazia / "0" → reset total
    const nsuLimpo = novoNsu.replace(/\D/g, '') || '0'
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        nfeDistUltimoNsu: BigInt(nsuLimpo),
        nfeDistSyncRequestedAt: new Date(),
        nfeDistSyncStatus: 'aguardando',
      },
    })
  }

  async listarSyncRequests(): Promise<string[]> {
    const rows = await prisma.cliente.findMany({
      where: { nfeDistSyncRequestedAt: { not: null }, nfeDistEnabled: true, deletedAt: null },
      select: { id: true },
    })
    return rows.map(r => r.id)
  }

  async getProgressoAtual(clienteId: string): Promise<{
    etapa: string
    mensagem: string
    atual: number
    total: number
    pct: number
  } | null> {
    const c = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { nfeDistProgresso: true },
    })
    if (!c) return null
    return (c.nfeDistProgresso as null | {
      etapa: string; mensagem: string; atual: number; total: number; pct: number
    }) ?? null
  }

  private async atualizarProgresso(clienteId: string, p: { etapa: string; mensagem: string; atual: number; total: number; pct: number }): Promise<void> {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { nfeDistProgresso: p as unknown as object },
    }).catch(() => { /* */ })
  }

  private async limparProgresso(clienteId: string): Promise<void> {
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { nfeDistProgresso: Prisma.DbNull },
    }).catch(() => { /* */ })
  }

  // ─── Helpers ─────────────────────────────────────────────

  private async resolveSystemUserId(): Promise<string | null> {
    const master = await prisma.user.findFirst({
      where: { isActive: true, isMaster: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    return master?.id ?? null
  }

  /** Códigos IBGE de UF (cUFAutor — campo obrigatório do distDFeInt). */
  private codigoUF(uf: string): number {
    const tabela: Record<string, number> = {
      AC: 12, AL: 27, AM: 13, AP: 16, BA: 29, CE: 23, DF: 53, ES: 32,
      GO: 52, MA: 21, MG: 31, MS: 50, MT: 51, PA: 15, PB: 25, PE: 26,
      PI: 22, PR: 41, RJ: 33, RN: 24, RO: 11, RR: 14, RS: 43, SC: 42,
      SE: 28, SP: 35, TO: 17,
    }
    const code = tabela[uf.toUpperCase()]
    if (!code) throw new Error(`UF inválida: ${uf}`)
    return code
  }
}
