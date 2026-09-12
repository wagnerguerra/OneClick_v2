'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  FolderTree, FileText, Loader2, Trash2, RotateCcw, History, ArrowLeft,
} from 'lucide-react'
import {
  Button, Card, Input, Label,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { PageHeaderBar } from '@/components/page-header-bar'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { Explorador } from '../_components/explorador'
import { useFontesDoEscritorio } from '../_components/fontes-escritorio'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)'
const MODULE = 'gestao-arquivos'

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

interface NaLixeiraDoDrive {
  id: string
  nome: string
  isPasta: boolean
  tamanho: number
  excluidoEm: string
  caminho: string
}

interface Excluido {
  id: string
  fileName: string
  competencia: string | null
  categoria: string | null
  excluidoEm: string
  excluidoPor: { name: string } | null
}

type Aba = 'explorador' | 'trilha' | 'lixeira'

const ROTULO_EVENTO: Record<string, string> = {
  ABRIU: 'abriu',
  ENVIOU: 'enviou',
  EXCLUIU: 'excluiu',
  RESTAUROU: 'restaurou',
}

function dataHora(v: string): string {
  const d = new Date(v)
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function GestaoArquivosClientePage() {
  const params = useParams<{ clienteId: string }>()
  const clienteId = params.clienteId
  const { permissions, isMaster, isEmpresaMaster } = useUserPermissions()

  const [aba, setAba] = useState<Aba>('explorador')
  const [nomeCliente, setNomeCliente] = useState<string | null>(null)
  const [log, setLog] = useState<LinhaLog[]>([])
  const [excluidos, setExcluidos] = useState<Excluido[]>([])
  const [lixeiraDrive, setLixeiraDrive] = useState<NaLixeiraDoDrive[]>([])
  const [processandoDrive, setProcessandoDrive] = useState<string | null>(null)
  const [aExcluir, setAExcluir] = useState<{ id: string; fileName: string } | null>(null)
  const [motivo, setMotivo] = useState('')
  const [processando, setProcessando] = useState(false)
  // Muda a cada exclusão/restauração para o explorador recarregar a pasta
  // aberta — sem isto o arquivo excluído continuaria na lista até o F5.
  const [versao, setVersao] = useState(0)

  const podeExcluir = useMemo(() => {
    if (isMaster || isEmpresaMaster) return true
    return permissions.some(p => {
      const x = p as { moduleSlug?: string; canDelete?: boolean }
      return x.moduleSlug === MODULE && x.canDelete === true
    })
  }, [permissions, isMaster, isEmpresaMaster])

  const fontes = useFontesDoEscritorio(clienteId, podeExcluir)

  // O cabeçalho dizia "Arquivos do cliente" e o caminho terminava na palavra
  // "Cliente", sem nunca dizer qual — com várias abas abertas, todas ficavam
  // iguais. Agora é o nome, como nas demais telas de detalhe.
  useEffect(() => {
    ;(trpc as any).gestaoArquivos.resumoCliente.query({ clienteId })
      .then((c: { razaoSocial: string }) => setNomeCliente(c.razaoSocial))
      .catch(() => setNomeCliente(null))
  }, [clienteId])

  useEffect(() => {
    if (aba !== 'trilha') return
    ;(trpc as any).gestaoArquivos.listarLog.query({ clienteId })
      .then((d: LinhaLog[]) => setLog(d)).catch(() => setLog([]))
  }, [aba, clienteId, versao])

  const carregarLixeira = useCallback(() => {
    ;(trpc as any).gestaoArquivos.listarExcluidos.query({ clienteId })
      .then((d: Excluido[]) => setExcluidos(d)).catch(() => setExcluidos([]))
    // A lixeira do Drive é consulta separada porque mora em outro lugar: lá o
    // item excluído fica na lixeira da CONTA do escritório, e o recorte por
    // cliente só existe porque o Drive preserva os pais do item.
    ;(trpc as any).gestaoArquivos.driveLixeira.query({ clienteId })
      .then((d: NaLixeiraDoDrive[]) => setLixeiraDrive(d)).catch(() => setLixeiraDrive([]))
  }, [clienteId])

  async function restaurarNoDrive(item: NaLixeiraDoDrive) {
    setProcessandoDrive(item.id)
    try {
      await (trpc as any).gestaoArquivos.driveRestaurar.mutate({ clienteId, itemId: item.id })
      alerts.success('Restaurado', `"${item.nome}" voltou para a pasta de onde saiu.`)
      setLixeiraDrive(l => l.filter(x => x.id !== item.id))
      setVersao(v => v + 1)
    } catch (e) {
      alerts.error('Não foi possível restaurar', (e as Error).message)
    } finally { setProcessandoDrive(null) }
  }

  async function apagarDeVez(item: NaLixeiraDoDrive) {
    // Confirmação dupla de propósito: não há volta nem por suporte do Google,
    // e o botão fica ao lado de "Restaurar".
    const ok = await alerts.confirm({
      title: 'Apagar em definitivo?',
      text: `"${item.nome}" será apagado do Google Drive para sempre. Não há como recuperar `
        + 'depois — nem pela lixeira, nem pelo suporte do Google.',
      icon: 'warning',
      confirmText: 'Apagar para sempre',
    })
    if (!ok) return

    setProcessandoDrive(item.id)
    try {
      await (trpc as any).gestaoArquivos.driveExcluirDefinitivo.mutate({ clienteId, itemId: item.id })
      alerts.success('Apagado', `"${item.nome}" não existe mais.`)
      setLixeiraDrive(l => l.filter(x => x.id !== item.id))
    } catch (e) {
      alerts.error('Não foi possível apagar', (e as Error).message)
    } finally { setProcessandoDrive(null) }
  }

  /** Quantos dias faltam para o Google apagar sozinho. */
  function diasRestantes(excluidoEm: string): number | null {
    if (!excluidoEm) return null
    const saiu = new Date(excluidoEm)
    if (Number.isNaN(saiu.getTime())) return null
    return Math.max(0, Math.ceil((saiu.getTime() + 30 * 86_400_000 - Date.now()) / 86_400_000))
  }

  useEffect(() => { if (aba === 'lixeira') carregarLixeira() }, [aba, carregarLixeira, versao])

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
      setVersao(v => v + 1)
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
      setVersao(v => v + 1)
    } catch (e) {
      alerts.error(e instanceof Error ? e.message : 'Não foi possível restaurar.')
    }
  }

  const abas: Array<{ chave: Aba; rotulo: string; icone: typeof FolderTree }> = [
    { chave: 'explorador', rotulo: 'Explorador', icone: FolderTree },
    { chave: 'trilha', rotulo: 'Trilha', icone: History },
    { chave: 'lixeira', rotulo: 'Lixeira', icone: Trash2 },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeaderBar
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/gestao-arquivos"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
          </Button>
        }
      >
        <h1 className="truncate">{nomeCliente ?? 'Arquivos do cliente'}</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground transition-colors">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Administrativo</span>
          <span className="text-muted-foreground/50">›</span>
          <Link href="/gestao-arquivos" className="hover:text-foreground transition-colors">Gestão de Arquivos</Link>
          {nomeCliente && (
            <>
              <span className="text-muted-foreground/50">›</span>
              <span className="truncate">{nomeCliente}</span>
            </>
          )}
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

      {aba === 'explorador' && (
        <Explorador
          fontes={fontes}
          cor={MODULE_COLOR}
          recarregar={versao}
          onExcluir={a => { setAExcluir(a); setMotivo('') }}
        />
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
          {/* Duas origens, duas lixeiras. Juntá-las numa lista só esconderia
              que uma volta com um clique nosso e a outra tem prazo do Google. */}
          {lixeiraDrive.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-[13px] font-semibold text-foreground">Google Drive</p>
              <p className="mb-2 text-[11px] text-muted-foreground">
                O Google apaga sozinho depois de 30 dias. Até lá, dá para restaurar.
              </p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {lixeiraDrive.map(i => {
                  const dias = diasRestantes(i.excluidoEm)
                  return (
                    <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-muted-foreground line-through">
                          {i.nome}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          estava em {i.caminho}
                          {dias !== null && (
                            <span className={dias <= 5 ? ' font-semibold text-amber-600 dark:text-amber-400' : ''}>
                              {' · '}{dias === 0 ? 'some hoje' : `some em ${dias} dia(s)`}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => restaurarNoDrive(i)}
                          disabled={processandoDrive !== null}
                        >
                          {processandoDrive === i.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <RotateCcw className="h-4 w-4" />}
                          Restaurar
                        </Button>
                        {podeExcluir && (
                          <Button
                            variant="soft-destructive"
                            size="icon-sm"
                            onClick={() => apagarDeVez(i)}
                            disabled={processandoDrive !== null}
                            title="Apagar em definitivo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {lixeiraDrive.length > 0 && excluidos.length > 0 && (
            <p className="mb-2 text-[13px] font-semibold text-foreground">Arquivos do sistema</p>
          )}

          {excluidos.length === 0 && lixeiraDrive.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              Nenhum arquivo excluído.
            </div>
          ) : excluidos.length === 0 ? null : (
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
