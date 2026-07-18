'use client'

import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, Save, Upload, Plus, Trash2, Loader2, Info, Image as ImageIcon,
  Tag, Columns3, ArrowLeftRight, Network, HelpCircle, ArrowLeft, ArrowRight, History, Landmark, AlertTriangle, X, type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@saas/ui'
import { cn } from '@saas/ui'
import type { TreatmentDefinition, Direcao } from '@saas/types'
import { EMPTY_TREATMENT_DEFINITION, stableStringify, formatValorExibicao, extrairMarcadorDC, matchPalavraChaveIndex } from '@saas/types'
import { normalizeDefinition } from '../treatment-definition'
import { DetectedRowsStatus } from '../detected-rows-status'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { fileToBase64 } from '@/lib/file'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { VersionHistoryDialog } from '../version-history-dialog'

import type { PreviewData, Props } from './types'
import { extractClient } from '../../lib/extract-client'
import { MAP_FIELDS } from './types'
import { soDigitos, listaResumo, serializeForm, confirmarSaidaSemSalvar, esc } from './utils'
import { StepHeader, EmptyHint, Stepper, ModeCards, ColumnSelect, FloatingActionBar, HelpTip } from './ui'
import { DebitoCreditoColunaMap } from './sections/debito-credito'
import { ContasCorrentesMap } from './sections/contas-correntes'
import { ContrapartidaPalavraChave, ContrapartidaDescricao } from './sections/contrapartida'

// <style> injetado no html dos alertas para corrigir o word-break do título — é
// um <h2> e herda o `word-break: break-all` global, que o quebra no meio da
// palavra. Vive só enquanto o alerta está aberto (sem tocar no globals).
const SWAL_TITLE_FIX = '<style>.swal2-title{word-break:normal;overflow-wrap:break-word}</style>'

