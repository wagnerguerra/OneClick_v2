'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Loader2, Search, Copy, Check, EyeOff, MessageSquare, Paperclip,
  Building2, User as UserIcon,
} from 'lucide-react'
import {
  Button, Card, Input, Label, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  RichEditor,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { ManifestacaoDetalhe } from './manifestacao-detalhe'
import { NovaManifestacaoModal } from './nova-manifestacao'
import type { Config, Linha } from './tipos'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'

/** Rótulo e cor de cada situação — os três tipos compartilham a paleta. */
export const STATUS_LABEL: Record<string, { texto: string; classe: string }> = {
  RECEBIDA: { texto: 'Recebida', classe: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  RESPONDIDA: { texto: 'Respondida', classe: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
  ENCERRADA: { texto: 'Encerrada', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  AGUARDANDO_RETORNO: { texto: 'Aguardando retorno', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  AGUARDANDO_ANALISE: { texto: 'Aguardando análise', classe: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  REGISTRAR_EFICACIA: { texto: 'Registrar eficácia', classe: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
  NAO_PROCEDENTE: { texto: 'Não procedente', classe: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  FINALIZADA: { texto: 'Finalizada', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
}

/**
 * A tela dos três módulos da Qualidade.
 *
 * Elogio, reclamação e sugestão têm a mesma mecânica — listar, registrar,
 * tratar — e diferem nos campos e no fluxo. Uma tela só, parametrizada pela
 * `config` de cada módulo, evita manter três cópias que divergiriam na primeira
 * correção feita em uma delas.
 */
export function ManifestacaoPage({ config }: { config: Config }) {
  const { isMaster, permissions } = useUserPermissions()
  const subs = (permissions.find(p => p.moduleSlug === config.slug)?.subPermissions ?? {}) as Record<string, boolean>
  const podeTratar = isMaster || subs.tratar === true
  const podeRegistrar = isMaster || subs.registrar === true || subs.tratar === true

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [total, setTotal] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [buscaAtrasada, setBuscaAtrasada] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const [novoOpen, setNovoOpen] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [protocoloNovo, setProtocoloNovo] = useState<string | null>(null)

  // Busca com respiro: uma consulta por tecla digitada castigaria o servidor
  // sem melhorar nada para quem procura.
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAtrasada(busca); setPage(1) }, 400)
    return () => clearTimeout(t)
  }, [busca])

  const api = (trpc as never as Record<string, any>)[config.router]

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await api.listar.query({
        page, limit: 20,
        ...(buscaAtrasada ? { search: buscaAtrasada } : {}),
        ...(status ? { status } : {}),
      })
      setLinhas(r?.data ?? [])
      setTotal(r?.total ?? 0)
    } catch {
      setLinhas([]); setTotal(0)
    } finally {
      setCarregando(false)
    }
  }, [api, page, buscaAtrasada, status])

  useEffect(() => { void carregar() }, [carregar])

  return (
    <div className="flex flex-col gap-5">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          {podeRegistrar && (
            <Button variant="success" size="sm" className="gap-1.5" onClick={() => setNovoOpen(true)}>
              <Plus className="h-4 w-4" /> {config.rotuloNovo}
            </Button>
          )}
      </>}>
        <h1 className="truncate">{config.titulo}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>{config.titulo}</span>
        </p>
      </PageHeaderBar>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por texto ou protocolo..." className="h-9 pl-8 text-sm" />
          </div>
          <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            <option value="">Todas as situações</option>
            {config.status.map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]?.texto ?? s}</option>
            ))}
          </select>
          <span className="text-xs tabular-nums text-muted-foreground">{total} registro(s)</span>
        </div>

        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[130px] text-xs font-semibold uppercase tracking-wider">Protocolo</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider">Assunto</TableHead>
              <TableHead className="w-[190px] text-xs font-semibold uppercase tracking-wider">Quem registrou</TableHead>
              <TableHead className="w-[170px] text-xs font-semibold uppercase tracking-wider">Situação</TableHead>
              <TableHead className="w-[110px] text-xs font-semibold uppercase tracking-wider">Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {carregando ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center">
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
              </TableCell></TableRow>
            ) : linhas.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm italic text-muted-foreground">
                {config.vazio}
              </TableCell></TableRow>
            ) : linhas.map(l => {
              const st = STATUS_LABEL[l.status] ?? { texto: l.status, classe: 'bg-muted' }
              return (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => setAbertoId(l.id)}>
                  <TableCell className="font-mono text-[12px]">{l.protocolo}</TableCell>
                  <TableCell className="truncate text-[13px]">
                    {l.titulo || l.descricao.replace(/<[^>]*>/g, '').slice(0, 90)}
                    <span className="ml-2 inline-flex items-center gap-2 align-middle text-muted-foreground">
                      {l._count?.mensagens ? <span className="inline-flex items-center gap-0.5 text-[11px]"><MessageSquare className="h-3 w-3" />{l._count.mensagens}</span> : null}
                      {l._count?.arquivos ? <span className="inline-flex items-center gap-0.5 text-[11px]"><Paperclip className="h-3 w-3" />{l._count.arquivos}</span> : null}
                    </span>
                  </TableCell>
                  <TableCell className="truncate text-[13px]">
                    {l.anonima ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <EyeOff className="h-3.5 w-3.5" /> Anônima
                      </span>
                    ) : l.origem === 'CLIENTE' ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {l.cliente?.razaoSocial ?? l.informanteNome ?? 'Cliente'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        {l.autor?.name ?? '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px]', st.classe)}>{st.texto}</Badge>
                  </TableCell>
                  <TableCell className="text-[12px] tabular-nums text-muted-foreground">
                    {new Date(l.criadoEm).toLocaleDateString('pt-BR')}
                    {/* Farol do prazo, como no v1: só enquanto o retorno ao
                        cliente está pendente. Depois disso a data já cumpriu o
                        papel e vira ruído. */}
                    {config.temFluxo && l.prazoRetorno && l.status === 'AGUARDANDO_RETORNO' && (
                      <Farol prazo={l.prazoRetorno} />
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        {total > 20 && (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2">
            <span className="text-xs text-muted-foreground">
              Página {page} de {Math.ceil(total / 20)}
            </span>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      {novoOpen && (
        <NovaManifestacaoModal
          config={config}
          onClose={() => setNovoOpen(false)}
          onCriado={(protocolo) => { setNovoOpen(false); setProtocoloNovo(protocolo); void carregar() }}
        />
      )}

      {abertoId && (
        <ManifestacaoDetalhe
          config={config}
          id={abertoId}
          podeTratar={podeTratar}
          onClose={() => setAbertoId(null)}
          onMudou={() => void carregar()}
        />
      )}

      <ProtocoloEntregue protocolo={protocoloNovo} onClose={() => setProtocoloNovo(null)} />
    </div>
  )
}

/**
 * Farol do prazo de retorno.
 *
 * Vermelho quando já venceu, âmbar no dia ou no seguinte, verde no resto. O v1
 * fazia o mesmo — é o que faz alguém olhar a lista e saber onde agir primeiro,
 * sem comparar datas de cabeça.
 */
function Farol({ prazo }: { prazo: string }) {
  const dia = 24 * 60 * 60 * 1000
  const so = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const faltam = Math.round((so(new Date(prazo)) - so(new Date())) / dia)

  const cor = faltam < 0
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
    : faltam <= 1
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'

  const texto = faltam < 0
    ? `venceu há ${Math.abs(faltam)}d`
    : faltam === 0 ? 'vence hoje' : `faltam ${faltam}d`

  return (
    <span className={cn('mt-0.5 block w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold', cor)}>
      {texto}
    </span>
  )
}

/**
 * O protocolo, entregue depois de registrar.
 *
 * Numa manifestação anônima este código é o ÚNICO caminho de volta — não há
 * autor guardado, então não há "minhas manifestações" nem e-mail de aviso.
 * Por isso ele aparece grande, com botão de copiar, e a tela avisa que sem ele
 * não há como acompanhar.
 */
function ProtocoloEntregue({ protocolo, onClose }: { protocolo: string | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    if (!protocolo) return
    try {
      await navigator.clipboard.writeText(protocolo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* sem área de transferência — o código está à vista para copiar à mão */ }
  }

  return (
    <Dialog open={!!protocolo} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeaderIcon icon={Check} color="emerald">
          <DialogTitle>Registrado</DialogTitle>
          <DialogDescription>Guarde o protocolo para acompanhar.</DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3 text-center">
          <p className="select-all font-mono text-2xl font-bold tracking-wider">{protocolo}</p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copiar}>
            {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copiado ? 'Copiado' : 'Copiar código'}
          </Button>
          <p className="text-[12px] text-muted-foreground">
            Se você registrou sem se identificar, este código é a única forma de acompanhar a
            resposta — não há como recuperá-lo depois.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="success" size="sm" onClick={onClose}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { Label, RichEditor, alerts }
