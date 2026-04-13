#!/usr/bin/env python3
"""
Consulta o ID do cliente no SCI (Firebird) pelo CNPJ.
Uso: python sci_id_sistema.py <cnpj_14_digitos>
Retorna JSON: { "id_cliente": int, "razao_social": str, "cnpj": str, "metodo": str }
"""
import sys
import os
import json
import re

# Adicionar diretorio atual ao path para importar sci_env
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    import fdb
except Exception as e:
    print(json.dumps({"error": f"Biblioteca fdb nao disponivel: {e}"}))
    sys.exit(1)

from sci_env import load_dotenv, normalize_dsn


def _env(name, default=None):
    v = os.environ.get(name)
    if v is None or str(v).strip() == "":
        return default
    return str(v)


def limpar_cnpj(doc):
    return re.sub(r'\D', '', doc or '')


def conectar():
    raw_dsn = _env("SCI_DSN")
    dsn = normalize_dsn(raw_dsn or "") or raw_dsn or ""
    user = _env("SCI_USER")
    password = _env("SCI_PASSWORD")
    charset = _env("SCI_CHARSET", "UTF8")

    if not dsn or not user or password is None:
        raise Exception("SCI_DSN, SCI_USER e SCI_PASSWORD devem estar configurados.")

    return fdb.connect(
        dsn=dsn,
        user=user,
        password=password,
        charset=charset
    )


def buscar(cnpj):
    cnpj = limpar_cnpj(cnpj)
    if len(cnpj) != 14:
        return None

    con = conectar()
    cur = con.cursor()

    # Metodo 1: VW_TEMPRESAS_REF_JOIN
    try:
        cur.execute("""
            SELECT BDCODEMP AS ID_CLIENTE, BDNOMEMP AS RAZAO_SOCIAL, BDDOCAUXILIAR AS CNPJ
            FROM VW_TEMPRESAS_REF_JOIN
            WHERE REPLACE(REPLACE(REPLACE(BDDOCAUXILIAR, '.', ''), '/', ''), '-', '') = ?
        """, (cnpj,))
        row = cur.fetchone()
        if row:
            con.close()
            return {
                "id_cliente": int(row[0]) if row[0] is not None else None,
                "razao_social": (row[1] or '').strip(),
                "cnpj": cnpj,
                "metodo": "VW_TEMPRESAS_REF_JOIN"
            }
    except Exception:
        pass

    # Metodo 2: TEMPRESAS + TEMPRESAS_REF
    try:
        cur.execute("""
            SELECT FIRST 1
                E.BDCODEMP AS ID_CLIENTE,
                R.BDNOMEMP AS RAZAO_SOCIAL,
                E.BDCNPJEMP AS CNPJ
            FROM TEMPRESAS E
            JOIN TEMPRESAS_REF R ON (E.BDCODEMP = R.BDCODEMP)
            WHERE REPLACE(REPLACE(REPLACE(E.BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
            ORDER BY R.BDREFEMP DESC
        """, (cnpj,))
        row = cur.fetchone()
        if row:
            con.close()
            return {
                "id_cliente": int(row[0]) if row[0] is not None else None,
                "razao_social": (row[1] or '').strip(),
                "cnpj": cnpj,
                "metodo": "TEMPRESAS_JOIN"
            }
    except Exception:
        pass

    con.close()
    return None


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "CNPJ nao informado"}))
        sys.exit(1)

    load_dotenv()
    cnpj = limpar_cnpj(sys.argv[1])

    try:
        result = buscar(cnpj)
        if result:
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(json.dumps({"error": "Nao encontrado", "cnpj": cnpj}))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
