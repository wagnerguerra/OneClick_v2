'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Folder, FolderOpen, FileText, FileImage, FileSpreadsheet, FileArchive,
  FileCode, FileVideo, FileAudio, File as FileGenerico, Presentation,
  ChevronRight, Loader2, Server, Trash2, Download, ExternalLink,
  Sparkles, PanelRightClose, PanelRightOpen, RefreshCw, Eye,
  CheckCircle2, AlertCircle, X, UploadCloud,
} from 'lucide-react'
import { Button, Badge, Checkbox, cn } from '@saas/ui'
import { TEXT } from '@/lib/color-styles'

/**
 * Explorador de arquivos no modelo do Windows Explorer.
 *
 * Três painéis: árvore à esquerda, conteúdo da pasta no meio, pré-visualização
 * à direita, com divisória arrastável entre os dois últimos.
 *
 * Não sabe de onde vêm os arquivos: recebe as "unidades" como adaptadores. É o
 * que permite a MESMA tela servir o escritório (arquivos do sistema + Drive do
 * cliente) e o portal do cliente (documentos dele + a pasta dele no Drive) —
 * rotas e permissões diferentes, mesma forma.
 */

export type Fonte = string

export interface PastaNo {
  id: string | null
  nome: string
}

export interface ArquivoItem {
  id: string
  nome: string
  tamanho: number | null
  mimeType: string | null
  modificadoEm: string | null
  origem: string | null
  novo: boolean
  link: string | null
  /** Quem mandou pelo sistema, e quando. Nulo = chegou por fora. */
  enviadoPor?: string | null
  enviadoEm?: string | null
}

/** Um arquivo na fila de envio. */
interface EnvioEmCurso {
  nome: string
  tamanho: number
  progresso: number
  situacao: 'enviando' | 'concluido' | 'erro'
  erro?: string
}

export interface Conteudo {
  pastas: PastaNo[]
  arquivos: ArquivoItem[]
  /** Mensagem a exibir no lugar da lista (não vinculado, sem permissão, etc). */
  indisponivel?: string | null
}

interface EstadoNo {
  expandido: boolean
  carregando: boolean
  filhos: PastaNo[] | null
}

export interface FonteExplorador {
  chave: Fonte
  nome: string
  icone: typeof Server
  buscar: (id: string | null) => Promise<Conteudo>
  /**
   * Chamado ao selecionar um arquivo. Devolve a URL para pré-visualizar (ou
   * null quando não há como) e é onde cada lado faz o que lhe cabe — marcar
   * como lido, registrar na trilha.
   */
  selecionar: (a: ArquivoItem) => Promise<string | null>
  /** Exclusão só existe onde faz sentido; no Drive, por ora, em lugar nenhum. */
  permiteExcluir?: boolean
  /**
   * Move um item para outra pasta. Ausente = a unidade não se reorganiza, e o
   * arrastar nem começa.
   *
   * `destinoId` nulo é a raiz da unidade.
   */
  mover?: (itemId: string, destinoId: string | null) => Promise<void>
  /**
   * Recebe UM arquivo do computador, reportando o progresso.
   *
   * Um por vez, e não a lista inteira, porque a fila e a barra vivem aqui: o
   * explorador precisa saber em qual arquivo está e a que altura, e isso se
   * perde se a fonte engolir o laço.
   *
   * `pastaId` nulo é a raiz da unidade.
   */
  enviar?: (arquivo: File, pastaId: string | null, onProgresso: (pct: number) => void) => Promise<void>
  /**
   * A área do escritório a que cada pasta pertence.
   *
   * Ausente = esta unidade não roteia aviso nenhum, e a coluna some. É o caso
   * dos arquivos do sistema e, sobretudo, do portal: quem é o responsável
   * interno por uma pasta é assunto do escritório, e não do cliente que a vê.
   *
   * `mapa` traz só o que foi mapeado EXPLICITAMENTE, com `null` na chave
   * representando a raiz da unidade. A herança é calculada aqui, a partir da
   * trilha por onde se desceu — o que dá a resposta exata sem uma consulta por
   * linha listada.
   */
  areas?: {
    opcoes: Array<{ id: string; nome: string }>
    mapa: Map<string, string>
    editavel: boolean
    definir: (pastaId: string | null, areaId: string | null) => Promise<void>
  }
}

/**
 * O arrasto traz arquivos do computador?
 *
 * `dataTransfer.types` é o único sinal disponível durante o `dragover` — o
 * conteúdo em si só aparece no `drop`, e a decisão de destacar a área precisa
 * ser tomada antes. Distinguir isto de um arrasto interno importa: o mesmo
 * `onDrop` atende os dois, e confundi-los faria soltar um PDF do desktop
 * tentar "mover" um item que não existe.
 */
