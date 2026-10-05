import { Injectable, Inject } from '@nestjs/common'
import { TRPCError } from '@trpc/server'
import { prisma } from '@saas/db'
import type { Browser, HTTPResponse } from 'puppeteer'
import { CaptchaService } from '../common/captcha.service'
import {
  cndLogger, comNavegador, exigirEmpresa, limparDoc, naFilaDoNavegador, PorEmpresa, precisaReconsultar,
} from './cnd-comum'

/**
 * Portais de reemissão de alvará por município (chave sem acento).
 * Vitória NÃO entra: não há portal próprio mapeado — a entrada antiga apontava
 * para o portal de Vila Velha e gravava o resultado como se fosse de Vitória.
 */
const URLS: Record<string, { url: string; prefix: string }> = {
  'VILA VELHA': { url: 'https://tributacao.vilavelha.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabReemissaoAlvara', prefix: 'i27' },
  'SERRA': { url: 'https://tributacao.serra.es.gov.br:8080/tbserra/loginWeb.jsp?execobj=ServicosWebSite&tab=tabReemissaoAlvara', prefix: 'i53' },
  'CARIACICA': { url: 'https://sistemas.cariacica.es.gov.br/tbw/loginWeb.jsp?execobj=ServicosWebSite&tab=tabReemissaoAlvara', prefix: 'i27' },
}

const logger = cndLogger('AlvaraFuncionamento')

/** Só os 4 últimos caracteres do documento vão para o log (LGPD). */
const fimDoc = (doc: string) => `…${doc.slice(-4)}`
const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const chaveMunicipio = (m: string) => m.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim()

/** Config do portal do município, ou erro claro quando não há portal mapeado. */
function portalDoMunicipio(municipio: string): { url: string; prefix: string } {
  const chave = chaveMunicipio(municipio)
  if (chave === 'VITORIA') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Alvará de funcionamento de Vitória ainda não é consultado automaticamente: não há portal da prefeitura de Vitória mapeado.' })
  }
  const config = URLS[chave]
  if (!config) throw new TRPCError({ code: 'BAD_REQUEST', message: `Município "${municipio}" não suportado para alvará de funcionamento` })
  return config
}

export interface AlvaraFuncLoteProgress {
  status: 'idle' | 'running' | 'done'
  total: number
  current: number
  emitidas: number
  naoEmitidas: number
  erros: number
  /** Pulados por terem alvará emitido há menos de 15 dias (não gastam captcha). */
  pulados: number
  currentCliente: string
  items: Array<{ razaoSocial: string; status: 'emitida' | 'nao_emitida' | 'erro' | 'pendente' | 'processando' | 'pulada'; erro?: string }>
}

const loteVazio = (): AlvaraFuncLoteProgress => ({
  status: 'idle', total: 0, current: 0, emitidas: 0, naoEmitidas: 0, erros: 0, pulados: 0, currentCliente: '', items: [],
})

type ClienteLote = { documento: string; clienteId?: string; razaoSocial?: string }

@Injectable()
export class AlvaraFuncionamentoService {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  /** Etapa e lote por empresa — antes um estado único compartilhado entre tenants. */
  private readonly etapa = new PorEmpresa<string>(() => '')
  private readonly lote = new PorEmpresa<AlvaraFuncLoteProgress>(loteVazio)

  getConsultaEtapa(empresaId: string): string { return this.etapa.get(exigirEmpresa(empresaId)) }
  getLoteProgress(empresaId: string): AlvaraFuncLoteProgress {
    const p = this.lote.get(exigirEmpresa(empresaId))
    return { ...p, items: p.items.map(i => ({ ...i })) }
  }

