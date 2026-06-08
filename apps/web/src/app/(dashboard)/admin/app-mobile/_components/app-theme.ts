// Paleta de tema do APP MOBILE (não do chrome da página web).
//
// O app mobile real usa tokens semânticos (bg-background, text-foreground...)
// que trocam entre claro/escuro. Como aqui estamos DENTRO de uma moldura, o
// tema do app é independente do tema do dashboard web — por isso resolvemos as
// cores literais da identidade do app em JS, escolhidas pelo modo claro/escuro
// do SIMULADOR. São as cores da marca OneClick mobile.
//
// IDENTIDADE VISUAL (referência aprovada — app moderno tipo fitness):
//   • Primária  = azul vibrante royal/cobalt (#2563EB / hover #1D4ED8)
//   • Acento    = coral/vermelho (#F0533D) — cards hero, headers, progresso
//   • Warning   = amarelo dourado (#FBBF24) — barras secundárias, destaques
//   • Fundo claro #F6F7FB, cards #FFFFFF, texto slate, bordas suaves.

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
  // Marca primária (azul vibrante)
  primary: string
  primarySoft: string // primary com baixa opacidade (chips/realces)
  primaryForeground: string
  // Acento coral (cards hero, headers, barras de progresso)
  accent: string
  accentForeground: string
  accentSoft: string // coral ~12% alpha
  // Warning / dourado (barras secundárias, destaques pontuais)
  warning: string
  warningSoft: string
  // Bordas
  border: string
  // Destrutivo
  destructive: string
  destructiveSoft: string
}

export const APP_COLORS: Record<AppTheme, AppColors> = {
  light: {
    background: '#f6f7fb',
    card: '#ffffff',
    elevated: '#ffffff',
    muted: '#f1f4f9',
    mutedSoft: 'rgba(241,244,249,0.6)',
    foreground: '#1e293b',
    mutedForeground: '#64748b',
    primary: '#2563eb',
    primarySoft: 'rgba(37,99,235,0.12)',
    primaryForeground: '#ffffff',
    accent: '#f0533d',
    accentForeground: '#ffffff',
    accentSoft: 'rgba(240,83,61,0.12)',
    warning: '#fbbf24',
    warningSoft: 'rgba(251,191,36,0.16)',
    border: '#e8ebf2',
    destructive: '#f0533d',
    destructiveSoft: 'rgba(240,83,61,0.12)',
  },
  dark: {
    background: '#0f1729',
    card: '#1a2438',
    elevated: '#202c44',
    muted: '#22304a',
    mutedSoft: 'rgba(34,48,74,0.6)',
    foreground: '#e8edf7',
    mutedForeground: '#94a3b8',
    primary: '#3b82f6',
    primarySoft: 'rgba(59,130,246,0.18)',
    primaryForeground: '#0a1326',
    accent: '#f0533d',
    accentForeground: '#ffffff',
    accentSoft: 'rgba(240,83,61,0.18)',
    warning: '#fbbf24',
    warningSoft: 'rgba(251,191,36,0.2)',
    border: '#2a3a55',
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
