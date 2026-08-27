import type { DadosCnpj } from './provedor-cnpj'

/**
 * Comparação entre o que está no cadastro e o que a fonte oficial diz.
 *
 * O resultado é SUGESTÃO, nunca escrita: alguém aprova na aba Dossiê. O
 * cadastro é preenchido à mão há anos e às vezes está mais certo que a Receita
 * (endereço novo que ainda não foi atualizado lá, nome fantasia que a empresa
 * usa de fato).
 */

export type CadastroComparavel = {
  razaoSocial: string | null
  nomeFantasia: string | null
  cnaePrincipal: string | null
  inscricaoEstadual: string | null
  capitalSocial: number | string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export type Divergencia = {
  campo: string
  valorAtual: string | null
  valorSugerido: string
  fonte: string
  urlFonte: string | null
}

/**
 * Duas grafias do mesmo valor não são divergência: acento, caixa, espaço dobrado
 * e pontuação de endereço variam entre fontes sem nada ter mudado. Comparar
 * cru encheria a fila de sugestões com ruído — e uma fila ruidosa não é lida.
 */
function equivalente(a: string | null | undefined, b: string | null | undefined): boolean {
  const normalizar = (v: string | null | undefined) => String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
  return normalizar(a) === normalizar(b)
}

const CAMPOS: Array<{
  campo: keyof CadastroComparavel
  valor: (d: DadosCnpj) => string | null
}> = [
  { campo: 'razaoSocial', valor: d => d.razaoSocial || null },
  { campo: 'nomeFantasia', valor: d => d.nomeFantasia },
  { campo: 'cnaePrincipal', valor: d => d.cnaes.find(c => c.principal)?.codigo ?? null },
  { campo: 'capitalSocial', valor: d => d.capitalSocial != null ? String(d.capitalSocial) : null },
  { campo: 'cep', valor: d => d.cep },
  { campo: 'logradouro', valor: d => d.logradouro },
  { campo: 'numero', valor: d => d.numero },
  { campo: 'bairro', valor: d => d.bairro },
  { campo: 'cidade', valor: d => d.municipio },
  { campo: 'uf', valor: d => d.uf },
]

export function detectarDivergencias(cadastro: CadastroComparavel, dados: DadosCnpj): Divergencia[] {
  const saida: Divergencia[] = []
  for (const { campo, valor } of CAMPOS) {
    const sugerido = valor(dados)
    // Fonte sem o dado não propõe apagar o que alguém preencheu à mão.
    if (!sugerido) continue
    const atual = cadastro[campo]
    const atualTexto = atual == null ? null : String(atual)
    if (equivalente(atualTexto, sugerido)) continue
    saida.push({
      campo,
      valorAtual: atualTexto,
      valorSugerido: sugerido,
      fonte: dados.fonte,
      urlFonte: dados.urlFonte ?? null,
    })
  }
  return saida
}

/**
 * Campos aplicados direto, sem passar pela fila.
 *
 * Só o CNAE: ele tem resposta única e objetiva na base da Receita, não existe
 * "a versão do escritório" dele, e é o dado que hoje falta em 100% da base —
 * mandar 2.172 sugestões idênticas para aprovação seria só atrito.
 */
export const CAMPOS_AUTOMATICOS = ['cnaePrincipal'] as const
