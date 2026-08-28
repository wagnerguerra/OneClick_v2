import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { lookup as dnsLookup } from 'dns/promises'
import { isIP } from 'net'
import { buscarImagensWeb, buscadorConfigurado, type CandidataWeb } from './logo-busca-web'

/**
 * Logomarca do cliente: envio manual (que já existia) e busca na internet.
 *
 * Logo não está em banco de fotos — procurar "ADRIA BRASIL" no Pexels não traz
 * a marca da Adria. O que funciona é partir do DOMÍNIO da empresa, que o
 * cadastro quase sempre já tem escondido no e-mail (cristiane@adriabrasil.com),
 * e ir buscar onde a marca de fato mora: no site dela e nos serviços de ícone.
 *
 * Medido contra 9 domínios reais da carteira: 5 renderam alguma imagem
 * aproveitável. Não é mágica — por isso o envio manual continua ali do lado, e
 * o usuário pode digitar o site quando o e-mail não aponta para ele.
 *
 * A API da Clearbit, citada em todo tutorial de logo por domínio, está morta:
 * `logo.clearbit.com` não resolve nem para github.com. Ficou de fora.
 *
 * Além do domínio, há duas frentes para quem não tem site conhecido:
 *
 *  1. PALPITES DE DOMÍNIO a partir do nome fantasia / razão social
 *     (`cardpack` → cardpack.com.br, cardpack.com…). Custa uma requisição por
 *     palpite e resolve o caso comum da empresa que só tem e-mail de gmail.
 *  2. BUSCA NA WEB ABERTA, em `logo-busca-web.ts`, quando há chave de buscador
 *     configurada. É o único caminho que acha marca de quem não tem site.
 *
 * Nenhuma das duas substitui o site: quando ele existe e publica og:image, ele
 * continua vindo primeiro, porque é a marca escolhida por quem fez o site.
 */

const UPLOADS_DIR = join(process.cwd(), 'uploads')

/** Abaixo disso é favicon de barra de endereço, não logomarca. */
const LADO_MINIMO = 48
const TAMANHO_MAXIMO = 8 * 1024 * 1024

/** Domínio de e-mail gratuito não é o domínio da empresa. */
const PROVEDORES_GRATUITOS = new Set([
  'gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
  'yahoo.com', 'yahoo.com.br', 'uol.com.br', 'bol.com.br', 'terra.com.br',
  'live.com', 'icloud.com', 'globo.com', 'ig.com.br', 'me.com', 'msn.com',
  'globomail.com', 'zipmail.com.br', 'oi.com.br',
])

export type LogoSugerida = {
  url: string
  fonte: string
  largura: number | null
  altura: number | null
  bytes: number
  tipo: string
  /** SVG: escala para qualquer tamanho, então os pisos de pixel não valem. */
  vetorial: boolean
}

@Injectable()
export class ClienteLogoService {
  // ── Domínio do cliente ───────────────────────────────────────

