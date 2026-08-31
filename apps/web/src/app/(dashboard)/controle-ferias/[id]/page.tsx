'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  CalendarDays, Plus, Loader2, Check, Trash2, Info, Paperclip, Upload, Download, History,
  ChevronRight, ExternalLink,
} from 'lucide-react'
import {
  Button, Input, Label, Card, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { corSaldo, corSaldoTexto } from '../_lib/cores'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'

const MODULE_COLOR = 'var(--mod-trabalhista, #a3e635)'

interface Evento {
  id: string; ordem: number; dataInicio: string; dataFim: string
  descricao: string | null; dias: number; registradoPorNome: string | null; registradoEm: string
}
interface Arquivo { id: string; nome: string; path: string; criadoEm: string }
interface Periodo {
  id: string; legacyId: number | null
  /** Null nos resíduos do v1 cujo colaborador não existe mais no v2. */
  colaboradorId: string | null
  colaboradorNomeResolvido: string | null
  periodoInicial: number; periodoFinal: number
  descricao: string | null
  saldoAnterior: number; dias: number; gozados: number; saldo: number
  previsao: string | null
  pagamento1: string | null; pagamento2: string | null; pagamento3: string | null
  pago: boolean; historico: boolean
  eventos: Evento[]; arquivos: Arquivo[]
  /** Demais períodos do mesmo colaborador — a lista mostra só o mais recente. */
  historicoColaborador: Array<{
    id: string; periodoInicial: number; periodoFinal: number; descricao: string | null
    dias: number; saldoAnterior: number; gozados: number; saldo: number
    previsao: string | null; pago: boolean; historico: boolean
    eventosTotal: number; arquivosTotal: number
    /** Conteúdo do período, para a linha expandir sem nova consulta. */
    gozos: Array<{ id: string; dataInicio: string; dataFim: string; dias: number; descricao: string | null }>
    arquivos: Arquivo[]
  }>
}

const dataBR = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'
const isoDe = (v: string | null) => (v ? v.slice(0, 10) : '')

export default function ControleFeriasDetalhePage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const perm = permissions.find((p) => p.moduleSlug === 'controle-ferias')
  const podeEscrever = isMaster || isEmpresaMaster || (perm as { canWrite?: boolean } | undefined)?.canWrite === true
  const podeExcluir = isMaster || isEmpresaMaster || (perm as { canDelete?: boolean } | undefined)?.canDelete === true

  const [p, setP] = useState<Periodo | null>(null)
  const [loading, setLoading] = useState(true)
  /** Períodos do histórico abertos na tabela — o conteúdo já veio no payload. */
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)

  // Sidebar editável
  const [fAnoIni, setFAnoIni] = useState('')
  const [fAnoFim, setFAnoFim] = useState('')
  const [fDescricao, setFDescricao] = useState('')
  const [fDias, setFDias] = useState('30')
  const [fPag1, setFPag1] = useState('')
  const [fPag2, setFPag2] = useState('')
  const [fPag3, setFPag3] = useState('')

  // Rascunho do próximo período aquisitivo. Fica na barra lateral, aberto, em vez
  // de atrás de um botão: o período seguinte é a continuação natural do que se
  // está olhando, e é nesta ficha que se sabe qual saldo se arrasta.
  const [nAnoIni, setNAnoIni] = useState('')
  const [nAnoFim, setNAnoFim] = useState('')
  const [nDias, setNDias] = useState('30')
  const [salvandoNovo, setSalvandoNovo] = useState(false)

  // Modal novo gozo
  const [gozoAberto, setGozoAberto] = useState(false)
  const [gInicio, setGInicio] = useState('')
  const [gFim, setGFim] = useState('')
  const [gDescricao, setGDescricao] = useState('gozo de férias')
  const [salvandoGozo, setSalvandoGozo] = useState(false)

  // Upload de recibo
  const [enviandoArq, setEnviandoArq] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /** Clique na linha do histórico abre/fecha o período; vários podem ficar abertos. */
  function alternarExpandido(id: string) {
    setExpandidos((prev) => {
      const nova = new Set(prev)
      if (nova.has(id)) nova.delete(id); else nova.add(id)
      return nova
    })
  }

  /**
   * Correção de um gozo na própria linha, no mesmo padrão da listagem. Depois
   * de salvar recarrega o período: dias gozados e saldo são derivados no
   * backend, e refazê-los aqui seria criar uma segunda versão da conta.
   */
  async function editarGozo(id: string, patch: Record<string, unknown>) {
    await (trpc.controleFerias as any).atualizarEvento.mutate({ id, ...patch })
    carregar()
  }

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.controleFerias as any).getById.query({ id: params.id })
      .then((per: Periodo) => {
        setP(per)
        setFAnoIni(String(per.periodoInicial)); setFAnoFim(String(per.periodoFinal))
        // O próximo começa onde este termina — 2024/2025 → 2025/2026.
        setNAnoIni(String(per.periodoFinal)); setNAnoFim(String(per.periodoFinal + 1))
        setNDias('30')
        setFDescricao(per.descricao ?? '')
        setFDias(String(per.dias))
        setFPag1(isoDe(per.pagamento1)); setFPag2(isoDe(per.pagamento2)); setFPag3(isoDe(per.pagamento3))
      })
      .catch(() => setP(null))
      .finally(() => setLoading(false))
  }, [params.id])
  useEffect(() => { carregar() }, [carregar])

  async function salvarDados() {
    setSalvando(true)
    try {
      await (trpc.controleFerias as any).atualizar.mutate({
        id: p!.id,
        periodoInicial: Number(fAnoIni),
        periodoFinal: Number(fAnoFim),
        descricao: fDescricao || null,
        dias: Number(fDias) || 0,
        pagamento1: fPag1 || null,
        pagamento2: fPag2 || null,
        pagamento3: fPag3 || null,
        pago: !!(fPag1 || fPag2 || fPag3),
      })
      alerts.success('Salvo', 'Período atualizado.')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  async function alternarHistorico() {
    try {
      await (trpc.controleFerias as any).atualizar.mutate({ id: p!.id, historico: !p!.historico })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  /**
   * Cria o período aquisitivo seguinte.
   *
   * O saldo anterior dele é o SALDO DESTE — os dias que sobraram e se arrastam.
   * É por isso que o lançamento vive nesta ficha e não numa tela solta: é aqui
   * que se sabe quanto sobrou. Mesmo desenho do v1 (`modal-periodo-new.asp`),
   * que abre a partir do período atual e sugere `dias + saldo anterior − gozados`.
   */
  async function salvarNovoPeriodo() {
    if (!p) return
    const ini = Number(nAnoIni)
    const fim = Number(nAnoFim)
    if (!ini || !fim) { alerts.error('Faltam os anos', 'O período aquisitivo vai de um ano ao outro.'); return }
    if (fim < ini) { alerts.error('Anos invertidos', 'O ano final não pode ser menor que o inicial.'); return }
    setSalvandoNovo(true)
    try {
      const { id } = await (trpc.controleFerias as any).criar.mutate({
        colaboradorId: p.colaboradorId!,
        periodoInicial: ini,
        periodoFinal: fim,
        dias: Number(nDias) || 30,
        saldoAnterior: p.saldo,
        descricao: 'PERÍODO AQUISITIVO',
      })
      // O v1 arquiva o período atual ao abrir o seguinte, e por um bom motivo:
      // dois períodos abertos para a mesma pessoa fazem a lista e as pendências
      // contarem duas vezes.
      if (!p.historico) {
        await (trpc.controleFerias as any).atualizar.mutate({ id: p.id, historico: true })
      }
      alerts.success('Criado', `Período ${ini}/${fim} registrado.`)
      router.push(`/controle-ferias/${id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoNovo(false) }
  }

  async function salvarGozo() {
    if (!gInicio || !gFim) { alerts.error('Faltam as datas', 'Informe início e fim do gozo.'); return }
    setSalvandoGozo(true)
    try {
      await (trpc.controleFerias as any).criarEvento.mutate({
        periodoId: p!.id, dataInicio: gInicio, dataFim: gFim, descricao: gDescricao || null,
      })
      alerts.success('Lançado', 'Gozo registrado no período.')
      setGozoAberto(false); setGInicio(''); setGFim('')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvandoGozo(false) }
  }

  async function excluirGozo(e: Evento) {
    const ok = await alerts.confirm({ title: 'Excluir o gozo?', text: `${dataBR(e.dataInicio)} a ${dataBR(e.dataFim)} (${e.dias} dias)`, icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.controleFerias as any).excluirEvento.mutate({ id: e.id })
      carregar()
    } catch (err) { alerts.error('Erro', (err as Error).message) }
  }

  async function enviarArquivo(file: File) {
    setEnviandoArq(true)
    try {
      const fd = new FormData()
      fd.append('file', file, file.name)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const { url } = await res.json() as { url: string }
      await (trpc.controleFerias as any).criarArquivo.mutate({ periodoId: p!.id, nome: file.name, path: url })
      alerts.success('Anexado', '')
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setEnviandoArq(false) }
  }

  async function excluirArquivo(a: Arquivo) {
    const ok = await alerts.confirm({ title: `Excluir "${a.nome}"?`, text: '', icon: 'warning', confirmText: 'Excluir' })
    if (!ok) return
    try {
      await (trpc.controleFerias as any).excluirArquivo.mutate({ id: a.id })
      carregar()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (!p) return <div className="py-12 text-center text-muted-foreground">Período não encontrado</div>

  /**
   * O período seguinte, se já estiver cadastrado — o de menor ano inicial entre
   * os posteriores a este, não o mais recente da pessoa. Existindo, a barra
   * lateral mostra ele em vez de oferecer a criação: lançar 2025/2026 duas vezes
   * duplica o saldo que se arrasta.
   */
  const posteriores = p.historicoColaborador.filter((h) => h.periodoInicial > p.periodoInicial)
  const proximo = posteriores.length > 0
    ? posteriores.reduce((a, b) => (b.periodoInicial < a.periodoInicial ? b : a))
    : null
  const diasProximo = (Number(nDias) || 0) + p.saldo


  return (
    <div className="space-y-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {podeEscrever && (
            <>
              <Button size="sm" style={{ backgroundColor: MODULE_COLOR }} className="text-white" onClick={() => setGozoAberto(true)}>
                <Plus className="h-4 w-4" />Lançar gozo
              </Button>
              <Button variant="outline" size="sm" onClick={alternarHistorico}>
                {p.historico ? 'Reabrir período' : 'Mover para o histórico'}
              </Button>
            </>
          )}
          <BackButton href="/controle-ferias" label="Voltar" />
      </>}>
        {/* Mesmo desenho de /orcamentos/[id]: o h1 é a IDENTIDADE DO REGISTRO
            ("Orçamento #0042" lá, o período aquisitivo aqui) e o dono fecha o
            breadcrumb. Estava trocado — o h1 trazia o colaborador, que se repete
            em toda ficha dele, e o período, que é o que distingue uma da outra,
            ficava num badge miúdo abaixo. */}
        <h1 className="truncate">Férias {p.periodoInicial}/{p.periodoFinal}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Trabalhista</span>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/controle-ferias" className="transition-colors hover:text-foreground">Controle de Férias</Link>
          <span className="text-muted-foreground/50">›</span>
          <span className="truncate">{p.colaboradorNomeResolvido ?? 'Colaborador'}</span>
        </p>
      </PageHeaderBar>

      {/* O que a capa do orçamento mostra sobre o registro — nome, situação e os
          números do período. Aqui sem a capa em gradiente: uma ficha de férias é
          consultada às dezenas num dia, e 200px de imagem por consulta empurrariam
          o conteúdo para baixo da dobra. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-base font-semibold text-foreground">
          {p.colaboradorNomeResolvido ?? 'Colaborador'}
        </p>
        {p.pago && (
          <Badge variant="outline" className="text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
            <Check className="h-3 w-3 mr-0.5" />Pago
          </Badge>
        )}
        {p.historico && <Badge variant="outline" className="text-[11px]">Histórico</Badge>}
        <span className="text-sm text-muted-foreground tabular-nums">
          {p.dias + p.saldoAnterior} dias no período · {p.gozados} gozados · saldo {p.saldo}
        </span>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* ── Este período: os dados em cima, os gozos embaixo ──
              São a mesma coisa vista de dois ângulos: o que o período vale e
              o que já foi tirado dele. Em cartões separados, a conta do saldo
              ficava partida ao meio. */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-[13px] font-semibold text-foreground">Dados deste período</h4>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-[13px] font-semibold">Período aquisitivo</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input
                    type="number" value={fAnoIni} onChange={(e) => setFAnoIni(e.target.value)}
                    disabled={!podeEscrever} className="h-9 text-sm" min="2000" max="2100"
                    aria-label="Ano inicial do período aquisitivo"
                  />
                  <span className="text-sm text-muted-foreground">a</span>
                  <Input
                    type="number" value={fAnoFim} onChange={(e) => setFAnoFim(e.target.value)}
                    disabled={!podeEscrever} className="h-9 text-sm" min="2000" max="2100"
                    aria-label="Ano final do período aquisitivo"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Descrição</Label>
                <Input value={fDescricao} onChange={(e) => setFDescricao(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" maxLength={200} />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Dias</Label>
                <Input type="number" value={fDias} onChange={(e) => setFDias(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm mt-1.5" min="0" max="60" />
              </div>
            </div>

            {/* Até três pagamentos, como o v1 — gozo fracionado paga fracionado. */}
            <div className="mt-3">
              <Label className="text-[13px] font-semibold">Pagamentos</Label>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input type="date" value={fPag1} onChange={(e) => setFPag1(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm" />
                <Input type="date" value={fPag2} onChange={(e) => setFPag2(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm" />
                <Input type="date" value={fPag3} onChange={(e) => setFPag3(e.target.value)} disabled={!podeEscrever} className="h-9 text-sm" />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Qualquer data preenchida marca o período como pago.</p>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              {p.legacyId != null
                ? <p className="text-[11px] text-muted-foreground">Nº {p.legacyId} no sistema antigo</p>
                : <span />}
              {podeEscrever && (
                <Button variant="success" size="sm" onClick={salvarDados} disabled={salvando}>
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Salvar
                </Button>
              )}
            </div>

            {/* O cabeçalho dos gozos já traz a régua full-width (-mx-5) que separa
                as duas metades do card; uma divisória em cima dela seria a mesma
                linha duas vezes. */}
            <div className="flex items-center gap-2 mt-7 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <CalendarDays className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-[13px] font-semibold text-foreground">Gozos do período</h4>
            </div>
            {p.eventos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-3 text-center">Nenhum gozo lançado ainda.</p>
            ) : (
              <div className="space-y-2">
                {p.eventos.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
                    <span className="flex items-center gap-1 text-sm font-medium tabular-nums shrink-0">
                      <InlineEditCell
                        type="date"
                        value={isoDe(e.dataInicio)}
                        disabled={!podeEscrever}
                        display={() => <span className="tabular-nums">{dataBR(e.dataInicio)}</span>}
                        onSave={(v) => editarGozo(e.id, { dataInicio: v })}
                        validate={(v) => (v ? null : 'Informe a data de início')}
                      />
                      <span className="text-muted-foreground">→</span>
                      <InlineEditCell
                        type="date"
                        value={isoDe(e.dataFim)}
                        disabled={!podeEscrever}
                        display={() => <span className="tabular-nums">{dataBR(e.dataFim)}</span>}
                        onSave={(v) => editarGozo(e.id, { dataFim: v })}
                        validate={(v) => (v ? null : 'Informe a data de fim')}
                      />
                    </span>
                    <Badge variant="secondary" className="text-[10px] tabular-nums shrink-0">{e.dias} {e.dias === 1 ? 'dia' : 'dias'}</Badge>
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                      <InlineEditCell
                        type="text"
                        value={e.descricao}
                        emptyLabel="sem observação"
                        disabled={!podeEscrever}
                        onSave={(v) => editarGozo(e.id, { descricao: v || null })}
                      />
                    </span>
                    {e.registradoPorNome && (
                      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">por {e.registradoPorNome}</span>
                    )}
                    {podeExcluir && (
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => excluirGozo(e)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Saldo do período</span>
              <span className={cn('font-bold tabular-nums text-sm', corSaldoTexto(p.saldo))}>
                {p.saldo} {Math.abs(p.saldo) === 1 ? 'dia' : 'dias'}
              </span>
            </div>
          </Card>

          {/* ── Períodos anteriores do colaborador (histórico interno) ── */}
          {(p.historicoColaborador?.length ?? 0) > 0 && (
            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
                <History className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Períodos anteriores</h4>
                <Badge variant="secondary" className="text-[10px]">{p.historicoColaborador.length}</Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {expandidos.size > 0 && (
                    <button type="button" onClick={() => setExpandidos(new Set())} className="mr-2 underline underline-offset-2 hover:text-foreground">
                      recolher todos
                    </button>
                  )}
                  Histórico de {p.colaboradorNomeResolvido ?? 'colaborador'}
                </span>
              </div>
              <div className="overflow-x-auto nice-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground [&_th]:whitespace-nowrap [&_th]:py-1.5 [&_th]:font-semibold">
                      <th className="text-left">Período</th>
                      <th className="text-center">Dias</th>
                      <th className="text-center">Gozados</th>
                      <th className="text-center">Saldo</th>
                      <th className="text-left">Previsão</th>
                      <th className="text-left">Situação</th>
                      <th className="text-right">Anexos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.historicoColaborador.map((h) => {
                      const aberto = expandidos.has(h.id)
                      return (
                      <Fragment key={h.id}>
                      <tr
                        onClick={() => alternarExpandido(h.id)}
                        className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40 [&_td]:whitespace-nowrap [&_td]:py-2"
                      >
                        <td className="font-medium tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronRight className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', aberto && 'rotate-90')} />
                            {h.periodoInicial}/{h.periodoFinal}
                          </span>
                        </td>
                        <td className="text-center tabular-nums">{h.dias + h.saldoAnterior}</td>
                        <td className="text-center tabular-nums">{h.gozados}</td>
                        <td className="text-center">
                          <span className={cn('inline-flex h-5 min-w-[26px] items-center justify-center rounded px-1.5 text-[11px] font-bold tabular-nums', corSaldo(h.saldo))}>
                            {h.saldo}
                          </span>
                        </td>
                        <td className="text-muted-foreground tabular-nums">{dataBR(h.previsao)}</td>
                        <td>
                          <span className="flex items-center gap-1">
                            {h.pago && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">Pago</Badge>}
                            {h.historico && <Badge variant="outline" className="text-[10px]">Histórico</Badge>}
                          </span>
                        </td>
                        <td className="text-right text-muted-foreground tabular-nums">{h.eventosTotal} gozo(s) · {h.arquivosTotal} anexo(s)</td>
                      </tr>
                      {aberto && (
                        <tr className="border-b border-border/40 bg-muted/20">
                          <td colSpan={7} className="px-0 py-3">
                            <div className="space-y-3 px-3">
                              <div>
                                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Gozos do período</p>
                                {h.gozos.length === 0 ? (
                                  <p className="text-xs italic text-muted-foreground">Nenhum gozo lançado neste período.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {h.gozos.map((g) => (
                                      <div key={g.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-2.5 py-1.5">
                                        <span className="shrink-0 text-xs font-medium tabular-nums">{dataBR(g.dataInicio)} → {dataBR(g.dataFim)}</span>
                                        <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums">{g.dias} {g.dias === 1 ? 'dia' : 'dias'}</Badge>
                                        <span className="flex-1 truncate text-[11px] text-muted-foreground">{g.descricao ?? ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {h.arquivos.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recibos e avisos</p>
                                  <div className="space-y-1.5">
                                    {h.arquivos.map((a) => (
                                      <a
                                        key={a.id}
                                        href={`${getApiUrl()}${a.path}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs hover:bg-muted/40"
                                      >
                                        <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <span className="flex-1 truncate">{a.nome}</span>
                                        <span className="shrink-0 text-[10px] text-muted-foreground">{dataBR(a.criadoEm)}</span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex justify-end">
                                <Button variant="outline" size="xs" className="gap-1" onClick={(e) => { e.stopPropagation(); router.push(`/controle-ferias/${h.id}`) }}>
                                  <ExternalLink className="h-3.5 w-3.5" />Abrir período
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* ── Barra lateral: o período SEGUINTE ──
            Aqui ficava a ficha do 2024/2025, que a listagem já edita na linha.
            O que faltava era o passo que vem depois de olhar o saldo: abrir o
            período seguinte com os dias que sobraram. Ele nasce desta tela
            porque é nela que se sabe quanto sobrou. */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CalendarDays className="h-4 w-4" style={{ color: MODULE_COLOR }} />
              <h4 className="text-sm font-semibold">Próximo período</h4>
            </div>

            {proximo ? (
              /* Já cadastrado: mostra, não oferece criar de novo. */
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {proximo.periodoInicial}/{proximo.periodoFinal}
                    </span>
                    <span className={cn('text-sm font-semibold tabular-nums', corSaldoTexto(proximo.saldo))}>
                      {proximo.saldo} {Math.abs(proximo.saldo) === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                    {proximo.dias} do período + {proximo.saldoAnterior} de saldo anterior
                    {proximo.gozados > 0 && ` − ${proximo.gozados} gozado(s)`}
                  </p>
                </div>
                <Link href={`/controle-ferias/${proximo.id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    Abrir período <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ) : !p.colaboradorId ? (
              /* Resíduo do v1 sem vínculo: não há a quem lançar. */
              <p className="text-[11px] text-muted-foreground">
                Registro sem vínculo com o cadastro atual — não dá para lançar o período seguinte por aqui.
              </p>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-[13px] font-semibold">Período aquisitivo</Label>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Input
                      type="number" value={nAnoIni} onChange={(e) => setNAnoIni(e.target.value)}
                      disabled={!podeEscrever} className="h-9 text-sm" min="2000" max="2100"
                      aria-label="Ano inicial do próximo período"
                    />
                    <span className="text-sm text-muted-foreground">a</span>
                    <Input
                      type="number" value={nAnoFim} onChange={(e) => setNAnoFim(e.target.value)}
                      disabled={!podeEscrever} className="h-9 text-sm" min="2000" max="2100"
                      aria-label="Ano final do próximo período"
                    />
                  </div>
                </div>

                {/* Agora o "+" fecha como conta: os dias do período novo mais o
                    saldo que entra deste. */}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label className="text-[13px] font-semibold">Dias</Label>
                    <Input
                      type="number" value={nDias} onChange={(e) => setNDias(e.target.value)}
                      disabled={!podeEscrever} className="h-9 text-sm mt-1.5" min="0" max="60"
                    />
                  </div>
                  <span className="flex h-9 items-center text-sm text-muted-foreground" aria-hidden="true">+</span>
                  <div className="flex-1">
                    <Label className="text-[13px] font-semibold">Saldo que entra</Label>
                    <div
                      className={cn(
                        'mt-1.5 flex h-9 items-center rounded-md border border-border bg-muted/40 px-3',
                        'text-sm font-semibold tabular-nums',
                        corSaldoTexto(p.saldo),
                      )}
                      title={`Saldo de ${p.periodoInicial}/${p.periodoFinal}`}
                    >
                      {p.saldo} {Math.abs(p.saldo) === 1 ? 'dia' : 'dias'}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  = {diasProximo} dias no período, com o saldo de {p.periodoInicial}/{p.periodoFinal}.
                </p>

                {podeEscrever && (
                  <>
                    <Button variant="success" size="sm" className="w-full" onClick={salvarNovoPeriodo} disabled={salvandoNovo}>
                      {salvandoNovo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Criar período
                    </Button>
                    {!p.historico && (
                      <p className="text-[11px] text-muted-foreground">
                        {p.periodoInicial}/{p.periodoFinal} vai para o histórico ao criar — dois períodos
                        abertos para a mesma pessoa contam duas vezes na lista e nas pendências.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </Card>

          {/* ── Recibos / avisos ── */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2 mb-4 pb-2.5 -mx-5 px-5 border-b border-border">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4" style={{ color: MODULE_COLOR }} />
                <h4 className="text-[13px] font-semibold text-foreground">Recibos e avisos</h4>
              </div>
              {podeEscrever && (
                <>
                  <Button variant="outline" size="xs" onClick={() => fileRef.current?.click()} disabled={enviandoArq}>
                    {enviandoArq ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Anexar
                  </Button>
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarArquivo(f); e.target.value = '' }} />
                </>
              )}
            </div>
            {p.arquivos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum arquivo anexado.</p>
            ) : (
              <div className="space-y-1.5">
                {p.arquivos.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
                    <a href={`${getApiUrl()}${a.path}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs hover:underline truncate flex-1">
                      <Download className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{a.nome}</span>
                    </a>
                    <span className="text-[10px] text-muted-foreground shrink-0">{dataBR(a.criadoEm)}</span>
                    {podeExcluir && (
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => excluirArquivo(a)} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={gozoAberto} onOpenChange={(o) => { if (!salvandoGozo) setGozoAberto(o) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Plus} color="emerald">
            <DialogTitle>Lançar gozo</DialogTitle>
            <DialogDescription>O saldo do período é recalculado na hora.</DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[13px] font-semibold">Início</Label>
                <Input type="date" value={gInicio} onChange={(e) => setGInicio(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Fim</Label>
                <Input type="date" value={gFim} onChange={(e) => setGFim(e.target.value)} className="h-9 text-sm mt-1.5" />
              </div>
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <Input value={gDescricao} onChange={(e) => setGDescricao(e.target.value)} className="h-9 text-sm mt-1.5" maxLength={200} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGozoAberto(false)} disabled={salvandoGozo}>Cancelar</Button>
            <Button variant="success" size="sm" onClick={salvarGozo} disabled={salvandoGozo}>
              {salvandoGozo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Lançar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
