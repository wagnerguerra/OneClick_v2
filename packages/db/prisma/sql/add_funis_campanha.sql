-- Múltiplos funis/campanhas de captação por IA. Idempotente.
-- Cada campanha = 1 linha em lead_funil_config (slug único) com sua própria
-- trilha/rubrica; a oportunidade gerada guarda de qual campanha veio.

-- Rótulo amigável da campanha (hoje só havia o slug).
ALTER TABLE lead_funil_config ADD COLUMN IF NOT EXISTS nome text;

-- De qual campanha (slug) o lead veio. Mantém `origem` para UTM/fonte.
ALTER TABLE oportunidades ADD COLUMN IF NOT EXISTS campanha_slug text;
CREATE INDEX IF NOT EXISTS oportunidades_campanha_slug_idx ON oportunidades(campanha_slug);

-- Backfill: dá um nome à campanha padrão existente (se houver) sem nome.
UPDATE lead_funil_config SET nome = 'Atendimento' WHERE nome IS NULL OR btrim(nome) = '';
