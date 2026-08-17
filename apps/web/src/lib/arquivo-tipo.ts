import {
  File, FileText, FileSpreadsheet, FileSignature, FileArchive, FileCode,
  ShieldCheck, Image as ImageIcon,
} from 'lucide-react'

/**
 * Classifica o arquivo para exibi-lo no mesmo padrão em todo o sistema: ícone
 * com cor própria + etiqueta do tipo. Sem isso todo arquivo vira um "papelzinho
 * cinza" e a lista fica ilegível — o certificado já provava que o tipo à vista
 * ajuda a achar o que se procura.
 *
 * A extensão manda mais que o mime-type: uploads antigos e os que vieram do
 * legado costumam chegar com `application/octet-stream` ou sem mime nenhum.
 *
 * Mora aqui, e não na tela do cliente onde nasceu, porque o card de arquivos é
 * o mesmo em Clientes e em Aquisições — duas cópias divergiriam na primeira
 * extensão nova que alguém acrescentasse de um lado só.
 */
export const TIPOS_ARQUIVO = [
  { chave: 'certificado', label: 'Certificado', icon: ShieldCheck, cor: 'text-fuchsia-600 dark:text-fuchsia-400', hover: 'hover:border-fuchsia-300 dark:hover:border-fuchsia-800', ext: ['pfx', 'p12', 'cer', 'crt', 'pem'], mime: ['x-pkcs12', 'pkix-cert'] },
  { chave: 'pdf', label: 'PDF', icon: FileText, cor: 'text-rose-600 dark:text-rose-400', hover: 'hover:border-rose-300 dark:hover:border-rose-800', ext: ['pdf'], mime: ['pdf'] },
  { chave: 'planilha', label: 'Planilha', icon: FileSpreadsheet, cor: 'text-emerald-600 dark:text-emerald-400', hover: 'hover:border-emerald-300 dark:hover:border-emerald-800', ext: ['xls', 'xlsx', 'xlsm', 'csv', 'ods'], mime: ['spreadsheet', 'excel', 'csv'] },
  { chave: 'documento', label: 'Documento', icon: FileSignature, cor: 'text-sky-600 dark:text-sky-400', hover: 'hover:border-sky-300 dark:hover:border-sky-800', ext: ['doc', 'docx', 'odt', 'rtf', 'txt'], mime: ['word', 'document', 'text/plain', 'rtf'] },
  { chave: 'imagem', label: 'Imagem', icon: ImageIcon, cor: 'text-violet-600 dark:text-violet-400', hover: 'hover:border-violet-300 dark:hover:border-violet-800', ext: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic'], mime: ['image/'] },
  { chave: 'compactado', label: 'Compactado', icon: FileArchive, cor: 'text-amber-600 dark:text-amber-400', hover: 'hover:border-amber-300 dark:hover:border-amber-800', ext: ['zip', 'rar', '7z', 'gz', 'tar'], mime: ['zip', 'compressed', 'rar'] },
  { chave: 'fiscal', label: 'Arquivo fiscal', icon: FileCode, cor: 'text-indigo-600 dark:text-indigo-400', hover: 'hover:border-indigo-300 dark:hover:border-indigo-800', ext: ['xml', 'sped', 'ecd', 'efd', 'ret', 'json'], mime: ['xml', 'json'] },
] as const

export const TIPO_GENERICO = {
  chave: 'arquivo', label: 'Arquivo', icon: File,
  cor: 'text-slate-500 dark:text-slate-400',
  hover: 'hover:border-slate-300 dark:hover:border-slate-700',
} as const

export function classificarArquivo(fileName: string | null, mimeType: string | null) {
  const ext = String(fileName ?? '').split('.').pop()?.toLowerCase() ?? ''
  const mime = String(mimeType ?? '').toLowerCase()
  for (const t of TIPOS_ARQUIVO) {
    if (ext && (t.ext as readonly string[]).includes(ext)) return t
    if (mime && (t.mime as readonly string[]).some((m) => mime.includes(m))) return t
  }
  return TIPO_GENERICO
}

/** Tamanho legível. `null`/0 vira string vazia — não se anuncia o que não se sabe. */
export function formatarTamanho(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}
