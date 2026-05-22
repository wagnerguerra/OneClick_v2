# Integração Acessórias — Base de Conhecimento

> **Propósito**: documentar como o Acessórias modela o controle de entregas e
> obrigações, pra termos um mapa pronto caso decidamos internalizar essa lógica
> no OneClick no futuro. Cada nova descoberta sobre a API/sistema deve ser
> incorporada aqui.

**Fontes**:
- API REST oficial: `https://api.acessorias.com`
- Documentação: `https://api.acessorias.com/documentation`
- Doc interno: `/docs/A API do Acessorias.docx` (entrevista técnica com suporte)

---

## 1. Conceitos do domínio Acessórias

### 1.1 Empresa (`Company`)
Representa um cliente do escritório contábil. Identificada por **CNPJ** (chave de
negócio) e tem associadas:
- Departamentos (Fiscal, Trabalhista, Contábil, etc.)
- Contatos (pessoas-chave)
- Tags (rotulação livre)
- **Obrigações ativas** — quais "rotinas" essa empresa tem que cumprir mensal/
  trimestral/anual

### 1.2 Obrigação (`Obligation`)
Template de uma rotina recorrente. Ex:
- "PGDAS-D" (mensal — empresas Simples)
- "DCTFWeb" (mensal — empresas LP/LR com folha)
- "ECD" (anual)

Cada obrigação tem:
- Periodicidade
- Departamento responsável
- Prazo legal de entrega
- Responsável padrão no escritório

### 1.3 Entrega (`Delivery`)
**Instância de uma obrigação em uma competência específica**. É a unidade de
"trabalho a fazer". Tem estados:

| Estado    | Significado |
|-----------|-------------|
| `pending` | Pendente — operador ainda não trabalhou |
| `read`    | Lido pelo cliente — operador iniciou, cliente foi notificado |
| `delivered` | Entregue — concluída |

Exemplo de entrega: "DCTFWeb da empresa XYZ, competência 04/2026 — pendente".

### 1.4 Processo (`Process`)
Workflow customizado vinculado a uma empresa. Diferente de obrigação (que tem
prazo legal), processo é uma sequência de passos definida pelo escritório
(ex: "abertura de empresa", "alteração contratual"). **A API só lê processos,
não cria nem edita.**

### 1.5 Solicitação (`Request`)
Comunicação assíncrona entre escritório e cliente. Permite anexos (até 10 arquivos,
30MB total). Substitui o e-mail de "manda esse documento aí". Tem estado aberto/
fechado e timeline de comentários.

### 1.6 e-Contínuo
Pipeline mágico: o escritório envia um PDF via API → o robô do Acessórias
**identifica automaticamente**:
- Qual empresa (pelo CNPJ no documento)
- Qual obrigação (pelo conteúdo)
- Qual competência (pela data)
- Marca a **entrega correspondente como `delivered`**

É a **única forma de marcar entrega como concluída via API**.

---

## 2. Mapa de endpoints relevantes

### Leitura (GET)

| Endpoint | Uso |
|----------|-----|
| `GET /companies` | Lista empresas paginadas |
| `GET /companies/{CNPJ}` | Empresa específica |
| `GET /companies/{CNPJ}/?obligations` | Empresa + suas obrigações ativas |
| `GET /companies/ListAll?obligations` | Validação em massa: tudo da matriz × cadastro |
| `GET /deliveries/{CNPJ}` | Entregas de uma empresa (filtros: situação, período) |
| `GET /deliveries/ListAll` | Todas as entregas do escritório (com filtros) |
| `GET /processes/{ProcID}` | Processo específico (read-only) |
| `GET /requests` | Solicitações abertas/fechadas |
| `GET /boletos/{CNPJ}` | Cobranças do cliente |

### Escrita (POST)

| Endpoint | Uso |
|----------|-----|
| `POST /companies` | Cadastra empresa nova |
| `POST /contacts` | Cadastra contato |
| `POST /requests` | Cria solicitação (com até 10 anexos via `multipart/form-data`) |
| `POST /econtinuo` | **Marca entrega como entregue** (única forma via API) |

### O que **NÃO** dá pra fazer via API
- ❌ Criar/editar processos (workflows)
- ❌ Marcar entrega como `delivered` diretamente (só via e-Contínuo)
- ❌ Concluir passos de processo
- ❌ Webhooks de eventos — precisa polling

---

