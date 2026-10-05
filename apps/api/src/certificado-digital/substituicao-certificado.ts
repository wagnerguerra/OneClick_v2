/**
 * Substituição automática de certificado pelo documento (#HLP0386).
 *
 * Cadastrar um certificado de um CPF/CNPJ que já tem um vigente SUBSTITUI o
 * anterior: o novo aponta para ele (`parentId`) e o antigo vira RENOVADO —
 * some da listagem e dos contadores, mas fica na cadeia de versões. É o mesmo
 * efeito do botão "Renovar", só que sem depender de o usuário achar o botão:
 * em produção eram 4 renovações para 170 certificados, e documentos com dois
 * certificados vigentes ao mesmo tempo.
 *
 * A chave é o documento DO CERTIFICADO (lido do PFX), não o do cadastro: um
 * cliente pode guardar o e-CNPJ da empresa e os e-CPFs dos sócios, cada um com
 * o seu documento. O recorte é a empresa (tenant) — o vínculo com cliente não
 * entra, porque o mesmo documento às vezes está em dois cadastros.
 *
 * Decisões do Wagner (28/09/2026):
 *  - substitui sem perguntar, e a mensagem de sucesso diz o que foi substituído;
 *  - novo que vence ANTES do vigente (arquivo velho por engano) → pergunta;
 *  - o mesmo arquivo (mesmo hash) não é cadastrado de novo.
 */

import { prisma } from '@saas/db'
import { limparCnpj } from '@saas/types'

/** Estados de um certificado que ainda "ocupa" o documento. */
const STATUS_VIGENTE = ['ATIVO', 'EXPIRADO']

export interface CertVigente {
  id: string
  titular: string
  expiraEm: Date
  arquivoHash: string | null
  clienteId: string | null
  socioId: string | null
}

export type DecisaoSubstituicao =
  | { acao: 'NOVO' }
  | { acao: 'DUPLICADO'; existente: CertVigente }
  | { acao: 'CONFIRMAR'; atual: CertVigente }
  | { acao: 'SUBSTITUIR'; atual: CertVigente; substituidos: CertVigente[] }

/**
 * O que fazer com um certificado novo diante dos vigentes do mesmo documento.
 * `aceitarMaisAntigo` = o usuário já confirmou substituir por um que vence antes.
 */
export function decidirSubstituicao(
  novo: { expiraEm: Date; arquivoHash: string },
  vigentes: CertVigente[],
  aceitarMaisAntigo = false,
): DecisaoSubstituicao {
  if (vigentes.length === 0) return { acao: 'NOVO' }
  const igual = vigentes.find(v => v.arquivoHash && v.arquivoHash === novo.arquivoHash)
  if (igual) return { acao: 'DUPLICADO', existente: igual }
  // O "atual" é o de validade mais longa — é contra ele que o novo se mede.
  const atual = vigentes.reduce((a, b) => (b.expiraEm > a.expiraEm ? b : a))
  if (novo.expiraEm < atual.expiraEm && !aceitarMaisAntigo) return { acao: 'CONFIRMAR', atual }
  // Havendo mais de um vigente (duplicados de antes da regra), todos saem.
  return { acao: 'SUBSTITUIR', atual, substituidos: vigentes }
}

/** Vigentes do documento na empresa. Documento vazio não casa com nada. */
export async function buscarVigentes(empresaId: string | null, documento: string): Promise<CertVigente[]> {
  const doc = limparCnpj(documento)
  if (!doc) return []
  return prisma.certificadoDigital.findMany({
    where: { empresaId, documento: doc, status: { in: STATUS_VIGENTE }, arquivado: false },
    select: { id: true, titular: true, expiraEm: true, arquivoHash: true, clienteId: true, socioId: true },
    orderBy: { expiraEm: 'desc' },
  })
}

/**
 * Marca os substituídos como RENOVADO, com a trilha de cada um apontando o
 * novo, e tira as notificações pendentes deles do sino.
 */
export async function marcarSubstituidos(
  substituidos: CertVigente[],
  novoId: string,
  audit: { userId?: string; ipAddress?: string; userAgent?: string },
): Promise<void> {
  if (substituidos.length === 0) return
  const ids = substituidos.map(s => s.id)
  await prisma.certificadoDigital.updateMany({ where: { id: { in: ids } }, data: { status: 'RENOVADO' } })
  for (const id of ids) {
    await prisma.certificadoDigitalAcesso.create({
      data: {
        certificadoId: id,
        userId: audit.userId || null,
        acao: 'renovado',
        detalhes: `Substituído automaticamente pela versão ${novoId} (mesmo documento)`,
        ipAddress: audit.ipAddress || null,
        userAgent: audit.userAgent || null,
      },
    }).catch(() => null)
    await prisma.notification.deleteMany({
      where: { origem: 'gestao-certificados', link: { contains: id } },
    }).catch(() => null)
  }
}

/**
 * Variante das importações em lote, que não têm a quem perguntar: o mesmo
 * arquivo e o que vence ANTES do vigente são pulados (com o motivo, para o
 * log); o resto substitui. Chame `marcarSubstituidos` depois de gravar o novo.
 */
export async function substituicaoEmLote(
  empresaId: string | null,
  novo: { documento: string; expiraEm: Date; arquivoHash: string },
): Promise<{ pular: string } | { parentId: string | null; substituidos: CertVigente[] }> {
  const decisao = decidirSubstituicao(novo, await buscarVigentes(empresaId, novo.documento))
  if (decisao.acao === 'DUPLICADO') return { pular: `${mensagemDuplicado(decisao.existente)} Ignorado.` }
  if (decisao.acao === 'CONFIRMAR') {
    return { pular: `Já existe um certificado mais recente deste documento (vence em ${decisao.atual.expiraEm.toLocaleDateString('pt-BR')}). Ignorado.` }
  }
  if (decisao.acao === 'SUBSTITUIR') return { parentId: decisao.atual.id, substituidos: decisao.substituidos }
  return { parentId: null, substituidos: [] }
}

/** Mensagem única para o usuário quando o arquivo já está cadastrado. */
export function mensagemDuplicado(existente: CertVigente): string {
  return `Este certificado já está cadastrado (${existente.titular}, vence em ${existente.expiraEm.toLocaleDateString('pt-BR')}).`
}
