/**
 * Máscaras de formatação para campos de formulário.
 * Uso: onChange={(e) => e.target.value = masks.cpf(e.target.value)}
 */

// Remove tudo que não é dígito
function digits(v: string) {
  return v.replace(/\D/g, '')
}

/**
 * Normaliza um CNPJ preservando LETRAS (CNPJ alfanumérico — novo formato da
 * Receita, produção a partir de jul/2026): mantém 0-9 e A-Z, em maiúsculo.
 * NÃO use `digits()` em CNPJ — apagaria as letras. Espelha `limparCnpj` do backend.
 */
export function limparCnpj(v: string) {
  return String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

export const masks = {
  /** CPF: 000.000.000-00 */
  cpf(v: string) {
    return digits(v)
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  },

  /**
   * CNPJ: 00.000.000/0000-00 — aceita o formato alfanumérico (letras nas 12
   * primeiras posições). Formata POR POSIÇÃO (não por `\d`), então letras e
   * dígitos são mascarados igual. O DV numérico é conferido na validação, não aqui.
   */
  cnpj(v: string) {
    const c = limparCnpj(v).slice(0, 14)
    let out = c.slice(0, 2)
    if (c.length > 2) out += '.' + c.slice(2, 5)
    if (c.length > 5) out += '.' + c.slice(5, 8)
    if (c.length > 8) out += '/' + c.slice(8, 12)
    if (c.length > 12) out += '-' + c.slice(12, 14)
    return out
  },

  /** CPF ou CNPJ (auto-detecta). Qualquer letra ⇒ CNPJ (CPF é sempre numérico). */
  cpfCnpj(v: string) {
    const alnum = limparCnpj(v)
    const temLetra = /[A-Z]/.test(alnum)
    return (!temLetra && alnum.length <= 11) ? masks.cpf(v) : masks.cnpj(v)
  },

  /** Telefone: (00) 00000-0000 ou (00) 0000-0000 */
  telefone(v: string) {
    const d = digits(v).slice(0, 11)
    if (d.length <= 10) {
      return d
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
    }
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
  },

  /** CEP: 00000-000 */
  cep(v: string) {
    return digits(v)
      .slice(0, 8)
      .replace(/(\d{5})(\d{1,3})$/, '$1-$2')
  },

  /** Data: 00/00/0000 */
  data(v: string) {
    return digits(v)
      .slice(0, 8)
      .replace(/(\d{2})(\d)/, '$1/$2')
      .replace(/(\d{2})(\d)/, '$1/$2')
  },

  /** Moeda: 0,00 → 1.234,00 (formatação brasileira) */
  moeda(v: string) {
    let d = digits(v)
    if (!d) return ''
    // Remover zeros à esquerda (mas manter pelo menos 1)
    d = d.replace(/^0+(\d)/, '$1')
    // Garantir no mínimo 3 dígitos (centavos)
    d = d.padStart(3, '0')
    // Separar centavos
    const inteiro = d.slice(0, -2)
    const centavos = d.slice(-2)
    // Adicionar pontos de milhar
    const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${comPontos},${centavos}`
  },

  /** RG: 00.000.000-0 */
  rg(v: string) {
    return digits(v)
      .slice(0, 9)
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1})$/, '$1-$2')
  },

  /** Inscrição Estadual: apenas números */
  ie(v: string) {
    return digits(v).slice(0, 14)
  },

  /** Placa de veículo: ABC-1234 ou ABC1D23 (Mercosul) */
  placa(v: string) {
    return v
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7)
      .replace(/^([A-Z]{3})(\d)/, '$1-$2')
  },

  /** Apenas números */
  numero(v: string) {
    return digits(v)
  },
}

/**
 * Converter data formatada (dd/mm/yyyy) para ISO (yyyy-mm-dd) para input[type=date] e backend
 */
export function dataParaISO(v: string): string {
  const d = digits(v)
  if (d.length !== 8) return v
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`
}

/**
 * Converter ISO (yyyy-mm-dd) para formato brasileiro (dd/mm/yyyy)
 */
export function isoParaData(v: string): string {
  if (!v) return ''
  const parts = v.split('T')[0]?.split('-')
  if (!parts || parts.length !== 3) return v
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/**
 * Converter moeda formatada (1.234,56) para número
 */
export function moedaParaNumero(v: string): number | null {
  const d = digits(v)
  if (!d) return null
  return Number(d) / 100
}

/**
 * Converter número para moeda formatada
 */
export function numeroParaMoeda(v: number | null | undefined): string {
  if (v == null) return ''
  return masks.moeda(String(Math.round(v * 100)))
}

/**
 * Helper para aplicar máscara em evento onChange
 */
export function applyMask(mask: (v: string) => string) {
  return (e: React.ChangeEvent<HTMLInputElement>) => {
    e.target.value = mask(e.target.value)
  }
}
