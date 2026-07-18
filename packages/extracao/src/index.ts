// @saas/extracao — fronteira ÚNICA de extração de tabela de lançamentos.
// Motor único (SheetJS p/ planilhas, pdfjs-dist p/ PDFs) compartilhado entre o
// frontend (extração no browser, em Web Worker) e o backend (Node). Ver
// `extract-tabela.ts` (fronteira + XLSX) e `pdf-extract.ts` (PDF).

export * from './extract-tabela'
export { extractPdfTable, configurePdf, type PdfConfig } from './pdf-extract'
