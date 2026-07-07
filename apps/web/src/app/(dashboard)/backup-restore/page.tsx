'use client'

import { useState, useEffect } from 'react'
import { Archive, Download, Upload, Loader2, CheckCircle, FileArchive, AlertTriangle, X, Trash2 } from 'lucide-react'
import { Button, Card, CardHeader, Checkbox, Label, Table, TableHeader, TableBody, TableHead, TableRow, TableCell, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { getApiUrl } from '@/lib/api-url'
import { MasterGate } from '@/components/auth/master-gate'

interface BackupFile {
  filename: string
  size: number
  createdAt: string
}

interface BackupResult {
  filename: string
  filepath: string
  size: number
  dbDumpOk: boolean
}

export default function BackupRestorePage() {
  return (
    <MasterGate>
      <BackupRestorePageInner />
    </MasterGate>
  )
}

function BackupRestorePageInner() {
  const [generating, setGenerating] = useState(false)
  const [includeDb, setIncludeDb] = useState(true)
  const [includeUploads, setIncludeUploads] = useState(false)
  const [includeSource, setIncludeSource] = useState(false)
  const [includeEnv, setIncludeEnv] = useState(false)
  const [backups, setBackups] = useState<BackupFile[]>([])
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<BackupResult | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressText, setProgressText] = useState('')

  async function loadBackups() {
    try {
      const data = await trpc.admin.listBackups.query()
      setBackups(data as BackupFile[])
    } catch {}
    finally { setLoading(false) }
  }

  useEffect(() => { loadBackups() }, [])

  async function handleGenerate() {
    setGenerating(true)
    setResult(null)
    setShowModal(true)
    setProgress(10)
    setProgressText('Iniciando backup...')

    try {
      setProgress(20)
      setProgressText('Gerando dump do banco de dados PostgreSQL...')

      await new Promise(r => setTimeout(r, 500))
      setProgress(40)
      setProgressText('Compactando banco de dados...')

      const backupResult = await trpc.admin.generateBackup.mutate({ includeDb, includeUploads, includeSource, includeEnv }) as BackupResult

      setProgress(80)
      setProgressText('Adicionando uploads e schemas...')

      await new Promise(r => setTimeout(r, 300))
      setProgress(100)
      setProgressText('Backup concluido!')
      setResult(backupResult)
      loadBackups()
    } catch (e) {
      setShowModal(false)
      alerts.error('Erro', (e as Error).message || 'Falha ao gerar backup.')
    } finally {
      setGenerating(false)
    }
  }

  async function deleteBackup(filename: string) {
    const ok = await alerts.confirmDelete(filename)
    if (!ok) return
    try {
      await trpc.admin.deleteBackup.mutate({ filename })
      await alerts.success('Excluido', `Backup "${filename}" removido.`)
      loadBackups()
    } catch { alerts.error('Erro', 'Nao foi possivel excluir o backup.') }
  }

  function downloadBackup(filename: string) {
    window.open(`${getApiUrl()}/api/backup/download/${encodeURIComponent(filename)}`, '_blank')
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-orange-500 text-white shadow-md">
            <Archive className="h-6 w-6" />
          </div>
          <div>
            <h1>Backup e Restore</h1>
            <p className="text-sm text-muted-foreground">Gere backups do sistema e restaure quando necessario</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card: Gerar Backup */}
        <Card>
          <CardHeader>
            <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" /> Gerar Backup
            </h5>
          </CardHeader>
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Gera um arquivo ZIP contendo o dump do banco de dados, arquivos enviados, schema Prisma e CLAUDE.md.
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={includeDb} onCheckedChange={(v) => setIncludeDb(!!v)} /><span>Banco de dados (PostgreSQL dump)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={includeUploads} onCheckedChange={(v) => setIncludeUploads(!!v)} /><span>Arquivos enviados (uploads/)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={includeSource} onCheckedChange={(v) => setIncludeSource(!!v)} /><span>Código-fonte do projeto <span className="text-amber-600 text-xs">(pesado — só p/ restore self-hosted)</span></span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={includeEnv} onCheckedChange={(v) => setIncludeEnv(!!v)} />
                <span>Incluir arquivo .env <span className="text-amber-600 text-xs">(contem credenciais)</span></span>
              </label>
            </div>
            <Button variant="success" className="w-full" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {generating ? 'Gerando...' : 'Gerar Backup'}
            </Button>
          </div>
        </Card>

        {/* Card: Restaurar */}
        <Card>
          <CardHeader>
            <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" /> Restaurar Backup
            </h5>
          </CardHeader>
          <div className="p-4 space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>A restauracao do banco de dados <strong>sobrescreve todos os dados atuais</strong>. Gere um backup antes de restaurar.</span>
            </div>
            <div className="flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-border/60 px-6 py-8 cursor-pointer hover:border-primary/40 transition-colors"
              onClick={() => alerts.error('Em desenvolvimento', 'A restauracao via upload sera implementada em breve.')}>
              <Upload className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Clique para selecionar um arquivo .zip</p>
              <p className="text-xs text-muted-foreground">Funcionalidade em desenvolvimento</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Backups anteriores */}
      <Card>
        <CardHeader>
          <h5 className="text-sm font-semibold mb-0 flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-muted-foreground" /> Backups Gerados
          </h5>
        </CardHeader>
        <div className="p-4">
          {loading ? (
            <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
          ) : backups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum backup encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead className="text-right">Tamanho</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-[100px]">Acao</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((b) => (
                  <TableRow key={b.filename}>
                    <TableCell className="font-medium font-mono text-xs">{b.filename}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatBytes(b.size)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(b.createdAt).toLocaleString('pt-BR')}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="soft" size="icon-sm" onClick={() => downloadBackup(b.filename)} title="Baixar backup">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="soft-destructive" size="icon-sm" onClick={() => deleteBackup(b.filename)} title="Excluir backup">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* Modal de progresso */}
      {showModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/50 modal-overlay" onClick={() => !generating && setShowModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl w-full max-w-md p-6 space-y-4 modal-content">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <CheckCircle className="h-4 w-4 text-emerald-500" />}
                  {generating ? 'Gerando Backup...' : 'Backup Concluido!'}
                </h3>
                {!generating && (
                  <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Progress bar */}
              <div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#10b981' : '#5ea3cb' }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{progressText}</p>
              </div>

              {/* Resultado */}
              {result && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-muted/30 p-3 space-y-1">
                    <p className="text-xs"><strong>Arquivo:</strong> {result.filename}</p>
                    <p className="text-xs"><strong>Tamanho:</strong> {formatBytes(result.size)}</p>
                    <p className="text-xs"><strong>Banco de dados:</strong> {result.dbDumpOk ? <span className="text-emerald-600">Dump OK</span> : <span className="text-amber-600">pg_dump nao disponivel</span>}</p>
                  </div>
                  <Button variant="success" className="w-full" onClick={() => { downloadBackup(result.filename); setShowModal(false) }}>
                    <Download className="h-4 w-4" /> Baixar Backup
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
