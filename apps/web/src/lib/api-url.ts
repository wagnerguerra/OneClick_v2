/**
 * Resolve a URL da API dinamicamente baseado no host atual do browser.
 * Se o usuário acessa via IP (ex: 192.168.0.58:3000), a API também será
 * chamada via IP (192.168.0.58:4000), garantindo que cookies e CORS funcionem.
 */
export function getApiUrl(): string {
  // Server-side (SSR/build): usar env
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
  }

  // Client-side: resolver baseado no host do browser
  const { protocol, hostname } = window.location
  return `${protocol}//${hostname}:4000`
}
