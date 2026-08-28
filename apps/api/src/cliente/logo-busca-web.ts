/**
 * Busca de imagem na web aberta, para achar logomarca de quem não tem site
 * conhecido — ou cujo site esconde a marca atrás de um og:image de campanha.
 *
 * O buscador é PLUGÁVEL e OPCIONAL. Sem chave configurada, a função devolve
 * lista vazia e a sugestão de logos segue só com o site e os serviços de ícone,
 * como sempre foi: nenhuma tela quebra por falta de chave.
 *
 * Dois adaptadores, escolhidos pela chave que estiver preenchida em
 * Configurações → Dossiê e Imagens:
 *
 *  - Google Programmable Search (`GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX`) — 100
 *    buscas por dia no plano gratuito. Exige criar um mecanismo de pesquisa e
 *    ligar "Pesquisar em toda a web" + "Pesquisa de imagens".
 *  - Brave Search (`BRAVE_SEARCH_KEY`) — 2.000 buscas por mês no plano
 *    gratuito, sem mecanismo para configurar.
 *
 * O que volta daqui são URLs CANDIDATAS, não logos. Quem valida é o
 * `medirImagem` do serviço de logo, que já mede, checa tipo e aplica a guarda
 * de SSRF — este arquivo não busca imagem nenhuma, só pergunta ao buscador.
 */

export type CandidataWeb = { url: string; fonte: string }

const TEMPO_LIMITE_MS = 8000

/** Qual buscador está configurado — serve para a tela explicar o que fez. */
export function buscadorConfigurado(): 'google' | 'brave' | null {
  if (process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX) return 'google'
  if (process.env.BRAVE_SEARCH_KEY) return 'brave'
  return null
}

/**
 * Procura imagens para um termo já pronto (ex.: `CARDPACK COMERCIO logomarca`).
 *
 * Erro de rede, cota estourada ou resposta estranha não sobem: a busca por
 * logo é um extra, e derrubar o modal inteiro porque a cota do dia acabou
 * seria trocar um resultado a menos por uma tela quebrada.
 */
export async function buscarImagensWeb(termo: string, limite = 8): Promise<CandidataWeb[]> {
  const alvo = termo.trim()
  if (!alvo) return []

  try {
    switch (buscadorConfigurado()) {
      case 'google': return await viaGoogle(alvo, limite)
      case 'brave': return await viaBrave(alvo, limite)
      default: return []
    }
  } catch {
    return []
  }
}

async function pegar(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

async function viaGoogle(termo: string, limite: number): Promise<CandidataWeb[]> {
  const params = new URLSearchParams({
    key: process.env.GOOGLE_CSE_KEY ?? '',
    cx: process.env.GOOGLE_CSE_CX ?? '',
    q: termo,
    searchType: 'image',
    // `num` do Google vai até 10; pedir mais devolve erro 400, não mais itens.
    num: String(Math.min(limite, 10)),
    safe: 'active',
  })
  const dados = await pegar(`https://www.googleapis.com/customsearch/v1?${params}`) as
    { items?: Array<{ link?: string; displayLink?: string }> } | null

  return (dados?.items ?? [])
    .map(i => ({ url: String(i.link ?? ''), fonte: `busca web (${i.displayLink || 'Google'})` }))
    .filter(c => /^https?:\/\//i.test(c.url))
    .slice(0, limite)
}

async function viaBrave(termo: string, limite: number): Promise<CandidataWeb[]> {
  const params = new URLSearchParams({
    q: termo,
    count: String(Math.min(limite, 20)),
    safesearch: 'strict',
  })
  const dados = await pegar(`https://api.search.brave.com/res/v1/images/search?${params}`, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': process.env.BRAVE_SEARCH_KEY ?? '',
    },
  }) as { results?: Array<{ properties?: { url?: string }; source?: string }> } | null

  return (dados?.results ?? [])
    .map(r => ({ url: String(r.properties?.url ?? ''), fonte: `busca web (${r.source || 'Brave'})` }))
    .filter(c => /^https?:\/\//i.test(c.url))
    .slice(0, limite)
}
