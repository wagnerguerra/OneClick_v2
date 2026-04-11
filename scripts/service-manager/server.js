const express = require('express');
const { spawn, execSync } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 9000;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// ============================================================
// Definição dos serviços
// ============================================================
const services = {
  api: {
    name: 'API (NestJS)',
    port: 4000,
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['nest', 'start', '--watch'],
    cwd: path.join(PROJECT_ROOT, 'apps', 'api'),
    process: null,
    logs: [],
    color: '#5ea3cb',
  },
  web: {
    name: 'Web (Next.js)',
    port: 3000,
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['next', 'dev', '--port', '3000'],
    cwd: path.join(PROJECT_ROOT, 'apps', 'web'),
    process: null,
    logs: [],
    color: '#6ada7d',
  },
  postgres: {
    name: 'PostgreSQL',
    port: 5432,
    managed: false, // Serviço externo, só monitora
    color: '#336791',
  },
  redis: {
    name: 'Redis',
    port: 6379,
    managed: false,
    color: '#dc382d',
  },
};

const SCI_CHECK_SCRIPT = path.join(PROJECT_ROOT, 'apps', 'api', 'src', 'cliente', 'sci_id_sistema.py');

const MAX_LOGS = 500;
const sseClients = new Set();

// ============================================================
// Utilitários
// ============================================================
function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

function addLog(serviceId, text, type = 'stdout') {
  const svc = services[serviceId];
  if (!svc || !svc.logs) return;
  const raw = Buffer.isBuffer(text) ? text.toString('utf8') : String(text);
  // Split por linhas para enviar cada uma separadamente
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  for (const line of lines) {
    const entry = { time: new Date().toISOString(), text: line, type };
    svc.logs.push(entry);
    if (svc.logs.length > MAX_LOGS) svc.logs.splice(0, svc.logs.length - MAX_LOGS);
    for (const client of sseClients) {
      try { client.write(`data: ${JSON.stringify({ service: serviceId, ...entry })}\n\n`); } catch {}
    }
  }
}

function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', timeout: 5000 });
      const lines = result.trim().split('\n');
      const pids = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /T /F`, { timeout: 5000 }); } catch {}
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9`, { timeout: 5000 });
    }
  } catch {}
}

// ============================================================
// Iniciar serviço
// ============================================================
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
  });

  svc.process = child;

  child.stdout.on('data', (data) => {
    process.stdout.write(`[${id}] ${data}`);
    addLog(id, data, 'stdout');
  });
  child.stderr.on('data', (data) => {
    process.stderr.write(`[${id}] ${data}`);
    addLog(id, data, 'stderr');
  });

  child.on('close', (code) => {
    addLog(id, `Processo encerrado (código ${code})`, 'system');
    svc.process = null;
  });

  child.on('error', (err) => {
    addLog(id, `Erro: ${err.message}`, 'error');
    svc.process = null;
  });

  return { ok: true };
}

