import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as https from 'https'
import * as fs from 'fs'
import * as path from 'path'
import { semSegredos } from '../common/segredos'
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
  private readonly log = new Logger(TsaSerproService.name)
  private cachedToken: { token: string; expiresAt: number } | null = null

  /**
   * Indica se o serviço está configurado. Sem credencial o carimbo é pulado
   * (assinatura permanece BES, ainda válida).
   */
  isConfigured(): boolean {
    return !!(process.env.TSA_URL || (process.env.CONSUMER_KEY && process.env.CONSUMER_SECRET))
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
   * Credencial SERPRO — a mesma para todos os contratos do escritório.
   *
   * Lê primeiro do banco, como os demais serviços SERPRO (CND, SITFIS,
   * Caixa Postal): assim a credencial pode ser trocada em /configuracoes sem
   * publicar versão nova, e existe um lugar só para mantê-la.
   */
  private async getCredenciais(): Promise<{ key: string; secret: string; senhaCert: string }> {
    const linhas = await prisma.systemConfig.findMany({
      where: { key: { in: ['CONSUMER_KEY', 'CONSUMER_SECRET', 'CERTIFICADO_SENHA'] } },
    }).catch(() => [] as Array<{ key: string; value: string }>)
    const doBanco = new Map(linhas.map((l) => [l.key, l.value]))

    return {
      key: doBanco.get('CONSUMER_KEY') || process.env.CONSUMER_KEY || '',
      secret: doBanco.get('CONSUMER_SECRET') || process.env.CONSUMER_SECRET || '',
      senhaCert: doBanco.get('CERTIFICADO_SENHA') || process.env.CERTIFICADO_SENHA || '',
    }
  }

  /**
   * Certificado da empresa, o mesmo que as outras consultas SERPRO usam.
   *
   * O gateway exige o certificado no próprio handshake (mTLS): sem ele a
   * assinatura do contrato não é reconhecida e a resposta é
   * "A valid OAuth client could not be found for client_id" — mensagem que
   * parece chave errada, mas é certificado ausente.
   */
  private lerCertificado(): Buffer | undefined {
    const caminho = path.resolve(process.cwd(), 'uploads', 'certificado.pfx')
    return fs.existsSync(caminho) ? fs.readFileSync(caminho) : undefined
  }

  /** Obtém access token do gateway SERPRO (cache até 1h). */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) {
      return this.cachedToken.token
    }
    const { key: consumerKey, secret: consumerSecret, senhaCert } = await this.getCredenciais()
    if (!consumerKey || !consumerSecret) {
      throw new Error('Consumer Key/Secret do SERPRO não configurados (Configurações → SERPRO)')
    }

    const basic = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    const corpo = 'grant_type=client_credentials'
    const pfx = this.lerCertificado()

    const res = await this.postHttps({
      hostname: 'gateway.apiserpro.serpro.gov.br',
      port: 443,
      path: '/token',
      method: 'POST',
      ...(pfx ? { pfx, passphrase: senhaCert } : {}),
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(Buffer.byteLength(corpo)),
      },
      rejectUnauthorized: true,
    }, Buffer.from(corpo))

    if (res.status !== 200) {
      // O corpo do gateway ecoa a Consumer Key no `client_id`, e essa mensagem
      // vai parar na tela de quem assina. O detalhe fica no log do servidor; o
      // usuário recebe o que ele pode resolver.
      const detalhe = semSegredos(res.corpo.toString('utf8').slice(0, 300))
      this.log.error({ status: res.status, detalhe, comCertificado: !!pfx }, 'SERPRO recusou o token do carimbo')

      throw new Error(
        res.status === 401
          ? 'SERPRO recusou a autenticação do carimbo do tempo. Confira, em Configurações, a Consumer Key/Secret'
            + (pfx ? ' e a senha do certificado do escritório.' : ' — e envie o certificado do escritório, que o gateway exige no acesso.')
          : `SERPRO respondeu HTTP ${res.status} ao autenticar o carimbo do tempo.`,
      )
    }

    const json = JSON.parse(res.corpo.toString('utf8')) as { access_token: string; expires_in?: number }
    this.cachedToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 }
    return json.access_token
  }

  /**
   * POST HTTPS com corpo binário e certificado de cliente opcional.
   *
   * O `fetch` do Node não aceita certificado por requisição, e a resposta do
   * carimbo é DER — daí `https.request` e Buffer, em vez de texto.
   */
  private postHttps(
    opcoes: https.RequestOptions,
    corpo: Buffer,
  ): Promise<{ status: number; contentType: string | null; corpo: Buffer }> {
    return new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error('Timeout SERPRO (60s)')), 60_000)
      const req = https.request(opcoes, (res) => {
        const partes: Buffer[] = []
        res.on('data', (c: Buffer) => partes.push(c))
        res.on('end', () => {
          clearTimeout(limite)
          resolve({
            status: res.statusCode || 0,
            contentType: (res.headers['content-type'] as string) || null,
            corpo: Buffer.concat(partes),
          })
        })
      })
      req.on('error', (e) => { clearTimeout(limite); reject(e) })
      req.write(corpo)
      req.end()
    })
  }

  /**
   * Pede um carimbo de tempo para o hash SHA-256 informado.
   * @param hashHex hash em hex (vai ser convertido para bytes RFC 3161)
   * @returns TimeStampToken DER (Buffer) pronto para inserir como unsigned attribute
   */
  async timestampHash(hashHex: string): Promise<Buffer> {
    const url = await this.getUrl()
    const noSerpro = url === TSA_SERPRO_PADRAO
    // Autoridade fora do SERPRO fala RFC 3161 direto, sem OAuth nem
    // certificado. Exigir token ali impediria justamente o caminho alternativo.
    const { senhaCert } = await this.getCredenciais()
    const token = noSerpro ? await this.getAccessToken() : null

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

    // POST application/timestamp-query — no SERPRO, com o mesmo certificado do
    // token: o gateway pede mTLS na chamada inteira, não só na autenticação.
    const alvo = new URL(url)
    const pfx = noSerpro ? this.lerCertificado() : undefined
    const res = await this.postHttps({
      hostname: alvo.hostname,
      port: alvo.port ? Number(alvo.port) : 443,
      path: alvo.pathname + alvo.search,
      method: 'POST',
      ...(pfx ? { pfx, passphrase: senhaCert } : {}),
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/timestamp-query',
        'Accept': 'application/timestamp-reply',
        'Content-Length': String(reqBuffer.length),
      },
      rejectUnauthorized: true,
    }, reqBuffer)

    if (res.status !== 200) {
      this.log.error(
        { status: res.status, detalhe: semSegredos(res.corpo.toString('utf8').slice(0, 300)), autoridade: alvo.hostname },
        'Autoridade de carimbo recusou a requisição',
      )
      throw new Error(`A autoridade de carimbo do tempo respondeu HTTP ${res.status}.`)
    }
    const respBuffer = res.corpo

    // Parse TimeStampResp:
    //   TimeStampResp ::= SEQUENCE {
    //     status     PKIStatusInfo,
    //     timeStampToken TimeStampToken OPTIONAL
    //   }
    const respAsn1 = this.lerTimeStampResp(respBuffer, res.contentType)
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
