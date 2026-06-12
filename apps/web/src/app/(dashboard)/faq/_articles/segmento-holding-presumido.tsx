'use client'
import { Briefcase } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

export default function FaqSegmentoHoldingPage() {
  return (
    <SegmentoShell
      modulo="Holding / Participações (Lucro Presumido)"
      moduloColor="#6366f1"
      icon={Briefcase}
      titulo="Holding / Participações — Lucro Presumido"
      descricao="Templates para Holdings patrimoniais e de participações. Rotina enxuta — sem ICMS/IPI, foco em equivalência patrimonial e distribuição de lucros."
      glossario={[
        { termo: 'Holding', texto: 'Empresa cuja atividade principal é deter participações em outras empresas (coligadas/controladas) ou patrimônio (imóveis, investimentos).' },
        { termo: 'MEP', texto: 'Método de Equivalência Patrimonial — NBC TG 18. Reflete no balanço da Holding o resultado proporcional das coligadas/controladas.' },
        { termo: 'Distribuição isenta', texto: 'Lucros distribuídos a sócios PF baseados em lucro contábil são isentos de IRPF (art. 10 Lei 9.249/1995).' },
        { termo: 'Receitas administrativas', texto: 'Receitas do dia a dia (juros sobre aplicações, aluguéis recebidos). Tributadas com presunção 32% para administração de bens próprios.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Diagnóstico patrimonial, mapeamento coligadas/controladas, configuração contábil.',
          templates: ['Onboarding Holding Presumido'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano) — enxuta',
          descricao: 'Lançamentos básicos, MEP opcional (se controladas relevantes), PIS/COFINS sobre receitas tributáveis.',
          templates: ['Mensal Holding Presumido', 'Lançamentos e Acompanhamento Mensal Holding', 'Apuração Mensal Holding (PIS/COFINS Cumulativo)'],
        },
        anual: {
          nome: 'Rotina Anual (1×)',
          descricao: 'Encerramento, ECD, ECF, decisão de distribuição de lucros.',
          templates: ['Anual Holding Presumido', 'Encerramento + ECD + ECF Holding'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Sem ICMS/IPI/ISS</strong> — Holding pura não exerce atividade comercial nem prestação de serviços.</li>
          <li><strong>MEP no fechamento</strong> — só aplicar se Holding tem participação relevante (geralmente &gt; 20% do capital ou influência). Exige balancetes das coligadas/controladas.</li>
          <li><strong>Presunção 32%</strong> para receitas de administração de bens próprios; 8% para venda de imóveis (se for atividade da Holding).</li>
          <li><strong>Distribuição de lucros</strong> — isenta para sócios PF se baseada em lucro contábil. Documentar no encerramento anual.</li>
          <li><strong>ITBI/ITCMD</strong> — quando Holding recebe imóveis ou cotas (integralização), atenção a impostos de transmissão. Análise societária separada.</li>
        </ul>
      }
      casos={[
        { titulo: 'Sócios querem distribuir lucros agora — pode?', resposta: <>Sim, se Holding tem lucro contábil acumulado. Distribuição é isenta de IRPF. Documente no encerramento mensal/anual e emita comprovante para cada sócio.</> },
        { titulo: 'Holding tem 1 imóvel alugado — qual rotina?', resposta: <>Locação tem presunção 32% (não 8%, pois não é venda). Receita mensal vai para PIS/COFINS cumulativo + IRPJ trimestral. Use os templates padrão.</> },
        { titulo: 'Quando aplicar MEP?', resposta: <>Quando Holding tem participação &gt; 20% em coligada com influência significativa, ou em controlada. Exige balancete da investida. Em Holdings de mero investimento (ações em bolsa), não aplica.</> },
      ]}
    />
  )
}
