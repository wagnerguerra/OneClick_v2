import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as fs from 'fs'
import * as path from 'path'
import * as child_process from 'child_process'

// ============================================================
// Tipos
// ============================================================

export interface DteMensagem {
  id?: string
  clienteId: string
  documento: string
  razaoSocial: string
  tipo: string
  titulo: string
  dataMensagem: string
  status: string
  observacao?: string
}

export interface DteSyncResult {
  total: number
  novas: number
  clientes: number
  erros: string[]
}

export interface DteSyncProgress {
  status: 'idle' | 'running' | 'done' | 'error'
  total: number
  current: number
  currentCliente: string
  mensagensNovas: number
  erros: number
  items: Array<{ razaoSocial: string; documento: string; mensagens: number; status: 'ok' | 'erro' | 'pendente' | 'processando'; erro?: string }>
  logs: Array<{ time: string; level: 'info' | 'warn' | 'error' | 'success'; msg: string }>
}

// ============================================================
// Configuração
// ============================================================

const AGENCIA_VIRTUAL_URL = 'https://s1-internet.sefaz.es.gov.br/agenciavirtual'
const GOV_BR_CERT_SELECTOR = 'button#login-certificate'
const NAV_TIMEOUT = 120_000
const SLEEP = (ms: number) => new Promise(r => setTimeout(r, ms))

// ============================================================
// Service
// ============================================================

@Injectable()
export class DteService {
  private tableChecked = false
  private syncProgress: DteSyncProgress = {
    status: 'idle', total: 0, current: 0, currentCliente: '',
    mensagensNovas: 0, erros: 0, items: [], logs: [],
  }

  getSyncProgress(): DteSyncProgress { return { ...this.syncProgress, logs: [...this.syncProgress.logs] } }

  private log(level: 'info' | 'warn' | 'error' | 'success', msg: string) {
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    this.syncProgress.logs.push({ time, level, msg })
    const prefix = level === 'error' ? '✗' : level === 'warn' ? '⚠' : level === 'success' ? '✓' : '→'
    console.log(`[DTE] ${prefix} ${msg}`)
  }

