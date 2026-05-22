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

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })
  const certs = certBags[forge.pki.oids.certBag] ?? []
  if (certs.length === 0 || !certs[0]?.cert) {
    throw new Error('Certificado não encontrado dentro do PFX.')
  }
  const cert = certs[0]!.cert!

  // Subject CN — formato comum: "FULANO DE TAL:12345678900" (cpf concatenado)
  const cnAttr = cert.subject.attributes.find(a => a.shortName === 'CN' || a.name === 'commonName')
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
  const issuerCn = cert.issuer.attributes.find(a => a.shortName === 'CN')
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
