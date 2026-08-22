'use client'

import { useState, useRef } from 'react'
import { FolderUp, Loader2, Upload, X, AlertCircle } from 'lucide-react'
import {
  Button, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { TEXT } from '@/lib/color-styles'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Pessoa { id: string; name: string }

interface Achado {
  chave: string
  caminho: string
  data: string
  autorId: string
  /** O que foi lido do nome do arquivo — mostrado quando não casa com ninguém. */
  prefixo: string
  titulo: string
  formato: 'ANEXO' | 'ESCRITO'
  arquivoNome: string
  arquivoMime: string
  base64: string
  conteudoHtml?: string
}

/** Quantos sobem por chamada — lote grande estoura o limite do corpo da requisição. */
const LOTE = 10

/** `03-08-2026` (nome da pasta) vira `2026-08-03`. */
function dataDaPasta(nome: string): string | null {
  const m = nome.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** `resumo-2026-08-03` dentro do nome do arquivo. */
function dataDoArquivo(nome: string): string | null {
  const m = nome.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/**
 * Separa o nome de quem escreveu do resto do arquivo.
 *
 * O separador varia, porque os nomes v\u00eam de gente diferente: "WAGNER - resumo",
 * "BRUNO_resumo", "JOAO \u2013 relatorio", e o nome grudado em MAI\u00daSCULAS, como
 * "BRUNO-relatorio-gestao-contratos".
 *
 * Devolve os dois peda\u00e7os SEMPRE \u2014 mesmo quando o nome n\u00e3o casa com ningu\u00e9m do
 * cadastro, a tela precisa mostrar o que foi lido. Dizer "li BRUNO e n\u00e3o achei"
 * \u00e9 \u00fatil; deixar o campo mudo n\u00e3o \u00e9.
 */
function separarAutor(semExt: string): { prefixo: string; titulo: string } {
  // Separador com espa\u00e7o \u00e9 o mais confi\u00e1vel \u2014 trata primeiro.
  const comEspaco = semExt.match(/^(.{2,40}?)\s+[-\u2013\u2014_]\s+(.+)$/)
  if (comEspaco) return { prefixo: comEspaco[1]!.trim(), titulo: comEspaco[2]!.trim() }

  // Sublinhado sem espa\u00e7o: "BRUNO_resumo-2026".
  const sublinhado = semExt.match(/^([^_]{2,40})_(.+)$/)
  if (sublinhado) return { prefixo: sublinhado[1]!.trim(), titulo: sublinhado[2]!.trim() }

  // Nome grudado em mai\u00fasculas: "BRUNO-relatorio". S\u00f3 quando o primeiro peda\u00e7o
  // \u00e9 TODO mai\u00fasculo \u2014 sen\u00e3o "relatorio-gestao" viraria autor.
  const maiusculas = semExt.match(/^([A-Z\u00c0-\u00dd]{2,20})-(.+)$/)
  if (maiusculas) return { prefixo: maiusculas[1]!, titulo: maiusculas[2]!.trim() }

  return { prefixo: '', titulo: semExt.trim() }
}

/**
 * Casa o nome lido com algu\u00e9m do cadastro.
 *
 * Compara sem acento e sem caixa, contra QUALQUER peda\u00e7o do nome cadastrado \u2014
 * o arquivo pode trazer o primeiro nome ou o sobrenome. Sem um \u00fanico
 * candidato, devolve vazio: chutar entre dois hom\u00f4nimos poria o relat\u00f3rio na
 * conta da pessoa errada.
 */
function acharAutor(prefixo: string, pessoas: Pessoa[]): string {
  const alvo = semAcento(prefixo)
  if (!alvo) return ''

  const pedacos = (p: Pessoa) => semAcento(p.name).split(/\s+/)

  const exato = pessoas.filter(p => pedacos(p).includes(alvo))
  if (exato.length === 1) return exato[0]!.id

  const parecido = pessoas.filter(p => pedacos(p).some(t => t.startsWith(alvo) || alvo.startsWith(t)))
  return parecido.length === 1 ? parecido[0]!.id : ''
}

/**
 * Importa o histórico que já existia em pasta.
 *
 * A leitura é toda no navegador: escolhe-se a pasta e o sistema deduz data,
 * autor e título do próprio caminho — "03-08-2026/WAGNER - resumo-2026-08-03".
 * Deduzir, porém, não é adivinhar: tudo aparece numa prévia editável antes de
 * subir, e o que não casou com ninguém fica destacado esperando a escolha.
 */
export function ImportarModal({ pessoas, onClose, onPronto }: {
  pessoas: Pessoa[]
  onClose: () => void
  onPronto: () => void
}) {
  const [achados, setAchados] = useState<Achado[]>([])
  const [lendo, setLendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  async function aceitar(lista: FileList | null) {
    if (!lista?.length) return
    setLendo(true)
    try {
      const novos: Achado[] = []
      for (const f of Array.from(lista)) {
        if (!/\.(html?|pdf|docx?)$/i.test(f.name)) continue

        // webkitRelativePath = "RELATORIOS/03-08-2026/WAGNER - resumo.html"
        const caminho = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
        const partes = caminho.split('/')
        const pasta = partes.length > 1 ? partes[partes.length - 2]! : ''

        const data = dataDaPasta(pasta) ?? dataDoArquivo(f.name)
        if (!data) continue // sem data não há onde colocar no calendário

        const semExt = f.name.replace(/\.[^.]+$/, '')
        const { prefixo, titulo } = separarAutor(semExt)

        const buffer = await f.arrayBuffer()
        const base64 = btoa(Array.from(new Uint8Array(buffer), b => String.fromCharCode(b)).join(''))

        novos.push({
          chave: caminho,
          caminho,
          data,
          autorId: acharAutor(prefixo, pessoas),
          prefixo,
          titulo: titulo || semExt,
          formato: 'ANEXO',
          arquivoNome: f.name,
          arquivoMime: f.type || 'application/octet-stream',
          base64,
        })
      }

      novos.sort((a, b) => a.data.localeCompare(b.data) || a.caminho.localeCompare(b.caminho))
      setAchados(novos)
      if (novos.length === 0) {
        await alerts.warning('Nada encontrado', 'Nenhum arquivo com data reconhecível na pasta escolhida.')
      }
    } finally {
      setLendo(false)
    }
  }

  const semAutor = achados.filter(a => !a.autorId).length

  async function importar() {
    const prontos = achados.filter(a => a.autorId)
    if (prontos.length === 0) return

    setImportando(true)
    setProgresso(0)
    let importados = 0, repetidos = 0
    const falhas: string[] = []

    try {
      // Em lotes, e não tudo de uma vez: o corpo da requisição carrega os
      // arquivos em base64, e uma pasta de um mês estouraria o limite.
      for (let i = 0; i < prontos.length; i += LOTE) {
        const parte = prontos.slice(i, i + LOTE)
        const r = await (trpc.relatorioTi as any).importar.mutate({
          itens: parte.map(a => ({
            data: a.data,
            titulo: a.titulo,
            autorId: a.autorId,
            formato: a.formato,
            arquivoNome: a.arquivoNome,
            arquivoBase64: a.base64,
            arquivoMime: a.arquivoMime,
          })),
        })
        importados += r.importados
        repetidos += r.repetidos
        falhas.push(...(r.falhas ?? []))
        setProgresso(Math.min(i + LOTE, prontos.length))
      }

      await alerts.success(
        'Importação concluída',
        [
          `${importados} relatório(s) importado(s).`,
          repetidos > 0 ? `${repetidos} já estavam no sistema e foram pulados.` : '',
          falhas.length > 0 ? `${falhas.length} falharam:\n${falhas.slice(0, 5).join('\n')}` : '',
        ].filter(Boolean).join('\n\n'),
      )
      onPronto()
      onClose()
    } catch (e) {
      await alerts.error('Falha na importação', (e as Error).message)
    } finally {
      setImportando(false)
    }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o && !importando) onClose() }}>
      <DialogContent className="max-w-4xl">
        <DialogHeaderIcon icon={FolderUp} color="emerald">
          <DialogTitle>Importar relatórios</DialogTitle>
          <DialogDescription>
            Escolha a pasta com o histórico — data, autor e título saem do próprio caminho.
          </DialogDescription>
        </DialogHeaderIcon>

        <DialogBody className="nice-scrollbar max-h-[65vh] space-y-3 overflow-y-auto">
          <div
            onClick={() => !lendo && inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center hover:bg-muted/20"
          >
            {lendo ? (
              <>
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                <p className="text-sm font-medium">Lendo os arquivos…</p>
              </>
            ) : (
              <>
                <Upload className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para escolher a pasta</p>
                <p className="text-[12px] text-muted-foreground">
                  Ex.: <code className="rounded bg-muted px-1">D:\RELATORIOS</code> — as subpastas
                  por dia são lidas juntas
                </p>
              </>
            )}
            {/* webkitdirectory: o navegador entrega a pasta inteira, com o
                caminho relativo de cada arquivo — é dele que sai a data. */}
            <input
              ref={inputRef}
              type="file"
              multiple
              // @ts-expect-error — atributo não padronizado, suportado nos navegadores que usamos
              webkitdirectory=""
              directory=""
              className="hidden"
              onChange={e => { void aceitar(e.target.files); e.target.value = '' }}
            />
          </div>

          {/* Diz de onde vem a lista de autores: sem isso, quem não acha o
              colega procura o defeito no importador em vez da configuração. */}
          {achados.length > 0 && (
            <p className="text-[11.5px] text-muted-foreground">
              Autores oferecidos: <b>{pessoas.length}</b> pessoa(s) da equipe configurada.
              Falta alguém? Ajuste a área da equipe na engrenagem do módulo.
            </p>
          )}

          {semAutor > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
              <AlertCircle className={cn('mt-0.5 h-4 w-4 shrink-0', TEXT.amber)} />
              <p className="text-[12.5px] text-amber-900 dark:text-amber-300">
                <b>{semAutor}</b> arquivo(s) sem autor reconhecido. Escolha quem escreveu, ou
                remova da lista — eles não serão importados em branco.
              </p>
            </div>
          )}

          {achados.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full table-fixed">
                <thead>
                  <tr className="bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="w-[96px] px-3 py-2">Dia</th>
                    <th className="w-[210px] px-3 py-2">Autor</th>
                    <th className="px-3 py-2">Título</th>
                    <th className="w-[44px] px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {achados.map(a => (
                    <tr key={a.chave} className={cn(!a.autorId && 'bg-amber-50/40 dark:bg-amber-950/10')}>
                      <td className="px-3 py-2 align-top text-[12.5px] tabular-nums">
                        {a.data.split('-').reverse().join('/')}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={a.autorId}
                          onChange={e => setAchados(l => l.map(x =>
                            x.chave === a.chave ? { ...x, autorId: e.target.value } : x))}
                          className={cn('h-9 w-full rounded-md border bg-background px-2 text-sm',
                            a.autorId ? 'border-border' : 'border-amber-400')}
                        >
                          <option value="">— escolha —</option>
                          {pessoas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {/* Sem casar, diz o que LEU — "não reconheci" sozinho
                            deixa a pessoa sem saber se o problema é o arquivo
                            ou o cadastro. */}
                        {!a.autorId && (
                          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                            {a.prefixo ? <>li &quot;<b>{a.prefixo}</b>&quot;</> : 'sem nome no arquivo'}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <input
                          value={a.titulo}
                          onChange={e => setAchados(l => l.map(x =>
                            x.chave === a.chave ? { ...x, titulo: e.target.value } : x))}
                          className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                        />
                        {/* O caminho de origem embaixo: dois arquivos podem gerar
                            o mesmo título, e sem ele as linhas ficam idênticas. */}
                        <p className="mt-1 truncate text-[11px] text-muted-foreground" title={a.caminho}>
                          {a.caminho}
                        </p>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <button type="button" title="Tirar da lista"
                          onClick={() => setAchados(l => l.filter(x => x.chave !== a.chave))}
                          className="mt-2 text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importando && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px] text-muted-foreground">
                <span>Importando…</span>
                <span className="tabular-nums">{progresso} de {achados.filter(a => a.autorId).length}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                  style={{ width: `${(progresso / Math.max(1, achados.filter(a => a.autorId).length)) * 100}%` }} />
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={importando}>Fechar</Button>
          <Button variant="success" size="sm" className="gap-1.5" onClick={importar}
            disabled={importando || achados.filter(a => a.autorId).length === 0}>
            {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />}
            Importar {achados.filter(a => a.autorId).length > 0 ? `(${achados.filter(a => a.autorId).length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
