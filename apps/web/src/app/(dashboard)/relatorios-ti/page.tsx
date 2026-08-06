'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  NotebookPen, Plus, ChevronLeft, ChevronRight, Loader2, Paperclip,
  FileText, Download, Trash2, Pencil, Send, AlertCircle,
} from 'lucide-react'
import {
  Button, Card, Input, Label, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { useUserPermissions } from '@/hooks/use-user-permissions'

const MODULE_COLOR = 'var(--mod-ti, #22d3ee)'

interface Autor { id: string; name: string; image?: string | null }

interface RelatorioResumo {
  id: string
  data: string
  titulo: string
  formato: 'ANEXO' | 'ESCRITO'
  criadoEm: string
  autor: Autor
}

interface RelatorioCompleto extends RelatorioResumo {
  conteudoHtml?: string | null
  arquivoNome?: string | null
  arquivoMime?: string | null
  arquivoBytes?: number | null
}

interface Envio { id: string; data: string; enviadoEm: string; destinatarios: string[] }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** AAAA-MM-DD do jeito local — `toISOString` empurraria para o dia anterior. */
function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A data vem do servidor como instante UTC de meia-noite; a parte da data é o que importa. */
function chaveDoRegistro(iso: string): string {
  return iso.slice(0, 10)
}

function iniciais(nome: string) {
  return (nome || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
}

/**
 * Relatórios diários da equipe.
 *
 * A tela principal é um calendário porque a pergunta que se faz aqui é sempre
 * sobre um dia: "quem já postou hoje?", "o que saiu na terça?". Uma lista
 * paginada responderia pior às duas.
 */
export default function RelatoriosTiPage() {
  const { isMaster, permissions } = useUserPermissions()
  const subPerms = (permissions.find(p => p.moduleSlug === 'relatorios-ti')?.subPermissions ?? {}) as Record<string, boolean>

  const [souLider, setSouLider] = useState(false)
  const podePostar = isMaster || souLider || subPerms.postar === true

  const hoje = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [relatorios, setRelatorios] = useState<RelatorioResumo[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [equipe, setEquipe] = useState<Autor[]>([])
  const [carregando, setCarregando] = useState(true)

  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [doDia, setDoDia] = useState<RelatorioCompleto[]>([])
  const [carregandoDia, setCarregandoDia] = useState(false)

  const carregarMes = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await (trpc.relatorioTi as any).mes.query({
        ano: cursor.getFullYear(), mes: cursor.getMonth() + 1,
      })
      setRelatorios(r?.relatorios ?? [])
      setEnvios(r?.envios ?? [])
      setEquipe(r?.equipe ?? [])
    } catch {
      setRelatorios([]); setEnvios([]); setEquipe([])
    } finally {
      setCarregando(false)
    }
  }, [cursor])

  useEffect(() => { void carregarMes() }, [carregarMes])
  useEffect(() => {
    ;(trpc.relatorioTi as any).souLider.query().then((v: boolean) => setSouLider(!!v)).catch(() => {})
  }, [])

  const carregarDia = useCallback(async (data: string) => {
    setCarregandoDia(true)
    try {
      setDoDia(await (trpc.relatorioTi as any).dia.query({ data }) ?? [])
    } catch {
      setDoDia([])
    } finally {
      setCarregandoDia(false)
    }
  }, [])

  function abrirDia(data: string) {
    setDiaAberto(data)
    void carregarDia(data)
  }

  // Índices por dia — o calendário desenha 42 células e não pode varrer a
  // lista inteira em cada uma.
  const porDia = useMemo(() => {
    const m = new Map<string, RelatorioResumo[]>()
    for (const r of relatorios) {
      const k = chaveDoRegistro(r.data)
      const arr = m.get(k) ?? []
      arr.push(r)
      m.set(k, arr)
    }
    return m
  }, [relatorios])

  const enviadosPorDia = useMemo(() => {
    const m = new Map<string, Envio>()
    for (const e of envios) m.set(chaveDoRegistro(e.data), e)
    return m
  }, [envios])

  const chaveHoje = chaveDia(hoje)
  const pendentesHoje = useMemo(() => {
    const postaram = new Set((porDia.get(chaveHoje) ?? []).map(r => r.autor.id))
    return equipe.filter(u => !postaram.has(u.id))
  }, [equipe, porDia, chaveHoje])

  // Grade do mês: começa no domingo da semana da primeira e vai até fechar
  // seis linhas — assim o calendário não muda de altura ao trocar de mês.
  const celulas = useMemo(() => {
    const primeiro = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const inicio = new Date(primeiro)
    inicio.setDate(1 - primeiro.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(inicio)
      d.setDate(inicio.getDate() + i)
      return d
    })
  }, [cursor])

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<RelatorioCompleto | null>(null)

  function abrirNovo(data?: string) {
    setEditando(null)
    setDataForm(data ?? chaveHoje)
    setTituloForm('')
    setFormatoForm('ANEXO')
    setConteudoForm('')
    setArquivoForm(null)
    setModalOpen(true)
  }

  function abrirEdicao(r: RelatorioCompleto) {
    setEditando(r)
    setDataForm(chaveDoRegistro(r.data))
    setTituloForm(r.titulo)
    setFormatoForm(r.formato)
    setConteudoForm(r.conteudoHtml ?? '')
    setArquivoForm(null)
    setModalOpen(true)
  }

  const [dataForm, setDataForm] = useState(chaveHoje)
  const [tituloForm, setTituloForm] = useState('')
  const [formatoForm, setFormatoForm] = useState<'ANEXO' | 'ESCRITO'>('ANEXO')
  const [conteudoForm, setConteudoForm] = useState('')
  const [arquivoForm, setArquivoForm] = useState<{ nome: string; base64: string; mime: string; bytes: number } | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function escolherArquivo(f: File | undefined) {
    if (!f) return
    const buffer = await f.arrayBuffer()
    const base64 = btoa(Array.from(new Uint8Array(buffer), b => String.fromCharCode(b)).join(''))
    setArquivoForm({ nome: f.name, base64, mime: f.type || 'application/octet-stream', bytes: f.size })
    if (!tituloForm.trim()) setTituloForm(f.name.replace(/\.[^.]+$/, ''))
  }

  async function salvar() {
    if (!tituloForm.trim()) { await alerts.warning('Relatório', 'Informe o título.'); return }
    setSalvando(true)
    try {
      const base = {
        data: dataForm,
        titulo: tituloForm.trim(),
        formato: formatoForm,
        conteudoHtml: formatoForm === 'ESCRITO' ? conteudoForm : null,
        ...(arquivoForm ? {
          arquivoNome: arquivoForm.nome, arquivoBase64: arquivoForm.base64, arquivoMime: arquivoForm.mime,
        } : {}),
      }
      if (editando) {
        await (trpc.relatorioTi as any).atualizar.mutate({ id: editando.id, ...base })
      } else {
        await (trpc.relatorioTi as any).criar.mutate(base)
      }
      setModalOpen(false)
      await carregarMes()
      if (diaAberto) await carregarDia(diaAberto)
    } catch (e) {
      await alerts.error('Não foi possível salvar', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function remover(r: RelatorioCompleto) {
    const ok = await alerts.confirm({
      title: 'Excluir o relatório?',
      text: `"${r.titulo}" sai do histórico. Novidades já publicadas a partir dele continuam no ar.`,
      icon: 'warning',
      confirmText: 'Excluir',
    })
    if (!ok) return
    try {
      await (trpc.relatorioTi as any).remover.mutate({ id: r.id })
      await carregarMes()
      if (diaAberto) await carregarDia(diaAberto)
    } catch (e) {
      await alerts.error('Não foi possível excluir', (e as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header inline — padrão dos módulos */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}
          >
            <NotebookPen className="h-6 w-6" />
          </div>
          <div>
            <h1>Relatórios da TI</h1>
            <p className="text-sm text-muted-foreground">
              O que a equipe entregou, dia a dia — e o que segue para a diretoria.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {podePostar && (
            <Button variant="success" size="sm" className="gap-1.5" onClick={() => abrirNovo()}>
              <Plus className="h-4 w-4" /> Postar relatório
            </Button>
          )}
        </div>
      </div>

      {/* Pendentes de hoje — a pergunta que o líder faz todo fim de tarde. */}
      {pendentesHoje.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-[13px] text-amber-900 dark:text-amber-300">
            Ainda sem relatório hoje:
          </span>
          {pendentesHoje.map(u => (
            <span key={u.id} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              {u.name}
            </span>
          ))}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        {/* Navegação do mês */}
        <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-4 py-3">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon-sm"
              onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm"
              onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <h2 className="ml-1 text-sm font-semibold capitalize">
              {MESES[cursor.getMonth()]} de {cursor.getFullYear()}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {carregando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Button variant="outline" size="sm"
              onClick={() => setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}>
              Hoje
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/40">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="px-2 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {celulas.map((d, i) => {
            const k = chaveDia(d)
            const doMes = d.getMonth() === cursor.getMonth()
            const itens = porDia.get(k) ?? []
            const envio = enviadosPorDia.get(k)
            const ehHoje = k === chaveHoje
            return (
              <button
                key={i}
                type="button"
                onClick={() => abrirDia(k)}
                className={cn(
                  'min-h-[92px] border-b border-r border-border/50 p-1.5 text-left transition-colors hover:bg-muted/30',
                  !doMes && 'bg-muted/20 opacity-50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums',
                    ehHoje ? 'font-bold text-white' : 'text-muted-foreground',
                  )} style={ehHoje ? { backgroundColor: MODULE_COLOR } : undefined}>
                    {d.getDate()}
                  </span>
                  {/* Selo de enviado: é o que responde "o dia já foi repassado?" */}
                  {envio && (
                    <span title={`Enviado à diretoria em ${new Date(envio.enviadoEm).toLocaleString('pt-BR')}`}>
                      <Send className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap gap-1">
                  {itens.slice(0, 4).map(r => (
                    <span key={r.id} title={`${r.autor.name} — ${r.titulo}`}
                      className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[8px] font-bold">
                      {r.autor.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={resolveAssetUrl(r.autor.image)} alt={r.autor.name} className="h-full w-full object-cover" />
                        : iniciais(r.autor.name)}
                    </span>
                  ))}
                  {itens.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{itens.length - 4}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ── Dia aberto ── */}
      <Dialog open={!!diaAberto} onOpenChange={o => { if (!o) setDiaAberto(null) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeaderIcon icon={NotebookPen} color="cyan">
            <DialogTitle>
              {diaAberto && new Date(`${diaAberto}T12:00:00`).toLocaleDateString('pt-BR', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
              })}
            </DialogTitle>
            <DialogDescription>
              {doDia.length === 0 ? 'Nenhum relatório neste dia.'
                : `${doDia.length} ${doDia.length === 1 ? 'relatório' : 'relatórios'}`}
            </DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="nice-scrollbar max-h-[65vh] space-y-3 overflow-y-auto">
            {carregandoDia ? (
              <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : doDia.length === 0 ? (
              <p className="py-10 text-center text-sm italic text-muted-foreground">
                Ninguém postou neste dia.
              </p>
            ) : doDia.map(r => (
              <div key={r.id} className="rounded-lg border border-border">
                <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/20 px-3 py-2">
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-bold">
                    {r.autor.image
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={resolveAssetUrl(r.autor.image)} alt={r.autor.name} className="h-full w-full object-cover" />
                      : iniciais(r.autor.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{r.titulo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {r.autor.name} · {new Date(r.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {r.formato === 'ANEXO' && (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <a href={`${getApiUrl()}/api/relatorios-ti/arquivo/${r.id}`} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5" /> Abrir
                      </a>
                    </Button>
                  )}
                  {podePostar && (
                    <>
                      <Button variant="soft-info" size="icon-sm" onClick={() => abrirEdicao(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="soft-destructive" size="icon-sm" onClick={() => remover(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>

                {r.formato === 'ESCRITO' ? (
                  <div className="px-3 py-2">
                    <RichContent html={r.conteudoHtml ?? ''} />
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    {r.arquivoNome}
                    {r.arquivoBytes ? ` · ${(r.arquivoBytes / 1024).toFixed(0)} KB` : ''}
                  </p>
                )}
              </div>
            ))}
          </DialogBody>

          <DialogFooter>
            {podePostar && diaAberto && (
              <Button variant="success" size="sm" className="gap-1.5"
                onClick={() => { setDiaAberto(null); abrirNovo(diaAberto) }}>
                <Plus className="h-4 w-4" /> Postar neste dia
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setDiaAberto(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Postar / editar ── */}
      <Dialog open={modalOpen} onOpenChange={o => { if (!o && !salvando) setModalOpen(false) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeaderIcon icon={NotebookPen} color={editando ? 'sky' : 'emerald'}>
            <DialogTitle>{editando ? 'Editar relatório' : 'Postar relatório'}</DialogTitle>
            <DialogDescription>
              Anexe o arquivo que você já gera, ou escreva aqui mesmo.
            </DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="nice-scrollbar max-h-[65vh] space-y-4 overflow-y-auto">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 space-y-1.5 sm:col-span-4">
                <Label className="text-[13px] font-semibold">Dia do relatório</Label>
                <Input type="date" value={dataForm} onChange={e => setDataForm(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="col-span-12 space-y-1.5 sm:col-span-8">
                <Label className="text-[13px] font-semibold">Título *</Label>
                <Input value={tituloForm} onChange={e => setTituloForm(e.target.value)}
                  placeholder="Ex.: Resumo do dia — infraestrutura" className="h-9 text-sm" />
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {([
                { v: 'ANEXO' as const, t: 'Anexar arquivo', d: 'O HTML que você já gera, um PDF, um Word.' },
                { v: 'ESCRITO' as const, t: 'Escrever aqui', d: 'Digite o relatório direto no painel.' },
              ]).map(o => (
                <button key={o.v} type="button" onClick={() => setFormatoForm(o.v)}
                  className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors',
                    formatoForm === o.v ? 'bg-muted/40' : 'border-border hover:bg-muted/20')}
                  style={formatoForm === o.v ? { borderColor: MODULE_COLOR } : undefined}>
                  <span className="block text-[13px] font-semibold">{o.t}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{o.d}</span>
                </button>
              ))}
            </div>

            {formatoForm === 'ANEXO' ? (
              <div className="space-y-2">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center hover:bg-muted/20">
                  <Paperclip className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {arquivoForm ? arquivoForm.nome : 'Clique para escolher o arquivo'}
                  </span>
                  <span className="text-[12px] text-muted-foreground">até 20 MB</span>
                  <input type="file" className="hidden"
                    onChange={e => { void escolherArquivo(e.target.files?.[0]); e.target.value = '' }} />
                </label>
                {editando?.arquivoNome && !arquivoForm && (
                  <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Atual: {editando.arquivoNome} — escolher outro arquivo substitui.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-[13px] font-semibold">Relatório</Label>
                <RichEditor value={conteudoForm} onChange={setConteudoForm}
                  placeholder="O que você entregou hoje..." />
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button variant="success" size="sm" className="gap-1.5" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {editando ? 'Salvar' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
