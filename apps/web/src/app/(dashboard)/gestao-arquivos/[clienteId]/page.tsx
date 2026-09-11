'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  Folder, FileText, Loader2, ChevronRight, Trash2, RotateCcw, History,
  ArrowLeft, Download, Sparkles, ShieldAlert, Home,
} from 'lucide-react'
import {
  Button, Badge, Card, Input, Label,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl } from '@/lib/api-url'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)'
const MODULE = 'gestao-arquivos'

interface Arquivo {
  id: string
  fileName: string
  fileSize: number | null
  mimeType: string | null
  competencia: string | null
  categoria: string | null
  origem: string
  visivelParaCliente: boolean
  criadoEm: string
  enviadoPor: string | null
  lidoPeloCliente: string | null
  novo: boolean
}

interface Conteudo {
  caminho: Array<{ id: string; nome: string }>
  pastas: Array<{ id: string; nome: string }>
  arquivos: Arquivo[]
}

interface LinhaLog {
  id: string
  evento: string
  lado: string
  arquivoNome: string | null
  pastaCaminho: string | null
  usuarioNome: string | null
  detalhe: string | null
  criadoEm: string
}

interface Excluido {
  id: string
  fileName: string
  competencia: string | null
  categoria: string | null
  excluidoEm: string
  excluidoPor: { name: string } | null
}

type Aba = 'arquivos' | 'trilha' | 'lixeira'

const ROTULO_EVENTO: Record<string, string> = {
  ABRIU: 'abriu',
  EXCLUIU: 'excluiu',
  RESTAUROU: 'restaurou',
}

