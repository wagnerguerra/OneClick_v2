'use client'

import { Tag, Columns3, ArrowLeftRight, Network, type LucideIcon } from 'lucide-react'
import { Badge } from '@saas/ui'
import { cn } from '@saas/ui'
import type { TreatmentDefinition, Direcao } from '@saas/types'

// ============================================================
// Visão geral read-only de uma versão do Modelo de Tratamento.
//
// Renderiza a definição (snapshot) em seções, igual à "visão geral" do editor,
// mas só-leitura. Quando recebe `compareTo` (outra versão de referência), marca
// os campos que diferem dela — o usuário vê o conteúdo da versão COM os diffs
// destacados em cada campo. `compareLabel` nomeia a referência nas anotações
// (ex.: "versão atual" ao visualizar uma versão antiga, ou "v2" ao comparar duas).
// ============================================================

const EMPTY = '—'
const txt = (v: string | undefined | null) => (v && String(v).trim() ? String(v) : EMPTY)

const DIRECAO_LABEL: Record<Direcao, string> = { DEBITO: 'Débito', CREDITO: 'Crédito' }
const dirTxt = (d?: Direcao | '') => (d ? DIRECAO_LABEL[d] : EMPTY)

const DC_TIPO_LABEL: Record<TreatmentDefinition['debitoCredito']['tipo'], string> = {
  COLUNA: 'Por coluna', DESCRICAO: 'Pela descrição',
}
const CP_MODO_LABEL: Record<TreatmentDefinition['contrapartida']['modo'], string> = {
  PALAVRA_CHAVE: 'Por palavra-chave', DESCRICAO: 'Por descrição',
}
const COLUMN_LABELS: Record<keyof TreatmentDefinition['columnMapping'], string> = {
  descricao: 'Descrição do lançamento', valor: 'Valor', data: 'Data',
  participante: 'Participante', numeroNf: 'Número da NF', documento: 'CNPJ/CPF',
}

interface Props {
  def: TreatmentDefinition
  /** Versão de referência para destacar diferenças. */
  compareTo?: TreatmentDefinition | null
  /** Nome da referência usado nas anotações de diff. Padrão: "versão atual". */
  compareLabel?: string
  /**
   * Cronologia: true se a versão EXIBIDA (`def`) é mais NOVA que a comparada.
   * Define a direção do diff (antigo → novo): item só na mais nova = adicionado,
   * só na mais antiga = removido — independente de qual está sendo visualizada.
   * Padrão true (ex.: visualizar versão antiga vs. atual → atual é a mais nova,
   * então passamos false explicitamente).
   */
  defIsNewer?: boolean
}

/**
 * Classifica um item que existe em apenas um dos lados como adição/remoção,
 * pela cronologia: existe só na versão mais nova → 'add'; só na mais antiga → 'remove'.
 */
function changeKind(onlyInDef: boolean, defIsNewer: boolean): 'add' | 'remove' {
  const inNewer = onlyInDef ? defIsNewer : !defIsNewer
  return inNewer ? 'add' : 'remove'
}

export function VersionOverview({ def, compareTo, compareLabel = 'versão atual', defIsNewer = true }: Props) {
  const cmp = !!compareTo
  return (
    <div className="space-y-4">
      <Section icon={Tag} title="Dados">
        <FieldGrid>
          <ReadField label="Conta corrente" value={def.contaCorrente} current={compareTo?.contaCorrente} hasCompare={cmp} compareLabel={compareLabel} />
        </FieldGrid>
      </Section>

      <Section icon={Columns3} title="De/Para de colunas">
        <FieldGrid>
          {(Object.keys(COLUMN_LABELS) as Array<keyof TreatmentDefinition['columnMapping']>).map((k) => (
            <ReadField
              key={k}
              label={COLUMN_LABELS[k]}
              value={def.columnMapping[k]}
              current={compareTo?.columnMapping[k]}
              hasCompare={cmp}
              compareLabel={compareLabel}
            />
          ))}
        </FieldGrid>
      </Section>

      <Section icon={ArrowLeftRight} title="Débito / Crédito">
        <FieldGrid>
          <ReadField label="Modo" value={DC_TIPO_LABEL[def.debitoCredito.tipo]} current={compareTo && DC_TIPO_LABEL[compareTo.debitoCredito.tipo]} hasCompare={cmp} compareLabel={compareLabel} />
          {def.debitoCredito.tipo === 'COLUNA' && (
            <ReadField label="Coluna" value={def.debitoCredito.coluna} current={compareTo?.debitoCredito.coluna} hasCompare={cmp} compareLabel={compareLabel} />
          )}
        </FieldGrid>
        {def.debitoCredito.tipo === 'COLUNA' ? (
          <KeyedList
            items={def.debitoCredito.mapa.map((m) => ({ key: m.valor, label: m.valor, value: dirTxt(m.direcao) }))}
            current={compareTo?.debitoCredito.mapa.map((m) => ({ key: m.valor, value: dirTxt(m.direcao) }))}
            hasCompare={cmp}
            compareLabel={compareLabel}
            defIsNewer={defIsNewer}
            emptyHint="Nenhum valor mapeado."
          />
        ) : (
          <p className="text-xs text-muted-foreground italic">A direção é definida em cada item de contrapartida.</p>
        )}
      </Section>

      <Section icon={Network} title="Contrapartida">
        <FieldGrid>
          <ReadField label="Modo" value={CP_MODO_LABEL[def.contrapartida.modo]} current={compareTo && CP_MODO_LABEL[compareTo.contrapartida.modo]} hasCompare={cmp} compareLabel={compareLabel} />
        </FieldGrid>
        <ContrapartidaList def={def} compareTo={compareTo} compareLabel={compareLabel} defIsNewer={defIsNewer} />
      </Section>
    </div>
  )
}

