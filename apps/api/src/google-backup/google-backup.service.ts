/**
 * GoogleBackupService — integração que envia backups do DB pra uma pasta
 * específica do Google Drive (que o user cria manualmente).
 *
 * Config persistida em system_config:
 *   - google.backup.folderId  → ID da pasta no Drive
 *   - google.backup.enabled   → 'true' | 'false' (envio automático)
 *
 * Os dumps locais ficam em /var/backups/oneclick/ (criados pelo cron
 * /opt/oneclick/scripts/backup-db.sh). Em produção, esse path é montado
 * como volume readonly no container API.
 */

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { prisma } from '@saas/db'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { DriveClient } from '../drive-sync/drive.client'

const BACKUPS_DIR = process.env.ONECLICK_BACKUPS_DIR || '/var/backups/oneclick'
const SYSTEM_BACKUPS_DIR = process.env.ONECLICK_SYSTEM_BACKUPS_DIR || '/var/backups/oneclick-system'

const KEY_FOLDER_ID = 'google.backup.folderId'
const KEY_ENABLED = 'google.backup.enabled'

// Padrões de nome de arquivo por tipo
const DB_PREFIX = 'oneclick-'
const DB_SUFFIX = '.dump'
const SYS_PREFIX = 'oneclick-system-'
const SYS_SUFFIX = '.tar.gz.enc'

@Injectable()
export class GoogleBackupService {
  private readonly drive = new DriveClient()

