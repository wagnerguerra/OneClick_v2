import { google, drive_v3 } from 'googleapis'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Cliente Google Drive autenticado.
 *
 * Suporta DOIS modos de autenticação (detectados automaticamente pela env):
 *
 * 1. OAuth de usuário (RECOMENDADO se já existe app OAuth + refresh_token):
 *    - GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE: caminho pro `credentials.json` do
 *      OAuth Client (tipo "installed"/Desktop). Tem client_id + client_secret.
 *    - GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN: refresh_token de uma conta Google que
 *      autorizou o app. Extrair do token.pickle (Python) com o script em
 *      scripts/extract-google-refresh-token.py.
 *    Vantagem: reutiliza projeto/credenciais existentes; o sistema age como
 *    aquele usuário humano, vendo tudo que ele vê no Drive.
 *
 * 2. Service Account:
 *    - GOOGLE_DRIVE_SA_JSON_FILE: caminho pro JSON da SA, OU
 *    - GOOGLE_DRIVE_SA_JSON: JSON inline (cru ou base64).
 *    Vantagem: identidade fixa do sistema, sem vínculo com pessoa.
 *    Tradeoff: cada pasta precisa ser explicitamente compartilhada com o email
 *    da SA.
 */
export class DriveClient {
  private driveInstance: drive_v3.Drive | null = null
  private accountEmail: string | null = null
  private mode: 'oauth' | 'service-account' | null = null

  /** Retorna o singleton do client Drive. Lazy init pra falhar tarde (não no boot). */
  drive(): drive_v3.Drive {
    if (this.driveInstance) return this.driveInstance

    if (process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE) {
      this.driveInstance = this.initOAuthMode()
      this.mode = 'oauth'
    } else if (process.env.GOOGLE_DRIVE_SA_JSON_FILE || process.env.GOOGLE_DRIVE_SA_JSON) {
      this.driveInstance = this.initServiceAccountMode()
      this.mode = 'service-account'
    } else {
      throw new Error(
        'Credenciais Google não configuradas. Defina uma das opções:\n' +
        '  OAuth (recomendado se já tem app): GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE + GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN\n' +
        '  Service Account: GOOGLE_DRIVE_SA_JSON_FILE (ou GOOGLE_DRIVE_SA_JSON)\n' +
        'Veja docs/INTEGRACAO-GOOGLE-DRIVE.md',
      )
    }
    return this.driveInstance
  }

  /** Email da conta autorizada (OAuth) ou da Service Account. Mostrado na UI. */
  getAccountEmail(): string {
    if (!this.accountEmail) this.drive()  // força init (preenche em SA mode)
    return this.accountEmail ?? '(não disponível)'
  }

  /** Modo atual de autenticação. UI usa pra ajustar mensagens. */
  getMode(): 'oauth' | 'service-account' | null {
    if (!this.mode) this.drive()
    return this.mode
  }

