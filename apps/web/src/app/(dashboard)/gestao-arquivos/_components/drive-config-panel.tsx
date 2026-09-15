'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Save, FolderSymlink, ExternalLink, CheckCircle2 } from 'lucide-react'
import {
  Button, Input,
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@saas/ui'
import { trpc } from '@/lib/trpc'
import { alerts } from '@/lib/alerts'

/**
 * Configuração do Google Drive do módulo.
 *
 * Dois passos, nesta ordem: apontar a pasta raiz, depois dizer qual subpasta é
 * de qual cliente. O segundo passo só aparece depois do primeiro porque as
 * subpastas vêm da raiz — sem ela não há o que listar.
 */

interface Subpasta {
  id: string
  nome: string
  link: string
  clienteId: string | null
  clienteNome: string | null
}

interface ClienteOpcao { id: string; razaoSocial: string }

const SEM_VINCULO = '__nenhum__'

export function DriveConfigPanel({ podeAdministrar }: { podeAdministrar: boolean }) {
  const [pastaUrl, setPastaUrl] = useState('')
  const [raizNome, setRaizNome] = useState<string | null>(null)
  const [subpastas, setSubpastas] = useState<Subpasta[]>([])
  const [clientes, setClientes] = useState<ClienteOpcao[]>([])
  const [carregandoConfig, setCarregandoConfig] = useState(true)
  const [carregandoPastas, setCarregandoPastas] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erroPastas, setErroPastas] = useState<string | null>(null)

  const carregarSubpastas = useCallback(() => {
    setCarregandoPastas(true)
    setErroPastas(null)
    ;(trpc as any).gestaoArquivos.driveListarSubpastas.query()
      .then((d: { pastaRaizNome: string | null; subpastas: Subpasta[] }) => {
        setRaizNome(d.pastaRaizNome)
        setSubpastas(d.subpastas)
      })
      .catch((e: unknown) => {
        setSubpastas([])
        setErroPastas(e instanceof Error ? e.message : 'Não foi possível listar as subpastas.')
      })
      .finally(() => setCarregandoPastas(false))
  }, [])

  useEffect(() => {
    Promise.all([
      (trpc as any).gestaoArquivos.driveConfig.query(),
      (trpc as any).gestaoArquivos.listarClientes.query(),
    ])
      .then(([cfg, cli]: [{ pastaRaizId: string; pastaRaizNome: string | null } | null, ClienteOpcao[]]) => {
        setClientes(cli ?? [])
        if (cfg) {
          setPastaUrl(`https://drive.google.com/drive/folders/${cfg.pastaRaizId}`)
          setRaizNome(cfg.pastaRaizNome)
          carregarSubpastas()
        }
      })
      .catch(() => undefined)
      .finally(() => setCarregandoConfig(false))
  }, [carregarSubpastas])

  async function salvarRaiz() {
    setSalvando(true)
    try {
      const r = await (trpc as any).gestaoArquivos.driveSalvarConfig.mutate({ pasta: pastaUrl.trim() })
      setRaizNome(r.pastaRaizNome)
      alerts.success(`Pasta "${r.pastaRaizNome}" conectada.`)
      carregarSubpastas()
    } catch (e) {
      alerts.error(e instanceof Error ? e.message : 'Não foi possível salvar.')
    } finally {
      setSalvando(false)
    }
  }

  async function vincular(folderId: string, clienteId: string) {
    const anterior = subpastas
    const alvo = clienteId === SEM_VINCULO ? null : clienteId
    const vinculoAtual = anterior.find(p => p.id === folderId)?.clienteId ?? null

    // Escolher "sem vínculo" numa pasta que já não tem vínculo é um não-ato.
    // Sem esta saída, a chamada iria com `clienteId` vazio e voltaria como
    // "cliente não encontrado" — um erro na tela por não ter mudado nada.
    if (alvo === null && vinculoAtual === null) return
    // Otimista, com rollback: o de-para é uma lista longa e recarregar tudo a
    // cada escolha faria a tela piscar a cada clique.
    setSubpastas(s => s.map(p => (p.id === folderId
      ? { ...p, clienteId: alvo, clienteNome: clientes.find(c => c.id === alvo)?.razaoSocial ?? null }
      : p)))
    try {
      await (trpc as any).gestaoArquivos.driveVincularCliente.mutate({
        // Ao desvincular, o cliente alvo é o que ESTAVA vinculado — é o cadastro
        // dele que perde a pasta.
        clienteId: alvo ?? vinculoAtual,
        folderId: alvo ? folderId : null,
      })
    } catch (e) {
      setSubpastas(anterior)
      alerts.error(e instanceof Error ? e.message : 'Não foi possível vincular.')
    }
  }

  if (carregandoConfig) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Passo 1 — a pasta raiz */}
      <div className="rounded-lg border border-border p-3.5">
        <p className="text-[13px] font-semibold text-foreground">Pasta raiz no Google Drive</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          A pasta que guarda uma subpasta por cliente. Cole o link dela — o sistema
          confirma o nome antes de salvar.
        </p>
        <div className="mt-2.5 flex gap-2">
          <Input
            value={pastaUrl}
            onChange={e => setPastaUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="h-9 flex-1 text-sm"
            disabled={!podeAdministrar}
          />
          <Button
            onClick={salvarRaiz}
            disabled={salvando || !pastaUrl.trim() || !podeAdministrar}
            className="gap-1.5 shrink-0"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Conectar
          </Button>
        </div>
        {raizNome && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conectado a <span className="font-medium">{raizNome}</span>
          </p>
        )}
        {!podeAdministrar && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Só o administrador do escritório altera esta configuração.
          </p>
        )}
      </div>

      {/* Passo 2 — o de-para */}
      {raizNome && (
        <div className="rounded-lg border border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-foreground">Qual subpasta é de qual cliente</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                A lista só oferece clientes que já têm usuário no portal. Uma pasta
                serve a um cliente só.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={carregarSubpastas} disabled={carregandoPastas} className="shrink-0">
              {carregandoPastas ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
            </Button>
          </div>

          {erroPastas && (
            <p className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-[12px] text-muted-foreground">
              {erroPastas}
            </p>
          )}

          {!erroPastas && !carregandoPastas && subpastas.length === 0 && (
            <p className="mt-3 text-[12px] text-muted-foreground">
              Nenhuma subpasta encontrada nessa pasta.
            </p>
          )}

          {subpastas.length > 0 && (
            <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto nice-scrollbar pr-1">
              {subpastas.map(p => (
                <div key={p.id} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-2">
                  <FolderSymlink className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{p.nome}</span>
                  {p.link && (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      title="Abrir no Drive"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <Select
                    value={p.clienteId ?? SEM_VINCULO}
                    onValueChange={v => vincular(p.id, v)}
                    disabled={!podeAdministrar}
                  >
                    <SelectTrigger className="h-8 w-[220px] shrink-0 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[280px]">
                      <SelectItem value={SEM_VINCULO}>— sem vínculo —</SelectItem>
                      {clientes.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.razaoSocial}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        O cliente não precisa de conta Google: quem abre a pasta é a conta do escritório,
        e quem decide o acesso é o cadastro de usuários daqui. Esta pasta é independente
        da que alimenta a importação automática de XML.
      </p>
    </div>
  )
}
