'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Upload, Loader2, Save } from 'lucide-react'
import {
  Button, Input, Label, Card,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
  RichEditor,
} from '@saas/ui'
import { BackButton } from '@/components/ui/back-button'
import { UserMultiPicker } from '@/components/user-multi-picker'
import { trpc } from '@/lib/trpc'
import { getApiUrl } from '@/lib/api-url'
import { alerts } from '@/lib/alerts'

const MODULE_COLOR = 'var(--mod-qualidade, #fbbf24)'

interface Opcao { id: string; nome: string }
interface Usuario { id: string; name: string; email: string | null; image: string | null }

/**
 * Cadastro do documento — que já nasce com a revisão 0 e o seu arquivo.
 * Documento sem arquivo não serve para nada num módulo de ISO, então os dois
 * são pedidos de uma vez em vez de deixar um registro vazio no meio do caminho.
 */
export default function NovoDocumentoInternoPage() {
  const router = useRouter()
  const [tipos, setTipos] = useState<Opcao[]>([])
  const [processos, setProcessos] = useState<Opcao[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [elaboradores, setElaboradores] = useState<string[]>([])

  const [nome, setNome] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [processoId, setProcessoId] = useState('')
  const [dataVersao, setDataVersao] = useState(new Date().toISOString().slice(0, 10))
  const [alteracao, setAlteracao] = useState('')
  const [justificativa, setJustificativa] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ;(trpc.documentoInterno as any).listarTipos.query({}).then(setTipos).catch(() => setTipos([]))
    ;(trpc.documentoInterno as any).listarProcessos.query({}).then(setProcessos).catch(() => setProcessos([]))
    ;(trpc.documentoInterno as any).listarUsuarios.query().then(setUsuarios).catch(() => setUsuarios([]))
  }, [])

  async function salvar() {
    if (nome.trim().length < 3) { alerts.error('Falta o nome', 'Dê um nome ao documento.'); return }
    if (!arquivo) { alerts.error('Falta o arquivo', 'Envie o arquivo da primeira revisão.'); return }
    setSalvando(true)
    try {
      const fd = new FormData()
      fd.append('file', arquivo, arquivo.name)
      const res = await fetch(`${getApiUrl()}/api/upload`, { method: 'POST', credentials: 'include', body: fd })
      if (!res.ok) throw new Error(`Upload falhou (HTTP ${res.status})`)
      const { url } = await res.json() as { url: string }

      const doc = await (trpc.documentoInterno as any).criar.mutate({
        nome: nome.trim(),
        tipoId: tipoId || null,
        processoId: processoId || null,
        dataVersao,
        arquivoPath: url,
        arquivoNome: arquivo.name,
        mime: arquivo.type || undefined,
        bytes: arquivo.size,
        alteracao: alteracao || undefined,
        justificativa: justificativa || undefined,
        elaboradores: elaboradores.map((id) => ({ usuarioId: id })),
      }) as { id: string }

      alerts.success('Documento cadastrado', 'A revisão 0 foi criada.')
      router.push(`/documentos-internos/${doc.id}`)
    } catch (e) { alerts.error('Erro', (e as Error).message) }
    finally { setSalvando(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] text-white shadow-md"
            style={{ background: `linear-gradient(135deg, ${MODULE_COLOR}, color-mix(in srgb, ${MODULE_COLOR} 87%, transparent))` }}>
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <h1>Novo Documento</h1>
            <p className="text-sm text-muted-foreground">O documento nasce com a revisão 0 e o seu arquivo</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="success" size="sm" onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar
          </Button>
          <BackButton href="/documentos-internos" label="Voltar" />
        </div>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <Label className="text-[13px] font-semibold">Nome do documento</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 text-sm mt-1.5" placeholder="Ex.: Gestão de Pessoas" />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Tipo</Label>
            <Select value={tipoId || '__none__'} onValueChange={(v) => setTipoId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem tipo</SelectItem>
                {tipos.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Processo</Label>
            <Select value={processoId || '__none__'} onValueChange={(v) => setProcessoId(v === '__none__' ? '' : v)}>
              <SelectTrigger className="h-9 text-sm mt-1.5"><SelectValue placeholder="Sem processo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Sem processo</SelectItem>
                {processos.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-[13px] font-semibold">Data da versão</Label>
            <Input type="date" value={dataVersao} onChange={(e) => setDataVersao(e.target.value)} className="h-9 text-sm mt-1.5" />
          </div>
          <div className="col-span-12 md:col-span-9">
            <Label className="text-[13px] font-semibold">Arquivo da revisão 0</Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />Escolher
              </Button>
              <span className="text-xs text-muted-foreground truncate">{arquivo?.name ?? 'Nenhum arquivo escolhido'}</span>
              <input ref={fileRef} type="file" className="hidden"
                onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); e.target.value = '' }} />
            </div>
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Elaboradores</Label>
            <div className="mt-1.5">
              <UserMultiPicker users={usuarios} value={elaboradores} onChange={setElaboradores}
                placeholder="Quem elaborou o documento" accentClass="bg-amber-500 border-amber-500" />
            </div>
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">O que mudou</Label>
            <div className="mt-1.5"><RichEditor value={alteracao} onChange={setAlteracao} placeholder="Na primeira versão, costuma ser a criação do documento..." /></div>
          </div>
          <div className="col-span-12">
            <Label className="text-[13px] font-semibold">Justificativa</Label>
            <div className="mt-1.5"><RichEditor value={justificativa} onChange={setJustificativa} placeholder="Por que o documento existe..." /></div>
          </div>
        </div>
      </Card>
    </div>
  )
}
