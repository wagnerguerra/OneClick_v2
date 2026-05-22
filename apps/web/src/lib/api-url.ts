/**
 * Resolve a URL da API.
 *
 * Em produção (Nginx faz proxy /api e /trpc na mesma origem), a env var
 * NEXT_PUBLIC_API_URL é setada em build-time pelo Dockerfile/CI com a URL
 * pública (ex: https://app.oneclick.central-rnc.com.br) — sem porta extra.
 *
 * Em dev (sem env var), resolve dinamicamente baseado no host do browser
 * adicionando :4000 — assim o user acessar via IP de LAN (ex: 192.168.0.58:3000)
 * automaticamente bate na API em 192.168.0.58:4000.
 */
export function getApiUrl(): string {
  // Env var setada (build de produção) tem prioridade — funciona client e server
  const envUrl = process.env.NEXT_PUBLIC_API_URL
  if (envUrl) return envUrl

  // SSR sem env var: fallback
  if (typeof window === 'undefined') {
    return 'http://localhost:4000'
  }

  // Dev local: host atual + porta 4000
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:4000`
}

/**
 * Resolve a URL completa de um asset salvo no /api/upload — tipicamente logos,
 * marcas d'água, avatares e anexos. Trata 3 cenários:
 *
 *   1. URL vazia/null         → retorna string vazia (img não renderiza)
 *   2. URL relativa           → prefixa com getApiUrl() (ex: '/api/upload/x.png' → 'http://host:4000/api/upload/x.png')
 *   3. URL absoluta legada    → troca hostname/porta pelo host atual da API (corrige uploads antigos
 *                               que ficaram congelados com 'http://localhost:4000' no banco)
 *   4. URL absoluta externa   → retorna como está (S3, CDN, gravatar, etc)
 *
 * Use em todo <img src={...}> que aponta pra upload do sistema.
 */
export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed) return ''

  // Caso 2: URL relativa — prefixa com a API atual
  if (trimmed.startsWith('/')) {
    return `${getApiUrl()}${trimmed}`
  }

  // Caso 3: tenta detectar URL absoluta apontando pra upload do próprio sistema
  // e remenda o host (cobre dados antigos com 'http://localhost:4000/api/upload/...')
  const uploadMatch = trimmed.match(/^https?:\/\/[^/]+(\/api\/upload\/.+)$/i)
  if (uploadMatch) {
    return `${getApiUrl()}${uploadMatch[1]}`
  }

  // Caso 4: externa (S3, CDN, etc) — passa direto
  return trimmed
}
