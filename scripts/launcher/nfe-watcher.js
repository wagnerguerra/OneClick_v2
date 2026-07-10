/**
 * NFe Watcher — monitora pastas locais do PC e envia XMLs/ZIPs novos pra API.
 *
 * Fluxo:
 *  1. A cada 15s: GET /api/drive-sync/configs-locais (lista de clientes com pasta)
 *  2. Pra cada cliente novo: chokidar.watch(path); se nunca sincronizou
 *     (localSyncedAt null), roda scan inicial do acervo (dedup por SHA na API)
 *  3. Pra cada cliente removido da config: para o watcher
 *  4. Eventos `add` do chokidar (após scan inicial): enfileira arquivo, debounce 2s
 *  5. Worker: drena fila em batches de até 50, envia POST /api/drive-sync/batch-local
 *
 * Auth: header `X-Daemon-Secret` (env LAUNCHER_DAEMON_SECRET, copiado do .env da API).
 */

const chokidar = require('chokidar')
const fs = require('fs')
const path = require('path')
// FormData + Blob globais do Node 22 (web standard) — funciona com fetch global.
// A lib `form-data` (legacy) não seta Content-Length corretamente no fetch nativo
// e causa "Unexpected end of form" no Multer.

const POLL_INTERVAL_MS = 15_000  // a cada 15s — também detecta requests de sync manual
const DEBOUNCE_MS = 2_000        // espera 2s estabilizar antes de enviar
const BATCH_SIZE = 10            // menor pra não sobrecarregar a API (cada arquivo gera S3 + PDF + DB inserts)
const BATCH_DELAY_MS = 800       // pausa entre chunks pra dar respiro pro servidor
const MAX_DEPTH = 6              // níveis de subpasta — estruturas reais chegam a 5 (2026\NOTAS FISCAIS\06-2026\SAIDA\Canceladas)

class NfeWatcher {
  constructor({ apiUrl, daemonSecret, onLog }) {
    this.apiUrl = apiUrl
    this.daemonSecret = daemonSecret
    this.onLog = onLog || (() => {})
    this.watchers = new Map()       // clienteId -> { watcher, path, razaoSocial, fila, debounceTimer }
    this.status = new Map()         // clienteId -> { lastSync, totalEnviados, ultimoErro, watching }
    this.pollTimer = null
    this.running = false
  }

  log(msg, level = 'info') {
    const ts = new Date().toISOString().slice(11, 19)
    console.log(`[${ts}] [NfeWatcher] [${level}] ${msg}`)
    this.onLog({ ts, level, msg })
  }

  async start() {
    if (this.running) return
    if (!this.daemonSecret) {
      this.log('Daemon secret não configurado — abortando.', 'error')
      return
    }
    this.running = true
    this.log('Iniciado.')
    await this.refreshConfig()
    this.pollTimer = setInterval(() => this.refreshConfig(), POLL_INTERVAL_MS)
  }

  async stop() {
    this.running = false
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    for (const [, entry] of this.watchers) {
      if (entry.watcher) await entry.watcher.close()
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    }
    this.watchers.clear()
    this.log('Parado.')
  }