function trazArquivos(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

/** Largura da pré-visualização, lembrada entre sessões. */
const CHAVE_LARGURA = 'gestao-arquivos:largura-preview'
const LARGURA_PADRAO = 320
const LARGURA_MIN = 260
const LARGURA_MAX = 900

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

export type TipoDeArquivo =
  | 'imagem' | 'pdf' | 'planilha' | 'documento' | 'apresentacao'
  | 'texto' | 'codigo' | 'zip' | 'video' | 'audio' | 'outro'

/**
 * Tipo pela extensão quando o mime não veio — o Drive nem sempre manda.
 *
 * A extensão é quem decide na prática: o caminho do Drive entrega
 * `mimeType: null` para todo arquivo, então lá só existe o nome. O mime entra
 * como reforço, para os arquivos do sistema, que o têm.
 */
export function tipoDoArquivo(nome: string, mime: string | null): TipoDeArquivo {
  const m = (mime ?? '').toLowerCase()
  const ext = nome.toLowerCase().split('.').pop() ?? ''
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'heic'].includes(ext)) return 'imagem'
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (m.includes('spreadsheet') || m.includes('excel') || ['xlsx', 'xls', 'xlsm', 'csv', 'ods'].includes(ext)) return 'planilha'
  if (m.includes('word') || ['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'documento'
  if (m.includes('presentation') || ['ppt', 'pptx', 'odp'].includes(ext)) return 'apresentacao'
  // XML sai de "texto" e vira "código": num escritório contábil um .xml é quase
  // sempre nota fiscal, e empilhá-lo com .txt apaga a distinção que importa.
  if (['xml', 'json', 'html', 'js', 'ts', 'sql', 'rem', 'ret'].includes(ext)) return 'codigo'
  if (m.startsWith('text/') || ['txt', 'log', 'md'].includes(ext)) return 'texto'
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext)) return 'zip'
  if (m.startsWith('video/') || ['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext)) return 'video'
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'audio'
  return 'outro'
}

/**
 * A área de uma pasta, e como trocá-la.
 *
 * Mostra a área com peso diferente conforme a origem: mapeada AQUI aparece
 * firme, herdada de cima aparece apagada. A distinção é o que torna a herança
 * compreensível — sem ela, "Fiscal" em cinco pastas seguidas pareceria cinco
 * decisões, quando é uma só, tomada lá em cima.
 *
 * "Herdar da pasta acima" não é o mesmo que "nenhuma área": remove o
 * mapeamento e a pasta volta a seguir o pai. Só quando nenhum ancestral está
 * mapeado é que o arquivo fica sem área e cai no fallback do aviso.
 */
function SeletorDeArea({
  areas, pastaId, herdada, cor,
}: {
  areas: NonNullable<FonteExplorador['areas']>
  pastaId: string | null
  herdada: string | null
  cor: string
}) {
  const [aberto, setAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [caixa, setCaixa] = useState<{ topo: number; direita: number } | null>(null)
  const caixaRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const propria = areas.mapa.get(pastaId ?? '__raiz__') ?? null
  const vigente = propria ?? herdada
  const nome = areas.opcoes.find(o => o.id === vigente)?.nome ?? null
  const nomeHerdado = areas.opcoes.find(o => o.id === herdada)?.nome ?? null

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      const alvo = e.target as Node
      // O menu vive no `body`, fora de `caixaRef` — sem conferir os dois, o
      // primeiro clique DENTRO do menu o fecharia antes de escolher.
      if (caixaRef.current?.contains(alvo) || menuRef.current?.contains(alvo)) return
      setAberto(false)
    }
    // Rolar a lista move o gatilho e deixaria o menu solto no ar; fechar é mais
    // honesto do que persegui-lo a cada quadro.
    function fechar() { setAberto(false) }
    document.addEventListener('mousedown', fora)
    window.addEventListener('scroll', fechar, true)
    window.addEventListener('resize', fechar)
    return () => {
      document.removeEventListener('mousedown', fora)
      window.removeEventListener('scroll', fechar, true)
      window.removeEventListener('resize', fechar)
    }
  }, [aberto])

  /**
   * Abre medindo o gatilho.
   *
   * O menu é renderizado no `document.body`, e não ao lado do botão, porque a
   * lista de arquivos rola dentro de um `overflow-y-auto`: um menu absoluto ali
   * dentro é CORTADO pela borda do contêiner, e nas últimas linhas da lista
   * simplesmente não aparece. É a mesma razão pela qual o padrão do projeto
   * manda usar Tooltip em portal quando há `overflow` no caminho.
   */
  function alternar() {
    if (aberto) { setAberto(false); return }
    const r = caixaRef.current?.getBoundingClientRect()
    if (r) setCaixa({ topo: r.bottom + 4, direita: window.innerWidth - r.right })
    setAberto(true)
  }

  async function escolher(areaId: string | null) {
    setAberto(false)
    setSalvando(true)
    try {
      await areas.definir(pastaId, areaId)
    } finally {
      setSalvando(false)
    }
  }

  if (!areas.editavel) {
    return nome
      ? <span className={cn('text-[11px]', propria ? 'text-foreground' : 'text-muted-foreground/70')}>{nome}</span>
      : <span className="text-[11px] text-muted-foreground/50">—</span>
  }

  return (
    // `stopPropagation` no contêiner inteiro: a linha da pasta navega ao ser
    // clicada, e escolher a área não pode entrar na pasta junto.
    <div ref={caixaRef} className="relative" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={alternar}
        disabled={salvando}
        title={propria ? 'Área desta pasta' : nome ? 'Herdada da pasta acima' : 'Sem área definida'}
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
          propria
            ? 'border-transparent font-medium text-foreground'
            : 'border-dashed border-border text-muted-foreground/70 hover:text-foreground',
        )}
        style={propria ? { backgroundColor: `color-mix(in srgb, ${cor} 14%, transparent)` } : undefined}
      >
        {salvando && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
        <span className="truncate">{nome ?? 'definir área'}</span>
      </button>

      {aberto && caixa && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ top: caixa.topo, right: caixa.direita }}
          className="fixed z-[80] min-w-[210px] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          {areas.opcoes.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Este cliente não tem área contratada. Contrate uma na aba Serviços do cliente.
            </p>
          )}
          {areas.opcoes.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => escolher(o.id)}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-[12px] transition-colors hover:bg-muted',
                o.id === propria && 'font-semibold',
              )}
            >
              {o.nome}
            </button>
          ))}
          {/* Tirar o vínculo tem DOIS significados, e o rótulo precisa dizer
              qual é o desta pasta. Se algum ancestral está mapeado, ela volta a
              herdar dele — e vale nomear qual, senão "acima" é adivinhação. Se
              não há nada acima, não se herda coisa alguma: a pasta fica sem
              área, e chamar isso de "herdar" seria mentira. */}
          {propria && (
            <button
              type="button"
              onClick={() => escolher(null)}
              className="mt-1 block w-full border-t border-border px-3 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {nomeHerdado ? `Remover — volta a herdar ${nomeHerdado}` : 'Remover área desta pasta'}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

/**
 * Ícone e cor de cada tipo.
 *
 * A COR é o que faz o tipo ser lido de relance — não o desenho. Em 16px e tudo
 * cinza, `FileSpreadsheet` e `FileText` são a mesma silhueta de papel, e uma
 * lista de .xlsx com .pdf parece ter um ícone só: foi exatamente assim que esta
 * tela ficou. Antes disto, ainda por cima, .pdf e .txt caíam no MESMO ícone.
 *
 * As cores seguem a convenção que as pessoas já trazem de fora — planilha
 * verde, PDF vermelho, documento azul — porque aqui reconhecer vale mais do
 * que inventar.
 *
 * Cada uma tem variante dark: o portal e o painel têm os dois temas, e um tom
 * escolhido só para o claro some no escuro.
 */
const VISUAL_DO_TIPO: Record<TipoDeArquivo, { Icone: typeof FileText; cor: string }> = {
  planilha:     { Icone: FileSpreadsheet, cor: TEXT.emerald },
  pdf:          { Icone: FileText,        cor: TEXT.rose },
  documento:    { Icone: FileText,        cor: TEXT.blue },
  apresentacao: { Icone: Presentation,    cor: TEXT.orange },
  imagem:       { Icone: FileImage,       cor: TEXT.violet },
  codigo:       { Icone: FileCode,        cor: TEXT.cyan },
  zip:          { Icone: FileArchive,     cor: TEXT.amber },
  video:        { Icone: FileVideo,       cor: TEXT.fuchsia },
  audio:        { Icone: FileAudio,       cor: TEXT.indigo },
  texto:        { Icone: FileText,        cor: 'text-slate-500 dark:text-slate-400' },
  outro:        { Icone: FileGenerico,    cor: 'text-muted-foreground' },
}

/**
 * O ícone traz a própria cor.
 *
 * O `className` do chamador serve a tamanho e layout. Quem passava
 * `text-muted-foreground` ali pintava todo tipo de igual e anulava o mapa
 * acima — `cor` existe para o caso legítimo de apagar de propósito.
 */
function IconeArquivo({ nome, mime, className, cor }: {
  nome: string
  mime: string | null
  className?: string
  cor?: string
}) {
  const { Icone, cor: corDoTipo } = VISUAL_DO_TIPO[tipoDoArquivo(nome, mime)]
  return <Icone className={cn(className, cor ?? corDoTipo)} />
}

/** Teto do que se busca para a prévia. Acima disto, o botão de abrir resolve. */
const MAX_BYTES_PLANILHA = 8 * 1024 * 1024
/** Quanto se desenha. O painel tem ~320px; o resto é peso sem leitura. */
const MAX_LINHAS = 200
const MAX_COLUNAS = 40

/**
 * Prévia de planilha, montada no navegador.
 *
 * O `.xlsx` caía em "este tipo de arquivo não abre aqui", o que numa lista
 * cheia de planilhas é quase o mesmo que não ter prévia. Não dá para resolver
 * com `<iframe>`: nem o Drive nem o visualizador do Office conseguem abrir
 * estes arquivos — o do Drive exigiria que o NAVEGADOR de quem olha tivesse
 * acesso à conta do escritório, e o do Office exigiria expor o arquivo
 * publicamente para os servidores da Microsoft. Os bytes já chegam pela nossa
 * API autenticada, então quem desenha é a própria página.
 *
 * `xlsx` entra por import dinâmico: é quase um mega, e o explorador abre muito
 * mais vezes do que alguém clica numa planilha. Assim ele só é baixado no
 * primeiro clique de quem realmente for olhar uma.
 *
 * Os tetos existem porque a pergunta que a prévia responde é "é este arquivo
 * mesmo?", e não "quanto deu a soma": a planilha inteira de 50 mil linhas
 * travaria a aba para responder algo que ninguém perguntou.
 */
function PreviaDePlanilha({ url, nome }: { url: string; nome: string }) {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'grande' | 'erro'>('carregando')
  const [abas, setAbas] = useState<string[]>([])
  const [aba, setAba] = useState(0)
  const [grade, setGrade] = useState<string[][]>([])
  const [truncada, setTruncada] = useState(false)
  const livroRef = useRef<{ Sheets: Record<string, unknown>; SheetNames: string[] } | null>(null)
  const xlsxRef = useRef<typeof import('xlsx') | null>(null)

  const desenhar = useCallback((indice: number) => {
    const XLSX = xlsxRef.current
    const livro = livroRef.current
    if (!XLSX || !livro) return
    const folha = livro.Sheets[livro.SheetNames[indice]!]
    const linhas = XLSX.utils.sheet_to_json(folha as never, {
      header: 1, blankrows: false, defval: '', raw: false,
    }) as unknown[][]
    setTruncada(linhas.length > MAX_LINHAS)
    setGrade(linhas.slice(0, MAX_LINHAS).map(l =>
      l.slice(0, MAX_COLUNAS).map(c => (c === null || c === undefined ? '' : String(c))),
    ))
  }, [])

  useEffect(() => {
    let cancelado = false
    setEstado('carregando')
    setAba(0)

    ;(async () => {
      try {
        // `credentials: 'include'`: a URL é da NOSSA API, e o arquivo do Drive
        // só sai de lá para quem tem sessão.
        const r = await fetch(url, { credentials: 'include' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const buf = await r.arrayBuffer()
        if (cancelado) return
        if (buf.byteLength > MAX_BYTES_PLANILHA) { setEstado('grande'); return }

        const XLSX = await import('xlsx')
        if (cancelado) return
        const livro = XLSX.read(buf, { type: 'array' })
        xlsxRef.current = XLSX
        livroRef.current = livro as never
        setAbas(livro.SheetNames)
        desenhar(0)
        setEstado('ok')
      } catch {
        if (!cancelado) setEstado('erro')
      }
    })()

    return () => { cancelado = true }
  }, [url, desenhar])

  function trocarAba(i: number) {
    setAba(i)
    desenhar(i)
  }

  if (estado === 'carregando') return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  if (estado !== 'ok') {
    return (
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <FileSpreadsheet className="h-10 w-10 text-emerald-600/60 dark:text-emerald-400/60" />
        <p className="text-[11px] text-muted-foreground">
          {estado === 'grande'
            ? 'Planilha grande demais para a prévia. Use o botão abaixo.'
            : 'Não foi possível montar a prévia desta planilha.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      {abas.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto nice-scrollbar border-b border-border px-1 pb-1">
          {abas.map((n, i) => (
            <button
              key={n}
              type="button"
              onClick={() => trocarAba(i)}
              className={cn(
                'shrink-0 rounded px-2 py-0.5 text-[11px] transition-colors',
                i === aba ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      <div className="nice-scrollbar min-h-0 flex-1 overflow-auto">
        <table className="w-max border-collapse text-[11px]">
          <tbody>
            {grade.map((linha, i) => (
              <tr key={i} className={i === 0 ? 'sticky top-0 bg-muted/60 font-semibold' : undefined}>
                {linha.map((celula, j) => (
                  <td
                    key={j}
                    // `max-w` + truncate: uma célula com um parágrafo dentro
                    // esticaria a tabela e mataria a leitura das vizinhas.
                    className="max-w-[160px] truncate border border-border/40 px-1.5 py-0.5"
                    title={celula || undefined}
                  >
                    {celula}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {truncada && (
        <p className="shrink-0 border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
          Mostrando as primeiras {MAX_LINHAS} linhas de "{nome}".
        </p>
      )}
    </div>
  )
}

/** Teto do .docx buscado para prévia. Acima disto, o botão de abrir resolve. */
const MAX_BYTES_DOCX = 12 * 1024 * 1024

/**
 * Prévia de documento do Word, montada no navegador.
 *
 * Mesmo impasse da planilha: o navegador não renderiza `.docx`, e os
 * visualizadores de prateleira não servem — o do Drive exigiria que o navegador
 * de quem olha tivesse acesso à conta do escritório, e o do Office exigiria
 * expor o arquivo publicamente. O `mammoth` converte o documento em HTML aqui
 * mesmo, a partir dos bytes que já chegam pela nossa API autenticada.
 *
 * O HTML resultante vai para um `<iframe sandbox>` VAZIO, e não para a página.
 *
 * Isso não é excesso de zelo: o `.docx` foi enviado pelo CLIENTE, e é conteúdo
 * que não controlamos. O sandbox vazio nega script, formulário e navegação, e
 * o iframe ainda isola o CSS do documento do resto da tela — um `<style>` de
 * dentro do Word não repinta o explorador. `dangerouslySetInnerHTML` daria o
 * contrário das duas coisas.
 *
 * `mammoth` entra por import dinâmico pelo mesmo motivo do `xlsx`: só desce
 * para quem de fato clicar num documento.
 */
function PreviaDeDocumento({ url }: { url: string }) {
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'grande' | 'erro'>('carregando')
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelado = false
    setEstado('carregando')

    ;(async () => {
      try {
        const r = await fetch(url, { credentials: 'include' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const buf = await r.arrayBuffer()
        if (cancelado) return
        if (buf.byteLength > MAX_BYTES_DOCX) { setEstado('grande'); return }

        const mammoth = await import('mammoth')
        if (cancelado) return
        const { value } = await mammoth.convertToHtml({ arrayBuffer: buf })
        if (cancelado) return

        // A folha de estilo acompanha o documento dentro do sandbox: lá não há
        // nada do nosso tema, e sem isto o texto sai com o serifado padrão do
        // navegador, em 16px, colado nas bordas.
        setHtml(`<!doctype html><meta charset="utf-8">
<style>
  body{margin:0;padding:14px;font:13px/1.55 'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#fff}
  h1{font-size:19px}h2{font-size:16px}h3{font-size:14px}
  h1,h2,h3{margin:14px 0 6px;line-height:1.25}
  p{margin:0 0 9px}
  table{border-collapse:collapse;max-width:100%}
  td,th{border:1px solid #e2e8f0;padding:3px 6px;font-size:12px}
  img{max-width:100%;height:auto}
  ul,ol{margin:0 0 9px;padding-left:20px}
</style>${value}`)
        setEstado('ok')
      } catch {
        if (!cancelado) setEstado('erro')
      }
    })()

    return () => { cancelado = true }
  }, [url])

  if (estado === 'carregando') return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  if (estado !== 'ok') {
    return (
      <div className="flex flex-col items-center gap-2 px-4 text-center">
        <FileText className="h-10 w-10 text-blue-600/60 dark:text-blue-400/60" />
        <p className="text-[11px] text-muted-foreground">
          {estado === 'grande'
            ? 'Documento grande demais para a prévia. Use o botão abaixo.'
            : 'Não foi possível montar a prévia deste documento.'}
        </p>
      </div>
    )
  }

  return (
    <iframe
      // `sandbox` vazio: nega tudo. O conteúdo vem de arquivo de terceiro.
      sandbox=""
      srcDoc={html}
      title="Prévia do documento"
      className="h-full w-full border-0 bg-white"
    />
  )
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
  fonte, pasta, nivel, caminho, nos, selecionada, fontes, cor,
  arrastado, alvo, alvoEnvio, podeReceber, onAlvo, onAlvoEnvio, onSoltar, onArquivos,
  onAlternar, onAbrir,
}: {
  fonte: Fonte
  pasta: PastaNo
  nivel: number
  caminho: PastaNo[]
  nos: Record<string, EstadoNo>
  selecionada: { fonte: Fonte; id: string | null }
  fontes: FonteExplorador[]
  cor: string
  arrastado: { id: string; nome: string } | null
  alvo: string | null | undefined
  alvoEnvio: string | null | undefined
  podeReceber: boolean
  onAlvo: (id: string | null | undefined) => void
  onAlvoEnvio: (id: string | null | undefined) => void
  onSoltar: (destinoId: string | null) => void
  onArquivos: (arquivos: File[], pastaId: string | null) => void
  onAlternar: (fonte: Fonte, id: string | null) => void
  onAbrir: (fonte: Fonte, id: string | null, caminho: PastaNo[]) => void
}) {
  const k = chave(fonte, pasta.id)
  const estado = nos[k]
  const ativa = selecionada.fonte === fonte && selecionada.id === pasta.id
  const ehUnidade = pasta.id === null
  const IconeNo = ehUnidade
    ? (fontes.find(f => f.chave === fonte)?.icone ?? Server)
    : (estado?.expandido ? FolderOpen : Folder)

  return (
    <div>
      <div
        // A unidade (raiz) também recebe: é como se tira uma pasta de dentro de
        // outra e a traz de volta para o topo — o caso do print que originou
        // isto, com 2025 criada dentro de 2026.
        onDragOver={e => {
          if (trazArquivos(e)) {
            if (!podeReceber) return
            e.preventDefault()
            onAlvoEnvio(pasta.id)
          } else if (arrastado && arrastado.id !== pasta.id) {
            e.preventDefault()
            onAlvo(pasta.id)
          }
        }}
        onDragLeave={() => { onAlvo(undefined); onAlvoEnvio(undefined) }}
        onDrop={e => {
          e.preventDefault()
          const arquivos = Array.from(e.dataTransfer.files ?? [])
          if (arquivos.length > 0) onArquivos(arquivos, pasta.id)
          else onSoltar(pasta.id)
        }}
        className={cn(
          'group flex items-center gap-1 rounded-md py-1 pr-1.5 text-[13px] transition-colors',
          ativa ? 'bg-muted font-medium text-foreground' : 'text-foreground/80 hover:bg-muted/50',
          ((arrastado && alvo === pasta.id) || alvoEnvio === pasta.id) && 'ring-1 ring-inset',
        )}
        style={{
          paddingLeft: `${nivel * 12 + 4}px`,
          ...((arrastado && alvo === pasta.id) || alvoEnvio === pasta.id
            ? { boxShadow: `inset 0 0 0 1px ${cor}` }
            : {}),
        }}
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
          <IconeNo className="h-4 w-4 shrink-0" style={{ color: ehUnidade ? cor : undefined }} />
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
          fontes={fontes}
          cor={cor}
          arrastado={arrastado}
          alvo={alvo}
          alvoEnvio={alvoEnvio}
          podeReceber={podeReceber}
          onAlvo={onAlvo}
          onAlvoEnvio={onAlvoEnvio}
          onSoltar={onSoltar}
          onArquivos={onArquivos}
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

/**
 * Fila de envio, no canto inferior direito.
 *
 * Flutua sobre o explorador em vez de empurrar o conteúdo: quem está enviando
 * continua navegando, e uma barra que desloca a lista faria o item sob o
 * ponteiro fugir no meio do clique.
 */
function FilaDeEnvio({ fila, onFechar }: { fila: EnvioEmCurso[]; onFechar: () => void }) {
  if (fila.length === 0) return null

  const concluidos = fila.filter(f => f.situacao === 'concluido').length
  const comErro = fila.filter(f => f.situacao === 'erro').length
  const terminou = concluidos + comErro === fila.length

  // `left-3` no celular faz a fila ocupar a largura disponível em vez de
  // 320px fixos, que em 390px encostavam nas duas bordas.
  return (
    <div className="anim-subir absolute bottom-3 left-3 right-3 z-30 overflow-hidden rounded-lg border border-border bg-card shadow-lg sm:left-auto sm:w-[320px]">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <UploadCloud className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">
          {terminou
            ? (comErro > 0
                ? `${concluidos} enviado(s), ${comErro} com erro`
                : `${concluidos} arquivo(s) enviado(s)`)
            : `Enviando ${concluidos + 1} de ${fila.length}`}
        </span>
        <button
          type="button"
          onClick={onFechar}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-[220px] overflow-y-auto nice-scrollbar">
        {fila.map((f, i) => (
          <div key={`${f.nome}-${i}`} className="border-b border-border/50 px-3 py-2 last:border-b-0">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{f.nome}</span>
              {f.situacao === 'concluido' && (
                <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', TEXT.emerald)} />
              )}
              {f.situacao === 'erro' && (
                <AlertCircle className={cn('h-3.5 w-3.5 shrink-0', TEXT.rose)} />
              )}
              {f.situacao === 'enviando' && (
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {f.progresso}%
                </span>
              )}
            </div>

            {f.situacao === 'enviando' && (
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-150 ease-out"
                  style={{ width: `${f.progresso}%`, backgroundColor: 'var(--mod-administrativo, #38bdf8)' }}
                />
              </div>
            )}
            {f.situacao === 'erro' && (
              <p className={cn('mt-0.5 text-[11px]', TEXT.rose)}>{f.erro}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function Explorador({
  fontes, cor, altura = 'h-[calc(100vh-260px)]', onExcluir, onExcluirVarios,
  onPastaAtual, recarregar, acoes,
}: {
  fontes: FonteExplorador[]
  cor: string
  altura?: string
  onExcluir?: (arquivo: { id: string; fileName: string }) => void
  /**
   * Exclusão em lote. Ausente = sem caixas de seleção.
   *
   * Separada de `onExcluir` de propósito: a seleção múltipla só faz sentido
   * onde excluir é barato de desfazer (a lixeira do Drive guarda 30 dias) e
   * onde a pessoa mexe em volume. Quem não passar esta função tem a tela
   * exatamente como era — é o que mantém o lado do escritório intocado.
   */
  onExcluirVarios?: (arquivos: Array<{ id: string; fileName: string }>) => void
  /**
   * Avisa qual pasta está aberta. Quem monta a tela precisa disso para saber
   * ONDE criar pasta ou enviar arquivo — a navegação mora aqui dentro, e sem
   * este aviso o botão de enviar mandaria sempre para a raiz.
   */
  onPastaAtual?: (fonte: Fonte, id: string | null) => void
  /**
   * Mude este número para recarregar a pasta ABERTA.
   *
   * Existe porque a alternativa que estava em uso — `key={versao}` na tela de
   * fora — remonta o componente inteiro, e remontar zera a navegação: excluir
   * um arquivo dentro de "2026" devolvia a pessoa à raiz. O estado da
   * navegação mora aqui, então quem precisa recarregar avisa, em vez de
   * destruir.
   */
  recarregar?: number
  /** Botões extras na barra da lista (enviar, nova pasta). */
  acoes?: React.ReactNode
}) {
  const [nos, setNos] = useState<Record<string, EstadoNo>>({})
  const [selecionada, setSelecionada] = useState<{ fonte: Fonte; id: string | null }>(
    { fonte: fontes[0]?.chave ?? '', id: null },
  )
  const [conteudo, setConteudo] = useState<Conteudo | null>(null)
  const [carregandoConteudo, setCarregandoConteudo] = useState(false)
  const [arquivoSel, setArquivoSel] = useState<ArquivoItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCarregando, setPreviewCarregando] = useState(false)
  const [painelAberto, setPainelAberto] = useState(true)
  const [trilha, setTrilha] = useState<PastaNo[]>([])
  const [largura, setLargura] = useState(LARGURA_PADRAO)
  const [arrastando, setArrastando] = useState(false)
  /** Item sendo arrastado, e a pasta sob o ponteiro. */
  const [item, setItem] = useState<{ id: string; nome: string } | null>(null)
  const [alvo, setAlvo] = useState<string | null | undefined>(undefined)
  const [movendo, setMovendo] = useState(false)
  /** Pasta sob o ponteiro durante um arrasto de arquivos do computador. */
  const [alvoEnvio, setAlvoEnvio] = useState<string | null | undefined>(undefined)
  const [enviando, setEnviando] = useState(false)
  const [fila, setFila] = useState<EnvioEmCurso[]>([])
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Lê a largura salva depois da montagem, não na inicialização do estado: no
  // SSR não existe `localStorage`, e ler ali faria o HTML do servidor divergir
  // do primeiro render do cliente.
  useEffect(() => {
    try {
      const salvo = Number(window.localStorage.getItem(CHAVE_LARGURA))
      if (Number.isFinite(salvo) && salvo >= LARGURA_MIN) {
        setLargura(Math.min(salvo, LARGURA_MAX))
      }
    } catch { /* navegador sem storage: fica no padrão */ }
  }, [])

  const fonteAtual = fontes.find(f => f.chave === selecionada.fonte) ?? fontes[0]

  const buscar = useCallback(async (fonte: Fonte, id: string | null): Promise<Conteudo> => {
    const f = fontes.find(x => x.chave === fonte)
    if (!f) return { pastas: [], arquivos: [] }
    return f.buscar(id)
  }, [fontes])

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

  const primeira = fontes[0]?.chave
  useEffect(() => { if (primeira) abrirPasta(primeira, null, []) }, [primeira, abrirPasta])

  // A montagem já carrega pelo efeito acima; recarregar também na primeira
  // passada faria duas idas ao Drive a cada abertura da tela.
  const primeiraRecarga = useRef(true)
  useEffect(() => {
    if (primeiraRecarga.current) { primeiraRecarga.current = false; return }
    abrirPasta(selecionada.fonte, selecionada.id, trilha)
    // `selecionada` e `trilha` de propósito fora das dependências: o efeito
    // dispara com a MUDANÇA DE `recarregar`, e usa a pasta que estiver aberta
    // naquele instante. Incluí-los faria a pasta recarregar sozinha a cada
    // navegação, dobrando as chamadas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarregar])

  // Efeito, e não chamada dentro de `abrirPasta`: avisar durante o clique
  // dispararia um `setState` do pai no meio do render deste componente.
  useEffect(() => {
    onPastaAtual?.(selecionada.fonte, selecionada.id)
  }, [selecionada, onPastaAtual])

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

  // ── Divisória arrastável ──────────────────────────────────────────────────
  // Os ouvintes ficam no `window`, e não na divisória: o ponteiro anda mais
  // rápido que o re-render, sai de cima do elemento e o arrasto travaria no
  // meio do caminho.
  useEffect(() => {
    if (!arrastando) return

    function mover(e: MouseEvent) {
      const caixa = containerRef.current?.getBoundingClientRect()
      if (!caixa) return
      const nova = caixa.right - e.clientX
      setLargura(Math.max(LARGURA_MIN, Math.min(LARGURA_MAX, nova)))
    }
    function soltar() {
      setArrastando(false)
    }

    window.addEventListener('mousemove', mover)
    window.addEventListener('mouseup', soltar)
    // Sem isto o arrasto seleciona o texto da lista, e o cursor pisca entre a
    // seta e o "I" de texto durante o movimento.
    const anterior = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      window.removeEventListener('mousemove', mover)
      window.removeEventListener('mouseup', soltar)
      document.body.style.userSelect = anterior
      document.body.style.cursor = ''
    }
  }, [arrastando])

  // Persiste ao SOLTAR, não a cada pixel: gravar durante o arrasto escreveria
  // no localStorage dezenas de vezes por segundo sem nenhum ganho.
  useEffect(() => {
    if (arrastando) return
    try { window.localStorage.setItem(CHAVE_LARGURA, String(Math.round(largura))) } catch { /* sem storage */ }
  }, [arrastando, largura])

  /**
   * Selecionar um arquivo já conta como abrir: cada fonte decide o que isso
   * significa (marcar como lido, registrar na trilha) e devolve a URL.
   */
  async function selecionarArquivo(a: ArquivoItem) {
    setArquivoSel(a)
    setPreviewUrl(null)
    setPainelAberto(true)
    if (!fonteAtual) return
    setPreviewCarregando(true)
    try {
      const url = await fonteAtual.selecionar(a)
      setPreviewUrl(url)
      if (a.novo) {
        setConteudo(c => c && { ...c, arquivos: c.arquivos.map(x => (x.id === a.id ? { ...x, novo: false } : x)) })
      }
    } catch {
      setPreviewUrl(null)
    } finally {
      setPreviewCarregando(false)
    }
  }

  /**
   * Solta o item na pasta de destino.
   *
   * `destinoId` `undefined` significa "nenhum alvo válido" e vira um não-ato;
   * `null` é a raiz da unidade, que é um destino legítimo. São coisas
   * diferentes, e colapsá-las num só valor faria soltar no vazio mandar tudo
   * para a raiz.
   */
  async function soltarEm(destinoId: string | null | undefined) {
    const arrastado = item
    setItem(null)
    setAlvo(undefined)
    if (!arrastado || destinoId === undefined || !fonteAtual?.mover) return
    if (arrastado.id === destinoId) return

    setMovendo(true)
    try {
      await fonteAtual.mover(arrastado.id, destinoId)
      // Recarrega a pasta aberta e limpa a árvore: mover muda a estrutura, e
      // um cache de filhos de antes do movimento mostraria o item nos dois
      // lugares até alguém apertar atualizar.
      setNos({})
      await abrirPasta(selecionada.fonte, selecionada.id, trilha)
    } catch (e) {
      setConteudo(c => c && { ...c, indisponivel: e instanceof Error ? e.message : 'Não foi possível mover.' })
    } finally {
      setMovendo(false)
    }
  }

  /**
   * Recebe os arquivos soltos e manda para a pasta indicada.
   *
   * Recarrega a pasta ABERTA no fim, não a de destino: se a pessoa soltou numa
   * pasta da árvore que não é a que está vendo, o conteúdo à vista não mudou —
   * recarregar outra coisa faria a tela pular sem motivo.
   */
  async function receberArquivos(arquivos: File[], pastaId: string | null) {
    setAlvoEnvio(undefined)
    const enviarUm = fonteAtual?.enviar
    if (arquivos.length === 0 || !enviarUm) return

    // A fila é reiniciada a cada soltura: mostrar os envios de cinco minutos
    // atrás junto com os de agora só confunde quem está olhando.
    const inicio = arquivos.map(a => ({
      nome: a.name, tamanho: a.size, progresso: 0, situacao: 'enviando' as const,
    }))
    setFila(inicio)
    setEnviando(true)

    for (let i = 0; i < arquivos.length; i++) {
      try {
        await enviarUm(arquivos[i]!, pastaId, pct => {
          setFila(f => f.map((x, j) => (j === i ? { ...x, progresso: pct } : x)))
        })
        setFila(f => f.map((x, j) => (j === i ? { ...x, progresso: 100, situacao: 'concluido' } : x)))
      } catch (e) {
        // Um arquivo que falha não interrompe os outros: quem soltou dez não
        // deve perder nove por causa do terceiro.
        setFila(f => f.map((x, j) => (j === i
          ? { ...x, situacao: 'erro', erro: e instanceof Error ? e.message : 'falhou' }
          : x)))
      }
    }

    setEnviando(false)
    await abrirPasta(selecionada.fonte, selecionada.id, trilha)

    // Some sozinha só se TUDO deu certo. Erro fica na tela até alguém fechar,
    // senão o aviso passa despercebido e o arquivo nunca chegou.
    setFila(f => {
      if (f.some(x => x.situacao === 'erro')) return f
      window.setTimeout(() => setFila([]), 2500)
      return f
    })
  }

  const podeArrastar = Boolean(fonteAtual?.mover)
  const podeReceber = Boolean(fonteAtual?.enviar)
  const areas = fonteAtual?.areas

  /**
   * A área que vale NESTE nível, herdada de cima.
   *
   * Sai da trilha por onde se desceu, do mais fundo para a raiz: é exatamente
   * o caminho que o servidor percorre no Drive na hora de avisar, só que aqui
   * ele já está na mão — navegar até uma pasta é ter a lista dos ancestrais
   * dela. Calcular assim dá a resposta exata sem uma consulta por linha
   * listada, que é o que tornaria a tela lenta.
   *
   * É a herança de quem ESTÁ sendo listado: as pastas filhas herdam daqui, e
   * os arquivos desta pasta também.
   */
  const areaDoNivel = (() => {
    if (!areas) return null
    for (let i = trilha.length - 1; i >= 0; i--) {
      const a = areas.mapa.get(trilha[i]!.id ?? '__raiz__')
      if (a) return a
    }
    return areas.mapa.get('__raiz__') ?? null
  })()

  /** A área herdada pela PASTA ATUAL, ignorando o que ela própria declara. */
  const areaHerdadaPelaAtual = (() => {
    if (!areas) return null
    for (let i = trilha.length - 2; i >= 0; i--) {
      const a = areas.mapa.get(trilha[i]!.id ?? '__raiz__')
      if (a) return a
    }
    return trilha.length > 0 ? (areas.mapa.get('__raiz__') ?? null) : null
  })()

  const tipoSel = arquivoSel ? tipoDoArquivo(arquivoSel.nome, arquivoSel.mimeType) : null
  // `codigo` entra junto de `texto`: XML e JSON continuam sendo texto e
  // continuam abrindo na pre-visualizacao. Separa-los foi para o ICONE — um
  // .xml de nota fiscal nao e um .txt —, e nao para tirar capacidade.
  const previsualizavel = tipoSel === 'imagem' || tipoSel === 'pdf'
    || tipoSel === 'texto' || tipoSel === 'codigo' || tipoSel === 'planilha'
    || tipoSel === 'documento'
  const podeExcluirAqui = Boolean(onExcluir && fonteAtual?.permiteExcluir)
  const podeSelecionar = Boolean(onExcluirVarios && fonteAtual?.permiteExcluir)

  /**
   * O que está marcado na PASTA ABERTA.
   *
   * Some ao trocar de pasta ou de unidade, e depois de recarregar. Manter a
   * marca entre pastas seria guardar uma seleção invisível: a pessoa clicaria
   * em "excluir 3" vendo só um, e levaria dois arquivos de outra pasta junto.
   */
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  useEffect(() => {
    setMarcados(new Set())
  }, [selecionada.fonte, selecionada.id, recarregar])

  const arquivosDaPasta = conteudo?.arquivos ?? []
  const todosMarcados = arquivosDaPasta.length > 0 && marcados.size === arquivosDaPasta.length

  function alternarMarca(id: string) {
    setMarcados(m => {
      const novo = new Set(m)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarTodos() {
    setMarcados(m => (m.size === arquivosDaPasta.length ? new Set() : new Set(arquivosDaPasta.map(a => a.id))))
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative flex min-h-[420px] overflow-hidden rounded-lg border border-border bg-card', altura)}
    >
      <FilaDeEnvio fila={fila} onFechar={() => setFila([])} />
      {/* ── Árvore ─────────────────────────────────────────────── */}
      {/* A árvore só a partir de `md`.

          Em 390px ela tomava 240 dos ~350px úteis e sobravam 110 para a lista
          — o painel principal virava uma tira. No celular a navegação fica
          toda na lista: entrar é clicar na pasta, e voltar é a trilha acima,
          que passou a ser clicável justamente por causa disto. */}
      <div className="hidden w-[240px] shrink-0 overflow-y-auto nice-scrollbar border-r border-border bg-muted/20 p-2 md:block">
        {fontes.map(f => (
          <LinhaArvore
            key={f.chave}
            fonte={f.chave}
            pasta={{ id: null, nome: f.nome }}
            nivel={0}
            caminho={[]}
            nos={nos}
            selecionada={selecionada}
            fontes={fontes}
            cor={cor}
            arrastado={item}
            alvo={alvo}
            alvoEnvio={alvoEnvio}
            podeReceber={podeReceber}
            onAlvo={setAlvo}
            onAlvoEnvio={setAlvoEnvio}
            onSoltar={soltarEm}
            onArquivos={receberArquivos}
            onAlternar={alternar}
            onAbrir={abrirPasta}
          />
        ))}
      </div>

      {/* ── Conteúdo da pasta ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* A trilha NAVEGA.

            Era texto puro: dava para descer na árvore e não havia como subir
            sem a árvore lateral. No desktop passava despercebido; no celular,
            com a árvore escondida, a pessoa entrava numa pasta e ficava presa.
            Cada pedaço volta para o seu nível, e o nome da unidade volta para
            a raiz. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2 text-xs">
          <button
            type="button"
            onClick={() => abrirPasta(selecionada.fonte, null, [])}
            className="shrink-0 rounded px-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {fonteAtual?.nome}
          </button>
          {trilha.map((p, i) => (
            <span key={p.id ?? 'r'} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <button
                type="button"
                onClick={() => abrirPasta(selecionada.fonte, p.id, trilha.slice(0, i + 1))}
                className="min-w-0 truncate rounded px-1 text-foreground transition-colors hover:bg-muted"
              >
                {p.nome}
              </button>
            </span>
          ))}
          {/* A área da pasta em que se ESTÁ.
              A coluna da listagem resolve as pastas filhas, mas não esta —
              e é justamente nela que a pessoa está olhando quando decide.
              Sem isto seria preciso subir um nível para classificar a pasta
              aberta, que é o contrário do que a navegação sugere. */}
          {areas && (
            <span className="ml-2 flex shrink-0 items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">área:</span>
              <SeletorDeArea
                areas={areas}
                pastaId={selecionada.id}
                herdada={areaHerdadaPelaAtual}
                cor={cor}
              />
            </span>
          )}
          {item && (
            <span className="ml-3 truncate text-[11px] text-muted-foreground">
              Movendo <span className="font-medium text-foreground">{item.nome}</span> — solte numa pasta
            </span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {(movendo || enviando) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            {acoes}
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

        <div
          // A área toda recebe, não só as linhas: o espaço vazio abaixo da
          // lista é justamente onde a mão vai quando se arrasta um arquivo
          // para "esta pasta". Serve aos dois arrastos — arquivo do computador
          // envia; item interno move para a pasta aberta.
          onDragOver={e => {
            if (trazArquivos(e)) {
              if (!podeReceber) return
              e.preventDefault()
              setAlvoEnvio(selecionada.id)
            } else if (item) {
              e.preventDefault()
              setAlvo(selecionada.id)
            }
          }}
          onDragLeave={e => {
            // Só limpa quando o ponteiro sai da área inteira, e não ao cruzar
            // a fronteira entre as linhas de dentro dela.
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setAlvoEnvio(undefined)
            setAlvo(undefined)
          }}
          onDrop={e => {
            e.preventDefault()
            const arquivos = Array.from(e.dataTransfer.files ?? [])
            if (arquivos.length > 0) receberArquivos(arquivos, selecionada.id)
            else soltarEm(selecionada.id)
          }}
          className={cn(
            'relative min-h-0 flex-1 overflow-y-auto nice-scrollbar',
            alvoEnvio === selecionada.id && 'ring-1 ring-inset',
          )}
          style={alvoEnvio === selecionada.id ? { boxShadow: `inset 0 0 0 2px ${cor}` } : undefined}
        >
          {alvoEnvio === selecionada.id && (
            <div
              className="anim-entrar pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
              style={{ backgroundColor: `color-mix(in srgb, ${cor} 8%, transparent)` }}
            >
              <span
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white"
                style={{ backgroundColor: cor }}
              >
                Soltar para enviar {trilha.length > 0 ? `em ${trilha[trilha.length - 1]!.nome}` : 'aqui'}
              </span>
            </div>
          )}
          {/* A barra do lote entra SÓ com algo marcado.
              Fica presa no topo da lista, e não no rodapé da tela, porque é
              daqui que a seleção fala: com a lista rolada, um botão lá embaixo
              agiria sobre linhas que a pessoa não está mais vendo. */}
          {podeSelecionar && marcados.size > 0 && (
            <div className="anim-descer sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
              <span className="text-[12px] font-medium text-foreground">
                {marcados.size} {marcados.size === 1 ? 'arquivo marcado' : 'arquivos marcados'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[12px]"
                  onClick={() => setMarcados(new Set())}
                >
                  Limpar
                </Button>
                <Button
                  variant="soft-destructive"
                  size="sm"
                  className="h-7 gap-1.5 text-[12px]"
                  onClick={() => onExcluirVarios!(
                    arquivosDaPasta
                      .filter(a => marcados.has(a.id))
                      .map(a => ({ id: a.id, fileName: a.nome })),
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir {marcados.size === 1 ? 'arquivo' : 'selecionados'}
                </Button>
              </div>
            </div>
          )}

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
            <table
              // `key` na trilha faz a tabela reanimar a cada pasta aberta: sem
              // isso o React reaproveita o nó e a troca acontece sem nada
              // indicando que o conteúdo mudou.
              key={`${selecionada.fonte}:${selecionada.id ?? 'raiz'}`}
              className="anim-entrar w-full table-fixed text-[13px]"
            >
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {podeSelecionar && (
                    <th className="w-[36px] px-2 py-1.5">
                      <Checkbox
                        checked={todosMarcados}
                        onCheckedChange={alternarTodos}
                        disabled={arquivosDaPasta.length === 0}
                        aria-label="Marcar todos os arquivos desta pasta"
                        accentColor={cor}
                        className="h-3.5 w-3.5 cursor-pointer align-middle"
                      />
                    </th>
                  )}
                  <th className={cn('px-3 py-1.5 text-left font-semibold', areas ? 'w-[36%]' : 'w-[48%]')}>Nome</th>
                  {areas && (
                    <th className="hidden w-[18%] px-3 py-1.5 text-left font-semibold sm:table-cell">Área</th>
                  )}
                  <th className="hidden w-[14%] px-3 py-1.5 text-right font-semibold sm:table-cell">Tamanho</th>
                  <th className="hidden w-[22%] px-3 py-1.5 text-left font-semibold md:table-cell">Modificado</th>
                  <th className="w-[10%] px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {conteudo.pastas.map(p => (
                  <tr
                    key={p.id}
                    draggable={podeArrastar}
                    onDragStart={() => setItem({ id: p.id!, nome: p.nome })}
                    onDragEnd={() => { setItem(null); setAlvo(undefined) }}
                    // `preventDefault` no dragOver é o que autoriza a soltura —
                    // sem ele o navegador recusa o drop e nada acontece.
                    onDragOver={e => { if (podeArrastar && item && item.id !== p.id) { e.preventDefault(); setAlvo(p.id) } }}
                    onDragLeave={() => setAlvo(a => (a === p.id ? undefined : a))}
                    onDrop={e => { e.preventDefault(); soltarEm(p.id) }}
                    className={cn(
                      'cursor-pointer border-b border-border/50 hover:bg-muted/40',
                      alvo === p.id && 'ring-1 ring-inset',
                      item?.id === p.id && 'opacity-40',
                    )}
                    style={alvo === p.id ? { boxShadow: `inset 0 0 0 1px ${cor}` } : undefined}
                    onClick={() => abrirPasta(selecionada.fonte, p.id, [...trilha, p])}
                  >
                    {/* Pasta não entra na seleção: excluir pasta arrasta junto
                        o que há dentro, e a marca de um clique não deve poder
                        fazer isso sem a pessoa ver o que vai levar. */}
                    {podeSelecionar && <td className="px-2 py-1.5" />}
                    <td className="px-3 py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Folder className="h-4 w-4 shrink-0" style={{ color: cor }} />
                        <span className="truncate font-medium">{p.nome}</span>
                      </div>
                    </td>
                    {areas && (
                      <td className="hidden px-3 py-1.5 sm:table-cell">
                        <SeletorDeArea areas={areas} pastaId={p.id} herdada={areaDoNivel} cor={cor} />
                      </td>
                    )}
                    <td className="hidden px-3 py-1.5 text-right text-muted-foreground sm:table-cell">—</td>
                    <td className="hidden px-3 py-1.5 text-muted-foreground md:table-cell">—</td>
                    <td />
                  </tr>
                ))}

                {/* Arquivo não tem área própria: ele herda a da pasta onde está,
                    que é o que a coluna mostra apagada. Mapear arquivo a
                    arquivo seria devolver ao cliente a classificação que a
                    pasta existe para evitar. */}
                {conteudo.arquivos.map(a => (
                  <tr
                    key={a.id}
                    draggable={podeArrastar}
                    onDragStart={() => setItem({ id: a.id, nome: a.nome })}
                    onDragEnd={() => { setItem(null); setAlvo(undefined) }}
                    className={cn(
                      'cursor-pointer border-b border-border/50 hover:bg-muted/40',
                      arquivoSel?.id === a.id && 'bg-muted',
                      item?.id === a.id && 'opacity-40',
                    )}
                    onClick={() => selecionarArquivo(a)}
                  >
                    {podeSelecionar && (
                      <td className="px-2 py-1.5" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={marcados.has(a.id)}
                          onCheckedChange={() => alternarMarca(a.id)}
                          aria-label={`Marcar ${a.nome}`}
                          accentColor={cor}
                          className="h-3.5 w-3.5 cursor-pointer align-middle"
                        />
                      </td>
                    )}
                    <td className="px-3 py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <IconeArquivo nome={a.nome} mime={a.mimeType} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{a.nome}</span>
                        {a.novo && (
                          <Badge className="shrink-0 gap-1 text-white" style={{ backgroundColor: cor }}>
                            <Sparkles className="h-3 w-3" /> Novo
                          </Badge>
                        )}
                      </div>
                    </td>
                    {areas && (
                      <td className="hidden px-3 py-1.5 sm:table-cell">
                        <span className="text-[11px] text-muted-foreground/70">
                          {areas.opcoes.find(o => o.id === areaDoNivel)?.nome ?? '—'}
                        </span>
                      </td>
                    )}
                    <td className="hidden px-3 py-1.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                      {tamanhoLegivel(a.tamanho)}
                    </td>
                    <td className="hidden px-3 py-1.5 text-muted-foreground md:table-cell">
                      <span className="block truncate">{dataLegivel(a.enviadoEm ?? a.modificadoEm)}</span>
                      {a.enviadoPor && (
                        <span className="block truncate text-[11px] text-muted-foreground/70">
                          por {a.enviadoPor}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {podeExcluirAqui && (
                        <Button
                          variant="soft-destructive"
                          size="icon-sm"
                          onClick={e => { e.stopPropagation(); onExcluir!({ id: a.id, fileName: a.nome }) }}
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

      {/* ── Divisória ──────────────────────────────────────────── */}
      {painelAberto && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar a pré-visualização"
          tabIndex={0}
          onMouseDown={e => { e.preventDefault(); setArrastando(true) }}
          // Teclado: quem não usa mouse também precisa ajustar. As setas movem
          // de 20 em 20 — grosso o bastante para chegar rápido, fino o bastante
          // para acertar.
          onKeyDown={e => {
            if (e.key === 'ArrowLeft') { e.preventDefault(); setLargura(l => Math.min(LARGURA_MAX, l + 20)) }
            if (e.key === 'ArrowRight') { e.preventDefault(); setLargura(l => Math.max(LARGURA_MIN, l - 20)) }
          }}
          className={cn(
            'hidden w-1.5 shrink-0 cursor-col-resize border-l border-border transition-colors lg:block',
            'hover:bg-muted focus:outline-none focus-visible:bg-muted',
            arrastando && 'bg-muted',
          )}
        />
      )}

      {/* ── Pré-visualização ───────────────────────────────────── */}
      {painelAberto && (
        <div
          className="hidden shrink-0 flex-col bg-muted/10 lg:flex"
          style={{ width: `${largura}px` }}
        >
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

                {!previewCarregando && previewUrl && previsualizavel && tipoSel === 'imagem' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt={arquivoSel.nome} className="max-h-full max-w-full object-contain" />
                )}

                {/* Planilha não vai em `<iframe>`: o navegador não a renderiza,
                    e nem o Drive nem o visualizador do Office servem aqui (um
                    exigiria acesso do navegador de quem olha à conta do
                    escritório; o outro, expor o arquivo publicamente). */}
                {!previewCarregando && previewUrl && tipoSel === 'planilha' && (
                  <PreviaDePlanilha url={previewUrl} nome={arquivoSel.nome} />
                )}

                {!previewCarregando && previewUrl && tipoSel === 'documento' && (
                  <PreviaDeDocumento url={previewUrl} />
                )}

                {!previewCarregando && previewUrl && previsualizavel
                  && tipoSel !== 'imagem' && tipoSel !== 'planilha' && tipoSel !== 'documento' && (
                  <iframe src={previewUrl} title={arquivoSel.nome} className="h-full w-full border-0" />
                )}

                {!previewCarregando && (!previewUrl || !previsualizavel) && (
                  <div className="flex flex-col items-center gap-2 text-center">
                    {/* Na pré-visualização o ícone é grande e sozinho: a cor
                        cheia dominaria o painel, então entra esmaecida. */}
                    <IconeArquivo nome={arquivoSel.nome} mime={arquivoSel.mimeType} className="h-10 w-10 opacity-60" />
                    <p className="px-4 text-[11px] text-muted-foreground">
                      Este tipo de arquivo não abre aqui. Use o botão abaixo.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 overflow-y-auto nice-scrollbar p-3">
                <div>
                  <p className="break-words text-[13px] font-semibold text-foreground">{arquivoSel.nome}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {arquivoSel.origem === 'DRIVE' ? 'Google Drive'
                      : arquivoSel.origem === 'CLIENTE' ? 'Enviado pelo cliente'
                      : 'Publicado pelo escritório'}
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
                  {arquivoSel.enviadoEm && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Enviado em</dt>
                      <dd className="tabular-nums text-foreground">{dataLegivel(arquivoSel.enviadoEm)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Enviado por</dt>
                    <dd className="min-w-0 truncate text-right text-foreground">
                      {/* "Fora do sistema" é informação, não lacuna: o arquivo
                          foi solto direto na pasta do Drive. */}
                      {arquivoSel.enviadoPor ?? 'fora do sistema'}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-col gap-1.5 pt-1">
                  {previewUrl && (
                    <Button variant="outline" size="sm" className="w-full gap-1.5" asChild>
                      <a href={previewUrl} target="_blank" rel="noopener noreferrer">
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
                  {podeExcluirAqui && (
                    <Button
                      variant="soft-destructive"
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => onExcluir!({ id: arquivoSel.id, fileName: arquivoSel.nome })}
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
