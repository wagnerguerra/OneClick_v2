# Migração SGQ v1 → Manifestações v2

Importação **única** de Elogios, Sugestões e Reclamações do OneClick v1
(`db_intranet`, MySQL em 192.168.0.7) para o módulo `Manifestacao` do v2, seguida
do bloqueio de novos registros no legado.

Sem rotina, sem sincronização contínua: roda uma vez, confere, fecha a porta lá.

Levantamento feito em 12/08/2026 contra os dados reais dos dois lados.

---

## 1. O que existe para migrar

| Tabela v1 | Total | Ativos | A migrar |
|---|---|---|---|
| `sgq_elo` (elogios) | 96 | 80 | 80 |
| `sgq_sug` (sugestões) | 137 | 101 | 101 |
| `sgq_rec` (reclamações) | 219 | 91 | 91 |
| **Total** | **452** | **272** | **272** |

Volume pequeno — cabe numa transação e num conferência manual.

**`ativo = 0` é exclusão lógica**, e pesa: 128 das 219 reclamações estão nesse
estado, quase todas de 2016–2019. Ver a decisão 1.

Satélites: `sgq_elo_col` 22 · `sgq_rec_arq` 28 · `sgq_rec_msg` 8 ·
`sgq_rec_log` 72 · `sgq_elo_arq` 0.

---

## 2. De-para — tudo conferido contra dado real

### Chaves de vínculo

| v1 | v2 | Casamento |
|---|---|---|
| `sgq_elo.cliente`, `sgq_rec.id_cliente` | `Cliente.code` | **13 de 126** |
| `usuario` → `ger_cad_usu.CAD_USU_EMAIL` | `User.email` | **27 de 56** |
| `sgq_rec.area` → `sgq_proc.processo` | `Area.name` | 9 registros com área inexistente |

O e-mail é o de-para de usuário: o legado guarda `CAD_USU_EMAIL` e o v2 usa
e-mail como identidade. Nome não serve — a grafia diverge ("Erica Nögueira").

**Por que só 13 clientes casam.** Não é defeito do de-para: os `code` do v2 vão
de **1092 a 3287** (só a carteira atual foi importada), e **102 dos 126 códigos
citados no v1 estão abaixo de 1092**. São clientes antigos, de manifestações de
2016–2020, que não existem no v2 e não vão existir.

Descoberta lateral: `sgq_rec.area` NÃO aponta para `cad_areas` (que tem uma
linha só, "Não Informado"). Aponta para `sgq_proc`, e os números fecham —
3 = Fiscal (79), 2 = Trabalhista (43), 4 = Contábil (34), 6 = TI (26),
1 = Legalização (17).

### Campos

| v1 | v2 |
|---|---|
| `sgq_rec.tipo` 1=Interna, 2=Externa | `origem` INTERNA / CLIENTE |
| `sgq_rec.origem` (9 valores) | `canal` — E-mail, Telefone, Site, WhatsApp… |
| `sgq_rec.status` 1–5 | `AGUARDANDO_RETORNO` → `AGUARDANDO_ANALISE` → `REGISTRAR_EFICACIA` · `NAO_PROCEDENTE` · `FINALIZADA` |
| `sgq_sug.status` 1=NOVA, 2=RESPONDIDA, 3=EXCLUÍDA | `RECEBIDA` / `RESPONDIDA` / não migra |
| `sgq_sug.identificar = 0` | `anonima = true`, `autorId = NULL` |
| `sgq_sug.publicar` | `publica` |
| `sgq_elo.elogiados` (texto) + `sgq_elo_col.COLABORADOR` | `elogiadosIds[]` |
| `sgq_rec.resp_cliente`, `justificativa`, `retorno_final`, `causa_desc` | campos homônimos |
| `sgq_rec_msg` | `ManifestacaoMensagem` |
| `sgq_rec_log` | `ManifestacaoLog` |
| `sgq_rec_arq` | `ManifestacaoArquivo` |

Os cinco status de reclamação do v1 batem 1:1 com os do v2 — o módulo foi
desenhado a partir deles.

---

## 3. O que NÃO tem para onde ir

**Classificação da reclamação.** `sgq_rec.classificacao` tem seis valores em uso
(Atendimento, Serviço Errado, Tempo de Espera, Falha na Entrega, Atraso na
Entrega) e **não existe campo equivalente em `Manifestacao`**. Ver a decisão 3.

**Protocolo do legado.** `sgq_rec.hash` é o código que o cliente recebeu lá. O
v2 gera protocolo próprio (`ELO-7K3M-92QF`). Sugiro **prefixar o protocolo
migrado** com a origem — `V1-REC-244` — para que qualquer consulta a um número
antigo continue encontrando o registro.

