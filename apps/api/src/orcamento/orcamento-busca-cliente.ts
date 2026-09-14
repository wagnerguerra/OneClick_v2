import type { Prisma } from '@saas/db'
import { limparDocumento } from '@saas/types'

/**
 * O seletor de cliente do balão "Solicitar orçamento".
 *
 * Ficava dentro do service, e três defeitos moravam juntos ali — todos vistos
 * de uma vez quando alguém buscou o ex-cliente "House027" e recebeu de volta
 * AGROPECUÁRIA SÃO GABRIEL, BEDESCHI E RAPOSO e BR PRIME:
 *
 *  1. o termo era espremido para só os dígitos ("House027" → "027") antes de
 *     bater no CNPJ, então qualquer nome com número virava busca por documento;
 *  2. os três respondentes eram de OUTRO tenant (`jrg-empresa`) — o recorte por
 *     empresa não valia para o master;
 *  3. o cliente procurado nem podia aparecer: ex-clientes eram excluídos.
 *
 * As decisões estão aqui, fora do Prisma, porque são regra e não consulta —
 * dá para testá-las sem banco, e é o que o .spec ao lado faz.
 */

/** Um pedaço de termo pequeno demais busca CNPJ inteiro; 3 é o mínimo útil. */
const MIN_DOC = 3

/**
 * Recorte por empresa — **o master também é recortado**.
 *
 * Mesma regra do `empresaFilter` de `cliente.service.ts`: o poder do master é
 * TROCAR de empresa pelo seletor do cabeçalho, não ver todas somadas. Sem isso
 * o balão sugeria cliente de um escritório para quem estava dentro de outro.
 *
 * Sem empresa carregada, só o master vê tudo; o não-master fica sem nada
 * (`__none__` nunca existe), que é o comportamento seguro de sempre.
 */
export function escopoDeEmpresa(isMaster: boolean, empresaId?: string): Prisma.ClienteWhereInput {
  if (empresaId) return { empresaId }
  return isMaster ? {} : { empresaId: '__none__' }
}

/**
 * O `OR` da busca textual.
 *
 * Nome/fantasia casam por **todos os pedaços** do termo (AND entre as palavras):
 * "house 027" acha "HOUSE027 INNOVATIVE", e "clinica odontologica" não traz
 * toda clínica da base só porque a primeira palavra bateu.
 *
 * O documento usa `limparDocumento`, que preserva letras (CNPJ alfanumérico) em
 * vez de descartá-las. É essa diferença que mata o defeito original: "House027"
 * vira "HOUSE027", que não existe em nenhum documento, então o ramo simplesmente
 * não casa — antes virava "027" e casava com todo CNPJ terminado em 027.
 */
export function filtroDeBusca(search: string | undefined | null): Prisma.ClienteWhereInput | null {
  const termo = (search ?? '').trim()
  if (!termo) return null

  const pedacos = termo.split(/\s+/).filter(Boolean).slice(0, 6)
  const porTexto = (campo: 'razaoSocial' | 'nomeFantasia'): Prisma.ClienteWhereInput => ({
    AND: pedacos.map(p => ({ [campo]: { contains: p, mode: 'insensitive' } })),
  })

  const doc = limparDocumento(termo)
  return {
    OR: [
      porTexto('razaoSocial'),
      porTexto('nomeFantasia'),
      ...(doc.length >= MIN_DOC ? [{ documento: { contains: doc, mode: 'insensitive' as const } }] : []),
    ],
  }
}

export interface ClienteEncontrado {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  empresaId: string | null
  status: string
}

export interface OpcaoDeCliente {
  id: string
  razaoSocial: string
  nomeFantasia: string | null
  documento: string
  /** Ex-cliente (status INATIVO). A tela marca para a pessoa ver o que escolheu. */
  inativo: boolean
}

/**
 * Tira as duplicatas e ordena: ativos primeiro, ex-clientes depois.
 *
 * A base tem o mesmo cliente duas vezes (uma cópia órfã sem `empresaId`, do
 * legado, ao lado da real) e, desde que ex-clientes entraram na lista, também
 * pode ter a cópia ATIVA e a INATIVA do mesmo documento. A preferência é
 * ATIVO primeiro, depois quem tem empresa: oferecer o registro morto quando o
 * vivo existe é o que fazia o cliente sumir do cadastro depois de escolhido.
 *
 * Documento vazio nunca é deduplicado — cada um é um registro distinto.
 */
export function consolidar(rows: ClienteEncontrado[], limite = 20): OpcaoDeCliente[] {
  const porDoc = new Map<string, ClienteEncontrado>()
  const semDoc: ClienteEncontrado[] = []

  for (const r of rows) {
    const chave = limparDocumento(r.documento)
    if (!chave) { semDoc.push(r); continue }
    const atual = porDoc.get(chave)
    if (!atual || melhorQue(r, atual)) porDoc.set(chave, r)
  }

  return [...porDoc.values(), ...semDoc]
    .sort((a, b) => {
      const ia = a.status === 'INATIVO' ? 1 : 0
      const ib = b.status === 'INATIVO' ? 1 : 0
      if (ia !== ib) return ia - ib
      return a.razaoSocial.localeCompare(b.razaoSocial)
    })
    .slice(0, limite)
    .map(r => ({
      id: r.id,
      razaoSocial: r.razaoSocial,
      nomeFantasia: r.nomeFantasia,
      documento: r.documento,
      inativo: r.status === 'INATIVO',
    }))
}

function melhorQue(candidato: ClienteEncontrado, atual: ClienteEncontrado): boolean {
  const vivoAgora = atual.status !== 'INATIVO'
  const vivoCandidato = candidato.status !== 'INATIVO'
  if (vivoCandidato !== vivoAgora) return vivoCandidato
  return !atual.empresaId && !!candidato.empresaId
}
