import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'

/**
 * Relatório de cadastros de cliente repetidos (Fase A da limpeza).
 *
 * SOMENTE LEITURA. Serve para enxergar o estrago e decidir, grupo a grupo, qual
 * cadastro fica — a mesclagem em si é outra etapa.
 *
 * Um cliente ficou com dois cadastros quando o mesmo CNPJ entrou duas vezes
 * (tipicamente uma importação que não reconheceu o registro já existente). O
 * efeito prático é o histórico partido: os orçamentos ficam pendurados num dos
 * lados e somem da aba do outro.
 */

/** Tabelas que representam o que o usuário reconhece como "o histórico do cliente". */
const VINCULOS = [
  { chave: 'orcamentos', tabela: 'orcamentos', label: 'Orçamentos' },
  { chave: 'contratos', tabela: 'contratos', label: 'Contratos' },
  { chave: 'certificados', tabela: 'certificados_digitais', label: 'Certificados' },
  { chave: 'obrigacoes', tabela: 'cliente_obrigacoes', label: 'Obrigações' },
  { chave: 'servicos', tabela: 'servico_execucoes', label: 'Serviços executados' },
  { chave: 'socios', tabela: 'socios', label: 'Sócios' },
  { chave: 'arquivos', tabela: 'cliente_arquivos', label: 'Arquivos' },
  { chave: 'processos', tabela: 'processos', label: 'Processos' },
  { chave: 'oportunidades', tabela: 'oportunidades', label: 'Oportunidades' },
  { chave: 'ativos', tabela: 'ativos', label: 'Ativos' },
] as const

export interface CadastroDuplicado {
  id: string
  code: number
  razaoSocial: string
  documento: string
  isActive: boolean
  createdAt: Date
  idOneclick: string | null
  idAcessorias: string | null
  /** Contagem por tipo de vínculo — o que se perde de vista no cadastro errado. */
  vinculos: Record<string, number>
  totalVinculos: number
}

export interface GrupoDuplicado {
  documento: string
  cadastros: CadastroDuplicado[]
  /** true quando há histórico em mais de um cadastro — os que exigem atenção. */
  dadoEmMaisDeUm: boolean
  totalVinculos: number
}

@Injectable()
export class DuplicidadeService {
  /** Rótulos dos vínculos, para a tela não repetir a lista. */
  get tiposVinculo() {
    return VINCULOS.map((v) => ({ chave: v.chave, label: v.label }))
  }

  /**
   * Grupos de cadastros que compartilham o mesmo documento.
   *
   * Mesma regra da trava de duplicidade (documento-unico.ts): ignora documento
   * vazio e placeholder de caractere repetido, porque cliente em constituição
   * não tem CNPJ e vários deles convivem legitimamente. Aqui NÃO conferimos o
   * dígito verificador: se dois cadastros carregam o mesmo documento inválido,
   * continuam sendo o mesmo cliente duas vezes e precisam aparecer.
   */
  async listar(
    _isMaster: boolean,
    empresaId: string | undefined,
    opts: { apenasComDado?: boolean } = {},
  ): Promise<{ grupos: GrupoDuplicado[]; totalGrupos: number; totalExcedentes: number }> {
    const contagens = VINCULOS.map(
      (v) => `(SELECT COUNT(*) FROM "${v.tabela}" x WHERE x.cliente_id = c.id) AS "${v.chave}"`,
    ).join(',\n           ')

    const filtroEmpresa = empresaId ? 'AND c.empresa_id = $1' : ''

    const sql = `
      WITH norm AS (
        SELECT c.id, c.code, c.razao_social, c.documento, c.is_active, c.created_at,
               c.id_oneclick, c.id_acessorias,
               upper(regexp_replace(c.documento, '[^0-9A-Za-z]', '', 'g')) AS doc,
               ${contagens}
          FROM clientes c
         WHERE c.status = 'ATIVO'
           AND COALESCE(c.documento, '') <> ''
           ${filtroEmpresa}
      ),
      validos AS (
        SELECT * FROM norm
         WHERE doc <> ''
           -- placeholder de caractere repetido (00000000000000) = "sem CNPJ"
           AND doc <> repeat(left(doc, 1), length(doc))
      ),
      dups AS (SELECT doc FROM validos GROUP BY doc HAVING COUNT(*) > 1)
      SELECT v.* FROM validos v JOIN dups d ON d.doc = v.doc
       ORDER BY v.doc, v.created_at`

    const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      sql,
      ...(filtroEmpresa ? [empresaId] : []),
    ).catch(() => [])

    // Agrupa por documento normalizado, preservando a ordem (mais antigo primeiro).
    const porDoc = new Map<string, CadastroDuplicado[]>()
    for (const r of rows) {
      const vinculos: Record<string, number> = {}
      let total = 0
      for (const v of VINCULOS) {
        const n = Number(r[v.chave] ?? 0)
        vinculos[v.chave] = n
        total += n
      }
      const cadastro: CadastroDuplicado = {
        id: String(r.id),
        code: Number(r.code),
        razaoSocial: String(r.razao_social ?? ''),
        documento: String(r.documento ?? ''),
        isActive: Boolean(r.is_active),
        createdAt: r.created_at as Date,
        idOneclick: r.id_oneclick ? String(r.id_oneclick) : null,
        idAcessorias: r.id_acessorias ? String(r.id_acessorias) : null,
        vinculos,
        totalVinculos: total,
      }
      const doc = String(r.doc)
      const arr = porDoc.get(doc) ?? []
      arr.push(cadastro)
      porDoc.set(doc, arr)
    }

    let grupos: GrupoDuplicado[] = [...porDoc.entries()].map(([documento, cadastros]) => ({
      documento,
      cadastros,
      dadoEmMaisDeUm: cadastros.filter((c) => c.totalVinculos > 0).length > 1,
      totalVinculos: cadastros.reduce((s, c) => s + c.totalVinculos, 0),
    }))

    const totalGrupos = grupos.length
    const totalExcedentes = grupos.reduce((s, g) => s + g.cadastros.length - 1, 0)

    if (opts.apenasComDado) grupos = grupos.filter((g) => g.dadoEmMaisDeUm)

    // Os grupos com histórico dos dois lados primeiro — são os que doem.
    grupos.sort((a, b) => {
      if (a.dadoEmMaisDeUm !== b.dadoEmMaisDeUm) return a.dadoEmMaisDeUm ? -1 : 1
      return b.totalVinculos - a.totalVinculos
    })

    return { grupos, totalGrupos, totalExcedentes }
  }
}
