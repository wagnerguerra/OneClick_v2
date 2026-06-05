/**
 * OneClick Chat Desktop — main process
 *
 * Janela única apontando pra https://app.oneclick.central-rnc.com.br/chat-desktop
 * com sessão persistida (cookies do Better Auth ficam salvos entre execuções).
 *
 * Funcionalidades:
 *   - Tray icon com badge dinâmico (PNG gerado on-the-fly a partir de SVG)
 *   - Close-to-tray (fechar janela esconde, não sai)
 *   - Single-instance lock (segunda execução abre a janela existente)
 *   - Protocolo customizado oneclick-chat:// pro fluxo de login deep-link
 *   - Notificações nativas Windows quando renderer manda evento via IPC
 *   - Auto-update via electron-updater (publish.url no package.json)
 *   - Tela inicial local "Entrar pelo navegador" quando sem sessão
 *
 * Config via env:
 *   - ONECLICK_APP_URL: URL base do sistema (default: produção)
 */

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, shell, session, dialog, globalShortcut } = require('electron')
const path = require('path')
const { autoUpdater } = require('electron-updater')

const APP_URL = process.env.ONECLICK_APP_URL || 'https://app.oneclick.central-rnc.com.br'
const CHAT_URL = `${APP_URL}/chat-desktop`
const LOGIN_URL = `${APP_URL}/login?desktop=1`
const PROTOCOL = 'oneclick-chat'
const COOKIE_NAME = 'better-auth.session_token'

/**
 * Whitelist de rotas que o app desktop pode renderizar. Qualquer outra rota
 * (ex: /dashboard, /helpdesk, /clientes) é bloqueada e redirecionada pro
 * /chat-desktop — mesma UX do WhatsApp Desktop, que só faz chat.
 *
 * Rotas permitidas:
 *   - /chat-desktop (e subrotas) — o próprio chat
 *   - /login (e subrotas como /login/2fa) — fluxo de autenticação
 *   - /desktop-handshake — geração de token pro deep-link
 *   - /forgot-password, /reset-password — recuperação de senha
 *   - /api/* — chamadas tRPC/REST que o chat precisa fazer
 */
function isChatScopedPath(pathname) {
  if (!pathname) return false
  const allowed = [
    '/chat-desktop',
    '/login',
    '/desktop-handshake',
    '/forgot-password',
    '/reset-password',
    '/api/',
  ]
  return allowed.some(p => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p))
}

// ─── Single-instance lock ───
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  return
}

let mainWindow = null
let tray = null
let isQuitting = false
let currentUnread = 0

// Registra protocolo oneclick-chat:// no SO
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

