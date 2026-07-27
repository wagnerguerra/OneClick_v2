'use client'

import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import {
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
  Button, Label, cn,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { ShieldCheck, Upload, FileLock, Eye, Lock, Loader2, CheckCircle2 } from 'lucide-react'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import { ClienteCombobox } from '@/app/(dashboard)/orcamentos/_components/cliente-combobox'
import { SenhaPfxInput } from './senha-pfx-input'

const MOD = 'var(--mod-legalizacao, #7c3aed)'

type ClienteOpt = { id: string; razaoSocial: string; documento?: string | null }

/**
 * Cadastro de certificado digital — unificado (#HLP0301).
 *
 * Usado pelo módulo Legalização > Certificados (mostra upload do PFX + seleção
 * de cliente) e pelo cadastro do cliente ao soltar um .pfx (arquivo e cliente
 * já pré-selecionados → esses campos não aparecem). `title`/`subtitle`/`note`
 * são por chamador.
 */
export function CertCadastroModal({
  open, onOpenChange, onCreated,
  title = 'Novo Certificado Digital',
  subtitle,
  note,
  presetFile = null,
  presetClienteId = null,
  clientes = [],
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
  title?: string
  subtitle?: ReactNode
  note?: ReactNode
  /** Arquivo pré-selecionado (ex.: drop no cadastro do cliente). Se dado, o campo de upload não é exibido. */
  presetFile?: File | null
  /** Cliente pré-selecionado. Se dado, a seleção de cliente não é exibida. */
  presetClienteId?: string | null
  /** Lista para o seletor de cliente quando não há `presetClienteId`. */
  clientes?: ClienteOpt[]
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [senha, setSenha] = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [showSenha, setShowSenha] = useState(false)

  const clienteEfetivo = presetClienteId ?? (clienteId || null)

  useEffect(() => {
    if (open) {
      // Pré-seleciona o arquivo quando vem do drop (cliente); no módulo começa
      // vazio. Em ambos o seletor aparece e o arquivo pode ser trocado.
      setArquivo(presetFile ?? null)
    } else {
      setArquivo(null); setSenha(''); setConfirmaSenha('')
      setClienteId(''); setObservacoes(''); setShowSenha(false)
    }
  }, [open, presetFile])

  async function handleSalvar() {
    if (!arquivo) { alerts.error('Erro', 'Selecione o arquivo PFX'); return }
    if (!senha) { alerts.error('Erro', 'Informe a senha do certificado'); return }
    if (senha !== confirmaSenha) { alerts.error('Erro', 'As senhas não conferem'); return }
    if (arquivo.size > 5 * 1024 * 1024) { alerts.error('Erro', 'Arquivo maior que 5MB'); return }

    setSalvando(true)
    try {
      const buffer = await arquivo.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!)
      const pfxBase64 = btoa(binary)

      await (trpc.certificadoDigital as any).create.mutate({
        pfxBase64,
        senha,
        clienteId: clienteEfetivo,
        observacoes: observacoes.trim() || null,
      })
      await alerts.success('Cadastrado', 'Certificado adicionado. Senha cifrada e arquivo armazenado com segurança.')
      onCreated()
    } catch (e) {
      alerts.error('Erro', (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeaderIcon icon={ShieldCheck} color="fuchsia">
          <DialogTitle>{title}</DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeaderIcon>
        <DialogBody className="space-y-4">
          {/* Upload — sempre visível. No cliente já vem pré-selecionado; pode ser trocado. */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Arquivo PFX *</Label>
              <label
                className={cn(
                  'flex items-center gap-3 px-4 py-3 border border-dashed rounded-md cursor-pointer transition-colors',
                  arquivo ? 'border-fuchsia-300 bg-fuchsia-50/50 dark:bg-fuchsia-900/10' : 'border-border hover:bg-muted/30',
                )}
              >
                {arquivo ? <FileLock className="h-5 w-5 text-fuchsia-600" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  {arquivo ? (
                    <>
                      <p className="text-sm font-medium truncate">{arquivo.name}</p>
                      <p className="text-[11px] text-muted-foreground">{Math.round(arquivo.size / 1024)} KB · clique para trocar</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">Selecione o arquivo .pfx ou .p12</p>
                      <p className="text-[11px] text-muted-foreground">Máx 5 MB · será armazenado de forma segura</p>
                    </>
                  )}
                </div>
              <input type="file" accept=".pfx,.p12" onChange={e => setArquivo(e.target.files?.[0] ?? null)} className="hidden" />
            </label>
          </div>

          {/* Senha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Senha *</Label>
              <div className="relative">
                <SenhaPfxInput show={showSenha} value={senha} onChange={e => setSenha(e.target.value)} placeholder="Senha do PFX" className="h-9 text-sm pr-9" />
                <button type="button" onClick={() => setShowSenha(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <Eye className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Confirmar senha *</Label>
              <SenhaPfxInput show={showSenha} value={confirmaSenha} onChange={e => setConfirmaSenha(e.target.value)} placeholder="Repita a senha" className="h-9 text-sm" />
            </div>
          </div>

          {/* Cliente — oculto quando já vem pré-selecionado */}
          {!presetClienteId && (
            <div className="space-y-1.5">
              <Label className="text-[13px] font-semibold">Cliente vinculado</Label>
              <ClienteCombobox
                clientes={clientes}
                value={clienteId}
                onSelect={setClienteId}
                placeholder="Buscar cliente mensal por razão social ou CNPJ..."
              />
              <p className="text-[10px] text-muted-foreground">
                Apenas clientes com situação <strong>Mensal</strong> são listados. Você poderá vincular sócio/empresa nos detalhes depois.
              </p>
            </div>
          )}

          {/* Observações */}
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold">Observações</Label>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Notas sobre este certificado..."
              className="w-full text-sm rounded-md border border-input bg-background px-3 py-2"
            />
          </div>

          {/* Nota (por chamador) — ou o aviso de segurança padrão */}
          {note ?? (
            <div className="flex items-start gap-2 p-3 rounded-md bg-fuchsia-50/50 dark:bg-fuchsia-900/10 border border-fuchsia-200 dark:border-fuchsia-800">
              <Lock className="h-4 w-4 text-fuchsia-600 mt-0.5 shrink-0" />
              <p className="text-[11px] text-fuchsia-900 dark:text-fuchsia-300 leading-relaxed">
                A senha será cifrada com AES-256-GCM antes de gravar no banco. O arquivo PFX é armazenado com permissões restritas e SHA-256 para verificação de integridade. Toda operação é registrada na trilha de auditoria.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button
            onClick={handleSalvar}
            disabled={salvando || !arquivo || !senha || senha !== confirmaSenha}
            style={{ backgroundColor: MOD }}
            className="text-white gap-1.5"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {salvando ? 'Cadastrando...' : 'Cadastrar certificado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
