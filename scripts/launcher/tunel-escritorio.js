// Túnel do escritório para as consultas de certidões (06/10/2026).
//
// A Caixa (CRF/FGTS) e o TST (CNDT) bloqueiam o IP do servidor de produção
// (Hostinger) e aceitam o do escritório. O Service Manager, que fica aberto
// aqui, mantém:
//   1. um proxy HTTP local (127.0.0.1) que SÓ aceita quem tem a senha e SÓ
//      abre conexão para os portais da lista — não é um proxy aberto;
//   2. um túnel SSH reverso que expõe esse proxy na VPS, onde a API o usa
//      (CND_PROXY_ESCRITORIO no .env de produção).
// Com o SM fechado ou a máquina desligada, a API percebe e consulta direto.
//
// Configuração no .deploy.local:
//   CND_PROXY_TOKEN  senha do proxy (sem ela, o túnel não sobe)
//   CND_PROXY_BIND   endereço na VPS onde o túnel escuta (padrão 127.0.0.1;
//                    para os containers alcançarem, o gateway da rede Docker,
//                    o que exige `GatewayPorts clientspecified` no sshd)
//   CND_PROXY_PORTA  porta na VPS (padrão 3129)
//   CND_PROXY_HOSTS  domínios extras permitidos, separados por vírgula

const http = require('http')
const net = require('net')
const { spawn } = require('child_process')

const HOSTS_PADRAO = ['caixa.gov.br', 'tst.jus.br']

function hostPermitido(host, lista) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '')
  return lista.some(d => h === d || h.endsWith('.' + d))
}

function autenticado(req, token) {
  const cab = req.headers['proxy-authorization'] || ''
  const m = /^Basic\s+(.+)$/i.exec(cab)
  if (!m) return false
  const [, senha] = Buffer.from(m[1], 'base64').toString('utf8').split(/:(.*)/s)
  // Comparação em tempo constante: a senha trafega por um túnel, mas não custa.
  const a = Buffer.from(String(senha || ''))
  const b = Buffer.from(token)
  return a.length === b.length && require('crypto').timingSafeEqual(a, b)
}

function criarProxy({ token, hosts, log }) {
  // O Chromium tenta serviços de fundo (google, autofill...) a cada página:
  // registra cada domínio recusado uma vez só, para não afogar o log.
  const jaRecusados = new Set()
  const logRecusa = (host) => { if (!jaRecusados.has(host)) { jaRecusados.add(host); log(`proxy recusou ${host} (fora da lista)`) } }
  const negar = (sock, codigo, texto) => {
    try { sock.end(`HTTP/1.1 ${codigo} ${texto}\r\nProxy-Authenticate: Basic realm="oneclick"\r\nConnection: close\r\n\r\n`) } catch {}
  }
  const server = http.createServer((req, res) => {
    // HTTP simples (sem TLS): só para os mesmos portais e com a mesma senha.
    let alvo
    try { alvo = new URL(req.url) } catch { res.writeHead(400).end(); return }
    if (!autenticado(req, token)) { res.writeHead(407, { 'Proxy-Authenticate': 'Basic realm="oneclick"' }).end(); return }
    if (!hostPermitido(alvo.hostname, hosts)) { res.writeHead(403).end(); logRecusa(alvo.hostname); return }
    const headers = { ...req.headers }
    delete headers['proxy-authorization']
    const up = http.request({ host: alvo.hostname, port: alvo.port || 80, path: alvo.pathname + alvo.search, method: req.method, headers }, (r) => {
      res.writeHead(r.statusCode || 502, r.headers); r.pipe(res)
    })
    up.on('error', () => { try { res.writeHead(502).end() } catch {} })
    req.pipe(up)
  })
  server.on('connect', (req, sock, head) => {
    const [host, porta] = String(req.url || '').split(':')
    if (!autenticado(req, token)) return negar(sock, 407, 'Proxy Authentication Required')
    if (!hostPermitido(host, hosts) || (porta && porta !== '443')) {
      logRecusa(`${host}:${porta}`)
      return negar(sock, 403, 'Forbidden')
    }
    const up = net.connect(Number(porta || 443), host, () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (head && head.length) up.write(head)
      up.pipe(sock); sock.pipe(up)
    })
    const fechar = () => { try { up.destroy() } catch {} ; try { sock.destroy() } catch {} }
    up.on('error', fechar); sock.on('error', fechar)
    up.setTimeout(120000, fechar)
  })
  return server
}

/**
 * Sobe o proxy local e mantém o túnel SSH reverso, reconectando sozinho.
 * Devolve { status(), parar() }. Sem CND_PROXY_TOKEN, não faz nada.
 */
function iniciarTunelEscritorio({ obterConfig, sshArgs, log }) {
  const estado = { ativo: false, conectado: false, ultimoErro: null, desde: null, motivo: '' }
  const cfg = obterConfig() || {}
  if (!cfg.CND_PROXY_TOKEN || !cfg.SSH_HOST) {
    estado.motivo = 'CND_PROXY_TOKEN ou SSH_HOST ausente no .deploy.local — túnel desligado'
    log(`[túnel] ${estado.motivo}`)
    return { status: () => ({ ...estado }), parar: () => {} }
  }
  const hosts = [...HOSTS_PADRAO, ...String(cfg.CND_PROXY_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)]
  const bind = cfg.CND_PROXY_BIND || '127.0.0.1'
  const portaVps = String(cfg.CND_PROXY_PORTA || '3129')
  const server = criarProxy({ token: String(cfg.CND_PROXY_TOKEN), hosts, log: (m) => log(`[túnel] ${m}`) })
  let proc = null
  let parado = false
  let espera = 5000

  const conectar = (portaLocal) => {
    if (parado) return
    const args = [
      ...sshArgs(cfg),
      '-N', '-T',
      '-o', 'ExitOnForwardFailure=yes',
      '-R', `${bind}:${portaVps}:127.0.0.1:${portaLocal}`,
      `${cfg.SSH_USER || 'root'}@${cfg.SSH_HOST}`,
    ]
    proc = spawn('ssh', args, { windowsHide: true })
    estado.ativo = true
    let stderr = ''
    // Sem saída do `ssh -N` quando dá certo: considera conectado após 8s vivo.
    const ok = setTimeout(() => {
      estado.conectado = true; estado.desde = new Date().toISOString(); estado.ultimoErro = null; espera = 5000
      log(`[túnel] conectado — VPS ${bind}:${portaVps} → escritório`)
    }, 8000)
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', (code) => {
      clearTimeout(ok)
      estado.conectado = false
      if (parado) return
      estado.ultimoErro = (stderr.trim().split('\n').pop() || `ssh saiu com código ${code}`).slice(0, 300)
      log(`[túnel] caiu (${estado.ultimoErro}) — nova tentativa em ${Math.round(espera / 1000)}s`)
      setTimeout(() => conectar(portaLocal), espera)
      espera = Math.min(espera * 2, 5 * 60 * 1000)
    })
  }

  server.listen(0, '127.0.0.1', () => {
    const portaLocal = server.address().port
    log(`[túnel] proxy local em 127.0.0.1:${portaLocal} (portais: ${hosts.join(', ')})`)
    conectar(portaLocal)
  })

  return {
    status: () => ({ ...estado, bind, portaVps, hosts }),
    parar: () => {
      parado = true
      try { proc && proc.kill() } catch {}
      try { server.close() } catch {}
    },
  }
}

module.exports = { iniciarTunelEscritorio, hostPermitido }
