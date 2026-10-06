'use client'

import { useCallback, useState } from 'react'
import { Flame, Store, Shield, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { MUNICIPIOS, StatusBadge, SituacaoBadge, formatDate, STATUS_COR } from '../_lib/ui'
import { carregarClientesMensais } from '../_lib/api'
import { normalizarLote, type ClienteOpcao } from './dialogs'
import { AbaCertidao, type LinhaCertidao } from './aba-certidao'

type Tipo = 'bombeiros' | 'funcionamento'

interface LinhaBombeiros extends LinhaCertidao {
  alvaraId: number; nomeFantasia: string | null; endereco: string | null; status: string
  codigoValidacao: string | null; dataFimValidade: string | null
}
interface LinhaFuncionamento extends LinhaCertidao { municipio: string }

function SeletorTipo({ tipo, setTipo }: { tipo: Tipo; setTipo: (t: Tipo) => void }) {
  return (
    <Select value={tipo} onValueChange={v => setTipo(v as Tipo)}>
      <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="bombeiros">Corpo de Bombeiros</SelectItem>
        <SelectItem value="funcionamento">Funcionamento</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** Alvarás: Corpo de Bombeiros (SIAT/CBMES) e de Funcionamento (prefeituras). */
export function AbaAlvara({ refreshKey }: { refreshKey: number }) {
  const [tipo, setTipo] = useState<Tipo>('bombeiros')
  return tipo === 'bombeiros'
    ? <AlvaraBombeiros refreshKey={refreshKey} seletor={<SeletorTipo tipo={tipo} setTipo={setTipo} />} />
    : <AlvaraFuncionamento refreshKey={refreshKey} seletor={<SeletorTipo tipo={tipo} setTipo={setTipo} />} />
}

function AlvaraBombeiros({ refreshKey, seletor }: { refreshKey: number; seletor: React.ReactNode }) {
  // O SIAT não tem coluna "sucesso": alvará Regular é o equivalente.
  const listar = useCallback(async (p: { page: number; limit: number; search?: string }) => {
    const r = await trpc.cnd.alvara.list.query({ page: p.page, limit: p.limit, search: p.search }) as { data: Array<Omit<LinhaBombeiros, 'sucesso' | 'mensagem'>>; total: number }
    return { total: r.total, data: r.data.map(a => ({ ...a, documento: a.documento ?? '', sucesso: a.status === 'Regular', mensagem: null })) }
  }, [])
  const totais = useCallback(() => trpc.cnd.alvara.totalizadores.query() as Promise<Record<string, number>>, [])

  return (
    <AbaCertidao<LinhaBombeiros>
      nome="Alvará Bombeiros" icon={Flame} refreshKey={refreshKey} vazio="Nenhum alvará consultado"
      listar={listar} totais={totais} filtros={seletor}
      indicadoresFiltram={false}
      indicadores={t => [
        { key: '', label: 'Total', count: t.total ?? 0, cor: STATUS_COR.primaria, icon: Shield },
        { key: 'regulares', label: 'Regulares', count: t.regulares ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'irregulares', label: 'Irregulares', count: t.irregulares ?? 0, cor: STATUS_COR.amber, icon: AlertTriangle },
      ]}
      situacao={r => r.status === 'Regular'
        ? <StatusBadge tone="emerald" icon={CheckCircle2}>Regular</StatusBadge>
        : <StatusBadge tone="amber" icon={AlertTriangle}>{r.status || 'Não encontrado'}</StatusBadge>}
      colunas={[
        { header: 'Endereço', className: 'hidden xl:table-cell max-w-[240px] truncate text-muted-foreground', cell: r => <span title={r.endereco || ''}>{r.endereco || '—'}</span> },
        { header: 'Código', className: 'hidden lg:table-cell font-mono text-muted-foreground whitespace-nowrap', cell: r => r.codigoValidacao || '—' },
        { header: 'Validade', className: 'hidden md:table-cell whitespace-nowrap text-muted-foreground', cell: r => r.dataFimValidade ? formatDate(r.dataFimValidade.slice(0, 10)) : '—' },
      ]}
      carregarClientes={carregarClientesMensais}
      consultaModo="razaoSocial"
      consultar={async ({ razaoSocial, clienteId }) => trpc.cnd.alvara.consultar.mutate({ razaoSocial, clienteId }) as Promise<{ sucesso: boolean; mensagem: string }>}
      lote={{
        descricao: 'Consultar o alvará dos Bombeiros de todos os clientes mensais, pela razão social?',
        iniciar: async () => {
          const lista = await carregarClientesMensais()
          await trpc.cnd.alvara.consultarLote.mutate({ clientes: lista.map(c => ({ razaoSocial: c.razaoSocial, clienteId: c.id })) })
        },
        progresso: async () => normalizarLote(await trpc.cnd.alvara.loteProgress.query() as Record<string, unknown>),
        rotulos: { ok: 'Encontrados', nok: 'Não encontrados' },
      }}
      podeVerPdf={r => r.status === 'Regular'}
      pdf={{
        titulo: 'Alvará de Licença — Corpo de Bombeiros',
        obter: async r => (await trpc.cnd.alvara.getPdf.query({ alvaraId: r.alvaraId }) as { pdfBase64: string | null }).pdfBase64,
        arquivo: r => `alvara-bombeiros-${r.alvaraId}.pdf`,
      }}
      excluir={id => trpc.cnd.alvara.delete.mutate({ id })}
      excluirLote={ids => trpc.cnd.alvara.deleteLote.mutate({ ids })}
    />
  )
}

function AlvaraFuncionamento({ refreshKey, seletor }: { refreshKey: number; seletor: React.ReactNode }) {
  // Vitória não tem rotina própria (apontava para o portal de Vila Velha) e o backend a recusa.
  const opcoes = MUNICIPIOS.filter(m => m.value !== 'VITÓRIA')
  const [municipio, setMunicipio] = useState<string>('SERRA')
  const nomeMun = opcoes.find(m => m.value === municipio)?.label ?? municipio

  const listar = useCallback((p: { page: number; limit: number; search?: string }) =>
    trpc.cnd.alvaraFunc.list.query({ page: p.page, limit: p.limit, search: p.search, municipio }) as Promise<{ data: LinhaFuncionamento[]; total: number }>, [municipio])
  const totais = useCallback(() => trpc.cnd.alvaraFunc.totalizadores.query({ municipio }) as Promise<Record<string, number>>, [municipio])
  const carregarClientes = useCallback(() => trpc.cnd.municipal.clientesMunicipio.query({ municipio }) as Promise<ClienteOpcao[]>, [municipio])

  return (
    <AbaCertidao<LinhaFuncionamento>
      key={municipio}
      nome={`Alvará de Funcionamento — ${nomeMun}`} icon={Store} refreshKey={refreshKey}
      vazio={`Nenhum alvará de funcionamento consultado em ${nomeMun}`}
      listar={listar} totais={totais}
      filtros={<>
        {seletor}
        <Select value={municipio} onValueChange={setMunicipio}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{opcoes.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
        </Select>
      </>}
      indicadoresFiltram={false}
      indicadores={t => [
        { key: '', label: 'Total', count: t.total ?? 0, cor: STATUS_COR.primaria, icon: Shield },
        { key: 'emitidos', label: 'Emitidos', count: t.emitidos ?? 0, cor: STATUS_COR.emerald, icon: CheckCircle2 },
        { key: 'nao_emitidos', label: 'Não emitidos', count: t.naoEmitidos ?? 0, cor: STATUS_COR.red, icon: XCircle },
      ]}
      situacao={r => <SituacaoBadge sucesso={r.sucesso} tipo={r.sucesso ? 'Emitido' : null} falha="Não emitido" title={r.mensagem || undefined} />}
      colunas={[
        { header: 'Mensagem', className: 'hidden lg:table-cell max-w-[280px] truncate text-muted-foreground', cell: r => <span title={r.mensagem || ''}>{r.mensagem || '—'}</span> },
      ]}
      carregarClientes={carregarClientes}
      consultar={async ({ documento, clienteId }) => trpc.cnd.alvaraFunc.consultar.mutate({ documento, municipio, clienteId }) as Promise<{ sucesso: boolean; mensagem: string }>}
      pollEtapa={async () => (await trpc.cnd.alvaraFunc.consultaEtapa.query() as { etapa: string }).etapa}
      lote={{
        descricao: `Consultar o alvará de funcionamento dos clientes mensais de ${nomeMun}?`,
        iniciar: async () => { await trpc.cnd.alvaraFunc.consultarLote.mutate({ municipio }) },
        progresso: async () => normalizarLote(await trpc.cnd.alvaraFunc.loteProgress.query() as Record<string, unknown>),
        rotulos: { ok: 'Emitidos', nok: 'Não emitidos' },
      }}
      podeVerPdf={r => r.sucesso}
      pdf={{
        titulo: `Alvará de Funcionamento — ${nomeMun}`,
        obter: async r => (await trpc.cnd.alvaraFunc.getPdf.query({ id: r.id }) as { pdfBase64: string | null }).pdfBase64,
        arquivo: r => `alvara-funcionamento-${r.documento}.pdf`,
      }}
      excluir={id => trpc.cnd.alvaraFunc.delete.mutate({ id })}
      excluirLote={ids => trpc.cnd.alvaraFunc.deleteLote.mutate({ ids })}
    />
  )
}
