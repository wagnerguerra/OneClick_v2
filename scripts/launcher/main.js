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
const os = require('os');

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
    projectDir: '',
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
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  );
  startDirs.push(process.cwd());

  // 3. Caminhos comuns por usuário (Desktop / Documents / Projetos)
  const homeDir = app.getPath('home');
  startDirs.push(
    path.join(homeDir, 'Desktop', 'PROJETOS', 'OneClick_Code'),
    path.join(homeDir, 'Desktop', 'OneClick_Code'),
    path.join(homeDir, 'Documents', 'OneClick_Code'),
    path.join(homeDir, 'Projetos', 'OneClick_Code'),
    path.join(homeDir, 'OneClick_Code'),
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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-event', payload);
  }
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
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10_000);

  // Re-check a cada 6 horas
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
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

  // ── Auto-update ──
  ipcMain.handle('check-for-update', async () => {
    if (!autoUpdater || !app.isPackaged) {
      return { ok: false, error: 'Auto-update só funciona no app empacotado.' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version ?? null };
    } catch (e) {
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
  ipcMain.handle('browse-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Selecionar pasta',
    });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    return { canceled: false, path: result.filePaths[0] };
  });

  // ── Project root management ──
  ipcMain.handle('get-project-root', () => ({
    path: projectRoot,
    valid: !!projectRoot && isProjectRoot(projectRoot),
  }));

  ipcMain.handle('set-project-root', async (_e, newPath) => {
    if (!newPath) return { ok: false, error: 'Caminho vazio.' };
    if (!isProjectRoot(newPath)) {
      return { ok: false, error: 'Esta pasta não é a raiz do OneClick_Code (não tem package.json com "name": "oneclick-code").' };
    }
    const settings = loadSettings();
    settings.projectDir = newPath;
    saveSettings(settings);
    projectRoot = newPath;
    services.api.cwd = path.join(newPath, 'apps', 'api');
    services.web.cwd = path.join(newPath, 'apps', 'web');
    return { ok: true, path: newPath };
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

  const statusLine = [
    pgUp ? 'PG:OK' : 'PG:OFF',
    redisUp ? 'Redis:OK' : 'Redis:OFF',
    apiUp ? 'API:OK' : 'API:OFF',
    webUp ? 'Web:OK' : 'Web:OFF',
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
        : 'NFe Watcher: indisponivel',
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

  // Se a busca automática falhou (instalador em Program Files, primeira execução),
  // abre o diálogo pro usuário apontar manualmente. O caminho é salvo em settings
  // e usado em todas as sessões seguintes.
  if (!projectRoot) {
    const picked = await promptForProjectRoot();
    if (picked) {
      projectRoot = picked;
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

  // Set service CWD
  services.api.cwd = path.join(projectRoot, 'apps', 'api');
  services.web.cwd = path.join(projectRoot, 'apps', 'web');

  // Persiste o projectRoot resolvido (se foi via auto-detect, salva pra próxima sessão)
  const settings = loadSettings();
  if (settings.projectDir !== projectRoot) {
    settings.projectDir = projectRoot;
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
