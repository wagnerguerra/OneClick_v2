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
