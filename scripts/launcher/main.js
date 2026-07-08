/**
 * OneClick ERP — Launcher com GUI integrada
 *
 * Aplicação Electron com dashboard visual completo para gerenciar
 * todos os serviços do OneClick ERP (Docker, API, Web, etc.)
 */

const {
  app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog,
  Notification, ipcMain, clipboard,
} = require('electron');
const { spawn, execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const https = require('https');

// Auto-updater — only required when packaged (dev runs sem o módulo)
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch {
  autoUpdater = null;
}

// NFe Watcher — monitora pastas locais e envia XMLs pra API.
// Lazy require — se chokidar/form-data não carregar, o launcher continua sem o watcher.
let NfeWatcher = null;
let nfeWatcher = null;
function loadNfeWatcherModule() {
  if (NfeWatcher) return NfeWatcher;
  try {
    NfeWatcher = require('./nfe-watcher.js').NfeWatcher;
    return NfeWatcher;
  } catch (e) {
    console.error('[NfeWatcher] Falha ao carregar módulo:', e.message);
    return null;
  }
}

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
const DEFAULT_PROJECT_ROOT = 'D:\\oc';
const DEFAULT_APP_ROOT = 'D:\\app';

let mainWindow = null;
let tray = null;
let projectRoot = null;
let appProjectRoot = null;
let isQuitting = false;
const updaterState = {
  feedUrl: null,
  status: 'idle',
  lastCheckAt: null,
  lastAvailableVersion: null,
  lastDownloadedVersion: null,
  lastError: null,
  lastProgress: null,
};

if (process.platform === 'win32') {
  app.setAppUserModelId('com.oneclick.erp.launcher');
}

// ══════════════════════════════════════════════════════════════
// Settings persistence
// ══════════════════════════════════════════════════════════════
// Use userData folder (writable even when packaged inside .asar)
// e.g. C:\Users\wagner\AppData\Roaming\OneClick ERP\launcher-settings.json
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'launcher-settings.json');
}

function loadSettings() {
  const defaults = {
    claudeDir: DEFAULT_PROJECT_ROOT,
    projectDir: DEFAULT_PROJECT_ROOT,
    appProjectDir: DEFAULT_APP_ROOT,
    projectDirs: {
      core: DEFAULT_PROJECT_ROOT,
      app: DEFAULT_APP_ROOT,
    },
    activeProjectKey: 'core',
    autoStart: false,
    autoStartServices: false,
  };
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      return normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')), defaults);
    }
  } catch {}
  return normalizeSettings({}, defaults);
}

function normalizeSettings(settings, defaults = null) {
  const base = defaults || {
    claudeDir: DEFAULT_PROJECT_ROOT,
    projectDir: DEFAULT_PROJECT_ROOT,
    appProjectDir: DEFAULT_APP_ROOT,
    projectDirs: { core: DEFAULT_PROJECT_ROOT, app: DEFAULT_APP_ROOT },
    activeProjectKey: 'core',
    autoStart: false,
    autoStartServices: false,
  };
  const merged = { ...base, ...(settings || {}) };
  merged.projectDirs = {
    ...(base.projectDirs || {}),
    ...((settings && settings.projectDirs) || {}),
  };
  if (settings && settings.projectDir && !settings.projectDirs?.core) merged.projectDirs.core = settings.projectDir;
  if (settings && settings.appProjectDir && !settings.projectDirs?.app) merged.projectDirs.app = settings.appProjectDir;
  merged.projectDir = merged.projectDirs.core || DEFAULT_PROJECT_ROOT;
  merged.appProjectDir = merged.projectDirs.app || DEFAULT_APP_ROOT;
  if (!merged.claudeDir) merged.claudeDir = merged.projectDir;
  if (!merged.activeProjectKey || !merged.projectDirs[merged.activeProjectKey]) merged.activeProjectKey = 'core';
  return merged;
}

