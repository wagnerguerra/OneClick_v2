'use client'

import {
  BadgeCheck, Upload, FileLock, AlertTriangle, RefreshCw,
  Lightbulb, Info, ArrowRight, Calendar, Server, Database,
} from 'lucide-react'
import { Badge } from '@saas/ui'
import { ArticleShell } from '../_components/article-shell'
import { Section, Step, Callout, QuickLink, DefRow } from '../_components/article-blocks'

const MODULO_COLOR = 'var(--mod-legalizacao, #e879f9)' // fuchsia (Legalização — Certificados)
const FAQ_COLOR = 'var(--mod-faq, #0891b2)'

export default function FaqGestaoCertificadosPage() {
  return (
    <ArticleShell
      modulo="Gestão de Certificados"
      moduloColor={MODULO_COLOR}
      icon={BadgeCheck}
      titulo="Certificados Digitais: cadastro, importação e renovação"
      descricao="Gerenciar certificados A1 (PFX) dos clientes, importar em lote do OneClick V1 e acompanhar vencimentos."
    >
      <Section icon={Info} titulo="Conceitos importantes" cor={FAQ_COLOR}>
        <div className="space-y-2 text-sm">
          <DefRow termo="A1 vs A3" texto="A1 = arquivo (PFX/PEM) — sistema usa esse. A3 = hardware (token/cartão) — não suportado pelo SaaS." />
          <DefRow termo="PFX" texto="Container PKCS#12 com certificado + chave privada, protegido por senha." />
          <DefRow termo="ICP-Brasil" texto="Padrão obrigatório para certificados aceitos pela Receita. Emitido por ARs credenciadas (Serasa, Certisign, etc)." />
          <DefRow termo="Vencimento" texto="A1 tem validade de 1 ano. Sistema alerta com 30 dias de antecedência." />
          <DefRow termo="Status" texto="Ativo (válido e dentro do prazo) · Vencendo (próximos 30 dias) · Expirado · Revogado (ICP-Brasil revogou antes do prazo)." />
        </div>
      </Section>

      <h2 className="text-base font-bold pt-2">Cadastro</h2>

      <Step n={1} cor={MODULO_COLOR} icon={Upload} titulo="Subir certificado individual" rota="/gestao-certificados → + Novo">
        <p>Para cada certificado:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Selecione o <strong>cliente</strong> ao qual pertence</li>
          <li>Faça upload do arquivo <strong>PFX</strong> (drag-and-drop ou click)</li>
          <li>Informe a <strong>senha</strong> do PFX (criptografada antes de salvar)</li>
          <li>Sistema valida assinatura e extrai automaticamente: CNPJ/CPF do titular, validade, emissor</li>
        </ul>
        <Callout tipo="aviso">
          Certificados que não passam na validação (PFX corrompido, senha errada,
          fora ICP-Brasil) são <strong>rejeitados</strong> e não persistem. Mensagem
          de erro mostra o motivo.
        </Callout>
      </Step>

      <Step n={2} cor={MODULO_COLOR} icon={Database} titulo="Importação em lote do OneClick V1" rota="/gestao-certificados → Importar V1">
        <p>
          Se o escritório vinha do legado (Node + MySQL <code className="text-[11px]">oneclick_fiscal_serpro</code>),
          existe uma rotina de migração:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Sistema lê arquivos PFX armazenados na pasta do legado</li>
          <li>Cruza com a tabela de certificados antiga (CNPJ + senha)</li>
          <li>Tenta vincular ao cliente correspondente no novo sistema (por CNPJ)</li>
          <li>Mostra preview com OK / Conflitos / Não pareados antes de confirmar</li>
        </ul>
        <Callout tipo="dica">
          Faça a importação em lote uma vez no setup inicial. Depois, novos certificados
          devem ser cadastrados individualmente conforme renovação.
        </Callout>
      </Step>

      <h2 className="text-base font-bold pt-2">Operação</h2>

      <Step n={3} cor={MODULO_COLOR} icon={Calendar} titulo="Acompanhar vencimentos" rota="Dashboard widget Certificados Digitais">
        <p>O widget mostra:</p>
        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 border-emerald-200 text-emerald-700">Ativos</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 border-amber-200 text-amber-700">Vencendo (30 dias)</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-orange-50 border-orange-200 text-orange-700">Vencendo (60 dias)</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-red-50 border-red-200 text-red-700">Vencidos</Badge>
          <Badge variant="outline" className="text-[10px] h-5 bg-gray-50 border-gray-200 text-gray-700">Revogados</Badge>
        </div>
        <Callout tipo="info">
          Click em &quot;Vencendo&quot; abre a lista pré-filtrada — atalho para iniciar o
          processo de renovação proativamente.
        </Callout>
      </Step>

      <Step n={4} cor={MODULO_COLOR} icon={RefreshCw} titulo="Renovação" rota="ação por linha → Renovar">
        <p>
          Quando o cliente emite o novo certificado A1 (validade renovada):
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Em /gestao-certificados, encontre o registro existente</li>
          <li>Clique em <strong>&quot;Renovar&quot;</strong> e suba o novo PFX + senha</li>
          <li>O antigo é arquivado (mantido para auditoria) e o novo entra em vigor imediatamente</li>
        </ul>
        <Callout tipo="aviso">
          Se subir o novo PFX como &quot;novo certificado&quot; em vez de renovação,
          o sistema fica com 2 ativos para o mesmo cliente — pode causar confusão.
          Use sempre <strong>Renovar</strong>.
        </Callout>
      </Step>

      <Step n={5} cor={MODULO_COLOR} icon={Server} titulo="Onde os certificados são usados" rota="—">
        <p>Internamente, o sistema usa o PFX para:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Caixa Postal e-CAC — leitura automática de mensagens fiscais</li>
          <li>CND federais — consulta com procuração no e-CAC</li>
          <li>DCTFWeb — sincronização de débitos</li>
          <li>Situação Fiscal SERPRO — consulta on-demand</li>
          <li>Algumas SEFAZ estaduais (ES, SP, MG) — CNDs estaduais</li>
        </ul>
        <Callout tipo="dica">
          Cliente sem certificado ainda pode ser cadastrado e operado, mas as
          consultas automáticas (Caixa Postal, CND, DCTFWeb) ficam <strong>desabilitadas</strong>{' '}
          para ele até que um certificado seja vinculado.
        </Callout>
      </Step>

      <Section icon={Lightbulb} titulo="Casos comuns" cor={FAQ_COLOR}>
        <div className="space-y-3">
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Cliente perdeu o PFX e a senha</p>
            <p className="text-foreground/70">
              Não há recuperação — emita novo certificado na AR (Certisign, Serasa, etc).
              Custo médio R$ 200-300 por certificado A1. Cliente pode usar revogado para
              alguns dias até o novo chegar (sistema pula automaticamente).
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Senha do PFX rejeitada na validação</p>
            <p className="text-foreground/70">
              1. Confira a senha no Adobe Reader ou similar (abrir o PFX). 2. Se a senha
              tem caracteres especiais, garanta que está digitando no campo correto sem
              autocomplete. 3. Em último caso, emita novo certificado.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Certificado A3 (token/cartão)</p>
            <p className="text-foreground/70">
              <strong>Não é suportado</strong> — o SaaS roda em servidor remoto e não tem
              acesso ao hardware do cliente. Para automatizar consultas, peça ao cliente
              um A1 (arquivo) — pode ter os dois em paralelo, A3 para uso pessoal e A1
              para integrações.
            </p>
          </div>
          <div className="rounded-md border p-3 text-[12px]">
            <p className="text-sm font-semibold mb-1">Certificado revogado pela AR</p>
            <p className="text-foreground/70">
              Status muda para <strong>Revogado</strong> automaticamente na próxima
              consulta de validade. Não é apagado — fica no histórico. Cliente precisa
              emitir novo e a equipe substitui (passo 4).
            </p>
          </div>
        </div>
      </Section>

      <Section icon={ArrowRight} titulo="Atalhos rápidos" cor={FAQ_COLOR}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QuickLink href="/gestao-certificados" label="Gestão de certificados" cor={MODULO_COLOR} />
          <QuickLink href="/configuracoes/certificado" label="Certificado do escritório" cor={MODULO_COLOR} />
          <QuickLink href="/faq/caixapostal-ecac" label="Uso em Caixa Postal e-CAC" cor={MODULO_COLOR} />
          <QuickLink href="/faq/cnds-federais" label="Uso em CND Federais" cor={MODULO_COLOR} />
        </div>
      </Section>
    </ArticleShell>
  )
}