  /** Resolve o email do usuário autenticado via OAuth2 userinfo. Cacheado. */
  async resolveOAuthUserEmail(): Promise<string | null> {
    if (this.mode !== 'oauth') return this.accountEmail
    if (this.accountEmail) return this.accountEmail
    try {
      const credsPath = this.resolveFilePath(process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE!)
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
      const { client_id, client_secret } = (creds.installed ?? creds.web ?? {}) as { client_id?: string; client_secret?: string }
      if (!client_id || !client_secret) return null
      const oauth2Client = new google.auth.OAuth2(client_id, client_secret)
      oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN! })
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
      const r = await oauth2.userinfo.get()
      this.accountEmail = r.data.email ?? null
      return this.accountEmail
    } catch {
      return null
    }
  }

  /** Extrai o ID da pasta de uma URL do Drive ou retorna a string como ID puro. */
  static extractFolderId(input: string): string {
    const s = input.trim()
    const m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/)
    if (m && m[1]) return m[1]
    if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s
    throw new Error('ID/URL de pasta inválido. Use a URL completa do Drive ou o ID puro.')
  }

  // ─── Operações de Drive (upload, list, info) ───────────

  /**
   * Faz upload de um arquivo local pra uma pasta do Drive.
   * Funciona em modo OAuth (escopo `drive`) e Service Account (escopo `drive`
   * — atualmente a SA é configurada com `drive.readonly`, então pode falhar
   * com 403; nesse caso, ajustar o scope e re-autorizar).
   */
  async uploadFile(opts: {
    folderId: string
    filename: string
    filePath: string
    mimeType?: string
  }): Promise<{ id: string; name: string; size: number; webViewLink: string }> {
    const drive = this.drive()
    const mediaType = opts.mimeType ?? 'application/octet-stream'

    const res = await drive.files.create({
      requestBody: {
        name: opts.filename,
        parents: [opts.folderId],
      },
      media: {
        mimeType: mediaType,
        body: fs.createReadStream(opts.filePath),
      },
      fields: 'id, name, size, webViewLink',
    })

    return {
      id: res.data.id ?? '',
      name: res.data.name ?? opts.filename,
      size: Number(res.data.size ?? fs.statSync(opts.filePath).size),
      webViewLink: res.data.webViewLink ?? '',
    }
  }

  /** Info básica de uma pasta — pra validar Folder ID. */
  async getFolderInfo(folderId: string): Promise<{
    id: string; name: string; webViewLink: string; mimeType: string
  }> {
    const drive = this.drive()
    const res = await drive.files.get({
      fileId: folderId,
      fields: 'id, name, webViewLink, mimeType',
      supportsAllDrives: true,
    })
    return {
      id: res.data.id ?? '',
      name: res.data.name ?? '',
      webViewLink: res.data.webViewLink ?? '',
      mimeType: res.data.mimeType ?? '',
    }
  }

  /**
   * Os pais de um item no Drive.
   *
   * Serve para confirmar que uma pasta descende de outra — a trava que impede
   * a Gestão de Arquivos de listar qualquer pasta da conta a partir de um id
   * colado à mão. O Drive permite múltiplos pais historicamente, então devolve
   * lista, ainda que hoje na prática seja sempre um.
   */
  async getParents(fileId: string): Promise<string[]> {
    const drive = this.drive()
    const res = await drive.files.get({
      fileId,
      fields: 'parents',
      supportsAllDrives: true,
    })
    return res.data.parents ?? []
  }

  /**
   * Lista as SUBPASTAS de uma pasta.
   *
   * `listFilesInFolder` não serve para isso: ele não pede `mimeType`, então
   * pasta e arquivo voltam indistinguíveis. No Drive, pasta é um arquivo com
   * mimeType `application/vnd.google-apps.folder` — a distinção está só aí.
   *
   * Usado pela Gestão de Arquivos para o master escolher qual subpasta é de
   * qual cliente.
   */
  async listSubfolders(folderId: string, opts?: { limit?: number }): Promise<
    Array<{ id: string; name: string; webViewLink: string; modifiedTime: string }>
  > {
    const drive = this.drive()
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, webViewLink, modifiedTime)',
      orderBy: 'name',
      pageSize: Math.min(opts?.limit ?? 200, 1000),
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    return (res.data.files ?? []).map(f => ({
      id: f.id ?? '',
      name: f.name ?? '',
      webViewLink: f.webViewLink ?? '',
      modifiedTime: f.modifiedTime ?? '',
    }))
  }

  /**
   * Conteúdo de uma pasta: subpastas e arquivos, com o mimeType para separar.
   *
   * Existe além do `listFilesInFolder` porque aquele foi feito para a ingestão
   * de XML — devolve só arquivo, sem tipo, ordenado por modificação. Aqui a
   * tela precisa navegar, então precisa das duas coisas e do tipo.
   */
  async listFolderContents(folderId: string, opts?: { limit?: number }): Promise<
    Array<{ id: string; name: string; mimeType: string; size: number; modifiedTime: string; webViewLink: string; isFolder: boolean }>
  > {
    const drive = this.drive()
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
      orderBy: 'folder,name',
      pageSize: Math.min(opts?.limit ?? 300, 1000),
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    return (res.data.files ?? []).map(f => ({
      id: f.id ?? '',
      name: f.name ?? '',
      mimeType: f.mimeType ?? '',
      size: Number(f.size ?? 0),
      modifiedTime: f.modifiedTime ?? '',
      webViewLink: f.webViewLink ?? '',
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
    }))
  }

  /** Lista arquivos de uma pasta. Default: últimos 50 modificados. */
  async listFilesInFolder(folderId: string, opts?: {
    nameContains?: string; limit?: number
  }): Promise<Array<{ id: string; name: string; size: number; modifiedTime: string; webViewLink: string }>> {
    const drive = this.drive()
    const queryParts: string[] = [`'${folderId}' in parents`, 'trashed = false']
    if (opts?.nameContains) {
      // Escapa apóstrofo simples no nome ('foo's' → 'foo\\'s')
      const safe = opts.nameContains.replace(/'/g, "\\'")
      queryParts.push(`name contains '${safe}'`)
    }
    const res = await drive.files.list({
      q: queryParts.join(' and '),
      fields: 'files(id, name, size, modifiedTime, webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: Math.min(opts?.limit ?? 50, 100),
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    return (res.data.files ?? []).map(f => ({
      id: f.id ?? '',
      name: f.name ?? '',
      size: Number(f.size ?? 0),
      modifiedTime: f.modifiedTime ?? '',
      webViewLink: f.webViewLink ?? '',
    }))
  }

  // ─── Modo OAuth ────────────────────────────────────────

  private initOAuthMode(): drive_v3.Drive {
    const credsPath = this.resolveFilePath(process.env.GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE!)
    let credsRaw: { installed?: { client_id: string; client_secret: string }; web?: { client_id: string; client_secret: string } }
    try {
      credsRaw = JSON.parse(fs.readFileSync(credsPath, 'utf8'))
    } catch (e) {
      throw new Error(`OAuth: falha ao ler ${credsPath}: ${(e as Error).message}`)
    }
    const block = credsRaw.installed ?? credsRaw.web
    if (!block?.client_id || !block?.client_secret) {
      throw new Error(`OAuth: ${credsPath} não contém installed.client_id/client_secret. Esperado JSON de OAuth Client (Desktop ou Web).`)
    }
    const oauth2Client = new google.auth.OAuth2(block.client_id, block.client_secret)
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN! })
    return google.drive({ version: 'v3', auth: oauth2Client })
  }

  // ─── Modo Service Account ──────────────────────────────

  private initServiceAccountMode(): drive_v3.Drive {
    const jsonStr = this.loadServiceAccountJson()
    let credentials: { type?: string; client_email: string; private_key: string; [k: string]: unknown }
    try {
      credentials = JSON.parse(jsonStr)
    } catch (e) {
      throw new Error(`Service Account: JSON inválido — ${(e as Error).message}`)
    }
    if (credentials.type && credentials.type !== 'service_account') {
      throw new Error(
        `Service Account: type="${credentials.type}", esperado "service_account". ` +
        `O arquivo parece ser de OAuth Client — use GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE + GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN.`,
      )
    }
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Service Account: faltam campos client_email ou private_key.')
    }
    this.accountEmail = credentials.client_email

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: credentials.client_email, private_key: credentials.private_key },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })
    return google.drive({ version: 'v3', auth })
  }

  private loadServiceAccountJson(): string {
    const filePath = process.env.GOOGLE_DRIVE_SA_JSON_FILE
    if (filePath) {
      const resolved = this.resolveFilePath(filePath)
      try {
        return fs.readFileSync(resolved, 'utf8')
      } catch (e) {
        throw new Error(
          `GOOGLE_DRIVE_SA_JSON_FILE=${filePath} (resolvido: ${resolved}) — não foi possível ler: ${(e as Error).message}`,
        )
      }
    }
    const raw = process.env.GOOGLE_DRIVE_SA_JSON!
    return raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
  }

  // ─── Helpers ───────────────────────────────────────────

  /** Resolve caminho relativo: cwd → raiz do monorepo (../../). */
  private resolveFilePath(filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath
    const cwdPath = path.resolve(process.cwd(), filePath)
    if (fs.existsSync(cwdPath)) return cwdPath
    const monorepoPath = path.resolve(process.cwd(), '..', '..', filePath)
    if (fs.existsSync(monorepoPath)) return monorepoPath
    return cwdPath
  }
}
