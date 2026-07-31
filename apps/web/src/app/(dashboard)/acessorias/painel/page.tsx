'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  MailWarning, Loader2, AlertTriangle, Clock, CheckCircle2, ExternalLink,
  Users, ListChecks, RefreshCw, MailOpen, Ban, SlidersHorizontal, Trash2,
  ArrowUp, ArrowDown,
} from 'lucide-react'
import {
  Button, Card, Badge, Input, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { masks } from '@/lib/masks'
import { EntityCombobox } from '@/components/ui/entity-combobox'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)'

type Foco = 'a_vencer' | 'nao_lidas' | 'atrasadas' | 'todas'

interface Linha {
  id: string
  entId: string
  clienteId: string
  clienteCode: number
  clienteNome: string
  documento: string
  obrigacao: string
  competencia: string | null
  prazo: string | null
  diasParaPrazo: number | null
  vencimento: string | null
  diasParaVencimento: number | null
  dtEntrega: string | null
  lidaEm: string | null
  status: string | null
  lida: boolean | null
  guiaLida: string | null
  entregue: boolean
  dispensada: boolean
  multa: boolean
  dpto: string | null
  respEntrega: string | null
  respPrazo: string | null
  responsavel: string | null
  responsavelEntregou: boolean
}
interface Resumo {
  total: number; entregues: number; comGuia: number; lidas: number
  naoLidas: number; naoLidasAVencer: number; naoLidasCriticas: number
  atrasadas: number; comMulta: number
}
interface OpcoesPainel {
  departamentos: string[]
  responsaveis: string[]
  clientes: { id: string; code: number; razaoSocial: string; documento: string }[]
}
interface PorCliente {
  clienteId: string; clienteCode: number; clienteNome: string; documento: string
  total: number; naoLidas: number; naoLidasCriticas: number; atrasadas: number
  proximoPrazo: string | null; obrigacoesNaoLidas: string[]
}

