'use client'
import { Store } from 'lucide-react'
import { SegmentoShell } from '../_components/segmento-shell'

export default function FaqSegmentoVarejoSimplesPage() {
  return (
    <SegmentoShell
      modulo="Comércio Varejo (Simples Nacional)"
      moduloColor="#10b981"
      icon={Store}
      titulo="Comércio Varejo — Simples Nacional"
      descricao="Templates para clientes do Simples Nacional — DAS unificado mensal, DEFIS anual, NFC-e. Rotina simplificada."
      glossario={[
        { termo: 'DAS', texto: 'Documento de Arrecadação do Simples Nacional — guia única consolidando ICMS, ISS, IRPJ, CSLL, PIS, COFINS, INSS-patronal. Vencimento dia 20.' },
        { termo: 'Anexo I', texto: 'Anexo da LC 123/2006 para comércio. Alíquotas progressivas de 4% a 19% conforme faturamento acumulado em 12 meses.' },
        { termo: 'DEFIS', texto: 'Declaração de Informações Socioeconômicas e Fiscais — anual obrigatória até 31/03 do ano seguinte.' },
        { termo: 'DeSTDA', texto: 'Declaração Mensal de Substituição Tributária e DIFAL — para Simples com inscrição estadual ativa.' },
        { termo: 'NFC-e', texto: 'Nota Fiscal do Consumidor Eletrônica — substituiu cupom fiscal no ES. Exigida para varejo.' },
      ]}
      cadeias={{
        onboarding: {
          nome: 'Onboarding (1×)',
          descricao: 'Verificação Simples, identificação de Anexo, configuração NFC-e.',
          templates: ['Onboarding Comércio Simples'],
        },
        mensal: {
          nome: 'Rotina Mensal (12×/ano)',
          descricao: 'DAS unificado → DeSTDA (se IE) → folha simplificada (FGTS separado).',
          templates: ['Mensal Comércio Simples', 'Coleta + DAS Simples', 'DeSTDA Simples (opcional — se IE)', 'Folha Simples + eSocial Simplificado (opcional — se empregados)'],
        },
        anual: {
          nome: 'Rotina Anual (1×)',
          descricao: 'DEFIS até 31/março.',
          templates: ['Anual Simples', 'DEFIS Simples'],
        },
      }}
      particularidades={
        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
          <li><strong>DAS único</strong> — consolida todos os tributos (ICMS, ISS, IRPJ, CSLL, PIS, COFINS, INSS-patronal). Cliente paga uma única guia mensal.</li>
          <li><strong>Sem ECD/ECF</strong> — Simples Nacional é dispensado das escriturações federais.</li>
          <li><strong>NFC-e</strong> — varejistas em ES devem emitir NFC-e (substituiu cupom fiscal). Sistema de emissão é responsabilidade do cliente.</li>
          <li><strong>DeSTDA</strong> — só obrigatória para Simples com inscrição estadual ativa. Vencimento dia 20.</li>
          <li><strong>Sublimite ES</strong> — R$ 3,6 mi (estadual). Acima disso, perde direito ao Simples no ICMS.</li>
        </ul>
      }
      casos={[
        { titulo: 'Cliente cresceu — perdeu direito ao Simples?', resposta: <>Verificar faturamento acumulado em 12 meses. Acima de R$ 4,8 mi (federal) ou R$ 3,6 mi (ICMS-ES), perde direito. Migração obrigatória para Lucro Presumido.</> },
        { titulo: 'NFC-e do cliente parou de emitir', resposta: <>Sistema de NFC-e é responsabilidade do cliente — verificar conexão SEFAZ-ES, certificado digital A1 e CSC (Código de Segurança do Contribuinte). Pode ser SEFAZ-ES fora do ar.</> },
        { titulo: 'Quero migrar do Simples para Presumido', resposta: <>Pedido formal no Portal do Simples Nacional. Atenção: opção é anual (até janeiro do ano seguinte). Use os templates de Atacadista/Indústria/Tech conforme atividade.</> },
      ]}
    />
  )
}
