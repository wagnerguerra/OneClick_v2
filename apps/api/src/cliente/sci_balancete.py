"""
Balancete via procedure VSUC_SP_RETORNA_BALANCETE (Firebird).
Mesma base de conexão que sci_metrics.py (fdb + sci_env) — usada pela rotina "Obter parâmetros iniciais".
Uso: python sci_balancete.py <prcodemp> <datai YYYY-MM-DD> <dataf YYYY-MM-DD> <ignora_zeramento 0|1> <ref AAAAMM>
"""
import json
import sys
import io
from datetime import datetime

# Forçar stdout para UTF-8 (Windows pode usar cp1252 por padrão)
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

try:
    from decimal import Decimal
except ImportError:
    Decimal = None

try:
    import fdb  # type: ignore
except Exception as e:
    sys.stderr.write("ERRO: biblioteca 'fdb' não disponível. Instale via pip (requirements.txt).\n")
    sys.stderr.write(str(e) + "\n")
    sys.exit(2)

from sci_env import load_dotenv, normalize_dsn


def _env(name: str, default: str | None = None) -> str | None:
    v = __import__("os").environ.get(name)
    if v is None or str(v).strip() == "":
        return default
    return str(v)


def _validate_date_yyyy_mm_dd(s: str) -> str:
    s = str(s or "").strip()
    if not s or len(s) < 10:
        raise ValueError("Data inválida (use YYYY-MM-DD)")
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10]
    raise ValueError("Data inválida (use YYYY-MM-DD)")


def _format_pr_date(yyyy_mm_dd: str) -> str:
    """
    PRDATINI/PRDATFIN. Padrão us_slash (MM/DD/YYYY), igual ao DBeaver/SCI típico.
    SCI_BAL_DATE_STYLE: us_slash | br_dot | br_slash
    """
    s = _validate_date_yyyy_mm_dd(yyyy_mm_dd)
    dt = datetime.strptime(s, "%Y-%m-%d")
    style = str(_env("SCI_BAL_DATE_STYLE", "us_slash") or "us_slash").strip().lower()
    if style in ("us_slash", "mm_dd", "us"):
        return f"{dt.month:02d}/{dt.day:02d}/{dt.year}"
    if style in ("br_slash", "dd_slash"):
        return f"{dt.day:02d}/{dt.month:02d}/{dt.year}"
    return f"{dt.day:02d}.{dt.month:02d}.{dt.year}"


