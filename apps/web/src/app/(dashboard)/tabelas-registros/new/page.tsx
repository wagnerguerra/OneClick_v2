'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import {
  Button, Input, Label, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import Link from 'next/link'
import { PageHeaderBar } from '@/components/page-header-bar'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { CAMPOS_CONTROLE, type CampoControle } from '../campos'


interface Opcao { id: string; nome: string }

/**
 * Cadastro do registro — que já nasce com a versão 0 e o seu controle.
 * Registro sem os campos de controle é uma linha vazia numa tabela de ISO,
 * então tudo é pedido de uma vez.
 */
export default function NovaTabelaRegistroPage() {
  const router = useRouter()
  const [processos, setProcessos] = useState<Opcao[]>([])

  const [nome, setNome] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [dataVersao, setDataVersao] = useState(new Date().toISOString().slice(0, 10))
  const [campos, setCampos] = useState<Record<CampoControle, string>>({
    armazenamento: '', protecao: '', recuperacao: '', retencao: '', disposicao: '',
  })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(trpc.tabelaRegistro as any).listarProcessos.query().then(setProcessos).catch(() => setProcessos([]))
  }, [])

  async function salvar() {
    if (nome.trim().length < 3) { alerts.error('Falta o nome', 'Dê um nome ao registro.'); return }
    setSalvando(true)
    try {
      const { id } = await (trpc.tabelaRegistro as any).criar.mutate({
        nome, processoId: processoId || null, dataVersao,
        armazenamento: campos.armazenamento || null,
        protecao: campos.protecao || null,
        recuperacao: campos.recuperacao || null,
        retencao: campos.retencao || null,
        disposicao: campos.disposicao || null,
      })
      alerts.success('Cadastrado', 'Registro criado com a versão 0.')
      router.push(`/tabelas-registros/${id}`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Topo — PADRAO_PAGINAS §1.1 */}
      <PageHeaderBar actions={<>
          <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
          </Button>
          <BackButton href="/tabelas-registros" label="Voltar" />
      </>}>
        <h1 className="truncate">Novo Registro</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Tabelas de Registros</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Novo Registro</span>
        </p>
      </PageHeaderBar>

      <Card className="p-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-[13px] font-semibold">Nome do registro</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Lista de presença de treinamento" className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12 sm:col-span-3">
            <Label className="text-[13px] font-semibold">Processo</Label>
            <Select value={processoId || '__none__'} onValueChange={(v) => setProcessoId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem processo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem processo</SelectItem>
                {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">O mesmo mapa de processos dos Documentos Internos.</p>
          </div>
          <div className="col-span-12 sm:col-span-3">
            <Label className="text-[13px] font-semibold">Data da versão</Label>
            <Input type="date" value={dataVersao} onChange={(e) => setDataVersao(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>

          {CAMPOS_CONTROLE.map((c) => (
            <div key={c.key} className="col-span-12">
              <Label className="text-[13px] font-semibold">{c.label}</Label>
              <p className="text-[11px] text-muted-foreground">{c.hint}</p>
              <div className="mt-1.5">
                <RichEditor value={campos[c.key]} onChange={(v) => setCampos((prev) => ({ ...prev, [c.key]: v }))}
                  placeholder={`${c.hint}...`} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
