/**
 * Cores de ícone por grupo de módulos.
 * Usar no header das páginas (listagem, create, edit).
 *
 * 🟢 Cadastros:     emerald (verde)
 * 🔵 Corporativo:   sky (azul)
 * 🟠 Qualidade:     amber (laranja)
 * 🟤 Configurações: orange-dark (marrom)
 */
export const MODULE_HEADER_COLORS = {
  cadastros: 'from-emerald-500 to-emerald-600',
  corporativo: 'from-sky-500 to-sky-600',
  qualidade: 'from-amber-500 to-amber-600',
  configuracoes: 'from-orange-700 to-orange-800',
} as const

export type ModuleGroup = keyof typeof MODULE_HEADER_COLORS
