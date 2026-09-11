'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Folder, FolderOpen, FileText, FileImage, FileSpreadsheet, FileArchive,
  ChevronRight, Loader2, HardDrive, Server, Trash2, Download, ExternalLink,
  Sparkles, PanelRightClose, PanelRightOpen, RefreshCw, Eye,
} from 'lucide-react'
import { Button, Badge, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { resolveAssetUrl, getApiUrl } from '@/lib/api-url'

const MODULE_COLOR = 'var(--mod-administrativo, #38bdf8)'

/**
 * Explorador de arquivos no modelo do Windows Explorer.
 *
 * Três painéis: árvore à esquerda, conteúdo da pasta no meio, pré-visualização
 * à direita. As duas origens — os arquivos do sistema e o Google Drive —
 * aparecem como "unidades" na mesma árvore, porque para quem trabalha elas são
 * a mesma coisa (o acervo do cliente) e só por acidente de infraestrutura moram
 * em lugares diferentes. Antes eram duas abas, e comparar o que estava num lado
 * com o que estava no outro exigia trocar de aba e perder o contexto.
 */

export type Fonte = 'local' | 'drive'

interface PastaNo {
  id: string | null
  nome: string
}

interface ArquivoItem {
  id: string
  nome: string
  tamanho: number | null
  mimeType: string | null
  modificadoEm: string | null
  origem: string | null
  novo: boolean
  link: string | null
}

interface Conteudo {
  pastas: PastaNo[]
  arquivos: ArquivoItem[]
  indisponivel?: string | null
}

interface EstadoNo {
  expandido: boolean
  carregando: boolean
  filhos: PastaNo[] | null
}

const RAIZES: Array<{ fonte: Fonte; nome: string; icone: typeof Server }> = [
  { fonte: 'local', nome: 'Arquivos do sistema', icone: Server },
  { fonte: 'drive', nome: 'Google Drive', icone: HardDrive },
]

function chave(fonte: Fonte, id: string | null) {
  return `${fonte}:${id ?? '__raiz__'}`
}

function tamanhoLegivel(bytes: number | null): string {
  if (bytes === null || bytes === undefined || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function dataLegivel(v: string | null): string {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** Tipo pela extensão quando o mime não veio — o Drive nem sempre manda. */
function tipoDoArquivo(nome: string, mime: string | null): 'imagem' | 'pdf' | 'planilha' | 'texto' | 'zip' | 'outro' {
  const m = (mime ?? '').toLowerCase()
  const ext = nome.toLowerCase().split('.').pop() ?? ''
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'imagem'
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (m.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext)) return 'planilha'
  if (m.startsWith('text/') || ['txt', 'xml', 'json', 'log'].includes(ext)) return 'texto'
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip'
  return 'outro'
}

function IconeArquivo({ nome, mime, className }: { nome: string; mime: string | null; className?: string }) {
  const t = tipoDoArquivo(nome, mime)
  const Icone = t === 'imagem' ? FileImage : t === 'planilha' ? FileSpreadsheet : t === 'zip' ? FileArchive : FileText
  return <Icone className={className} />
}

/**
 * Uma linha da árvore.
 *
 * Componente de TOPO, e não uma função dentro do `Explorador`: declarada lá
 * dentro, ela seria uma referência nova a cada render, e o React trataria a
 * árvore inteira como outro componente — desmontando e remontando todos os nós
 * a cada clique, o que perde o estado de expansão e faz a lista piscar.
 */
function LinhaArvore({
  fonte, pasta, nivel, caminho, nos, selecionada, onAlternar, onAbrir,
}: {
  fonte: Fonte
  pasta: PastaNo
  nivel: number
  caminho: PastaNo[]
  nos: Record<string, EstadoNo>
  selecionada: { fonte: Fonte; id: string | null }
  onAlternar: (fonte: Fonte, id: string | null) => void
  onAbrir: (fonte: Fonte, id: string | null, caminho: PastaNo[]) => void
}) {
  const k = chave(fonte, pasta.id)
  const estado = nos[k]
  const ativa = selecionada.fonte === fonte && selecionada.id === pasta.id
  const ehUnidade = pasta.id === null
  const IconeNo = ehUnidade
    ? (RAIZES.find(r => r.fonte === fonte)?.icone ?? Server)
    : (estado?.expandido ? FolderOpen : Folder)

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md py-1 pr-1.5 text-[13px] transition-colors',
          ativa ? 'bg-muted font-medium text-foreground' : 'text-foreground/80 hover:bg-muted/50',
        )}
        style={{ paddingLeft: `${nivel * 12 + 4}px` }}
      >
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onAlternar(fonte, pasta.id) }}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          aria-label={estado?.expandido ? 'Recolher' : 'Expandir'}
        >
          {estado?.carregando
            ? <Loader2 className="h-3 w-3 animate-spin" />
            : <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', estado?.expandido && 'rotate-90')} />}
        </button>
        <button
          type="button"
          onClick={() => onAbrir(fonte, pasta.id, caminho)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <IconeNo className="h-4 w-4 shrink-0" style={{ color: ehUnidade ? MODULE_COLOR : undefined }} />
          <span className="truncate">{pasta.nome}</span>
        </button>
      </div>

      {estado?.expandido && estado.filhos?.map(f => (
        <LinhaArvore
          key={chave(fonte, f.id)}
          fonte={fonte}
          pasta={f}
          nivel={nivel + 1}
          caminho={[...caminho, f]}
          nos={nos}
          selecionada={selecionada}
          onAlternar={onAlternar}
          onAbrir={onAbrir}
        />
      ))}
      {estado?.expandido && estado.filhos?.length === 0 && !estado.carregando && (
        <p
          className="py-0.5 text-[11px] italic text-muted-foreground"
          style={{ paddingLeft: `${(nivel + 1) * 12 + 24}px` }}
        >
          sem subpastas
        </p>
      )}
    </div>
  )
}

