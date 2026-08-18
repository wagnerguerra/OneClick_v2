# Migração — Capacitações (OneClick v1 `sgq_capacitacoes` → v2)

Levantamento de 18/08/2026 sobre o módulo vivo em
`https://oneclick.central-rnc.com.br/central/modules/sgq_capacitacoes/`
(código em `\192.168.0.7\wwwroot\central\modules\sgq_capacitacoes\`, banco `db_intranet`).

Bloco **Qualidade**. Ciclo: solicita → autoriza → acontece → **avalia a eficácia**.

---

## 1. Volumetria

| Tabela | Linhas | Papel |
|---|---:|---|
| `sgq_cap` | 299 (267 ativas) | a capacitação |
| `sgq_cap_par` | 1.737 | participantes, **por ID** |
| `sgq_cap_arq` | 53 | anexos — ver §3 |
| `sgq_cap_log` | 4.198 | trilha |
| `sgq_cap_msg` | 4 | mensagens |
| `sgq_cap_tip` | 8 | **métodos** (apesar do nome) |
| `sgq_cap_sta` | 6 | situações |

Período: **06/10/2016 a 30/06/2026**. Quatro perfis na entrada (`usu/`, `adm/`, `apr/`, `sup/`),
escolhidos por dois flags — e a pasta `usu/` está **vazia**, ou seja, o perfil de consulta do v1
cai num diretório sem arquivo.

---

## 2. Dois nomes trocados no v1

O que o formulário chama de **Método** (Curso, Treinamento, Palestra, Workshop, Seminário,
Mostra, Webnar, Outros) vem da tabela chamada `sgq_cap_tip` — "tipo". E o campo `tipo` da tabela
`sgq_cap` é outra coisa: **Interna/Externa**, com as duas opções chumbadas no HTML, sem tabela.

No v2 cada nome segue o rótulo que o usuário vê: `capacitacao_metodos` para a lista, e `ambito`
para interna/externa.

---

## 3. O que o levantamento revelou

- **124 das 299 capacitações nunca foram avaliadas** (`av_analise = 0`). O prazo de avaliação
  existia no cadastro e ninguém era cobrado por ele. Daí o filtro **"Avaliação vencida"** na
  listagem nova e a marca na própria linha — é a única novidade de comportamento do port.
- **`av_analise = 0` confundia duas coisas**: "ainda não avaliada" e "não atingiu os objetivos".
  No v2 são `NULL` e `false`, que é o que cada uma significa. Hoje: 168 atingiram, 7 não, 92 sem
  avaliação.
- **27 dos 37 anexos apontam para arquivo que não existe mais em disco** (a pasta tem 11
  arquivos para 45 registros ativos). Ficam fora da carga: linha de anexo sem arquivo é um botão
  de download que dá 404.
- **`carga` e `custo` eram `varchar`** com `"2"`, `"07"`, `""`, `"0,00"`, `"200,00"` e nulo
  misturados. Viram número; o que não dá para ler fica **nulo**, e não zero — zero seria uma
  afirmação ("custou zero") que o dado não sustenta.
- **Duas capacitações de 2016/2017 estão sem título**, ambas finalizadas e com participantes.
  Entram com título genérico explícito em vez de serem descartadas.
- **Log com HTML dentro** (`"Cadastrou o participante <strong>Fulano</strong>"`) — no v2 o evento
  é código e o detalhe fica à parte, em texto limpo.

### O erro de desenho que a carga corrigiu

Modelei `capacitacao_participantes.usuario_id` como **NOT NULL**, argumentando que "o v1 já
acertava" por ser vínculo por ID. O v1 acertou o *mecanismo* — mas **117 dos 150 participantes
distintos não têm mais usuário no v2**, e **102 deles já estavam inativos no próprio v1**: são
ex-colaboradores. Eram **1.013 dos 1.663 vínculos** indo para o lixo, justamente o histórico que
a auditoria pede ("prove que quem executava tal atividade foi treinado").

Virou `usuario_id` opcional + `nome` como resíduo, como em Reuniões e Documentos Internos.

---

## 4. Situação

| Fase | |
|---|---|
| Schema | ✅ `packages/db/prisma/sql/add_capacitacoes.sql` (5 tabelas, aditivo e idempotente) |
| Backend | ✅ service + router tRPC, permissões `capacitacoes` |
| Interface | ✅ listagem, cadastro, detalhe e configurações |
| Dados | ✅ importados no dev — ver abaixo |
| v1 desativado | ✅ 18/08/2026 |

**Carga (conferida 2× no dev, números idênticos):** 8 métodos, 267 capacitações, 1.523
participantes (956 com presença confirmada), 10 anexos, 1 mensagem. Zero capacitação sem método,
zero participante sem ID e sem nome, zero id de usuário órfão.

**Desativação do v1:** aviso na tela, botão desabilitado e bloqueio server-side nos três
`create.asp` (`adm/`, `apr/`, `sup/`), pelo procedimento de
[[v1-desativacao-sempre-com-alert]]. O `usu/` não precisou de nada: a pasta está vazia.

---

## 5. Para publicar

1. Deploy pelo Service Manager (aplica `add_capacitacoes.sql` sozinho).
2. Regerar e aplicar a carga:
   `node scripts/legacy-v1-capacitacoes-import.js` → `scripts/out/v1-capacitacoes.sql`.
3. Subir os 10 arquivos de `apps/api/uploads/capacitacoes-legado` para o volume do container,
   como em `docs/deploy-2026-08-18.md` §3.1.

> Regere o SQL **logo antes** de aplicar: ele resolve ids de usuário no banco local, e o dev é um
> snapshot. Ver o aviso em `docs/deploy-2026-08-18.md` §3.2.
