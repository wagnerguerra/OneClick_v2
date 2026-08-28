/**
 * Descoberta de perfis em redes sociais.
 *
 * Duas situações diferentes, e a diferença importa:
 *
 *  - A EMPRESA publica os próprios perfis no rodapé do site. Achar ali é
 *    determinístico: o link está lá, escrito por quem fez o site. Não há
 *    palpite nenhum, e por isso entra sozinho no dossiê.
 *
 *  - A PESSOA não. Procurar "João Silva" devolve milhares de perfis, e o
 *    homônimo é a regra. Por isso o que a busca acha nasce como SUGESTÃO: quem
 *    vai à reunião confere e confirma. Um perfil errado é pior que nenhum —
 *    alguém entraria na sala com a ideia errada sobre a pessoa à sua frente.
 *
 * Só o ENDEREÇO do perfil sai daqui. Nada do que a pessoa publica é lido,
 * copiado ou guardado: o perfil é aberto na hora, na rede, por quem precisa.
 */

const REDES: Array<{ rede: string; padrao: RegExp }> = [
  { rede: 'INSTAGRAM', padrao: /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]{2,30})/i },
  { rede: 'FACEBOOK', padrao: /https?:\/\/(?:www\.|pt-br\.)?facebook\.com\/([A-Za-z0-9.\-]{3,50})/i },
  { rede: 'LINKEDIN', padrao: /https?:\/\/(?:[a-z]{2}\.)?linkedin\.com\/(?:company|in)\/([A-Za-z0-9\-_%]{2,60})/i },
  { rede: 'YOUTUBE', padrao: /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)([A-Za-z0-9._\-]{2,60})/i },
  { rede: 'X', padrao: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{2,15})/i },
  { rede: 'TIKTOK', padrao: /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._]{2,30})/i },
]

/**
 * Caminhos que a rede usa para si mesma. `instagram.com/explore` não é o perfil
 * de ninguém, e `facebook.com/sharer` é o botão de compartilhar que quase todo
 * site tem — sem esta lista, todo cliente ganharia um "perfil" chamado sharer.
 */
const RESERVADOS = new Set([
  'explore', 'accounts', 'about', 'legal', 'privacy', 'terms', 'help', 'login',
  'sharer', 'share', 'dialog', 'plugins', 'tr', 'home', 'search', 'hashtag',
  'intent', 'watch', 'results', 'feed', 'profile.php', 'people', 'pages',
])

export type PerfilAchado = { rede: string; url: string; identificador: string }

/** Extrai perfis de um HTML — tanto de `href` quanto de texto solto. */
export function extrairPerfis(html: string): PerfilAchado[] {
  const achados = new Map<string, PerfilAchado>()

  for (const { rede, padrao } of REDES) {
    // O `g` precisa ser criado aqui: RegExp global guarda `lastIndex`, e
    // reaproveitar a mesma instância entre chamadas pula resultados.
    const global = new RegExp(padrao.source, 'gi')
    for (const m of html.matchAll(global)) {
      const identificador = (m[1] ?? '').replace(/[/?#].*$/, '').toLowerCase()
      if (!identificador || RESERVADOS.has(identificador)) continue
      const url = m[0].replace(/[)"'<>].*$/, '')
      const chave = `${rede}:${identificador}`
      if (!achados.has(chave)) achados.set(chave, { rede, url, identificador })
    }
  }

  return [...achados.values()]
}

/**
 * Perfis da empresa, lidos do próprio site.
 *
 * Busca a home e, se ela não trouxer nada, o `/contato` — em site institucional
 * os ícones de rede às vezes só aparecem na página de contato.
 */
export async function perfisDoSite(
  dominio: string,
  buscar: (url: string) => Promise<Response | null>,
): Promise<PerfilAchado[]> {
  const paginas = [
    `https://${dominio}`,
    `https://www.${dominio}`,
    `https://${dominio}/contato`,
  ]

  for (const pagina of paginas) {
    const resp = await buscar(pagina).catch(() => null)
    if (!resp?.ok) continue
    const html = await resp.text().catch(() => '')
    const perfis = extrairPerfis(html)
    if (perfis.length > 0) return perfis
  }

  return []
}
