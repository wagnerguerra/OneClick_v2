// Cores literais da identidade NOVA (azul vibrante + coral + amarelo).
//
// Ionicons / props nativas (trackColor, lightColor, placeholderTextColor...) NÃO
// herdam os tokens semânticos do NativeWind, então precisam de hex. Centralizamos
// aqui os hex que espelham os tokens de global.css para um único ponto de verdade.
// Quem precisa variar por tema usa o sufixo Dark.

export const BRAND = {
  // Primária (azul).
  primary: '#2563eb',
  primaryDark: '#3b82f6',
  // Acento coral.
  accent: '#f0533d',
  // Warning (amarelo dourado).
  warning: '#fbbf24',
  // Sucesso (emerald).
  success: '#10b981',
  // Destrutivo (coral no claro, rose no escuro).
  destructive: '#f0533d',
  destructiveDark: '#fb7185',
  // Texto.
  foreground: '#1e293b',
  foregroundDark: '#e8edf7',
  mutedForeground: '#64748b',
  mutedForegroundDark: '#94a3b8',
  // Neutros de UI nativa.
  switchTrackOff: '#cbd5e1',
  switchThumbOff: '#f1f5f9',
} as const

/** Cor primária resolvida pelo tema (claro/escuro). */
export function primaryFor(isDark: boolean): string {
  return isDark ? BRAND.primaryDark : BRAND.primary
}

/** Cor de texto principal (foreground) resolvida pelo tema. */
export function foregroundFor(isDark: boolean): string {
  return isDark ? BRAND.foregroundDark : BRAND.foreground
}

/** Cor de superfície de card resolvida pelo tema (espelha o token --card). */
export function cardFor(isDark: boolean): string {
  return isDark ? '#1a2438' : '#ffffff'
}

/** Cor de texto muted resolvida pelo tema. */
export function mutedForegroundFor(isDark: boolean): string {
  return isDark ? BRAND.mutedForegroundDark : BRAND.mutedForeground
}

/** Cor destrutiva resolvida pelo tema. */
export function destructiveFor(isDark: boolean): string {
  return isDark ? BRAND.destructiveDark : BRAND.destructive
}
