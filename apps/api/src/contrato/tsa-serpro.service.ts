import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
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
/** Endereço do produto Carimbo de Tempo do SERPRO — o padrão quando nada é configurado. */
const TSA_SERPRO_PADRAO = 'https://gateway.apiserpro.serpro.gov.br/apitimestamp/v1/stamps-asn1'

@Injectable()
export class TsaSerproService {
  private cachedToken: { token: string; expiresAt: number } | null = null

  /**
   * Indica se o serviço está configurado. Sem credencial o carimbo é pulado
   * (assinatura permanece BES, ainda válida).
   */
  isConfigured(): boolean {
    return !!(
      process.env.TSA_URL
      || (process.env.TSA_CONSUMER_KEY && process.env.TSA_CONSUMER_SECRET)
      || (process.env.CONSUMER_KEY && process.env.CONSUMER_SECRET)
    )
  }

  /**
   * Endereço da autoridade de carimbo.
   *
   * Carimbar é RFC 3161 puro: qualquer autoridade que fale o protocolo serve, e
   * o corpo da requisição é o mesmo. Trocar de fornecedor é trocar esta URL —
   * por isso ela é configuração, não constante.
   *
   * Para valer dentro da ICP-Brasil o carimbo precisa vir de uma ACT
   * credenciada; para uso interno (provar que o documento existia numa data),
   * qualquer autoridade RFC 3161 resolve.
   */
  private async getUrl(): Promise<string> {
    const linha = await prisma.systemConfig.findFirst({ where: { key: 'TSA_URL' } }).catch(() => null)
    return linha?.value || process.env.TSA_URL || TSA_SERPRO_PADRAO
  }

  /**
   * Credencial do Carimbo de Tempo.
   *
   * O Carimbo de Tempo é um PRODUTO À PARTE no SERPRO, com assinatura própria e
   * gateway próprio (`gateway.apiserpro`), diferente do Integra Contador
   * (`autenticacao.sapi`, com certificado). A chave de um não vale no outro — o
   * gateway responde "A valid OAuth client could not be found". Por isso existe
   * o par TSA_*, e o CONSUMER_* fica só como retrocompatibilidade.
   *
   * Lê primeiro do banco, como os demais serviços SERPRO: assim a credencial
   * pode ser trocada em /configuracoes, sem publicar versão nova.
   */
  private async getCredenciais(): Promise<{ key: string; secret: string }> {
    const linhas = await prisma.systemConfig.findMany({
      where: { key: { in: ['TSA_CONSUMER_KEY', 'TSA_CONSUMER_SECRET', 'CONSUMER_KEY', 'CONSUMER_SECRET'] } },
    }).catch(() => [] as Array<{ key: string; value: string }>)
    const doBanco = new Map(linhas.map((l) => [l.key, l.value]))

    const key = doBanco.get('TSA_CONSUMER_KEY') || process.env.TSA_CONSUMER_KEY
      || doBanco.get('CONSUMER_KEY') || process.env.CONSUMER_KEY || ''
    const secret = doBanco.get('TSA_CONSUMER_SECRET') || process.env.TSA_CONSUMER_SECRET
      || doBanco.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET || ''
    return { key, secret }
  }

  /** Obtém access token do gateway SERPRO (cache até 1h). */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token
    }
    const { key: consumerKey, secret: consumerSecret } = await this.getCredenciais()
    if (!consumerKey || !consumerSecret) {
      throw new Error('Credencial do Carimbo de Tempo não configurada (TSA_CONSUMER_KEY/SECRET)')
    }

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
      // O 401 aqui costuma ser assinatura ausente no produto Carimbo de Tempo,
      // e não senha errada: a chave do Integra Contador não vale neste gateway.
      throw new Error(
        `SERPRO token falhou: ${res.status} ${t.slice(0, 200)}`
        + (res.status === 401 ? ' — confira se a chave é a do produto Carimbo de Tempo (TSA_CONSUMER_KEY).' : ''),
      )
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
    const url = await this.getUrl()
    // Autoridade fora do SERPRO fala RFC 3161 direto, sem OAuth. Exigir token
    // ali impediria justamente o caminho alternativo.
    const { key, secret } = await this.getCredenciais()
    const token = url === TSA_SERPRO_PADRAO && key && secret ? await this.getAccessToken() : null

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
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    const respAsn1 = this.lerTimeStampResp(respBuffer, res.headers.get('content-type'))
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

  /**
   * Lê a TimeStampResp aceitando as formas em que ela chega.
   *
   * O RFC 3161 prevê DER puro, mas gateway costuma reembalar: já vimos a
   * resposta vir em base64 (às vezes dentro de JSON). Tentar só o DER produzia
   * "Too few bytes to read ASN.1 value", que não diz nada sobre o que chegou.
   *
   * Quando nenhuma forma serve, o erro carrega tipo, tamanho e o começo do
   * conteúdo — sem isso, diagnosticar exige mais uma rodada de produção.
   */
  private lerTimeStampResp(corpo: Buffer, contentType: string | null): any {
    const tentativas: Array<{ como: string; bytes: Buffer }> = [{ como: 'DER', bytes: corpo }]

    const texto = corpo.toString('utf8').trim()

    // JSON com o token num campo — pega o primeiro valor que pareça base64 longo.
    if (texto.startsWith('{')) {
      try {
        const json = JSON.parse(texto)
        for (const v of Object.values(json)) {
          if (typeof v === 'string' && v.length > 100) {
            tentativas.push({ como: 'JSON+base64', bytes: Buffer.from(v, 'base64') })
          }
        }
      } catch { /* não era JSON — segue para as outras formas */ }
    }

    // Base64 cru (com ou sem quebras de linha).
    if (/^[A-Za-z0-9+/=\s]+$/.test(texto) && texto.length > 100) {
      tentativas.push({ como: 'base64', bytes: Buffer.from(texto.replace(/\s+/g, ''), 'base64') })
    }

    for (const t of tentativas) {
      try {
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(t.bytes.toString('binary')))
        if (asn1?.value?.length >= 2) return asn1
      } catch { /* tenta a próxima forma */ }
    }

    throw new Error(
      `Resposta da TSA ilegível (content-type: ${contentType ?? 'ausente'}, ${corpo.length} bytes, `
      + `início: ${JSON.stringify(texto.slice(0, 60))})`,
    )
  }
}
