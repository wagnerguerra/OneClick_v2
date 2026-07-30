'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  MailWarning, Loader2, AlertTriangle, Clock, CheckCircle2, ExternalLink,
  Users, ListChecks, RefreshCw, MailOpen,
} from 'lucide-react'
import {
  Button, Card, Badge, Input, cn,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { trpc } from '@/lib/trpc'
import { masks } from '@/lib/masks'

const MODULE_COLOR = 'var(--mod-administrativo, #0ea5e9)'

type Foco = 'a_vencer' | 'nao_lidas' | 'atrasadas' | 'todas'

interface Linha {
  id: string
  clienteId: string
  clienteCode: number
  clienteNome: string
  documento: string
  obrigacao: string
  competencia: string | null
  prazo: string | null
  diasParaPrazo: number | null
  status: string | null
  lida: boolean | null
  guiaLida: string | null
  entregue: boolean
  multa: boolean
  dpto: string | null
  respEntrega: string | null
}
interface Resumo {
  total: number; entregues: number; comGuia: number; lidas: number
  naoLidas: number; naoLidasAVencer: number; naoLidasCriticas: number
  atrasadas: number; comMulta: number
}
interface PorCliente {
  clienteId: string; clienteCode: number; clienteNome: string; documento: string
  total: number; naoLidas: number; naoLidasCriticas: number; atrasadas: number
  proximoPrazo: string | null; obrigacoesNaoLidas: string[]
}

const fmtData = (v: string | null) =>
  v ? new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'

/** Texto do prazo em linguagem de quem cobra: "vence em 3 dias", "venceu há 2". */
function prazoTexto(dias: number | null) {
  if (dias === null) return { texto: 'sem prazo', cor: 'text-muted-foreground' }
  if (dias < 0) return { texto: `venceu há ${Math.abs(dias)}d`, cor: 'text-rose-600 dark:text-rose-400 font-semibold' }
  if (dias === 0) return { texto: 'vence hoje', cor: 'text-rose-600 dark:text-rose-400 font-semibold' }
  if (dias <= 3) return { texto: `vence em ${dias}d`, cor: 'text-amber-600 dark:text-amber-400 font-semibold' }
  return { texto: `vence em ${dias}d`, cor: 'text-muted-foreground' }
}

export default function PainelEntregasPage() {
  const [foco, setFoco] = useState<Foco>('a_vencer')
  const [janelaDias, setJanelaDias] = useState(7)
  const [dpto, setDpto] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [busca, setBusca] = useState('')
  const [visao, setVisao] = useState<'obrigacao' | 'cliente'>('obrigacao')

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [clientes, setClientes] = useState<PorCliente[]>([])
  const [opcoes, setOpcoes] = useState<{ departamentos: string[]; responsaveis: string[] }>({ departamentos: [], responsaveis: [] })
  const [loading, setLoading] = useState(true)

  const filtro = useCallback(() => ({
    foco,
    janelaDias,
    dpto: dpto || undefined,
    responsavel: responsavel || undefined,
  }), [foco, janelaDias, dpto, responsavel])

  const carregar = useCallback(() => {
    setLoading(true)
    const f = filtro()
    Promise.all([
      (trpc.acessorias as any).painelEntregas.query(f),
      (trpc.acessorias as any).painelEntregasPorCliente.query(f),
    ])
      .then(([lista, porCliente]: [{ linhas: Linha[]; resumo: Resumo }, { clientes: PorCliente[] }]) => {
        setLinhas(lista.linhas || [])
        setResumo(lista.resumo)
        setClientes(porCliente.clientes || [])
      })
      .catch(() => { setLinhas([]); setResumo(null); setClientes([]) })
      .finally(() => setLoading(false))
  }, [filtro])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    ;(trpc.acessorias as any).painelEntregasOpcoes.query()
      .then((d: typeof opcoes) => setOpcoes(d)).catch(() => {})
  }, [])

  const q = busca.trim().toLowerCase()
  const linhasFiltradas = q
    ? linhas.filter((l) => l.clienteNome.toLowerCase().includes(q) || l.obrigacao.toLowerCase().includes(q))
    : linhas
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
          ativo={foco === 'nao_lidas'} onClick={() => setFoco('nao_lidas')}
          icone={<MailWarning className="h-4 w-4" />} cor="text-amber-600 dark:text-amber-400"
          valor={resumo?.naoLidas ?? 0}
          titulo="Guias não abertas"
          nota="em todo o período consultado"
        />
        <CartaoFoco
          ativo={foco === 'atrasadas'} onClick={() => setFoco('atrasadas')}
          icone={<Clock className="h-4 w-4" />} cor="text-orange-600 dark:text-orange-400"
          valor={resumo?.atrasadas ?? 0}
          titulo="Entregas atrasadas"
          nota="não entregues com prazo vencido"
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
          <div className="max-h-[620px] divide-y divide-border/60 overflow-y-auto">
            {linhasFiltradas.map((l) => {
              const p = prazoTexto(l.diasParaPrazo)
              return (
                <div key={l.id} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{l.obrigacao}</span>
                      {l.lida === false && (
                        <Badge className="gap-1 bg-amber-100 text-[10px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                          <MailWarning className="h-3 w-3" />não abriu
                        </Badge>
                      )}
                      {l.lida === true && (
                        <Badge className="gap-1 bg-emerald-100 text-[10px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                          <MailOpen className="h-3 w-3" />abriu
                        </Badge>
                      )}
                      {l.multa && <Badge variant="outline" className="text-[10px]">multa</Badge>}
                    </div>
                    <Link href={`/clientes/${l.clienteId}`} target="_blank"
                      className="truncate text-[11px] text-muted-foreground hover:underline">
                      #{l.clienteCode} — {l.clienteNome}
                    </Link>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3 text-[11px]">
                    {l.dpto && <span className="text-muted-foreground">{l.dpto}</span>}
                    {l.respEntrega && <span className="text-muted-foreground">{l.respEntrega}</span>}
                    <span className="text-muted-foreground tabular-nums">{fmtData(l.prazo)}</span>
                    <span className={cn('tabular-nums', p.cor)}>{p.texto}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        Dados espelhados do Acessórias na última sincronização de entregas. Obrigações sem guia para
        o cliente abrir não entram na contagem de &ldquo;não abertas&rdquo;.
      </p>
    </div>
  )
}

function CartaoFoco({ ativo, onClick, icone, cor, valor, titulo, nota }: {
  ativo: boolean; onClick: () => void; icone: React.ReactNode; cor: string
  valor: number; titulo: string; nota: string
}) {
  return (
    <button type="button" onClick={onClick} className="text-left">
      <Card className={cn('p-4 transition-colors hover:bg-muted/40', ativo && 'border-current')}
        style={ativo ? { borderColor: MODULE_COLOR } : undefined}>
        <div className={cn('flex items-center gap-1.5', cor)}>
          {icone}
          <span className="text-2xl font-bold tabular-nums">{valor}</span>
        </div>
        <p className="mt-0.5 text-[13px] font-medium">{titulo}</p>
        <p className="text-[11px] text-muted-foreground">{nota}</p>
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
