import * as SecureStore from 'expo-secure-store'

// Tenant ativo (multi-tenant por header x-tenant-id — a API também aceita
// resolver pela sessão). Cache em memória pro headers() do tRPC ser síncrono;
// persistido em SecureStore entre execuções.
const KEY = 'oneclick.tenantId'
let current: string | null = null

export function getTenantId(): string | null {
  return current
}

export async function loadTenantId(): Promise<string | null> {
  try {
    current = await SecureStore.getItemAsync(KEY)
  } catch {
    current = null
  }
  return current
}

export async function setTenantId(id: string | null): Promise<void> {
  current = id
  try {
    if (id) await SecureStore.setItemAsync(KEY, id)
    else await SecureStore.deleteItemAsync(KEY)
  } catch {
    /* ignora — segue com o cache em memória */
  }
}
