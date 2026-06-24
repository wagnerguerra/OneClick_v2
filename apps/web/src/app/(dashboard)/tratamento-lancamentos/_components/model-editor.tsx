'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileSpreadsheet, Save, Upload, Plus, Trash2, Loader2, Info, FileText, Image as ImageIcon,
  Tag, Columns3, ArrowLeftRight, Network, HelpCircle, ArrowLeft, type LucideIcon,
} from 'lucide-react'
import {
  Button, Input, Label, Checkbox, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
  Tooltip, TooltipTrigger, TooltipContent, TooltipProvider,
} from '@saas/ui'
import { cn } from '@saas/ui'
import type { TreatmentDefinition, Direcao, ContrapartidaRule } from '@saas/types'
import { EMPTY_TREATMENT_DEFINITION, stableStringify } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { PageHeaderIcon } from '@/components/ui/page-header-icon'

type CellValue = string | number | boolean | null
interface PreviewData { headers: string[]; rows: Array<Record<string, CellValue>>; totalRows: number; truncated: boolean }

const NONE = '__none__'

const HISTORICO_FIXO_HINT =
  'Texto fixo que será gravado no campo Histórico do SCI para esses lançamentos. ' +
  'Se deixar em branco, o sistema monta o histórico automaticamente ' +
  '(ex.: "VR REF RECEB - NOME DO PARTICIPANTE").'

interface Props {
  mode: 'create' | 'edit'
  modelId?: string
}

// Campos do de/para. `req` marca os obrigatórios.
const MAP_FIELDS: Array<{ key: keyof TreatmentDefinition['columnMapping']; label: string; req?: boolean; hint?: string }> = [
  { key: 'descricao', label: 'Descrição do lançamento', req: true },
  { key: 'valor', label: 'Valor', req: true },
  { key: 'data', label: 'Data', req: true },
  { key: 'participante', label: 'Participante', hint: 'Opcional — usado no histórico do SCI' },
  { key: 'numeroNf', label: 'Número da NF', hint: 'Opcional' },
  { key: 'documento', label: 'CNPJ/CPF', hint: 'Opcional — pré-selecionado se houver coluna "CNPJ"' },
]

