import { Injectable, Inject } from '@nestjs/common'
import { prisma } from '@saas/db'
import { CaptchaService } from '../common/captcha.service'

const VIX_URL = 'https://tributario.vitoria.es.gov.br/Servicos/CertidaoNegativa/CertidaoNegativa.aspx'
const VV_URL = 'https://tributacao.vilavelha.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabCertNegCont'
const SERRA_URL = 'https://tributacao.serra.es.gov.br:8080/tbserra/loginWeb.jsp?execobj=ServicosWebSite&tab=tabCertNegEmpresa'
const CARIACICA_URL = 'https://sistemas.cariacica.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabCertNegCont'

export interface CndMunicipalResult {
  sucesso: boolean
  mensagem: string
  tipo: string | null // 'Negativa', 'Positiva', etc.
  conteudoHtml: string | null
}

export interface CndMunicipalLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando'; erro?: string }>
}

@Injectable()
export class CndMunicipalService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  private tableChecked = false

  private consultaEtapa = ''

  getConsultaEtapa(): string { return this.consultaEtapa }

  private loteProgress: CndMunicipalLoteProgress = {
    status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
    currentCliente: '', items: [],
  }

  getLoteProgress(): CndMunicipalLoteProgress {
    return { ...this.loteProgress }
  }

  private async ensureTable() {
    // Schema (tabela + colunas debitos/pdf_base64/data_validade + índices) garantido
    // pela migração manual_2026_06_26_cnd_dte_tables.sql (R2-002). Sem DDL no caminho
    // de request — antes o CREATE/ALTER aqui rodava em totalizadores/validadeDashboard
    // (read), com race de pg_type sob concorrência. Os métodos apenas LEEM agora.
    if (this.tableChecked) return
    this.tableChecked = true
  }

  /** Extrai a data de validade do texto do PDF da CND */
  private async extrairValidadePdf(pdfBase64: string): Promise<string | null> {
    try {
      const buf = Buffer.from(pdfBase64, 'base64')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const data = await require('pdf-parse/lib/pdf-parse.js')(buf)
      const texto = data.text || ''

      // Padrões comuns: "Data Validade:DD/MM/YYYY", "Válida até DD/MM/YYYY", "Validade: DD/MM/YYYY"
      const patterns = [
        /Data\s*Validade\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
        /V[aá]lid[ao]\s*(?:at[eé])?\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
        /Validade\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
        /vencimento\s*[:]\s*(\d{2}\/\d{2}\/\d{4})/i,
      ]

      for (const p of patterns) {
        const m = texto.match(p)
        if (m) {
          const [dd, mm, yyyy] = m[1]!.split('/')
          return `${yyyy}-${mm}-${dd}` // ISO format
        }
      }

      // Fallback: se há 2+ datas, a segunda costuma ser a validade (primeira é emissão)
      const datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g)
      if (datas && datas.length >= 2) {
        const [dd, mm, yyyy] = datas[1]!.split('/')
        return `${yyyy}-${mm}-${dd}`
      }

      return null
    } catch {
      return null
    }
  }

  // ── Consulta CND Vitória ────────────────────────────

  async consultarVitoria(documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    console.log(`[CND-MUN-VIX] Consultando ${doc} via Puppeteer...`)
    this.consultaEtapa = 'Iniciando consulta...'

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })

    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1400, height: 900 })

      // Interceptar PDF
      let pdfBase64: string | null = null
      page.on('response', async (res: { headers: () => Record<string, string>; buffer: () => Promise<Buffer> }) => {
        const ct = res.headers()['content-type'] || ''
        if (ct.includes('pdf')) {
          try { const buf = await res.buffer(); pdfBase64 = buf.toString('base64') } catch { /* */ }
        }
      })

      this.consultaEtapa = 'Acessando portal da prefeitura...'
      await page.goto(VIX_URL, { waitUntil: 'networkidle2', timeout: 30000 })
      this.consultaEtapa = 'Página da prefeitura carregada'

      // Selecionar CNPJ
      await page.click('label[for=ctl00_conteudo_rblTipoDocumento_1]')
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 2000))

      // Digitar CNPJ
      this.consultaEtapa = 'Preenchendo CNPJ e consultando...'
      await page.type('input[name="ctl00$conteudo$txtTermoBusca"]', doc)
      await page.click('#ctl00_conteudo_btnEnviar')
      this.consultaEtapa = 'Aguardando resposta da prefeitura...'
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 5000))

      // Capturar texto da página
      let texto: string = await page.evaluate('document.body.innerText')

      // Capturar débitos (se houver tabela)
      const debitos: string[] = await page.evaluate(`
        Array.from(document.querySelectorAll('table tr'))
          .map(r => r.innerText?.trim())
          .filter(t => t && (t.includes('Declaração') || t.includes('IPTU') || t.includes('ISS') || t.includes('Taxa')))
      `)

      // Verificar se já tem botão Emitir (certidão recente existe)
      let temEmitir: boolean = await page.evaluate(`!!document.getElementById('ctl00_conteudo_btnEmitir')`)

      // Se NÃO tem Emitir e NÃO tem pendências → precisa clicar Continuar mais uma vez
      if (!temEmitir && !texto.includes('Pendência') && !debitos.length) {
        const temContinuar: boolean = await page.evaluate(`!!document.getElementById('ctl00_conteudo_btnEnviar')`)
        if (temContinuar) {
          console.log(`[CND-MUN-VIX] Clicando Continuar (step extra)...`)
          await page.click('#ctl00_conteudo_btnEnviar')
          await new Promise((r: (v: unknown) => void) => setTimeout(r, 5000))
          texto = await page.evaluate('document.body.innerText')
          temEmitir = await page.evaluate(`!!document.getElementById('ctl00_conteudo_btnEmitir')`)
        }
      }

      // Se tem botão Emitir → clicar e capturar o PDF real
      if (temEmitir) {
        this.consultaEtapa = 'Emitindo certidão...'
        const emitirOnclick: string | null = await page.evaluate(`
          (function() {
            var btn = document.getElementById('ctl00_conteudo_btnEmitir');
            return btn ? btn.getAttribute('onclick') : null;
          })()
        `)

        if (emitirOnclick) {
          const urlMatch = (emitirOnclick as string).match(/window\.open\('([^']+)'/)
          if (urlMatch) {
            const pdfRelUrl = urlMatch[1]!
            const pdfFullUrl = new URL(pdfRelUrl, VIX_URL).href
            console.log(`[CND-MUN-VIX] Baixando PDF via browser fetch: ${pdfFullUrl}`)

            try {
              const pdfHex: string | null = await page.evaluate(async (fetchUrl: string) => {
                try {
                  const res = await fetch(fetchUrl, { credentials: 'include' })
                  if (!res.ok) return null
                  const ab = await res.arrayBuffer()
                  const arr = new Uint8Array(ab)
                  let hex = ''
                  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0')
                  return hex
                } catch { return null }
              }, pdfFullUrl)

              if (pdfHex) {
                const buf = Buffer.from(pdfHex, 'hex')
                if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
                  pdfBase64 = buf.toString('base64')
                  console.log(`[CND-MUN-VIX] PDF real capturado: ${buf.length} bytes`)
                }
              }
            } catch (e) {
              console.error(`[CND-MUN-VIX] Falha ao baixar PDF:`, (e as Error).message)
            }
          }
        }
      }

      // Analisar resultado
      this.consultaEtapa = 'Verificando resultado...'
      let sucesso = false
      let tipo: string | null = null
      let mensagem = ''

      if (texto.includes('Pendência') || debitos.length > 0) {
        sucesso = false
        tipo = 'Positiva'
        mensagem = `Pendências encontradas: ${debitos.length} débito(s)`
      } else if (texto.includes('não são suficientes') || texto.includes('não encontrado')) {
        sucesso = false
        tipo = null
        mensagem = 'Contribuinte não encontrado no cadastro municipal de Vitória'
      } else if (texto.includes('Negativa') || texto.includes('sem débitos')) {
        sucesso = true
        tipo = 'Negativa'
        mensagem = 'Certidão Negativa — sem débitos'
      } else if (texto.includes('regulares')) {
        sucesso = true
        tipo = 'Positiva com Efeitos de Negativa'
        mensagem = 'Débitos regulares'
      } else {
        sucesso = false
        tipo = null
        const certIdx = texto.indexOf('Certid')
        mensagem = certIdx >= 0 ? texto.slice(certIdx, certIdx + 200).trim() : 'Resposta não identificada'
      }

      await browser.close()

    console.log(`[CND-MUN-VIX] ${doc}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

    // Buscar razão social do cliente
    let razaoSocial: string | null = null
    let resolvedClienteId = clienteId || null
    if (clienteId) {
      const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } })
      razaoSocial = cli?.razaoSocial ?? null
    } else {
      const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
        `SELECT id, razao_social FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
      ).then(rows => rows[0] ? { id: rows[0].id, razaoSocial: rows[0].razao_social } : null)
      if (cli) { razaoSocial = cli.razaoSocial; resolvedClienteId = cli.id }
    }

    // Colunas debitos/pdf_base64/data_validade garantidas pela migração — sem DDL aqui.

    // Extrair validade do PDF
    const dataValidade = pdfBase64 ? await this.extrairValidadePdf(pdfBase64) : null

    // Salvar (manter apenas a mais recente por documento+municipio)
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_municipal WHERE documento = $1 AND UPPER(municipio) = 'VITÓRIA'`, doc)
    await prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cnd_municipal (documento, razao_social, municipio, sucesso, tipo_certidao, mensagem, debitos, pdf_base64, data_validade, cliente_id, user_id)
       VALUES ($1, $2, 'Vitória', $3, $4, $5, $6::jsonb, $7, $8::date, $9, $10)`,
      doc, razaoSocial, sucesso, tipo, mensagem, JSON.stringify(debitos), pdfBase64, dataValidade, resolvedClienteId, userId || null,
    )

    return { sucesso, mensagem, tipo, conteudoHtml: null }
    } catch (e) {
      await browser.close()
      throw e
    }
  }

  // ── Consulta CND TBW (Vila Velha / Serra) ────────────
  // Ambos usam o mesmo sistema SMARAPD/TBW com captcha de imagem

  async consultarVilaVelha(documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    return this.consultarTBW(documento, 'Vila Velha', VV_URL, 'i27', clienteId, userId)
  }

  async consultarSerra(documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    // Serra exige inscrição municipal — buscar do cadastro do cliente
    let inscricaoMunicipal: string | null = null
    if (clienteId) {
      const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { inscricaoMunicipal: true } })
      inscricaoMunicipal = cli?.inscricaoMunicipal ?? null
    } else {
      const cli = await prisma.$queryRawUnsafe<Array<{ inscricao_municipal: string | null }>>(
        `SELECT inscricao_municipal FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`,
        documento.replace(/\D/g, ''),
      )
      inscricaoMunicipal = cli[0]?.inscricao_municipal ?? null
    }
    return this.consultarTBW(documento, 'Serra', SERRA_URL, 'i26', clienteId, userId, inscricaoMunicipal)
  }

  async consultarCariacica(documento: string, clienteId?: string, userId?: string): Promise<CndMunicipalResult> {
    return this.consultarTBW(documento, 'Cariacica', CARIACICA_URL, 'i27', clienteId, userId)
  }

  private async consultarTBW(documento: string, municipio: string, url: string, prefix: string, clienteId?: string, userId?: string, inscricaoMunicipal?: string | null): Promise<CndMunicipalResult> {
    await this.ensureTable()
    const doc = documento.replace(/\D/g, '')
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    const tag = `[CND-MUN-${municipio.toUpperCase().replace(' ', '')}]`
    this.consultaEtapa = 'Iniciando consulta...'
    console.log(`${tag} [1/8] Iniciando consulta para ${doc}...`)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--ignore-certificate-errors'] })

    try {
      const page = await browser.newPage()
      await page.setViewport({ width: 1400, height: 900 })

      let pdfBase64: string | null = null

      // Interceptar captcha raw (imagem original sem perda de qualidade via canvas)
      let captchaRawB64: string | null = null
      page.on('response', async (res: { headers: () => Record<string, string>; buffer: () => Promise<Buffer>; url: () => string }) => {
        const rUrl = res.url()
        if (rUrl.includes('getCaptcha')) {
          try { const buf = await res.buffer(); captchaRawB64 = buf.toString('base64'); console.log(`${tag} >>> Captcha raw interceptado: ${buf.length} bytes`) } catch { /* */ }
        }
        const ct = res.headers()['content-type'] || ''
        if (ct.includes('pdf')) {
          try { const buf = await res.buffer(); pdfBase64 = buf.toString('base64'); console.log(`${tag} >>> PDF interceptado via response: ${buf.length} bytes`) } catch { /* */ }
        }
      })

      console.log(`${tag} [2/8] Abrindo página ${url.slice(0, 60)}...`)
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 })
      this.consultaEtapa = 'Página da prefeitura carregada'
      console.log(`${tag} [2/8] Página carregada`)

      // Preencher inscrição municipal
      if (inscricaoMunicipal) {
        const imFieldId: string | null = await page.evaluate(`(function(){ return document.getElementById('${prefix}idinput') ? '${prefix}idinput' : null })()`)
        if (imFieldId) {
          await page.evaluate(`document.getElementById("${imFieldId}").value = ""`)
          await page.type(`input[id=${imFieldId}]`, inscricaoMunicipal)
          console.log(`${tag} [3/8] Inscrição Municipal preenchida: ${inscricaoMunicipal}`)
        } else {
          console.log(`${tag} [3/8] Campo de Inscrição Municipal não encontrado (${prefix}idinput)`)
        }
      } else {
        console.log(`${tag} [3/8] Sem inscrição municipal para preencher`)
      }

      // Detectar campo de CNPJ
      const cnpjFieldId: string = await page.evaluate(`(function(){ return document.getElementById('cnpjcpf') ? 'cnpjcpf' : document.getElementById('${prefix}cnpj') ? '${prefix}cnpj' : document.getElementById('${prefix}cnpjcpf') ? '${prefix}cnpjcpf' : null })()`)
      if (!cnpjFieldId) throw new Error('Campo de CNPJ não encontrado na página')

      await page.evaluate(`document.getElementById("${cnpjFieldId}").value = ""`)
      await page.type(`input[id=${cnpjFieldId}]`, doc)
      this.consultaEtapa = 'Dados preenchidos, capturando captcha...'
      console.log(`${tag} [4/8] CNPJ preenchido: ${doc} (campo: ${cnpjFieldId})`)

      // Usar captcha raw interceptado (melhor qualidade) ou fallback para canvas
      const captchaHints = { caseSensitive: true, minLen: 5, maxLen: 6, lang: 'en' as const }
      let captchaB64 = captchaRawB64
      if (!captchaB64) {
        captchaB64 = await page.evaluate(`(function(){ var img = document.getElementById("${prefix}captchaimg"); if (!img) return null; var c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext("2d").drawImage(img, 0, 0); return c.toDataURL("image/png").split(",")[1]; })()`) as string | null
      }
      if (!captchaB64) throw new Error('Captcha não encontrado na página')
      this.consultaEtapa = 'Resolvendo captcha via 2Captcha...'
      console.log(`${tag} [5/8] Captcha capturado (${captchaRawB64 ? 'raw' : 'canvas'}, ${captchaB64.length} chars), enviando para 2Captcha...`)

      let captchaText = await this.captcha.resolveImage(captchaB64, captchaHints)

      await page.evaluate(`document.getElementById("${prefix}captchafield").value = ""`)
      await page.type(`input[id=${prefix}captchafield]`, captchaText)
      this.consultaEtapa = `Captcha resolvido, emitindo certidão...`
      console.log(`${tag} [6/8] Captcha resolvido: "${captchaText}", clicando Gerar...`)

      await page.click(`button[id=${prefix}btngerar]`)
      this.consultaEtapa = 'Aguardando resposta da prefeitura...'
      console.log(`${tag} [7/8] Botão Gerar clicado, aguardando resposta...`)
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 15000))

      // Verificar se o captcha falhou (modal "Texto da imagem incorreto")
      let texto: string = await page.evaluate('document.body.innerText')
      let tentativas = 1
      const maxTentativas = 5

      while (texto.includes('incorreto') && tentativas < maxTentativas) {
        tentativas++
        this.consultaEtapa = `Captcha incorreto, tentativa ${tentativas}/${maxTentativas}...`
        console.log(`${tag} [7/8] Captcha incorreto, tentativa ${tentativas}/${maxTentativas}...`)

        // Fechar modal de aviso (clicar OK)
        await page.evaluate(`(function(){ var btn = document.querySelector('#_divModalConfirmBtnOk') || document.querySelector('button.btn-primary'); if(btn) btn.click(); })()`)
        await new Promise((r: (v: unknown) => void) => setTimeout(r, 2000))

        // Recarregar captcha — interceptar o novo raw
        captchaRawB64 = null
        await page.evaluate(`(function(){ var img = document.getElementById('${prefix}captchaimg'); if(img) { img.src = img.src.split('?')[0] + '?t=' + Date.now(); } })()`)
        await new Promise((r: (v: unknown) => void) => setTimeout(r, 3000))

        // Usar raw interceptado ou fallback canvas
        let newCaptchaB64 = captchaRawB64
        if (!newCaptchaB64) {
          newCaptchaB64 = await page.evaluate(`(function(){ var img = document.getElementById("${prefix}captchaimg"); if (!img) return null; var c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext("2d").drawImage(img, 0, 0); return c.toDataURL("image/png").split(",")[1]; })()`) as string | null
        }
        if (!newCaptchaB64) { console.log(`${tag} Captcha não encontrado para retry`); break }

        this.consultaEtapa = `Resolvendo novo captcha (tentativa ${tentativas}/${maxTentativas})...`
        console.log(`${tag} [7/8] Resolvendo novo captcha (${captchaRawB64 ? 'raw' : 'canvas'})...`)
        captchaText = await this.captcha.resolveImage(newCaptchaB64, captchaHints)

        await page.evaluate(`document.getElementById("${prefix}captchafield").value = ""`)
        await page.type(`input[id=${prefix}captchafield]`, captchaText)
        console.log(`${tag} [7/8] Novo captcha: "${captchaText}", clicando Gerar...`)

        await page.click(`button[id=${prefix}btngerar]`)
        await new Promise((r: (v: unknown) => void) => setTimeout(r, 15000))

        texto = await page.evaluate('document.body.innerText')
      }

      if (texto.includes('incorreto')) {
        console.log(`${tag} Captcha falhou após ${maxTentativas} tentativas`)
      }

      // Aguardar mais para nova aba com PDF
      await new Promise((r: (v: unknown) => void) => setTimeout(r, 5000))

      // Verificar todas as páginas abertas
      const allPages = await browser.pages()
      this.consultaEtapa = 'Verificando resultado...'
      console.log(`${tag} [8/8] Verificando resultado — ${allPages.length} página(s) aberta(s)`)

      let pdfUrl: string | null = null
      for (let i = 0; i < allPages.length; i++) {
        const p = allPages[i]!
        const pUrl = p.url()
        console.log(`${tag}   Página ${i}: ${pUrl.slice(0, 100)}`)
        if (pUrl.includes('.pdf') || pUrl.includes('resultados')) {
          pdfUrl = pUrl
        }
      }

      // Capturar PDF via fetch dentro do contexto do browser (com sessão/cookies)
      if (pdfUrl && !pdfBase64) {
        console.log(`${tag} PDF na aba: ${pdfUrl}, buscando via page.evaluate(fetch)...`)
        this.consultaEtapa = 'Baixando PDF da certidão...'
        try {
          const pdfHex: string | null = await page.evaluate(async (fetchUrl: string) => {
            try {
              const res = await fetch(fetchUrl, { credentials: 'include' })
              if (!res.ok) return null
              const ab = await res.arrayBuffer()
              const arr = new Uint8Array(ab)
              let hex = ''
              for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0')
              return hex
            } catch { return null }
          }, pdfUrl)

          if (pdfHex) {
            const buf = Buffer.from(pdfHex, 'hex')
            console.log(`${tag} PDF fetch: ${buf.length} bytes, starts: ${buf.toString('utf8', 0, 5)}`)
            if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) {
              pdfBase64 = buf.toString('base64')
              console.log(`${tag} PDF real capturado!`)
            }
          }
        } catch (e) { console.log(`${tag} Erro ao buscar PDF via evaluate: ${(e as Error).message}`) }
      }

      if (!pdfBase64 && !pdfUrl) {
        console.log(`${tag} Nenhuma aba com PDF encontrada`)
      }

      // Atualizar texto do resultado da página principal
      texto = await page.evaluate('document.body.innerText')

      // Analisar resultado
      let sucesso = false
      let tipo: string | null = null
      let mensagem = ''

      if (pdfBase64) {
        // Se conseguiu PDF, é certidão emitida (Negativa ou Positiva com Efeitos)
        sucesso = true; tipo = 'Negativa'; mensagem = 'Certidão emitida com sucesso'
      } else if (texto.includes('Negativa') && !texto.includes('Positiva')) {
        sucesso = true; tipo = 'Negativa'; mensagem = 'Certidão Negativa emitida'
      } else if (texto.includes('Positiva com Efeito') || texto.includes('regulares')) {
        sucesso = true; tipo = 'Positiva com Efeitos de Negativa'; mensagem = 'Certidão Positiva com Efeitos de Negativa'
      } else if (texto.includes('Positiva') || texto.includes('pendência') || texto.includes('débito')) {
        sucesso = false; tipo = 'Positiva'; mensagem = 'Existem débitos pendentes'
      } else if (texto.includes('incorreto') || texto.includes('inválido')) {
        sucesso = false; tipo = null; mensagem = 'Captcha incorreto — tente novamente'
      } else if (texto.includes('não encontrado') || texto.includes('não cadastrado') || texto.includes('Nenhum cadastro')) {
        sucesso = false; tipo = null; mensagem = 'Contribuinte não encontrado no cadastro municipal'
      } else {
        sucesso = false; tipo = null
        mensagem = 'Não foi possível emitir a certidão — verifique o CNPJ e tente novamente'
      }

      console.log(`${tag} ${doc}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)
      await browser.close()

      // Resolver cliente
      let razaoSocial: string | null = null
      let resolvedClienteId = clienteId || null
      if (clienteId) {
        const cli = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { razaoSocial: true } })
        razaoSocial = cli?.razaoSocial ?? null
      } else {
        const cli = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
          `SELECT id, razao_social FROM clientes WHERE deleted_at IS NULL AND REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, doc,
        ).then(rows => rows[0] ? { id: rows[0].id, razaoSocial: rows[0].razao_social } : null)
        if (cli) { razaoSocial = cli.razaoSocial; resolvedClienteId = cli.id }
      }

      // Salvar (colunas debitos/pdf_base64/data_validade garantidas pela migração)

      // Extrair validade do PDF
      const dataValidade = pdfBase64 ? await this.extrairValidadePdf(pdfBase64) : null
      if (dataValidade) console.log(`${tag} Validade extraída do PDF: ${dataValidade}`)

      await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_municipal WHERE documento = $1 AND UPPER(municipio) = UPPER($2)`, doc, municipio)
      await prisma.$executeRawUnsafe(
        `INSERT INTO certidoes_cnd_municipal (documento, razao_social, municipio, sucesso, tipo_certidao, mensagem, debitos, pdf_base64, data_validade, cliente_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, $7, $8::date, $9, $10)`,
        doc, razaoSocial, municipio, sucesso, tipo, mensagem, pdfBase64, dataValidade, resolvedClienteId, userId || null,
      )

      return { sucesso, mensagem, tipo, conteudoHtml: null }
    } catch (e) {
      await browser.close()
      throw e
    }
  }

  // ── Lote (assíncrono com progresso) ─────────────────

  async consultarLoteMunicipio(municipio: string, clientes: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>, userId?: string): Promise<{ message: string }> {
    if (this.loteProgress.status === 'running') throw new Error('Consulta em lote já em andamento.')

    this.loteProgress = {
      status: 'running', total: clientes.length, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0,
      currentCliente: 'Iniciando...', items: clientes.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }

    this.runLoteMunicipio(municipio, clientes, userId).catch(e => {
      console.error('[CND-MUN-VIX Lote] Erro:', (e as Error).message)
      this.loteProgress.status = 'done'
      this.loteProgress.currentCliente = `Erro: ${(e as Error).message}`
    })

    return { message: 'Consulta em lote iniciada' }
  }

  private async runLoteMunicipio(municipio: string, clientes: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>, userId?: string) {
    for (let i = 0; i < clientes.length; i++) {
      const c = clientes[i]!
      const nome = c.razaoSocial || c.documento
      this.loteProgress.current = i + 1
      this.loteProgress.currentCliente = nome
      this.loteProgress.items[i] = { razaoSocial: nome, status: 'processando' }

      try {
        const mun = municipio.toUpperCase()
        const result = mun === 'VILA VELHA' ? await this.consultarVilaVelha(c.documento, c.clienteId, userId)
          : mun === 'SERRA' ? await this.consultarSerra(c.documento, c.clienteId, userId)
          : mun === 'CARIACICA' ? await this.consultarCariacica(c.documento, c.clienteId, userId)
          : await this.consultarVitoria(c.documento, c.clienteId, userId)
        if (result.sucesso) {
          this.loteProgress.emitidas++
          this.loteProgress.items[i] = { razaoSocial: nome, status: 'emitida' }
        } else {
          this.loteProgress.naoEmitidas++
          this.loteProgress.items[i] = { razaoSocial: nome, status: 'nao_emitida', erro: result.mensagem }
        }
      } catch (e) {
        this.loteProgress.erros++
        this.loteProgress.items[i] = { razaoSocial: nome, status: 'erro', erro: (e as Error).message }
      }

      if (i < clientes.length - 1) await new Promise(r => setTimeout(r, 2000))
    }

    this.loteProgress.status = 'done'
    this.loteProgress.currentCliente = 'Concluído'
  }

  // ── Listagem ────────────────────────────────────────

  async list(input: { page: number; limit: number; search?: string; municipio?: string; filtroStatus?: string }) {
    await this.ensureTable()
    const { page, limit, search, municipio, filtroStatus } = input
    const offset = (page - 1) * limit
    const conditions: string[] = []
    const params: unknown[] = []
    let idx = 1

    if (municipio) { conditions.push(`UPPER(municipio) = UPPER($${idx})`); params.push(municipio); idx++ }
    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    if (filtroStatus === 'negativa') conditions.push(`sucesso = true AND tipo_certidao = 'Negativa'`)
    else if (filtroStatus === 'positiva') conditions.push(`sucesso = true AND tipo_certidao != 'Negativa'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false`)
    else if (filtroStatus === 'vigente') conditions.push(`data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencendo') conditions.push(`data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days'`)
    else if (filtroStatus === 'vencida') conditions.push(`data_validade IS NOT NULL AND data_validade < CURRENT_DATE`)

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

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

  async totalizadores(municipio?: string) {
    await this.ensureTable()
    const mFilter = municipio ? `WHERE UPPER(municipio) = UPPER($1)` : ''
    const params = municipio ? [municipio] : []
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao = 'Negativa')::int as negativas,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao LIKE 'Positiva%')::int as positivas,
        COUNT(*) FILTER (WHERE sucesso = false)::int as nao_emitidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade < CURRENT_DATE)::int as vencidas,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade >= CURRENT_DATE AND data_validade <= CURRENT_DATE + INTERVAL '15 days')::int as vencendo,
        COUNT(*) FILTER (WHERE data_validade IS NOT NULL AND data_validade > CURRENT_DATE + INTERVAL '15 days')::int as vigentes
      FROM certidoes_cnd_municipal ${mFilter}
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
  async listarValidadeDashboard() {
    await this.ensureTable()
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT id, documento, razao_social, municipio, tipo_certidao, data_validade
      FROM certidoes_cnd_municipal
      WHERE sucesso = true AND data_validade IS NOT NULL
      ORDER BY data_validade ASC
      LIMIT 50
    `)
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

  async deleteMunicipal(id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_municipal WHERE id = $1`, id)
    return { ok: true }
  }

  async deleteMunicipalLote(ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cnd_municipal WHERE id IN (${placeholders})`, ...ids)
    return { deleted: ids.length }
  }

  // ── Listar clientes de um município ──────────────────

  async listarClientesMunicipio(municipio: string) {
    return prisma.cliente.findMany({
      where: {
        deletedAt: null,
        situacao: 'MENSAL',
        cidade: { equals: municipio, mode: 'insensitive' },
      },
      select: { id: true, razaoSocial: true, documento: true, inscricaoMunicipal: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }
}
