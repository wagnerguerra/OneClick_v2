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


interface Opcao { id: string; nome: string }
interface Usuario { id: string; name: string }

/**
 * Cadastro do documento externo — que já nasce com a revisão 0. Não há
 * upload: o documento é de terceiro; registra-se de onde vem e onde mora.
 */
export default function NovoDocumentoExternoPage() {
  const router = useRouter()
  const [processos, setProcessos] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])

  const [nome, setNome] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [dataRegistro, setDataRegistro] = useState(new Date().toISOString().slice(0, 10))
  const [emissor, setEmissor] = useState('')
  const [local, setLocal] = useState('')
  const [link, setLink] = useState('')
  const [observacao, setObservacao] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    ;(trpc.documentoExterno as any).listarProcessos.query().then(setProcessos).catch(() => setProcessos([]))
    ;(trpc.documentoExterno as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function salvar() {
    if (nome.trim().length < 3) { alerts.error('Falta o nome', 'Dê um nome ao documento.'); return }
    setSalvando(true)
    try {
      const { id } = await (trpc.documentoExterno as any).criar.mutate({
        nome, processoId: processoId || null, dataRegistro,
        emissor: emissor || null,
        local: local || null,
        link: link || null,
        observacao: observacao.replace(/<[^>]*>/g, '').trim() ? observacao : null,
        responsavelId: responsavelId || null,
      })
      alerts.success('Cadastrado', 'Documento criado com a revisão 0.')
      router.push(`/documentos-externos/${id}`)
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
          <BackButton href="/documentos-externos" label="Voltar" />
      </>}>
        <h1 className="truncate">Novo Documento Externo</h1>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">Página inicial</Link>
          <span className="text-muted-foreground/50">›</span>
          <span>Qualidade</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Documentos Externos</span>
          <span className="text-muted-foreground/50">›</span>
          <span>Novo Documento Externo</span>
        </p>
      </PageHeaderBar>

      <Card className="p-5">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-[13px] font-semibold">Nome do documento <span className="text-rose-500">*</span></Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: ABNT NBR ISO 9001:2015" className="h-9 text-sm mt-1.5" />
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
            <Label className="text-[13px] font-semibold">Data do registro</Label>
            <Input type="date" value={dataRegistro} onChange={(e) => setDataRegistro(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-[13px] font-semibold">Emissor</Label>
            <Input value={emissor} onChange={(e) => setEmissor(e.target.value)}
              placeholder="Ex.: ABNT, Receita Federal, Prefeitura..." className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-[13px] font-semibold">Responsável</Label>
            <Select value={responsavelId || '__none__'} onValueChange={(v) => setResponsavelId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem responsável" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem responsável</SelectItem>
                {usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-[13px] font-semibold">Local</Label>
            <Input value={local} onChange={(e) => setLocal(e.target.value)}
              placeholder="Onde o documento mora (pasta de rede, arquivo físico...)" className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-[13px] font-semibold">Link</Label>
            <Input value={link} onChange={(e) => setLink(e.target.value)}
              placeholder="https://... (quando o emissor publica online)" className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Observações</Label>
            <div className="mt-1.5">
              <RichEditor value={observacao} onChange={setObservacao} placeholder="Notas sobre a aplicação do documento..." />
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
