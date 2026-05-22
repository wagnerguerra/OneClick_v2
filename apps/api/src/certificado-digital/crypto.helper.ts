import crypto from 'node:crypto'

/**
 * Helpers de criptografia para senhas de certificados digitais.
 *
 * Algoritmo: AES-256-GCM (autenticado, confidencialidade + integridade).
 * KEK (Key Encryption Key) carregada de CERTIFICADO_KEK (env), 32 bytes em base64.
 * Em prod: gerar com `openssl rand -base64 32` e nunca commitar.
 */

const ALG = 'aes-256-gcm'
const IV_LEN = 12  // 96 bits — recomendado para GCM

let cachedKek: Buffer | null = null

function loadKek(): Buffer {
  if (cachedKek) return cachedKek
  const raw = process.env.CERTIFICADO_KEK
  if (!raw) {
    throw new Error(
      'CERTIFICADO_KEK não configurada. Defina em .env (32 bytes em base64). '
      + 'Gere com: openssl rand -base64 32',
    )
  }
  const buf = Buffer.from(raw.trim(), 'base64')
  if (buf.length !== 32) {
    throw new Error('CERTIFICADO_KEK inválida — esperados 32 bytes (base64).')
  }
  cachedKek = buf
  return buf
}

export interface CipheredPayload {
  iv: string         // base64
  ciphertext: string // base64
  tag: string        // base64
  v: number          // versão da KEK
}

/** Cifra uma string em UTF-8 → CipheredPayload (JSON-serializável). */
export function encryptPassword(plaintext: string, version = 1): CipheredPayload {
  const kek = loadKek()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALG, kek, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    iv: iv.toString('base64'),
    ciphertext: ct.toString('base64'),
    tag: tag.toString('base64'),
    v: version,
  }
}

/** Decifra um CipheredPayload → string UTF-8. Lança erro se tag inválida. */
export function decryptPassword(payload: CipheredPayload): string {
  const kek = loadKek()
  const iv = Buffer.from(payload.iv, 'base64')
  const ct = Buffer.from(payload.ciphertext, 'base64')
  const tag = Buffer.from(payload.tag, 'base64')
  const decipher = crypto.createDecipheriv(ALG, kek, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}

/** Helper para serializar/deserializar do banco (campo Text). */
export function serializeCipher(payload: CipheredPayload): string {
  return JSON.stringify(payload)
}
export function parseCipher(json: string): CipheredPayload {
  const obj = JSON.parse(json)
  if (typeof obj.iv !== 'string' || typeof obj.ciphertext !== 'string' || typeof obj.tag !== 'string') {
    throw new Error('Payload de senha cifrada malformado')
  }
  return obj as CipheredPayload
}

/** SHA-256 em hex de um Buffer (para verificar integridade do PFX). */
export function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}
