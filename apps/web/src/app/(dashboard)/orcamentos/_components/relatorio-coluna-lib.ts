// Tipos + helpers compartilhados do "Relatório da coluna" (modal de config e
// página de resultados). Excel/CSV/PDF são gerados no SERVIDOR (download por
// navegação); aqui fica só a formatação de célula e a impressão client-side.

export interface ItemServico { descricao: string; servicoId: string | null }
export interface Linha {
  id: string
  numero: number
  cliente: string
  valorTotal: number
  natureza: string
  areas: string[]
  solicitante: string
  responsavel: string
  createdAt: string
  dataStatus: string | null
  validadeDias: number
  itens: ItemServico[]
  descontoAplicado: number
  formaPagamento: string
  textoInterno: string
  textoCliente: string
}
export interface ResumoBucket { nome: string; count: number; soma: number }
export interface Resumo { count: number; somaTotal: number; ticketMedio: number; porArea: ResumoBucket[]; porTipo: ResumoBucket[] }
export interface Resultado { resumo: Resumo; linhas: Linha[] }
export interface CampoDef { key: string; label: string }

export function getCampos(statusLabel: string): CampoDef[] {
  return [
    { key: 'numero', label: 'Número' },
    { key: 'cliente', label: 'Cliente' },
    { key: 'valorTotal', label: 'Valor total' },
    { key: 'natureza', label: 'Tipo (Extra/Mensal)' },
    { key: 'areas', label: 'Área(s)' },
    { key: 'solicitante', label: 'Solicitante' },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'createdAt', label: 'Criado em' },
    { key: 'dataStatus', label: `Data na etapa (${statusLabel})` },
    { key: 'validadeDias', label: 'Validade (dias)' },
    { key: 'itens', label: 'Itens/serviços' },
    { key: 'descontoAplicado', label: 'Desconto' },
    { key: 'formaPagamento', label: 'Forma de pagamento' },
    { key: 'textoInterno', label: 'Texto Interno' },
    { key: 'textoCliente', label: 'Texto para o Cliente' },
  ]
}
export const DEFAULT_CAMPOS = ['numero', 'cliente', 'valorTotal', 'natureza', 'areas', 'responsavel', 'createdAt']

export const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const dt = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—')

export function formatCampo(l: Linha, key: string): string {
  switch (key) {
    case 'numero': return `#${l.numero}`
    case 'valorTotal': return brl(l.valorTotal)
    case 'descontoAplicado': return brl(l.descontoAplicado)
    case 'createdAt': return dt(l.createdAt)
    case 'dataStatus': return dt(l.dataStatus)
    case 'areas': return l.areas.length ? l.areas.join(', ') : '—'
    case 'itens': return l.itens.length ? l.itens.map(i => i.descricao).join('; ') : '—'
    case 'validadeDias': return l.validadeDias != null ? String(l.validadeDias) : '—'
    default: {
      const v = (l as unknown as Record<string, unknown>)[key]
      return v == null || v === '' ? '—' : String(v)
    }
  }
}

export function tabela(linhas: Linha[], campos: CampoDef[]): { headers: string[]; rows: string[][] } {
  const headers = campos.map(c => c.label)
  const rows = linhas.map(l => campos.map(c => formatCampo(l, c.key)))
  return { headers, rows }
}

export function imprimir(res: Resultado, campos: CampoDef[], statusLabel: string) {
  const { resumo } = res
  const { headers, rows } = tabela(res.linhas, campos)
  const w = window.open('', '_blank', 'width=1000,height=800')
  if (!w) return false
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Relatório — ${esc(statusLabel)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#111;margin:24px;font-size:12px}
      h1{font-size:18px;margin:0} .sub{color:#888;font-size:11px;margin:2px 0 14px}
      .cards{display:flex;gap:24px;margin-bottom:14px} .card .lbl{color:#888;font-size:10px} .card .val{font-size:18px;font-weight:700}
      h2{font-size:13px;margin:12px 0 4px} table{border-collapse:collapse;width:100%;margin-bottom:12px}
      th,td{border-bottom:1px solid #e5e7eb;padding:4px 6px;text-align:left;font-size:10px} th{background:#f1f5f9}
      @media print{body{margin:8mm}}
    </style></head><body>
    <h1>Relatório — ${esc(statusLabel)}</h1>
    <div class="sub">Gerado em ${esc(new Date().toLocaleString('pt-BR'))}</div>
    <div class="cards">
      <div class="card"><div class="lbl">Total de orçamentos</div><div class="val">${resumo.count}</div></div>
      <div class="card"><div class="lbl">Valor total</div><div class="val">${esc(brl(resumo.somaTotal))}</div></div>
      <div class="card"><div class="lbl">Ticket médio</div><div class="val">${esc(brl(resumo.ticketMedio))}</div></div>
    </div>
    ${resumo.porArea.length ? `<h2>Por área</h2><table><tr><th>Área</th><th>Qtd</th><th>Valor</th></tr>${resumo.porArea.map(a => `<tr><td>${esc(a.nome)}</td><td>${a.count}</td><td>${esc(brl(a.soma))}</td></tr>`).join('')}</table>` : ''}
    ${resumo.porTipo.length ? `<h2>Por tipo</h2><table><tr><th>Tipo</th><th>Qtd</th><th>Valor</th></tr>${resumo.porTipo.map(t => `<tr><td>${esc(t.nome)}</td><td>${t.count}</td><td>${esc(brl(t.soma))}</td></tr>`).join('')}</table>` : ''}
    <h2>Orçamentos (${rows.length})</h2>
    <table><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr>
    ${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
    </body></html>`
  w.document.write(html)
  w.document.close()
  return true
}
