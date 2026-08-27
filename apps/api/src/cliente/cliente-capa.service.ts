import { Injectable, Inject, Optional } from '@nestjs/common'
import { prisma } from '@saas/db'
import { randomUUID } from 'crypto'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { ClienteEnriquecimentoService } from './cliente-enriquecimento.service'

/**
 * Capa do cabeçalho de UM cliente.
 *
 * Até aqui a capa era uma configuração do módulo: trocar a imagem trocava para
 * todo mundo. Agora cada cliente tem a sua (`Cliente.coverImage`), e a capa
 * global continua valendo como padrão de quem não personalizou — ninguém perde
 * a imagem que já via.
 *
 * Além do envio manual, sugere fotos por atividade. A busca é feita no Pexels
 * (licença de uso comercial, sem exigência de crédito) e a foto escolhida é
 * BAIXADA para o nosso `uploads/`: capa que depende de link de terceiro morre
 * junto com o link, e some da tela do cliente sem aviso.
 */

const UPLOADS_DIR = join(process.cwd(), 'uploads')

/** Só paisagem, e larga o bastante para uma faixa de cabeçalho em tela cheia. */
const LARGURA_MINIMA = 1280
const PROPORCAO_MINIMA = 1.4 // ~7:5; abaixo disso a foto é cortada demais na faixa

type FotoSugerida = {
  id: string
  /** Miniatura para a grade de escolha. */
  thumb: string
  /** Versão que será baixada ao aplicar. */
  full: string
  largura: number
  altura: number
  autor: string
  autorUrl: string
  descricao: string
}

@Injectable()
export class ClienteCapaService {
  constructor(
    @Optional() @Inject(ClienteEnriquecimentoService)
    private readonly enriquecimento?: ClienteEnriquecimentoService,
  ) {}

  // ── Capa do cliente ──────────────────────────────────────────

  async getCapa(clienteId: string) {
    const rows = await prisma.$queryRawUnsafe<Array<{ cover_image: string | null }>>(
      `SELECT cover_image FROM clientes WHERE id = $1 LIMIT 1`, clienteId,
    ).catch(() => [])
    return { coverImage: rows[0]?.cover_image || null }
  }

  /** `url` nulo/vazio limpa a capa do cliente e ele volta a usar a global. */
  async setCapa(clienteId: string, url: string | null) {
    await prisma.$executeRawUnsafe(
      `UPDATE clientes SET cover_image = $1 WHERE id = $2`, url || null, clienteId,
    )
    return { ok: true, coverImage: url || null }
  }

  // ── Sugestões por atividade ──────────────────────────────────

  /**
   * O termo de busca, na ordem do que melhor descreve o negócio:
   * atividade (CNAE) → grupo → nome fantasia → razão social.
   *
   * Hoje quase nenhum cliente tem CNAE gravado, então a maioria cai no nome —
   * que costuma render pouco. Por isso a tela também aceita um termo digitado,
   * e oferece o enriquecimento pela Receita para melhorar a sugestão.
   */
  async termoSugerido(clienteId: string): Promise<{ termo: string; origem: string; temCnae: boolean }> {
    const rows = await prisma.$queryRawUnsafe<Array<{
      cnae_principal: string | null; grupo: string | null
      nome_fantasia: string | null; razao_social: string | null
    }>>(
      `SELECT cnae_principal, grupo, nome_fantasia, razao_social FROM clientes WHERE id = $1 LIMIT 1`,
      clienteId,
    ).catch(() => [])
    const c = rows[0]
    if (!c) return { termo: '', origem: 'nenhuma', temCnae: false }

    const cnae = (c.cnae_principal || '').trim()
    if (cnae) {
      const descricao = await this.descricaoDoCnae(clienteId, cnae)
      if (descricao) return { termo: descricao, origem: 'atividade (CNAE)', temCnae: true }
    }
    const grupo = (c.grupo || '').trim()
    if (grupo) return { termo: grupo, origem: 'grupo do cliente', temCnae: !!cnae }
    const nome = (c.nome_fantasia || c.razao_social || '').trim()
    return { termo: this.limparNomeEmpresarial(nome), origem: 'nome do cliente', temCnae: !!cnae }
  }

  /**
   * Descrição do CNAE gravado. Guardamos só o código; a descrição vem da tabela
   * de CNAEs quando existe, e do próprio código quando não existe.
   */
  private async descricaoDoCnae(clienteId: string, codigo: string): Promise<string> {
    // Preferência para a linha do próprio cliente; se ele não tiver a descrição
    // gravada, qualquer outro cliente com o mesmo código serve — a descrição do
    // CNAE é a mesma para todo mundo.
    const rows = await prisma.$queryRawUnsafe<Array<{ descricao: string }>>(
      `SELECT descricao FROM cliente_cnaes
        WHERE codigo = $1 AND btrim(coalesce(descricao,'')) <> ''
        ORDER BY (cliente_id = $2) DESC, principal DESC
        LIMIT 1`,
      codigo, clienteId,
    ).catch(() => [])
    return (rows[0]?.descricao || '').trim()
  }

  /**
   * "COMERCIAL FAVORITA DO BRASIL MARMORES E GRANITOS LTDA" vira
   * "MARMORES E GRANITOS": tipo societário e palavra de razão social não
   * descrevem atividade nenhuma e só sujam a busca por imagem.
   */
  private limparNomeEmpresarial(nome: string): string {
    const ruido = new Set([
      'ltda', 'me', 'epp', 'eireli', 'sa', 's/a', 's.a', 'mei', 'cia', 'e', 'de', 'da', 'do', 'das', 'dos',
      'comercial', 'comercio', 'comércio', 'industria', 'indústria', 'servicos', 'serviços', 'empreendimentos',
      'participacoes', 'participações', 'negocios', 'negócios', 'brasil', 'grupo',
    ])
    const palavras = nome
      .replace(/[.,/\\-]/g, ' ')
      .split(/\s+/)
      .filter(p => p.length > 1 && !ruido.has(p.toLowerCase()))
    return palavras.slice(0, 4).join(' ')
  }

