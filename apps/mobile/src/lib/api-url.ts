// Resolve a URL base da API.
//   - Produção: EXPO_PUBLIC_API_URL (injetada no build EAS).
//   - Dev: IP de LAN da máquina que roda a API — o device físico/emulador NÃO
//     enxerga localhost. Ajuste DEV_LAN_URL pro IP da sua máquina se mudar.
// tRPC fica em `${getApiUrl()}/trpc` e o Better Auth em `${getApiUrl()}/api/auth`.
const PROD_URL = 'https://app.oneclick.central-rnc.com.br'
const DEV_LAN_URL = 'http://192.168.0.58:4000'

export function getApiUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL
  if (env) return env
  return __DEV__ ? DEV_LAN_URL : PROD_URL
}

// Hosts de desenvolvimento (localhost / loopback / faixas de IP privado de LAN).
const DEV_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?/i

/**
 * Resolve a URL de um asset servido pela API (avatar, logo da empresa, anexo).
 *   - Relativa (`/api/upload/x`) → prefixa a base atual da API.
 *   - Absoluta com host de DEV (localhost / IP de LAN privado) → reescreve o host
 *     pra base atual. Fotos antigas foram salvas com host absoluto de dev
 *     (ex.: `http://localhost:4000/api/upload/...`) e não abrem no device/produção.
 *   - Absoluta de outro host (CDN, produção) → mantém como está.
 */
export function resolveAssetUrl(url?: string | null): string | null {
  if (!url) return null
  const base = getApiUrl()
  if (DEV_HOST.test(url)) return url.replace(DEV_HOST, base)
  if (/^https?:\/\//i.test(url)) return url
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`
}
