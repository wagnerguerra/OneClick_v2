import { Injectable } from '@nestjs/common'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const forge = require('node-forge')

/**
 * Cliente RFC 3161 para o produto API CARIMBO DE TEMPO SERPRO (contrato do
 * cliente). Faz OAuth Client Credentials usando as mesmas CONSUMER_KEY/SECRET
 * já configuradas para Integra Contador, e expõe o método timestampHash() que
 * retorna um TimeStampToken (CMS) pronto para embedar como unsigned attribute
 * em um SignedData PAdES.
 *
 * Doc oficial: https://doc-apitimestamp.estaleiro.serpro.gov.br/
 */
@Injectable()
export class TsaSerproService {
  private cachedToken: { token: string; expiresAt: number } | null = null

  /**
   * Indica se o serviço está configurado. Se faltar CONSUMER_KEY/SECRET o
   * carimbo é silenciosamente pulado (assinatura permanece BES, ainda válida).
   */
  isConfigured(): boolean {
    return !!(process.env.CONSUMER_KEY && process.env.CONSUMER_SECRET)
  }

  /** Obtém access token do gateway SERPRO (cache até 1h). */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token
    }
    const consumerKey = process.env.CONSUMER_KEY
    const consumerSecret = process.env.CONSUMER_SECRET
    if (!consumerKey || !consumerSecret) throw new Error('CONSUMER_KEY/CONSUMER_SECRET não configurados')

    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    const res = await fetch('https://gateway.apiserpro.serpro.gov.br/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`SERPRO token falhou: ${res.status} ${t.slice(0, 200)}`)
    }
    const json: any = await res.json()
    const token = json.access_token as string
    const expiresIn = (json.expires_in as number) || 3600
    this.cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 }
    return token
  }

  /**
   * Pede um carimbo de tempo para o hash SHA-256 informado.
   * @param hashHex hash em hex (vai ser convertido para bytes RFC 3161)
   * @returns TimeStampToken DER (Buffer) pronto para inserir como unsigned attribute
   */
  async timestampHash(hashHex: string): Promise<Buffer> {
    const token = await this.getAccessToken()

    // Constrói TimeStampReq RFC 3161 manualmente:
    //   TimeStampReq ::= SEQUENCE {
    //     version       INTEGER { v1(1) },
    //     messageImprint MessageImprint,
    //     reqPolicy     OBJECT IDENTIFIER OPTIONAL,
    //     nonce         INTEGER OPTIONAL,
    //     certReq       BOOLEAN DEFAULT FALSE
    //   }
    //   MessageImprint ::= SEQUENCE {
    //     hashAlgorithm AlgorithmIdentifier,
    //     hashedMessage OCTET STRING
    //   }
    const SHA256_OID = '2.16.840.1.101.3.4.2.1'
    const hashBytes = forge.util.hexToBytes(hashHex)
    const messageImprint = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer(SHA256_OID).getBytes()),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''),
      ]),
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, hashBytes),
    ])
    // certReq = TRUE pra que TSA inclua seu cert na resposta (necessário pra LTV)
    const tsReq = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, forge.asn1.integerToDer(1).getBytes()),
      messageImprint,
      forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.BOOLEAN, false, String.fromCharCode(0xff)),
    ])
    const reqDer = forge.asn1.toDer(tsReq).getBytes()
    const reqBuffer = Buffer.from(reqDer, 'binary')

    // POST application/timestamp-query
    const res = await fetch('https://gateway.apiserpro.serpro.gov.br/apitimestamp/v1/stamps-asn1', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/timestamp-query',
        'Accept': 'application/timestamp-reply',
      },
      body: reqBuffer,
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`SERPRO timestamp falhou: ${res.status} ${t.slice(0, 200)}`)
    }
    const respBuffer = Buffer.from(await res.arrayBuffer())

    // Parse TimeStampResp:
    //   TimeStampResp ::= SEQUENCE {
    //     status     PKIStatusInfo,
    //     timeStampToken TimeStampToken OPTIONAL
    //   }
    const respAsn1 = forge.asn1.fromDer(forge.util.createBuffer(respBuffer.toString('binary')))
    if (!respAsn1.value || respAsn1.value.length < 2) {
      throw new Error('Resposta TSA inválida (sem TimeStampToken)')
    }
    const status = respAsn1.value[0]
    const statusValue = forge.asn1.derToInteger(status.value[0].value)
    if (statusValue !== 0 && statusValue !== 1) {
      throw new Error(`TSA rejeitou (status=${statusValue})`)
    }
    const timeStampToken = respAsn1.value[1]
    const tokenDer = forge.asn1.toDer(timeStampToken).getBytes()
    return Buffer.from(tokenDer, 'binary')
  }
}
