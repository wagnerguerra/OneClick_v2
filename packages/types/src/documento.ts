/**
 * Utilitários canônicos de CPF/CNPJ — fonte única compartilhada entre API e web.
 *
 * CNPJ ALFANUMÉRICO (novo formato da Receita, produção progressiva a partir de
 * jul/2026): as 12 primeiras posições (raiz + ordem) podem conter letras A-Z; só
 * os 2 dígitos verificadores permanecem numéricos. O numérico tradicional é um
 * subconjunto — o mesmo tratamento serve para os dois.
 *
 * REGRA DE OURO: nunca limpe um CNPJ com `replace(/\D/g,'')` — isso apaga as
 * letras. Use `limparCnpj` (preserva A-Z). Para CPF (sempre numérico) tanto faz,
 * então `limparCnpj` também serve como normalizador de documento (CPF ou CNPJ).
 */

/** Normaliza preservando letras: mantém só 0-9 e A-Z, em MAIÚSCULO, sem pontuação. */
export function limparCnpj(v: string | null | undefined): string {
  return String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

/** Alias semântico para campos que aceitam CPF ou CNPJ (a limpeza é a mesma). */
export const limparDocumento = limparCnpj

/**
 * Formata um CNPJ como `XX.XXX.XXX/XXXX-DV`, POR POSIÇÃO (não por `\d`), então
 * letras e dígitos são mascarados igual. Aceita entrada parcial (durante digitação).
 */
export function formatCnpj(v: string | null | undefined): string {
  const c = limparCnpj(v).slice(0, 14)
  let out = c.slice(0, 2)
  if (c.length > 2) out += '.' + c.slice(2, 5)
  if (c.length > 5) out += '.' + c.slice(5, 8)
  if (c.length > 8) out += '/' + c.slice(8, 12)
  if (c.length > 12) out += '-' + c.slice(12, 14)
  return out
}

/** Formata CPF `000.000.000-00` (sempre numérico). */
export function formatCpf(v: string | null | undefined): string {
  const c = String(v ?? '').replace(/\D/g, '').slice(0, 11)
  let out = c.slice(0, 3)
  if (c.length > 3) out += '.' + c.slice(3, 6)
  if (c.length > 6) out += '.' + c.slice(6, 9)
  if (c.length > 9) out += '-' + c.slice(9, 11)
  return out
}

/** Formata documento auto-detectando CPF vs CNPJ (qualquer letra ⇒ CNPJ). */
export function formatDocumento(v: string | null | undefined): string {
  const c = limparCnpj(v)
  const temLetra = /[A-Z]/.test(c)
  return (!temLetra && c.length <= 11) ? formatCpf(v) : formatCnpj(v)
}

/**
 * Regra HÍBRIDA de matriz/filial para o CNPJ alfanumérico (Fase 3).
 *
 * No alfanumérico a ordem (posições 9-12) pode ter letras, então o /0001 deixa
 * de identificar matriz. A designação passa a ser explícita (`ehMatriz`):
 *  - `ehMatriz = true/false` → usa o valor gravado (novo alfanumérico).
 *  - `ehMatriz = null/undefined` → deriva pelo /0001 (numérico/legado). Para os
 *    dados atuais isto é IDÊNTICO ao comportamento antigo.
 * Só vale para CNPJ de 14 posições; CPF e documentos curtos nunca são "matriz".
 */
export function ehMatrizCnpj(
  documento: string | null | undefined,
  ehMatriz: boolean | null | undefined,
  tipoDocumento?: string | null,
): boolean {
  if (tipoDocumento && tipoDocumento !== 'CNPJ') return false
  const c = limparCnpj(documento)
  if (c.length !== 14) return false
  if (ehMatriz === true) return true
  if (ehMatriz === false) return false
  return c.substring(8, 12) === '0001' // NULL → numérico/legado
}

/** Raiz do CNPJ (8 primeiras posições) — comum a matriz e filiais. '' se inválido. */
export function raizCnpj(documento: string | null | undefined): string {
  const c = limparCnpj(documento)
  return c.length === 14 ? c.slice(0, 8) : ''
}
