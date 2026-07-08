import type { TreatmentDefinition, Direcao } from '@saas/types'

// ============================================================
// Diff semântico entre duas definições de Modelo de Tratamento.
//
// O versionamento guarda um snapshot COMPLETO em JSON por versão; aqui
// comparamos dois snapshots e produzimos uma lista de mudanças LEGÍVEIS
// (por seção/campo), em vez de um diff de JSON cru.
// ============================================================

export type DiffKind = 'added' | 'removed' | 'changed'

export interface DiffChange {
  /** Rótulo do que mudou (campo/item), em português. */
  label: string
  /** Valor anterior (vazio → "—"). */
  before: string
  /** Valor novo (vazio → "—"). */
  after: string
  kind: DiffKind
}

export interface DiffGroup {
  section: string
  changes: DiffChange[]
}

const EMPTY = '—'
const show = (v: string | undefined | null) => (v && String(v).trim() ? String(v) : EMPTY)

const DIRECAO_LABEL: Record<Direcao, string> = { DEBITO: 'Débito', CREDITO: 'Crédito' }
const dir = (d?: Direcao | '') => (d ? DIRECAO_LABEL[d] : EMPTY)

const COLUMN_FIELD_LABELS: Record<keyof TreatmentDefinition['columnMapping'], string> = {
  descricao: 'Descrição do lançamento',
  valor: 'Valor',
  data: 'Data',
  participante: 'Participante',
  numeroNf: 'Número da NF',
  documento: 'CNPJ/CPF',
}

const DC_TIPO_LABEL: Record<TreatmentDefinition['debitoCredito']['tipo'], string> = {
  COLUNA: 'Por coluna',
  DESCRICAO: 'Pela descrição',
  SINAL: 'Pelo sinal do valor',
}
const CP_MODO_LABEL: Record<TreatmentDefinition['contrapartida']['modo'], string> = {
  PALAVRA_CHAVE: 'Por palavra-chave',
  DESCRICAO: 'Por descrição',
}

/** Decide o tipo da mudança a partir dos dois valores brutos. */
function kindOf(before: unknown, after: unknown): DiffKind {
  const b = before === undefined || before === null || before === ''
  const a = after === undefined || after === null || after === ''
  if (b && !a) return 'added'
  if (!b && a) return 'removed'
  return 'changed'
}

/** Emite uma mudança simples se os valores diferirem (string-comparados). */
function cmpScalar(label: string, before: string, after: string, out: DiffChange[]) {
  if (show(before) === show(after)) return
  out.push({ label, before: show(before), after: show(after), kind: kindOf(before, after) })
}

/**
 * Compara duas listas keyed (mapa chave→atributos) emitindo added/removed/changed.
 * `attrs` define quais atributos de cada item comparar (rótulo + extrator).
 */
function diffKeyed<T>(
  items: { key: string; before?: T; after?: T }[],
  label: (key: string) => string,
  attrs: Array<{ name: string; get: (it: T) => string }>,
  out: DiffChange[],
) {
  for (const { key, before, after } of items) {
    if (before && !after) {
      out.push({ label: label(key), before: 'existia', after: EMPTY, kind: 'removed' })
      continue
    }
    if (!before && after) {
      const detalhe = attrs.map((at) => `${at.name}: ${show(at.get(after))}`).join(' · ')
      out.push({ label: label(key), before: EMPTY, after: detalhe || 'adicionado', kind: 'added' })
      continue
    }
    if (before && after) {
      for (const at of attrs) {
        cmpScalar(`${label(key)} · ${at.name}`, at.get(before), at.get(after), out)
      }
    }
  }
}

