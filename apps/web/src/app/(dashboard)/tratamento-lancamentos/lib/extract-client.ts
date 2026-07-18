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

/** Extrai a tabela do arquivo no cliente. Só baixa o WASM do PDFium para PDFs. */
export async function extractClient(file: File): Promise<ExtractedTable> {
  if (file.name.toLowerCase().endsWith('.pdf')) await ensurePdfium()
  const buffer = new Uint8Array(await file.arrayBuffer())
  return extractTabela({ buffer, filename: file.name })
}
