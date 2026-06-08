// Paleta de tema do APP MOBILE (não do chrome da página web).
//
// O app mobile real usa tokens semânticos (bg-background, text-foreground...)
// que trocam entre claro/escuro. Como aqui estamos DENTRO de uma moldura, o
// tema do app é independente do tema do dashboard web — por isso resolvemos as
// cores literais da identidade do app (sky/azure) em JS, escolhidas pelo modo
// claro/escuro do SIMULADOR. São as cores da marca OneClick mobile.

export type AppTheme = 'light' | 'dark'

export interface AppColors {
  // Fundos
  background: string
  card: string
  elevated: string
  muted: string
  mutedSoft: string // bg-muted/40 equivalente
  // Texto
  foreground: string
  mutedForeground: string
  // Marca / acento (sky)
  primary: string
  primarySoft: string // primary com baixa opacidade (chips/realces)
  primaryForeground: string
  // Bordas
  border: string
  // Destrutivo
  destructive: string
  destructiveSoft: string
}

export const APP_COLORS: Record<AppTheme, AppColors> = {
  light: {
    background: '#f8fafc',
    card: '#ffffff',
    elevated: '#ffffff',
    muted: '#f1f5f9',
    mutedSoft: 'rgba(241,245,249,0.6)',
    foreground: '#0f172a',
    mutedForeground: '#64748b',
    primary: '#0ea5e9',
    primarySoft: 'rgba(14,165,233,0.12)',
    primaryForeground: '#ffffff',
    border: '#e2e8f0',
    destructive: '#f43f5e',
    destructiveSoft: 'rgba(244,63,94,0.12)',
  },
  dark: {
    background: '#0b1220',
    card: '#111827',
    elevated: '#162033',
    muted: '#1e293b',
    mutedSoft: 'rgba(30,41,59,0.6)',
    foreground: '#f1f5f9',
    mutedForeground: '#94a3b8',
    primary: '#38bdf8',
    primarySoft: 'rgba(56,189,248,0.16)',
    primaryForeground: '#06283d',
    border: '#1f2a3a',
    destructive: '#fb7185',
    destructiveSoft: 'rgba(251,113,133,0.18)',
  },
}

/** Iniciais (até 2 letras) a partir de um nome — fallback de avatar/logo. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}