  /**
   * Busca fotos no Pexels. Só paisagem e só acima do mínimo de largura e
   * proporção — a capa é uma faixa larga e baixa, e uma foto em pé ou pequena
   * chega esticada ou borrada nela.
   */
  async sugerirCapas(input: { clienteId?: string; termo?: string; page?: number }): Promise<{
    fotos: FotoSugerida[]; termo: string; origem: string; temCnae: boolean; aviso?: string
  }> {
    const chave = process.env.PEXELS_API_KEY?.trim()

    let termo = input.termo?.trim() || ''
    let origem = 'termo digitado'
    let temCnae = false
    if (!termo && input.clienteId) {
      const sugerido = await this.termoSugerido(input.clienteId)
      termo = sugerido.termo
      origem = sugerido.origem
      temCnae = sugerido.temCnae
    } else if (input.clienteId) {
      temCnae = (await this.termoSugerido(input.clienteId)).temCnae
    }

    if (!chave) {
      return {
        fotos: [], termo, origem, temCnae,
        aviso: 'Sugestões indisponíveis: a chave do Pexels (PEXELS_API_KEY) não está configurada no servidor.',
      }
    }
    if (!termo) {
      return { fotos: [], termo, origem, temCnae, aviso: 'Digite o que procurar — o cliente não tem atividade nem nome que sirva de busca.' }
    }

    const params = new URLSearchParams({
      query: termo,
      orientation: 'landscape',
      size: 'large',
      locale: 'pt-BR',
      per_page: '24',
      page: String(Math.max(1, input.page ?? 1)),
    })

    try {
      const resp = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
        headers: { Authorization: chave },
        signal: AbortSignal.timeout(12_000),
      })
      if (!resp.ok) {
        return {
          fotos: [], termo, origem, temCnae,
          aviso: resp.status === 401
            ? 'A chave do Pexels foi recusada — confira PEXELS_API_KEY.'
            : `O banco de imagens respondeu ${resp.status}. Tente de novo em instantes.`,
        }
      }
      const dados = await resp.json() as {
        photos?: Array<{
          id: number; width: number; height: number; alt?: string
          photographer?: string; photographer_url?: string
          src?: { medium?: string; large?: string; large2x?: string; landscape?: string }
        }>
      }
      const fotos: FotoSugerida[] = (dados.photos ?? [])
        .filter(f => f.width >= LARGURA_MINIMA && f.height > 0 && f.width / f.height >= PROPORCAO_MINIMA)
        .map(f => ({
          id: String(f.id),
          thumb: f.src?.medium || f.src?.landscape || '',
          // `large2x` (~1880px) é o que melhor cobre a faixa em tela cheia sem
          // baixar o original, que às vezes passa de 10MB.
          full: f.src?.large2x || f.src?.large || f.src?.landscape || '',
          largura: f.width,
          altura: f.height,
          autor: f.photographer || '',
          autorUrl: f.photographer_url || '',
          descricao: f.alt || '',
        }))
        .filter(f => !!f.full)

      return { fotos, termo, origem, temCnae }
    } catch (e) {
      return { fotos: [], termo, origem, temCnae, aviso: `Falha ao consultar o banco de imagens: ${(e as Error).message}` }
    }
  }

  /**
   * Baixa a foto escolhida para o nosso `uploads/` e grava como capa do
   * cliente. Aceita apenas URL do Pexels: este método busca uma URL vinda de
   * fora e a grava no servidor, então o destino não pode ser escolhido por
   * quem chama.
   */
  async aplicarCapaSugerida(clienteId: string, url: string) {
    let alvo: URL
    try { alvo = new URL(url) } catch { throw new Error('Endereço de imagem inválido.') }
    if (alvo.protocol !== 'https:' || !/(^|\.)pexels\.com$/.test(alvo.hostname)) {
      throw new Error('Só é possível aplicar imagens vindas do banco de imagens.')
    }

    const resp = await fetch(alvo.toString(), { signal: AbortSignal.timeout(20_000) })
    if (!resp.ok) throw new Error(`Não foi possível baixar a imagem (${resp.status}).`)
    const tipo = resp.headers.get('content-type') || ''
    if (!tipo.startsWith('image/')) throw new Error('O endereço não devolveu uma imagem.')

    const bytes = Buffer.from(await resp.arrayBuffer())
    if (bytes.length > 15 * 1024 * 1024) throw new Error('Imagem grande demais (acima de 15MB).')

    const ext = tipo.includes('png') ? '.png' : tipo.includes('webp') ? '.webp' : '.jpg'
    const nome = `${randomUUID()}${ext}`
    await mkdir(UPLOADS_DIR, { recursive: true })
    await writeFile(join(UPLOADS_DIR, nome), bytes)

    const urlLocal = `/api/upload/${nome}`
    await this.setCapa(clienteId, urlLocal)
    return { ok: true, coverImage: urlLocal }
  }

  /**
   * Atalho da tela: busca a atividade na Receita e já devolve o termo novo.
   * Sem isso o usuário sai da capa, vai à aba fiscal, volta — e a sugestão
   * continua caindo no nome do cliente.
   */
  async enriquecerEDevolverTermo(clienteId: string) {
    if (!this.enriquecimento) throw new Error('Serviço de enriquecimento indisponível.')
    const r = await this.enriquecimento.enriquecerCnae(clienteId)
    const sugerido = await this.termoSugerido(clienteId)
    return { ...sugerido, enriquecimento: r }
  }
}
