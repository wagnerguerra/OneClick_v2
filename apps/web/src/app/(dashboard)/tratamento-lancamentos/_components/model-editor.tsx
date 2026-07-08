'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, Save, Upload, Plus, Trash2, Loader2, Info, Image as ImageIcon,
  Tag, Columns3, ArrowLeftRight, Network, HelpCircle, ArrowLeft, ArrowRight, History, Landmark, type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@saas/ui'
import { cn } from '@saas/ui'
import type { TreatmentDefinition, Direcao } from '@saas/types'
import { EMPTY_TREATMENT_DEFINITION, stableStringify, formatValorExibicao, extrairMarcadorDC } from '@saas/types'
import { normalizeDefinition } from './treatment-definition'
import { DetectedRowsStatus } from './detected-rows-status'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { fileToBase64 } from '@/lib/file'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'
import { useUserPermissions } from '@/hooks/use-user-permissions'
import { VersionHistoryDialog } from './version-history-dialog'

type CellValue = string | number | boolean | null
interface PreviewData { headers: string[]; rows: Array<Record<string, CellValue>>; totalRows: number; truncated: boolean }

const NONE = '__none__'

const HISTORICO_FIXO_HINT =
  'Texto fixo que será gravado no campo Histórico do SCI para esses lançamentos. ' +
  'Se deixar em branco, o sistema monta o histórico automaticamente ' +
  '(ex.: "VR REF RECEB - NOME DO PARTICIPANTE"). ' +
  'Vírgulas são removidas automaticamente (quebrariam o layout do SCI).'

const PULAR_LINHA_HINT =
  'Marque para IGNORAR as linhas que correspondem a este item: elas NÃO entram no ' +
  'arquivo SCI. Útil para linhas do extrato que não são lançamentos (ex.: "Saldo do ' +
  'dia", "Saldo anterior"). Quando marcado, os demais campos deste item são dispensados.'

interface Props {
  mode: 'create' | 'edit'
  modelId?: string
  /** Caminho de origem (?from=) — para "Voltar"/"Salvar" retornarem a ele. */
  backTo?: string
}

/**
 * Ao trocar o arquivo de exemplo, descarta as referências de coluna da definição
 * que não existem mais no novo arquivo (De/Para, Débito/Crédito e Contas
 * correntes). Sem isso, o select continuaria exibindo uma coluna inexistente.
 * Quando uma coluna de mapeamento (Débito/Crédito ou Contas) some, o respectivo
 * mapa de valores também é zerado — passou a ser de outra coluna.
 */
function pruneDefToHeaders(d: TreatmentDefinition, headers: string[]): TreatmentDefinition {
  const has = new Set(headers)
  const columnMapping = { ...d.columnMapping }
  for (const k of Object.keys(columnMapping) as Array<keyof TreatmentDefinition['columnMapping']>) {
    const v = columnMapping[k]
    if (v && !has.has(v)) columnMapping[k] = ''
  }
  const debitoCredito =
    d.debitoCredito.coluna && !has.has(d.debitoCredito.coluna)
      ? { ...d.debitoCredito, coluna: '', mapa: [] }
      : d.debitoCredito
  const contasCorrentes =
    d.contasCorrentes.coluna && !has.has(d.contasCorrentes.coluna)
      ? { ...d.contasCorrentes, coluna: '', mapa: [] }
      : d.contasCorrentes
  return { ...d, columnMapping, debitoCredito, contasCorrentes }
}

