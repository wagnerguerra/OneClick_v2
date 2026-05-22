'use client'

/**
 * Sub-aba "Backup DB" no grupo Google de /configuracoes.
 * Configura uma pasta do Drive pra receber dumps diários do DB.
 * Upload é feito via API que lê de /var/backups/oneclick/.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CloudUpload, FolderOpen, CheckCircle2, AlertCircle, XCircle,
  Loader2, Save, ExternalLink, Database, RefreshCcw, Archive, Lock,
} from 'lucide-react'
import { Button, Input, Card, cn, Badge } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { trpcMutate } from '@/lib/trpc-fetch'
import { alerts } from '@/lib/alerts'

interface BackupStatus {
  folderId: string
  enabled: boolean
  driveAvailable: boolean
  driveMode: 'oauth' | 'service-account' | null
  accountEmail: string | null
  folderInfo: { name: string; webViewLink: string } | null
  arquivos: Array<{ id: string; name: string; size: number; modifiedTime: string; webViewLink: string }>
  backupsLocais: Array<{ name: string; size: number; modifiedTime: string }>
  systemBackupsLocais: Array<{ name: string; size: number; modifiedTime: string }>
  backupsDir: string
  systemBackupsDir: string
}

function fmtBytes(n: number): string {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function fmtDate(d: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function GoogleBackupSection() {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [folderIdInput, setFolderIdInput] = useState('')
  const [enabledInput, setEnabledInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingSystem, setUploadingSystem] = useState(false)
  // Guards síncronos contra double-click. setState é async — `disabled` re-renderiza
  // depois do click handler retornar, então 2 cliques rápidos podem disparar 2 mutations.
  const uploadingRef = useRef(false)
  const uploadingSystemRef = useRef(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = await (trpc as any).googleBackup.getStatus.query()
      setStatus(s)
      setFolderIdInput(s.folderId)
      setEnabledInput(s.enabled)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function salvar() {
    setSaving(true)
    try {
      await trpcMutate('googleBackup.salvarConfig', {
        folderId: folderIdInput.trim() || null,
        enabled: enabledInput,
      })
      await alerts.success('Configuração salva', 'Pasta validada com sucesso.')
      carregar()
    } catch (e) {
      alerts.error('Erro ao salvar', (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function enviarAgora() {
    if (uploadingRef.current) return
    uploadingRef.current = true
    setUploading(true)
    try {
      const r = await trpcMutate<{ uploaded: { name: string; size: number; webViewLink: string }; from: string; skipped?: string }>(
        'googleBackup.enviarAgora',
      )
      if (r.skipped) {
        await alerts.success('Já estava no Drive', `${r.uploaded.name} já existia na pasta. Nenhum upload duplicado.`)
      } else {
        await alerts.success(
          'Upload concluído',
          `${r.uploaded.name} (${fmtBytes(r.uploaded.size)}) enviado pra pasta do Drive.`,
        )
      }
      carregar()
    } catch (e) {
      alerts.error('Falha no upload', (e as Error).message)
    } finally {
      uploadingRef.current = false
      setUploading(false)
    }
  }

  async function enviarSistemaAgora() {
    if (uploadingSystemRef.current) return
    uploadingSystemRef.current = true
    setUploadingSystem(true)
    try {
      const r = await trpcMutate<{ uploaded: { name: string; size: number; webViewLink: string }; from: string; skipped?: string }>(
        'googleBackup.enviarSistemaAgora',
      )
      if (r.skipped) {
        await alerts.success('Já estava no Drive', `${r.uploaded.name} já existia na pasta. Nenhum upload duplicado.`)
      } else {
        await alerts.success(
          'Upload do sistema concluído',
          `${r.uploaded.name} (${fmtBytes(r.uploaded.size)}) — arquivo cifrado AES-256.`,
        )
      }
      carregar()
    } catch (e) {
      alerts.error('Falha no upload do sistema', (e as Error).message)
    } finally {
      uploadingSystemRef.current = false
      setUploadingSystem(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!status) {
    return <Card className="p-4 text-sm text-muted-foreground">Erro ao carregar status.</Card>
  }

  return (
    <div className="space-y-4">
      {/* Header / status do Drive */}
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <CloudUpload className="h-5 w-5 mt-0.5 text-sky-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-semibold">Backup do banco no Google Drive</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Enviar dumps automáticos do DB pra uma pasta do Drive. O backup local diário fica em{' '}
              <code className="text-[10px] font-mono">{status.backupsDir}</code>; o upload manda o mais recente.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-md border border-border p-2.5">
            <div className="text-muted-foreground uppercase font-semibold mb-1 text-[10px]">Conta autenticada</div>
            {status.driveAvailable ? (
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="font-medium">{status.accountEmail ?? '(email não obtido)'}</span>
                <Badge variant="outline" className="text-[9px]">{status.driveMode}</Badge>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                <XCircle className="h-3.5 w-3.5" />
                <span>Credenciais Google não configuradas (env vars GOOGLE_DRIVE_*).</span>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border p-2.5">
            <div className="text-muted-foreground uppercase font-semibold mb-1 text-[10px]">Dumps de DB locais</div>
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{status.backupsLocais.length} dump(s)</span>
              {status.backupsLocais[0] && (
                <span className="text-muted-foreground text-[10px]">
                  · último: {fmtDate(status.backupsLocais[0].modifiedTime)} ({fmtBytes(status.backupsLocais[0].size)})
                </span>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border p-2.5">
            <div className="text-muted-foreground uppercase font-semibold mb-1 text-[10px] flex items-center gap-1">
              Backups do sistema (cifrado <Lock className="h-2.5 w-2.5" />)
            </div>
            <div className="flex items-center gap-1.5">
              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{status.systemBackupsLocais.length} arquivo(s)</span>
              {status.systemBackupsLocais[0] && (
                <span className="text-muted-foreground text-[10px]">
                  · último: {fmtDate(status.systemBackupsLocais[0].modifiedTime)} ({fmtBytes(status.systemBackupsLocais[0].size)})
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
          O cron diário envia <strong>os dois</strong> tipos pra mesma pasta: dump <code>.dump</code> (DB)
          + tar <code>.tar.gz.enc</code> (configs, secrets, uploads — cifrado AES-256). Passphrase fica em <code>/etc/oneclick/backup.passphrase</code> na VPS.
        </p>
      </Card>

      {/* Form de config */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-[13px] font-semibold">Pasta do Drive</h3>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wide">
            Folder ID ou URL completa
          </label>
          <Input
            value={folderIdInput}
            onChange={(e) => setFolderIdInput(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/1abc...  OU  1abc..."
            className="h-9 text-sm font-mono"
          />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Crie uma pasta no Drive (que já recebe arquivos de clientes), cole a URL ou só o ID.
            {status.driveMode === 'service-account' && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {' '}⚠ Em modo Service Account, compartilhe a pasta com <code>{status.accountEmail}</code> (papel: Editor).
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-2.5">
          <div>
            <div className="text-[12px] font-medium">Upload automático nos backups diários</div>
            <div className="text-[10px] text-muted-foreground">
              Após o cron às 3:15, o backup é enviado pra esta pasta.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEnabledInput(v => !v)}
            className={cn(
              'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
              enabledInput ? 'bg-emerald-500' : 'bg-muted',
            )}
            aria-label="Toggle auto-upload"
          >
            <span
              className={cn(
                'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow',
                enabledInput ? 'translate-x-5' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={salvar} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Salvar
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={enviarAgora}
            disabled={uploading || !status.folderId || status.backupsLocais.length === 0}
            className="gap-1.5"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            Enviar último DB agora
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={enviarSistemaAgora}
            disabled={uploadingSystem || !status.folderId || status.systemBackupsLocais.length === 0}
            className="gap-1.5"
          >
            {uploadingSystem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            Enviar último sistema agora
          </Button>
          <Button variant="outline" size="sm" onClick={carregar} className="gap-1.5">
            <RefreshCcw className="h-3.5 w-3.5" />
            Recarregar
          </Button>
        </div>
      </Card>

      {/* Info da pasta + arquivos */}
      {status.folderId && status.folderInfo && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-sky-600" />
              <h3 className="text-[13px] font-semibold">{status.folderInfo.name}</h3>
              {status.folderInfo.webViewLink && (
                <a
                  href={status.folderInfo.webViewLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-sky-600 hover:underline inline-flex items-center gap-1"
                >
                  Abrir no Drive <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <Badge variant="outline" className="text-[10px]">
              {status.arquivos.length} arquivo(s)
            </Badge>
          </div>

          {status.arquivos.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic text-center py-4">
              Pasta vazia. Clique em &quot;Enviar último backup agora&quot; pra fazer o primeiro upload.
            </div>
          ) : (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-medium">Arquivo</th>
                    <th className="text-right px-3 py-1.5 font-medium">Tamanho</th>
                    <th className="text-left px-3 py-1.5 font-medium">Modificado</th>
                    <th className="w-[40px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {status.arquivos.map(a => (
                    <tr key={a.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-1.5 font-mono text-[10px]">{a.name}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtBytes(a.size)}</td>
                      <td className="px-3 py-1.5">{fmtDate(a.modifiedTime)}</td>
                      <td className="px-3 py-1.5 text-center">
                        {a.webViewLink && (
                          <a href={a.webViewLink} target="_blank" rel="noopener noreferrer" title="Abrir">
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground inline" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {status.folderId && !status.folderInfo && status.driveAvailable && (
        <Card className="p-3 border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-2 text-[11px] text-amber-900 dark:text-amber-200">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              Folder ID configurado mas não consegui acessar a pasta. Verifique se está compartilhada com{' '}
              <code>{status.accountEmail}</code>.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
