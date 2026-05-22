'use client'

import { useState, useEffect } from 'react'
import { Loader2, FileSignature, ShieldCheck, ExternalLink, AlertTriangle, KeyRound } from 'lucide-react'
import {
  Button, Label,
  Dialog, DialogContent, DialogBody, DialogFooter, DialogTitle, DialogDescription,
} from '@saas/ui'
import { DialogHeaderIcon } from '@/components/ui/dialog-header-icon'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'
import type { AssinaturaParte } from '@saas/types'

interface CertificadoItem {
  thumbprint: string
  subjectName: string
  issuerName: string
  validityStart: string
  validityEnd: string
  pkAlgorithm: string
  pkSizeBits?: number
  email?: string
  cpf?: string
  cnpj?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contratoId: string
  contratoToken?: string  // se presente, usa fluxo público (sem login)
  parte: AssinaturaParte
  hashPdf: string  // hash SHA-256 do PDF — backend já gerou
  onSucesso?: () => void
}

// LazyConst — evita executar `require('web-pki')` no SSR
let LacunaWebPKI: any = null
async function getPkiInstance() {
  if (typeof window === 'undefined') return null
  if (!LacunaWebPKI) {
    const mod = await import('web-pki')
    LacunaWebPKI = (mod as any).default || (mod as any).LacunaWebPKI || (window as any).LacunaWebPKI
  }
  return new LacunaWebPKI()
}