// ============================================================
// Parar serviço
// ============================================================
function stopService(id) {
  const svc = services[id];
  if (!svc || svc.managed === false) return { ok: false, error: 'Serviço não gerenciável' };

  addLog(id, `Parando ${svc.name}...`, 'system');

  if (svc.process) {
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /PID ${svc.process.pid} /T /F`, { timeout: 5000 });
      } else {
        svc.process.kill('SIGTERM');
      }
    } catch {}
    svc.process = null;
  }

  // Garantir que a porta está livre
  killProcessOnPort(svc.port);

  return { ok: true };
}

// ============================================================
// Rotas da API
// ============================================================
app.use(express.json());

// CORS para permitir o browser (porta 3000) enviar logs para o SM (porta 9000)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Servir HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Status de todos os serviços
app.get('/api/status', async (req, res) => {
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
    };
  }
  res.json(status);
});

// Iniciar serviço
app.post('/api/start/:id', (req, res) => {
  res.json(startService(req.params.id));
});

// Parar serviço
app.post('/api/stop/:id', (req, res) => {
  res.json(stopService(req.params.id));
});

// Reiniciar serviço
app.post('/api/restart/:id', async (req, res) => {
  stopService(req.params.id);
  await new Promise(r => setTimeout(r, 2000));
  res.json(startService(req.params.id));
});

// Iniciar todos os gerenciáveis
app.post('/api/start-all', (req, res) => {
  const results = {};
  for (const id of Object.keys(services)) {
    if (services[id].managed !== false) results[id] = startService(id);
  }
  res.json(results);
});

// Parar todos os gerenciáveis
app.post('/api/stop-all', (req, res) => {
  const results = {};
  for (const id of Object.keys(services)) {
    if (services[id].managed !== false) results[id] = stopService(id);
  }
  res.json(results);
});

// Usuários logados (sessões ativas no PostgreSQL)
const { Pool } = require('pg');

app.get('/api/active-users', async (req, res) => {
  let pool;
  try {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
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
    res.json(result.rows);
  } catch (e) {
    res.json({ error: e.message, stack: e.stack ? e.stack.split('\n')[0] : '' });
  } finally {
    if (pool) try { await pool.end(); } catch {}
  }
});

// Status do SCI (Firebird)
app.get('/api/sci-status', (req, res) => {
  try {
    const { spawnSync } = require('child_process');
    // Usar o script Python com um CNPJ ficticio so para testar conexao
    // Passamos um CNPJ que sabemos existir (Central Contabil)
    const result = spawnSync('python', [SCI_CHECK_SCRIPT, '32401481000133'], {
      cwd: path.join(PROJECT_ROOT, 'apps', 'api', 'src', 'cliente'),
      timeout: 15000,
      encoding: 'utf8',
    });
    const stdout = (result.stdout || '').trim();
    if (result.error) {
      return res.json({ connected: false, error: result.error.message });
    }
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout);
        if (parsed.error) {
          return res.json({ connected: false, error: parsed.error });
        }
        return res.json({ connected: true, testResult: parsed });
      } catch {
        return res.json({ connected: false, error: 'Resposta invalida' });
      }
    }
    return res.json({ connected: false, error: 'Sem resposta' });
  } catch (e) {
    return res.json({ connected: false, error: e.message });
  }
});

// Logs SSE stream
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  // Enviar logs existentes
  for (const [id, svc] of Object.entries(services)) {
    if (!svc.logs) continue;
    for (const entry of svc.logs.slice(-50)) {
      res.write(`data: ${JSON.stringify({ service: id, ...entry })}\n\n`);
    }
  }

  req.on('close', () => sseClients.delete(res));
});

// Logs históricos de um serviço
app.get('/api/logs/:id', (req, res) => {
  const svc = services[req.params.id];
  if (!svc) return res.status(404).json({ error: 'Serviço não encontrado' });
  res.json((svc.logs || []).slice(-200));
});

// Receber logs do browser (enviados pelo script injetado no Next.js)
const browserLogs = [];
app.post('/api/browser-log', (req, res) => {
  const { level, args, url } = req.body || {};
  const text = Array.isArray(args) ? args.join(' ') : String(args || '');
  const entry = { time: new Date().toISOString(), text: `[${level || 'log'}] ${text}`, type: level === 'error' ? 'error' : level === 'warn' ? 'stderr' : 'stdout' };
  browserLogs.push(entry);
  if (browserLogs.length > MAX_LOGS) browserLogs.splice(0, browserLogs.length - MAX_LOGS);
  for (const client of sseClients) {
    client.write(`data: ${JSON.stringify({ service: 'browser', ...entry })}\n\n`);
  }
  res.json({ ok: true });
});

app.get('/api/logs/browser', (req, res) => {
  res.json(browserLogs.slice(-200));
});

app.post('/api/logs/clear/browser', (req, res) => {
  browserLogs.length = 0;
  res.json({ ok: true });
});

// Servir o script de interceptação do console para injetar no browser
app.get('/api/console-hook.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function() {
  if (window.__smConsoleHooked) return;
  window.__smConsoleHooked = true;
  var SM_URL = 'http://localhost:${PORT}/api/browser-log';
  var orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  function send(level, args) {
    try {
      var parts = [];
      for (var i = 0; i < args.length; i++) {
        try { parts.push(typeof args[i] === 'object' ? JSON.stringify(args[i]) : String(args[i])); }
        catch(e) { parts.push('[object]'); }
      }
      fetch(SM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: level, args: parts, url: location.href })
      }).catch(function(){});
    } catch(e) {}
  }
  ['log','warn','error','info'].forEach(function(level) {
    console[level] = function() {
      orig[level].apply(console, arguments);
      send(level, arguments);
    };
  });
  window.addEventListener('error', function(e) {
    send('error', [e.message + ' at ' + e.filename + ':' + e.lineno]);
  });
  window.addEventListener('unhandledrejection', function(e) {
    send('error', ['Unhandled rejection: ' + (e.reason && e.reason.message || e.reason || 'unknown')]);
  });
})();
  `);
});

// Limpar logs
app.post('/api/logs/clear', (req, res) => {
  for (const svc of Object.values(services)) { if (svc.logs) svc.logs = []; }
  res.json({ ok: true });
});

app.post('/api/logs/clear/:id', (req, res) => {
  const svc = services[req.params.id];
  if (svc && svc.logs) svc.logs = [];
  res.json({ ok: true });
});

// ============================================================
// Iniciar Service Manager
// ============================================================
function tryListen() {
  const server = app.listen(PORT, () => {
    console.log(`\n  ╔══════════════════════════════════════╗`);
    console.log(`  ║   OneClick ERP — Service Manager     ║`);
    console.log(`  ║   http://localhost:${PORT}              ║`);
    console.log(`  ╚══════════════════════════════════════╝\n`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Porta ${PORT} em uso. Liberando...`);
      killProcessOnPort(PORT);
      setTimeout(() => {
        console.log('Tentando novamente...');
        tryListen();
      }, 2000);
    } else {
      console.error('Erro ao iniciar:', err);
      process.exit(1);
    }
  });
}

tryListen();

// Cleanup ao encerrar
process.on('SIGINT', () => {
  console.log('\nEncerrando serviços...');
  for (const id of Object.keys(services)) {
    if (services[id].managed !== false) stopService(id);
  }
  process.exit(0);
});
process.on('SIGTERM', () => process.exit(0));
