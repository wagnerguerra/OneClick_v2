import { Injectable, Inject } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type { Browser, HTTPResponse, Page } from 'puppeteer'
import { CaptchaService } from '../common/captcha.service'
import {
  cndLogger, comNavegador, dataIso, exigirEmpresa, limparDoc, naFilaDoNavegador, PorEmpresa, precisaReconsultar,
} from './cnd-comum'

const VIX_URL = 'https://tributario.vitoria.es.gov.br/Servicos/CertidaoNegativa/CertidaoNegativa.aspx'
const VV_URL = 'https://tributacao.vilavelha.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabCertNegCont'
const SERRA_URL = 'https://tributacao.serra.es.gov.br:8080/tbserra/loginWeb.jsp?execobj=ServicosWebSite&tab=tabCertNegEmpresa'
const CARIACICA_URL = 'https://sistemas.cariacica.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabCertNegCont'

/** Teto de tentativas de captcha por documento. Era 5: cada tentativa é um captcha pago. */
const MAX_TENTATIVAS_CAPTCHA = 3

const logger = cndLogger('CndMunicipal')

/** Só os 4 últimos caracteres do documento vão para o log (LGPD). */
const fimDoc = (doc: string) => `…${doc.slice(-4)}`
const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Municípios atendidos, pela chave sem acento → nome gravado na tabela. */
const MUNICIPIOS: Record<string, string> = {
  'VITORIA': 'Vitória',
  'VILA VELHA': 'Vila Velha',
  'SERRA': 'Serra',
  'CARIACICA': 'Cariacica',
}
const chaveMunicipio = (m: string) => semAcento(m).toUpperCase().trim()

export type TipoCertidaoMunicipal = 'Negativa' | 'Positiva com efeito de negativa' | 'Positiva'

/**
 * Classifica a certidão pelo TEXTO DELA (o PDF), não pela página do portal.
 * Antes Vitória decidia por `includes('Negativa')` — e o título da própria
 * página do portal é "Certidão Negativa", então tudo virava Negativa; o TBW
 * gravava todo PDF capturado como Negativa. A ordem importa: "positiva com
 * efeito de negativa" contém as duas palavras. Sem reconhecer → null (não
 * inventamos o tipo).
 */
export function classificarCertidaoMunicipal(texto: string): TipoCertidaoMunicipal | null {
  const t = semAcento(texto).toUpperCase().replace(/\s+/g, ' ')
  if (/\bCERTIDAO\b.{0,60}?\bPOSITIVA,? COM EFEITOS? (?:DE )?NEGATIV[AO]S?\b/.test(t)) return 'Positiva com efeito de negativa'
  if (/\bCERTIDAO\b.{0,60}?\bPOSITIVA\b/.test(t)) return 'Positiva'
  if (/\bCERTIDAO\b.{0,60}?\bNEGATIVA\b/.test(t)) return 'Negativa'
  return null
}

const MENSAGEM_POR_TIPO: Record<TipoCertidaoMunicipal, string> = {
  'Negativa': 'Certidão Negativa emitida — sem débitos',
  'Positiva com efeito de negativa': 'Certidão Positiva com efeito de Negativa emitida — débitos com exigibilidade suspensa',
  'Positiva': 'Certidão Positiva emitida — há débitos em aberto no município',
}

export interface CndMunicipalResult {
  sucesso: boolean
  mensagem: string
  tipo: string | null // 'Negativa', 'Positiva com efeito de negativa', 'Positiva' ou null
  conteudoHtml: string | null
}

export interface CndMunicipalLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  /** Pulados por já terem certidão válida com folga (não gastam captcha). */
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando' | 'pulada'; erro?: string }>
}

const loteVazio = (): CndMunicipalLoteProgress => ({
  status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, pulados: 0, currentCliente: '', items: [],
})

interface ClienteResolvido { id: string | null; razaoSocial: string | null; inscricaoMunicipal: string | null }

interface RegistroMunicipal {
  doc: string
  municipio: string
  razaoSocial: string | null
  sucesso: boolean
  tipo: string | null
  mensagem: string
  debitos: string[]
  pdfBase64: string | null
  dataValidade: string | null
  clienteId: string | null
  userId: string | null
}

type ClienteLote = { documento: string; clienteId?: string; razaoSocial?: string }

