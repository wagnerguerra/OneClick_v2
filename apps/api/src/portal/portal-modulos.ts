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