// Campo "CNPJ/CPF do participante" do De/Para. Diferente dos demais: o dado pode
// vir de uma COLUNA do arquivo OU de um VALOR FIXO (alternativas exclusivas). O
// valor fixo atende importações de extrato bancário, onde esse dado não vem no
// arquivo mas precisa ser informado. Trocar de modo limpa o outro (exclusividade).
function CampoDocumento({
  headers, coluna, fixo, foraCol, samples, ativo, onAtivoChange, onColuna, onFixo,
}: {
  headers: string[]
  coluna: string
  fixo: string
  foraCol?: string
  samples: string[]
  ativo: boolean
  onAtivoChange: (v: boolean) => void
  onColuna: (v: string) => void
  onFixo: (v: string) => void
}) {
  // Trocar de modo limpa o outro (coluna e valor fixo são exclusivos).
  const toggle = (v: boolean) => { if (v) { onColuna(''); onAtivoChange(true) } else { onFixo(''); onAtivoChange(false) } }
  return (
    <div className="space-y-1.5">
      <div className="relative mb-0">
        <Label className="text-[13px] font-semibold">CNPJ/CPF do participante {ativo && <span className="text-destructive">*</span>}</Label>
        <label className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-muted-foreground cursor-pointer">
          Valor fixo
          <HelpTip text="Use apenas em importações de extrato bancário, em que o CNPJ/CPF não vem no arquivo mas precisa ser informado. O mesmo valor será usado em todos os lançamentos." />
          <Checkbox checked={ativo} onCheckedChange={(v) => toggle(!!v)} />
        </label>
      </div>
      {ativo ? (
        <Input className="h-9 text-sm" placeholder="Digite o CNPJ/CPF..." value={fixo} onChange={(e) => onFixo(e.target.value)} />
      ) : (
        <>
          <ColumnSelect headers={headers} value={coluna} optional onChange={onColuna}
            className={foraCol ? 'border-amber-400 ring-1 ring-amber-400/40' : undefined} />
          {foraCol && (
            <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" /> A coluna &quot;{foraCol}&quot; não está no arquivo enviado.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">Opcional — pré-selecionado se houver coluna &quot;CNPJ&quot;.</p>
          {samples.length > 0 && (
            <div className="text-[11px] text-muted-foreground/80">
              <span className="font-medium">Prévia de dados:</span>
              {samples.map((s, i) => <div key={i} className="truncate">{s}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function ModelEditor({ mode, modelId, backTo }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  // Destino de "Voltar"/"Salvar": a origem (?from=), restrita ao módulo; senão a lista.
  const backHref = backTo && backTo.startsWith('/tratamento-lancamentos') ? backTo : '/tratamento-lancamentos/modelos'

  // Criar/editar Modelo exige a sub-permissão "gerenciar_modelos".
  const { isMaster, isEmpresaMaster, permissions, loading: permsLoading } = useUserPermissions()
  const canManage =
    isMaster || isEmpresaMaster ||
    permissions.find((p) => p.moduleSlug === 'tratamento-lancamentos')?.subPermissions?.['gerenciar_modelos'] === true

  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Dados de identificação do Modelo. (Conta corrente vive na definição —
  // etapa "Contas correntes" — pois pode ser única ou múltipla.)
  const [nome, setNome] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [note, setNote] = useState('')

  // Corpo do Modelo (definição) + arquivo-exemplo (preview).
  const [def, setDef] = useState<TreatmentDefinition>(EMPTY_TREATMENT_DEFINITION)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  // "Valor fixo" do CNPJ/CPF ativo (modo do CampoDocumento). Não persiste: deriva
  // do documentoFixo ao carregar; enquanto ativo, o valor é obrigatório.
  const [docFixoAtivo, setDocFixoAtivo] = useState(false)

  // Detecção de alterações não salvas.
  const baselineRef = useRef<string>('')
  const dirtyRef = useRef(false)

  // Arquivo-exemplo vindo do fluxo principal — guardado p/ devolver na volta
  // (reaproveitar o arquivo + pré-selecionar o modelo criado no fluxo principal).
  const exemploRef = useRef<{ fileBase64: string; filename: string } | null>(null)

  // Wizard (apenas no modo criação): etapa atual e etapa máxima já alcançada.
  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)

  // Histórico de versões (modo edição). `reloadNonce` força recarregar o modelo
  // após restaurar uma versão.
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)

  // "Modo revisão" (#2): ligado quando o editor é aberto a partir de uma pendência
  // de modelo (flag `tl:revisar`). Realça as seções/campos com pendência e rola
  // até a primeira. O realce some ao vivo conforme o usuário corrige.
  const [modoRevisao, setModoRevisao] = useState(false)
  const revScrolledRef = useRef(false)

  // ---- Carrega o modelo (modo edição) -------------------------------------
  useEffect(() => {
    if (mode !== 'edit' || !modelId) return
    let active = true
    ;(async () => {
      try {
        const m = await trpc.tratamentoLancamentos.getById.query({ id: modelId })
        if (!active) return
        const loadedDef = m.definition ? normalizeDefinition(m.definition) : EMPTY_TREATMENT_DEFINITION
        setNome(m.nome)
        setIsActive(m.isActive)
        setDef(loadedDef)
        setDocFixoAtivo(!!loadedDef.columnMapping.documentoFixo)
        baselineRef.current = serializeForm(m.nome, m.isActive, loadedDef)
      } catch {
        alerts.error('Erro', 'Não foi possível carregar o Modelo.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [mode, modelId, reloadNonce])

  // Baseline do modo criação (parte do estado vazio).
  useEffect(() => {
    if (mode === 'create') baselineRef.current = serializeForm('', true, EMPTY_TREATMENT_DEFINITION)
  }, [mode])

  // A cada mudança de etapa do wizard, volta ao topo da página (a etapa de
  // revisão, mais longa, vinha começando scrollada pra baixo).
  useEffect(() => {
    if (mode === 'create') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [mode, step])

  // Reaproveita o arquivo-exemplo enviado no fluxo principal (criação ou edição).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('tl:exemplo')
      if (!raw) return
      sessionStorage.removeItem('tl:exemplo')
      const parsed = JSON.parse(raw) as { fileBase64?: string; filename?: string }
      if (parsed.fileBase64 && parsed.filename) {
        // Guarda p/ devolver ao fluxo principal na volta (reaproveitar o arquivo).
        exemploRef.current = { fileBase64: parsed.fileBase64, filename: parsed.filename }
        // Arquivo já vem carregado na 1ª etapa ("Dados do Modelo"); o usuário
        // ainda precisa informar o nome, então não pulamos a etapa.
        void loadPreview(parsed.fileBase64, parsed.filename)
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Abriu a partir de uma pendência de modelo → entra em "modo revisão".
  useEffect(() => {
    if (mode !== 'edit') return
    try {
      if (sessionStorage.getItem('tl:revisar')) {
        sessionStorage.removeItem('tl:revisar')
        setModoRevisao(true)
      }
    } catch { /* ignore */ }
  }, [mode])

  // Avisa ao fechar/atualizar a aba com alterações não salvas.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Guarda o botão "voltar" do navegador (SPA não dispara beforeunload nele).
  // Um estado-sentinela intercepta o 1º "voltar": o popstate cai aqui, com a
  // página ainda montada. Sem alterações → sai; com alterações → confirma antes.
  // A saída real usa o router (mesmo destino do botão Sair/Voltar) — mexer no
  // histórico à mão (history.back/go) é frágil com o App Router e engolia o
  // clique; e passar `null` no pushState zerava o state do Next (quebrava
  // título/ícone da aba).
  useEffect(() => {
    let leaving = false
    // Preserva o state do Next no sentinela (não passar null).
    const primeSentinel = () => window.history.pushState(window.history.state, '', window.location.href)
    primeSentinel()
    async function onPopState() {
      if (leaving) return
      if (!dirtyRef.current) {
        leaving = true
        window.removeEventListener('popstate', onPopState)
        router.push(backHref)
        return
      }
      const ok = await confirmarSaidaSemSalvar()
      if (ok) {
        leaving = true
        window.removeEventListener('popstate', onPopState)
        router.push(backHref)
      } else {
        // Cancelou: re-arma o sentinela para continuar guardando.
        primeSentinel()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Colunas disponíveis: do arquivo enviado, ou derivadas da definição salva.
  const headers = useMemo<string[]>(() => {
    if (preview) return preview.headers
    const fromDef = new Set<string>()
    // `documentoFixo` é um valor literal (CNPJ/CPF), não um nome de coluna — fora daqui.
    Object.entries(def.columnMapping).forEach(([k, v]) => { if (v && k !== 'documentoFixo') fromDef.add(v) })
    if (def.debitoCredito.tipo === 'COLUNA' && def.debitoCredito.coluna) fromDef.add(def.debitoCredito.coluna)
    if (def.contasCorrentes.modo === 'MULTIPLAS' && def.contasCorrentes.coluna) fromDef.add(def.contasCorrentes.coluna)
    return [...fromDef]
  }, [preview, def])

  const getDistinct = useCallback((column: string): string[] => {
    if (!preview || !column) return []
    const set = new Set<string>()
    for (const row of preview.rows) {
      const v = row[column]
      const s = v === null || v === undefined ? '' : String(v).trim()
      if (s) set.add(s)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [preview])

  const samplesFor = useCallback((column: string): string[] => {
    if (!preview || !column) return []
    return preview.rows.slice(0, 3)
      .map((r) => { const v = r[column]; return v === null || v === undefined ? '' : String(v) })
      .filter(Boolean)
  }, [preview])

  // Descrições distintas do arquivo + nº de linhas de cada uma (base do painel de
  // correspondência, modo palavra-chave). Brancos ficam FORA (viram pendência de
  // valor vazio, não de contrapartida). `totalLinhas` é o denominador da cobertura.
  const descricaoColuna = def.columnMapping.descricao || ''
  const correspondencia = useMemo(() => {
    if (!preview || !descricaoColuna) return { descricoes: [] as Array<{ descricao: string; count: number }>, totalLinhas: 0 }
    const map = new Map<string, number>()
    let total = 0
    for (const row of preview.rows) {
      const v = row[descricaoColuna]
      const s = v === null || v === undefined ? '' : String(v).trim()
      if (!s) continue
      total++
      map.set(s, (map.get(s) ?? 0) + 1)
    }
    return { descricoes: [...map.entries()].map(([descricao, count]) => ({ descricao, count })), totalLinhas: total }
  }, [preview, descricaoColuna])

  // Cobertura no modo palavra-chave: existe alguma descrição do arquivo que NENHUMA
  // palavra-chave pega (→ CONTA_NAO_MAPEADA na conversão)? Memo no topo (regras de
  // hooks) — recomputa só quando palavra-chave/descrições mudam, não a cada render;
  // `some` corta no primeiro faltante (barato). Lido por probContrapartida (Salvar,
  // avançar etapa e destaque de revisão), fresco no clique.
  const temSemCorrespPC = useMemo(() => {
    if (def.contrapartida.modo !== 'PALAVRA_CHAVE' || correspondencia.totalLinhas === 0) return false
    const itens = def.contrapartida.palavraChave
    return correspondencia.descricoes.some((d) => matchPalavraChaveIndex(d.descricao, itens) < 0)
  }, [def.contrapartida.modo, def.contrapartida.palavraChave, correspondencia])

  // ---- Upload do arquivo-exemplo ------------------------------------------
  async function loadPreview(base64: string, filename: string) {
    setUploading(true)
    // TROCAR o arquivo durante a CRIAÇÃO reseta as descrições lidas do arquivo
    // anterior: o modelo em criação parte do zero com o novo arquivo (não é
    // cumulativo). Na EDIÇÃO NÃO reseta — o modelo é cumulativo e mantém as
    // descrições já mapeadas (a lista é reconstruída/mesclada em ContrapartidaDescricao).
    // `preview` != null aqui só na 2ª chamada em diante = uma troca de arquivo.
    const trocaNaCriacao = mode === 'create' && !!preview
    try {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const table = await extractClient(new File([bytes], filename))
      const res: PreviewData = { headers: table.headers, rows: table.rows, totalRows: table.rows.length, truncated: false }
      if (trocaNaCriacao) {
        setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, descricao: [] } }))
      }
      setPreview(res)
      setFileName(filename)
      // NÃO descartamos mais as colunas ausentes no novo arquivo: mantemos a
      // seleção e sinalizamos em âmbar no campo (ver `colunasForaDoArquivo` + o
      // aviso ao salvar), para o usuário perceber a divergência em vez de perder o
      // mapeamento silenciosamente.
      // Pré-seleção automática da coluna de CNPJ (sem sobrescrever escolha existente).
      const cnpjCol = res.headers.find((h) => /cnpj/i.test(h))
      if (cnpjCol) setDef((d) => (d.columnMapping.documento ? d : { ...d, columnMapping: { ...d.columnMapping, documento: cnpjCol } }))
    } catch {
      alerts.error('Falha ao ler o arquivo', 'Não foi possível detectar uma tabela de lançamentos no arquivo.')
    } finally {
      setUploading(false)
    }
  }

  async function handleFile(file: File) {
    const base64 = await fileToBase64(file)
    await loadPreview(base64, file.name)
  }

  // ---- Updaters da definição ----------------------------------------------
  // Item 3: a coluna de Valor tem sinais (marcador C/CD/D/DB ou valor negativo)?
  function colunaTemSinais(coluna: string): boolean {
    if (!preview || !coluna) return false
    for (const row of preview.rows) {
      const raw = row[coluna]
      const s = raw === null || raw === undefined ? '' : String(raw).trim()
      if (!s) continue
      if (extrairMarcadorDC(s).direcao !== null) return true      // marcador C/CD/D/DB
      if (/(^|[\s(])-\s*(R\$\s*)?\d/.test(s)) return true          // valor negativo
    }
    return false
  }

  function setMap(key: keyof TreatmentDefinition['columnMapping'], value: string) {
    setDef((d) => {
      const columnMapping = { ...d.columnMapping, [key]: value }
      // Ao escolher a coluna de Valor com sinais, e com o D/C ainda NÃO configurado
      // (modo padrão COLUNA, sem coluna/mapa), pré-seleciona "Pelo sinal do valor".
      const dc = d.debitoCredito
      const preSelSinal = key === 'valor' && !!value && colunaTemSinais(value)
        && dc.tipo === 'COLUNA' && !dc.coluna.trim() && dc.mapa.length === 0
      return { ...d, columnMapping, debitoCredito: preSelSinal ? { ...dc, tipo: 'SINAL' } : dc }
    })
  }

  // Troca só o tipo — mantém coluna+mapa (persistido), p/ não perder ao reverter.
  function setDcTipo(tipo: 'COLUNA' | 'DESCRICAO' | 'SINAL') {
    setDef((d) => ({ ...d, debitoCredito: { ...d.debitoCredito, tipo } }))
  }

  function setDcColuna(coluna: string) {
    setDef((d) => ({ ...d, debitoCredito: { ...d.debitoCredito, coluna } }))
  }

  // Contas correntes: troca só o modo/única/coluna — mantém o resto (persistido).
  function setCcModo(modo: 'UNICA' | 'MULTIPLAS') {
    setDef((d) => ({ ...d, contasCorrentes: { ...d.contasCorrentes, modo } }))
  }
  function setCcUnica(unica: string) {
    setDef((d) => ({ ...d, contasCorrentes: { ...d.contasCorrentes, unica } }))
  }
  function setCcColuna(coluna: string) {
    setDef((d) => ({ ...d, contasCorrentes: { ...d.contasCorrentes, coluna } }))
  }

  // Troca só o modo ativo — mantém o conteúdo dos DOIS modos (persistido).
  function setCpModo(modo: 'PALAVRA_CHAVE' | 'DESCRICAO') {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, modo } }))
  }

  const dcByDescricao = def.debitoCredito.tipo === 'DESCRICAO'

  async function handleBack() {
    if (dirtyRef.current) {
      const ok = await confirmarSaidaSemSalvar()
      if (!ok) return
    }
    router.push(backHref)
  }

  // ---- Validação por etapa (reutilizada no wizard e no salvar) ------------
  function probDados(): string[] {
    const p: string[] = []
    if (!nome.trim() || nome.trim().length < 2) p.push('Informe um <b>nome</b> para o modelo (mínimo 2 caracteres).')
    return p
  }
  function probArquivo(): string[] {
    // `preview` só existe quando um arquivo foi enviado e a tabela foi lida.
    return preview ? [] : ['Envie um <b>arquivo de exemplo</b> para continuar.']
  }
  function probDePara(): string[] {
    const p: string[] = []
    if (!def.columnMapping.descricao) p.push('Em <b>De/Para de colunas</b>, mapeie a coluna de <b>Descrição do lançamento</b>.')
    if (!def.columnMapping.valor) p.push('Em <b>De/Para de colunas</b>, mapeie a coluna de <b>Valor</b>.')
    if (!def.columnMapping.data) p.push('Em <b>De/Para de colunas</b>, mapeie a coluna de <b>Data</b>.')
    if (docFixoAtivo && !def.columnMapping.documentoFixo?.trim()) p.push('Em <b>De/Para de colunas</b>, informe o <b>CNPJ/CPF do participante</b> (valor fixo) ou desmarque a opção.')
    return p
  }
  function probContasCorrentes(): string[] {
    const p: string[] = []
    const cc = def.contasCorrentes
    if (cc.modo === 'UNICA') {
      if (!cc.unica.trim()) p.push('Em <b>Contas correntes</b>, informe o número da <b>conta corrente</b>.')
    } else {
      if (!cc.coluna.trim()) {
        p.push('Em <b>Contas correntes</b>, selecione a <b>coluna</b> que identifica a conta corrente.')
      } else {
        const distinct = getDistinct(cc.coluna)
        const mapped = new Set(cc.mapa.filter((m) => m.conta.trim()).map((m) => m.valor))
        if (distinct.length) {
          const faltam = distinct.filter((v) => !mapped.has(v))
          if (faltam.length) p.push(`Em <b>Contas correntes</b>, informe a conta corrente ${faltam.length === 1 ? 'do valor' : 'dos valores'}: ${listaResumo(faltam)}.`)
        } else if (mapped.size === 0) {
          p.push('Em <b>Contas correntes</b>, informe as contas dos valores da coluna (envie o arquivo de exemplo para listá-los).')
        }
      }
    }
    return p
  }
  function probDC(): string[] {
    const p: string[] = []
    if (def.debitoCredito.tipo === 'COLUNA') {
      if (!def.debitoCredito.coluna.trim()) {
        p.push('Em <b>Débito/Crédito</b>, selecione a <b>coluna</b> que define débito ou crédito.')
      } else {
        const distinct = getDistinct(def.debitoCredito.coluna)
        const mapped = new Set(def.debitoCredito.mapa.map((m) => m.valor))
        if (distinct.length) {
          const faltam = distinct.filter((v) => !mapped.has(v))
          if (faltam.length) p.push(`Em <b>Débito/Crédito</b>, defina a direção ${faltam.length === 1 ? 'do valor' : 'dos valores'}: ${listaResumo(faltam)}.`)
        } else if (mapped.size === 0) {
          p.push('Em <b>Débito/Crédito</b>, defina a direção dos valores da coluna (envie o arquivo de exemplo para listá-los).')
        }
      }
    }
    return p
  }
  function probContrapartida(): string[] {
    const p: string[] = []
    if (def.contrapartida.modo === 'PALAVRA_CHAVE') {
      const itens = def.contrapartida.palavraChave
      if (!itens.length) {
        p.push('Em <b>Contrapartida</b> (por palavra-chave), adicione ao menos um item.')
      } else {
        // Itens "Pular linha" dispensam conta/direção (não viram lançamento); mas
        // ainda precisam da palavra-chave (é o que casa a linha a pular).
        const semPalavra = itens.filter((it) => !it.palavraChave.trim()).length
        const semConta = itens.filter((it) => !it.pular && !it.conta.trim()).length
        if (semPalavra) p.push(`Em <b>Contrapartida</b>, preencha a <b>palavra-chave</b> em ${semPalavra} ${semPalavra === 1 ? 'item' : 'itens'}.`)
        if (semConta) p.push(`Em <b>Contrapartida</b>, informe a <b>conta de contrapartida</b> em ${semConta} ${semConta === 1 ? 'item' : 'itens'}.`)
        if (dcByDescricao) {
          const semDir = itens.filter((it) => !it.pular && !it.direcao).length
          if (semDir) p.push(`Em <b>Contrapartida</b>, defina <b>Débito/Crédito</b> em ${semDir} ${semDir === 1 ? 'item' : 'itens'}.`)
        }
        // Cobertura: descrições que nenhuma palavra-chave pega viram CONTA_NAO_MAPEADA
        // na conversão (booleano memoizado no topo).
        if (temSemCorrespPC) p.push('Em <b>Contrapartida</b>, adicione correspondências para os lançamentos ainda não correspondidos.')
      }
    } else {
      const itens = def.contrapartida.descricao
      if (!itens.length) {
        p.push('Em <b>Contrapartida</b> (por descrição), envie o arquivo de exemplo e mapeie a coluna de descrição para listar as descrições.')
      } else {
        const semConta = itens.filter((it) => !it.pular && !it.conta.trim())
        if (semConta.length) p.push(`Em <b>Contrapartida</b>, informe a <b>conta de contrapartida</b> ${semConta.length === 1 ? 'da descrição' : 'das descrições'}: ${listaResumo(semConta.map((it) => it.descricao))}.`)
        if (dcByDescricao) {
          const semDir = itens.filter((it) => !it.pular && !it.direcao).length
          if (semDir) p.push(`Em <b>Contrapartida</b>, defina <b>Débito/Crédito</b> em ${semDir} ${semDir === 1 ? 'descrição' : 'descrições'}.`)
        }
      }
    }
    return p
  }

  // Em modo revisão (com o arquivo já lido), rola até a 1ª seção com pendência
  // (de modelo, vermelho) ou coluna ausente no arquivo (âmbar). Espera o
  // `preview`, pois as pendências dependem dos valores distintos.
  useEffect(() => {
    if (!modoRevisao || revScrolledRef.current || !preview) return
    const fora = colunasForaDoArquivo(def, preview.headers)
    const secoes: Array<[string, boolean]> = [
      ['rev-depara', Object.keys(fora.dePara).length > 0],
      ['rev-cc', !!fora.cc || probContasCorrentes().length > 0],
      ['rev-dc', !!fora.dc || probDC().length > 0],
      ['rev-cp', probContrapartida().length > 0],
    ]
    const alvo = secoes.find(([, has]) => has)
    if (!alvo) return
    const el = document.getElementById(alvo[0])
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); revScrolledRef.current = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoRevisao, preview, def])

  async function showProblemas(title: string, problemas: string[]) {
    await alerts.custom({
      title,
      icon: 'error',
      showCancelButton: false,
      confirmButtonText: 'Entendi',
      html: `${SWAL_TITLE_FIX}<div style="text-align:left"><p style="margin:0 0 8px">Corrija os pontos abaixo:</p><ul style="text-align:left;margin:0;padding-left:1.2em;line-height:1.7">${problemas.map((p) => `<li>${p}</li>`).join('')}</ul></div>`,
    })
  }

  // Validadores por índice de etapa do wizard (ordem: Dados do Modelo, Colunas,
  // Contas correntes, Débito/Crédito + Contrapartida). Na 1ª etapa é obrigatório
  // o arquivo de exemplo (probArquivo) e o nome (probDados).
  const STEP_VALIDATORS: Array<(() => string[]) | null> = [
    () => [...probArquivo(), ...probDados()],
    probDePara,
    probContasCorrentes,
    () => [...probDC(), ...probContrapartida()],
  ]

  function advanceStep() {
    const validator = STEP_VALIDATORS[step]
    const probs = validator ? validator() : []
    if (probs.length) { void showProblemas('Revise esta etapa', probs); return }
    const next = step + 1
    setStep(next)
    setMaxStep((m) => Math.max(m, next))
  }

  function goStep(i: number) {
    if (i <= maxStep) setStep(i)
  }

  async function handleSave() {
    const problemas = [...probDados(), ...probDePara(), ...probContasCorrentes(), ...probDC(), ...probContrapartida()]
    if (problemas.length) {
      await showProblemas('Revise o preenchimento do modelo', problemas)
      return
    }

    // Aviso NÃO bloqueante: colunas do modelo ausentes no arquivo de exemplo atual.
    // Pode salvar assim mesmo (o modelo vale p/ arquivos que as contenham).
    const f = colunasForaDoArquivo(def, preview?.headers)
    const colsFora = [...Object.values(f.dePara), f.dc, f.cc].filter((c): c is string => !!c)
    if (colsFora.length) {
      const lista = colsFora.map((c) => `"${esc(c)}"`).join(', ')
      const res = await alerts.custom({
        title: 'Coluna(s) ausente(s) no arquivo fornecido',
        icon: 'warning',
        confirmButtonText: 'Salvar assim mesmo',
        html: `${SWAL_TITLE_FIX}<div style="text-align:center"><p style="margin:0 0 10px"><b>Coluna(s):</b> ${lista}.</p><p style="margin:0">Você pode salvar assim mesmo — o modelo funcionará com arquivos que as contenham.</p></div>`,
      })
      if (!res.isConfirmed) return
    }

    setSaving(true)
    const definition: TreatmentDefinition = def
    try {
      let savedModelId: string | null = null
      if (mode === 'edit' && modelId) {
        const res = await trpc.tratamentoLancamentos.update.mutate({
          id: modelId,
          data: { nome, isActive, definition, note: note || undefined },
        })
        await alerts.success('Modelo salvo', res.versionCreated ? 'As alterações foram salvas (nova versão gerada).' : 'As alterações foram salvas.')
        savedModelId = modelId
      } else {
        const created = await trpc.tratamentoLancamentos.create.mutate({ nome, isActive, definition, note: note || undefined })
        await alerts.success('Modelo criado', `"${nome}" foi criado com sucesso.`)
        savedModelId = created.id
      }
      dirtyRef.current = false
      // Se veio do fluxo principal, devolve o modelo salvo (criado OU editado) + o
      // arquivo-exemplo para o fluxo reaproveitar (pré-seleciona o modelo e restaura o arquivo).
      if (savedModelId && backHref === '/tratamento-lancamentos') {
        try {
          sessionStorage.setItem('tl:retornoFluxo', JSON.stringify({
            modelId: savedModelId,
            fileBase64: exemploRef.current?.fileBase64,
            filename: exemploRef.current?.filename,
          }))
        } catch { /* ignore */ }
      }
      router.push(backHref)
    } catch {
      alerts.error('Erro ao salvar', 'Não foi possível salvar o Modelo. Revise os campos e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // Alterações não salvas: compara o estado atual com o baseline.
  const dirty = useMemo(
    () => baselineRef.current !== '' && serializeForm(nome, isActive, def) !== baselineRef.current,
    [nome, isActive, def],
  )
  dirtyRef.current = dirty

  if (permsLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando Modelo...
      </div>
    )
  }

  // Sem a sub-permissão de gestão: bloqueia o editor (criar/editar).
  if (!canManage) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
          <Info className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground">
          Você não tem permissão para gerenciar Modelos de Tratamento. Fale com um administrador
          para liberar a permissão <strong>Gerenciar modelos de tratamento</strong>.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </Card>
    )
  }

  const cpItens = def.contrapartida.modo === 'PALAVRA_CHAVE' ? def.contrapartida.palavraChave : def.contrapartida.descricao

  // Colunas do modelo que NÃO estão no arquivo de exemplo atual → realce âmbar no
  // campo. Vale SEMPRE (editar e revisar): não prunamos mais as ausentes, então a
  // própria `def` ainda carrega a coluna selecionada para comparar.
  const fora = colunasForaDoArquivo(def, preview?.headers)
  const temAmber = Object.keys(fora.dePara).length > 0 || !!fora.dc || !!fora.cc

  // ---- Blocos de seção: construídos uma vez. Empilhados na "visão geral"
  //      (edição + revisão final do wizard) ou exibidos um a um no wizard. --
  const secDados = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={Tag} color="bg-violet-500" title="Informações básicas"
        hint="Dê um nome fácil de reconhecer para este modelo (por exemplo, o nome do banco ou do cliente). A conta corrente é definida na etapa Contas correntes."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold">Nome do modelo <span className="text-destructive">*</span></Label>
          <Input className="h-9 text-sm bg-card" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: nome da empresa, nome do banco..." />
        </div>
        {/* "Ativo" só na edição — na criação o modelo nasce sempre ativo. */}
        {mode === 'edit' && (
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
              <span className="text-[13px] font-semibold">Ativo</span>
            </label>
          </div>
        )}
      </div>
    </Card>
  )

  const secArquivo = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={Upload} color="bg-sky-500" title="Arquivo de exemplo"
        hint="Envie um arquivo de lançamentos de exemplo (Excel, CSV ou PDF de extrato). O sistema localiza a tabela e lê os nomes das colunas sozinho — você não precisa arrumar nada no arquivo antes."
      />
      <p className="text-xs text-muted-foreground">
        Envie um arquivo de lançamentos (.xlsx, .xls, .csv, .pdf) para mapear as colunas. A detecção da tabela é automática.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
        />
        <Button variant="soft" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {fileName ? 'Trocar arquivo' : 'Enviar arquivo'}
        </Button>
        {fileName && (
          <span className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-foreground">{fileName}</span>
            <br />
            <DetectedRowsStatus rows={preview?.totalRows ?? 0} truncated={preview?.truncated} />
          </span>
        )}
        {/* Imagem/scan (Fase futura — IA); PDF com texto já é suportado. */}
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground/70">
          <ImageIcon className="h-3.5 w-3.5 opacity-50" />
          Suporte a imagens em breve
        </span>
      </div>
      {!preview && headers.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" /> Mostrando o mapeamento salvo. Envie o arquivo para revisar valores e distinções.
        </p>
      )}
    </Card>
  )

  const secDePara = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={Columns3} color="bg-emerald-500" title="De/Para de colunas"
        hint={'Para cada informação que o SCI precisa, escolha qual coluna da sua planilha contém esse dado. A "Prévia de dados" abaixo de cada campo mostra exemplos reais para você conferir se acertou.'}
      />
      {headers.length === 0 ? (
        <EmptyHint>Envie um arquivo de exemplo para listar as colunas.</EmptyHint>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MAP_FIELDS.map((f) => {
            const value = def.columnMapping[f.key] || ''
            // Na coluna de Valor, mostra o valor como será interpretado — com o
            // sinal derivado de marcadores D/C (C/CD/D/DB) de BB/Sicoob.
            const samples = f.key === 'valor'
              ? samplesFor(value).map(formatValorExibicao)
              : samplesFor(value)
            const foraCol = fora.dePara[f.key]
            return (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-[13px] font-semibold">
                  {f.label} {f.req && <span className="text-destructive">*</span>}
                </Label>
                <ColumnSelect headers={headers} value={value} optional={!f.req} onChange={(v) => setMap(f.key, v)} className={foraCol ? 'border-amber-400 ring-1 ring-amber-400/40' : undefined} />
                {foraCol && (
                  <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" /> A coluna &quot;{foraCol}&quot; não está no arquivo enviado.
                  </p>
                )}
                {f.hint && <p className="text-[11px] text-muted-foreground">{f.hint}</p>}
                {samples.length > 0 && (
                  <div className="text-[11px] text-muted-foreground/80">
                    <span className="font-medium">Prévia de dados:</span>
                    {samples.map((s, i) => <div key={i} className="truncate">{s}</div>)}
                  </div>
                )}
              </div>
            )
          })}
          <CampoDocumento
            headers={headers}
            coluna={def.columnMapping.documento || ''}
            fixo={def.columnMapping.documentoFixo || ''}
            foraCol={fora.dePara.documento}
            samples={samplesFor(def.columnMapping.documento || '')}
            ativo={docFixoAtivo}
            onAtivoChange={setDocFixoAtivo}
            onColuna={(v) => setMap('documento', v)}
            onFixo={(v) => setMap('documentoFixo', v)}
          />
        </div>
      )}
    </Card>
  )

  const secContasCorrentes = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={Landmark} color="bg-cyan-500" title="Contas correntes"
        hint="Se o arquivo traz lançamentos de mais de um banco/conta, escolha 'Várias contas correntes' e indique a coluna que identifica a conta — então informe a conta corrente de cada uma. Caso contrário, informe uma única conta."
      />
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground">Este documento é referente a:</p>
        <ModeCards
          accent="cyan"
          value={def.contasCorrentes.modo}
          options={[
            { value: 'UNICA', label: 'Uma conta corrente' },
            { value: 'MULTIPLAS', label: 'Várias contas correntes' },
          ]}
          onChange={(v) => setCcModo(v as 'UNICA' | 'MULTIPLAS')}
        />
      </div>
      {def.contasCorrentes.modo === 'UNICA' ? (
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-[13px] font-semibold">Conta corrente <span className="text-destructive">*</span></Label>
          <Input
            className="h-9 text-sm bg-card"
            inputMode="numeric"
            value={def.contasCorrentes.unica}
            onChange={(e) => setCcUnica(soDigitos(e.target.value))}
            placeholder="Número da conta corrente"
          />
        </div>
      ) : (
        headers.length === 0 ? (
          <EmptyHint>Envie um arquivo de exemplo para listar as colunas.</EmptyHint>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5 max-w-xs">
              <Label className="text-[13px] font-semibold">Coluna que identifica a conta <span className="text-destructive">*</span></Label>
              <ColumnSelect headers={headers} value={def.contasCorrentes.coluna} onChange={setCcColuna} className={fora.cc ? 'border-amber-400 ring-1 ring-amber-400/40' : undefined} />
              {fora.cc && (
                <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> A coluna &quot;{fora.cc}&quot; não está no arquivo enviado.
                </p>
              )}
            </div>
            {def.contasCorrentes.coluna && (
              <ContasCorrentesMap def={def} setDef={setDef} coluna={def.contasCorrentes.coluna} getDistinct={getDistinct} revisar={modoRevisao} />
            )}
          </div>
        )
      )}
    </Card>
  )

  const secDC = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={ArrowLeftRight} color="bg-orange-500" title="Definição de Débito / Crédito"
        hint="O sistema precisa saber se cada lançamento é um débito ou um crédito. Escolha a origem dessa informação: uma coluna da planilha, as descrições dos lançamentos, ou o sinal dos valores (negativo = crédito na conta corrente, positivo = débito na conta corrente)."
      />
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground">O tipo (débito ou crédito) é definido:</p>
        <ModeCards
          accent="orange"
          value={def.debitoCredito.tipo}
          options={[
            { value: 'COLUNA', label: 'Por coluna' },
            { value: 'DESCRICAO', label: 'Pela descrição' },
            { value: 'SINAL', label: 'Pelo sinal do valor' },
          ]}
          onChange={(v) => setDcTipo(v as 'COLUNA' | 'DESCRICAO' | 'SINAL')}
        />
      </div>
      {def.debitoCredito.tipo === 'COLUNA' ? (
        headers.length === 0 ? (
          <EmptyHint>Envie um arquivo de exemplo para listar as colunas.</EmptyHint>
        ) : (
        <div className="space-y-4">
          <div className="space-y-1.5 max-w-xs">
            <Label className="text-[13px] font-semibold">Coluna de Débito/Crédito <span className="text-destructive">*</span></Label>
            <ColumnSelect headers={headers} value={def.debitoCredito.coluna} onChange={setDcColuna} className={fora.dc ? 'border-amber-400 ring-1 ring-amber-400/40' : undefined} />
            {fora.dc && (
              <p className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3 shrink-0" /> A coluna &quot;{fora.dc}&quot; não está no arquivo enviado.
              </p>
            )}
          </div>
          {def.debitoCredito.coluna && (
            <DebitoCreditoColunaMap def={def} setDef={setDef} coluna={def.debitoCredito.coluna} getDistinct={getDistinct} revisar={modoRevisao} />
          )}
        </div>
        )
      ) : def.debitoCredito.tipo === 'SINAL' ? (
        <div className="flex items-start gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>A direção será interpretada pelo <b>sinal de cada valor</b> dos lançamentos: valores <b>negativos serão Créditos na conta corrente</b>, e <b>positivos serão Débitos na conta corrente</b>.</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          Faça a definição de débito/crédito em cada item de contrapartida abaixo.
        </div>
      )}
    </Card>
  )

  const secContrapartida = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={Network} color="bg-fuchsia-500" title="Mapeamento de contas de contrapartida"
        hint="Informe a conta de contrapartida de cada lançamento. Você pode mapear por palavra-chave encontrada na descrição, ou definir uma conta de contrapartida para cada descrição."
      />
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground">Como mapear a contrapartida:</p>
        <ModeCards
          accent="fuchsia"
          value={def.contrapartida.modo}
          options={[
            { value: 'PALAVRA_CHAVE', label: 'Por palavras-chave' },
            { value: 'DESCRICAO', label: 'Por cada descrição' },
          ]}
          onChange={(v) => setCpModo(v as 'PALAVRA_CHAVE' | 'DESCRICAO')}
        />
      </div>

      {def.contrapartida.modo === 'PALAVRA_CHAVE' ? (
        <ContrapartidaPalavraChave
          def={def} setDef={setDef} dcByDescricao={dcByDescricao} headers={headers} revisar={modoRevisao}
          descricoes={correspondencia.descricoes} totalLinhas={correspondencia.totalLinhas} truncated={preview?.truncated}
        />
      ) : (
        <ContrapartidaDescricao
          def={def} setDef={setDef} dcByDescricao={dcByDescricao} headers={headers} revisar={modoRevisao}
          descricaoColuna={def.columnMapping.descricao || ''} getDistinct={getDistinct}
        />
      )}
      {cpItens.length === 0 && def.contrapartida.modo === 'DESCRICAO' && (
        <EmptyHint>Mapeie a coluna de descrição e envie o arquivo para listar as descrições distintas.</EmptyHint>
      )}
    </Card>
  )

  const secNota = (
    <Card className="p-5 space-y-2">
      <Label className="text-[13px] font-semibold">Nota desta versão (opcional)</Label>
      <Input className="h-9 text-sm bg-card" value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que mudou nesta versão?" />
    </Card>
  )

  // Pendências de MODELO por seção no modo revisão (#2). Recalculadas conforme o
  // usuário corrige, então o realce/balão somem ao vivo. Quando a coluna ativa de
  // CC/DC faltou no arquivo (âmbar), o vermelho é suprimido — o aviso âmbar no
  // campo já explica a causa. (A varredura de cobertura da contrapartida é
  // memoizada no topo, em `temSemCorrespPC` — aqui só se lê o booleano.)
  const revProbs = {
    cc: modoRevisao && !fora.cc ? probContasCorrentes() : [],
    dc: modoRevisao && !fora.dc ? probDC() : [],
    cp: modoRevisao ? probContrapartida() : [],
  }
  const revProbsTotal = revProbs.cc.length + revProbs.dc.length + revProbs.cp.length
  const temRevisao = revProbsTotal > 0 || temAmber

  // Visão geral = todas as seções empilhadas (edição + revisão final do wizard).
  // No modo revisão, as seções com pendência de modelo ganham anel vermelho +
  // balão; o âmbar (coluna ausente) fica no próprio campo. `rev-depara` é alvo de
  // scroll quando só há âmbar no De/Para.
  const overview = (
    <>
      {secDados}
      {secArquivo}
      <div id="rev-depara" className="scroll-mt-24">{secDePara}</div>
      <SecaoRevisao ativo={modoRevisao} problems={revProbs.cc} id="rev-cc">{secContasCorrentes}</SecaoRevisao>
      <SecaoRevisao ativo={modoRevisao} problems={revProbs.dc} id="rev-dc">{secDC}</SecaoRevisao>
      <SecaoRevisao ativo={modoRevisao} problems={revProbs.cp} id="rev-cp">{secContrapartida}</SecaoRevisao>
      {mode === 'edit' && secNota}
    </>
  )

  // ---- Modo CRIAÇÃO: wizard passo a passo ---------------------------------
  if (mode === 'create') {
    const wizardSteps = [
      { label: 'Início', node: (<>{secArquivo}{secDados}</>) },
      { label: 'Colunas', node: secDePara },
      { label: 'Contas correntes', node: secContasCorrentes },
      { label: 'Débito/Crédito e Contrapartida', node: (<>{secDC}{secContrapartida}</>) },
    ]
    const isReview = step >= wizardSteps.length
    const currentStep = wizardSteps[step]

    return (
      <TooltipProvider>
        <div className="space-y-6 pb-24">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <PageHeaderIcon module="contabil" icon={FileSpreadsheet} />
              <div>
                <h1>Novo Modelo de Tratamento</h1>
                <p className="text-sm text-muted-foreground">
                  {isReview || !currentStep
                    ? 'Revise as escolhas e confirme a criação'
                    : `Passo ${step + 1} de ${wizardSteps.length} — ${currentStep.label}`}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleBack}><ArrowLeft className="h-4 w-4" /> Sair</Button>
          </div>

          <Stepper labels={[...wizardSteps.map((s) => s.label), 'Revisão']} current={step} maxStep={maxStep} onGo={goStep} />

          {isReview || !currentStep ? (
            <>
              <div className="flex items-start gap-2 rounded-[2px] border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                Confira o resumo do modelo abaixo. Você pode voltar a qualquer etapa para ajustar antes de criar.
              </div>
              {overview}
            </>
          ) : (
            currentStep.node
          )}

        </div>
        {/* Barra de ação flutuante central — "Etapa anterior" + ação primária
            juntos, na zona livre (o FAB do sistema fica no canto direito). */}
        <FloatingActionBar
          onBack={step > 0 ? () => setStep((s) => Math.max(0, s - 1)) : undefined}
          primaryLabel={isReview ? 'Salvar modelo' : 'Avançar'}
          primaryIcon={isReview ? Save : ArrowRight}
          primaryIconRight={!isReview}
          onPrimary={isReview ? handleSave : advanceStep}
          loading={isReview ? saving : false}
        />
      </TooltipProvider>
    )
  }

  // ---- Modo EDIÇÃO: visão geral (todas as seções) -------------------------
  return (
    <TooltipProvider>
      <div className="space-y-6 pb-24">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <PageHeaderIcon module="contabil" icon={FileSpreadsheet} />
            <div>
              <h1>Editar Modelo</h1>
              <p className="text-sm text-muted-foreground">Configure o mapeamento usado na conversão para o SCI</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {modelId && (
              <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                <History className="h-4 w-4" /> Histórico
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleBack}><ArrowLeft className="h-4 w-4" /> Voltar</Button>
          </div>
        </div>
        {modoRevisao && temRevisao && (
          <div className="flex items-start gap-2 rounded-[4px] border border-border bg-muted/40 px-3 py-2.5 text-xs">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
            <span className="flex-1 text-muted-foreground">
              Revisando este modelo. <span className="font-medium text-rose-600 dark:text-rose-400">Vermelho</span> = pendência do modelo a corrigir; <span className="font-medium text-amber-600 dark:text-amber-400">âmbar</span> = coluna que não está no arquivo enviado. O destaque some conforme você ajusta.
            </span>
            <button type="button" onClick={() => setModoRevisao(false)} className="shrink-0 text-muted-foreground/60 hover:text-foreground" aria-label="Encerrar revisão">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {overview}
        {/* Salvar flutuante — sempre acessível, sem rolar até o topo. */}
        <FloatingActionBar primaryLabel="Salvar alterações" onPrimary={handleSave} loading={saving} />
        {modelId && (
          <VersionHistoryDialog
            modelId={modelId}
            modelNome={nome}
            open={historyOpen}
            onOpenChange={setHistoryOpen}
            canManage={canManage}
            onRestored={() => setReloadNonce((n) => n + 1)}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

// Colunas mapeadas no modelo (De/Para + coluna ativa de D/C e de conta corrente)
// que NÃO existem nos cabeçalhos do arquivo enviado — base do realce âmbar (#2).
// Compara contra as colunas ORIGINAIS do modelo (o prune já limpa as ausentes).
function colunasForaDoArquivo(defOrig: TreatmentDefinition | null, headers?: string[]) {
  const out = {
    dePara: {} as Partial<Record<keyof TreatmentDefinition['columnMapping'], string>>,
    dc: '',
    cc: '',
  }
  if (!defOrig || !headers) return out
  const hset = new Set(headers)
  const cm = defOrig.columnMapping
  for (const k of Object.keys(cm) as Array<keyof typeof cm>) {
    if (k === 'documentoFixo') continue // valor literal, não é coluna do arquivo
    const col = cm[k]
    if (col && !hset.has(col)) out.dePara[k] = col
  }
  const dc = defOrig.debitoCredito
  if (dc.tipo === 'COLUNA' && dc.coluna && !hset.has(dc.coluna)) out.dc = dc.coluna
  const cc = defOrig.contasCorrentes
  if (cc.modo === 'MULTIPLAS' && cc.coluna && !hset.has(cc.coluna)) out.cc = cc.coluna
  return out
}

// --- Modo revisão (#2): seção com pendência de modelo ganha anel vermelho + balão
// As mensagens vêm dos validadores prob*; os valores do usuário já são escapados
// (listaResumo → esc), então é seguro usar innerHTML (mantém o negrito).
function RevisaoCallout({ problems }: { problems: string[] }) {
  return (
    <div className="rounded-[4px] border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive dark:text-rose-300">
      <div className="mb-1 flex items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" /> Corrija para gerar o arquivo:
      </div>
      <ul className="list-disc space-y-0.5 pl-5 [&_b]:font-semibold">
        {problems.map((p, i) => <li key={i} dangerouslySetInnerHTML={{ __html: p }} />)}
      </ul>
    </div>
  )
}

function SecaoRevisao({ ativo, problems, id, children }: { ativo: boolean; problems: string[]; id: string; children: ReactNode }) {
  if (!ativo || !problems.length) return <>{children}</>
  return (
    <div id={id} className="space-y-2 scroll-mt-24">
      <RevisaoCallout problems={problems} />
      <div className="rounded-lg ring-2 ring-destructive/50 ring-offset-2 ring-offset-background">{children}</div>
    </div>
  )
}
