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

// ─── Identidade do app ───
// setName: nome exibido em vários lugares (about, menu de notificação, etc).
// setAppUserModelId: ID que o Windows usa pra agrupar a app no taskbar, jump
//   list e notificações nativas. Sem isso, notificações aparecem como
//   "Electron" e o pin do taskbar não funciona corretamente.
app.setName('OneClick Chat')
app.setAppUserModelId('com.oneclick.chat.desktop')

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
    '/chat-desktop',           // o chat (e subrotas: /chat-desktop/settings)
    '/login',                  // login e MFA
    '/desktop-handshake',      // troca de token pra cookie de sessão
    '/forgot-password',
    '/reset-password',
    '/api/',                   // tRPC + REST
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

// ─── Tray icon dinâmico ───
// Estado mantido entre updates pra evitar re-render desnecessário
let currentStatus = 'online'

// Cores dos status (matches STATUS_COR do chat-header-button.tsx)
const STATUS_DOT = {
  online:  '#10b981', // emerald-500
  ausente: '#f59e0b', // amber-500
  dnd:     '#f43f5e', // rose-500
  offline: '#737373', // neutral-500
}

/**
 * Renderiza o tray icon = ícone real do app (OC do designer) + bolinha de
 * status no canto inferior direito + opcional dot vermelho de "tem não lida"
 * no canto superior direito.
 *
 * IMPORTANTE: `nativeImage.createFromDataURL` NÃO rasteriza SVG no Windows
 * (só PNG/JPEG são suportados), então a abordagem antiga via SVG resultava em
 * tray vazio/invisível. Aqui carregamos o PNG real, lemos o buffer BGRA via
 * toBitmap() e desenhamos os dots pixel-a-pixel — funciona em qualquer
 * plataforma sem depender de suporte a SVG.
 */
