'use client'

/**
 * Termo de Responsabilidade pelo uso de ativo da empresa.
 * Página printável A4 — operador imprime, colaborador assina e o documento
 * vira anexo do ativo (manualmente, via upload em /ativos/[id] tab Anexos).
 */

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { Button } from '@saas/ui'
import { trpc } from '@/lib/trpc'

function fmtBRL(v: number | string | null | undefined): string {
  if (v == null) return '—'
  const n = typeof v === 'string' ? Number(v) : v
  if (isNaN(n)) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = typeof v === 'string' ? new Date(v) : v
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export default function TermoResponsabilidadePage() {
  const params = useParams<{ id: string }>()
  const [ativo, setAtivo] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const a = await (trpc.ativo as any).getById.query({ id: params.id })
        setAtivo(a)
      } finally { setLoading(false) }
    })()
  }, [params.id])

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!ativo) return <div className="py-20 text-center text-muted-foreground">Ativo não encontrado.</div>

  const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const responsavel = ativo.responsavel
  const empresaNome = 'Sua Empresa'  // FIXME: pegar de getMyProfile/empresa

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4; margin: 18mm; }
          body { background: white !important; }
          aside, header, .no-print { display: none !important; }
          main { padding: 0 !important; }
        }
        .termo {
          max-width: 180mm;
          margin: 0 auto;
          background: white;
          padding: 20mm;
          font-family: Georgia, serif;
          line-height: 1.6;
          color: #1e293b;
        }
        .termo h1 { font-size: 18pt; text-align: center; font-weight: bold; text-transform: uppercase; margin-bottom: 24px; }
        .termo h2 { font-size: 12pt; font-weight: bold; margin-top: 16px; margin-bottom: 8px; }
        .termo p { margin-bottom: 8px; text-align: justify; }
        .termo table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .termo table td { padding: 6px 8px; border: 1px solid #cbd5e1; vertical-align: top; }
        .termo table td:first-child { width: 35%; font-weight: bold; background: #f8fafc; }
        .assinatura {
          margin-top: 60px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
        }
        .assinatura div { border-top: 1px solid #1e293b; padding-top: 8px; text-align: center; font-size: 10pt; }
      ` }} />

      <div className="space-y-3">
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-3">
            <Link href={`/ativos/${params.id}`} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1>Termo de Responsabilidade</h1>
              <p className="text-sm text-muted-foreground">Documento pra impressão e assinatura</p>
            </div>
          </div>
          <Button onClick={() => window.print()} className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white">
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </div>

        <div className="termo bg-white shadow-md rounded-md">
          <h1>Termo de Responsabilidade pelo uso de Ativo</h1>

          <p>
            Pelo presente <strong>TERMO DE RESPONSABILIDADE</strong>, o colaborador abaixo identificado declara que
            recebeu, nesta data, o ativo de propriedade da <strong>{empresaNome}</strong>, comprometendo-se a zelar
            por sua guarda, conservação e uso adequado.
          </p>

          <h2>1. Identificação do Ativo</h2>
          <table>
            <tbody>
              <tr><td>Etiqueta (tag)</td><td>{ativo.tag}</td></tr>
              <tr><td>Descrição</td><td>{ativo.nome}</td></tr>
              <tr><td>Tipo</td><td>{ativo.tipo?.nome ?? '—'} {ativo.categoria?.nome ? `· ${ativo.categoria.nome}` : ''}</td></tr>
              <tr><td>Fabricante / Modelo</td><td>{[ativo.fabricante, ativo.modelo].filter(Boolean).join(' / ') || '—'}</td></tr>
              <tr><td>Número de série</td><td>{ativo.serial ?? '—'}</td></tr>
              <tr><td>Patrimônio</td><td>{ativo.patrimonio ?? '—'}</td></tr>
              <tr><td>Valor de aquisição</td><td>{fmtBRL(ativo.valorAquisicao)}</td></tr>
              <tr><td>Data de aquisição</td><td>{fmtDate(ativo.dataAquisicao)}</td></tr>
              <tr><td>Garantia até</td><td>{fmtDate(ativo.garantiaFim)}</td></tr>
            </tbody>
          </table>

          <h2>2. Identificação do Responsável</h2>
          <table>
            <tbody>
              <tr><td>Nome</td><td>{responsavel?.name ?? '____________________________________'}</td></tr>
              <tr><td>E-mail</td><td>{responsavel?.email ?? '____________________________________'}</td></tr>
              <tr><td>Área</td><td>{ativo.area?.name ?? '____________________________________'}</td></tr>
              <tr><td>Localização</td><td>{ativo.localizacao ?? '____________________________________'}</td></tr>
            </tbody>
          </table>

          <h2>3. Obrigações do Responsável</h2>
          <p>
            3.1. Utilizar o ativo exclusivamente no exercício de suas funções profissionais, mantendo-o em
            perfeitas condições de uso e conservação.
          </p>
          <p>
            3.2. Comunicar imediatamente à equipe de TI qualquer dano, furto, perda, mau funcionamento ou
            necessidade de manutenção.
          </p>
          <p>
            3.3. Não permitir o uso do ativo por terceiros sem autorização expressa.
          </p>
          <p>
            3.4. Restituir o ativo à empresa em caso de desligamento, mudança de função ou solicitação formal,
            em condições compatíveis com o uso normal e o tempo de utilização.
          </p>
          <p>
            3.5. Ressarcir a empresa por danos causados por uso indevido, negligência ou imprudência.
          </p>

          <h2>4. Da Devolução</h2>
          <p>
            O ativo deverá ser devolvido nas mesmas condições em que foi entregue, ressalvado o desgaste natural
            decorrente do uso adequado.
          </p>

          <p style={{ marginTop: 24, textAlign: 'right' }}>
            {ativo.cidade ? `${ativo.cidade}, ` : ''}{hoje}.
          </p>

          <div className="assinatura">
            <div>
              <strong>{responsavel?.name ?? 'Colaborador'}</strong><br />
              Responsável pelo ativo
            </div>
            <div>
              <strong>{empresaNome}</strong><br />
              Representante da empresa
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
