import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { createHmac, timingSafeEqual } from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

export interface WhatsappCreds {
  token: string
  phoneNumberId: string
  appSecret: string
  verifyToken: string
  apiType: string
}

// Lê credenciais de env com fallback no SystemConfig (espelha email.service).
async function readKey(key: string): Promise<string> {
  let v = process.env[key] || ''
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key } })
    if (cfg?.value) v = cfg.value
  } catch { /* ignore */ }
  return v
}

@Injectable()
export class WhatsappCloudService {
  async getCreds(): Promise<WhatsappCreds> {
    const [token, phoneNumberId, appSecret, verifyToken, apiType] = await Promise.all([
      readKey('WHATSAPP_ACCESS_TOKEN'),
      readKey('WHATSAPP_PHONE_NUMBER_ID'),
      readKey('WHATSAPP_APP_SECRET'),
      readKey('WHATSAPP_VERIFY_TOKEN'),
      readKey('WHATSAPP_API_TYPE'),
    ])
    return { token, phoneNumberId, appSecret, verifyToken, apiType: apiType || 'meta_cloud' }
  }

  async configurado(): Promise<boolean> {
    const c = await this.getCreds()
    return !!(c.token && c.phoneNumberId)
  }

  /** Valida a assinatura X-Hub-Signature-256 do webhook (HMAC-SHA256 com APP_SECRET). */
  async verificarAssinatura(rawBody: Buffer, signature?: string): Promise<boolean> {
    const { appSecret } = await this.getCreds()
    if (!appSecret) return true // sem secret configurado, não bloqueia (dev)
    if (!signature) return false
    const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
    try {
      const a = Buffer.from(expected)
      const b = Buffer.from(signature)
      return a.length === b.length && timingSafeEqual(a, b)
    } catch { return false }
  }

  private async post(body: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
    const { token, phoneNumberId } = await this.getCreds()
    if (!token || !phoneNumberId) return { ok: false, error: 'WhatsApp não configurado (credenciais Meta ausentes).' }
    try {
      const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
      })
      const json = (await res.json().catch(() => ({}))) as any
      if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` }
      return { ok: true, id: json?.messages?.[0]?.id }
    } catch (e) { return { ok: false, error: (e as Error).message } }
  }

  enviarTexto(to: string, texto: string) {
    return this.post({ to, type: 'text', text: { body: texto, preview_url: true } })
  }

  enviarTemplate(to: string, nome: string, idioma = 'pt_BR', componentes?: unknown[]) {
    return this.post({ to, type: 'template', template: { name: nome, language: { code: idioma }, ...(componentes ? { components: componentes } : {}) } })
  }

  /** Envia mídia por link (imagem/documento/audio/video). */
  enviarMidia(to: string, tipo: 'image' | 'document' | 'audio' | 'video', link: string, legenda?: string) {
    const payload: Record<string, unknown> = { [tipo]: { link, ...(legenda && (tipo === 'image' || tipo === 'video' || tipo === 'document') ? { caption: legenda } : {}) } }
    return this.post({ to, type: tipo, ...payload })
  }

  async marcarLido(waMessageId: string) {
    return this.post({ status: 'read', message_id: waMessageId })
  }

  /** Resolve a URL temporária de uma mídia recebida (precisa do token p/ baixar). */
  async getMidiaUrl(mediaId: string): Promise<string | null> {
    const { token } = await this.getCreds()
    if (!token) return null
    try {
      const res = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` } })
      const json = (await res.json().catch(() => ({}))) as any
      return json?.url ?? null
    } catch { return null }
  }
}
