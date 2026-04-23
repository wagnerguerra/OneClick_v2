/**
 * OneClick ERP — Launcher com GUI integrada
 *
 * Aplicação Electron com dashboard visual completo para gerenciar
 * todos os serviços do OneClick ERP (Docker, API, Web, etc.)
 */

const {
  app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog,
  Notification, ipcMain,
} = require('electron');
const { spawn, execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');

// ══════════════════════════════════════════════════════════════
// Instância única
// ══════════════════════════════════════════════════════════════
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  dialog.showErrorBox(
    'OneClick ERP',
    'O launcher já está em execução.\nVerifique a bandeja do sistema (system tray).',
  );
  app.quit();
}

// ══════════════════════════════════════════════════════════════
// Constantes e estado
// ══════════════════════════════════════════════════════════════
const SM_PORT = 9000;
const API_PORT = 4000;
const WEB_PORT = 3000;
const PG_PORT = 5432;
const REDIS_PORT = 6379;

// SERPRO2 ports
const SERPRO_BACKEND_PORT = 3001;
const SERPRO_FRONTEND_PORT = 5173;
const APACHE_PORT = 80;
const MYSQL_PORT = 3306;

let mainWindow = null;
let tray = null;
let projectRoot = null;
let isQuitting = false;

// ══════════════════════════════════════════════════════════════
// Settings persistence
// ══════════════════════════════════════════════════════════════
// Use userData folder (writable even when packaged inside .asar)
// e.g. C:\Users\wagner\AppData\Roaming\OneClick ERP\launcher-settings.json
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'launcher-settings.json');
}

function loadSettings() {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch {}
  return {
    claudeDir: '',
    serpro2Dir: 'C:\\Users\\wagner\\Desktop\\PROJETOS\\SERPRO2',
    autoStart: false,
    autoStartServices: false,
  };
}

