'use client'
import { Truck } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

const COR = '#0ea5e9'

export default function FaqSegmentoAtacadistaPage() {
  return (
    <SegmentoShell
      modulo="Atacadista / Distribuidor / Importador (Lucro Real)"
      moduloColor={COR}
      icon={Truck}
      titulo="Atacadista / Distribuidor / Importador — Lucro Real"
      descricao="Templates do catálogo para escritório operar atacadistas, distribuidores e importadores Lucro Real, com particularidades capixabas (COMPETE-ES, ICMS-ST)."
      glossario={[
        { termo: 'COMPETE-ES', texto: 'Lei 10.568/2016 — benefício fiscal estadual para atacadistas/CDs no ES (diferimento parcial de ICMS).' },
        { termo: 'ICMS-ST', texto: 'Imposto recolhido antecipadamente pelo substituto sobre operações futuras com NCMs específicos.' },
        { termo: 'EFD-ICMS/IPI', texto: 'SPED Fiscal — escrituração mensal eletrônica de ICMS e IPI. Prazo ES: dia 15 do mês seguinte.' },
        { termo: 'EFD-Contribuições', texto: 'Escrituração mensal de PIS/COFINS — Lucro Real exige regime não-cumulativo com créditos amplos.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1× ao entrar como cliente)',
          descricao: 'Diagnóstico fiscal, configuração tributária, plano de contas atacadista, avaliação COMPETE-ES.',
          templates: ['Onboarding Atacadista LR', 'Setup Tributário Atacadista LR', 'Avaliação COMPETE-ES (opcional)', 'Plano de Contas Atacadista'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: '~10 templates encadeados — coleta → lançamentos → apurações fiscais → obrigações acessórias → fechamento.',
          templates: ['Mensal Atacadista LR', 'Coleta Documentos Mensal Atacadista', 'Lançamentos Contábeis Mensais Atacadista', 'Apuração ICMS Próprio + ICMS-ST Atacadista LR', 'Apuração PIS/COFINS Não-cumulativo', 'Apuração IRPJ/CSLL Estimativa Mensal', 'Folha + eSocial + DCTFWeb', 'EFD-ICMS/IPI Atacadista LR', 'EFD-Contribuições Atacadista LR', 'Conciliação e Balancete Mensal Atacadista'],
        },
        anual: {
          nome: 'Rotina Anual (1×/ano)',
          descricao: 'Encerramento, ECD (junho), ECF (julho), distribuição de lucros opcional.',
          templates: ['Anual Atacadista LR', 'Encerramento do Exercício Atacadista LR', 'ECD Atacadista LR', 'ECF Atacadista LR', 'Distribuição de Lucros e IRPF dos Sócios (opcional)'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>ICMS-ST</strong> — atacadistas com NCMs em ST recolhem ICMS antecipadamente. Avaliar protocolos entre ES e estados de origem.</li>
          <li><strong>COMPETE-ES</strong> — atacadistas instalados no ES com faturamento mínimo podem ter diferimento parcial de ICMS. Avaliação opcional no onboarding.</li>
          <li><strong>PIS/COFINS Não-cumulativo</strong> — créditos amplos sobre insumos, energia, frete, ativo imobilizado.</li>
          <li><strong>IRPJ Lucro Real</strong> — escolha trimestral vs estimativa mensal (com possibilidade de balanços de suspensão).</li>
          <li><strong>EFDs</strong> — duas mensais: ICMS/IPI até dia 15 e Contribuições até dia 10 do 2º mês subsequente.</li>
        </ul>
      }
      casos={[
        { titulo: 'Cliente novo — começo por onde?', resposta: <>Crie um orçamento usando como item raiz o template <code className="text-[11px]">Onboarding Atacadista LR</code>. Aprovação dispara automaticamente o setup tributário e plano de contas.</> },
        { titulo: 'COMPETE-ES vale a pena?', resposta: <>Avaliar caso a caso — depende do mix de produtos e da modalidade. O template <code className="text-[11px]">Avaliação COMPETE-ES</code> guia o estudo de elegibilidade e simulação de impacto.</> },
        { titulo: 'Como rodar o ciclo mensal todo mês?', resposta: <>Por enquanto manualmente: ao iniciar o mês, gestor cria orçamento com o template <code className="text-[11px]">Mensal Atacadista LR</code> e aprova. Dispara a cadeia inteira (coleta → apurações → fechamento). Scheduler automático fica pra fase futura.</> },
      ]}
    />
  )
}