## 3. Estratégia operacional (OneClick ↔ Acessórias)

### 3.1 Sincronização — polling
Acessórias não emite webhooks. Usamos `DtLastDH` (data/hora do último check)
no `GET /deliveries/ListAll?DtLastDH=...` pra trazer só registros alterados.

Frequência sugerida: **5 minutos** durante horário comercial; **1h** fora.

### 3.2 Fluxo "dar baixa automática"
Quando uma execução de serviço mensal no OneClick é concluída:
1. OneClick gera o PDF de fechamento (template a definir)
2. Backend chama `POST /econtinuo` com o PDF anexo
3. Robô do Acessórias identifica CNPJ + obrigação + competência
4. Entrega vira `delivered` no Acessórias automaticamente

Para obrigações que **não** geram PDF (ex: validações manuais), marcação
continua **manual no portal do Acessórias**.

### 3.3 Mapeamento de identidade

| OneClick | Acessórias |
|----------|------------|
| `Cliente.cnpj` | `Company.cnpj` (chave de negócio) |
| `Servico` (mensal) | `Obligation` (template) |
| `ServicoExecucao` | `Delivery` (instância) |
| `Cliente.id` | precisamos guardar `idAcessorias` separado (campo opcional, sem migração ainda) |

> **A criar**: campo `idAcessorias` em `Cliente` e/ou `cnpjAcessorias` se houver
> diferença entre o CNPJ que usamos e o que o Acessórias tem.

---

## 4. Autenticação e limites

- **Auth**: `Authorization: Bearer {API_TOKEN}` — gerado em
  Configurações → API Token (botão de engrenagem) dentro do Acessórias
- **Rate limit**: 100 req/min com janela deslizante
- **Header de retorno**: `X-RateLimit-Remaining` (não confirmado oficialmente —
  validar quando rodar primeiro request)
- **Códigos HTTP padrão**: 200 OK, 204 No Content, 401 não autorizado,
  404 não encontrado, 429 rate limit excedido
- **Sem sandbox** — testes em produção, com cuidado (usar empresa de teste)

---

## 5. Caminho pra internalização (futuro)

Se um dia decidirmos largar o Acessórias e fazer tudo no OneClick, precisaremos
replicar:

1. **Modelo de dados**:
   - `Obrigacao` (template) — já temos `Servico` MENSAL parecido, mas precisaríamos
     adicionar campos: prazo legal, recorrência (mensal/trimestral/anual), CNAEs
     elegíveis
   - `EntregaCompetencia` (instância) — `ServicoExecucao` quase serve, falta
     `competencia` (YYYY-MM) e ligação com `Cliente` via CNPJ não-ambígua

2. **Calendário fiscal automatizado**: gerar entregas pendentes pro mês seguinte
   baseado no perfil de cada cliente (regime + folha + atividade). Hoje o
   Acessórias já faz isso — replicar exige conhecimento do calendário oficial
   (Receita, SEFAZ, prefeituras).

3. **Notificação ao cliente**: o Acessórias dispara e-mail/WhatsApp pro cliente
   quando entrega vira `read`. Pra internalizar, precisamos:
   - Templates de e-mail por tipo de obrigação
   - Integração com Resend (já temos)
   - Eventual WhatsApp via Twilio/oficial Meta

4. **Portal do cliente**: o cliente acessa o Acessórias pra ver suas entregas.
   Precisaríamos de um portal externo (subdomínio cliente.acessorias-like.app)
   com login simplificado.

5. **e-Contínuo equivalente**: pipeline que recebe PDF, identifica CNPJ +
   obrigação + competência e marca entrega como `delivered`. Hoje seria
   implementado com **OCR + classificação por LLM** (Claude com tool use).
   Esforço alto.

**Estimativa qualitativa**: replicar 100% do Acessórias seria um projeto de
3–4 meses dedicados. Estratégia recomendada: usar API deles enquanto valor
de retenção > esforço, e ir replicando peças isoladas (calendário fiscal
primeiro, depois notificações, depois portal).

---

## 6. Shapes REAIS das respostas (validados 2026-05-12)

### 6.1 `/companies` — **vazio** (paginado não funcional)
```
(sem dados)
```
**Não usar.** O endpoint paginado padrão retorna vazio. Usar sempre `/companies/ListAll`.

### 6.2 `/companies/ListAll` ✓ funciona — **com `obligations` por padrão**

