/**
 * OneClick ERP — Launcher (Electron Tray App)
 *
 * Aplicação Electron minimal que roda apenas na bandeja do sistema.
 * Gerencia Docker containers e o Service Manager.
 */

const {
  app, Tray, Menu, nativeImage, shell, dialog, Notification,
} = require('electron');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

// ══════════════════════════════════════════════════════════════
// Instância única — impede abrir duas vezes
// ══════════════════════════════════════════════════════════════
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  dialog.showErrorBox('OneClick ERP', 'O launcher já está em execução.\nVerifique a bandeja do sistema (system tray).');
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

let tray = null;
let smProcess = null; // service manager child process
let projectRoot = null;
let isQuitting = false;

// ══════════════════════════════════════════════════════════════
// Encontrar raiz do projeto
// ══════════════════════════════════════════════════════════════
function findProjectRoot() {
  const startDirs = [];

  // 1) Portable exe: electron-builder seta PORTABLE_EXECUTABLE_DIR
  //    com o diretório real onde o .exe está (não o temp de extração)
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    startDirs.push(
      portableDir,                                     // exe na raiz do projeto
      path.resolve(portableDir, '..'),
      path.resolve(portableDir, '..', '..'),
      path.resolve(portableDir, '..', '..', '..'),
    );
  }

  // 2) Instalado via NSIS ou win-unpacked
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

  // 3) Dev mode: __dirname = scripts/launcher/
  startDirs.push(
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..'),
  );

  // 4) CWD (caso abra via terminal)
  startDirs.push(process.cwd());

  // 5) Busca ascendente a partir de cada candidato
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
    socket.on('error',   () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

function httpPost(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: SM_PORT,
      path: urlPath,
      method: 'POST',
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: SM_PORT,
      path: urlPath,
      method: 'GET',
      timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
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

async function startDockerContainers() {
  if (!isDockerRunning()) {
    notify('Docker', 'Docker Desktop não está rodando. Tentando iniciar...');
    if (!startDockerDesktop()) {
      notify('Docker', 'Não foi possível encontrar o Docker Desktop.');
      return false;
    }
    // Aguardar Docker iniciar (até 60s)
    for (let i = 0; i < 30; i++) {
      await sleep(2000);
      if (isDockerRunning()) break;
    }
    if (!isDockerRunning()) {
      notify('Docker', 'Docker Desktop não iniciou a tempo.');
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
    notify('Docker', 'Containers PostgreSQL e Redis iniciados.');
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
      notify('Docker', `Erro ao iniciar containers: ${e.message}`);
      return false;
    }
  }
}

function stopDockerContainers() {
  try {
    execSync('docker compose stop', { cwd: projectRoot, timeout: 15000, stdio: 'ignore', windowsHide: true });
  } catch {
    try { execSync('docker-compose stop', { cwd: projectRoot, timeout: 15000, stdio: 'ignore', windowsHide: true }); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════
// Service Manager
// ══════════════════════════════════════════════════════════════
function startServiceManager() {
  if (smProcess) return;

  const smDir = path.join(projectRoot, 'scripts', 'service-manager');
  const serverPath = path.join(smDir, 'server.js');
  if (!fs.existsSync(serverPath)) {
    notify('Erro', 'server.js do Service Manager não encontrado.');
    return;
  }

  // Encontrar node.exe
  const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';

  smProcess = spawn(nodeCmd, [serverPath], {
    cwd: smDir,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  smProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    if (text.includes('http://localhost:')) {
      notify('Service Manager', `Dashboard disponível em http://localhost:${SM_PORT}`);
    }
  });

  smProcess.stderr.on('data', () => { /* silencioso */ });

  smProcess.on('close', (code) => {
    smProcess = null;
    if (!isQuitting) {
      updateTrayMenu();
    }
  });

  smProcess.on('error', (err) => {
    smProcess = null;
    notify('Erro', `Falha ao iniciar Service Manager: ${err.message}`);
    updateTrayMenu();
  });

  updateTrayMenu();
}

function stopServiceManager() {
  if (!smProcess) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${smProcess.pid} /T /F`, { timeout: 5000, windowsHide: true });
    } else {
      smProcess.kill('SIGTERM');
    }
  } catch {}
  smProcess = null;
}

// ══════════════════════════════════════════════════════════════
// Notificações
// ══════════════════════════════════════════════════════════════
function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title: `OneClick ERP — ${title}`, body }).show();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ══════════════════════════════════════════════════════════════
// Tray — Ícone e Menu
// ══════════════════════════════════════════════════════════════
function loadTrayIcon() {
  // Tentar carregar o ícone gerado
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

  // Fallback: ícone gerado em runtime (quadrado verde 16x16)
  return createFallbackIcon();
}

function createFallbackIcon() {
  // PNG mínimo 16x16 verde, gerado em runtime
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

  // CRC32 inline
  const crcTbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
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
    shell.openExternal(`http://localhost:${SM_PORT}`);
  });

  updateTrayMenu();
}

async function updateTrayMenu() {
  if (!tray) return;

  // Verificar status das portas
  const [smUp, apiUp, webUp, pgUp, redisUp] = await Promise.all([
    checkPort(SM_PORT),
    checkPort(API_PORT),
    checkPort(WEB_PORT),
    checkPort(PG_PORT),
    checkPort(REDIS_PORT),
  ]);

  const dockerRunning = pgUp && redisUp;
  const autoStart = app.getLoginItemSettings().openAtLogin;

  const statusLine = [
    pgUp ? 'PG:OK' : 'PG:OFF',
    redisUp ? 'Redis:OK' : 'Redis:OFF',
    apiUp ? 'API:OK' : 'API:OFF',
    webUp ? 'Web:OK' : 'Web:OFF',
  ].join('  |  ');

  tray.setToolTip(`OneClick ERP\n${statusLine}`);

  const menu = Menu.buildFromTemplate([
    {
      label: 'OneClick ERP — Service Manager',
      enabled: false,
      icon: loadTrayIcon(),
    },
    {
      label: `   ${statusLine}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Abrir Dashboard',
      sublabel: `localhost:${SM_PORT}`,
      click: () => shell.openExternal(`http://localhost:${SM_PORT}`),
      enabled: smUp,
    },
    {
      label: 'Abrir Aplicacao',
      sublabel: `localhost:${WEB_PORT}`,
      click: () => shell.openExternal(`http://localhost:${WEB_PORT}`),
      enabled: webUp,
    },
    { type: 'separator' },
    {
      label: smProcess ? 'Service Manager: Rodando' : 'Iniciar Service Manager',
      click: () => {
        if (!smProcess) {
          startServiceManager();
          setTimeout(updateTrayMenu, 3000);
        }
      },
      enabled: !smProcess,
    },
    {
      label: 'Iniciar Servicos (API + Web)',
      click: async () => {
        try {
          await httpPost('/api/start-all');
          notify('Servicos', 'API e Web sendo iniciados...');
          setTimeout(updateTrayMenu, 5000);
        } catch {
          notify('Erro', 'Service Manager nao esta respondendo.');
        }
      },
      enabled: smUp,
    },
    {
      label: 'Parar Servicos (API + Web)',
      click: async () => {
        try {
          await httpPost('/api/stop-all');
          notify('Servicos', 'API e Web parados.');
          setTimeout(updateTrayMenu, 2000);
        } catch {}
      },
      enabled: smUp,
    },
    {
      label: 'Reiniciar Servicos',
      click: async () => {
        try {
          await httpPost('/api/stop-all');
          await sleep(2000);
          await httpPost('/api/start-all');
          notify('Servicos', 'Reiniciando API e Web...');
          setTimeout(updateTrayMenu, 5000);
        } catch {}
      },
      enabled: smUp,
    },
    { type: 'separator' },
    {
      label: 'Docker',
      submenu: [
        {
          label: dockerRunning ? 'Containers: Rodando' : 'Iniciar Containers',
          click: async () => {
            await startDockerContainers();
            setTimeout(updateTrayMenu, 3000);
          },
          enabled: !dockerRunning,
        },
        {
          label: 'Parar Containers',
          click: () => {
            stopDockerContainers();
            notify('Docker', 'Containers parados.');
            setTimeout(updateTrayMenu, 2000);
          },
          enabled: dockerRunning,
        },
      ],
    },
    { type: 'separator' },
    {
      label: 'Iniciar Tudo',
      sublabel: 'Docker + Service Manager + Servicos',
      click: async () => {
        notify('OneClick ERP', 'Iniciando todos os servicos...');

        // 1. Docker
        await startDockerContainers();
        await sleep(2000);

        // 2. Service Manager
        startServiceManager();
        await sleep(3000);

        // 3. Servicos (API + Web)
        try { await httpPost('/api/start-all'); } catch {}

        notify('OneClick ERP', 'Todos os servicos iniciados!');
        setTimeout(updateTrayMenu, 5000);
      },
    },
    {
      label: 'Parar Tudo',
      click: async () => {
        // 1. Parar servicos via SM
        try { await httpPost('/api/stop-all'); } catch {}
        await sleep(1000);

        // 2. Parar SM
        stopServiceManager();

        // 3. Parar Docker containers
        stopDockerContainers();

        notify('OneClick ERP', 'Todos os servicos parados.');
        setTimeout(updateTrayMenu, 2000);
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
          args: ['--hidden'],
        });
        notify(
          'Startup',
          item.checked
            ? 'OneClick ERP sera iniciado com o Windows.'
            : 'OneClick ERP removido da inicializacao do Windows.',
        );
      },
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true;
        // Apenas encerra o launcher, servicos continuam rodando
        if (tray) tray.destroy();
        app.quit();
      },
    },
    {
      label: 'Sair e Parar Tudo',
      click: async () => {
        isQuitting = true;
        try { await httpPost('/api/stop-all'); } catch {}
        await sleep(500);
        stopServiceManager();
        stopDockerContainers();
        if (tray) tray.destroy();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

// ══════════════════════════════════════════════════════════════
// Boot
// ══════════════════════════════════════════════════════════════
app.on('window-all-closed', (e) => {
  // Não encerrar quando não há janelas (tray-only)
  e.preventDefault();
});

app.whenReady().then(async () => {
  // Encontrar projeto
  projectRoot = findProjectRoot();
  if (!projectRoot) {
    const debugInfo = [
      `execPath: ${process.execPath}`,
      `__dirname: ${__dirname}`,
      `cwd: ${process.cwd()}`,
      `PORTABLE_EXECUTABLE_DIR: ${process.env.PORTABLE_EXECUTABLE_DIR || '(nao definido)'}`,
      `PORTABLE_EXECUTABLE_FILE: ${process.env.PORTABLE_EXECUTABLE_FILE || '(nao definido)'}`,
      `isPackaged: ${app.isPackaged}`,
    ].join('\n');

    dialog.showErrorBox(
      'OneClick ERP',
      'Nao foi possivel encontrar a raiz do projeto.\n\n'
      + 'O exe precisa estar dentro da pasta do projeto (onde esta o package.json com name "oneclick-code").\n\n'
      + 'Caminhos verificados:\n' + debugInfo,
    );
    app.quit();
    return;
  }

  // Criar tray
  createTray();

  // Verificar se foi chamado com --hidden (auto-start silencioso)
  const silent = process.argv.includes('--hidden');

  // Auto-start: Docker → SM → abrir browser
  const pgRunning = await checkPort(PG_PORT);
  const smRunning = await checkPort(SM_PORT);

  if (!pgRunning) {
    notify('OneClick ERP', 'Iniciando Docker containers...');
    await startDockerContainers();
    await sleep(3000);
  }

  if (!smRunning) {
    startServiceManager();
    await sleep(2000);
  }

  // Abrir browser (só se não for startup silencioso)
  if (!silent) {
    const smReady = await checkPort(SM_PORT);
    if (smReady) {
      shell.openExternal(`http://localhost:${SM_PORT}`);
    } else {
      // Esperar SM ficar pronto
      for (let i = 0; i < 10; i++) {
        await sleep(1000);
        if (await checkPort(SM_PORT)) {
          shell.openExternal(`http://localhost:${SM_PORT}`);
          break;
        }
      }
    }
  }

  // Atualizar menu periodicamente
  setInterval(updateTrayMenu, 10000);
  updateTrayMenu();
});

// Cleanup
app.on('before-quit', () => {
  isQuitting = true;
});

process.on('uncaughtException', (err) => {
  fs.appendFileSync(
    path.join(projectRoot || __dirname, 'launcher-error.log'),
    `[${new Date().toISOString()}] ${err.stack || err.message}\n`,
  );
});
