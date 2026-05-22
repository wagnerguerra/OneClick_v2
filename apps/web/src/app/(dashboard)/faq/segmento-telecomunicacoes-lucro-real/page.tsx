'use client'
import { Radio } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

export default function FaqSegmentoTelecomPage() {
  return (
    <SegmentoShell
      modulo="Telecomunicações (Lucro Real)"
      moduloColor="#818cf8"
      icon={Radio}
      titulo="Telecomunicações — Lucro Real"
      descricao="Templates para operadoras de telecomunicações (SCM, STFC, SVA, SeAC) — ICMS-Comunicação, contribuições ANATEL, regime especial Convênio 126/1998."
      glossario={[
        { termo: 'ICMS-Comunicação', texto: 'Alíquota especial 25-30% (ES: 25%) sobre faturamento de comunicação. Convênio ICMS 126/1998 estabelece regime de apuração específico.' },
        { termo: 'SCM', texto: 'Serviço de Comunicação Multimídia — internet (provedores). Regime ANATEL.' },
        { termo: 'STFC', texto: 'Serviço Telefônico Fixo Comutado — telefonia fixa.' },
        { termo: 'FUST', texto: 'Fundo de Universalização dos Serviços de Telecomunicações — Lei 9.998/2000. Contribuição 1% sobre receita líquida.' },
        { termo: 'FUNTTEL', texto: 'Fundo para o Desenvolvimento Tecnológico das Telecomunicações — Lei 10.052/2000. 0,5% sobre receita.' },
        { termo: 'CFRP', texto: 'Contribuição para o Fomento da Radiodifusão Pública — Lei 11.652/2008. 1% sobre receita de telecom.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Diagnóstico ANATEL, mapeamento de serviços (SCM/STFC/SVA), Convênio 126.',
          templates: ['Onboarding Telecomunicações Real'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: 'Coleta NFs comunicação → ICMS-Comunicação 25% → contribuições ANATEL → federais + folha.',
          templates: ['Mensal Telecomunicações Real', 'Coleta + Lançamentos Mensal Telecom', 'Apuração ICMS-Comunicação Telecom', 'Contribuições ANATEL (FUST, FUNTTEL, CFRP) Telecom', 'Federais e Folha Telecom'],
        },
        anual: {
          nome: 'Rotina Anual (1×)',
          descricao: 'Encerramento, ECD, ECF, demonstrações financeiras anuais à ANATEL.',
          templates: ['Anual Telecomunicações Real'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>ICMS-Comunicação 25%</strong> em ES — alíquota interna. Algumas operações (Internet) podem ter isenção/redução conforme RICMS-ES.</li>
          <li><strong>Convênio 126/1998</strong> — regime especial para telecom. Permite diferimentos em operações entre operadoras (interconexão).</li>
          <li><strong>3 contribuições ANATEL</strong> mensais: FUST 1% + FUNTTEL 0,5% + CFRP 1% = 2,5% adicional sobre receita líquida.</li>
          <li><strong>Demonstrações Anuais à ANATEL</strong> — operadoras reportam dados financeiros consolidados anualmente em formato específico.</li>
          <li><strong>NF de Comunicação modelo 21</strong> — formato específico (não NF-e). Faturamento mensal pode envolver milhões de NFs.</li>
        </ul>
      }
      casos={[
        { titulo: 'Operadora pequena — como fica o FUST?', resposta: <>FUST 1% incide sobre receita líquida de comunicação. Operadoras com receita anual &lt; R$ 5 mi podem ter isenção (verificar Resolução ANATEL vigente). Avaliar caso a caso.</> },
        { titulo: 'Diferimento entre operadoras', resposta: <>Convênio 126 permite diferir ICMS em operações entre operadoras (interconexão). Importante mapear corretamente para não pagar ICMS em duplicidade.</> },
        { titulo: 'Cliente quer expandir para SVA — muda muito?', resposta: <>SVA (Valor Adicionado) tem regime tributário diferente — pode ser ISS em vez de ICMS-Comunicação. Reavaliar setup tributário, principalmente classificação fiscal.</> },
      ]}
    />
  )
}