// ─── Deep-link handler ───
async function handleDeepLink(url) {
  if (!url || !url.startsWith(`${PROTOCOL}://`)) return
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
  try {
    const parsed = new URL(url)
    if (parsed.host !== 'auth' && parsed.pathname !== '//auth') return
    const token = parsed.searchParams.get('token')
    if (!token) return console.warn('[deep-link] sem token na URL:', url)

    console.log('[deep-link] consumindo token')
    const resp = await fetch(`${APP_URL}/api/auth/desktop-consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!resp.ok) {
      console.error('[deep-link] consume falhou:', resp.status, await resp.text().catch(() => ''))
      return
    }
    const data = await resp.json()
    const sessionToken = data?.sessionToken
    const cookieName = data?.cookieName || COOKIE_NAME
    const expiresAtMs = data?.expiresAt ? Date.parse(data.expiresAt) : (Date.now() + 7 * 24 * 60 * 60 * 1000)
    if (!sessionToken) return console.error('[deep-link] resposta sem sessionToken:', data)

    const domain = new URL(APP_URL).hostname
    await session.defaultSession.cookies.set({
      url: APP_URL,
      name: cookieName,
      value: sessionToken,
      domain,
      path: '/',
      secure: APP_URL.startsWith('https://'),
      httpOnly: true,
      sameSite: 'lax',
      expirationDate: Math.floor(expiresAtMs / 1000),
    })
    console.log('[deep-link] cookie setado, recarregando janela')
    if (mainWindow) mainWindow.loadURL(CHAT_URL).catch((e) => console.error('[reload] falhou:', e.message))
  } catch (e) {
    console.error('[deep-link] erro:', e.message)
  }
}

app.on('open-url', (event, url) => { event.preventDefault(); handleDeepLink(url) })
app.on('second-instance', (_event, argv) => {
  const url = argv.find(arg => arg.startsWith(`${PROTOCOL}://`))
  if (url) handleDeepLink(url)
  else if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

// ─── Badge tray dinâmico via SVG → PNG ───
/**
 * Renderiza o tray icon com badge de unread. Usa SVG inline (sem deps nativas)
 * convertido pra nativeImage. Funciona no Windows e Linux.
 */
function renderTrayIcon(unreadCount) {
  const n = Number(unreadCount) || 0
  // SVG base 32x32: bolha de chat + opcional badge vermelho no canto superior direito
  const showBadge = n > 0
  const label = n > 99 ? '99+' : String(n)
  const fontSize = label.length === 1 ? 13 : label.length === 2 ? 11 : 9
  const badge = showBadge
    ? `<circle cx="24" cy="8" r="7" fill="#ef4444" stroke="#0b0c0e" stroke-width="1.5"/>
       <text x="24" y="${8 + fontSize / 3}" font-family="Arial,sans-serif" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle">${label}</text>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0ea5e9"/>
        <stop offset="1" stop-color="#6366f1"/>
      </linearGradient>
    </defs>
    <rect x="3" y="4" width="22" height="18" rx="4" fill="url(#g)"/>
    <path d="M8 22 L8 26 L13 22 Z" fill="url(#g)"/>
    <circle cx="10" cy="13" r="1.6" fill="white"/>
    <circle cx="14" cy="13" r="1.6" fill="white"/>
    <circle cx="18" cy="13" r="1.6" fill="white"/>
    ${badge}
  </svg>`
  // nativeImage suporta SVG diretamente via createFromBuffer em algumas plataformas;
  // como fallback robusto, criamos via data URL → imageData → asset PNG é mais complexo.
  // Solução simples: usar createFromDataURL com data:image/svg+xml — Electron resolve.
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  return nativeImage.createFromDataURL(dataUrl)
}

function refreshTray() {
  if (!tray) return
  try {
    tray.setImage(renderTrayIcon(currentUnread))
    tray.setToolTip(currentUnread > 0 ? `OneClick Chat — ${currentUnread} não lida(s)` : 'OneClick Chat')
  } catch (e) {
    console.warn('[tray] falha ao re-renderizar:', e.message)
  }
}

function createTray() {
  if (tray) return
  tray = new Tray(renderTrayIcon(0))
  tray.setToolTip('OneClick Chat')
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Chat', click: () => { if (!mainWindow) createWindow(); else { mainWindow.show(); mainWindow.focus() } } },
    { label: 'Entrar pelo navegador', click: () => openLoginInBrowser() },
    { type: 'separator' },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }),
    },
    { label: 'Verificar atualizações', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: 'Sair', click: () => { isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => {
    if (!mainWindow) createWindow()
    else if (mainWindow.isVisible()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })
}

// ─── Helpers de login ───
function openLoginInBrowser() {
  shell.openExternal(LOGIN_URL).catch((e) => console.error('[openExternal] falhou:', e.message))
}

async function hasSessionCookie() {
  try {
    const cookies = await session.defaultSession.cookies.get({ url: APP_URL, name: COOKIE_NAME })
    return cookies.length > 0
  } catch {
    return false
  }
}

// ─── Janela ───
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#242528',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Sessão existente → vai direto pro chat. Sem cookie → mostra a tela
  // login.html local pro user escolher como entrar.
  const logged = await hasSessionCookie()
  const initial = logged ? CHAT_URL : `file://${path.join(__dirname, 'login.html')}`
  mainWindow.loadURL(initial).catch((e) => console.error('[load] falhou:', e.message))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Tudo que não é do APP_URL abre no browser default
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    // URLs do sistema (ex: link de ticket clicado no chat) abrem no browser
    // pra não trazer dashboard inteiro pra dentro do app de chat
    const p = new URL(url).pathname
    if (!isChatScopedPath(p)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  // Navigation guard: garante que o app SÓ navega pelas rotas relacionadas
  // ao chat. Se algo redireciona pra /dashboard ou qualquer outra parte do
  // sistema, cancela e força volta pra /chat-desktop.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      // Permite about:blank e file:// (login.html local)
      if (url.startsWith('file://') || url.startsWith('about:')) return
      const target = new URL(url)
      // Bloqueia navegação pra hosts externos — abre no browser default
      if (!url.startsWith(APP_URL)) {
        event.preventDefault()
        shell.openExternal(url)
        return
      }
      // Mesma origem: só permite as rotas do chat
      if (!isChatScopedPath(target.pathname)) {
        event.preventDefault()
        console.log('[nav-guard] redirecionando', target.pathname, '→ /chat-desktop')
        mainWindow.loadURL(CHAT_URL).catch(() => {})
      }
    } catch (e) {
      console.warn('[nav-guard] erro:', e.message)
    }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide() }
  })
  mainWindow.on('closed', () => { mainWindow = null })

  // Debug — abre DevTools se o renderer crashar. Útil pra ver erros JS
  // que de outra forma só aparecem na "Application error" genérica do Next.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer-crash]', details)
    try { mainWindow.webContents.openDevTools({ mode: 'detach' }) } catch { /* ignora */ }
  })
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[renderer] unresponsive')
  })
}

