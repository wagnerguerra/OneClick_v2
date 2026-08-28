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
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  telefone: string | null
  email: string | null
  dataAbertura: string | null
  naturezaJuridica: string | null
  porte: string | null
  situacaoCadastral: string | null
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
  { campo: 'complemento', valor: d => d.complemento },
  { campo: 'bairro', valor: d => d.bairro },
  { campo: 'cidade', valor: d => d.municipio },
  { campo: 'uf', valor: d => d.uf },
  // A Receita devolve vários telefones; o cadastro tem um campo só. Vai o
  // primeiro — e quem quiser os outros vê a lista no bloco de contato.
  { campo: 'telefone', valor: d => d.telefones[0] ?? null },
  { campo: 'email', valor: d => d.email },
  { campo: 'dataAbertura', valor: d => d.dataAbertura },
  { campo: 'naturezaJuridica', valor: d => d.naturezaJuridica },
  { campo: 'porte', valor: d => d.porte },
  { campo: 'situacaoCadastral', valor: d => d.situacaoCadastral },
]

export function detectarDivergencias(cadastro: CadastroComparavel, dados: DadosCnpj): Divergencia[] {
  const saida: Divergencia[] = []
  for (const { campo, valor } of CAMPOS) {
    const sugerido = valor(dados)
    // Fonte sem o dado não propõe apagar o que alguém preencheu à mão.
    if (!sugerido) continue
    const atual = cadastro[campo]
    const atualTexto = atual == null ? null : String(atual)
    // E-mail e telefone não passam pelo normalizador de texto: ele apaga @, ponto
    // e traço, e aí `contato@x.com.br` e `contato@x.com` virariam o mesmo valor.
    const iguais = campo === 'email' || campo === 'telefone'
      ? String(atualTexto ?? '').replace(/\s+/g, '').toLowerCase() === sugerido.replace(/\s+/g, '').toLowerCase()
      : equivalente(atualTexto, sugerido)
    if (iguais) continue
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
