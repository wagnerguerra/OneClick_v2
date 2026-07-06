/**
 * Validação de dígito verificador de CPF/CNPJ. [QA #40]
 * Usado no cadastro manual do cliente pra barrar documentos inválidos
 * (ex.: 00000000000000, sequências, DV errado). Imports do legado usam
 * outro caminho e não passam por aqui.
 */

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

export function isValidCnpj(cnpj: string): boolean {
  const c = cnpj.replace(/\D/g, '')
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const calc = (len: number): number => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (weights[i] ?? 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  if (calc(12) !== Number(c[12])) return false
  return calc(13) === Number(c[13])
}

/** Valida CPF (11) ou CNPJ (14). Documento vazio NÃO é validado aqui (é opcional). */
export function isValidDocumento(doc: string): boolean {
  const c = doc.replace(/\D/g, '')
  if (c.length === 11) return isValidCpf(c)
  if (c.length === 14) return isValidCnpj(c)
  return false
}