export function Explorador({
  clienteId, podeExcluir, onExcluir,
}: {
  clienteId: string
  podeExcluir: boolean
  onExcluir: (arquivo: { id: string; fileName: string }) => void
}) {
  const [nos, setNos] = useState<Record<string, EstadoNo>>({})
  const [selecionada, setSelecionada] = useState<{ fonte: Fonte; id: string | null }>({ fonte: 'local', id: null })
  const [conteudo, setConteudo] = useState<Conteudo | null>(null)
  const [carregandoConteudo, setCarregandoConteudo] = useState(false)
  const [arquivoSel, setArquivoSel] = useState<ArquivoItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCarregando, setPreviewCarregando] = useState(false)
  const [painelAberto, setPainelAberto] = useState(true)
  const [trilha, setTrilha] = useState<PastaNo[]>([])

  /**
   * Uma chamada só serve a árvore e o painel do meio: as duas precisam do mesmo
   * conteúdo, e separá-las dobraria as idas ao Drive sem ganhar nada.
   */
  const buscar = useCallback(async (fonte: Fonte, id: string | null): Promise<Conteudo> => {
    if (fonte === 'local') {
      const d = await (trpc as any).gestaoArquivos.listar.query({ clienteId, pastaId: id })
      return {
        pastas: d.pastas.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome })),
        arquivos: d.arquivos.map((a: any) => ({
          id: a.id,
          nome: a.fileName,
          tamanho: a.fileSize,
          mimeType: a.mimeType,
          modificadoEm: a.criadoEm,
          origem: a.origem,
          novo: Boolean(a.novo),
          link: null,
        })),
      }
    }
    const d = await (trpc as any).gestaoArquivos.driveListar.query({ clienteId, subPastaId: id })
    if (!d.vinculada) {
      return { pastas: [], arquivos: [], indisponivel: 'Este cliente ainda não tem pasta do Drive vinculada. O vínculo é feito nas configurações do módulo.' }
    }
    return {
      pastas: d.itens.filter((i: any) => i.isPasta).map((i: any) => ({ id: i.id, nome: i.nome })),
      arquivos: d.itens.filter((i: any) => !i.isPasta).map((i: any) => ({
        id: i.id,
        nome: i.nome,
        tamanho: i.tamanho,
        mimeType: null,
        modificadoEm: i.modificadoEm,
        origem: 'DRIVE',
        novo: false,
        link: i.link,
      })),
    }
  }, [clienteId])

  const abrirPasta = useCallback(async (fonte: Fonte, id: string | null, novaTrilha: PastaNo[]) => {
    setSelecionada({ fonte, id })
    setTrilha(novaTrilha)
    setArquivoSel(null)
    setPreviewUrl(null)
    setCarregandoConteudo(true)
    try {
      const d = await buscar(fonte, id)
      setConteudo(d)
      setNos(n => ({ ...n, [chave(fonte, id)]: { expandido: true, carregando: false, filhos: d.pastas } }))
    } catch (e) {
      setConteudo({ pastas: [], arquivos: [], indisponivel: e instanceof Error ? e.message : 'Não foi possível abrir.' })
    } finally {
      setCarregandoConteudo(false)
    }
  }, [buscar])

  useEffect(() => { abrirPasta('local', null, []) }, [abrirPasta])

  /** Expande/recolhe um nó da árvore sem mudar o painel do meio. */
  const alternar = useCallback(async (fonte: Fonte, id: string | null) => {
    const k = chave(fonte, id)
    const atual = nos[k]
    if (atual?.expandido) {
      setNos(n => ({ ...n, [k]: { ...atual, expandido: false } }))
      return
    }
    if (atual?.filhos) {
      setNos(n => ({ ...n, [k]: { ...atual, expandido: true } }))
      return
    }
    setNos(n => ({ ...n, [k]: { expandido: true, carregando: true, filhos: null } }))
    try {
      const d = await buscar(fonte, id)
      setNos(n => ({ ...n, [k]: { expandido: true, carregando: false, filhos: d.pastas } }))
    } catch {
      setNos(n => ({ ...n, [k]: { expandido: true, carregando: false, filhos: [] } }))
    }
  }, [nos, buscar])

  /**
   * Selecionar um arquivo já conta como abrir: marca como visto e entra na
   * trilha. É o comportamento honesto — a pré-visualização mostra o documento,
   * então dizer que ninguém o viu seria falso justamente no registro que existe
   * para responder "quem viu isto?".
   */
  async function selecionarArquivo(a: ArquivoItem) {
    setArquivoSel(a)
    setPreviewUrl(null)
    setPainelAberto(true)
    const tipo = tipoDoArquivo(a.nome, a.mimeType)
    const previsualizavel = tipo === 'imagem' || tipo === 'pdf' || tipo === 'texto'

    if (selecionada.fonte === 'drive') {
      if (previsualizavel) {
        setPreviewUrl(`${getApiUrl()}/api/gestao-arquivos/drive/${clienteId}/${a.id}`)
      }
      return
    }

    setPreviewCarregando(true)
    try {
      const r = await (trpc as any).gestaoArquivos.abrir.mutate({ arquivoId: a.id })
      if (previsualizavel) setPreviewUrl(resolveAssetUrl(r.url))
      // O destaque sai da lista sem recarregar: o servidor já gravou o visto.
      setConteudo(c => c && { ...c, arquivos: c.arquivos.map(x => (x.id === a.id ? { ...x, novo: false } : x)) })
    } catch (e) {
      alerts.error(e instanceof Error ? e.message : 'Não foi possível abrir o arquivo.')
    } finally {
      setPreviewCarregando(false)
    }
  }

  function urlDeDownload(a: ArquivoItem): string | null {
    if (selecionada.fonte === 'drive') return `${getApiUrl()}/api/gestao-arquivos/drive/${clienteId}/${a.id}`
    return previewUrl
  }

  const tipoSel = arquivoSel ? tipoDoArquivo(arquivoSel.nome, arquivoSel.mimeType) : null

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[420px] overflow-hidden rounded-lg border border-border bg-card">
      {/* ── Árvore ─────────────────────────────────────────────── */}
      <div className="w-[240px] shrink-0 overflow-y-auto nice-scrollbar border-r border-border bg-muted/20 p-2">
        {RAIZES.map(r => (
          <LinhaArvore
            key={r.fonte}
            fonte={r.fonte}
            pasta={{ id: null, nome: r.nome }}
            nivel={0}
            caminho={[]}
            nos={nos}
            selecionada={selecionada}
            onAlternar={alternar}
            onAbrir={abrirPasta}
          />
        ))}
      </div>

      {/* ── Conteúdo da pasta ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs">
          <span className="shrink-0 text-muted-foreground">
            {RAIZES.find(r => r.fonte === selecionada.fonte)?.nome}
          </span>
          {trilha.map(p => (
            <span key={p.id ?? 'r'} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="truncate text-foreground">{p.nome}</span>
            </span>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => abrirPasta(selecionada.fonte, selecionada.id, trilha)}
              title="Atualizar"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', carregandoConteudo && 'animate-spin')} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPainelAberto(v => !v)}
              title={painelAberto ? 'Esconder pré-visualização' : 'Mostrar pré-visualização'}
            >
              {painelAberto ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto nice-scrollbar">
          {carregandoConteudo && (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!carregandoConteudo && conteudo?.indisponivel && (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {conteudo.indisponivel}
            </div>
          )}

          {!carregandoConteudo && conteudo && !conteudo.indisponivel
            && conteudo.pastas.length === 0 && conteudo.arquivos.length === 0 && (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Esta pasta está vazia.
            </div>
          )}

          {!carregandoConteudo && conteudo && !conteudo.indisponivel && (
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-[48%] px-3 py-1.5 text-left font-semibold">Nome</th>
                  <th className="hidden w-[16%] px-3 py-1.5 text-right font-semibold sm:table-cell">Tamanho</th>
                  <th className="hidden w-[26%] px-3 py-1.5 text-left font-semibold md:table-cell">Modificado</th>
                  <th className="w-[10%] px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {conteudo.pastas.map(p => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-border/50 hover:bg-muted/40"
                    onDoubleClick={() => abrirPasta(selecionada.fonte, p.id, [...trilha, p])}
                    onClick={() => abrirPasta(selecionada.fonte, p.id, [...trilha, p])}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Folder className="h-4 w-4 shrink-0" style={{ color: MODULE_COLOR }} />
                        <span className="truncate font-medium">{p.nome}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-1.5 text-right text-muted-foreground sm:table-cell">—</td>
                    <td className="hidden px-3 py-1.5 text-muted-foreground md:table-cell">—</td>
                    <td />
                  </tr>
                ))}

                {conteudo.arquivos.map(a => (
                  <tr
                    key={a.id}
                    className={cn(
                      'cursor-pointer border-b border-border/50 hover:bg-muted/40',
                      arquivoSel?.id === a.id && 'bg-muted',
                    )}
                    onClick={() => selecionarArquivo(a)}
                  >
                    <td className="px-3 py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <IconeArquivo nome={a.nome} mime={a.mimeType} className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.nome}</span>
                        {a.novo && (
                          <Badge className="shrink-0 gap-1 text-white" style={{ backgroundColor: MODULE_COLOR }}>
                            <Sparkles className="h-3 w-3" /> Novo
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-3 py-1.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                      {tamanhoLegivel(a.tamanho)}
                    </td>
                    <td className="hidden px-3 py-1.5 text-muted-foreground md:table-cell">
                      {dataLegivel(a.modificadoEm)}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {podeExcluir && selecionada.fonte === 'local' && (
                        <Button
                          variant="soft-destructive"
                          size="icon-sm"
                          onClick={e => { e.stopPropagation(); onExcluir({ id: a.id, fileName: a.nome }) }}
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Pré-visualização ───────────────────────────────────── */}
      {painelAberto && (
        <div className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-muted/10 lg:flex">
          {!arquivoSel && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
              <Eye className="h-7 w-7 text-muted-foreground/40" />
              <p className="text-[13px] text-muted-foreground">
                Selecione um arquivo para pré-visualizar.
              </p>
            </div>
          )}

          {arquivoSel && (
            <>
              <div className="flex min-h-[200px] flex-1 items-center justify-center overflow-hidden border-b border-border bg-background/50 p-2">
                {previewCarregando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

                {!previewCarregando && previewUrl && tipoSel === 'imagem' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={arquivoSel.nome} className="max-h-full max-w-full object-contain" />
                )}

                {!previewCarregando && previewUrl && (tipoSel === 'pdf' || tipoSel === 'texto') && (
                  <iframe src={previewUrl} title={arquivoSel.nome} className="h-full w-full border-0" />
                )}

                {!previewCarregando && !previewUrl && (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <IconeArquivo nome={arquivoSel.nome} mime={arquivoSel.mimeType} className="h-10 w-10 text-muted-foreground/50" />
                    <p className="px-4 text-[11px] text-muted-foreground">
                      Este tipo de arquivo não abre aqui. Use o botão abaixo.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 p-3">
                <div>
                  <p className="break-words text-[13px] font-semibold text-foreground">{arquivoSel.nome}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {selecionada.fonte === 'drive' ? 'Google Drive' : (
                      arquivoSel.origem === 'CLIENTE' ? 'Enviado pelo cliente' : 'Publicado pelo escritório'
                    )}
                  </p>
                </div>

                <dl className="space-y-1 text-[11px]">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Tamanho</dt>
                    <dd className="tabular-nums text-foreground">{tamanhoLegivel(arquivoSel.tamanho)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Modificado</dt>
                    <dd className="tabular-nums text-foreground">{dataLegivel(arquivoSel.modificadoEm)}</dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-1.5 pt-1">
                  {urlDeDownload(arquivoSel) && (
                    <Button variant="outline" size="sm" className="w-full gap-1.5" asChild>
                      <a href={urlDeDownload(arquivoSel)!} target="_blank" rel="noopener noreferrer">
                        <Download className="h-4 w-4" /> Abrir arquivo
                      </a>
                    </Button>
                  )}
                  {arquivoSel.link && (
                    <Button variant="ghost" size="sm" className="w-full gap-1.5" asChild>
                      <a href={arquivoSel.link} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" /> Ver no Google Drive
                      </a>
                    </Button>
                  )}
                  {podeExcluir && selecionada.fonte === 'local' && (
                    <Button
                      variant="soft-destructive"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => onExcluir({ id: arquivoSel.id, fileName: arquivoSel.nome })}
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
