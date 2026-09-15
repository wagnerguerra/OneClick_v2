'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FolderUp, Plus, Loader2, Clock, CheckCircle2, X, Eye, EyeOff, Paperclip, Inbox,
} from 'lucide-react'
import {
  Button, Card, Input, Label, Badge, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useClientesPerms } from './use-clientes-perms'

/**
 * Lado do ESCRITÓRIO do porta-arquivos — Fase 1.
 *
 * Duas coisas que só existem aqui: publicar um arquivo no portal (com a
 * competência, que é a pasta em que o cliente vai procurar) e pedir um
 * documento ao cliente.
 *
 * Fica na aba Usuários porque é a aba do portal: ali já se decide QUEM acessa,
 * e agora também O QUE chega e o que é cobrado. Espalhar isso por outra aba
 * separaria coisas que só fazem sentido juntas.
 */

const CATEGORIAS = [
  { chave: 'guias', rotulo: 'Guias e impostos' },
  { chave: 'folha', rotulo: 'Folha de pagamento' },
  { chave: 'notas', rotulo: 'Notas fiscais' },
  { chave: 'contabil', rotulo: 'Contábil' },
  { chave: 'societario', rotulo: 'Societário' },
  { chave: 'outros', rotulo: 'Outros' },
]

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function rotuloCompetencia(c: string | null): string {
  if (!c || c.length !== 6) return 'sem competência'
  return `${MESES[Number(c.slice(4, 6)) - 1] ?? c.slice(4, 6)}/${c.slice(0, 4)}`
}