export function ModelEditor({ mode, modelId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Dados de identificação do Modelo.
  const [nome, setNome] = useState('')
  const [contaCorrente, setContaCorrente] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [note, setNote] = useState('')

  // Corpo do Modelo (definição) + arquivo-exemplo (preview).
  const [def, setDef] = useState<TreatmentDefinition>(EMPTY_TREATMENT_DEFINITION)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  // Detecção de alterações não salvas.
  const baselineRef = useRef<string>('')
  const dirtyRef = useRef(false)

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
        setContaCorrente(m.contaCorrente ?? '')
        setIsActive(m.isActive)
        setDef(loadedDef)
        baselineRef.current = serializeForm(m.nome, m.contaCorrente ?? '', m.isActive, loadedDef)
      } catch {
        alerts.error('Erro', 'Não foi possível carregar o Modelo.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [mode, modelId])

  // Baseline do modo criação (parte do estado vazio).
  useEffect(() => {
    if (mode === 'create') baselineRef.current = serializeForm('', '', true, EMPTY_TREATMENT_DEFINITION)
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

  // Colunas disponíveis: do arquivo enviado, ou derivadas da definição salva.
  const headers = useMemo<string[]>(() => {
    if (preview) return preview.headers
    const fromDef = new Set<string>()
    Object.values(def.columnMapping).forEach((v) => { if (v) fromDef.add(v) })
    if (def.entradaSaida.tipo === 'COLUNA' && def.entradaSaida.coluna) fromDef.add(def.entradaSaida.coluna)
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
  async function handleFile(file: File) {
    setUploading(true)
    try {
      const base64 = await fileToBase64(file)
      const res = await trpc.tratamentoLancamentos.preview.mutate({ fileBase64: base64, filename: file.name })
      setPreview(res as PreviewData)
      setFileName(file.name)
      // Pré-seleção automática da coluna de CNPJ.
      const cnpjCol = res.headers.find((h) => /cnpj/i.test(h))
      if (cnpjCol && !def.columnMapping.documento) {
        setDef((d) => ({ ...d, columnMapping: { ...d.columnMapping, documento: cnpjCol } }))
      }
    } catch {
      alerts.error('Falha ao ler o arquivo', 'Não foi possível detectar uma tabela de lançamentos no arquivo.')
    } finally {
      setUploading(false)
    }
  }

  // ---- Updaters da definição ----------------------------------------------
  function setMap(key: keyof TreatmentDefinition['columnMapping'], value: string) {
    setDef((d) => ({ ...d, columnMapping: { ...d.columnMapping, [key]: value } }))
  }

  function setEsTipo(tipo: 'COLUNA' | 'DESCRICAO') {
    setDef((d) => tipo === 'COLUNA'
      ? { ...d, entradaSaida: { tipo: 'COLUNA', coluna: d.entradaSaida.tipo === 'COLUNA' ? d.entradaSaida.coluna : '', mapa: d.entradaSaida.tipo === 'COLUNA' ? d.entradaSaida.mapa : [] } }
      : { ...d, entradaSaida: { tipo: 'DESCRICAO' } })
  }

  function setEsColuna(coluna: string) {
    setDef((d) => ({ ...d, entradaSaida: { tipo: 'COLUNA', coluna, mapa: d.entradaSaida.tipo === 'COLUNA' ? d.entradaSaida.mapa : [] } }))
  }

  // Troca só o modo ativo — mantém o conteúdo dos DOIS modos (persistido).
  function setCpModo(modo: 'PALAVRA_CHAVE' | 'DESCRICAO') {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, modo } }))
  }

  const esByDescricao = def.entradaSaida.tipo === 'DESCRICAO'

  async function handleBack() {
    if (dirtyRef.current) {
      const ok = await alerts.confirm({
        title: 'Sair sem salvar?',
        text: 'Há alterações não salvas neste modelo. Se sair agora, elas serão perdidas.',
        confirmText: 'Sair sem salvar',
        icon: 'warning',
      })
      if (!ok) return
    }
    router.push('/tratamento-lancamentos')
  }

  async function handleSave() {
    // Validação completa no cliente — coleta TODOS os problemas e os mostra de
    // uma vez, de forma específica (evita o erro genérico vindo do backend).
    const problemas: string[] = []

    if (!nome.trim() || nome.trim().length < 2) problemas.push('Informe um <b>nome</b> para o modelo (mínimo 2 caracteres).')

    if (!def.columnMapping.descricao) problemas.push('Em <b>De/Para de colunas</b>, mapeie a coluna de <b>Descrição do lançamento</b>.')
    if (!def.columnMapping.valor) problemas.push('Em <b>De/Para de colunas</b>, mapeie a coluna de <b>Valor</b>.')
    if (!def.columnMapping.data) problemas.push('Em <b>De/Para de colunas</b>, mapeie a coluna de <b>Data</b>.')

    // Entrada / Saída
    if (def.entradaSaida.tipo === 'COLUNA') {
      if (!def.entradaSaida.coluna.trim()) {
        problemas.push('Em <b>Entrada/Saída</b>, selecione a <b>coluna</b> que define entrada ou saída.')
      } else {
        const distinct = getDistinct(def.entradaSaida.coluna)
        const mapped = new Set(def.entradaSaida.mapa.map((m) => m.valor))
        if (distinct.length) {
          const faltam = distinct.filter((v) => !mapped.has(v))
          if (faltam.length) problemas.push(`Em <b>Entrada/Saída</b>, defina a direção ${faltam.length === 1 ? 'do valor' : 'dos valores'}: ${listaResumo(faltam)}.`)
        } else if (mapped.size === 0) {
          problemas.push('Em <b>Entrada/Saída</b>, defina a direção dos valores da coluna (envie o arquivo de exemplo para listá-los).')
        }
      }
    }

    // Contrapartida (modo ativo)
    if (def.contrapartida.modo === 'PALAVRA_CHAVE') {
      const itens = def.contrapartida.palavraChave
      if (!itens.length) {
        problemas.push('Em <b>Contrapartida</b> (por palavra-chave), adicione ao menos um item.')
      } else {
        const semPalavra = itens.filter((it) => !it.palavraChave.trim()).length
        const semConta = itens.filter((it) => !it.conta.trim()).length
        if (semPalavra) problemas.push(`Em <b>Contrapartida</b>, preencha a <b>palavra-chave</b> em ${semPalavra} ${semPalavra === 1 ? 'item' : 'itens'}.`)
        if (semConta) problemas.push(`Em <b>Contrapartida</b>, informe a <b>conta</b> em ${semConta} ${semConta === 1 ? 'item' : 'itens'}.`)
        if (esByDescricao) {
          const semDir = itens.filter((it) => !it.direcao).length
          if (semDir) problemas.push(`Em <b>Contrapartida</b>, defina <b>Entrada/Saída</b> em ${semDir} ${semDir === 1 ? 'item' : 'itens'}.`)
        }
      }
    } else {
      const itens = def.contrapartida.descricao
      if (!itens.length) {
        problemas.push('Em <b>Contrapartida</b> (por descrição), envie o arquivo de exemplo e mapeie a coluna de descrição para listar as descrições.')
      } else {
        const semConta = itens.filter((it) => !it.conta.trim())
        if (semConta.length) problemas.push(`Em <b>Contrapartida</b>, informe a <b>conta</b> ${semConta.length === 1 ? 'da descrição' : 'das descrições'}: ${listaResumo(semConta.map((it) => it.descricao))}.`)
        if (esByDescricao) {
          const semDir = itens.filter((it) => !it.direcao).length
          if (semDir) problemas.push(`Em <b>Contrapartida</b>, defina <b>Entrada/Saída</b> em ${semDir} ${semDir === 1 ? 'descrição' : 'descrições'}.`)
        }
      }
    }

    if (problemas.length) {
      await alerts.custom({
        title: 'Revise o preenchimento do modelo',
        icon: 'error',
        showCancelButton: false,
        confirmButtonText: 'Entendi',
        html: `<div style="text-align:left"><p style="margin:0 0 8px">Corrija os pontos abaixo antes de salvar:</p><ul style="text-align:left;margin:0;padding-left:1.2em;line-height:1.7">${problemas.map((p) => `<li>${p}</li>`).join('')}</ul></div>`,
      })
      return
    }

    setSaving(true)
    const definition: TreatmentDefinition = { ...def, contaCorrente }
    try {
      if (mode === 'edit' && modelId) {
        const res = await trpc.tratamentoLancamentos.update.mutate({
          id: modelId,
          data: { nome, contaCorrente, isActive, definition, note: note || undefined },
        })
        await alerts.success('Modelo salvo', res.versionCreated ? 'As alterações foram salvas (nova versão gerada).' : 'As alterações foram salvas.')
      } else {
        await trpc.tratamentoLancamentos.create.mutate({ nome, contaCorrente, isActive, definition, note: note || undefined })
        await alerts.success('Modelo criado', `"${nome}" foi criado com sucesso.`)
      }
      dirtyRef.current = false
      router.push('/tratamento-lancamentos')
    } catch {
      alerts.error('Erro ao salvar', 'Não foi possível salvar o Modelo. Revise os campos e tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // Alterações não salvas: compara o estado atual com o baseline.
  const dirty = useMemo(
    () => baselineRef.current !== '' && serializeForm(nome, contaCorrente, isActive, def) !== baselineRef.current,
    [nome, contaCorrente, isActive, def],
  )
  dirtyRef.current = dirty

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando Modelo...
      </div>
    )
  }

  const cpItens = def.contrapartida.modo === 'PALAVRA_CHAVE' ? def.contrapartida.palavraChave : def.contrapartida.descricao

  return (
    <TooltipProvider>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PageHeaderIcon module="contabil" icon={FileSpreadsheet} />
          <div>
            <h1>{mode === 'edit' ? 'Editar Modelo' : 'Novo Modelo de Tratamento'}</h1>
            <p className="text-sm text-muted-foreground">
              Configure o mapeamento usado na conversão para o SCI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
          </Button>
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>

      {/* Dados do Modelo */}
      <Card className="p-5 space-y-4">
        <StepHeader
          icon={Tag} color="bg-violet-500" title="Dados do Modelo"
          hint="Dê um nome fácil de reconhecer para este modelo (por exemplo, o nome do banco ou do cliente). A conta corrente é opcional e pode ser preenchida depois."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Nome <span className="text-destructive">*</span></Label>
            <Input className="h-9 text-sm bg-card" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Banco do Brasil — Conta 12345" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Conta corrente</Label>
            <Input className="h-9 text-sm bg-card" value={contaCorrente} onChange={(e) => setContaCorrente(e.target.value)} placeholder="Número da conta corrente" />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox checked={isActive} onCheckedChange={(v) => setIsActive(!!v)} />
              <span className="text-[13px] font-semibold">Ativo</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Arquivo-exemplo */}
      <Card className="p-5 space-y-4">
        <StepHeader
          icon={Upload} color="bg-sky-500" title="Arquivo de exemplo"
          hint="Envie uma planilha de lançamentos de exemplo (Excel ou CSV). O sistema localiza a tabela e lê os nomes das colunas sozinho — você não precisa arrumar nada no arquivo antes."
        />
        <p className="text-xs text-muted-foreground">
          Envie um arquivo de lançamentos (.xlsx, .xls, .csv) para mapear as colunas. A detecção da tabela é automática.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
          />
          <Button variant="soft" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {fileName ? 'Trocar arquivo' : 'Enviar arquivo'}
          </Button>
          {fileName && (
            <span className="text-xs text-muted-foreground">
              <FileSpreadsheet className="inline h-3.5 w-3.5 mr-1" />
              {fileName} — {preview?.totalRows ?? 0} lançamentos
              {preview?.truncated && ' (prévia limitada)'}
            </span>
          )}
          {/* Formatos não-tabelados (Fase futura — IA) */}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground/70">
            <FileText className="h-3.5 w-3.5 opacity-50" />
            <ImageIcon className="h-3.5 w-3.5 opacity-50" />
            PDF / imagem — em breve
          </span>
        </div>
        {!preview && headers.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" /> Mostrando o mapeamento salvo. Envie o arquivo para revisar valores e distinções.
          </p>
        )}
      </Card>

      {/* De/Para de colunas */}
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
              const samples = samplesFor(value)
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

      {/* Entrada / Saída */}
      <Card className="p-5 space-y-4">
        <StepHeader
          icon={ArrowLeftRight} color="bg-amber-500" title="Definição de Entrada / Saída"
          hint="O sistema precisa saber se cada lançamento é uma entrada (dinheiro que entra) ou uma saída (dinheiro que sai). Escolha se isso vem de uma coluna da planilha ou das descrições dos lançamentos."
        />
        <Toggle
          value={def.entradaSaida.tipo}
          options={[{ value: 'COLUNA', label: 'Por coluna' }, { value: 'DESCRICAO', label: 'Pela descrição' }]}
          onChange={(v) => setEsTipo(v as 'COLUNA' | 'DESCRICAO')}
        />
        {def.entradaSaida.tipo === 'COLUNA' ? (
          headers.length === 0 ? (
            <EmptyHint>Envie um arquivo de exemplo para listar as colunas.</EmptyHint>
          ) : (
          <div className="space-y-4">
            <div className="space-y-1.5 max-w-xs">
              <Label className="text-[13px] font-semibold">Coluna de Entrada/Saída <span className="text-destructive">*</span></Label>
              <ColumnSelect headers={headers} value={def.entradaSaida.coluna} onChange={setEsColuna} />
            </div>
            {def.entradaSaida.coluna && (
              <EntradaSaidaColunaMap def={def} setDef={setDef} coluna={def.entradaSaida.coluna} getDistinct={getDistinct} />
            )}
          </div>
          )
        ) : (
          <div className="flex items-start gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            Faça a definição de entrada/saída em cada item de contrapartida abaixo.
          </div>
        )}
      </Card>

      {/* Contrapartidas */}
      <Card className="p-5 space-y-4">
        <StepHeader
          icon={Network} color="bg-rose-500" title="Mapeamento de contas de contrapartida"
          hint="Informe a conta contábil de contrapartida de cada lançamento. Você pode mapear por palavra-chave encontrada na descrição, ou definir uma conta para cada descrição."
        />
        <Toggle
          value={def.contrapartida.modo}
          options={[{ value: 'DESCRICAO', label: 'Por descrição' }, { value: 'PALAVRA_CHAVE', label: 'Por palavra-chave' }]}
          onChange={(v) => setCpModo(v as 'PALAVRA_CHAVE' | 'DESCRICAO')}
        />

        {def.contrapartida.modo === 'PALAVRA_CHAVE' ? (
          <ContrapartidaPalavraChave def={def} setDef={setDef} esByDescricao={esByDescricao} />
        ) : (
          <ContrapartidaDescricao
            def={def} setDef={setDef} esByDescricao={esByDescricao}
            descricaoColuna={def.columnMapping.descricao || ''} getDistinct={getDistinct}
          />
        )}
        {cpItens.length === 0 && def.contrapartida.modo === 'DESCRICAO' && (
          <EmptyHint>Mapeie a coluna de descrição e envie o arquivo para listar as descrições distintas.</EmptyHint>
        )}
      </Card>

      {/* Nota da versão */}
      <Card className="p-5 space-y-2">
        <Label className="text-[13px] font-semibold">Nota desta versão (opcional)</Label>
        <Input className="h-9 text-sm bg-card" value={note} onChange={(e) => setNote(e.target.value)} placeholder="O que mudou nesta versão?" />
      </Card>
    </div>
    </TooltipProvider>
  )
}

// ============================================================
// Subcomponentes
// ============================================================

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

function Toggle({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-[2px] border border-border/60 bg-muted/20 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-[2px] transition-colors',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
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

/** Mapa valor→direção da coluna de Entrada/Saída, semeando default ENTRADA. */
function EntradaSaidaColunaMap({ def, setDef, coluna, getDistinct }: { def: TreatmentDefinition; setDef: SetDef; coluna: string; getDistinct: (c: string) => string[] }) {
  const distinct = getDistinct(coluna)

  // Poda valores que não existem mais na coluna (ex.: ao trocar de coluna).
  // NÃO semeia defaults — cada direção começa sem seleção (obrigatória).
  useEffect(() => {
    if (!distinct.length) return
    setDef((d) => {
      if (d.entradaSaida.tipo !== 'COLUNA') return d
      const valid = new Set(distinct)
      const mapa = d.entradaSaida.mapa.filter((m) => valid.has(m.valor))
      if (mapa.length === d.entradaSaida.mapa.length) return d
      return { ...d, entradaSaida: { ...d.entradaSaida, mapa } }
    })
  }, [coluna, getDistinct, setDef])

  function setOne(valor: string, direcao: Direcao) {
    setDef((d) => {
      if (d.entradaSaida.tipo !== 'COLUNA') return d
      const mapa = d.entradaSaida.mapa.filter((m) => m.valor !== valor)
      mapa.push({ valor, direcao })
      return { ...d, entradaSaida: { ...d.entradaSaida, mapa } }
    })
  }

  const mapa = def.entradaSaida.tipo === 'COLUNA' ? def.entradaSaida.mapa : []
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
                  <SelectItem value="ENTRADA">Entrada</SelectItem>
                  <SelectItem value="SAIDA">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ContrapartidaPalavraChave({ def, setDef, esByDescricao }: { def: TreatmentDefinition; setDef: SetDef; esByDescricao: boolean }) {
  const itens = def.contrapartida.palavraChave

  function update(i: number, patch: Partial<typeof itens[number]>) {
    setDef((d) => {
      const next = d.contrapartida.palavraChave.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, palavraChave: next } }
    })
  }
  function add() {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: [...d.contrapartida.palavraChave, { palavraChave: '', conta: '', historicoFixo: '' }] } }))
  }
  function remove(i: number) {
    setDef((d) => ({ ...d, contrapartida: { ...d.contrapartida, palavraChave: d.contrapartida.palavraChave.filter((_, idx) => idx !== i) } }))
  }

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">A 1ª palavra-chave encontrada na descrição (esquerda → direita) define a conta.</p>
      {itens.length > 0 && (
        <div className="hidden sm:flex items-center gap-2 px-2 text-[11px] font-medium text-muted-foreground">
          <span className="flex-1 min-w-[140px]">Palavra-chave</span>
          <span className="w-[120px]">Conta</span>
          <span className="flex-1 min-w-[140px] inline-flex items-center gap-1">
            Histórico fixo (opcional) <HelpTip text={HISTORICO_FIXO_HINT} />
          </span>
          {esByDescricao && <span className="w-[120px]">Direção</span>}
          <span className="w-8 shrink-0" />
        </div>
      )}
      <div className="space-y-2">
        {itens.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-[2px] border border-border/60 bg-muted/20 px-2 py-1.5">
            <Input className="h-8 text-xs bg-card flex-1 min-w-[140px]" placeholder="Palavra-chave" value={it.palavraChave} onChange={(e) => update(i, { palavraChave: e.target.value })} />
            <Input className={cn('h-8 text-xs bg-card w-[120px]', !it.conta.trim() && 'border-r-2 border-r-destructive')} placeholder="Conta" value={it.conta} onChange={(e) => update(i, { conta: e.target.value })} />
            <Input className="h-8 text-xs bg-card flex-1 min-w-[140px]" placeholder="Histórico fixo (opcional)" value={it.historicoFixo ?? ''} onChange={(e) => update(i, { historicoFixo: e.target.value })} />
            {esByDescricao && (
              <Select value={it.direcao ?? ''} onValueChange={(v) => update(i, { direcao: v as Direcao })}>
                <SelectTrigger className={cn('h-8 w-[120px] text-xs bg-card', !it.direcao && 'border-r-2 border-r-destructive')}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent><SelectItem value="ENTRADA">Entrada</SelectItem><SelectItem value="SAIDA">Saída</SelectItem></SelectContent>
              </Select>
            )}
            <Button variant="soft-destructive" size="icon-sm" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
      <Button variant="soft" size="sm" onClick={add}><Plus className="h-4 w-4" /> Adicionar palavra-chave</Button>
    </div>
  )
}

