// Extração de tabela NO CLIENTE (browser). XLSX via SheetJS; PDF via PDFium/WASM
// (@embedpdf/pdfium). A extração vive SÓ aqui (neste módulo do web) — o servidor
// não abre arquivo, só aplica o modelo sobre a tabela pronta (convert/debugExtract).
// Foi isso que tirou o pico de memória da API (origem do OOM em PDFs grandes).
// Motor em ./extract-tabela (fronteira + XLSX) e ./pdf-extract (PDF).

import { extractTabela, type ExtractedTable } from './extract-tabela'
import { configurePdf } from './pdf-extract'

// Configura o WASM do PDFium UMA vez: baixa o binário do próprio app (/pdfium.wasm,
// servido de public/) — sem depender de CDN externo, importante p/ dado financeiro.
let pdfReady: Promise<void> | null = null
function ensurePdfium(): Promise<void> {
  if (!pdfReady) {
    pdfReady = fetch('/pdfium.wasm')
      .then((r) => {
        if (!r.ok) throw new Error('Falha ao carregar o motor de PDF (pdfium.wasm).')
        return r.arrayBuffer()
      })
      .then((wasmBinary) => { configurePdf({ wasmBinary }) })
      .catch((e) => { pdfReady = null; throw e }) // limpa p/ permitir retry
  }
  return pdfReady
}

// Cache por CONTEÚDO (hash) — evita re-extrair o MESMO arquivo ao navegar pelo
// fluxo (upload → editor → volta do wizard → debug re-extraiam o mesmo arquivo).
// Um PDF grande custa ~1.7s por extração; hashear custa ~ms. Guarda as últimas N
// tabelas (FIFO); a chave inclui o nome (o dispatch XLSX/PDF é por extensão).
const cache = new Map<string, Promise<ExtractedTable>>()
const CACHE_MAX = 3

// Hash não-cripto (cyrb53, 53 bits) sobre os bytes — NÃO usamos crypto.subtle de
// propósito: ela só existe em contexto seguro (HTTPS/localhost) e quebraria no
// acesso via LAN por http (192.168.x.x). Para chave de cache basta distribuição
// boa; combinado com tamanho+nome, colisão entre arquivos reais é desprezível.
function hashBytes(bytes: Uint8Array): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i]!
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Extrai a tabela do arquivo no cliente (com cache por conteúdo). Só baixa o WASM
 *  do PDFium para PDFs. */
export async function extractClient(file: File): Promise<ExtractedTable> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const key = `${bytes.length}:${file.name.toLowerCase()}:${hashBytes(bytes)}`
  const hit = cache.get(key)
  if (hit) return hit

  const promise = (async () => {
    if (file.name.toLowerCase().endsWith('.pdf')) await ensurePdfium()
    return extractTabela({ buffer: bytes, filename: file.name })
  })()
  promise.catch(() => cache.delete(key)) // falhou → não cacheia (permite retry)

  cache.set(key, promise)
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  return promise
}
