-- Matrícula do colaborador na folha de pagamento (o "Código" da tela da folha).
-- Chave estável para conferir o cadastro contra a folha sem depender do nome —
-- o cadastro guarda o nome curto e a folha o completo, e essa distância já
-- produziu casamento errado.
ALTER TABLE users ADD COLUMN IF NOT EXISTS matricula_folha TEXT;
