import sys, json

try:
    import fdb
except ImportError:
    print(json.dumps({"ok": False, "columns": [], "rows": [], "rowCount": 0, "error": "Biblioteca fdb nao instalada. Execute: pip install fdb"}))
    sys.exit(0)

dsn_raw = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
charset = sys.argv[4] if len(sys.argv) > 4 else "UTF8"
sql = sys.argv[5] if len(sys.argv) > 5 else ""

MAX_ROWS = 500


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
    fb_dsn = normalize_dsn(dsn_raw)
    conn = fdb.connect(dsn=fb_dsn, user=user, password=password, charset=charset)
    cur = conn.cursor()
    cur.execute(sql)

    if cur.description:
        columns = [desc[0] for desc in cur.description]
        rows = []
        for row in cur.fetchmany(MAX_ROWS):
            rows.append([str(v) if v is not None else None for v in row])
        print(json.dumps({"ok": True, "columns": columns, "rows": rows, "rowCount": len(rows)}))
    else:
        print(json.dumps({"ok": True, "columns": [], "rows": [], "rowCount": 0}))

    conn.close()
except Exception as e:
    print(json.dumps({"ok": False, "columns": [], "rows": [], "rowCount": 0, "error": str(e)}))