  /**
   * De onde sai o domínio, em ordem: o e-mail do cadastro, o e-mail que a
   * Receita devolveu no dossiê, e os e-mails dos contatos. O primeiro que não
   * for provedor gratuito vence.
   */
  async dominiosCandidatos(clienteId: string): Promise<{ dominios: string[]; origem: string }> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { email: true },
    })

    const doDossie = await prisma.clienteDossieFato.findUnique({
      where: { clienteId_bloco_campo: { clienteId, bloco: 'receita', campo: 'email' } },
      select: { valor: true },
    }).catch(() => null)

    const contatos = await prisma.$queryRawUnsafe<Array<{ email: string | null }>>(
      `SELECT email FROM cliente_contatos WHERE cliente_id = $1 AND btrim(coalesce(email,'')) <> '' LIMIT 10`,
      clienteId,
    ).catch(() => [])

    const fontes: Array<[string | null | undefined, string]> = [
      [cliente?.email, 'e-mail do cadastro'],
      [doDossie?.valor, 'e-mail da Receita'],
      ...contatos.map(c => [c.email, 'e-mail de contato'] as [string | null, string]),
    ]

    const vistos = new Set<string>()
    const dominios: string[] = []
    let origem = ''
    for (const [valor, rotulo] of fontes) {
      for (const d of this.extrairDominios(valor)) {
        if (vistos.has(d)) continue
        vistos.add(d)
        dominios.push(d)
        if (!origem) origem = rotulo
      }
    }
    return { dominios, origem: origem || 'nenhuma' }
  }

  /**
   * Palpites de domínio a partir do nome da empresa.
   *
   * "CARDPACK COMERCIO E SERVICO LTDA" vira `cardpack`, e daí saem
   * cardpack.com.br, cardpack.com e cardpack.ind.br. Não há adivinhação de
   * graça: cada palpite custa uma requisição, então só as duas primeiras
   * palavras entram e os sufixos param em três.
   *
   * As palavras de forma jurídica e de ramo ficam de fora — nenhuma empresa
   * registra `comercio.com.br` por causa do próprio nome.
   */
  private palpitesDeDominio(nomes: Array<string | null | undefined>): string[] {
    const RUIDO = new Set([
      'ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'cia', 'comercio', 'comercial',
      'servico', 'servicos', 'industria', 'industrial', 'e', 'de', 'da', 'do', 'das',
      'dos', 'do', 'em', 'brasil', 'grupo', 'empresa', 'distribuidora', 'representacoes',
    ])
    const raizes: string[] = []
    for (const nome of nomes) {
      const palavras = String(nome ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(w => w.length >= 3 && !RUIDO.has(w))
      if (palavras.length === 0) continue
      // A primeira palavra sozinha, e as duas primeiras coladas: "cardpack" e
      // "adriabrasil" nascem assim.
      raizes.push(palavras[0]!)
      if (palavras.length > 1) raizes.push(palavras[0]! + palavras[1]!)
    }

    const saida: string[] = []
    for (const raiz of Array.from(new Set(raizes)).slice(0, 2)) {
      for (const sufixo of ['.com.br', '.com', '.ind.br']) saida.push(raiz + sufixo)
    }
    return saida
  }

  /** Palpite só vale se o endereço existir de verdade. */
  private async dominioResponde(dominio: string): Promise<boolean> {
    for (const base of [`https://${dominio}`, `https://www.${dominio}`]) {
      const r = await this.buscarComGuarda(base, { redirect: 'follow' }).catch(() => null)
      if (r?.ok) return true
    }
    return false
  }

  /**
   * Um campo de e-mail do cadastro guarda coisas como
   * "fulano@empresa.com.br / contato@empresa.com.br" e até
   * "empresa.com.br/contato" — o domínio precisa sair limpo disso.
   */
  private extrairDominios(bruto: string | null | undefined): string[] {
    const texto = String(bruto ?? '')
    const achados = texto.match(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g) ?? []
    const dominios = achados
      .map(e => e.split('@')[1] ?? '')
      .map(d => d.toLowerCase().replace(/[^a-z0-9.-].*$/, '').replace(/\.$/, ''))
      .filter(d => d.includes('.') && !PROVEDORES_GRATUITOS.has(d))
    return Array.from(new Set(dominios))
  }

  // ── Busca ────────────────────────────────────────────────────

  async sugerirLogos(input: { clienteId?: string; dominio?: string }): Promise<{
    logos: LogoSugerida[]; dominio: string; origem: string; aviso?: string
  }> {
    const digitado = String(input.dominio ?? '').trim()
    let dominio = this.normalizarDominio(digitado)
    let origem = 'domínio digitado'

    // Nome da empresa a partir do cadastro — alimenta tanto os palpites de
    // domínio quanto a busca na web.
    const cliente = input.clienteId
      ? await prisma.cliente.findUnique({
          where: { id: input.clienteId },
          select: { razaoSocial: true, nomeFantasia: true },
        }).catch(() => null)
      : null

    // Digitou algo que NÃO é endereço — o nome da empresa, tipicamente. Isso
    // deixou de ser erro: vira termo de busca, e as duas primeiras palavras
    // viram palpite de domínio.
    const termoLivre = digitado && !dominio ? digitado : ''

    if (!dominio && input.clienteId) {
      const c = await this.dominiosCandidatos(input.clienteId)
      dominio = c.dominios[0] ?? ''
      origem = c.origem
    }

    // Sem domínio no cadastro, tenta adivinhar pelo nome. Cada palpite custa
    // uma requisição, então só entra aqui quando não há nada melhor.
    if (!dominio) {
      const palpites = this.palpitesDeDominio(
        termoLivre ? [termoLivre] : [cliente?.nomeFantasia, cliente?.razaoSocial],
      )
      for (const palpite of palpites) {
        if (await this.dominioResponde(palpite)) {
          dominio = palpite
          origem = 'palpite pelo nome'
          break
        }
      }
    }

    // Termo de busca da web: o que o usuário digitou, ou o nome do cadastro.
    const nomeParaBusca = termoLivre || cliente?.nomeFantasia || cliente?.razaoSocial || ''
    const temBuscador = buscadorConfigurado() !== null

    if (!dominio && !(temBuscador && nomeParaBusca)) {
      return {
        logos: [], dominio: '', origem,
        aviso: temBuscador
          ? 'Não há por onde procurar: sem site conhecido e sem nome para buscar. Envie o arquivo.'
          : 'Não achei o site da empresa. Digite o endereço dele, ou configure um buscador em '
            + 'Configurações → Dossiê e Imagens para procurar pelo nome na internet.',
      }
    }

    const candidatas = new Set<string>()
    const fonteWeb = new Map<string, string>()

    if (dominio) {
      // 1) O site da empresa é a melhor fonte: og:image e apple-touch-icon são
      //    imagens grandes, escolhidas por quem fez o site.
      for (const u of await this.doSite(dominio)) candidatas.add(u)
      // 2) Serviços de ícone, como rede: sempre respondem algo, mas pequeno.
      candidatas.add(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=256`)
      candidatas.add(`https://icons.duckduckgo.com/ip3/${encodeURIComponent(dominio)}.ico`)
    }

    // 3) A web aberta, quando há buscador configurado. Entra por último na
    //    montagem, mas concorre de igual para igual na ordenação — o resultado
    //    da busca costuma ser a marca em alta resolução, melhor que o favicon.
    if (temBuscador && nomeParaBusca) {
      const termo = `${nomeParaBusca} logomarca`
      const achadas: CandidataWeb[] = await buscarImagensWeb(termo)
      for (const c of achadas) {
        if (candidatas.has(c.url)) continue
        candidatas.add(c.url)
        fonteWeb.set(c.url, c.fonte)
      }
      if (achadas.length > 0 && !dominio) origem = 'busca na web'
    }

    const logos: LogoSugerida[] = []
    for (const url of candidatas) {
      const img = await this.medirImagem(url)
      if (!img) continue
      // Vetor escala sem perder nitidez: um SVG de 32×32 e 453 bytes — que é
      // exatamente a logo da Central Contábil — rende tão bem quanto um PNG
      // grande. Os pisos abaixo são de imagem de PIXEL e não valem para ele.
      if (!img.vetorial) {
        // Favicon de 16px vira um borrão no quadro do cabeçalho. Quando não dá
        // para medir (ICO), o tamanho do arquivo serve de peneira grosseira.
        const ladoOk = img.largura == null || Math.min(img.largura, img.altura ?? img.largura) >= LADO_MINIMO
        if (!ladoOk || img.bytes < 700) continue
      }
      logos.push(fonteWeb.has(url) ? { ...img, fonte: fonteWeb.get(url)! } : img)
    }

    // Vetor primeiro: é o melhor resultado possível e não tem largura
    // comparável com a de um raster.
    logos.sort((a, b) => Number(b.vetorial) - Number(a.vetorial)
      || (b.largura ?? 0) - (a.largura ?? 0)
      || b.bytes - a.bytes)
    const alvo = dominio || nomeParaBusca
    return {
      logos, dominio, origem,
      ...(logos.length === 0
        ? {
            aviso: `Nada aproveitável encontrado para ${alvo}.`
              + (temBuscador
                ? ' Tente outro endereço ou nome, ou envie o arquivo.'
                : ' Um buscador configurado em Configurações → Dossiê e Imagens ampliaria a procura para a web toda.'),
          }
        : {}),
    }
  }

  private normalizarDominio(bruto: string | null | undefined): string {
    const t = String(bruto ?? '').trim().toLowerCase()
    if (!t) return ''
    const semProtocolo = t.replace(/^https?:\/\//, '').replace(/^www\./, '')
    const soHost = semProtocolo.split('/')[0]?.split('?')[0] ?? ''
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(soHost) ? soHost : ''
  }

  /** Lê o HTML do site e colhe as imagens que ele mesmo declara como sua cara. */
  private async doSite(dominio: string): Promise<string[]> {
    for (const base of [`https://${dominio}`, `https://www.${dominio}`]) {
      try {
        const resp = await this.buscarComGuarda(base, { redirect: 'follow' })
        if (!resp?.ok) continue
        const tipo = resp.headers.get('content-type') || ''
        if (!tipo.includes('html')) continue
        const html = (await resp.text()).slice(0, 300_000)
        const urls: string[] = []

        const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
          ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        if (og?.[1]) urls.push(og[1])

        for (const m of html.matchAll(/<link[^>]+rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]*>/gi)) {
          const href = m[0].match(/href=["']([^"']+)["']/i)?.[1]
          if (href) urls.push(href)
        }

        // Imagem cujo endereço ou texto alternativo se identifica como logo.
        for (const m of html.matchAll(/<img[^>]+>/gi)) {
          const tag = m[0]
          if (!/logo/i.test(tag)) continue
          const src = tag.match(/src=["']([^"']+)["']/i)?.[1]
          if (src) urls.push(src)
          if (urls.length > 8) break
        }

        const absolutas = urls
          .map(u => this.absolutizar(u, base))
          .filter((u): u is string => !!u && u.startsWith('https://'))
        if (absolutas.length > 0) return Array.from(new Set(absolutas)).slice(0, 6)
      } catch { /* site fora do ar é resultado, não erro */ }
    }
    return []
  }

  private absolutizar(url: string, base: string): string | null {
    try { return new URL(url, base).toString() } catch { return null }
  }

  // ── Rede ─────────────────────────────────────────────────────

  /**
   * O endereço vem de dado do cliente e do HTML de terceiros, então o servidor
   * não pode buscá-lo às cegas: sem esta guarda, um domínio apontando para
   * 127.0.0.1 ou para a rede interna faria a API buscar a si mesma ou a um
   * serviço que só existe atrás do firewall (SSRF).
   */
  private async buscarComGuarda(url: string, init?: RequestInit): Promise<Response | null> {
    let alvo: URL
    try { alvo = new URL(url) } catch { return null }
    if (alvo.protocol !== 'https:') return null
    if (!(await this.hostEhPublico(alvo.hostname))) return null
    try {
      return await fetch(alvo.toString(), { ...init, signal: AbortSignal.timeout(10_000) })
    } catch { return null }
  }

  private async hostEhPublico(hostname: string): Promise<boolean> {
    try {
      const enderecos = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await dnsLookup(hostname, { all: true })
      if (enderecos.length === 0) return false
      return enderecos.every(e => this.ipEhPublico(e.address))
    } catch { return false }
  }

  private ipEhPublico(ip: string): boolean {
    if (ip.includes(':')) {
      const v6 = ip.toLowerCase()
      // ::1 (loopback), fc00::/7 (privado), fe80::/10 (link-local)
      return !(v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8')
        || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb'))
    }
    const p = ip.split('.').map(Number)
    if (p.length !== 4 || p.some(n => !Number.isInteger(n))) return false
    const [a, b] = p as [number, number, number, number]
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 169 && b === 254) return false // link-local / metadata da nuvem
    if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
    return true
  }

  // ── Medição ──────────────────────────────────────────────────

  private async medirImagem(url: string): Promise<LogoSugerida | null> {
    const resp = await this.buscarComGuarda(url, { redirect: 'follow' })
    if (!resp?.ok) return null
    const tipo = (resp.headers.get('content-type') || '').split(';')[0]?.trim() ?? ''
    if (!tipo.startsWith('image/')) return null
    // SVG é XML e pode carregar script; servido do nosso domínio, viraria
    // superfície de ataque. Logo em SVG fica para o envio manual, conferido.
    if (tipo.includes('svg')) return null

    const bytes = Buffer.from(await resp.arrayBuffer())
    if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO) return null
    if (this.ehSvg(tipo) && !this.svgSeguro(bytes)) return null

    const dim = this.dimensoes(bytes)
    return {
      url,
      fonte: this.rotuloDaFonte(url),
      largura: dim?.largura ?? null,
      altura: dim?.altura ?? null,
      bytes: bytes.length,
      tipo,
      vetorial: this.ehSvg(tipo),
    }
  }

  private ehSvg(tipo: string): boolean {
    return tipo.includes('svg')
  }

  /**
   * SVG é XML, e XML pode carregar script. Servido do nosso domínio, um SVG
   * malicioso rodaria com a sessão do usuário — por isso ele passa por esta
   * peneira antes de ser aceito.
   *
   * É a segunda linha de defesa: a rota que entrega os arquivos já responde
   * SVG com CSP que proíbe script. Aqui recusamos de saída o que for suspeito,
   * em vez de tentar limpar — arquivo de logo não tem por que ter nada disso.
   */
  private svgSeguro(bytes: Buffer): boolean {
    const texto = bytes.toString('utf8', 0, Math.min(bytes.length, 200_000)).toLowerCase()
    const suspeitos = [
      '<script', '</script', 'javascript:', '<foreignobject', '<iframe', '<embed',
      '<use', 'xlink:href="http', 'href="http', 'data:text/html', '<set', '<animate',
    ]
    if (suspeitos.some(p2 => texto.includes(p2))) return false
    // Manipulador de evento inline: onload=, onclick=, onerror=...
    if (/\son[a-z]+\s*=/.test(texto)) return false
    return true
  }

  private rotuloDaFonte(url: string): string {
    if (url.includes('google.com/s2/favicons')) return 'ícone (Google)'
    if (url.includes('icons.duckduckgo.com')) return 'ícone (DuckDuckGo)'
    return 'site da empresa'
  }

  /**
   * Largura e altura lidas do cabeçalho do arquivo, sem biblioteca de imagem.
   * É o que separa a logomarca de verdade de um favicon de 16px — e não vale a
   * pena arrastar uma dependência nova só para isso.
   */
  private dimensoes(b: Buffer): { largura: number; altura: number } | null {
    // PNG: assinatura + IHDR com largura/altura em big-endian
    if (b.length > 24 && b.toString('hex', 0, 8) === '89504e470d0a1a0a') {
      return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20) }
    }
    // GIF: little-endian logo após "GIF8"
    if (b.length > 10 && b.toString('ascii', 0, 4) === 'GIF8') {
      return { largura: b.readUInt16LE(6), altura: b.readUInt16LE(8) }
    }
    // ICO: primeira imagem do diretório; 0 significa 256
    if (b.length > 8 && b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1) {
      const l = b.readUInt8(6) || 256
      const a = b.readUInt8(7) || 256
      return { largura: l, altura: a }
    }
    // JPEG: percorre os marcadores até o SOF, que carrega as medidas
    if (b.length > 4 && b.readUInt16BE(0) === 0xffd8) {
      let i = 2
      while (i + 9 < b.length) {
        if (b.readUInt8(i) !== 0xff) { i++; continue }
        const marcador = b.readUInt8(i + 1)
        const tamanho = b.readUInt16BE(i + 2)
        // SOF0..SOF15, exceto os marcadores que não descrevem quadro
        if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
          return { largura: b.readUInt16BE(i + 7), altura: b.readUInt16BE(i + 5) }
        }
        i += 2 + tamanho
      }
    }
    // WebP e afins: sem leitor aqui; o tamanho do arquivo faz a peneira.
    return null
  }

  // ── Aplicação ────────────────────────────────────────────────

  /** Baixa a imagem escolhida para o nosso `uploads/` e grava em `logoUrl`. */
  async aplicarLogoSugerida(clienteId: string, url: string) {
    const resp = await this.buscarComGuarda(url, { redirect: 'follow' })
    if (!resp?.ok) throw new Error('Não foi possível baixar a imagem escolhida.')
    const tipo = (resp.headers.get('content-type') || '').split(';')[0]?.trim() ?? ''
    if (!tipo.startsWith('image/')) throw new Error('O endereço não devolveu uma imagem.')

    const bytes = Buffer.from(await resp.arrayBuffer())
    if (bytes.length === 0 || bytes.length > TAMANHO_MAXIMO) throw new Error('Imagem vazia ou grande demais.')
    if (this.ehSvg(tipo) && !this.svgSeguro(bytes)) {
      throw new Error('Este SVG traz script ou referência externa e não pode ser usado como logomarca.')
    }

    const ext = this.ehSvg(tipo) ? '.svg'
      : tipo.includes('png') ? '.png'
      : tipo.includes('webp') ? '.webp'
      : tipo.includes('gif') ? '.gif'
      : tipo.includes('icon') || tipo.includes('ico') ? '.ico'
      : '.jpg'
    const nome = `${randomUUID()}${ext}`
    await mkdir(UPLOADS_DIR, { recursive: true })
    await writeFile(join(UPLOADS_DIR, nome), bytes)

    const urlLocal = `/api/upload/${nome}`
    await prisma.cliente.update({ where: { id: clienteId }, data: { logoUrl: urlLocal } })
    return { ok: true, logoUrl: urlLocal }
  }
}
