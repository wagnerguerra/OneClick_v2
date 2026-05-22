'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  HardDriveDownload, Copy, ExternalLink, RefreshCcw, Trash2,
  CheckCircle2, AlertCircle, Loader2, Folder, Clock, HardDrive,
  Receipt, Briefcase, ShieldCheck,
} from 'lucide-react'
import { Button, Card, Input, Badge } from '@saas/ui'
import { cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'
import { ProgressoWidget, type DistProgresso } from './_progresso-widget'

interface DriveSyncCardProps {
  clienteId: string
}

type FonteTab = 'resumo' | 'drive' | 'local' | 'nfe-sefaz' | 'nfse-nacional'

interface SyncLog {
  id: string
  tipo: string
  iniciadoEm: string
  finalizadoEm: string | null
  status: string
  arquivosVistos: number
  arquivosNovos: number
  arquivosOk: number
  arquivosErro: number
  arquivosIgnorados: number
  erroMensagem: string | null
  itens: unknown
}

interface ClienteDrive {
  driveFolderId?: string | null
  driveFolderName?: string | null
  driveSyncedAt?: string | null
  driveSyncStatus?: string | null
  localFolderPath?: string | null
  localSyncEnabled?: boolean
  localSyncedAt?: string | null
  localSyncStatus?: string | null
  // NFe SEFAZ — NFeDistribuicaoDFe (entradas)
  nfeDistEnabled?: boolean
  nfeDistUltimoNsu?: string | null
  nfeDistSyncedAt?: string | null
  nfeDistSyncStatus?: string | null
  nfeDistSyncRequestedAt?: string | null
  nfeDistCertificadoId?: string | null
  // NFS-e Nacional — ADN (entradas de serviços)
  nfseDistEnabled?: boolean
  nfseDistUltimoNsu?: string | null
  nfseDistSyncedAt?: string | null
  nfseDistSyncStatus?: string | null
  nfseDistSyncRequestedAt?: string | null
  nfseDistCertificadoId?: string | null
}

/** Card de configuração da integração Google Drive por cliente.
 *  Renderizado dentro da aba Fiscal → sub-pill "Drive". */
export function DriveSyncCard({ clienteId }: DriveSyncCardProps) {
  const [info, setInfo] = useState<{ email: string | null; mode: 'oauth' | 'service-account' | null; configurado: boolean; erro?: string } | null>(null)
  const [cliente, setCliente] = useState<ClienteDrive | null>(null)
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [resumoFiscal, setResumoFiscal] = useState<{ totalNfe: number; totalNfse: number } | null>(null)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [folderInput, setFolderInput] = useState('')
  const [vinculando, setVinculando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [progresso, setProgresso] = useState<{ etapa: string; atual: number; total: number; nome: string } | null>(null)
  const [fonteAtiva, setFonteAtiva] = useState<FonteTab>('resumo')
  const [certA1Ativo, setCertA1Ativo] = useState<{ id: string; descricao: string; expiraEm: string } | null>(null)

  const carregarTudo = useCallback(async () => {
    setLoadingLogs(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const certsP = (trpc as any).certificadoDigital.list.query({ clienteId, status: 'ATIVO' })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((rows: any[]) => {
          const cert = (rows ?? []).find(c => c.tipo === 'A1' && !c.arquivado)
          if (cert) {
            const exp = cert.expiraEm ? new Date(cert.expiraEm).toLocaleDateString('pt-BR') : '?'
            setCertA1Ativo({
              id: cert.id,
              descricao: cert.nome ?? cert.cnpj ?? cert.titular ?? cert.id,
              expiraEm: exp,
            })
          } else {
            setCertA1Ativo(null)
          }
        })
        .catch(() => setCertA1Ativo(null))

      const [infoR, clienteR, logsR, resumoR] = await Promise.all([
        (trpc as any).drive.info.query(),
        trpc.cliente.getById.query({ id: clienteId }),
        (trpc as any).drive.listarLogs.query({ clienteId, limit: 20 }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (trpc as any).drive.getResumoFiscal.query({ clienteId }).catch(() => ({ totalNfe: 0, totalNfse: 0 })),
      ])
      setInfo(infoR)
      setCliente(clienteR as ClienteDrive)
      setLogs(logsR as SyncLog[])
      setResumoFiscal(resumoR as { totalNfe: number; totalNfse: number })
    } finally {
      setLoadingLogs(false)
    }
  }, [clienteId])

  useEffect(() => { carregarTudo() }, [carregarTudo])

  // Polling do progresso enquanto sincronizando — 1s entre polls
  useEffect(() => {
    if (!sincronizando) {
      setProgresso(null)
      return
    }
    let cancelado = false
    const tick = async () => {
      try {
        const r = await (trpc as any).drive.getProgressoAtual.query({ clienteId })
        if (cancelado) return
        if (r?.progresso) setProgresso(r.progresso)
      } catch { /* silencioso */ }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { cancelado = true; clearInterval(id) }
  }, [sincronizando, clienteId])

  async function handleVincular() {
    if (!folderInput.trim()) return
    setVinculando(true)
    try {
      const r = await (trpc as any).drive.vincularPasta.mutate({ clienteId, folderInput })
      alerts.success('Pasta vinculada', `Folder: ${r.folderName}`)
      setFolderInput('')
      carregarTudo()
    } catch (e) {
      alerts.error('Erro ao vincular', (e as Error).message)
    } finally {
      setVinculando(false)
    }
  }

  async function handleDesvincular() {
    if (!(await alerts.confirmDelete('o vínculo com esta pasta'))) return
    try {
      await (trpc as any).drive.desvincularPasta.mutate({ clienteId })
      alerts.success('Pasta desvinculada')
      carregarTudo()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function handleSincronizar() {
    setSincronizando(true)
    try {
      const r = await (trpc as any).drive.sincronizarCliente.mutate({ clienteId })
      const partes = [`${r.arquivosOk} novos`, `${r.arquivosVistos} vistos`]
      if (r.arquivosIgnorados > 0) partes.push(`${r.arquivosIgnorados} ignorados`)
      if (r.arquivosErro > 0) partes.push(`${r.arquivosErro} erros`)
      alerts.success('Sincronização concluída', partes.join(' · '))
      carregarTudo()
    } catch (e) {
      alerts.error('Erro na sincronização', (e as Error).message)
    } finally {
      setSincronizando(false)
    }
  }

  function copiarEmail() {
    if (!info?.email) return
    navigator.clipboard.writeText(info.email)
    alerts.success('Copiado', 'Email na área de transferência.')
  }

  // ── Render ─────────────────────────────────────────────

  if (!info) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!info.configurado) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/40 dark:bg-amber-950/40">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <div className="font-semibold text-amber-900 dark:text-amber-200">Credenciais Google não configuradas</div>
            <p className="mt-1 text-amber-800 dark:text-amber-300">
              Configure as variáveis no <code>.env</code> da API. Veja <code>docs/INTEGRACAO-GOOGLE-DRIVE.md</code> para o passo a passo.
            </p>
            {info.erro && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">Detalhe: {info.erro}</p>}
          </div>
        </div>
      </div>
    )
  }

  const vinculada = !!cliente?.driveFolderId
  const isOAuth = info.mode === 'oauth'

  return (
    <div className="space-y-4">
      {/* Tabs Fonte: Resumo / Drive / Pasta local */}
      <div className="flex gap-0 border-b">
        <button
          type="button"
          onClick={() => setFonteAtiva('resumo')}
          className={cn(
            'px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
            fonteAtiva === 'resumo'
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
          )}
        >
          <Clock className="h-3.5 w-3.5" /> Resumo
        </button>
        <button
          type="button"
          onClick={() => setFonteAtiva('drive')}
          className={cn(
            'px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
            fonteAtiva === 'drive'
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
          )}
        >
          <HardDriveDownload className="h-3.5 w-3.5" /> Google Drive
          {vinculada && <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </button>
        <button
          type="button"
          onClick={() => setFonteAtiva('local')}
          className={cn(
            'px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
            fonteAtiva === 'local'
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
          )}
        >
          <HardDrive className="h-3.5 w-3.5" /> Pasta local (PC)
          {cliente?.localSyncEnabled && <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </button>
        <button
          type="button"
          onClick={() => setFonteAtiva('nfe-sefaz')}
          className={cn(
            'px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
            fonteAtiva === 'nfe-sefaz'
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
          )}
        >
          <Receipt className="h-3.5 w-3.5" /> NFe SEFAZ
          {cliente?.nfeDistEnabled && <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </button>
        <button
          type="button"
          onClick={() => setFonteAtiva('nfse-nacional')}
          className={cn(
            'px-3 py-2 text-xs font-medium flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
            fonteAtiva === 'nfse-nacional'
              ? 'border-sky-500 text-sky-600'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
          )}
        >
          <Briefcase className="h-3.5 w-3.5" /> NFS-e Nacional
          {cliente?.nfseDistEnabled && <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        </button>
      </div>

      {fonteAtiva === 'resumo' ? (
        <ResumoSection logs={logs} loading={loadingLogs} cliente={cliente} resumoFiscal={resumoFiscal} />
      ) : fonteAtiva === 'local' ? (
        <PastaLocalSection
          clienteId={clienteId}
          cliente={cliente}
          onChange={carregarTudo}
        />
      ) : fonteAtiva === 'nfe-sefaz' ? (
        <NfeSefazSection
          clienteId={clienteId}
          cliente={cliente}
          certA1Ativo={certA1Ativo}
          onChange={carregarTudo}
        />
      ) : fonteAtiva === 'nfse-nacional' ? (
        <NfseNacionalSection
          clienteId={clienteId}
          cliente={cliente}
          certA1Ativo={certA1Ativo}
          onChange={carregarTudo}
        />
      ) : (
      <>

      {/* Conta conectada */}
      <div className="rounded-md border border-border bg-muted/40 p-3">
        <div className="text-[11px] font-semibold uppercase text-muted-foreground">
          {isOAuth ? 'Conectado como (OAuth)' : 'Email da Service Account'}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-background px-2 py-1 text-xs font-mono">
            {info.email}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={copiarEmail} title="Copiar">
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {isOAuth
            ? <>O sistema lê o Drive em nome desta conta. Garanta que ela tem acesso à pasta do cliente.</>
            : <>Compartilhe a pasta do cliente com este email no Google Drive (permissão: <b>Leitor</b>).</>}
        </p>
      </div>

      {/* Vínculo atual */}
      {vinculada ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/40">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-emerald-600" />
                <span className="truncate text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  {cliente?.driveFolderName ?? '(sem nome)'}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-emerald-900/80 dark:text-emerald-300/80">
                <span>
                  <b>Última sync:</b>{' '}
                  {cliente?.driveSyncedAt
                    ? new Date(cliente.driveSyncedAt).toLocaleString('pt-BR')
                    : 'Nunca'}
                </span>
                <span>
                  <b>Status:</b>{' '}
                  {cliente?.driveSyncStatus === 'ok' && <Badge className="bg-emerald-600 text-white">OK</Badge>}
                  {cliente?.driveSyncStatus === 'erro' && <Badge className="bg-red-600 text-white">Erro</Badge>}
                  {(!cliente?.driveSyncStatus || cliente.driveSyncStatus === 'nunca') && (
                    <Badge className="bg-slate-500 text-white">Aguardando</Badge>
                  )}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={handleSincronizar}
                disabled={sincronizando}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
                {sincronizando ? 'Sincronizando...' : 'Sincronizar agora'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => window.open(`https://drive.google.com/drive/folders/${cliente?.driveFolderId}`, '_blank')}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={handleDesvincular} className="text-red-600 hover:text-red-700">
                <Trash2 className="h-3.5 w-3.5" /> Desvincular
              </Button>
            </div>
          </div>

          {/* Barra de progresso enquanto sincroniza */}
          {sincronizando && (
            <div className="mt-3 pt-3 border-t border-emerald-200/60 dark:border-emerald-900/40">
              <div className="flex items-center justify-between text-[11px] text-emerald-900 dark:text-emerald-200 mb-1.5">
                <span className="font-semibold capitalize">
                  {progresso?.etapa === 'varrendo'
                    ? 'Varrendo pasta...'
                    : progresso?.total
                      ? `Processando arquivo ${progresso.atual} de ${progresso.total}`
                      : 'Iniciando...'}
                </span>
                {progresso?.total ? (
                  <span className="tabular-nums">{Math.round((progresso.atual / progresso.total) * 100)}%</span>
                ) : null}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-200/40 dark:bg-emerald-900/40">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300"
                  style={{
                    width: progresso?.total
                      ? `${Math.min(100, (progresso.atual / progresso.total) * 100)}%`
                      : '10%',
                    animation: progresso?.total ? undefined : 'pulse 1.5s ease-in-out infinite',
                  }}
                />
              </div>
              {progresso?.nome && (
                <div className="mt-1.5 text-[10px] text-emerald-800/70 dark:text-emerald-300/70 truncate" title={progresso.nome}>
                  {progresso.nome}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-background p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <HardDriveDownload className="h-4 w-4 text-muted-foreground" /> Vincular pasta do Google Drive
          </div>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Cole a URL da pasta (ex: <code>drive.google.com/drive/folders/...</code>) ou só o ID.
            A pasta precisa estar compartilhada com o email da Service Account acima.
          </p>
          <div className="flex items-center gap-2">
            <Input
              placeholder="https://drive.google.com/drive/folders/..."
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              className="text-xs"
            />
            <Button
              type="button"
              size="sm"
              onClick={handleVincular}
              disabled={vinculando || !folderInput.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {vinculando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Vincular'}
            </Button>
          </div>
        </div>
      )}

      </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-componente: configuração de pasta local
// ─────────────────────────────────────────────────────────────
function PastaLocalSection({
  clienteId,
  cliente,
  onChange,
}: {
  clienteId: string
  cliente: ClienteDrive | null
  onChange: () => void
}) {
  const [path, setPath] = useState(cliente?.localFolderPath ?? '')
  const [enabled, setEnabled] = useState(cliente?.localSyncEnabled ?? false)
  const [salvando, setSalvando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setPath(cliente?.localFolderPath ?? '')
    setEnabled(cliente?.localSyncEnabled ?? false)
    setDirty(false)
  }, [cliente?.localFolderPath, cliente?.localSyncEnabled])

  async function handleSalvar() {
    setSalvando(true)
    try {
      await (trpc as any).drive.configurarPastaLocal.mutate({ clienteId, path, enabled })
      await alerts.success('Salvo', enabled
        ? 'Pasta configurada. O Launcher (Service Manager) detecta automaticamente.'
        : 'Configuração desativada.')
      setDirty(false)
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function handleSincronizarAgora() {
    setSincronizando(true)
    try {
      await (trpc as any).drive.solicitarSyncLocal.mutate({ clienteId })
      await alerts.success(
        'Sincronização solicitada',
        'O Launcher (Service Manager) vai fazer a varredura completa em até 15s.',
      )
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSincronizando(false)
    }
  }

  const statusBadge = (() => {
    if (!cliente?.localSyncEnabled) return null
    const s = cliente.localSyncStatus
    if (s === 'ok') return <Badge className="bg-emerald-600 text-white">Monitorando · OK</Badge>
    if (s === 'monitorando') return <Badge className="bg-sky-600 text-white">Monitorando</Badge>
    if (s === 'erro') return <Badge className="bg-red-600 text-white">Erro</Badge>
    if (s === 'aguardando_daemon') return <Badge className="bg-amber-500 text-white">Aguardando daemon</Badge>
    return <Badge className="bg-slate-500 text-white">Configurado</Badge>
  })()

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border p-4 space-y-3">
        {/* Path */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-semibold uppercase text-muted-foreground">Caminho da pasta</label>
            {statusBadge}
          </div>
          <Input
            value={path}
            onChange={(e) => { setPath(e.target.value); setDirty(true) }}
            placeholder="C:\xmls\adria  ou  \\servidor\nfes\adria"
            className="text-xs font-mono"
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            Caminho absoluto da pasta no PC onde o Launcher está rodando. Pode incluir subpastas — a varredura é recursiva.
          </p>
        </div>

        {/* Toggle ativo */}
        <div className="flex items-center justify-between rounded border p-2">
          <div>
            <div className="text-xs font-semibold">Monitoramento ativo</div>
            <p className="text-[10px] text-muted-foreground">Quando ligado, o Launcher envia arquivos automaticamente.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => { setEnabled(!enabled); setDirty(true) }}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
              enabled ? 'bg-emerald-500' : 'bg-rose-300 dark:bg-rose-900/50',
            )}
          >
            <span className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
            )} />
          </button>
        </div>

        {/* Última sync */}
        {cliente?.localSyncedAt && (
          <div className="text-[11px] text-muted-foreground">
            <Clock className="inline h-3 w-3 mr-1" />
            Última atividade: {new Date(cliente.localSyncedAt).toLocaleString('pt-BR')}
          </div>
        )}

        {/* Ações */}
        <div className="flex justify-between gap-2 pt-2 border-t">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSincronizarAgora}
            disabled={sincronizando || !cliente?.localSyncEnabled || !cliente?.localFolderPath}
          >
            {sincronizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            {sincronizando ? 'Solicitado...' : 'Sincronizar agora'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSalvar}
            disabled={salvando || !dirty}
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {salvando ? 'Salvando...' : 'Salvar configuração'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-componente: Resumo (logs de todas as fontes)
// ─────────────────────────────────────────────────────────────
function ResumoSection({ logs, loading, cliente, resumoFiscal }: {
  logs: SyncLog[]
  loading: boolean
  cliente: ClienteDrive | null
  resumoFiscal: { totalNfe: number; totalNfse: number } | null
}) {
  // Agregação geral
  const totalArquivosOk = logs.reduce((s, l) => s + (l.arquivosOk ?? 0), 0)
  const totalArquivosErro = logs.reduce((s, l) => s + (l.arquivosErro ?? 0), 0)
  const totalArquivosIgnorados = logs.reduce((s, l) => s + (l.arquivosIgnorados ?? 0), 0)

  // Agrupa por fonte (drive / local)
  const driveLogs = logs.filter(l => !l.tipo.startsWith('local'))
  const localLogs = logs.filter(l => l.tipo.startsWith('local'))

  function statusLabel(status: string | null | undefined): { label: string; cls: string } {
    if (status === 'ok') return { label: 'Sincronizado', cls: 'text-emerald-600' }
    if (status === 'erro') return { label: 'Erro', cls: 'text-red-600' }
    if (status === 'aguardando') return { label: 'Aguardando', cls: 'text-amber-600' }
    return { label: 'Nunca sincronizou', cls: 'text-muted-foreground' }
  }
  function fmtData(iso: string | null | undefined): string {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }
  const nfeStatus = statusLabel(cliente?.nfeDistSyncStatus)
  const nfseStatus = statusLabel(cliente?.nfseDistSyncStatus)

  function fonteBadge(tipo: string) {
    if (tipo === 'nfe-sefaz') {
      return <Badge className="bg-violet-100 text-violet-800 border-0 text-[9px] py-0 px-1.5">NFe SEFAZ</Badge>
    }
    if (tipo === 'nfse-nacional') {
      return <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[9px] py-0 px-1.5">NFS-e</Badge>
    }
    if (tipo.startsWith('local')) {
      return <Badge className="bg-amber-100 text-amber-800 border-0 text-[9px] py-0 px-1.5">Local</Badge>
    }
    return <Badge className="bg-sky-100 text-sky-800 border-0 text-[9px] py-0 px-1.5">Drive</Badge>
  }

  function tipoLabel(tipo: string) {
    if (tipo === 'nfe-sefaz' || tipo === 'nfse-nacional') return 'Automático'
    if (tipo === 'local_auto') return 'Automático'
    if (tipo === 'local_manual') return 'Manual'
    if (tipo === 'automatico') return 'Automático'
    if (tipo === 'manual') return 'Manual'
    return tipo
  }

  return (
    <div className="space-y-4">
      {/* Stats agregados */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total importadas</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">{totalArquivosOk}</div>
        </div>
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Drive</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{driveLogs.length}</div>
          <div className="text-[10px] text-muted-foreground">sincronizações</div>
        </div>
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pasta local</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{localLogs.length}</div>
          <div className="text-[10px] text-muted-foreground">sincronizações</div>
        </div>
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Erros / Ignorados</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-red-600">{totalArquivosErro}</span>
            <span className="text-sm text-slate-500">/ {totalArquivosIgnorados}</span>
          </div>
        </div>
      </div>

      {/* Indicadores de sincronização fiscal (NFe SEFAZ + NFS-e Nacional) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* NFe SEFAZ */}
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3 w-3" /> NFe SEFAZ (entradas)
            </div>
            <Badge className={cn(
              'text-[9px] py-0 px-1.5 border-0',
              cliente?.nfeDistSyncStatus === 'ok' && 'bg-emerald-100 text-emerald-800',
              cliente?.nfeDistSyncStatus === 'erro' && 'bg-red-100 text-red-800',
              cliente?.nfeDistSyncStatus === 'aguardando' && 'bg-amber-100 text-amber-800',
              !cliente?.nfeDistSyncStatus && 'bg-slate-100 text-slate-800',
            )}>{cliente?.nfeDistEnabled ? nfeStatus.label : 'Desabilitado'}</Badge>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold tabular-nums text-violet-600">{resumoFiscal?.totalNfe ?? 0}</span>
            <span className="text-[11px] text-muted-foreground">nota(s) baixada(s)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-border pt-2">
            <div>
              <div className="text-muted-foreground">Último NSU</div>
              <div className="font-semibold tabular-nums">{cliente?.nfeDistUltimoNsu ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Última sync</div>
              <div className="font-semibold">{fmtData(cliente?.nfeDistSyncedAt)}</div>
            </div>
          </div>
        </div>

        {/* NFS-e Nacional */}
        <div className="rounded-md border bg-muted/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Briefcase className="h-3 w-3" /> NFS-e Nacional (serviços tomados)
            </div>
            <Badge className={cn(
              'text-[9px] py-0 px-1.5 border-0',
              cliente?.nfseDistSyncStatus === 'ok' && 'bg-emerald-100 text-emerald-800',
              cliente?.nfseDistSyncStatus === 'erro' && 'bg-red-100 text-red-800',
              cliente?.nfseDistSyncStatus === 'aguardando' && 'bg-amber-100 text-amber-800',
              !cliente?.nfseDistSyncStatus && 'bg-slate-100 text-slate-800',
            )}>{cliente?.nfseDistEnabled ? nfseStatus.label : 'Desabilitado'}</Badge>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold tabular-nums text-emerald-600">{resumoFiscal?.totalNfse ?? 0}</span>
            <span className="text-[11px] text-muted-foreground">nota(s) baixada(s)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] border-t border-border pt-2">
            <div>
              <div className="text-muted-foreground">Último NSU</div>
              <div className="font-semibold tabular-nums">{cliente?.nfseDistUltimoNsu ?? '—'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Última sync</div>
              <div className="font-semibold">{fmtData(cliente?.nfseDistSyncedAt)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela unificada */}
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4 text-muted-foreground" /> Últimas sincronizações
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Nenhuma sincronização ainda. Configure uma fonte (Drive ou Pasta local) nas próximas abas.
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Quando</th>
                  <th className="px-3 py-2 text-left font-semibold">Fonte</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2 text-center font-semibold">Vistos</th>
                  <th className="px-3 py-2 text-center font-semibold">Novos</th>
                  <th className="px-3 py-2 text-center font-semibold" title="CCe, cancelamento, inutilização — não são NFe">Ign.</th>
                  <th className="px-3 py-2 text-center font-semibold">Erros</th>
                  <th className="px-3 py-2 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-border">
                    <td className="px-3 py-2">{new Date(log.iniciadoEm).toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2">{fonteBadge(log.tipo)}</td>
                    <td className="px-3 py-2">{tipoLabel(log.tipo)}</td>
                    <td className="px-3 py-2 text-center">{log.arquivosVistos}</td>
                    <td className={cn('px-3 py-2 text-center font-semibold', log.arquivosOk > 0 && 'text-emerald-600')}>
                      {log.arquivosOk}
                    </td>
                    <td className={cn('px-3 py-2 text-center', log.arquivosIgnorados > 0 && 'text-slate-500')}>
                      {log.arquivosIgnorados}
                    </td>
                    <td className={cn('px-3 py-2 text-center', log.arquivosErro > 0 && 'font-semibold text-red-600')}>
                      {log.arquivosErro}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {log.status === 'completed' && <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" />}
                      {log.status === 'error' && <AlertCircle className="mx-auto h-4 w-4 text-red-600" />}
                      {log.status === 'running' && <Loader2 className="mx-auto h-4 w-4 animate-spin text-sky-600" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-componente: NFe SEFAZ (NFeDistribuicaoDFe — entradas)
// ─────────────────────────────────────────────────────────────
function NfeSefazSection({
  clienteId,
  cliente,
  certA1Ativo,
  onChange,
}: {
  clienteId: string
  cliente: ClienteDrive | null
  certA1Ativo: { id: string; descricao: string; expiraEm: string } | null
  onChange: () => void
}) {
  const [enabled, setEnabled] = useState(cliente?.nfeDistEnabled ?? false)
  const [salvando, setSalvando] = useState(false)
  const [solicitando, setSolicitando] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [progresso, setProgresso] = useState<DistProgresso | null>(null)

  // Polling — enquanto houver request pendente OU progresso ativo, busca a cada 2s
  useEffect(() => {
    const haRequest = !!cliente?.nfeDistSyncRequestedAt
    if (!haRequest && !progresso) return
    let cancelado = false
    const tick = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (trpc as any).nfeDist.getProgressoAtual.query({ clienteId })
        if (cancelado) return
        if (r) setProgresso(r as DistProgresso)
        else if (progresso) {
          // Daemon terminou — limpa e força reload do cliente
          setProgresso(null)
          onChange()
        }
      } catch { /* */ }
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => { cancelado = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, cliente?.nfeDistSyncRequestedAt, progresso?.etapa])

  useEffect(() => {
    setEnabled(cliente?.nfeDistEnabled ?? false)
    setDirty(false)
  }, [cliente?.nfeDistEnabled])

  async function handleSalvar() {
    setSalvando(true)
    try {
      // Usa fetch nativo com timeout em vez do trpc client — em alguns browsers
      // o POST do trpc client trava em pending sem timeout. Ver trpc-fetch.ts.
      await trpcMutate('nfeDist.configurar', {
        clienteId,
        enabled,
        certificadoId: cliente?.nfeDistCertificadoId ?? null,
      })
      await alerts.success(
        'Configuração salva',
        enabled
          ? 'NFe SEFAZ ativada. O scheduler vai consultar diariamente às 3:30.'
          : 'NFe SEFAZ desativada.',
      )
      setDirty(false)
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function handleBuscarAgora() {
    setSolicitando(true)
    try {
      await (trpc as any).nfeDist.solicitarSync.mutate({ clienteId })
      await alerts.success(
        'Solicitação enviada',
        'O scheduler vai processar em até 60s.',
      )
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSolicitando(false)
    }
  }

  async function handleResyncDesdeNsu() {
    const ultimoNsu = cliente?.nfeDistUltimoNsu ?? '0'
    const sugestao = ultimoNsu === '0' ? '0' : String(Math.max(0, Number(ultimoNsu) - 50))
    const nsu = await alerts.input({
      title: 'Re-sincronizar desde NSU',
      text: `NSU atual: ${ultimoNsu}. Informe o NSU a partir do qual deseja re-baixar. Use 0 para o histórico completo. Dedup automática evita duplicar notas já no banco.`,
      inputLabel: 'NSU inicial',
      inputPlaceholder: sugestao,
      confirmText: 'Re-sincronizar',
    })
    if (nsu === null) return
    setSolicitando(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trpc as any).nfeDist.resincronizarDesdeNsu.mutate({ clienteId, nsu: nsu || sugestao })
      await alerts.success(
        'Re-sincronização agendada',
        `Scheduler vai processar a partir do NSU ${nsu || sugestao} em até 60s. Pode levar alguns minutos dependendo do histórico.`,
      )
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSolicitando(false)
    }
  }

  const statusBadge = (() => {
    if (!cliente?.nfeDistEnabled) return null
    const s = cliente.nfeDistSyncStatus
    if (s === 'ok') return <Badge className="bg-emerald-600 text-white">Sincronizado</Badge>
    if (s === 'erro') return <Badge className="bg-red-600 text-white">Erro</Badge>
    if (s === 'aguardando') return <Badge className="bg-amber-500 text-white">Aguardando próxima sync</Badge>
    return <Badge className="bg-slate-500 text-white">Nunca sincronizou</Badge>
  })()

  const temCertificado = !!certA1Ativo

  return (
    <div className="space-y-4">
      {/* Aviso sobre certificado */}
      {!temCertificado ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/40">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="text-[11px] text-amber-900 dark:text-amber-200">
              <div className="font-semibold">Certificado A1 não vinculado</div>
              <p className="mt-0.5">
                Este cliente não tem certificado A1 ativo. Vincule um certificado na aba <b>Certificados</b> antes
                de ativar a busca automática — o web service da SEFAZ exige assinatura digital.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3">
          <div className="flex items-center gap-2 text-[11px] text-emerald-900 dark:text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>
              <b>Certificado A1:</b> {certA1Ativo?.descricao} · válido até {certA1Ativo?.expiraEm}
            </span>
          </div>
        </div>
      )}

      <ProgressoWidget progresso={progresso} solicitado={!!cliente?.nfeDistSyncRequestedAt} cor="sky" />

      <div className="rounded-md border border-border p-4 space-y-3">
        {/* Toggle ativo */}
        <div className="flex items-center justify-between rounded border p-2">
          <div>
            <div className="text-xs font-semibold">Busca automática ativa</div>
            <p className="text-[10px] text-muted-foreground">
              Quando ligado, o sistema consulta a SEFAZ todo dia às 3:30 e importa as NFe novas.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => { setEnabled(!enabled); setDirty(true) }}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
              enabled ? 'bg-emerald-500' : 'bg-rose-300 dark:bg-rose-900/50',
            )}
          >
            <span className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
            )} />
          </button>
        </div>

        {/* Status e infos read-only */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="mt-1">{statusBadge ?? <Badge className="bg-slate-500 text-white">Desativado</Badge>}</div>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Última sincronização</div>
            <div className="mt-1 text-foreground tabular-nums">
              {cliente?.nfeDistSyncedAt
                ? new Date(cliente.nfeDistSyncedAt).toLocaleString('pt-BR')
                : <span className="text-muted-foreground">Nunca</span>}
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Último NSU</div>
            <div className="mt-1 font-mono text-foreground tabular-nums">
              {cliente?.nfeDistUltimoNsu ?? <span className="text-muted-foreground font-sans">—</span>}
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Próxima sincronização</div>
            <div className="mt-1 text-foreground">
              <Clock className="inline h-3 w-3 mr-1" /> Diária às 3:30
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-between gap-2 pt-2 border-t">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleBuscarAgora}
              disabled={solicitando || !cliente?.nfeDistEnabled || !temCertificado}
            >
              {solicitando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              {solicitando ? 'Solicitado...' : 'Buscar agora'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleResyncDesdeNsu}
              disabled={solicitando || !cliente?.nfeDistEnabled || !temCertificado}
              title="Re-baixar notas a partir de um NSU específico"
            >
              Re-sincronizar...
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSalvar}
            disabled={salvando || !dirty}
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {salvando ? 'Salvando...' : 'Salvar configuração'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Sub-componente: NFS-e Nacional (ADN — entradas de serviços)
// ─────────────────────────────────────────────────────────────
function NfseNacionalSection({
  clienteId,
  cliente,
  certA1Ativo,
  onChange,
}: {
  clienteId: string
  cliente: ClienteDrive | null
  certA1Ativo: { id: string; descricao: string; expiraEm: string } | null
  onChange: () => void
}) {
  const [enabled, setEnabled] = useState(cliente?.nfseDistEnabled ?? false)
  const [salvando, setSalvando] = useState(false)
  const [solicitando, setSolicitando] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [progresso, setProgresso] = useState<DistProgresso | null>(null)

  useEffect(() => {
    const haRequest = !!cliente?.nfseDistSyncRequestedAt
    if (!haRequest && !progresso) return
    let cancelado = false
    const tick = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = await (trpc as any).nfseDist.getProgressoAtual.query({ clienteId })
        if (cancelado) return
        if (r) setProgresso(r as DistProgresso)
        else if (progresso) { setProgresso(null); onChange() }
      } catch { /* */ }
    }
    tick()
    const id = setInterval(tick, 2000)
    return () => { cancelado = true; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId, cliente?.nfseDistSyncRequestedAt, progresso?.etapa])

  useEffect(() => {
    setEnabled(cliente?.nfseDistEnabled ?? false)
    setDirty(false)
  }, [cliente?.nfseDistEnabled])

  async function handleSalvar() {
    setSalvando(true)
    try {
      await trpcMutate('nfseDist.configurar', {
        clienteId,
        enabled,
        certificadoId: cliente?.nfseDistCertificadoId ?? null,
      })
      await alerts.success(
        'Configuração salva',
        enabled
          ? 'NFS-e Nacional ativada. O scheduler vai consultar diariamente às 3:45.'
          : 'NFS-e Nacional desativada.',
      )
      setDirty(false)
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function handleBuscarAgora() {
    setSolicitando(true)
    try {
      await (trpc as any).nfseDist.solicitarSync.mutate({ clienteId })
      await alerts.success(
        'Solicitação enviada',
        'O scheduler vai processar em até 60s.',
      )
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSolicitando(false)
    }
  }

  async function handleResyncDesdeNsu() {
    const ultimoNsu = cliente?.nfseDistUltimoNsu ?? '0'
    const sugestao = ultimoNsu === '0' ? '0' : String(Math.max(0, Number(ultimoNsu) - 50))
    const nsu = await alerts.input({
      title: 'Re-sincronizar desde NSU',
      text: `NSU atual: ${ultimoNsu}. Informe o NSU a partir do qual deseja re-baixar. Use 0 para o histórico completo. Dedup automática evita duplicar notas já no banco.`,
      inputLabel: 'NSU inicial',
      inputPlaceholder: sugestao,
      confirmText: 'Re-sincronizar',
    })
    if (nsu === null) return
    setSolicitando(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (trpc as any).nfseDist.resincronizarDesdeNsu.mutate({ clienteId, nsu: nsu || sugestao })
      await alerts.success(
        'Re-sincronização agendada',
        `Scheduler vai processar a partir do NSU ${nsu || sugestao} em até 60s.`,
      )
      onChange()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSolicitando(false)
    }
  }

  const statusBadge = (() => {
    if (!cliente?.nfseDistEnabled) return null
    const s = cliente.nfseDistSyncStatus
    if (s === 'ok') return <Badge className="bg-emerald-600 text-white">Sincronizado</Badge>
    if (s === 'erro') return <Badge className="bg-red-600 text-white">Erro</Badge>
    if (s === 'aguardando') return <Badge className="bg-amber-500 text-white">Aguardando próxima sync</Badge>
    return <Badge className="bg-slate-500 text-white">Nunca sincronizou</Badge>
  })()

  const temCertificado = !!certA1Ativo

  return (
    <div className="space-y-4">
      {/* Aviso sobre certificado */}
      {!temCertificado ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-950/40">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div className="text-[11px] text-amber-900 dark:text-amber-200">
              <div className="font-semibold">Certificado A1 não vinculado</div>
              <p className="mt-0.5">
                Este cliente não tem certificado A1 ativo. Vincule um certificado na aba <b>Certificados</b> antes
                de ativar a busca automática — o ADN exige mTLS com assinatura digital.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-emerald-200/60 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-3">
          <div className="flex items-center gap-2 text-[11px] text-emerald-900 dark:text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span>
              <b>Certificado A1:</b> {certA1Ativo?.descricao} · válido até {certA1Ativo?.expiraEm}
            </span>
          </div>
        </div>
      )}

      <ProgressoWidget progresso={progresso} solicitado={!!cliente?.nfseDistSyncRequestedAt} cor="emerald" />

      <div className="rounded-md border border-border p-4 space-y-3">
        {/* Toggle ativo */}
        <div className="flex items-center justify-between rounded border p-2">
          <div>
            <div className="text-xs font-semibold">Busca automática ativa</div>
            <p className="text-[10px] text-muted-foreground">
              Quando ligado, o sistema consulta o ADN todo dia às 3:45 e importa as NFS-e novas.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => { setEnabled(!enabled); setDirty(true) }}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0',
              enabled ? 'bg-emerald-500' : 'bg-rose-300 dark:bg-rose-900/50',
            )}
          >
            <span className={cn(
              'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
              enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
            )} />
          </button>
        </div>

        {/* Status e infos read-only */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</div>
            <div className="mt-1">{statusBadge ?? <Badge className="bg-slate-500 text-white">Desativado</Badge>}</div>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Última sincronização</div>
            <div className="mt-1 text-foreground tabular-nums">
              {cliente?.nfseDistSyncedAt
                ? new Date(cliente.nfseDistSyncedAt).toLocaleString('pt-BR')
                : <span className="text-muted-foreground">Nunca</span>}
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Último NSU</div>
            <div className="mt-1 font-mono text-foreground tabular-nums">
              {cliente?.nfseDistUltimoNsu ?? <span className="text-muted-foreground font-sans">—</span>}
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Próxima sincronização</div>
            <div className="mt-1 text-foreground">
              <Clock className="inline h-3 w-3 mr-1" /> Diária às 3:45
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex justify-between gap-2 pt-2 border-t">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleBuscarAgora}
              disabled={solicitando || !cliente?.nfseDistEnabled || !temCertificado}
            >
              {solicitando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              {solicitando ? 'Solicitado...' : 'Buscar agora'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleResyncDesdeNsu}
              disabled={solicitando || !cliente?.nfseDistEnabled || !temCertificado}
              title="Re-baixar notas a partir de um NSU específico"
            >
              Re-sincronizar...
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleSalvar}
            disabled={salvando || !dirty}
            className="bg-sky-600 hover:bg-sky-700 text-white"
          >
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {salvando ? 'Salvando...' : 'Salvar configuração'}
          </Button>
        </div>
      </div>
    </div>
  )
}