Mesmo sem passar `?obligations=1`, o endpoint já retorna as obrigações
embutidas em cada empresa. Shape:

```json
[
  {
    "ID": "283",                              // ID interno (string contendo número)
    "Identificador": "42.081.159/0001-28",    // ← CNPJ FORMATADO (com pontuação)
    "Razao": "A G A P LTDA",
    "Fantasia": "BRAND2GO REGISTRO DE MARCAS",
    "Status": "Ativa",                         // valores conhecidos: "Ativa"
    "Telefone": "2797737081",
    "UF": "ES",
    "ClienteDesde": "0000-00-00",              // string "0000-00-00" quando não preenchido
    "ClienteAte": "0000-00-00",
    "DataDoCadastro": "2025-03-07",            // formato YYYY-MM-DD
    "Honorario": "0.00",                       // string decimal
    "Obrigacoes": [
      {
        "Nome": "BALANCETE MENSAL",            // nome livre — MAIÚSCULAS, com acentos
        "Status": "Ativa",                      // valores: "Ativa" | "Inativa nessa empresa" | "Obrigação inativa"
        "Entregues":    "0",                    // string number — total entregue no histórico
        "Atrasadas":    "0",                    //   total atrasado neste momento
        "Proximos30D":  "0",                    //   vencendo nos próximos 30 dias
        "Futuras30+":   "0"                     //   vencendo depois de 30 dias
      },
      ...
    ]
  },
  ...
]
```

**Implicações pro design:**

1. **Identificador = CNPJ formatado**. Pra fazer match com `Cliente.cnpj` do
   OneClick, normalizar removendo `./-` (chave canônica = 14 dígitos).

2. **Status da obrigação**: 3 valores observados:
   - `"Ativa"` — empresa tem esta obrigação corrente
   - `"Inativa nessa empresa"` — desativada pra esta PJ específica
   - `"Obrigação inativa"` — obrigação descontinuada no sistema todo

3. **Os contadores são AGREGADOS** — não trazem deliveries individuais. Pra
   tirar a baixa de **uma competência específica** precisamos descobrir o
   endpoint certo de deliveries por empresa (ver 6.3).

4. **Obrigações são strings livres** (nome em maiúsculas). Mapeamento pra
   `Servico` do OneClick precisa ser por **regra de classificação** (não por
   FK direta). Sugestão: tabela `AcessoriasObligationMap { nome → servicoId }`
   construída no setup pelo usuário (com sugestões automáticas).

### 6.3 `/deliveries/{Identificador}` ✓ funciona com parâmetros obrigatórios

**Descoberta crítica**: `DtInitial` e `DtFinal` são **obrigatórios** — sem
eles a API devolve vazio sem erro (silencioso).

```
GET /deliveries/{CNPJ ou ListAll}/?DtInitial=YYYY-MM-DD&DtFinal=YYYY-MM-DD&DtLastDH=YYYY-MM-DD HH:MM:SS&situation=pending,delivered&department_id=1,2
```

Shape:
```json
[
  {
    "ID": "1",
    "Identificador": "432.612.527-66",
    "Razao": "...",
    "Fantasia": "...",
    "Entregas": [
      {
        "Nome": "Guia da Previdência Social",
        "EntDtPrazo":   "2021-08-19",        // YYYY-MM-DD — prazo legal
        "EntDtAtraso":  "2021-08-20",        //              data limite após atraso
        "EntDtEntrega": "2021-08-19",        //              data efetiva (0000-00-00 se pendente)
        "EntCompetencia": "2024-02-06",      // (presente em algumas) — competência
        "EntMulta": "S",                      // S | N
        "Status": "Entregue",                 // "Entregue" | "Pendente" | "Atrasada!"
        "EntGuiaLida": "Guia já acessada/lida",
        "EntLastDH": "2021-08-19 16:02:26",   // última alteração
        "Config": {                           // só quando query param config=1
          "EntID": "16350",                   //   ID ÚNICO DA ENTREGA (chave de sync)
          "Tipo": "O",                        //   "O" = Obrigação, "T" = Tarefa
          "ID": "230",                        //   ID da obrigação/tarefa-template
          "DptoID": "1",
          "DptoNome": "Financeiro",
          "RespPrazo": "Pedro Andrade",
          "RespEntrega": "Eduardo Palandrani"
        }
      }
    ]
  }
]
```

**Regras importantes:**