/** Constrói a união ordenada de chaves de dois arrays keyed. */
function unionKeyed<T>(base: T[] | undefined, target: T[] | undefined, keyOf: (t: T) => string) {
  const map = new Map<string, { key: string; before?: T; after?: T }>()
  for (const it of base ?? []) map.set(keyOf(it), { key: keyOf(it), before: it })
  for (const it of target ?? []) {
    const k = keyOf(it)
    const cur = map.get(k)
    if (cur) cur.after = it
    else map.set(k, { key: k, after: it })
  }
  return [...map.values()]
}

export function computeDiff(base: TreatmentDefinition, target: TreatmentDefinition): DiffGroup[] {
  const groups: DiffGroup[] = []

  // ---- Contas correntes ----
  {
    const out: DiffChange[] = []
    const ccModo: Record<TreatmentDefinition['contasCorrentes']['modo'], string> = { UNICA: 'Uma conta corrente', MULTIPLAS: 'Várias contas correntes' }
    cmpScalar('Modo', ccModo[base.contasCorrentes.modo], ccModo[target.contasCorrentes.modo], out)
    cmpScalar('Conta única', base.contasCorrentes.unica, target.contasCorrentes.unica, out)
    cmpScalar('Coluna', base.contasCorrentes.coluna, target.contasCorrentes.coluna, out)
    const mapa = unionKeyed(base.contasCorrentes.mapa, target.contasCorrentes.mapa, (m) => m.valor)
    diffKeyed(mapa, (valor) => `Valor "${valor}"`, [{ name: 'Conta', get: (m) => m.conta }], out)
    if (out.length) groups.push({ section: 'Contas correntes', changes: out })
  }

  // ---- De/Para de colunas ----
  {
    const out: DiffChange[] = []
    ;(Object.keys(COLUMN_FIELD_LABELS) as Array<keyof TreatmentDefinition['columnMapping']>).forEach((k) => {
      cmpScalar(COLUMN_FIELD_LABELS[k], base.columnMapping[k] ?? '', target.columnMapping[k] ?? '', out)
    })
    if (out.length) groups.push({ section: 'De/Para de colunas', changes: out })
  }

  // ---- Débito / Crédito ----
  {
    const out: DiffChange[] = []
    cmpScalar('Modo', DC_TIPO_LABEL[base.debitoCredito.tipo], DC_TIPO_LABEL[target.debitoCredito.tipo], out)
    cmpScalar('Coluna', base.debitoCredito.coluna, target.debitoCredito.coluna, out)
    const mapa = unionKeyed(base.debitoCredito.mapa, target.debitoCredito.mapa, (m) => m.valor)
    diffKeyed(
      mapa,
      (valor) => `Valor "${valor}"`,
      [{ name: 'Direção', get: (m) => dir(m.direcao) }],
      out,
    )
    if (out.length) groups.push({ section: 'Débito / Crédito', changes: out })
  }

  // ---- Contrapartida ----
  {
    const out: DiffChange[] = []
    cmpScalar('Modo', CP_MODO_LABEL[base.contrapartida.modo], CP_MODO_LABEL[target.contrapartida.modo], out)

    const pc = unionKeyed(base.contrapartida.palavraChave, target.contrapartida.palavraChave, (it) => it.palavraChave)
    diffKeyed(
      pc,
      (k) => `Palavra-chave "${k}"`,
      [
        { name: 'Conta', get: (it) => it.conta },
        { name: 'Histórico fixo', get: (it) => it.historicoFixo ?? '' },
        { name: 'Direção', get: (it) => dir(it.direcao) },
      ],
      out,
    )

    const desc = unionKeyed(base.contrapartida.descricao, target.contrapartida.descricao, (it) => it.descricao)
    diffKeyed(
      desc,
      (k) => `Descrição "${k}"`,
      [
        { name: 'Conta', get: (it) => it.conta },
        { name: 'Histórico fixo', get: (it) => it.historicoFixo ?? '' },
        { name: 'Direção', get: (it) => dir(it.direcao) },
      ],
      out,
    )
    if (out.length) groups.push({ section: 'Contrapartida', changes: out })
  }

  return groups
}
