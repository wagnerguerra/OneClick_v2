import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { TsaSerproService } from './tsa-serpro.service'
import * as crypto from 'crypto'
// node-signpdf v3 nao tem types — importamos como any e tratamos abaixo
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeSignPdf = require('node-signpdf')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const forge = require('node-forge')

const SignPdf = nodeSignPdf.SignPdf || nodeSignPdf.default
const signer = SignPdf && typeof SignPdf === 'function' ? new SignPdf() : nodeSignPdf.default
const plainAddPlaceholder =
  nodeSignPdf.plainAddPlaceholder ||
  (() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('node-signpdf/dist/helpers/plainAddPlaceholder')
      return mod.default || mod
    } catch {
      return null
    }
  })()

// OID do unsigned attribute SignatureTimeStamp (RFC 3161 / PAdES-T)
const OID_TIMESTAMP_TOKEN = '1.2.840.113549.1.9.16.2.14'

// Caminho fixo do certificado PJ — mesma convencao usada por cnd/sitfis/etc.
// (carregado via /configuracoes/certificado).
const CERT_PJ_PATH = 'uploads/certificado.pfx'

export interface CertInfo {
  nome: string
  cpfCnpj: string | null
  issuer: string
  notBefore: Date | null
  notAfter: Date | null
  serial: string
}

@Injectable()
export class PdfSignService {
  private readonly logger = new Logger(PdfSignService.name)

  constructor(private readonly tsa: TsaSerproService) {}

  /**
   * Extrai metadados do certificado PFX/P12 (nome, CPF/CNPJ, validade) sem
   * carregar a chave privada — usado para audit trail.
   */
  extrairInfoCertificado(certPath: string, certPassword: string): CertInfo {
    const p = path.isAbsolute(certPath) ? certPath : path.join(process.cwd(), certPath)
    if (!fs.existsSync(p)) throw new Error(`Certificado nao encontrado: ${p}`)
    const buf = fs.readFileSync(p)
    const binary = buf.toString('binary')
    const asn1 = forge.asn1.fromDer(binary)

    const rawPw = certPassword == null ? '' : String(certPassword)
    const candidates = rawPw === '' ? [null, ''] : [rawPw]

    let lastErr: any = null
    for (const pw of candidates) {
      try {
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, pw)
        const bags = (p12.getBags({ bagType: forge.pki.oids.certBag }) || {})[forge.pki.oids.certBag] || []
        if (!bags.length) throw new Error('Nenhum certificado no PFX')
        const certs = bags.map((b: any) => b.cert).filter(Boolean)

        const dnToString = (dn: any) => {
          const attrs = dn?.attributes
          if (!Array.isArray(attrs)) return ''
          return attrs.map((a: any) => `${a.shortName || a.name || a.type || 'attr'}=${a.value}`).join(', ')
        }
        const isSelfSigned = (c: any) => {
          try { return dnToString(c.subject) === dnToString(c.issuer) } catch { return false }
        }
        const cert = certs.find((c: any) => !isSelfSigned(c)) || certs[0]

        const attrs = cert.subject?.attributes || []
        const getAttr = (pred: (a: any) => boolean) => attrs.find(pred)?.value || ''

        const subjectStr = dnToString(cert.subject)

        let cn = getAttr((a: any) => a.name === 'commonName' || a.shortName === 'CN')
        if (!cn && subjectStr) {
          const m = subjectStr.match(/CN=([^/]+?)(?:\/|$)/i) || subjectStr.match(/CN=([^,]+)(?:,|$)/i)
          if (m && m[1]) cn = m[1].trim()
        }
        const serialNumber = getAttr((a: any) => a.name === 'serialNumber' || a.shortName === 'serialNumber')
        const cpfFromOid = getAttr((a: any) => a.type === '2.16.76.1.3.1')
        const cnpjFromOid = getAttr((a: any) => a.type === '2.16.76.1.3.3')
        const pickDigits = (s: any) => {
          const m = String(s || '').match(/(\d{11,14})/)
          return m ? m[1] : ''
        }
        const cpfCnpj =
          pickDigits(cpfFromOid) || pickDigits(cnpjFromOid) || pickDigits(serialNumber) || pickDigits(subjectStr) || pickDigits(cn) || null

        return {
          nome: String(cn || '').trim(),
          cpfCnpj,
          issuer: dnToString(cert.issuer),
          notBefore: cert.validity?.notBefore || null,
          notAfter: cert.validity?.notAfter || null,
          serial: String(cert.serialNumber || ''),
        }
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr || new Error('Falha ao ler certificado PFX')
  }

  /**
   * Verifica se há certificado disponível: arquivo em uploads/certificado.pfx
   * + CERTIFICADO_SENHA configurado em /configuracoes.
   */
  certificadoDisponivel(): boolean {
    const certPassword = process.env.CERTIFICADO_SENHA
    if (!certPassword) return false
    const p = path.resolve(process.cwd(), CERT_PJ_PATH)
    return fs.existsSync(p)
  }

  /** Retorna o caminho absoluto do cert PJ se existir, senão null. */
  resolveCertPath(): string | null {
    const p = path.resolve(process.cwd(), CERT_PJ_PATH)
    return fs.existsSync(p) ? p : null
  }

  /**
   * Assina um buffer de PDF com o cert configurado em .env.
   *
   * - withTimestamp=false (default): PAdES-BES — assinatura ICP-Brasil válida.
   * - withTimestamp=true: PAdES-T — após assinar, busca TimeStampToken da TSA SERPRO
   *   e adiciona como unsigned attribute (RFC 3161). Eleva pra long-term validation.
   *   Se a TSA falhar, retorna BES com warning (assinatura não fica comprometida).
   */
  async assinarPdf(pdfBuffer: Buffer, opts?: {
    certPath?: string
    certPassword?: string
    nomeSignatario?: string
    motivo?: string
    local?: string
    withTimestamp?: boolean
  }): Promise<{ buffer: Buffer; padesLevel: 'BES' | 'T'; tsaInfo?: string }> {
    if (typeof plainAddPlaceholder !== 'function') {
      throw new Error('plainAddPlaceholder indisponivel — verifique node-signpdf v3')
    }
    if (!signer || typeof signer.sign !== 'function') {
      throw new Error('SignPdf signer invalido — verifique node-signpdf')
    }

    const certFullPath = opts?.certPath
      ? (path.isAbsolute(opts.certPath) ? opts.certPath : path.join(process.cwd(), opts.certPath))
      : this.resolveCertPath()
    if (!certFullPath) {
      throw new Error('Certificado PJ nao encontrado. Faça upload em /configuracoes/certificado.')
    }
    const certPassword = opts?.certPassword || process.env.CERTIFICADO_SENHA
    if (!certPassword) throw new Error('CERTIFICADO_SENHA nao configurado em /configuracoes')

    const certBuffer = fs.readFileSync(certFullPath)

    // Placeholder maior pra acomodar BES + TimeStampToken (TS ~3-5KB)
    const placeholderSize = opts?.withTimestamp ? 16384 : 8192
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer,
      reason: opts?.motivo || 'Assinatura digital do contrato',
      contactInfo: opts?.nomeSignatario || '',
      name: opts?.nomeSignatario || 'CENTRAL CONTABIL LTDA',
      location: opts?.local || 'Brasil',
      signatureLength: placeholderSize,
    })

