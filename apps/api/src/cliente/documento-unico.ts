import { prisma } from '@saas/db'
import { limparCnpj, isValidDocumento } from './documento.util'

/**
 * Trava de duplicidade de cliente pelo documento.
 *
 * REGRA CENTRAL: só trava quando o documento é uma IDENTIDADE CONFIÁVEL.
 * Cliente em constituição ainda não tem CNPJ — e vários deles convivem no
 * cadastro ao mesmo tempo. Tratar "sem documento" como duplicata impediria o
 * escritório de cadastrar o segundo cliente em abertura, que é justamente o
 * começo da relação comercial. Por isso, NÃO travam:
 *
 *   - documento vazio (o caso do cliente em constituição);
 *   - placeholder de caractere repetido (00000000000000, 11111111111, ...),
 *     que é como alguns cadastros antigos registraram "não tem CNPJ";
 *   - documento incompleto ou com DV inválido — não serve de identidade, e
 *     barrar por ele bloquearia um cadastro legítimo por causa de um lixo
 *     que outro registro carrega.
 *
 * Nesses casos a unicidade não existe por documento. A proteção possível é o
 * aviso por nome parecido (`buscarSimilaresPorNome`), que sugere sem impedir.
 */

/**
 * Chave de identidade do documento, ou `null` quando o documento não identifica
 * ninguém (vazio / placeholder / inválido).
 */
export function chaveDocumento(documento: string | null | undefined): string | null {
  const limpo = limparCnpj(documento)
  if (!limpo) return null
  // Placeholder de caractere repetido — "sem documento" escrito com zeros.
  if (/^(.)\1+$/.test(limpo)) return null
  if (!isValidDocumento(limpo)) return null
  return limpo
}

export interface ClienteDuplicado {
  id: string
  code: number
  razaoSocial: string
  isActive: boolean
}

/**
 * Procura um cliente ATIVO (não excluído) da mesma empresa com o mesmo
 * documento. Compara NORMALIZADO no banco — parte da base foi gravada com
 * máscara ("23.361.130/0001-55") e parte sem, então um `where` literal deixaria
 * passar justamente as duplicatas que existem hoje.
 */
export async function buscarClientePorDocumento(
  documento: string | null | undefined,
  empresaId: string | null | undefined,
  ignorarId?: string,
): Promise<ClienteDuplicado | null> {
  const chave = chaveDocumento(documento)
  if (!chave || !empresaId) return null

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; code: number; razao_social: string; is_active: boolean }>>(
    `SELECT id, code, razao_social, is_active
       FROM clientes
      WHERE empresa_id = $1
        AND deleted_at IS NULL
        AND ($3::text IS NULL OR id <> $3)
        AND upper(regexp_replace(documento, '[^0-9A-Za-z]', '', 'g')) = $2
      LIMIT 1`,
    empresaId,
    chave,
    ignorarId ?? null,
  ).catch(() => [])

  const r = rows[0]
  return r ? { id: r.id, code: r.code, razaoSocial: r.razao_social, isActive: r.is_active } : null
}

/**
 * Recusa a gravação quando o documento já pertence a outro cliente da empresa.
 * A mensagem diz QUAL cadastro ocupa o documento — sem isso o usuário só sabe
 * que não pode, não o que fazer.
 */
export async function assertDocumentoUnico(
  documento: string | null | undefined,
  empresaId: string | null | undefined,
  ignorarId?: string,
): Promise<void> {
  const existente = await buscarClientePorDocumento(documento, empresaId, ignorarId)
  if (!existente) return
  throw new Error(
    existente.isActive
      ? `Este CNPJ/CPF já está no cliente #${existente.code} — ${existente.razaoSocial}.`
      : `Este CNPJ/CPF pertence ao cliente #${existente.code} — ${existente.razaoSocial}, que está inativo. `
        + 'Reative aquele cadastro em vez de criar um novo, para não separar o histórico.',
  )
}

/**
 * Clientes com nome parecido na empresa — a rede de proteção de quem NÃO tem
 * documento (cliente em constituição). Serve para AVISAR, nunca para bloquear:
 * duas empresas do mesmo grupo podem legitimamente ter nomes quase iguais.
 */
export async function buscarSimilaresPorNome(
  razaoSocial: string | null | undefined,
  empresaId: string | null | undefined,
  ignorarId?: string,
): Promise<ClienteDuplicado[]> {
  const nome = String(razaoSocial ?? '').trim()
  if (nome.length < 4 || !empresaId) return []

  // Compara sem acento, sem pontuação e sem espaço repetido — "FAMÍLIA BERTOLLO"
  // e "Familia Bertollo " são o mesmo nome para quem digitou.
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; code: number; razao_social: string; is_active: boolean }>>(
    `SELECT id, code, razao_social, is_active
       FROM clientes
      WHERE empresa_id = $1
        AND deleted_at IS NULL
        AND ($3::text IS NULL OR id <> $3)
        AND regexp_replace(lower(unaccent(razao_social)), '[^a-z0-9]', '', 'g')
          = regexp_replace(lower(unaccent($2)), '[^a-z0-9]', '', 'g')
      LIMIT 5`,
    empresaId,
    nome,
    ignorarId ?? null,
  ).catch(async () => {
    // `unaccent` é extensão do Postgres e pode não estar instalada — cai para a
    // comparação sem remoção de acento, que ainda pega a maioria dos casos.
    return prisma.$queryRawUnsafe<Array<{ id: string; code: number; razao_social: string; is_active: boolean }>>(
      `SELECT id, code, razao_social, is_active
         FROM clientes
        WHERE empresa_id = $1
          AND deleted_at IS NULL
          AND ($3::text IS NULL OR id <> $3)
          AND regexp_replace(lower(razao_social), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower($2), '[^a-z0-9]', '', 'g')
        LIMIT 5`,
      empresaId,
      nome,
      ignorarId ?? null,
    ).catch(() => [])
  })

  return rows.map((r) => ({ id: r.id, code: r.code, razaoSocial: r.razao_social, isActive: r.is_active }))
}
