// Preferência de TEMA do app, persistida no SecureStore.
//
//   'system' → segue o tema do dispositivo (default)
//   'light'  → sempre claro
//   'dark'   → sempre escuro
//
// Aplicada via NativeWind `colorScheme.set(...)`, que controla tanto as classes
// `dark:` quanto o `useColorScheme()` do NativeWind. Por isso os componentes que
// precisam do `isDark` (logo, fundo do drawer, ThemeProvider da navegação) devem
// ler o `useColorScheme` do NativeWind — não o do react-native (que só segue o
// sistema e ignoraria a troca manual).
import * as SecureStore from 'expo-secure-store'
import { colorScheme } from 'nativewind'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'oneclick_theme_pref'

export const THEME_LABELS: Record<ThemePref, string> = {
  system: 'Automático',
  light: 'Claro',
  dark: 'Escuro',
}

/** Aplica a preferência no NativeWind (imediato, sem persistir). */
export function applyThemePref(pref: ThemePref): void {
  colorScheme.set(pref)
}

/** Lê a preferência salva. Default 'system'. */
export async function getThemePref(): Promise<ThemePref> {
  try {
    const v = await SecureStore.getItemAsync(KEY)
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Aplica + persiste a preferência (persistência best-effort). */
export async function setThemePref(pref: ThemePref): Promise<void> {
  applyThemePref(pref)
  try {
    await SecureStore.setItemAsync(KEY, pref)
  } catch {
    // best-effort
  }
}
