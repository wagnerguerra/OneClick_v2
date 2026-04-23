# Plano de Migracao — Modulo de Clientes (SERPRO2 → OneClick Code)

> Analise completa de gaps entre o SERPRO2 legado e o novo sistema.
> Data: 2026-04-15

---

## Status Atual por Aba

| # | Aba | Status | Cobertura |
|---|-----|--------|-----------|
| 1 | Detalhes | IMPLEMENTADA | 95% |
| 2 | Comercial | IMPLEMENTADA | 90% |
| 3 | Fiscal | IMPLEMENTADA | 95% (IMUNE/ISENTA adicionados) |
| 4 | Contabil | IMPLEMENTADA | 80% (arvore de contas, CRUD, link publico, import) |
| 5 | Legalizacao | IMPLEMENTADA | 85% (POP, Socios, Acessos, Vencimentos, Links) |
| 6 | Obrigacoes | PLACEHOLDER | 0% (tambem placeholder no SERPRO2) |
| 7 | Servicos | IMPLEMENTADA | 95% (restricao lider + validacao backend) |
| 8 | Particularidades | IMPLEMENTADA | 90% (historico de alteracoes implementado) |
| 9 | Protocolos | PLACEHOLDER | 0% (tambem placeholder no SERPRO2) |
| 10 | Reclamacoes | PLACEHOLDER | 0% (tambem placeholder no SERPRO2) |
| 11 | Usuarios | PLACEHOLDER | 0% (tambem placeholder no SERPRO2) |
| 12 | Logs | IMPLEMENTADA | 90% |

**Cross-module: User → Clientes**: IMPLEMENTADO (aba Clientes no cadastro de usuarios)
**Progresso do cadastro**: IMPLEMENTADO (campos pendentes expandiveis na sidebar)

**Cross-module: User → Clientes**: IMPLEMENTADO (aba Clientes no cadastro de usuarios)

---

## Gaps Detalhados por Aba

### 1. DETALHES (95% completa)

#### Implementado:
- Razao Social, CNPJ, Nome Fantasia, Tipo Cliente
- Consultar CNPJ (BrasilAPI), Completar dados
- Contatos (CRUD com contato principal)
- Endereco completo com busca de CEP
- Google Maps embed
- Integracoes (ID SCI, ID OneClick, ID Omie)

#### Gaps:
| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| Telefone secundario | Suporta multiplos telefones | Campo unico | BAIXA | 1h |
| Email secundario | Suporta multiplos emails | Campo unico | BAIXA | 1h |
| Avatar/logo upload funcional | Upload para S3 | Campo URL manual | MEDIA | 3h |

---

### 2. COMERCIAL (90% completa)

#### Implementado:
- Sub-tabs: Cadastros, Contratos, Orcamentos, Historicos
- Cadastros: Grupo, Data Entrada/Saida, Categoria, Situacao, Origem, Observacoes
- Contratos: Parametros sugeridos SCI, graficos ERP, arquivos
- Historicos: Chat equipe/cliente com usuario e timestamp

#### Gaps:
| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| Atividades vinculadas | Catalogo de atividades com vinculo ao cliente | Apenas tags de areas | MEDIA | 4h |
| Beneficios fiscais | Catalogo de beneficios com vinculo ao cliente | Nao existe | MEDIA | 4h |
| Orcamentos completo | CRUD de orcamentos com itens | Placeholder "Orcamentos" | BAIXA | 8h |
| Imagens no historico | Suporte a imagens inline no chat | Apenas texto | BAIXA | 3h |

---

### 3. FISCAL (85% completa)

#### Implementado:
- Tributacao (4 opcoes enum)
- Regime contabil (Caixa/Competencia)
- Inscricao Estadual e Municipal
- Botoes de integracao SCI
- Sub-tab "Situacao Fiscal" com links para portais

#### Gaps:
| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| IMUNE/ISENTA na tributacao | 6 opcoes (inclui IMUNE, ISENTA, OUTRO) | 4 opcoes (enum TaxRegime) | ALTA | 30min |
| Links rapidos para portais | SEFAZ, e-CAC, Simples Nacional | Ja implementados | - | - |

---

### 4. CONTABIL (0% — COMPLEXO)

#### O que o SERPRO2 faz:
- Arvore hierarquica de contas do Balancete (para BI)
- Drag-and-drop para reorganizar categorias
- Integracao com SCI para importar plano de contas
- Geracao de link publico para dashboard BI do cliente

#### Recomendacao:
**ADIAR para fase 2.** E o modulo mais complexo e depende fortemente da integracao SCI/BI que ainda nao esta pronta. Manter placeholder.

| Prioridade | Esforco estimado |
|------------|-----------------|
| BAIXA (fase 2) | 20-30h |