function ContrapartidaDescricao({ def, setDef, esByDescricao, descricaoColuna, getDistinct }: {
  def: TreatmentDefinition; setDef: SetDef; esByDescricao: boolean; descricaoColuna: string; getDistinct: (c: string) => string[]
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

  function update(i: number, patch: Partial<typeof itens[number]>) {
    setDef((d) => {
      const next = d.contrapartida.descricao.slice()
      next[i] = { ...next[i]!, ...patch }
      return { ...d, contrapartida: { ...d.contrapartida, descricao: next } }
    })
  }

  if (!itens.length) return null
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">Cada descrição distinta recebe uma conta de contrapartida.</p>
      <div className="rounded-[2px] border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-[130px]">Conta</TableHead>
              <TableHead>
                <span className="inline-flex items-center gap-1">
                  Histórico fixo (opcional)
                  <HelpTip text={HISTORICO_FIXO_HINT} />
                </span>
              </TableHead>
              {esByDescricao && <TableHead className="w-[120px]">Direção</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.map((it, i) => (
              <TableRow key={it.descricao + i}>
                <TableCell className="text-sm max-w-[280px] truncate" title={it.descricao}>{it.descricao}</TableCell>
                <TableCell><Input className={cn('h-8 text-xs bg-card', !it.conta.trim() && 'border-r-2 border-r-destructive')} placeholder="Conta" value={it.conta} onChange={(e) => update(i, { conta: e.target.value })} /></TableCell>
                <TableCell><Input className="h-8 text-xs bg-card" placeholder="Histórico fixo (opcional)" value={it.historicoFixo ?? ''} onChange={(e) => update(i, { historicoFixo: e.target.value })} /></TableCell>
                {esByDescricao && (
                  <TableCell>
                    <Select value={it.direcao ?? ''} onValueChange={(v) => update(i, { direcao: v as Direcao })}>
                      <SelectTrigger className={cn('h-8 text-xs bg-card', !it.direcao && 'border-r-2 border-r-destructive')}><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent><SelectItem value="ENTRADA">Entrada</SelectItem><SelectItem value="SAIDA">Saída</SelectItem></SelectContent>
                    </Select>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---- util ----

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
function serializeForm(nome: string, contaCorrente: string, isActive: boolean, def: TreatmentDefinition): string {
  return stableStringify({ nome: nome.trim(), contaCorrente: contaCorrente.trim(), isActive, def })
}

// Normaliza a definição vinda do banco para o formato atual. Tolerante a
// modelos antigos cuja contrapartida era { modo, itens } (só o modo ativo).
function normalizeDefinition(raw: unknown): TreatmentDefinition {
  const base = EMPTY_TREATMENT_DEFINITION
  if (!raw || typeof raw !== 'object') return base
  const r = raw as {
    contaCorrente?: unknown
    columnMapping?: Partial<TreatmentDefinition['columnMapping']>
    entradaSaida?: unknown
    contrapartida?: { modo?: string; itens?: unknown[]; palavraChave?: unknown[]; descricao?: unknown[] }
  }
  const cp = r.contrapartida
  const modo: ContrapartidaRule['modo'] = cp?.modo === 'PALAVRA_CHAVE' ? 'PALAVRA_CHAVE' : 'DESCRICAO'
  const asPC = (a?: unknown[]) => (Array.isArray(a) ? (a as unknown as ContrapartidaRule['palavraChave']) : [])
  const asDesc = (a?: unknown[]) => (Array.isArray(a) ? (a as unknown as ContrapartidaRule['descricao']) : [])
  const contrapartida: ContrapartidaRule = cp && Array.isArray(cp.itens)
    ? { modo, palavraChave: modo === 'PALAVRA_CHAVE' ? asPC(cp.itens) : [], descricao: modo === 'DESCRICAO' ? asDesc(cp.itens) : [] }
    : { modo, palavraChave: asPC(cp?.palavraChave), descricao: asDesc(cp?.descricao) }
  return {
    contaCorrente: typeof r.contaCorrente === 'string' ? r.contaCorrente : base.contaCorrente,
    columnMapping: { ...base.columnMapping, ...(r.columnMapping ?? {}) },
    entradaSaida: (r.entradaSaida as TreatmentDefinition['entradaSaida']) ?? base.entradaSaida,
    contrapartida,
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.includes(',') ? result.split(',')[1]! : result)
    }
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}