// ---- Lista de contrapartida (palavra-chave OU descrição) -------------------
type CpItem = { conta: string; historicoFixo?: string; direcao?: Direcao }

function ContrapartidaList({ def, compareTo, compareLabel, defIsNewer }: { def: TreatmentDefinition; compareTo?: TreatmentDefinition | null; compareLabel: string; defIsNewer: boolean }) {
  const isPC = def.contrapartida.modo === 'PALAVRA_CHAVE'
  const keyOf = (it: unknown) => (isPC ? (it as { palavraChave: string }).palavraChave : (it as { descricao: string }).descricao)
  const itens = isPC ? def.contrapartida.palavraChave : def.contrapartida.descricao
  const currentItens = compareTo ? (isPC ? compareTo.contrapartida.palavraChave : compareTo.contrapartida.descricao) : []
  const currentMap = new Map(currentItens.map((it) => [keyOf(it), it]))
  const keyLabel = isPC ? 'Palavra-chave' : 'Descrição'

  // Itens presentes só na referência (não existem na versão exibida).
  const defKeys = new Set(itens.map(keyOf))
  const soNaRef = compareTo ? currentItens.filter((it) => !defKeys.has(keyOf(it))) : []

  if (!itens.length && !soNaRef.length) return <p className="text-xs text-muted-foreground italic">Nenhum item mapeado.</p>

  return (
    <div className="overflow-hidden rounded-[2px] border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">{keyLabel}</th>
            <th className="px-2 py-1.5 text-left font-medium w-[120px]">Conta</th>
            <th className="px-2 py-1.5 text-left font-medium">Histórico fixo</th>
            <th className="px-2 py-1.5 text-left font-medium w-[90px]">Direção</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {itens.map((it, i) => {
            const chave = keyOf(it)
            const cur = currentMap.get(chave) as CpItem | undefined
            const onlyDef = !!compareTo && !cur
            const kind = onlyDef ? changeKind(true, defIsNewer) : null
            const d = it as CpItem
            return (
              <tr key={chave + i} className={cn(rowBg(kind))}>
                <td className="px-2 py-1.5 max-w-[220px]">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('min-w-0 truncate', kind === 'remove' && 'line-through')} title={chave}>{txt(chave)}</span>
                    {kind && <ChangeBadge kind={kind} />}
                  </div>
                </td>
                {kind ? (
                  <>
                    <PlainCell value={d.conta} strike={kind === 'remove'} />
                    <PlainCell value={d.historicoFixo} strike={kind === 'remove'} />
                    <PlainCell value={dirTxt(d.direcao)} strike={kind === 'remove'} />
                  </>
                ) : (
                  <>
                    <Cell value={d.conta} current={cur?.conta} hasCompare={!!compareTo} compareLabel={compareLabel} />
                    <Cell value={d.historicoFixo} current={cur?.historicoFixo} hasCompare={!!compareTo} compareLabel={compareLabel} />
                    <Cell value={dirTxt(d.direcao)} current={dirTxt(cur?.direcao)} hasCompare={!!compareTo} compareLabel={compareLabel} />
                  </>
                )}
              </tr>
            )
          })}
          {soNaRef.map((it, i) => {
            const chave = keyOf(it)
            const d = it as CpItem
            const kind = changeKind(false, defIsNewer)
            return (
              <tr key={'ref' + chave + i} className={cn(rowBg(kind))}>
                <td className="px-2 py-1.5 max-w-[220px]">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('min-w-0 truncate', kind === 'remove' && 'line-through')} title={chave}>{txt(chave)}</span>
                    <ChangeBadge kind={kind} />
                  </div>
                </td>
                <PlainCell value={d.conta} strike={kind === 'remove'} />
                <PlainCell value={d.historicoFixo} strike={kind === 'remove'} />
                <PlainCell value={dirTxt(d.direcao)} strike={kind === 'remove'} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function rowBg(kind: 'add' | 'remove' | null) {
  if (kind === 'add') return 'bg-emerald-50/60 dark:bg-emerald-950/20'
  if (kind === 'remove') return 'bg-rose-50/50 text-muted-foreground dark:bg-rose-950/20'
  return ''
}
function ChangeBadge({ kind }: { kind: 'add' | 'remove' }) {
  return <Badge variant="secondary" className="shrink-0 align-middle text-[9px] no-underline">{kind === 'add' ? 'adicionado' : 'removido'}</Badge>
}
function PlainCell({ value, strike }: { value?: string | null; strike?: boolean }) {
  return <td className={cn('px-2 py-1.5', strike && 'line-through')}>{txt(value)}</td>
}

// ---- Primitivos de exibição ------------------------------------------------
function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[4px] border border-border/60 bg-card p-3 space-y-3">
      <div className="flex items-center gap-2 border-b border-border/50 pb-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-muted text-muted-foreground"><Icon className="h-3 w-3" /></span>
        <h3 className="text-[12px] font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

/** Indica diferença (valores normalizados a "—" antes de comparar). */
function isDiff(value: string | undefined | null, current: string | undefined | null) {
  return txt(value) !== txt(current)
}

function ReadField({ label, value, current, hasCompare, compareLabel }: { label: string; value?: string | null; current?: string | null; hasCompare: boolean; compareLabel: string }) {
  const diff = hasCompare && isDiff(value, current)
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p className={cn('text-sm', diff ? 'rounded-[3px] bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300' : 'text-foreground')}>
        {txt(value)}
      </p>
      {diff && <p className="text-[10px] text-muted-foreground">{compareLabel}: <span className="text-rose-600 dark:text-rose-400">{txt(current)}</span></p>}
    </div>
  )
}

/** Célula de tabela com destaque de diff (usada na lista de contrapartida). */
function Cell({ value, current, hasCompare, compareLabel }: { value?: string | null; current?: string | null; hasCompare: boolean; compareLabel: string }) {
  const diff = hasCompare && isDiff(value, current)
  return (
    <td className={cn('px-2 py-1.5', diff && 'bg-amber-50/70 dark:bg-amber-950/20')}>
      <span className={cn(diff && 'font-medium text-amber-800 dark:text-amber-300')}>{txt(value)}</span>
      {diff && <span className="block text-[10px] text-muted-foreground">{compareLabel}: <span className="text-rose-600 dark:text-rose-400">{txt(current)}</span></span>}
    </td>
  )
}

/** Lista chave→valor (mapa de Débito/Crédito) com destaque de diff vs. referência. */
function KeyedList({ items, current, hasCompare, compareLabel, defIsNewer, emptyHint }: {
  items: Array<{ key: string; label: string; value: string }>
  current?: Array<{ key: string; value: string }>
  hasCompare: boolean
  compareLabel: string
  defIsNewer: boolean
  emptyHint: string
}) {
  const curMap = new Map((current ?? []).map((c) => [c.key, c.value]))
  const defKeys = new Set(items.map((i) => i.key))
  const soNaRef = hasCompare ? (current ?? []).filter((c) => !defKeys.has(c.key)) : []

  if (!items.length && !soNaRef.length) return <p className="text-xs text-muted-foreground italic">{emptyHint}</p>
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {items.map((it) => {
        const exists = curMap.has(it.key)
        const curVal = curMap.get(it.key)
        const onlyDef = hasCompare && !exists
        const kind = onlyDef ? changeKind(true, defIsNewer) : null
        const diff = hasCompare && exists && isDiff(it.value, curVal)
        return (
          <div key={it.key} className={cn('flex items-center gap-2 rounded-[2px] border border-border/60 px-2 py-1 text-xs',
            kind ? rowBg(kind) : diff ? 'bg-amber-50/70 dark:bg-amber-950/20' : 'bg-muted/20')}>
            <span className={cn('min-w-0 flex-1 truncate', kind === 'remove' && 'line-through')} title={it.label}>{it.label}</span>
            <span className={cn('shrink-0 font-medium', kind === 'remove' && 'line-through', diff && 'text-amber-800 dark:text-amber-300')}>{it.value}</span>
            {kind && <ChangeBadge kind={kind} />}
            {diff && <span className="text-[10px] text-muted-foreground">({compareLabel}: <span className="text-rose-600 dark:text-rose-400">{txt(curVal)}</span>)</span>}
          </div>
        )
      })}
      {soNaRef.map((c) => {
        const kind = changeKind(false, defIsNewer)
        return (
          <div key={'ref' + c.key} className={cn('flex items-center gap-2 rounded-[2px] border border-border/60 px-2 py-1 text-xs', rowBg(kind))}>
            <span className={cn('min-w-0 flex-1 truncate', kind === 'remove' && 'line-through')} title={c.key}>{c.key}</span>
            <span className={cn('shrink-0 font-medium', kind === 'remove' && 'line-through')}>{c.value}</span>
            <ChangeBadge kind={kind} />
          </div>
        )
      })}
    </div>
  )
}
