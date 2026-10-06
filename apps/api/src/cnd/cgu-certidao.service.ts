import { Inject, Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { formatDocumento } from '@saas/types'
import { CaptchaService } from '../common/captcha.service'
import { cndLogger, comNavegador, limparDoc, naFilaDoNavegador, PorEmpresa, precisaReconsultar } from './cnd-comum'

const logger = cndLogger('Cgu')
/** Só os 4 últimos caracteres do documento vão para o log (LGPD). */
const fimDoc = (doc: string) => `…${doc.slice(-4)}`
const espera = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export interface CguResult {
  /** true só para certidão LIMPA (Nada Consta). "Consta" volta false com tipo 'Consta'. */
  sucesso: boolean
  mensagem: string
  tipo: string | null
}

export interface CguLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  /** Pulados por já terem certidão ainda válida. */
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando' | 'pulada'; erro?: string }>
}

const loteVazio = (): CguLoteProgress => ({
  status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, pulados: 0,
  currentCliente: '', items: [],
})

type SituacaoCgu = 'Nada Consta' | 'Consta'

/**
 * Situação de UMA certidão pelo texto do bloco dela. "Nada consta" vem antes
 * porque contém a palavra "consta". Sem acento e case-insensitive.
 */
function classificarBloco(texto: string): SituacaoCgu | null {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/\bnada\s+consta\b/i.test(t)) return 'Nada Consta'
  if (/\bconsta\b/i.test(t)) return 'Consta'
  return null
}

