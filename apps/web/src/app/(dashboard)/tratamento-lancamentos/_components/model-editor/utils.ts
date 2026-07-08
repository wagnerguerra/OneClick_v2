import { stableStringify, type TreatmentDefinition } from '@saas/types'
import { alerts } from '@/lib/alerts'

/**
 * Ao trocar o arquivo de exemplo, descarta as referências de coluna da definição
 * que não existem mais no novo arquivo (De/Para, Débito/Crédito e Contas
 * correntes). Sem isso, o select continuaria exibindo uma coluna inexistente.
 * Quando uma coluna de mapeamento (Débito/Crédito ou Contas) some, o respectivo
 * mapa de valores também é zerado — passou a ser de outra coluna.
 */
export function pruneDefToHeaders(d: TreatmentDefinition, headers: string[]): TreatmentDefinition {
  const has = new Set(headers)
  const columnMapping = { ...d.columnMapping }
  for (const k of Object.keys(columnMapping) as Array<keyof TreatmentDefinition['columnMapping']>) {
    const v = columnMapping[k]
    if (v && !has.has(v)) columnMapping[k] = ''
  }
  const debitoCredito =
    d.debitoCredito.coluna && !has.has(d.debitoCredito.coluna)
      ? { ...d.debitoCredito, coluna: '', mapa: [] }
      : d.debitoCredito
  const contasCorrentes =
    d.contasCorrentes.coluna && !has.has(d.contasCorrentes.coluna)
      ? { ...d.contasCorrentes, coluna: '', mapa: [] }
      : d.contasCorrentes
  return { ...d, columnMapping, debitoCredito, contasCorrentes }
}

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

/** Snapshot serializado do formulário para detectar alterações não salvas. */
export function serializeForm(nome: string, isActive: boolean, def: TreatmentDefinition): string {
  return stableStringify({ nome: nome.trim(), isActive, def })
}
