/**
 * Gera o XLS das diferenças entre os clientes ATIVOS MENSAL (situação 2) do
 * OneClick legado (v1, db_intranet @ 192.168.0.7) e o OneClick v2 (produção).
 *
 * Dados consolidados no levantamento:
 *   - 209 clientes ativos com situação MENSAL no legado
 *   - 203 já presentes no v2
 *   -   6 NÃO migrados (listados abaixo)
 *
 * As 3 com CNPJ válido serão incluídas no v2; as 3 sem CNPJ são pessoas
 * físicas/domésticas que não têm cadastro fiscal.
 *
 * Rodar (a partir da raiz): node apps/api/node_modules/.bin/... — ou simplesmente
 *   node -e "require('./scripts/gen-diff-clientes-xls.js')"
 * Saída: clientes-mensais-diff-v1-v2.xlsx na raiz do repositório.
 */
const path = require('path')
const XLSX = require(path.join(__dirname, '..', 'apps', 'api', 'node_modules', 'xlsx'))

// ── Os 6 clientes ativos MENSAL do legado que NÃO vieram para o v2 ──
const naoMigrados = [
  {
    razao: 'COC BEBIDAS LTDA',
    cnpj: '66.731.804/0001-79',
    temCnpj: 'Sim',
    acao: 'INCLUIR no v2',
    obs: 'Matriz — CNPJ válido',
  },
  {
    razao: 'FINATTO (matriz)',
    cnpj: '24.166.094/0001-31',
    temCnpj: 'Sim',
    acao: 'INCLUIR no v2',
    obs: 'Matriz — CNPJ válido',
  },
  {
    razao: 'FINATTO (filial)',
    cnpj: '24.166.094/0002-12',
    temCnpj: 'Sim',
    acao: 'INCLUIR no v2',
    obs: 'Filial — CNPJ válido',
  },
  {
    razao: 'KERNEL DOMESTICA',
    cnpj: '—',
    temCnpj: 'Não',
    acao: 'Não migrar',
    obs: 'Doméstica / pessoa física — sem cadastro fiscal (CNPJ)',
  },
  {
    razao: 'LETICIA SILVEIRA',
    cnpj: '—',
    temCnpj: 'Não',
    acao: 'Não migrar',
    obs: 'Doméstica / pessoa física — sem cadastro fiscal (CNPJ)',
  },
  {
    razao: 'ROSE MUNHÃO - DOMESTICAS',
    cnpj: '—',
    temCnpj: 'Não',
    acao: 'Não migrar',
    obs: 'Doméstica / pessoa física — sem cadastro fiscal (CNPJ)',
  },
]

const wb = XLSX.utils.book_new()

// ── Aba 1: Resumo ──
const resumo = [
  ['Levantamento — Clientes ativos MENSAL (situação 2): Legado v1 × OneClick v2'],
  ['Gerado em', '2026-06-08'],
  ['Fonte legado', 'db_intranet @ 192.168.0.7 (GER_CAD_CLI, cad_cli_ativo=1, cad_cli_situacao=2)'],
  [],
  ['Métrica', 'Quantidade'],
  ['Clientes ativos MENSAL no legado (v1)', 209],
  ['Já presentes no OneClick v2', 203],
  ['NÃO migrados', 6],
  ['  → com CNPJ (a incluir no v2)', 3],
  ['  → sem CNPJ (domésticas/PF — não migrar)', 3],
]
const wsResumo = XLSX.utils.aoa_to_sheet(resumo)
wsResumo['!cols'] = [{ wch: 48 }, { wch: 58 }]
XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')

// ── Aba 2: Não migrados (detalhe) ──
const header = ['#', 'Razão Social', 'CNPJ', 'Tem CNPJ?', 'Ação', 'Observação']
const linhas = naoMigrados.map((c, i) => [i + 1, c.razao, c.cnpj, c.temCnpj, c.acao, c.obs])
const wsDet = XLSX.utils.aoa_to_sheet([header, ...linhas])
wsDet['!cols'] = [{ wch: 4 }, { wch: 28 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 48 }]
XLSX.utils.book_append_sheet(wb, wsDet, 'Nao migrados')

const out = path.join(__dirname, '..', 'clientes-mensais-diff-v1-v2.xlsx')
XLSX.writeFile(wb, out)
console.log('XLS gerado:', out)
console.log('Abas: Resumo, Nao migrados —', naoMigrados.length, 'linhas')