---

### 5. LEGALIZACAO (0% — IMPLEMENTAVEL)

#### O que o SERPRO2 faz (6 sub-tabs):

**5a. POP: Registros Gerais**
- Campos: IE, IM, NIRE, RG Edificacao, Codigo Simples
- Secao Bombeiros: Tipo/Ocupacao, Metragem, Rota, Projeto, Capacidade, Coordenadas

**5b. Socios**
- Lista de socios vinculados ao cliente (ja temos model Socio no Prisma)
- Exibicao read-only com link para editar socio

**5c. Acessos**
- CRUD de registros de acesso (credenciais de portais, chaves, senhas)
- Campos: portal, usuario, senha, observacoes

**5d. Vencimentos**
- CRUD de datas de vencimento (certificados, alvaras, licencas)
- Campos: descricao, dataVencimento, status, alertaDias

**5e. Andamentos**
- CRUD de registros de andamento/progresso
- Campos: descricao, tipo, status, dataInicio, dataConclusao

**5f. CNAEs**
- Lista de CNAEs do cliente (codigo + descricao)

#### Recomendacao:
**Implementar em 3 fases:**

| Fase | Sub-tab | Prioridade | Esforco |
|------|---------|------------|---------|
| 1 | POP + Socios (read-only) | ALTA | 4h |
| 2 | Acessos + Vencimentos | MEDIA | 6h |
| 3 | Andamentos + CNAEs | BAIXA | 4h |

**Modelos Prisma necessarios:**
- `ClienteAcesso` (portal, usuario, senha_encrypted, obs)
- `ClienteVencimento` (descricao, dataVencimento, status, alertaDias)
- `ClienteAndamento` (descricao, tipo, status, datas)
- `ClienteCnae` (codigo, descricao, principal)
- Campos no Cliente: NIRE, RG edificacao, cod simples, bombeiros_*

---

### 6. OBRIGACOES (0% — Placeholder em ambos)

Tanto no SERPRO2 quanto no nosso sistema esta como "Em breve".
**Manter placeholder.** Implementar junto com o modulo Corporativo → Obrigacoes.

---

### 7. SERVICOS (80% completa)

#### Implementado:
- Tabela de areas contratadas com checkbox
- Selects de Responsavel/Substituto filtrados por area
- Dropdown Acoes: Gerenciar Parametros, Rotina de Encerramento
- Dialog de Parametros com slider 0-5, agrupamento por tipo, copiar estrutura
- Dialog de Encerramento com data + observacoes
- Badge "Encerrado" visual
- areaLeaderId retornado (preparado para restricao)
- Importacao do OneClick v1

#### Gaps:
| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| Restricao por lider de area | Apenas lider/master pode alterar responsavel | Qualquer user com permissao pode | ALTA | 2h |
| pode_alterar_responsavel por area | Flag que vem do backend | Nao implementado | ALTA | 1h |
| Complexidade multi-fator | 4 fatores separados (manual, volume, regime, particularidades) | Tipo generico unico | MEDIA | 4h |
| Sincronizacao de complexidade_peso | Recalcula peso apos salvar parametros | Nao calcula | MEDIA | 2h |
| Permissoes granulares | gerenciar_servicos_contratados, gerenciar_responsaveis, gerenciar_parametros | Apenas writeProcedure generico | MEDIA | 3h |

---

### 8. PARTICULARIDADES (75% completa)

#### Implementado:
- Textarea por area contratada
- Salvamento individual e global
- Exibicao de quem editou e quando

#### Gaps:
| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| Historico de alteracoes | Tabela particularidades_historico com valor anterior/novo | Nao registra historico | MEDIA | 2h |
| Restricao por area | Apenas responsavel/lider/substituto podem editar | Qualquer user pode | MEDIA | 2h |
| Area Financeiro especial | Visibilidade restrita com permissao especifica | Nao existe | BAIXA | 1h |

---

### 9-11. PROTOCOLOS, RECLAMACOES, USUARIOS (Placeholders em ambos)

Manter como placeholder. Implementar quando os modulos Corporativo correspondentes estiverem prontos.

---

### 12. LOGS (90% completa)

#### Implementado:
- Audit trail com ClienteEvent
- Tipo: created, updated, deleted, restored
- Registro de changes (JSON com from/to)
- Inclusao de usuario responsavel

#### Gaps:
| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| Filtro por tipo de evento | Dropdown para filtrar created/updated/etc | Lista completa sem filtro | BAIXA | 1h |
| Paginacao de eventos | Paginacao server-side | Carrega todos | BAIXA | 1h |

---

### SIDEBAR (Modo Edicao)

