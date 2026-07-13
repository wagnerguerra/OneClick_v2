/**
 * Host do NFe Watcher — roda num utilityProcess ISOLADO do Electron.
 *
 * Por quê: o NfeWatcher faz I/O síncrono pesado sobre SMB (readdirSync de
 * árvores com dezenas de milhares de arquivos, readFileSync de chunks de
 * 25MB) e polling do chokidar que satura o threadpool. Dentro do processo
 * principal isso congelava o event loop do Service Manager inteiro — UI
 * travando, polls de 15s virando 70s e o painel de PRs estourando timeout
 * de 15s com o GitHub respondendo em 0,4s (a fase de timers roda antes da
 * entrega do socket quando o loop destrava).
 *
 * Protocolo (process.parentPort):
 *   main → host: { type: 'init', apiUrl, daemonSecret }
 *                { type: 'start'|'stop'|'refresh'|'status', id }
 *   host → main: { type: 'log', entry }                       (contínuo)
 *                { id, ok, error?, running?, watchers? }      (resposta de RPC)
 */

const { NfeWatcher } = require('./nfe-watcher.js')

let watcher = null
const port = process.parentPort

port.on('message', async (e) => {
  const msg = (e && e.data) || {}
  const reply = (extra) => { try { port.postMessage({ id: msg.id, ...extra }) } catch { /* */ } }
  try {
    if (msg.type === 'init') {
      if (watcher) return
      watcher = new NfeWatcher({
        apiUrl: msg.apiUrl,
        daemonSecret: msg.daemonSecret,
        onLog: (entry) => { try { port.postMessage({ type: 'log', entry }) } catch { /* */ } },
      })
      return
    }
    if (!watcher) { if (msg.id) reply({ ok: false, error: 'watcher não inicializado' }); return }
    if (msg.type === 'start') {
      if (!watcher.running) await watcher.start()
      return reply({ ok: true, running: watcher.running })
    }
    if (msg.type === 'stop') {
      if (watcher.running) await watcher.stop()
      return reply({ ok: true, running: watcher.running })
    }
    if (msg.type === 'refresh') {
      await watcher.refreshConfig()
      return reply({ ok: true, running: watcher.running })
    }
    if (msg.type === 'status') {
      return reply({ ok: true, running: watcher.running, watchers: watcher.getStatus() })
    }
  } catch (err) {
    if (msg.id) reply({ ok: false, error: err.message })
  }
})