  async refreshConfig() {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10_000)
      let resp
      try {
        resp = await fetch(`${this.apiUrl}/api/drive-sync/configs-locais`, {
          headers: { 'X-Daemon-Secret': this.daemonSecret },
          signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
      const configs = await resp.json()

      const idsAtuais = new Set(configs.map(c => c.id))

      // Para watchers que não estão mais na config
      for (const [clienteId, entry] of this.watchers) {
        if (!idsAtuais.has(clienteId)) {
          this.log(`Removendo watcher: ${entry.razaoSocial}`)
          if (entry.watcher) await entry.watcher.close()
          if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
          this.watchers.delete(clienteId)
          this.status.delete(clienteId)
        }
      }

      // Adiciona/atualiza watchers — try/catch POR cliente pra que 1 ruim não derrube o resto
      for (const c of configs) {
        try {
          const existing = this.watchers.get(c.id)
          if (existing && existing.path === c.localFolderPath) continue
          if (existing) {
            if (existing.watcher) await existing.watcher.close()
            if (existing.debounceTimer) clearTimeout(existing.debounceTimer)
          }
          await this.iniciarWatcher(c)
        } catch (e) {
          this.log(`Falha ao iniciar watcher de ${c.razaoSocial}: ${e.message}`, 'error')
        }
      }

      // Heartbeat — informa à API quais clientes estão sendo observados pela UI
      await this.enviarHeartbeat(configs.map(c => c.id)).catch(() => { /* */ })

      // Checa requisições de sync manual pendentes
      await this.processarSyncRequests().catch((e) => {
        this.log(`Falha ao processar sync-requests: ${e.message}`, 'warn')
      })
    } catch (e) {
      this.log(`Falha ao carregar configs: ${e.message}`, 'error')
    }
  }

  /** Consulta requisições de sync manual e processa cada uma (scan completo + envio). */
  async processarSyncRequests() {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    let resp
    try {
      resp = await fetch(`${this.apiUrl}/api/drive-sync/sync-requests`, {
        headers: { 'X-Daemon-Secret': this.daemonSecret },
        signal: ctrl.signal,
      })
    } finally { clearTimeout(timer) }
    if (!resp.ok) return
    const { clienteIds } = await resp.json()
    if (!Array.isArray(clienteIds) || clienteIds.length === 0) return

    for (const clienteId of clienteIds) {
      const entry = this.watchers.get(clienteId)
      if (!entry || !entry.path) {
        this.log(`Sync request pra cliente sem watcher (${clienteId}) — ignorado`, 'warn')
        await this.marcarRequestProcessado(clienteId)
        continue
      }
      try {
        await this.scanCompletoEPromover(clienteId, entry)
      } catch (e) {
        this.log(`Falha no scan completo de ${entry.razaoSocial}: ${e.message}`, 'error')
      } finally {
        await this.marcarRequestProcessado(clienteId)
      }
    }
  }

  /** Varre toda a pasta recursivamente e enfileira todos XMLs/ZIPs encontrados. */
  async scanCompletoEPromover(clienteId, entry) {
    this.log(`Scan completo iniciado: ${entry.razaoSocial} (${entry.path})`, 'info')
    const arquivos = []
    const stack = [entry.path]
    while (stack.length) {
      const dir = stack.pop()
      let items
      try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
      for (const item of items) {
        const fullPath = path.join(dir, item.name)
        if (item.isDirectory()) {
          // limita profundidade pra não travar
          const rel = path.relative(entry.path, fullPath)
          if (rel.split(path.sep).length > MAX_DEPTH) continue
          if (/node_modules|\$Recycle\.Bin|System Volume Information|\.git/i.test(item.name)) continue
          stack.push(fullPath)
        } else if (item.isFile()) {
          const lower = item.name.toLowerCase()
          if (lower.endsWith('.xml') || lower.endsWith('.zip')) {
            arquivos.push(fullPath)
          }
        }
      }
    }
    this.log(`Scan completo: ${arquivos.length} arquivos encontrados (${entry.razaoSocial})`, 'info')

    // Envia em chunks com pausa — não sobrecarrega API
    const cliente = { id: clienteId, razaoSocial: entry.razaoSocial }
    for (let i = 0; i < arquivos.length; i += BATCH_SIZE) {
      const chunk = arquivos.slice(i, i + BATCH_SIZE)
      this.log(`Enviando chunk ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(arquivos.length / BATCH_SIZE)} (${chunk.length} arquivos)`, 'info')
      await this.enviarBatch(cliente, entry, chunk)
      if (i + BATCH_SIZE < arquivos.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  async marcarRequestProcessado(clienteId) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      try {
        await fetch(`${this.apiUrl}/api/drive-sync/sync-requests/${clienteId}/done`, {
          method: 'POST',
          headers: { 'X-Daemon-Secret': this.daemonSecret },
          signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
    } catch { /* ignora */ }
  }

  async iniciarWatcher(cliente) {
    const folderPath = cliente.localFolderPath

    // Validações defensivas — refuse paths perigosos
    if (!folderPath || folderPath.length < 4) {
      this.log(`Path inválido/curto demais: "${folderPath}" (${cliente.razaoSocial}) — pulado`, 'warn')
      this.status.set(cliente.id, { watching: false, ultimoErro: 'path inválido', totalEnviados: 0 })
      return
    }
    // Recusa raiz de drives Windows (C:\, D:\, etc) — risco de varredura gigante
    if (/^[a-zA-Z]:[\\/]?$/.test(folderPath)) {
      this.log(`Path é raiz do drive: "${folderPath}" (${cliente.razaoSocial}) — pulado por segurança`, 'warn')
      this.status.set(cliente.id, { watching: false, ultimoErro: 'raiz de drive não permitida', totalEnviados: 0 })
      return
    }
    if (!fs.existsSync(folderPath)) {
      this.log(`Pasta não existe: ${folderPath} (${cliente.razaoSocial})`, 'warn')
      this.status.set(cliente.id, { watching: false, ultimoErro: 'pasta não encontrada', totalEnviados: 0 })
      return
    }
    // Verifica se é diretório (não arquivo)
    try {
      const stat = fs.statSync(folderPath)
      if (!stat.isDirectory()) {
        this.log(`Path não é uma pasta: ${folderPath} (${cliente.razaoSocial})`, 'warn')
        this.status.set(cliente.id, { watching: false, ultimoErro: 'não é uma pasta', totalEnviados: 0 })
        return
      }
    } catch (e) {
      this.log(`Não foi possível acessar ${folderPath}: ${e.message}`, 'warn')
      this.status.set(cliente.id, { watching: false, ultimoErro: `acesso negado: ${e.message}`, totalEnviados: 0 })
      return
    }

    this.log(`Monitorando ${folderPath} (${cliente.razaoSocial})`)
    const fila = new Set()
    const entry = {
      watcher: null,
      path: folderPath,
      razaoSocial: cliente.razaoSocial,
      fila,
      debounceTimer: null,
    }

    // Detecta paths UNC (compartilhamentos de rede Windows: \\servidor\share\...)
    // O fs.watch nativo do Node tem bug conhecido nesses paths — usa polling.
    const isUNC = folderPath.startsWith('\\\\') || folderPath.startsWith('//')

    // chokidar.watch() pode lançar síncrono — proteção
    let watcher
    try {
      watcher = chokidar.watch(folderPath, {
        ignored: (file) => {
          if (/[\\/]\.[^\\/]+/.test(file)) return true
          if (/node_modules|\$Recycle\.Bin|System Volume Information|\.git/i.test(file)) return true
          return false
        },
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
        depth: MAX_DEPTH,
        usePolling: isUNC,                              // polling pra paths de rede
        interval: isUNC ? 5000 : 100,                   // polling 5s em UNC (mais lento, menos carga)
        binaryInterval: isUNC ? 5000 : 300,
        atomic: true,
      })
      if (isUNC) this.log(`(${cliente.razaoSocial}) path UNC detectado — polling 5s ativado`, 'info')
    } catch (e) {
      this.log(`Falha em chokidar.watch ${folderPath}: ${e.message}`, 'error')
      this.status.set(cliente.id, { watching: false, ultimoErro: e.message, totalEnviados: 0 })
      return
    }

    watcher.on('add', filePath => {
      try {
        const lower = filePath.toLowerCase()
        if (lower.endsWith('.xml') || lower.endsWith('.zip')) {
          fila.add(filePath)
          this.agendarDrain(cliente, entry)
        }
      } catch (e) {
        this.log(`Erro no handler add: ${e.message}`, 'error')
      }
    })

    // Throttle de erros — chokidar pode disparar em loop. Limita 1 log a cada 10s.
    // Após 5 erros em 30s, fecha o watcher pra parar o loop infinito.
    entry.errCount = 0
    entry.errResetTimer = null
    entry.lastErrLog = 0
    watcher.on('error', err => {
      const now = Date.now()
      entry.errCount++
      if (now - entry.lastErrLog > 10_000) {
        this.log(`Erro no watcher ${folderPath}: ${err.message}`, 'error')
        entry.lastErrLog = now
      }
      // Reset count após 30s sem erros
      if (entry.errResetTimer) clearTimeout(entry.errResetTimer)
      entry.errResetTimer = setTimeout(() => { entry.errCount = 0 }, 30_000)
      // Mata o watcher se for loop persistente — remove do mapa pra que o
      // próximo poll recrie do zero (antes ficava órfão e nunca voltava)
      if (entry.errCount > 5) {
        this.log(`Watcher ${cliente.razaoSocial} morto após ${entry.errCount} erros consecutivos — será recriado no próximo poll`, 'error')
        try { watcher.close() } catch { /* */ }
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
        this.watchers.delete(cliente.id)
        this.status.set(cliente.id, { watching: false, ultimoErro: `loop de erros: ${err.message}`, totalEnviados: this.status.get(cliente.id)?.totalEnviados ?? 0 })
      }
    })

    entry.watcher = watcher
    this.watchers.set(cliente.id, entry)
    this.status.set(cliente.id, { watching: true, totalEnviados: 0, ultimoErro: null })

    // Scan inicial: cliente que nunca sincronizou tem o acervo existente enviado
    // automaticamente (a API dedupa por SHA, então re-scans não duplicam nada).
    // Fire-and-forget — não pode segurar o refreshConfig por horas em pastas grandes.
    if (!cliente.localSyncedAt) {
      this.log(`${cliente.razaoSocial} nunca sincronizou — agendando scan inicial do acervo`, 'info')
      this.scanCompletoEPromover(cliente.id, entry).catch(e => {
        this.log(`Scan inicial falhou (${cliente.razaoSocial}): ${e.message}`, 'error')
      })
    }
  }

  async enviarHeartbeat(clienteIds) {
    if (!Array.isArray(clienteIds) || clienteIds.length === 0) return
    const items = clienteIds.map(id => {
      const entry = this.watchers.get(id)
      const st = this.status.get(id) ?? {}
      return {
        clienteId: id,
        watching: !!(entry && st.watching),
        ultimoErro: st.ultimoErro ?? null,
      }
    })
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 5000)
      try {
        await fetch(`${this.apiUrl}/api/drive-sync/heartbeat-local`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Daemon-Secret': this.daemonSecret },
          body: JSON.stringify({ items }),
          signal: ctrl.signal,
        })
      } finally { clearTimeout(timer) }
    } catch (e) {
      this.log(`Heartbeat falhou: ${e.message}`, 'warn')
    }
  }

  agendarDrain(cliente, entry) {
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer)
    entry.debounceTimer = setTimeout(() => this.drenarFila(cliente, entry), DEBOUNCE_MS)
  }

  async drenarFila(cliente, entry) {
    const paths = Array.from(entry.fila)
    entry.fila.clear()
    entry.debounceTimer = null
    if (paths.length === 0) return

    // Envia em chunks de BATCH_SIZE com pausa entre eles
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const chunk = paths.slice(i, i + BATCH_SIZE)
      await this.enviarBatch(cliente, entry, chunk)
      if (i + BATCH_SIZE < paths.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  async enviarBatch(cliente, entry, paths) {
    const form = new FormData()
    form.append('clienteId', cliente.id)

    for (const p of paths) {
      try {
        const buf = fs.readFileSync(p)
        const rel = path.relative(entry.path, p).replace(/\\/g, '/')
        // Blob + filename — web FormData se entende perfeito com fetch
        form.append('files', new Blob([buf], { type: 'application/octet-stream' }), path.basename(p))
        form.append('paths', rel)
      } catch (e) {
        this.log(`Falha ao ler ${p}: ${e.message}`, 'warn')
      }
    }

    try {
      const resp = await fetch(`${this.apiUrl}/api/drive-sync/batch-local`, {
        method: 'POST',
        headers: { 'X-Daemon-Secret': this.daemonSecret },  // fetch seta Content-Type multipart automaticamente
        body: form,
      })
      if (!resp.ok) {
        const txt = await resp.text()
        throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`)
      }
      const json = await resp.json()
      const st = this.status.get(cliente.id) ?? { watching: true, totalEnviados: 0 }
      st.totalEnviados += json.arquivosOk ?? 0
      st.lastSync = new Date().toISOString()
      st.ultimoErro = null
      this.status.set(cliente.id, st)
      this.log(`${cliente.razaoSocial}: ${json.arquivosOk}/${paths.length} processados (${json.arquivosIgnorados ?? 0} ign, ${json.arquivosErro ?? 0} err)`)
    } catch (e) {
      this.log(`Falha ao enviar batch (${cliente.razaoSocial}): ${e.message}`, 'error')
      const st = this.status.get(cliente.id) ?? { watching: true, totalEnviados: 0 }
      st.ultimoErro = e.message
      this.status.set(cliente.id, st)
    }
  }

  getStatus() {
    const out = []
    for (const [clienteId, entry] of this.watchers) {
      const s = this.status.get(clienteId) ?? {}
      out.push({
        clienteId,
        razaoSocial: entry.razaoSocial,
        path: entry.path,
        watching: !!s.watching,
        totalEnviados: s.totalEnviados ?? 0,
        ultimoErro: s.ultimoErro ?? null,
        lastSync: s.lastSync ?? null,
      })
    }
    return out
  }
}

module.exports = { NfeWatcher }
