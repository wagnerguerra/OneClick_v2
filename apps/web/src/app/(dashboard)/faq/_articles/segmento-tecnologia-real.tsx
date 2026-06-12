'use client'
import { Cpu } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

export default function FaqSegmentoTechRealPage() {
  return (
    <SegmentoShell
      modulo="Tecnologia / SaaS (Lucro Real)"
      moduloColor="#8b5cf6"
      icon={Cpu}
      titulo="Tecnologia / SaaS — Lucro Real"
      descricao="Templates para empresas Tech maiores ou com prejuízo planejado, no regime Lucro Real. Créditos PIS/COFINS amplos sobre cloud e licenças."
      glossario={[
        { termo: 'Lucro Real', texto: 'Apuração com base no lucro contábil ajustado. IRPJ 15% + adicional 10% + CSLL 9% sobre lucro real.' },
        { termo: 'PIS/COFINS Não-cumulativo', texto: 'Regime do Real — 1,65% PIS + 7,6% COFINS, mas com créditos sobre insumos.' },
        { termo: 'Créditos Tech', texto: 'Insumos tech recorrentes: AWS/Azure/GCP, licenças de software, energia, depreciação de equipamentos.' },
        { termo: 'e-LALUR', texto: 'Livro de Apuração do Lucro Real eletrônico — adições, exclusões, compensação de prejuízos.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Setup tributário Real, mapeamento de créditos PIS/COFINS, avaliação Lei do Bem.',
          templates: ['Onboarding Tecnologia Real'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: 'Coleta com créditos detalhados → ISS + PIS/COFINS não-cumulativo → IRPJ/CSLL estimativa → folha → EFD-Contribuições.',
          templates: ['Mensal Tecnologia Real', 'Coleta + Lançamentos Mensal Tech Real', 'Apuração ISS + PIS/COFINS Não-cumulativo Tech', 'IRPJ/CSLL e Folha Tech Real', 'EFD-Contribuições Tech Real', 'Conciliação e Balancete Tech Real'],
        },
        anual: {
          nome: 'Rotina Anual (1×)',
          descricao: 'Encerramento, ECD, ECF com e-LALUR detalhado.',
          templates: ['Anual Tech Real', 'Encerramento + ECD + ECF Tech Real'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>Créditos amplos</strong> — cloud (AWS/Azure/GCP), licenças (GitHub, Atlassian), energia industrial, depreciação de servidores e equipamentos.</li>
          <li><strong>e-LALUR</strong> — escrituração eletrônica de adições/exclusões. Compensação de prejuízos limitada a 30% do lucro real.</li>
          <li><strong>Receitas internacionais</strong> — vendas de software para o exterior podem ter PIS/COFINS reduzido (alíquota 0% sobre exportação).</li>
          <li><strong>EFD-Contribuições mais complexa</strong> — bloco A (créditos) preenchido com detalhes vs Presumido onde é vazio.</li>
        </ul>
      }
      casos={[
        { titulo: 'Empresa em prejuízo — vale a pena Real?', resposta: <>Sim — Lucro Real permite compensar prejuízo fiscal em exercícios futuros (até 30% do lucro real do ano). Para Tech em estágio inicial (queimando capital), é o regime preferido.</> },
        { titulo: 'Como reaproveitar créditos PIS/COFINS sobre cloud?', resposta: <>Configurar contas contábeis específicas para insumos tech no plano de contas. EFD-Contribuições bloco A consolida automaticamente se contas estão corretas.</> },
        { titulo: 'Diferença prática vs Presumido', resposta: <>Real exige escrituração contábil completa, e-LALUR mensal, EFD-Contribuições com créditos. Mais complexo, mas pode reduzir IRPJ se margem real &lt; 32% (presunção do Presumido).</> },
      ]}
    />
  )
}