| Query Param | Obrigatório? | Notas |
|---|:-:|---|
| `DtInitial` | **Sim** | YYYY-MM-DD — prazo inicial |
| `DtFinal` | **Sim** | YYYY-MM-DD — prazo final |
| `DtLastDH` | Sim quando `Identificador=ListAll` | YYYY-MM-DD HH:MM:SS — só aceita **dia atual ou anterior** quando ListAll |
| `situation` | Não | Lista CSV: `pending,read,delivered` |
| `department_id` | Não | Lista CSV de IDs: `1,2,3` |
| `attachments` | Não | `S` traz URLs dos anexos (validade 60 min) |
| `attachmentsId` | Não | Só com `attachments=S` — traz IDs dos anexos |
| `config` | Não | Traz o objeto `Config` (EntID, Tipo, DptoID, etc.) — **essencial pra sync** |
| `Pagina` | Não | 50 registros por página (deliveries) |

**Chave canônica de uma delivery**: `Config.EntID` (string-num).
A combinação `(EntID, EntLastDH)` permite detectar updates.

**Atalho do escritório**: pra sync mensal, basta puxar
`/deliveries/ListAll/?DtInitial={primeiro_dia_mes}&DtFinal={ultimo_dia_mes}&DtLastDH={hoje-1dia}&config`.
Limitação: só funciona se `DtLastDH` for dia atual ou anterior.

**ATENÇÃO ao `config`**: passe **sem valor** (`?...&config`). Passar com valor
(`config=1`) faz a API interpretar como "busca entrega ID=1" e retorna 204.

**Shape REAL observado** (sem `config`):
```json
{
  "Nome": "DARF - DCTFWEB INSS-IRRF",
  "EntCompetencia": "2024-12-01",        // YYYY-MM-DD — competência (mês de referência)
  "EntDtPrazo":     "2025-01-15",         // YYYY-MM-DD — prazo legal
  "EntDtAtraso":    "2025-01-20",         //              data limite com tolerância
  "EntDtEntrega":   "2024-12-11",         //              data real de entrega (0000-00-00 se pendente)
  "EntMulta":       "S",                   // S/N — gera multa se atrasada?
  "Status":         "Ent. antecipada",     // ver lista de valores abaixo
  "EntGuiaLida":    "Guia já acessada/lida",
  "EntLastDH":      "2025-01-20 08:22:30"  // última alteração — chave do diff sync
}
```

**Valores de `Status` observados em produção:**
| Status | Significado |
|---|---|
| `Pendente` | Aberta, aguardando entrega |
| `Atrasada!` | Passou do prazo, ainda não entregue |
| `Atraso justificado` | Entregue tardio com justificativa lançada |
| `Entregue` | Entregue dentro do prazo |
| `Ent. antecipada` | Entregue antes do `EntDtPrazo` |
| `Ent. PzTéc` | Entregue entre `EntDtPrazo` e `EntDtAtraso` (prazo técnico) |
| `Dispensada` | Empresa dispensada dessa competência (sem multa, sem ação) |

**Chave canônica da delivery** (na ausência do `config`):
- `(cnpjEmpresa, Nome, EntCompetencia)` — composição única no Acessórias por design

Quando `config` for incluído (sem valor):
- Vem o objeto `Config { EntID, Tipo, ID, DptoID, DptoNome, RespPrazo, RespEntrega }`
- `EntID` vira a chave primária ideal pro sync diferencial

**Paginação**: 50 registros por página. Loop com `?Pagina=1,2,3...` até receber
array vazio. ACAI BRASIL retornou exatamente 50 registros = sinal de mais páginas.

### 6.4 `/processes` ✓ funciona — read-only

```json
[
  {
    "ProcID": "6729",
    "ProcNome": "Solicitação Padrão de Documentos Contábeis",
    "ProcTitulo": "Solicitação Padrão de Documentos Contábeis",
    "ProcCriador": "Gilciane Lecchi Cravo",
    "ProcGestor": "176956",                    // ID interno do colaborador
    "ProcObservacoes": "",
    "ProcInicio": "01/05/2026",                // formato DD/MM/YYYY
    "ProcDiasCorridos": "11",
    "ProcConclusao": "05/05/2026",
    "ProcDepartamento": "Contábil",
    "ProcStatus": "Em andamento",
    "ProcPorcentagem": "0.00",
    "DtLastDH": "01/05/2026 05:21:04",          // formato DD/MM/YYYY HH:mm:ss
    "EmpNome": "GERING CLIMATIZACOES LTDA",
    "EmpID": "67",
    "EmpCNPJ": "37.093.638/0001-24"
  }
]
```

