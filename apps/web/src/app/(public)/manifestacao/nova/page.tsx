'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ThumbsUp, MessageSquare, Lightbulb, Loader2, Send, Copy, CheckCircle2, ArrowLeft } from 'lucide-react'
import { getApiUrl } from '@/lib/api-url'

const TIPOS = [
  { valor: 'ELOGIO', rotulo: 'Elogio', desc: 'Algo foi bem feito', Icon: ThumbsUp, cor: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30', borda: 'border-emerald-400' },
  { valor: 'RECLAMACAO', rotulo: 'Reclamação', desc: 'Algo deu errado', Icon: MessageSquare, cor: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-900/30', borda: 'border-rose-400' },
  { valor: 'SUGESTAO', rotulo: 'Sugestão', desc: 'Uma ideia de melhoria', Icon: Lightbulb, cor: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30', borda: 'border-amber-400' },
] as const

/**
 * Registro público de manifestação — superfície exposta na internet, então:
 * textarea simples (sem editor pesado; o texto vira <p> no envio), campo-isca
 * escondido por CSS (robô preenche, o backend recusa) e o limite por IP fica
 * no controller. Anônimo = o backend NÃO grava autor nem contato.
 */
export default function NovaManifestacaoPublicaPage() {
  const [tipo, setTipo] = useState('')
  const [anonima, setAnonima] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [isca, setIsca] = useState('') // honeypot
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [protocolo, setProtocolo] = useState('')
  const [copiado, setCopiado] = useState(false)

  async function enviar() {
    setErro('')
    if (!tipo) { setErro('Escolha o tipo da manifestação.'); return }
    if (descricao.trim().length < 10) { setErro('Conte com um pouco mais de detalhe.'); return }
    if (!anonima && nome.trim().length < 2) { setErro('Diga seu nome — ou marque a opção de anonimato.'); return }
    setEnviando(true)
    try {
      const descricaoHtml = descricao.trim()
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .split(/\n+/).map((l) => `<p>${l.trim()}</p>`).join('')
      const res = await fetch(`${getApiUrl()}/api/manifestacao-publica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, anonima,
          informanteNome: anonima ? null : nome.trim(),
          informanteEmail: anonima ? null : (email.trim() || null),
          informanteTelefone: anonima ? null : (telefone.trim() || null),
          titulo: titulo.trim() || null,
          descricao: descricaoHtml,
          website: isca,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Não foi possível registrar.')
      setProtocolo(data.protocolo)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(protocolo); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem clipboard */ }
  }

  // ── Tela de sucesso: o protocolo é a única credencial — destaque total ──
  if (protocolo) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
        <h1 className="text-xl font-bold">Manifestação registrada</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Guarde o protocolo abaixo — é por ele que você acompanha a tratativa
          {anonima ? ' (registro anônimo: sem ele, não há outro caminho)' : ''}.
        </p>
        <button type="button" onClick={copiar}
          className="mt-6 mx-auto flex items-center gap-2 rounded-xl border-2 border-dashed border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-6 py-4 text-2xl font-bold tracking-widest tabular-nums hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors"
          title="Copiar o protocolo">
          {protocolo}
          {copiado ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Copy className="h-5 w-5 text-emerald-600" />}
        </button>
        <div className="mt-8 flex flex-col gap-2">
          <Link href={`/manifestacao/${protocolo}`} className="text-sm font-semibold text-sky-600 hover:underline">
            Acompanhar agora
          </Link>
          <Link href="/manifestacao" className="text-xs text-muted-foreground hover:underline">Voltar ao início</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Link href="/manifestacao" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-3.5 w-3.5" />Voltar
      </Link>
      <h1 className="text-xl font-bold">Registrar manifestação</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">Elogio, reclamação ou sugestão — leva um minuto.</p>

      {/* Tipo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-5">
        {TIPOS.map(({ valor, rotulo, desc, Icon, cor, bg, borda }) => (
          <button key={valor} type="button" onClick={() => setTipo(valor)}
            className={`rounded-xl border-2 p-3 text-center transition-colors ${tipo === valor ? `${borda} ${bg}` : 'border-border bg-card hover:border-muted-foreground/40'}`}>
            <Icon className={`h-5 w-5 mx-auto mb-1 ${cor}`} />
            <span className="block text-xs font-semibold">{rotulo}</span>
            <span className="block text-[10px] text-muted-foreground">{desc}</span>
          </button>
        ))}
      </div>

      {/* Anonimato */}
      <label className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 mb-5 cursor-pointer">
        <input type="checkbox" checked={anonima} onChange={(e) => setAnonima(e.target.checked)} className="mt-0.5" />
        <span>
          <span className="block text-sm font-medium">Quero ficar no anonimato</span>
          <span className="block text-xs text-muted-foreground">
            Seu nome e contato NÃO são gravados. O acompanhamento é só pelo protocolo.
          </span>
        </span>
      </label>

      {!anonima && (
        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-[13px] font-semibold mb-1">Seu nome <span className="text-rose-500">*</span></label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-semibold mb-1">E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold mb-1">Telefone</label>
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={40}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[13px] font-semibold mb-1">Assunto</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200}
            placeholder="Um resumo em poucas palavras (opcional)"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
        <div>
          <label className="block text-[13px] font-semibold mb-1">Conte o que aconteceu <span className="text-rose-500">*</span></label>
          {/* Textarea simples de propósito: página pública leve, sem editor.
              O texto vira parágrafos no envio. */}
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={6} maxLength={8000}
            placeholder="Quanto mais detalhes, melhor a tratativa..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400" />
        </div>
        {/* Campo-isca: invisível para gente, irresistível para robô. */}
        <div className="absolute left-[-9999px] top-[-9999px]" aria-hidden="true">
          <label>Website<input tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} /></label>
        </div>
      </div>

      {erro && <p className="mt-4 rounded-md bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{erro}</p>}

      <button type="button" onClick={enviar} disabled={enviando}
        className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-sky-600 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 transition-colors">
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Registrar
      </button>
    </div>
  )
}
