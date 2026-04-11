'use client'

import { useState, useEffect } from 'react'
import {
  Rocket, GitBranch, GitCommit, RefreshCw, Loader2, CheckCircle2,
  XCircle, Package, Download, Upload, FileText,
  Clock, User, ArrowUp, ArrowDown, AlertTriangle, ChevronDown,
  ChevronRight, Copy, Link, Unlink, ArrowUpFromLine, ArrowDownToLine,
  Settings,
} from 'lucide-react'
import { Button, Card, CardHeader, Input, Checkbox, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

interface GitStatus {
  ok: boolean
  error?: string
  branch?: string
  lastCommit?: {
    hash: string; shortHash: string; message: string; date: string; author: string
  }
  totalCommits?: number
  changedFiles?: Array<{ status: string; file: string }>
  uncommittedChanges?: number
  remote?: string | null
  remoteUrl?: string | null
  ahead?: number
  behind?: number
  pendingMigrations?: string[]
}

interface CommitItem {
  hash: string; shortHash: string; message: string; author: string; date: string
}

interface DeployResult {
  filename: string; filepath: string; size: number; filesCount: number; includesDb: boolean
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min atrás`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  return `${days}d atrás`
}

export default function DeployPage() {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [commits, setCommits] = useState<CommitItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Gerar pacote
  const [generating, setGenerating] = useState(false)
  const [fromCommit, setFromCommit] = useState('')
  const [includeDb, setIncludeDb] = useState(false)
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null)

  // Aplicar pacote
  const [applying, setApplying] = useState(false)

  // Expandir seções
  const [showChangedFiles, setShowChangedFiles] = useState(false)
  const [showCommitLog, setShowCommitLog] = useState(false)

  // Remote config
  const [showRemoteConfig, setShowRemoteConfig] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteName, setRemoteName] = useState('origin')
  const [savingRemote, setSavingRemote] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)

  async function loadData() {
    try {
      const [status, log] = await Promise.all([
        trpc.admin.getGitStatus.query(),
        trpc.admin.getGitLog.query({ limit: 20 }),
      ])
      setGitStatus(status as GitStatus)
      setCommits(log as CommitItem[])
    } catch (e) {
      setGitStatus({ ok: false, error: (e as Error).message })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function handleRefresh() {
    setRefreshing(true)
    await loadData()
  }

  async function handleGenerateDeploy() {
    setGenerating(true)
    setDeployResult(null)
    try {
      const result = await trpc.admin.generateDeployPackage.mutate({
        fromCommit: fromCommit || undefined,
        includeDb,
      }) as DeployResult
      setDeployResult(result)
      alerts.success('Pacote gerado', `${result.filesCount} arquivo(s) empacotados.`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleApplyPackage(filename: string) {
    const ok = await alerts.confirmDelete(`deploy "${filename}"? Isso irá sobrescrever os arquivos locais e executar migrations`)
    if (!ok) return
    setApplying(true)
    try {
      const result = await trpc.admin.applyDeployPackage.mutate({ filename }) as { ok: boolean; filesApplied: number; migrationsApplied: boolean; message: string }
      if (result.ok) {
        await alerts.success('Deploy aplicado', result.message)
        handleRefresh()
      } else {
        alerts.error('Erro', result.message)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  async function handleSaveRemote() {
    if (!remoteUrl.trim()) return
    setSavingRemote(true)
    try {
      const result = await trpc.admin.setGitRemote.mutate({ url: remoteUrl.trim(), name: remoteName }) as { ok: boolean; message: string }
      if (result.ok) {
        alerts.success('Remote configurado', result.message)
        setShowRemoteConfig(false)
        handleRefresh()
      } else {
        alerts.error('Erro', result.message)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setSavingRemote(false) }
  }

  async function handleRemoveRemote() {
    const ok = await alerts.confirmDelete(`remote "${remoteName}"`)
    if (!ok) return
    try {
      await trpc.admin.removeGitRemote.mutate({ name: remoteName })
      alerts.success('Removido', 'Remote desvinculado.')
      setRemoteUrl('')
      handleRefresh()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    }
  }

  async function handlePush() {
    setPushing(true)
    try {
      const result = await trpc.admin.gitPush.mutate({ remote: gs?.remote || 'origin' }) as { ok: boolean; message: string }
      if (result.ok) {
        alerts.success('Push realizado', result.message)
        handleRefresh()
      } else {
        alerts.error('Erro no push', result.message)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setPushing(false) }
  }

  async function handlePull() {
    setPulling(true)
    try {
      const result = await trpc.admin.gitPull.mutate({ remote: gs?.remote || 'origin' }) as { ok: boolean; message: string }
      if (result.ok) {
        alerts.success('Pull realizado', result.message)
        handleRefresh()
      } else {
        alerts.error('Erro no pull', result.message)
      }
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally { setPulling(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const gs = gitStatus

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-orange-500 text-white shadow-md">
            <Rocket className="h-6 w-6" />
          </div>
          <div>
            <h1>Ambiente e Deploy</h1>
            <p className="text-sm text-muted-foreground">Gerencie versões, gere pacotes de deploy e aplique atualizações</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      {/* Git não disponível */}
      {gs && !gs.ok && (
        <Card>
          <div className="p-6 text-center space-y-3">
            <XCircle className="h-10 w-10 text-red-400 mx-auto" />
            <h3 className="text-sm font-semibold text-red-700">Git não disponível</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">{gs.error}</p>
            <p className="text-xs text-muted-foreground">Verifique se o Git está instalado e se o projeto está inicializado como repositório.</p>
          </div>
        </Card>
      )}

      {/* Git OK */}
      {gs?.ok && (
        <>
          {/* Status Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {/* Branch */}
            <Card>
              <div className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <GitBranch className="h-3.5 w-3.5" /> Branch
                </div>
                <div className="text-lg font-bold font-mono">{gs.branch}</div>
              </div>
            </Card>

            {/* Último commit */}
            <Card>
              <div className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <GitCommit className="h-3.5 w-3.5" /> Último commit
                </div>
                <div className="text-sm font-semibold truncate" title={gs.lastCommit?.message}>{gs.lastCommit?.shortHash}</div>
                <div className="text-[10px] text-muted-foreground">{gs.lastCommit?.date ? timeAgo(gs.lastCommit.date) : ''}</div>
              </div>
            </Card>

            {/* Alterações pendentes */}
            <Card>
              <div className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <FileText className="h-3.5 w-3.5" /> Alterações pendentes
                </div>
                <div className={cn('text-lg font-bold', (gs.uncommittedChanges || 0) > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                  {gs.uncommittedChanges || 0}
                </div>
              </div>
            </Card>

            {/* Sync com remote */}
            <Card>
              <div className="p-4">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                  <RefreshCw className="h-3.5 w-3.5" /> Remote
                </div>
                {gs.remote ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-sm">
                      {(gs.ahead || 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-600 font-semibold">
                          <ArrowUp className="h-3 w-3" />{gs.ahead}
                        </span>
                      )}
                      {(gs.behind || 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-red-600 font-semibold">
                          <ArrowDown className="h-3 w-3" />{gs.behind}
                        </span>
                      )}
                      {(gs.ahead || 0) === 0 && (gs.behind || 0) === 0 && (
                        <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Sincronizado
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate" title={gs.remoteUrl || ''}>{gs.remote}</div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRemoteConfig(true)}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                  >
                    <Link className="h-3 w-3" /> Configurar
                  </button>
                )}
              </div>
            </Card>
          </div>

          {/* Card: Repositório Remoto */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
                  <Link className="h-4 w-4 text-muted-foreground" /> Repositório Remoto
                </h5>
                <div className="flex items-center gap-2">
                  {gs.remote && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pushing}
                        onClick={handlePush}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        {pushing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUpFromLine className="h-3 w-3" />}
                        Push
                        {(gs.ahead || 0) > 0 && <span className="bg-amber-100 text-amber-700 text-[10px] px-1 rounded">{gs.ahead}</span>}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pulling}
                        onClick={handlePull}
                        className="flex items-center gap-1.5 text-xs"
                      >
                        {pulling ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowDownToLine className="h-3 w-3" />}
                        Pull
                        {(gs.behind || 0) > 0 && <span className="bg-red-100 text-red-700 text-[10px] px-1 rounded">{gs.behind}</span>}
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowRemoteConfig(!showRemoteConfig); if (gs.remoteUrl) setRemoteUrl(gs.remoteUrl) }}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Settings className="h-3 w-3" />
                    Configurar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <div className="px-5 pb-4">
              {gs.remote ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0 bg-muted/50 rounded px-3 py-2">
                    <Link className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold">{gs.remote}</div>
                      <div className="text-[11px] font-mono text-muted-foreground truncate">{gs.remoteUrl}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Unlink className="h-3.5 w-3.5" />
                  Nenhum repositório remoto configurado. Clique em &quot;Configurar&quot; para vincular.
                </div>
              )}

              {/* Formulário de configuração */}
              {showRemoteConfig && (
                <div className="mt-4 pt-4 border-t border-[rgba(0,0,0,0.08)] space-y-3" style={{ animation: 'fadeSlideIn 0.2s ease-out' }}>
                  <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-12 md:col-span-2">
                      <label className="text-xs font-medium text-foreground">Nome</label>
                      <Input
                        placeholder="origin"
                        value={remoteName}
                        onChange={(e) => setRemoteName(e.target.value)}
                        className="mt-1 text-xs font-mono"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-10">
                      <label className="text-xs font-medium text-foreground">URL do Repositório</label>
                      <Input
                        placeholder="https://github.com/usuario/repositorio.git"
                        value={remoteUrl}
                        onChange={(e) => setRemoteUrl(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRemote() }}
                        className="mt-1 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Formatos aceitos: HTTPS (https://github.com/user/repo.git) ou SSH (git@github.com:user/repo.git)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      disabled={savingRemote || !remoteUrl.trim()}
                      onClick={handleSaveRemote}
                      className="flex items-center gap-1.5"
                    >
                      {savingRemote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link className="h-3.5 w-3.5" />}
                      {gs.remote ? 'Atualizar Remote' : 'Vincular Remote'}
                    </Button>
                    {gs.remote && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRemoveRemote}
                        className="flex items-center gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        Desvincular
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRemoteConfig(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Info do último commit */}
          <Card>
            <CardHeader>
              <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
                <GitCommit className="h-4 w-4 text-muted-foreground" /> Último Commit
              </h5>
            </CardHeader>
            <div className="px-5 pb-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{gs.lastCommit?.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" /> {gs.lastCommit?.author}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {gs.lastCommit?.date ? new Date(gs.lastCommit.date).toLocaleString('pt-BR') : ''}</span>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(gs.lastCommit?.hash || '')}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground font-mono bg-muted/50 px-2 py-1 rounded"
                  title="Copiar hash completo"
                >
                  <Copy className="h-3 w-3" /> {gs.lastCommit?.shortHash}
                </button>
              </div>

              {/* Arquivos alterados */}
              {(gs.uncommittedChanges || 0) > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowChangedFiles(!showChangedFiles)}
                    className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700"
                  >
                    {showChangedFiles ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <AlertTriangle className="h-3 w-3" />
                    {gs.uncommittedChanges} arquivo(s) com alterações não commitadas
                  </button>
                  {showChangedFiles && (
                    <div className="mt-2 rounded border border-amber-200 bg-amber-50/50 max-h-[200px] overflow-y-auto">
                      {gs.changedFiles?.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 px-3 py-1 text-xs border-b border-amber-100 last:border-0">
                          <span className={cn(
                            'font-mono font-bold w-5 text-center shrink-0',
                            f.status === 'M' ? 'text-amber-600' : f.status === 'A' ? 'text-emerald-600' : f.status === 'D' ? 'text-red-600' : 'text-muted-foreground'
                          )}>
                            {f.status}
                          </span>
                          <span className="font-mono truncate">{f.file}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Card: Gerar pacote de deploy */}
            <Card>
              <CardHeader>
                <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" /> Gerar Pacote de Deploy
                </h5>
              </CardHeader>
              <div className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Gera um .zip com os arquivos alterados, migrations do Prisma, e scripts de aplicação (sh/bat). Leve o pacote para a máquina de produção e aplique.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">A partir do commit (opcional)</label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        placeholder="Hash do commit base (ex: a1b2c3d) — vazio = desde o remote"
                        value={fromCommit}
                        onChange={(e) => setFromCommit(e.target.value)}
                        className="text-xs font-mono"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Deixe vazio para incluir tudo que não foi enviado ao remote
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={true} disabled />
                      <span className="text-xs">Arquivos alterados + Prisma schema + Migrations</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={true} disabled />
                      <span className="text-xs">Scripts de aplicação (sh + bat)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={includeDb} onCheckedChange={(v) => setIncludeDb(!!v)} />
                      <span className="text-xs">Incluir dump do banco de dados <span className="text-amber-600">(aumenta o tamanho)</span></span>
                    </label>
                  </div>
                </div>

                <Button variant="success" className="w-full" onClick={handleGenerateDeploy} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                  {generating ? 'Gerando pacote...' : 'Gerar Pacote de Deploy'}
                </Button>

                {/* Resultado */}
                {deployResult && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Pacote gerado com sucesso
                    </div>
                    <div className="text-xs space-y-0.5 text-emerald-800">
                      <p><strong>Arquivo:</strong> <span className="font-mono">{deployResult.filename}</span></p>
                      <p><strong>Tamanho:</strong> {formatBytes(deployResult.size)}</p>
                      <p><strong>Arquivos:</strong> {deployResult.filesCount}</p>
                      {deployResult.includesDb && <p><strong>Banco:</strong> Incluído</p>}
                    </div>
                    <Button
                      variant="success"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => window.open(`${API_URL}/api/backup/download/${encodeURIComponent(deployResult.filename)}`, '_blank')}
                    >
                      <Download className="h-3.5 w-3.5" /> Baixar Pacote
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Card: Aplicar pacote */}
            <Card>
              <CardHeader>
                <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
                  <Upload className="h-4 w-4 text-muted-foreground" /> Aplicar Pacote de Deploy
                </h5>
              </CardHeader>
              <div className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Aplique um pacote de deploy gerado em outra máquina. O sistema irá copiar os arquivos, aplicar migrations e atualizar o schema.
                </p>

                <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>A aplicação <strong>sobrescreve</strong> os arquivos locais. Faça um backup antes se necessário.</span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-foreground">Pacotes disponíveis</label>
                  <DeployPackageList onApply={handleApplyPackage} applying={applying} />
                </div>

                <div className="rounded border-2 border-dashed border-border/60 px-4 py-6 text-center">
                  <Upload className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Ou copie o arquivo .zip para a pasta <code className="bg-muted px-1 rounded">backups/</code> e ele aparecerá na lista acima.
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Histórico de commits */}
          <Card>
            <CardHeader>
              <button
                onClick={() => setShowCommitLog(!showCommitLog)}
                className="w-full text-left"
              >
                <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
                  {showCommitLog ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <Clock className="h-4 w-4 text-muted-foreground" /> Histórico de Commits
                  <span className="text-xs font-normal text-muted-foreground">({gs.totalCommits} total)</span>
                </h5>
              </button>
            </CardHeader>
            {showCommitLog && (
              <div className="px-5 pb-4">
                <div className="space-y-0 border rounded overflow-hidden">
                  {commits.map((c, i) => (
                    <div key={c.hash} className={cn('flex items-center gap-3 px-3 py-2 text-xs', i % 2 === 0 ? 'bg-white' : 'bg-[#f8f9fa]')}>
                      <button
                        onClick={() => { setFromCommit(c.shortHash); copyToClipboard(c.shortHash) }}
                        className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded hover:bg-primary hover:text-white transition-colors shrink-0"
                        title="Usar como commit base para deploy"
                      >
                        {c.shortHash}
                      </button>
                      <span className="flex-1 truncate" title={c.message}>{c.message}</span>
                      <span className="text-muted-foreground shrink-0 hidden md:inline">{c.author}</span>
                      <span className="text-muted-foreground shrink-0 text-[10px] w-[60px] text-right">{timeAgo(c.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/** Sub-componente: Lista de pacotes de deploy disponíveis */
function DeployPackageList({ onApply, applying }: { onApply: (filename: string) => void; applying: boolean }) {
  const [backups, setBackups] = useState<Array<{ filename: string; size: number; createdAt: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    trpc.admin.listBackups.query()
      .then((data: unknown) => {
        const deployFiles = (data as Array<{ filename: string; size: number; createdAt: string }>)
          .filter(f => f.filename.startsWith('deploy-') && f.filename.endsWith('.zip'))
        setBackups(deployFiles)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-xs text-muted-foreground py-2">Carregando...</div>
  if (backups.length === 0) return <div className="text-xs text-muted-foreground py-2">Nenhum pacote de deploy encontrado.</div>

  return (
    <div className="space-y-1 max-h-[200px] overflow-y-auto">
      {backups.map((b) => (
        <div key={b.filename} className="flex items-center gap-2 px-3 py-2 rounded border border-[rgba(0,0,0,0.06)] hover:bg-[#f8f9fa] group">
          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono truncate">{b.filename}</div>
            <div className="text-[10px] text-muted-foreground">
              {formatBytes(b.size)} · {new Date(b.createdAt).toLocaleString('pt-BR')}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={() => onApply(b.filename)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-xs"
          >
            {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Aplicar
          </Button>
        </div>
      ))}
    </div>
  )
}
