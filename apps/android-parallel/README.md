# OneClick Android Paralelo

Aplicativo Android paralelo para validar o MVP mobile sem alterar o `apps/mobile` existente.

## Primeiro ciclo

- Login e senha via Better Auth.
- Verificacao em duas etapas quando habilitada.
- Dashboard com indicadores basicos.
- Agenda semanal com criacao simples de evento.

## Rodar

```bash
cd apps/android-parallel
pnpm start
```

Para apontar para outra API:

```bash
$env:EXPO_PUBLIC_API_URL="https://sua-api.com"
pnpm start
```

No emulador Android, o fallback local usa `http://10.0.2.2:4000`.
