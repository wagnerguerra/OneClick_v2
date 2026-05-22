import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

const TWOCAPTCHA_API = 'https://2captcha.com/in.php'
const TWOCAPTCHA_RESULT = 'https://2captcha.com/res.php'

@Injectable()
export class CaptchaService {
  private async getApiKey(): Promise<string> {
    const row = await prisma.systemConfig.findUnique({ where: { key: 'CAPTCHA_2CAPTCHA_API_KEY' } })
    const key = row?.value || process.env.CAPTCHA_2CAPTCHA_API_KEY || ''
    if (!key) throw new Error('2Captcha API Key não configurada. Configure em Configurações → 2Captcha.')
    return key
  }

  /**
   * Resolve um Cloudflare Turnstile captcha via 2Captcha
   * @param sitekey - data-sitekey do widget Turnstile
   * @param pageUrl - URL da página onde o captcha aparece
   * @returns Token resolvido para enviar como parâmetro "captcha"
   */
  async resolveTurnstile(sitekey: string, pageUrl: string): Promise<string> {
    const apiKey = await this.getApiKey()

    // Passo 1: enviar tarefa
    const submitUrl = `${TWOCAPTCHA_API}?key=${apiKey}&method=turnstile&sitekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`
    const submitRes = await fetch(submitUrl)
    const submitData = await submitRes.json() as { status: number; request: string }

    if (submitData.status !== 1) {
      throw new Error(`2Captcha erro ao enviar: ${submitData.request}`)
    }

    const taskId = submitData.request
    console.log(`[Captcha] Tarefa enviada: ${taskId}, aguardando resolução...`)

    // Passo 2: polling do resultado (máx 120s)
    const maxAttempts = 24 // 24 * 5s = 120s
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000))

      const resultUrl = `${TWOCAPTCHA_RESULT}?key=${apiKey}&action=get&id=${taskId}&json=1`
      const resultRes = await fetch(resultUrl)
      const resultData = await resultRes.json() as { status: number; request: string }

      if (resultData.status === 1) {
        console.log(`[Captcha] Resolvido em ${(i + 1) * 5}s`)
        return resultData.request
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha erro: ${resultData.request}`)
      }
    }

    throw new Error('2Captcha timeout: captcha não resolvido em 120s')
  }

  /**
   * Resolve um captcha de imagem via 2Captcha
   * @param imageBase64 - imagem do captcha em base64 (sem prefixo data:image)
   * @returns Texto do captcha resolvido
   */
  async resolveImage(imageBase64: string, hints?: { caseSensitive?: boolean; minLen?: number; maxLen?: number; lang?: 'en' | 'ru' }): Promise<string> {
    const apiKey = await this.getApiKey()

    // Passo 1: enviar imagem com hints opcionais
    const params = new URLSearchParams({ key: apiKey, method: 'base64', json: '1' })
    if (hints?.caseSensitive) params.set('case', '1')
    if (hints?.minLen) params.set('min_len', String(hints.minLen))
    if (hints?.maxLen) params.set('max_len', String(hints.maxLen))
    if (hints?.lang === 'en') params.set('language', '2') // 2 = Latin
    const submitUrl = `${TWOCAPTCHA_API}?${params.toString()}`
    const submitRes = await fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `body=${encodeURIComponent(imageBase64)}`,
    })
    const submitData = await submitRes.json() as { status: number; request: string }

    if (submitData.status !== 1) {
      throw new Error(`2Captcha erro ao enviar imagem: ${submitData.request}`)
    }

    const taskId = submitData.request
    console.log(`[Captcha] Imagem enviada: ${taskId}, aguardando resolução...`)

    // Passo 2: polling (máx 60s — captcha de imagem é mais rápido)
    const maxAttempts = 12 // 12 * 5s = 60s
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000))

      const resultUrl = `${TWOCAPTCHA_RESULT}?key=${apiKey}&action=get&id=${taskId}&json=1`
      const resultRes = await fetch(resultUrl)
      const resultData = await resultRes.json() as { status: number; request: string }

      if (resultData.status === 1) {
        console.log(`[Captcha] Imagem resolvida em ${(i + 1) * 5}s: ${resultData.request}`)
        return resultData.request
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha erro: ${resultData.request}`)
      }
    }

    throw new Error('2Captcha timeout: captcha de imagem não resolvido em 60s')
  }

  /**
   * Resolve um hCaptcha via 2Captcha
   * @param sitekey - data-sitekey do widget hCaptcha
   * @param pageUrl - URL da página
   * @returns Token resolvido
   */
  async resolveHCaptcha(sitekey: string, pageUrl: string): Promise<string> {
    const apiKey = await this.getApiKey()

    const submitUrl = `${TWOCAPTCHA_API}?key=${apiKey}&method=hcaptcha&sitekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`
    const submitRes = await fetch(submitUrl)
    const submitData = await submitRes.json() as { status: number; request: string }

    if (submitData.status !== 1) {
      throw new Error(`2Captcha erro ao enviar hCaptcha: ${submitData.request}`)
    }

    const taskId = submitData.request
    console.log(`[Captcha] hCaptcha enviado: ${taskId}, aguardando resolução...`)

    const maxAttempts = 24
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000))

      const resultUrl = `${TWOCAPTCHA_RESULT}?key=${apiKey}&action=get&id=${taskId}&json=1`
      const resultRes = await fetch(resultUrl)
      const resultData = await resultRes.json() as { status: number; request: string }

      if (resultData.status === 1) {
        console.log(`[Captcha] hCaptcha resolvido em ${(i + 1) * 5}s`)
        return resultData.request
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha erro: ${resultData.request}`)
      }
    }

    throw new Error('2Captcha timeout: hCaptcha não resolvido em 120s')
  }
}
