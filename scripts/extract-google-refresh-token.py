"""
Extrai client_id, client_secret e refresh_token do par credentials.json + token.pickle
gerados pelo fluxo OAuth do Python (google-auth-oauthlib).

Imprime as linhas prontas pra colar no .env da API:
  GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE=...
  GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN=...

Uso:
    python scripts/extract-google-refresh-token.py [pasta_com_credenciais]

Default: pasta `google/` na raiz do monorepo.
"""
import os
import sys
import json
import pickle


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'google')
    base = os.path.abspath(base)

    cred_path = os.path.join(base, 'credentials.json')
    token_path = os.path.join(base, 'token.pickle')

    if not os.path.exists(cred_path):
        print(f'ERRO: nao encontrei {cred_path}', file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(token_path):
        print(f'ERRO: nao encontrei {token_path}', file=sys.stderr)
        sys.exit(1)

    with open(cred_path, 'r', encoding='utf-8') as f:
        creds_json = json.load(f)
    block = creds_json.get('installed') or creds_json.get('web') or {}
    client_id = block.get('client_id')
    client_secret = block.get('client_secret')
    if not client_id or not client_secret:
        print('ERRO: credentials.json nao contem installed.client_id/client_secret', file=sys.stderr)
        sys.exit(2)

    with open(token_path, 'rb') as f:
        creds = pickle.load(f)
    refresh_token = getattr(creds, 'refresh_token', None)
    if not refresh_token:
        print('ERRO: token.pickle nao contem refresh_token', file=sys.stderr)
        sys.exit(3)

    rel_path = os.path.relpath(cred_path, os.path.join(base, '..')).replace('\\', '/')

    print('# --- Cole as linhas abaixo no .env da API ---')
    print(f'GOOGLE_DRIVE_OAUTH_CREDENTIALS_FILE=./{rel_path}')
    print(f'GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN={refresh_token}')
    print()
    print(f'# Detalhes:')
    print(f'#   client_id     : {client_id}')
    print(f'#   client_secret : {client_secret[:8]}... (oculto)')
    print(f'#   credentials   : {cred_path}')


if __name__ == '__main__':
    main()