// Campos do de/para. `req` marca os obrigatórios.
const MAP_FIELDS: Array<{ key: keyof TreatmentDefinition['columnMapping']; label: string; req?: boolean; hint?: string }> = [
  { key: 'descricao', label: 'Descrição do lançamento', req: true },
  { key: 'valor', label: 'Valor', req: true },
  { key: 'data', label: 'Data', req: true },
  { key: 'participante', label: 'Nome do participante', hint: 'Opcional — usado no histórico do SCI' },
  { key: 'numeroNf', label: 'Número da NF', hint: 'Opcional' },
  { key: 'documento', label: 'CNPJ/CPF', hint: 'Opcional — pré-selecionado se houver coluna "CNPJ"' },
]

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
    Object.values(def.columnMapping).forEach((v) => { if (v) fromDef.add(v) })
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

  // ---- Upload do arquivo-exemplo ------------------------------------------
  async function loadPreview(base64: string, filename: string) {
    setUploading(true)
    try {
      const res = await trpc.tratamentoLancamentos.preview.mutate({ fileBase64: base64, filename })
      setPreview(res as PreviewData)
      setFileName(filename)
      // Ao trocar o arquivo, descarta colunas selecionadas que não existem mais.
      setDef((d) => pruneDefToHeaders(d, res.headers))
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
          if (faltam.length) p.push(`Em <b>Contas correntes</b>, informe a conta ${faltam.length === 1 ? 'do valor' : 'dos valores'}: ${listaResumo(faltam)}.`)
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
        if (semConta) p.push(`Em <b>Contrapartida</b>, informe a <b>conta</b> em ${semConta} ${semConta === 1 ? 'item' : 'itens'}.`)
        if (dcByDescricao) {
          const semDir = itens.filter((it) => !it.pular && !it.direcao).length
          if (semDir) p.push(`Em <b>Contrapartida</b>, defina <b>Débito/Crédito</b> em ${semDir} ${semDir === 1 ? 'item' : 'itens'}.`)
        }
      }
    } else {
      const itens = def.contrapartida.descricao
      if (!itens.length) {
        p.push('Em <b>Contrapartida</b> (por descrição), envie o arquivo de exemplo e mapeie a coluna de descrição para listar as descrições.')
      } else {
        const semConta = itens.filter((it) => !it.pular && !it.conta.trim())
        if (semConta.length) p.push(`Em <b>Contrapartida</b>, informe a <b>conta</b> ${semConta.length === 1 ? 'da descrição' : 'das descrições'}: ${listaResumo(semConta.map((it) => it.descricao))}.`)
        if (dcByDescricao) {
          const semDir = itens.filter((it) => !it.pular && !it.direcao).length
          if (semDir) p.push(`Em <b>Contrapartida</b>, defina <b>Débito/Crédito</b> em ${semDir} ${semDir === 1 ? 'descrição' : 'descrições'}.`)
        }
      }
    }
    return p
  }

  async function showProblemas(title: string, problemas: string[]) {
    await alerts.custom({
      title,
      icon: 'error',
      showCancelButton: false,
      confirmButtonText: 'Entendi',
      html: `<div style="text-align:left"><p style="margin:0 0 8px">Corrija os pontos abaixo:</p><ul style="text-align:left;margin:0;padding-left:1.2em;line-height:1.7">${problemas.map((p) => `<li>${p}</li>`).join('')}</ul></div>`,
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
            return (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-[13px] font-semibold">
                  {f.label} {f.req && <span className="text-destructive">*</span>}
                </Label>
                <ColumnSelect headers={headers} value={value} optional={!f.req} onChange={(v) => setMap(f.key, v)} />
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
        </div>
      )}
    </Card>
  )

  const secContasCorrentes = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={Landmark} color="bg-cyan-500" title="Contas correntes"
        hint="Se o arquivo traz lançamentos de mais de um banco/conta, escolha 'Várias contas' e indique a coluna que identifica a conta — então informe a conta contábil de cada uma. Caso contrário, informe uma única conta contábil."
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
              <ColumnSelect headers={headers} value={def.contasCorrentes.coluna} onChange={setCcColuna} />
            </div>
            {def.contasCorrentes.coluna && (
              <ContasCorrentesMap def={def} setDef={setDef} coluna={def.contasCorrentes.coluna} getDistinct={getDistinct} />
            )}
          </div>
        )
      )}
    </Card>
  )

  const secDC = (
    <Card className="p-5 space-y-4">
      <StepHeader
        icon={ArrowLeftRight} color="bg-amber-500" title="Definição de Débito / Crédito"
        hint="O sistema precisa saber se cada lançamento é um débito ou um crédito. Escolha a origem dessa informação: uma coluna da planilha, as descrições dos lançamentos, ou o sinal dos valores (negativo = débito, positivo = crédito)."
      />
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground">O tipo (débito ou crédito) é definido:</p>
        <ModeCards
          accent="amber"
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
            <ColumnSelect headers={headers} value={def.debitoCredito.coluna} onChange={setDcColuna} />
          </div>
          {def.debitoCredito.coluna && (
            <DebitoCreditoColunaMap def={def} setDef={setDef} coluna={def.debitoCredito.coluna} getDistinct={getDistinct} />
          )}
        </div>
        )
      ) : def.debitoCredito.tipo === 'SINAL' ? (
        <div className="flex items-start gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>A direção será interpretada pelo <b>sinal de cada valor</b> dos lançamentos: valores <b>negativos</b> serão Débitos e <b>positivos</b> serão Créditos.</span>
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
        icon={Network} color="bg-rose-500" title="Mapeamento de contas de contrapartida"
        hint="Informe a conta contábil de contrapartida de cada lançamento. Você pode mapear por palavra-chave encontrada na descrição, ou definir uma conta para cada descrição."
      />
      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-foreground">Como mapear a contrapartida:</p>
        <ModeCards
          accent="rose"
          value={def.contrapartida.modo}
          options={[
            { value: 'DESCRICAO', label: 'Por descrição' },
            { value: 'PALAVRA_CHAVE', label: 'Por palavra-chave' },
          ]}
          onChange={(v) => setCpModo(v as 'PALAVRA_CHAVE' | 'DESCRICAO')}
        />
      </div>

      {def.contrapartida.modo === 'PALAVRA_CHAVE' ? (
        <ContrapartidaPalavraChave def={def} setDef={setDef} dcByDescricao={dcByDescricao} />
      ) : (
        <ContrapartidaDescricao
          def={def} setDef={setDef} dcByDescricao={dcByDescricao}
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

  // Visão geral = todas as seções empilhadas (edição + revisão final do wizard).
  const overview = (
    <>
      {secDados}
      {secArquivo}
      {secDePara}
      {secContasCorrentes}
      {secDC}
      {secContrapartida}
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

// ============================================================
// Subcomponentes
// ============================================================

/**
 * Ação primária (Salvar / Criar modelo) fixada no rodapé, sempre acessível na
 * visão geral do modelo — sem precisar rolar até o topo. Fica no centro-baixo
 * da tela para não colidir com o FAB "Fale com a TI" (canto inferior direito)
 * nem com o rail de tarefas. z-40 mantém abaixo de modais/alertas (z-50).
 */
function FloatingActionBar({
  primaryLabel, onPrimary, loading = false, primaryIcon: Icon = Save, primaryIconRight = false, onBack,
}: {
  primaryLabel: string; onPrimary: () => void; loading?: boolean
  primaryIcon?: LucideIcon; primaryIconRight?: boolean; onBack?: () => void
}) {
  // Anima a entrada: monta "escondida" (deslocada + transparente) e no próximo
  // frame passa para o estado visível, deixando a transição do CSS rolar.
  // Mesmo padrão do FAB — usa só utilitários core do Tailwind (sem plugin).
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  const glyph = loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-6 z-40 flex items-center justify-center gap-2 pointer-events-none',
        'transition-all duration-500 ease-out will-change-transform',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
      )}
    >
      {onBack && (
        <Button
          variant="outline"
          onClick={onBack}
          className="pointer-events-auto h-11 gap-2 rounded-full bg-card px-5 text-sm font-semibold shadow-lg shadow-black/20 ring-1 ring-black/5 transition-all duration-100 active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" /> Etapa anterior
        </Button>
      )}
      <Button
        variant="success"
        onClick={onPrimary}
        disabled={loading}
        className="pointer-events-auto h-11 gap-2 rounded-full px-6 text-sm font-semibold shadow-lg shadow-black/25 ring-1 ring-black/5 transition-all duration-100 active:scale-95"
      >
        {!primaryIconRight && glyph}
        {primaryLabel}
        {primaryIconRight && glyph}
      </Button>
    </div>
  )
}

/** Ajuda colapsada: "?" que revela o texto no hover. */
function HelpTip({ text, side = 'top' }: { text: string; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-foreground cursor-help transition-colors" />
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-xs text-xs leading-relaxed">{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Cabeçalho de etapa: ícone colorido + título + ajuda colapsada (tooltip no "?").
 * `color` é uma classe de fundo Tailwind (mantém dark mode, sem hex hardcoded).
 */
function StepHeader({ icon: Icon, title, hint, color }: { icon: LucideIcon; title: string; hint: string; color: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2 -mx-5 px-5">
      <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] text-white', color)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
      <HelpTip text={hint} side="right" />
    </div>
  )
}
function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground italic">{children}</p>
}

/** Barra de etapas do wizard — clicável para etapas já alcançadas. */
function Stepper({ labels, current, maxStep, onGo }: { labels: string[]; current: number; maxStep: number; onGo: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {labels.map((label, i) => {
        const active = i === current
        const reachable = i <= maxStep
        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onGo(i)}
              className={cn(
                'flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 text-xs font-medium transition-colors',
                active
                  ? 'text-white'
                  : reachable
                    ? 'bg-muted/50 text-foreground hover:bg-muted cursor-pointer'
                    : 'bg-muted/30 text-muted-foreground/60 cursor-not-allowed',
              )}
              style={active ? { backgroundColor: 'var(--mod-contabil, #a78bfa)' } : undefined}
            >
              <span className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[10px]', active ? 'bg-white/25' : 'bg-foreground/10')}>{i + 1}</span>
              {label}
            </button>
            {i < labels.length - 1 && <span className="px-1 text-muted-foreground/40">›</span>}
          </div>
        )
      })}
    </div>
  )
}