function tamanho(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function dataHora(v: string): string {
  const d = new Date(v)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

function rotuloCompetencia(c: string | null): string | null {
  if (!c || c.length !== 6) return null
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${meses[Number(c.slice(4, 6)) - 1] ?? '??'}/${c.slice(0, 4)}`
}

export default function GestaoArquivosClientePage() {
  const params = useParams<{ clienteId: string }>()
  const clienteId = params.clienteId
  const { permissions, isMaster, isEmpresaMaster } = useUserPermissions()

  const [aba, setAba] = useState<Aba>('arquivos')
  const [pastaId, setPastaId] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState<Conteudo | null>(null)
  const [log, setLog] = useState<LinhaLog[]>([])
  const [excluidos, setExcluidos] = useState<Excluido[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<Arquivo | null>(null)
  const [motivo, setMotivo] = useState('')
  const [processando, setProcessando] = useState(false)

  const podeExcluir = useMemo(() => {
    if (isMaster || isEmpresaMaster) return true
    return permissions.some(p => {
      const x = p as { moduleSlug?: string; canDelete?: boolean }
      return x.moduleSlug === MODULE && x.canDelete === true
    })
  }, [permissions, isMaster, isEmpresaMaster])

  const carregar = useCallback(() => {
    setLoading(true)
    setErro(null)
    ;(trpc as any).gestaoArquivos.listar.query({ clienteId, pastaId })
      .then((d: Conteudo) => setConteudo(d))
      .catch((e: unknown) => {
        setConteudo(null)
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar.')
      })
      .finally(() => setLoading(false))
  }, [clienteId, pastaId])

  useEffect(() => { if (aba === 'arquivos') carregar() }, [aba, carregar])

  useEffect(() => {
    if (aba !== 'trilha') return
    ;(trpc as any).gestaoArquivos.listarLog.query({ clienteId })
      .then((d: LinhaLog[]) => setLog(d)).catch(() => setLog([]))
  }, [aba, clienteId])

  const carregarLixeira = useCallback(() => {
    ;(trpc as any).gestaoArquivos.listarExcluidos.query({ clienteId })
      .then((d: Excluido[]) => setExcluidos(d)).catch(() => setExcluidos([]))
  }, [clienteId])

  useEffect(() => { if (aba === 'lixeira') carregarLixeira() }, [aba, carregarLixeira])

  /**
   * Abre o arquivo. A chamada marca o visto e registra na trilha ANTES de
   * levar o usuário ao arquivo — se o registro falhar, nada abre, e é o certo:
   * um módulo cuja promessa é rastrear não pode entregar o documento sem deixar
   * rastro.
   */
  async function abrir(a: Arquivo) {
    try {
      const r = await (trpc as any).gestaoArquivos.abrir.mutate({ arquivoId: a.id })
      // Otimista: o servidor já gravou, então o destaque sai da tela sem
      // precisar recarregar a listagem inteira.
      setConteudo(c => c && {
        ...c,
        arquivos: c.arquivos.map(x => (x.id === a.id ? { ...x, novo: false } : x)),
      })
      window.open(resolveAssetUrl(r.url), '_blank', 'noopener,noreferrer')
    } catch (e) {
      alerts.error(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.')
    }
  }

  async function confirmarExclusao() {
    if (!aExcluir) return
    setProcessando(true)
    try {
      await (trpc as any).gestaoArquivos.excluir.mutate({
        arquivoId: aExcluir.id,
        motivo: motivo.trim() || null,
      })
      alerts.success('Arquivo excluído. Ele fica na lixeira e pode ser restaurado.')
      setAExcluir(null)
      setMotivo('')
      carregar()
    } catch (e) {
      alerts.error(e instanceof Error ? e.message : 'Não foi possível excluir.')
    } finally {
      setProcessando(false)
    }
  }

  async function restaurar(id: string) {
    try {
      await (trpc as any).gestaoArquivos.restaurar.mutate({ arquivoId: id })
      alerts.success('Arquivo restaurado.')
      carregarLixeira()
    } catch (e) {
      alerts.error(e instanceof Error ? e.message : 'Não foi possível restaurar.')
    }
  }

  const abas: Array<{ chave: Aba; rotulo: string; icone: typeof Folder }> = [
    { chave: 'arquivos', rotulo: 'Arquivos', icone: Folder },
    { chave: 'trilha', rotulo: 'Trilha', icone: History },
    { chave: 'lixeira', rotulo: 'Lixeira', icone: Trash2 },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeaderBar
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/gestao-arquivos"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
          </Button>
        }
      >
        <h1 className="truncate">Arquivos do cliente</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/gestao-arquivos" className="hover:text-foreground transition-colors">Gestão de Arquivos</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Cliente</span>
        </p>
      </PageHeaderBar>

      <div className="flex items-center gap-1.5">
        {abas.map(a => {
          const Icone = a.icone
          const ativa = aba === a.chave
          return (
            <button
              key={a.chave}
              type="button"
              onClick={() => setAba(a.chave)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-xs font-medium transition-colors',
                ativa
                  ? 'text-white border-transparent'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted/50',
              )}
              style={ativa ? { backgroundColor: MODULE_COLOR } : undefined}
            >
              <Icone className="h-4 w-4" /> {a.rotulo}
            </button>
          )
        })}
      </div>

      {aba === 'arquivos' && (
        <Card className="p-4">
          {/* Trilha de pastas */}
          <div className="mb-3 flex flex-wrap items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setPastaId(null)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Home className="h-3.5 w-3.5" /> Raiz
            </button>
            {(conteudo?.caminho ?? []).map(p => (
              <span key={p.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <button
                  type="button"
                  onClick={() => setPastaId(p.id)}
                  className="rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {p.nome}
                </button>
              </span>
            ))}
          </div>

          {loading && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && erro && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <ShieldAlert className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{erro}</p>
            </div>
          )}

          {!loading && !erro && conteudo && (
            <>
              {conteudo.pastas.length > 0 && (
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {conteudo.pastas.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPastaId(p.id)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                    >
                      <Folder className="h-4 w-4 shrink-0" style={{ color: MODULE_COLOR }} />
                      <span className="truncate text-[13px] font-medium text-foreground">{p.nome}</span>
                    </button>
                  ))}
                </div>
              )}

              {conteudo.arquivos.length === 0 && conteudo.pastas.length === 0 && (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  Esta pasta está vazia.
                </div>
              )}

              <div className="divide-y divide-border">
                {conteudo.arquivos.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => abrir(a)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground">
                        <span className="truncate">{a.fileName}</span>
                        {a.novo && (
                          <Badge
                            className="shrink-0 gap-1 text-white"
                            style={{ backgroundColor: MODULE_COLOR }}
                          >
                            <Sparkles className="h-3 w-3" /> Novo
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.origem === 'CLIENTE' ? 'Enviado pelo cliente' : 'Publicado pelo escritório'}
                        {a.enviadoPor ? ` · ${a.enviadoPor}` : ''}
                        {' · '}{dataHora(a.criadoEm)}
                        {' · '}{tamanho(a.fileSize)}
                        {rotuloCompetencia(a.competencia) ? ` · ${rotuloCompetencia(a.competencia)}` : ''}
                      </p>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="soft-info" size="icon-sm" onClick={() => abrir(a)} title="Abrir">
                        <Download className="h-4 w-4" />
                      </Button>
                      {podeExcluir && (
                        <Button
                          variant="soft-destructive"
                          size="icon-sm"
                          onClick={() => { setAExcluir(a); setMotivo('') }}
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {aba === 'trilha' && (
        <Card className="p-4">
          {log.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Nada registrado ainda para este cliente.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {log.map(l => (
                <div key={l.id} className="py-2.5 text-[13px]">
                  <p className="text-foreground">
                    <span className="font-medium">{l.usuarioNome ?? 'Usuário removido'}</span>
                    {' '}{ROTULO_EVENTO[l.evento] ?? l.evento.toLowerCase()}
                    {l.arquivoNome ? <> <span className="font-medium">{l.arquivoNome}</span></> : null}
                    {l.pastaCaminho ? <span className="text-muted-foreground"> em {l.pastaCaminho}</span> : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {dataHora(l.criadoEm)}
                    {' · '}{l.lado === 'CLIENTE' ? 'lado do cliente' : 'escritório'}
                    {l.detalhe ? ` · ${l.detalhe}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {aba === 'lixeira' && (
        <Card className="p-4">
          {excluidos.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Nenhum arquivo excluído.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {excluidos.map(e => (
                <div key={e.id} className="flex items-center gap-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-muted-foreground line-through">
                      {e.fileName}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Excluído {dataHora(e.excluidoEm)}
                      {e.excluidoPor ? ` por ${e.excluidoPor.name}` : ''}
                    </p>
                  </div>
                  {podeExcluir && (
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => restaurar(e.id)}>
                      <RotateCcw className="h-4 w-4" /> Restaurar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Dialog open={Boolean(aExcluir)} onOpenChange={v => { if (!v) setAExcluir(null) }}>
        <DialogContent>
          <DialogHeaderIcon icon={Trash2} color="rose">
            <DialogTitle>Excluir arquivo</DialogTitle>
            <DialogDescription>
              O arquivo sai da lista e vai para a lixeira — dá para restaurar depois.
            </DialogDescription>
          </DialogHeaderIcon>
          <DialogBody className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-medium">{aExcluir?.fileName}</span>
            </p>
            <div>
              <Label className="text-[13px] font-semibold">Motivo (opcional)</Label>
              <Input
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                placeholder="Ex.: enviado em duplicidade"
                className="mt-1.5 h-9 text-sm"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fica registrado na trilha e vai no aviso por e-mail.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAExcluir(null)} disabled={processando}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarExclusao} disabled={processando} className="gap-1.5">
              {processando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
