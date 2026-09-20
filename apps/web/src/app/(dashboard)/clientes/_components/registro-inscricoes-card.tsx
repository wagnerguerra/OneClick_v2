'use client'

/**
 * Registro de Inscrições do cliente — N inscrições, estaduais e municipais.
 *
 * Morava dentro do `cliente-form.tsx`, na aba Fiscal. Passou para a aba
 * Legalização (pill própria) e ganhou arquivo próprio: o formulário já tem mais
 * de 3.000 linhas, e a sub-permissão que guarda estas mutações no backend
 * sempre se chamou `manage_registration` — "Gerenciar aba de registro /
 * legalização". O lugar novo é o que o nome já dizia.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Check, X, Pencil, Trash2, Plus, ChevronUp, ChevronDown, ChevronsUpDown, Search } from 'lucide-react'
import {
  Button, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  cn,
} from '@saas/ui'
import { UFS_BRASIL, INSCRICAO_TIPOS, INSCRICAO_TIPO_LABELS, type InscricaoTipo } from '@saas/types'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { toDateInputValue, fmtDateBR } from '@/lib/date'
import { useClientesPerms } from './use-clientes-perms'

interface Inscricao {
  id: string
  tipo: InscricaoTipo
  estado: string | null
  municipio: string | null
  inscricao: string
  dataRegistro: string | null
  observacoes: string | null
  createdAt: string
}

/** Campos pelos quais a tabela ordena. `lugar` cobre UF e município na mesma coluna. */
type Coluna = 'tipo' | 'lugar' | 'inscricao' | 'dataRegistro' | 'observacoes'
type Ordem = { campo: Coluna; dir: 'asc' | 'desc' }

/** Rascunho do formulário — o mesmo formato serve para incluir e para editar. */
interface Rascunho {
  tipo: InscricaoTipo
  estado: string
  municipio: string
  inscricao: string
  dataRegistro: string
  observacoes: string
}

const RASCUNHO_VAZIO: Rascunho = {
  tipo: 'ESTADUAL', estado: '', municipio: '', inscricao: '', dataRegistro: '', observacoes: '',
}

/** O que a coluna "UF / Município" mostra depende do tipo — fonte única. */
function lugarDe(r: Pick<Inscricao, 'tipo' | 'estado' | 'municipio'>): string {
  return (r.tipo === 'ESTADUAL' ? r.estado : r.municipio) || ''
}

