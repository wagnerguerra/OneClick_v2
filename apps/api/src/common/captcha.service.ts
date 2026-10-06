import { Injectable, Logger } from '@nestjs/common'
import { prisma } from '@saas/db'

const TWOCAPTCHA_API = 'https://2captcha.com/in.php'
const TWOCAPTCHA_RESULT = 'https://2captcha.com/res.php'

/**
 * Teto de cada chamada HTTP ao 2Captcha. Sem ele, um 2Captcha lento prendia a
 * consulta (e o Chromium aberto atrás dela) indefinidamente — o polling tem
 * limite de tentativas, mas cada tentativa podia ficar pendurada para sempre.
 */
const FETCH_TIMEOUT_MS = 30_000

interface RespostaDoisCaptcha { status: number; request: string }

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger('Captcha')

  private async getApiKey(): Promise<string> {
    const row = await prisma.systemConfig.findUnique({ where: { key: 'CAPTCHA_2CAPTCHA_API_KEY' } })
    const key = row?.value || process.env.CAPTCHA_2CAPTCHA_API_KEY || ''
    if (!key) throw new Error('2Captcha API Key não configurada. Configure em Configurações → 2Captcha.')
    return key
  }

  /**
   * Chamada ao 2Captcha com teto de tempo. A chave vai na URL (é o contrato da
   * API), então a mensagem de erro do fetch é limpa antes de subir: ela
   * termina em log e na tela, e a chave nunca pode aparecer em nenhum dos dois.
   */
  private async chamar(url: string, apiKey: string, init?: RequestInit): Promise<RespostaDoisCaptcha> {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
      return await res.json() as RespostaDoisCaptcha
    } catch (e) {
      const err = e as Error
      const msg = err.name === 'TimeoutError'
        ? `2Captcha não respondeu em ${FETCH_TIMEOUT_MS / 1000}s`
        : `2Captcha indisponível: ${err.message}`
      throw new Error(apiKey ? msg.split(apiKey).join('***') : msg)
    }
  }

  /** Polling do resultado de uma tarefa já enviada. */
  private async aguardarResultado(apiKey: string, taskId: string, maxAttempts: number, rotulo: string): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000))

      const resultUrl = `${TWOCAPTCHA_RESULT}?key=${encodeURIComponent(apiKey)}&action=get&id=${encodeURIComponent(taskId)}&json=1`
      const resultData = await this.chamar(resultUrl, apiKey)

      if (resultData.status === 1) {
        // O texto/token resolvido não vai ao log: não serve para diagnóstico e
        // um token de Turnstile/hCaptcha ainda válido é reutilizável.
        this.logger.log(`${rotulo} ${taskId} resolvido em ${(i + 1) * 5}s`)
        return resultData.request
      }

      if (resultData.request !== 'CAPCHA_NOT_READY') {
        throw new Error(`2Captcha erro: ${resultData.request}`)
      }
    }

    throw new Error(`2Captcha timeout: ${rotulo} não resolvido em ${maxAttempts * 5}s`)
  }

  /** Chamada à API v2 do 2Captcha (createTask/getTaskResult) — a chave nunca vai a log/erro. */
  private async apiV2<T>(rota: string, apiKey: string, corpo: Record<string, unknown>): Promise<T & { errorId?: number; errorCode?: string; errorDescription?: string }> {
    try {
      const res = await fetch(`https://api.2captcha.com/${rota}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: apiKey, ...corpo }), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      return await res.json() as T & { errorId?: number; errorCode?: string; errorDescription?: string }
    } catch (e) {
      const err = e as Error
      throw new Error(err.name === 'TimeoutError' ? `2Captcha não respondeu em ${FETCH_TIMEOUT_MS / 1000}s` : `2Captcha indisponível: ${err.message.split(apiKey).join('***')}`)
    }
  }

  /**
   * Resolve um CAPTCHA de grade de imagens ("escolha todas as cortinas"): o
   * 2Captcha devolve QUAIS células clicar e o clique acontece no NOSSO
   * navegador. É o caso do AWS WAF da CGU — o modo "token" (AmazonTaskProxyless)
   * foi testado em 06/10/2026 e o portal recusa o token resolvido em outro
   * navegador/IP (HTTP 405 "Human Verification").
   * @param imagemBase64 - print da grade (PNG/JPG, sem prefixo data:)
   * @param instrucao - o que procurar, em texto (ex.: "Select all images with buckets")
   * @returns células (1 = canto superior esquerdo, da esquerda para a direita) + id para reportar erro
   */
  async resolveGrid(imagemBase64: string, instrucao: string, linhas: number, colunas: number): Promise<{ celulas: number[]; taskId: number }> {
    const apiKey = await this.getApiKey()
    const criada = await this.apiV2<{ taskId?: number }>('createTask', apiKey, {
      task: { type: 'GridTask', body: imagemBase64, comment: instrucao, rows: linhas, columns: colunas },
    })
    if (criada.errorId || !criada.taskId) throw new Error(`2Captcha erro ao enviar (grade): ${criada.errorCode || criada.errorDescription || 'sem taskId'}`)
    this.logger.log(`Grade enviada: ${criada.taskId}, aguardando resolução...`)
    for (let i = 0; i < 36; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const r = await this.apiV2<{ status?: string; solution?: { click?: number[] } }>('getTaskResult', apiKey, { taskId: criada.taskId })
      if (r.errorId) throw new Error(`2Captcha erro: ${r.errorCode || r.errorDescription}`)
      if (r.status === 'ready') {
        const celulas = (r.solution?.click ?? []).filter(n => Number.isInteger(n) && n >= 1 && n <= linhas * colunas)
        this.logger.log(`Grade ${criada.taskId} resolvida em ${(i + 1) * 5}s (${celulas.length} célula(s))`)
        return { celulas, taskId: criada.taskId }
      }
    }
    throw new Error('2Captcha timeout: grade não resolvida em 180s')
  }

  /** Reporta resposta errada da API v2 (o 2Captcha devolve o valor pago). */
  async reportarIncorretoV2(taskId: number): Promise<void> {
    try {
      const apiKey = await this.getApiKey()
      await this.apiV2('reportIncorrect', apiKey, { taskId })
    } catch { /* reporte é cortesia; não derruba a consulta */ }
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
    const submitUrl = `${TWOCAPTCHA_API}?key=${encodeURIComponent(apiKey)}&method=turnstile&sitekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`
    const submitData = await this.chamar(submitUrl, apiKey)

    if (submitData.status !== 1) {
      throw new Error(`2Captcha erro ao enviar: ${submitData.request}`)
    }

    const taskId = submitData.request
    this.logger.log(`Turnstile enviado: ${taskId}, aguardando resolução...`)

    // Passo 2: polling do resultado (máx 120s)
    return this.aguardarResultado(apiKey, taskId, 24, 'Turnstile')
  }

  /**
   * Resolve um captcha de imagem via 2Captcha e devolve também o id do pedido
   * — necessário para `reportarIncorreto` quando o portal recusa o texto
   * (o 2Captcha devolve o valor pago de respostas erradas reportadas).
   * @param imageBase64 - imagem do captcha em base64 (sem prefixo data:image)
   */
  async resolveImageComId(
    imageBase64: string,
    hints?: { caseSensitive?: boolean; minLen?: number; maxLen?: number; lang?: 'en' | 'ru' },
  ): Promise<{ texto: string; id: string }> {
    const apiKey = await this.getApiKey()

    // Passo 1: enviar imagem com hints opcionais
    const params = new URLSearchParams({ key: apiKey, method: 'base64', json: '1' })
    if (hints?.caseSensitive) params.set('case', '1')
    if (hints?.minLen) params.set('min_len', String(hints.minLen))
    if (hints?.maxLen) params.set('max_len', String(hints.maxLen))
    if (hints?.lang === 'en') params.set('language', '2') // 2 = Latin
    const submitUrl = `${TWOCAPTCHA_API}?${params.toString()}`
    const submitData = await this.chamar(submitUrl, apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `body=${encodeURIComponent(imageBase64)}`,
    })

    if (submitData.status !== 1) {
      throw new Error(`2Captcha erro ao enviar imagem: ${submitData.request}`)
    }

    const taskId = submitData.request
    this.logger.log(`Imagem enviada: ${taskId}, aguardando resolução...`)

    // Passo 2: polling (máx 60s — captcha de imagem é mais rápido)
    const texto = await this.aguardarResultado(apiKey, taskId, 12, 'Captcha de imagem')
    return { texto, id: taskId }
  }

  /**
   * Resolve um captcha de imagem via 2Captcha.
   * Mantida para os chamadores que só precisam do texto; quem quer reportar
   * resposta errada usa `resolveImageComId`.
   * @returns Texto do captcha resolvido
   */
  async resolveImage(imageBase64: string, hints?: { caseSensitive?: boolean; minLen?: number; maxLen?: number; lang?: 'en' | 'ru' }): Promise<string> {
    return (await this.resolveImageComId(imageBase64, hints)).texto
  }

  /**
   * Avisa o 2Captcha de que a resposta do pedido `id` estava errada (endpoint
   * `reportbad`). O valor é estornado e o trabalhador que errou é penalizado.
   * Nunca lança: é um aviso acessório, e a falha dele não pode derrubar a
   * consulta que já vai tratar o captcha recusado.
   */
  async reportarIncorreto(id: string): Promise<boolean> {
    if (!id) return false
    try {
      const apiKey = await this.getApiKey()
      const url = `${TWOCAPTCHA_RESULT}?key=${encodeURIComponent(apiKey)}&action=reportbad&id=${encodeURIComponent(id)}&json=1`
      const r = await this.chamar(url, apiKey)
      if (r.status !== 1) this.logger.warn(`reportbad ${id} recusado: ${r.request}`)
      return r.status === 1
    } catch (e) {
      this.logger.warn(`reportbad ${id} falhou: ${(e as Error).message}`)
      return false
    }
  }

  /**
   * Resolve um hCaptcha via 2Captcha
   * @param sitekey - data-sitekey do widget hCaptcha
   * @param pageUrl - URL da página
   * @returns Token resolvido
   */
  async resolveHCaptcha(sitekey: string, pageUrl: string): Promise<string> {
    const apiKey = await this.getApiKey()

    const submitUrl = `${TWOCAPTCHA_API}?key=${encodeURIComponent(apiKey)}&method=hcaptcha&sitekey=${encodeURIComponent(sitekey)}&pageurl=${encodeURIComponent(pageUrl)}&json=1`
    const submitData = await this.chamar(submitUrl, apiKey)

    if (submitData.status !== 1) {
      throw new Error(`2Captcha erro ao enviar hCaptcha: ${submitData.request}`)
    }

    const taskId = submitData.request
    this.logger.log(`hCaptcha enviado: ${taskId}, aguardando resolução...`)

    return this.aguardarResultado(apiKey, taskId, 24, 'hCaptcha')
  }
}