let baseTrayCache = null
function getBaseTray() {
  if (baseTrayCache) return baseTrayCache
  try {
    // tray-icon.png é 32x32; cai pro icon.png (256) se faltar.
    let img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'))
    if (img.isEmpty()) img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon.png'))
    if (img.isEmpty()) throw new Error('nenhum PNG de tray encontrado')
    const { width, height } = img.getSize()
    baseTrayCache = { bmp: img.toBitmap(), width, height }
    return baseTrayCache
  } catch (e) {
    console.warn('[tray] base não carregada:', e.message)
    return null
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

/**
 * Desenha um círculo preenchido (com borda escura pra contraste) num buffer
 * BGRA. `bmp` é mutado in-place. Anti-alias simples na borda externa via alpha.
 */
function drawDot(bmp, width, height, cx, cy, r, hex) {
  const { r: R, g: G, b: B } = hexToRgb(hex)
  const border = { r: 11, g: 12, b: 14 } // #0b0c0e — anel escuro
  const r2 = r + 1.2 // raio externo (borda)
  for (let dy = -Math.ceil(r2); dy <= Math.ceil(r2); dy++) {
    for (let dx = -Math.ceil(r2); dx <= Math.ceil(r2); dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > r2 + 0.5) continue
      const px = cx + dx
      const py = cy + dy
      if (px < 0 || py < 0 || px >= width || py >= height) continue
      const i = (py * width + px) * 4 // BGRA
      // Núcleo = cor do status; anel externo = borda escura; transição = alpha
      const isBorder = dist > r - 0.5
      const cr = isBorder ? border.r : R
      const cg = isBorder ? border.g : G
      const cb = isBorder ? border.b : B
      const alpha = dist > r2 - 0.5 ? Math.max(0, Math.min(1, r2 + 0.5 - dist)) : 1
      if (alpha >= 1) {
        bmp[i] = cb; bmp[i + 1] = cg; bmp[i + 2] = cr; bmp[i + 3] = 255
      } else if (alpha > 0) {
        // blend sobre o que já existe
        const a = alpha
        bmp[i] = Math.round(cb * a + bmp[i] * (1 - a))
        bmp[i + 1] = Math.round(cg * a + bmp[i + 1] * (1 - a))
        bmp[i + 2] = Math.round(cr * a + bmp[i + 2] * (1 - a))
        bmp[i + 3] = Math.max(bmp[i + 3], Math.round(255 * a))
      }
    }
  }
}

function renderTrayIcon(unreadCount, status) {
  const base = getBaseTray()
  if (!base) {
    // Último recurso: PNG cru sem overlays (melhor que tray vazio).
    try { return nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png')) }
    catch { return nativeImage.createEmpty() }
  }
  const n = Number(unreadCount) || 0
  const s = status || 'online'
  const { width, height } = base
  const bmp = Buffer.from(base.bmp) // cópia — não muta o cache
  const scale = width / 32

  // Dot de status (canto inferior direito)
  const dotColor = STATUS_DOT[s] || STATUS_DOT.online
  drawDot(bmp, width, height, Math.round(25 * scale), Math.round(25 * scale), Math.max(4, Math.round(5.5 * scale)), dotColor)

  // Dot vermelho de "tem não lida" (canto superior direito). O número exato
  // fica na tooltip do tray (refreshTray) — texto em 16/32px ilegível mesmo.
  if (n > 0) {
    drawDot(bmp, width, height, Math.round(25 * scale), Math.round(7 * scale), Math.max(4, Math.round(6 * scale)), '#ef4444')
  }

  return nativeImage.createFromBitmap(bmp, { width, height })
}

const STATUS_LABEL_TRAY = {
  online: 'Online',
  ausente: 'Ausente',
  dnd: 'Não perturbar',
  offline: 'Offline',
}

function refreshTray() {
  if (!tray) return
  try {
    tray.setImage(renderTrayIcon(currentUnread, currentStatus))
    const statusTxt = STATUS_LABEL_TRAY[currentStatus] || 'Online'
    const tip = currentUnread > 0
      ? `OneClick Chat — ${currentUnread} não lida(s) · ${statusTxt}`
      : `OneClick Chat · ${statusTxt}`
    tray.setToolTip(tip)
  } catch (e) {
    console.warn('[tray] falha ao re-renderizar:', e.message)
  }
}

function createTray() {
  if (tray) return
  tray = new Tray(renderTrayIcon(0, 'online'))
  tray.setToolTip('OneClick Chat')
  const menu = Menu.buildFromTemplate([
    { label: 'Abrir Chat', click: () => { if (!mainWindow) createWindow(); else { mainWindow.show(); mainWindow.focus() } } },
    {
      label: 'Configurações',
      click: () => {
        if (!mainWindow) createWindow()
        if (mainWindow) {
          mainWindow.show(); mainWindow.focus()
          mainWindow.loadURL(`${APP_URL}/chat-desktop/settings`).catch(() => {})
        }
      },
    },
    { label: 'Entrar pelo navegador', click: () => openLoginInBrowser() },
    {
      label: 'Sair da conta',
      click: () => logoutAndReload(),
    },
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

/**
 * Faz logout completo: chama o endpoint /api/auth/sign-out (invalida a sessão
 * no server), remove o cookie local e recarrega a tela inicial de login.
 * Usado pelo item "Sair da conta" do tray menu.
 */
async function logoutAndReload() {
  try {
    // Server-side: invalida a sessão no banco (Better Auth)
    await fetch(`${APP_URL}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    }).catch(() => { /* server pode falhar — remoção local ainda procede */ })
  } finally {
    // Remove o cookie da BrowserSession (mesmo se o POST falhou)
    try {
      const cookies = await session.defaultSession.cookies.get({ url: APP_URL })
      for (const c of cookies) {
        await session.defaultSession.cookies.remove(APP_URL, c.name).catch(() => {})
      }
    } catch (e) { console.warn('[logout] limpeza de cookies falhou:', e.message) }
    if (!mainWindow) createWindow()
    if (mainWindow) {
      mainWindow.show(); mainWindow.focus()
      mainWindow.loadURL(`${APP_URL}/chat-desktop/login`).catch(() => {})
    }
  }
}

// ─── Janela ───
// Tamanhos por rota — janela compact pra login, wide pra chat (3 colunas).
const WIN_SIZES = {
  login:    { width: 480,  height: 720 },
  settings: { width: 720,  height: 760 },
  chat:     { width: 1100, height: 760 },
}

function pickSizeFromUrl(url) {
  if (!url) return WIN_SIZES.chat
  if (url.includes('/chat-desktop/login')) return WIN_SIZES.login
  if (url.includes('/chat-desktop/settings')) return WIN_SIZES.settings
  if (url.includes('/chat-desktop')) return WIN_SIZES.chat
  return WIN_SIZES.login // file://login.html, /login, etc
}

function applySize(target) {
  if (!mainWindow) return
  const [w, h] = mainWindow.getSize()
  if (w === target.width && h === target.height) return
  mainWindow.setSize(target.width, target.height, true)
  mainWindow.center()
}

// Cores da title bar overlay por tema (Windows 10/11). Estados iniciais — o
// renderer pode atualizar via window.chatDesktop.setTheme('dark'|'light') após
// detectar a preferência salva em /chat-desktop/settings.
const TITLEBAR_THEMES = {
  dark:  { color: '#242528', symbolColor: '#e5e7eb' },
  light: { color: '#ffffff', symbolColor: '#0f172a' },
}

async function createWindow() {
  // Tamanho inicial — usa o do login (vai redimensionar depois conforme a rota)
  const initialSize = WIN_SIZES.login
  // Title bar dark por default (app abre nessa cor antes do JS carregar)
  const initialTitleBar = TITLEBAR_THEMES.dark
  mainWindow = new BrowserWindow({
    width: initialSize.width,
    height: initialSize.height,
    minWidth: 420,
    minHeight: 560,
    backgroundColor: '#242528',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    // titleBarStyle: 'hidden' + titleBarOverlay = Windows desenha minimizar/
    // maximizar/fechar com a cor que escolhemos, em vez do escuro padrão.
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: initialTitleBar.color,
      symbolColor: initialTitleBar.symbolColor,
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Sessão existente → vai direto pro chat. Sem cookie → carrega a tela de
  // login do próprio chat (/chat-desktop/login — UI compact dark dedicada).
  const logged = await hasSessionCookie()
  const initial = logged ? CHAT_URL : `${APP_URL}/chat-desktop/login`
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

  // Redimensionamento automático conforme a rota — login fica compact,
  // chat ocupa mais espaço (3 colunas: pessoas, conversas, mensagens).
  mainWindow.webContents.on('did-navigate', (_e, url) => applySize(pickSizeFromUrl(url)))
  mainWindow.webContents.on('did-navigate-in-page', (_e, url) => applySize(pickSizeFromUrl(url)))
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

ipcMain.handle('chat:set-status', (_event, status) => {
  // Aceita 'online'|'ausente'|'dnd'|'offline'; ignora valores desconhecidos
  if (status === 'online' || status === 'ausente' || status === 'dnd' || status === 'offline') {
    currentStatus = status
    refreshTray()
  }
})

// Atualiza a cor da title bar do Windows quando o user troca o tema na
// settings page (light/dark/auto resolvido pra um dos dois pelo renderer).
ipcMain.handle('chat:set-theme', (_event, theme) => {
  const t = theme === 'light' ? TITLEBAR_THEMES.light : TITLEBAR_THEMES.dark
  if (!mainWindow) return
  try {
    mainWindow.setTitleBarOverlay({ color: t.color, symbolColor: t.symbolColor, height: 32 })
    mainWindow.setBackgroundColor(t.color)
  } catch (e) {
    // setTitleBarOverlay só existe em Windows 10+; ignora em outras plataformas
    console.warn('[theme] setTitleBarOverlay falhou:', e.message)
  }
})

ipcMain.handle('chat:open-login-browser', () => { openLoginInBrowser() })

ipcMain.handle('chat:open-login-embedded', () => {
  if (mainWindow) mainWindow.loadURL(`${APP_URL}/chat-desktop/login`).catch(() => {})
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