function competenciaAtual(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Competências oferecidas no seletor: 18 meses para trás e 2 para frente.
 *
 * Era um campo de texto pedindo "AAAAMM", que é formato de banco e não de
 * gente: dava erro de digitação e obrigava a saber a convenção. Para trás
 * cobre o ano fechado e a virada; para frente cobre a guia adiantada.
 */
function opcoesDeCompetencia(): Array<{ valor: string; rotulo: string }> {
  const hoje = new Date()
  const lista: Array<{ valor: string; rotulo: string }> = []
  for (let i = 2; i >= -18; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
    const valor = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
    lista.push({ valor, rotulo: `${MESES[d.getMonth()]} de ${d.getFullYear()}` })
  }
  return lista
}

interface PastaOpcao { id: string; caminho: string }

interface Arquivo {
  id: string
  fileName: string
  createdAt: string
  competencia: string | null
  categoria: string | null
  origem: string
  visivelParaCliente: boolean
  lidoEm: string | null
  user: { name: string } | null
}

interface Solicitacao {
  id: string
  titulo: string
  descricao: string | null
  competencia: string | null
  categoria: string | null
  prazo: string | null
  situacao: string
  atendidaEm: string | null
  criadaEm: string
  arquivos: Array<{ id: string; fileName: string; fileUrl: string; createdAt: string }>
}

const novoPedido = () => ({
  titulo: '', descricao: '', competencia: competenciaAtual(), categoria: '', prazo: '',
})

export function PortalDocumentosCard({ clienteId }: { clienteId?: string }) {
  const { canManageFiles } = useClientesPerms()
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [pedidoAberto, setPedidoAberto] = useState(false)
  const [pedido, setPedido] = useState(novoPedido)
  const [publicando, setPublicando] = useState<Arquivo | null>(null)
  const [formPub, setFormPub] = useState({
    competencia: competenciaAtual(), categoria: 'guias', pastaId: '',
  })
  const [pastas, setPastas] = useState<PastaOpcao[]>([])
  const competencias = useMemo(opcoesDeCompetencia, [])

  const carregar = useCallback(() => {
    if (!clienteId) { setCarregando(false); return }
    setCarregando(true)
    Promise.all([
      (trpc.cliente as any).listArquivos.query({ clienteId }),
      (trpc.cliente as any).listarSolicitacoesPortal.query({ clienteId }),
      (trpc.cliente as any).listarPastasPortal.query({ clienteId }),
    ])
      .then(([a, s, p]: [Arquivo[], Solicitacao[], PastaOpcao[]]) => {
        setArquivos(a); setSolicitacoes(s); setPastas(p)
      })
      .catch(() => { setArquivos([]); setSolicitacoes([]); setPastas([]) })
      .finally(() => setCarregando(false))
  }, [clienteId])

  useEffect(() => { carregar() }, [carregar])

  async function publicar() {
    if (!publicando) return
    setSalvando(true)
    try {
      await (trpc.cliente as any).publicarArquivoPortal.mutate({
        arquivoId: publicando.id,
        visivel: true,
        competencia: formPub.competencia,
        categoria: formPub.categoria || null,
        pastaId: formPub.pastaId || null,
      })
      setPublicando(null)
      carregar()
      alerts.success('Publicado', 'O cliente já vê este arquivo no portal.')
    } catch (e) {
      alerts.error('Não foi possível publicar', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function despublicar(a: Arquivo) {
    const ok = await alerts.confirm({
      title: 'Tirar do portal?',
      text: a.lidoEm
        ? `O cliente já abriu "${a.fileName}". Tirar agora não desfaz o que ele viu, só remove da lista.`
        : `"${a.fileName}" deixa de aparecer no portal do cliente.`,
      confirmText: 'Tirar do portal',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.cliente as any).publicarArquivoPortal.mutate({ arquivoId: a.id, visivel: false })
      carregar()
    } catch (e) {
      alerts.error('Não foi possível', (e as Error).message)
    }
  }

  async function criarPedido() {
    if (pedido.titulo.trim().length < 3) {
      alerts.warning('Título', 'Descreva em poucas palavras o que você precisa.')
      return
    }
    setSalvando(true)
    try {
      await (trpc.cliente as any).criarSolicitacaoPortal.mutate({
        clienteId,
        titulo: pedido.titulo.trim(),
        descricao: pedido.descricao.trim() || null,
        competencia: pedido.competencia || null,
        categoria: pedido.categoria || null,
        prazo: pedido.prazo || null,
      })
      setPedidoAberto(false)
      setPedido(novoPedido())
      carregar()
      alerts.success('Pedido enviado', 'Já aparece como pendência na tela do cliente.')
    } catch (e) {
      alerts.error('Não foi possível pedir', (e as Error).message)
    } finally { setSalvando(false) }
  }

  async function cancelarPedido(s: Solicitacao) {
    const ok = await alerts.confirm({
      title: 'Cancelar o pedido?',
      text: `"${s.titulo}" some da tela do cliente. O histórico fica.`,
      confirmText: 'Cancelar pedido',
      icon: 'warning',
    })
    if (!ok) return
    try {
      await (trpc.cliente as any).cancelarSolicitacaoPortal.mutate({ id: s.id })
      carregar()
    } catch (e) {
      alerts.error('Não foi possível cancelar', (e as Error).message)
    }
  }

  const publicados = useMemo(() => arquivos.filter(a => a.visivelParaCliente), [arquivos])
  const naoPublicados = useMemo(
    () => arquivos.filter(a => !a.visivelParaCliente && a.origem !== 'CLIENTE'),
    [arquivos],
  )
  const pendentes = useMemo(() => solicitacoes.filter(s => s.situacao === 'PENDENTE'), [solicitacoes])
  const fechadas = useMemo(() => solicitacoes.filter(s => s.situacao !== 'PENDENTE').slice(0, 8), [solicitacoes])

  if (!clienteId) return null

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h4 className="text-[13px] font-semibold text-foreground">Documentos do portal</h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            O que o cliente enxerga, e o que você está esperando dele.
          </p>
        </div>
        {canManageFiles && (
          <Button
            type="button" variant="outline" size="sm" className="h-7 gap-1 text-[11px]"
            onClick={() => { setPedido(novoPedido()); setPedidoAberto(true) }}
          >
            <Plus className="h-3 w-3" /> Pedir documento
          </Button>
        )}
      </div>

      <div className="space-y-5 p-5">
        {carregando ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            {/* ── Pedidos em aberto ─────────────────────────────────────── */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                <Clock className="h-3.5 w-3.5 text-amber-500" />
                Aguardando o cliente
                <span className="font-normal text-muted-foreground">{pendentes.length}</span>
              </p>
              {pendentes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum pedido em aberto. Use “Pedir documento” para cobrar algo pelo portal
                  em vez do WhatsApp.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {pendentes.map(s => (
                    <div key={s.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                      <Inbox className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{s.titulo}</p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {rotuloCompetencia(s.competencia)}
                          {s.prazo && ` · prazo ${new Date(s.prazo).toLocaleDateString('pt-BR')}`}
                        </p>
                      </div>
                      {canManageFiles && (
                        <button
                          type="button" onClick={() => cancelarPedido(s)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          title="Cancelar pedido"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Publicados ────────────────────────────────────────────── */}
            <section>
              <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                <Eye className="h-3.5 w-3.5 text-emerald-600" />
                No portal do cliente
                <span className="font-normal text-muted-foreground">{publicados.length}</span>
              </p>
              {publicados.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nada publicado ainda. Arquivo só aparece para o cliente depois de publicado —
                  o padrão é <b>não</b> aparecer, porque a maior parte do que está aqui é interna.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {publicados.map(a => (
                    <div key={a.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{a.fileName}</p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {rotuloCompetencia(a.competencia)}
                          {a.categoria && ` · ${CATEGORIAS.find(c => c.chave === a.categoria)?.rotulo ?? a.categoria}`}
                          {a.origem === 'CLIENTE' && ` · enviado por ${a.user?.name ?? 'cliente'}`}
                        </p>
                      </div>
                      {/* Recibo de leitura — só faz sentido no que NÓS publicamos. */}
                      {a.origem !== 'CLIENTE' && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'h-4 shrink-0 px-1.5 text-[9px]',
                            a.lidoEm
                              ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400'
                              : 'border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400',
                          )}
                          title={a.lidoEm ? `Aberto em ${new Date(a.lidoEm).toLocaleString('pt-BR')}` : 'O cliente ainda não abriu'}
                        >
                          {a.lidoEm ? 'visto' : 'não lido'}
                        </Badge>
                      )}
                      {canManageFiles && a.origem !== 'CLIENTE' && (
                        <button
                          type="button" onClick={() => despublicar(a)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                          title="Tirar do portal"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Disponíveis para publicar ─────────────────────────────── */}
            {canManageFiles && naoPublicados.length > 0 && (
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <FolderUp className="h-3.5 w-3.5 text-muted-foreground" />
                  Arquivos internos
                  <span className="font-normal text-muted-foreground">{naoPublicados.length}</span>
                </p>
                <div className="grid max-h-[220px] gap-1.5 overflow-y-auto nice-scrollbar">
                  {naoPublicados.map(a => (
                    <div key={a.id} className="flex items-center gap-2 rounded-md border border-dashed border-border px-3 py-2">
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px]">{a.fileName}</p>
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <Button
                        type="button" variant="outline" size="sm"
                        className="h-6 shrink-0 gap-1 text-[10.5px]"
                        onClick={() => {
                          setFormPub({
                            competencia: a.competencia ?? competenciaAtual(),
                            categoria: a.categoria ?? 'guias',
                            pastaId: '',
                          })
                          setPublicando(a)
                        }}
                      >
                        <Eye className="h-3 w-3" /> Publicar
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Histórico de pedidos ──────────────────────────────────── */}
            {fechadas.length > 0 && (
              <section>
                <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Pedidos encerrados
                </p>
                <div className="grid gap-1">
                  {fechadas.map(s => (
                    <p key={s.id} className="truncate text-[11px] text-muted-foreground">
                      <span className={s.situacao === 'ATENDIDA' ? 'text-emerald-600 dark:text-emerald-400' : ''}>
                        {s.situacao === 'ATENDIDA' ? '✓' : '—'}
                      </span>{' '}
                      {s.titulo}
                      {s.atendidaEm && ` · ${new Date(s.atendidaEm).toLocaleDateString('pt-BR')}`}
                      {s.arquivos.length > 0 && ` · ${s.arquivos[0]!.fileName}`}
                    </p>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* ── Publicar ────────────────────────────────────────────────────── */}
      <Dialog open={!!publicando} onOpenChange={o => { if (!o) setPublicando(null) }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeaderIcon icon={Eye} color="emerald">
            <DialogTitle>Publicar no portal</DialogTitle>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <p className="text-sm text-muted-foreground">{publicando?.fileName}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-[13px] font-semibold">Competência *</Label>
                <Select value={formPub.competencia} onValueChange={v => setFormPub(f => ({ ...f, competencia: v }))}>
                  <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {competencias.map(c => (
                      <SelectItem key={c.valor} value={c.valor} className="capitalize">{c.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A que mês o documento se refere.
                </p>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Categoria</Label>
                <Select value={formPub.categoria} onValueChange={v => setFormPub(f => ({ ...f, categoria: v }))}>
                  <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c.chave} value={c.chave}>{c.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Define quem vê: guias e notas pedem Fiscal; folha pede Pessoal.
                </p>
              </div>
            </div>

            {/* Pasta de destino. A navegação do cliente é por pasta desde que
                ele passou a criar as suas — publicar sem escolher deixa o
                arquivo na raiz, que é o comportamento esperado de "solto". */}
            <div>
              <Label className="text-[13px] font-semibold">Pasta no portal</Label>
              <Select
                value={formPub.pastaId || '__raiz__'}
                onValueChange={v => setFormPub(f => ({ ...f, pastaId: v === '__raiz__' ? '' : v }))}
              >
                <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[280px]">
                  <SelectItem value="__raiz__">Meus documentos (raiz)</SelectItem>
                  {pastas.map(p => <SelectItem key={p.id} value={p.id}>{p.caminho}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {pastas.length === 0
                  ? 'Este cliente ainda não criou pastas — o arquivo fica na raiz.'
                  : 'Onde o cliente vai encontrar o arquivo.'}
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setPublicando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" onClick={publicar} disabled={salvando || !formPub.competencia}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pedir documento ─────────────────────────────────────────────── */}
      <Dialog open={pedidoAberto} onOpenChange={setPedidoAberto}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeaderIcon icon={Inbox} color="amber">
            <DialogTitle>Pedir um documento ao cliente</DialogTitle>
          </DialogHeaderIcon>
          <DialogBody className="space-y-4">
            <div>
              <Label className="text-[13px] font-semibold">O que você precisa *</Label>
              <Input
                value={pedido.titulo}
                onChange={e => setPedido(p => ({ ...p, titulo: e.target.value }))}
                placeholder="Ex.: Extrato bancário do Itaú"
                className="mt-1.5 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-[13px] font-semibold">Detalhes</Label>
              <textarea
                value={pedido.descricao}
                onChange={e => setPedido(p => ({ ...p, descricao: e.target.value }))}
                rows={2}
                placeholder="Alguma instrução que ajude o cliente a mandar o arquivo certo."
                className="mt-1.5 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-[13px] font-semibold">Competência</Label>
                <Select value={pedido.competencia} onValueChange={v => setPedido(p => ({ ...p, competencia: v }))}>
                  <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[280px]">
                    {competencias.map(c => (
                      <SelectItem key={c.valor} value={c.valor} className="capitalize">{c.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Categoria</Label>
                <Select value={pedido.categoria} onValueChange={v => setPedido(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger className="mt-1.5 h-9 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c.chave} value={c.chave}>{c.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-semibold">Prazo</Label>
                <Input
                  type="date" value={pedido.prazo}
                  onChange={e => setPedido(p => ({ ...p, prazo: e.target.value }))}
                  className="mt-1.5 h-9 text-sm"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O pedido aparece como pendência na tela do cliente e some sozinho quando ele
              anexar o arquivo.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setPedidoAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" onClick={criarPedido} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