    const signedPdfBes = signer.sign(pdfWithPlaceholder, certBuffer, { passphrase: certPassword }) as Buffer

    if (!opts?.withTimestamp || !this.tsa.isConfigured()) {
      return { buffer: signedPdfBes, padesLevel: 'BES' }
    }

    // Pós-processa pra PAdES-T: adiciona TimeStampToken como unsigned attribute
    try {
      const result = await this.adicionarTimestampNoPdf(signedPdfBes, placeholderSize)
      return { buffer: result.buffer, padesLevel: 'T', tsaInfo: result.tsaInfo }
    } catch (e) {
      this.logger.warn(`TSA falhou, mantendo PAdES-BES: ${(e as Error).message}`)
      return { buffer: signedPdfBes, padesLevel: 'BES', tsaInfo: `TSA falhou: ${(e as Error).message}` }
    }
  }

  /**
   * Pós-processa um PDF assinado em BES, busca TimeStampToken na TSA SERPRO e
   * adiciona como unsigned attribute em SignerInfo. Re-injeta o PKCS#7 atualizado
   * no PDF mantendo o tamanho do placeholder original.
   */
  private async adicionarTimestampNoPdf(pdfBes: Buffer, placeholderSize: number): Promise<{ buffer: Buffer; tsaInfo: string }> {
    // 1. Localiza o /Contents <hex...> no PDF e extrai o PKCS#7 BES
    const contentsInfo = this.locateContents(pdfBes)
    const pkcs7HexBes = contentsInfo.hex.replace(/00+$/, '') // remove padding zero
    const pkcs7DerBes = Buffer.from(pkcs7HexBes, 'hex')

    // 2. Decoda PKCS#7 e extrai o signerInfo
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pkcs7DerBes.toString('binary')))
    const signedData = this.getSignedDataFromContentInfo(asn1)
    const signerInfos = this.getSignerInfos(signedData)
    if (!signerInfos.value || signerInfos.value.length === 0) {
      throw new Error('SignerInfo nao encontrado no PKCS#7')
    }
    const signerInfo = signerInfos.value[0]

    // 3. Extrai o signature value (último OCTET STRING antes de [1] unsignedAttrs)
    const signatureValue = this.getSignatureValue(signerInfo)

    // 4. Calcula SHA-256 do signature value (esse é o hash que vai pro TSA)
    const hashHex = crypto.createHash('sha256').update(Buffer.from(signatureValue, 'binary')).digest('hex')

    // 5. Pede TimeStampToken
    const tsToken = await this.tsa.timestampHash(hashHex)
    this.logger.log(`TimeStampToken obtido (${tsToken.length} bytes) para hash ${hashHex.slice(0, 16)}...`)

    // 6. Adiciona unsigned attribute em SignerInfo
    this.appendUnsignedAttribute(signerInfo, OID_TIMESTAMP_TOKEN, tsToken)

    // 7. Re-encoda PKCS#7
    const pkcs7DerT = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
    if (pkcs7DerT.length > placeholderSize) {
      throw new Error(`PKCS#7 com TS (${pkcs7DerT.length}b) excede placeholder (${placeholderSize}b)`)
    }

    // 8. Re-injeta no PDF (preserva tamanho via padding com 00)
    const pkcs7HexT = pkcs7DerT.toString('hex').padEnd(placeholderSize * 2, '0')
    const before = pdfBes.subarray(0, contentsInfo.start)
    const after = pdfBes.subarray(contentsInfo.start + contentsInfo.length)
    const newContent = Buffer.from(pkcs7HexT, 'utf8')
    if (newContent.length !== contentsInfo.length) {
      throw new Error(`Tamanho inesperado: ${newContent.length} vs ${contentsInfo.length}`)
    }
    const result = Buffer.concat([before, newContent, after])
    return { buffer: result, tsaInfo: `SERPRO TSA — token ${tsToken.length}b` }
  }

  /** Localiza o byte range de /Contents <...> no PDF. */
  private locateContents(pdf: Buffer): { start: number; length: number; hex: string } {
    const contentsTag = Buffer.from('/Contents <')
    const start = pdf.indexOf(contentsTag)
    if (start < 0) throw new Error('Tag /Contents nao encontrada no PDF')
    const hexStart = start + contentsTag.length
    const closeRel = pdf.subarray(hexStart).indexOf('>')
    if (closeRel < 0) throw new Error('Fecha-> de /Contents nao encontrado')
    const hex = pdf.subarray(hexStart, hexStart + closeRel).toString('utf8')
    return { start: hexStart, length: closeRel, hex }
  }

  /**
   * ContentInfo = SEQ { contentType OID, [0] EXPLICIT SignedData }
   * Retorna o nó SignedData (depois do tag [0] EXPLICIT).
   */
  private getSignedDataFromContentInfo(contentInfo: any): any {
    const explicitTag = contentInfo.value[1]  // [0] EXPLICIT
    return explicitTag.value[0]                // SignedData (SEQUENCE)
  }

  /**
   * SignedData ::= SEQ { version, digestAlgorithms, encapContentInfo,
   *   [0] certificates OPTIONAL, [1] crls OPTIONAL, signerInfos SET OF SignerInfo }
   * Retorna o último SET (signerInfos).
   */
  private getSignerInfos(signedData: any): any {
    // signerInfos é o último SET na sequência
    for (let i = signedData.value.length - 1; i >= 0; i--) {
      const child = signedData.value[i]
      if (child.tagClass === forge.asn1.Class.UNIVERSAL && child.type === forge.asn1.Type.SET && !child.constructed === false) {
        // O primeiro SET vindo de trás é o signerInfos
        return child
      }
    }
    throw new Error('SignerInfos SET nao encontrado em SignedData')
  }

  /**
   * SignerInfo ::= SEQ { version, sid, digestAlgorithm, [0] signedAttrs?,
   *   signatureAlgorithm, signature OCTET STRING, [1] unsignedAttrs? }
   * Retorna o conteúdo binary do OCTET STRING signature.
   */
  private getSignatureValue(signerInfo: any): string {
    // Acha o OCTET STRING (último ou penúltimo, dependendo se há unsignedAttrs)
    for (let i = signerInfo.value.length - 1; i >= 0; i--) {
      const child = signerInfo.value[i]
      if (child.tagClass === forge.asn1.Class.UNIVERSAL && child.type === forge.asn1.Type.OCTETSTRING) {
        return child.value
      }
    }
    throw new Error('Signature value (OCTET STRING) nao encontrado em SignerInfo')
  }

  /**
   * Adiciona ou estende [1] IMPLICIT SET OF Attribute em SignerInfo:
   *   Attribute ::= SEQ { attrType OID, attrValues SET OF ANY }
   * O TimeStampToken (DER do CMS retornado pela TSA) entra como attrValue.
   */
  private appendUnsignedAttribute(signerInfo: any, attrOid: string, value: Buffer): void {
    const tokenAsn1 = forge.asn1.fromDer(forge.util.createBuffer(value.toString('binary')))
    const attribute = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(attrOid).getBytes()),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, [tokenAsn1]),
    ])

    // Procura se já existe [1] IMPLICIT SET (unsignedAttrs)
    const existing = signerInfo.value.find((c: any) => c.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && c.type === 1)
    if (existing) {
      existing.value.push(attribute)
    } else {
      signerInfo.value.push(forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 1, true, [attribute]))
    }
  }
}
