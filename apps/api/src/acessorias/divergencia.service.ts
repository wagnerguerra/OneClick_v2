import { Injectable } from '@nestjs/common'
import { prisma } from '@saas/db'
import { AcessoriasService } from './acessorias.service'

/**
 * Relatório de divergências entre o cadastro de clientes do OneClick e as
 * empresas do Acessórias.
 *
 * Contexto: a sincronização com o Acessórias baixa 11 campos por empresa e usa
 * apenas 2 (`ID` e `Identificador`) para amarrar a identidade. Os outros 9 são
 * descartados a cada rodada — e é justamente onde moram as divergências que o
 * time descobre no pior momento (razão social diferente na guia, telefone que
 * não atende, cliente ativo aqui e encerrado lá).
 *
 * Este serviço só COMPARA. Aplicar é uma ação separada e explícita, campo a
 * campo: os dois lados podem estar certos — o Acessórias reflete a Receita, e o
 * nosso cadastro às vezes carrega o nome pelo qual o cliente é conhecido. Quem
 * decide é o time, não a máquina.
 */

/** Campos que dá para conciliar, com o caminho dos dois lados. */
const CAMPOS = [
  { chave: 'razaoSocial', label: 'Razão social', acessorias: 'Razao', tipo: 'texto' },
  { chave: 'nomeFantasia', label: 'Nome fantasia', acessorias: 'Fantasia', tipo: 'texto' },
  { chave: 'telefone', label: 'Telefone', acessorias: 'Telefone', tipo: 'telefone' },
  { chave: 'uf', label: 'UF', acessorias: 'UF', tipo: 'uf' },
  { chave: 'dataEntrada', label: 'Cliente desde', acessorias: 'ClienteDesde', tipo: 'data' },
  { chave: 'dataSaida', label: 'Cliente até', acessorias: 'ClienteAte', tipo: 'data' },
  { chave: 'status', label: 'Situação cadastral', acessorias: 'Status', tipo: 'status' },
] as const

type ChaveCampo = (typeof CAMPOS)[number]['chave']

export interface DivergenciaCampo {
  campo: ChaveCampo
  label: string
  nosso: string | null
  deles: string | null
  /** true quando o nosso lado está vazio — aplicar aqui é preencher, não trocar. */
  apenasCompleta: boolean
}

export interface ClienteDivergente {
  clienteId: string
  code: number
  razaoSocial: string
  documento: string
  idAcessorias: number | null
  divergencias: DivergenciaCampo[]
  /** Informativo, não aplicável: o honorário do Acessórias × contrato ativo. */
  honorarioAcessorias: number | null
}

export interface RelatorioDivergencias {
  clientes: ClienteDivergente[]
  /** Empresas no Acessórias sem cliente correspondente aqui. */
  somenteNoAcessorias: Array<{ id: number; documento: string; razaoSocial: string; status: string }>
  /** Clientes nossos com vínculo ao Acessórias que não aparece mais na listagem de lá. */
  somenteNoOneClick: Array<{ clienteId: string; code: number; razaoSocial: string; idAcessorias: number }>
  totais: {
    empresasAcessorias: number
    clientesComparados: number
    clientesComDivergencia: number
    divergencias: number
  }
}

// ── Normalizações usadas na comparação ────────────────────────
const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const semAcento = (v: unknown) =>
  String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')
const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''