@Injectable()
export class CguCertidaoService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  // Estado por EMPRESA: antes era único e um escritório via a etapa/lote do outro.
  private readonly consultaEtapa = new PorEmpresa<string>(() => '')
  private readonly loteProgress = new PorEmpresa<CguLoteProgress>(loteVazio)

  getConsultaEtapa(empresaId: string): string { return this.consultaEtapa.get(empresaId) }
  getLoteProgress(empresaId: string): CguLoteProgress {
    const p = this.loteProgress.get(empresaId)
    return { ...p, items: [...p.items] }
  }

  /** Cliente da MESMA empresa — pelo id informado ou pelo documento. */
  private async resolverCliente(empresaId: string, doc: string, clienteId?: string): Promise<{ clienteId: string | null; razaoSocial: string | null }> {
    if (clienteId) {
      // findFirst com empresaId: um id de cliente de outra empresa não é vinculado.
      const cli = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId }, select: { razaoSocial: true } })
      return cli ? { clienteId, razaoSocial: cli.razaoSocial } : { clienteId: null, razaoSocial: null }
    }
    // Compara só letras e dígitos (CNPJ alfanumérico), com ou sem máscara gravada.
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string; razao_social: string }>>(
      `SELECT id, razao_social FROM clientes
        WHERE empresa_id = $1 AND status = 'ATIVO'
          AND regexp_replace(upper(documento), '[^0-9A-Z]', '', 'g') = $2
        LIMIT 1`,
      empresaId, doc,
    )
    return rows[0] ? { clienteId: rows[0].id, razaoSocial: rows[0].razao_social } : { clienteId: null, razaoSocial: null }
  }

  // ── Consulta individual ──────────────────────────────

  /** Um Chromium por vez no processo (fila global), com teto de tempo. */
  consultar(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CguResult> {
    return naFilaDoNavegador(() => this.executarConsulta(empresaId, documento, clienteId, userId))
  }

  private async executarConsulta(empresaId: string, documento: string, clienteId?: string, userId?: string): Promise<CguResult> {
    const doc = limparDoc(documento)
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')

    const etapa = (e: string) => this.consultaEtapa.set(empresaId, e)
    etapa('Iniciando consulta...')
    logger.log(`Consultando CGU para ${fimDoc(doc)}...`)

    const coleta = await comNavegador(async (browser) => {
      const page = await browser.newPage()
      await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }) })
      // O user-agent real do Chromium, só sem o "Headless": um UA fixo de outra
      // versão destoa das demais impressões do navegador e o WAF segura a página.
      await page.setUserAgent((await browser.userAgent()).replace('HeadlessChrome', 'Chrome'))
      await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' })

      // A certidão vem em base64 na resposta da API de emissão.
      let pdfBase64: string | null = null
      page.on('response', async (res) => {
        if (!res.url().includes('/api/publico/emissao/') || pdfBase64) return
        try {
          const data = await res.json() as { conteudo?: string; nomeArquivo?: string }
          if (data.conteudo) {
            pdfBase64 = data.conteudo
            logger.log(`PDF capturado via API: ${data.nomeArquivo || 'certidao.pdf'}`)
          }
        } catch { /* resposta sem JSON — ignora */ }
      })

      etapa('Acessando portal da CGU...')
      await page.goto('https://certidoes.cgu.gov.br/', { waitUntil: 'networkidle2', timeout: 30000 })

      // "Emitir certidão": pelo texto do botão; `button.btn-primary` fica só de reserva.
      etapa('Navegando para emissão...')
      // O desafio do WAF (AWS) roda antes do app montar: espera o botão existir.
      await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => /emitir/i.test(b.textContent || '')), { timeout: 30_000 })
      // Clique de mouse no <button> (n\u00e3o `.click()` no <a> que o envolve: o
      // portal s\u00f3 navega pelo handler do bot\u00e3o \u2014 testado em 05/10/2026).
      const emitir = await page.evaluateHandle(() => Array.from(document.querySelectorAll<HTMLElement>('button'))
        .find(el => /emitir\s+certid/i.test((el.innerText || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) ?? null)
      const botaoEmitir = emitir.asElement() as import('puppeteer').ElementHandle<Element> | null
      if (botaoEmitir) await botaoEmitir.click(); else await page.click('button.btn-primary')
      await espera(3000)

      // "Ente Privado": o id (#__BVID__26) era gerado pelo bootstrap-vue e muda
      // a cada build do portal. Procura o rótulo pelo texto e marca o rádio dele.
      etapa('Selecionando Ente Privado...')
      const marcouPrivado = await page.evaluate(() => {
        const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        const label = Array.from(document.querySelectorAll<HTMLLabelElement>('label'))
          .find(l => /ente\s+privado/i.test(norm(l.innerText || '')))
        if (!label) return false
        const input = (label.htmlFor ? document.getElementById(label.htmlFor) : null) as HTMLInputElement | null
          ?? label.querySelector('input')
        if (input) input.click(); else label.click()
        return true
      })
      if (!marcouPrivado) throw new Error('Opção "Ente Privado" não encontrada — o portal da CGU pode ter mudado.')
      await espera(2000)

      etapa('Preenchendo CNPJ...')
      await page.focus('#cpfCnpj')
      await page.keyboard.type(formatDocumento(doc), { delay: 30 })
      await espera(500)

      etapa('Consultando...')
      await page.click('#consultar')

      // Desde out/2026 a consulta passa por um CAPTCHA de grade do AWS WAF
      // ("escolha todas as cortinas"), num shadow DOM aberto. O 2Captcha diz
      // QUAIS das 9 células clicar e o clique é feito aqui, no nosso navegador —
      // o token que o WAF emite nasce nele. (O modo "token" do 2Captcha foi
      // testado e recusado: HTTP 405, o token vale só para quem resolveu.)
      const captchaNaTela = () => page.evaluate(() => {
        const host = document.querySelector('awswaf-captcha') as HTMLElement | null
        return !!host && !!host.shadowRoot?.querySelector('canvas') && host.getClientRects().length > 0
      })
      await espera(4000)
      for (let rodada = 1; await captchaNaTela(); rodada++) {
        if (rodada > 4) throw new Error('O portal da CGU não aceitou a resolução do captcha depois de 4 tentativas. Tente de novo mais tarde ou emita manualmente em certidoes.cgu.gov.br.')
        etapa(`Resolvendo o captcha da CGU (2Captcha, tentativa ${rodada})...`)
        // Instrução em inglês para os resolvedores do 2Captcha (o seletor de idioma é do próprio widget).
        await page.evaluate(() => {
          const sel = document.querySelector('awswaf-captcha')?.shadowRoot?.querySelector('select') as HTMLSelectElement | null
          const en = sel ? Array.from(sel.options).find(o => /^english$/i.test(o.text.trim())) : null
          if (sel && en && sel.value !== en.value) { sel.value = en.value; sel.dispatchEvent(new Event('change', { bubbles: true })) }
        })
        await espera(2500)
        const alvo = await page.evaluate(() => document.querySelector('awswaf-captcha')?.shadowRoot?.querySelector('em')?.textContent?.trim() || '')
        const canvas = await page.evaluateHandle(() => document.querySelector('awswaf-captcha')?.shadowRoot?.querySelector('canvas') ?? null)
        const el = canvas.asElement() as import('puppeteer').ElementHandle<Element> | null
        if (!el || !alvo) throw new Error('Não foi possível ler o captcha da CGU (a página mudou).')
        const imagem = await el.screenshot({ encoding: 'base64' }) as string
        const { celulas, taskId } = await this.captcha.resolveGrid(imagem, `Select all images with ${alvo}`, 3, 3)
        // Os botões "1".."9" ficam invisíveis sobre o canvas (sem área para o
        // puppeteer clicar): clica no centro de cada célula, como uma pessoa.
        const caixa = await el.boundingBox()
        if (!caixa) throw new Error('Não foi possível localizar a grade do captcha da CGU na tela.')
        for (const n of celulas) {
          const lin = Math.floor((n - 1) / 3)
          const col = (n - 1) % 3
          await page.mouse.click(caixa.x + (col + 0.5) * (caixa.width / 3), caixa.y + (lin + 0.5) * (caixa.height / 3))
          await espera(350)
        }
        const confirmar = await page.evaluateHandle(() => document.querySelector('awswaf-captcha')?.shadowRoot?.querySelector('#amzn-btn-verify-internal') ?? null)
        const c = confirmar.asElement() as import('puppeteer').ElementHandle<Element> | null
        if (!c) throw new Error('Botão "Confirmar" do captcha da CGU não encontrado (a página mudou).')
        await c.click()
        await espera(5000)
        // Ainda na tela = errou (o widget já trocou o quebra-cabeça): reporta e tenta de novo.
        if (await captchaNaTela()) await this.captcha.reportarIncorretoV2(taskId)
      }
      etapa('Consultando...')
      await espera(5000)

      const texto = await page.evaluate(() => document.body.innerText)
      if (/inv[aá]lido/i.test(texto)) return { invalido: true as const, texto }

      // Situação POR CERTIDÃO: o bloco (linha/cartão) de cada botão de emissão.
      // Antes o texto da página inteira decidia — um "Nada Consta" em qualquer
      // lugar escondia um "Consta" de outra certidão.
      const blocos = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('button[id^="btnEmitirCertidao"]'))
        return btns.map(b => {
          let el: HTMLElement = b
          for (let n = 0; n < 6; n++) {
            if (el.tagName === 'TR' || el.tagName === 'LI') break
            const pai = el.parentElement
            if (!pai || pai === document.body) break
            // Para antes de englobar o bloco de outra certidão.
            if (pai.querySelectorAll('button[id^="btnEmitirCertidao"]').length > 1) break
            el = pai
          }
          return { id: b.id, texto: el.innerText || '' }
        })
      })

      if (blocos[0]) {
        etapa('Emitindo certidão...')
        await page.click(`[id="${blocos[0].id.replace(/"/g, '')}"]`)
        await espera(10000)
      }

      return { invalido: false as const, texto, blocos, pdfBase64: pdfBase64 as string | null }
    }, { timeoutMs: 300_000, disfarcarAutomacao: true }) // inclui até 3 min do 2Captcha

    if (coleta.invalido) {
      const msg = 'CNPJ/CPF inválido'
      const cli = await this.resolverCliente(empresaId, doc, clienteId)
      const gravado = await this.gravar(empresaId, doc, {
        razaoSocial: cli.razaoSocial, sucesso: false, tipo: null, mensagem: msg, situacao: null, pdfBase64: null,
        clienteId: cli.clienteId, userId: userId ?? null, definitivo: false,
      })
      return { sucesso: false, mensagem: gravado ? msg : `${msg} (a certidão anterior, ainda válida, foi mantida)`, tipo: null }
    }

    const { texto, blocos, pdfBase64 } = coleta
    const razaoMatch = texto.match(/Consultado:\s*(.+?)\s+CPF\/CNPJ:/)
    const razaoSocialExtraida = razaoMatch ? razaoMatch[1]!.trim() : null

    const situacoes = blocos.map(b => classificarBloco(b.texto))
    // Qualquer certidão com "Consta" torna o resultado "Consta"; "Nada Consta"
    // só quando TODAS as certidões do resultado foram reconhecidas como tal.
    const situacao: SituacaoCgu | null = situacoes.includes('Consta')
      ? 'Consta'
      : situacoes.length > 0 && situacoes.every(s => s === 'Nada Consta') ? 'Nada Consta' : null

    let sucesso: boolean
    let tipo: string | null
    let mensagem: string
    // "Definitivo" = o portal respondeu a situação (não é falha técnica): grava
    // mesmo havendo certidão limpa anterior, para a tela não esconder um "Consta" novo.
    let definitivo = false
    if (situacao === 'Nada Consta') {
      sucesso = true
      tipo = 'Nada Consta'
      mensagem = pdfBase64 ? 'Certidão CGU emitida — Nada Consta' : 'Nada consta — certidão negativa (PDF não capturado)'
    } else if (situacao === 'Consta') {
      // Certidão emitida, mas NÃO é certidão limpa: sucesso=false com tipo/situação 'Consta'.
      sucesso = false
      tipo = 'Consta'
      definitivo = true
      mensagem = pdfBase64 ? 'Certidão CGU emitida — CONSTA registro nos sistemas da CGU' : 'CONSTA registro nos sistemas da CGU'
    } else if (pdfBase64) {
      sucesso = false
      tipo = null
      mensagem = 'Certidão baixada, mas não foi possível identificar se é "Nada Consta" ou "Consta" — confira o PDF.'
    } else {
      sucesso = false
      tipo = null
      mensagem = blocos.length === 0 ? 'Não foi possível emitir a certidão (nenhuma certidão no resultado do portal).' : 'Não foi possível classificar a situação da certidão.'
    }

    logger.log(`${fimDoc(doc)}: ${tipo ?? 'sem classificação'} — ${mensagem}`)

    const cli = await this.resolverCliente(empresaId, doc, clienteId)
    const gravado = await this.gravar(empresaId, doc, {
      razaoSocial: cli.razaoSocial ?? razaoSocialExtraida, sucesso, tipo, mensagem, situacao, pdfBase64,
      clienteId: cli.clienteId, userId: userId ?? null, definitivo,
    })
    if (!gravado) mensagem = `${mensagem} (a certidão anterior, ainda válida, foi mantida)`
    return { sucesso, mensagem, tipo }
  }

  /**
   * Grava sem perder certidão válida:
   * - sucesso: insere a nova e apaga as anteriores do documento (na empresa), em transação;
   * - resultado definitivo não-limpo ("Consta"): substitui as não-limpas e MANTÉM a
   *   última limpa (o PDF dela continua válido para o dossiê), mas a mais recente
   *   — a que a tela do cliente mostra — passa a ser o "Consta";
   * - falha técnica com certidão bem-sucedida anterior: não toca em nada;
   * - falha sem nenhuma bem-sucedida: substitui as falhas anteriores.
   * Devolve se gravou.
   */
  private async gravar(empresaId: string, doc: string, d: {
    razaoSocial: string | null; sucesso: boolean; tipo: string | null; mensagem: string; situacao: string | null
    pdfBase64: string | null; clienteId: string | null; userId: string | null; definitivo: boolean
  }): Promise<boolean> {
    const insert = () => prisma.$executeRawUnsafe(
      `INSERT INTO certidoes_cgu (documento, razao_social, sucesso, tipo_certidao, mensagem, situacao, data_consulta, pdf_base64, cliente_id, user_id, empresa_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10)`,
      doc, d.razaoSocial, d.sucesso, d.tipo, d.mensagem, d.situacao, d.pdfBase64, d.clienteId, d.userId, empresaId,
    )
    if (d.sucesso) {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(`DELETE FROM certidoes_cgu WHERE empresa_id = $1 AND documento = $2`, empresaId, doc),
        insert(),
      ])
      return true
    }
    if (!d.definitivo) {
      const validas = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM certidoes_cgu WHERE empresa_id = $1 AND documento = $2 AND sucesso = true LIMIT 1`, empresaId, doc,
      )
      if (validas.length > 0) {
        logger.warn(`Falha na consulta de ${fimDoc(doc)} — certidão anterior válida mantida: ${d.mensagem}`)
        return false
      }
    }
    await prisma.$transaction([
      prisma.$executeRawUnsafe(`DELETE FROM certidoes_cgu WHERE empresa_id = $1 AND documento = $2 AND sucesso = false`, empresaId, doc),
      insert(),
    ])
    return true
  }

  // ── Lote ─────────────────────────────────────────────

  async consultarLote(
    empresaId: string,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId?: string,
    forcarNova = false,
  ): Promise<{ message: string }> {
    if (this.loteProgress.get(empresaId).status === 'running') throw new Error('Consulta em lote já em andamento.')

    const progresso: CguLoteProgress = {
      ...loteVazio(),
      status: 'running', total: documentos.length, currentCliente: 'Iniciando...',
      items: documentos.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }
    this.loteProgress.set(empresaId, progresso)

    // Segundo plano: o erro inesperado é logado e o lote sempre termina como 'done'.
    this.runLote(empresaId, progresso, documentos, userId, forcarNova)
      .catch(e => {
        logger.error(`Lote interrompido: ${(e as Error).message}`)
        progresso.currentCliente = `Erro: ${(e as Error).message}`
      })
      .finally(() => {
        progresso.status = 'done'
        if (!progresso.currentCliente.startsWith('Erro')) progresso.currentCliente = 'Concluído'
      })

    return { message: `Consulta em lote iniciada para ${documentos.length} documento(s)` }
  }

  private async runLote(
    empresaId: string,
    progresso: CguLoteProgress,
    documentos: Array<{ documento: string; clienteId?: string; razaoSocial?: string }>,
    userId: string | undefined,
    forcarNova: boolean,
  ) {
    for (let i = 0; i < documentos.length; i++) {
      const c = documentos[i]!
      const doc = limparDoc(c.documento)
      const nome = c.razaoSocial || c.documento
      progresso.current = i + 1
      progresso.currentCliente = nome
      progresso.items[i] = { razaoSocial: nome, status: 'processando' }

      try {
        if (!forcarNova) {
          // Olha a ÚLTIMA (qualquer resultado): se for um "Consta" posterior à
          // limpa, precisaReconsultar devolve true e a empresa é reconsultada.
          const ultima = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; created_at: Date }>>(
            `SELECT sucesso, created_at FROM certidoes_cgu WHERE empresa_id = $1 AND documento = $2 ORDER BY created_at DESC LIMIT 1`,
            empresaId, doc,
          )
          const u = ultima[0]
          if (u && !precisaReconsultar({ sucesso: u.sucesso, criadoEm: u.created_at })) {
            progresso.pulados++
            progresso.items[i] = { razaoSocial: nome, status: 'pulada', erro: 'Certidão ainda válida — não reemitida' }
            continue
          }
        }

        const result = await this.consultar(empresaId, c.documento, c.clienteId, userId)
        if (result.sucesso) { progresso.emitidas++; progresso.items[i] = { razaoSocial: nome, status: 'emitida' } }
        else { progresso.naoEmitidas++; progresso.items[i] = { razaoSocial: nome, status: 'nao_emitida', erro: result.mensagem } }
      } catch (e) {
        progresso.erros++
        progresso.items[i] = { razaoSocial: nome, status: 'erro', erro: (e as Error).message }
        logger.warn(`Lote: erro em ${fimDoc(doc)}: ${(e as Error).message}`)
      }

      if (i < documentos.length - 1) await espera(3000)
    }
  }

  // ── Listagem ────────────────────────────────────────

  async list(empresaId: string, input: { page: number; limit: number; search?: string; filtroStatus?: string }) {
    const { page, limit, search, filtroStatus } = input
    const offset = (page - 1) * limit
    const conditions: string[] = ['empresa_id = $1']
    const params: unknown[] = [empresaId]
    let idx = 2

    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    if (filtroStatus === 'nada_consta') conditions.push(`sucesso = true AND tipo_certidao = 'Nada Consta'`)
    else if (filtroStatus === 'consta') conditions.push(`tipo_certidao = 'Consta'`)
    else if (filtroStatus === 'nao_emitida') conditions.push(`sucesso = false AND tipo_certidao IS NULL`)

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM certidoes_cgu ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, sucesso, tipo_certidao, mensagem, situacao, data_consulta, created_at FROM certidoes_cgu ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        documento: r.documento as string,
        razaoSocial: r.razao_social as string | null,
        sucesso: r.sucesso as boolean,
        tipoCertidao: r.tipo_certidao as string | null,
        mensagem: r.mensagem as string | null,
        situacao: r.situacao as string | null,
        dataConsulta: r.data_consulta ? (r.data_consulta as Date).toISOString() : null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  async totalizadores(empresaId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true AND tipo_certidao = 'Nada Consta')::int as nada_consta,
        COUNT(*) FILTER (WHERE tipo_certidao = 'Consta')::int as consta,
        COUNT(*) FILTER (WHERE sucesso = false AND tipo_certidao IS NULL)::int as nao_emitidas
      FROM certidoes_cgu
      WHERE empresa_id = $1
    `, empresaId)
    const r = rows[0]!
    return {
      total: Number(r.total ?? 0), nadaConsta: Number(r.nada_consta ?? 0),
      consta: Number(r.consta ?? 0), naoEmitidas: Number(r.nao_emitidas ?? 0),
    }
  }

  async getPdf(empresaId: string, id: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM certidoes_cgu WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteCgu(empresaId: string, id: string) {
    await prisma.$executeRawUnsafe(`DELETE FROM certidoes_cgu WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    return { ok: true }
  }

  async deleteLote(empresaId: string, ids: string[]) {
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
    const deleted = await prisma.$executeRawUnsafe(
      `DELETE FROM certidoes_cgu WHERE empresa_id = $1 AND id IN (${placeholders})`, empresaId, ...ids,
    )
    return { deleted }
  }
}
