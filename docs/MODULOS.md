# Módulos do Sistema

Lista canônica dos módulos do SaaS ERP/CRM, agrupados por bloco. Referenciada pelo `CLAUDE.md`.

## CADASTROS
- Áreas
- Cargos
- Colaboradores
- Clientes
- Empresas
- Fornecedores
- Obrigações Fixas
- Obrigações Sob Demanda
- Sócios
- Usuários

## CORPORATIVO / COMERCIAL
- Agenda Corporativa
- Coleta e Recebimento de Documentos
- Contatos
- Gestão de Ativos
- Controle de Estoque
- CRM
- Gestão de Benefícios Fiscais
- Gestão de Certificados
- Gestão de Contratos
- HelpDesk
- Obrigações e Serviços
- Orçamentos
- Processos
- Quadro Societário

## FISCAL
- NFe Distribuição (SEFAZ NFeDistribuicaoDFe)
- NFS-e Nacional (ADN — Ambiente de Dados Nacional)
- DCTFWeb
- CND (Receita Federal, Municipal, Estadual)
- CNDT (TST)
- CRF (FGTS)
- Caixa Postal e-CAC
- DT-e SEFAZ ES (Agência Virtual)
- DANFE / Galeria de Notas
- **Ferramentas (slug `ferramentas-fiscal`)** — subitem "Ferramentas" no bloco Fiscal; integração das ferramentas do webapp. Sub-permissões por tool (opt-out): `sped`, `nfe`, `sped-merge`, `sci-consolidado`, `comparacao-planilhas`, `comparacao-nfse`, `sci-portal-nacional`, `nfse-pdf`. (No piloto: SPED.) Ver `docs/plano-ferramentas.md`.

## CONTÁBIL
- Categorias de Balancete
- Dashboard Financeiro
- **Ferramentas (slug `ferramentas-contabil`)** — subitem "Ferramentas" no bloco Contábil. Sub-permissões por tool: `gnre`, `extrato-edit`. (Implementação na Fase 2/3.)

## CONTÁBIL
- Categorias de Balancete
- Dashboard Financeiro
- Tratamento de Lançamentos (importação → Modelo de Tratamento → exportação SCI)

## TI
- Gestão de Ativos
- HelpDesk
- Projetos

## QUALIDADE
- Painel da Qualidade
- Aquisições
- Análise de Contexto
- Capacitações
- Documentos Internos
- Documentos Externos
- Tabelas de Registros
- Elogios
- Melhorias
- Não Conformidades
- Reclamações
- Reuniões
- Sugestões

## CONFIGURAÇÕES
- Configurações Gerais
- Design System (master)
- Cores de Módulo (master)
- FAQ

## Cores por bloco (slugs de `module_colors`)
`cadastros`, `comercial`, `corporativo`, `administrativo`, `legalizacao`, `trabalhista`, `fiscal`, `contabil`, `ti`, `qualidade`, `configuracoes`, `processos`, `faq`, `perfil`.
