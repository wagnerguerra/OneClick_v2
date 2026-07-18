// Extração de tabela NO CLIENTE (browser). XLSX via SheetJS; PDF via PDFium/WASM
// (@embedpdf/pdfium) — mesmo motor do backend (@saas/extracao), rodando na aba do
// usuário. Tira o pico de memória da extração do processo da API (era a origem do
// OOM na geração de PDFs grandes). O `convert` no servidor recebe a tabela pronta.

import { extractTabela, configurePdf, type ExtractedTable } from '@saas/extracao'

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
