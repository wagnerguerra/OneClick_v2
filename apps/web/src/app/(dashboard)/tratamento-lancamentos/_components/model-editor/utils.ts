import { stableStringify, type TreatmentDefinition } from '@saas/types'
import { alerts } from '@/lib/alerts'

/**
 * Diálogo único de "sair sem salvar" — fonte de verdade da mensagem, usada por
 * todos os caminhos de saída (botão Sair/Voltar e botão "voltar" do navegador).
 */
export function confirmarSaidaSemSalvar(): Promise<boolean> {
  return alerts.confirm({
    title: 'Sair sem salvar?',
    text: 'Há alterações não salvas neste modelo. Se sair agora, elas serão perdidas.',
    confirmText: 'Sair sem salvar',
    icon: 'warning',
  })
}

/**
 * Remove vírgulas e quebras de linha de campos que vão para a linha do SCI
 * (separada por vírgula, sem escape). Enforce no front nos campos digitados —
 * o backend ainda saneia como rede de segurança (inclui dados vindos do arquivo).
 */
export function semSeparador(s: string): string {
  return s.replace(/[,\r\n]/g, '')
}

/**
 * Campos de número de conta (contas correntes e contrapartida) só aceitam dígitos.
 * Remove qualquer caractere não numérico enquanto o usuário digita.
 */
export function soDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

/** Escapa HTML de valores do usuário antes de embutir nas mensagens (SweetAlert html). */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Resume uma lista (até `max` itens) com "e mais N", escapando os valores. */
export function listaResumo(itens: string[], max = 3): string {
  const vis = itens.slice(0, max).map((s) => `"${esc(s)}"`)
  const resto = itens.length - vis.length
  return vis.join(', ') + (resto > 0 ? ` e mais ${resto}` : '')
}

/**
 * Classe de realce de campo obrigatório vazio. Sutil no fluxo normal (borda
 * direita); reforçada (borda + anel) no "modo revisão" do editor (#2 — abrir a
 * partir de uma pendência de modelo).
 */
export function invalidCls(revisar?: boolean): string {
  return revisar ? 'border-destructive ring-1 ring-destructive/40' : 'border-r-2 border-r-destructive'
}

/** Snapshot serializado do formulário para detectar alterações não salvas. */
export function serializeForm(nome: string, isActive: boolean, def: TreatmentDefinition): string {
  return stableStringify({ nome: nome.trim(), isActive, def })
}
