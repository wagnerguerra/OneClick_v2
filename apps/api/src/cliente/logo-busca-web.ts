/**
 * Busca de logomarca fora do site da empresa — para quem não tem site
 * conhecido, ou cujo site esconde a marca atrás de um og:image de campanha.
 *
 * As duas fontes daqui são GRATUITAS e OPCIONAIS. Sem nenhuma configurada, as
 * funções devolvem lista vazia e a sugestão segue só com o site e os serviços
 * de ícone, como sempre foi: nenhuma tela quebra por falta de chave.
 *
 * Por que não Google nem Brave (conferido em 28/08/2026):
 *
 *  - Google Programmable Search: fechado para novos clientes desde 2025 e com
 *    desligamento marcado para 01/01/2027. Não dá nem para assinar.
 *  - Brave Search API: o plano gratuito acabou em fevereiro/2026. Virou US$ 5
 *    por mil buscas, com cartão cadastrado.
 *
 * O que sobrou, e que resolve o mesmo problema sem custo:
 *
 *  1. Logo.dev (`LOGODEV_TOKEN`) — sucessora da Clearbit. 10 mil requisições
 *     por mês no plano gratuito, exigindo atribuição. Busca logo por DOMÍNIO e
 *     por NOME da empresa, que é exatamente o que faltava.
 *  2. SearXNG (`SEARXNG_URL`) — metabuscador de código aberto. Sem chave, sem
 *     cota e sem custo, porque roda num contêiner nosso; devolve imagens de
 *     vários buscadores de uma vez. Exige subir o serviço na VPS.
 *
 * O que sai daqui são URLs CANDIDATAS, não logos. Quem valida é o
 * `medirImagem` do serviço de logo, que mede, checa tipo e aplica a guarda de
 * SSRF — este arquivo não baixa imagem nenhuma, só pergunta onde procurar.
 */

export type CandidataWeb = { url: string; fonte: string }

const TEMPO_LIMITE_MS = 8000

/** Fontes ligadas agora — a tela usa para explicar o que dá para fazer. */
export function fontesConfiguradas(): Array<'logodev' | 'searxng'> {
  const fontes: Array<'logodev' | 'searxng'> = []
  if (process.env.LOGODEV_TOKEN) fontes.push('logodev')
  if (process.env.SEARXNG_URL) fontes.push('searxng')
  return fontes
}

export function temBuscaWeb(): boolean {
  return fontesConfiguradas().length > 0
}

/**
 * Candidatas do Logo.dev: por domínio e por nome.
 *
 * `fallback=404` é essencial. Sem ele, o serviço devolve 200 com um monograma
 * preto-e-branco da primeira letra quando não conhece a marca — e um monograma
 * gerado entraria na lista se passando por logomarca.
 */
export function logodevCandidatas(dominio: string, nome: string): CandidataWeb[] {
  const token = process.env.LOGODEV_TOKEN
  if (!token) return []

  const comuns = `token=${encodeURIComponent(token)}&size=512&format=png&fallback=404`
  const saida: CandidataWeb[] = []

  if (dominio) {
    saida.push({
      url: `https://img.logo.dev/${encodeURIComponent(dominio)}?${comuns}`,
      fonte: 'Logo.dev (domínio)',
    })
  }

  // A busca por nome quer a marca, não a razão social inteira: "CARDPACK
  // COMERCIO E SERVICO LTDA" não é o nome de marca de ninguém.
  const marca = nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3 && !/^(ltda|me|epp|eireli|sa|cia|comercio|comercial|servico|servicos|industria|industrial|distribuidora)$/.test(w))
    .slice(0, 2)
    .join(' ')
    .trim()

  if (marca) {
    saida.push({
      url: `https://img.logo.dev/name/${encodeURIComponent(marca)}?${comuns}`,
      fonte: 'Logo.dev (nome)',
    })
  }

  return saida
}

/**
 * Imagens de um SearXNG nosso. Erro de rede, serviço fora do ar ou resposta
 * estranha não sobem: a busca por logo é um extra, e derrubar o modal inteiro
 * porque o contêiner caiu seria trocar um resultado a menos por uma tela
 * quebrada.
 */
async function searxng(
  termo: string,
  categorias: 'images' | 'general',
  limite: number,
): Promise<CandidataWeb[]> {
  const base = (process.env.SEARXNG_URL ?? '').trim().replace(/\/+$/, '')
  const alvo = termo.trim()
  if (!base || !alvo) return []

  const params = new URLSearchParams({
    q: alvo,
    categories: categorias,
    format: 'json',
    safesearch: '1',
  })

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS)
  try {
    const res = await fetch(`${base}/search?${params}`, { signal: ctrl.signal })
    if (!res.ok) return []
    const dados = await res.json() as {
      results?: Array<{ img_src?: string; url?: string; engine?: string }>
    }
    return (dados.results ?? [])
      .map(r => ({
        // Em `images` o que interessa é o arquivo; em `general`, a página.
        url: String((categorias === 'images' ? r.img_src : r.url) ?? ''),
        fonte: `busca web (${r.engine || 'SearXNG'})`,
      }))
      .filter(c => /^https?:\/\//i.test(c.url))
      .slice(0, limite)
  } catch {
    return []
  } finally {
    clearTimeout(t)
  }
}

export function searxngImagens(termo: string, limite = 8): Promise<CandidataWeb[]> {
  return searxng(termo, 'images', limite)
}

/** Busca de páginas — é o que serve para achar perfil de rede social. */
export function searxngPaginas(termo: string, limite = 20): Promise<CandidataWeb[]> {
  return searxng(termo, 'general', limite)
}

/** Tudo que as fontes configuradas têm a oferecer, sem repetir URL. */
export async function candidatasDaWeb(dominio: string, nome: string): Promise<CandidataWeb[]> {
  const saida: CandidataWeb[] = []
  const vistas = new Set<string>()

  const juntar = (lista: CandidataWeb[]) => {
    for (const c of lista) {
      if (vistas.has(c.url)) continue
      vistas.add(c.url)
      saida.push(c)
    }
  }

  juntar(logodevCandidatas(dominio, nome))
  if (nome) juntar(await searxngImagens(`${nome} logomarca`))

  return saida
}