// ─── IPC ───
ipcMain.handle('chat:notify', (_event, payload) => {
  const { titulo, corpo } = payload || {}
  if (!titulo) return
  try {
    const n = new Notification({
      title: titulo,
      body: corpo || '',
      icon: path.join(__dirname, 'assets', 'icon.ico'),
      silent: false,
    })
    n.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } })
    n.show()
  } catch (e) { console.warn('[notify] falhou:', e.message) }
})

ipcMain.handle('chat:set-unread', (_event, count) => {
  currentUnread = Number(count) || 0
  refreshTray()
})

ipcMain.handle('chat:open-login-browser', () => { openLoginInBrowser() })

ipcMain.handle('chat:open-login-embedded', () => {
  if (mainWindow) mainWindow.loadURL(`${APP_URL}/login?desktop=1`).catch(() => {})
})

// ─── Auto-update ───
function checkForUpdates(showFeedback = false) {
  if (!app.isPackaged) {
    if (showFeedback) {
      dialog.showMessageBox({ type: 'info', message: 'Auto-update só funciona em builds empacotados.', title: 'OneClick Chat' })
    }
    return
  }
  autoUpdater.checkForUpdates().catch((e) => {
    console.warn('[updater] check falhou:', e.message)
    if (showFeedback) {
      dialog.showMessageBox({ type: 'error', message: `Falha ao verificar atualizações:\n${e.message}`, title: 'OneClick Chat' })
    }
  })
}

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.on('update-available', (info) => {
  console.log('[updater] disponível:', info?.version)
})
autoUpdater.on('update-not-available', () => {
  console.log('[updater] já está na última versão')
})
autoUpdater.on('error', (err) => {
  console.warn('[updater] erro:', err?.message)
})
autoUpdater.on('update-downloaded', (info) => {
  console.log('[updater] baixado:', info?.version)
  dialog.showMessageBox({
    type: 'info',
    title: 'Atualização disponível',
    message: `Nova versão ${info?.version} baixada. Reiniciar agora pra aplicar?`,
    buttons: ['Reiniciar agora', 'Depois'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      isQuitting = true
      autoUpdater.quitAndInstall()
    }
  })
})

// ─── Lifecycle ───
app.whenReady().then(async () => {
  createTray()
  await createWindow()
  // Atalho global pra abrir DevTools (Ctrl+Shift+I) — útil pra debug
  // quando o app mostra "Application error" genérica do Next.
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow && mainWindow.isFocused()) {
      mainWindow.webContents.toggleDevTools()
    }
  })
  // Checa atualização 10s após boot (deixa a UI carregar primeiro)
  setTimeout(() => checkForUpdates(false), 10_000)
  // Re-checa a cada 4h enquanto o app está aberto
  setInterval(() => checkForUpdates(false), 4 * 60 * 60 * 1000)
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', (e) => { e.preventDefault() })
app.on('before-quit', () => { isQuitting = true })
