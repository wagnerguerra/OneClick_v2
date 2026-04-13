'use client'

import { useState, useEffect } from 'react'
import {
  Shield, Upload, Trash2, Save, Loader2, CheckCircle2, XCircle,
  AlertTriangle, Key, Eye, EyeOff, X, FileText, HelpCircle,
} from 'lucide-react'
import { Button, Input, Label, Card, CardHeader, cn } from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import Swal from 'sweetalert2'

interface CertInfo {
  exists: boolean
  fileName: string | null
  fileSize: number | null
  uploadedAt: string | null
  validFrom: string | null
  validTo: string | null
  subject: string | null
  issuer: string | null
  serialNumber: string | null
  daysRemaining: number | null
  expired: boolean
  senha: boolean
  consumerKey: boolean
  consumerSecret: boolean
  cnpjContratante: string | null
}

const MODULE_COLOR = '#f97316'

const TABS = [
  { key: 'certificado', label: 'Certificado PFX', icon: Shield },
  { key: 'serpro', label: 'Credenciais SERPRO', icon: Key },
]

export default function CertificadoSettingsPage() {
  const [activeTab, setActiveTab] = useState('certificado')
  const [loading, setLoading] = useState(true)
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Campos SERPRO
  const [values, setValues] = useState<Record<string, string>>({
    CONSUMER_KEY: '',
    CONSUMER_SECRET: '',
    CERTIFICADO_SENHA: '',
    CNPJ_CONTRATANTE: '',
  })
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({})

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [info, configs] = await Promise.all([
        trpc.admin.getCertificadoInfo.query() as Promise<CertInfo>,
        trpc.admin.getConfigs.query() as Promise<Array<{ key: string; value: string }>>,
      ])
      setCertInfo(info)

      const v = { ...values }
      for (const c of configs) {
        if (c.key in v) v[c.key] = c.value
      }
      setValues(v)
    } catch { /* silencioso */ }
    finally { setLoading(false) }
  }

  async function handleUpload() {
    // 1. Selecionar arquivo
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pfx,.p12'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      // 2. Pedir a senha do certificado
      const { value: senha, isConfirmed } = await Swal.fire({
        title: 'Senha do Certificado',
        text: `Informe a senha do arquivo "${file.name}" para validar e salvar.`,
        input: 'password',
        inputPlaceholder: 'Senha do PFX/P12',
        showCancelButton: true,
        confirmButtonText: 'Enviar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#10b981',
        inputValidator: (value) => {
          if (!value) return 'A senha é obrigatória para abrir o certificado.'
          return null
        },
      })

      if (!isConfirmed || !senha) return

      // 3. Upload do arquivo + senha
      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('senha', senha)
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/upload/certificado`, {
          method: 'POST', body: formData, credentials: 'include',
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { message?: string }).message || 'Falha no upload')
        }
        // 4. Salvar a senha nas configurações
        await trpc.admin.saveConfigs.mutate({ group: 'SERPRO', items: { CERTIFICADO_SENHA: senha } })
        setValues(prev => ({ ...prev, CERTIFICADO_SENHA: senha }))

        await alerts.success('Certificado enviado', `${file.name} foi salvo com sucesso.`)
        loadData()
      } catch (err) {
        alerts.error('Erro', (err as Error).message || 'Não foi possível enviar o certificado.')
      } finally { setUploading(false) }
    }
    input.click()
  }

  async function handleDeleteCert() {
    const confirmed = await alerts.confirmDelete('o certificado digital')
    if (!confirmed) return
    try {
      await trpc.admin.deleteCertificado.mutate()
      await alerts.success('Certificado removido', 'O arquivo foi excluído.')
      loadData()
    } catch { alerts.error('Erro', 'Não foi possível remover.') }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const items: Record<string, string> = {}
      for (const [k, v] of Object.entries(values)) items[k] = v
      const result = await trpc.admin.saveConfigs.mutate({ group: 'SERPRO', items })
      await alerts.success('Configurações salvas', `${result.saved} campo(s) atualizado(s).`)
    } catch (e) {
      alerts.error('Erro', (e as Error).message || 'Não foi possível salvar.')
    } finally { setSaving(false) }
  }

  function handleClear(key: string) {
    setValues(prev => ({ ...prev, [key]: '__CLEAR__' }))
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  function formatDate(d: string | null) {
    if (!d) return '—'
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Certificado Digital</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie o certificado digital e as credenciais SERPRO</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h5 className="text-[14px] font-semibold text-foreground">Certificado Digital e SERPRO</h5>
        </CardHeader>
        <div className="flex min-h-[500px]">
          {/* Pills laterais */}
          <div className="w-[200px] shrink-0 border-r border-[rgba(0,0,0,0.08)] bg-[#f8f9fa] dark:bg-[#1a1a2e] p-3 overflow-y-auto">
            <div className="space-y-1">
              {TABS.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={isActive ? { backgroundColor: MODULE_COLOR } : undefined}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded text-xs font-medium transition-all flex items-center gap-2',
                      isActive ? 'text-white shadow-sm' : 'text-muted-foreground hover:bg-white dark:hover:bg-white/5',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Conteúdo */}
          <div key={activeTab} className="flex-1" style={{ animation: 'fadeSlideIn 0.25s ease-out' }}>
            {activeTab === 'certificado' && (
              <div>
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Certificado Digital (PFX/P12)</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Certificado digital A1 do contador responsável, necessário para consultas ao SERPRO e assinatura digital.
                  </p>
                </div>

                <div className="p-5 space-y-5">
                  {/* Status do certificado */}
                  {certInfo?.exists ? (
                    <div className={cn(
                      'p-4 rounded-lg border',
                      certInfo.expired
                        ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40'
                        : certInfo.daysRemaining != null && certInfo.daysRemaining <= 30
                          ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40'
                          : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40',
                    )}>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'flex items-center justify-center h-10 w-10 rounded-lg',
                            certInfo.expired
                              ? 'bg-red-100 dark:bg-red-900/30'
                              : certInfo.daysRemaining != null && certInfo.daysRemaining <= 30
                                ? 'bg-amber-100 dark:bg-amber-900/30'
                                : 'bg-emerald-100 dark:bg-emerald-900/30',
                          )}>
                            <Shield className={cn(
                              'h-5 w-5',
                              certInfo.expired ? 'text-red-600' : certInfo.daysRemaining != null && certInfo.daysRemaining <= 30 ? 'text-amber-600' : 'text-emerald-600',
                            )} />
                          </div>
                          <div>
                            <p className={cn(
                              'text-sm font-semibold',
                              certInfo.expired ? 'text-red-800 dark:text-red-300' : 'text-emerald-800 dark:text-emerald-300',
                            )}>
                              {certInfo.expired ? 'Certificado Expirado' : 'Certificado Instalado'}
                            </p>
                            {certInfo.subject && (
                              <p className="text-xs text-foreground font-medium mt-0.5">{certInfo.subject}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {certInfo.fileName} ({formatFileSize(certInfo.fileSize)})
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={handleUpload} disabled={uploading} className="gap-1.5">
                            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            Substituir
                          </Button>
                          <Button variant="soft-destructive" size="sm" onClick={handleDeleteCert} className="gap-1.5">
                            <Trash2 className="h-3.5 w-3.5" />
                            Remover
                          </Button>
                        </div>
                      </div>

                      {/* Detalhes de validade */}
                      {(certInfo.validTo || certInfo.validFrom) && (
                        <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)] grid grid-cols-12 gap-3">
                          {certInfo.validFrom && (
                            <div className="col-span-3">
                              <p className="text-[11px] text-muted-foreground">Válido desde</p>
                              <p className="text-xs font-medium text-foreground">{formatDate(certInfo.validFrom)}</p>
                            </div>
                          )}
                          {certInfo.validTo && (
                            <div className="col-span-3">
                              <p className="text-[11px] text-muted-foreground">Válido até</p>
                              <p className={cn(
                                'text-xs font-medium',
                                certInfo.expired ? 'text-red-600' : certInfo.daysRemaining != null && certInfo.daysRemaining <= 30 ? 'text-amber-600' : 'text-foreground',
                              )}>{formatDate(certInfo.validTo)}</p>
                            </div>
                          )}
                          {certInfo.daysRemaining != null && (
                            <div className="col-span-3">
                              <p className="text-[11px] text-muted-foreground">Dias restantes</p>
                              <p className={cn(
                                'text-xs font-bold',
                                certInfo.expired ? 'text-red-600' : certInfo.daysRemaining <= 30 ? 'text-amber-600' : 'text-emerald-600',
                              )}>
                                {certInfo.expired ? `Expirado há ${Math.abs(certInfo.daysRemaining)} dias` : `${certInfo.daysRemaining} dias`}
                              </p>
                            </div>
                          )}
                          {certInfo.issuer && (
                            <div className="col-span-3">
                              <p className="text-[11px] text-muted-foreground">Emissor</p>
                              <p className="text-xs text-foreground truncate" title={certInfo.issuer}>{certInfo.issuer}</p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Aviso se não conseguiu ler */}
                      {!certInfo.validTo && certInfo.exists && (
                        <div className="mt-3 pt-3 border-t border-[rgba(0,0,0,0.08)]">
                          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                            <span>Não foi possível ler os dados do certificado. Verifique se a senha está correta.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-6 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/10 text-center">
                      <Shield className="h-10 w-10 text-amber-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-foreground">Nenhum certificado digital instalado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Envie o arquivo .pfx ou .p12 do certificado A1 do contador responsável.
                      </p>
                      <Button variant="success" size="sm" onClick={handleUpload} disabled={uploading} className="gap-1.5 mt-4">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? 'Enviando...' : 'Enviar Certificado'}
                      </Button>
                    </div>
                  )}

                  {/* Senha do certificado */}
                  <div>
                    <Label className="text-xs font-medium text-foreground mb-1.5 block">Senha do Certificado</Label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showSecret['CERTIFICADO_SENHA'] ? 'text' : 'password'}
                          value={values.CERTIFICADO_SENHA === '__CLEAR__' ? '' : values.CERTIFICADO_SENHA}
                          onChange={(e) => setValues(prev => ({ ...prev, CERTIFICADO_SENHA: e.target.value }))}
                          placeholder="Senha do arquivo PFX"
                          className="pr-16 font-mono text-xs"
                        />
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                          <button type="button" onClick={() => setShowSecret(prev => ({ ...prev, CERTIFICADO_SENHA: !prev.CERTIFICADO_SENHA }))} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                            {showSecret.CERTIFICADO_SENHA ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          {values.CERTIFICADO_SENHA && (
                            <button type="button" onClick={() => handleClear('CERTIFICADO_SENHA')} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">Senha para abrir o arquivo PFX/P12. Necessária para autenticação no SERPRO.</p>
                  </div>

                  {/* Checklist */}
                  <div className="-mx-5 px-5 py-3 border-t border-[rgba(0,0,0,0.08)]">
                    <h4 className="text-[13px] font-semibold text-foreground">Status da Configuração</h4>
                  </div>

                  <div className="space-y-2">
                    {[
                      { label: 'Certificado PFX enviado', ok: certInfo?.exists },
                      { label: 'Senha do certificado configurada', ok: certInfo?.senha || !!values.CERTIFICADO_SENHA },
                      { label: 'Consumer Key (SERPRO) configurada', ok: certInfo?.consumerKey || !!values.CONSUMER_KEY },
                      { label: 'Consumer Secret (SERPRO) configurada', ok: certInfo?.consumerSecret || !!values.CONSUMER_SECRET },
                      { label: 'CNPJ do contratante informado', ok: !!certInfo?.cnpjContratante || !!values.CNPJ_CONTRATANTE },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-2 p-2 rounded">
                        {item.ok
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                        <span className={cn('text-xs', item.ok ? 'text-foreground' : 'text-muted-foreground')}>{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Ações */}
                  <div className="pt-3 border-t border-[rgba(0,0,0,0.08)]">
                    <Button onClick={handleSave} disabled={saving} className="gap-2" variant="success">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar Configurações
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'serpro' && (
              <div>
                <div className="px-5 py-3 border-b border-[rgba(0,0,0,0.08)]">
                  <h4 className="text-[13px] font-semibold text-foreground">Credenciais de Acesso ao SERPRO</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Chaves OAuth 2.0 para autenticação na API do SERPRO. Obtidas no portal do SERPRO após contratação.
                  </p>
                </div>

                <div className="p-5 space-y-5">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
                    <HelpCircle className="h-4 w-4 text-blue-600 shrink-0" />
                    <p className="text-xs text-blue-700 dark:text-blue-400">
                      As credenciais são utilizadas para consultar o cartão CNPJ com dados completos (incluindo CPF dos sócios).
                    </p>
                  </div>

                  {/* CNPJ Contratante */}
                  <div>
                    <Label className="text-xs font-medium text-foreground mb-1.5 block">CNPJ do Contratante</Label>
                    <Input
                      value={values.CNPJ_CONTRATANTE === '__CLEAR__' ? '' : values.CNPJ_CONTRATANTE}
                      onChange={(e) => setValues(prev => ({ ...prev, CNPJ_CONTRATANTE: e.target.value }))}
                      placeholder="00000000000000 (14 dígitos, sem pontuação)"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">CNPJ da empresa contratante dos serviços SERPRO.</p>
                  </div>

                  {/* Consumer Key */}
                  <div>
                    <Label className="text-xs font-medium text-foreground mb-1.5 block">Consumer Key</Label>
                    <div className="relative">
                      <Input
                        type={showSecret.CONSUMER_KEY ? 'text' : 'password'}
                        value={values.CONSUMER_KEY === '__CLEAR__' ? '' : values.CONSUMER_KEY}
                        onChange={(e) => setValues(prev => ({ ...prev, CONSUMER_KEY: e.target.value }))}
                        placeholder="Chave do consumidor OAuth"
                        className="pr-16 font-mono text-xs"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <button type="button" onClick={() => setShowSecret(prev => ({ ...prev, CONSUMER_KEY: !prev.CONSUMER_KEY }))} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                          {showSecret.CONSUMER_KEY ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        {values.CONSUMER_KEY && <button type="button" onClick={() => handleClear('CONSUMER_KEY')} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  </div>

                  {/* Consumer Secret */}
                  <div>
                    <Label className="text-xs font-medium text-foreground mb-1.5 block">Consumer Secret</Label>
                    <div className="relative">
                      <Input
                        type={showSecret.CONSUMER_SECRET ? 'text' : 'password'}
                        value={values.CONSUMER_SECRET === '__CLEAR__' ? '' : values.CONSUMER_SECRET}
                        onChange={(e) => setValues(prev => ({ ...prev, CONSUMER_SECRET: e.target.value }))}
                        placeholder="Segredo do consumidor OAuth"
                        className="pr-16 font-mono text-xs"
                      />
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        <button type="button" onClick={() => setShowSecret(prev => ({ ...prev, CONSUMER_SECRET: !prev.CONSUMER_SECRET }))} className="p-1.5 rounded hover:bg-muted text-muted-foreground">
                          {showSecret.CONSUMER_SECRET ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                        {values.CONSUMER_SECRET && <button type="button" onClick={() => handleClear('CONSUMER_SECRET')} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>}
                      </div>
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="pt-3 border-t border-[rgba(0,0,0,0.08)]">
                    <Button onClick={handleSave} disabled={saving} className="gap-2" variant="success">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar Credenciais
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