**Elogiados.** Só 22 vínculos por ID em `sgq_elo_col`, para 96 elogios. O resto
é texto solto em `sgq_elo.elogiados` ("Erica Nögueira", "LEG" — que nem é
pessoa, é setor). Onde houver ID, vira `elogiadosIds`; onde só houver texto,
tenta-se casar por e-mail do colaborador e, falhando, o texto entra na
descrição. Não inventar vínculo por aproximação de nome.

**Não Conformidades.** `sgq_nc` tem 235 registros e **o módulo não existe no v2**
(era a Fase 4 do plano de Qualidade, adiada). Fica fora desta migração. Boa
notícia: `sgq_rec.causa_rnc > 0` retorna **zero** — o elo reclamação→NC nunca
foi usado na prática, então não há vínculo a preservar.

**Anexos.** 28 arquivos em `sgq_rec_arq`, com `link` do tipo `/7824…3614.pdf`
apontando para o servidor do v1. Precisam ser copiados para o S3 do v2 — senão
o registro migra com um link morto, que é pior que sem anexo.

---

## 4. Sujeira conhecida

- `sgq_rec.dt_reg` com `1900-01-01` (39 registros no status 1).
- Registros de teste: reclamante "tester", cliente 1424, todos `ativo=0`.
- `sgq_elo.status` vazio em 18 registros.
- `sgq_rec.resp_dt` e `resp_usu_dt` são **varchar**, não data.
- `sgq_rec.area` com valores 17, 99, 100, 106 — inexistentes em `sgq_proc`.

---

## 5. Como executar

**Roda da máquina do Wagner.** O MySQL do v1 só é alcançável na LAN; a VPS não
o enxerga. Mesmo arranjo dos outros backfills.

### Fase 1 — Script de importação (`packages/db/prisma/import-sgq-v1.ts`)

Lê o MySQL, resolve os de-para, grava no Postgres de produção. Idempotente pelo
protocolo (`V1-REC-244`): rodar duas vezes não duplica.

### Fase 2 — Ensaio (`--dry-run`)

Não grava nada; emite o relatório de conferência:

- quantos registros de cada tipo entrariam
- quantos com cliente resolvido / sem cliente
- quantos com autor resolvido / anônimos / sem correspondência
- quantos com área resolvida
- a lista dos que ficariam incompletos, por ID do v1

É aqui que se decide se o resultado é aceitável — antes de tocar no banco.

### Fase 3 — Importação

Numa transação por tipo. Ao fim, contagem final e a mesma conferência do ensaio,
agora sobre o que foi gravado.

### Fase 4 — Fechar a porta no v1

Os módulos vivem em **duas cópias** no `\\192.168.0.7\wwwroot`:

```
central/modules/sgq_elogios      create.asp · details.asp · index.asp
central/modules/sgq_sugestoes    adm/ · user/ · index.asp
central/modules/sgq_reclamacoes  adm/ · cli/ · usu/ · index.asp
v4/modules/sgq_elogios           create.php · store.php · index.php
v4/modules/sgq_sugestoes         insert_item.asp · modal-editar.asp …
v4/modules/sgq_reclamacoes       modal_rec_new.asp · adm/ · usu/
```

Bloquear **nas duas** — o v4 é o atual, mas os Elogios rodam pela cópia velha em
`/central`, então desabilitar só um lado deixa a outra porta aberta.

Recomendo bloquear **na tela**, não no banco: os arquivos de criação
(`create.asp`, `store.php`, `insert_item.asp`, `modal_rec_new.asp`) passam a
exibir um aviso com o link do módulo novo. Revogar INSERT no MySQL também
impede, mas o usuário recebe um erro de servidor sem explicação — e alguém vai
abrir chamado achando que quebrou.

A consulta ao histórico no v1 **continua funcionando**: só a criação fecha.

---

## 6. Decisões necessárias antes de escrever o script

**1. Migrar os excluídos?** São 180 registros com `ativo=0` (16 elogios,
36 sugestões, 128 reclamações). Migrar preserva o histórico completo; não migrar
entrega um módulo limpo. Meio-termo possível: migrar como `ENCERRADA` e marcados,
para consulta.

**2. Anônimas perdem o autor?** O v1 guarda o usuário mesmo quando
`identificar=0` — e respondia por e-mail ao autor, o que furava o anonimato. A
política do v2 é não guardar autor em manifestação anônima. Aplicada à migração,
**o dado que o legado tem se perde**. É o correto pela política, mas é uma perda
irreversível e por isso precisa do seu aval explícito.

**3. Classificação da reclamação:** criar o campo em `Manifestacao`, anexar ao
fim da descrição, ou descartar? São dados de seis categorias em 219 registros.

**4. Cliente e autor sem correspondência** (a maioria, pelo item 2 da seção 2):
gravar o nome que o v1 tem como texto em `informanteNome`, ou deixar em branco?
Gravar preserva a leitura do histórico; deixar em branco mantém o cadastro
limpo. Minha sugestão é gravar — sem isso, 90% das manifestações migradas ficam
sem identificar de quem falavam.