  // ── Tabela ────────────────────────────────────────────────
  private async ensureTable() {
    if (this.tableChecked) return
    try {
      const exists = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
        `SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'dte_mensagens')`,
      )
      if (exists[0]?.exists) { this.tableChecked = true; return }
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS dte_mensagens (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          cliente_id TEXT,
          documento TEXT NOT NULL,
          razao_social TEXT,
          tipo TEXT,
          titulo TEXT,
          data_mensagem TEXT,
          status TEXT DEFAULT 'nao_lida',
          observacao TEXT,
          hash TEXT,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_dte_msg_doc ON dte_mensagens (documento)`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_dte_msg_cli ON dte_mensagens (cliente_id)`)
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_dte_msg_hash ON dte_mensagens (hash)`)
    } catch (e) {
      if (!(e as Error).message?.includes('already exists')) throw e
    }
    this.tableChecked = true
  }

  // ── Listar mensagens ──────────────────────────────────────
  async listMensagens(filters?: { clienteId?: string; documento?: string; limit?: number }) {
    await this.ensureTable()
    const where: string[] = []
    const params: unknown[] = []
    let idx = 1
    if (filters?.clienteId) { where.push(`cliente_id = $${idx++}`); params.push(filters.clienteId) }
    if (filters?.documento) { where.push(`documento = $${idx++}`); params.push(filters.documento.replace(/\D/g, '')) }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const limit = filters?.limit || 200
    return prisma.$queryRawUnsafe<Array<{
      id: string; cliente_id: string; documento: string; razao_social: string
      tipo: string; titulo: string; data_mensagem: string; status: string
      observacao: string; synced_at: Date; created_at: Date
    }>>(`SELECT * FROM dte_mensagens ${whereClause} ORDER BY data_mensagem DESC, created_at DESC LIMIT ${limit}`, ...params)
  }

  // ── Estatísticas ──────────────────────────────────────────
  async getStats() {
    await this.ensureTable()
    const total = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int as count FROM dte_mensagens`)
    const naoLidas = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(*)::int as count FROM dte_mensagens WHERE status = 'nao_lida'`)
    const clientes = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`SELECT count(DISTINCT documento)::int as count FROM dte_mensagens`)
    return { total: total[0]?.count || 0, naoLidas: naoLidas[0]?.count || 0, clientes: clientes[0]?.count || 0 }
  }

  // ── Marcar como lida ──────────────────────────────────────
  async marcarLida(id: string) {
    await this.ensureTable()
    await prisma.$executeRawUnsafe(`UPDATE dte_mensagens SET status = 'lida' WHERE id = $1`, id)
  }

  // ── Deletar ───────────────────────────────────────────────
  async deleteMensagem(id: string) {
    await this.ensureTable()
    await prisma.$executeRawUnsafe(`DELETE FROM dte_mensagens WHERE id = $1`, id)
  }

  // ── Helpers de certificado ────────────────────────────────
  private getCertPath(): string {
    const paths = [
      path.resolve(process.cwd(), 'uploads', 'certificado-pf.pfx'),
      path.resolve(process.cwd(), '..', '..', 'apps', 'api', 'uploads', 'certificado-pf.pfx'),
    ]
    for (const p of paths) { if (fs.existsSync(p)) return p }
    throw new Error('Certificado PF (Pessoa Física) não encontrado. Envie-o em Configurações → Certificado Digital → aba Certificado PF.')
  }

  private async getCertSenha(): Promise<string> {
    const config = await prisma.systemConfig.findFirst({ where: { key: 'CERTIFICADO_PF_SENHA' } })
    return config?.value || process.env.CERTIFICADO_PF_SENHA || ''
  }

  private getCertCN(): string {
    // Ler CN do certificado usando certutil (Windows)
    try {
      const certPath = this.getCertPath()
      const output = child_process.execSync(`certutil -dump "${certPath}" 2>&1`, { encoding: 'utf8', timeout: 10000 })
      const match = output.match(/Requerente:\s+CN=([^,\r\n]+)/)
      // Pegar o último CN (que é o do titular, não da CA)
      const allCNs = [...output.matchAll(/Requerente:\s+CN=([^,\r\n]+)/g)]
      if (allCNs.length > 0) {
        const lastCN = allCNs[allCNs.length - 1]![1]!.trim()
        console.log(`[DTE] CN do certificado: ${lastCN}`)
        return lastCN
      }
    } catch (e) {
      console.warn('[DTE] Erro ao ler CN do certificado:', (e as Error).message)
    }
    return ''
  }

  // ── Instalar/remover certificado do Windows certstore ─────
  private async installCertToStore(pfxPath: string, senha: string): Promise<boolean> {
    try {
      // Usar PowerShell para instalar no CurrentUser (não precisa de admin)
      const cmd = `Import-PfxCertificate -FilePath '${pfxPath.replace(/'/g, "''")}' -CertStoreLocation Cert:\\CurrentUser\\My -Password (ConvertTo-SecureString -String '${senha.replace(/'/g, "''")}' -Force -AsPlainText)`
      child_process.execSync(`powershell -Command "${cmd}"`, { encoding: 'utf8', timeout: 30000, stdio: 'pipe' })
      console.log('[DTE] Certificado PF instalado no Windows Certificate Store (CurrentUser)')
      return true
    } catch (e) {
      console.warn('[DTE] Aviso ao instalar certificado (pode já estar instalado):', (e as Error).message?.split('\n')[0])
      return false
    }
  }

  // ── Sincronização via Puppeteer (todos ou filtrado por CNPJ) ──
  async sincronizarTodos(filtroDocumento?: string): Promise<DteSyncResult> {
    if (this.syncProgress.status === 'running') throw new Error('Sincronização já em andamento')

    await this.ensureTable()
    const certPath = this.getCertPath()
    const certSenha = await this.getCertSenha()
    const certCN = this.getCertCN()

    if (!certCN) throw new Error('Não foi possível ler o CN do certificado. Verifique o arquivo PFX.')

    // Instalar certificado no Windows para o Chrome poder usá-lo
    await this.installCertToStore(certPath, certSenha)

    this.syncProgress = {
      status: 'running', total: 0, current: 0, currentCliente: '',
      mensagensNovas: 0, erros: 0, items: [], logs: [],
    }
    this.log('info', `Certificado PF: ${certCN}`)
    this.log('info', `Certificado path: ${certPath}`)

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const puppeteer = require('puppeteer')
    let browser: any = null
    const result: DteSyncResult = { total: 0, novas: 0, clientes: 0, erros: [] }

    const profileDir = path.resolve(process.cwd(), 'uploads', 'chrome-dte-profile')

    try {
      this.log('info', `Abrindo browser com profile: ${profileDir}`)
      if (filtroDocumento) this.log('info', `Filtro: apenas CNPJ ${filtroDocumento}`)
      // Usar profile dedicado para manter sessão/cookies entre execuções
      // headless: false é necessário para seleção de certificado no Windows (primeira vez)
      // Primeiro tentar headless (se sessão ativa, não precisa de janela)
      // Se falhar login, re-abrir com janela visível para seleção do certificado
      browser = await puppeteer.launch({
        headless: 'new' as any,
        userDataDir: profileDir,
        args: [
          '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--lang=pt-BR', '--window-size=800,600',
        ],
        timeout: 90000,
        defaultViewport: { width: 800, height: 600 },
        ignoreDefaultArgs: ['--enable-automation'],
      })

      // Fechar todas as abas extras (profile pode ter abas salvas)
      const allPages = await browser.pages()
      for (let p = 1; p < allPages.length; p++) { await allPages[p]!.close().catch(() => {}) }
      let page = allPages[0] || await browser.newPage()
      this.log('info', `Browser aberto (${allPages.length} aba(s) encontrada(s), usando 1) — configurando...`)
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

      const ctx = browser.defaultBrowserContext()
      for (const origin of ['https://sso.acesso.gov.br', 'https://login.acessocidadao.es.gov.br', 'https://acessocidadao.es.gov.br']) {
        try { await ctx.overridePermissions(origin, ['geolocation']) } catch { /* */ }
      }

      // ── STEP 1: Navegar para Agência Virtual SEFAZ ES ─────
      this.log('info', 'Navegando para Agencia Virtual SEFAZ ES...')
      this.syncProgress.currentCliente = 'Acessando portal...'
      await page.goto(AGENCIA_VIRTUAL_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT })
      await SLEEP(2000)
      this.log('info', `URL carregada: ${page.url().slice(0, 80)}`)

      // Verificar se já está autenticado (sessão salva no profile)
      const currentUrl = page.url()
      const jaAutenticado = currentUrl.includes('agenciavirtual') && !currentUrl.includes('login')

      if (jaAutenticado) {
        this.log('success', 'Sessao ativa — login nao necessario (headless)')
      } else {
        // Sessão expirada — fechar headless e reabrir com janela visível (popup)
        this.log('info', 'Sessao expirada — reabrindo com janela visivel para login...')
        await browser.close()

        browser = await puppeteer.launch({
          headless: false,
          userDataDir: profileDir,
          args: [
            '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--lang=pt-BR',
            '--window-size=420,350',
            '--window-position=100,100',
            '--app=about:blank',
            '--disable-extensions', '--disable-default-apps', '--no-first-run',
          ],
          timeout: 90000,
          defaultViewport: { width: 420, height: 350 },
          ignoreDefaultArgs: ['--enable-automation'],
        })
        const allP = await browser.pages()
        for (let p = 1; p < allP.length; p++) { await allP[p]!.close().catch(() => {}) }
        page = allP[0] || await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

        this.log('info', 'Popup aberto — navegando para login...')
        this.syncProgress.currentCliente = 'Login Acesso Cidadao...'
        await page.goto(AGENCIA_VIRTUAL_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT })
        await SLEEP(2000)

        // Aceitar cookies
        await page.evaluate(() => {
          for (const b of document.querySelectorAll('button')) { if (b.textContent?.match(/Aceitar\s+todos/i)) { ;(b as HTMLElement).click(); return } }
        })
        this.log('info', 'Cookies aceitos')
        await SLEEP(1500)

        // Submeter form "Certificado Digital" → redireciona para gov.br SSO
        this.log('info', 'Submetendo form Certificado Digital → gov.br SSO...')
        await page.evaluate(() => {
          for (const form of document.querySelectorAll('form')) {
            if ((form as HTMLFormElement).action?.includes('Challenge')) { (form as HTMLFormElement).submit(); return }
          }
        })
        try { await page.waitForFunction(() => location.hostname.includes('sso.acesso.gov.br'), { timeout: 30000 }) } catch { /* */ }
        await SLEEP(3000)
        this.log('info', `Redirecionado para gov.br: ${page.url().slice(0, 80)}`)

        // Clicar em #login-certificate (abre hCaptcha challenge)
        this.log('info', 'Clicando em #login-certificate (abre hCaptcha)...')
        this.syncProgress.currentCliente = 'Resolvendo hCaptcha...'
        await page.click('#login-certificate', { delay: 100 }).catch(() => {})
        await SLEEP(2000)

        // Resolver hCaptcha via 2Captcha (challenge já está aberto)
        this.log('info', 'Resolvendo hCaptcha via 2Captcha...')
        const hcaptchaSolved = await this.resolveHcaptchaIfPresent(page)
        if (hcaptchaSolved) {
          this.log('success', 'hCaptcha resolvido automaticamente')
          this.log('info', 'Aguardando selecao do certificado PF no dialogo do Windows...')
          this.syncProgress.currentCliente = 'Selecione o certificado PF...'
          try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }) } catch { /* */ }
        } else {
          this.log('warn', 'hCaptcha automatico falhou — aguardando resolucao manual')
          this.syncProgress.currentCliente = 'Resolva o captcha e selecione o certificado...'
          try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 180_000 }) } catch { /* */ }
        }

        await SLEEP(3000)
        try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10_000 }) } catch { /* */ }
        await SLEEP(2000)

        this.log('info', `Pos-login URL: ${page.url().slice(0, 80)}`)

        // Login feito no popup visível — fechar e reabrir headless para scraping
        this.log('info', 'Login concluido — fechando popup e reabrindo headless...')
        await browser.close()

        browser = await puppeteer.launch({
          headless: 'new' as any,
          userDataDir: profileDir,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled', '--lang=pt-BR'],
          timeout: 90000, defaultViewport: { width: 800, height: 600 }, ignoreDefaultArgs: ['--enable-automation'],
        })
        const freshPages = await browser.pages()
        for (let p = 1; p < freshPages.length; p++) { await freshPages[p]!.close().catch(() => {}) }
        page = freshPages[0] || await browser.newPage()
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
        this.log('info', 'Headless reaberto com sessao salva')
      }

      // ── STEP 3: Navegar para Agência Virtual ──────────────
      this.log('info', 'Navegando para Agencia Virtual...')
      await page.goto(AGENCIA_VIRTUAL_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT })
      await SLEEP(2000)

      // Verificar autenticação
      if (page.url().includes('login')) {
        this.log('error', 'Falha na autenticacao — sessao nao foi salva no profile')
        throw new Error('Falha na autenticacao. Sessao expirada ou certificado nao selecionado.')
      }

      this.log('success', 'Autenticado! URL: ' + page.url().slice(0, 80))

      // ── STEP 4: Listar clientes ────────────────────────────
      this.log('info', 'Buscando clientes com procuracao...')
      this.syncProgress.currentCliente = 'Listando clientes...'
      await SLEEP(2000)

      // Clicar em "Pessoa Jurídica" se necessário
      const pageContent = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '')
      if (pageContent.includes('Pessoa') && pageContent.includes('dica')) {
        this.log('info', 'Clicando em "Pessoa Juridica"...')
        await page.evaluate(() => {
          for (const el of document.querySelectorAll('a, div, span, h2, h3')) {
            if (el.textContent?.trim().match(/^Pessoa\s+Jur[ií]dica$/i)) {
              let t: Element = el; for (let i = 0; i < 5; i++) { if (t.parentElement?.tagName === 'A') { t = t.parentElement; break; } t = t.parentElement || t; }
              ;(t as HTMLElement).click(); return
            }
          }
        })
        try { await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }) } catch { /* */ }
        await SLEEP(3000)
        this.log('info', `URL: ${page.url().slice(0, 80)}`)
      }

      // Filtrar pelo CNPJ formatado no campo de busca da tabela
      const cnpjFormatado = filtroDocumento
        ? filtroDocumento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
        : ''

      if (cnpjFormatado) {
        this.log('info', `Filtrando tabela por: ${cnpjFormatado}`)
        await page.evaluate((doc: string) => {
          const inputs = document.querySelectorAll('input[type="search"], input[type="text"], input.form-control')
          for (const input of inputs) {
            const el = input as HTMLInputElement
            if (el.offsetParent) {
              el.value = doc
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('keyup', { bubbles: true }))
              return
            }
          }
        }, cnpjFormatado)
        await SLEEP(3000)
      }

      // Aguardar tabela ter linhas
      try {
        await page.waitForFunction(() => document.querySelectorAll('table tbody tr td').length > 0, { timeout: 10000 })
      } catch {
        this.log('warn', 'Tabela sem linhas apos filtro')
      }
      await SLEEP(1000)

      // Extrair clientes da tabela
      const clientes = await page.evaluate(() => {
        const rows: Array<{ razaoSocial: string; documento: string; vizUrl: string }> = []
        for (const tr of document.querySelectorAll('table tbody tr')) {
          const cells = Array.from(tr.querySelectorAll('td'))
          if (cells.length < 3) continue
          let cnpj = '', razao = ''
          for (const cell of cells) {
            const text = cell.textContent?.trim() || ''
            if (text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)) cnpj = text
            else if (text.length > 5 && !text.match(/^\d/) && !text.match(/^C\s/) && !razao) razao = text
          }
          if (!cnpj) continue
          // Pegar href do link "Visualizar" (a com href contendo /Index)
          const links = Array.from(tr.querySelectorAll('a[href]')) as HTMLAnchorElement[]
          const vizLink = links.find(a => a.href?.includes('/Index')) || links[links.length - 1]
          rows.push({ razaoSocial: razao || cnpj, documento: cnpj, vizUrl: vizLink?.href || '' })
        }
        return rows
      })

      this.log('info', `${clientes.length} empresa(s) na tabela`)
      clientes.slice(0, 5).forEach(c => this.log('info', `  ${c.razaoSocial} (${c.documento}) viz=${c.vizUrl ? 'sim' : 'nao'}`))

      // Filtrar por CNPJ se solicitado
      let clientesFiltrados = clientes
      if (filtroDocumento) {
        const docLimpo = filtroDocumento.replace(/\D/g, '')
        clientesFiltrados = clientes.filter(c => c.documento.replace(/\D/g, '') === docLimpo)
        if (clientesFiltrados.length === 0 && clientes.length > 0) {
          this.log('warn', `CNPJ ${cnpjFormatado} nao encontrado entre ${clientes.length} resultados`)
        } else if (clientesFiltrados.length === 0) {
          this.log('error', `Nenhuma empresa encontrada para CNPJ ${cnpjFormatado}`)
          this.syncProgress.status = 'done'
          return result
        }
        if (clientesFiltrados.length > 0) {
          this.log('success', `Encontrado: ${clientesFiltrados[0]!.razaoSocial} (${clientesFiltrados[0]!.documento})`)
        }
      }

      this.syncProgress.total = clientesFiltrados.length
      result.clientes = clientesFiltrados.length

      // Vincular clientes ao banco
      for (const cli of clientesFiltrados) {
        const docLimpo = cli.documento.replace(/\D/g, '')
        const dbCliente = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM clientes WHERE replace(replace(replace(documento, '.', ''), '/', ''), '-', '') = $1 LIMIT 1`, docLimpo,
        ).catch(() => [])
        ;(cli as any).clienteId = dbCliente[0]?.id || null
      }

      this.syncProgress.items = clientesFiltrados.map(c => ({
        razaoSocial: c.razaoSocial, documento: c.documento, mensagens: 0, status: 'pendente' as const,
      }))

      // ── STEP 5: Para cada cliente, acessar DT-e ───────────
      for (let i = 0; i < clientesFiltrados.length; i++) {
        const cli = clientesFiltrados[i]!
        const docLimpo = cli.documento.replace(/\D/g, '')
        this.syncProgress.current = i + 1
        this.syncProgress.currentCliente = cli.razaoSocial
        this.syncProgress.items[i]!.status = 'processando'

        try {
          this.log('info', `[${i + 1}/${clientesFiltrados.length}] ${cli.razaoSocial} (${cli.documento})`)

          if (!cli.vizUrl) {
            this.log('error', `  URL de visualizacao nao encontrada`)
            this.syncProgress.items[i]!.status = 'erro'
            this.syncProgress.items[i]!.erro = 'URL nao encontrada'
            this.syncProgress.erros++
            continue
          }

          // Construir URL do DTE diretamente: {vizUrl base}/DTE/ListarMensagens
          // vizUrl = .../PessoaJuridica/{hash}/Index → base = .../PessoaJuridica/{hash}
          const baseUrl = cli.vizUrl.replace(/\/Index\/?$/, '')
          const dteUrl = `${baseUrl}/DTE/ListarMensagens`
          this.log('info', `  Navegando direto para DTE: ${dteUrl.slice(0, 90)}`)

          await page.goto(dteUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
            this.log('warn', `  Timeout no networkidle2 — continuando...`)
          })
          this.log('info', `  URL carregada: ${page.url().slice(0, 90)}`)

          // Aguardar conteudo DTE carregar
          this.log('info', `  Aguardando conteudo DTE carregar...`)
          try {
            await page.waitForFunction(() => {
              // Buscar texto especifico do DTE (nao do sidebar)
              // O conteudo DTE tem: "Domicilio Tributário Eletrônico" ou "Mostrando de X a Y"
              const text = document.body?.innerText || ''
              return text.includes('Domicilio Tributário') || text.includes('Domicílio Tributário')
                || text.includes('Mostrando de ')
                || text.includes('Termo de Adesão')
                || text.includes('Credenciamento automático')
                || (text.includes('DFE') && text.match(/\d{2}\/\d{2}\/\d{4}/))
            }, { timeout: 15000 })
            this.log('success', `  Conteudo DTE detectado na pagina`)
          } catch {
            this.log('warn', `  Timeout 15s aguardando conteudo DTE — capturando pagina atual`)
          }
          await SLEEP(2000)

          // Debug: screenshot + texto da pagina DTE
          try {
            await page.screenshot({ path: path.resolve(process.cwd(), 'uploads', `dte-debug-${docLimpo}.png`) })
            this.log('info', `  Screenshot salvo: dte-debug-${docLimpo}.png`)
          } catch { /* */ }

          let dtePageText = ''
          try {
            dtePageText = await page.evaluate(() => document.body?.innerText || '') as string
            this.log('info', `  Pagina DTE (${dtePageText.length} chars): ${dtePageText.replace(/\s+/g, ' ').slice(0, 400)}`)
            // Logar trecho onde as mensagens começam (após "Listar Mensagens")
            const idxListar = dtePageText.indexOf('Listar Mensagens')
            if (idxListar >= 0) {
              const trecho = dtePageText.slice(idxListar, idxListar + 600).replace(/\r/g, '')
              this.log('info', `  Trecho DTE apos "Listar Mensagens":\n${trecho.slice(0, 500)}`)
            }
          } catch (evalErr) {
            this.log('error', `  Erro ao ler pagina: ${(evalErr as Error).message?.slice(0, 100)}`)
          }

          // Verificar se tem "Mostrando de X a Y" (indica que ha mensagens)
          const temMensagens = dtePageText.match(/Mostrando\s+de\s+(\d+)\s+a\s+(\d+)\s+de\s+(\d+)/)
          if (temMensagens) {
            this.log('info', `  Portal indica: ${temMensagens[0]}`)
          } else if (dtePageText.includes('Nenhum') || dtePageText.includes('nenhum')) {
            this.log('info', `  Portal indica: nenhuma mensagem`)
          }

          // Extrair mensagens DT-e
          // Formato real do innerText (4 linhas por mensagem):
          //   NO                        ← badge (2 chars)
          //   NOTIFICAÇÕES              ← categoria
          //   Retificação do DUA...     ← assunto
          //   30/03/2026 10:11          ← data
          const mensagens = await page.evaluate(() => {
            const msgs: Array<{ tipo: string; titulo: string; dataMensagem: string; status: string }> = []
            const body = document.body.innerText || ''
            const lines = body.split('\n').map(l => l.trim()).filter(Boolean)

            // Categorias válidas do DT-e
            const CATEGORIAS = /^(NOTIFICAÇÕES?|COOPERAÇÃO FISCAL|DFE|INTIMAÇÕES?|CIÊNCIAS?|AUTO INFRAÇÃO|COMUNICAÇÕES?)$/i

            for (let i = 0; i < lines.length - 2; i++) {
              // Procurar linha de data (dd/mm/yyyy HH:mm)
              const dateMatch = lines[i]!.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})$/)
              if (!dateMatch) continue

              // A mensagem está nas 3 linhas ANTERIORES: badge, categoria, assunto
              // Linha i-3 = badge (NO, DF, CF, etc) — opcional
              // Linha i-2 = categoria (NOTIFICAÇÕES, DFE, etc)
              // Linha i-1 = assunto
              // Linha i   = data

              const assunto = lines[i - 1] || ''
              const categoria = lines[i - 2] || ''
              const data = `${dateMatch[1]} ${dateMatch[2]}`

              // Validar que a categoria é válida
              if (!CATEGORIAS.test(categoria)) continue

              msgs.push({
                tipo: categoria,
                titulo: assunto,
                dataMensagem: data,
                status: 'nao_lida',
              })
            }

            // Deduplicar
            const seen = new Set<string>()
            return msgs.filter(m => {
              const key = `${m.titulo}|${m.dataMensagem}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
          })

          this.log('info', `  ${mensagens.length} mensagem(ns) extraida(s) para ${cli.razaoSocial}`)
          if (mensagens.length > 0) {
            mensagens.slice(0, 3).forEach((m, idx) => this.log('info', `    [${idx + 1}] ${m.tipo} | ${m.titulo.slice(0, 60)} | ${m.dataMensagem}`))
            if (mensagens.length > 3) this.log('info', `    ... +${mensagens.length - 3} mais`)
          }

          // Salvar mensagens (deduplicar por hash)
          let novas = 0
          for (const msg of mensagens) {
            const hash = `${docLimpo}|${msg.tipo}|${msg.titulo}|${msg.dataMensagem}`.toLowerCase().replace(/\s+/g, ' ')
            try {
              await prisma.$executeRawUnsafe(
                `INSERT INTO dte_mensagens (documento, razao_social, tipo, titulo, data_mensagem, status, hash, cliente_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (hash) DO NOTHING`,
                docLimpo, cli.razaoSocial, msg.tipo, msg.titulo, msg.dataMensagem,
                msg.status || 'nao_lida', hash, (cli as any).clienteId || null,
              )
              novas++
            } catch { /* duplicada */ }
          }

          result.total += mensagens.length
          result.novas += novas
          this.syncProgress.mensagensNovas += novas
          this.syncProgress.items[i]!.mensagens = mensagens.length
          this.syncProgress.items[i]!.status = 'ok'

          // Voltar não é necessário — na próxima iteração navegamos direto para o próximo DTE URL

          this.log('success', `  ${novas} nova(s) salva(s) de ${mensagens.length} — ${cli.razaoSocial}`)

        } catch (e) {
          this.log('error', `Erro no cliente ${cli.razaoSocial}: ${(e as Error).message}`)
          this.syncProgress.items[i]!.status = 'erro'
          this.syncProgress.items[i]!.erro = (e as Error).message
          this.syncProgress.erros++
          result.erros.push(`${cli.razaoSocial}: ${(e as Error).message}`)
          this.log('info', '  Recuperando — proximo cliente...')
        }
      }

      this.syncProgress.status = 'done'
      this.log('success', `Sincronizacao concluida: ${result.novas} nova(s) de ${result.total} total, ${result.erros.length} erro(s)`)

    } catch (e) {
      this.syncProgress.status = 'error'
      this.syncProgress.currentCliente = (e as Error).message
      throw e
    } finally {
      if (browser) try { await browser.close() } catch { /* */ }
    }

    return result
  }

  // ── Sincronizar um cliente específico ─────────────────────
  async sincronizarCliente(clienteId: string, documento: string): Promise<{ mensagens: number; novas: number }> {
    await this.ensureTable()
    const docLimpo = documento.replace(/\D/g, '')
    const before = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int as count FROM dte_mensagens WHERE documento = $1`, docLimpo,
    )
    // Roda sincronização filtrada apenas para este CNPJ
    await this.sincronizarTodos(docLimpo)
    const after = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      `SELECT count(*)::int as count FROM dte_mensagens WHERE documento = $1`, docLimpo,
    )
    return { mensagens: after[0]?.count || 0, novas: (after[0]?.count || 0) - (before[0]?.count || 0) }
  }

  // ── Resolver hCaptcha (se presente) ───────────────────────
  private async getCaptchaApiKey(): Promise<string> {
    // Buscar do banco primeiro, depois do .env
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: ['CAPTCHA_2CAPTCHA_API_KEY', 'CAPTCHA_FREECAPTCHA_API_KEY'] } },
    }).catch(() => [])
    const map = new Map(configs.map(c => [c.key, c.value]))
    return map.get('CAPTCHA_2CAPTCHA_API_KEY') || process.env.CAPTCHA_2CAPTCHA_API_KEY || ''
  }

  private async resolveHcaptchaIfPresent(page: any): Promise<boolean> {
    const apiKey = await this.getCaptchaApiKey()
    if (!apiKey) {
      console.warn('[DTE] CAPTCHA_2CAPTCHA_API_KEY nao configurada')
      return false
    }

    // Detectar sitekey: atributo data-sitekey > script inline > iframe > fallback gov.br
    let sitekey = await page.evaluate(() => {
      const el = document.querySelector('[data-sitekey]') as HTMLElement
      if (el) return el.getAttribute('data-sitekey')
      const scripts = Array.from(document.querySelectorAll('script'))
      for (const s of scripts) {
        const match = s.textContent?.match(/sitekey\s*:\s*["']([a-f0-9-]+)["']/)
        if (match) return match[1]
      }
      const iframes = Array.from(document.querySelectorAll('iframe'))
      for (const iframe of iframes) {
        const m = (iframe as HTMLIFrameElement).src?.match(/sitekey=([a-f0-9-]+)/)
        if (m) return m[1]
      }
      return null
    })
    if (!sitekey) sitekey = '93b08d40-d46c-400a-ba07-6f91cda815b9' // gov.br default

    this.log('info', `hCaptcha sitekey: ${sitekey} — enviando ao 2Captcha...`)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Solver } = require('2captcha-ts')
      const solver = new Solver(apiKey, 4000, true)
      const pageUrl = await page.evaluate(() => location.href)
      const ans = await solver.hcaptcha({ sitekey, pageurl: pageUrl, enterprise: 1 })
      const token = String(ans.data || '').trim()
      if (!token) throw new Error('2captcha retornou token vazio')

      // Injetar token e submeter (gov.br usa onHcaptchaCallback para submeter o form)
      await page.evaluate((t: string) => {
        document.querySelectorAll('textarea[name="h-captcha-response"], input[name="h-captcha-response"], textarea[name="g-recaptcha-response"]').forEach((el: Element) => {
          ;(el as HTMLTextAreaElement).value = t
          el.dispatchEvent(new Event('input', { bubbles: true }))
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (window as any).onHcaptchaCallback === 'function') {
          ;(window as any).onHcaptchaCallback(t)
        }
      }, token)

      console.log('[DTE] hCaptcha resolvido e formulario submetido')
      await SLEEP(3000)
      return true
    } catch (e) {
      console.warn('[DTE] Falha ao resolver hCaptcha:', (e as Error).message)
      return false
    }
  }
}
