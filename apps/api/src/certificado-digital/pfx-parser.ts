import forge from 'node-forge'

export interface PfxInfo {
  titular: string         // Common Name (CN)
  documento: string       // CPF/CNPJ extraído do CN ou alternative names
  numeroSerie: string     // serial number (hex)
  emissor: string         // CN da AC emissora
  emitidoEm: Date
  expiraEm: Date
}

/**
 * Parsea um arquivo PKCS#12 (.pfx/.p12) e extrai informações do certificado.
 * Lança erro se a senha estiver incorreta ou o arquivo for inválido.
 */
export function parsePfx(pfxBuffer: Buffer, password: string): PfxInfo {
  // node-forge espera string binária (cada byte como char)
  const pfxBinary = pfxBuffer.toString('binary')
  let p12Asn1
  try {
    p12Asn1 = forge.asn1.fromDer(pfxBinary)
  } catch {
    throw new Error('Arquivo PFX inválido ou corrompido.')
  }
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
  } catch (e) {
    const msg = (e as Error).message?.toLowerCase() || ''
    if (msg.includes('mac') || msg.includes('password')) {
      throw new Error('Senha do certificado incorreta.')
    }
    throw new Error('Falha ao abrir o certificado: ' + (e as Error).message)
  }

  const CERT_BAG_OID = forge.pki.oids.certBag as string
  const certBags = p12.getBags({ bagType: CERT_BAG_OID })
  const certs = certBags[CERT_BAG_OID] ?? []
  if (certs.length === 0 || !certs[0]?.cert) {
    throw new Error('Certificado não encontrado dentro do PFX.')
  }
  const cert = certs[0]!.cert!

  // Subject CN — formato comum: "FULANO DE TAL:12345678900" (cpf concatenado)
  const cnAttr = cert.subject.attributes.find((a: forge.pki.CertificateField) => a.shortName === 'CN' || a.name === 'commonName')
  const cnRaw = (cnAttr?.value as string) ?? ''
  const cnParts = cnRaw.split(':')
  const titular = cnParts[0]?.trim() || cnRaw.trim() || 'Sem nome'
  // Tenta extrair documento do CN (após :) ou de alt names (subjectAltName / extensions)
  let documento = cnParts[1]?.trim() ?? ''
  if (!documento) {
    // Fallback: busca em extensões — alguns certs colocam CPF/CNPJ em otherName
    for (const ext of cert.extensions) {
      if (ext.name === 'subjectAltName' && Array.isArray(ext.altNames)) {
        for (const alt of ext.altNames) {
          if (alt.value && /^\d{11}$|^\d{14}$|^\d{8,}$/.test(String(alt.value).replace(/\D/g, ''))) {
            documento = String(alt.value).replace(/\D/g, '')
            break
          }
        }
      }
      if (documento) break
    }
  }
  documento = documento.replace(/\D/g, '')

  // Emissor (Issuer CN)
  const issuerCn = cert.issuer.attributes.find((a: forge.pki.CertificateField) => a.shortName === 'CN')
  const emissor = (issuerCn?.value as string) ?? 'Desconhecido'

  return {
    titular,
    documento,
    numeroSerie: cert.serialNumber,
    emissor,
    emitidoEm: cert.validity.notBefore,
    expiraEm: cert.validity.notAfter,
  }
}

export interface PfxKeyCert {
  keyPem: string
  certPem: string   // certificado do titular (folha)
  caPem: string[]   // cadeia (ACs intermediárias/raiz), se houver
}

/**
 * Extrai a chave privada + certificado (e cadeia) de um PFX como PEM, via
 * node-forge — que aceita os algoritmos legados (RC2/3DES) comuns nos A1
 * brasileiros e que o OpenSSL 3 do Node rejeita ("Unsupported PKCS12 PFX data").
 * O https.Agent do mTLS deve usar { key, cert, ca } em vez de { pfx, passphrase }.
 */
export function extractKeyCertPem(pfxBuffer: Buffer, password: string): PfxKeyCert {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'))
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
  } catch (e) {
    const msg = (e as Error).message?.toLowerCase() || ''
    if (msg.includes('mac') || msg.includes('password')) throw new Error('Senha do certificado incorreta.')
    throw new Error('Falha ao abrir o certificado: ' + (e as Error).message)
  }

  const SHROUDED_OID = forge.pki.oids.pkcs8ShroudedKeyBag as string
  const KEY_OID = forge.pki.oids.keyBag as string
  const CERT_OID = forge.pki.oids.certBag as string

  const shrouded = p12.getBags({ bagType: SHROUDED_OID })[SHROUDED_OID] ?? []
  const plain = p12.getBags({ bagType: KEY_OID })[KEY_OID] ?? []
  const key = shrouded[0]?.key ?? plain[0]?.key
  if (!key) throw new Error('Chave privada não encontrada no PFX.')

  const certs = (p12.getBags({ bagType: CERT_OID })[CERT_OID] ?? [])
    .map((b): forge.pki.Certificate | undefined => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c)
  if (certs.length === 0) throw new Error('Certificado não encontrado no PFX.')

  // Folha = certificado cujo módulo público bate com o da chave privada (RSA);
  // os demais formam a cadeia. Fallback: o primeiro cert do bag.
  const keyN = (key as unknown as { n?: { equals(o: unknown): boolean } }).n
  const leaf = certs.find((c: forge.pki.Certificate) => {
    try { return !!keyN && keyN.equals((c.publicKey as unknown as { n: unknown }).n) }
    catch { return false }
  }) ?? certs[0]!
  const ca = certs.filter((c: forge.pki.Certificate) => c !== leaf)

  return {
    keyPem: forge.pki.privateKeyToPem(key),
    certPem: forge.pki.certificateToPem(leaf),
    caPem: ca.map(c => forge.pki.certificateToPem(c)),
  }
}