**Notas:**
- Datas vêm em 2 formatos diferentes: `YYYY-MM-DD` (companies) e `DD/MM/YYYY` (processes/requests). Parser precisa lidar com ambos.
- `EmpCNPJ` aqui também vem formatado.
- `ProcStatus` observado: `"Em andamento"` (falta confirmar valores de concluído / cancelado).

### 6.5 `/requests` ✓ funciona

```json
[
  {
    "SolID": "66",
    "SolTipo": "Interna",                       // valores: "Interna" — outros TBD
    "SolAssunto": "RESCISAO ACORDO DANIEL ROMERO 30/10/2024",
    "SolPrioridade": "Média",                   // "Média" — outros TBD
    "SolTipoUsuario": "Interno",
    "SolUsuario": "Vaneza",
    "SolStatus": "Finalizada",                  // valores: "Finalizada" | "Nova"
    "SolEncerrada": "Sim",                      // "Sim" | "Não"
    "SolAvaliacao": "",
    "SolJust": "",
    "SolDHAbertura": "29/10/2024 15:01:51",     // DD/MM/YYYY HH:mm:ss
    "SolDTPrazo": "",                            // pode ser vazio
    "SolDHUAt": "31/10/2024 11:42:24",
    "SolOfficeResp": ["Vaneza"],                 // array de strings (nomes)
    "SolEmpResp": [],
    "DptoID": "3",
    "DptoNome": "PESSOAL",                       // valores: PESSOAL, FISCAL?, CONTÁBIL?
    "EmpID": "176",
    "EmpNome": "FORMASET INDUSTRIAL LTDA",
    "EmpCNPJ": "35.957.760/0001-76"
  }
]
```

### 6.6 Convenções gerais

- **Tipos**: TUDO vem como string, mesmo IDs e contadores numéricos. Parser
  precisa converter `Number(x)` antes de usar matematicamente.
- **CNPJ**: vem **sempre formatado** (`XX.XXX.XXX/XXXX-XX`). Normalizar pra
  14 dígitos é o jeito seguro de fazer match.
- **Datas**: dois formatos co-existem — `YYYY-MM-DD` e `DD/MM/YYYY HH:mm:ss`.
- **Vazios**: representados como `"0000-00-00"` (datas) ou `""` (strings) —
  raramente `null`.
- **Encoding**: UTF-8, com acentos e caracteres especiais no payload.

## 7. Histórico de descobertas

