// Preferência de notificações push do usuário, persistida no SecureStore.
//
// Default = habilitado (true) quando nunca foi definida — mantém o
// comportamento histórico (o app registrava push automaticamente no boot).
// Só desliga quando o usuário explicitamente desativa no Perfil.
import * as SecureStore from 'expo-secure-store'

const KEY = 'oneclick_push_enabled'

/** Lê a preferência de push. `true` por padrão (null = nunca definida). */
export async function getPushEnabled(): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(KEY)
    // Só o valor explícito '0' desliga; null/'1' mantêm habilitado.
    return v !== '0'
  } catch {
    return true
  }
}

/** Grava a preferência de push (best-effort — falha silenciosa). */
export async function setPushEnabled(enabled: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, enabled ? '1' : '0')
  } catch {
    // Persistência é best-effort; não quebra a UI se o SecureStore falhar.
  }
}
