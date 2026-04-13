import sys, json, time

try:
    import fdb
except ImportError:
    print(json.dumps({"ok": False, "message": "Biblioteca fdb nao instalada. Execute: pip install fdb"}))
    sys.exit(0)

dsn_raw = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
charset = sys.argv[4] if len(sys.argv) > 4 else "UTF8"


def normalize_dsn(raw: str) -> str:
    """Converte UNC \\host\\share\\path para host:SHARE:\\path (formato Firebird remoto)."""
    dsn = (raw or "").strip()
    if not dsn:
        return dsn
    if dsn.startswith("\\") and "\\" in dsn[2:]:
        parts = dsn[2:].split("\\", 2)
        if len(parts) >= 3:
            host, share, rest = parts[0], parts[1], parts[2]
            if host and share and rest:
                return f"{host}:{share.upper()}:\\{rest}"
    return dsn


try:
    start = time.time()
    fb_dsn = normalize_dsn(dsn_raw)
    conn = fdb.connect(dsn=fb_dsn, user=user, password=password, charset=charset)
    cur = conn.cursor()
    cur.execute("SELECT RDB$GET_CONTEXT('SYSTEM', 'ENGINE_VERSION') FROM RDB$DATABASE")
    row = cur.fetchone()
    version = row[0] if row else "Firebird"
    conn.close()
    ms = int((time.time() - start) * 1000)
    print(json.dumps({"ok": True, "message": f"Conexao bem-sucedida ({ms}ms)", "details": f"Firebird {version}"}))
except Exception as e:
    print(json.dumps({"ok": False, "message": f"Falha na conexao: {str(e)}"}))
