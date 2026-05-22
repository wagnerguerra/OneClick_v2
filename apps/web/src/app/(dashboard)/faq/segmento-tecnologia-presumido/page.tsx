'use client'
import { Cpu } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

const COR = '#8b5cf6'

export default function FaqSegmentoTechPresumidoPage() {
  return (
    <SegmentoShell
      modulo="Tecnologia / SaaS (Lucro Presumido)"
      moduloColor={COR}
      icon={Cpu}
      titulo="Tecnologia / SaaS — Lucro Presumido"
      descricao="Templates para empresas Tech (desenvolvimento de software, SaaS, serviços de TI) no Lucro Presumido. Sem ICMS, com ISS municipal e PIS/COFINS cumulativo."
      glossario={[
        { termo: 'Lucro Presumido', texto: 'Apuração trimestral baseada em presunção (32% para serviços de TI). IRPJ 15% + adicional + CSLL 9%.' },
        { termo: 'ISS', texto: 'Imposto Sobre Serviços — municipal. Vitória: 2-5% para serviços tech conforme código LC 116/2003.' },
        { termo: 'Lei do Bem', texto: 'Lei 11.196/2005 — incentivo fiscal a P&D. Empresas Tech elegíveis podem deduzir até 200% dos gastos com pesquisa do IRPJ/CSLL.' },
        { termo: 'PIS/COFINS Cumulativo', texto: 'Regime do Presumido — alíquotas 0,65% PIS + 3% COFINS sobre receita bruta. Sem créditos.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Diagnóstico ISS, avaliação Lei do Bem, configuração inicial.',
          templates: ['Onboarding Tecnologia Presumido'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: 'Coleta NFS-e → ISS → PIS/COFINS cumulativo → folha + eSocial + DCTFWeb → EFD-Contribuições.',
          templates: ['Mensal Tecnologia Presumido', 'Coleta e Lançamentos Mensal Tech', 'Apuração ISS Mensal Tech', 'Apuração PIS/COFINS Cumulativo Tech', 'Folha + eSocial + DCTFWeb Tech', 'EFD-Contribuições Tech'],
        },
        anual: {
          nome: 'Rotina Anual + Trimestral',
          descricao: 'IRPJ/CSLL trimestral, fechamento anual com ECD/ECF, avaliação Lei do Bem opcional.',
          templates: ['IRPJ/CSLL Trimestral Tech Presumido', 'Anual Tech Presumido', 'Encerramento + ECD + ECF Tech', 'Avaliação Lei do Bem (Tech) — opcional'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>ISS</strong> — alíquota varia por município. Vitória: 2% (desenvolvimento), 5% (consultoria). Verifique o código de serviço (LC 116).</li>
          <li><strong>Receitas exportadas</strong> — software para clientes no exterior pode ter imunidade ISS + PIS/COFINS. Confirmar com município.</li>
          <li><strong>Lei do Bem</strong> — exige investimento em P&D, regularidade fiscal e formulário FORMP&D ao MCTI até 31/jul. Submissão opcional anual.</li>
          <li><strong>IRPJ Trimestral</strong> — Presumido = trimestral por padrão. Apurar em mar, jun, set, dez.</li>
        </ul>
      }
      casos={[
        { titulo: 'SaaS B2B com clientes no exterior', resposta: <>Receita de exportação pode ter imunidade ISS + PIS/COFINS reduzido. Documentar contratos em moeda estrangeira e fluxo cambial. Avaliação caso a caso.</> },
        { titulo: 'Cliente cresceu — Presumido ainda compensa?', resposta: <>Avaliar se Lucro Real seria melhor (créditos PIS/COFINS sobre cloud, licenças). Faturamento &gt; R$ 78 mi obriga Lucro Real anyway. Use o template <code className="text-[11px]">Setup Tributário</code> para simular migração.</> },
        { titulo: 'Quero usar Lei do Bem', resposta: <>Cliente precisa documentar gastos com P&D ao longo do ano. Use o template <code className="text-[11px]">Avaliação Lei do Bem (Tech)</code> em junho/julho para preparar a submissão.</> },
      ]}
    />
  )
}
