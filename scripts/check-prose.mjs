#!/usr/bin/env node
/**
 * Trava contra as classes `prose` do @tailwindcss/typography.
 *
 * O plugin NÃO é usado neste projeto (decisão registrada em
 * `markdown-view.tsx` e no CLAUDE.md). Quem escreve `prose prose-sm` aqui não
 * recebe erro nenhum — a classe simplesmente não existe e não faz nada, então
 * o texto sai sem marcador de lista, sem hierarquia de título e sem barra de
 * citação. Já aconteceu em ~15 telas, incluindo o contrato e a proposta que o
 * CLIENTE abre, e voltou a aparecer depois de corrigido.
 *
 * Para exibir HTML vindo do <RichEditor>, use <RichContent> de @saas/ui.
 *
 * Uso: `pnpm check:prose` (ou `node scripts/check-prose.mjs`).
 * Sai com código 1 se encontrar ocorrências.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const RAIZ = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ALVOS = ['apps', 'packages']
const EXTENSOES = new Set(['.ts', '.tsx', '.css'])
const IGNORAR = new Set(['node_modules', '.next', 'dist', 'build', 'generated', '.turbo'])

// `prose` como classe: início/espaço/aspa antes, e fim/espaço/hífen depois.
// Evita casar palavras que apenas contêm "prose" (ex.: "proseguir" em texto).
const PADRAO = /(?<![\w-])prose(?:-[\w[\]/.]+)?(?![\w-])/

// O próprio arquivo de trava e os comentários que EXPLICAM a proibição citam a
// palavra — seria absurdo o script acusar a si mesmo.
const ARQUIVOS_ISENTOS = new Set([
  'scripts/check-prose.mjs',
])

function* percorrer(dir) {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) yield* percorrer(caminho)
    else if (EXTENSOES.has(caminho.slice(caminho.lastIndexOf('.')))) yield caminho
  }
}

const ocorrencias = []
for (const alvo of ALVOS) {
  let base
  try { base = join(RAIZ, alvo); statSync(base) } catch { continue }
  for (const arquivo of percorrer(base)) {
    const rel = relative(RAIZ, arquivo).replace(/\\/g, '/')
    if (ARQUIVOS_ISENTOS.has(rel)) continue
    // Normaliza CRLF: em JS o `.` não casa `\r`, então num arquivo CRLF o
    // `//.*$` não chegaria ao fim da linha e nenhum comentário seria removido.
    const bruto = readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n')
    // Comentário que só MENCIONA a regra não é uso. Blocos /* */ viram espaços
    // preservando as quebras, pra não bagunçar a numeração das linhas.
    const semBloco = bruto.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    const original = bruto.split('\n')
    semBloco.split('\n').forEach((linha, i) => {
      const semComentario = linha.replace(/\/\/.*$/, '')
      if (PADRAO.test(semComentario)) {
        ocorrencias.push({ arquivo: rel, linha: i + 1, texto: (original[i] ?? '').trim().slice(0, 120) })
      }
    })
  }
}

if (ocorrencias.length === 0) {
  console.log('✓ Nenhuma classe `prose` encontrada.')
  process.exit(0)
}

console.error(`\n✗ ${ocorrencias.length} uso(s) da classe \`prose\`, que NÃO existe neste projeto:\n`)
for (const o of ocorrencias) console.error(`  ${o.arquivo}:${o.linha}\n      ${o.texto}`)
console.error(`
  O @tailwindcss/typography nao esta instalado — essas classes nao aplicam
  estilo nenhum, e o conteudo sai sem marcador de lista, sem hierarquia de
  titulo e sem barra de citacao.

  Para exibir HTML do <RichEditor>, use <RichContent> de @saas/ui.
  Para markdown, use <MarkdownView>.
`)
process.exit(1)