function saveSettings(settings) {
  try {
    const current = fs.existsSync(getSettingsPath())
      ? normalizeSettings(JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')))
      : loadSettings();
    const normalized = normalizeSettings({ ...current, ...(settings || {}) });
    const filePath = getSettingsPath();
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getAutoStartInfo() {
  const settings = loadSettings();
  let loginItem = {};
  try {
    loginItem = app.getLoginItemSettings();
  } catch {}
  return {
    desired: !!settings.autoStart,
    openAtLogin: !!loginItem.openAtLogin,
    wasOpenedAtLogin: !!loginItem.wasOpenedAtLogin,
    executableWillLaunchAtLogin: !!loginItem.executableWillLaunchAtLogin,
  };
}

function setAutoStartPreference(enabled) {
  const desired = !!enabled;
  try {
    app.setLoginItemSettings({
      openAtLogin: desired,
      path: process.execPath,
      args: desired ? ['--hidden'] : [],
    });
  } catch (e) {
    const settings = loadSettings();
    settings.autoStart = desired;
    saveSettings(settings);
    return { ok: false, error: e.message, ...getAutoStartInfo() };
  }

  const settings = loadSettings();
  settings.autoStart = desired;
  saveSettings(settings);
  return { ok: true, ...getAutoStartInfo() };
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
  mobile: {
    name: 'App Mobile (Expo)',
    port: 8081,
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['start'],
    cwd: null,
    process: null,
    logs: [],
    color: '#8b5cf6',
    icon: 'smartphone',
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
};

const MAX_LOGS = 500;

// ══════════════════════════════════════════════════════════════
// Encontrar raiz do projeto
// ══════════════════════════════════════════════════════════════
// Estratégia (em ordem):
//  1. settings.projectDir (escolhido pelo usuário em sessões anteriores)
//  2. Vizinhança do .exe (portable em pasta do projeto / dev local)
//  3. Caminhos comuns no Desktop/Documents do usuário
//  4. Dialog interativo pra usuário escolher manualmente
function findProjectRoot() {
  // 1. Setting persistido
  const settings = loadSettings();
  if (settings.projectDir && isProjectRoot(settings.projectDir)) {
    return settings.projectDir;
  }

  // 2. Vizinhança do exe / __dirname
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
    DEFAULT_PROJECT_ROOT,
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  );
  startDirs.push(process.cwd());

  // 3. Caminhos comuns por usuário (Desktop / Documents / Projetos)
  startDirs.push(
    'D:\\oc',
  );

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

function findAppProjectRoot() {
  const settings = loadSettings();
  const candidates = [
    settings.projectDirs?.app,
    settings.appProjectDir,
    DEFAULT_APP_ROOT,
    path.join(settings.projectDirs?.core || settings.projectDir || DEFAULT_PROJECT_ROOT, 'apps', 'mobile'),
  ];
  for (const dir of candidates) {
    if (isAppProjectRoot(dir)) return path.resolve(dir);
  }
  return null;
}

function isProjectRoot(dir) {
  try {
    if (!dir) return false;
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.name === 'oneclick-code';
  } catch {
    return false;
  }
}

function isAppProjectRoot(dir) {
  try {
    if (!dir) return false;
    const pkgPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.name === 'oneclick-mobile' || Boolean(pkg.dependencies?.expo || pkg.dependencies?.['expo-router']);
  } catch {
    return false;
  }
}

function applyProjectRoots(coreRoot, appRoot) {
  projectRoot = coreRoot ? path.resolve(coreRoot) : null;
  appProjectRoot = appRoot ? path.resolve(appRoot) : null;
  services.api.cwd = projectRoot ? path.join(projectRoot, 'apps', 'api') : null;
  services.web.cwd = projectRoot ? path.join(projectRoot, 'apps', 'web') : null;
  services.mobile.cwd = appProjectRoot || null;
}

// Diálogo pro usuário escolher manualmente a pasta do projeto.
// Retorna o path validado ou null se cancelou/inválido.
async function promptForProjectRoot() {
  const result = await dialog.showOpenDialog({
    title: 'Selecione a pasta do projeto OneClick',
    message: 'Aponte para a raiz do repositório OneClick_Code (a pasta que contém package.json com "name": "oneclick-code").',
    properties: ['openDirectory'],
    buttonLabel: 'Usar esta pasta',
  });
  if (result.canceled || !result.filePaths.length) return null;
  const chosen = result.filePaths[0];
  if (!isProjectRoot(chosen)) {
    dialog.showErrorBox(
      'Pasta inválida',
      `A pasta escolhida não parece ser a raiz do projeto OneClick_Code.\n\nVerifique se ela contém um package.json com "name": "oneclick-code".\n\nEscolhida: ${chosen}`,
    );
    return null;
  }
  // Persiste para sessões futuras
  const settings = loadSettings();
  settings.projectDir = chosen;
  saveSettings(settings);
  return chosen;
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

async function checkHttpHealth(url, timeoutMs = 2500) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - startedAt,
      url,
    };
  } catch (e) {
    return {
      ok: false,
      error: e?.name === 'AbortError' ? 'timeout' : (e?.message || String(e)),
      ms: Date.now() - startedAt,
      url,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForPort(port, timeoutMs = 45_000, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await checkPort(port)) return true;
    await sleep(intervalMs);
  }
  return false;
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

async function ensureApiForUpdater() {
  if (await checkPort(API_PORT)) return { ok: true, started: false };

  const startResult = await startService('api');
  if (!startResult.ok && startResult.error !== 'Já está rodando') {
    return {
      ok: false,
      error: `API não está ouvindo na porta ${API_PORT} e não foi possível iniciá-la: ${startResult.error}`,
    };
  }

  const ready = await waitForPort(API_PORT, 60_000, 1500);
  if (!ready) {
    return {
      ok: false,
      error: `API iniciada, mas a porta ${API_PORT} não respondeu a tempo. Verifique o log da API.`,
    };
  }

  return { ok: true, started: true };
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
async function startService(id) {
  const svc = services[id];
  if (!svc || svc.managed === false) return { ok: false, error: 'Serviço não gerenciável' };
  if (svc.process) return { ok: false, error: 'Já está rodando' };
  if (!svc.cwd || !fs.existsSync(svc.cwd)) return { ok: false, error: `Diretório do serviço não configurado: ${svc.cwd || '-'}` };

  addLog(id, `Iniciando ${svc.name}...`, 'system');

  // Limpa porta antes de iniciar — evita EADDRINUSE quando uma instância zumbi
  // ficou rodando após reload/crash do launcher (Windows não derruba o processo
  // filho quando o pai sai por SIGTERM brusco).
  if (svc.port) {
    const portInUse = await checkPort(svc.port);
    if (portInUse) {
      addLog(id, `⚠ Porta ${svc.port} ocupada — matando processo zumbi antes de iniciar...`, 'system');
      killProcessOnPort(svc.port);
      // Aguarda a porta liberar (Windows demora alguns ms pra refletir taskkill)
      await sleep(1500);
      const stillUsed = await checkPort(svc.port);
      if (stillUsed) {
        addLog(id, `✗ Falha ao liberar porta ${svc.port}. Mate manualmente o processo e tente de novo.`, 'error');
        return { ok: false, error: `Porta ${svc.port} ainda ocupada` };
      }
      addLog(id, `✓ Porta ${svc.port} liberada`, 'system');
    }
  }

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

async function startAllServices() {
  const results = {};
  for (const id of Object.keys(services)) {
    // Serial pra não congestionar killProcessOnPort em paralelo (cada um abre netstat)
    if (services[id].managed !== false) results[id] = await startService(id);
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
  if (!projectRoot || !isProjectRoot(projectRoot)) {
    sendNotification('Docker', 'Raiz principal do projeto não configurada.');
    return false;
  }
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
  if (!projectRoot || !isProjectRoot(projectRoot)) return;
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
    let health = null;
    if (id === 'api' && running) {
      health = await checkHttpHealth(`http://127.0.0.1:${API_PORT}/api/launcher-updates`, 2500);
    } else if (id === 'web' && running) {
      health = await checkHttpHealth(`http://127.0.0.1:${WEB_PORT}`, 2500);
    }
    status[id] = {
      name: svc.name,
      port: svc.port,
      running,
      healthy: health ? health.ok : running,
      health,
      managed: svc.managed !== false,
      hasProcess: !!svc.process,
      cwd: svc.cwd || null,
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
    const notificationBody = title && title !== 'OneClick ERP' ? `${title}: ${body}` : body;
    new Notification({ title: 'OneClick ERP', body: notificationBody }).show();
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

/**
 * Lista clientes ATIVA do OneClick pra alimentar rotinas RPA no SCI
 * (geração de Razão, Balancete, etc.). Filtra por situação (default MENSAL).
 *
 * Retorno: [{ cnpj, razaoSocial, situacao }, ...]
 */
async function getClientesParaRazao({ situacao = 'MENSAL' } = {}) {
  let pool;
  try {
    const { Pool } = require('pg');
    pool = new Pool({
      host: '127.0.0.1',
      port: PG_PORT,
      database: 'saas_erp',
      user: 'postgres',
      password: 'postgres',
      max: 2,
      connectionTimeoutMillis: 5000,
    });
    // situacao='*' = todos os ATIVA, independente de situação comercial
    const params = [];
    let situacaoClause = '';
    if (situacao && situacao !== '*') {
      const lista = situacao.split(',').map((s) => s.trim()).filter(Boolean);
      params.push(lista);
      situacaoClause = ' AND situacao::text = ANY($1::text[])';
    }
    // Deduplica por CNPJ limpo, filtra inválidos (precisa ter 14 dígitos)
    const sql = `
      WITH limpos AS (
        SELECT REGEXP_REPLACE(documento, '[^0-9]', '', 'g') AS cnpj_limpo,
               razao_social, situacao
          FROM clientes
         WHERE status = 'ATIVA'
           AND tipo_documento = 'CNPJ'
           ${situacaoClause}
      )
      SELECT DISTINCT ON (cnpj_limpo) cnpj_limpo AS cnpj, razao_social, situacao
        FROM limpos
       WHERE LENGTH(cnpj_limpo) = 14
       ORDER BY cnpj_limpo, razao_social
    `;
    const result = await pool.query(sql, params);
    // Re-ordena por razao_social pra exibição
    const rows = result.rows
      .map((r) => ({ cnpj: r.cnpj, razaoSocial: r.razao_social, situacao: r.situacao }))
      .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR'));
    return rows;
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
// Auto-updater (electron-updater)
// ══════════════════════════════════════════════════════════════
// O `provider: 'generic'` aponta pra URL configurada em package.json
// build.publish. Cada release sobe um `latest.yml` + `.exe` no host.
// Em dev (não-empacotado), o módulo nem é carregado.
function broadcastUpdate(payload) {
  updaterState.status = payload.kind || updaterState.status;
  if (payload.kind === 'checking') {
    updaterState.lastCheckAt = new Date().toISOString();
    updaterState.lastError = null;
  } else if (payload.kind === 'available') {
    updaterState.lastAvailableVersion = payload.version || null;
  } else if (payload.kind === 'progress') {
    updaterState.lastProgress = {
      percent: payload.percent,
      transferred: payload.transferred,
      total: payload.total,
      at: new Date().toISOString(),
    };
  } else if (payload.kind === 'downloaded') {
    updaterState.lastDownloadedVersion = payload.version || null;
  } else if (payload.kind === 'error') {
    updaterState.lastError = payload.message || 'Erro desconhecido';
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-event', payload);
  }
}

function getUpdaterFeedUrl() {
  if (updaterState.feedUrl) return updaterState.feedUrl;
  try {
    const updateConfigPath = path.join(process.resourcesPath || '', 'app-update.yml');
    if (fs.existsSync(updateConfigPath)) {
      const content = fs.readFileSync(updateConfigPath, 'utf8');
      const match = content.match(/^url:\s*(.+)$/m);
      if (match) {
        updaterState.feedUrl = match[1].trim();
        return updaterState.feedUrl;
      }
    }
  } catch {}
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    updaterState.feedUrl = pkg?.build?.publish?.[0]?.url || null;
    return updaterState.feedUrl;
  } catch {}
  return null;
}

async function getDiagnostics() {
  const [status, apiHealth, webHealth, updateFeedHealth] = await Promise.all([
    getFullStatus(),
    checkHttpHealth(`http://127.0.0.1:${API_PORT}/api/launcher-updates`, 2500),
    checkHttpHealth(`http://127.0.0.1:${WEB_PORT}`, 2500),
    getUpdaterFeedUrl()
      ? checkHttpHealth(`${getUpdaterFeedUrl().replace(/\/$/, '')}/latest.yml`, 3500)
      : Promise.resolve({ ok: false, error: 'Feed de update não configurado' }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    app: {
      name: app.getName(),
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      resourcesPath: process.resourcesPath,
      userData: app.getPath('userData'),
    },
    project: {
      root: projectRoot,
      valid: !!projectRoot && isProjectRoot(projectRoot),
      appRoot: appProjectRoot,
      appValid: !!appProjectRoot && isAppProjectRoot(appProjectRoot),
    },
    updater: {
      ...updaterState,
      feedUrl: getUpdaterFeedUrl(),
      feedHealth: updateFeedHealth,
    },
    health: {
      api: apiHealth,
      web: webHealth,
    },
    services: status,
  };
}

function formatDiagnostics(d) {
  const lines = [];
  lines.push('OneClick ERP - Diagnostico do Launcher');
  lines.push(`Gerado em: ${d.generatedAt}`);
  lines.push('');
  lines.push('[Aplicativo]');
  lines.push(`Nome: ${d.app.name}`);
  lines.push(`Versão: ${d.app.version}`);
  lines.push(`Empacotado: ${d.app.isPackaged ? 'sim' : 'não'}`);
  lines.push(`Executavel: ${d.app.execPath}`);
  lines.push(`UserData: ${d.app.userData}`);
  lines.push('');
  lines.push('[Projeto]');
  lines.push(`Core/API/Web: ${d.project.root || '-'}`);
  lines.push(`Core válido: ${d.project.valid ? 'sim' : 'não'}`);
  lines.push(`App Mobile: ${d.project.appRoot || '-'}`);
  lines.push(`App válido: ${d.project.appValid ? 'sim' : 'não'}`);
  lines.push('');
  lines.push('[Updater]');
  lines.push(`Feed: ${d.updater.feedUrl || '-'}`);
  lines.push(`Status: ${d.updater.status}`);
  lines.push(`Ultima checagem: ${d.updater.lastCheckAt || '-'}`);
  lines.push(`Versão disponível: ${d.updater.lastAvailableVersion || '-'}`);
  lines.push(`Versão baixada: ${d.updater.lastDownloadedVersion || '-'}`);
  lines.push(`Ultimo erro: ${d.updater.lastError || '-'}`);
  lines.push(`Feed health: ${d.updater.feedHealth.ok ? 'OK' : 'FALHA'} ${d.updater.feedHealth.status || d.updater.feedHealth.error || ''}`);
  lines.push('');
  lines.push('[Health HTTP]');
  lines.push(`API: ${d.health.api.ok ? 'OK' : 'FALHA'} ${d.health.api.status || d.health.api.error || ''} (${d.health.api.ms}ms)`);
  lines.push(`Web: ${d.health.web.ok ? 'OK' : 'FALHA'} ${d.health.web.status || d.health.web.error || ''} (${d.health.web.ms}ms)`);
  lines.push('');
  lines.push('[Servicos]');
  for (const [id, svc] of Object.entries(d.services)) {
    const health = svc.health ? `, health=${svc.health.ok ? 'OK' : 'FALHA'} ${svc.health.status || svc.health.error || ''}` : '';
    lines.push(`${id}: porta=${svc.port}, running=${svc.running ? 'sim' : 'não'}, managed=${svc.managed ? 'sim' : 'não'}${health}`);
  }
  return lines.join('\n');
}

// ══════════════════════════════════════════════════════════════
// HTTP server local — bridge entre OneClick web e o launcher
// ══════════════════════════════════════════════════════════════
// Roda em 127.0.0.1:9099 (só localhost, sem expor pra fora) e aceita
// comandos da web pra disparar programas locais (ex: SCI UNICO.EXE).
//
// CORS: permite qualquer origin RFC1918 (rede local) + localhost. Em prod
// estrita, restringir ao NEXT_PUBLIC_APP_URL configurado.
//
// Endpoints:
//   GET  /health                       — sonda
//   POST /sci/abrir { args?: string[] } — abre UNICO.EXE com args opcionais
//
const LOCAL_HTTP_PORT = 9099;
const SCI_UNICO_DEFAULT = '\\\\192.168.0.2\\s\\SCI\\modulos\\UNICO.EXE';

function originAllowed(origin) {
  if (!origin) return true; // requests same-origin / curl
  const m = /^https?:\/\/([^:/]+)/.exec(origin);
  if (!m) return false;
  const host = m[1];
  if (host === 'localhost' || host === '127.0.0.1') return true;
  // RFC 1918: 10.x.x.x | 172.16-31.x.x | 192.168.x.x
  return /^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && originAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function abrirSci(args) {
  const settings = loadSettings();
  const exePath = settings.sciUnicoPath || SCI_UNICO_DEFAULT;
  const cliArgs = Array.isArray(args) ? args.filter((a) => typeof a === 'string') : [];
  try {
    // detached + unref pra não amarrar o exec ao processo do launcher
    const child = spawn(exePath, cliArgs, { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    console.log('[SCI] disparado:', exePath, cliArgs);
    return { ok: true, exePath, args: cliArgs, pid: child.pid };
  } catch (e) {
    console.error('[SCI] erro ao disparar:', e.message);
    return { ok: false, error: e.message, exePath };
  }
}

/**
 * Resolve o caminho de um script empacotado (.py ou .au3).
 * Em dev fica em scripts/launcher/. Em produção, electron-builder copia
 * pra resources/ via "extraResources".
 */
function getResourcePath(fileName) {
  if (app.isPackaged) {
    const unpackedPath = path.join(process.resourcesPath, fileName);
    if (fs.existsSync(unpackedPath)) return unpackedPath;
  }
  return path.join(__dirname, fileName);
}

/**
 * Descobre onde está o AutoIt3.exe instalado.
 * Procura nos paths default (32-bit e 64-bit) + no PATH.
 */
function findAutoItPath() {
  const candidatos = [
    'C:\\Program Files (x86)\\AutoIt3\\AutoIt3.exe',
    'C:\\Program Files\\AutoIt3\\AutoIt3.exe',
    'C:\\Program Files (x86)\\AutoIt3\\AutoIt3_x64.exe',
  ];
  for (const p of candidatos) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Dispara o auto-login no SCI usando AutoIt (script .au3 com identificação
 * estável de controles Delphi: TEdit/TPanel por classe e instance).
 * Bem mais robusto que coords/proporções.
 *
 * Requer: AutoIt instalado em C:\Program Files (x86)\AutoIt3\
 */
async function loginSci(usuario, senha) {
  if (!usuario || !senha) {
    return { ok: false, error: 'Usuário e senha são obrigatórios.' };
  }

  // 1. Abre UNICO.EXE (idempotente — se já estiver rodando, dá NOOP)
  const settings = loadSettings();
  const exePath = settings.sciUnicoPath || SCI_UNICO_DEFAULT;
  try {
    const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
    child.unref();
    console.log('[SCI Login] UNICO.EXE disparado');
  } catch (e) {
    console.warn('[SCI Login] spawn UNICO.EXE:', e.message);
  }

  // 2. Aguarda um pouco e roda o script AutoIt
  await new Promise((r) => setTimeout(r, 1500));

  const autoitPath = findAutoItPath();
  if (!autoitPath) {
    return {
      ok: false,
      error: 'AutoIt não encontrado. Instale em https://www.autoitscript.com/site/autoit/downloads/',
    };
  }

  const scriptPath = getResourcePath('sci-login.au3');
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Script sci-login.au3 não encontrado em ${scriptPath}` };
  }

  return new Promise((resolve) => {
    const proc = spawn(autoitPath, [scriptPath, usuario, senha], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    proc.stderr.on('data', (c) => (stderr += c.toString()));
    proc.on('error', (e) => {
      resolve({ ok: false, error: `Erro ao executar AutoIt: ${e.message}` });
    });
    proc.on('exit', (code) => {
      console.log(`[SCI Login] AutoIt saiu code=${code}`);
      if (stderr) console.log('[SCI Login] stderr:', stderr);
      const logPath = path.join(os.tmpdir(), 'sci-login-au3.log');
      if (code === 0) {
        resolve({ ok: true, message: 'Login enviado ao SCI.' });
      } else if (code === 2) {
        resolve({ ok: false, error: 'Uso incorreto do script (usuario/senha faltando).' });
      } else if (code === 4) {
        resolve({ ok: false, error: 'Janela do Único não apareceu em 30s. SCI abriu corretamente?' });
      } else {
        resolve({ ok: false, error: stderr.trim() || `Script falhou (code ${code}). Veja log em ${logPath}` });
      }
    });
  });
}

function salvarCredenciaisSci(usuario, senha) {
  if (!usuario || !senha) return { ok: false, error: 'Usuário e senha são obrigatórios.' };
  const settings = loadSettings();
  settings.sciCredentials = { usuario, senha };
  saveSettings(settings);
  return { ok: true };
}

function temCredenciaisSci() {
  const settings = loadSettings();
  return Boolean(settings.sciCredentials && settings.sciCredentials.usuario && settings.sciCredentials.senha);
}

function getCredenciaisSci() {
  const settings = loadSettings();
  return settings.sciCredentials || null;
}

function limparCredenciaisSci() {
  const settings = loadSettings();
  delete settings.sciCredentials;
  saveSettings(settings);
  return { ok: true };
}

function initLocalHttpServer() {
  const http = require('http');
  const server = http.createServer(async (req, res) => {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = req.url || '/';

    if (req.method === 'GET' && url === '/health') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, name: 'oneclick-launcher', version: app.getVersion() }));
      return;
    }

    if (req.method === 'POST' && url === '/sci/abrir') {
      const body = await readJsonBody(req);
      const result = abrirSci(body.args);
      res.setHeader('content-type', 'application/json');
      res.writeHead(result.ok ? 200 : 500);
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'GET' && url === '/sci/has-credentials') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, has: temCredenciaisSci() }));
      return;
    }

    if (req.method === 'POST' && url === '/sci/configurar') {
      const body = await readJsonBody(req);
      const result = salvarCredenciaisSci(body.usuario, body.senha);
      res.setHeader('content-type', 'application/json');
      res.writeHead(result.ok ? 200 : 400);
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url === '/sci/limpar-credenciais') {
      const result = limparCredenciaisSci();
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(result));
      return;
    }

    if (req.method === 'POST' && url === '/sci/login') {
      const body = await readJsonBody(req);
      // Prioriza credenciais do body; senão usa as salvas no settings
      const salvas = getCredenciaisSci();
      const usuario = body.usuario || (salvas && salvas.usuario);
      const senha = body.senha || (salvas && salvas.senha);
      if (!usuario || !senha) {
        res.setHeader('content-type', 'application/json');
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Credenciais ausentes. Configure-as primeiro.' }));
        return;
      }
      const result = await loginSci(usuario, senha);
      res.setHeader('content-type', 'application/json');
      res.writeHead(result.ok ? 200 : 500);
      res.end(JSON.stringify(result));
      return;
    }

    // Lista de clientes ativos pra rotinas RPA (Razão, Balancete, etc.)
    if (req.method === 'GET' && url.startsWith('/sci/clientes-para-razao')) {
      const u = new URL(req.url, 'http://localhost');
      const situacao = u.searchParams.get('situacao') || 'MENSAL';
      const lista = await getClientesParaRazao({ situacao });
      res.setHeader('content-type', 'application/json');
      if (lista && lista.error) {
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: lista.error }));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, total: lista.length, clientes: lista }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });
  server.on('error', (e) => {
    console.error(`[HTTP local] falha ao iniciar :${LOCAL_HTTP_PORT}:`, e.message);
  });
  // Só localhost (não expõe na LAN — segurança)
  server.listen(LOCAL_HTTP_PORT, '127.0.0.1', () => {
    console.log(`[HTTP local] escutando em http://127.0.0.1:${LOCAL_HTTP_PORT}`);
  });
}

function initAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  const checkForUpdatesWhenApiIsReady = () => {
    ensureApiForUpdater()
      .then((apiReady) => {
        if (!apiReady.ok) {
          broadcastUpdate({ kind: 'error', message: apiReady.error });
          return null;
        }
        return autoUpdater.checkForUpdates();
      })
      .catch((err) => {
        broadcastUpdate({ kind: 'error', message: err?.message || String(err) });
      });
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    broadcastUpdate({ kind: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    broadcastUpdate({ kind: 'available', version: info.version, releaseNotes: info.releaseNotes });
    sendNotification('Atualização disponível', `Versão ${info.version} será baixada em segundo plano.`);
  });

  autoUpdater.on('update-not-available', () => {
    broadcastUpdate({ kind: 'up-to-date', currentVersion: app.getVersion() });
  });

  autoUpdater.on('download-progress', (progress) => {
    broadcastUpdate({
      kind: 'progress',
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastUpdate({ kind: 'downloaded', version: info.version });
    sendNotification('Atualização pronta', `Versão ${info.version} será aplicada ao reiniciar.`);
  });

  autoUpdater.on('error', (err) => {
    broadcastUpdate({ kind: 'error', message: err?.message || String(err) });
  });

  // Primeira checagem após 10s pra não competir com boot
  setTimeout(() => {
    checkForUpdatesWhenApiIsReady();
  }, 10_000);

  // Re-check a cada 6 horas
  setInterval(() => {
    checkForUpdatesWhenApiIsReady();
  }, 6 * 60 * 60 * 1000);
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

  // ── NFe Watcher ─────────────────────────────────
  ipcMain.handle('nfe-watcher:status', () => {
    if (!nfeWatcher) return { running: false, watchers: [] };
    return { running: nfeWatcher.running, watchers: nfeWatcher.getStatus() };
  });
  ipcMain.handle('nfe-watcher:refresh', async () => {
    if (!nfeWatcher) return { ok: false, error: 'Watcher não iniciado' };
    await nfeWatcher.refreshConfig();
    return { ok: true };
  });
  ipcMain.handle('nfe-watcher:start', async () => {
    if (!nfeWatcher) return { ok: false, error: 'Watcher não inicializado (verifique LAUNCHER_DAEMON_SECRET)' };
    if (!nfeWatcher.running) await nfeWatcher.start();
    return { ok: true };
  });
  ipcMain.handle('nfe-watcher:stop', async () => {
    if (!nfeWatcher) return { ok: false };
    if (nfeWatcher.running) await nfeWatcher.stop();
    return { ok: true };
  });

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

  // ════════════════════════════════════════════════════════
  // BI Sync: HTTP request da main process (não do renderer).
  // Necessário porque o Chromium do Electron NÃO permite setar `Origin` em
  // fetch do renderer (security feature) — Better Auth da VPS rejeita
  // requests sem Origin (MISSING_OR_NULL_ORIGIN). Node fetch tem controle
  // total dos headers, então fazemos aqui e retornamos pro renderer.
  //
  // Mantém um cookie jar simples (em memória) com a session do Better Auth.
  // ════════════════════════════════════════════════════════
  const biSyncCookies = new Map() // baseUrl → "cookieStr"
  ipcMain.handle('bi-sync-request', async (_e, payload) => {
    try {
      const { baseUrl, path, method = 'GET', body } = payload || {}
      if (!baseUrl || !path) return { ok: false, error: 'baseUrl e path obrigatórios' }
      const url = `${baseUrl}${path}`
      const headers = {
        'Origin': baseUrl,
        'User-Agent': 'OneClick-Launcher/1.0',
      }
      if (body !== undefined) headers['Content-Type'] = 'application/json'
      // Envia cookie session (se já logado)
      const cookieStr = biSyncCookies.get(baseUrl)
      if (cookieStr) headers['Cookie'] = cookieStr

      const resp = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      })
      // Captura set-cookie pra próximos requests (login)
      const setCookie = resp.headers.getSetCookie ? resp.headers.getSetCookie() : []
      if (setCookie.length > 0) {
        // Append à string existente (cookie jar simples — funciona pra session_token)
        const existing = biSyncCookies.get(baseUrl) || ''
        const newCookies = setCookie.map(c => c.split(';')[0]).join('; ')
        biSyncCookies.set(baseUrl, existing ? `${existing}; ${newCookies}` : newCookies)
      }
      const text = await resp.text()
      let data = null
      try { data = JSON.parse(text) } catch { data = text }
      return { ok: resp.ok, status: resp.status, data }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('bi-sync-logout', () => {
    biSyncCookies.clear()
    biSyncStreamStop()
    return { ok: true }
  })

  // ════════════════════════════════════════════════════════
  // BI Sync SSE — main process abre stream HTTP pra
  // `/api/bi-sync/eventos`, parsea eventos e envia pro renderer.
  // (EventSource em Electron renderer não envia cookies cross-origin
  // de forma confiável — fazemos manualmente com node fetch.)
  // ════════════════════════════════════════════════════════
  let biSyncStreamCtrl = null
  function biSyncStreamStop() {
    if (biSyncStreamCtrl) {
      try { biSyncStreamCtrl.abort() } catch {}
      biSyncStreamCtrl = null
    }
  }
  async function biSyncStreamStart(baseUrl) {
    biSyncStreamStop()
    const cookieStr = biSyncCookies.get(baseUrl) || ''
    if (!cookieStr) return // não autenticado
    biSyncStreamCtrl = new AbortController()
    const url = `${baseUrl}/api/bi-sync/eventos`
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Origin': baseUrl,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Cookie': cookieStr,
          'User-Agent': 'OneClick-Launcher/1.0',
        },
        signal: biSyncStreamCtrl.signal,
      })
      if (!resp.ok || !resp.body) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('bi-sync-event', { type: '__error', status: resp.status })
        }
        return
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        // SSE: eventos separados por blank line. Linhas começam com "data: ..."
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) {
          const dataLine = ev.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const json = JSON.parse(dataLine.slice(5).trim())
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('bi-sync-event', json)
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('bi-sync-event', { type: '__error', message: e.message })
        }
      }
    }
  }
  ipcMain.handle('bi-sync-stream-start', (_e, baseUrl) => {
    biSyncStreamStart(baseUrl).catch(() => {})
    return { ok: true }
  })
  ipcMain.handle('bi-sync-stream-stop', () => {
    biSyncStreamStop()
    return { ok: true }
  })

  // ════════════════════════════════════════════════════════
  // CONTRATOS SYNC — Launcher escuta SSE da VPS, recebe pedidos de
  // consulta SCI, executa sci_metrics.py local e devolve via callback.
  //
  // Reaproveita biSyncCookies (mesma sessão Better Auth — o user já se
  // logou no BI Sync). O stream é independente do BI Sync e roda em
  // paralelo. Quando a VPS publica evento `contrato-erp-request`, o
  // launcher executa, posta callback, e a VPS resolve a Promise do tRPC.
  // ════════════════════════════════════════════════════════
  let contratoSyncStreamCtrl = null
  let contratoSyncActive = false          // true enquanto o stream deve ficar vivo (auto-reconecta)
  let contratoSyncReconnectTimer = null
  let contratoSyncBaseUrl = ''            // baseUrl atual pra reconectar

  // Stop EXPLÍCITO (logout/quit): desativa e cancela reconexão.
  function contratoSyncStreamStop() {
    contratoSyncActive = false
    if (contratoSyncReconnectTimer) { clearTimeout(contratoSyncReconnectTimer); contratoSyncReconnectTimer = null }
    if (contratoSyncStreamCtrl) {
      try { contratoSyncStreamCtrl.abort() } catch {}
      contratoSyncStreamCtrl = null
    }
  }

  // Agenda reconexão se o stream deve continuar vivo (não foi parado explicitamente).
  function contratoSyncAgendarReconexao() {
    if (!contratoSyncActive || contratoSyncReconnectTimer) return
    contratoSyncReconnectTimer = setTimeout(() => {
      contratoSyncReconnectTimer = null
      if (contratoSyncActive && contratoSyncBaseUrl) {
        console.log('[ContratoSync] Reconectando SSE...')
        contratoSyncStreamStart(contratoSyncBaseUrl).catch(() => {})
      }
    }, 5000)
  }

  async function executarSciMetricsLocal(payload) {
    const { cnpj, datai, dataf, indicadores } = payload
    const sciScript = path.join(projectRoot, 'apps', 'api', 'src', 'cliente', 'sci_metrics.py')
    const args = [sciScript, datai, dataf, String(cnpj).replace(/\D/g, '')]
    if (Array.isArray(indicadores) && indicadores.length > 0) {
      args.push(indicadores.join(','))
    }
    const result = spawnSync('python', args, {
      cwd: path.dirname(sciScript),
      encoding: 'buffer',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeout: 90000,
      windowsHide: true,
    })
    if (result.error) throw new Error(result.error.message)
    const stdout = (result.stdout || Buffer.from('')).toString('utf8').trim()
    const stderr = (result.stderr || Buffer.from('')).toString('utf8').trim()
    if (!stdout) throw new Error(stderr || 'sci_metrics.py sem resposta')
    try {
      return JSON.parse(stdout)
    } catch (e) {
      throw new Error(`JSON inválido: ${e.message}`)
    }
  }

  async function postarContratoCallback(baseUrl, requestId, body) {
    const cookieStr = biSyncCookies.get(baseUrl) || ''
    if (!cookieStr) throw new Error('Sem cookie — não autenticado')
    const url = `${baseUrl}/api/contratos-sync/callback/${encodeURIComponent(requestId)}`
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl,
        'Cookie': cookieStr,
        'User-Agent': 'OneClick-Launcher/1.0',
      },
      body: JSON.stringify(body),
    })
    if (!resp.ok) throw new Error(`Callback HTTP ${resp.status}`)
    return resp.json()
  }

  async function processarContratoErpRequest(baseUrl, event) {
    const { requestId, payload } = event
    if (!requestId || !payload) return
    console.log(`[ContratoSync] Recebido pedido ${requestId} — cnpj=${payload.cnpj}, período=${payload.datai}..${payload.dataf}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('contrato-sync-event', { type: 'request-started', requestId, payload })
    }
    try {
      const dados = await executarSciMetricsLocal(payload)
      await postarContratoCallback(baseUrl, requestId, { dados })
      console.log(`[ContratoSync] ✓ ${requestId} concluído`)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('contrato-sync-event', { type: 'request-completed', requestId })
      }
    } catch (e) {
      console.warn(`[ContratoSync] ✗ ${requestId}: ${e.message}`)
      try { await postarContratoCallback(baseUrl, requestId, { erro: e.message }) } catch {}
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('contrato-sync-event', { type: 'request-failed', requestId, erro: e.message })
      }
    }
  }

  // Busca do ID Sistema (SCI/BDCODEMP) por CNPJ — roda sci_id_sistema.py local.
  async function executarSciIdSistemaLocal(payload) {
    const cnpj = String((payload && payload.cnpj) || '').replace(/\D/g, '')
    const sciScript = path.join(projectRoot, 'apps', 'api', 'src', 'cliente', 'sci_id_sistema.py')
    const result = spawnSync('python', [sciScript, cnpj], {
      cwd: path.dirname(sciScript),
      encoding: 'buffer',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      timeout: 60000,
      windowsHide: true,
    })
    if (result.error) throw new Error(result.error.message)
    const stdout = (result.stdout || Buffer.from('')).toString('utf8').trim()
    const stderr = (result.stderr || Buffer.from('')).toString('utf8').trim()
    if (!stdout) throw new Error(stderr || 'sci_id_sistema.py sem resposta')
    try { return JSON.parse(stdout) } catch (e) { throw new Error(`JSON inválido: ${e.message}`) }
  }

  async function processarSciIdSistemaRequest(baseUrl, event) {
    const { requestId, payload } = event
    if (!requestId || !payload) return
    console.log(`[SciIdSistema] Recebido ${requestId} — cnpj=${payload.cnpj}`)
    try {
      const dados = await executarSciIdSistemaLocal(payload)
      await postarContratoCallback(baseUrl, requestId, { dados })
      console.log(`[SciIdSistema] ✓ ${requestId} concluído`)
    } catch (e) {
      console.warn(`[SciIdSistema] ✗ ${requestId}: ${e.message}`)
      try { await postarContratoCallback(baseUrl, requestId, { erro: e.message }) } catch {}
    }
  }

  // ── Import do cadastro legado (OneClick v1 / MySQL) via a mesma ponte ──
  // O SM (na LAN) lê o MySQL legado e devolve as linhas cruas; a API aplica.
  // Config do banco vem de launcher-settings.json → `legacyDb` (host/port/user/
  // password/database), com fallback pros envs LEGACY_DB_* e defaults.
  function legacyDbConfig() {
    const s = (loadSettings().legacyDb) || {}
    return {
      host: s.host || process.env.LEGACY_DB_HOST || 'localhost',
      port: Number(s.port || process.env.LEGACY_DB_PORT || 3306),
      user: s.user || process.env.LEGACY_DB_USER || 'root',
      password: s.password != null ? s.password : (process.env.LEGACY_DB_PASSWORD || ''),
      database: s.database || process.env.LEGACY_DB_NAME || 'oneclick_fiscal_serpro',
      connectTimeout: 8000,
    }
  }

  async function lerClienteLegado(payload) {
    const cnpj = String((payload && payload.cnpj) || '').replace(/\D/g, '')
    if (cnpj.length !== 14) throw new Error('CNPJ inválido — importação apenas para 14 dígitos')
    // eslint-disable-next-line global-require
    const mysql = require('mysql2/promise')
    const conn = await mysql.createConnection(legacyDbConfig())
    try {
      const [cliRows] = await conn.query(
        `SELECT id FROM clientes WHERE REPLACE(REPLACE(REPLACE(documento, '.', ''), '/', ''), '-', '') = ? LIMIT 1`, [cnpj])
      const serpro2Id = cliRows && cliRows[0] && cliRows[0].id
      if (!serpro2Id) return { found: false }
      const [popRows] = await conn.query(
        `SELECT inscricao_estadual, inscricao_municipal, nire, rg_edificacao, codigo_simples,
                bombeiros_tipo, bombeiros_metragem, bombeiros_rota, bombeiros_projeto,
                bombeiros_capacidade, bombeiros_referencia, latitude, longitude, cnae, acesso_siat
         FROM cliente_legalizacao_pop WHERE cliente_id = ? LIMIT 1`, [serpro2Id])
      const [acessos] = await conn.query(
        `SELECT tipo, link, usuario, senha FROM cliente_legalizacao_acessos WHERE cliente_id = ?`, [serpro2Id])
      const [vencimentos] = await conn.query(
        `SELECT tipo_alvara, vencimento, observacoes FROM cliente_legalizacao_vencimentos WHERE cliente_id = ?`, [serpro2Id])
      const [andamentos] = await conn.query(
        `SELECT tipo, titulo, vencimento, descricao_html FROM cliente_legalizacao_andamentos WHERE cliente_id = ?`, [serpro2Id])
      const [socios] = await conn.query(
        `SELECT nome, documento, qualificacao, percentual_participacao, valor_participacao, representante_nome, representante_qualificacao
         FROM clientes_socios WHERE cliente_id = ? AND ativo = 1`, [serpro2Id])
      return {
        found: true,
        pop: (popRows && popRows[0]) || null,
        acessos: acessos || [],
        vencimentos: vencimentos || [],
        andamentos: andamentos || [],
        socios: socios || [],
      }
    } finally { try { await conn.end() } catch {} }
  }

  async function processarClienteImportRequest(baseUrl, event) {
    const { requestId, payload } = event
    if (!requestId || !payload) return
    console.log(`[ClienteImport] Recebido ${requestId} — cnpj=${payload.cnpj}`)
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('contrato-sync-event', { type: 'cliente-import-started', requestId })
    try {
      const dados = await lerClienteLegado(payload)
      await postarContratoCallback(baseUrl, requestId, { dados })
      console.log(`[ClienteImport] ✓ ${requestId} concluído`)
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('contrato-sync-event', { type: 'cliente-import-completed', requestId })
    } catch (e) {
      console.warn(`[ClienteImport] ✗ ${requestId}: ${e.message}`)
      try { await postarContratoCallback(baseUrl, requestId, { erro: e.message }) } catch {}
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('contrato-sync-event', { type: 'cliente-import-failed', requestId, erro: e.message })
    }
  }

  // ── Backfill de descrições de certificados (OneClick V1) ──────────────────
  // Lê o MySQL legado (creds vêm no payload, resolvidas pela API) e devolve
  // [{ id, descricao, nomeArquivo }] dos arquivos de certificado. A API atualiza
  // as observações dos certs. Tenta o schema V1 (cad_cli_files) e cai pro SERPRO2.
  async function lerCertDescricoes(payload) {
    const db = payload && payload.db
    if (!db || !db.host || !db.database) throw new Error('Config do banco legado ausente no pedido')
    // eslint-disable-next-line global-require
    const mysql = require('mysql2/promise')
    const conn = await mysql.createConnection({
      host: db.host, port: Number(db.port || 3306), user: db.user, password: db.password || '',
      database: db.database, charset: 'utf8mb4', connectTimeout: 10000,
    })
    try {
      let rows
      try {
        [rows] = await conn.query(
          `SELECT a.id AS id, a.descricao AS descricao, a.arquivo AS nomeArquivo
           FROM cad_cli_files a WHERE a.tipo = '6' AND a.ativo = 1`)
      } catch {
        [rows] = await conn.query(
          `SELECT a.id AS id, a.notas AS descricao, a.nome_original AS nomeArquivo
           FROM clientes_arquivos a WHERE a.is_certificado = 1`)
      }
      return (rows || []).map((r) => ({
        id: Number(r.id),
        descricao: r.descricao != null ? String(r.descricao) : null,
        nomeArquivo: r.nomeArquivo != null ? String(r.nomeArquivo) : null,
      }))
    } finally { try { await conn.end() } catch {} }
  }

  async function processarCertDescricoesRequest(baseUrl, event) {
    const { requestId, payload } = event
    if (!requestId) return
    console.log(`[CertDescricoes] Recebido ${requestId}`)
    try {
      const descricoes = await lerCertDescricoes(payload)
      // O callback exige o wrapper { dados } (resolveRemoteRequest usa body.dados).
      await postarContratoCallback(baseUrl, requestId, { dados: { descricoes } })
      console.log(`[CertDescricoes] ✓ ${requestId} — ${descricoes.length} descrição(ões)`)
    } catch (e) {
      console.warn(`[CertDescricoes] ✗ ${requestId}: ${e.message}`)
      try { await postarContratoCallback(baseUrl, requestId, { erro: e.message }) } catch {}
    }
  }

  async function contratoSyncStreamStart(baseUrl) {
    // Aborta o stream anterior SEM desativar (permite reconexão automática).
    if (contratoSyncReconnectTimer) { clearTimeout(contratoSyncReconnectTimer); contratoSyncReconnectTimer = null }
    if (contratoSyncStreamCtrl) { try { contratoSyncStreamCtrl.abort() } catch {}; contratoSyncStreamCtrl = null }
    contratoSyncActive = true
    contratoSyncBaseUrl = baseUrl
    const cookieStr = biSyncCookies.get(baseUrl) || ''
    if (!cookieStr) { contratoSyncActive = false; return }
    contratoSyncStreamCtrl = new AbortController()
    const url = `${baseUrl}/api/contratos-sync/eventos`
    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Origin': baseUrl,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Cookie': cookieStr,
          'User-Agent': 'OneClick-Launcher/1.0',
        },
        signal: contratoSyncStreamCtrl.signal,
      })
      if (!resp.ok || !resp.body) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('contrato-sync-event', { type: '__error', status: resp.status })
        }
        contratoSyncAgendarReconexao()  // API pode estar reiniciando (deploy) — tenta de novo
        return
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) {
          const dataLine = ev.split('\n').find(l => l.startsWith('data:'))
          if (!dataLine) continue
          try {
            const json = JSON.parse(dataLine.slice(5).trim())
            if (json.type === 'contrato-erp-request') {
              // Dispatcha em background — não bloqueia o reader do SSE
              processarContratoErpRequest(baseUrl, json).catch(() => {})
            } else if (json.type === 'cliente-import-request') {
              processarClienteImportRequest(baseUrl, json).catch(() => {})
            } else if (json.type === 'cert-descricoes-request') {
              processarCertDescricoesRequest(baseUrl, json).catch(() => {})
            } else if (json.type === 'sci-id-sistema-request') {
              processarSciIdSistemaRequest(baseUrl, json).catch(() => {})
            } else if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('contrato-sync-event', json)
            }
          } catch { /* skip malformed */ }
        }
      }
      // Stream fechou pelo servidor (done) — reconecta se ainda ativo.
      contratoSyncAgendarReconexao()
    } catch (e) {
      if (e.name !== 'AbortError') {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('contrato-sync-event', { type: '__error', message: e.message })
        }
        contratoSyncAgendarReconexao()  // erro de rede/terminated — reconecta
      }
    }
  }

  ipcMain.handle('contrato-sync-stream-start', (_e, baseUrl) => {
    contratoSyncStreamStart(baseUrl).catch(() => {})
    return { ok: true }
  })
  ipcMain.handle('contrato-sync-stream-stop', () => {
    contratoSyncStreamStop()
    return { ok: true }
  })

  // ════════════════════════════════════════════════════════
  // DEPLOY — painel "Publicar Implementações"
  // Lê .deploy.local (SSH host/key/user) e orquestra:
  //   1. git push local  →  10%
  //   2. ssh git pull    →  25%
  //   3. ssh prisma db push (se schema mudou)  →  40%
  //   4. ssh docker build api  →  65%
  //   5. ssh docker build web  →  85%
  //   6. ssh docker up -d + health check  →  100%
  // ════════════════════════════════════════════════════════
  function readDeployConfig() {
    try {
      const file = path.join(projectRoot, '.deploy.local')
      if (!fs.existsSync(file)) return null
      const content = fs.readFileSync(file, 'utf8')
      const cfg = {}
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^([A-Z_]+)=(.*)$/)
        if (m) cfg[m[1]] = m[2].trim()
      }
      return cfg
    } catch { return null }
  }

  function sshCmd(cfg) {
    // Retorna o prefixo SSH como array de args
    return [
      '-i', cfg.SSH_KEY_PATH,
      '-p', cfg.SSH_PORT || '22',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ConnectTimeout=10',
      `${cfg.SSH_USER || 'root'}@${cfg.SSH_HOST}`,
    ]
  }

  function gitOutput(args, cwd) {
    const r = spawnSync('git', args, { cwd: cwd || projectRoot, encoding: 'utf8', windowsHide: true })
    // ATENÇÃO: NÃO usar .trim() — o porcelain do git status começa com whitespace
    // significativo (" M path" tem espaço no índice 0). Trim cortaria esse espaço e
    // deslocaria o slice(3) que extrai o path, virando "apps/..." em "pps/...".
    // Removemos APENAS \r\n no final.
    return (r.stdout || '').replace(/\r?\n+$/, '')
  }

  // Branch default do repositório (trunk). Usa origin/HEAD; cai pra main/master.
  function detectDefaultBranch(cwd) {
    const ref = gitOutput(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD'], cwd)
    const m = ref.match(/refs\/remotes\/origin\/(.+)$/)
    if (m) return m[1]
    if (gitExitCode(['rev-parse', '--verify', 'origin/main'], cwd) === 0) return 'main'
    if (gitExitCode(['rev-parse', '--verify', 'origin/master'], cwd) === 0) return 'master'
    return null
  }

  function gitStatusForDeployProject(def, cfg) {
    const cwd = def.cwd
    if (!cwd || !fs.existsSync(cwd)) {
      return { id: def.id, label: def.label, ok: false, configured: false, error: `Pasta não encontrada: ${cwd || '-'}` }
    }
    if (gitExitCode(['rev-parse', '--is-inside-work-tree'], cwd) !== 0) {
      return { id: def.id, label: def.label, ok: false, configured: false, error: 'Pasta ainda não é um repositório Git.' }
    }

    const localBranch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
    const deployBranch = def.branch || localBranch
    const localSha = gitOutput(['rev-parse', 'HEAD'], cwd)
    const localShort = gitOutput(['rev-parse', '--short', 'HEAD'], cwd)
    const localStatus = gitOutput(['status', '--porcelain'], cwd)
    const dirtyFiles = localStatus.split('\n').filter(Boolean).map(l => ({
      status: l.slice(0, 2).trim(),
      path: l.slice(3),
    }))
    const dirtyRelevant = dirtyFiles.filter(d => {
      if (d.status === '??') {
        if (d.path.endsWith('.bak') || d.path.includes('.env.bak.') || d.path.includes('/tmp/')) return false
        if (def.id === 'app' && d.path.replace(/\\/g, '/').startsWith('scripts/mobile-dist/')) return false
      }
      return true
    })

    const remoteUrl = gitOutput(['remote', 'get-url', 'origin'], cwd)
    const hasRemote = gitExitCode(['remote', 'get-url', 'origin'], cwd) === 0 && !!remoteUrl
    const remoteDir = def.remoteDir
    if (!hasRemote) {
      return {
        id: def.id, label: def.label, kind: def.kind, cwd, localBranch, deployBranch, localSha, localShort,
        localDirty: dirtyRelevant.length, dirtyFiles: dirtyRelevant.slice(0, 30),
        configured: false, deployable: false, remoteConfigured: false, vpsConfigured: !!remoteDir,
        error: 'origin não configurado neste repositório.',
        pendingPush: [], pendingDeploy: [], synced: false,
      }
    }

    spawnSync('git', ['fetch', '--quiet'], { cwd, timeout: 15000, windowsHide: true })
    const hasRemoteBranch = gitExitCode(['rev-parse', '--verify', `origin/${deployBranch}`], cwd) === 0
    // A coluna "GITHUB" do painel = o TRUNK (default branch / main), pra onde o
    // código converge via PR/merge — NÃO a origem da branch local (que pode estar
    // defasada ou nem existir). Assim o sha e o rótulo refletem o main de verdade,
    // independentemente da branch em que você está localmente.
    const trunkBranch = def.branch || detectDefaultBranch(cwd) || 'main'
    const hasTrunk = gitExitCode(['rev-parse', '--verify', `origin/${trunkBranch}`], cwd) === 0
    const remoteSha = hasTrunk ? gitOutput(['rev-parse', `origin/${trunkBranch}`], cwd) : ''
    const remoteShort = hasTrunk ? gitOutput(['rev-parse', '--short', `origin/${trunkBranch}`], cwd) : ''
    // Commits locais ainda não publicados — comparados por CONTEÚDO contra o
    // trunk via `git cherry` (marca "-" o que já está no trunk com SHA diferente
    // e "+" o genuinamente novo; ancestrais do trunk nem aparecem). Evita falso
    // "não pushado" ao trabalhar numa branch que entra no main via PR/cherry-pick.
    let pendingPush
    if (hasTrunk) {
      pendingPush = gitOutput(['cherry', '-v', `origin/${trunkBranch}`, 'HEAD'], cwd)
        .split('\n').filter(l => l.startsWith('+ '))
        .map(l => {
          const m = l.match(/^\+\s+(\S+)\s+([\s\S]*)$/)
          const sha = m ? m[1] : ''
          return { sha, short: sha.slice(0, 7), msg: m ? m[2] : '' }
        })
        .filter(c => c.sha)
    } else {
      pendingPush = gitOutput(['log', hasRemoteBranch ? `origin/${deployBranch}..HEAD` : 'HEAD', '--format=%H%x09%h%x09%s'], cwd)
        .split('\n').filter(Boolean)
        .map(l => {
          const [sha, short, ...msgParts] = l.split('\t')
          return { sha, short, msg: msgParts.join('\t') }
        })
    }

    let vpsSha = ''
    let vpsShort = ''
    let vpsReachable = false
    let pendingDeploy = []
    let schemaChanged = false
    if (cfg && cfg.SSH_HOST && remoteDir) {
      const sshArgs = sshCmd(cfg)
      const vpsResult = spawnSync('ssh', [...sshArgs, `cd ${remoteDir} && git rev-parse HEAD 2>/dev/null`], { encoding: 'utf8', timeout: 15000, windowsHide: true })
      vpsSha = (vpsResult.stdout || '').trim()
      vpsShort = vpsSha.slice(0, 7)
      vpsReachable = vpsResult.status === 0 && vpsSha.length > 0
      if (vpsReachable && hasTrunk && vpsSha !== remoteSha) {
        pendingDeploy = gitOutput(['log', `${vpsSha}..${remoteSha}`, '--format=%H%x09%h%x09%s'], cwd)
          .split('\n').filter(Boolean)
          .map(l => {
            const [sha, short, ...msgParts] = l.split('\t')
            return { sha, short, msg: msgParts.join('\t') }
          })
        const diffFiles = gitOutput(['diff', '--name-only', vpsSha, remoteSha], cwd)
        schemaChanged = def.id === 'core' && diffFiles.split('\n').some(f => f === 'packages/db/prisma/schema.prisma')
      }
    }

    return {
      id: def.id, label: def.label, kind: def.kind, cwd, localBranch, deployBranch, localSha, localShort,
      localDirty: dirtyRelevant.length, dirtyFiles: dirtyRelevant.slice(0, 30),
      remoteSha, remoteShort, remoteUrl, remoteBranch: trunkBranch,
      vpsSha, vpsShort, vpsReachable,
      configured: true,
      deployable: hasRemote && !!remoteDir,
      remoteConfigured: hasRemote,
      vpsConfigured: !!remoteDir,
      pendingPush, pendingDeploy, schemaChanged,
      synced: vpsReachable && vpsSha === localSha && hasTrunk && pendingPush.length === 0 && dirtyRelevant.length === 0,
      error: !remoteDir ? 'Caminho remoto da VPS não configurado.' : null,
      remoteBranchMissing: !hasTrunk,
    }
  }

  function deployProjectDefs(cfg) {
    return [
      { id: 'core', label: 'Core/API/Web', kind: 'core', cwd: projectRoot, remoteDir: cfg?.CORE_REMOTE_DIR || cfg?.REMOTE_DIR || '/opt/oneclick-src' },
      { id: 'app', label: 'App Mobile', kind: 'app', cwd: appProjectRoot, remoteDir: cfg?.APP_REMOTE_DIR || '', branch: cfg?.APP_BRANCH || 'app-mobile' },
    ]
  }

  function shellQuote(s) {
    return `'${String(s).replace(/'/g, `'\\''`)}'`
  }

  function inferGitHubRepoFromRemote(remoteUrl) {
    const s = String(remoteUrl || '').trim()
<<<<<<< Updated upstream
    let m = s.match(/github\.com[:/](.+?)(?:\.git)?$/i)
    if (!m) return ''
    return m[1].replace(/\.git$/i, '')
=======
    const m = s.match(/github\.com[:/](.+?)(?:\.git)?$/i)
    return m ? m[1].replace(/\.git$/i, '') : ''
>>>>>>> Stashed changes
  }

  function deployGitHubRepo(cfg) {
    if (cfg?.GITHUB_REPO) return cfg.GITHUB_REPO
<<<<<<< Updated upstream
    const remoteUrl = gitOutput(['remote', 'get-url', 'origin'], projectRoot)
    return inferGitHubRepoFromRemote(remoteUrl)
=======
    return inferGitHubRepoFromRemote(gitOutput(['remote', 'get-url', 'origin'], projectRoot))
>>>>>>> Stashed changes
  }

  function githubJson(pathname, cfg) {
    return new Promise((resolve) => {
      const repo = deployGitHubRepo(cfg)
      if (!repo) return resolve({ ok: false, error: 'GITHUB_REPO não configurado e não foi possível inferir pelo origin.' })
      const headers = {
        'User-Agent': 'OneClick-Service-Manager',
<<<<<<< Updated upstream
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
      if (cfg?.GITHUB_TOKEN) headers.Authorization = `Bearer ${cfg.GITHUB_TOKEN}`
      const req = https.request({
        hostname: 'api.github.com',
        path: `/repos/${repo}${pathname}`,
        method: 'GET',
        headers,
      }, (res) => {
=======
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
      if (cfg?.GITHUB_TOKEN) headers.Authorization = `Bearer ${cfg.GITHUB_TOKEN}`
      const req = https.request({ hostname: 'api.github.com', path: `/repos/${repo}${pathname}`, method: 'GET', headers }, (res) => {
>>>>>>> Stashed changes
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          try {
            const data = body ? JSON.parse(body) : null
            if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ ok: true, data, repo, rate: res.headers['x-ratelimit-remaining'] })
<<<<<<< Updated upstream
            const msg = data?.message || `GitHub HTTP ${res.statusCode}`
            resolve({ ok: false, error: msg, status: res.statusCode, repo })
=======
            resolve({ ok: false, error: data?.message || `GitHub HTTP ${res.statusCode}`, status: res.statusCode, repo })
>>>>>>> Stashed changes
          } catch (e) {
            resolve({ ok: false, error: e.message, status: res.statusCode, repo })
          }
        })
      })
<<<<<<< Updated upstream
      req.setTimeout(15000, () => {
        req.destroy(new Error('timeout ao consultar GitHub'))
      })
=======
      req.setTimeout(15000, () => req.destroy(new Error('timeout ao consultar GitHub')))
>>>>>>> Stashed changes
      req.on('error', err => resolve({ ok: false, error: err.message, repo }))
      req.end()
    })
  }

<<<<<<< Updated upstream
  // Mescla um PR na sua base (main) via API do GitHub. Requer GITHUB_TOKEN com
  // permissão de escrita/merge no repo. Retorna { ok, merged, error, status }.
  function githubMergePr(number, cfg, mergeMethod = 'merge') {
    return new Promise((resolve) => {
      const repo = deployGitHubRepo(cfg)
      if (!repo) return resolve({ ok: false, error: 'GITHUB_REPO não configurado.' })
      const payload = JSON.stringify({ merge_method: mergeMethod })
      const headers = {
        'User-Agent': 'OneClick-Service-Manager',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      }
      if (cfg?.GITHUB_TOKEN) headers.Authorization = `Bearer ${cfg.GITHUB_TOKEN}`
      const req = https.request({
        hostname: 'api.github.com',
        path: `/repos/${repo}/pulls/${number}/merge`,
        method: 'PUT',
        headers,
      }, (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          try {
            const data = body ? JSON.parse(body) : null
            if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ ok: true, merged: !!data?.merged, data })
            resolve({ ok: false, error: data?.message || `GitHub HTTP ${res.statusCode}`, status: res.statusCode })
          } catch (e) {
            resolve({ ok: false, error: e.message, status: res.statusCode })
          }
        })
      })
      req.setTimeout(20000, () => req.destroy(new Error('timeout ao mesclar PR no GitHub')))
      req.on('error', err => resolve({ ok: false, error: err.message }))
      req.write(payload)
      req.end()
    })
  }

  async function githubListPrCommits(repo, number, cfg) {
=======
  async function githubListPrCommits(number, cfg) {
>>>>>>> Stashed changes
    const r = await githubJson(`/pulls/${number}/commits?per_page=100`, cfg)
    if (!r.ok) return []
    return (Array.isArray(r.data) ? r.data : []).map(c => ({
      sha: c.sha,
      short: String(c.sha || '').slice(0, 7),
      msg: String(c.commit?.message || '').split('\n')[0],
      author: c.commit?.author?.name || c.author?.login || '',
    }))
  }

<<<<<<< Updated upstream
=======
  async function githubListPrFiles(number, cfg) {
    const r = await githubJson(`/pulls/${number}/files?per_page=100`, cfg)
    if (!r.ok) return []
    return (Array.isArray(r.data) ? r.data : []).map(f => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: f.patch || '',
    }))
  }

>>>>>>> Stashed changes
  ipcMain.handle('deploy:list-prs', async () => {
    try {
      const cfg = readDeployConfig() || {}
      const repo = deployGitHubRepo(cfg)
      if (!repo) return { ok: false, error: 'Configure GITHUB_REPO no .deploy.local ou ajuste o origin do GitHub.' }
      const prsRes = await githubJson('/pulls?state=open&per_page=50&sort=updated&direction=desc', cfg)
      if (!prsRes.ok) return { ok: false, error: prsRes.error, status: prsRes.status, repo }
<<<<<<< Updated upstream
      const projectDefs = deployProjectDefs(cfg)
      const projectByBase = new Map()
      for (const p of projectDefs) projectByBase.set(p.branch || (p.id === 'core' ? 'main' : ''), p)
      const prs = []
      for (const pr of (prsRes.data || [])) {
        const baseRef = pr.base?.ref || ''
        const project = projectByBase.get(baseRef) || (baseRef === 'main' ? projectDefs.find(p => p.id === 'core') : null)
        const commits = await githubListPrCommits(repo, pr.number, cfg)
=======
      const defs = deployProjectDefs(cfg)
      const byBranch = new Map(defs.map(d => [d.branch || (d.id === 'core' ? 'main' : ''), d]))
      const prs = []
      for (const pr of (prsRes.data || [])) {
        const baseRef = pr.base?.ref || ''
        const project = byBranch.get(baseRef) || (baseRef === 'main' ? defs.find(d => d.id === 'core') : null)
        const [commits, files] = await Promise.all([
          githubListPrCommits(pr.number, cfg),
          githubListPrFiles(pr.number, cfg),
        ])
>>>>>>> Stashed changes
        prs.push({
          number: pr.number,
          title: pr.title,
          body: pr.body || '',
          url: pr.html_url,
          author: pr.user?.login || '',
          baseRef,
          headRef: pr.head?.ref || '',
          headSha: pr.head?.sha || '',
          draft: !!pr.draft,
          mergeable: pr.mergeable,
<<<<<<< Updated upstream
=======
          createdAt: pr.created_at,
>>>>>>> Stashed changes
          updatedAt: pr.updated_at,
          projectId: project?.id || (baseRef === (cfg.APP_BRANCH || 'app-mobile') ? 'app' : 'core'),
          projectLabel: project?.label || (baseRef === (cfg.APP_BRANCH || 'app-mobile') ? 'App Mobile' : 'Core/API/Web'),
          commits,
<<<<<<< Updated upstream
=======
          files,
>>>>>>> Stashed changes
        })
      }
      return { ok: true, repo, prs, tokenConfigured: !!cfg.GITHUB_TOKEN, rate: prsRes.rate }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('deploy:status', async () => {
    try {
      const cfg = readDeployConfig()
      if (!cfg || !cfg.SSH_HOST) return { ok: false, error: '.deploy.local não configurado (SSH_HOST faltando)' }

      const projects = deployProjectDefs(cfg).map(def => gitStatusForDeployProject(def, cfg))
      const core = projects.find(p => p.id === 'core') || projects[0]
      return {
        ok: true,
        projects,
        ...core,
        localDirty: core.localDirty || 0,
        dirtyFiles: core.dirtyFiles || [],
        pendingPush: core.pendingPush || [],
        pendingDeploy: core.pendingDeploy || [],
      }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  // Log de debug em arquivo — toda atividade do deploy é gravada aqui pra diagnóstico
  // mesmo quando o renderer não recebe os eventos IPC.
  const deployDebugLogPath = path.join(app.getPath('userData'), 'deploy-debug.log')
  function deployDebugLog(msg) {
    try {
      const line = `[${new Date().toISOString()}] ${msg}\n`
      fs.appendFileSync(deployDebugLogPath, line)
    } catch {}
  }

  function deployEmit(progress, step, log, level) {
    deployDebugLog(`EMIT progress=${progress} step=${step} level=${level || 'info'} log="${(log || '').slice(0, 200)}"`)
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('deploy:event', { progress, step, log, level: level || 'info', timestamp: Date.now() })
        deployDebugLog(`  ↳ webContents.send OK`)
      } else {
        deployDebugLog(`  ↳ SKIPPED (mainWindow=${!!mainWindow}, destroyed=${mainWindow ? mainWindow.isDestroyed() : 'n/a'})`)
      }
    } catch (e) {
      deployDebugLog(`  ↳ ERROR: ${e.message}`)
    }
  }

  // timeoutMs (opcional): se o comando SSH estalar (ex: psql preso em lock), mata em
  // vez de pendurar o deploy pra sempre. Sem timeoutMs = sem corte (builds longos).
  function sshExec(cfg, remoteCmd, onLine, timeoutMs) {
    return new Promise((resolve) => {
      const args = [...sshCmd(cfg), remoteCmd]
      const proc = spawn('ssh', args, { windowsHide: true })
      deployTrackProcess(proc, 'ssh')
      let stdoutBuf = ''
      let stderrBuf = ''
      let timedOut = false
      const timer = timeoutMs ? setTimeout(() => {
        timedOut = true
        try { proc.kill('SIGKILL') } catch {}
      }, timeoutMs) : null
      proc.stdout.on('data', (d) => {
        const s = d.toString()
        stdoutBuf += s
        if (onLine) s.split(/\r?\n/).filter(Boolean).forEach(onLine)
      })
      proc.stderr.on('data', (d) => {
        const s = d.toString()
        stderrBuf += s
        if (onLine) s.split(/\r?\n/).filter(Boolean).forEach(l => onLine(l))
      })
      proc.on('close', (code) => {
        if (timer) clearTimeout(timer)
        resolve({ code: timedOut ? 124 : code, stdout: stdoutBuf, stderr: stderrBuf, timedOut })
      })
      proc.on('error', (err) => {
        if (timer) clearTimeout(timer)
        resolve({ code: 1, error: err.message, stdout: stdoutBuf, stderr: stderrBuf, timedOut })
      })
    })
  }

  // Async git executor — não bloqueia event loop (eventos IPC fluem em tempo real).
  // GIT_TERMINAL_PROMPT=0 + GCM_INTERACTIVE=Never → falha imediato se faltar credencial
  // (em vez de travar esperando popup).
  function gitExec(args, onLine, timeoutMs, cwd = projectRoot) {
    return new Promise((resolve) => {
      const env = {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never',
      }
      const proc = spawn('git', args, { cwd, windowsHide: true, env })
      deployTrackProcess(proc, 'git')
      let stdoutBuf = ''
      let stderrBuf = ''
      let killed = false
      const timer = timeoutMs ? setTimeout(() => {
        killed = true
        try { proc.kill('SIGKILL') } catch {}
      }, timeoutMs) : null
      proc.stdout.on('data', (d) => {
        const s = d.toString()
        stdoutBuf += s
        if (onLine) s.split(/\r?\n/).filter(Boolean).forEach(onLine)
      })
      proc.stderr.on('data', (d) => {
        const s = d.toString()
        stderrBuf += s
        if (onLine) s.split(/\r?\n/).filter(Boolean).forEach(l => onLine(l))
      })
      proc.on('close', (code) => {
        if (timer) clearTimeout(timer)
        resolve({ code: killed ? 124 : code, stdout: stdoutBuf, stderr: stderrBuf, timedOut: killed })
      })
      proc.on('error', (err) => {
        if (timer) clearTimeout(timer)
        resolve({ code: 1, error: err.message, stdout: stdoutBuf, stderr: stderrBuf })
      })
    })
  }

  let deployRunning = false
  let deployAbortRequested = false
  let deployCurrentProc = null
  let deployCurrentProcKind = null
  let deployCurrentStep = null

  function deployTrackProcess(proc, kind) {
    deployCurrentProc = proc
    deployCurrentProcKind = kind
    proc.once('close', () => {
      if (deployCurrentProc === proc) {
        deployCurrentProc = null
        deployCurrentProcKind = null
      }
    })
  }

  function gitExitCode(args, cwd) {
    const r = spawnSync('git', args, { cwd: cwd || projectRoot, encoding: 'utf8', windowsHide: true })
    return r.status ?? 1
  }

  function deployCheckAbort(step, progress) {
    if (!deployAbortRequested) return
    const err = new Error('Deploy abortado pelo usuário')
    err.code = 'DEPLOY_ABORTED'
    err.step = step || deployCurrentStep || 'deploy'
    err.progress = typeof progress === 'number' ? progress : undefined
    throw err
  }

  ipcMain.handle('deploy:read-debug-log', async () => {
    try {
      if (!fs.existsSync(deployDebugLogPath)) return { ok: true, content: '(arquivo vazio — nenhum deploy registrado)' }
      const all = fs.readFileSync(deployDebugLogPath, 'utf8')
      const lines = all.split('\n')
      const tail = lines.slice(-200).join('\n')
      return { ok: true, content: tail, path: deployDebugLogPath }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })

  ipcMain.handle('deploy:reset-flag', async () => {
    const wasRunning = deployRunning
    deployRunning = false
    deployAbortRequested = false
    deployDebugLog(`⟲ deployRunning resetado manualmente (era ${wasRunning})`)
    return { ok: true, wasRunning }
  })

  ipcMain.handle('deploy:abort', async () => {
    if (!deployRunning) return { ok: false, error: 'Nenhum deploy em andamento.' }
    deployAbortRequested = true
    deployEmit(null, deployCurrentStep || 'abort', 'Abort solicitado. O deploy será interrompido no próximo ponto seguro.', 'warn')
    if (deployCurrentProc && deployCurrentProcKind === 'git') {
      try { deployCurrentProc.kill('SIGKILL') } catch {}
      return { ok: true, mode: 'local-kill', message: 'Processo local interrompido. Finalizando abort seguro...' }
    }
    return { ok: true, mode: 'safe-wait', message: 'Abort solicitado. Aguardando a etapa atual terminar com seguranca...' }
  })

  ipcMain.handle('deploy:execute', async (_e, payload) => {
    deployDebugLog(`╔═══ deploy:execute INVOKED — payload=${JSON.stringify(payload || null).slice(0, 300)}`)
    deployDebugLog(`║ deployRunning=${deployRunning}, mainWindow=${!!mainWindow}, projectRoot=${projectRoot}`)
    if (deployRunning) {
      deployDebugLog(`║ ✗ JÁ HÁ DEPLOY EM ANDAMENTO — retornando imediatamente`)
      return { ok: false, error: 'Já existe um deploy em andamento. (Se você acha que travou, use o botão "Reset" no painel.)' }
    }
    deployRunning = true
    deployAbortRequested = false
    deployCurrentStep = 'init'
    // Emit inicial — prova ao renderer que o handler foi chamado.
    deployEmit(1, 'init', `→ Iniciando deploy (payload=${payload ? 'com mensagem' : 'sem mensagem'})`, 'info')
    try {
      const cfg = readDeployConfig()
      if (!cfg || !cfg.SSH_HOST) {
        deployRunning = false
        deployEmit(1, 'init', '✗ .deploy.local não configurado', 'err')
        return { ok: false, error: '.deploy.local não configurado' }
      }
      deployEmit(1, 'init', `· VPS: ${cfg.SSH_HOST}`, 'info')

      const requestedTargets = Array.isArray(payload?.targets) && payload.targets.length ? payload.targets : ['core']
      const knownTargets = new Set(['core', 'app'])
      const targets = requestedTargets.filter(t => knownTargets.has(t))
      if (!targets.length) return { ok: false, error: 'Nenhum alvo de deploy selecionado.' }
      const appRequested = targets.includes('app')
      if (appRequested) {
        const appStatus = gitStatusForDeployProject(deployProjectDefs(cfg).find(p => p.id === 'app'), cfg)
        if (!appStatus.deployable) {
          deployRunning = false
          deployEmit(1, 'init', `✗ App Mobile não configurado para deploy: ${appStatus.error || 'configuração incompleta'}`, 'err')
          return {
            ok: false,
            error: `App Mobile não configurado para deploy. Configure origin em D:\\app e APP_REMOTE_DIR no .deploy.local. Detalhe: ${appStatus.error || 'configuração incompleta'}`,
          }
        }
      }
      const commitMessage = (payload && payload.commitMessage) ? String(payload.commitMessage).trim() : ''
      const targetShas = (payload && payload.targetShas && typeof payload.targetShas === 'object') ? payload.targetShas : {}
      const prTargets = (payload && payload.prTargets && typeof payload.prTargets === 'object') ? payload.prTargets : {}
      let targetSha = targetShas.core ? String(targetShas.core).trim() : ((payload && payload.targetSha) ? String(payload.targetSha).trim() : '')
      if (targetSha && !/^[0-9a-f]{7,40}$/i.test(targetSha)) {
        return { ok: false, error: 'Commit selecionado invalido.' }
      }

      if (targets.includes('core')) {
      // ─── Stage 0: git commit (se houver dirty + mensagem) ───
      deployCheckAbort('commit', 1)
      deployCurrentStep = 'commit'
      const statusOut = gitOutput(['status', '--porcelain'])
      const dirtyAll = statusOut.split('\n').filter(Boolean).map(l => ({
        status: l.slice(0, 2).trim(),
        path: l.slice(3),
      }))
      const dirtyRelevant = dirtyAll.filter(d => {
        if (d.status === '??') {
          if (d.path.endsWith('.bak') || d.path.includes('.env.bak.') || d.path.includes('/tmp/')) return false
        }
        return true
      })
      if (dirtyRelevant.length > 0) {
        if (!commitMessage) {
          deployRunning = false
          return { ok: false, error: `${dirtyRelevant.length} arquivo(s) sem commit. Forneça uma mensagem de commit.`, needsCommitMessage: true }
        }
        deployEmit(2, 'commit', `→ Commitando ${dirtyRelevant.length} arquivo(s)...`, 'info')
        // git add: só os relevantes (preserva ignorados óbvios). Async em paralelo seria possível,
        // mas é mais seguro fazer sequencial pra preservar ordem e debugar.
        for (const d of dirtyRelevant) {
          const addRes = await gitExec(['add', '--', d.path], null, 10000)
          deployCheckAbort('commit', 3)
          if (addRes.code !== 0) {
            const msg = addRes.stderr || addRes.error || 'falha ao adicionar arquivo ao commit'
            deployEmit(3, 'commit', `✗ Falha ao adicionar "${d.path}": ${msg.slice(0, 200)}`, 'err')
            deployRunning = false
            return { ok: false, error: `Falha ao adicionar ${d.path}: ${msg.slice(0, 200)}` }
          }
          deployEmit(3, 'commit', `  + ${d.path}`, 'info')
        }
        const commitRes = await gitExec(['commit', '-m', commitMessage], null, 30000)
        deployCheckAbort('commit', 4)
        if (commitRes.code !== 0) {
          const msg = commitRes.stderr || commitRes.stdout || commitRes.error || 'criação do commit falhou'
          deployEmit(4, 'commit', `✗ ${msg.slice(0, 300)}`, 'err')
          deployRunning = false
          return { ok: false, error: 'Criação do commit falhou: ' + msg.slice(0, 200) }
        }
        deployEmit(4, 'commit', `✓ Commit criado: "${commitMessage.slice(0, 60)}"`, 'ok')
        targetSha = gitOutput(['rev-parse', 'HEAD'])
      }

      // ─── Stage 1: git push ─────────────────────────
      deployEmit(5, 'push', '→ Enviando para o GitHub...', 'info')
      deployCheckAbort('push', 5)
      deployCurrentStep = 'push'
      const localBranch = gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'])
      const corePrTarget = prTargets.core
      let coreDeployBranch = localBranch
      if (corePrTarget?.number) {
        deployEmit(5, 'push', `→ Buscando PR #${corePrTarget.number} no GitHub...`, 'info')
        const fetchPr = await gitExec(['fetch', 'origin', `pull/${corePrTarget.number}/head`], (line) => deployEmit(6, 'push', line, 'info'), 60000)
        if (fetchPr.code !== 0) {
<<<<<<< Updated upstream
          const msg = fetchPr.stderr || fetchPr.stdout || fetchPr.error || 'falha ao buscar PR no GitHub'
          deployRunning = false
          return { ok: false, error: 'Falha ao buscar PR no GitHub: ' + msg.slice(0, 200) }
        }
        const prSha = gitOutput(['rev-parse', 'FETCH_HEAD'])
        // ANTES: targetSha = head CRU do PR + `reset --hard` na VPS → como o PR parte
        // de uma base antiga, isso APAGAVA o que você já tinha deployado (que vive na
        // sua branch, não no PR). AGORA: integramos o PR POR CIMA da sua branch de
        // deploy (a "fila"), então o ref publicado = seu trabalho + PR. `merge --no-ff`
        // preserva os SHAs originais do PR — o merge no main no fim do deploy
        // (githubMergePr) reconhece esses commits e não duplica.
        if (gitExitCode(['merge-base', '--is-ancestor', prSha, 'HEAD']) === 0) {
          deployEmit(6, 'push', `· PR #${corePrTarget.number} já integrado na sua branch`, 'info')
        } else {
          deployEmit(6, 'push', `→ Integrando PR #${corePrTarget.number} na sua branch (${localBranch})...`, 'info')
          const prMsg = `deploy: integra PR #${corePrTarget.number}${corePrTarget.title ? ` — ${String(corePrTarget.title).slice(0, 80)}` : ''}`
          const mergePr = await gitExec(['merge', '--no-ff', '-m', prMsg, prSha], (line) => deployEmit(6, 'push', line, 'info'), 60000)
          if (mergePr.code !== 0) {
            // Conflito: aborta pra não deixar a árvore suja e avisa — você resolve à mão.
            await gitExec(['merge', '--abort'], null, 15000)
            deployRunning = false
            const msg = (mergePr.stdout || mergePr.stderr || '').slice(0, 200)
            deployEmit(7, 'push', `✗ Conflito ao integrar o PR #${corePrTarget.number}`, 'err')
            return { ok: false, error: `Conflito ao integrar o PR #${corePrTarget.number} na sua branch (${localBranch}). Resolva manualmente (merge do PR) e refaça o deploy. ${msg}` }
          }
        }
        // Deploya a SUA branch (agora com o PR por cima), não uma deploy/pr-* isolada.
        targetSha = gitOutput(['rev-parse', 'HEAD'])
        coreDeployBranch = localBranch
=======
          const msg = fetchPr.stderr || fetchPr.stdout || fetchPr.error || 'git fetch PR falhou'
          deployRunning = false
          return { ok: false, error: 'git fetch PR falhou: ' + msg.slice(0, 200) }
        }
        targetSha = gitOutput(['rev-parse', 'FETCH_HEAD'])
        coreDeployBranch = `deploy/pr-${corePrTarget.number}-core`
>>>>>>> Stashed changes
      }
      const remoteShaBeforePush = gitOutput(['rev-parse', `origin/${coreDeployBranch}`])
      if (!targetSha) targetSha = gitOutput(['rev-parse', 'HEAD'])
      if (!corePrTarget?.number && gitExitCode(['merge-base', '--is-ancestor', targetSha, 'HEAD']) !== 0) {
        return { ok: false, error: 'Commit selecionado não pertence ao histórico local.' }
      }
      if (gitExitCode(['cat-file', '-e', `${targetSha}^{commit}`]) !== 0) {
        return { ok: false, error: 'Commit selecionado não existe no repositório local.' }
      }
<<<<<<< Updated upstream
      // ── Auto-integra o <branch> remoto antes do push ──────────────────────────
      // Quando um PR de colega já entrou no origin/<branch>, o push do seu deploy
      // seria rejeitado (non-fast-forward). Integramos aqui (merge — preserva os
      // SHAs e lida com merge commits) pra o push virar fast-forward, trazendo o PR
      // do colega junto. Conflito real → aborta e avisa. Só quando publicando o
      // topo (HEAD) da própria branch de deploy.
      if (coreDeployBranch === localBranch) {
        await gitExec(['fetch', 'origin', coreDeployBranch], null, 30000)
        const remoteBranchSha = gitOutput(['rev-parse', `origin/${coreDeployBranch}`])
        const headSha = gitOutput(['rev-parse', 'HEAD'])
        const remoteAhead = remoteBranchSha && gitExitCode(['merge-base', '--is-ancestor', remoteBranchSha, targetSha]) !== 0
        if (remoteAhead && targetSha === headSha) {
          deployEmit(8, 'push', `→ ${coreDeployBranch} remoto à frente (PR de colega) — integrando...`, 'info')
          const integ = await gitExec(['merge', '--no-edit', `origin/${coreDeployBranch}`], (line) => deployEmit(8, 'push', line, 'info'), 60000)
          if (integ.code !== 0) {
            await gitExec(['merge', '--abort'], null, 15000)
            deployRunning = false
            deployEmit(9, 'push', `✗ Conflito ao integrar o ${coreDeployBranch} remoto`, 'err')
            return { ok: false, error: `Conflito ao integrar o "${coreDeployBranch}" remoto (provável PR de colega no mesmo arquivo). Resolva com "git pull origin ${coreDeployBranch}" e refaça o deploy.` }
          }
          targetSha = gitOutput(['rev-parse', 'HEAD'])
          deployEmit(9, 'push', `✓ ${coreDeployBranch} remoto integrado (${targetSha.slice(0, 7)})`, 'ok')
        } else if (remoteAhead) {
          deployRunning = false
          return { ok: false, error: `O "${coreDeployBranch}" remoto está à frente (PR de colega), mas você está publicando um commit específico (não o topo). Rode "git pull --rebase origin ${coreDeployBranch}" e tente de novo.` }
        }
      }
      // Timeout 60s — se Git Credential Manager pedir popup, mata em 60s ao invés de travar.
      const targetAlreadyRemote = remoteShaBeforePush && gitExitCode(['merge-base', '--is-ancestor', targetSha, remoteShaBeforePush]) === 0
      const pushResult = targetAlreadyRemote
        ? { code: 0, stdout: 'Commit alvo já está no GitHub (envio ignorado)' }
=======
      // Timeout 60s — se Git Credential Manager pedir popup, mata em 60s ao invés de travar.
      const targetAlreadyRemote = remoteShaBeforePush && gitExitCode(['merge-base', '--is-ancestor', targetSha, remoteShaBeforePush]) === 0
      const pushResult = targetAlreadyRemote
        ? { code: 0, stdout: 'Commit alvo ja esta no GitHub (push skip)' }
>>>>>>> Stashed changes
        : await gitExec(['push', 'origin', `${targetSha}:refs/heads/${coreDeployBranch}`], (line) => deployEmit(7, 'push', line, 'info'), 60000)
      deployCheckAbort('push', 10)
      if (pushResult.code !== 0) {
        const msg = pushResult.stderr || pushResult.stdout || pushResult.error || 'envio ao GitHub falhou'
        const extra = pushResult.timedOut ? ' [tempo limite de 60s — provavelmente falta credencial: rode `git push` no terminal para autenticar]' : ''
        deployEmit(10, 'push', `✗ ${msg.slice(0, 300)}${extra}`, 'err')
        deployRunning = false
        return { ok: false, error: 'Envio ao GitHub falhou: ' + msg.slice(0, 200) + extra }
      }
      deployEmit(10, 'push', `✓ Envio ao GitHub concluído (${targetSha.slice(0, 7)})`, 'ok')

      // ─── Stage 2: SSH atualiza código (git reset --hard no ref) ───
      deployEmit(15, 'pull', '→ Atualizando código na VPS...', 'info')
      deployCheckAbort('pull', 15)
      deployCurrentStep = 'pull'
<<<<<<< Updated upstream
      // A VPS é ALVO de deploy: deve espelhar exatamente o ref publicado (ela não
      // autora commits). `git reset --hard <sha>` evita o "Not possible to
      // fast-forward, aborting" que ocorre quando o checkout da VPS divergiu do
      // branch de deploy (ex.: PR partido de uma base antiga). Preserva HEAD@{1}
      // (usado na detecção de mudança de schema abaixo) e não remove arquivos
      // untracked (.env, uploads) — só reescreve os arquivos versionados.
      const pull = await sshExec(cfg, `cd /opt/oneclick-src && git fetch origin ${coreDeployBranch} 2>&1 && git reset --hard ${targetSha} 2>&1`, (line) => deployEmit(20, 'pull', line, 'info'))
=======
      const pull = await sshExec(cfg, `cd /opt/oneclick-src && git fetch origin ${coreDeployBranch} 2>&1 && git merge --ff-only ${targetSha} 2>&1`, (line) => deployEmit(20, 'pull', line, 'info'))
>>>>>>> Stashed changes
      if (pull.code !== 0) {
        deployEmit(25, 'pull', `✗ ${(pull.stderr || pull.stdout || '').slice(0, 300)}`, 'err')
        deployRunning = false
        return { ok: false, error: 'Atualização do código na VPS falhou' }
      }
      deployEmit(25, 'pull', '✓ Código atualizado na VPS', 'ok')

      // ─── Stage 3: Build API ────────────────────────
      // IMPORTANTE: build api PRECEDE o db push porque o `prisma db push` usa
      // a imagem `oneclick-api:latest` (que contém o schema.prisma). Se o build
      // for depois, o db push acaba rodando com schema antigo e tabelas novas
      // não são criadas.
      deployEmit(30, 'build-api', '→ Gerando imagem da API...', 'info')
      deployCheckAbort('build-api', 30)
      deployCurrentStep = 'build-api'
      const buildApi = await sshExec(cfg, 'cd /opt/oneclick && docker compose build api 2>&1', (line) => {
        if (!/^\s*$/.test(line) && !/exporting layers|exporting manifest|extracting|building cache/i.test(line)) {
          deployEmit(45, 'build-api', line, 'info')
        }
      })
      if (buildApi.code !== 0) {
        deployEmit(50, 'build-api', `✗ Geração da imagem da API falhou`, 'err')
        deployRunning = false
        return { ok: false, error: 'Geração da imagem da API falhou' }
      }
      deployEmit(50, 'build-api', '✓ Imagem da API gerada', 'ok')

      // ─── Stage 4: Schema (se mudou) ────────────────
      // Roda APÓS o build api, usando a imagem recém-buildada (com schema novo).
      deployCheckAbort('schema', 55)
      deployCurrentStep = 'schema'
      // Timeout no SSH (30s): se a VPS estiver sem responder, NÃO pendura o deploy
      // aqui. `git diff` é instantâneo — >30s significa SSH/VPS travado. Na dúvida,
      // assume "sem mudança de schema" e segue (os SQLs do Stage 4.5 ainda rodam).
      const diffFiles = await sshExec(cfg, 'cd /opt/oneclick-src && git diff --name-only HEAD@{1} HEAD 2>/dev/null', null, 30000)
      if (diffFiles.timedOut) {
        deployEmit(55, 'schema', '⚠ Verificação de schema expirou (VPS lenta/sem resposta) — assumindo sem mudança e seguindo.', 'warn')
      }
      const schemaChanged = !diffFiles.timedOut && (diffFiles.stdout || '').split('\n').some(f => f === 'packages/db/prisma/schema.prisma')
      if (schemaChanged) {
        deployEmit(55, 'schema', '→ Schema mudou — aplicando prisma db push (imagem recém-buildada)...', 'warn')
        // Timeout no SSH (4 min): se o db push pegar LOCK (a API no ar segurando as
        // tabelas que ele tenta alterar), NÃO pendura o deploy pra sempre — falha e
        // o usuário re-tenta (ou roda o db push com a API parada).
        const dbpush = await sshExec(cfg, 'docker run --rm --network n8n_default --env-file /opt/oneclick/.env oneclick-api:latest sh -c "cd /app/packages/db && npx prisma db push --accept-data-loss --skip-generate" 2>&1', (line) => deployEmit(60, 'schema', line, 'info'), 240000)
        if (dbpush.code !== 0) {
          const motivo = dbpush.timedOut
            ? 'prisma db push expirou (4 min) — provável lock no banco com a API no ar. Re-tente ou rode o db push com a API parada.'
            : 'prisma db push falhou'
          deployEmit(65, 'schema', `✗ ${motivo}`, 'err')
          deployRunning = false
          return { ok: false, error: motivo }
        }
        deployEmit(65, 'schema', '✓ Schema aplicado', 'ok')
      } else {
        deployEmit(65, 'schema', '· Sem mudança de schema (ignorado)', 'info')
      }

      // ─── Stage 4.5: SQLs cirúrgicos (sempre) ────────
      // Aplica os arquivos `packages/db/prisma/sql/*.sql` em ordem alfabética via
      // psql no container. Devem ser idempotentes (IF NOT EXISTS / NOT EXISTS na
      // INSERT etc) — assim podem rodar a cada deploy sem causar duplicação.
      // Usado pra coisas que `prisma db push` não cobre: seeds, ALTER manuais,
      // dados de configuração inicial (ex: salas padrão da agenda).
      deployEmit(66, 'sql', '→ Verificando SQLs cirúrgicos...', 'info')
      deployCheckAbort('sql', 66)
      deployCurrentStep = 'sql'
      const listSql = await sshExec(cfg, 'ls /opt/oneclick-src/packages/db/prisma/sql/*.sql 2>/dev/null | sort', null, 30000)
      const sqlFiles = (listSql.stdout || '').trim().split('\n').filter(Boolean)
      if (sqlFiles.length === 0) {
        deployEmit(67, 'sql', '· Nenhum SQL cirúrgico encontrado (ignorado)', 'info')
      } else {
        deployEmit(66, 'sql', `→ ${sqlFiles.length} arquivo(s) SQL a aplicar`, 'info')
        let sqlFailed = false
        for (const sqlFile of sqlFiles) {
          const fname = sqlFile.split('/').pop()
          deployEmit(67, 'sql', `  → ${fname}`, 'info')
          // statement_timeout server-side (120s): se um statement ficar preso em lock,
          // o psql aborta sozinho em vez de pendurar. + timeout no SSH (130s) como rede.
          const sqlExec = await sshExec(
            cfg,
            `( echo "SET statement_timeout='120s';"; cat ${sqlFile} ) | docker exec -i n8n-postgres-1 psql -U oneclick -d oneclick -v ON_ERROR_STOP=1 2>&1`,
            (line) => {
              // Filtra NOTICE/INFO ruidosos do psql
              if (!/^NOTICE:|^INFO:|^DO$|^SET$|^BEGIN$|^COMMIT$|^$/.test(line)) {
                deployEmit(67, 'sql', `    ${line}`, 'info')
              }
            },
            130000,
          )
          deployCheckAbort('sql', 68)
          if (sqlExec.code !== 0) {
            const motivo = sqlExec.timedOut ? 'tempo limite de 130s (preso em lock?)' : `código ${sqlExec.code}`
            deployEmit(68, 'sql', `✗ ${fname} falhou (${motivo})`, 'err')
            sqlFailed = true
            break
          }
        }
        if (sqlFailed) {
          deployRunning = false
          return { ok: false, error: 'SQL cirúrgico falhou' }
        }
        deployEmit(68, 'sql', `✓ ${sqlFiles.length} SQL(s) aplicado(s)`, 'ok')
      }

      // ─── Stage 5: Build Web ────────────────────────
      deployEmit(70, 'build-web', '→ Gerando imagem do Web...', 'info')
      deployCheckAbort('build-web', 70)
      deployCurrentStep = 'build-web'
      const buildWeb = await sshExec(cfg, 'cd /opt/oneclick && docker compose build web 2>&1', (line) => {
        if (!/^\s*$/.test(line) && !/exporting layers|exporting manifest|extracting|building cache/i.test(line)) {
          deployEmit(78, 'build-web', line, 'info')
        }
      })
      if (buildWeb.code !== 0) {
        deployEmit(85, 'build-web', `✗ Geração da imagem do Web falhou`, 'err')
        deployRunning = false
        return { ok: false, error: 'Geração da imagem do Web falhou' }
      }
      deployEmit(85, 'build-web', '✓ Imagem do Web gerada', 'ok')

      // ─── Stage 6: Restart + Health check ───────────
      deployEmit(90, 'restart', '→ Reiniciando containers e verificando saúde...', 'info')
      deployCheckAbort('restart', 90)
      deployCurrentStep = 'restart'
      const up = await sshExec(cfg, 'cd /opt/oneclick && docker compose up -d --force-recreate api web 2>&1 && sleep 12 && curl -s -o /dev/null -w "API:%{http_code}\\n" http://127.0.0.1:4100/api/health', (line) => deployEmit(95, 'restart', line, 'info'))
      if (up.code !== 0 || !/(API:200|API:204)/.test(up.stdout || '')) {
        deployEmit(98, 'restart', `✗ Reinício ou verificação de saúde falhou`, 'err')
        deployRunning = false
        return { ok: false, error: 'Reinício ou verificação de saúde falhou' }
      }
      } else {
        deployEmit(90, 'restart', '· Core/API/Web não selecionado (ignorado)', 'info')
      }

      if (appRequested) {
        deployEmit(96, 'pull', '→ Publicando App Mobile...', 'info')
        deployCheckAbort('app', 96)
        deployCurrentStep = 'pull'
        const appDef = deployProjectDefs(cfg).find(p => p.id === 'app')
        const appCwd = appDef.cwd
        const appBranch = appDef.branch || gitOutput(['rev-parse', '--abbrev-ref', 'HEAD'], appCwd)
        const appDirty = gitOutput(['status', '--porcelain'], appCwd).split('\n').filter(Boolean).map(l => ({
          status: l.slice(0, 2).trim(),
          path: l.slice(3),
        })).filter(d => !(d.status === '??' && (d.path.endsWith('.bak') || d.path.includes('/tmp/') || d.path.replace(/\\/g, '/').startsWith('scripts/mobile-dist/'))))
        if (appDirty.length > 0) {
          if (!commitMessage) {
            deployRunning = false
            return { ok: false, error: `${appDirty.length} arquivo(s) sem commit no App Mobile. Forneça uma mensagem de commit.` }
          }
          deployEmit(96, 'pull', `→ Commitando App Mobile (${appDirty.length} arquivo(s))...`, 'info')
          for (const d of appDirty) {
            const addRes = await gitExec(['add', '--', d.path], null, 10000, appCwd)
            if (addRes.code !== 0) {
              deployRunning = false
              return { ok: false, error: `Falha ao adicionar arquivo no App Mobile: ${d.path}` }
            }
          }
          const appCommit = await gitExec(['commit', '-m', commitMessage], null, 30000, appCwd)
          if (appCommit.code !== 0) {
            deployRunning = false
            return { ok: false, error: 'Commit falhou no App Mobile: ' + (appCommit.stderr || appCommit.stdout || '').slice(0, 200) }
          }
        }
        const appPrTarget = prTargets.app
        let appDeployBranch = appBranch
        let requestedAppSha = targetShas.app ? String(targetShas.app).trim() : ''
        if (appPrTarget?.number) {
          deployEmit(96, 'pull', `→ Buscando PR #${appPrTarget.number} do App Mobile...`, 'info')
          const fetchAppPr = await gitExec(['fetch', 'origin', `pull/${appPrTarget.number}/head`], (line) => deployEmit(96, 'pull', `[app] ${line}`, 'info'), 60000, appCwd)
          if (fetchAppPr.code !== 0) {
            deployRunning = false
<<<<<<< Updated upstream
            return { ok: false, error: 'Falha ao buscar PR no App Mobile: ' + (fetchAppPr.stderr || fetchAppPr.stdout || fetchAppPr.error || '').slice(0, 200) }
          }
          // Mesma lógica do core: integra o PR POR CIMA da branch de deploy do app
          // (merge --no-ff) em vez de resetar pro head cru — não perde o já publicado.
          const appPrSha = gitOutput(['rev-parse', 'FETCH_HEAD'], appCwd)
          if (gitExitCode(['merge-base', '--is-ancestor', appPrSha, 'HEAD'], appCwd) === 0) {
            deployEmit(96, 'pull', `· [app] PR #${appPrTarget.number} já integrado na branch`, 'info')
          } else {
            deployEmit(96, 'pull', `→ [app] Integrando PR #${appPrTarget.number} na branch (${appBranch})...`, 'info')
            const appPrMsg = `deploy: integra PR #${appPrTarget.number}${appPrTarget.title ? ` — ${String(appPrTarget.title).slice(0, 80)}` : ''}`
            const mergeAppPr = await gitExec(['merge', '--no-ff', '-m', appPrMsg, appPrSha], (line) => deployEmit(96, 'pull', `[app] ${line}`, 'info'), 60000, appCwd)
            if (mergeAppPr.code !== 0) {
              await gitExec(['merge', '--abort'], null, 15000, appCwd)
              deployRunning = false
              return { ok: false, error: `Conflito ao integrar o PR #${appPrTarget.number} no App Mobile (${appBranch}). Resolva manualmente e refaça o deploy.` }
            }
          }
          requestedAppSha = gitOutput(['rev-parse', 'HEAD'], appCwd)
          appDeployBranch = appBranch
=======
            return { ok: false, error: 'git fetch PR falhou no App Mobile: ' + (fetchAppPr.stderr || fetchAppPr.stdout || fetchAppPr.error || '').slice(0, 200) }
          }
          requestedAppSha = gitOutput(['rev-parse', 'FETCH_HEAD'], appCwd)
          appDeployBranch = `deploy/pr-${appPrTarget.number}-app`
>>>>>>> Stashed changes
        }
        if (requestedAppSha && !/^[0-9a-f]{7,40}$/i.test(requestedAppSha)) {
          deployRunning = false
          return { ok: false, error: 'Commit selecionado do App Mobile invalido.' }
        }
<<<<<<< Updated upstream
        let appTargetSha = requestedAppSha || gitOutput(['rev-parse', 'HEAD'], appCwd)
=======
        const appTargetSha = requestedAppSha || gitOutput(['rev-parse', 'HEAD'], appCwd)
>>>>>>> Stashed changes
        if (!appPrTarget?.number && gitExitCode(['merge-base', '--is-ancestor', appTargetSha, 'HEAD'], appCwd) !== 0) {
          deployRunning = false
          return { ok: false, error: 'Commit selecionado do App Mobile não pertence ao histórico local.' }
        }
        if (gitExitCode(['cat-file', '-e', `${appTargetSha}^{commit}`], appCwd) !== 0) {
          deployRunning = false
          return { ok: false, error: 'Commit selecionado do App Mobile não existe no repositório local.' }
        }
<<<<<<< Updated upstream
        // Auto-integra o branch remoto do app antes do push (mesma lógica do core).
        if (appDeployBranch === appBranch) {
          await gitExec(['fetch', 'origin', appDeployBranch], null, 30000, appCwd)
          const appRemoteSha = gitOutput(['rev-parse', `origin/${appDeployBranch}`], appCwd)
          const appHeadSha = gitOutput(['rev-parse', 'HEAD'], appCwd)
          const appRemoteAhead = appRemoteSha && gitExitCode(['merge-base', '--is-ancestor', appRemoteSha, appTargetSha], appCwd) !== 0
          if (appRemoteAhead && appTargetSha === appHeadSha) {
            deployEmit(96, 'pull', `→ [app] ${appDeployBranch} remoto à frente — integrando...`, 'info')
            const appInteg = await gitExec(['merge', '--no-edit', `origin/${appDeployBranch}`], (line) => deployEmit(96, 'pull', `[app] ${line}`, 'info'), 60000, appCwd)
            if (appInteg.code !== 0) {
              await gitExec(['merge', '--abort'], null, 15000, appCwd)
              deployRunning = false
              return { ok: false, error: `Conflito ao integrar o "${appDeployBranch}" remoto do App Mobile. Resolva com "git pull origin ${appDeployBranch}" e refaça o deploy.` }
            }
            appTargetSha = gitOutput(['rev-parse', 'HEAD'], appCwd)
          } else if (appRemoteAhead) {
            deployRunning = false
            return { ok: false, error: `O "${appDeployBranch}" remoto do App Mobile está à frente, mas você publica um commit específico. Rode "git pull --rebase origin ${appDeployBranch}" e tente de novo.` }
          }
        }
=======
>>>>>>> Stashed changes
        const appPush = await gitExec(['push', 'origin', `${appTargetSha}:refs/heads/${appDeployBranch}`], (line) => deployEmit(97, 'push', `[app] ${line}`, 'info'), 60000, appCwd)
        if (appPush.code !== 0) {
          deployRunning = false
          return { ok: false, error: 'Envio do App Mobile ao GitHub falhou: ' + (appPush.stderr || appPush.stdout || appPush.error || '').slice(0, 200) }
        }
        const appRemoteUrl = gitOutput(['remote', 'get-url', 'origin'], appCwd)
        const appRemoteDirQ = shellQuote(appDef.remoteDir)
        const appRemoteUrlQ = shellQuote(appRemoteUrl)
<<<<<<< Updated upstream
=======
        const appBranchQ = shellQuote(appDeployBranch)
>>>>>>> Stashed changes
        const appPullCmd = [
          `if [ -e ${appRemoteDirQ} ] && [ ! -d ${appRemoteDirQ}/.git ]; then echo "Diretório ${appDef.remoteDir} existe, mas não é um repositório Git"; exit 1; fi`,
          `if [ ! -d ${appRemoteDirQ}/.git ]; then git clone --branch ${shellQuote(appDeployBranch)} --single-branch ${appRemoteUrlQ} ${appRemoteDirQ}; else cd ${appRemoteDirQ} && git fetch origin ${shellQuote(appDeployBranch)} 2>&1 && git reset --hard ${appTargetSha} 2>&1; fi`,
        ].join(' && ')
        const appPull = await sshExec(cfg, appPullCmd, (line) => deployEmit(98, 'pull', `[app] ${line}`, 'info'))
        if (appPull.code !== 0) {
          deployRunning = false
          return { ok: false, error: 'Atualização do App Mobile na VPS falhou' }
        }
        deployEmit(99, 'pull', '✓ App Mobile atualizado', 'ok')
      }
      // ─── Stage 7: Merge do PR no main (fecha o ciclo) ───
      // Após o deploy validado (VPS saudável), mescla o PR do core na base (main)
      // automaticamente, pra o código sair do limbo "branch de deploy + VPS" e
      // cair no trunk — zerando os "commits não pushados". Requer GITHUB_TOKEN com
      // permissão de merge. Falha aqui NÃO derruba o deploy (a VPS já está OK):
      // apenas avisa pra mesclar manualmente. (Só o core; o app é outro repo.)
      const corePr = targets.includes('core') ? prTargets.core : null
      if (corePr?.number) {
        deployCurrentStep = 'merge'
        if (!cfg?.GITHUB_TOKEN) {
          deployEmit(99, 'merge', '⚠ PR não mesclado no main: configure GITHUB_TOKEN (com permissão de merge) no .deploy.local.', 'warn')
        } else {
          deployEmit(99, 'merge', `→ Mesclando PR #${corePr.number} no main...`, 'info')
          const mg = await githubMergePr(corePr.number, cfg)
          if (mg.ok && mg.merged) {
            deployEmit(99, 'merge', `✓ PR #${corePr.number} mesclado no main`, 'ok')
            // Atualiza refs locais pra o painel refletir o main novo (zera o contador).
            await gitExec(['fetch', 'origin', '--prune'], null, 30000)
          } else {
            deployEmit(99, 'merge', `⚠ PR #${corePr.number} não mesclado: ${(mg.error || 'falha').slice(0, 160)} — deploy na VPS OK, mescle manualmente.`, 'warn')
          }
        }
      }

      deployEmit(100, 'done', '✅ Deploy concluído com sucesso!', 'ok')

      return { ok: true }
    } catch (e) {
      deployEmit(100, 'error', `✗ Exceção: ${e.message}`, 'err')
      return { ok: false, error: e.message }
    } finally {
      deployRunning = false
      deployAbortRequested = false
      deployCurrentProc = null
      deployCurrentProcKind = null
      deployCurrentStep = null
    }
  })

  // ════════════════════════════════════════════════════════
  // BI Sync: executa sci_balancete.py local e retorna linhas
  // pro renderer enviar pra VPS via fetch.
  // ════════════════════════════════════════════════════════
  ipcMain.handle('bi-sync-fetch-sci', async (_e, payload) => {
    try {
      const { prcodemp, dataIni, dataFim, ref } = payload || {}
      if (!prcodemp || !dataIni || !dataFim || !ref) {
        return { sucesso: false, erro: 'Parâmetros obrigatórios: prcodemp, dataIni, dataFim, ref' }
      }
      const sciScript = path.join(projectRoot, 'apps', 'api', 'src', 'cliente', 'sci_balancete.py')
      const result = spawnSync(
        'python',
        [sciScript, String(prcodemp), dataIni, dataFim, '1', String(ref)],
        {
          cwd: path.dirname(sciScript),
          encoding: 'buffer',
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
          timeout: 60000,
          windowsHide: true,
        },
      )
      if (result.error) return { sucesso: false, erro: result.error.message }
      const stdout = (result.stdout || Buffer.from('')).toString('utf8').trim()
      const stderr = (result.stderr || Buffer.from('')).toString('utf8').trim()
      if (!stdout) return { sucesso: false, erro: stderr || 'Sem resposta do sci_balancete.py' }
      try {
        const parsed = JSON.parse(stdout)
        return parsed.sucesso === false
          ? { sucesso: false, erro: parsed.erro || 'SCI retornou sucesso=false' }
          : { sucesso: true, dados: parsed.dados || [], total: (parsed.dados || []).length }
      } catch (e) {
        return { sucesso: false, erro: `JSON inválido: ${e.message}` }
      }
    } catch (e) {
      return { sucesso: false, erro: e.message }
    }
  })

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
    settings.autoStartInfo = getAutoStartInfo();
    return settings;
  });
  ipcMain.handle('save-settings', (_e, newSettings) => {
    const autoStartResult = setAutoStartPreference(!!newSettings.autoStart);
    const result = saveSettings({
      ...newSettings,
      autoStart: !!newSettings.autoStart,
    });
    return {
      ...result,
      autoStart: autoStartResult,
    };
  });

  // ── Claude Code launcher ──
  // Em Electron empacotado (sem console), `spawn('powershell.exe', …, { detached, stdio:'ignore' })`
  // não abre janela — o filho herda o "sem console" do parent. Solução: `cmd /c start ""` força
  // criação de nova janela de console visível.
  //
  // NOTA: NÃO usar wt.exe direto — ele interpreta `;` como separador de tabs (gerou múltiplas
  // abas de erro nas versões 1.2.42/1.2.43). E NÃO depender de Start-Process via PowerShell
  // hidden — pode morrer antes do filho spawnar (versão 1.2.44 "abre toast mas não abre janela").
  ipcMain.handle('launch-claude', (_e, dir) => {
    const logFile = path.join(app.getPath('userData'), 'claude-launcher.log');
    const log = (msg) => {
      try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
    };
    try {
      const targetDir = dir || loadSettings().claudeDir || projectRoot;
      log(`launch-claude: targetDir=${targetDir}`);
      if (!fs.existsSync(targetDir)) {
        log(`targetDir não existe`);
        return { ok: false, error: `Diretório não existe: ${targetDir}`, logFile };
      }

      // Script .ps1 temporário — zero nesting de aspas no command line.
      // NÃO validamos `where claude` aqui porque o PATH do Electron pode dar falso negativo.
      // Se faltar, o erro aparece dentro da janela do PowerShell (try/catch abaixo).
      const safeDirSq = String(targetDir).replace(/'/g, "''");
      const tmpPath = path.join(os.tmpdir(), `oneclick-claude-${Date.now()}.ps1`);
      const psScript = [
        `Set-Location -LiteralPath '${safeDirSq}'`,
        `Write-Host '=== Claude Code ===' -ForegroundColor Green`,
        `Write-Host "Diretorio: $PWD" -ForegroundColor Cyan`,
        `try { claude } catch { Write-Host "Erro ao iniciar claude: $($_.Exception.Message)" -ForegroundColor Red; Write-Host "Verifique se 'claude' esta no PATH (npm install -g @anthropic-ai/claude-code)" -ForegroundColor Yellow; Read-Host "Enter para fechar" }`,
      ].join('\r\n');
      fs.writeFileSync(tmpPath, psScript, 'utf8');
      log(`script: ${tmpPath}`);

      // cmd /c start "" /D <dir> powershell.exe -NoExit -File <tmpPath>
      // - "" = título obrigatório quando algum arg parece path quoted
      // - /D = working directory pro start
      // - -File aceita path; Node quota se tiver espaço
      const args = [
        '/c', 'start', '""', '/D', targetDir,
        'powershell.exe', '-NoExit', '-ExecutionPolicy', 'Bypass', '-File', tmpPath,
      ];
      log(`spawn: cmd.exe ${args.join(' ')}`);

      const child = spawn('cmd.exe', args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true, // esconde cmd intermediário; start cria a janela visível
      });
      child.on('error', (err) => log(`spawn error: ${err.message}`));
      child.unref();
      log(`spawned pid=${child.pid || 'unknown'}`);
      return { ok: true, logFile };
    } catch (e) {
      log(`exception: ${e.message}\n${e.stack}`);
      return { ok: false, error: e.message, logFile };
    }
  });

  // ── Auto-update ──
  ipcMain.handle('check-for-update', async () => {
    if (!autoUpdater || !app.isPackaged) {
      return { ok: false, error: 'Auto-update só funciona no app empacotado.' };
    }
    if (updaterState.lastDownloadedVersion) {
      return {
        ok: true,
        version: updaterState.lastDownloadedVersion,
        downloaded: true,
        status: updaterState.status,
      };
    }
    if (updaterState.status === 'available' || updaterState.status === 'progress') {
      return {
        ok: true,
        version: updaterState.lastAvailableVersion,
        downloading: true,
        status: updaterState.status,
      };
    }
    try {
      const apiReady = await ensureApiForUpdater();
      if (!apiReady.ok) return apiReady;

      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version ?? null;
      return {
        ok: true,
        version: version && version !== app.getVersion() ? version : null,
        currentVersion: app.getVersion(),
        apiStarted: apiReady.started,
      };    } catch (e) {
      if (e.code === 'DEPLOY_ABORTED') {
        deployEmit(e.progress ?? null, e.step || deployCurrentStep || 'abort', 'Deploy abortado com seguranca pelo usuario.', 'warn')
        return { ok: false, aborted: true, error: 'Deploy abortado pelo usuario.' }
      }
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle('install-update', () => {
    if (!autoUpdater || !app.isPackaged) return { ok: false, error: 'Sem updater disponível' };
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  });

  ipcMain.handle('get-app-version', () => ({
    version: app.getVersion(),
    name: app.getName(),
  }));

  // ── Browse folder dialog ──
  ipcMain.handle('get-diagnostics', async () => getDiagnostics());

  ipcMain.handle('copy-diagnostics', async () => {
    const diagnostics = await getDiagnostics();
    const text = formatDiagnostics(diagnostics);
    clipboard.writeText(text);
    return { ok: true, text };
  });

  ipcMain.handle('browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Selecionar pasta',
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // ── Project roots management ──
  ipcMain.handle('get-project-root', () => ({
    path: projectRoot,
    valid: !!projectRoot && isProjectRoot(projectRoot),
    appPath: appProjectRoot,
    appValid: !!appProjectRoot && isAppProjectRoot(appProjectRoot),
    roots: {
      core: { path: projectRoot, valid: !!projectRoot && isProjectRoot(projectRoot), label: 'Core/API/Web' },
      app: { path: appProjectRoot, valid: !!appProjectRoot && isAppProjectRoot(appProjectRoot), label: 'App Mobile' },
    },
  }));

  ipcMain.handle('set-project-root', async (_e, newPath) => {
    if (!newPath) return { ok: false, error: 'Caminho vazio.' };
    return setProjectRoots({ core: newPath });
  });

  ipcMain.handle('set-project-roots', async (_e, roots) => setProjectRoots(roots || {}));
}

function setProjectRoots(roots) {
  const settings = loadSettings();
  const nextCore = roots.core !== undefined ? String(roots.core || '').trim() : (projectRoot || settings.projectDirs.core);
  const nextApp = roots.app !== undefined ? String(roots.app || '').trim() : (appProjectRoot || settings.projectDirs.app);

  if (nextCore && !isProjectRoot(nextCore)) {
    return { ok: false, error: 'A pasta Core/API/Web precisa ter package.json com "name": "oneclick-code".' };
  }
  if (nextApp && !isAppProjectRoot(nextApp)) {
    return { ok: false, error: 'A pasta App Mobile precisa ser um projeto Expo/oneclick-mobile válido.' };
  }

  settings.projectDirs = {
    ...(settings.projectDirs || {}),
    ...(nextCore ? { core: nextCore } : {}),
    ...(nextApp ? { app: nextApp } : {}),
  };
  settings.projectDir = settings.projectDirs.core;
  settings.appProjectDir = settings.projectDirs.app;
  saveSettings(settings);
  applyProjectRoots(settings.projectDirs.core, settings.projectDirs.app);
  return {
    ok: true,
    path: projectRoot,
    appPath: appProjectRoot,
    roots: {
      core: { path: projectRoot, valid: !!projectRoot && isProjectRoot(projectRoot) },
      app: { path: appProjectRoot, valid: !!appProjectRoot && isAppProjectRoot(appProjectRoot) },
    },
  };
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

  const statusLine = [
    pgUp ? 'PG:OK' : 'PG:OFF',
    redisUp ? 'Redis:OK' : 'Redis:OFF',
    apiUp ? 'API:OK' : 'API:OFF',
    webUp ? 'Web:OK' : 'Web:OFF',
  ].join(' | ');

  tray.setToolTip(`OneClick ERP\n${statusLine}`);

  const autoStart = getAutoStartInfo().desired;

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
    {
      label: 'Erros JS do navegador (DEV)',
      sublabel: '/admin/erros-cliente',
      click: () => shell.openExternal(`http://localhost:${WEB_PORT}/admin/erros-cliente`),
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
      label: nfeWatcher
        ? (nfeWatcher.running ? 'NFe Watcher: PARAR (ativo)' : 'NFe Watcher: INICIAR (parado)')
        : 'NFe Watcher: indisponível',
      enabled: !!nfeWatcher,
      click: async () => {
        if (!nfeWatcher) return;
        try {
          if (nfeWatcher.running) await nfeWatcher.stop();
          else await nfeWatcher.start();
          updateTrayMenu();
        } catch (e) {
          console.error('[NfeWatcher tray] erro:', e.message);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Iniciar com Windows',
      type: 'checkbox',
      checked: autoStart,
      click: (item) => {
        setAutoStartPreference(item.checked);
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
  const detectedCoreRoot = findProjectRoot();
  const detectedAppRoot = findAppProjectRoot();
  applyProjectRoots(detectedCoreRoot, detectedAppRoot);

  // Se a busca automática falhou (instalador em Program Files, primeira execução),
  // abre o diálogo pro usuário apontar manualmente. O caminho é salvo em settings
  // e usado em todas as sessões seguintes.
  if (!projectRoot) {
    const picked = await promptForProjectRoot();
    if (picked) {
      applyProjectRoots(picked, appProjectRoot || findAppProjectRoot());
    } else {
      const debugInfo = [
        `execPath: ${process.execPath}`,
        `__dirname: ${__dirname}`,
        `cwd: ${process.cwd()}`,
        `isPackaged: ${app.isPackaged}`,
      ].join('\n');
      dialog.showErrorBox(
        'OneClick ERP',
        'Configuração obrigatória cancelada.\n\n'
        + 'O Service Manager precisa saber onde está o projeto OneClick_Code para gerenciar os serviços.\n\n'
        + 'Abra novamente o app e selecione a pasta do projeto (ou ajuste em Configurações depois de uma execução em modo dev).\n\n'
        + debugInfo,
      );
      app.quit();
      return;
    }
  }

  // Persiste as raízes resolvidas (se foi via auto-detect, salva pra próxima sessão)
  const settings = loadSettings();
  const nextProjectDirs = {
    ...(settings.projectDirs || {}),
    ...(projectRoot ? { core: projectRoot } : {}),
    ...(appProjectRoot ? { app: appProjectRoot } : {}),
  };
  if (settings.projectDirs?.core !== nextProjectDirs.core || settings.projectDirs?.app !== nextProjectDirs.app) {
    settings.projectDirs = nextProjectDirs;
    settings.projectDir = nextProjectDirs.core;
    settings.appProjectDir = nextProjectDirs.app;
    saveSettings(settings);
  }

  registerIpcHandlers();
  initAutoUpdater();
  initLocalHttpServer();
  createTray();
  createMainWindow();

  // Inicia o NFe Watcher (monitora pastas locais dos clientes) — em try total,
  // qualquer erro aqui NÃO pode travar o Launcher.
  setTimeout(() => {
    try {
      const NfeWatcherClass = loadNfeWatcherModule();
      if (!NfeWatcherClass) return;

      const apiEnvPath = path.join(projectRoot, 'apps', 'api', '.env');
      if (!fs.existsSync(apiEnvPath)) return;

      const envContent = fs.readFileSync(apiEnvPath, 'utf8');
      const match = envContent.match(/^LAUNCHER_DAEMON_SECRET=(.+)$/m);
      const secret = match ? match[1].trim() : null;
      if (!secret) {
        console.log('[NfeWatcher] LAUNCHER_DAEMON_SECRET ausente — watcher desligado');
        return;
      }

      nfeWatcher = new NfeWatcherClass({
        apiUrl: `http://127.0.0.1:${API_PORT}`,
        daemonSecret: secret,
        onLog: (entry) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('nfe-watcher:log', entry); } catch { /* */ }
          }
        },
      });
      // Auto-start desabilitado por padrão — user precisa disparar via IPC
      // (`nfe-watcher:start`) ou via UI futura. Isso evita travamentos durante boot.
      console.log('[NfeWatcher] Inicializado (parado). Dispare manualmente pra começar a monitorar.');
    } catch (e) {
      console.error('[NfeWatcher] Erro fatal — ignorado:', e.message);
    }
  }, 0);

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

app.on('before-quit', async () => {
  isQuitting = true;
  if (nfeWatcher) {
    try { await nfeWatcher.stop(); } catch { /* */ }
  }
});

process.on('uncaughtException', (err) => {
  fs.appendFileSync(
    path.join(projectRoot || __dirname, 'launcher-error.log'),
    `[${new Date().toISOString()}] ${err.stack || err.message}\n`,
  );
});

