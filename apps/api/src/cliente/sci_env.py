"""
Utilitários de ambiente para scripts SCI (Firebird).
Carrega .env e normaliza DSN UNC para formato Firebird remoto (host:drive:\\path).
"""
import os


def load_dotenv() -> None:
    """Carrega .env da raiz do repositório ou backend/.env."""
    base = os.path.dirname(os.path.abspath(__file__))
    for rel in ("../../.env", "../.env"):
        path = os.path.normpath(os.path.join(base, rel))
        if os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" not in line:
                            continue
                        key, _, val = line.partition("=")
                        key = key.strip()
                        val = val.strip()
                        if val and (
                            (val.startswith('"') and val.endswith('"'))
                            or (val.startswith("'") and val.endswith("'"))
                        ):
                            val = val[1:-1]
                        if key.startswith("SCI_") and key not in os.environ:
                            os.environ[key] = val
            except Exception:
                pass
            break


def normalize_dsn(raw: str) -> str:
    """Converte UNC \\host\\share\\path para host:SHARE:\\path (formato Firebird remoto)."""
    dsn = (raw or "").strip()
    if not dsn:
        return dsn
    if dsn.startswith("\\\\") and "\\" in dsn[2:]:
        parts = dsn[2:].split("\\", 2)
        if len(parts) >= 3:
            host, share, rest = parts[0], parts[1], parts[2]
            if host and share and rest:
                return f"{host}:{share.upper()}:\\{rest}"
    return dsn