def main():
    if len(sys.argv) < 6:
        sys.stderr.write(
            "Uso: python sci_balancete.py <prcodemp> <datai YYYY-MM-DD> <dataf YYYY-MM-DD> <ignora_zeramento 0|1> <ref AAAAMM>\n"
        )
        sys.exit(1)

    prcodemp = str(sys.argv[1]).strip()
    datai = str(sys.argv[2]).strip()
    dataf = str(sys.argv[3]).strip()
    # Parâmetro obrigatório: 1 = ignorar zeramentos (exigido pela procedure após a data final)
    ignora_zeramento = 1
    ref = int(sys.argv[5]) if sys.argv[5].strip().isdigit() else 0

    if not prcodemp or not ref or ref < 200001 or ref > 210012:
        sys.stderr.write("ERRO: prcodemp e ref (AAAAMM) inválidos.\n")
        sys.exit(1)

    load_dotenv()

    datini_str = _format_pr_date(datai)
    datfin_str = _format_pr_date(dataf)

    raw_dsn = _env("SCI_DSN")
    dsn = normalize_dsn(raw_dsn or "") or raw_dsn or ""
    user = _env("SCI_USER")
    pw = _env("SCI_PASSWORD")
    charset = _env("SCI_CHARSET", "UTF8")
    cta_ini = int(_env("SCI_BAL_CTA_INI", "19") or "19") or 19
    cta_fin = int(_env("SCI_BAL_CTA_FIN", "101156") or "101156") or 101156
    # PRNIVEISCONTA — padrão igual ao DBeaver (SCI_BAL_NIVEIS para incluir nível 5: 1,2,3,4,5)
    niveis = _env("SCI_BAL_NIVEIS", "1,2,3,4,5") or "1,2,3,4,5"
    # Tipo/código de centro de custo (mesmo campo usado na importação Node + tabela empresas.sci_bal_codtpcc)
    codtpcc = str(_env("SCI_BAL_CODTPCC", "") or "").strip()
    # PRTODASASCONTAS: 1 = todas as contas (padrão); 0 = só com saldo (pode retornar 0 linhas no mês)
    _tc = str(_env("SCI_BAL_TODAS_CONTAS", "1") or "1").strip().lower()
    pr_todas_contas = 0 if _tc in ("0", "false", "no") else 1
    # PRCONSOLIDADA: DBeaver que retorna dados usa 0; SCI_BAL_CONSOLIDADA=1 força 1
    _cs = str(_env("SCI_BAL_CONSOLIDADA", "0") or "0").strip().lower()
    pr_consolidada = 1 if _cs in ("1", "true", "yes", "sim") else 0
    # PRCONTABILIZACAO: DBeaver usa 0; 1=fiscal 2=societária (SCI_BAL_CONTABILIZACAO)
    _co = str(_env("SCI_BAL_CONTABILIZACAO", "0") or "0").strip().lower()
    if _co in ("2", "societaria", "soc"):
        pr_contab = 2
    elif _co in ("1", "fiscal"):
        pr_contab = 1
    else:
        pr_contab = 0

    if not dsn or not user or pw is None:
        sys.stderr.write("ERRO: SCI_DSN, SCI_USER e SCI_PASSWORD obrigatórios.\n")
        sys.exit(3)

    # 29 parâmetros — mesma ordem que no DBeaver / VSUC_SP_RETORNA_BALANCETE
    sql = """
    SELECT
        BDCODCTA AS CODIGO_CONTA,
        BDCTALON AS CLASSIFICACAO,
        BDNOMCTA AS NOME_CONTA,
        BDSALDO_ANTERIOR,
        BDSALDO_DEB AS DEBITO,
        BDSALDO_CRE AS CREDITO,
        BDMOVIMENTO,
        BDSALDO_ATUAL
    FROM VSUC_SP_RETORNA_BALANCETE(
        ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    """
    prcodemp_str = str(prcodemp).strip()

    params = [
        prcodemp_str,
        datini_str,
        datfin_str,
        ignora_zeramento,
        cta_ini,
        cta_fin,
        0,
        codtpcc,
        ref,
        0, 0, 1, pr_consolidada, 0, 0, 0, niveis, pr_todas_contas, pr_contab,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]

    def _fix_str(val):
        """Garante que strings do Firebird sejam UTF-8 válidas."""
        if val is None:
            return None
        if isinstance(val, bytes):
            # Tenta UTF-8 primeiro, fallback para Latin1
            try:
                return val.decode("utf-8").strip()
            except (UnicodeDecodeError, AttributeError):
                try:
                    return val.decode("latin-1").strip()
                except Exception:
                    return val.decode("utf-8", errors="replace").strip()
        if isinstance(val, str):
            # Re-encode para corrigir mojibake (latin1 lido como utf8)
            try:
                val.encode("utf-8")
                return val.strip()
            except UnicodeEncodeError:
                pass
            try:
                return val.encode("latin-1").decode("utf-8").strip()
            except (UnicodeDecodeError, UnicodeEncodeError):
                pass
            return val.encode("utf-8", errors="replace").decode("utf-8").strip()
        return str(val).strip()

    con = None
    try:
        con = fdb.connect(dsn=dsn, user=user, password=pw or "", charset=charset)
        cur = con.cursor()
        cur.execute(sql, params)
        cols = [d[0].upper() for d in cur.description] if cur.description else []
        rows = []
        for r in cur.fetchall():
            row = {}
            for i, c in enumerate(cols):
                if i < len(r):
                    val = r[i]
                    if val is None:
                        row[c] = None
                    elif isinstance(val, (bytes, str)) and not isinstance(val, bool):
                        row[c] = _fix_str(val)
                    elif isinstance(val, (int, float)):
                        row[c] = float(val)
                    elif Decimal is not None and isinstance(val, Decimal):
                        row[c] = float(val)
                    else:
                        try:
                            row[c] = float(val)
                        except (TypeError, ValueError):
                            row[c] = _fix_str(val)
            rows.append(row)
        out = {"sucesso": True, "dados": rows}
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
    except Exception as e:
        sys.stderr.write(str(e) + "\n")
        sys.exit(4)
    finally:
        try:
            if con:
                con.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