  /** Último alvará BEM-SUCEDIDO do documento no município, na empresa. */
  private async ultimoValido(empresaId: string, doc: string, municipio: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ sucesso: boolean; created_at: Date | null }>>(
      `SELECT sucesso, created_at FROM alvaras_funcionamento
        WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3) AND sucesso = true
        ORDER BY created_at DESC LIMIT 1`,
      empresaId, doc, municipio,
    )
    const r = rows[0]
    return r ? { sucesso: r.sucesso, dataValidade: null, criadoEm: r.created_at } : null
  }

  // ── Consulta individual ──────────────────────────────

  async consultar(empresaId: string, documento: string, municipio: string, clienteId?: string, userId?: string): Promise<{ sucesso: boolean; mensagem: string }> {
    exigirEmpresa(empresaId)
    const doc = limparDoc(documento)
    if (doc.length !== 14 && doc.length !== 11) throw new Error('Documento inválido')
    const config = portalDoMunicipio(municipio)
    const etapa = (s: string) => this.etapa.set(empresaId, s)

    // Cliente e inscrição municipal — sempre dentro da empresa
    let razaoSocial: string | null = null
    let resolvedClienteId: string | null = null
    let inscricaoMunicipal: string | null = null
    if (clienteId) {
      const cli = await prisma.cliente.findFirst({
        where: { id: clienteId, empresaId },
        select: { id: true, razaoSocial: true, inscricaoMunicipal: true },
      })
      if (!cli) throw new TRPCError({ code: 'NOT_FOUND', message: 'Cliente não encontrado nesta empresa.' })
      razaoSocial = cli.razaoSocial
      resolvedClienteId = cli.id
      inscricaoMunicipal = cli.inscricaoMunicipal || null
    }
    if (!resolvedClienteId || !inscricaoMunicipal) {
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
      if (r) {
        if (!resolvedClienteId) { resolvedClienteId = r.id; razaoSocial = r.razao_social }
        inscricaoMunicipal = inscricaoMunicipal || r.inscricao_municipal || null
      }
    }

    logger.log(`${municipio} ${fimDoc(doc)}: consultando alvará de funcionamento`)
    etapa('Aguardando a vez na fila de consultas...')

    const prefix = config.prefix
    const captura = await naFilaDoNavegador(() => comNavegador(async (browser: Browser) => {
      etapa('Iniciando consulta...')
      const page = await browser.newPage()
      await page.setViewport({ width: 1400, height: 900 })

      // Interceptar captcha raw
      let captchaRawB64: string | null = null
      page.on('response', async (res: HTTPResponse) => {
        if (res.url().includes('getCaptcha')) {
          try { captchaRawB64 = (await res.buffer()).toString('base64') } catch { /* corpo indisponível */ }
        }
      })

      etapa('Acessando portal da prefeitura...')
      await page.goto(config.url, { waitUntil: 'networkidle2', timeout: 30000 })
      etapa('Página carregada')

      // `prefix` e os ids de campo são constantes deste arquivo — podem compor o
      // código avaliado. Documento, inscrição e captcha entram só via page.type.
      const tipoSelectId = `${prefix}idtpalvara`
      const licFuncValue = (await page.evaluate(`(function(){
        var sel = document.getElementById("${tipoSelectId}");
        if(!sel) return null;
        for(var i=0;i<sel.options.length;i++){
          if(sel.options[i].text.toLowerCase().includes('funcionamento')) return sel.options[i].value;
        }
        return null;
      })()`)) as string | null

      if (!licFuncValue) return { semTipo: true, texto: '', pdfBase64: null }

      await page.select(`#${tipoSelectId}`, licFuncValue)
      await esperar(1000)

      // Preencher inscrição municipal
      if (inscricaoMunicipal) {
        const inscField = `${prefix}inscricao`
        const exists = (await page.evaluate(`!!document.getElementById("${inscField}")`)) as boolean
        if (exists) {
          await page.evaluate(`document.getElementById("${inscField}").value = ""`)
          await page.type(`#${inscField}`, inscricaoMunicipal)
        }
      }

      // Preencher CNPJ
      const cnpjField = `${prefix}cnpj`
      await page.evaluate(`document.getElementById("${cnpjField}").value = ""`)
      await page.type(`#${cnpjField}`, doc)
      etapa('Dados preenchidos, resolvendo captcha...')

      // Captcha
      await esperar(1000)
      const captchaB64 = captchaRawB64 ?? (await page.evaluate(`(function(){ var img = document.getElementById("${prefix}captchaimg"); if (!img) return null; var c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; c.getContext("2d").drawImage(img, 0, 0); return c.toDataURL("image/png").split(",")[1]; })()`)) as string | null
      if (!captchaB64) throw new Error('Captcha não encontrado na página')

      etapa('Resolvendo captcha via 2Captcha...')
      const captchaText = await this.captcha.resolveImage(captchaB64, { caseSensitive: true, minLen: 5, maxLen: 6, lang: 'en' })

      await page.evaluate(`document.getElementById("${prefix}captchafield").value = ""`)
      await page.type(`#${prefix}captchafield`, captchaText)
      etapa('Gerando alvará...')

      await page.click(`#${prefix}btngerar`)
      etapa('Aguardando resposta...')
      await esperar(15000)

      // Verificar resultado — abas com PDF
      let pdfBase64: string | null = null
      for (const p of await browser.pages()) {
        const pUrl = p.url()
        if (!pUrl.includes('.pdf') && !pUrl.includes('resultados')) continue
        // Capturar PDF via fetch no contexto do navegador (com sessão/cookies)
        try {
          const pdfHex = await page.evaluate(async (fetchUrl: string) => {
            try {
              const res = await fetch(fetchUrl, { credentials: 'include' })
              if (!res.ok) return null
              const arr = new Uint8Array(await res.arrayBuffer())
              let hex = ''
              for (const byte of arr) hex += byte.toString(16).padStart(2, '0')
              return hex
            } catch { return null }
          }, pUrl)
          if (pdfHex) {
            const buf = Buffer.from(pdfHex, 'hex')
            if (buf.length > 100 && buf[0] === 0x25 && buf[1] === 0x50) pdfBase64 = buf.toString('base64')
          }
        } catch { /* aba fechou ou fetch recusado: segue sem PDF */ }
      }

      const texto = (await page.evaluate('document.body.innerText')) as string
      return { semTipo: false, texto, pdfBase64 }
    // Portais TBW (Serra :8080 em especial) servem cadeia de certificado incompleta.
    }, { timeoutMs: 180_000, ignorarTls: true }))
    etapa('')

    let sucesso = false
    let mensagem = ''
    const { texto, pdfBase64 } = captura

    if (captura.semTipo) {
      mensagem = 'Tipo "Licença de Funcionamento" não encontrado neste município'
    } else if (pdfBase64) {
      sucesso = true
      mensagem = 'Alvará de funcionamento emitido com sucesso'
    } else if (texto.includes('NENHUM REGISTRO') || texto.includes('Nenhum registro')) {
      mensagem = 'Nenhum alvará de funcionamento encontrado para este contribuinte'
    } else if (texto.includes('incorreto') || texto.includes('inválido')) {
      mensagem = 'Captcha incorreto — tente novamente'
    } else {
      mensagem = 'Não foi possível emitir o alvará de funcionamento'
    }

    logger.log(`${municipio} ${fimDoc(doc)}: ${sucesso ? 'SUCESSO' : 'FALHA'} — ${mensagem}`)

    const insert = () => prisma.$executeRawUnsafe(
      `INSERT INTO alvaras_funcionamento (documento, razao_social, municipio, sucesso, mensagem, pdf_base64, cliente_id, user_id, empresa_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      doc, razaoSocial, municipio, sucesso, mensagem, pdfBase64, resolvedClienteId, userId || null, empresaId,
    )

    // Nunca apagar alvará válido por causa de uma falha (captcha, portal fora):
    // sucesso troca os anteriores em transação; falha só é gravada quando não
    // há alvará bem-sucedido, e então substitui as falhas anteriores.
    if (sucesso) {
      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          `DELETE FROM alvaras_funcionamento WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3)`,
          empresaId, doc, municipio,
        ),
        insert(),
      ])
      return { sucesso, mensagem }
    }

    if (await this.ultimoValido(empresaId, doc, municipio)) {
      logger.warn(`${municipio} ${fimDoc(doc)}: falha mantida fora do banco (há alvará válido anterior) — ${mensagem}`)
      return { sucesso, mensagem: `${mensagem} (o alvará anterior foi mantido)` }
    }

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `DELETE FROM alvaras_funcionamento WHERE empresa_id = $1 AND documento = $2 AND UPPER(municipio) = UPPER($3) AND sucesso = false`,
        empresaId, doc, municipio,
      ),
      insert(),
    ])
    return { sucesso, mensagem }
  }

  // ── Lote ─────────────────────────────────────────────

  async consultarLote(empresaId: string, municipio: string, clientes: ClienteLote[], userId?: string, forcarNova = false): Promise<{ message: string }> {
    exigirEmpresa(empresaId)
    portalDoMunicipio(municipio) // recusa Vitória / município sem portal antes de abrir o lote
    if (this.lote.get(empresaId).status === 'running') throw new Error('Consulta em lote já em andamento.')

    const prog: AlvaraFuncLoteProgress = {
      ...loteVazio(),
      status: 'running', total: clientes.length, currentCliente: 'Iniciando...',
      items: clientes.map(c => ({ razaoSocial: c.razaoSocial || c.documento, status: 'pendente' as const })),
    }
    this.lote.set(empresaId, prog)

    void (async () => {
      for (let i = 0; i < clientes.length; i++) {
        const c = clientes[i]!
        const item = prog.items[i]!
        prog.current = i + 1
        prog.currentCliente = c.razaoSocial || c.documento
        item.status = 'processando'

        try {
          // Alvará não tem validade gravada: emitido há menos de 15 dias não é reemitido.
          if (!forcarNova) {
            const ultimo = await this.ultimoValido(empresaId, limparDoc(c.documento), municipio)
            if (!precisaReconsultar(ultimo)) {
              prog.pulados++; item.status = 'pulada'; item.erro = 'Alvará emitido recentemente — não reemitido'
              continue
            }
          }
          const result = await this.consultar(empresaId, c.documento, municipio, c.clienteId, userId)
          if (result.sucesso) { prog.emitidas++; item.status = 'emitida' }
          else { prog.naoEmitidas++; item.status = 'nao_emitida'; item.erro = result.mensagem }
        } catch (e) {
          prog.erros++; item.status = 'erro'; item.erro = (e as Error).message
          logger.warn(`Lote ${municipio} ${fimDoc(limparDoc(c.documento))}: ${(e as Error).message}`)
        }

        if (i < clientes.length - 1) await esperar(3000)
      }
      prog.currentCliente = 'Concluído'
    })()
      .catch(e => {
        logger.error(`Lote ${municipio}: ${(e as Error).message}`)
        prog.currentCliente = `Erro: ${(e as Error).message}`
      })
      .finally(() => { prog.status = 'done' })

    return { message: `Consulta em lote iniciada para ${clientes.length} documento(s)` }
  }

  // ── Listagem ────────────────────────────────────────

  async list(empresaId: string, input: { page: number; limit: number; search?: string; municipio?: string }) {
    exigirEmpresa(empresaId)
    const { page, limit, search, municipio } = input
    const offset = (page - 1) * limit
    const conditions: string[] = ['empresa_id = $1']
    const params: unknown[] = [empresaId]
    let idx = 2

    if (municipio) { conditions.push(`UPPER(municipio) = UPPER($${idx})`); params.push(municipio); idx++ }
    if (search) { conditions.push(`(documento ILIKE $${idx} OR razao_social ILIKE $${idx})`); params.push(`%${search}%`); idx++ }

    const where = `WHERE ${conditions.join(' AND ')}`

    const countRows = await prisma.$queryRawUnsafe<Array<{ total: number }>>(`SELECT COUNT(*)::int as total FROM alvaras_funcionamento ${where}`, ...params)
    const total = countRows[0]?.total || 0

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT id, documento, razao_social, municipio, sucesso, mensagem, created_at FROM alvaras_funcionamento ${where} ORDER BY razao_social ASC NULLS LAST LIMIT $${idx} OFFSET $${idx + 1}`,
      ...params, limit, offset,
    )

    return {
      data: rows.map(r => ({
        id: r.id as string,
        documento: r.documento as string,
        razaoSocial: r.razao_social as string | null,
        municipio: r.municipio as string,
        sucesso: r.sucesso as boolean,
        mensagem: r.mensagem as string | null,
        createdAt: r.created_at ? (r.created_at as Date).toISOString() : null,
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    }
  }

  async totalizadores(empresaId: string, municipio?: string) {
    exigirEmpresa(empresaId)
    // Município vai como parâmetro — antes era interpolado na string (SQL injection).
    const mFilter = municipio ? `AND UPPER(municipio) = UPPER($2)` : ''
    const params: unknown[] = municipio ? [empresaId, municipio] : [empresaId]
    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE sucesso = true)::int as emitidos,
        COUNT(*) FILTER (WHERE sucesso = false)::int as nao_emitidos
      FROM alvaras_funcionamento WHERE empresa_id = $1 ${mFilter}
    `, ...params)
    const r = rows[0]!
    return { total: Number(r.total ?? 0), emitidos: Number(r.emitidos ?? 0), naoEmitidos: Number(r.nao_emitidos ?? 0) }
  }

  async getPdf(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    const rows = await prisma.$queryRawUnsafe<Array<{ pdf_base64: string | null }>>(
      `SELECT pdf_base64 FROM alvaras_funcionamento WHERE id = $1 AND empresa_id = $2`, id, empresaId,
    )
    return { pdfBase64: rows[0]?.pdf_base64 || null }
  }

  async deleteAlvara(empresaId: string, id: string) {
    exigirEmpresa(empresaId)
    const n = await prisma.$executeRawUnsafe(`DELETE FROM alvaras_funcionamento WHERE id = $1 AND empresa_id = $2`, id, empresaId)
    return { ok: n > 0 }
  }

  async deleteLote(empresaId: string, ids: string[]) {
    exigirEmpresa(empresaId)
    if (ids.length === 0) return { deleted: 0 }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ')
    const n = await prisma.$executeRawUnsafe(`DELETE FROM alvaras_funcionamento WHERE empresa_id = $1 AND id IN (${placeholders})`, empresaId, ...ids)
    return { deleted: n }
  }

  async listarClientesMunicipio(empresaId: string, municipio: string) {
    exigirEmpresa(empresaId)
    return prisma.cliente.findMany({
      where: { empresaId, cidade: { equals: municipio, mode: 'insensitive' }, status: 'ATIVO', situacao: 'MENSAL' },
      select: { id: true, razaoSocial: true, documento: true },
      orderBy: { razaoSocial: 'asc' },
    })
  }
}
