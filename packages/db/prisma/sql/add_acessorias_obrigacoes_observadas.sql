-- Obrigações observadas no Acessórias — resultado de "Importar obrigações".
--
-- A importação percorre a carteira inteira lá (dezenas de requisições) e por
-- isso é sob demanda. Sem guardar o resultado, sair da tela apagava a lista e
-- obrigava a repetir a varredura só para voltar a ver o que já se sabia.
--
-- Idempotente: o `prisma db push` já cria pelo schema; este SQL é a rede.
CREATE TABLE IF NOT EXISTS "acessorias_obrigacoes_observadas" (
  "id"            TEXT PRIMARY KEY,
  "nome"          TEXT NOT NULL,
  "ocorrencias"   INTEGER NOT NULL DEFAULT 0,
  "departamento"  TEXT,
  "empresa_id"    TEXT,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "uk_acessorias_obrig_observada"
  ON "acessorias_obrigacoes_observadas" ("empresa_id", "nome");
CREATE INDEX IF NOT EXISTS "idx_acessorias_obrig_observada_nome"
  ON "acessorias_obrigacoes_observadas" ("nome");
