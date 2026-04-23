# PRD — Importação de balancetes do SCI (`/bi-categorias-balancete/`)

**Produto:** OneClick v2 (SERPRO2)  
**Escopo:** fluxo iniciado na página **`bi-categorias-balancete.html`** (rota limpa **`/bi-categorias-balancete/`**), item de menu **Ações → Importar Balancete**.  
**Referência de código:** `frontend/bi-categorias-balancete.html` (`iniciarAtualizarBalanceteCategorias`, `abrirModalAtualizarBalancete`), `backend/src/controllers/biController.js` (`refreshBalancete`, `refreshBalanceteStatus`), `backend/src/services/biBalanceteService.js` (`ensureBalanceteCacheAno`, `consultarBalanceteSciMes`, `persistirBalanceteMes`), `backend/src/services/sciErpService.js` (`runSciBalanceteDirect`).

---

## 1. Objetivo

Permitir que um usuário autenticado **importe para o MySQL da aplicação** os dados do **balancete contábil** de um cliente, **mês a mês**, consultando o **ERP SCI (Firebird)** e gravando em tabelas de cache (`bi_balancete_consultas`, `bi_balancete_linhas`, `fonte = 'sci'`), para posterior uso na **Matriz de Resultados**, **KPIs** e na tela de **contas do balancete** (categorias), **sem apagar** as personalizações do BI (nomes, ordem, hierarquia, “No BI”) salvo quando a opção de substituição de **linhas** do mês estiver ativa.

---

## 2. Personas e pré-requisitos

| Ator | Requisito |
|------|-----------|
| Usuário corporativo | Logado com JWT; header **`X-Empresa-Id`**; permissão implícita de acesso à API `/api/bi` (hoje só `authRequired` em `server.js`). |
| Cliente | Deve existir na empresa; possuir **`id_sistema` > 0** no cadastro (PRCODEMP / vínculo SCI). Se inválido, a API retorna **400** com mensagem explícita. |
| Infraestrutura | **SCI** acessível: `SCI_DSN`, `SCI_USER`, `SCI_PASSWORD` (ou equivalente em config de empresa); Firebird (`node-firebird` ou Python conforme implementação). |

**Resolução de empresa no SCI:** o serviço usa `resolveBalancetePrcodemp(documento, id_sistema)` — pode usar **PRCODEMP obtido pelo CNPJ** no SCI se divergir do `id_sistema` cadastrado; há log de aviso.

---

## 3. Jornada do usuário (UI em `/bi-categorias-balancete/`)

1. Usuário seleciona o **cliente** no dropdown com busca (`#biCatClienteWrap`).
2. Abre **Ações → Importar Balancete** (`#btnAtualizarBalanceteCat`).
3. Modal corporativo (**SweetAlert2** com `swal-corp-*`):
   - **Período “De”:** mês + ano.
   - **Período “Até”:** mês + ano (validação: “Até” ≥ “De”; `ref = ano*100 + mes`).
   - **Switch “Substituir contas e valores existentes”** (padrão **ligado**).
   - Texto de ajuda: se **desmarcado**, apenas contas/valores **novos** são adicionados; o que já existe **não é alterado**; **personalizações do BI não são alteradas** pela importação.
4. **Cancelar** fecha sem chamar API; **Importar** dispara o backend e abre feedback de progresso.
5. O front faz **polling** a cada **1,5 s** em `GET …/refresh-status` até `job.status` ser `done` ou `error`.
6. Ao concluir com sucesso parcial/total: Swal com resumo (**Importados / Pulados / Falhas** + log opcional) e **recarrega** as categorias (`carregarCategoriasBalanceteCliente`).

---

## 4. Contrato de API (importação)

### 4.1 Iniciar job

**`POST /api/bi/balancete/clientes/:clienteId/refresh`**

**Query string (obrigatório para este fluxo de período):**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `anoInicio` | int | Ano inicial do intervalo. |
| `mesInicio` | int | Mês inicial (1–12). |
| `anoFim` | int | Ano final. |
| `mesFim` | int | Mês final (1–12). |
| `substituirExistentes` | `0` \| `1` | Se `1` (padrão quando omitido no backend para este modo): **apaga linhas do mês** e reinsere; se `0`: **INSERT IGNORE** (não sobrescreve linhas existentes do mesmo `ref`+`conta_longa`). |

**Nota:** o `biController` também aceita modo **ano cheio** com `?ano=YYYY` quando **não** há período; a tela de categorias usa **sempre** o modo período (`anoInicio`…`mesFim`).

