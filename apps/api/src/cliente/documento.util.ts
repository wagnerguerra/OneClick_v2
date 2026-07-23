/**
 * Validação de dígito verificador de CPF/CNPJ. [QA #40]
 * Usado no cadastro manual do cliente pra barrar documentos inválidos
 * (ex.: 00000000000000, sequências, DV errado). Imports do legado usam
 * outro caminho e não passam por aqui.
 */

// Normalização canônica (preserva letras do CNPJ alfanumérico). Fonte única em
// @saas/types — reexportado aqui por conveniência de quem já importa este util.
import { limparCnpj } from '@saas/types'
export { limparCnpj } from '@saas/types'

export function isValidCpf(cpf: string): boolean {
  const c = cpf.replace(/\D/g, '')
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(c[i]) * (10 - i)
  let d1 = 11 - (sum % 11)
  if (d1 >= 10) d1 = 0
  if (d1 !== Number(c[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(c[i]) * (11 - i)
  let d2 = 11 - (sum % 11)
  if (d2 >= 10) d2 = 0
  return d2 === Number(c[10])
}

/**
 * Valida um CNPJ nos formatos numérico (tradicional) E alfanumérico (novo).
 *
 * O numérico é um subconjunto do alfanumérico — o mesmo cálculo (Módulo 11)
 * valida os dois. A única diferença do alfanumérico: cada caractere vale
 * `código ASCII − 48` ('0'..'9' → 0..9; 'A'..'Z' → 17..42), aplicado com os
 * mesmos pesos 2..9 da direita para a esquerda. Os 2 dígitos verificadores
 * permanecem numéricos. Ref. oficial (Serpro/RFB); caso de teste canônico:
 * `12ABC34501DE` → DV `35`.
 */
export function isValidCnpj(cnpj: string): boolean {
  const c = limparCnpj(cnpj)
  // 14 posições; as 12 primeiras alfanuméricas, os 2 DVs numéricos.
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c)) return false
  // Rejeita placeholder de char único repetido (ex.: 00000000000000).
  if (/^(.)\1{13}$/.test(c)) return false
  // Valor do caractere no Módulo 11 alfanumérico: ASCII − 48.
  const valor = (ch: string): number => ch.charCodeAt(0) - 48
  const calc = (len: number): number => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += valor(c[i]!) * (weights[i] ?? 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  if (calc(12) !== Number(c[12])) return false
  return calc(13) === Number(c[13])
}

/** Valida CPF (11) ou CNPJ (14). Documento vazio NÃO é validado aqui (é opcional). */
export function isValidDocumento(doc: string): boolean {
  // Normaliza preservando letras (CNPJ alfanumérico). CPF é sempre numérico, então
  // 11 posições → CPF; 14 posições → CNPJ (numérico ou alfanumérico).
  const c = limparCnpj(doc)
  if (c.length === 11) return isValidCpf(c)
  if (c.length === 14) return isValidCnpj(c)
  return false
}