/** O Acessórias usa 0000-00-00 como "sem data" — não é data, é placeholder. */
function dataDeles(v: unknown): string | null {
  const s = String(v ?? '').trim()
  if (!s || s.startsWith('0000')) return null
  const d = new Date(`${s}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : s.slice(0, 10)
}
function dataNossa(v: Date | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
/** "Ativa"/"Inativa" do Acessórias → o enum do nosso cadastro. */
function statusDeles(v: unknown): string | null {
  const s = semAcento(v)
  if (!s) return null
  if (s.startsWith('ativ')) return 'ATIVA'
  if (s.startsWith('inativ')) return 'INATIVA'
  if (s.startsWith('suspens')) return 'SUSPENSA'
  if (s.startsWith('baixad')) return 'BAIXADA'
  return null
}

@Injectable()
export class DivergenciaAcessoriasService {
  constructor(private readonly acessorias: AcessoriasService) {}

  get camposDisponiveis() {
    return CAMPOS.map((c) => ({ chave: c.chave, label: c.label }))
  }

  /**
   * Baixa todas as páginas de `/companies/ListAll` e compara com o cadastro.
   *
   * Custo: ~20 empresas por página. Para a carteira atual dá algo em torno de
   * 70 requisições, com pausa de 250ms entre elas — bem abaixo do limite de 100
   * por minuto. É um relatório sob demanda, não um polling.
   */
  async gerar(_isMaster: boolean, empresaId?: string): Promise<RelatorioDivergencias> {
    const empresas = await this.baixarEmpresas()

    const clientes = await prisma.cliente.findMany({
      // Mesmo recorte da sincronização: ativo e mensal. Comparar prospect e
      // avulso encheria o relatório de divergência que ninguém vai conciliar.
      where: {
        deletedAt: null, status: 'ATIVA', situacao: 'MENSAL',
        ...(empresaId ? { empresaId } : {}),
      },
      select: {
        id: true, code: true, razaoSocial: true, nomeFantasia: true, documento: true,
        telefone: true, uf: true, dataEntrada: true, dataSaida: true, status: true,
        idAcessorias: true,
      },
    })

    // Índices para o casamento: por id do Acessórias e por CNPJ normalizado.
    const porId = new Map<number, Record<string, unknown>>()
    const porDoc = new Map<string, Record<string, unknown>>()
    for (const e of empresas) {
      const id = Number(e.ID ?? 0)
      const doc = soDigitos(e.Identificador)
      if (id) porId.set(id, e)
      if (doc.length === 14) porDoc.set(doc, e)
    }

    const usadas = new Set<Record<string, unknown>>()
    const resultado: ClienteDivergente[] = []
    const somenteNoOneClick: RelatorioDivergencias['somenteNoOneClick'] = []
    let comparados = 0

    for (const c of clientes) {
      const doc = soDigitos(c.documento)
      const emp = (c.idAcessorias ? porId.get(c.idAcessorias) : undefined)
        ?? (doc.length === 14 ? porDoc.get(doc) : undefined)

      if (!emp) {
        if (c.idAcessorias) {
          somenteNoOneClick.push({
            clienteId: c.id, code: c.code, razaoSocial: c.razaoSocial, idAcessorias: c.idAcessorias,
          })
        }
        continue
      }
      usadas.add(emp)
      comparados++

      const divergencias = this.compararCliente(c, emp)
      const honorario = Number(String(emp.Honorario ?? '0').replace(',', '.'))

      if (divergencias.length > 0) {
        resultado.push({
          clienteId: c.id,
          code: c.code,
          razaoSocial: c.razaoSocial,
          documento: c.documento,
          idAcessorias: c.idAcessorias,
          divergencias,
          honorarioAcessorias: Number.isFinite(honorario) && honorario > 0 ? honorario : null,
        })
      }
    }

    const somenteNoAcessorias = empresas
      .filter((e) => !usadas.has(e))
      .map((e) => ({
        id: Number(e.ID ?? 0),
        documento: soDigitos(e.Identificador),
        razaoSocial: String(e.Razao ?? ''),
        status: String(e.Status ?? ''),
      }))
      // Sem CNPJ válido não há como casar nem cadastrar — não ajuda no relatório.
      .filter((e) => e.documento.length === 14)

    // Mais divergências primeiro: é onde o cadastro está mais desencontrado.
    resultado.sort((a, b) => b.divergencias.length - a.divergencias.length)

    return {
      clientes: resultado,
      somenteNoAcessorias,
      somenteNoOneClick,
      totais: {
        empresasAcessorias: empresas.length,
        clientesComparados: comparados,
        clientesComDivergencia: resultado.length,
        divergencias: resultado.reduce((s, c) => s + c.divergencias.length, 0),
      },
    }
  }

  /** Percorre a paginação de /companies/ListAll até a página vir vazia. */
  private async baixarEmpresas(): Promise<Array<Record<string, unknown>>> {
    const todas: Array<Record<string, unknown>> = []
    let pagina = 1
    while (pagina <= 200) {
      const res = await this.acessorias.exploreEndpoint('/companies/ListAll', { Pagina: pagina })
      if (!res.ok) {
        if (pagina === 1) throw new Error(res.error || 'Não foi possível consultar o Acessórias.')
        break
      }
      const lista = Array.isArray(res.data) ? (res.data as Array<Record<string, unknown>>) : []
      if (lista.length === 0) break
      todas.push(...lista)
      pagina++
      await new Promise((r) => setTimeout(r, 250))
    }
    return todas
  }

  private compararCliente(
    c: {
      razaoSocial: string; nomeFantasia: string | null; telefone: string | null; uf: string | null
      dataEntrada: Date | null; dataSaida: Date | null; status: string
    },
    emp: Record<string, unknown>,
  ): DivergenciaCampo[] {
    const out: DivergenciaCampo[] = []

    for (const def of CAMPOS) {
      let nosso: string | null
      let deles: string | null
      let iguais: boolean

      switch (def.tipo) {
        case 'telefone': {
          nosso = c.telefone ?? null
          deles = vazio(emp[def.acessorias]) ? null : String(emp[def.acessorias])
          iguais = soDigitos(nosso) === soDigitos(deles)
          break
        }
        case 'uf': {
          nosso = c.uf ?? null
          deles = vazio(emp[def.acessorias]) ? null : String(emp[def.acessorias]).toUpperCase()
          iguais = String(nosso ?? '').toUpperCase().trim() === String(deles ?? '').trim()
          break
        }
        case 'data': {
          nosso = dataNossa(def.chave === 'dataEntrada' ? c.dataEntrada : c.dataSaida)
          deles = dataDeles(emp[def.acessorias])
          iguais = nosso === deles
          break
        }
        case 'status': {
          nosso = c.status
          deles = statusDeles(emp[def.acessorias])
          // Status que não sabemos traduzir não vira divergência — seria ruído.
          iguais = deles === null || nosso === deles
          break
        }
        default: {
          nosso = def.chave === 'razaoSocial' ? c.razaoSocial : c.nomeFantasia
          deles = vazio(emp[def.acessorias]) ? null : String(emp[def.acessorias]).trim()
          iguais = semAcento(nosso) === semAcento(deles)
        }
      }

      // Campo vazio dos dois lados não é divergência. Campo vazio SÓ do lado
      // deles também não: o Acessórias não ter o telefone não significa que o
      // nosso está errado — nunca sugerimos apagar dado nosso.
      if (iguais || deles === null) continue

      out.push({
        campo: def.chave,
        label: def.label,
        nosso: vazio(nosso) ? null : String(nosso),
        deles,
        apenasCompleta: vazio(nosso),
      })
    }

    return out
  }

  /**
   * Aplica no nosso cadastro os valores do Acessórias, campo a campo, só para o
   * que foi explicitamente escolhido na tela.
   */
  async aplicar(
    itens: Array<{ clienteId: string; campos: string[] }>,
    userId: string | undefined,
    isMaster: boolean,
    empresaId?: string,
  ) {
    const relatorio = await this.gerar(isMaster, empresaId)
    const porCliente = new Map(relatorio.clientes.map((c) => [c.clienteId, c]))

    let aplicados = 0
    const ignorados: string[] = []

    for (const item of itens) {
      const div = porCliente.get(item.clienteId)
      if (!div) { ignorados.push(item.clienteId); continue }

      const data: Record<string, unknown> = {}
      for (const campo of item.campos) {
        const d = div.divergencias.find((x) => x.campo === campo)
        if (!d || d.deles === null) continue
        if (campo === 'dataEntrada' || campo === 'dataSaida') {
          data[campo] = new Date(`${d.deles}T00:00:00`)
        } else {
          data[campo] = d.deles
        }
      }
      if (Object.keys(data).length === 0) continue

      const antes = await prisma.cliente.findUnique({
        where: { id: item.clienteId }, select: { version: true },
      })
      await prisma.cliente.update({
        where: { id: item.clienteId },
        data: { ...data, version: (antes?.version ?? 0) + 1 },
      })
      // Registra no histórico do cliente de onde veio a alteração — sem isso,
      // amanhã ninguém sabe por que a razão social mudou sozinha.
      await prisma.clienteEvent.create({
        data: {
          clienteId: item.clienteId,
          userId: userId ?? null,
          type: 'updated',
          version: (antes?.version ?? 0) + 1,
          changes: { origem: 'conciliacao-acessorias', campos: data } as never,
        },
      }).catch(() => null)
      aplicados++
    }

    return { aplicados, ignorados: ignorados.length }
  }
}