| Data | Descoberta | Fonte |
|------|-----------|-------|
| 2026-05-12 | API REST com Bearer Token; sem webhooks; e-Contínuo é o único caminho de escrita de status | Doc interna (docx) |
| 2026-05-12 | Rate limit 100 req/min janela deslizante | Doc interna |
| 2026-05-12 | Sem sandbox público — testes em prod com cuidado | Doc interna |
| 2026-05-12 | `ACESSORIAS_API_URL` no .env pode vir com ou sem `https://` — o service normaliza prepondendo o protocolo quando faltar (caso contrário `fetch()` falha com "Failed to parse URL") | Teste real |
| 2026-05-12 | `/companies` (paginado) retorna VAZIO — usar **sempre `/companies/ListAll`** que já vem com `Obligations` embutido | Teste real |
| 2026-05-12 | `Identificador` em `/companies/ListAll` = **CNPJ formatado** (`XX.XXX.XXX/XXXX-XX`) — match precisa normalizar pra 14 dígitos | Teste real |
| 2026-05-12 | **Tudo vem como string** — IDs, contadores, datas. Parser precisa converter | Teste real |
| 2026-05-12 | Obrigações têm apenas **contadores agregados** (Entregues/Atrasadas/Próximos30D/Futuras30+) — não trazem deliveries por competência | Teste real |
| 2026-05-12 | `/deliveries/ListAll` sem parâmetros retorna VAZIO — endpoint correto pra deliveries individuais ainda **não identificado** (próximo a testar) | Teste real |
| 2026-05-12 | Datas vêm em 2 formatos: `YYYY-MM-DD` (companies) e `DD/MM/YYYY HH:mm:ss` (processes/requests). Parser precisa lidar com ambos | Teste real |
| 2026-05-12 | `/deliveries/{CNPJ}` **exige DtInitial + DtFinal obrigatórios** — sem eles devolve vazio silencioso. Quando `Identificador=ListAll`, `DtLastDH` também é obrigatório e só aceita data de hoje ou ontem | Doc oficial |
| 2026-05-12 | Chave canônica de delivery = `Config.EntID` (presente quando query `config=1`). Para sync diferencial usar `EntLastDH` como "última alteração" | Doc oficial |
| 2026-05-12 | Deliveries têm campo `EntCompetencia` (presente em algumas) — formato YYYY-MM-DD. Status: "Entregue", "Pendente", "Atrasada!" | Doc oficial |
| 2026-05-12 | API exigência de departamento: `/departments/ListAll` lista todos com ID (essencial pra mapear filtro `department_id` em deliveries) | Doc oficial |
| 2026-05-12 | Existe endpoint **/invoices** (boletos) que pode ser interessante futuro: cobrança do escritório aos clientes | Doc oficial |
| 2026-05-12 | Endpoint **POST /econtinuo** confirmado como única forma de marcar entrega como `delivered` via API — recebe PDF multipart, robô identifica empresa/obrigação/competência. Devolve erro `Entrega [X] inexistente` se não houver match | Doc oficial |
| 2026-05-12 | **Importante**: `DtInitial/DtFinal` em `/deliveries` filtram por **prazo da entrega**, não pela competência. Uma entrega de competência abril/2026 pode ter prazo em maio (DCTFWeb dia 20, p.ex.). Pra capturar tudo do mês, usar janela ampla (ex: ano corrente inteiro) na primeira sync, depois polling diferencial via `DtLastDH` | Análise |
| 2026-05-12 | CNPJ formatado (`XX.XXX.XXX/XXXX-XX`) em path causa conflito de rotas (slashes). Pro Explorer manual usar **CNPJ só dígitos**. No sync engine usar `encodeURIComponent(cnpj)` | Análise |
| 2026-05-12 | `/companies/{CNPJ}` (single) retorna **objeto único**, NÃO array. E vem **SEM** `Obrigacoes`, `Departamentos`, etc. — esses só vêm com query params: `?obligations`, `?departments`, `?stateRegistrations`, `?contacts`, `?registrationData`. ListAll já traz `Obligacoes` por padrão. | Teste real |
| 2026-05-12 | Token autenticado funciona pra `/companies/{CNPJ}` (single) → confirma que rate-limit não está saturado nem o token foi revogado | Teste real |
| 2026-05-12 | Header `X-RateLimit-Remaining` é retornado SEMPRE como `0` mesmo em requests bem-sucedidos. Não usar pra detectar limite — confiar apenas no código HTTP 429 | Teste real |
| 2026-05-12 | A API **ignora query strings irrelevantes** ao endpoint — passar `DtInitial=...&DtFinal=...` em `/companies/{CNPJ}` retorna normalmente o objeto da empresa, sem erro nem efeito | Teste real |
| 2026-05-12 | **`config=1` quebra `/deliveries`** — o param aceita ID específico de entrega, então `config=1` busca entrega ID=1 (que provavelmente não pertence à empresa) e retorna 204. Pra trazer dados do config em TODAS as entregas, usar `?...&config` (sem valor) | Teste real |
| 2026-05-12 | Sem `config`, a delivery NÃO traz `EntID` (chave canônica). Fallback de identidade: composição `(cnpjEmpresa, nomeObrigacao, EntCompetencia)` | Teste real |
| 2026-05-12 | Status de delivery tem muito mais valores que a doc indica. Confirmados: `"Pendente"`, `"Entregue"`, `"Atrasada!"`, `"Atraso justificado"` (entregue tardio justificado), `"Ent. antecipada"` (antes do prazo), `"Ent. PzTéc"` (entre DtPrazo e DtAtraso), `"Dispensada"` (não precisa entregar essa competência) | Teste real |
| 2026-05-12 | Paginação em `/deliveries` confirmada: 50 registros por página. Loop com `?Pagina=N` até receber array vazio | Teste real |
| 2026-05-12 | `EntGuiaLida` é metadado separado do `Status` — texto descritivo (`"Guia já acessada/lida"` ou vazio) — só relevante pro portal do cliente, não pro sync | Teste real |

> **Como manter**: a cada chamada nova que fizermos e descobrirmos shape de
> resposta, formato de erro, campos não-documentados — adicionar uma linha aqui.
