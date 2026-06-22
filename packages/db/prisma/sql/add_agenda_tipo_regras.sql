-- Regras de campos extras por tipo de evento da agenda. Idempotente.
ALTER TABLE agenda_tipos ADD COLUMN IF NOT EXISTS permite_modalidade   boolean NOT NULL DEFAULT false;
ALTER TABLE agenda_tipos ADD COLUMN IF NOT EXISTS permite_sala         boolean NOT NULL DEFAULT false;
ALTER TABLE agenda_tipos ADD COLUMN IF NOT EXISTS permite_garagem      boolean NOT NULL DEFAULT false;
ALTER TABLE agenda_tipos ADD COLUMN IF NOT EXISTS permite_equipamentos boolean NOT NULL DEFAULT false;
-- Allowlist de salas por tipo (vazio = todas as salas ativas ficam disponíveis).
ALTER TABLE agenda_tipos ADD COLUMN IF NOT EXISTS salas_permitidas text[] NOT NULL DEFAULT '{}';

-- Preservação: tipos que hoje exibem o bloco "Configurações da reunião" recebem
-- as 4 regras ligadas, mantendo o comportamento idêntico ao atual.
UPDATE agenda_tipos
   SET permite_modalidade = true, permite_sala = true, permite_garagem = true, permite_equipamentos = true
 WHERE lower(nome) IN ('reunião interna', 'reuniao interna', 'treinamento interno');
