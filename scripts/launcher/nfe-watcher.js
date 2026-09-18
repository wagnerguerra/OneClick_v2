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

// chokidar foi REMOVIDO daqui de propósito (18/09/2026).
//
// Ele mantinha em memória um índice de cada arquivo da árvore vigiada, com
// depth 10. Dez pastas contábeis reais somavam 1,9 GB no utilityProcess — 83%
// da memória do Service Manager inteiro. Não era vazamento: era o custo de
// vigiar o que não precisa ser vigiado.
//
// No lugar entrou varredura periódica por data de modificação, agendada numa
// janela do dia. A memória passa a ser proporcional aos arquivos NOVOS, não
// aos arquivos existentes. De bônus é mais confiável: watcher perde evento
// quando o processo está ocupado, quando o volume de rede cai e volta, ou
// quando o SO derruba o handle — varredura por mtime não perde.
const fs = require('fs')
const path = require('path')
// FormData + Blob globais do Node 22 (web standard) — funciona com fetch global.
// A lib `form-data` (legacy) não seta Content-Length corretamente no fetch nativo
// e causa "Unexpected end of form" no Multer.

const POLL_INTERVAL_MS = 15_000  // a cada 15s — também detecta requests de sync manual
const BATCH_SIZE = 10            // menor pra não sobrecarregar a API (cada arquivo gera S3 + PDF + DB inserts)
// Caminhos acumulados antes de despejar um lote. Teto de memória da varredura:
// antes a árvore inteira virava um array, e uma pasta com 300 mil arquivos
// materializava esse array E os chunks ao mesmo tempo.
const JANELA_SCAN = 500
// Folga para trás no filtro por mtime. Relógio do servidor de arquivos e
// relógio local não batem exatamente; perder uma nota por dois minutos de
// diferença seria o pior defeito possível aqui. Reenvio é inofensivo — a API
// dedupa por SHA.
const MARGEM_MTIME_MS = 30 * 60_000
const BATCH_DELAY_MS = 800       // pausa entre chunks pra dar respiro pro servidor
const MAX_DEPTH = 10             // níveis de subpasta — estruturas reais chegam a 9 (ANOS ANTERIORES\2024\NOTAS FISCAIS\...\SAIDA\Canceladas)
const MAX_BATCH_BYTES = 25 * 1024 * 1024   // corpo máximo por request — chunks de 10 arquivos sem teto chegavam a 500MB e caíam com "fetch failed"
const MAX_FILE_BYTES = 95 * 1024 * 1024    // teto por arquivo — o multer da API corta em 100MB e mata a conexão no meio do stream
const ENVIO_TENTATIVAS = 3                 // retries com backoff pra erro de rede/5xx — antes o chunk era descartado na 1ª falha
const ENVIO_TIMEOUT_MS = 5 * 60_000        // aborta upload travado (não pode segurar a fila pra sempre)

class NfeWatcher {
  constructor({ apiUrl, daemonSecret, onLog }) {
    this.apiUrl = apiUrl
    this.daemonSecret = daemonSecret
    this.onLog = onLog || (() => {})
    this.watchers = new Map()       // clienteId -> { path, razaoSocial, ultimaSync, varrendo }
    this.status = new Map()         // clienteId -> { lastSync, totalEnviados, ultimoErro, watching }
    this.pollTimer = null
    this.running = false
    this.varrendoTudo = false       // trava da varredura agendada — uma de cada vez
    this.scanQueue = Promise.resolve()  // scans completos rodam UM por vez — em paralelo saturam o uplink e os uploads caem
  }