// Cores de destaque do card ativo, por etapa (classes estáticas p/ o Tailwind enxergar).
const MODE_ACCENT = {
  cyan: { border: 'border-cyan-500', ring: 'ring-cyan-500/25', bg: 'bg-cyan-500/5', dot: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300' },
  amber: { border: 'border-amber-500', ring: 'ring-amber-500/25', bg: 'bg-amber-500/5', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
  rose: { border: 'border-rose-500', ring: 'ring-rose-500/25', bg: 'bg-rose-500/5', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-300' },
} as const

/**
 * Seletor EXCLUSIVO (radio-cards) das etapas de 2 modos. Cada opção é um card com
 * bolinha de radio; só um fica ativo (destacado com a cor da etapa). Deixa claro
 * que é "um OU outro" — em testes com usuários o segmented control antigo parecia
 * abas, dando a impressão de que as duas precisavam ser preenchidas.
 */
function ModeCards({ value, options, onChange, accent }: {
  value: string
  options: Array<{ value: string; label: string; hint?: string }>
  onChange: (v: string) => void
  accent: keyof typeof MODE_ACCENT
}) {
  const A = MODE_ACCENT[accent]
  return (
    <div role="radiogroup" className={cn('grid gap-2 max-w-2xl', options.length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-start gap-2.5 rounded-[4px] border px-3 py-2.5 text-left transition-colors',
              active ? cn(A.border, A.bg, 'ring-1', A.ring) : 'border-border/60 bg-muted/20 hover:bg-muted/40',
            )}
          >
            <span className={cn(
              'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
              active ? A.border : 'border-muted-foreground/40',
            )}>
              {active && <span className={cn('h-2 w-2 rounded-full', A.dot)} />}
            </span>
            <span>
              <span className={cn('block text-xs font-medium', active ? A.text : 'text-foreground')}>{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{o.hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ColumnSelect({ headers, value, optional, onChange, placeholder = 'Selecione a coluna' }: { headers: string[]; value: string; optional?: boolean; onChange: (v: string) => void; placeholder?: string }) {
  const options = value && !headers.includes(value) ? [value, ...headers] : headers
  // Obrigatório: sem seleção → value '' (Radix exibe o placeholder).
  // Opcional: NONE é o sentinela do item "— Nenhuma —".
  const selectValue = optional ? (value || NONE) : value
  return (
    <Select value={selectValue} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className="h-9 text-sm bg-card"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {optional && <SelectItem value={NONE}>— Nenhuma —</SelectItem>}
        {options.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

type SetDef = React.Dispatch<React.SetStateAction<TreatmentDefinition>>

/** Mapa valor→direção da coluna de Débito/Crédito (sem default; direção obrigatória). */
function DebitoCreditoColunaMap({ def, setDef, coluna, getDistinct }: { def: TreatmentDefinition; setDef: SetDef; coluna: string; getDistinct: (c: string) => string[] }) {
  const distinct = getDistinct(coluna)

  // Poda valores que não existem mais na coluna (ex.: ao trocar de coluna).
  // NÃO semeia defaults — cada direção começa sem seleção (obrigatória).
  useEffect(() => {
    if (!distinct.length) return
    setDef((d) => {
      const valid = new Set(distinct)
      const mapa = d.debitoCredito.mapa.filter((m) => valid.has(m.valor))
      if (mapa.length === d.debitoCredito.mapa.length) return d
      return { ...d, debitoCredito: { ...d.debitoCredito, mapa } }
    })
  }, [coluna, getDistinct, setDef])

  function setOne(valor: string, direcao: Direcao) {
    setDef((d) => {
      const mapa = d.debitoCredito.mapa.filter((m) => m.valor !== valor)
      mapa.push({ valor, direcao })
      return { ...d, debitoCredito: { ...d.debitoCredito, mapa } }
    })
  }

  const mapa = def.debitoCredito.mapa
  const valores = distinct.length ? distinct : mapa.map((m) => m.valor)
  if (!valores.length) return <EmptyHint>Envie o arquivo para listar os valores distintos desta coluna.</EmptyHint>
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Para cada valor da coluna, defina a direção:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {valores.map((val) => {
          const cur = mapa.find((m) => m.valor === val)?.direcao ?? ''
          return (
            <div key={val} className="flex items-center gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-1.5">
              <span className="text-sm flex-1 truncate" title={val}>{val}</span>
              <Select value={cur} onValueChange={(v) => setOne(val, v as Direcao)}>
                <SelectTrigger className={cn('h-8 w-[130px] text-xs bg-card', !cur && 'border-r-2 border-r-destructive')}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEBITO">Débito</SelectItem>
                  <SelectItem value="CREDITO">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Mapa valor→conta corrente da coluna que identifica o banco (modo múltiplas contas). */
function ContasCorrentesMap({ def, setDef, coluna, getDistinct }: { def: TreatmentDefinition; setDef: SetDef; coluna: string; getDistinct: (c: string) => string[] }) {
  const distinct = getDistinct(coluna)

  // Poda valores que não existem mais na coluna (ex.: ao trocar de coluna).
  useEffect(() => {
    if (!distinct.length) return
    setDef((d) => {
      const valid = new Set(distinct)
      const mapa = d.contasCorrentes.mapa.filter((m) => valid.has(m.valor))
      if (mapa.length === d.contasCorrentes.mapa.length) return d
      return { ...d, contasCorrentes: { ...d.contasCorrentes, mapa } }
    })
  }, [coluna, getDistinct, setDef])

  function setOne(valor: string, conta: string) {
    setDef((d) => {
      const mapa = d.contasCorrentes.mapa.filter((m) => m.valor !== valor)
      mapa.push({ valor, conta })
      return { ...d, contasCorrentes: { ...d.contasCorrentes, mapa } }
    })
  }

  const mapa = def.contasCorrentes.mapa
  const valores = distinct.length ? distinct : mapa.map((m) => m.valor)
  if (!valores.length) return <EmptyHint>Envie o arquivo para listar os valores distintos desta coluna.</EmptyHint>
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Para cada valor da coluna, informe a conta contábil:</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {valores.map((val) => {
          const cur = mapa.find((m) => m.valor === val)?.conta ?? ''
          return (
            <div key={val} className="flex items-center gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-1.5">
              <span className="text-sm flex-1 truncate" title={val}>{val}</span>
              <Input
                className={cn('h-8 w-[150px] text-xs bg-card', !cur.trim() && 'border-r-2 border-r-destructive')}
                placeholder="Conta corrente"
                inputMode="numeric"
                value={cur}
                onChange={(e) => setOne(val, soDigitos(e.target.value))}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Campos comuns às duas modalidades de contrapartida. Só a coluna
// identificadora (palavra-chave editável vs descrição read-only) difere.
type CpItemComum = { conta: string; historicoFixo?: string; direcao?: Direcao; pular?: boolean }

/**
 * Tabela compartilhada pelas duas modalidades de contrapartida (por descrição e
 * por palavra-chave). As colunas Conta / Histórico fixo / Direção / Pular — e
 * toda a lógica de validação (borda vermelha), disabled e line-through quando
 * "pular" está marcado — vivem SÓ aqui. O que muda entre os modos é a 1ª coluna
 * (`primeiraColuna`) e a existência de Adicionar/Remover (`onAdd`/`onRemove`).
 * Assim, alterar um comportamento dessas colunas passa a ser 1 edição, não 2.
 */
function ContrapartidaTabela<T extends CpItemComum>({
  itens, onUpdate, onRemove, onAdd, addLabel, dcByDescricao, primeiraColuna,
}: {
  itens: T[]
  onUpdate: (i: number, patch: Partial<T>) => void
  onRemove?: (i: number) => void
  onAdd?: () => void
  addLabel?: string
  dcByDescricao: boolean
  primeiraColuna: { header: string; className?: string; cellClassName?: string; render: (it: T, i: number) => React.ReactNode }
}) {
  return (
    <div className="space-y-2">
      <div className="rounded-[2px] border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={primeiraColuna.className}>{primeiraColuna.header}</TableHead>
              <TableHead className="w-[130px]">Conta</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Histórico fixo (opcional)
                  <HelpTip text={HISTORICO_FIXO_HINT} />
                </span>
              </TableHead>
              {dcByDescricao && <TableHead className="w-[120px]">Direção</TableHead>}
              <TableHead className="w-[90px]">
                <span className="inline-flex items-center gap-1">Pular <HelpTip text={PULAR_LINHA_HINT} /></span>
              </TableHead>
              {onRemove && <TableHead className="w-[52px]" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((it, i) => {
              const pular = !!it.pular
              return (
              <TableRow key={i}>
                <TableCell className={primeiraColuna.cellClassName}>{primeiraColuna.render(it, i)}</TableCell>
                <TableCell><Input disabled={pular} className={cn('h-8 text-xs bg-card', !pular && !it.conta.trim() && 'border-r-2 border-r-destructive', pular && 'line-through placeholder:line-through')} placeholder="Conta" inputMode="numeric" value={it.conta} onChange={(e) => onUpdate(i, { conta: soDigitos(e.target.value) } as Partial<T>)} /></TableCell>
                <TableCell><Input disabled={pular} className={cn('h-8 text-xs bg-card', pular && 'line-through placeholder:line-through')} placeholder="Histórico fixo (opcional)" value={it.historicoFixo ?? ''} onChange={(e) => onUpdate(i, { historicoFixo: semSeparador(e.target.value) } as Partial<T>)} /></TableCell>
                {dcByDescricao && (
                  <TableCell>
                    <Select value={it.direcao ?? ''} onValueChange={(v) => onUpdate(i, { direcao: v as Direcao } as Partial<T>)} disabled={pular}>
                      <SelectTrigger className={cn('h-8 text-xs bg-card', !pular && !it.direcao && 'border-r-2 border-r-destructive', pular && 'line-through')}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="DEBITO">Débito</SelectItem><SelectItem value="CREDITO">Crédito</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                )}
                <TableCell><div className="flex justify-center"><Checkbox checked={pular} onCheckedChange={(v) => onUpdate(i, { pular: !!v } as Partial<T>)} /></div></TableCell>
                {onRemove && <TableCell><Button variant="soft-destructive" size="icon-sm" onClick={() => onRemove(i)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>}
              </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {onAdd && (
        <Button variant="soft" size="sm" onClick={onAdd}><Plus className="h-4 w-4" /> {addLabel ?? 'Adicionar'}</Button>
      )}
    </div>
  )
}

function ContrapartidaPalavraChave({ def, setDef, dcByDescricao }: { def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean }) {
  const itens = def.contrapartida.palavraChave

  const update = useCallback((i: number, patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const next = d.contrapartida.palavraChave.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, palavraChave: next } }
    })
  }, [setDef])
  const add = useCallback(() => {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: [...d.contrapartida.palavraChave, { palavraChave: '', conta: '', historicoFixo: '' }] } }))
  }, [setDef])
  const remove = useCallback((i: number) => {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: d.contrapartida.palavraChave.filter((_, idx) => idx !== i) } }))
  }, [setDef])

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Adicione palavras-chave abaixo, a serem detectadas nas descrições dos lançamentos.</p>
      <ContrapartidaTabela
        itens={itens} onUpdate={update} onRemove={remove} onAdd={add} addLabel="Adicionar palavra-chave"
        dcByDescricao={dcByDescricao}
        primeiraColuna={{
          header: 'Palavra-chave', className: 'min-w-[160px]',
          render: (it, i) => (
            <Input className="h-8 text-xs bg-card" placeholder="Palavra-chave" value={it.palavraChave} onChange={(e) => update(i, { palavraChave: e.target.value })} />
          ),
        }}
      />
    </div>
  )
}

function ContrapartidaDescricao({ def, setDef, dcByDescricao, descricaoColuna, getDistinct }: {
  def: TreatmentDefinition; setDef: SetDef; dcByDescricao: boolean; descricaoColuna: string; getDistinct: (c: string) => string[]
}) {
  const itens = def.contrapartida.descricao

  // Reconstrói a lista a partir das descrições distintas da COLUNA atual,
  // reaproveitando conta/histórico/direção já preenchidos para descrições iguais.
  // Trocar a coluna de descrição SUBSTITUI os itens (não acumula com a anterior).
  useEffect(() => {
    const distinct = getDistinct(descricaoColuna)
    if (!distinct.length) return
    setDef((d) => {
      const existing = new Map(d.contrapartida.descricao.map((it) => [it.descricao, it]))
      const novos = distinct.map((desc) => existing.get(desc) ?? { descricao: desc, conta: '', historicoFixo: '' })
      return { ...d, contrapartida: { ...d.contrapartida, descricao: novos } }
    })
  }, [descricaoColuna, getDistinct, setDef])

  const update = useCallback((i: number, patch: Partial<typeof itens[number]>) => {
    setDef((d) => {
      const next = d.contrapartida.descricao.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, descricao: next } }
    })
  }, [setDef])

  if (!itens.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Cada descrição distinta recebe uma conta de contrapartida.</p>
      <ContrapartidaTabela
        itens={itens} onUpdate={update} dcByDescricao={dcByDescricao}
        primeiraColuna={{
          header: 'Descrição', cellClassName: 'text-sm max-w-[280px] truncate',
          render: (it) => (
            <span className={cn(it.pular && 'line-through text-muted-foreground')} title={it.descricao}>{it.descricao}</span>
          ),
        }}
      />
    </div>
  )
}

// ---- util ----

/**
 * Remove vírgulas e quebras de linha de campos que vão para a linha do SCI
 * (separada por vírgula, sem escape). Enforce no front nos campos digitados —
 * o backend ainda saneia como rede de segurança (inclui dados vindos do arquivo).
 */
/**
 * Diálogo único de "sair sem salvar" — fonte de verdade da mensagem, usada por
 * todos os caminhos de saída (botão Sair/Voltar e botão "voltar" do navegador).
 */
function confirmarSaidaSemSalvar(): Promise<boolean> {
  return alerts.confirm({
    title: 'Sair sem salvar?',
    text: 'Há alterações não salvas neste modelo. Se sair agora, elas serão perdidas.',
    confirmText: 'Sair sem salvar',
    icon: 'warning',
  })
}

function semSeparador(s: string): string {
  return s.replace(/[,\r\n]/g, '')
}

/**
 * Campos de número de conta (contas correntes e contrapartida) só aceitam dígitos.
 * Remove qualquer caractere não numérico enquanto o usuário digita.
 */
function soDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

/** Escapa HTML de valores do usuário antes de embutir nas mensagens (SweetAlert html). */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Resume uma lista (até `max` itens) com "e mais N", escapando os valores. */
function listaResumo(itens: string[], max = 3): string {
  const vis = itens.slice(0, max).map((s) => `"${esc(s)}"`)
  const resto = itens.length - vis.length
  return vis.join(', ') + (resto > 0 ? ` e mais ${resto}` : '')
}

/** Snapshot serializado do formulário para detectar alterações não salvas. */
function serializeForm(nome: string, isActive: boolean, def: TreatmentDefinition): string {
  return stableStringify({ nome: nome.trim(), isActive, def })
}
