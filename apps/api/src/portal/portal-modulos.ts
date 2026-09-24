/**
 * Catálogo dos módulos do Portal do Cliente.
 *
 * Fonte única: o menu do portal, a tela de liberação do master e o gate das
 * rotas leem daqui. Antes o menu era uma lista solta no layout, e o `emBreve`
 * dizia apenas "não clique" — nada impedia alguém de digitar a URL.
 *
 * O `padrao` é o que vale quando a empresa não tem linha em
 * `PortalModuloEmpresa`. Módulo que já está no ar nasce `true`, senão o deploy
 * apagaria Documentos do portal de quem já usa até alguém ir ligar. Módulo
 * novo nasce `false`: quem entra em produção depois precisa ser ligado por ato
 * deliberado, com o escritório sabendo o que vai aparecer para o cliente.
 */
export interface ModuloDoPortal {
  slug: string
  rotulo: string
  /** O que o cliente passa a ver — o texto que o master lê ao decidir. */
  descricao: string
  /** Existe código atrás disto? */
  implementado: boolean
  padrao: boolean
}

export const MODULOS_DO_PORTAL: readonly ModuloDoPortal[] = [
  {
    slug: 'documentos',
    rotulo: 'Documentos',
    descricao: 'Pasta de arquivos do cliente: baixar o que o escritório publica e enviar os próprios documentos.',
    implementado: true,
    padrao: true,
  },
  {
    slug: 'obrigacoes',
    rotulo: 'Obrigações',
    descricao: 'Calendário das entregas da empresa, com prazo legal e situação — inclusive as atrasadas.',
    implementado: true,
    // Nasce LIGADO porque expõe o atraso do escritório ao cliente, e essa foi
    // decisão explícita de quem manda no negócio. Desligar aqui é o caminho
    // para quem mudar de ideia, e não o contrário.
    padrao: true,
  },
  {
    slug: 'bi',
    rotulo: 'Dashboard Financeiro',
    descricao: 'Receita, custos, despesas e resultado da empresa, mês a mês — a DRE do balancete.',
    implementado: true,
    // Nasce LIGADO no nível da empresa porque o portão de verdade é outro: a
    // permissão POR USUÁRIO (`ClienteUsuario.podeVerBi`), que nasce desligada.
    // Com os dois desligados por padrão, liberar o BI para uma pessoa pediria
    // dois atos em duas telas diferentes — e o escritório marcaria a pessoa,
    // não veria nada acontecer e concluiria que está quebrado. Desligar aqui
    // continua valendo como chave geral: tira o BI do portal de todo mundo.
    padrao: true,
  },
  {
    slug: 'chamados',
    rotulo: 'Atendimento',
    descricao: 'Abertura e acompanhamento de chamados pelo portal, no lugar do WhatsApp.',
    implementado: false,
    padrao: false,
  },
  {
    slug: 'certidoes',
    rotulo: 'Certidões',
    descricao: 'Situação e PDF da última emissão de cada certidão negativa.',
    implementado: false,
    padrao: false,
  },
  {
    slug: 'certificado',
    rotulo: 'Certificado digital',
    descricao: 'Titular e validade do certificado. Nunca a senha nem o arquivo PFX.',
    implementado: false,
    padrao: false,
  },
  {
    slug: 'notas',
    rotulo: 'Notas fiscais',
    descricao: 'As notas capturadas da empresa, com XML e DANFE.',
    implementado: false,
    padrao: false,
  },
] as const

const PADRAO = new Map(MODULOS_DO_PORTAL.map(m => [m.slug, m.padrao]))

/**
 * Módulos que, além de liberados para a EMPRESA, exigem permissão da PESSOA.
 *
 * Documentos não está aqui: a pasta tem permissões próprias e mais finas
 * (`podeVer`, `podeEditar`, `podeExcluir`), aplicadas dentro das rotas. O BI é
 * tudo ou nada — ou a pessoa vê os números da empresa, ou não vê.
 */
export interface PermissoesDoVinculo {
  podeVerBi: boolean
}

/**
 * Os módulos que ESTA pessoa alcança: os da empresa, menos os que exigem uma
 * permissão que ela não tem.
 *
 * Existe para que o menu e o gate das rotas continuem lendo uma lista só
 * (`vinculo.modulos`). Se a permissão do usuário fosse conferida à parte, a
 * próxima rota do BI que alguém escrevesse precisaria lembrar de conferir — e
 * uma checagem que depende de lembrar é uma checagem que falta.
 */
export function modulosDoVinculo(
  liberadosNaEmpresa: Set<string>,
  permissoes: PermissoesDoVinculo,
): string[] {
  const out = new Set(liberadosNaEmpresa)
  if (!permissoes.podeVerBi) out.delete('bi')
  return [...out]
}

/**
 * Resolve a lista final a partir das exceções gravadas.
 *
 * Slug desconhecido no banco é ignorado: módulo removido do catálogo deixa
 * linha órfã, e uma linha órfã não deve reaparecer como módulo fantasma.
 */
export function resolverLiberados(
  excecoes: Array<{ modulo: string; liberado: boolean }>,
): Set<string> {
  const mapa = new Map(PADRAO)
  for (const e of excecoes) {
    if (mapa.has(e.modulo)) mapa.set(e.modulo, e.liberado)
  }
  return new Set([...mapa.entries()].filter(([, v]) => v).map(([k]) => k))
}