**Resposta imediata (202 lógica em JSON):**

```json
{ "sucesso": true, "started": true, "job": { "status": "running", "totalMeses": N, ... } }
```

- Se já existir job **running** para a mesma chave `(empresaId, clienteId, refInicio, refFim)`, retorna `started: false` e o job existente (idempotência de UI).

**Pré-validação no controller:**

- `clienteId` numérico válido.
- Cliente existe e **`id_sistema`** válido (> 0). Caso contrário **400** `"Cliente não possui id_sistema (SCI) vinculado"`.

### 4.2 Acompanhar job

**`GET /api/bi/balancete/clientes/:clienteId/refresh-status?refInicio=AAAAMM&refFim=AAAAMM`**

**Resposta:**

```json
{ "sucesso": true, "job": { "status": "running"|"done"|"error", "ok", "skipped", "failed", "totalMeses", "currentMes", "lastError", "errorsByMes", ... } }
```

- `job: null` se não houver job na memória para aquela chave (ex.: servidor reiniciado).

---

## 5. Processamento no backend (resumo técnico)

### 5.1 Orquestração

`refreshBalancete` → cria entrada em **`balanceteRefreshJobs`** (Map em memória) → dispara em **background** `ensureBalanceteCacheAno({ … refInicio, refFim, substituirExistentes, force, onProgress })` → ao terminar chama **`syncCategoriasFromLinhas`** (`preservarPersonalizacoes: true`) para **criar linhas em `bi_balancete_categorias_cliente`** que ainda não existem, **sem** apagar personalizações.

### 5.2 Loop por mês

`rangeMeses` gera lista `{ ano, mes, ref }` de `refInicio` até `refFim` inclusive.

Para cada `ref`:

1. Se **`force`** é falso **e** já existe registro em `bi_balancete_consultas` para aquele `ref` (cache “já atualizado”), o mês é **pulado** (`skipped++`).  
   **Importante:** em `refreshBalancete`, quando há **período** (`usoPeriodo`), o serviço é chamado com **`force: (query.force) || usoPeriodo`**, ou seja, **`force` fica sempre verdadeiro** nesse modo — na prática **cada mês do intervalo é reconsultado no SCI** (não há skip por cache). O contador **`skipped`** predomina em outros fluxos (ex.: atualização por ano sem forçar).
2. Caso contrário:
   - Calcula **`datai` / `dataf`** com `monthRange(ano, mes)` (primeiro e último dia do mês no formato esperado pelo SCI).
   - Chama **`consultarBalanceteSciMes`** com retry (3 tentativas, backoff).

### 5.3 Chamada ao SCI

`consultarBalanceteSciMes` → **`runSciBalanceteDirect`** em `sciErpService.js`:

- Parâmetros principais: **`prcodemp`** (empresa SCI), **`datini`/`datfin`**, **`ignoraZeramento`** (no serviço de balancete o fluxo fixa **1** conforme regra da procedure), **`ctaIni`/`ctaFin`**, **`codtpcc`**, **`refemp`** = `ref` (AAAAMM).
- Execução: conexão **Firebird** (DSN host:path, porta `SCI_PORT` default 3050), procedure tipo **`VSUC_SP_RETORNA_BALANCETE`** (detalhes e fallback Python estão em `sciErpService.js`).
- Retorno: array **`dados`** com linhas; colunas são **normalizadas** (aliases `CONTA_LONGA`, `NOME_CONTA`, débitos/créditos, saldos, `BDMOVIMENTO`).

### 5.4 Persistência MySQL

`persistirBalanceteMes`:

1. **UPSERT** em **`bi_balancete_consultas`** (`fonte='sci'`, `ref`, metadados da consulta, `payload_raw` JSON com as linhas brutas).
2. Se `substituirExistentes`: **DELETE** de `bi_balancete_linhas` para `(empresa_id, cliente_id, 'sci', ref)`.
3. **Deduplica** por conta (mapa por conta normalizada); regras especiais para **movimento** em contas **03/04** (crédito − débito quando o movimento vindo do SCI parece inconsistente).
4. **INSERT** em chunks em **`bi_balancete_linhas`** (`ON DUPLICATE KEY UPDATE` se substituir; `INSERT IGNORE` se não substituir).

### 5.5 Pós-processamento