function saveSettings(settings) {
  try {
    const filePath = getSettingsPath();
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Definição dos serviços (equivalente ao server.js)
const services = {
  api: {
    name: 'API (NestJS)',
    port: API_PORT,
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['nest', 'start', '--watch'],
    cwd: null, // set after finding project root
    process: null,
    logs: [],
    color: '#5ea3cb',
    icon: 'server',
  },
  web: {
    name: 'Web (Next.js)',
    port: WEB_PORT,
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['next', 'dev', '--port', '3000'],
    cwd: null,
    process: null,
    logs: [],
    color: '#6ada7d',
    icon: 'globe',
  },
  postgres: {
    name: 'PostgreSQL',
    port: PG_PORT,
    managed: false,
    logs: [],
    color: '#336791',
    icon: 'database',
  },
  redis: {
    name: 'Redis',
    port: REDIS_PORT,
    managed: false,
    logs: [],
    color: '#dc382d',
    icon: 'zap',
  },
  // ── SERPRO2 services ──
  serpro_backend: {
    name: 'SERPRO2 Backend',
    port: SERPRO_BACKEND_PORT,
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['nodemon', 'server.js'],
    cwd: null, // set from settings → serpro2Dir/backend
    process: null,
    logs: [],
    color: '#f59e0b',
    icon: 'serpro',
    group: 'serpro2',
  },
  serpro_frontend: {
    name: 'SERPRO2 Frontend',
    port: SERPRO_FRONTEND_PORT,
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['vite', '--host', '--port', '5173'],
    cwd: null, // set from settings → serpro2Dir/frontend
    process: null,
    logs: [],
    color: '#a855f7',
    icon: 'serpro-web',
    group: 'serpro2',
  },
  apache: {
    name: 'Apache (HTTPD)',
    port: APACHE_PORT,
    command: 'C:\\xampp\\apache\\bin\\httpd.exe',
    args: [],
    cwd: 'C:\\xampp\\apache',
    process: null,
    logs: [],
    color: '#c23616',
    icon: 'apache',
    group: 'serpro2',
  },
  mysql: {
    name: 'MySQL',
    port: MYSQL_PORT,
    command: 'C:\\xampp\\mysql\\bin\\mysqld.exe',
    args: ['--defaults-file=C:\\xampp\\mysql\\bin\\my.ini', '--console'],
    cwd: 'C:\\xampp\\mysql',
    process: null,
    logs: [],
    color: '#00758f',
    icon: 'mysql',
    group: 'serpro2',
  },
};

const MAX_LOGS = 500;

// ══════════════════════════════════════════════════════════════
// Encontrar raiz do projeto
// ══════════════════════════════════════════════════════════════
function findProjectRoot() {
  const startDirs = [];

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    startDirs.push(
      portableDir,
      path.resolve(portableDir, '..'),
      path.resolve(portableDir, '..', '..'),
      path.resolve(portableDir, '..', '..', '..'),
    );
  }

  if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    startDirs.push(
      exeDir,
      path.resolve(exeDir, '..'),
      path.resolve(exeDir, '..', '..'),
      path.resolve(exeDir, '..', '..', '..'),
      path.resolve(exeDir, '..', '..', '..', '..'),
    );
  }

  startDirs.push(
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  );
  startDirs.push(process.cwd());

  const checked = new Set();
  for (const dir of startDirs) {
    let current = path.resolve(dir);
    while (current && !checked.has(current)) {
      checked.add(current);
      if (isProjectRoot(current)) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

function isProjectRoot(dir) {
  try {
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.name === 'oneclick-code';
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// Utilitários de rede
// ══════════════════════════════════════════════════════════════
function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(
        `netstat -ano | findstr :${port} | findstr LISTENING`,
        { encoding: 'utf8', timeout: 5000, windowsHide: true },
      );
      const pids = new Set();
      for (const line of result.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /T /F`, { timeout: 5000, windowsHide: true }); } catch {}
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { timeout: 5000 });
    }
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// Log management
// ══════════════════════════════════════════════════════════════
function addLog(serviceId, text, type = 'stdout') {
  const svc = services[serviceId];
  if (!svc || !svc.logs) return;
  const raw = Buffer.isBuffer(text) ? text.toString('utf8') : String(text);
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (const line of lines) {
    const entry = { time: new Date().toISOString(), text: line, type };
    svc.logs.push(entry);
    if (svc.logs.length > MAX_LOGS) svc.logs.splice(0, svc.logs.length - MAX_LOGS);
    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('log-entry', { service: serviceId, ...entry });
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Service management
// ══════════════════════════════════════════════════════════════
function startService(id) {
  const svc = services[id];
  if (!svc || svc.managed === false) return { ok: false, error: 'Serviço não gerenciável' };
  if (svc.process) return { ok: false, error: 'Já está rodando' };

  addLog(id, `Iniciando ${svc.name}...`, 'system');

  const child = spawn(svc.command, svc.args, {
    cwd: svc.cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  svc.process = child;

  child.stdout.on('data', (data) => addLog(id, data, 'stdout'));
  child.stderr.on('data', (data) => addLog(id, data, 'stderr'));

  child.on('close', (code) => {
    addLog(id, `Processo encerrado (código ${code})`, 'system');
    svc.process = null;
    broadcastStatus();
  });

  child.on('error', (err) => {
    addLog(id, `Erro: ${err.message}`, 'error');
    svc.process = null;
    broadcastStatus();
  });

  setTimeout(broadcastStatus, 2000);
  return { ok: true };
}

function stopService(id) {
  const svc = services[id];
  if (!svc || svc.managed === false) return { ok: false, error: 'Serviço não gerenciável' };

  addLog(id, `Parando ${svc.name}...`, 'system');

  if (svc.process) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${svc.process.pid} /T /F`, { timeout: 5000, windowsHide: true });
      } else {
        svc.process.kill('SIGTERM');
      }
    } catch {}
    svc.process = null;
  }

  killProcessOnPort(svc.port);
  setTimeout(broadcastStatus, 1000);
  return { ok: true };
}

async function restartService(id) {
  stopService(id);
  await new Promise((r) => setTimeout(r, 2000));
  return startService(id);
}

function startAllServices() {
  const results = {};
  for (const id of Object.keys(services)) {
    if (services[id].managed !== false) results[id] = startService(id);
  }
  return results;
}

function stopAllServices() {
  const results = {};
  for (const id of Object.keys(services)) {
    if (services[id].managed !== false) results[id] = stopService(id);
  }
  return results;
}

// ══════════════════════════════════════════════════════════════
// Docker
// ══════════════════════════════════════════════════════════════
function isDockerRunning() {
  try {
    execSync('docker info', { timeout: 8000, stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function startDockerDesktop() {
  const paths = [
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    path.join(process.env.PROGRAMFILES || '', 'Docker', 'Docker', 'Docker Desktop.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Docker', 'Docker Desktop.exe'),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) {
      spawn(p, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      return true;
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startDockerContainers() {
  if (!isDockerRunning()) {
    sendNotification('Docker', 'Docker Desktop não está rodando. Tentando iniciar...');
    if (!startDockerDesktop()) {
      sendNotification('Docker', 'Não foi possível encontrar o Docker Desktop.');
      return false;
    }
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      if (isDockerRunning()) break;
    }
    if (!isDockerRunning()) {
      sendNotification('Docker', 'Docker Desktop não iniciou a tempo.');
      return false;
    }
  }

  try {
    execSync('docker compose up -d', {
      cwd: projectRoot,
      timeout: 30000,
      stdio: 'ignore',
      windowsHide: true,
    });
    sendNotification('Docker', 'Containers PostgreSQL e Redis iniciados.');
    return true;
  } catch {
    try {
      execSync('docker-compose up -d', {
        cwd: projectRoot,
        timeout: 30000,
        stdio: 'ignore',
        windowsHide: true,
      });
      return true;
    } catch (e) {
      sendNotification('Docker', `Erro ao iniciar containers: ${e.message}`);
      return false;
    }
  }
}

function stopDockerContainers() {
  try {
    execSync('docker compose stop', { cwd: projectRoot, timeout: 15000, stdio: 'ignore', windowsHide: true });
  } catch {
    try {
      execSync('docker-compose stop', { cwd: projectRoot, timeout: 15000, stdio: 'ignore', windowsHide: true });
    } catch {}
  }
}

// ══════════════════════════════════════════════════════════════
// Status broadcasting
// ══════════════════════════════════════════════════════════════
async function getFullStatus() {
  const status = {};
  for (const [id, svc] of Object.entries(services)) {
    const running = await checkPort(svc.port);
    status[id] = {
      name: svc.name,
      port: svc.port,
      running,
      managed: svc.managed !== false,
      hasProcess: !!svc.process,
      color: svc.color,
      icon: svc.icon,
    };
  }
  return status;
}

async function broadcastStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const status = await getFullStatus();
  mainWindow.webContents.send('status-update', status);
  updateTrayMenu(status);
}

function sendNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title: `OneClick ERP — ${title}`, body }).show();
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('notification', { title, body });
  }
}

// ══════════════════════════════════════════════════════════════
// Active Users (PostgreSQL)
// ══════════════════════════════════════════════════════════════
async function getActiveUsers() {
  let pool;
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      host: 'localhost',
      port: PG_PORT,
      database: 'saas_erp',
      user: 'postgres',
      password: 'postgres',
      max: 2,
      connectionTimeoutMillis: 5000,
    });
    const result = await pool.query(`
      SELECT DISTINCT ON (s.user_id)
             s.id, s.user_id, s.ip_address as ip, s.user_agent,
             s.created_at, s.expires_at, s.updated_at,
             u.name, u.email
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.expires_at > NOW()
        AND s.updated_at > NOW() - INTERVAL '1 hour'
      ORDER BY s.user_id, s.updated_at DESC
    `);
    return result.rows;
  } catch (e) {
    return { error: e.message };
  } finally {
    if (pool) try { await pool.end(); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════
// SCI (Firebird) Status
// ══════════════════════════════════════════════════════════════
function getSciStatus() {
  try {
    const sciScript = path.join(projectRoot, 'apps', 'api', 'src', 'cliente', 'sci_id_sistema.py');
    const result = spawnSync('python', [sciScript, '32401481000133'], {
      cwd: path.join(projectRoot, 'apps', 'api', 'src', 'cliente'),
      timeout: 15000,
      encoding: 'utf8',
      windowsHide: true,
    });
    const stdout = (result.stdout || '').trim();
    if (result.error) return { connected: false, error: result.error.message };
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) return { connected: false, error: parsed.error };
        return { connected: true, testResult: parsed };
      } catch {
        return { connected: false, error: 'Resposta invalida' };
      }
    }
    return { connected: false, error: 'Sem resposta' };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════
// IPC Handlers
// ══════════════════════════════════════════════════════════════
function registerIpcHandlers() {
  ipcMain.handle('get-status', () => getFullStatus());
  ipcMain.handle('start-service', (_e, id) => startService(id));
  ipcMain.handle('stop-service', (_e, id) => stopService(id));
  ipcMain.handle('restart-service', (_e, id) => restartService(id));
  ipcMain.handle('start-all', () => startAllServices());
  ipcMain.handle('stop-all', () => stopAllServices());

  ipcMain.handle('get-docker-status', async () => {
    const pgUp = await checkPort(PG_PORT);
    const redisUp = await checkPort(REDIS_PORT);
    return { running: isDockerRunning(), pgUp, redisUp };
  });
  ipcMain.handle('start-docker', () => startDockerContainers());
  ipcMain.handle('stop-docker', () => {
    stopDockerContainers();
    sendNotification('Docker', 'Containers parados.');
    return { ok: true };
  });

  ipcMain.handle('start-everything', async () => {
    sendNotification('OneClick ERP', 'Iniciando todos os serviços...');
    await startDockerContainers();
    await sleep(3000);
    startAllServices();
    sendNotification('OneClick ERP', 'Todos os serviços iniciados!');
    setTimeout(broadcastStatus, 5000);
    return { ok: true };
  });

  ipcMain.handle('stop-everything', async () => {
    stopAllServices();
    await sleep(1000);
    stopDockerContainers();
    sendNotification('OneClick ERP', 'Todos os serviços parados.');
    setTimeout(broadcastStatus, 2000);
    return { ok: true };
  });

  ipcMain.handle('get-logs', (_e, id) => {
    if (id === 'all') {
      const all = {};
      for (const [svcId, svc] of Object.entries(services)) {
        all[svcId] = (svc.logs || []).slice(-200);
      }
      return all;
    }
    const svc = services[id];
    return svc ? (svc.logs || []).slice(-200) : [];
  });

  ipcMain.handle('clear-logs', (_e, id) => {
    const svc = services[id];
    if (svc && svc.logs) svc.logs = [];
    return { ok: true };
  });

  ipcMain.handle('clear-all-logs', () => {
    for (const svc of Object.values(services)) {
      if (svc.logs) svc.logs = [];
    }
    return { ok: true };
  });

  ipcMain.handle('get-active-users', () => getActiveUsers());
  ipcMain.handle('get-sci-status', () => getSciStatus());

  ipcMain.handle('open-external', (_e, url) => shell.openExternal(url));

  ipcMain.handle('minimize-window', () => mainWindow && mainWindow.minimize());
  ipcMain.handle('maximize-window', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.handle('close-window', () => {
    if (mainWindow) mainWindow.hide();
  });

  // ── Settings ──
  ipcMain.handle('get-settings', () => {
    const settings = loadSettings();
    // Sync autoStart with actual login item state
    settings.autoStart = app.getLoginItemSettings().openAtLogin;
    return settings;
  });
  ipcMain.handle('save-settings', (_e, newSettings) => {
    // Update Windows startup (login item)
    app.setLoginItemSettings({
      openAtLogin: !!newSettings.autoStart,
      path: process.execPath,
      args: newSettings.autoStart ? ['--hidden'] : [],
    });
    // Update SERPRO2 CWDs dynamically
    if (newSettings.serpro2Dir) {
      services.serpro_backend.cwd = path.join(newSettings.serpro2Dir, 'backend');
      services.serpro_frontend.cwd = path.join(newSettings.serpro2Dir, 'frontend');
    }
    const result = saveSettings(newSettings);
    return result;
  });

  // ── Claude Code launcher ──
  ipcMain.handle('launch-claude', (_e, dir) => {
    try {
      const targetDir = dir || loadSettings().claudeDir || projectRoot;
      // Open PowerShell with claude command in the target directory
      const child = spawn('powershell.exe', [
        '-NoExit',
        '-Command',
        `Set-Location '${targetDir}'; Write-Host '=== Claude Code ===' -ForegroundColor Green; Write-Host 'Diretorio: ${targetDir}' -ForegroundColor Cyan; claude`,
      ], {
        cwd: targetDir,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Browse folder dialog ──
  ipcMain.handle('browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Selecionar pasta',
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });
}

// ══════════════════════════════════════════════════════════════
// Tray
// ══════════════════════════════════════════════════════════════
function loadTrayIcon() {
  const candidates = [
    path.join(__dirname, 'assets', 'tray-icon.png'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'assets', 'icon.ico'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
    }
  }
  return createFallbackIcon();
}

function createFallbackIcon() {
  const zlib = require('zlib');
  const size = 16;
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < size; x++) {
      const off = y * rowBytes + 1 + x * 4;
      raw[off] = 0x10; raw[off + 1] = 0xB9; raw[off + 2] = 0x81; raw[off + 3] = 0xFF;
    }
  }
  const crcTbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crcTbl[n] = c;
  }
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = crcTbl[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, cr]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    sig, chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return nativeImage.createFromBuffer(png);
}

function createTray() {
  const icon = loadTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('OneClick ERP');
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  updateTrayMenu({});
}

function updateTrayMenu(status) {
  if (!tray) return;

  const apiUp = status.api?.running || false;
  const webUp = status.web?.running || false;
  const pgUp = status.postgres?.running || false;
  const redisUp = status.redis?.running || false;
  const serproBeUp = status.serpro_backend?.running || false;
  const serproFeUp = status.serpro_frontend?.running || false;

  const statusLine = [
    pgUp ? 'PG:OK' : 'PG:OFF',
    redisUp ? 'Redis:OK' : 'Redis:OFF',
    apiUp ? 'API:OK' : 'API:OFF',
    webUp ? 'Web:OK' : 'Web:OFF',
    serproBeUp ? 'SERPRO-BE:OK' : 'SERPRO-BE:OFF',
    serproFeUp ? 'SERPRO-FE:OK' : 'SERPRO-FE:OFF',
  ].join(' | ');

  tray.setToolTip(`OneClick ERP\n${statusLine}`);

  const autoStart = app.getLoginItemSettings().openAtLogin;

  const menu = Menu.buildFromTemplate([
    { label: 'OneClick ERP — Service Manager', enabled: false, icon: loadTrayIcon() },
    { label: `   ${statusLine}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Abrir Dashboard',
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } },
    },
    {
      label: 'Abrir Aplicacao',
      sublabel: `localhost:${WEB_PORT}`,
      click: () => shell.openExternal(`http://localhost:${WEB_PORT}`),
      enabled: webUp,
    },
    { type: 'separator' },
    {
      label: 'Iniciar Servicos (API + Web)',
      click: () => startAllServices(),
    },
    {
      label: 'Parar Servicos (API + Web)',
      click: () => stopAllServices(),
    },
    { type: 'separator' },
    {
      label: 'Iniciar com Windows',
      type: 'checkbox',
      checked: autoStart,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          path: process.execPath,
          args: item.checked ? ['--hidden'] : [],
        });
        // Sync with settings file
        const s = loadSettings();
        s.autoStart = item.checked;
        saveSettings(s);
      },
    },
    { type: 'separator' },
    {
      label: 'Sair (manter serviços)',
      click: () => {
        isQuitting = true;
        if (tray) tray.destroy();
        app.quit();
      },
    },
    {
      label: 'Sair e Parar Tudo',
      click: async () => {
        isQuitting = true;
        stopAllServices();
        await sleep(500);
        stopDockerContainers();
        if (tray) tray.destroy();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

// ══════════════════════════════════════════════════════════════
// Main Window
// ══════════════════════════════════════════════════════════════
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0b0f19',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ══════════════════════════════════════════════════════════════
// Boot
// ══════════════════════════════════════════════════════════════
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.on('second-instance', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  projectRoot = findProjectRoot();
  if (!projectRoot) {
    const debugInfo = [
      `execPath: ${process.execPath}`,
      `__dirname: ${__dirname}`,
      `cwd: ${process.cwd()}`,
      `PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR || '(nao definido)'}`,
      `isPackaged: ${app.isPackaged}`,
    ].join('\n');

    dialog.showErrorBox(
      'OneClick ERP',
      'Nao foi possivel encontrar a raiz do projeto.\n\n'
      + 'O exe precisa estar dentro da pasta do projeto.\n\n'
      + debugInfo,
    );
    app.quit();
    return;
  }

  // Set service CWD
  services.api.cwd = path.join(projectRoot, 'apps', 'api');
  services.web.cwd = path.join(projectRoot, 'apps', 'web');

  // Set SERPRO2 CWD from settings
  const settings = loadSettings();
  if (settings.serpro2Dir) {
    services.serpro_backend.cwd = path.join(settings.serpro2Dir, 'backend');
    services.serpro_frontend.cwd = path.join(settings.serpro2Dir, 'frontend');
  }

  registerIpcHandlers();
  createTray();
  createMainWindow();

  // Auto-start Docker if not running
  const silent = process.argv.includes('--hidden');
  const pgRunning = await checkPort(PG_PORT);

  if (!pgRunning) {
    sendNotification('OneClick ERP', 'Iniciando Docker containers...');
    await startDockerContainers();
    await sleep(3000);
  }

  // Auto-start all services if configured
  if (settings.autoStartServices) {
    sendNotification('OneClick ERP', 'Iniciando todos os serviços automaticamente...');
    await sleep(2000);
    startAllServices();
  }

  // Periodic status updates
  setInterval(broadcastStatus, 5000);
  broadcastStatus();
});

app.on('before-quit', () => {
  isQuitting = true;
});

process.on('uncaughtException', (err) => {
  fs.appendFileSync(
    path.join(projectRoot || __dirname, 'launcher-error.log'),
    `[${new Date().toISOString()}] ${err.stack || err.message}\n`,
  );
});