@Injectable()
export class CndMunicipalService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  /** Etapa da consulta em andamento, por empresa (antes era uma só para todos os tenants). */
  private readonly etapa = new PorEmpresa<string>(() => '')
  /** Um lote por empresa por vez — o de um escritório não bloqueia o de outro. */
  private readonly lote = new PorEmpresa<CndMunicipalLoteProgress>(loteVazio)

  getConsultaEtapa(empresaId: string): string { return this.etapa.get(exigirEmpresa(empresaId)) }

  getLoteProgress(empresaId: string): CndMunicipalLoteProgress {
    const p = this.lote.get(exigirEmpresa(empresaId))
    return { ...p, items: [...p.items] }
  }

  // ── PDF ─────────────────────────────────────────────

  private async textoDoPdf(pdfBase64: string): Promise<string> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer) => Promise<{ text?: string }>
      const data = await pdfParse(Buffer.from(pdfBase64, 'base64'))
      return data.text || ''
    } catch {
      return ''
    }
  }

  /** Extrai a data de validade ('YYYY-MM-DD') do texto do PDF da CND. */
  private extrairValidade(texto: string): string | null {
    // Padrões comuns: "Data Validade:DD/MM/YYYY", "Válida até DD/MM/YYYY", "Validade: DD/MM/YYYY"
    const patterns = [
      /Data\s*Validade\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
      /V[aá]lid[ao]\s*(?:at[eé])?\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
      /Validade\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
      /vencimento\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
    ]
    for (const p of patterns) {
      const m = texto.match(p)
      if (m) return dataIso(m[1])
    }

    // Fallback: com 2+ datas, a segunda costuma ser a validade (a primeira é a
    // emissão). Só vale se for POSTERIOR à emissão e a hoje — senão é outra
    // data qualquer do documento (ex.: data de abertura) e gravaríamos uma
    // validade falsa. Comparação em string ISO, sem passar por Date (fuso).
    const datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g)
    if (datas && datas.length >= 2) {
      const emissao = dataIso(datas[0])
      const candidata = dataIso(datas[1])
      const h = new Date()
      const hoje = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`
      if (candidata && emissao && candidata > emissao && candidata > hoje) return candidata
    }
    return null
  }

  /** Baixa um PDF pela sessão do navegador (cookies do portal). */
  private async baixarPdfNoNavegador(page: Page, url: string): Promise<string | null> {
    const pdfHex = await page.evaluate(async (fetchUrl: string) => {
      try {
        const res = await fetch(fetchUrl, { credentials: 'include' })
        if (!res.ok) return null
        const arr = new Uint8Array(await res.arrayBuffer())
        let hex = ''
        for (let i = 0; i < arr.length; i++) hex += (arr[i] ?? 0).toString(16).padStart(2, '0')
        return hex
      } catch { return null }
    }, url)
    if (!pdfHex) return null
    const buf = Buffer.from(pdfHex, 'hex')
    // %P (de %PDF): o portal às vezes devolve uma página HTML de erro com 200.
    return buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50 ? buf.toString('base64') : null
  }

  // ── Cliente e gravação ──────────────────────────────

  /** Cliente da EMPRESA (por id ou por documento). Id de outra empresa é recusado. */
  private async resolverCliente(empresaId: string, doc: string, clienteId?: string): Promise<ClienteResolvido> {
    if (clienteId) {
      const cli = await prisma.cliente.findFirst({
        where: { id: clienteId, empresaId },
        select: { id: true, razaoSocial: true, inscricaoMunicipal: true },
      })
      if (!cli) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado nesta empresa.' })
      return { id: cli.id, razaoSocial: cli.razaoSocial, inscricaoMunicipal: cli.inscricaoMunicipal ?? null }
    }
    // Compara só letras e dígitos: o cadastro guarda o documento formatado e o
    // CNPJ alfanumérico tem letras (não dá para limpar com \D).
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string; inscricao_municipal: string | null }>>(
      `SELECT id, razao_social, inscricao_municipal FROM clientes
        WHERE empresa_id = $1 AND status = 'ATIVO'
          AND UPPER(REGEXP_REPLACE(documento, '[^0-9A-Za-z]', '', 'g')) = $2
        LIMIT 1`,
      empresaId, doc,
    )
    const r = rows[0]
    return r ? { id: r.id, razaoSocial: r.razao_social, inscricaoMunicipal: r.inscricao_municipal } : { id: null, razaoSocial: null, inscricaoMunicipal: null }
  }

  /** Última certidão BEM-SUCEDIDA do documento no município, na empresa. */
  private async ultimaValida(empresaId: string, doc: string, municipio: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; data_validade: Date | null; created_at: Date | null }>>(
      `SELECT sucesso, data_validade, created_at FROM certidoes_cnd_municipal
        WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3) AND sucesso = true
        ORDER BY created_at DESC LIMIT 1`,
      empresaId, doc, municipio,
    )
    const r = rows[0]
    return r ? { sucesso: r.sucesso, dataValidade: r.data_validade, criadoEm: r.created_at } : null
  }

  /**
   * Grava o resultado sem nunca apagar certidão válida por causa de uma falha
   * (captcha errado, portal fora). Sucesso: troca as anteriores pela nova, em
   * transação. Falha: se já há uma bem-sucedida, não toca em nada e devolve a
   * falha; se não há, a falha substitui as falhas anteriores (para aparecer na tela).
   */
  private async gravar(empresaId: string, r: RegistroMunicipal): Promise<CndMunicipalResult> {
    const insert = () => prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cnd_municipal (documento, razao_social, municipio, sucesso, tipo_certidao, mensagem, debitos, pdf_base64, data_validade, cliente_id, user_id, empresa_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::date, $10, $11, $12)`,
      r.doc, r.razaoSocial, r.municipio, r.sucesso, r.tipo, r.mensagem, JSON.stringify(r.debitos), r.pdfBase64, r.dataValidade, r.clienteId, r.userId, empresaId,
    )

    if (r.sucesso) {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `DELETE FROM certidoes_cnd_municipal WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3)`,
          empresaId, r.doc, r.municipio,
        ),
        insert(),
      ])
      return { sucesso: true, mensagem: r.mensagem, tipo: r.tipo, conteudoHtml: null }
    }

    if (await this.ultimaValida(empresaId, r.doc, r.municipio)) {
      logger.warn(`${r.municipio} ${fimDoc(r.doc)}: falha mantida fora do banco (há certidão válida anterior) — ${r.mensagem}`)
      return { sucesso: false, mensagem: `${r.mensagem} (a certidão anterior foi mantida)`, tipo: r.tipo, conteudoHtml: null }
    }

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `DELETE FROM certidoes_cnd_municipal WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3) AND sucesso = false`,
        empresaId, r.doc, r.municipio,
      ),
      insert(),
    ])
    return { sucesso: false, mensagem: r.mensagem, tipo: r.tipo, conteudoHtml: null }
  }

  /** Resultado a partir do PDF capturado: classifica pelo texto e extrai a validade. */
  private async resultadoDoPdf(pdfBase64: string): Promise<{ sucesso: boolean; tipo: string | null; mensagem: string; dataValidade: string | null }> {
    const texto = await this.textoDoPdf(pdfBase64)
    const tipo = classificarCertidaoMunicipal(texto)
    const dataValidade = this.extrairValidade(texto)
    if (!tipo) {
      // PDF existe mas não reconhecemos o tipo: grava como não emitida (com o
      // PDF, para conferência) — não marcamos "Negativa" no escuro.
      return { sucesso: false, tipo: null, mensagem: 'PDF capturado, mas não foi possível classificar a certidão (negativa/positiva) — confira o PDF', dataValidade }
    }
    return { sucesso: true, tipo, mensagem: MENSAGEM_POR_TIPO[tipo], dataValidade }
  }

  // ── Consulta CND Vitória ────────────────────────────

  async consultarVitoria(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    exigirEmpresa(empresaId)
    const doc = limparDoc(documento)
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')
    const etapa = (s: string) => this.etapa.set(empresaId, s)

    const cliente = await this.resolverCliente(empresaId, doc, clienteId)
    logger.log(`Vitória ${fimDoc(doc)}: consultando via navegador...`)
    etapa('Aguardando a vez na fila de consultas...')

    const captura = await naFilaDoNavegador(() => comNavegador(async (browser: Browser) => {
      etapa('Iniciando consulta...')
      const page = await browser.newPage()
      await page.setViewport({ width: 1400, height: 900 })

      // Interceptar PDF
      let pdfBase64: string | null = null
      page.on('response', async (res: HTTPResponse) => {
        const ct = res.headers()['content-type'] || ''
        if (ct.includes('pdf')) {
          try { pdfBase64 = (await res.buffer()).toString('base64') } catch { /* corpo indisponível */ }
        }
      })

      etapa('Acessando portal da prefeitura...')
      await page.goto(VIX_URL, { waitUntil: 'networkidle2', timeout: 30000 })
      etapa('Página da prefeitura carregada')

      // Selecionar CNPJ
      await page.click('label[for=ctl00_conteudo_rblTipoDocumento_1]')
      await esperar(2000)

      // Digitar CNPJ (page.type: o documento nunca entra em código avaliado)
      etapa('Preenchendo CNPJ e consultando...')
      await page.type('input[name="ctl00$conteudo$txtTermoBusca"]', doc)
      await page.click('#ctl00_conteudo_btnEnviar')
      etapa('Aguardando resposta da prefeitura...')
      await esperar(5000)

      let texto = (await page.evaluate('document.body.innerText')) as string

      // Capturar débitos (se houver tabela)
      const debitos = (await page.evaluate(`
        Array.from(document.querySelectorAll('table tr'))
          .map(r => r.innerText?.trim())
          .filter(t => t && (t.includes('Declaração') || t.includes('IPTU') || t.includes('ISS') || t.includes('Taxa')))
      `)) as string[]

      // Verificar se já tem botão Emitir (certidão recente existe)
      let temEmitir = (await page.evaluate(`!!document.getElementById('ctl00_conteudo_btnEmitir')`)) as boolean

      // Se NÃO tem Emitir e NÃO tem pendências → precisa clicar Continuar mais uma vez
      if (!temEmitir && !texto.includes('Pendência') && !debitos.length) {
        const temContinuar = (await page.evaluate(`!!document.getElementById('ctl00_conteudo_btnEnviar')`)) as boolean
        if (temContinuar) {
          await page.click('#ctl00_conteudo_btnEnviar')
          await esperar(5000)
          texto = (await page.evaluate('document.body.innerText')) as string
          temEmitir = (await page.evaluate(`!!document.getElementById('ctl00_conteudo_btnEmitir')`)) as boolean
        }
      }

      // Se tem botão Emitir → baixar o PDF real pela URL do onclick
      if (temEmitir) {
        etapa('Emitindo certidão...')
        const emitirOnclick = (await page.evaluate(`
          (function() {
            var btn = document.getElementById('ctl00_conteudo_btnEmitir');
            return btn ? btn.getAttribute('onclick') : null;
          })()
        `)) as string | null

        const urlMatch = emitirOnclick?.match(/window\.open\('([^']+)'/)
        if (urlMatch) {
          const pdfFullUrl = new URL(urlMatch[1]!, VIX_URL).href
          try {
            const baixado = await this.baixarPdfNoNavegador(page, pdfFullUrl)
            if (baixado) pdfBase64 = baixado
          } catch (e) {
            logger.warn(`Vitória ${fimDoc(doc)}: falha ao baixar PDF — ${(e as Error).message}`)
          }
        }
      }

      return { texto, debitos, pdfBase64: pdfBase64 as string | null }
    }, { timeoutMs: 120_000 }))

    // Analisar resultado — pelo texto da CERTIDÃO (PDF). O texto da página não
    // serve: o título do portal é "Certidão Negativa" mesmo quando há débito.
    etapa('Verificando resultado...')
    let sucesso = false
    let tipo: string | null = null
    let mensagem = ''
    let dataValidade: string | null = null
    const { texto, debitos, pdfBase64 } = captura

    if (pdfBase64) {
      ({ sucesso, tipo, mensagem, dataValidade } = await this.resultadoDoPdf(pdfBase64))
    } else if (texto.includes('Pendência') || debitos.length > 0) {
      // Sem certidão emitida: o portal lista as pendências e não libera o PDF.
      sucesso = false
      tipo = 'Positiva'
      mensagem = `Pendências encontradas: ${debitos.length} débito(s)`
    } else if (texto.includes('não são suficientes') || texto.includes('não encontrado')) {
      mensagem = 'Contribuinte não encontrado no cadastro municipal de Vitória'
    } else {
      mensagem = 'O portal não entregou o PDF da certidão — não foi possível classificar'
    }
    etapa('')

    logger.log(`Vitória ${fimDoc(doc)}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

    return this.gravar(empresaId, {
      doc, municipio: 'Vitória', razaoSocial: cliente.razaoSocial, sucesso, tipo, mensagem, debitos,
      pdfBase64, dataValidade, clienteId: cliente.id, userId: userId || null,
    })
  }

  // ── Consulta CND TBW (Vila Velha / Serra / Cariacica) ──
  // Os três usam o mesmo sistema SMARAPD/TBW com captcha de imagem

  async consultarVilaVelha(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    return this.consultarTBW(empresaId, documento, 'Vila Velha', VV_URL, 'i27', clienteId, userId)
  }

  async consultarSerra(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    // Serra exige inscrição municipal — vem do cadastro do cliente (da empresa)
    return this.consultarTBW(empresaId, documento, 'Serra', SERRA_URL, 'i26', clienteId, userId, true)
  }

  async consultarCariacica(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    return this.consultarTBW(empresaId, documento, 'Cariacica', CARIACICA_URL, 'i27', clienteId, userId)
  }

  private async consultarTBW(
    empresaId: string, documento: string, municipio: string, url: string, prefix: string,
    clienteId?: string, userId?: string, usarInscricao = false,
  ): Promise<CndMunicipalResult> {
    exigirEmpresa(empresaId)
    const doc = limparDoc(documento)
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')
    const etapa = (s: string) => this.etapa.set(empresaId, s)

    const cliente = await this.resolverCliente(empresaId, doc, clienteId)
    const inscricaoMunicipal = usarInscricao ? cliente.inscricaoMunicipal : null
    logger.log(`${municipio} ${fimDoc(doc)}: iniciando consulta`)
    etapa('Aguardando a vez na fila de consultas...')

    // `prefix` e os ids de campo são constantes deste arquivo — por isso podem
    // compor o código avaliado. Documento, inscrição e captcha entram só via page.type.
    const capturarCaptchaCanvas = (page: Page) => page.evaluate(`(function(){ var img = document.getElementById("${prefix}captchaimg"); if (!img) return null; var c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext("2d").drawImage(img, 0, 0); return c.toDataURL("image/png").split(",")[1]; })()`) as Promise<string | null>

    const captura = await naFilaDoNavegador(() => comNavegador(async (browser: Browser) => {
      etapa('Iniciando consulta...')
      const page = await browser.newPage()
      await page.setViewport({ width: 1400, height: 900 })

      let pdfBase64: string | null = null
      // Interceptar captcha raw (imagem original, sem a perda do canvas) e o PDF
      let captchaRawB64: string | null = null
      page.on('response', async (res: HTTPResponse) => {
        if (res.url().includes('getCaptcha')) {
          try { captchaRawB64 = (await res.buffer()).toString('base64') } catch { /* corpo indisponível */ }
        }
        const ct = res.headers()['content-type'] || ''
        if (ct.includes('pdf')) {
          try { pdfBase64 = (await res.buffer()).toString('base64') } catch { /* corpo indisponível */ }
        }
      })

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      etapa('Página da prefeitura carregada')

      // Preencher inscrição municipal
      if (inscricaoMunicipal) {
        const imFieldId = (await page.evaluate(`(function(){ return document.getElementById('${prefix}idinput') ? '${prefix}idinput' : null })()`)) as string | null
        if (imFieldId) {
          await page.evaluate(`document.getElementById("${imFieldId}").value = ""`)
          await page.type(`input[id=${imFieldId}]`, inscricaoMunicipal)
        } else {
          logger.warn(`${municipio}: campo de inscrição municipal não encontrado (${prefix}idinput)`)
        }
      }

      // Detectar campo de CNPJ
      const cnpjFieldId = (await page.evaluate(`(function(){ return document.getElementById('cnpjcpf') ? 'cnpjcpf' : document.getElementById('${prefix}cnpj') ? '${prefix}cnpj' : document.getElementById('${prefix}cnpjcpf') ? '${prefix}cnpjcpf' : null })()`)) as string | null
      if (!cnpjFieldId) throw new Error('Campo de CNPJ não encontrado na página')

      await page.evaluate(`document.getElementById("${cnpjFieldId}").value = ""`)
      await page.type(`input[id=${cnpjFieldId}]`, doc)
      etapa('Dados preenchidos, capturando captcha...')

      const captchaHints = { caseSensitive: true, minLen: 5, maxLen: 6, lang: 'en' as const }
      const captchaB64 = captchaRawB64 ?? await capturarCaptchaCanvas(page)
      if (!captchaB64) throw new Error('Captcha não encontrado na página')
      etapa('Resolvendo captcha via 2Captcha...')

      let captchaText = await this.captcha.resolveImage(captchaB64, captchaHints)
      await page.evaluate(`document.getElementById("${prefix}captchafield").value = ""`)
      await page.type(`input[id=${prefix}captchafield]`, captchaText)
      etapa('Captcha resolvido, emitindo certidão...')

      await page.click(`button[id=${prefix}btngerar]`)
      etapa('Aguardando resposta da prefeitura...')
      await esperar(15000)

      // Captcha recusado (modal "Texto da imagem incorreto") → nova tentativa.
      // Obs.: o CaptchaService não expõe método de reportar captcha incorreto
      // (reportBad) ao 2Captcha; quando expuser, chamar aqui a cada recusa.
      let texto = (await page.evaluate('document.body.innerText')) as string
      let tentativas = 1
      while (texto.includes('incorreto') && tentativas < MAX_TENTATIVAS_CAPTCHA) {
        tentativas++
        etapa(`Captcha incorreto, tentativa ${tentativas}/${MAX_TENTATIVAS_CAPTCHA}...`)
        logger.warn(`${municipio} ${fimDoc(doc)}: captcha incorreto, tentativa ${tentativas}/${MAX_TENTATIVAS_CAPTCHA}`)

        // Fechar modal de aviso (clicar OK)
        await page.evaluate(`(function(){ var btn = document.querySelector('#_divModalConfirmBtnOk') || document.querySelector('button.btn-primary'); if(btn) btn.click(); })()`)
        await esperar(2000)

        // Recarregar captcha — interceptar o novo raw
        captchaRawB64 = null
        await page.evaluate(`(function(){ var img = document.getElementById('${prefix}captchaimg'); if(img) { img.src = img.src.split('?')[0] + '?t=' + Date.now(); } })()`)
        await esperar(3000)

        const novoCaptcha = captchaRawB64 ?? await capturarCaptchaCanvas(page)
        if (!novoCaptcha) { logger.warn(`${municipio}: captcha não encontrado para nova tentativa`); break }

        etapa(`Resolvendo novo captcha (tentativa ${tentativas}/${MAX_TENTATIVAS_CAPTCHA})...`)
        captchaText = await this.captcha.resolveImage(novoCaptcha, captchaHints)
        await page.evaluate(`document.getElementById("${prefix}captchafield").value = ""`)
        await page.type(`input[id=${prefix}captchafield]`, captchaText)
        await page.click(`button[id=${prefix}btngerar]`)
        await esperar(15000)
        texto = (await page.evaluate('document.body.innerText')) as string
      }
      const captchaFalhou = texto.includes('incorreto')

      // Aguardar a nova aba com o PDF
      if (!captchaFalhou) await esperar(5000)

      etapa('Verificando resultado...')
      let pdfUrl: string | null = null
      for (const p of await browser.pages()) {
        const pUrl = p.url()
        if (pUrl.includes('.pdf') || pUrl.includes('resultados')) pdfUrl = pUrl
      }

      // Capturar PDF via fetch dentro do navegador (com sessão/cookies)
      if (pdfUrl && !pdfBase64) {
        etapa('Baixando PDF da certidão...')
        try {
          const baixado = await this.baixarPdfNoNavegador(page, pdfUrl)
          if (baixado) pdfBase64 = baixado
        } catch (e) { logger.warn(`${municipio} ${fimDoc(doc)}: erro ao baixar PDF — ${(e as Error).message}`) }
      }

      texto = (await page.evaluate('document.body.innerText')) as string
      return { texto, captchaFalhou, pdfBase64: pdfBase64 as string | null }
    // Portais TBW (Serra :8080 em especial) servem cadeia de certificado incompleta.
    // Teto: 3 tentativas × (captcha ~60s + 15s de espera) + navegação.
    }, { timeoutMs: 360_000, ignorarTls: true }))

    // Analisar resultado — pelo texto do PDF (antes todo PDF virava "Negativa").
    let sucesso = false
    let tipo: string | null = null
    let mensagem: string
    let dataValidade: string | null = null
    const { texto, captchaFalhou, pdfBase64 } = captura

    if (pdfBase64) {
      ({ sucesso, tipo, mensagem, dataValidade } = await this.resultadoDoPdf(pdfBase64))
    } else if (captchaFalhou) {
      mensagem = `Captcha incorreto após ${MAX_TENTATIVAS_CAPTCHA} tentativas — tente novamente`
    } else if (texto.includes('não encontrado') || texto.includes('não cadastrado') || texto.includes('Nenhum cadastro')) {
      mensagem = 'Contribuinte não encontrado no cadastro municipal'
    } else {
      // Sem PDF não há certidão para classificar; o texto da página não serve
      // (o título do serviço já fala em "Certidão Negativa de Débitos").
      mensagem = 'O portal não entregou o PDF da certidão — verifique o CNPJ/inscrição municipal e eventuais pendências no portal'
    }
    etapa('')

    logger.log(`${municipio} ${fimDoc(doc)}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

    return this.gravar(empresaId, {
      doc, municipio, razaoSocial: cliente.razaoSocial, sucesso, tipo, mensagem, debitos: [],
      pdfBase64, dataValidade, clienteId: cliente.id, userId: userId || null,
    })
  }

  /** Consulta do município pelo nome (com ou sem acento). Município não atendido → erro claro. */
  private consultorDoMunicipio(municipio: string): { nome: string; consultar: (empresaId: string, documento: string, clienteId?: string, userId?: string) => Promise<CndMunicipalResult> } {
    const chave = chaveMunicipio(municipio)
    const nome = MUNICIPIOS[chave]
    if (!nome) throw new TRPCError({ code: 'BAD_REQUEST', message: `Município "${municipio}" não suportado para CND municipal` })
    const consultar = chave === 'VILA VELHA' ? this.consultarVilaVelha.bind(this)
      : chave === 'SERRA' ? this.consultarSerra.bind(this)
      : chave === 'CARIACICA' ? this.consultarCariacica.bind(this)
      : this.consultarVitoria.bind(this)
    return { nome, consultar }
  }

  // ── Lote (assíncrono com progresso) ─────────────────

  async consultarLoteMunicipio(empresaId: string, municipio: string, clientes: ClienteLote[], userId?: string, forcarNova = false): Promise<{ message: string }> {
    exigirEmpresa(empresaId)
    const consultor = this.consultorDoMunicipio(municipio)
    if (this.lote.get(empresaId).status === 'running') throw new Error('Consulta em lote já em andamento.')

    const prog: CndMunicipalLoteProgress = {
      ...loteVazio(),
      status: 'running', total: clientes.length, currentCliente: 'Iniciando...',
      items: clientes.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }
    this.lote.set(empresaId, prog)

    void this.runLoteMunicipio(empresaId, consultor, clientes, prog, userId, forcarNova)
      .catch(e => {
        logger.error(`Lote ${consultor.nome}: ${(e as Error).message}`)
        prog.currentCliente = `Erro: ${(e as Error).message}`
      })
      .finally(() => { prog.status = 'done' })

    return { message: 'Consulta em lote iniciada' }
  }

  private async runLoteMunicipio(
    empresaId: string, consultor: ReturnType<CndMunicipalService['consultorDoMunicipio']>, clientes: ClienteLote[],
    prog: CndMunicipalLoteProgress, userId: string | undefined, forcarNova: boolean,
  ) {
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      const nome = c.razaoSocial || c.documento
      prog.current = i + 1
      prog.currentCliente = nome
      prog.items[i] = { razaoSocial: nome, status: 'processando' }

      try {
        // Certidão ainda válida com folga não é reemitida (cada reemissão é captcha pago).
        if (!forcarNova) {
          const ultima = await this.ultimaValida(empresaId, limparDoc(c.documento), consultor.nome)
          if (!precisaReconsultar(ultima)) {
            prog.pulados++
            prog.items[i] = { razaoSocial: nome, status: 'pulada', erro: 'Certidão ainda válida — não reemitida' }
            continue
          }
        }

        const result = await consultor.consultar(empresaId, c.documento, c.clienteId, userId)
        if (result.sucesso) {
          prog.emitidas++
          prog.items[i] = { razaoSocial: nome, status: 'emitida' }
        } else {
          prog.naoEmitidas++
          prog.items[i] = { razaoSocial: nome, status: 'nao_emitida', erro: result.mensagem }
        }
      } catch (e) {
        prog.erros++
        prog.items[i] = { razaoSocial: nome, status: 'erro', erro: (e as Error).message }
        logger.warn(`Lote ${consultor.nome} ${fimDoc(limparDoc(c.documento))}: ${(e as Error).message}`)
      }

      if (i < clientes.length - 1) await esperar(2000)
    }

    prog.currentCliente = 'Concluído'
  }

  // ── Listagem ────────────────────────────────────────

  async list(empresaId: string, input: { page: number; limit: number; search?: string; municipio?: string; filtroStatus?: string }) {
    exigirEmpresa(empresaId)
    const { page, limit, search, municipio, filtroStatus } = input
    const offset = (page - 1) * limit
    const conditions: string[] = ['empresa_id = $1']
    const params: unknown[] = [empresaId]
    let idx = 2

    if (municipio) { conditions.push(`UPPER(municipio) = UPPER($${idx})`); params.push(municipio); idx++ }
    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    if (filtroStatus === 'negativa') conditions.push(`sucesso = true AND tipo_certidao = 'Negativa'`)
    else if (filtroStatus === 'positiva') conditions.push(`sucesso = true AND tipo_certidao != 'Negativa'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false`)
    else if (filtroStatus === 'vigente') conditions.push(`data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencendo') conditions.push(`data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencida') conditions.push(`data_validade IS NOT NULL AND data_validade < CURRENT_DATE`)

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM certidoes_cnd_municipal ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, municipio, sucesso, tipo_certidao, mensagem, data_validade, created_at FROM certidoes_cnd_municipal ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        documento: r.documento as string,
        razaoSocial: r.razao_social as string | null,
        municipio: r.municipio as string,
        sucesso: r.sucesso as boolean,
        tipoCertidao: r.tipo_certidao as string | null,
        mensagem: r.mensagem as string | null,
        dataValidade: r.data_validade ? (r.data_validade as Date).toISOString().split('T')[0] : null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  async totalizadores(empresaId: string, municipio?: string) {
    exigirEmpresa(empresaId)
    const mFilter = municipio ? `AND UPPER(municipio) = UPPER($2)` : ''
    const params: unknown[] = municipio ? [empresaId, municipio] : [empresaId]
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao = 'Negativa')::int as negativas,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao LIKE 'Positiva%')::int as positivas,
        COUNT(*) FILTER (WHERE sucesso = false)::int as nao_emitidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade < CURRENT_DATE)::int as vencidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days')::int as vencendo,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days')::int as vigentes
      FROM certidoes_cnd_municipal WHERE empresa_id = $1 ${mFilter}
    `, ...params)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0),
      negativas: Number(r.negativas ?? 0),
      positivas: Number(r.positivas ?? 0),
      naoEmitidas: Number(r.nao_emitidas ?? 0),
      vencidas: Number(r.vencidas ?? 0),
      vencendo: Number(r.vencendo ?? 0),
      vigentes: Number(r.vigentes ?? 0),
    }
  }

  /** Retorna lista de CNDs próximas do vencimento ou vencidas para o dashboard */
  async listarValidadeDashboard(empresaId: string) {
    exigirEmpresa(empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT id, documento, razao_social, municipio, tipo_certidao, data_validade
      FROM certidoes_cnd_municipal
      WHERE empresa_id = $1 AND sucesso = true AND data_validade IS NOT NULL
      ORDER BY data_validade ASC
      LIMIT 50
    `, empresaId)
    return rows.map(r => ({
      id: r.id as string,
      documento: r.documento as string,
      razaoSocial: r.razao_social as string | null,
      municipio: r.municipio as string,
      tipoCertidao: r.tipo_certidao as string | null,
      dataValidade: r.data_validade ? (r.data_validade as Date).toISOString().split('T')[0] : null,
    }))
  }

  // ── Excluir ──────────────────────────────────────────

  async deleteMunicipal(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    const n = await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_municipal WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    return { ok: n > 0 }
  }

  async deleteMunicipalLote(empresaId: string, ids: string[]) {
    exigirEmpresa(empresaId)
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
    const n = await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_municipal WHERE empresa_id = $1 AND id IN (${placeholders})`, empresaId, ...ids)
    return { deleted: n }
  }

  // ── Listar clientes de um município ──────────────────

  async listarClientesMunicipio(empresaId: string, municipio: string) {
    exigirEmpresa(empresaId)
    return prisma.cliente.findMany({
      where: {
        empresaId,
        status: 'ATIVO',
        situacao: 'MENSAL',
        cidade: { equals: municipio, mode: 'insensitive' },
      },
      select: { id: true, razaoSocial: true, documento: true, inscricaoMunicipal: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }
}