- `limparExclusoesOrfas` (ou `limparTodasExclusoes` se `limparExclusoes` — não é o caso padrão deste fluxo da tela de categorias).
- Ao final do `refreshBalancete`, **`syncCategoriasFromLinhas`** garante categorias espelhando contas novas nas linhas.

---

## 6. Regras de negócio

| ID | Regra |
|----|--------|
| RN-01 | Importação é **sempre por cliente** e **empresa** (`empresa_id` + `cliente_id`). |
| RN-02 | Dados importados têm **`fonte = 'sci'`**. |
| RN-03 | **`ref`** identifica o mês (**AAAAMM**). |
| RN-04 | Sem **`id_sistema`** válido no cadastro, **não** chama SCI (erro 400). |
| RN-05 | **`substituirExistentes = false`** não altera linhas já existentes para aquele mês/conta; **`true`** remove linhas do mês e reinsere. |
| RN-06 | **Personalizações** em `bi_balancete_categorias_cliente` **não** são apagadas pela importação; `syncCategoriasFromLinhas` adiciona contas novas. |
| RN-07 | Parâmetros de faixa de contas (**`ctaIni`/`ctaFin`**) e **`codtpcc`** vêm de **`empresas`** (`sci_bal_cta_ini`, `sci_bal_cta_fin`, `sci_bal_codtpcc`) com fallback em **`.env`** (`SCI_BAL_CTA_INI`, `SCI_BAL_CTA_FIN`, `SCI_BAL_CODTPCC`). |
| RN-08 | Falha em **um** mês **não** interrompe obrigatoriamente os demais: contador `failed` incrementa e o job segue (`ensureBalanceteCacheAno` tolerante). |
| RN-09 | Job de refresh fica em **memória** (`Map`); reinício do Node **perde** o status (o front pode receber `job: null`). |

---

## 7. Configuração e variáveis de ambiente (SCI / balancete)

| Variável / campo | Uso |
|------------------|-----|
| `SCI_DSN`, `SCI_USER`, `SCI_PASSWORD` | Conexão Firebird. |
| `SCI_PORT`, `SCI_CHARSET`, `SCI_AUTH_LEGACY` | Conexão e autenticação. |
| `SCI_BAL_CTA_INI`, `SCI_BAL_CTA_FIN`, `SCI_BAL_CODTPCC` | Defaults se empresa não tiver override. |
| `SCI_BAL_DATE_STYLE`, `SCI_BAL_CONTABILIZACAO` | Mencionados em logs de troubleshooting (formato de data / tipo contabilização). |
| `SCI_BAL_NIVEIS` | Níveis passados à procedure (tail de parâmetros). |
| `empresas.sci_bal_*` | Overrides por empresa. |

---

## 8. Métricas de sucesso e mensagens ao usuário

- Resumo final com **Importados** (`ok`), **Pulados** (`skipped` — cache já existia e `force` não forçou re-leitura), **Falhas** (`failed`).
- Se `ok > 0`: mensagem de sucesso e **reload** da grade de categorias.
- Se `failed > 0` e `ok === 0`: erro “Nenhum mês importado” com log.
- Se `ok === 0` e `failed === 0` e `skipped === total`: informação “Nenhum novo dado” (cenário raro nesta tela, pois o import por período força reconsulta; pode ocorrer se a lógica de `force` mudar ou em outro cliente da API).

---

## 9. Fora de escopo deste PRD

- **Excluir balancete** (outro fluxo: `DELETE …/excluir-periodo`) — apenas mencionado como operação complementar na mesma tela.
- **Backup / restaurar JSON** — não passa pelo SCI.
- **Simulador** (`GET/POST …/simular`) — apenas consulta SCI sem persistir da mesma forma que o job completo.

---

## 10. Critérios de aceite (replicação na nova plataforma)

- [ ] Modal com período De/Até + switch substituir, validações de `ref`.
- [ ] `POST refresh` com query idêntica e tratamento de `started: false` quando job em execução.
- [ ] Polling `refresh-status` com `refInicio`/`refFim` até `done`/`error`.
- [ ] Bloqueio sem `id_sistema` com mesma mensagem de negócio.
- [ ] Persistência em consultas + linhas + sync de categorias sem apagar personalização.
- [ ] Configuração de `ctaIni/ctaFin/codtpcc` por empresa e env.
- [ ] SCI indisponível: falhas por mês refletidas em `failed` / `errorsByMes`, sem travar a UI além do esperado.

---

*Documento PRD alinhado ao comportamento atual do código (SERPRO2).*