export function RegistroInscricoesCard({ clienteId }: { clienteId: string }) {
  const { canWrite, canDelete } = useClientesPerms()
  const [rows, setRows] = useState<Inscricao[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>({ campo: 'tipo', dir: 'asc' })

  const [novo, setNovo] = useState<Rascunho>(RASCUNHO_VAZIO)
  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Rascunho>(RASCUNHO_VAZIO)

  // Sugestões de município. Uma lista só, compartilhada pelo formulário de
  // inclusão e pelo de edição: os dois consultam o mesmo cadastro, e manter
  // duas listas em memória só faria a tela buscar duas vezes a mesma coisa.
  const [municipios, setMunicipios] = useState<string[]>([])
  const [termoMunicipio, setTermoMunicipio] = useState('')
  const primeiroTermo = useRef(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await trpc.cliente.listInscricoes.query({ clienteId })
      setRows(data as unknown as Inscricao[])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [clienteId])
  useEffect(() => { void load() }, [load])

  // Busca das sugestões com 300ms de espera — cada tecla não vira uma consulta.
  useEffect(() => {
    if (primeiroTermo.current) { primeiroTermo.current = false }
    const t = setTimeout(() => {
      trpc.cliente.listMunicipios.query({ termo: termoMunicipio || undefined })
        .then(r => setMunicipios(r as unknown as string[]))
        .catch(() => { /* sugestão é conveniência: falhar aqui não atrapalha digitar */ })
    }, 300)
    return () => clearTimeout(t)
  }, [termoMunicipio])

  // ── Lista exibida: busca + ordenação, ambas na memória ──
  // São poucas linhas por cliente (uma mão delas), então filtrar e ordenar aqui
  // é imediato e evita ida ao servidor a cada clique de cabeçalho.
  const visiveis = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR')
    const filtradas = !t ? rows : rows.filter(r => {
      const alvo = [
        INSCRICAO_TIPO_LABELS[r.tipo],
        lugarDe(r),
        r.inscricao,
        r.observacoes ?? '',
        fmtDateBR(r.dataRegistro),
      ].join(' ').toLocaleLowerCase('pt-BR')
      return alvo.includes(t)
    })

    const fator = ordem.dir === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => {
      if (ordem.campo === 'dataRegistro') {
        // Sem data vai sempre para o fim, independentemente da direção: linha
        // vazia no topo não ajuda ninguém a encontrar nada.
        const ta = a.dataRegistro ? new Date(a.dataRegistro).getTime() : null
        const tb = b.dataRegistro ? new Date(b.dataRegistro).getTime() : null
        if (ta == null && tb == null) return 0
        if (ta == null) return 1
        if (tb == null) return -1
        return (ta - tb) * fator
      }
      const va = ordem.campo === 'lugar' ? lugarDe(a)
        : ordem.campo === 'tipo' ? INSCRICAO_TIPO_LABELS[a.tipo]
        : (a[ordem.campo] ?? '')
      const vb = ordem.campo === 'lugar' ? lugarDe(b)
        : ordem.campo === 'tipo' ? INSCRICAO_TIPO_LABELS[b.tipo]
        : (b[ordem.campo] ?? '')
      return String(va).localeCompare(String(vb), 'pt-BR') * fator
    })
  }, [rows, busca, ordem])

  function ordenarPor(campo: Coluna) {
    setOrdem(o => o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' })
  }

  function validar(r: Rascunho): string | null {
    if (!r.inscricao.trim()) return 'Informe o número da inscrição.'
    if (r.tipo === 'ESTADUAL' && !r.estado) return 'Escolha a UF da inscrição estadual.'
    if (r.tipo === 'MUNICIPAL' && !r.municipio.trim()) return 'Informe o município da inscrição municipal.'
    return null
  }

  /** Converte o rascunho no payload do backend (mesmos nomes do schema Zod). */
  function payload(r: Rascunho) {
    return {
      tipo: r.tipo,
      estado: r.tipo === 'ESTADUAL' ? r.estado : null,
      municipio: r.tipo === 'MUNICIPAL' ? r.municipio.trim() : null,
      inscricao: r.inscricao.trim(),
      dataRegistro: r.dataRegistro || null,
      observacoes: r.observacoes.trim() || null,
    }
  }

  async function handleAdd() {
    const erro = validar(novo)
    if (erro) { alerts.error('Confira o preenchimento', erro); return }
    setSaving(true)
    try {
      await trpc.cliente.addInscricao.mutate({ clienteId, ...payload(novo) })
      setNovo(RASCUNHO_VAZIO)
      await load()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível adicionar.')
    } finally { setSaving(false) }
  }

  function startEdit(r: Inscricao) {
    setEditId(r.id)
    setEdit({
      tipo: r.tipo,
      estado: r.estado ?? '',
      municipio: r.municipio ?? '',
      inscricao: r.inscricao,
      dataRegistro: r.dataRegistro ? toDateInputValue(r.dataRegistro) : '',
      observacoes: r.observacoes ?? '',
    })
  }
  function cancelEdit() { setEditId(null); setEdit(RASCUNHO_VAZIO) }

  async function saveEdit() {
    if (!editId) return
    const erro = validar(edit)
    if (erro) { alerts.error('Confira o preenchimento', erro); return }
    setSaving(true)
    try {
      await trpc.cliente.updateInscricao.mutate({ id: editId, ...payload(edit) })
      cancelEdit()
      await load()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  async function handleRemove(id: string) {
    const ok = await alerts.confirmDelete('esta inscrição')
    if (!ok) return
    try {
      await trpc.cliente.removeInscricao.mutate({ id })
      await load()
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível remover.')
    }
  }

  /**
   * Campos de lugar (UF ou município) — o mesmo par serve aos dois formulários.
   *
   * É uma FUNÇÃO que devolve JSX, chamada como `{camposLugar(...)}`, e não um
   * componente `<CamposLugar />`. Declarado aqui dentro, um componente é um
   * tipo novo a cada render: o React desmontaria e remontaria o input a cada
   * tecla, e o campo de município — justamente o que se digita com sugestão —
   * perderia o foco no primeiro caractere. Nenhum passo do gate pega isso.
   */
  function camposLugar(r: Rascunho, set: (p: Partial<Rascunho>) => void, tamanho: 'h-8' | 'h-9') {
    if (r.tipo === 'ESTADUAL') {
      return (
        <Select value={r.estado || '__none__'} onValueChange={v => set({ estado: v === '__none__' ? '' : v })}>
          <SelectTrigger className={cn(tamanho, 'w-24 text-sm')}><SelectValue placeholder="UF" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">UF</SelectItem>
            {UFS_BRASIL.map(uf => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
          </SelectContent>
        </Select>
      )
    }
    return (
      <Input
        value={r.municipio}
        onChange={e => { set({ municipio: e.target.value }); setTermoMunicipio(e.target.value) }}
        placeholder="Município"
        list="oc-municipios-sugestoes"
        className={cn(tamanho, 'min-w-[160px] text-sm')}
      />
    )
  }

  const colunas: Array<{ campo: Coluna; label: string; className?: string }> = [
    { campo: 'tipo', label: 'Tipo', className: 'w-28' },
    { campo: 'lugar', label: 'UF / Município', className: 'w-40' },
    { campo: 'inscricao', label: 'Inscrição' },
    { campo: 'dataRegistro', label: 'Data de registro', className: 'w-36' },
    { campo: 'observacoes', label: 'Observações' },
  ]

  return (
    <div>
      {/* Sugestões nativas do navegador: escolher uma preenche o campo sozinho,
          sem componente extra e sem roubar o que já foi digitado. */}
      <datalist id="oc-municipios-sugestoes">
        {municipios.map(m => <option key={m} value={m} />)}
      </datalist>

      {rows.length > 0 && (
        <div className="mb-3 relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar inscrição, UF, município, observações…"
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem registro</p>
      ) : visiveis.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma inscrição encontrada para “{busca}”.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {colunas.map(c => (
                  <th key={c.campo} className={cn('px-3 py-2 text-left', c.className)}>
                    <button
                      type="button"
                      onClick={() => ordenarPor(c.campo)}
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground transition-colors"
                      title={`Ordenar por ${c.label}`}
                    >
                      {c.label}
                      {ordem.campo === c.campo
                        ? (ordem.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
                        : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  </th>
                ))}
                {(canWrite || canDelete) && <th className="w-20 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {visiveis.map(r => editId === r.id ? (
                <tr key={r.id} className="border-b border-border/60 last:border-0 bg-muted/20">
                  <td className="px-3 py-1.5">
                    <Select value={edit.tipo} onValueChange={v => setEdit(s => ({ ...s, tipo: v as InscricaoTipo }))}>
                      <SelectTrigger className="h-8 w-28 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {INSCRICAO_TIPOS.map(t => <SelectItem key={t} value={t}>{INSCRICAO_TIPO_LABELS[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    {camposLugar(edit, p => setEdit(s => ({ ...s, ...p })), 'h-8')}
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={edit.inscricao} onChange={e => setEdit(s => ({ ...s, inscricao: e.target.value }))} className="h-8 text-sm" autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveEdit() } if (e.key === 'Escape') cancelEdit() }} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input type="date" value={edit.dataRegistro} onChange={e => setEdit(s => ({ ...s, dataRegistro: e.target.value }))} className="h-8 text-sm" />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input value={edit.observacoes} onChange={e => setEdit(s => ({ ...s, observacoes: e.target.value }))} placeholder="Opcional" className="h-8 text-sm"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveEdit() } if (e.key === 'Escape') cancelEdit() }} />
                  </td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => void saveEdit()} disabled={saving} className="mr-2 text-emerald-600 hover:text-emerald-700" title="Salvar"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground" title="Cancelar"><X className="h-4 w-4" /></button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">{INSCRICAO_TIPO_LABELS[r.tipo]}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{lugarDe(r) || '—'}</td>
                  <td className="px-3 py-2 text-foreground">{r.inscricao}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDateBR(r.dataRegistro) || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.observacoes || '—'}</td>
                  {(canWrite || canDelete) && (
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {canWrite && (
                        <button type="button" onClick={() => startEdit(r)} className="mr-2 text-muted-foreground hover:text-sky-600" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                      )}
                      {canDelete && (
                        <button type="button" onClick={() => handleRemove(r.id)} className="text-muted-foreground hover:text-rose-600" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Tipo</Label>
            <Select value={novo.tipo} onValueChange={v => setNovo(s => ({ ...s, tipo: v as InscricaoTipo }))}>
              <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INSCRICAO_TIPOS.map(t => <SelectItem key={t} value={t}>{INSCRICAO_TIPO_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">{novo.tipo === 'ESTADUAL' ? 'UF' : 'Município'}</Label>
            {camposLugar(novo, p => setNovo(s => ({ ...s, ...p })), 'h-9')}
          </div>
          <div className="flex-1 min-w-[150px] space-y-1">
            <Label className="text-[11px]">Inscrição</Label>
            <Input value={novo.inscricao} onChange={e => setNovo(s => ({ ...s, inscricao: e.target.value }))} placeholder="Número da inscrição" className="h-9 text-sm"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }} />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Data de registro</Label>
            <Input type="date" value={novo.dataRegistro} onChange={e => setNovo(s => ({ ...s, dataRegistro: e.target.value }))} className="h-9 w-40 text-sm" />
          </div>
          <div className="flex-1 min-w-[140px] space-y-1">
            <Label className="text-[11px]">Observações</Label>
            <Input value={novo.observacoes} onChange={e => setNovo(s => ({ ...s, observacoes: e.target.value }))} placeholder="Opcional" className="h-9 text-sm"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleAdd() } }} />
          </div>
          <Button type="button" size="sm" onClick={handleAdd} disabled={saving}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}
