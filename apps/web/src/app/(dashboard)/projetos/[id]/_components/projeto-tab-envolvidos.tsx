'use client'

/**
 * Aba Envolvidos — quem está no projeto, em forma de organograma.
 *
 * Quatro grupos, de cima para baixo: o RESPONSÁVEL sozinho no topo (é um só, e
 * é quem responde pelo projeto), depois EXECUTANTES e COLABORADORES, e por fim
 * as EMPRESAS-CLIENTE envolvidas.
 *
 * O desenho é deliberadamente simples: caixas ligadas por linhas em CSS, sem
 * biblioteca de diagrama. O que importa aqui é ler "quem é quem" de relance —
 * não arrastar nós numa tela infinita.
 */

import { Building2, Users, UserCog, Handshake, UserPlus } from 'lucide-react'
import { Card, cn } from '@saas/ui'
import { resolveAssetUrl } from '@/lib/api-url'

type Pessoa = { id: string; name: string; image: string | null; papel?: string }
type ClienteEnvolvido = { id: string; razaoSocial: string; nomeFantasia: string | null }

type Props = {
  responsavel: Pessoa | null
  participantes: Pessoa[]
  clientes: ClienteEnvolvido[]
  corProjeto: string
}

function Avatar({ nome, image, tamanho = 'md' }: { nome: string; image: string | null; tamanho?: 'md' | 'lg' }) {
  const dim = tamanho === 'lg' ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs'
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveAssetUrl(image)} alt={nome} className={cn('shrink-0 rounded-full border border-background object-cover', dim)} />
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-[#5ea3cb] font-bold text-white', dim)}>
      {iniciais || '?'}
    </span>
  )
}

/** Caixa de uma pessoa. `destaque` é do responsável, que ganha a cor do projeto. */
function CaixaPessoa({ nome, image, legenda, destaque, cor }: {
  nome: string; image: string | null; legenda?: string; destaque?: boolean; cor?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-[190px] max-w-[230px] items-center gap-2.5 rounded-xl border bg-card px-3 py-2.5 shadow-sm',
        destaque ? 'border-transparent ring-2' : 'border-border',
      )}
      style={destaque && cor ? { boxShadow: `0 0 0 2px ${cor}` } : undefined}
    >
      <Avatar nome={nome} image={image} tamanho={destaque ? 'lg' : 'md'} />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-foreground">{nome}</p>
        {legenda && <p className="truncate text-[11px] text-muted-foreground">{legenda}</p>}
      </div>
    </div>
  )
}

/** Um ramo do organograma: título, contador e as caixas. */
function Grupo({ titulo, icone: Icone, cor, vazio, children, quantidade }: {
  titulo: string; icone: typeof Users; cor: string; vazio: string
  quantidade: number; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Haste que liga o grupo à linha de cima */}
      <span className="h-5 w-px bg-border" />
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1">
        <Icone className="h-3.5 w-3.5" style={{ color: cor }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">{titulo}</span>
        <span className="rounded-full bg-background px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {quantidade}
        </span>
      </div>
      {quantidade === 0
        ? <p className="pb-1 text-xs italic text-muted-foreground">{vazio}</p>
        : <div className="flex flex-wrap justify-center gap-2.5">{children}</div>}
    </div>
  )
}

export function ProjetoTabEnvolvidos({ responsavel, participantes, clientes, corProjeto }: Props) {
  const executantes = participantes.filter(p => (p.papel ?? 'EXECUTANTE') === 'EXECUTANTE')
  const colaboradores = participantes.filter(p => p.papel === 'COLABORADOR')

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-[13px] font-semibold text-foreground">Envolvidos no projeto</h2>
        <p className="text-xs text-muted-foreground">
          Quem responde, quem executa, quem acompanha e para quem o trabalho é feito.
          Editar a composição é no botão Editar do projeto.
        </p>
      </div>

      <div className="flex flex-col items-center">
        {/* Topo: o responsável */}
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1">
          <UserCog className="h-3.5 w-3.5" style={{ color: corProjeto }} />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">Responsável</span>
        </div>
        <div className="mt-2">
          {responsavel
            ? <CaixaPessoa nome={responsavel.name} image={responsavel.image} legenda="Responde pelo projeto" destaque cor={corProjeto} />
            : (
              <div className="flex min-w-[190px] items-center gap-2 rounded-xl border border-dashed border-border px-3 py-3 text-xs italic text-muted-foreground">
                <UserPlus className="h-4 w-4" /> Sem responsável definido
              </div>
            )}
        </div>

        {/* Linha-tronco: só existe quando há algo pendurado abaixo */}
        {(executantes.length > 0 || colaboradores.length > 0 || clientes.length > 0) && (
          <span className="h-5 w-px bg-border" />
        )}

        <div className="w-full space-y-1">
          <Grupo titulo="Executantes" icone={Users} cor={corProjeto} quantidade={executantes.length} vazio="Ninguém executando ainda">
            {executantes.map(p => <CaixaPessoa key={p.id} nome={p.name} image={p.image} legenda="Executa" />)}
          </Grupo>

          <Grupo titulo="Colaboradores" icone={Handshake} cor={corProjeto} quantidade={colaboradores.length} vazio="Nenhum colaborador">
            {colaboradores.map(p => <CaixaPessoa key={p.id} nome={p.name} image={p.image} legenda="Apoia e aponta" />)}
          </Grupo>

          <Grupo titulo="Clientes envolvidos" icone={Building2} cor={corProjeto} quantidade={clientes.length} vazio="Projeto interno, sem cliente">
            {clientes.map(c => (
              <div key={c.id} className="flex min-w-[190px] max-w-[230px] items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-foreground">{c.nomeFantasia || c.razaoSocial}</p>
                  {c.nomeFantasia && <p className="truncate text-[11px] text-muted-foreground">{c.razaoSocial}</p>}
                </div>
              </div>
            ))}
          </Grupo>
        </div>
      </div>
    </Card>
  )
}
