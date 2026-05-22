'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Database, Upload, Server, RefreshCw, Search,
  Loader2, ClipboardList, Building2,
} from 'lucide-react'
import {
  Button, Input,
  Dialog, DialogContent, DialogBody, DialogFooter,
  DialogTitle, DialogDescription, DialogClose,
} from '@saas/ui'
import { cn } from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

// ============================================================
// Tipos
// ============================================================

interface JobProgress {
  processed: number
  total: number
  phase: 'queued' | 'running' | 'done' | 'error'
  step?: string
  documento?: string
  message?: string
  updated: number
  errors: number
  created?: number
  skipped?: number
  socios_importados?: number
  eta_human?: string
}

interface JobLogEntry {
  documento: string
  razaoSocial: string
  status: 'created' | 'updated' | 'skipped' | 'error'
  message?: string
}

interface IntegracoesModalProps {
  open: boolean
  onClose: () => void
  onRefreshList: () => void
}

// ============================================================
// Integração cards config
// ============================================================

const CARDS = [
  { section: 'Cadastros', items: [
    { id: 'cadastrarConsultas', label: 'Cadastrar das Consultas', desc: 'Cadastra clientes a partir das consultas de situação fiscal já realizadas', icon: ClipboardList, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
    { id: 'cadastrarCnpj', label: 'Cadastrar pelo CNPJ', desc: 'Cadastra um novo cliente buscando dados pelo CNPJ', icon: Search, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20' },
    { id: 'importarClientes', label: 'Importar Clientes', desc: 'Importa lista de clientes a partir de texto (CSV ou um por linha)', icon: Upload, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
  ]},
  { section: 'Importações em lote', items: [
    { id: 'sciLote', label: 'Importação de dados do SCI', desc: 'Atualiza tributação/regime via SCI (Firebird) para clientes CNPJ', icon: Server, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
    { id: 'oneclickLote', label: 'Importar dados do OneClick', desc: 'Importa dados do banco OneClick legado com opções granulares', icon: Database, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20' },
    { id: 'idSistemaSci', label: 'Atualizar ID Sistema (SCI)', desc: 'Busca e atualiza o ID Sistema (BDCODEMP) do SCI para cada cliente CNPJ', icon: Server, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20' },
  ]},
  { section: 'Atualizações', items: [
    { id: 'receitaws', label: 'Atualizar ReceitaWS', desc: 'Atualiza dados cadastrais via BrasilAPI/ReceitaWS (~20s por CNPJ)', icon: RefreshCw, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
    { id: 'serproCnpj', label: 'Atualizar SERPRO CNPJ', desc: 'Atualiza dados via SERPRO Consulta CNPJ (~1s por CNPJ) com importação de sócios', icon: Building2, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' },
  ]},
] as const

// ============================================================
// Hook para polling de jobs
// ============================================================

function useJobPolling(onDone?: () => void) {
  const [progress, setProgress] = useState<JobProgress | null>(null)
  const [logs, setLogs] = useState<JobLogEntry[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logOffsetRef = useRef(0)

  const startPolling = useCallback((id: string) => {
    setJobId(id)
    setLogs([])
    logOffsetRef.current = 0
    setProgress({ processed: 0, total: 0, phase: 'queued', updated: 0, errors: 0 })

    intervalRef.current = setInterval(async () => {
      try {
        const [status, newLogs] = await Promise.all([
          trpc.cliente.integration.jobStatus.query({ jobId: id }) as Promise<JobProgress | null>,
          trpc.cliente.integration.jobLogs.query({ jobId: id, offset: logOffsetRef.current }) as Promise<JobLogEntry[]>,
        ])
        if (!status) return
        setProgress(status)

        if (newLogs.length > 0) {
          logOffsetRef.current += newLogs.length
          setLogs(prev => [...prev, ...newLogs])
        }

        if (status.phase === 'done' || status.phase === 'error') {
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = null
          const finalLogs = await trpc.cliente.integration.jobLogs.query({ jobId: id, offset: logOffsetRef.current }) as JobLogEntry[]
          if (finalLogs.length > 0) setLogs(prev => [...prev, ...finalLogs])
          onDone?.()
        }
      } catch {
        // Ignorar erros de polling
      }
    }, 1500)
  }, [onDone])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setJobId(null)
    setProgress(null)
    setLogs([])
    logOffsetRef.current = 0
  }, [])

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  return { progress, logs, jobId, startPolling, stopPolling }
}

// ============================================================
// Progress Bar component
// ============================================================

function ProgressDisplay({ progress, title, extraFields, logs }: {
  progress: JobProgress
  title: string
  extraFields?: Array<{ label: string; value: string | number; color?: string }>
  logs?: JobLogEntry[]
}) {
  const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0
  return (
    <div className="space-y-4">
      <div className="text-sm font-semibold">{title}</div>

      {/* Barra de progresso */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{progress.processed} de {progress.total}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', progress.phase === 'error' ? 'bg-red-500' : progress.phase === 'done' ? 'bg-emerald-500' : 'bg-sky-500')}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Etapa e documento atual */}
      {progress.step && (
        <div className="text-xs text-muted-foreground">
          {progress.phase === 'running' && <Loader2 className="inline h-3 w-3 animate-spin mr-1" />}
          {progress.step}
          {progress.documento && <span className="ml-1 font-mono">({progress.documento})</span>}
        </div>
      )}

      {/* Contadores */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="text-emerald-600 font-medium">{progress.updated} atualizado(s)</span>
        {(progress.created ?? 0) > 0 && <span className="text-sky-600 font-medium">{progress.created} criado(s)</span>}
        {(progress.skipped ?? 0) > 0 && <span className="text-muted-foreground">{progress.skipped} ignorado(s)</span>}
        {progress.errors > 0 && <span className="text-red-500 font-medium">{progress.errors} erro(s)</span>}
        {(progress.socios_importados ?? 0) > 0 && <span className="text-violet-600">{progress.socios_importados} sócio(s)</span>}
        {extraFields?.map((f, i) => (
          <span key={i} className={f.color || 'text-muted-foreground'}>{f.value} {f.label}</span>
        ))}
      </div>

      {/* ETA */}
      {progress.eta_human && progress.phase === 'running' && (
        <div className="text-[11px] text-muted-foreground">Tempo restante estimado: {progress.eta_human}</div>
      )}

      {/* Mensagem */}
      {progress.message && (
        <div className={cn('text-xs p-2 rounded', progress.phase === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-muted/50 text-muted-foreground')}>
          {progress.message}
        </div>
      )}

      {progress.phase === 'running' && (
        <p className="text-[10px] text-muted-foreground italic">Voce pode fechar esta janela. O processamento continua no servidor.</p>
      )}

      {/* Log detalhado */}
      {logs && logs.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-muted-foreground mb-1">Log de importacao ({logs.length} registros)</div>
          <div className="rounded-md border bg-[#0b1020] text-[11px] font-mono max-h-[250px] overflow-y-auto p-2 space-y-px">
            {logs.map((log, i) => (
              <div key={i} className={cn(
                'flex gap-2 px-1 py-0.5 rounded-sm',
                log.status === 'created' && 'text-emerald-400',
                log.status === 'updated' && 'text-sky-400',
                log.status === 'skipped' && 'text-gray-500',
                log.status === 'error' && 'text-red-400',
              )}>
                <span className="shrink-0 w-[60px] text-right text-gray-600">{log.documento.slice(-8)}</span>
                <span className="shrink-0 w-[70px]">
                  {log.status === 'created' && '[criado]'}
                  {log.status === 'updated' && '[atualiz]'}
                  {log.status === 'skipped' && '[ignorad]'}
                  {log.status === 'error' && '[ERRO]'}
                </span>
                <span className="truncate">{log.razaoSocial}{log.message ? ` — ${log.message}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Componente principal
// ============================================================

export function IntegracoesModal({ open, onClose, onRefreshList }: IntegracoesModalProps) {
  const [activeFlow, setActiveFlow] = useState<string | null>(null)
  const [flowLoading, setFlowLoading] = useState(false)

  // Fluxo 2: CNPJ
  const [cnpjInput, setCnpjInput] = useState('')

  // Fluxo 3: Importar texto
  const [importText, setImportText] = useState('')
  const [importPreencherCnpj, setImportPreencherCnpj] = useState(true)

  // Fluxo 4: SCI fiscal
  const [sciLimit, setSciLimit] = useState(50)
  const [sciForce, setSciForce] = useState(false)

  // Fluxo 5: OneClick
  const [ocLimit, setOcLimit] = useState(50)
  const [ocAllClients, setOcAllClients] = useState(false)
  const [ocForce, setOcForce] = useState(false)
  const [ocFlags, setOcFlags] = useState({
    razao: true, comercial: true, grupo: true, contato: true,
    endereco: true, fiscal: true, registros: true, datas: true,
    areasContratadas: true, socios: true, servicosContratados: true,
    status: false, particularidades: false,
  })
  const [ocIncludeNew, setOcIncludeNew] = useState(false)
  const [ocSkipLeads, setOcSkipLeads] = useState(true)

  // Fluxo 6: ID SCI
  const [idSciLimit, setIdSciLimit] = useState(50)
  const [idSciForce, setIdSciForce] = useState(false)

  // Fluxo 8: SERPRO
  const [serproSocios, setSerproSocios] = useState(true)
  const [serproForceSocios, setSerproForceSocios] = useState(false)

  // Job polling
  const { progress: jobProgress, logs: jobLogs, startPolling, stopPolling } = useJobPolling(() => {
    onRefreshList()
  })

  function resetAndClose() {
    setActiveFlow(null)
    stopPolling()
    onClose()
  }

  const canClose = !flowLoading || !!jobProgress
  const flowTitle = activeFlow === 'cadastrarCnpj' ? 'Cadastrar pelo CNPJ'
    : activeFlow === 'importarClientes' ? 'Importar Clientes'
    : activeFlow === 'sciLote' ? 'Importacao de dados do SCI'
    : activeFlow === 'oneclickLote' ? 'Importar dados do OneClick'
    : activeFlow === 'idSistemaSci' ? 'Atualizar ID Sistema (SCI)'
    : activeFlow === 'serproCnpj' ? 'Atualizar via SERPRO CNPJ'
    : activeFlow === 'receitaws' ? 'Atualizar ReceitaWS'
    : null

  // ── 1. Cadastrar das Consultas ───────────────────────────
  async function handleCadastrarConsultas() {
    setActiveFlow('cadastrarConsultas')
    setFlowLoading(true)
    try {
      const result = await trpc.cliente.integration.cadastrarDasConsultas.mutate() as { cadastrados: number; erros: number; total: number }
      await alerts.success('Cadastro concluido', `${result.cadastrados} cliente(s) cadastrado(s) de ${result.total} consulta(s). ${result.erros} erro(s).`)
      onRefreshList()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
      setActiveFlow(null)
    }
  }

  // ── 2. Cadastrar pelo CNPJ ──────────────────────────────
  async function handleCadastrarCnpj() {
    const doc = cnpjInput.replace(/\D/g, '')
    if (doc.length !== 14) { alerts.error('CNPJ invalido', 'Informe um CNPJ com 14 digitos.'); return }

    setFlowLoading(true)
    try {
      const dados = await trpc.cliente.integration.buscarDadosCnpj.query({ cnpj: doc })
      const ok = await alerts.confirm({
        title: 'Dados encontrados',
        text: `Razao Social: ${dados.razaoSocial}\nMunicipio: ${dados.municipio || '—'} / ${dados.uf || '—'}\n\nDeseja cadastrar este cliente?`,
        confirmText: 'Cadastrar',
        icon: 'question',
      })
      if (!ok) { setFlowLoading(false); return }

      await trpc.cliente.integration.cadastrarPeloCnpj.mutate({ cnpj: doc })
      await alerts.success('Cliente cadastrado', `${dados.razaoSocial} foi cadastrado com sucesso.`)
      setCnpjInput('')
      setActiveFlow(null)
      onRefreshList()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
    }
  }

  // ── 3. Importar clientes (texto) ─────────────────────────
  async function handleImportarTexto() {
    const lines = importText.trim().split('\n').filter(l => l.trim())
    if (!lines.length) { alerts.error('Vazio', 'Cole os dados dos clientes no campo.'); return }

    const clientes = lines.map(line => {
      const parts = line.split(/[;\t,]/).map(p => p.trim())
      return {
        documento: parts[0] || '',
        razao_social: parts[1] || undefined,
        email: parts[2] || undefined,
        telefone: parts[3] || undefined,
        cidade: parts[4] || undefined,
        estado: parts[5] || undefined,
      }
    }).filter(c => c.documento.replace(/\D/g, '').length >= 11)

    if (!clientes.length) { alerts.error('Nenhum valido', 'Nenhum documento valido encontrado.'); return }

    setFlowLoading(true)
    try {
      const { jobId } = await trpc.cliente.integration.importarJob.mutate({
        clientes,
        atualizarExistentes: true,
        preencherPorCnpj: importPreencherCnpj,
      }) as { jobId: string }
      startPolling(jobId)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
    }
  }

  // ── 4. SCI fiscal lote ──────────────────────────────────
  async function handleSciLote() {
    setFlowLoading(true)
    try {
      const result = await trpc.cliente.integration.fiscalSciLote.mutate({
        limit: sciLimit, force: sciForce, onlyMissing: !sciForce,
      }) as { processed: number; updated: number; skipped: number; failed: number }
      await alerts.success('SCI Fiscal concluido', `Processados: ${result.processed} | Atualizados: ${result.updated} | Ignorados: ${result.skipped} | Erros: ${result.failed}`)
      onRefreshList()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
      setActiveFlow(null)
    }
  }

  // ── 5. OneClick lote ─────────────────────────────────────
  async function handleOneClickLote() {
    setFlowLoading(true)
    try {
      const { jobId } = await trpc.cliente.integration.oneclickJob.mutate({
        limit: ocLimit,
        allClients: ocAllClients,
        force: ocForce,
        importFlags: ocFlags,
        includeNewFromOneclick: ocIncludeNew,
        onlyNewFromOneclick: false,
        skipLeads: ocSkipLeads,
      }) as { jobId: string }
      startPolling(jobId)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
    }
  }

  // ── 6. ID Sistema SCI ──────────────────────────────────
  async function handleIdSistemaSci() {
    setFlowLoading(true)
    try {
      const { jobId } = await trpc.cliente.integration.idSistemaSciLote.mutate({
        limit: idSciLimit, force: idSciForce,
      }) as { jobId: string }
      startPolling(jobId)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
    }
  }

  // ── 7. ReceitaWS ────────────────────────────────────────
  async function handleReceitaWs() {
    setFlowLoading(true)
    try {
      const preview = await trpc.cliente.integration.receitawsPreview.query({ filtros: {} }) as { total: number }
      const eta = preview.total * 20
      const etaHuman = eta > 60 ? `${Math.floor(eta / 60)} min ${eta % 60}s` : `${eta}s`

      const ok = await alerts.confirm({
        title: `Atualizar ${preview.total} cliente(s)`,
        text: `Serao consultados ${preview.total} CNPJs via BrasilAPI/ReceitaWS.\nTempo estimado: ${etaHuman} (~20s por CNPJ).\n\nDeseja continuar?`,
        confirmText: 'Iniciar',
        icon: 'question',
      })
      if (!ok) { setFlowLoading(false); return }

      const { jobId } = await trpc.cliente.integration.receitawsJob.mutate({ filtros: {} }) as { jobId: string }
      startPolling(jobId)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
    }
  }

  // ── 8. SERPRO CNPJ ──────────────────────────────────────
  async function handleSerproCnpj() {
    setFlowLoading(true)
    try {
      const preview = await trpc.cliente.integration.serproCnpjPreview.query({ filtros: {} }) as { total: number }

      const ok = await alerts.confirm({
        title: `Atualizar ${preview.total} cliente(s)`,
        text: `Serao consultados ${preview.total} CNPJs via SERPRO Consulta CNPJ.\nTempo estimado: ~${preview.total}s (~1s por CNPJ).\n${serproSocios ? 'QSA (socios) sera importado automaticamente.' : ''}\n\nDeseja continuar?`,
        confirmText: 'Iniciar',
        icon: 'question',
      })
      if (!ok) { setFlowLoading(false); return }

      const { jobId } = await trpc.cliente.integration.serproCnpjJob.mutate({
        filtros: {},
        atualizarSocios: serproSocios,
        forceSocios: serproForceSocios,
      }) as { jobId: string }
      startPolling(jobId)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setFlowLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && canClose) resetAndClose() }}>
      <DialogContent className="max-w-[760px]">
        {/* Header */}
        <DialogHeaderIcon icon={Database} color="emerald">
          <DialogTitle>{flowTitle || 'Integracoes'}</DialogTitle>
          <DialogDescription>
            {flowTitle ? 'Configure as opcoes e inicie o processamento' : 'Importacoes e atualizacoes para clientes'}
          </DialogDescription>
        </DialogHeaderIcon>

        {/* Body */}
        <DialogBody>

          {/* Job progress view */}
          {jobProgress && (
            <div className="space-y-4">
              <ProgressDisplay
                progress={jobProgress}
                logs={jobLogs}
                title={activeFlow === 'importarClientes' ? 'Importando clientes...' :
                  activeFlow === 'oneclickLote' ? 'Importando do OneClick...' :
                  activeFlow === 'idSistemaSci' ? 'Atualizando ID Sistema SCI...' :
                  activeFlow === 'receitaws' ? 'Atualizando via ReceitaWS...' :
                  activeFlow === 'serproCnpj' ? 'Atualizando via SERPRO CNPJ...' :
                  'Processando...'}
              />
            </div>
          )}

          {/* Flow: cadastrar pelo CNPJ */}
          {activeFlow === 'cadastrarCnpj' && !jobProgress && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Informe o CNPJ para buscar os dados automaticamente e cadastrar o cliente.</p>
              <Input
                placeholder="00.000.000/0000-00"
                value={cnpjInput}
                onChange={e => setCnpjInput(e.target.value)}
                className="font-mono"
              />
            </div>
          )}

          {/* Flow: importar clientes texto */}
          {activeFlow === 'importarClientes' && !jobProgress && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Cole a lista de clientes. Formato: <code className="bg-muted px-1 rounded text-[10px]">documento;razao_social;email;telefone;cidade;estado</code> (uma por linha). Separadores aceitos: <code className="bg-muted px-1 rounded text-[10px]">;</code> <code className="bg-muted px-1 rounded text-[10px]">,</code> <code className="bg-muted px-1 rounded text-[10px]">tab</code>
              </p>
              <textarea
                className="w-full h-40 rounded-md border bg-card px-3 py-2 text-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="12345678000100;Empresa Exemplo;email@ex.com;11999990000;Sao Paulo;SP"
                value={importText}
                onChange={e => setImportText(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={importPreencherCnpj} onChange={e => setImportPreencherCnpj(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                Preencher dados automaticamente pelo CNPJ (ReceitaWS)
              </label>
            </div>
          )}

          {/* Flow: SCI fiscal lote */}
          {activeFlow === 'sciLote' && !jobProgress && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Atualiza tributacao/regime via SCI para clientes CNPJ.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Limite</label>
                  <Input type="number" min={1} max={500} value={sciLimit} onChange={e => setSciLimit(Number(e.target.value))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-2 text-xs pb-1.5">
                    <input type="checkbox" checked={sciForce} onChange={e => setSciForce(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                    Forcar sobrescrita
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Flow: OneClick lote */}
          {activeFlow === 'oneclickLote' && !jobProgress && (
            <div className="space-y-5">
              {/* Dados a importar */}
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dados a importar</div>
                <div className="grid grid-cols-2 gap-px bg-border/50 rounded-lg overflow-hidden border border-border/50">
                  {([
                    { key: 'razao', label: 'Razao Social / Fantasia', desc: 'Nome e fantasia' },
                    { key: 'comercial', label: 'Comercial', desc: 'Situacao, tipo, origem' },
                    { key: 'grupo', label: 'Grupo', desc: 'Segmento/grupo' },
                    { key: 'contato', label: 'Contato', desc: 'E-mail e telefone' },
                    { key: 'endereco', label: 'Endereco', desc: 'Logradouro, cidade, UF, CEP' },
                    { key: 'fiscal', label: 'Fiscal', desc: 'Tributacao e regime' },
                    { key: 'registros', label: 'Inscricoes', desc: 'IE e IM' },
                    { key: 'datas', label: 'Datas', desc: 'Entrada e saida' },
                    { key: 'areasContratadas', label: 'Areas contratadas', desc: 'Contabil, Fiscal, Trab...' },
                    { key: 'socios', label: 'Socios (QSA)', desc: 'Importa da tabela cad_soc' },
                    { key: 'servicosContratados', label: 'Servicos contratados', desc: 'Areas, responsaveis (aba Servicos)' },
                    { key: 'particularidades', label: 'Particularidades', desc: 'Obs. por area (6 campos)' },
                    { key: 'status', label: 'Status ativo/inativo', desc: 'Campo cad_cli_ativo' },
                  ] as const).map(({ key, label, desc }) => (
                    <label
                      key={key}
                      className={cn(
                        'flex items-center gap-2.5 px-3 py-2.5 bg-card cursor-pointer transition-colors hover:bg-muted/40',
                        ocFlags[key as keyof typeof ocFlags] && 'bg-emerald-50/60 dark:bg-emerald-950/20',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={ocFlags[key as keyof typeof ocFlags]}
                        onChange={e => setOcFlags(prev => ({ ...prev, [key]: e.target.checked }))}
                        className="h-3.5 w-3.5 rounded accent-emerald-600"
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium leading-tight">{label}</div>
                        <div className="text-[10px] text-muted-foreground leading-tight">{desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" className="text-[10px] text-emerald-600 hover:underline" onClick={() => setOcFlags(prev => Object.fromEntries(Object.keys(prev).map(k => [k, true])) as typeof prev)}>Marcar todos</button>
                  <span className="text-[10px] text-muted-foreground">|</span>
                  <button type="button" className="text-[10px] text-muted-foreground hover:underline" onClick={() => setOcFlags(prev => Object.fromEntries(Object.keys(prev).map(k => [k, false])) as typeof prev)}>Desmarcar todos</button>
                </div>
              </div>

              {/* Opcoes */}
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Opcoes</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Limite de registros</label>
                    <Input type="number" min={1} max={10000} value={ocLimit} onChange={e => setOcLimit(Number(e.target.value))} className="h-8 text-xs" disabled={ocAllClients} />
                  </div>
                  <div className="space-y-2 pt-4">
                    {([
                      { state: ocAllClients, setter: setOcAllClients, label: 'Processar todos' },
                      { state: ocForce, setter: setOcForce, label: 'Forcar sobrescrita' },
                      { state: ocIncludeNew, setter: setOcIncludeNew, label: 'Incluir novos clientes' },
                      { state: ocSkipLeads, setter: setOcSkipLeads, label: 'Ignorar Leads' },
                    ] as const).map(({ state, setter, label }) => (
                      <label key={label} className="flex items-center gap-2 text-[11px] cursor-pointer">
                        <input type="checkbox" checked={state} onChange={e => (setter as (v: boolean) => void)(e.target.checked)} className="h-3.5 w-3.5 rounded accent-emerald-600" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Flow: ID Sistema SCI */}
          {activeFlow === 'idSistemaSci' && !jobProgress && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Busca o ID Sistema (BDCODEMP) do SCI Firebird para cada cliente CNPJ.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Limite</label>
                  <Input type="number" min={1} max={500} value={idSciLimit} onChange={e => setIdSciLimit(Number(e.target.value))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1 flex items-end">
                  <label className="flex items-center gap-2 text-xs pb-1.5">
                    <input type="checkbox" checked={idSciForce} onChange={e => setIdSciForce(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                    Forcar sobrescrita
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Flow: SERPRO CNPJ config */}
          {activeFlow === 'serproCnpj' && !jobProgress && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Atualiza dados cadastrais via API SERPRO Consulta CNPJ com importacao opcional de socios (QSA).</p>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={serproSocios} onChange={e => setSerproSocios(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                Importar QSA (socios) automaticamente
              </label>
              {serproSocios && (
                <label className="flex items-center gap-2 text-xs ml-5">
                  <input type="checkbox" checked={serproForceSocios} onChange={e => setSerproForceSocios(e.target.checked)} className="h-3.5 w-3.5 rounded" />
                  Forcar reimportacao de socios (remove auto-importados e reimporta)
                </label>
              )}
            </div>
          )}

          {/* Cards grid (visao inicial) */}
          {!activeFlow && !jobProgress && (
            <div className="space-y-5">
              {CARDS.map(section => (
                <div key={section.section}>
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">{section.section}</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {section.items.map(card => {
                      const Icon = card.icon
                      return (
                        <button
                          key={card.id}
                          className="group flex flex-col items-start gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/40 hover:border-border"
                          onClick={() => {
                            if (card.id === 'cadastrarConsultas') handleCadastrarConsultas()
                            else if (card.id === 'receitaws') { setActiveFlow('receitaws'); handleReceitaWs() }
                            else setActiveFlow(card.id)
                          }}
                        >
                          <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', card.color)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-semibold">{card.label}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{card.desc}</div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Loading overlay for simple actions */}
          {flowLoading && !activeFlow?.match(/cadastrarCnpj|importarClientes|sciLote|oneclickLote|idSistemaSci|serproCnpj/) && !jobProgress && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Processando...</span>
            </div>
          )}
        </DialogBody>

        {/* Footer */}
        <DialogFooter>
          {/* Botoes de acao do fluxo ativo */}
          {activeFlow === 'cadastrarCnpj' && !jobProgress && (
            <Button variant="success" size="sm" onClick={handleCadastrarCnpj} disabled={flowLoading} className="gap-1.5">
              {flowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar e Cadastrar
            </Button>
          )}
          {activeFlow === 'importarClientes' && !jobProgress && (
            <Button variant="success" size="sm" onClick={handleImportarTexto} disabled={flowLoading} className="gap-1.5">
              {flowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Importar
            </Button>
          )}
          {activeFlow === 'sciLote' && !jobProgress && (
            <Button variant="success" size="sm" onClick={handleSciLote} disabled={flowLoading} className="gap-1.5">
              {flowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
              Iniciar
            </Button>
          )}
          {activeFlow === 'oneclickLote' && !jobProgress && (
            <Button variant="success" size="sm" onClick={handleOneClickLote} disabled={flowLoading} className="gap-1.5">
              {flowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              Iniciar Importacao
            </Button>
          )}
          {activeFlow === 'idSistemaSci' && !jobProgress && (
            <Button variant="success" size="sm" onClick={handleIdSistemaSci} disabled={flowLoading} className="gap-1.5">
              {flowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
              Iniciar
            </Button>
          )}
          {activeFlow === 'serproCnpj' && !jobProgress && (
            <Button variant="success" size="sm" onClick={handleSerproCnpj} disabled={flowLoading} className="gap-1.5">
              {flowLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              Iniciar
            </Button>
          )}

          {/* Voltar (quando em fluxo) */}
          {activeFlow && !jobProgress && (
            <Button variant="outline" size="sm" onClick={() => setActiveFlow(null)}>Voltar</Button>
          )}

          {/* Fechar (quando job terminou) */}
          {jobProgress && (jobProgress.phase === 'done' || jobProgress.phase === 'error') && (
            <Button variant="outline" size="sm" onClick={() => { stopPolling(); setActiveFlow(null) }}>Fechar</Button>
          )}

          {/* Fechar principal */}
          {!activeFlow && !jobProgress && (
            <DialogClose asChild>
              <Button variant="outline" size="sm">Fechar</Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
