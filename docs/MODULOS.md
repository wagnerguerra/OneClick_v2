# Módulos do Sistema

Lista canônica dos módulos do SaaS ERP/CRM, agrupados por bloco. Referenciada pelo `CLAUDE.md`.

**Fonte de verdade:** a sidebar esquerda — `export const navigation` em `apps/web/src/lib/navigation.ts`. Este doc **espelha** aquela declaração; se divergir, o `navigation.ts` vence e este doc deve ser corrigido. Legendas: `(wip)` = escondido do menu (rota não publicada); `(master)` = visível só para o master global da plataforma.

## CADASTROS
- Áreas (`/areas`)
- Cargos (`/cargos`)
- Clientes (`/clientes`)
- Colaboradores (`/colaboradores`)
- Empresas (`/empresas`, master)
- Fornecedores (`/fornecedores`)
- Grupos Empresariais (`/grupos-empresariais`, wip)
- Serviços e Obrigações (`/servicos`)
- Sócios (`/socios`)
- Usuários (`/usuarios`)

## COMERCIAL
- Painel Comercial (`/comercial`)
- CRM (`/crm`) — sub: Funil de captação (IA) (`/crm/funil`, sub-perm `crm.acessar_funil_lead`)
- WhatsApp (`/whatsapp`)
- Contratos (`/contratos`) — subs: Gestão de Contratos (`/comercial/gestao-contratos`), Custeio de Clientes (`/comercial/custeio`), Cláusulas (`/clausulas`), Modelos de Contrato (`/contrato-templates`), Gráficos Contrato × ERP (wip), Relatórios de Contratos (wip)
- Orçamentos (`/orcamentos`) — subs: Custeio por Cliente (wip), Pesquisa de Satisfação (`/orcamentos/relatorios?tab=satisfacao`)
- Relatórios Comerciais (`/comercial/relatorios`)

## ADMINISTRATIVO
- Agenda Corporativa (`/agenda`)
- Coleta e Recebimento (`/coleta-documentos`)
- Contatos (`/contatos`)
- Gerenciador de Serviços (`/meus-servicos`)
- Minhas Obrigações (`/minhas-obrigacoes`)
- Acessórias (`/acessorias`)
- Processos (`/processos`)
- Organograma (`/organograma`, wip)

## LEGALIZAÇÃO
- Benefícios Fiscais (`/beneficios-fiscais`)
- Certificados Digitais (`/gestao-certificados`)
- Certidões e Alvarás (`/certidoes-cnd`)
- Quadro Societário (`/quadro-societario`, wip)

## TRABALHISTA
- Banco de Horas (`/banco-horas`, wip)
- Benefícios (`/beneficios`)
- Controle de Férias (`/controle-ferias`)
- FGTS Digital (`/fgts-digital`, wip)
- Importação de Folha (`/folha-pagamento`)
- Espelho da Folha (`/folha-bi`)

## FISCAL
- Caixa Postal e-CAC (`/caixapostal`)
- DANFE (NFe → PDF) (`/danfe`)
- DT-e ES (`/dte`)
- DCTFWeb (`/dctfweb`)
- Obrigações e Serviços (`/obrigacoes-servicos`, wip)
- Situação Fiscal (`/situacao-fiscal`)
- Reforma Tributária (`/reforma-tributaria`)
- **Ferramentas (slug `ferramentas-fiscal`)** (`/ferramentas/fiscal`) — subitem "Ferramentas" do bloco Fiscal; integração das ferramentas do webapp. Sub-permissões por tool (opt-out): SPED→XLSX (`sped`), XLSX→SPED merge (`sped-merge`), NFe XML→XLSX (`nfe`), Consolidado SCI (`sci-consolidado`), Comparador SEFAZ × SCI (`comparacao-planilhas`), Comparador NFS-e OCR (`comparacao-nfse`), Conciliador NFS-e (`sci-portal-nacional`), NFS-e → PDF (`nfse-pdf`). (No piloto: SPED.) Ver `docs/plano-ferramentas.md`.

## CONTÁBIL
- Categorias de Balancete (`/bi-categorias-balancete`)
- Dashboard Financeiro (`/bi-faturamento`)
- **Ferramentas (slug `ferramentas-contabil`)** (`/ferramentas/contabil`) — subitem "Ferramentas" do bloco Contábil. Sub-permissões por tool: Extrator GNRE (`gnre`), Editor de Extrato (`extrato-edit`). (Implementação na Fase 2/3.)
- Tratamento de Lançamentos (`/tratamento-lancamentos`) — importação → Modelo de Tratamento → exportação SCI

## TI
- Gestão de Ativos (`/ativos`)
- HelpDesk (`/helpdesk`)
- Projetos (`/projetos`)
- Relatórios da TI (`/relatorios-ti`)

## QUALIDADE
- Análise de Contexto (`/analise-contexto`)
- Aquisições (`/aquisicoes`)
- Capacitações (`/capacitacoes`)
- Documentos Externos (`/documentos-externos`)
- Documentos Internos (`/documentos-internos`)
- Elogios (`/elogios`)
- Melhorias (`/melhorias`)
- Não Conformidades (`/nao-conformidades`)
- Painel da Qualidade (`/qualidade`)
- Reclamações (`/reclamacoes`)
- Reuniões (`/reunioes`)
- Sugestões (`/sugestoes`)
- Tabelas de Registros (`/tabelas-registros`)

## AJUDA
- FAQ's (`/faq`)
- Design System (`/admin/design-system`, master)
- App Mobile (`/admin/app-mobile`)
- Modelos de E-mail (`/admin/email-templates`)
- Console SQL (`/admin/sql-console`, master)
- Sobre (`/sobre`)

## CONFIGURAÇÕES
- Configurações Gerais (`/configuracoes`, master)
- Painéis de TV (`/paineis`)
- Centro de Agendamentos (`/configuracoes/agendamentos`)
- Chat Interno (`/configuracoes/chat`)
- Certificado Digital (`/configuracoes/certificado`, master)
- Stripe (`/configuracoes/stripe`, master)
- Empresas (tenants) (`/admin/empresas`, master)
- Planos e preços (`/admin/planos`, master)
- Assinatura de email (`/admin/assinatura-template`, master)
- Métricas (`/metricas`, master)
- Backup e Restore (`/backup-restore`, master)

## Cores por bloco (slugs de `module_colors`)
`cadastros`, `comercial`, `corporativo`, `administrativo`, `legalizacao`, `trabalhista`, `fiscal`, `contabil`, `ti`, `qualidade`, `configuracoes`, `faq`, `perfil`.

> Nota: os slugs de cor não são 1:1 com os grupos da sidebar. `corporativo` retinge rotas como `/dashboard`, `/meus-servicos`, `/minhas-obrigacoes` (ver `resolveSlug` em `apps/web/src/hooks/use-module-scope.ts`); `perfil` e `faq` têm cor própria. A **cobertura** de um passe segue o GRUPO da sidebar; a **cor/retint** de cada rota segue o `resolveSlug`.
