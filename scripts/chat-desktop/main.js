/**
 * OneClick Chat Desktop — main process
 *
 * Janela única apontando pra https://app.oneclick.central-rnc.com.br/chat-desktop
 * com sessão persistida (cookies do Better Auth ficam salvos entre execuções).
 *
 * Funcionalidades:
 *   - Tray icon no system tray do Windows
 *   - Close-to-tray (fechar janela esconde, não sai)
 *   - Single-instance lock (segunda execução abre a janela existente)
 *   - Protocolo customizado oneclick-chat:// pro fluxo de login via browser
 *     externo (será usado na Fase 3 de auth deep-link)
 *   - Notificações nativas Windows quando renderer manda evento via IPC
 *   - Badge no tray com contagem de não lidas (overlay icon)
 *
 * Config:
 *   - APP_URL: pode ser sobrescrito via variável de ambiente pra apontar
 *     pra outro deploy (dev local, staging). Default: produção.
 */

const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, shell } = require('electron')
const path = require('path')

const APP_URL = process.env.ONECLICK_APP_URL || 'https://app.oneclick.central-rnc.com.br'
const CHAT_URL = `${APP_URL}/chat-desktop`
const PROTOCOL = 'oneclick-chat'

// ─── Single-instance lock — segunda execução do .exe só abre a janela existente ───
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  return
}

let mainWindow = null
let tray = null
let isQuitting = false

// Registra o protocolo oneclick-chat:// no Windows. Quando alguém abrir uma URL
// `oneclick-chat://auth?token=X`, o sistema operacional vai abrir este app.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

/**
 * Trata uma URL deep-link recebida (segunda instância ou cold start no Windows).
 * Por enquanto só faz log — a Fase 3 vai trocar isso por: extrair o token,
 * gravar cookie de sessão na BrowserWindow.session, e recarregar a janela.
 */
function handleDeepLink(url) {
  if (!url || !url.startsWith(`${PROTOCOL}://`)) return
  console.log('[deep-link]', url)
  // TODO Fase 3: parse `${PROTOCOL}://auth?token=...` e setar cookie de sessão.
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
}

// macOS recebe deep-link via 'open-url'; Windows recebe via argv da nova instância
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

app.on('second-instance', (_event, argv) => {
  // No Windows, argv contém a URL do deep-link quando o app é chamado por
  // outra app (browser). Procura o primeiro argumento que começa com o protocolo.
  const url = argv.find(arg => arg.startsWith(`${PROTOCOL}://`))
  if (url) {
    handleDeepLink(url)
  } else if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

function buildTrayIcon(unreadCount) {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png')
  return nativeImage.createFromPath(iconPath)
  // TODO: gerar overlay com o número quando unreadCount > 0
  // (PNG dinâmico via canvas seria ideal — fica pra próxima iteração)
}

function createTray() {
  if (tray) return
  tray = new Tray(buildTrayIcon(0))
  tray.setToolTip('OneClick Chat')
  const menu = Menu.buildFromTemplate([
    {
      label: 'Abrir Chat',
      click: () => {
        if (!mainWindow) createWindow()
        else { mainWindow.show(); mainWindow.focus() }
      },
    },
    { type: 'separator' },
    {
      label: 'Iniciar com o Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true })
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
  // Click no ícone abre a janela (Windows behavior)
  tray.on('click', () => {
    if (!mainWindow) createWindow()
    else if (mainWindow.isVisible()) mainWindow.hide()
    else { mainWindow.show(); mainWindow.focus() }
  })
}

function createWindow() {
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
      // Sessão padrão — cookies persistem em %APPDATA%/oneclick-chat-desktop
    },
  })

  mainWindow.loadURL(CHAT_URL).catch((e) => {
    console.error('[load] falhou:', e.message)
  })

  // Links externos abrem no browser default em vez de em nova janela Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(APP_URL)) return { action: 'allow' }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Close-to-tray: clicar X esconde em vez de sair, exceto se isQuitting=true
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── IPC handlers ───
// Renderer (chat-desktop page) avisa quando chega mensagem nova → dispara
// notificação nativa do Windows.
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
    n.on('click', () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
    n.show()
  } catch (e) {
    console.warn('[notify] falhou:', e.message)
  }
})

// Renderer informa contagem de unread → atualiza badge do tray (futuro)
ipcMain.handle('chat:set-unread', (_event, count) => {
  if (!tray) return
  const n = Number(count) || 0
  tray.setToolTip(n > 0 ? `OneClick Chat — ${n} não lida(s)` : 'OneClick Chat')
  // TODO: overlay no ícone com o número
})

// ─── App lifecycle ───
app.whenReady().then(() => {
  createTray()
  createWindow()
})

app.on('window-all-closed', (e) => {
  // Mantém o app vivo no tray; só sai quando user clica "Sair" no menu
  e.preventDefault()
})

app.on('before-quit', () => {
  isQuitting = true
})