#### Implementado:
- Progresso do cadastro (16 campos)
- Areas contratadas (tags coloridas)
- Arquivos (upload/download/delete)

#### Gaps:
| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| Clique no progresso abre modal de campos pendentes | Modal com lista de campos faltantes, clicavel para navegar | Apenas porcentagem visual | MEDIA | 3h |
| Atividades e Beneficios separados | Catalogos independentes com vinculo | Apenas tags de areas | MEDIA | 4h |
| Contatos na sidebar | Card de contatos resumido na sidebar | Contatos so na aba Detalhes | BAIXA | 2h |

---

### CROSS-MODULE

| Item | SERPRO2 | Nosso | Prioridade | Esforco |
|------|---------|-------|------------|---------|
| User → Clientes | Aba mostrando clientes vinculados ao usuario | IMPLEMENTADO | - | - |
| Area → Clientes | Clientes contratados por area | Nao existe | BAIXA | 2h |
| Socio → Clientes | Vinculo socio-cliente bidirecional | Ja existe via clienteId | - | - |

---

## Plano de Implantacao (Ordem de Prioridade)

### FASE 1 — Imediata (1-2 dias)

| # | Tarefa | Esforco | Impacto |
|---|--------|---------|---------|
| 1.1 | Adicionar IMUNE/ISENTA ao enum TaxRegime | 30min | Corrige dados do legado |
| 1.2 | Restricao de responsavel por lider de area (Servicos) | 2h | Seguranca |
| 1.3 | Legalizacao — POP: Registros Gerais (IE/IM ja existem, adicionar NIRE, bombeiros) | 4h | Funcionalidade |
| 1.4 | Legalizacao — Socios (exibir socios vinculados, read-only) | 2h | Funcionalidade |

### FASE 2 — Curto prazo (3-5 dias)

| # | Tarefa | Esforco | Impacto |
|---|--------|---------|---------|
| 2.1 | Legalizacao — Acessos (CRUD de credenciais) | 4h | Funcionalidade |
| 2.2 | Legalizacao — Vencimentos (CRUD de prazos) | 4h | Funcionalidade |
| 2.3 | Historico de particularidades (audit trail) | 2h | Compliance |
| 2.4 | Modal de campos pendentes no progresso | 3h | UX |
| 2.5 | Permissoes granulares nos Servicos | 3h | Seguranca |

### FASE 3 — Medio prazo (1-2 semanas)

| # | Tarefa | Esforco | Impacto |
|---|--------|---------|---------|
| 3.1 | Legalizacao — Andamentos + CNAEs | 4h | Funcionalidade |
| 3.2 | Complexidade multi-fator (volume, regime, etc.) | 4h | Funcionalidade |
| 3.3 | Catalogo de Atividades e Beneficios | 8h | Funcionalidade |
| 3.4 | Upload de logo funcional (S3) | 3h | UX |

### FASE 4 — Longo prazo

| # | Tarefa | Esforco | Impacto |
|---|--------|---------|---------|
| 4.1 | Contabil — BI Balancete (arvore SCI) | 20-30h | Funcionalidade avancada |
| 4.2 | Orcamentos completo | 8h | Funcionalidade |
| 4.3 | Obrigacoes (quando modulo corporativo existir) | TBD | Depende de outro modulo |

---

## Resumo Quantitativo

| Metrica | Valor |
|---------|-------|
| Abas implementadas | 6 de 12 (50%) |
| Abas placeholder no SERPRO2 tambem | 3 (Obrigacoes, Protocolos, Reclamacoes) |
| Abas realmente pendentes | 3 (Contabil, Legalizacao, Usuarios) |
| Funcionalidades implementadas | ~85% do core |
| Esforco Fase 1 | ~9h |
| Esforco Fase 2 | ~16h |
| Esforco Fase 3 | ~19h |
| Esforco total (sem Contabil) | ~44h |

---

## Decisoes Arquiteturais Pendentes

1. **Prisma Generate**: Precisa parar a API para regenerar o client. Todas as queries de Servicos/Particularidades usam raw SQL como workaround.

2. **Permissoes**: O SERPRO2 usa permissoes granulares por funcao (gerenciar_servicos, gerenciar_responsaveis, gerenciar_parametros). Nosso sistema usa writeProcedure/deleteProcedure generico por modulo. Decisao: implementar sub-permissoes no modulo `clientes`?

3. **Criptografia de senhas**: A aba Acessos (Legalizacao) armazena credenciais de portais. Precisam ser criptografadas no banco (AES-256 ou similar).

4. **Complexidade multi-fator**: Manter o modelo simples (tipo generico) ou migrar para o modelo SERPRO2 com 4 fatores fixos (manual, volume, regime, particularidades)?