  /** Agrupa paths em chunks limitados por quantidade E por bytes somados.
   *  Arquivo acima de MAX_FILE_BYTES é pulado com warn (o multer da API rejeitaria).
   *  Arquivo sem cara de NF (XML sem <NFe>/<nfeProc>/<procEventoNFe>, ZIP sem
   *  nenhum .xml dentro) é descartado antes do upload — espelha o filtro da API
   *  (detectarTipoNaoNFe) pra não gastar banda subindo SPED, folha, boletos etc. */
  montarChunks(paths) {
    const chunks = []
    let atual = []
    let bytes = 0
    let naoFiscais = 0
    for (const p of paths) {
      let size = 0
      try { size = fs.statSync(p).size } catch { continue }  // sumiu entre o scan e o envio — pula
      if (size > MAX_FILE_BYTES) {
        this.log(`Arquivo acima de ${Math.round(MAX_FILE_BYTES / 1048576)}MB ignorado: ${path.basename(p)} (${Math.round(size / 1048576)}MB)`, 'warn')
        continue
      }
      const relevante = p.toLowerCase().endsWith('.zip') ? this.zipTemXml(p) : this.ehXmlFiscal(p)
      if (!relevante) { naoFiscais++; continue }
      if (atual.length > 0 && (atual.length >= BATCH_SIZE || bytes + size > MAX_BATCH_BYTES)) {
        chunks.push(atual)
        atual = []
        bytes = 0
      }
      atual.push(p)
      bytes += size
    }
    if (atual.length > 0) chunks.push(atual)
    if (naoFiscais > 0) this.log(`${naoFiscais} arquivo(s) sem XML de nota fiscal descartados antes do envio`, 'info')
    return chunks
  }

  /** Sniff barato: XML é de nota fiscal (ou evento do ciclo dela)?
   *  Lê só os primeiros 2KB — mesmos marcadores que a API usa em detectarTipoNaoNFe.
   *  Erro de leitura → deixa passar (a API é o filtro final). */
  ehXmlFiscal(p) {
    let fd = null
    try {
      fd = fs.openSync(p, 'r')
      const buf = Buffer.alloc(2048)
      const n = fs.readSync(fd, buf, 0, 2048, 0)
      const head = buf.subarray(0, n).toString('latin1')
      return /<nfeProc[\s>]|<NFe[\s>]|<procEventoNFe[\s>]/.test(head)
    } catch {
      return true
    } finally {
      if (fd !== null) { try { fs.closeSync(fd) } catch { /* */ } }
    }
  }