const fmtData = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/** Competência no formato do Acessórias: "Jun/2026". */
const fmtComp = (v: string | null) => {
  if (!v) return '—'
  const d = new Date(v)
  const m = d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${m.charAt(0).toUpperCase()}${m.slice(1)}/${d.getUTCFullYear()}`
}

/** Data + hora, para o momento em que o cliente abriu a guia. */
const fmtDataHora = (v: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Situação da linha, na linguagem de quem cobra.
 *
 * A entrega tem precedência sobre o vencimento: obrigação entregue — em especial
 * a antecipada, que é rotina — está resolvida, e anunciar "venceu há 16d" numa
 * linha já fechada só tira a confiança do painel. Só quem continua em aberto
 * recebe a contagem do prazo.
 */
function situacao(l: Linha) {
  if (l.entregue) {
    const adiantada = l.dtEntrega && l.prazo && new Date(l.dtEntrega) < new Date(l.prazo)
    return {
      texto: `entregue ${fmtData(l.dtEntrega)}`,
      titulo: adiantada
        ? `Entregue antes do prazo interno (${fmtData(l.prazo)}) · vencimento ${fmtData(l.vencimento)}`
        : `Prazo interno: ${fmtData(l.prazo)} · vencimento ${fmtData(l.vencimento)}`,
      cor: 'text-emerald-600 dark:text-emerald-400',
    }
  }
  if (l.dispensada) {
    return { texto: 'dispensada', titulo: 'Não era devida no período', cor: 'text-muted-foreground' }
  }
  // Conta contra o VENCIMENTO da guia, não contra o prazo interno de entrega:
  // é a data em que o cliente sofre a consequência.
  const dias = l.diasParaVencimento
  const t = `Vencimento: ${fmtData(l.vencimento)} · prazo interno: ${fmtData(l.prazo)}`
  if (dias === null) return { texto: 'sem vencimento', titulo: '', cor: 'text-muted-foreground' }
  if (dias < 0) return { texto: `venceu há ${Math.abs(dias)}d`, titulo: t, cor: 'text-rose-600 dark:text-rose-400 font-semibold' }
  if (dias === 0) return { texto: 'vence hoje', titulo: t, cor: 'text-rose-600 dark:text-rose-400 font-semibold' }
  if (dias <= 3) return { texto: `vence em ${dias}d`, titulo: t, cor: 'text-amber-600 dark:text-amber-400 font-semibold' }
  return { texto: `vence em ${dias}d`, titulo: t, cor: 'text-muted-foreground' }
}

type CampoOrdem = 'obrigacao' | 'clienteNome' | 'dpto' | 'respEntrega' | 'competencia' | 'prazo' | 'vencimento' | 'dtEntrega' | 'situacao'

/**
 * Chave de ordenação por coluna. Datas viram número (ausente vai para o fim,
 * em qualquer direção); a situação usa um ranking de urgência em vez da ordem
 * alfabética do texto, senão "dispensada" cairia antes de "venceu há 30d".
 */
function chaveOrdem(l: Linha, campo: CampoOrdem): string | number {
  switch (campo) {
    case 'competencia': return l.competencia ? new Date(l.competencia).getTime() : Number.MAX_SAFE_INTEGER
    case 'prazo':       return l.prazo ? new Date(l.prazo).getTime() : Number.MAX_SAFE_INTEGER
    case 'vencimento':  return l.vencimento ? new Date(l.vencimento).getTime() : Number.MAX_SAFE_INTEGER
    case 'dtEntrega':   return l.dtEntrega ? new Date(l.dtEntrega).getTime() : Number.MAX_SAFE_INTEGER
    case 'situacao': {
      if (l.dispensada) return 4
      if (l.entregue) return 3
      const d = l.diasParaVencimento
      if (d === null) return 2          // sem vencimento
      return d < 0 ? 0 : 1              // vencido primeiro, depois a vencer
    }
    case 'respEntrega': return String(l.responsavel ?? '').toLowerCase()
    default: return String(l[campo] ?? '').toLowerCase()
  }
}

/** Cabeçalho clicável: alterna asc/desc e sinaliza a coluna ativa. */
function Th({
  campo, atual, dir, onOrdenar, className, children, alinhar,
}: {
  campo?: CampoOrdem
  atual: CampoOrdem
  dir: 'asc' | 'desc'
  onOrdenar: (c: CampoOrdem) => void
  className?: string
  children?: React.ReactNode
  alinhar?: 'right'
}) {
  const ativo = campo && campo === atual
  return (
    <th
      className={cn(
        'px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
        alinhar === 'right' && 'text-right',
        campo && 'cursor-pointer select-none hover:text-foreground',
        className,
      )}
      onClick={campo ? () => onOrdenar(campo) : undefined}
    >
      <span className={cn('inline-flex items-center gap-1', ativo && 'text-foreground')}>
        {children}
        {ativo && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  )
}

export default function PainelEntregasPage() {
  const [foco, setFoco] = useState<Foco>('a_vencer')
  const [janelaDias, setJanelaDias] = useState(7)
  const [dpto, setDpto] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [ordem, setOrdem] = useState<CampoOrdem>('vencimento')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [busca, setBusca] = useState('')
  const [visao, setVisao] = useState<'obrigacao' | 'cliente'>('obrigacao')

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [clientes, setClientes] = useState<PorCliente[]>([])
  const [opcoes, setOpcoes] = useState<OpcoesPainel>({ departamentos: [], responsaveis: [], clientes: [] })
  const [loading, setLoading] = useState(true)
  const [urlTemplate, setUrlTemplate] = useState<string | null>(null)
  const [regrasOpen, setRegrasOpen] = useState(false)
  const [novaRegra, setNovaRegra] = useState<Linha | null>(null)
  const { isMaster, isEmpresaMaster, permissions } = useUserPermissions()
  const subs = (permissions.find(p => p.moduleSlug === 'acessorias')?.subPermissions ?? {}) as Record<string, boolean>
  const podeRegras = isMaster || isEmpresaMaster || subs.gerenciar_integracao === true

  const filtro = useCallback(() => ({
    foco,
    janelaDias,
    dpto: dpto || undefined,
    responsavel: responsavel || undefined,
    clienteId: clienteId || undefined,
  }), [foco, janelaDias, dpto, responsavel, clienteId])

  const carregar = useCallback(() => {
    setLoading(true)
    const f = filtro()
    Promise.all([
      (trpc.acessorias as any).painelEntregas.query(f),
      (trpc.acessorias as any).painelEntregasPorCliente.query(f),
    ])
      .then(([lista, porCliente]: [
        { linhas: Linha[]; resumo: Resumo; urlEntregaTemplate?: string | null },
        { clientes: PorCliente[] },
      ]) => {
        setLinhas(lista.linhas || [])
        setResumo(lista.resumo)
        setUrlTemplate(lista.urlEntregaTemplate ?? null)
        setClientes(porCliente.clientes || [])
      })
      .catch(() => { setLinhas([]); setResumo(null); setClientes([]) })
      .finally(() => setLoading(false))
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    ;(trpc.acessorias as any).painelEntregasOpcoes.query()
      .then((d: OpcoesPainel) => setOpcoes({ ...d, clientes: d.clientes ?? [] })).catch(() => {})
  }, [])

  const ordenar = (campo: CampoOrdem) => {
    if (campo === ordem) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setOrdem(campo); setDir('asc') }
  }

  const q = busca.trim().toLowerCase()
  const linhasFiltradas = (q
    ? linhas.filter((l) => l.clienteNome.toLowerCase().includes(q) || l.obrigacao.toLowerCase().includes(q))
    : linhas
  ).slice().sort((a, b) => {
    const va = chaveOrdem(a, ordem), vb = chaveOrdem(b, ordem)
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return dir === 'asc' ? cmp : -cmp
  })
  const clientesFiltrados = q
    ? clientes.filter((c) => c.clienteNome.toLowerCase().includes(q))
    : clientes

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <MailWarning className="h-6 w-6" />
          </div>
          <div>
            <h1>Entregas e leitura das guias</h1>
            <p className="text-sm text-muted-foreground">Quem ainda não abriu a guia — antes do vencimento</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {podeRegras && (
            <Button variant="outline" size="sm" onClick={() => setRegrasOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />Regras
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={carregar} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar
          </Button>
          <BackButton href="/acessorias" label="Voltar" />
        </div>
      </div>

      {/* Cartões — clicar troca o foco, que é como se navega neste painel */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoFoco
          ativo={foco === 'a_vencer'} onClick={() => setFoco('a_vencer')}
          icone={<AlertTriangle className="h-4 w-4" />} cor="text-rose-600 dark:text-rose-400"
          valor={resumo?.naoLidasCriticas ?? 0}
          titulo="Não abertas e vencendo"
          nota={`guia entregue, cliente não abriu, vence em até ${janelaDias}d`}
        />
        <CartaoFoco
          ativo={foco === 'atrasadas'} onClick={() => setFoco('atrasadas')}
          icone={<Clock className="h-4 w-4" />} cor="text-orange-600 dark:text-orange-400"
          valor={resumo?.atrasadas ?? 0}
          titulo="Entregas atrasadas"
          nota="não entregues com vencimento passado"
        />
        <CartaoFoco
          ativo={foco === 'nao_lidas'} onClick={() => setFoco('nao_lidas')}
          icone={<MailWarning className="h-4 w-4" />} cor="text-amber-600 dark:text-amber-400"
          valor={resumo?.naoLidas ?? 0}
          titulo="Obrigações entregues, porém não lidas pelo cliente"
          nota="em todo o período consultado"
        />
        <CartaoFoco
          ativo={foco === 'todas'} onClick={() => setFoco('todas')}
          icone={<CheckCircle2 className="h-4 w-4" />} cor="text-emerald-600 dark:text-emerald-400"
          valor={resumo?.lidas ?? 0}
          titulo="Guias abertas"
          nota={resumo ? `de ${resumo.comGuia} com guia · ver tudo` : 'ver tudo'}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              <button type="button" onClick={() => setVisao('obrigacao')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs', visao === 'obrigacao' ? 'text-white' : 'bg-card text-muted-foreground hover:bg-muted')}
                style={visao === 'obrigacao' ? { backgroundColor: MODULE_COLOR } : undefined}>
                <ListChecks className="h-3.5 w-3.5" />Por obrigação
              </button>
              <button type="button" onClick={() => setVisao('cliente')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs', visao === 'cliente' ? 'text-white' : 'bg-card text-muted-foreground hover:bg-muted')}
                style={visao === 'cliente' ? { backgroundColor: MODULE_COLOR } : undefined}>
                <Users className="h-3.5 w-3.5" />Por cliente
              </button>
            </div>

            <Select value={dpto || '__all__'} onValueChange={(v) => setDpto(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 w-[160px] bg-card text-xs"><SelectValue placeholder="Departamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os departamentos</SelectItem>
                {opcoes.departamentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={responsavel || '__all__'} onValueChange={(v) => setResponsavel(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-8 w-[190px] bg-card text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os responsáveis</SelectItem>
                {opcoes.responsaveis.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>

            <EntityCombobox
              className="w-[230px]"
              items={opcoes.clientes.map((c) => ({
                id: c.id, label: c.razaoSocial, sublabel: `#${c.code} · ${masks.cpfCnpj(c.documento)}`,
              }))}
              value={clienteId}
              onSelect={(id) => setClienteId(id === clienteId ? '' : id)}
              placeholder="Todos os clientes"
              searchPlaceholder="Buscar cliente..."
              emptyText="Nenhum cliente com entrega"
            />

            <Select value={String(janelaDias)} onValueChange={(v) => setJanelaDias(Number(v))}>
              <SelectTrigger className="h-8 w-[130px] bg-card text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 5, 7, 10, 15, 30].map((d) => <SelectItem key={d} value={String(d)}>janela de {d}d</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou obrigação..." className="h-8 bg-card text-xs lg:w-72" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
          </div>
        ) : visao === 'cliente' ? (
          clientesFiltrados.length === 0 ? (
            <VazioPainel />
          ) : (
            <div className="divide-y divide-border/60">
              {clientesFiltrados.map((c) => (
                <div key={c.clienteId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Link href={`/clientes/${c.clienteId}`} target="_blank"
                      className="inline-flex items-center gap-1 truncate text-sm font-medium hover:underline">
                      #{c.clienteCode} — {c.clienteNome}
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </Link>
                    <p className="font-mono text-[11px] text-muted-foreground">{masks.cpfCnpj(c.documento)}</p>
                    {c.obrigacoesNaoLidas.length > 0 && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={c.obrigacoesNaoLidas.join(' · ')}>
                        não abriu: {c.obrigacoesNaoLidas.slice(0, 3).join(' · ')}
                        {c.obrigacoesNaoLidas.length > 3 ? ` +${c.obrigacoesNaoLidas.length - 3}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.naoLidasCriticas > 0 && (
                      <Badge className="bg-rose-100 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                        {c.naoLidasCriticas} vencendo
                      </Badge>
                    )}
                    {c.naoLidas > 0 && (
                      <Badge variant="outline" className="text-[10px]">{c.naoLidas} não abertas</Badge>
                    )}
                    {c.atrasadas > 0 && (
                      <Badge className="bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                        {c.atrasadas} atrasadas
                      </Badge>
                    )}
                    {c.proximoPrazo && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">{fmtData(c.proximoPrazo)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : linhasFiltradas.length === 0 ? (
          <VazioPainel />
        ) : (
          <div className="max-h-[620px] overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted/40 backdrop-blur">
                <tr className="border-b border-border">
                  <Th atual={ordem} dir={dir} onOrdenar={ordenar} className="w-[62px]" />
                  <Th campo="obrigacao"   atual={ordem} dir={dir} onOrdenar={ordenar}>Obrigação</Th>
                  <Th campo="clienteNome" atual={ordem} dir={dir} onOrdenar={ordenar} className="hidden w-[24%] md:table-cell">Cliente</Th>
                  <Th campo="dpto"        atual={ordem} dir={dir} onOrdenar={ordenar} className="hidden w-[100px] lg:table-cell">Área</Th>
                  <Th campo="respEntrega" atual={ordem} dir={dir} onOrdenar={ordenar} className="hidden w-[150px] 2xl:table-cell">Responsável</Th>
                  <Th campo="competencia" atual={ordem} dir={dir} onOrdenar={ordenar} className="hidden w-[104px] lg:table-cell">Competência</Th>
                  <Th campo="prazo"       atual={ordem} dir={dir} onOrdenar={ordenar} className="hidden w-[96px] xl:table-cell">Prazo interno</Th>
                  <Th campo="vencimento"  atual={ordem} dir={dir} onOrdenar={ordenar} className="w-[104px]">Vencimento</Th>
                  <Th campo="dtEntrega"   atual={ordem} dir={dir} onOrdenar={ordenar} className="hidden w-[104px] sm:table-cell">Entrega</Th>
                  <Th campo="situacao"    atual={ordem} dir={dir} onOrdenar={ordenar} className="w-[126px]">Situação</Th>
                  <Th atual={ordem} dir={dir} onOrdenar={ordenar} className="w-[64px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {linhasFiltradas.map((l) => {
                  const p = situacao(l)
                  return (
                    <tr key={l.id} className="group align-middle hover:bg-muted/30">
                      {/* Sinais: coluna própria e estreita, só ícone + title. As
                          etiquetas escritas empurravam o nome da obrigação para
                          uma posição diferente em cada linha.
                          O `title` fica no <span> porque o ícone do lucide não
                          repassa a prop para o <svg>. */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {l.lida === false && (
                            <span title="Cliente ainda não abriu a guia" className="inline-flex">
                              <MailWarning className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </span>
                          )}
                          {l.lida === true && (
                            <span
                              title={l.lidaEm ? `Cliente abriu a guia em ${fmtDataHora(l.lidaEm)}` : 'Cliente abriu a guia'}
                              className="inline-flex"
                            >
                              <MailOpen className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </span>
                          )}
                          {l.multa && (
                            <span title="Obrigação sujeita a multa" className="inline-flex">
                              <AlertTriangle className="h-4 w-4 text-rose-500 dark:text-rose-400" />
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        <p className="truncate font-medium" title={l.obrigacao}>{l.obrigacao}</p>
                        {/* Abaixo do nome só nas telas onde a coluna Cliente
                            some — senão o dado apareceria duas vezes. */}
                        <Link href={`/clientes/${l.clienteId}`} target="_blank"
                          className="truncate text-[11px] text-muted-foreground hover:underline md:hidden">
                          #{l.clienteCode} — {l.clienteNome}
                        </Link>
                      </td>

                      <td className="hidden px-3 py-2 md:table-cell">
                        <Link href={`/clientes/${l.clienteId}`} target="_blank"
                          className="block truncate text-[12px] text-muted-foreground hover:underline"
                          title={`#${l.clienteCode} — ${l.clienteNome}`}>
                          #{l.clienteCode} — {l.clienteNome}
                        </Link>
                      </td>

                      <td className="hidden truncate px-3 py-2 text-[12px] text-muted-foreground lg:table-cell" title={l.dpto ?? ''}>
                        {l.dpto || '—'}
                      </td>

                      {/* Enquanto ninguém entrega, mostra o responsável pelo
                          prazo — em itálico, para diferenciar de quem de fato
                          entregou. */}
                      <td
                        className={cn(
                          'hidden truncate px-3 py-2 text-[12px] text-muted-foreground 2xl:table-cell',
                          l.responsavel && !l.responsavelEntregou && 'italic',
                        )}
                        title={
                          !l.responsavel ? ''
                            : l.responsavelEntregou
                              ? `Entregue por ${l.responsavel}`
                              : `Responsável pelo prazo: ${l.responsavel} (ainda não entregue)`
                        }
                      >
                        {l.responsavel || '—'}
                      </td>

                      <td className="hidden px-3 py-2 text-[12px] text-muted-foreground lg:table-cell">
                        {fmtComp(l.competencia)}
                      </td>

                      <td className="hidden px-3 py-2 text-[12px] text-muted-foreground tabular-nums xl:table-cell"
                        title="Prazo do escritório para entregar">
                        {fmtData(l.prazo)}
                      </td>

                      <td className="px-3 py-2 text-[12px] font-medium tabular-nums"
                        title={`Vencimento da guia · prazo interno ${fmtData(l.prazo)}`}>
                        {fmtData(l.vencimento)}
                      </td>

                      <td className="hidden px-3 py-2 text-[12px] tabular-nums sm:table-cell">
                        {l.dtEntrega
                          ? <span className={cn(l.dtEntrega && l.prazo && new Date(l.dtEntrega) < new Date(l.prazo)
                              ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                              {fmtData(l.dtEntrega)}
                            </span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>

                      <td className={cn('px-3 py-2 text-[12px] tabular-nums', p.cor)} title={p.titulo}>
                        {p.texto}
                      </td>

                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2">
                          {urlTemplate && (
                            <a
                              href={urlTemplate.replace('{entId}', l.entId).replace('{cnpj}', l.documento.replace(/\D/g, ''))}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Abrir esta entrega no Acessórias"
                              className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {podeRegras && (
                            <button
                              type="button"
                              onClick={() => setNovaRegra(l)}
                              title="Esta obrigação não é devida — criar regra"
                              className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

          </div>
        )}
      </Card>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Dados espelhados do Acessórias na última sincronização de entregas. Obrigações sem guia para
        o cliente abrir não entram na contagem de &ldquo;não abertas&rdquo;.
      </p>

      {novaRegra && (
        <NovaRegraModal
          linha={novaRegra}
          onClose={() => setNovaRegra(null)}
          onSalvo={() => { setNovaRegra(null); carregar() }}
        />
      )}
      {regrasOpen && <RegrasModal onClose={() => setRegrasOpen(false)} onMudou={carregar} />}
    </div>
  )
}

/**
 * Cria a regra a partir de uma linha do painel — que é onde o problema aparece.
 * Obrigar a ir a uma tela de configuração para dizer "isso aqui não é devido"
 * faria a maioria simplesmente conviver com o ruído.
 */
function NovaRegraModal({ linha, onClose, onSalvo }: {
  linha: Linha; onClose: () => void; onSalvo: () => void
}) {
  const [escopo, setEscopo] = useState<'cliente' | 'todos'>('cliente')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    try {
      const r = await (trpc.acessorias as any).salvarRegraObrigacao.mutate({
        nome: linha.obrigacao,
        clienteId: escopo === 'cliente' ? linha.clienteId : null,
        considerar: false,
        motivo: motivo.trim() || undefined,
      }) as { removidos: number }
      await alerts.success(
        'Regra criada',
        r.removidos > 0
          ? `${r.removidos} entrega(s) saíram do painel. A próxima sincronização já não traz esta obrigação.`
          : 'A próxima sincronização já não traz esta obrigação.',
      )
      onSalvo()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSalvando(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeaderIcon icon={Ban} color="rose">
          <DialogTitle>Obrigação não devida</DialogTitle>
          <DialogDescription>
            A sincronização deixa de trazer esta obrigação, e ela sai do painel.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <p className="font-medium">{linha.obrigacao}</p>
            <p className="text-[11px] text-muted-foreground">
              #{linha.clienteCode} — {linha.clienteNome}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[13px] font-semibold">Vale para</p>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/30">
              <input type="radio" checked={escopo === 'cliente'} onChange={() => setEscopo('cliente')} className="mt-0.5 h-4 w-4" />
              <span>
                <strong>Só este cliente</strong>
                <span className="block text-[11px] text-muted-foreground">
                  Os demais continuam com a obrigação normalmente.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/30">
              <input type="radio" checked={escopo === 'todos'} onChange={() => setEscopo('todos')} className="mt-0.5 h-4 w-4" />
              <span>
                <strong>Todos os clientes</strong>
                <span className="block text-[11px] text-muted-foreground">
                  A obrigação sai do painel inteiro. Depois dá para abrir exceção por cliente.
                </span>
              </span>
            </label>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Motivo (opcional)</p>
            <Input value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: cliente não tem empregados" className="h-9 text-sm" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Quem revisar a regra daqui a um ano vai precisar disto.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" size="sm" disabled={salvando} onClick={salvar}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            Não considerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface Regra {
  id: string
  nome: string
  considerar: boolean
  motivo: string | null
  criadoEm: string
  cliente: { id: string; code: number; razaoSocial: string } | null
}

/** Regras existentes, com a possibilidade de desfazer. */
function RegrasModal({ onClose, onMudou }: { onClose: () => void; onMudou: () => void }) {
  const [regras, setRegras] = useState<Regra[]>([])
  const [loading, setLoading] = useState(true)
  const [removendo, setRemovendo] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setLoading(true)
    ;(trpc.acessorias as any).listarRegrasObrigacao.query()
      .then((d: Regra[]) => setRegras(d || []))
      .catch((e: Error) => alerts.error('Erro', e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function remover(r: Regra) {
    const ok = await alerts.confirm({
      title: 'Remover a regra?',
      text: `"${r.nome}" volta a ser considerada${r.cliente ? ` para ${r.cliente.razaoSocial}` : ''} na próxima sincronização.`,
      icon: 'warning',
      confirmText: 'Remover',
    })
    if (!ok) return
    setRemovendo(r.id)
    try {
      await (trpc.acessorias as any).removerRegraObrigacao.mutate({ id: r.id })
      carregar()
      onMudou()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setRemovendo(null) }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-h-[85vh] flex flex-col">
        <DialogHeaderIcon icon={SlidersHorizontal} color="violet">
          <DialogTitle>Regras de obrigações</DialogTitle>
          <DialogDescription>
            O que a sincronização deixa de trazer. Regra por cliente vence a regra geral.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : regras.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma regra ainda. Use o ícone de bloqueio na linha do painel para criar a primeira.
            </p>
          ) : (
            <div className="divide-y divide-border/60 rounded-lg border border-border">
              {regras.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{r.nome}</span>
                      {r.considerar
                        ? <Badge className="bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">exceção: considerar</Badge>
                        : <Badge className="bg-rose-100 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">não considerar</Badge>}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {r.cliente ? `#${r.cliente.code} — ${r.cliente.razaoSocial}` : 'todos os clientes'}
                      {r.motivo ? ` · ${r.motivo}` : ''}
                    </p>
                  </div>
                  <Button variant="soft-destructive" size="icon-sm" disabled={removendo === r.id}
                    onClick={() => remover(r)} title="Remover regra">
                    {removendo === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CartaoFoco({ ativo, onClick, icone, cor, valor, titulo, nota }: {
  ativo: boolean; onClick: () => void; icone: React.ReactNode; cor: string
  valor: number; titulo: string; nota: string
}) {
  // h-full nos dois: os títulos têm comprimentos bem diferentes e, sem isso, o
  // cartão de texto mais longo fica mais alto que os vizinhos.
  return (
    <button type="button" onClick={onClick} className="h-full text-left">
      <Card className={cn('flex h-full flex-col p-4 transition-colors hover:bg-muted/40', ativo && 'border-current')}
        style={ativo ? { borderColor: MODULE_COLOR } : undefined}>
        <div className={cn('flex items-center gap-1.5', cor)}>
          {icone}
          <span className="text-2xl font-bold tabular-nums">{valor}</span>
        </div>
        <p className="mt-0.5 text-[13px] font-medium text-balance">{titulo}</p>
        <p className="mt-auto pt-0.5 text-[11px] text-muted-foreground">{nota}</p>
      </Card>
    </button>
  )
}

function VazioPainel() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
      <CheckCircle2 className="mb-2 h-10 w-10 opacity-20" />
      <p className="text-sm">Nada aqui — ou a sincronização de entregas ainda não rodou.</p>
    </div>
  )
}
