'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  NotebookPen, Plus, ChevronLeft, ChevronRight, Loader2, Paperclip,
  FileText, Download, Trash2, Pencil, Send, AlertCircle, Settings, Megaphone, EyeOff, FolderUp, X,
} from 'lucide-react'
import {
  Button, Card, Input, Label, cn,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Sheet, SheetContent, SheetTitle, SheetDescription,
  RichEditor, RichContent,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl, resolveAssetUrl } from '@/lib/api-url'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { useUrlPdf } from '../ferramentas/_components/baixar'
import { ImportarModal } from './_components/importar-modal'

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

/**
 * O navegador consegue mostrar este anexo numa moldura?
 *
 * HTML e PDF sim; Word e afins, não — para esses a tela oferece o download, em
 * vez de exibir uma moldura em branco que parece defeito.
 */
function previsualizavel(r: { arquivoNome?: string | null; arquivoMime?: string | null }): boolean {
  const nome = (r.arquivoNome ?? '').toLowerCase()
  const mime = (r.arquivoMime ?? '').toLowerCase()
  return /\.(html?|pdf)$/.test(nome) || mime.includes('html') || mime.includes('pdf')
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
  // Liderar a área já libera tudo — a sub-permissão é para quem NÃO lidera e
  // mesmo assim precisa da ação.
  const podeGerarPdf = isMaster || souLider || subPerms.gerar_pdf === true
  const podeEnviar = isMaster || souLider || subPerms.enviar_diretoria === true
  const podeConfigurar = isMaster || souLider || subPerms.gerenciar_config === true

  const hoje = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [relatorios, setRelatorios] = useState<RelatorioResumo[]>([])
  const [envios, setEnvios] = useState<Envio[]>([])
  const [equipe, setEquipe] = useState<Autor[]>([])
  const [carregando, setCarregando] = useState(true)

  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [doDia, setDoDia] = useState<RelatorioCompleto[]>([])
  const [carregandoDia, setCarregandoDia] = useState(false)
  /** Relatório aberto na coluna da direita. */
  const [selecionado, setSelecionado] = useState<RelatorioCompleto | null>(null)

  /** PDF consolidado do dia, quando gerado — vira link de download de verdade. */
  const [pdfDoDia, setPdfDoDia] = useState<{ nome: string; base64: string; naoIncluidos: string[] } | null>(null)
  const urlPdfDoDia = useUrlPdf(pdfDoDia)
  const [gerando, setGerando] = useState(false)
  const [enviando, setEnviando] = useState(false)

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

  const [enviosDoDia, setEnviosDoDia] = useState<Array<{ id: string; assunto: string; enviadoEm: string; destinatarios: string[] }>>([])

  const carregarEnvios = useCallback(async (data: string) => {
    try {
      setEnviosDoDia(await (trpc.relatorioTi as any).enviosDoDia.query({ data }) ?? [])
    } catch { setEnviosDoDia([]) }
  }, [])

  const carregarDia = useCallback(async (data: string) => {
    setCarregandoDia(true)
    try {
      const lista = await (trpc.relatorioTi as any).dia.query({ data }) ?? []
      setDoDia(lista)
      // Já abre o primeiro: o painel da direita vazio numa tela cheia parece
      // defeito, e quem abre o dia quer ler alguma coisa.
      setSelecionado(lista[0] ?? null)
    } catch {
      setDoDia([])
      setSelecionado(null)
    } finally {
      setCarregandoDia(false)
    }
  }, [])

  function abrirDia(data: string) {
    setDiaAberto(data)
    // O PDF é do dia anterior — deixar na tela levaria alguém a enviar o
    // consolidado errado.
    setPdfDoDia(null)
    void carregarDia(data)
    void carregarEnvios(data)
  }

  async function gerarPdf() {
    if (!diaAberto) return
    setGerando(true)
    try {
      const r = await (trpc.relatorioTi as any).consolidarDia.mutate({ data: diaAberto })
      setPdfDoDia(r)
      if (r.naoIncluidos?.length) {
        await alerts.warning(
          'Alguns ficaram de fora',
          `O PDF não absorve estes formatos:\n\n${r.naoIncluidos.join('\n')}`,
        )
      }
    } catch (e) {
      await alerts.error('Não foi possível gerar', (e as Error).message)
    } finally {
      setGerando(false)
    }
  }

  async function enviar() {
    if (!diaAberto) return
    const ok = await alerts.confirm({
      title: 'Enviar à diretoria?',
      text: 'O consolidado do dia vai por e-mail para os destinatários configurados.',
      icon: 'question',
      confirmText: 'Enviar',
    })
    if (!ok) return

    setEnviando(true)
    try {
      const r = await (trpc.relatorioTi as any).enviarDiretoria.mutate({ data: diaAberto })
      await alerts.success('Enviado', `Consolidado enviado para ${r.destinatarios.length} destinatário(s).`)
      await carregarMes()
      await carregarEnvios(diaAberto)
    } catch (e) {
      await alerts.error('Não foi possível enviar', (e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  // ── Novidades (curadoria) ──
  const podeCurar = isMaster || souLider || subPerms.curar_novidades === true

  const [novidadesOpen, setNovidadesOpen] = useState(false)
  const [novidades, setNovidades] = useState<Array<{
    id: string; titulo: string; descricao: string | null; tipo: string
    moduloSlug: string | null; ativo: boolean; publicadoEm: string
  }>>([])
  const [novModal, setNovModal] = useState<{ id?: string; relatorioId?: string } | null>(null)
  const [novTitulo, setNovTitulo] = useState('')
  const [novDescricao, setNovDescricao] = useState('')
  const [novTipo, setNovTipo] = useState('NOVO')
  const [novModulo, setNovModulo] = useState('')
  const [salvandoNov, setSalvandoNov] = useState(false)

  const carregarNovidades = useCallback(async () => {
    try {
      setNovidades(await (trpc.relatorioTi as any).novidades.query() ?? [])
    } catch { setNovidades([]) }
  }, [])

  /**
   * Abre a curadoria apontando para o relatorio de origem.
   *
   * O titulo entra sugerido, mas o texto e para ser reescrito: o que se escreve
   * para a diretoria nao e o que se escreve para quem so quer saber o que mudou
   * no sistema.
   */
  function curar(r: RelatorioCompleto) {
    setNovModal({ relatorioId: r.id })
    setNovTitulo(r.titulo)
    setNovDescricao('')
    setNovTipo('NOVO')
    setNovModulo('')
  }

  function editarNovidade(n: { id: string; titulo: string; descricao: string | null; tipo: string; moduloSlug: string | null }) {
    setNovModal({ id: n.id })
    setNovTitulo(n.titulo)
    setNovDescricao(n.descricao ?? '')
    setNovTipo(n.tipo)
    setNovModulo(n.moduloSlug ?? '')
  }

  async function salvarNovidade() {
    if (!novTitulo.trim()) { await alerts.warning('Novidade', 'Informe o titulo.'); return }
    setSalvandoNov(true)
    try {
      const base = {
        titulo: novTitulo.trim(),
        descricao: novDescricao.trim() || null,
        tipo: novTipo,
        moduloSlug: novModulo.trim().replace(/^[/]/, '') || null,
      }
      if (novModal?.id) {
        await (trpc.relatorioTi as any).atualizarNovidade.mutate({ id: novModal.id, ...base })
      } else {
        await (trpc.relatorioTi as any).publicarNovidade.mutate({ relatorioId: novModal?.relatorioId ?? null, ...base })
      }
      setNovModal(null)
      await carregarNovidades()
    } catch (e) {
      await alerts.error('Nao foi possivel salvar', (e as Error).message)
    } finally {
      setSalvandoNov(false)
    }
  }

  async function despublicar(id: string) {
    try {
      await (trpc.relatorioTi as any).despublicarNovidade.mutate({ id })
      await carregarNovidades()
    } catch (e) {
      await alerts.error('Nao foi possivel despublicar', (e as Error).message)
    }
  }

  // ── Importação do histórico ──
  const [importarOpen, setImportarOpen] = useState(false)
  const [pessoasImport, setPessoasImport] = useState<Array<{ id: string; name: string }>>([])

  async function abrirImportar() {
    try {
      setPessoasImport(await (trpc.user as any).listForSelect.query() ?? [])
    } catch { setPessoasImport([]) }
    setImportarOpen(true)
  }

  // ── Configuração ──
  const [configOpen, setConfigOpen] = useState(false)
  const [areas, setAreas] = useState<Array<{ id: string; name: string }>>([])
  const [usuarios, setUsuarios] = useState<Array<{ id: string; name: string; email: string }>>([])
  const [cfgAreaId, setCfgAreaId] = useState('')
  const [cfgDestIds, setCfgDestIds] = useState<string[]>([])
  const [cfgEmails, setCfgEmails] = useState('')
  const [cfgAssunto, setCfgAssunto] = useState('')
  const [salvandoCfg, setSalvandoCfg] = useState(false)

  async function abrirConfig() {
    setConfigOpen(true)
    try {
      const [cfg, as, us] = await Promise.all([
        (trpc.relatorioTi as any).config.query(),
        (trpc.area as any).listForSelect.query(),
        (trpc.user as any).listForSelect.query(),
      ])
      setAreas(as ?? [])
      setUsuarios(us ?? [])
      setCfgAreaId(cfg?.areaId ?? '')
      setCfgDestIds(cfg?.destinatariosIds ?? [])
      setCfgEmails((cfg?.destinatariosEmails ?? []).join(', '))
      setCfgAssunto(cfg?.assuntoPadrao ?? '')
    } catch { /* a tela abre vazia e a pessoa preenche */ }
  }

  async function salvarConfig() {
    setSalvandoCfg(true)
    try {
      await (trpc.relatorioTi as any).salvarConfig.mutate({
        areaId: cfgAreaId || null,
        destinatariosIds: cfgDestIds,
        destinatariosEmails: cfgEmails.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean),
        assuntoPadrao: cfgAssunto.trim() || null,
      })
      setConfigOpen(false)
      await carregarMes()
    } catch (e) {
      await alerts.error('Não foi possível salvar', (e as Error).message)
    } finally {
      setSalvandoCfg(false)
    }
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
          {podeCurar && (
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => { setNovidadesOpen(true); void carregarNovidades() }}>
              <Megaphone className="h-4 w-4" /> Novidades
            </Button>
          )}
          {podeConfigurar && (
            <Button variant="outline" size="sm" className="gap-1.5"
              title="Trazer para o sistema os relatórios que já existiam em pasta"
              onClick={abrirImportar}>
              <FolderUp className="h-4 w-4" /> Importar
            </Button>
          )}
          {podeConfigurar && (
            <Button variant="outline" size="icon-sm" title="Configurar equipe e destinatários"
              onClick={abrirConfig}>
              <Settings className="h-4 w-4" />
            </Button>
          )}
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
                  'group flex min-h-[124px] flex-col gap-1 border-b border-r border-border/50 p-2 text-left transition-colors',
                  doMes ? 'hover:bg-muted/40' : 'bg-muted/20 hover:bg-muted/30',
                  // Dia de outro mês fica apagado, mas NÃO invisível: o 31 de
                  // julho aparece na primeira linha de agosto, e esconder o que
                  // foi postado nele seria mentir sobre o histórico.
                  !doMes && 'text-muted-foreground/70',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] tabular-nums',
                    ehHoje ? 'font-bold text-white' : doMes ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )} style={ehHoje ? { backgroundColor: MODULE_COLOR } : undefined}>
                    {d.getDate()}
                  </span>
                  <span className="flex items-center gap-1">
                    {/* Selo de enviado: responde "o dia já foi repassado?". */}
                    {envio && (
                      <span title={`Enviado à diretoria em ${new Date(envio.enviadoEm).toLocaleString('pt-BR')}`}
                        className="inline-flex items-center rounded-full bg-emerald-100 p-1 dark:bg-emerald-900/40">
                        <Send className="h-2.5 w-2.5 text-emerald-700 dark:text-emerald-400" />
                      </span>
                    )}
                    {itens.length > 0 && (
                      <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {itens.length}
                      </span>
                    )}
                  </span>
                </div>

                {/* Uma linha por relatório, com avatar e título: dá para saber o
                    que tem no dia sem abri-lo. Só os avatares diziam quem, mas
                    não o quê. */}
                <div className="flex flex-col gap-0.5">
                  {itens.slice(0, 3).map(r => (
                    <span key={r.id} title={`${r.autor.name} — ${r.titulo}`}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10.5px] hover:bg-background">
                      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-[7px] font-bold">
                        {r.autor.image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={resolveAssetUrl(r.autor.image)} alt={r.autor.name} className="h-full w-full object-cover" />
                          : iniciais(r.autor.name)}
                      </span>
                      <span className="truncate">{r.autor.name.split(' ')[0]}</span>
                    </span>
                  ))}
                  {itens.length > 3 && (
                    <span className="px-1 text-[10px] text-muted-foreground">+{itens.length - 3} outros</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* ── Dia aberto ── */}
      {/* ── Dia aberto: lista à esquerda, prévia à direita ──
          Duas colunas porque a leitura aqui é comparativa: abre-se o dia para
          percorrer o que a equipe entregou, e voltar à lista a cada relatório
          quebraria justamente esse percurso. */}
      <Sheet open={!!diaAberto} onOpenChange={o => { if (!o) setDiaAberto(null) }}>
        <SheetContent side="right" size="xl" hideClose
          className="flex w-[80vw] max-w-[1280px] flex-col overflow-hidden p-0">
          <SheetTitle className="sr-only">Relatórios do dia</SheetTitle>
          <SheetDescription className="sr-only">
            Lista dos relatórios do dia, com a prévia do escolhido ao lado.
          </SheetDescription>

          {/* Faixa em gradiente da cor do módulo, como no detalhe do helpdesk —
              é o que diz, de relance, em que assunto a pessoa entrou. */}
          <div className="flex items-start gap-3 px-6 py-4 text-white"
            style={{ background: `linear-gradient(120deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 55%, #6366f1))` }}>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-[.14em] opacity-80">Relatórios da TI</p>
              <h2 className="truncate text-xl font-bold capitalize">
                {diaAberto && new Date(`${diaAberto}T12:00:00`).toLocaleDateString('pt-BR', {
                  weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                })}
              </h2>
              <p className="text-[12.5px] opacity-90">
                {doDia.length === 0 ? 'Nenhum relatório neste dia.'
                  : `${doDia.length} ${doDia.length === 1 ? 'relatório' : 'relatórios'}`}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {podePostar && diaAberto && (
                <Button variant="secondary" size="sm" className="gap-1.5"
                  onClick={() => { setDiaAberto(null); abrirNovo(diaAberto) }}>
                  <Plus className="h-4 w-4" /> Postar
                </Button>
              )}
              {podeGerarPdf && doDia.length > 0 && (
                pdfDoDia ? (
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a href={urlPdfDoDia} download={pdfDoDia.nome}>
                      <Download className="h-4 w-4" /> Baixar o PDF
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={gerarPdf} disabled={gerando}>
                    {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Gerar PDF
                  </Button>
                )
              )}
              {podeEnviar && doDia.length > 0 && (
                <Button variant="secondary" size="sm" className="gap-1.5"
                  onClick={enviar} disabled={enviando}>
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar à diretoria
                </Button>
              )}
              <button
                type="button"
                onClick={() => setDiaAberto(null)}
                aria-label="Fechar"
                className="rounded-md p-1.5 text-white/90 transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            {/* Coluna da esquerda — quem entregou o quê */}
            <div className="nice-scrollbar w-[330px] shrink-0 space-y-1.5 overflow-y-auto border-r border-border bg-muted/20 p-2.5">
              {enviosDoDia.length > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  {enviosDoDia.map(e => (
                    <p key={e.id} className="text-[11px] text-emerald-900 dark:text-emerald-300">
                      <Send className="mr-1 inline h-3 w-3" />
                      Enviado {new Date(e.enviadoEm).toLocaleString('pt-BR')} · {e.destinatarios.length} destinatário(s)
                    </p>
                  ))}
                </div>
              )}

              {carregandoDia ? (
                <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : doDia.length === 0 ? (
                <p className="py-10 text-center text-sm italic text-muted-foreground">
                  Ninguém postou neste dia.
                </p>
              ) : doDia.map(r => {
                const ativo = selecionado?.id === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelecionado(r)}
                    className={cn(
                      'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                      ativo ? 'border-transparent bg-background shadow-sm' : 'border-border/60 hover:bg-background/70',
                    )}
                    style={ativo ? { boxShadow: `0 0 0 2px ${MODULE_COLOR}` } : undefined}
                  >
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-bold">
                        {r.autor.image
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={resolveAssetUrl(r.autor.image)} alt={r.autor.name} className="h-full w-full object-cover" />
                          : iniciais(r.autor.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{r.titulo}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {r.autor.name} · {new Date(r.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                      {r.formato === 'ANEXO' && <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Coluna da direita — o conteúdo do escolhido */}
            <div className="flex min-w-0 flex-1 flex-col">
              {!selecionado ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                  <NotebookPen className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Escolha um relatório à esquerda para ler aqui.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">{selecionado.titulo}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {selecionado.autor.name}
                        {selecionado.arquivoNome ? ` · ${selecionado.arquivoNome}` : ''}
                        {selecionado.arquivoBytes ? ` · ${(selecionado.arquivoBytes / 1024).toFixed(0)} KB` : ''}
                      </p>
                    </div>
                    {selecionado.formato === 'ANEXO' && (
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <a href={`${getApiUrl()}/api/relatorios-ti/arquivo/${selecionado.id}`} target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" /> Nova aba
                        </a>
                      </Button>
                    )}
                    {podeCurar && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => curar(selecionado)}>
                        <Megaphone className="h-3.5 w-3.5" /> Virar novidade
                      </Button>
                    )}
                    {podePostar && (
                      <>
                        <Button variant="soft-info" size="icon-sm" onClick={() => abrirEdicao(selecionado)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => remover(selecionado)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>

                  {selecionado.formato === 'ESCRITO' ? (
                    <div className="nice-scrollbar flex-1 overflow-y-auto px-5 py-4">
                      <RichContent html={selecionado.conteudoHtml ?? ''} />
                    </div>
                  ) : previsualizavel(selecionado) ? (
                    /* O anexo é servido pela rota que confere a sessão, então a
                       prévia usa o próprio visualizador do navegador. */
                    <iframe
                      key={selecionado.id}
                      src={`${getApiUrl()}/api/relatorios-ti/arquivo/${selecionado.id}`}
                      title={selecionado.titulo}
                      className="flex-1 border-0 bg-white"
                    />
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Paperclip className="h-8 w-8 opacity-40" />
                      <p className="text-sm">Este formato não abre aqui dentro.</p>
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <a href={`${getApiUrl()}/api/relatorios-ti/arquivo/${selecionado.id}`} target="_blank" rel="noreferrer">
                          <Download className="h-3.5 w-3.5" /> Baixar
                        </a>
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

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

      {/* ── Novidades publicadas ── */}
      <Dialog open={novidadesOpen} onOpenChange={o => { if (!o) setNovidadesOpen(false) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeaderIcon icon={Megaphone} color="cyan">
            <DialogTitle>Novidades do painel</DialogTitle>
            <DialogDescription>
              O que os usuários veem no painel inicial. Sai do relatório, mas o texto é seu.
            </DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="nice-scrollbar max-h-[65vh] space-y-2 overflow-y-auto">
            {novidades.length === 0 ? (
              <p className="py-10 text-center text-sm italic text-muted-foreground">
                Nada publicado ainda. Abra um relatório e use &quot;Virar novidade&quot;.
              </p>
            ) : novidades.map(n => (
              <div key={n.id} className={cn(
                'flex items-start gap-3 rounded-lg border border-border px-3 py-2',
                !n.ativo && 'opacity-55',
              )}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                      {n.tipo === 'MELHORIA' ? 'Melhoria' : n.tipo === 'CORRECAO' ? 'Correção' : 'Novo'}
                    </span>
                    {n.moduloSlug && (
                      <span className="text-[11px] text-muted-foreground">/{n.moduloSlug}</span>
                    )}
                    {!n.ativo && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">despublicada</span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(n.publicadoEm).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] font-medium">{n.titulo}</p>
                  {n.descricao && (
                    <p className="line-clamp-2 text-[11.5px] text-muted-foreground">{n.descricao}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="soft-info" size="icon-sm" onClick={() => editarNovidade(n)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {n.ativo && (
                    <Button variant="outline" size="icon-sm" title="Tirar do painel"
                      onClick={() => despublicar(n.id)}>
                      <EyeOff className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNovidadesOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Publicar / editar novidade ── */}
      <Dialog open={!!novModal} onOpenChange={o => { if (!o && !salvandoNov) setNovModal(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Megaphone} color={novModal?.id ? 'sky' : 'emerald'}>
            <DialogTitle>{novModal?.id ? 'Editar novidade' : 'Publicar novidade'}</DialogTitle>
            <DialogDescription>
              Escreva para quem usa o sistema — não para a diretoria.
            </DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="space-y-4">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 space-y-1.5 sm:col-span-4">
                <Label className="text-[13px] font-semibold">Natureza</Label>
                <select value={novTipo} onChange={e => setNovTipo(e.target.value)}
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                  <option value="NOVO">Novo</option>
                  <option value="MELHORIA">Melhoria</option>
                  <option value="CORRECAO">Correção</option>
                </select>
              </div>
              <div className="col-span-12 space-y-1.5 sm:col-span-8">
                <Label className="text-[13px] font-semibold">Módulo (opcional)</Label>
                <Input value={novModulo} onChange={e => setNovModulo(e.target.value)}
                  placeholder="ex.: ferramentas-gerais" className="h-9 text-sm" />
                <p className="text-[11px] text-muted-foreground">
                  Com módulo, a novidade vira link — ler &quot;agora dá para dividir PDF&quot; e não
                  saber onde seria meio caminho.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Título *</Label>
              <Input value={novTitulo} onChange={e => setNovTitulo(e.target.value)}
                placeholder="Ex.: Agora dá para dividir um PDF" className="h-9 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Descrição</Label>
              <textarea value={novDescricao} onChange={e => setNovDescricao(e.target.value)}
                rows={4} placeholder="Uma ou duas frases, em linguagem de quem usa."
                className="nice-scrollbar w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              {/* Texto puro, e não editor rico: o widget é uma lista compacta, e
                  formatação ali viraria ruído. */}
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNovModal(null)} disabled={salvandoNov}>
              Cancelar
            </Button>
            <Button variant="success" size="sm" className="gap-1.5" onClick={salvarNovidade} disabled={salvandoNov}>
              {salvandoNov ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {novModal?.id ? 'Salvar' : 'Publicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {importarOpen && (
        <ImportarModal
          pessoas={pessoasImport}
          onClose={() => setImportarOpen(false)}
          onPronto={() => { void carregarMes() }}
        />
      )}

      {/* ── Configuração ── */}
      <Dialog open={configOpen} onOpenChange={o => { if (!o && !salvandoCfg) setConfigOpen(false) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeaderIcon icon={Settings} color="slate">
            <DialogTitle>Configurar</DialogTitle>
            <DialogDescription>
              De qual área é a equipe e para quem o consolidado é enviado.
            </DialogDescription>
          </DialogHeaderIcon>

          <DialogBody className="nice-scrollbar max-h-[65vh] space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Área da equipe</Label>
              <select value={cfgAreaId} onChange={e => setCfgAreaId(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">— nenhuma —</option>
                {areas.map(ar => <option key={ar.id} value={ar.id}>{ar.name}</option>)}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Quem está nesta área é cobrado pelo relatório diário, e quem a lidera comanda o
                painel — sem precisar de permissão marcada.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Diretoria (usuários)</Label>
              <div className="nice-scrollbar max-h-[180px] divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
                {usuarios.map(u => {
                  const marcado = cfgDestIds.includes(u.id)
                  return (
                    <label key={u.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-muted/30">
                      <input type="checkbox" checked={marcado} className="h-4 w-4"
                        onChange={() => setCfgDestIds(l => marcado ? l.filter(x => x !== u.id) : [...l, u.id])} />
                      <span className="flex-1 truncate text-[13px]">{u.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{u.email}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Outros e-mails</Label>
              <Input value={cfgEmails} onChange={e => setCfgEmails(e.target.value)}
                placeholder="para quem não é usuário do sistema, separado por vírgula"
                className="h-9 text-sm" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Assunto padrão</Label>
              <Input value={cfgAssunto} onChange={e => setCfgAssunto(e.target.value)}
                placeholder="Relatórios da TI — {data}" className="h-9 text-sm" />
              <p className="text-[11px] text-muted-foreground">
                <code className="rounded bg-muted px-1">{'{data}'}</code> é trocado pela data do dia enviado.
              </p>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(false)} disabled={salvandoCfg}>
              Cancelar
            </Button>
            <Button variant="success" size="sm" className="gap-1.5" onClick={salvarConfig} disabled={salvandoCfg}>
              {salvandoCfg && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