  /** ZIP contém pelo menos um .xml? Lê só o central directory (sem descompactar).
   *  Formato inesperado (ZIP64, EOCD não achado) ou erro → deixa passar. */
  zipTemXml(p) {
    try {
      const size = fs.statSync(p).size
      if (size < 22) return false
      const tailLen = Math.min(size, 65_557)  // EOCD (22) + comentário máximo (65535)
      const fd = fs.openSync(p, 'r')
      let cd
      try {
        const tail = Buffer.alloc(tailLen)
        fs.readSync(fd, tail, 0, tailLen, size - tailLen)
        let eocd = -1
        for (let i = tail.length - 22; i >= 0; i--) {
          if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
        }
        if (eocd < 0) return true
        const cdSize = tail.readUInt32LE(eocd + 12)
        const cdOffset = tail.readUInt32LE(eocd + 16)
        if (cdSize === 0xFFFFFFFF || cdOffset === 0xFFFFFFFF) return true  // ZIP64
        cd = Buffer.alloc(cdSize)
        fs.readSync(fd, cd, 0, cdSize, cdOffset)
      } finally {
        try { fs.closeSync(fd) } catch { /* */ }
      }
      let off = 0
      while (off + 46 <= cd.length) {
        if (cd.readUInt32LE(off) !== 0x02014b50) break  // fim das entradas do CD
        const nameLen = cd.readUInt16LE(off + 28)
        const extraLen = cd.readUInt16LE(off + 30)
        const commentLen = cd.readUInt16LE(off + 32)
        const nome = cd.subarray(off + 46, off + 46 + nameLen).toString('latin1')
        if (/\.xml$/i.test(nome)) return true
        off += 46 + nameLen + extraLen + commentLen
      }
      return false
    } catch {
      return true
    }
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
    // Sem watchers para fechar desde que o chokidar saiu — só descarta o
    // cadastro em memória. Varredura em curso termina sozinha; o `varrendoTudo`
    // impede que outra comece.
    this.watchers.clear()
    this.status.clear()
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
          // Mesmo path = mantém o entry, e com ele a marca d'água `ultimaSync`
          // que a varredura vai usando. Recriar aqui jogaria o incremental
          // de volta para o `localSyncedAt` da API a cada poll de 15s.
          if (existing && existing.path === c.localFolderPath) continue
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
      // Entra na fila serializada (não bloqueia o poll de configs por horas).
      // Marca processado já no aceite — senão o próximo poll re-enfileiraria.
      this.log(`Sync manual de ${entry.razaoSocial} entrou na fila de scans`, 'info')
      this.enfileirarScan(clienteId, entry)
      await this.marcarRequestProcessado(clienteId)
    }
  }

  /**
   * Varre a pasta e envia XMLs/ZIPs, em JANELAS.
   *
   * Duas mudanças em relação à versão que acompanhava o chokidar:
   *
   * 1. INCREMENTAL — `opts.desde` (epoch ms) descarta arquivo cuja mtime seja
   *    anterior. Sem isso, cada execução do cron reenviaria o acervo inteiro.
   *    `desde` nulo = varredura completa (cliente que nunca sincronizou).
   *    Há folga de MARGEM_MTIME_MS para trás, porque relógio de servidor de
   *    arquivos e relógio local não batem exatamente — perder nota por causa
   *    de dois minutos de diferença seria o pior defeito possível aqui.
   *
   * 2. EM JANELAS — antes o caminho de CADA arquivo da árvore ia para um array
   *    único, e depois `montarChunks` construía outra estrutura com todos. Uma
   *    pasta com 300 mil arquivos materializava as duas ao mesmo tempo. Agora
   *    acumula no máximo JANELA_SCAN caminhos, envia, e descarta antes de
   *    continuar — memória constante, independente do tamanho da pasta.
   */
  async scanCompletoEPromover(clienteId, entry, opts = {}) {
    const desde = opts.desde ? opts.desde - MARGEM_MTIME_MS : null
    const rotulo = desde ? 'Varredura incremental' : 'Varredura completa'
    this.log(`${rotulo} iniciada: ${entry.razaoSocial} (${entry.path})`, 'info')

    const cliente = { id: clienteId, razaoSocial: entry.razaoSocial }
    const stack = [entry.path]
    let janela = []
    let encontrados = 0
    let enviados = 0

    const despejarJanela = async () => {
      if (janela.length === 0) return
      const chunks = this.montarChunks(janela)
      janela = []   // solta as referências antes de enviar
      for (let i = 0; i < chunks.length; i++) {
        await this.enviarBatch(cliente, entry, chunks[i])
        enviados += chunks[i].length
        if (i + 1 < chunks.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
      }
    }

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
          if (!lower.endsWith('.xml') && !lower.endsWith('.zip')) continue
          if (desde) {
            let mtime = 0
            try { mtime = fs.statSync(fullPath).mtimeMs } catch { continue }
            if (mtime < desde) continue
          }
          encontrados++
          janela.push(fullPath)
          if (janela.length >= JANELA_SCAN) await despejarJanela()
        }
      }
    }
    await despejarJanela()

    this.log(`${rotulo} concluída: ${encontrados} arquivo(s) candidato(s), ${enviados} enviado(s) — ${entry.razaoSocial}`, 'info')
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

    this.log(`Pasta registrada para varredura: ${folderPath} (${cliente.razaoSocial})`)
    const entry = {
      path: folderPath,
      razaoSocial: cliente.razaoSocial,
      // Marca d'água do incremental: usa o localSyncedAt que a própria API
      // mantém, em vez de persistência local. Nulo = nunca sincronizou, e a
      // primeira varredura leva o acervo inteiro (a API dedupa por SHA).
      ultimaSync: cliente.localSyncedAt ? new Date(cliente.localSyncedAt).getTime() : null,
      varrendo: false,
    }
    this.watchers.set(cliente.id, entry)
    this.status.set(cliente.id, { watching: true, totalEnviados: 0, ultimoErro: null })
  }

  /**
   * Varre todas as pastas registradas e envia o que mudou desde a última sync.
   *
   * É o que o cron do Service Manager chama. Serializa por cliente — varreduras
   * simultâneas saturam o uplink, e foi por isso que o scan já era enfileirado.
   */
  async varrerTodos() {
    if (this.varrendoTudo) {
      this.log('Varredura já em andamento — pedido ignorado.', 'warn')
      return { ok: false, error: 'varredura em andamento' }
    }
    this.varrendoTudo = true
    const inicio = Date.now()
    let clientes = 0
    try {
      // Config fresca: pasta pode ter sido trocada/desligada desde o último ciclo.
      await this.refreshConfig()
      for (const [clienteId, entry] of this.watchers) {
        try {
          await this.scanCompletoEPromover(clienteId, entry, { desde: entry.ultimaSync })
          // Daqui pra frente só o que for mais novo que agora interessa.
          entry.ultimaSync = inicio
          clientes++
        } catch (e) {
          this.log(`Varredura falhou (${entry.razaoSocial}): ${e.message}`, 'error')
          this.status.set(clienteId, {
            ...(this.status.get(clienteId) ?? {}),
            ultimoErro: e.message,
          })
        }
      }
      const seg = Math.round((Date.now() - inicio) / 1000)
      this.log(`Varredura concluída: ${clientes} pasta(s) em ${seg}s`, 'info')
      return { ok: true, clientes, segundos: seg }
    } finally {
      this.varrendoTudo = false
    }
  }

  /** Encadeia um scan completo na fila única — um de cada vez, erros não quebram a corrente. */
  enfileirarScan(clienteId, entry) {
    this.scanQueue = this.scanQueue
      .then(() => {
        // Watcher pode ter sido removido/trocado enquanto esperava na fila
        if (this.watchers.get(clienteId) !== entry) return
        return this.scanCompletoEPromover(clienteId, entry)
      })
      .catch(e => {
        this.log(`Scan completo falhou (${entry.razaoSocial}): ${e.message}`, 'error')
      })
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

    // Retry com backoff: erro de rede ("fetch failed") e 5xx são transitórios —
    // sem retry o chunk era descartado em silêncio e os arquivos só voltavam
    // num sync manual. 4xx não repete (o request está errado, insistir não muda).
    for (let tentativa = 1; tentativa <= ENVIO_TENTATIVAS; tentativa++) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), ENVIO_TIMEOUT_MS)
      try {
        const resp = await fetch(`${this.apiUrl}/api/drive-sync/batch-local`, {
          method: 'POST',
          headers: { 'X-Daemon-Secret': this.daemonSecret },  // fetch seta Content-Type multipart automaticamente
          body: form,
          signal: ctrl.signal,
        })
        if (!resp.ok) {
          const txt = await resp.text()
          const retryavel = resp.status >= 500
          const err = new Error(`HTTP ${resp.status}: ${txt.slice(0, 200)}`)
          err.retryavel = retryavel
          throw err
        }
        const json = await resp.json()
        const st = this.status.get(cliente.id) ?? { watching: true, totalEnviados: 0 }
        st.totalEnviados += json.arquivosOk ?? 0
        st.lastSync = new Date().toISOString()
        st.ultimoErro = null
        this.status.set(cliente.id, st)
        this.log(`${cliente.razaoSocial}: ${json.arquivosOk}/${paths.length} processados (${json.arquivosIgnorados ?? 0} ign, ${json.arquivosErro ?? 0} err)`)
        return
      } catch (e) {
        const transitorio = e.retryavel !== false  // rede/abort/5xx repetem; só 4xx não
        if (transitorio && tentativa < ENVIO_TENTATIVAS) {
          const espera = tentativa * 3000
          this.log(`Envio falhou (${cliente.razaoSocial}), tentativa ${tentativa}/${ENVIO_TENTATIVAS}: ${e.message} — repetindo em ${espera / 1000}s`, 'warn')
          await new Promise(r => setTimeout(r, espera))
          continue
        }
        this.log(`Falha ao enviar batch (${cliente.razaoSocial}): ${e.message}`, 'error')
        const st = this.status.get(cliente.id) ?? { watching: true, totalEnviados: 0 }
        st.ultimoErro = e.message
        this.status.set(cliente.id, st)
        return
      } finally {
        clearTimeout(timer)
      }
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
