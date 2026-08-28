/**
 * Atalhos para as consultas públicas que se faz sobre uma pessoa física.
 *
 * Por que atalho e não integração: a API pública do DataJud (CNJ) — a única
 * gratuita e oficial — NÃO indexa as partes. Ela busca por número de processo,
 * classe e órgão julgador; nome e CPF ficaram de fora por decisão de
 * privacidade (Portaria CNJ 160/2020). Então "quais processos o João tem" não é
 * pergunta que se responda de graça por API. Quem faz esse caminho cobra.
 *
 * O que resta, e é o que está aqui: levar quem consulta direto ao portal certo,
 * com o CPF na mão. É o mesmo trabalho manual de antes, sem a parte de lembrar
 * onde fica cada coisa e de garimpar o CPF em outra aba.
 *
 * `{cpf}` e `{nome}` são trocados pelo dado do sócio quando o portal aceita
 * parâmetro na URL. A maioria não aceita — daí `colar: true`, e a tela oferece
 * copiar o CPF antes de abrir.
 */

export type ConsultaPublica = {
  rotulo: string
  url: string
  /** O portal não recebe o dado pela URL: é preciso colar lá dentro. */
  colar: boolean
  nota?: string
}

/**
 * Só entram consultas NACIONAIS aqui, e por um motivo: as estaduais mudam de
 * endereço com frequência e são 27. Endereço errado numa lista fixa vira link
 * morto que ninguém corrige. Os tribunais que a casa usa entram pela
 * configuração `CONSULTAS_SOCIO`, que o master edita sem depender de publicação.
 */
const PADRAO: ConsultaPublica[] = [
  {
    rotulo: 'CNDT — débitos trabalhistas',
    url: 'https://cndt-certidao.tst.jus.br/inicio.faces',
    colar: true,
    nota: 'Certidão do TST; aceita CPF',
  },
  {
    rotulo: 'CNJ — improbidade e inelegibilidade',
    url: 'https://www.cnj.jus.br/improbidade_adm/consultar_requerido.php',
    colar: true,
    nota: 'Condenações cíveis por ato de improbidade',
  },
  {
    rotulo: 'Sanções — CEIS e CNEP',
    url: 'https://portaldatransparencia.gov.br/sancoes/consulta',
    colar: true,
    nota: 'Inidôneos e suspensos, no Portal da Transparência',
  },
  {
    rotulo: 'Receita — situação do CPF',
    url: 'https://servicos.receita.fazenda.gov.br/servicos/cpf/consultasituacao/consultapublica.asp',
    colar: true,
  },
]

/**
 * Lê a configuração e devolve a lista final.
 *
 * Formato de cada linha: `Rótulo|URL` — e `|nota` opcional no fim. Vazia, usa
 * só o padrão; preenchida, as linhas ENTRAM depois do padrão (não substituem),
 * porque as nacionais servem a qualquer cliente.
 */
export function consultasPublicas(): ConsultaPublica[] {
  const bruto = (process.env.CONSULTAS_SOCIO ?? '').trim()
  if (!bruto) return PADRAO

  const extras: ConsultaPublica[] = []
  for (const linha of bruto.split(/[\r\n]+/)) {
    const partes = linha.split('|').map(x => x.trim())
    const [rotulo, url, nota] = partes
    if (!rotulo || !url || !/^https?:\/\//i.test(url)) continue
    extras.push({
      rotulo,
      url,
      // Se a linha traz `{cpf}` ou `{nome}`, o portal recebe pela URL.
      colar: !/\{(cpf|nome)\}/i.test(url),
      ...(nota ? { nota } : {}),
    })
  }

  return [...PADRAO, ...extras]
}
