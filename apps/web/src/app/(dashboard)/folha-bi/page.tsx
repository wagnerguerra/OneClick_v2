'use client'

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { BarChart3, Database, RefreshCw, Table2, LayoutGrid, Landmark, PiggyBank, Receipt, Settings2, X, Plus, Trash2, ChevronUp, ChevronDown, Pencil, Coins, FileSpreadsheet } from 'lucide-react'
import { Card, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'

const MODULE_COLOR = 'var(--mod-trabalhista, #8b5cf6)'
const MESES = ['', 'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function fmtComp(ref: number): string {
  const ano = Math.floor(ref / 100), mes = ref % 100
  return mes === 13 ? `13o/${ano}` : `${String(mes).padStart(2, '0')}/${ano}`
}
function labelMes(mes: number): string {
  return mes === 13 ? '13o salario' : `${String(mes).padStart(2, '0')} · ${MESES[mes] ?? mes}`
}
const brl = (n: unknown) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
    : '—'
const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cell = (n?: number) => (typeof n === 'number' && Math.abs(n) >= 0.005 ? nf.format(n) : '—')

interface CacheRow {
  id: string; clienteId: string; cnpj: string; ref: number
  fonte: string; totalLinhas: number; atualizadoEm: string; razao?: string | null
  clienteRealId?: string | null; clienteRazao?: string | null   // ponte de Cliente (resolvida no backend)
  clienteGrupo?: string | null   // grupo empresarial (Cliente.grupo)
}
// chave de agrupamento do seletor: Cliente real (se vinculado) ou o placeholder da ETL
const vinc = (r: CacheRow) => r.clienteRealId || r.clienteId

export default function FolhaBiPage() {
  const [rows, setRows] = useState<CacheRow[]>([])
  const [loading, setLoading] = useState(true)
  const [snap, setSnap] = useState<any>(null)
  const [loadingSnap, setLoadingSnap] = useState(false)
  const [view, setView] = useState<'resumo' | 'matriz' | 'inss' | 'fgts' | 'irrf' | 'provisoes'>('resumo')
  const [configOpen, setConfigOpen] = useState(false)
  const [groupingNonce, setGroupingNonce] = useState(0)

  // seletores do topo
  const [emp, setEmp] = useState('')     // empresa (Cliente real ou placeholder da ETL)
  const [filial, setFilial] = useState('')   // CNPJ (quando a empresa tem mais de uma filial)
  const [ano, setAno] = useState(0)
  const [mes, setMes] = useState(0)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try { setRows((await trpc.folhaBi.list.query()) as CacheRow[]) } catch { /* */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchList() }, [fetchList])

  // Empresas do seletor: agrupadas pelo Cliente real (se vinculado) ou pelo placeholder da ETL,
  // e organizadas por GRUPO EMPRESARIAL (Cliente.grupo) via optgroup.
  const empresas = useMemo(() => {
    const m = new Map<string, { key: string; razao: string; vinculado: boolean; grupo: string | null; cnpjs: Set<string> }>()
    for (const r of rows) {
      const k = vinc(r)
      let e = m.get(k)
      if (!e) { e = { key: k, razao: r.clienteRazao || r.razao || k, vinculado: !!r.clienteRealId, grupo: r.clienteGrupo || null, cnpjs: new Set() }; m.set(k, e) }
      e.cnpjs.add(r.cnpj)
    }
    return [...m.values()].sort((a, b) => (a.grupo || '￿').localeCompare(b.grupo || '￿', 'pt-BR') || a.razao.localeCompare(b.razao, 'pt-BR'))
  }, [rows])
  // grupos empresariais -> empresas (p/ optgroup)
  const grupos = useMemo(() => {
    const g = new Map<string, typeof empresas>()
    for (const e of empresas) { const k = e.grupo || ''; if (!g.has(k)) g.set(k, []); g.get(k)!.push(e) }
    return [...g.entries()]
  }, [empresas])

  const empresaSel = empresas.find((e) => e.key === emp)
  const filiais = useMemo(() => (empresaSel ? [...empresaSel.cnpjs].sort() : []), [empresaSel])
  const filEff = filiais.length ? (filiais.includes(filial) ? filial : filiais[0]) : ''   // CNPJ efetivo

  const anos = useMemo(() => {
    const s = new Set<number>()
    for (const r of rows) if (vinc(r) === emp && r.cnpj === filEff) s.add(Math.floor(r.ref / 100))
    return [...s].sort((a, b) => b - a)
  }, [rows, emp, filEff])

  const meses = useMemo(() => {
    const s = new Set<number>()
    for (const r of rows) if (vinc(r) === emp && r.cnpj === filEff && Math.floor(r.ref / 100) === ano) s.add(r.ref % 100)
    return [...s].sort((a, b) => a - b) // 01..12, 13o por ultimo
  }, [rows, emp, filEff, ano])

  // Cascata de defaults: garante empresa/ano/mes validos conforme a selecao muda.
  useEffect(() => {
    if (rows.length && !empresas.some((e) => e.key === emp)) setEmp(empresas[0]?.key ?? '')
  }, [rows, empresas, emp])
  useEffect(() => {
    if (emp && !anos.includes(ano)) setAno(anos[0] ?? 0)
  }, [emp, anos, ano])
  useEffect(() => {
    if (emp && ano && !meses.includes(mes)) {
      const mensais = meses.filter((m) => m !== 13)
      setMes(mensais.length ? Math.max(...mensais) : (meses[meses.length - 1] ?? 0))
    }
  }, [emp, ano, meses, mes])

  // Linha do cache resolvida pela selecao (empresa + filial + competencia).
  const row = useMemo(
    () => rows.find((r) => vinc(r) === emp && r.cnpj === filEff && r.ref === ano * 100 + mes) ?? null,
    [rows, emp, filEff, ano, mes],
  )

  useEffect(() => {
    let vivo = true
    if (!row) { setSnap(null); return }
    setLoadingSnap(true); setSnap(null)
    trpc.folhaBi.snapshot.query({ clienteId: row.clienteId, cnpj: row.cnpj, ref: row.ref, fonte: row.fonte })
      .then((data) => { if (vivo) setSnap((data as any)?.payload ?? null) })
      .catch(() => { if (vivo) setSnap(null) })
      .finally(() => { if (vivo) setLoadingSnap(false) })
    return () => { vivo = false }
  }, [row?.id])

  const resumo = snap?.resumo ?? {}
  const autonomos = snap?.autonomos ?? {}
  const matriz = snap?.matriz ?? null

  return (
    <div className="space-y-4">
      {/* Barra de seletores no topo */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-border bg-card/40 px-3 py-2.5">
        <div className="mr-1 flex items-center gap-2 self-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 15%, transparent)` }}>
            <BarChart3 className="h-5 w-5" style={{ color: MODULE_COLOR }} />
          </div>
          <span className="text-sm font-semibold text-foreground">Espelho da Folha</span>
        </div>

        <Select label="Empresa" value={emp} onChange={setEmp} className="min-w-[220px] max-w-[340px]">
          {empresas.length === 0 && <option value="">—</option>}
          {grupos.map(([g, es]) => (
            g
              ? <optgroup key={g} label={g}>{es.map((e) => <option key={e.key} value={e.key}>{e.vinculado ? '✓ ' : ''}{e.razao}</option>)}</optgroup>
              : <Fragment key="__semgrupo">{es.map((e) => <option key={e.key} value={e.key}>{e.vinculado ? '✓ ' : ''}{e.razao}</option>)}</Fragment>
          ))}
        </Select>

        {filiais.length > 1 && (
          <Select label="Filial" value={filEff} onChange={setFilial} className="min-w-[160px]">
            {filiais.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}

        <Select label="Ano" value={String(ano)} onChange={(v) => setAno(Number(v))}>
          {anos.length === 0 && <option value="0">—</option>}
          {anos.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>

        <Select label="Mes" value={String(mes)} onChange={(v) => setMes(Number(v))}>
          {meses.length === 0 && <option value="0">—</option>}
          {meses.map((m) => <option key={m} value={m}>{labelMes(m)}</option>)}
        </Select>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Relatorio</span>
          <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
            <Pill active={view === 'resumo'} onClick={() => setView('resumo')} icon={LayoutGrid} label="Resumo" />
            <Pill active={view === 'matriz'} onClick={() => setView('matriz')} icon={Table2} label="Verbas" />
            <Pill active={view === 'inss'} onClick={() => setView('inss')} icon={Landmark} label="INSS" />
            <Pill active={view === 'fgts'} onClick={() => setView('fgts')} icon={PiggyBank} label="FGTS" />
            <Pill active={view === 'irrf'} onClick={() => setView('irrf')} icon={Receipt} label="IRRF" />
            <Pill active={view === 'provisoes'} onClick={() => setView('provisoes')} icon={Coins} label="Provisões" />
          </div>
        </div>

        <button onClick={fetchList} title="Recarregar lista do cache"
          className="ml-auto flex h-9 items-center gap-1.5 self-end rounded-lg border border-border px-3 text-sm text-foreground hover:bg-muted/40">
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Atualizar
        </button>
      </div>

      {!loading && rows.length === 0 && (
        <Card className="border-dashed p-6">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-5 w-5 shrink-0" style={{ color: MODULE_COLOR }} />
            <div className="space-y-1">
              <p className="font-medium text-foreground">Nenhum dado no cache ainda</p>
              <p className="text-sm text-muted-foreground">A ETL alimenta via <code>POST /api/folha-bi-sync/upload</code>.</p>
            </div>
          </div>
        </Card>
      )}

      {rows.length > 0 && (
        <div className="min-w-0 space-y-3">
          {row && (
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold text-foreground">
                {empresaSel?.razao ?? snap?.razao ?? emp}
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">— {fmtComp(row.ref)}</span>
              </h2>
              <span className="text-xs text-muted-foreground">
                {row.cnpj} · {row.totalLinhas} colaborador(es) · atualizado {new Date(row.atualizadoEm).toLocaleString('pt-BR')}
                {' · '}
                {row.clienteRealId
                  ? <span style={{ color: MODULE_COLOR }}>✓ vinculado ao Cliente {row.clienteRazao}</span>
                  : <span className="text-amber-500/90">sem vinculo (cadastre o Cliente com este CNPJ)</span>}
              </span>
            </div>
          )}

          {!row && <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Selecione empresa, ano e mes acima.</Card>}
          {row && loadingSnap && <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Carregando…</Card>}

          {row && !loadingSnap && snap && view === 'resumo' && (
            <div className="space-y-3">
              <Card className="space-y-4 p-5">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proventos</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat label="Proventos (verbas)" value={brl(resumo.proventos_matriz)} />
                    <Stat label="Autonomos / RPA" value={brl(resumo.rpa_bruto)} />
                    <Stat label="Total de proventos da folha" value={brl(resumo.total_proventos_folha)} strong />
                  </div>
                </div>
                {resumo.descontos_matriz != null && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descontos</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Stat label="Descontos (verbas)" value={brl(resumo.descontos_matriz)} />
                      <Stat label="Autonomos / RPA" value={brl(resumo.rpa_descontos)} />
                      <Stat label="Total de descontos da folha" value={brl(resumo.total_descontos_folha)} strong />
                    </div>
                  </div>
                )}
                {(autonomos?.n != null || autonomos?.sest_senat != null) && (
                  <p className="text-xs text-muted-foreground">Autonomos: {autonomos.n ?? '—'} · SEST/SENAT {brl(autonomos.sest_senat)}</p>
                )}
              </Card>
              <Resumo empresa={snap.empresa} refNum={row.ref} />
            </div>
          )}

          {row && !loadingSnap && snap && view === 'matriz' && (
            matriz
              ? <Matriz m={matriz} empresa={snap.empresa} refNum={row.ref} nonce={groupingNonce} onConfig={() => setConfigOpen(true)} />
              : <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Esta competencia nao tem verbas no cache.</Card>
          )}

          {row && !loadingSnap && snap && view === 'inss' && (
            snap.inss
              ? <Inss inss={snap.inss} />
              : <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Esta competencia nao tem INSS no cache.</Card>
          )}

          {row && !loadingSnap && snap && view === 'fgts' && (
            snap.fgts
              ? <Fgts fgts={snap.fgts} comp={snap.competencia} />
              : <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Esta competencia nao tem FGTS no cache.</Card>
          )}

          {row && !loadingSnap && snap && view === 'irrf' && (
            snap.irrf
              ? <Irrf irrf={snap.irrf} />
              : <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Esta competencia nao tem IRRF no cache.</Card>
          )}

          {row && !loadingSnap && snap && view === 'provisoes' && (
            snap.provisoes
              ? <Provisoes provisoes={snap.provisoes} empresa={snap.empresa} refNum={row.ref} />
              : <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Esta competencia nao tem provisoes no cache.</Card>
          )}
        </div>
      )}

      {configOpen && <ConfigAgrupamento onClose={() => setConfigOpen(false)} onChanged={() => setGroupingNonce((n) => n + 1)} />}
    </div>
  )
}

function Matriz({ m, empresa, refNum, onConfig, nonce }: { m: any; empresa: number; refNum?: number; onConfig?: () => void; nonce?: number }) {
  const [tipo, setTipo] = useState<'proventos' | 'descontos'>('proventos')
  const [baixando, setBaixando] = useState(false)
  const baixarExcel = async () => {
    if (!refNum) return
    setBaixando(true)
    try {
      const r: any = await trpc.folhaBi.planilhaCustos.query({ empresa, ref: refNum })
      const bin = atob(r.base64); const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a = document.createElement('a'); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url)
    } catch { /* */ } finally { setBaixando(false) }
  }
  const [expC, setExpC] = useState<Set<string>>(new Set())   // centros expandidos
  const [expG, setExpG] = useState<Set<number>>(new Set())   // grupos de topo expandidos → subgrupos
  const [expL, setExpL] = useState<Set<string>>(new Set())   // subgrupos expandidos → verbas ('s<id>' / 'outros')
  const [classif, setClassif] = useState<any>(null)          // {esquemas, grupos, regras} do folha_dash (ao vivo)
  const [selEsq, setSelEsq] = useState<number | null>(null)
  const [verbaLeaf, setVerbaLeaf] = useState<Record<string, number>>({})
  const [carregandoG, setCarregandoG] = useState(true)

  // agrupamento AO VIVO do folha_dash → editar + resolver reflete na hora
  const recarregarClassif = useCallback(() => {
    trpc.folhaBi.classif.query().then((c: any) => {
      setClassif(c)
      setSelEsq((prev) => (prev != null && c.esquemas.some((e: any) => e.id === prev)) ? prev : (c.esquemas.find((e: any) => e.ativo)?.id ?? c.esquemas[0]?.id ?? null))
    }).catch(() => {})
  }, [])
  useEffect(() => { recarregarClassif() }, [recarregarClassif])
  useEffect(() => { if (nonce) recarregarClassif() }, [nonce, recarregarClassif])   // recarrega apos aplicar no config
  useEffect(() => {
    if (selEsq == null) return
    let vivo = true; setCarregandoG(true)
    trpc.folhaBi.verbaLeaf.query({ empresa, esquemaId: selEsq })
      .then((vl: any) => { if (vivo) setVerbaLeaf(vl || {}) })
      .catch(() => { if (vivo) setVerbaLeaf({}) })
      .finally(() => { if (vivo) setCarregandoG(false) })
    return () => { vivo = false }
  }, [selEsq, empresa, classif])

  const grupos = useMemo(() => (classif?.grupos ?? []).filter((g: any) => g.esquema_id === selEsq), [classif, selEsq])
  const grupoById = useMemo(() => new Map(grupos.map((g: any) => [g.id, g])), [grupos])
  const topOf = (leaf: number) => { const g: any = grupoById.get(leaf); return g ? (g.parent_id ?? g.id) : null }

  const t = m?.[tipo] ?? {}
  const centrosRaw: any[] = t.centros ?? []
  const verbaDesc: Record<string, string> = t.verbaDesc ?? {}
  const totalGeral = t.total_geral ?? 0
  const compl = t.complementar ?? 0   // parcela do total vinda da folha complementar do mês (FC)
  const temCompl = Math.abs(compl) > 0.005
  // meses de referência consolidados nesta competência de pagamento (FC/dissídio), p/ rotular
  const complRefs: number[] = m?.complementar_refs ?? []
  const fmtRefs = (refs: number[]) => {
    if (!refs.length) return ''
    const anos = Array.from(new Set(refs.map((r) => Math.floor(r / 100))))
    if (anos.length === 1) {
      const meses = refs.map((r) => String(r % 100).padStart(2, '0')).join(', ')
      return ` (ref. ${meses}/${anos[0]})`
    }
    return ` (ref. ${refs.map((r) => `${String(r % 100).padStart(2, '0')}/${Math.floor(r / 100)}`).join(', ')})`
  }
  const rpa = m?.rpa ?? { bruto: 0, liquido: 0, entidades: 0, n: 0 }
  const isProv = tipo === 'proventos'
  const rpaVal = isProv ? (rpa.bruto ?? 0) : (rpa.bruto ?? 0) - (rpa.liquido ?? 0)   // desconto RPA = bruto − líquido
  const lbl = isProv ? 'proventos' : 'descontos'
  const tog = (set: any, v: any) => set((p: Set<any>) => { const n = new Set(p); n.has(v) ? n.delete(v) : n.add(v); return n })

  // PIVOT AO VIVO: top(grupo)/leaf(subgrupo) por colaborador a partir das verbas cruas do snapshot
  // + o mapa verba→subgrupo do esquema selecionado (folha_dash). Poda de grupos/verbas zerados aqui.
  const { centros, tree, verbasByLeaf } = useMemo(() => {
    const cents = centrosRaw.map((ce: any) => ({
      label: ce.label,
      colaboradores: ce.colaboradores.map((co: any) => {
        const top: Record<string, number> = {}, leaf: Record<string, number> = {}
        for (const [cvs, val] of Object.entries(co.verba || {})) {
          const v = val as number
          const lf = verbaLeaf[cvs]
          if (lf == null || !grupoById.has(lf)) top['outros'] = (top['outros'] || 0) + v
          else { const tk = `t${topOf(lf)}`; top[tk] = (top[tk] || 0) + v; leaf[String(lf)] = (leaf[String(lf)] || 0) + v }
        }
        return { nome: co.nome, total: co.total, verba: co.verba, top, leaf }
      }),
    }))
    const topTot: Record<string, number> = {}, leafTot: Record<string, number> = {}, verbaTot: Record<string, number> = {}
    for (const ce of cents) for (const co of ce.colaboradores) {
      for (const [k, v] of Object.entries(co.top)) topTot[k] = (topTot[k] || 0) + (v as number)
      for (const [k, v] of Object.entries(co.leaf)) leafTot[k] = (leafTot[k] || 0) + (v as number)
      for (const [k, v] of Object.entries(co.verba)) verbaTot[k] = (verbaTot[k] || 0) + (v as number)
    }
    const tops = grupos.filter((g: any) => g.parent_id == null).sort((a: any, b: any) => a.ordem - b.ordem)
    const visTops = tops.filter((tp: any) => Math.abs(topTot[`t${tp.id}`] || 0) >= 0.005).map((tp: any) => ({
      id: tp.id, nome: tp.nome, cor: tp.cor,
      subs: grupos.filter((s: any) => s.parent_id === tp.id).sort((a: any, b: any) => a.ordem - b.ordem)
        .filter((s: any) => Math.abs(leafTot[String(s.id)] || 0) >= 0.005).map((s: any) => ({ id: s.id, nome: s.nome })),
    }))
    const temOutros = Math.abs(topTot['outros'] || 0) >= 0.005
    const byLeaf: Record<string, [number, number][]> = {}
    for (const [cvs, tot] of Object.entries(verbaTot)) {
      if (Math.abs(tot as number) < 0.005) continue
      const lf = verbaLeaf[cvs]
      const lk = (lf == null || !grupoById.has(lf)) ? 'outros' : `s${lf}`
      ;(byLeaf[lk] ||= []).push([Number(cvs), tot as number])
    }
    const vbl: Record<string, number[]> = {}
    for (const [lk, arr] of Object.entries(byLeaf)) vbl[lk] = arr.sort((a, b) => b[1] - a[1]).map((x) => x[0])
    return { centros: cents, tree: { tops: visTops, temOutros }, verbasByLeaf: vbl }
  }, [centrosRaw, verbaLeaf, grupos, grupoById])

  // colunas dinâmicas conforme a expansão (grupo → subgrupo → verba); a poda de zerados já veio do ETL
  const cols = useMemo(() => {
    const out: any[] = []
    for (const tp of tree.tops) {
      if (expG.has(tp.id) && tp.subs.length) {
        for (const s of tp.subs) {
          const lk = `s${s.id}`
          if (expL.has(lk)) {
            for (const cv of (verbasByLeaf[lk] || [])) out.push({ key: `v${cv}_${tp.id}`, label: verbaDesc[cv] || `Verba ${cv}`, kind: 'verba', codVerba: cv, cor: tp.cor })
            out.push({ key: `ss${s.id}`, label: s.nome, kind: 'subsub', leafId: s.id, cor: tp.cor })
          } else {
            out.push({ key: `s${s.id}`, label: s.nome, kind: 'sub', leafId: s.id, cor: tp.cor })
          }
        }
        out.push({ key: `st${tp.id}`, label: 'Subtotal', kind: 'subtotal', topId: tp.id, cor: tp.cor })
      } else {
        out.push({ key: `t${tp.id}`, label: tp.nome, kind: 'group', topId: tp.id, cor: tp.cor })
      }
    }
    if (tree.temOutros) {
      if (expL.has('outros')) {
        for (const cv of (verbasByLeaf['outros'] || [])) out.push({ key: `vo${cv}`, label: verbaDesc[cv] || `Verba ${cv}`, kind: 'verba', codVerba: cv })
        out.push({ key: 'outrossub', label: '(outros)', kind: 'subsub-outros' })
      } else {
        out.push({ key: 'outros', label: '(outros)', kind: 'outros' })
      }
    }
    return out
  }, [tree, verbasByLeaf, verbaDesc, expG, expL])

  const val1 = (n: any, col: any): number => {
    if (!n) return 0
    if (col.kind === 'verba') return n.verba?.[String(col.codVerba)] || 0
    if (col.kind === 'outros' || col.kind === 'subsub-outros') return n.top?.['outros'] || 0
    if (col.kind === 'sub' || col.kind === 'subsub') return n.leaf?.[String(col.leafId)] || 0
    return n.top?.[`t${col.topId}`] || 0   // group | subtotal
  }
  const sumVal = (nodes: any[], col: any) => nodes.reduce((s, x) => s + val1(x, col), 0)
  const sumTot = (nodes: any[]) => nodes.reduce((s, x) => s + (x.total || 0), 0)
  const allColabs = useMemo(() => centros.flatMap((c) => c.colaboradores), [centros])

  const onHead = (col: any) => {
    if (col.kind === 'group' || col.kind === 'subtotal') tog(setExpG, col.topId)
    else if (col.kind === 'sub' || col.kind === 'subsub') tog(setExpL, `s${col.leafId}`)
    else if (col.kind === 'outros' || col.kind === 'subsub-outros') tog(setExpL, 'outros')
  }
  const caret = (k: string) => (k === 'group' || k === 'sub' || k === 'outros') ? '▸'
    : (k === 'subtotal' || k === 'subsub' || k === 'subsub-outros') ? '▾' : ''
  const clickable = (col: any) => col.kind !== 'verba'
  const isBold = (k: string) => k === 'subtotal' || k === 'subsub' || k === 'subsub-outros'
  const expandAll = () => setExpG(new Set(tree.tops.map((tp: any) => tp.id)))
  const collapseAll = () => { setExpG(new Set()); setExpL(new Set()) }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex w-fit gap-1 rounded-lg bg-muted/40 p-1 text-xs">
          <SubPill active={isProv} onClick={() => setTipo('proventos')} label="Proventos" />
          <SubPill active={!isProv} onClick={() => setTipo('descontos')} label="Descontos" />
        </div>
        {classif?.esquemas?.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Esquema
            <select value={selEsq ?? ''} onChange={(e) => setSelEsq(Number(e.target.value))}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-border">
              {classif.esquemas.map((e: any) => <option key={e.id} value={e.id}>{e.nome}{e.ativo ? '' : ' (inativo)'}</option>)}
            </select>
          </label>
        )}
        <div className="flex gap-2 text-xs">
          <button onClick={expandAll} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40">Expandir grupos</button>
          <button onClick={collapseAll} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40">Recolher</button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={baixarExcel} disabled={baixando || !refNum} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/40 disabled:opacity-50">
            <FileSpreadsheet className="h-3.5 w-3.5" /> {baixando ? 'Gerando…' : 'Exportar Excel'}
          </button>
          {onConfig && (
            <button onClick={onConfig} className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/40">
              <Settings2 className="h-3.5 w-3.5" /> Configurar agrupamento
            </button>
          )}
        </div>
      </div>
      {carregandoG && <p className="text-[11px] text-muted-foreground">carregando agrupamento…</p>}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px]">
                <th className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">Centro / Colaborador</th>
                {cols.map((c) => (
                  <th key={c.key}
                    onClick={clickable(c) ? () => onHead(c) : undefined}
                    className={cn('whitespace-nowrap px-2.5 py-1.5 text-right font-semibold', clickable(c) && 'cursor-pointer hover:bg-muted/60',
                      c.kind === 'verba' ? 'font-normal italic text-muted-foreground' : 'text-foreground')}
                    style={c.cor ? { borderTop: `2px solid ${c.cor}` } : undefined}>
                    {caret(c.kind) && <span className="mr-0.5 opacity-60">{caret(c.kind)}</span>}{c.label}
                  </th>
                ))}
                <th className="border-l border-border px-2.5 py-1.5 text-right font-semibold text-foreground">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {centros.map((ce: any) => {
                const aberto = expC.has(ce.label)
                return (
                  <Fragment key={ce.label}>
                    <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => tog(setExpC, ce.label)}>
                      <td className="sticky left-0 z-10 bg-background px-2.5 py-1.5 font-medium text-foreground">
                        <span className="mr-1 opacity-60">{aberto ? '▾' : '▸'}</span>
                        {ce.label} <span className="opacity-50">({ce.colaboradores.length})</span>
                      </td>
                      {cols.map((c) => <td key={c.key} className={cn('px-2.5 py-1.5 text-right tabular-nums text-foreground', isBold(c.kind) ? 'font-semibold' : 'font-medium')}>{cell(sumVal(ce.colaboradores, c))}</td>)}
                      <td className="border-l border-border px-2.5 py-1.5 text-right font-semibold tabular-nums text-foreground">{cell(sumTot(ce.colaboradores))}</td>
                    </tr>
                    {aberto && ce.colaboradores.map((co: any, i: number) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="sticky left-0 z-10 bg-background py-1 pl-7 pr-2.5 text-muted-foreground">{co.nome}</td>
                        {cols.map((c) => <td key={c.key} className={cn('px-2.5 py-1 text-right tabular-nums', isBold(c.kind) ? 'font-medium text-foreground' : 'text-muted-foreground')}>{cell(val1(co, c))}</td>)}
                        <td className="border-l border-border px-2.5 py-1 text-right tabular-nums text-foreground">{cell(co.total)}</td>
                      </tr>
                    ))}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-foreground">TOTAL</td>
                {cols.map((c) => <td key={c.key} className="px-2.5 py-1.5 text-right tabular-nums text-foreground">{cell(sumVal(allColabs, c))}</td>)}
                <td className="border-l border-border px-2.5 py-1.5 text-right tabular-nums text-foreground">{cell(totalGeral)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Reconciliacao (folha normal + complementar + RPA = total da folha) */}
      <div className="ml-auto max-w-md rounded-lg border border-border p-3 text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <div className="mb-1.5 font-semibold text-foreground">Reconciliacao de {lbl} com a folha</div>
        {temCompl ? (
          <>
            <ReconRow label={`Folha normal (mes)`} value={brl(totalGeral - compl)} />
            <ReconRow label={`+ Folha complementar${fmtRefs(complRefs)}`} value={brl(compl)} />
          </>
        ) : (
          <ReconRow label={`Total de ${lbl} (verbas)`} value={brl(totalGeral)} />
        )}
        <ReconRow label={`+ Autonomos / RPA${rpa.n ? ` (${rpa.n})` : ''}`} value={brl(rpaVal)} />
        {!isProv && rpa.entidades > 0 && (
          <div className="flex justify-between pl-3 text-xs text-muted-foreground"><span>dos quais SEST/SENAT (transportador)</span><span>{brl(rpa.entidades)}</span></div>
        )}
        <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-bold text-foreground">
          <span>= Total de {lbl} da folha</span><span>{brl((totalGeral ?? 0) + (rpaVal ?? 0))}</span>
        </div>
      </div>
    </div>
  )
}

const pct = (n: unknown) =>
  n == null ? '—' : `${(+(n as number)).toFixed(2).replace(/\.?0+$/, '').replace('.', ',')}%`

function GuiaCard({ label, value, accent, big, sub }: { label: string; value?: number; accent: string; big?: boolean; sub?: string }) {
  return (
    <div className={cn('rounded-xl border border-border p-3', big ? 'min-w-[300px] flex-[1_1_300px]' : 'min-w-[180px] flex-[1_1_180px]')}
      style={{ borderLeft: `4px solid ${accent}` }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-bold tabular-nums', big ? 'text-2xl' : 'text-lg')} style={{ color: accent }}>{brl(value)}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

// 13 celulas da matriz de composicao patronal (mesma ordem do cabecalho)
function InssCells({ c }: { c: any }) {
  const td = 'px-2.5 py-1 text-right tabular-nums'
  const bl = 'border-l border-border'
  return (
    <>
      <td className={cn(td, 'border-r border-border font-medium text-foreground')}>{cell(c?.emp)}</td>
      <td className={cn(td, 'text-muted-foreground')}>{cell(c?.baseF)}</td>
      <td className={cn(td, 'font-medium text-foreground')}>{cell(c?.patF)}</td>
      <td className={cn(td, 'text-muted-foreground')}>{cell(c?.gilF)}</td>
      <td className={cn(td, 'text-muted-foreground')}>{cell(c?.terF)}</td>
      <td className={cn(td, bl, 'text-muted-foreground')}>{cell(c?.baseV)}</td>
      <td className={cn(td, 'font-medium text-foreground')}>{cell(c?.patV)}</td>
      <td className={cn(td, 'text-muted-foreground')}>{cell(c?.gilV)}</td>
      <td className={cn(td, 'text-muted-foreground')}>{cell(c?.terV)}</td>
      <td className={cn(td, bl, 'font-medium text-foreground')}>{cell(c?.patT)}</td>
      <td className={cn(td, 'font-medium text-foreground')}>{cell(c?.gilT)}</td>
      <td className={cn(td, 'font-medium text-foreground')}>{cell(c?.terT)}</td>
      <td className={cn(td, bl, 'font-semibold text-foreground')}>{cell(c?.patronal)}</td>
    </>
  )
}

function Inss({ inss }: { inss: any }) {
  const [exp, setExp] = useState<Set<string>>(new Set())
  const [dedOpen, setDedOpen] = useState(false)
  const g = inss?.guia ?? {}
  const al = inss?.aliquotas ?? {}
  const m = inss?.matriz ?? { centros: [], total: {} }
  const terc: any[] = inss?.terceiros ?? []
  const aut = inss?.autonomos ?? { linhas: [], total: {}, n: 0 }
  const dedColabs: any[] = inss?.deducoesColabs ?? []
  const concom = inss?.concom
  const ded = (g.deducoes ?? 0) > 0.005
  const toggle = (l: string) => setExp((p) => { const n = new Set(p); n.has(l) ? n.delete(l) : n.add(l); return n })
  const th = 'px-2.5 py-1.5 text-right font-semibold text-foreground'

  return (
    <div className="space-y-4">
      {/* ===== Cards da guia ===== */}
      <div className="flex flex-wrap gap-3">
        <GuiaCard big accent={MODULE_COLOR}
          label={ded ? 'INSS a recolher (liquido)' : 'INSS total — guia'}
          value={ded ? g.liquido : g.bruta}
          sub={ded ? `guia ${brl(g.bruta)} − deducoes FPAS ${brl(g.deducoes)}` : 'empregado + patronal (CPP + GILRAT + Terceiros)'} />
        <GuiaCard label="INSS empregado (descontado)" value={g.emp} accent="#8a7bd8" />
        <GuiaCard label="Patronal (CPP)" value={g.patronal} accent={MODULE_COLOR} sub={pct(al.patronal)} />
        <GuiaCard label="GILRAT" value={g.gilrat} accent={MODULE_COLOR} sub={`RAT ${pct(al.rat)} × FAP ${al.fap ?? '—'} = ${pct(al.gilrat)}`} />
        <GuiaCard label="Terceiros / Outras Entidades" value={g.terc} accent={MODULE_COLOR} sub={pct(al.terc)} />
        {g.ratApo > 0.005 && <GuiaCard label="Adicional RAT (Apos. Especial)" value={g.ratApo} accent={MODULE_COLOR} sub={`sobre base ${brl(g.ratApoBase)}`} />}
        {g.aut > 0.005 && <GuiaCard label="Autonomos (RPA)" value={g.aut} accent="#8a7bd8" sub={`retido + CPP 20% + SEST/SENAT · ${aut.n} autonomo(s)`} />}
      </div>

      {/* ===== Deducoes FPAS ===== */}
      {ded && (
        <Card className="p-4 text-sm" style={{ borderLeft: `3px solid ${MODULE_COLOR}` }}>
          <b className="text-foreground">Deducoes do FPAS (reembolso ao empregador).</b>{' '}
          <span className="text-muted-foreground">Salario-familia e salario-maternidade sao adiantados pela empresa e abatidos da guia.</span>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 tabular-nums">
            <span className="text-muted-foreground">Guia bruta <b className="text-foreground">{brl(g.bruta)}</b></span>
            {g.dedFam > 0.005 && <span className="text-muted-foreground">− salario-familia <b className="text-foreground">{brl(g.dedFam)}</b></span>}
            {g.dedMat > 0.005 && <span className="text-muted-foreground">− salario-maternidade <b className="text-foreground">{brl(g.dedMat)}</b></span>}
            <span className="font-semibold" style={{ color: MODULE_COLOR }}>= INSS a recolher {brl(g.liquido)}</span>
          </div>
          {dedColabs.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setDedOpen((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                <span className="mr-1 opacity-60">{dedOpen ? '▾' : '▸'}</span>
                {dedColabs.length} colaborador(es) com salario-familia/maternidade{dedOpen ? '' : ' — clique para detalhar'}
              </button>
              {dedOpen && (
                <table className="mt-2 w-full max-w-lg border-collapse text-xs">
                  <thead><tr className="border-b border-border text-[11px]">
                    <th className="px-2 py-1 text-left font-semibold text-foreground">Colaborador</th>
                    <th className="px-2 py-1 text-right font-semibold text-foreground">Salario-familia</th>
                    <th className="px-2 py-1 text-right font-semibold text-foreground">Salario-maternidade</th>
                  </tr></thead>
                  <tbody>
                    {dedColabs.map((d, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-2 py-1 text-muted-foreground">{d.nome}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{cell(d.dedFam)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{cell(d.dedMat)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t border-border font-semibold">
                    <td className="px-2 py-1 text-foreground">Total</td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{cell(g.dedFam)}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-foreground">{cell(g.dedMat)}</td>
                  </tr></tfoot>
                </table>
              )}
            </div>
          )}
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Patronal {pct(al.patronal)} · GILRAT {pct(al.gilrat)} (RAT {pct(al.rat)} × FAP {al.fap ?? '—'}) · Terceiros {pct(al.terc)}
        {al.fpas != null && <> · FPAS {al.fpas}</>}. O INSS do empregado e o valor descontado (nao recalculado).
      </p>

      {concom && (
        <Card className="p-3 text-xs text-muted-foreground" style={{ borderLeft: `3px solid ${MODULE_COLOR}` }}>
          <b className="text-foreground">Simples Nacional — atividade concomitante (Anexo III/IV).</b> Patronal e GILRAT incidem so sobre a
          proporcao da receita do <b className="text-foreground">Anexo IV</b>: {brl(concom.r4)} ÷ {brl(concom.r4 + concom.rd)} ={' '}
          <b className="text-foreground">{(concom.prop * 100).toFixed(4).replace('.', ',')}%</b>. Terceiros = isento (LC 123).
        </Card>
      )}

      {/* ===== Composicao patronal (matriz Fixas × Variaveis) ===== */}
      <div>
        <h3 className="mb-1.5 text-sm font-semibold text-foreground">
          Composicao patronal <span className="font-normal text-muted-foreground">= {brl(g.patronalTot)}</span>
        </h3>
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px]">
                  <th rowSpan={2} className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">Centro / Colaborador</th>
                  <th rowSpan={2} className="border-r border-border px-2.5 py-1.5 text-right font-semibold text-foreground">INSS empreg.</th>
                  <th colSpan={4} className="px-2.5 py-1 text-center font-semibold text-foreground">Fixas contratuais</th>
                  <th colSpan={4} className="border-l border-border px-2.5 py-1 text-center font-semibold text-foreground">Variaveis</th>
                  <th colSpan={3} className="border-l border-border px-2.5 py-1 text-center font-semibold text-foreground">Totais (DARF)</th>
                  <th rowSpan={2} className="border-l border-border px-2.5 py-1.5 text-right font-semibold text-foreground">Total patronal</th>
                </tr>
                <tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground">
                  <th className={th}>Base</th><th className={th}>Patronal</th><th className={th}>GILRAT</th><th className={th}>Terceiros</th>
                  <th className={cn(th, 'border-l border-border')}>Base</th><th className={th}>Patronal</th><th className={th}>GILRAT</th><th className={th}>Terceiros</th>
                  <th className={cn(th, 'border-l border-border')}>Patronal</th><th className={th}>GILRAT</th><th className={th}>Terceiros</th>
                </tr>
              </thead>
              <tbody>
                {m.centros.map((ce: any) => (
                  <Fragment key={ce.label}>
                    <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => toggle(ce.label)}>
                      <td className="sticky left-0 z-10 bg-background px-2.5 py-1.5 font-medium text-foreground">
                        <span className="mr-1 opacity-60">{exp.has(ce.label) ? '▾' : '▸'}</span>
                        {ce.label} <span className="opacity-50">({ce.colaboradores.length})</span>
                      </td>
                      <InssCells c={ce.total} />
                    </tr>
                    {exp.has(ce.label) && ce.colaboradores.map((co: any, i: number) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="sticky left-0 z-10 bg-background py-1 pl-7 pr-2.5 text-muted-foreground">{co.nome}</td>
                        <InssCells c={co} />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-foreground">TOTAL</td>
                  <InssCells c={m.total} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      {/* ===== Terceiros por fundo + Autonomos (lado a lado) ===== */}
      <div className="flex flex-wrap gap-4">
        {terc.length > 0 && (
          <div className="min-w-[280px] flex-1">
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Terceiros por fundo <span className="font-normal text-muted-foreground">= {brl(g.terc)}</span></h3>
            <Card className="overflow-hidden p-0">
              <table className="w-full border-collapse text-xs">
                <thead><tr className="border-b border-border bg-muted/40 text-[11px]">
                  <th className="px-2.5 py-1.5 text-left font-semibold text-foreground">Fundo / Entidade</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Aliquota</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Valor</th>
                </tr></thead>
                <tbody>
                  {terc.map((t, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="px-2.5 py-1 text-foreground">{t.fundo}</td>
                      <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{pct(t.pct)}</td>
                      <td className="px-2.5 py-1 text-right font-medium tabular-nums text-foreground">{cell(t.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="px-2.5 py-1.5 text-foreground">Total Terceiros</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">{pct(al.terc)}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">{cell(g.terc)}</td>
                </tr></tfoot>
              </table>
            </Card>
          </div>
        )}

        {aut.linhas.length > 0 && (
          <div className="min-w-[420px] flex-[2]">
            <h3 className="mb-1.5 text-sm font-semibold text-foreground">Autonomos (RPA) <span className="font-normal text-muted-foreground">= {brl(g.aut)}</span></h3>
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead><tr className="border-b border-border bg-muted/40 text-[11px]">
                    <th className="px-2.5 py-1.5 text-left font-semibold text-foreground">Autonomo</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Base</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Retido (11%)</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">CPP (20%)</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">SEST/SENAT</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Total</th>
                  </tr></thead>
                  <tbody>
                    {aut.linhas.map((a: any, i: number) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="px-2.5 py-1 text-foreground">{a.nome}</td>
                        <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{cell(a.base)}</td>
                        <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{cell(a.retido)}</td>
                        <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{cell(a.cpp)}</td>
                        <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{cell(a.sest)}</td>
                        <td className="px-2.5 py-1 text-right font-medium tabular-nums text-foreground">{cell(a.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-border bg-muted/40 font-semibold text-foreground">
                    <td className="px-2.5 py-1.5">Total</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{cell(aut.total.base)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{cell(aut.total.retido)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{cell(aut.total.cpp)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{cell(aut.total.sest)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{cell(aut.total.total)}</td>
                  </tr></tfoot>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}

function Fgts({ fgts, comp }: { fgts: any; comp?: string }) {
  const [exp, setExp] = useState<Set<string>>(new Set())
  const [expR, setExpR] = useState<Set<string>>(new Set())
  const g = fgts?.guia ?? {}
  const m = fgts?.matriz ?? { centros: [], total: {}, show13: false }
  const faixas: any[] = fgts?.faixas ?? []
  const resc = fgts?.rescisoria
  const show13 = !!m.show13
  const is13 = !!fgts?.is13
  const toggle = (set: any, l: string) => set((p: Set<string>) => { const n = new Set(p); n.has(l) ? n.delete(l) : n.add(l); return n })
  const pctOf = (v?: number, b?: number) => (b && Math.abs(b) >= 0.005 ? `${((v ?? 0) / b * 100).toFixed(2).replace('.', ',')}%` : '—')
  const dt = (s?: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—')
  const th = 'px-2.5 py-1.5 text-right font-semibold text-foreground'

  const MCells = ({ c }: { c: any }) => {
    const td = 'px-2.5 py-1 text-right tabular-nums'
    return (
      <>
        <td className={cn(td, 'text-muted-foreground')}>{cell(c?.bFix)}</td>
        <td className={cn(td, 'text-[11px] text-muted-foreground')}>{pctOf(c?.vFix, c?.bFix)}</td>
        <td className={cn(td, 'font-medium text-foreground')}>{cell(c?.vFix)}</td>
        <td className={cn(td, 'border-l border-border text-muted-foreground')}>{cell(c?.bVar)}</td>
        <td className={cn(td, 'text-[11px] text-muted-foreground')}>{pctOf(c?.vVar, c?.bVar)}</td>
        <td className={cn(td, 'font-medium text-foreground')}>{cell(c?.vVar)}</td>
        {show13 && <td className={cn(td, 'border-l border-border font-medium text-foreground')}>{cell(c?.v13)}</td>}
        <td className={cn(td, 'border-l border-border font-semibold text-foreground')}>{cell(c?.guia)}</td>
      </>
    )
  }
  const RCells = ({ c, perc }: { c: any; perc?: number | null }) => {
    const td = 'px-2.5 py-1 text-right tabular-nums text-muted-foreground'
    return (
      <>
        <td className={td}>{cell(c?.mesAnt)}</td>
        <td className={td}>{cell(c?.mesResc)}</td>
        <td className={td}>{cell(c?.t13)}</td>
        <td className={td}>{cell(c?.ind)}</td>
        <td className={td}>{cell(c?.adto13)}</td>
        <td className={td}>{cell(c?.multa)}{perc != null && c?.multa ? <span className="ml-1 text-[10px] opacity-70">{perc.toFixed(0)}%</span> : null}</td>
        <td className="border-l border-border px-2.5 py-1 text-right font-semibold tabular-nums text-foreground">{cell(c?.total)}</td>
      </>
    )
  }

  return (
    <div className="space-y-4">
      {/* ===== Cards da guia ===== */}
      <div className="flex flex-wrap gap-3">
        <GuiaCard big accent={MODULE_COLOR}
          label={is13 ? 'Guia de 13º (anual) — FGTS' : 'Guia mensal — FGTS'} value={g.guia}
          sub={`${is13 ? 'folha de 13º' : 'competencia'} ${comp ?? ''}${show13 && !is13 ? ' · inclui 13º (adto + rescisao)' : ''}`} />
        {resc && <GuiaCard label="Guia(s) rescisoria(s) — FGTS" value={resc.total?.total} accent="#e0808a"
          sub={`${resc.n} desligamento(s) · sem justa causa / acordo / antecipado`} />}
      </div>

      {/* ===== Faixas por aliquota ===== */}
      {faixas.length > 0 && (
        <Card className="overflow-hidden p-0 md:max-w-lg">
          <table className="w-full border-collapse text-xs">
            <thead><tr className="border-b border-border bg-muted/40 text-[11px]">
              <th className="px-2.5 py-1.5 text-left font-semibold text-foreground">Aliquota</th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Colaboradores</th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Base FGTS</th>
              <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">FGTS</th>
            </tr></thead>
            <tbody>
              {faixas.map((f) => (
                <tr key={f.al} className="border-b border-border/40">
                  <td className="px-2.5 py-1 text-foreground">{f.al}%{f.al === 2 ? ' · Jovem Aprendiz' : f.al === 8 ? ' · geral' : ''}</td>
                  <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{f.n}</td>
                  <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{cell(f.base)}</td>
                  <td className="px-2.5 py-1 text-right font-medium tabular-nums text-foreground">{cell(f.fgts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ===== Composicao da guia mensal (matriz Fixas x Variaveis) ===== */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">
          Composicao da guia {is13 ? 'de 13º' : 'mensal'} <span className="font-normal text-muted-foreground">= {brl(g.guia)}</span>
        </h3>
        {show13 && (
          <p className="mb-1.5 text-xs text-muted-foreground">
            Fixas + Variaveis = {brl(g.mensal)} + 13º (adto + rescisao na mensal) = {brl(g.t13)} = <b className="text-foreground">{brl(g.guia)}</b>
            {' '}· o 13º só tem guia própria na folha integral de dezembro.
          </p>
        )}
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px]">
                  <th rowSpan={2} className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">Centro / Colaborador</th>
                  <th colSpan={3} className="px-2.5 py-1 text-center font-semibold text-foreground">Fixas contratuais</th>
                  <th colSpan={3} className="border-l border-border px-2.5 py-1 text-center font-semibold text-foreground">Variaveis</th>
                  {show13 && <th rowSpan={2} className="border-l border-border px-2.5 py-1.5 text-right font-semibold text-foreground">13º</th>}
                  <th rowSpan={2} className="border-l border-border px-2.5 py-1.5 text-right font-semibold text-foreground">Guia mensal</th>
                </tr>
                <tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground">
                  <th className={th}>Base</th><th className={th}>%</th><th className={th}>FGTS</th>
                  <th className={cn(th, 'border-l border-border')}>Base</th><th className={th}>%</th><th className={th}>FGTS</th>
                </tr>
              </thead>
              <tbody>
                {m.centros.map((ce: any) => (
                  <Fragment key={ce.label}>
                    <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => toggle(setExp, ce.label)}>
                      <td className="sticky left-0 z-10 bg-background px-2.5 py-1.5 font-medium text-foreground">
                        <span className="mr-1 opacity-60">{exp.has(ce.label) ? '▾' : '▸'}</span>
                        {ce.label} <span className="opacity-50">({ce.colaboradores.length})</span>
                      </td>
                      <MCells c={ce.total} />
                    </tr>
                    {exp.has(ce.label) && ce.colaboradores.map((co: any, i: number) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="sticky left-0 z-10 bg-background py-1 pl-7 pr-2.5 text-muted-foreground">{co.nome}</td>
                        <MCells c={co} />
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-foreground">TOTAL</td>
                  <MCells c={m.total} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      {/* ===== Guia(s) rescisoria(s) ===== */}
      {resc && resc.centros?.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            Guia(s) rescisoria(s) <span className="font-normal text-muted-foreground">= {brl(resc.total?.total)}</span>
          </h3>
          <p className="mb-1.5 text-xs text-muted-foreground">
            GRRF: FGTS do mês da rescisao, 13º e indenizatório saem da mensal e entram aqui, junto do compensatório (multa 40% s/ justa causa · 20% acordo).
            Antecipado (até o dia 9): soma também o FGTS do mês anterior.
          </p>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead><tr className="border-b border-border bg-muted/40 text-[11px]">
                  <th className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">Centro / Colaborador</th>
                  <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Data</th>
                  <th className={th}>Mês anterior</th><th className={th}>Mês da rescisao</th><th className={th}>13º</th>
                  <th className={th}>Indenizatório</th><th className={th}>Adto 13º</th><th className={th}>Compensatório</th>
                  <th className="border-l border-border px-2.5 py-1.5 text-right font-semibold text-foreground">Guia rescisoria</th>
                </tr></thead>
                <tbody>
                  {resc.centros.map((ce: any) => (
                    <Fragment key={ce.label}>
                      <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => toggle(setExpR, ce.label)}>
                        <td className="sticky left-0 z-10 bg-background px-2.5 py-1.5 font-medium text-foreground">
                          <span className="mr-1 opacity-60">{expR.has(ce.label) ? '▾' : '▸'}</span>
                          {ce.label} <span className="opacity-50">({ce.linhas.length})</span>
                        </td>
                        <td className="px-2.5 py-1.5" />
                        <RCells c={ce.total} />
                      </tr>
                      {expR.has(ce.label) && ce.linhas.map((r: any, i: number) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="sticky left-0 z-10 bg-background py-1 pl-7 pr-2.5 text-muted-foreground">
                            {r.nome}
                            {r.antecipado && <span className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-medium text-white" style={{ backgroundColor: '#e0808a' }}>antecipado</span>}
                          </td>
                          <td className="px-2.5 py-1 text-right text-[11px] text-muted-foreground">{dt(r.data)}</td>
                          <RCells c={r} perc={r.perc_multa} />
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-foreground">TOTAL</td>
                    <td className="px-2.5 py-1.5" />
                    <RCells c={resc.total} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function Irrf({ irrf }: { irrf: any }) {
  const [exp, setExp] = useState<Set<string>>(new Set())
  const [agrupar, setAgrupar] = useState(true)
  const [todos, setTodos] = useState(false)
  const cols: { key: string; label: string }[] = irrf?.colunas ?? []
  const centros: any[] = irrf?.centros ?? []
  const totColuna = irrf?.totColuna ?? {}
  const aut = irrf?.autonomos ?? { linhas: [], total: 0, n: 0 }
  const toggle = (l: string) => setExp((p) => { const n = new Set(p); n.has(l) ? n.delete(l) : n.add(l); return n })
  const nCols = cols.length
  const showCo = (co: any) => todos || co.retencao
  const centrosVis = centros.map((ce) => ({ ...ce, vis: ce.colaboradores.filter(showCo) })).filter((ce) => ce.vis.length > 0)
  const flat = centros.flatMap((c: any) => c.colaboradores).filter(showCo).sort((a: any, b: any) => (a.nome < b.nome ? -1 : 1))

  const colabRows = (co: any, i: number) => (
    <Fragment key={i}>
      <tr className="border-t border-border/40">
        <td rowSpan={2} className="sticky left-0 z-10 bg-background py-1 pl-7 pr-2.5 align-top text-muted-foreground">{co.nome}</td>
        <td className="px-2 py-0.5 text-right text-[10px] uppercase text-muted-foreground">Base</td>
        {cols.map((c) => <td key={c.key} className="px-2.5 py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">{cell(co.cels?.[c.key]?.base)}</td>)}
        <td className="border-l border-border" />
      </tr>
      <tr className="border-b border-border/40">
        <td className="px-2 py-0.5 text-right text-[10px] uppercase text-muted-foreground">Valor</td>
        {cols.map((c) => <td key={c.key} className="px-2.5 py-0.5 text-right font-medium tabular-nums text-foreground">{cell(co.cels?.[c.key]?.valor)}</td>)}
        <td className="border-l border-border px-2.5 py-0.5 text-right font-semibold tabular-nums text-foreground">{cell(co.total)}</td>
      </tr>
      {co.resc13?.valor > 0.005 && (
        <tr className="border-b border-border/40 bg-muted/10">
          <td className="sticky left-0 z-10 bg-background py-0.5 pl-10 pr-2.5 text-[10px] text-muted-foreground">↳ desdobra Rescisao</td>
          <td />
          <td colSpan={nCols} className="px-2.5 py-0.5 text-right text-[11px] text-muted-foreground">Rescisao {brl(co.resc?.valor)} · 13º Rescisao {brl(co.resc13?.valor)}</td>
          <td className="border-l border-border" />
        </tr>
      )}
    </Fragment>
  )

  return (
    <div className="space-y-4">
      {/* ===== Cards da guia ===== */}
      <div className="flex flex-wrap gap-3">
        <GuiaCard big accent={MODULE_COLOR} label="Guia IRRF — DARF 0561" value={irrf.guia0561}
          sub={`${irrf.nComRetencao} colaborador(es) com retencao · apuracao pela data de pagamento`} />
        {irrf.guia0588 > 0.005 && <GuiaCard accent="#8a7bd8" label="Guia IRRF — DARF 0588 (Autonomos)" value={irrf.guia0588} sub={`${aut.n} autonomo(s) · RPA`} />}
      </div>

      {/* ===== Flags ===== */}
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-muted-foreground">
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} /> agrupar por centro de custo</label>
        <label className="flex cursor-pointer items-center gap-1.5"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> mostrar todos (incl. sem IRRF)</label>
      </div>

      {/* ===== Tabela 0561 (pivot Base/Valor por tipo) ===== */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px]">
                <th className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">Colaborador</th>
                <th className="bg-muted/40 px-2 py-1.5" />
                {cols.map((c) => <th key={c.key} className="whitespace-nowrap px-2.5 py-1.5 text-right font-semibold text-foreground">{c.label}</th>)}
                <th className="border-l border-border px-2.5 py-1.5 text-right font-semibold text-foreground">TOTAL IRRF</th>
              </tr>
            </thead>
            <tbody>
              {agrupar
                ? centrosVis.map((ce) => {
                    const aberto = exp.has(ce.label)
                    return (
                      <Fragment key={ce.label}>
                        <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => toggle(ce.label)}>
                          <td className="sticky left-0 z-10 bg-background px-2.5 py-1.5 font-medium text-foreground">
                            <span className="mr-1 opacity-60">{aberto ? '▾' : '▸'}</span>{ce.label} <span className="opacity-50">({ce.vis.length})</span>
                          </td>
                          <td />
                          {cols.map((c) => <td key={c.key} className="px-2.5 py-1.5 text-right font-medium tabular-nums text-foreground">{cell(ce.sub?.[c.key])}</td>)}
                          <td className="border-l border-border px-2.5 py-1.5 text-right font-semibold tabular-nums text-foreground">{cell(ce.total)}</td>
                        </tr>
                        {aberto && ce.vis.map((co: any, i: number) => colabRows(co, i))}
                      </Fragment>
                    )
                  })
                : flat.map((co: any, i: number) => colabRows(co, i))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-foreground">TOTAL</td>
                <td />
                {cols.map((c) => <td key={c.key} className="px-2.5 py-1.5 text-right tabular-nums text-foreground">{cell(totColuna?.[c.key])}</td>)}
                <td className="border-l border-border px-2.5 py-1.5 text-right tabular-nums text-foreground">{cell(irrf.guia0561)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* ===== Autonomos — DARF 0588 ===== */}
      {aut.linhas.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-semibold text-foreground">IRRF Autonomos — DARF 0588 <span className="font-normal text-muted-foreground">= {brl(aut.total)}</span></h3>
          <p className="mb-1.5 text-xs text-muted-foreground">Recibo de pagamento a autonomo (terceiros) — codigo 0588, distinto do 0561 dos empregados. Apuracao pela data de pagamento.</p>
          <Card className="overflow-hidden p-0 md:max-w-lg">
            <table className="w-full border-collapse text-xs">
              <thead><tr className="border-b border-border bg-muted/40 text-[11px]">
                <th className="px-2.5 py-1.5 text-left font-semibold text-foreground">Autonomo</th>
                <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">Base</th>
                <th className="px-2.5 py-1.5 text-right font-semibold text-foreground">IRRF</th>
              </tr></thead>
              <tbody>
                {aut.linhas.map((a: any, i: number) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="px-2.5 py-1 text-foreground">{a.nome}</td>
                    <td className="px-2.5 py-1 text-right tabular-nums text-muted-foreground">{cell(a.base)}</td>
                    <td className="px-2.5 py-1 text-right font-medium tabular-nums text-foreground">{cell(a.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="px-2.5 py-1.5 text-foreground">Total (DARF 0588)</td>
                <td />
                <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">{cell(aut.total)}</td>
              </tr></tfoot>
            </table>
          </Card>
        </div>
      )}
    </div>
  )
}

function ConfigAgrupamento({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [snap, setSnap] = useState<any>(null)     // {esquemas, grupos, regras} do folha_dash
  const [selEsq, setSelEsq] = useState<number | null>(null)
  const [selGrupo, setSelGrupo] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [novoEsq, setNovoEsq] = useState('')
  const [novoEsqEscopo, setNovoEsqEscopo] = useState<'todos' | 'proventos' | 'descontos'>('todos')
  const [addPai, setAddPai] = useState<number | null | undefined>(undefined)  // undefined=fechado, null=topo
  const [addNome, setAddNome] = useState('')
  const [renId, setRenId] = useState<number | null>(null)
  const [renNome, setRenNome] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [classes, setClasses] = useState<any[]>([])

  const carregar = useCallback(() => {
    trpc.folhaBi.classif.query().then((c: any) => {
      setSnap(c)
      setSelEsq((p) => (p != null && c.esquemas.some((e: any) => e.id === p)) ? p : (c.esquemas[0]?.id ?? null))
    }).catch((e: any) => setMsg('⚠ ' + (e?.message || 'erro ao carregar')))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const run = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true); setMsg(null)
    try { await fn(); carregar(); if (ok) setMsg(ok) }
    catch (e: any) { setMsg('⚠ ' + (e?.message || 'erro')) }
    finally { setBusy(false) }
  }

  const grupos = (snap?.grupos ?? []).filter((g: any) => g.esquema_id === selEsq)
  const tops = grupos.filter((g: any) => g.parent_id == null).sort((a: any, b: any) => a.ordem - b.ordem)
  const subsOf = (id: number) => grupos.filter((g: any) => g.parent_id === id).sort((a: any, b: any) => a.ordem - b.ordem)
  const regrasDe = (id: number) => (snap?.regras ?? []).filter((r: any) => r.grupo_id === id)
  const grupoSel = grupos.find((g: any) => g.id === selGrupo)

  const aplicar = () => run(async () => {
    const r = await trpc.folhaBi.aplicar.mutate({ esquemaId: selEsq ?? undefined })
    onChanged(); setMsg(`✓ aplicado — ${r.resolvidas} verbas na ponte`)
  })
  const buscarClasses = () => { if (busca.trim()) trpc.folhaBi.buscarClasses.query({ termo: busca.trim() }).then((r: any) => setClasses(r)).catch(() => {}) }

  const grupoRow = (g: any, sub: boolean) => (
    <div key={g.id} className={cn('group flex items-center gap-1 rounded px-1.5 py-1', sub && 'ml-4', g.id === selGrupo ? 'bg-muted/50' : 'hover:bg-muted/30')}>
      {renId === g.id ? (
        <>
          <input autoFocus value={renNome} onChange={(e) => setRenNome(e.target.value)} className="flex-1 rounded border border-border bg-background px-1 py-0.5" />
          <button onClick={() => run(async () => { await trpc.folhaBi.grupoRename.mutate({ id: g.id, nome: renNome.trim() || g.nome }); setRenId(null) })} className="text-[11px] text-foreground">ok</button>
        </>
      ) : (
        <>
          {g.cor && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: g.cor }} />}
          <button onClick={() => setSelGrupo(g.id)} className="flex-1 truncate text-left text-foreground">{g.nome}</button>
          <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button title="renomear" onClick={() => { setRenId(g.id); setRenNome(g.nome) }} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
            <button title="subir" onClick={() => run(async () => { await trpc.folhaBi.grupoMove.mutate({ id: g.id, dir: 'up' }) })} className="text-muted-foreground hover:text-foreground"><ChevronUp className="h-3 w-3" /></button>
            <button title="descer" onClick={() => run(async () => { await trpc.folhaBi.grupoMove.mutate({ id: g.id, dir: 'down' }) })} className="text-muted-foreground hover:text-foreground"><ChevronDown className="h-3 w-3" /></button>
            {confirmDel === `g:${g.id}`
              ? <button onClick={() => run(async () => { await trpc.folhaBi.grupoDelete.mutate({ id: g.id }); setConfirmDel(null); if (selGrupo === g.id) setSelGrupo(null) })} className="text-[10px] text-red-500">confirmar?</button>
              : <button title="excluir" onClick={() => setConfirmDel(`g:${g.id}`)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
          </span>
        </>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" style={{ color: MODULE_COLOR }} />
            <h3 className="text-sm font-semibold text-foreground">Configurar agrupamento de verbas</h3>
          </div>
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
            <button onClick={aplicar} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: MODULE_COLOR }}>Aplicar (resolver)</button>
            <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/40"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-[210px_1fr_270px] overflow-hidden text-xs">
          {/* Esquemas */}
          <div className="flex flex-col overflow-y-auto border-r border-border p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Esquemas</div>
            {(snap?.esquemas ?? []).map((e: any) => (
              <button key={e.id} onClick={() => { setSelEsq(e.id); setSelGrupo(null) }}
                className={cn('mb-1 rounded-md px-2 py-1.5 text-left', e.id === selEsq ? 'text-white' : 'text-foreground hover:bg-muted/40')}
                style={e.id === selEsq ? { backgroundColor: MODULE_COLOR } : undefined}>
                <div className="truncate">{e.nome}</div>
                <div className={cn('text-[10px]', e.id === selEsq ? 'text-white/70' : 'text-muted-foreground')}>{e.escopo}{e.ativo ? '' : ' · inativo'}</div>
              </button>
            ))}
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              <input value={novoEsq} onChange={(e) => setNovoEsq(e.target.value)} placeholder="Novo esquema…" className="w-full rounded border border-border bg-background px-1.5 py-1" />
              <div className="flex gap-1">
                <select value={novoEsqEscopo} onChange={(e) => setNovoEsqEscopo(e.target.value as any)} className="flex-1 rounded border border-border bg-background px-1 py-1">
                  <option value="todos">Todas</option><option value="proventos">Proventos</option><option value="descontos">Descontos</option>
                </select>
                <button disabled={busy} onClick={() => novoEsq.trim() && run(async () => { const r = await trpc.folhaBi.esquemaCreate.mutate({ nome: novoEsq.trim(), escopo: novoEsqEscopo }); setNovoEsq(''); setSelEsq(r.id) })} className="rounded bg-muted/60 px-2 py-1 text-foreground">criar</button>
              </div>
              {selEsq != null && (confirmDel === `e:${selEsq}`
                ? <button onClick={() => run(async () => { await trpc.folhaBi.esquemaDelete.mutate({ id: selEsq }); setConfirmDel(null); setSelEsq(null) })} className="w-full rounded bg-red-500/80 px-2 py-1 text-white">confirmar exclusão</button>
                : <button onClick={() => setConfirmDel(`e:${selEsq}`)} className="w-full rounded border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40">excluir esquema</button>)}
            </div>
          </div>

          {/* Grupos / subgrupos */}
          <div className="flex flex-col overflow-y-auto p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grupos → subgrupos</div>
            {tops.map((tp: any) => (
              <div key={tp.id} className="mb-0.5">
                {grupoRow(tp, false)}
                {subsOf(tp.id).map((s: any) => grupoRow(s, true))}
                {addPai === tp.id ? (
                  <div className="ml-4 flex gap-1 py-1">
                    <input autoFocus value={addNome} onChange={(e) => setAddNome(e.target.value)} placeholder="nome do subgrupo" className="flex-1 rounded border border-border bg-background px-1.5 py-1" />
                    <button onClick={() => addNome.trim() && run(async () => { await trpc.folhaBi.grupoCreate.mutate({ esquemaId: selEsq!, parentId: tp.id, nome: addNome.trim() }); setAddNome(''); setAddPai(undefined) })} className="rounded bg-muted/60 px-2">add</button>
                  </div>
                ) : <button onClick={() => { setAddPai(tp.id); setAddNome('') }} className="ml-4 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">+ subgrupo</button>}
              </div>
            ))}
            {addPai === null ? (
              <div className="mt-1 flex gap-1">
                <input autoFocus value={addNome} onChange={(e) => setAddNome(e.target.value)} placeholder="nome do grupo de topo" className="flex-1 rounded border border-border bg-background px-1.5 py-1" />
                <button onClick={() => addNome.trim() && run(async () => { await trpc.folhaBi.grupoCreate.mutate({ esquemaId: selEsq!, parentId: null, nome: addNome.trim() }); setAddNome(''); setAddPai(undefined) })} className="rounded bg-muted/60 px-2">add</button>
              </div>
            ) : <button onClick={() => { setAddPai(null); setAddNome('') }} className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /> grupo de topo</button>}
          </div>

          {/* Regras */}
          <div className="flex flex-col overflow-y-auto border-l border-border p-3">
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Regras {grupoSel ? `· ${grupoSel.nome}` : ''}</div>
            {!grupoSel && <p className="text-muted-foreground">Selecione um grupo para ver/editar as regras (prefixo de classe SCI → grupo).</p>}
            {grupoSel && (
              <>
                {regrasDe(grupoSel.id).length === 0 && <p className="mb-1 text-muted-foreground">Sem regras neste grupo.</p>}
                {regrasDe(grupoSel.id).map((r: any) => (
                  <div key={r.id} className="mb-1 flex items-center justify-between gap-1 rounded border border-border px-1.5 py-1">
                    <span className="truncate text-foreground"><b>{r.prefixo}</b>{r.classe_desc ? ` · ${r.classe_desc}` : ''}</span>
                    <button onClick={() => run(async () => { await trpc.folhaBi.regraDelete.mutate({ id: r.id }) })} className="shrink-0 text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                <div className="mt-2 border-t border-border pt-2">
                  <div className="flex gap-1">
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') buscarClasses() }} placeholder="buscar classe (cód/desc)…" className="flex-1 rounded border border-border bg-background px-1.5 py-1" />
                    <button onClick={buscarClasses} className="rounded bg-muted/60 px-2 text-foreground">buscar</button>
                  </div>
                  <div className="mt-1 max-h-48 overflow-y-auto">
                    {classes.map((c: any) => (
                      <button key={c.cod} onClick={() => run(async () => { await trpc.folhaBi.regraAdd.mutate({ grupoId: grupoSel.id, prefixo: c.cod }); setBusca(''); setClasses([]) })} className="block w-full truncate rounded px-1.5 py-1 text-left text-foreground hover:bg-muted/40"><b>{c.cod}</b> · {c.descricao}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          Edite os grupos/regras e clique <b className="text-foreground">Aplicar (resolver)</b> — o painel Verbas reflete na hora (agrupamento lido ao vivo do folha_dash, sem reenviar snapshots).
        </div>
      </div>
    </div>
  )
}

function Provisoes({ provisoes, empresa, refNum }: { provisoes: any; empresa: number; refNum: number }) {
  const [vista, setVista] = useState<'resumo' | 'ferias' | 'decimo'>('resumo')
  const tipos = [{ key: 'ferias', label: 'Férias' }, { key: 'decimo', label: '13º salário' }].filter((t) => provisoes?.[t.key])
  const [tipo, setTipo] = useState<string>(tipos[0]?.key ?? 'ferias')
  const [exp, setExp] = useState<Set<string>>(new Set())
  const d = provisoes?.[tipo] ?? { centros: [], total: { mes: {}, acum: {} }, n: 0 }
  const tlabel = tipos.find((t) => t.key === tipo)?.label ?? tipo
  const toggle = (l: string) => setExp((p) => { const n = new Set(p); n.has(l) ? n.delete(l) : n.add(l); return n })
  const th = 'px-2.5 py-1.5 text-right font-semibold text-foreground'

  const Cells = ({ c }: { c: any }) => {
    const m = c?.mes ?? {}, a = c?.acum ?? {}
    const td = 'px-2.5 py-1 text-right tabular-nums'
    return (
      <>
        <td className={cn(td, 'font-medium text-foreground')}>{cell(m.fixo)}</td>
        <td className={cn(td, 'font-medium text-foreground')}>{cell(m.var)}</td>
        <td className={cn(td, 'text-muted-foreground')}>{cell(m.fgts)}</td>
        <td className={cn(td, 'text-muted-foreground')}>{cell(m.inss)}</td>
        <td className={cn(td, 'font-semibold text-foreground')}>{cell(m.total)}</td>
        <td className={cn(td, 'border-l-2 border-border font-medium text-foreground')}>{cell(a.fixo)}</td>
        <td className={cn(td, 'font-medium text-foreground')}>{cell(a.var)}</td>
        <td className={cn(td, 'text-muted-foreground')}>{cell(a.fgts)}</td>
        <td className={cn(td, 'text-muted-foreground')}>{cell(a.inss)}</td>
        <td className={cn(td, 'font-semibold text-foreground')}>{cell(a.total)}</td>
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted/40 p-1 text-xs">
        <SubPill active={vista === 'resumo'} onClick={() => setVista('resumo')} label="Resumo (mês × acum.)" />
        <SubPill active={vista === 'ferias'} onClick={() => setVista('ferias')} label="Rel. Ferias detalhado" />
        <SubPill active={vista === 'decimo'} onClick={() => setVista('decimo')} label="Rel. 13o detalhado" />
      </div>

      {vista !== 'resumo' ? <RelatorioProvisao empresa={empresa} refNum={refNum} tipo={vista} /> : (<>
      <div className="flex w-fit gap-1 rounded-lg bg-muted/40 p-1 text-xs">
        {tipos.map((t) => <SubPill key={t.key} active={tipo === t.key} onClick={() => { setTipo(t.key); setExp(new Set()) }} label={t.label} />)}
      </div>

      <div className="flex flex-wrap gap-3">
        <GuiaCard accent={MODULE_COLOR} label={`Provisão de ${tlabel} · do mês`} value={d.total?.mes?.total} sub="1/12 avos + acerto (custo do mês)" />
        <GuiaCard accent="#8a7bd8" label={`Provisão de ${tlabel} · acumulado`} value={d.total?.acum?.total} sub="saldo provisionado" />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px]">
                <th rowSpan={2} className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">Centro / Colaborador</th>
                <th colSpan={5} className="px-2.5 py-1 text-center font-semibold text-foreground">Provisão e encargos do mês</th>
                <th colSpan={5} className="border-l-2 border-border px-2.5 py-1 text-center font-semibold text-foreground">Acumulado (saldo)</th>
              </tr>
              <tr className="border-b border-border bg-muted/40 text-[10px] text-muted-foreground">
                <th className={th}>Fixo</th><th className={th}>Variavel</th><th className={th}>FGTS</th><th className={th}>INSS+terc</th><th className={th}>Total</th>
                <th className={cn(th, 'border-l-2 border-border')}>Fixo</th><th className={th}>Variavel</th><th className={th}>FGTS</th><th className={th}>INSS+terc</th><th className={th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.centros.map((ce: any) => (
                <Fragment key={ce.label}>
                  <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => toggle(ce.label)}>
                    <td className="sticky left-0 z-10 bg-background px-2.5 py-1.5 font-medium text-foreground">
                      <span className="mr-1 opacity-60">{exp.has(ce.label) ? '▾' : '▸'}</span>{ce.label} <span className="opacity-50">({ce.colaboradores.length})</span>
                    </td>
                    <Cells c={ce} />
                  </tr>
                  {exp.has(ce.label) && ce.colaboradores.map((co: any, i: number) => (
                    <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="sticky left-0 z-10 bg-background py-1 pl-7 pr-2.5 text-muted-foreground">{co.nome}</td>
                      <Cells c={co} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-foreground">TOTAL</td>
                <Cells c={d.total} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        <b className="text-foreground">Do mês</b> = custo provisionado na competencia (1/12 avos + acerto). <b className="text-foreground">Acumulado</b> = saldo provisionado (Provisao − Pago).
        Principal em Fixo (salario+adicionais) × Variavel (medias); FGTS e INSS+terceiros como total.
      </p>
      </>)}
    </div>
  )
}

const PROV_CFG: Record<string, any> = {
  ferias: {
    conta: [['fer', 'Férias'], ['fgts', 'FGTS'], ['inss', 'INSS'], ['pis', 'PIS'], ['tot', 'Total']],
    zeroConta: { fer: 0, fgts: 0, inss: 0, pis: 0, tot: 0 },
    contaF: (r: any, n: any) => ({ fer: n(r.ferias) + n(r.abono), fgts: n(r.fgts), inss: n(r.inss) + n(r.terc) + n(r.rat) + n(r.rat_apo), pis: n(r.pis), tot: n(r.total) }),
    mov: [
      { id: 'ini', h: '(=) Saldo inicial da conta', bold: true },
      { id: 'acerto', h: '(+) Acerto', lines: [5] },
      { id: 'transf', h: '(+) Acerto transferencia', lines: [6] },
      { id: 'trib', h: '(+) Acerto tributacao', lines: [9] },
      { id: 'avos', h: '(+) 1/12 avos do mes', lines: [4] },
      { id: 'pago', h: '(−) Pago / baixado no mes' },
      { id: 'fim', h: '(=) Saldo final da conta', bold: true, lines: [3] },
    ],
    pagoMinus: ['ini', 'avos', 'acerto', 'transf', 'trib'],
    linhas: [{ l: 0, label: 'Férias', bold: true }, { l: 1, label: 'Pago' }, { l: 3, label: 'Saldo', bold: true }, { l: 4, label: '1/12 avos' }, { l: 5, label: 'Acerto' }, { l: 6, label: 'Acerto transf.' }, { l: 9, label: 'Acerto tributacao' }, { l: 8, label: 'Acerto pagto' }, { l: 14, label: 'Acerto pag.transf.' }, { l: 11, label: 'Baixa de pagto' }],
    cols: [['ferias', 'Férias'], ['abono', 'Abono'], ['fgts', 'FGTS'], ['inss', 'INSS'], ['terc', 'Terc'], ['rat', 'RAT'], ['rat_apo', 'RAT Apo'], ['pis', 'PIS'], ['total', 'Provisão']],
    periodo: true,
    ext: { fimL: [3], provL: [4], acertosL: [5, 6, 9], prin: (r: any, n: any) => n(r.ferias) + n(r.abono), principalLabel: 'Férias' },
  },
  decimo: {
    conta: [['prin', '13º salário'], ['fgts', 'FGTS'], ['inss', 'INSS'], ['pis', 'PIS'], ['tot', 'Total']],
    zeroConta: { prin: 0, fgts: 0, inss: 0, pis: 0, tot: 0 },
    contaF: (r: any, n: any) => ({ prin: n(r.principal), fgts: n(r.fgts), inss: n(r.inss) + n(r.terc) + n(r.rat) + n(r.rat_apo), pis: n(r.pis), tot: n(r.total) }),
    mov: [
      { id: 'ini', h: '(=) Saldo inicial da conta', bold: true },
      { id: 'acerto', h: '(+) Acerto', lines: [7] },
      { id: 'transf', h: '(+) Acerto transferencia', lines: [8] },
      { id: 'transfEmp', h: '(+) Acerto transf. empresas', lines: [9] },
      { id: 'trib', h: '(+) Acerto tributacao', lines: [10] },
      { id: 'avos', h: '(+) 1/12 avos do mes', lines: [6] },
      { id: 'pago', h: '(−) Pago / baixado no mes' },
      { id: 'fim', h: '(=) Saldo final da conta', bold: true, lines: [5] },
    ],
    pagoMinus: ['ini', 'avos', 'acerto', 'transf', 'transfEmp', 'trib'],
    linhas: [{ l: 0, label: '13º salário', bold: true }, { l: 1, label: 'Pago' }, { l: 5, label: 'Saldo', bold: true }, { l: 6, label: '1/12 avos' }, { l: 7, label: 'Acerto' }, { l: 8, label: 'Acerto transf.' }, { l: 9, label: 'Acerto transf.emp.' }, { l: 10, label: 'Acerto tributacao' }, { l: 11, label: 'Acerto pagto' }, { l: 12, label: 'Acerto pag.transf.' }, { l: 13, label: 'Ac.pag.transf.emp.' }, { l: 19, label: 'Baixa de pagto' }],
    cols: [['principal', '13º salário'], ['fgts', 'FGTS'], ['inss', 'INSS'], ['terc', 'Terc'], ['rat', 'RAT'], ['rat_apo', 'RAT Apo'], ['pis', 'PIS'], ['total', 'Provisão']],
    periodo: false,
    ext: { fimL: [5], provL: [6], acertosL: [7, 8, 9, 10], prin: (r: any, n: any) => n(r.principal), principalLabel: '13º salário' },
  },
}

function RelatorioProvisao({ empresa, refNum, tipo }: { empresa: number; refNum: number; tipo: 'ferias' | 'decimo' }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [porCentro, setPorCentro] = useState(false)
  const [exp, setExp] = useState<Set<string>>(new Set())
  useEffect(() => {
    let vivo = true; setLoading(true); setData(null); setExp(new Set())
    trpc.folhaBi.provDetalhe.query({ empresa, ref: refNum, tipo })
      .then((d: any) => { if (vivo) setData(d) }).catch(() => {}).finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [empresa, refNum, tipo])

  const cfg = PROV_CFG[tipo]
  const conta: [string, string][] = cfg.conta
  const cols: [string, string][] = cfg.cols
  const n = (x: any) => (x == null ? 0 : Number(x))
  const dt = (s: any) => (s && String(s).length >= 10 ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}/${String(s).slice(0, 4)}` : '—')
  const rows: any[] = data?.rows ?? []
  const iniByCol: Record<string, any> = data?.iniByCol ?? {}
  const zero = () => ({ ...cfg.zeroConta })
  const toggle = (k: string) => setExp((p) => { const nn = new Set(p); nn.has(k) ? nn.delete(k) : nn.add(k); return nn })

  const centroLabel = (r: any) => (r.cod_centro == null ? 'Sem Centro de Custo' : ((r.setor && String(r.setor).trim()) ? String(r.setor).trim() : `Centro ${r.cod_centro}`))
  const saldoIni = (subset: any[]) => {
    const o: any = zero()
    for (const cod of new Set(subset.map((r) => String(r.cod_col)))) { const v = iniByCol[cod]; if (v) for (const [k] of conta) o[k] += v[k] || 0 }
    return o
  }
  const movimento = (subset: any[]) => {
    const lineVals = (lines: number[]) => { const o: any = zero(); for (const r of subset) if (lines.includes(Number(r.linha))) { const cv = cfg.contaF(r, n); for (const [k] of conta) o[k] += cv[k] } return o }
    const m: any = {}
    for (const row of cfg.mov) if (row.lines) m[row.id] = lineVals(row.lines)
    m.ini = saldoIni(subset)
    m.pago = zero()
    for (const [k] of conta) { let s = 0; for (const id of cfg.pagoMinus) s += (id === 'ini' ? m.ini[k] : (m[id]?.[k] || 0)); m.pago[k] = m.fim[k] - s }
    return m
  }
  const extrato = (subset: any[]) => {
    const sumLines = (lines: number[]) => { let prin = 0, enc = 0, tot = 0; for (const r of subset) if (lines.includes(Number(r.linha))) { prin += cfg.ext.prin(r, n); enc += n(r.fgts) + n(r.inss) + n(r.terc) + n(r.rat) + n(r.rat_apo) + n(r.pis); tot += n(r.total) } return { prin, enc, tot } }
    const v: any = saldoIni(subset)
    const ini = { prin: v[conta[0][0]], enc: v.fgts + v.inss + v.pis, tot: v.tot }
    const fim = sumLines(cfg.ext.fimL), prov = sumLines(cfg.ext.provL), acertos = sumLines(cfg.ext.acertosL)
    const pago = { prin: fim.prin - ini.prin - prov.prin - acertos.prin, enc: fim.enc - ini.enc - prov.enc - acertos.enc, tot: fim.tot - ini.tot - prov.tot - acertos.tot }
    return { ini, prov, acertos, pago, fim }
  }

  const colabs = useMemo(() => {
    const m = new Map<number, any[]>()
    for (const r of rows) { if (!m.has(r.cod_col)) m.set(r.cod_col, []); m.get(r.cod_col)!.push(r) }
    return Array.from(m.entries()).map(([cod, rs]) => {
      const periodos = new Map<string, Map<number, any>>(); const lines = new Map<number, any>()
      for (const r of rs) {
        lines.set(Number(r.linha), r)
        const pk = cfg.periodo ? (r.ini_per_aquis ?? '') : ''
        if (!periodos.has(pk)) periodos.set(pk, new Map())
        periodos.get(pk)!.set(Number(r.linha), r)
      }
      return { cod, rows: rs, lines, nome: rs[0].colaborador || `Colab ${cod}`, centro: centroLabel(rs[0]), periodos: Array.from(periodos.entries()).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) }
    }).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [rows, tipo])
  const centros = useMemo(() => {
    const m = new Map<string, any[]>()
    for (const c of colabs) { if (!m.has(c.centro)) m.set(c.centro, []); m.get(c.centro)!.push(c) }
    return Array.from(m.entries()).map(([label, cs]) => ({ label, colabs: cs, rows: cs.flatMap((c) => c.rows) }))
      .sort((a, b) => (a.label === 'Sem Centro de Custo' ? 1 : b.label === 'Sem Centro de Custo' ? -1 : a.label.localeCompare(b.label)))
  }, [colabs])

  if (loading) return <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Carregando relatorio detalhado…</Card>
  if (!rows.length) return <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Sem provisao de {tipo === 'ferias' ? 'ferias' : '13o'} nesta competencia.</Card>

  const movGeral = movimento(rows)
  const ext = extrato(rows)
  const th = 'px-2.5 py-1.5 text-right font-semibold text-foreground'
  const tdN = 'px-2.5 py-1 text-right tabular-nums'

  // linhas do movimento da conta (label + CONTA cols)
  const movRows = (subset: any[], pad: number) => {
    const m = movimento(subset)
    return cfg.mov.map((row: any) => (
      <tr key={row.id} className={cn('border-b border-border/30', row.bold && 'bg-muted/20')}>
        <td className={cn('sticky left-0 z-10 bg-background py-0.5 pr-2.5 text-[11px]', row.bold ? 'font-semibold text-foreground' : 'text-muted-foreground')} style={{ paddingLeft: pad }}>{row.h}</td>
        {conta.map(([k]) => <td key={k} className={cn(tdN, '!py-0.5 text-[11px]', row.bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{cell(m[row.id]?.[k])}</td>)}
      </tr>
    ))
  }
  // detalhe (matriz por periodo p/ ferias · matriz unica p/ 13o) embutido via colSpan
  const detalhe = (c: any) => (
    <tr className="border-b border-border/30 bg-muted/5"><td colSpan={conta.length + 1} className="px-2.5 py-2 pl-8">
      {c.periodos.map(([pk, per]: [string, Map<number, any>]) => {
        const r0 = per.get(0)
        return (
          <div key={pk || 'u'} className="mb-2">
            <div className="mb-1 text-[11px] text-muted-foreground">
              {cfg.periodo && <b className="text-foreground">Periodo aquisitivo {dt(r0?.ini_per_aquis)} a {dt(r0?.dt_venc)}</b>}
              {r0 && <>{cfg.periodo ? ' · ' : ''}medias {brl(n(r0.medias))} · base INSS {brl(n(r0.base_inss))}{cfg.periodo ? ` · faltas ${n(r0.faltas)}` : ''}{r0.rescisao ? ' · rescisao' : ''}</>}
            </div>
            <div className="overflow-x-auto">
              <table className="border-collapse text-[11px]">
                <thead><tr className="border-b border-border text-[10px] text-muted-foreground">
                  <th className="px-2 py-0.5 text-left" />
                  {cfg.periodo && <><th className="px-2 py-0.5 text-right">PR</th><th className="px-2 py-0.5 text-right">SD</th></>}
                  {cols.map(([k, h]) => <th key={k} className="px-2 py-0.5 text-right">{h}</th>)}
                </tr></thead>
                <tbody>
                  {cfg.linhas.map(({ l, label, bold }: any) => {
                    const r = per.get(l)
                    if (!r) return null
                    const has = cols.some(([k]) => Math.abs(n(r[k])) > 0.005)
                    if (!bold && !has && l !== 1) return null
                    return (
                      <tr key={l} className={cn('border-b border-border/20', bold && 'font-semibold text-foreground')}>
                        <td className={cn('px-2 py-0.5', bold ? 'text-foreground' : 'text-muted-foreground')}>{label}</td>
                        {cfg.periodo && <><td className="px-2 py-0.5 text-right tabular-nums text-muted-foreground">{l === 0 ? n(r0?.pr) : ''}</td><td className="px-2 py-0.5 text-right tabular-nums text-muted-foreground">{l === 0 ? n(r0?.sd) : ''}</td></>}
                        {cols.map(([k]) => <td key={k} className="px-2 py-0.5 text-right tabular-nums">{cell(n(r[k]))}</td>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </td></tr>
  )
  const sumRow = (key: string, label: string, sub: any[], pad: number) => {
    const fim = movimento(sub).fim
    return (
      <tr className="cursor-pointer border-b border-border/60 hover:bg-muted/30" onClick={() => toggle(key)}>
        <td className="sticky left-0 z-10 bg-background py-1.5 pr-2.5 font-medium text-foreground" style={{ paddingLeft: pad }}>
          <span className="mr-1 opacity-60">{exp.has(key) ? '▾' : '▸'}</span>{label}
        </td>
        {conta.map(([k]) => <td key={k} className={cn(tdN, 'font-semibold text-foreground')}>{cell(fim[k])}</td>)}
      </tr>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button onClick={() => { setPorCentro((v) => !v); setExp(new Set()) }} className={cn('rounded-md border border-border px-2 py-1', porCentro ? 'text-white' : 'text-muted-foreground hover:bg-muted/40')} style={porCentro ? { backgroundColor: MODULE_COLOR } : undefined}>Agrupar por centro de custo</button>
        <button onClick={() => setExp(new Set([...colabs.map((c) => `c${c.cod}`), ...centros.map((c) => `ce:${c.label}`)]))} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40">Expandir tudo</button>
        <button onClick={() => setExp(new Set())} className="rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted/40">Recolher</button>
        <span className="text-[11px] text-muted-foreground">clique num {porCentro ? 'centro/colaborador' : 'colaborador'} p/ abrir o movimento da conta (saldo final → demais valores)</span>
      </div>

      {data?.prevRefFaltando && (
        <Card className="p-3 text-xs text-muted-foreground" style={{ borderLeft: '3px solid #e0808a' }}>
          ⚠ Saldo inicial indisponivel (mes anterior nao carregado no cache); aparece zerado. Importe a competencia anterior p/ o razao fechar.
        </Card>
      )}

      {/* Detalhe por colaborador / centro */}
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px]">
                <th className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">{porCentro ? 'Centro / Colaborador' : 'Colaborador'}</th>
                {conta.map(([k, h]) => <th key={k} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {porCentro ? centros.map((ce) => {
                const ceKey = `ce:${ce.label}`
                return (
                  <Fragment key={ceKey}>
                    {sumRow(ceKey, `${ce.label} (${ce.colabs.length})`, ce.rows, 4)}
                    {exp.has(ceKey) && <>
                      {ce.colabs.map((c: any) => (
                        <Fragment key={`c${c.cod}`}>
                          {sumRow(`c${c.cod}`, c.nome, c.rows, 24)}
                          {exp.has(`c${c.cod}`) && <>{detalhe(c)}{movRows(c.rows, 40)}</>}
                        </Fragment>
                      ))}
                      {movRows(ce.rows, 24)}
                    </>}
                  </Fragment>
                )
              }) : colabs.map((c) => (
                <Fragment key={`c${c.cod}`}>
                  {sumRow(`c${c.cod}`, c.nome, c.rows, 4)}
                  {exp.has(`c${c.cod}`) && <>{detalhe(c)}{movRows(c.rows, 24)}</>}
                </Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                <td className="sticky left-0 z-10 bg-muted/60 px-2.5 py-1.5 text-foreground">TOTAL (saldo final)</td>
                {conta.map(([k]) => <td key={k} className={cn(tdN, 'py-1.5 text-foreground')}>{cell(movGeral.fim[k])}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Totais da empresa: movimento da conta */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Totais da empresa · movimento da conta</h3>
        <Card className="overflow-hidden p-0 lg:max-w-2xl">
          <table className="w-full border-collapse text-xs">
            <thead><tr className="border-b border-border bg-muted/40 text-[11px]">
              <th className="px-2.5 py-1.5 text-left font-semibold text-foreground">Movimento da conta</th>
              {conta.map(([k, h]) => <th key={k} className={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {cfg.mov.map((row: any) => (
                <tr key={row.id} className={cn('border-b border-border/30', row.bold && 'bg-muted/20')}>
                  <td className={cn('px-2.5 py-1', row.bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{row.h}</td>
                  {conta.map(([k]) => <td key={k} className={cn(tdN, row.bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{cell(movGeral[row.id]?.[k])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Extrato (linguagem simples) */}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-foreground">Como a provisao se movimentou no mes</h3>
        <Card className="overflow-hidden p-0 lg:max-w-xl">
          <table className="w-full border-collapse text-xs">
            <thead><tr className="border-b border-border bg-muted/40 text-[11px]">
              <th className="px-2.5 py-1.5 text-left font-semibold text-foreground">Movimentacao da provisao</th>
              <th className={th}>{cfg.ext.principalLabel}</th><th className={th}>Encargos</th><th className={th}>Total</th>
            </tr></thead>
            <tbody>
              {[['ini', 'Saldo no inicio do mes', true], ['prov', '(+) Provisao do mes (1/12 avos)', false], ['acertos', '(+/−) Acertos do mes', false], ['pago', '(−) Pago / baixado no mes', false], ['fim', '(=) Saldo no fim do mes', true]].map(([id, h, bold]: any) => (
                <tr key={id} className={cn('border-b border-border/30', bold && 'bg-muted/20')}>
                  <td className={cn('px-2.5 py-1', bold ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{h}</td>
                  <td className={cn(tdN, 'text-muted-foreground')}>{cell(ext[id].prin)}</td>
                  <td className={cn(tdN, 'text-muted-foreground')}>{cell(ext[id].enc)}</td>
                  <td className={cn(tdN, bold ? 'font-semibold text-foreground' : 'text-foreground')}>{cell(ext[id].tot)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-1.5 text-[11px] text-muted-foreground lg:max-w-xl">
          No mes — custo reconhecido: <b className="text-foreground">{brl(ext.prov.tot + ext.acertos.tot)}</b> · pago/baixado: <b className="text-foreground">{brl(-ext.pago.tot)}</b> · variacao do saldo: <b className="text-foreground">{brl(ext.fim.tot - ext.ini.tot)}</b> (de {brl(ext.ini.tot)} para {brl(ext.fim.tot)}). Encargos = FGTS + INSS + Terc/RAT/RAT Apo + PIS.
        </p>
      </div>
    </div>
  )
}

// ===== Graficos do Resumo (SVG puro, portados do dashboard) =====
const CHART = { fixo: '#8b5cf6', var: '#22c1c9', desc: '#e0808a', ok: '#4ade80', prov: '#8a7bd8', prov2: '#6a9bd8', credito: '#c98a3a', he: '#e08a3a' }
const AX = 'rgb(148 163 184)'
const mesYY = (ref: number) => `${String(ref % 100).padStart(2, '0')}/${String(Math.floor(ref / 100)).slice(2)}`
const kfmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toFixed(0))

function LineChartSVG({ labels, series, height = 170 }: { labels: string[]; series: { label: string; color: string; data: number[] }[]; height?: number }) {
  const W = 440, H = height, padL = 6, padR = 6, padT = 16, padB = 18
  const all = series.flatMap((s) => s.data)
  const max = Math.max(...all, 1), min = Math.min(...all, 0), rng = max - min || 1
  const x = (i: number) => padL + (i / (labels.length - 1 || 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - (v - min) / rng) * (H - padT - padB)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 560 }}>
        {series.map((s) => (
          <g key={s.label}>
            <polyline points={s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinejoin="round" />
            {s.data.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={2.4} fill={s.color} />)}
          </g>
        ))}
        {labels.map((l, i) => <text key={i} x={x(i)} y={H - 4} fontSize={9} textAnchor="middle" fill={AX}>{l}</text>)}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {series.map((s) => <span key={s.label} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
      </div>
    </div>
  )
}

function GroupedBarsSVG({ groups, periodLabels, colors, height = 170 }: { groups: { label: string; values: number[] }[]; periodLabels: string[]; colors: string[]; height?: number }) {
  const W = 440, H = height, padB = 28, padT = 14
  const max = Math.max(...groups.flatMap((g) => g.values), 1)
  const gw = W / Math.max(groups.length, 1)
  const nb = periodLabels.length
  const bw = Math.min(20, (gw - 14) / Math.max(nb, 1))
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 560 }}>
        {groups.map((g, gi) => {
          const x0 = gi * gw + (gw - bw * nb) / 2
          return (
            <g key={g.label}>
              {g.values.map((v, bi) => {
                const h = max ? (Math.abs(v) / max) * (H - padT - padB) : 0
                return (
                  <g key={bi}>
                    <rect x={x0 + bi * bw} y={H - padB - h} width={bw - 2} height={h} fill={colors[bi]} rx={1.5} />
                    <text x={x0 + bi * bw + (bw - 2) / 2} y={H - padB - h - 2} fontSize={7} textAnchor="middle" fill={AX}>{kfmt(v)}</text>
                  </g>
                )
              })}
              <text x={gi * gw + gw / 2} y={H - padB + 12} fontSize={8.5} textAnchor="middle" fill={AX}>{g.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {periodLabels.map((l, i) => <span key={l} className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: colors[i] }} />{l}</span>)}
      </div>
    </div>
  )
}

function ChartCard({ titulo, children, full, note }: { titulo: string; children: ReactNode; full?: boolean; note?: ReactNode }) {
  return (
    <Card className={cn('p-3', full ? 'w-full' : 'min-w-[300px] flex-[1_1_360px]')}>
      <div className="mb-1.5 text-xs font-semibold text-foreground">{titulo}</div>
      {children}
      {note && <p className="mt-1.5 text-[11px] text-muted-foreground">{note}</p>}
    </Card>
  )
}

const VAR_KEYS = ['p_he', 'p_he_dsr', 'p_comissao', 'p_comissao_dsr', 'p_outros']
const ALL_PROV = ['p_fixo', ...VAR_KEYS, 'p_ferias', 'p_rescisao', 'p_13', 'informativo']
const ALL_DESC = ['d_faltas', 'd_faltas_dsr', 'd_plano', 'd_vt_va', 'd_credito_trab', 'd_inss', 'd_irrf', 'd_pensao', 'd_consignado', 'd_outros', 'd_ferias', 'd_rescisao', 'd_13']

function Resumo({ empresa, refNum }: { empresa: number; refNum: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let vivo = true; setLoading(true)
    trpc.folhaBi.resumoSerie.query({ empresa }).then((d: any) => { if (vivo) setData(d) }).catch(() => {}).finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [empresa])

  const nrm = (s: any) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const resumo: any[] = data?.resumo ?? []
  const impostos: any[] = data?.impostos ?? []
  const provisao: any[] = data?.provisao ?? []
  const n = (x: any) => Number(x || 0)
  const allRefs = useMemo(() => [...new Set(resumo.map((r) => r.ref))].sort((a, b) => a - b), [resumo])
  const mesesRefs = useMemo(() => allRefs.filter((r) => r % 100 !== 13), [allRefs])
  const ref = mesesRefs.includes(refNum) ? refNum : (mesesRefs[mesesRefs.length - 1] ?? refNum)
  const ult3 = mesesRefs.slice(-3), ult12 = mesesRefs.slice(-12)
  const rowsRef = (rf: number) => resumo.filter((r) => r.ref === rf)
  const soma = (rows: any[], keys: string[]) => rows.filter((r) => keys.includes(r.categoria)).reduce((a, r) => a + n(r.valor), 0)
  const serieCat = (keys: string[], refs: number[]) => refs.map((rf) => soma(rowsRef(rf), keys))
  const imp = (rf: number) => impostos.find((i) => i.ref === rf)
  const provAt = (tipo: string, rf: number) => n(provisao.find((p) => p.ref === rf && p.tipo === tipo)?.total)
  const liqDe = (rf: number) => soma(rowsRef(rf), ALL_PROV) - soma(rowsRef(rf), ALL_DESC)
  const rescBreak = (rf: number) => {
    const v = rowsRef(rf).filter((r) => r.categoria === 'p_rescisao')
    const tot = v.reduce((a, r) => a + n(r.valor), 0)
    const indeniz = v.filter((r) => nrm(r.descricao).includes('indeniz')).reduce((a, r) => a + n(r.valor), 0)
    const ferias = v.filter((r) => !nrm(r.descricao).includes('indeniz') && nrm(r.descricao).includes('ferias')).reduce((a, r) => a + n(r.valor), 0)
    const dec = v.filter((r) => { const d = nrm(r.descricao); return !d.includes('indeniz') && !d.includes('ferias') && (d.includes('13') || d.includes('decimo')) }).reduce((a, r) => a + n(r.valor), 0)
    return { tot, ferias, dec, indeniz }
  }
  const pctVarSerie = (refs: number[]) => refs.map((rf) => { const f = soma(rowsRef(rf), ['p_fixo']); const vv = soma(rowsRef(rf), VAR_KEYS); return f + vv ? (vv / (f + vv)) * 100 : 0 })

  const fr = rowsRef(ref)
  const totProv = soma(fr, ALL_PROV), totDesc = soma(fr, ALL_DESC)
  const fixo = soma(fr, ['p_fixo']), variavel = soma(fr, VAR_KEYS), he = soma(fr, ['p_he', 'p_he_dsr'])
  const nColab = imp(ref)?.n_colab ?? 0
  const encargos = n(imp(ref)?.inss_patronal) + n(imp(ref)?.fgts_mensal)
  const custoTotal = totProv + encargos
  const cargaEnc = totProv ? (encargos / totProv) * 100 : 0
  const custoMedio = nColab ? custoTotal / nColab : 0
  const pctVar = fixo + variavel ? (variavel / (fixo + variavel)) * 100 : 0
  const heP = totProv ? (he / totProv) * 100 : 0
  const mesesProv = (tipo: string) => (totProv ? provAt(tipo, ref) / totProv : 0)
  const indeniz = rescBreak(ref).indeniz
  const feriasPago = soma(fr, ['p_ferias']) + fr.filter((r) => r.categoria === 'p_rescisao' && nrm(r.descricao).includes('ferias')).reduce((a, r) => a + n(r.valor), 0)
  const decimoPago = soma(fr, ['p_13']) + fr.filter((r) => r.categoria === 'p_rescisao' && (nrm(r.descricao).includes('13') || nrm(r.descricao).includes('decimo'))).reduce((a, r) => a + n(r.valor), 0)
  const pct = (x: number) => `${x.toFixed(1).replace('.', ',')}%`
  const lbl3 = ult3.map(mesYY), corP = ['#9aa7b4', '#5a8fd8', CHART.fixo]

  if (loading) return <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Carregando indicadores e graficos…</Card>
  if (!resumo.length) return <Card className="flex h-40 items-center justify-center text-sm text-muted-foreground">Sem dados de resumo p/ esta empresa.</Card>

  const kpis = [
    { l: 'Custo total (folha + encargos)', v: brl(custoTotal), c: CHART.prov, sub: `${nColab} colaboradores` },
    { l: 'Carga de encargos', v: pct(cargaEnc), c: CHART.var, sub: 'INSS patr. + FGTS sobre proventos' },
    { l: 'Custo médio / colaborador', v: brl(custoMedio), c: CHART.fixo, sub: 'custo total ÷ headcount' },
    { l: '% variável (flexibilidade)', v: pct(pctVar), c: CHART.var, sub: 'variáveis ÷ (fixo + variáveis)' },
    { l: 'Horas extras / folha', v: pct(heP), c: CHART.he, sub: 'HE + DSR sobre proventos' },
    { l: 'Líquido', v: brl(totProv - totDesc), c: CHART.ok, sub: `proventos ${brl(totProv)}` },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {kpis.map((x) => (
          <div key={x.l} className="min-w-[170px] flex-[1_1_170px] rounded-xl border border-border p-3" style={{ borderTop: `3px solid ${x.c}` }}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{x.l}</div>
            <div className="mt-1 text-xl font-bold tabular-nums" style={{ color: x.c }}>{x.v}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{x.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <ChartCard titulo="Fixo contratual × Variáveis × Líquido (3 meses)">
          <LineChartSVG labels={lbl3} series={[
            { label: 'Fixo contratual', color: CHART.fixo, data: serieCat(['p_fixo'], ult3) },
            { label: 'Variáveis', color: CHART.var, data: serieCat(VAR_KEYS, ult3) },
            { label: 'Líquido', color: CHART.prov, data: ult3.map(liqDe) },
          ]} />
        </ChartCard>

        <ChartCard titulo="% variável da remuneração — flexibilidade (12 meses)" note={<>Quanto maior, mais a folha "respira" em queda de atividade. Atual: {pct(pctVar)}.</>}>
          <LineChartSVG labels={ult12.map(mesYY)} series={[{ label: '% variável', color: CHART.var, data: pctVarSerie(ult12) }]} />
        </ChartCard>

        <ChartCard titulo="Descontos por tipo (3 meses)">
          <GroupedBarsSVG periodLabels={lbl3} colors={corP} groups={[
            { label: 'INSS', values: serieCat(['d_inss'], ult3) },
            { label: 'IRRF', values: serieCat(['d_irrf'], ult3) },
            { label: 'Faltas', values: serieCat(['d_faltas', 'd_faltas_dsr'], ult3) },
            { label: 'Benefícios', values: serieCat(['d_plano', 'd_vt_va'], ult3) },
          ]} />
        </ChartCard>

        <ChartCard titulo="Crédito do Trabalhador × Fixo contratual (12 meses)" note="Crédito do Trabalhador = consignado CLT (programa federal).">
          <LineChartSVG labels={ult12.map(mesYY)} series={[
            { label: 'Crédito do Trabalhador', color: CHART.credito, data: serieCat(['d_credito_trab'], ult12) },
            { label: 'Fixo contratual', color: CHART.fixo, data: serieCat(['p_fixo'], ult12) },
          ]} />
        </ChartCard>

        <ChartCard titulo="Encargos da empresa (3 meses)">
          <GroupedBarsSVG periodLabels={lbl3} colors={corP} groups={[
            { label: 'INSS patr.', values: ult3.map((rf) => n(imp(rf)?.inss_patronal)) },
            { label: 'FGTS mês', values: ult3.map((rf) => n(imp(rf)?.fgts_mensal)) },
            { label: 'FGTS resc.', values: ult3.map((rf) => n(imp(rf)?.fgts_rescisorio)) },
          ]} />
        </ChartCard>

        <ChartCard titulo="Rescisões — composição (3 meses)" note={<><b className="text-foreground" style={{ color: CHART.desc }}>Indenizações em {fmtComp(ref)}: {brl(indeniz)}</b> — custo evitável (aviso + férias/13º indenizados).</>}>
          <GroupedBarsSVG periodLabels={lbl3} colors={corP} groups={[
            { label: 'Total', values: ult3.map((rf) => rescBreak(rf).tot) },
            { label: 'Férias', values: ult3.map((rf) => rescBreak(rf).ferias) },
            { label: '13º', values: ult3.map((rf) => rescBreak(rf).dec) },
            { label: 'Indeniz.', values: ult3.map((rf) => rescBreak(rf).indeniz) },
          ]} />
        </ChartCard>

        <ChartCard full titulo="Provisões trabalhistas — saldo e tendência (12 meses)" note={'"Meses de folha" = provisão ÷ folha mensal (quanto a empresa deve em direitos). Tendência de alta = passivo crescendo.'}>
          <div className="mb-2 flex flex-wrap gap-7">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Férias · acumulado</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: CHART.prov }}>{brl(provAt('ferias', ref))}</div>
              <div className="text-[11px] text-muted-foreground">{mesesProv('ferias').toFixed(1).replace('.', ',')} meses · pago no mês {brl(feriasPago)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">13º · acumulado</div>
              <div className="text-xl font-bold tabular-nums" style={{ color: CHART.prov2 }}>{brl(provAt('decimo', ref))}</div>
              <div className="text-[11px] text-muted-foreground">{mesesProv('decimo').toFixed(1).replace('.', ',')} meses · pago no mês {brl(decimoPago)}</div>
            </div>
          </div>
          <LineChartSVG labels={ult12.map(mesYY)} series={[
            { label: 'Provisão férias', color: CHART.prov, data: ult12.map((rf) => provAt('ferias', rf)) },
            { label: 'Provisão 13º', color: CHART.prov2, data: ult12.map((rf) => provAt('decimo', rf)) },
          ]} />
        </ChartCard>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, className, children }: {
  label: string; value: string; onChange: (v: string) => void; className?: string; children: ReactNode
}) {
  return (
    <label className="flex min-w-[92px] flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={cn('h-9 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-border', className)}>
        {children}
      </select>
    </label>
  )
}

function Pill({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick}
      className={cn('flex items-center gap-1.5 rounded-md px-3 py-1 text-sm', active ? 'text-white' : 'text-muted-foreground hover:text-foreground')}
      style={active ? { backgroundColor: MODULE_COLOR } : undefined}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function SubPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={cn('rounded-md px-3 py-1 font-medium', active ? 'text-white' : 'text-muted-foreground hover:text-foreground')}
      style={active ? { backgroundColor: MODULE_COLOR } : undefined}>
      {label}
    </button>
  )
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3" style={strong ? { backgroundColor: `color-mix(in srgb, ${MODULE_COLOR} 10%, transparent)` } : undefined}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 tabular-nums text-foreground', strong ? 'text-lg font-semibold' : 'text-base font-medium')}>{value}</p>
    </div>
  )
}

function ReconRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between py-0.5 text-foreground"><span>{label}</span><b>{value}</b></div>
}