export function AssinarWebPkiModal({ open, onOpenChange, contratoId, contratoToken, parte, hashPdf, onSucesso }: Props) {
  const [pki, setPki] = useState<any>(null)
  const [pkiStatus, setPkiStatus] = useState<'idle' | 'detecting' | 'ok' | 'no_extension' | 'error'>('idle')
  const [pkiError, setPkiError] = useState<string>('')
  const [certificados, setCertificados] = useState<CertificadoItem[]>([])
  const [loadingCerts, setLoadingCerts] = useState(false)
  const [selectedThumb, setSelectedThumb] = useState<string>('')
  const [signing, setSigning] = useState(false)

  // Inicializa o componente Web PKI quando o modal abre
  useEffect(() => {
    if (!open) return
    setPkiStatus('detecting')
    setPkiError('')
    ;(async () => {
      try {
        const instance = await getPkiInstance()
        if (!instance) { setPkiStatus('error'); setPkiError('Não foi possível inicializar Web PKI'); return }
        // Web PKI exige licenca para rodar fora de localhost. Em desenvolvimento,
        // basta acessar via http://localhost:3000. Em producao, cadastre em
        // https://webpki.lacunasoftware.com (gratuito) e defina a env var
        // NEXT_PUBLIC_LACUNA_WEBPKI_LICENSE no apps/web/.env.local
        const license = process.env.NEXT_PUBLIC_LACUNA_WEBPKI_LICENSE
        const initOpts: any = {
          ready: () => {
            setPki(instance)
            setPkiStatus('ok')
            carregarCertificados(instance)
          },
          notInstalled: () => {
            setPkiStatus('no_extension')
            setPki(instance)
          },
          defaultError: (error: any) => {
            setPkiStatus('error')
            // Mensagem amigavel pro caso de licenca ausente
            const code = error?.code || ''
            const msg = error?.message || 'Erro ao inicializar Web PKI'
            if (code === 'license_not_set' || /license/i.test(msg)) {
              setPkiError(
                'A extensão Web PKI exige uma licença para rodar fora de "localhost". ' +
                'Acesse o sistema via http://localhost:3000 ou configure a licença ' +
                'gratuita da Lacuna em apps/web/.env.local: ' +
                'NEXT_PUBLIC_LACUNA_WEBPKI_LICENSE="sua_licenca_aqui"',
              )
            } else {
              setPkiError(msg)
            }
          },
        }
        if (license) initOpts.license = license
        instance.init(initOpts)
      } catch (e) {
        setPkiStatus('error')
        setPkiError((e as Error).message)
      }
    })()
  }, [open])

  function carregarCertificados(instance: any) {
    setLoadingCerts(true)
    instance.listCertificates({ filter: instance.filters.isWithinValidity })
      .success((certs: CertificadoItem[]) => {
        setCertificados(certs || [])
        if (certs?.length === 1) setSelectedThumb(certs[0].thumbprint)
        setLoadingCerts(false)
      })
      .error((err: any) => {
        alerts.error('Erro', err?.message || 'Falha ao listar certificados')
        setLoadingCerts(false)
      })
  }

  async function handleAssinar() {
    if (!pki || !selectedThumb) { alerts.error('Erro', 'Selecione um certificado'); return }
    const cert = certificados.find(c => c.thumbprint === selectedThumb)
    if (!cert) return
    setSigning(true)
    try {
      // 1. Pede ao Web PKI pra assinar o hash com o cert escolhido. Retorna PKCS#7 base64.
      // IMPORTANTE: o Lacuna Web PKI espera o hash em BASE64. O backend persiste em
      // hex (mais comum em auditoria), entao convertemos antes de assinar. O hashPdf
      // que vai pro backend continua em hex (audit trail consistente).
      const hashBase64 = hexToBase64(hashPdf)
      const signResult = await new Promise<string>((resolve, reject) => {
        pki.signHash({
          thumbprint: selectedThumb,
          hash: hashBase64,
          digestAlgorithm: 'SHA-256',
        })
          .success((signature: string) => resolve(signature))
          .error((err: any) => reject(new Error(err?.message || 'Falha na assinatura')))
      })

      // 2. Envia pro backend persistir
      const payload = {
        contratoId,
        parte,
        certSubject: cert.subjectName,
        certIssuer: cert.issuerName,
        certSerial: cert.thumbprint,
        certValidoAte: cert.validityEnd,
        signatarioNome: extractNomeFromSubject(cert.subjectName),
        signatarioDoc: cert.cpf || cert.cnpj || null,
        signatarioEmail: cert.email || null,
        pkcs7Base64: signResult,
        hashPdf,
      }

      if (contratoToken) {
        // Fluxo público — endpoint sem login
        await (trpc.contrato as any).assinarWebPkiPublico.mutate({ ...payload, contratoToken })
      } else {
        await (trpc.contrato as any).assinarWebPki.mutate(payload)
      }

      await alerts.success('Assinado!', `Contrato assinado com o certificado de ${payload.signatarioNome}.`)
      onOpenChange(false)
      onSucesso?.()
    } catch (e) {
      alerts.error('Erro na assinatura', (e as Error).message)
    } finally { setSigning(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeaderIcon icon={ShieldCheck} color="emerald">
          <DialogTitle>Assinar com Certificado Digital</DialogTitle>
          <DialogDescription>
            Assinatura ICP-Brasil realizada localmente. Sua chave privada nunca sai da sua máquina.
          </DialogDescription>
        </DialogHeaderIcon>
        <DialogBody className="space-y-3">
          {pkiStatus === 'detecting' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Detectando extensão Web PKI...
            </div>
          )}

          {pkiStatus === 'no_extension' && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs flex-1">
                  <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1">Extensão Web PKI não detectada</p>
                  <p className="text-amber-700 dark:text-amber-400">
                    Instale a extensão Lacuna Web PKI no seu navegador para listar os certificados ICP-Brasil instalados (A1 ou A3).
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => pki?.redirectToInstallPage?.()}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Instalar Web PKI
              </Button>
            </div>
          )}

          {pkiStatus === 'error' && (
            <div className="rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/20 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 dark:text-rose-400">{pkiError}</p>
              </div>
            </div>
          )}

          {pkiStatus === 'ok' && (
            <>
              <Label className="text-[13px] font-semibold">Certificados disponíveis</Label>
              {loadingCerts ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando certificados...
                </div>
              ) : certificados.length === 0 ? (
                <div className="rounded-md border bg-muted/30 p-4 text-center">
                  <KeyRound className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum certificado válido encontrado</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Verifique se há certificados ICP-Brasil instalados no Windows ou tokens A3 conectados.</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {certificados.map(c => (
                    <button
                      key={c.thumbprint}
                      type="button"
                      onClick={() => setSelectedThumb(c.thumbprint)}
                      className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                        selectedThumb === c.thumbprint
                          ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-border hover:bg-muted/40'
                      }`}
                    >
                      <p className="text-sm font-medium truncate">{extractNomeFromSubject(c.subjectName)}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{c.cpf || c.cnpj || '—'}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Emitido por: <span className="font-medium">{shortIssuer(c.issuerName)}</span> · válido até {new Date(c.validityEnd).toLocaleDateString('pt-BR')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={signing}>Cancelar</Button>
          <Button
            size="sm"
            onClick={handleAssinar}
            disabled={signing || pkiStatus !== 'ok' || !selectedThumb}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
            Assinar contrato
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Subject de certificados ICP-Brasil normalmente vem como
// "CN=NOME PESSOA:CPF, OU=..., ..." — extrai o nome.
function extractNomeFromSubject(subject: string): string {
  const m = subject.match(/CN=([^,]+)/i)
  if (!m) return subject
  return m[1].split(':')[0].trim()
}

function shortIssuer(issuer: string): string {
  const m = issuer.match(/CN=([^,]+)/i)
  return m ? m[1].trim() : issuer.slice(0, 50)
}

// Converte uma string hex (ex: "a3f1...") para base64 — formato exigido pelo
// pki.signHash() do Lacuna Web PKI. O backend persiste o hash em hex porque
// e mais comum em auditoria; aqui so traduzimos para o formato de transporte.
function hexToBase64(hex: string): string {
  const clean = hex.replace(/\s+/g, '').toLowerCase()
  if (clean.length % 2 !== 0) throw new Error(`Hash hex invalido (length=${clean.length})`)
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16)
  }
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}
