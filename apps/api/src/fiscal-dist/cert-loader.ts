import * as fs from 'node:fs'
import * as path from 'node:path'
import { prisma } from '@saas/db'
import { decryptPassword, parseCipher } from '../certificado-digital/crypto.helper'
import { extractKeyCertPem } from '../certificado-digital/pfx-parser'

// Mesmo root usado pelo CertificadoDigitalService — `arquivoPath` no banco é relativo a este diretório.
const STORAGE_ROOT = path.resolve(process.cwd(), 'uploads', 'certificados')

export interface CertLoaded {
  certificadoId: string
  pfxBuffer: Buffer
  passphrase: string
  /** Chave privada + certificado (folha) + cadeia em PEM (via node-forge — o pfx
   *  direto falha no OpenSSL 3 do Node com algoritmo legado). No https.Agent do
   *  mTLS use { key: keyPem, cert: certChainPem } e NÃO passe `ca` (a cadeia do
   *  CLIENTE vai no `cert`; o `ca` serviria pra verificar o SERVIDOR e sobrescrever
   *  o trust store padrão quebraria a validação com "unable to get local issuer"). */
  keyPem: string
  certPem: string
  caPem: string[]
  /** Folha + cadeia concatenadas — é o que se apresenta ao servidor no `cert`. */
  certChainPem: string
  cnpj: string
  razaoSocial: string
  expiraEm: Date
}

/**
 * Carrega o PFX + senha decifrada do certificado A1 vinculado ao cliente.
 *
 * Ordem de busca:
 *  1. `certificadoExplicitoId` (se passado pelo caller)
 *  2. Cert ativo do próprio cliente (status='ATIVO', !arquivado, !vencido)
 *  3. Throw — sem cert disponível
 */
export async function carregarCertificadoCliente(
  clienteId: string,
  certificadoExplicitoId?: string | null,
): Promise<CertLoaded> {
  const cliente = await prisma.cliente.findUnique({
    where: { id: clienteId },
    select: { id: true, documento: true, razaoSocial: true },
  })
  if (!cliente) throw new Error(`Cliente ${clienteId} não encontrado.`)

  // Resolve o cert pelo vínculo (clienteId) OU pelo CNPJ do titular — igual ao
  // certificadoDigital.list da tela. O certificado pode estar num OUTRO cadastro
  // do mesmo CNPJ (ex.: importado do legado num cliente_id diferente); procurar
  // só por clienteId faria a captura falhar mesmo com o cert cadastrado.
  const cnpjCliente = (cliente.documento ?? '').replace(/\D/g, '')
  const orVinculo = cnpjCliente ? [{ clienteId }, { documento: cnpjCliente }] : [{ clienteId }]

  const cert = certificadoExplicitoId
    ? await prisma.certificadoDigital.findUnique({ where: { id: certificadoExplicitoId } })
    : await prisma.certificadoDigital.findFirst({
        where: {
          tipo: 'A1',
          arquivado: false,
          status: { not: 'VENCIDO' },
          arquivoPath: { not: null },
          senhaCifrada: { not: null },
          OR: orVinculo,
        },
        orderBy: { expiraEm: 'desc' },
      })

  if (!cert) {
    // Distingue "não tem certificado" de "tem, mas sem o arquivo PFX/senha" —
    // comum em certificados importados do legado (vieram só com os metadados:
    // validade/razão, sem o binário .pfx e a senha). A tela exibe o cert, mas a
    // captura no ADN precisa do PFX+senha pro handshake mTLS.
    if (!certificadoExplicitoId) {
      const soMetadados = await prisma.certificadoDigital.findFirst({
        where: { tipo: 'A1', arquivado: false, status: { not: 'VENCIDO' }, OR: orVinculo },
        select: { arquivoPath: true, senhaCifrada: true },
      })
      if (soMetadados) {
        const falta = [
          !soMetadados.arquivoPath ? 'arquivo .pfx' : null,
          !soMetadados.senhaCifrada ? 'senha' : null,
        ].filter(Boolean).join(' e ')
        throw new Error(
          `Certificado A1 de ${cliente.razaoSocial} está cadastrado mas sem ${falta || 'o arquivo PFX/senha'} ` +
          `(provavelmente importado do legado só com os metadados). Reimporte o .pfx com a senha na aba ` +
          `Certificados para habilitar a captura no ADN.`,
        )
      }
    }
    throw new Error(`Cliente ${cliente.razaoSocial} sem certificado A1 ativo cadastrado.`)
  }
  if (!cert.arquivoPath || !cert.senhaCifrada) {
    throw new Error(`Certificado ${cert.id}: arquivo PFX ou senha ausente.`)
  }

  // arquivoPath é relativo a STORAGE_ROOT (uploads/certificados). Mantém compat
  // com caminhos absolutos antigos ou que já incluam o prefixo uploads/.
  let pfxAbsPath: string
  if (path.isAbsolute(cert.arquivoPath)) {
    pfxAbsPath = cert.arquivoPath
  } else {
    const candidatoStorage = path.resolve(STORAGE_ROOT, cert.arquivoPath)
    const candidatoCwd = path.resolve(process.cwd(), cert.arquivoPath)
    pfxAbsPath = fs.existsSync(candidatoStorage) ? candidatoStorage : candidatoCwd
  }
  if (!fs.existsSync(pfxAbsPath)) {
    throw new Error(`Arquivo PFX não encontrado: ${pfxAbsPath}`)
  }
  const pfxBuffer = fs.readFileSync(pfxAbsPath)

  let passphrase: string
  try {
    passphrase = decryptPassword(parseCipher(cert.senhaCifrada))
  } catch (e) {
    throw new Error(`Falha ao decifrar senha do cert ${cert.id}: ${(e as Error).message}`)
  }

  // Extrai key/cert em PEM via node-forge (aceita algoritmos legados do A1 BR).
  let keyPem: string, certPem: string, caPem: string[]
  try {
    ({ keyPem, certPem, caPem } = extractKeyCertPem(pfxBuffer, passphrase))
  } catch (e) {
    throw new Error(`Falha ao extrair chave/certificado do PFX (cert ${cert.id}): ${(e as Error).message}`)
  }

  return {
    certificadoId: cert.id,
    pfxBuffer,
    passphrase,
    keyPem,
    certPem,
    caPem,
    certChainPem: [certPem, ...caPem].join('\n'),
    cnpj: cnpjCliente,
    razaoSocial: cliente.razaoSocial,
    expiraEm: cert.expiraEm,
  }
}