  /** Status atual: config + ambiente + última pasta info se disponível. */
  async getStatus() {
    const [folderRow, enabledRow] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: KEY_FOLDER_ID } }),
      prisma.systemConfig.findUnique({ where: { key: KEY_ENABLED } }),
    ])
    const folderId = folderRow?.value ?? ''
    const enabled = enabledRow?.value === 'true'

    // Email da conta autenticada (OAuth) ou da SA. Não falha se Drive não tá configurado.
    let accountEmail: string | null = null
    let driveMode: 'oauth' | 'service-account' | null = null
    let driveAvailable = false
    try {
      // drive() força init e lança se faltar env vars
      this.drive.drive()
      driveMode = this.drive.getMode()
      driveAvailable = true
      accountEmail =
        driveMode === 'oauth'
          ? await this.drive.resolveOAuthUserEmail()
          : this.drive.getAccountEmail()
    } catch {
      // sem credenciais Drive — UI mostra alerta
    }

    // Info da pasta + arquivos (se config válida)
    let folderInfo: { name: string; webViewLink: string } | null = null
    let arquivos: Array<{ id: string; name: string; size: number; modifiedTime: string; webViewLink: string }> = []
    if (folderId && driveAvailable) {
      try {
        const info = await this.drive.getFolderInfo(folderId)
        folderInfo = { name: info.name, webViewLink: info.webViewLink }
        arquivos = await this.drive.listFilesInFolder(folderId, {
          nameContains: 'oneclick-',
          limit: 30,
        })
      } catch {
        // pasta inválida ou sem acesso — UI mostra erro genérico
      }
    }

    // Backups locais (DB + sistema)
    const backupsLocais = this.listarArquivos(BACKUPS_DIR, DB_PREFIX, DB_SUFFIX)
    const systemBackupsLocais = this.listarArquivos(SYSTEM_BACKUPS_DIR, SYS_PREFIX, SYS_SUFFIX)

    return {
      folderId,
      enabled,
      driveAvailable,
      driveMode,
      accountEmail,
      folderInfo,
      arquivos,
      backupsLocais,
      systemBackupsLocais,
      backupsDir: BACKUPS_DIR,
      systemBackupsDir: SYSTEM_BACKUPS_DIR,
    }
  }

  async setConfig(folderId: string | null, enabled: boolean) {
    const cleanId = folderId ? DriveClient.extractFolderId(folderId) : null

    if (cleanId) {
      // Valida acesso antes de salvar
      try {
        const info = await this.drive.getFolderInfo(cleanId)
        if (info.mimeType !== 'application/vnd.google-apps.folder') {
          throw new BadRequestException(
            `ID informado não é uma pasta (mimeType=${info.mimeType}). Confira a URL/ID.`,
          )
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e
        throw new BadRequestException(
          `Não consegui acessar a pasta no Drive: ${(e as Error).message}. ` +
            `Confira o ID/URL e se a pasta está compartilhada com ${this.drive.getAccountEmail()}.`,
        )
      }
    }

    await prisma.systemConfig.upsert({
      where: { key: KEY_FOLDER_ID },
      update: { value: cleanId ?? '' },
      create: { key: KEY_FOLDER_ID, value: cleanId ?? '', label: 'Backup DB folder ID', group: 'google.backup' },
    })
    await prisma.systemConfig.upsert({
      where: { key: KEY_ENABLED },
      update: { value: String(enabled) },
      create: { key: KEY_ENABLED, value: String(enabled), label: 'Backup DB auto-upload', group: 'google.backup' },
    })

    return { ok: true, folderId: cleanId, enabled }
  }

  /** Faz upload do dump mais recente em BACKUPS_DIR. */
  async uploadUltimoBackup() {
    return this.uploadUltimoDe('db')
  }

  /** Faz upload do tar cifrado mais recente em SYSTEM_BACKUPS_DIR. */
  async uploadUltimoSystemBackup() {
    return this.uploadUltimoDe('system')
  }

  /** Sobe ambos (dump DB + tar sistema) — usado pelo scheduler diário. */
  async uploadDiario(): Promise<{
    db: Awaited<ReturnType<GoogleBackupService['uploadUltimoDe']>> | { skipped: string }
    system: Awaited<ReturnType<GoogleBackupService['uploadUltimoDe']>> | { skipped: string }
  }> {
    const folderRow = await prisma.systemConfig.findUnique({ where: { key: KEY_FOLDER_ID } })
    if (!folderRow?.value) throw new BadRequestException('Pasta de backup não configurada.')

    let dbResult: any = { skipped: 'sem dumps locais' }
    let sysResult: any = { skipped: 'sem backups de sistema locais' }
    try { dbResult = await this.uploadUltimoDe('db') } catch (e) { dbResult = { skipped: (e as Error).message } }
    try { sysResult = await this.uploadUltimoDe('system') } catch (e) { sysResult = { skipped: (e as Error).message } }
    return { db: dbResult, system: sysResult }
  }

  private async uploadUltimoDe(tipo: 'db' | 'system') {
    const folderRow = await prisma.systemConfig.findUnique({ where: { key: KEY_FOLDER_ID } })
    const folderId = folderRow?.value
    if (!folderId) throw new BadRequestException('Pasta de backup não configurada. Salve a config primeiro.')

    const dir = tipo === 'db' ? BACKUPS_DIR : SYSTEM_BACKUPS_DIR
    const prefix = tipo === 'db' ? DB_PREFIX : SYS_PREFIX
    const suffix = tipo === 'db' ? DB_SUFFIX : SYS_SUFFIX

    const arquivos = this.listarArquivos(dir, prefix, suffix)
    if (arquivos.length === 0) {
      throw new NotFoundException(
        `Nenhum backup ${tipo === 'db' ? 'do DB' : 'de sistema'} em ${dir}.`,
      )
    }
    const latest = arquivos[0]!
    const filePath = path.join(dir, latest.name)

    // Idempotência: se a pasta já tem um arquivo com esse nome exato, não sobe de novo.
    // Protege contra double-click do usuário, retry de cron, etc.
    const existentes = await this.drive.listFilesInFolder(folderId, {
      nameContains: latest.name,
      limit: 5,
    })
    const jaExiste = existentes.find(f => f.name === latest.name)
    if (jaExiste) {
      return {
        ok: true,
        uploaded: jaExiste,
        from: filePath,
        tipo,
        skipped: 'já existia na pasta',
      } as const
    }

    const result = await this.drive.uploadFile({
      folderId,
      filename: latest.name,
      filePath,
      mimeType: 'application/octet-stream',
    })

    return { ok: true, uploaded: result, from: filePath, tipo } as const
  }

  private listarArquivos(
    dir: string,
    prefix: string,
    suffix: string,
  ): Array<{ name: string; size: number; modifiedTime: string }> {
    if (!fs.existsSync(dir)) return []
    try {
      return fs
        .readdirSync(dir)
        .filter(f => f.startsWith(prefix) && f.endsWith(suffix))
        .map(name => {
          const stat = fs.statSync(path.join(dir, name))
          return { name, size: stat.size, modifiedTime: stat.mtime.toISOString() }
        })
        .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
        .slice(0, 30)
    } catch {
      return []
    }
  }
}
