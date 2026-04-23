'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Loader2, Save, Building2, MapPin, Upload } from 'lucide-react'
import { Button, Input, Card, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

interface Filial { id: string; cnpj: string; codigoFilial: string; endereco: string; contaLiquido: number; contaLiquidoAlt: number | null; ativo: boolean; setores: Array<{ id: string; nome: string; tipoContabil: string }> }
interface EventoConta { id: string; codigoEvento: number; descricao: string; tipo: string; contaCustoDebito: number | null; contaCustoCredito: number | null; contaDespesaDebito: number | null; contaDespesaCredito: number | null; geraLancamento: boolean }

export function FolhaConfigTab({ clienteId }: { clienteId: string }) {
  const [tab, setTab] = useState<'filiais' | 'eventos'>('filiais')
  const [filiais, setFiliais] = useState<Filial[]>([])
  const [eventos, setEventos] = useState<EventoConta[]>([])
  const [loading, setLoading] = useState(true)
  const [importingXlsm, setImportingXlsm] = useState(false)
  const xlsmRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [clienteId])

  async function loadData() {
    setLoading(true)
    try {
      const [f, e] = await Promise.all([
        trpc.folha.listarFiliais.query({ clienteId }),
        trpc.folha.listarEventoContas.query({ clienteId }),
      ])
      setFiliais(f as Filial[])
      setEventos(e as EventoConta[])
    } catch {} finally { setLoading(false) }
  }

  async function handleImportXlsm(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportingXlsm(true)
    try {
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
      const base64 = btoa(binary)
      const result = await (trpc.folha as any).importarXlsm.mutate({ clienteId, base64 })
      alerts.success('Planilha importada!', `${result.filiaisCriadas} filial(is), ${result.setoresCriados} setor(es), ${result.eventosSalvos} evento(s) importados.`)
      loadData()
    } catch (err) { alerts.error('Erro', (err as Error).message) }
    finally { setImportingXlsm(false); e.target.value = '' }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      {/* Header com importar XLSM */}
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <input ref={xlsmRef} type="file" accept=".xlsm,.xlsx,.xls" className="hidden" onChange={handleImportXlsm} />
          <Button size="sm" variant="outline" onClick={() => xlsmRef.current?.click()} disabled={importingXlsm} className="gap-1.5 text-xs">
            {importingXlsm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Importar Planilha (.xlsm)
          </Button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b pb-2">
        <button onClick={() => setTab('filiais')} className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition', tab === 'filiais' ? 'bg-violet-100 text-violet-700' : 'text-muted-foreground hover:bg-muted')}>
          <Building2 className="h-3.5 w-3.5 inline mr-1.5" />Filiais e Setores
        </button>
        <button onClick={() => setTab('eventos')} className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition', tab === 'eventos' ? 'bg-violet-100 text-violet-700' : 'text-muted-foreground hover:bg-muted')}>
          <MapPin className="h-3.5 w-3.5 inline mr-1.5" />Tabela De-Para (Eventos)
        </button>
      </div>

      {tab === 'filiais' && <FiliaisSection clienteId={clienteId} filiais={filiais} onReload={loadData} />}
      {tab === 'eventos' && <EventosSection clienteId={clienteId} eventos={eventos} onReload={loadData} />}
    </div>
  )
}

/* ── Filiais ── */
function FiliaisSection({ clienteId, filiais, onReload }: { clienteId: string; filiais: Filial[]; onReload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ cnpj: '', codigoFilial: '', endereco: '', contaLiquido: 1287 })
  const [novoSetor, setNovoSetor] = useState<{ filialId: string; nome: string; tipo: string } | null>(null)

  async function handleAddFilial() {
    if (!form.cnpj || !form.codigoFilial) { alerts.error('Erro', 'CNPJ e código são obrigatórios'); return }
    try {
      await trpc.folha.criarFilial.mutate({ clienteId, ...form })
      setAdding(false); setForm({ cnpj: '', codigoFilial: '', endereco: '', contaLiquido: 1287 })
      onReload()
      alerts.success('Filial criada', 'Filial adicionada com sucesso')
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteFilial(id: string) {
    const ok = await alerts.confirmDelete('esta filial')
    if (!ok) return
    try { await trpc.folha.excluirFilial.mutate({ id }); onReload() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleAddSetor() {
    if (!novoSetor?.nome) return
    try {
      await trpc.folha.criarSetor.mutate({ filialId: novoSetor.filialId, nome: novoSetor.nome, tipoContabil: novoSetor.tipo })
      setNovoSetor(null); onReload()
    } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  async function handleDeleteSetor(id: string) {
    try { await trpc.folha.excluirSetor.mutate({ id }); onReload() } catch (e) { alerts.error('Erro', (e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{filiais.length} filial(is) cadastrada(s)</p>
        <Button size="sm" variant="outline" onClick={() => setAdding(!adding)} className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Nova Filial</Button>
      </div>

      {adding && (
        <Card className="p-4 space-y-3 border-violet-200 bg-violet-50/30">
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1"><label className="text-[10px] font-semibold uppercase text-muted-foreground">CNPJ</label><Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" className="h-8 text-xs" /></div>
            <div className="space-y-1"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Código</label><Input value={form.codigoFilial} onChange={e => setForm({ ...form, codigoFilial: e.target.value })} placeholder="MTZ" className="h-8 text-xs" /></div>
            <div className="space-y-1"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Endereço</label><Input value={form.endereco} onChange={e => setForm({ ...form, endereco: e.target.value })} placeholder="Opcional" className="h-8 text-xs" /></div>
            <div className="space-y-1"><label className="text-[10px] font-semibold uppercase text-muted-foreground">Conta Líquido</label><Input type="number" value={form.contaLiquido} onChange={e => setForm({ ...form, contaLiquido: Number(e.target.value) })} className="h-8 text-xs" /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddFilial} className="gap-1 text-xs" style={{ backgroundColor: '#8b5cf6' }}><Save className="h-3.5 w-3.5 text-white" /><span className="text-white">Salvar</span></Button>
            <Button size="sm" variant="outline" onClick={() => setAdding(false)} className="text-xs">Cancelar</Button>
          </div>
        </Card>
      )}

      {filiais.map(f => (
        <Card key={f.id} className="p-4 border border-border/50">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">{f.codigoFilial} <span className="font-mono text-muted-foreground text-xs ml-2">{f.cnpj}</span></p>
              <p className="text-xs text-muted-foreground">{f.endereco || '—'}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Conta Líquido: {f.contaLiquido}{f.contaLiquidoAlt ? ` (alt: ${f.contaLiquidoAlt})` : ''}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => handleDeleteFilial(f.id)} className="text-red-500 hover:text-red-700 h-7 w-7 p-0"><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
          {/* Setores */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Setores</p>
            {f.setores.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded border px-3 py-1.5 text-xs">
                <span>{s.nome} <span className={cn('ml-2 rounded px-1.5 py-0.5 text-[9px] font-bold', s.tipoContabil === 'CUSTO' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>{s.tipoContabil}</span></span>
                <button onClick={() => handleDeleteSetor(s.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
            {novoSetor?.filialId === f.id ? (
              <div className="flex gap-2 mt-1">
                <Input value={novoSetor.nome} onChange={e => setNovoSetor({ ...novoSetor, nome: e.target.value })} placeholder="Nome do setor" className="h-7 text-xs flex-1" />
                <select value={novoSetor.tipo} onChange={e => setNovoSetor({ ...novoSetor, tipo: e.target.value })} className="h-7 rounded border px-2 text-xs">
                  <option value="DESPESA">DESPESA</option>
                  <option value="CUSTO">CUSTO</option>
                </select>
                <Button size="sm" onClick={handleAddSetor} className="h-7 text-[10px] px-2">OK</Button>
                <Button size="sm" variant="ghost" onClick={() => setNovoSetor(null)} className="h-7 text-[10px] px-2">X</Button>
              </div>
            ) : (
              <button onClick={() => setNovoSetor({ filialId: f.id, nome: '', tipo: 'DESPESA' })} className="text-[10px] text-violet-600 hover:underline mt-1">+ Adicionar setor</button>
            )}
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ── Eventos (tabela de-para) ── */
function EventosSection({ clienteId, eventos, onReload }: { clienteId: string; eventos: EventoConta[]; onReload: () => void }) {
  const [search, setSearch] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'TODOS' | 'PROVENTO' | 'DESCONTO'>('TODOS')

  const filtered = eventos.filter(e => {
    if (tipoFiltro !== 'TODOS' && e.tipo !== tipoFiltro) return false
    if (search) {
      const q = search.toLowerCase()
      return String(e.codigoEvento).includes(q) || e.descricao.toLowerCase().includes(q)
    }
    return true
  })

  async function handleToggleGera(id: string, current: boolean) {
    const evt = eventos.find(e => e.id === id)
    if (!evt) return
    try {
      await trpc.folha.salvarEventoConta.mutate({
        clienteId, codigoEvento: evt.codigoEvento, tipo: evt.tipo, descricao: evt.descricao,
        contaCustoDebito: evt.contaCustoDebito, contaCustoCredito: evt.contaCustoCredito,
        contaDespesaDebito: evt.contaDespesaDebito, contaDespesaCredito: evt.contaDespesaCredito,
        geraLancamento: !current,
      })
      onReload()
    } catch {}
  }

  async function handleDelete(id: string) {
    try { await trpc.folha.excluirEventoConta.mutate({ id }); onReload() } catch {}
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Input placeholder="Buscar código ou descrição..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs max-w-xs" />
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as any)} className="h-8 rounded border px-2 text-xs">
          <option value="TODOS">Todos</option>
          <option value="PROVENTO">Proventos</option>
          <option value="DESCONTO">Descontos</option>
        </select>
        <span className="text-[11px] text-muted-foreground">{filtered.length} evento(s)</span>
      </div>

      <div className="overflow-x-auto rounded border" style={{ maxHeight: '50vh' }}>
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/50">
            <tr className="border-b">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground w-[70px]">Código</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Descrição</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[70px]">Tipo</th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[80px]">Custo Déb</th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[80px]">Custo Créd</th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[80px]">Desp Déb</th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[80px]">Desp Créd</th>
              <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground w-[50px]">Gera</th>
              <th className="px-2 py-2 w-[40px]" />
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className="border-b hover:bg-muted/10">
                <td className="px-3 py-1.5 font-mono font-semibold">{e.codigoEvento}</td>
                <td className="px-3 py-1.5">{e.descricao}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', e.tipo === 'PROVENTO' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>{e.tipo === 'PROVENTO' ? 'PROV' : 'DESC'}</span>
                </td>
                <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{e.contaCustoDebito ?? '—'}</td>
                <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{e.contaCustoCredito ?? '—'}</td>
                <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{e.contaDespesaDebito ?? '—'}</td>
                <td className="px-2 py-1.5 text-center font-mono text-muted-foreground">{e.contaDespesaCredito ?? '—'}</td>
                <td className="px-2 py-1.5 text-center">
                  <input type="checkbox" checked={e.geraLancamento} onChange={() => handleToggleGera(e.id, e.geraLancamento)} className="h-3.5 w-3.5 accent-sky-500" />
                </td>
                <td className="px-2 py-1.5">
                  <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nenhum evento cadastrado. Importe um TXT para popular automaticamente.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
