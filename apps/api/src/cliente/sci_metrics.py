import json
import os
import re
import sys
from datetime import datetime, timedelta

try:
    import fdb  # type: ignore
except Exception as e:
    sys.stderr.write("ERRO: biblioteca 'fdb' não está disponível. Instale via pip (requirements.txt).\n")
    sys.stderr.write(str(e) + "\n")
    sys.exit(2)

from sci_env import load_dotenv, normalize_dsn


def _env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name)
    if v is None or str(v).strip() == "":
        return default
    return str(v)


def _clean_digits(s: str) -> str:
    return re.sub(r"\D+", "", str(s or ""))


def _validate_date_yyyy_mm_dd(s: str) -> str:
    s = str(s or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        raise ValueError("Data inválida (use YYYY-MM-DD)")
    # valida calendário
    datetime.strptime(s, "%Y-%m-%d")
    return s


def _cnpj_filter_expr() -> str:
    # Firebird: REPLACE existe. Normaliza CNPJ removendo ., / e -
    return "REPLACE(REPLACE(REPLACE(BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?"


def _rows_to_dicts(rows):
    out = []
    for r in rows or []:
        try:
            out.append(
                {
                    "codigo": r[0],
                    "nome": r[1],
                    "cnpj": _clean_digits(r[2]),
                    "ano": int(r[3]) if r[3] is not None else None,
                    "mes": int(r[4]) if r[4] is not None else None,
                    "movimentacao": int(r[5]) if r[5] is not None else 0,
                }
            )
        except Exception:
            # fallback: serialização simples
            out.append({"row": [str(x) for x in r]})
    return out


def _rows_to_dicts_valor(rows):
    """Como _rows_to_dicts mas movimentacao é numérico (float), para faturamento."""
    out = []
    for r in rows or []:
        try:
            val = r[5]
            if val is None:
                mov = 0.0
            else:
                try:
                    mov = float(val)
                except (TypeError, ValueError):
                    mov = 0.0
            out.append(
                {
                    "codigo": r[0],
                    "nome": r[1],
                    "cnpj": _clean_digits(r[2]),
                    "ano": int(r[3]) if r[3] is not None else None,
                    "mes": int(r[4]) if r[4] is not None else None,
                    "movimentacao": mov,
                }
            )
        except Exception:
            out.append({"row": [str(x) for x in r]})
    return out


def query_admissoes(cur, datai: str, dataf: str, cnpj_digits: str):
    """Admissões por mês: VW_COLABORADORES (BDDATAADMCOL) + VW_DEMITIDOS; soma TOTAL_ADM por empresa/ANO/MES."""
    sql = f"""
        SELECT BDCODEMP, BDNOMEMP, BDCNPJEMP, ANO, MES, SUM(CAST(TOTAL_ADM AS INT)) AS MOVIMENTACAO
        FROM (
            SELECT a.BDCODEMP, BDNOMEMP, BDCNPJEMP,
                   EXTRACT(YEAR FROM BDDATAADMCOL) AS ANO,
                   EXTRACT(MONTH FROM BDDATAADMCOL) AS MES,
                   COUNT(BDCODCOL) AS TOTAL_ADM,
                   CAST('0' AS VARCHAR(1)) AS TOTAL_DEM
            FROM VW_COLABORADORES A
            INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = B.BDCODEMP
            WHERE BDDATAADMCOL BETWEEN ? AND ?
              AND {_cnpj_filter_expr()}
            GROUP BY a.BDCODEMP, BDNOMEMP, BDCNPJEMP, EXTRACT(YEAR FROM BDDATAADMCOL), EXTRACT(MONTH FROM BDDATAADMCOL)
            UNION ALL
            SELECT a.BDCODEMP, BDNOMEMP, BDCNPJEMP,
                   EXTRACT(YEAR FROM BDDATARESCISAO) AS ANO,
                   EXTRACT(MONTH FROM BDDATARESCISAO) AS MES,
                   CAST('0' AS VARCHAR(1)),
                   COUNT(BDCODCOL) AS TOTAL_DEM
            FROM VW_DEMITIDOS A
            INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = B.BDCODEMP
            WHERE BDDATARESCISAO BETWEEN ? AND ?
              AND {_cnpj_filter_expr()}
            GROUP BY a.BDCODEMP, BDNOMEMP, BDCNPJEMP, EXTRACT(YEAR FROM BDDATARESCISAO), EXTRACT(MONTH FROM BDDATARESCISAO)
        )
        GROUP BY BDCODEMP, BDNOMEMP, BDCNPJEMP, ANO, MES
        ORDER BY 1, 4, 5
    """
    cur.execute(sql, (datai, dataf, cnpj_digits, datai, dataf, cnpj_digits))
    return _rows_to_dicts(cur.fetchall())


def query_demissoes(cur, datai: str, dataf: str, cnpj_digits: str):
    """Demissões por mês: VW_COLABORADORES + VW_DEMITIDOS (BDDATARESCISAO); soma TOTAL_DEM por empresa/ANO/MES."""
    sql = f"""
        SELECT BDCODEMP, BDNOMEMP, BDCNPJEMP, ANO, MES, SUM(CAST(TOTAL_DEM AS INT)) AS MOVIMENTACAO
        FROM (
            SELECT a.BDCODEMP, BDNOMEMP, BDCNPJEMP,
                   EXTRACT(YEAR FROM BDDATAADMCOL) AS ANO,
                   EXTRACT(MONTH FROM BDDATAADMCOL) AS MES,
                   COUNT(BDCODCOL) AS TOTAL_ADM,
                   CAST('0' AS VARCHAR(1)) AS TOTAL_DEM
            FROM VW_COLABORADORES A
            INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = B.BDCODEMP
            WHERE BDDATAADMCOL BETWEEN ? AND ?
              AND {_cnpj_filter_expr()}
            GROUP BY a.BDCODEMP, BDNOMEMP, BDCNPJEMP, EXTRACT(YEAR FROM BDDATAADMCOL), EXTRACT(MONTH FROM BDDATAADMCOL)
            UNION ALL
            SELECT a.BDCODEMP, BDNOMEMP, BDCNPJEMP,
                   EXTRACT(YEAR FROM BDDATARESCISAO) AS ANO,
                   EXTRACT(MONTH FROM BDDATARESCISAO) AS MES,
                   CAST('0' AS VARCHAR(1)),
                   COUNT(BDCODCOL) AS TOTAL_DEM
            FROM VW_DEMITIDOS A
            INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = B.BDCODEMP
            WHERE BDDATARESCISAO BETWEEN ? AND ?
              AND {_cnpj_filter_expr()}
            GROUP BY a.BDCODEMP, BDNOMEMP, BDCNPJEMP, EXTRACT(YEAR FROM BDDATARESCISAO), EXTRACT(MONTH FROM BDDATARESCISAO)
        )
        GROUP BY BDCODEMP, BDNOMEMP, BDCNPJEMP, ANO, MES
        ORDER BY 1, 4, 5
    """
    cur.execute(sql, (datai, dataf, cnpj_digits, datai, dataf, cnpj_digits))
    return _rows_to_dicts(cur.fetchall())


def query_lancamentos(cur, datai: str, dataf: str, cnpj_digits: str):
    """
    Lançamentos contábeis por período: VSUC_EMPRESAS_TLAN + VW_TEMPRESAS_REF.
    Filtro por BDDATA (datai/dataf) e por CNPJ da empresa (importa apenas a empresa em uso).
    Retorna BDCODEMP (id da empresa), nome, CNPJ, ano, mês e count(*).
    """
    sql = f"""
        SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
               EXTRACT(YEAR FROM A.BDDATA) AS ANO,
               EXTRACT(MONTH FROM A.BDDATA) AS MES,
               COUNT(*) AS MOVIMENTACAO
        FROM VSUC_EMPRESAS_TLAN A
        INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
        WHERE A.BDDATA BETWEEN ? AND ?
          AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
        GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
                 EXTRACT(YEAR FROM A.BDDATA), EXTRACT(MONTH FROM A.BDDATA)
        ORDER BY 1, 3, 2
    """
    cur.execute(sql, (datai, dataf, cnpj_digits))
    return _rows_to_dicts(cur.fetchall())


def query_fisca_saida(cur, datai: str, dataf: str, cnpj_digits: str):
    """NF Saída: VEF_EMP_TMOVSAI por BDDATASAIDA; BDCODSITNF <> 2; filtro por empresa (CNPJ)."""
    sql = f"""
        SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
               EXTRACT(YEAR FROM A.BDDATASAIDA) AS ANO,
               EXTRACT(MONTH FROM A.BDDATASAIDA) AS MES,
               COUNT(*) AS MOVIMENTACAO
        FROM VEF_EMP_TMOVSAI A
        INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
        WHERE A.BDDATASAIDA BETWEEN ? AND ?
          AND A.BDCODSITNF <> 2
          AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
        GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
                 EXTRACT(YEAR FROM A.BDDATASAIDA), EXTRACT(MONTH FROM A.BDDATASAIDA)
        ORDER BY 1, 4, 5
    """
    cur.execute(sql, (datai, dataf, cnpj_digits))
    return _rows_to_dicts(cur.fetchall())


def query_fisca_entrada(cur, datai: str, dataf: str, cnpj_digits: str):
    """NF Entrada: VEF_EMP_TMOVENT por BDDATAENTRADAENT; BDCODSITNF <> 2; filtro por empresa (CNPJ)."""
    sql = f"""
        SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
               EXTRACT(YEAR FROM A.BDDATAENTRADAENT) AS ANO,
               EXTRACT(MONTH FROM A.BDDATAENTRADAENT) AS MES,
               COUNT(*) AS MOVIMENTACAO
        FROM VEF_EMP_TMOVENT A
        INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
        WHERE A.BDDATAENTRADAENT BETWEEN ? AND ?
          AND A.BDCODSITNF <> 2
          AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
        GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
                 EXTRACT(YEAR FROM A.BDDATAENTRADAENT), EXTRACT(MONTH FROM A.BDDATAENTRADAENT)
        ORDER BY 1, 4, 5
    """
    cur.execute(sql, (datai, dataf, cnpj_digits))
    return _rows_to_dicts(cur.fetchall())


def query_nf_prestado(cur, datai: str, dataf: str, cnpj_digits: str):
    """Serviços prestados: VEF_EMP_TMOVSAI, BDDATASAIDA, BDCODSITNF <> 2, BDESPECIE IN ('NFS','NFSE','S')."""
    sql = f"""
        SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
               EXTRACT(YEAR FROM A.BDDATASAIDA) AS ANO,
               EXTRACT(MONTH FROM A.BDDATASAIDA) AS MES,
               COUNT(*) AS MOVIMENTACAO
        FROM VEF_EMP_TMOVSAI A
        INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
        WHERE A.BDDATASAIDA BETWEEN ? AND ?
          AND A.BDCODSITNF <> 2
          AND A.BDESPECIE IN ('NFS', 'NFSE', 'S')
          AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
        GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
                 EXTRACT(YEAR FROM A.BDDATASAIDA), EXTRACT(MONTH FROM A.BDDATASAIDA)
        ORDER BY 1, 4, 5
    """
    cur.execute(sql, (datai, dataf, cnpj_digits))
    return _rows_to_dicts(cur.fetchall())


def query_nf_tomado(cur, datai: str, dataf: str, cnpj_digits: str):
    """Serviços tomados: VEF_EMP_TMOVENT, BDDATAENTRADAENT, BDCODSITNF <> 2, BDESPECIE IN ('NFS','NFSE','S')."""
    sql = f"""
        SELECT A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
               EXTRACT(YEAR FROM A.BDDATAENTRADAENT) AS ANO,
               EXTRACT(MONTH FROM A.BDDATAENTRADAENT) AS MES,
               COUNT(*) AS MOVIMENTACAO
        FROM VEF_EMP_TMOVENT A
        INNER JOIN VW_TEMPRESAS_REF B ON A.BDCODEMP = B.BDCODEMP
        WHERE A.BDDATAENTRADAENT BETWEEN ? AND ?
          AND A.BDCODSITNF <> 2
          AND A.BDESPECIE IN ('NFS', 'NFSE', 'S')
          AND REPLACE(REPLACE(REPLACE(B.BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
        GROUP BY A.BDCODEMP, B.BDNOMEMP, B.BDCNPJEMP,
                 EXTRACT(YEAR FROM A.BDDATAENTRADAENT), EXTRACT(MONTH FROM A.BDDATAENTRADAENT)
        ORDER BY 1, 4, 5
    """
    cur.execute(sql, (datai, dataf, cnpj_digits))
    return _rows_to_dicts(cur.fetchall())


def _datai_dataf_to_referencia_str(datai: str, dataf: str) -> tuple[str, str]:
    """Converte datai e dataf (YYYY-MM-DD) em referência inicial/final no formato AAAAMM (string)."""
    di = datetime.strptime(datai, "%Y-%m-%d")
    df = datetime.strptime(dataf, "%Y-%m-%d")
    ref_ini = f"{di.year:04d}{di.month:02d}"
    ref_fim = f"{df.year:04d}{df.month:02d}"
    return (ref_ini, ref_fim)


def query_faturamento(cur, datai: str, dataf: str, cnpj_digits: str):
    """
    Faturamento bruto por período: VEF_EMP_TMOVSAI, SUM(BDVALORNOTA) por BDREFLAN (AAAAMM).
    Filtro por empresa (CNPJ), BDREFLAN entre ref_ini e ref_fim, BDCODSITNF <> 1 (desconsidera canceladas).
    """
    ref_ini, ref_fim = _datai_dataf_to_referencia_str(datai, dataf)
    sql = f"""
        SELECT a.BDCODEMP, b.BDNOMEMP, b.BDCNPJEMP,
               CAST(SUBSTRING(CAST(a.BDREFLAN AS VARCHAR(6)) FROM 1 FOR 4) AS INTEGER) AS ANO,
               CAST(SUBSTRING(CAST(a.BDREFLAN AS VARCHAR(6)) FROM 5 FOR 2) AS INTEGER) AS MES,
               SUM(a.BDVALORNOTA) AS MOVIMENTACAO
        FROM VEF_EMP_TMOVSAI a
        INNER JOIN VW_TEMPRESAS_REF b ON a.BDCODEMP = b.BDCODEMP
        WHERE {_cnpj_filter_expr()}
          AND CAST(a.BDREFLAN AS VARCHAR(6)) BETWEEN ? AND ?
          AND a.BDCODSITNF <> 1
        GROUP BY a.BDCODEMP, b.BDNOMEMP, b.BDCNPJEMP, a.BDREFLAN
        ORDER BY a.BDREFLAN
    """
    cur.execute(sql, (cnpj_digits, ref_ini, ref_fim))
    return _rows_to_dicts_valor(cur.fetchall())


def _last_day_of_month(year: int, month: int) -> str:
    """Retorna o último dia do mês no formato DD.MM.YYYY (para uso no Firebird)."""
    if month == 12:
        next_first = datetime(year + 1, 1, 1)
    else:
        next_first = datetime(year, month + 1, 1)
    last = next_first - timedelta(days=1)
    return last.strftime("%d.%m.%Y")


def _iter_months(datai: str, dataf: str):
    """Gera (ano, mes) para cada mês entre datai e dataf (inclusive)."""
    di = datetime.strptime(datai, "%Y-%m-%d")
    df = datetime.strptime(dataf, "%Y-%m-%d")
    y, m = di.year, di.month
    end_y, end_m = df.year, df.month
    while (y, m) <= (end_y, end_m):
        yield (y, m)
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1


def query_vidas(cur, datai: str, dataf: str, cnpj_digits: str):
    """
    Total de vidas (colaboradores ativos) por mês conforme modelo:
    TEMPRESAS E + VRH_EMP_TCOLCON C + LEFT JOIN VRH_EMP_TRESCISAO R.
    Considera ativo se não tem rescisão ou se a rescisão é futura ao último dia do mês.
    TOTAL_VIDAS = COUNT(C.BDCODCOL); opcionalmente QTD_ASSALARIADOS (BDCONTRCOL=0) e
    QTD_SOCIOS_AUTON_TERC (BDCONTRCOL IN (1,2)).
    """
    sql = """
        SELECT
            E.BDCODEMP,
            E.BDCNPJEMP AS CNPJ,
            SUM(CASE WHEN C.BDCONTRCOL = 0 THEN 1 ELSE 0 END) AS QTD_ASSALARIADOS,
            SUM(CASE WHEN C.BDCONTRCOL IN (1, 2) THEN 1 ELSE 0 END) AS QTD_SOCIOS_AUTON_TERC,
            COUNT(C.BDCODCOL) AS TOTAL_VIDAS
        FROM TEMPRESAS E
        JOIN VRH_EMP_TCOLCON C ON (E.BDCODEMP = C.BDCODEMP)
        LEFT JOIN VRH_EMP_TRESCISAO R ON (C.BDCODEMP = R.BDCODEMP AND C.BDCODCOL = R.BDCODCOL)
        WHERE REPLACE(REPLACE(REPLACE(E.BDCNPJEMP, '.', ''), '/', ''), '-', '') = ?
          AND (R.BDDATARESCISAO IS NULL OR R.BDDATARESCISAO > ?)
        GROUP BY E.BDCODEMP, E.BDCNPJEMP
    """
    out = []
    for ano, mes in _iter_months(datai, dataf):
        cutoff = _last_day_of_month(ano, mes)
        cur.execute(sql, (cnpj_digits, cutoff))
        for r in cur.fetchall() or []:
            try:
                # r: BDCODEMP, CNPJ, QTD_ASSALARIADOS, QTD_SOCIOS_AUTON_TERC, TOTAL_VIDAS
                total_vidas = int(r[4]) if r[4] is not None else 0
                out.append({
                    "codigo": r[0],
                    "nome": None,
                    "cnpj": _clean_digits(r[1]),
                    "ano": int(ano),
                    "mes": int(mes),
                    "movimentacao": total_vidas,
                })
            except Exception:
                out.append({"row": [str(x) for x in r]})
    return out


# Mapa: nome do indicador (API/frontend) -> (chave no payload, função de query)
_INDICADORES_SCI = {
    "lancamentos": ("lancamentos", query_lancamentos),
    "nf_entrada": ("fisca_entrada", query_fisca_entrada),
    "nf_saida": ("fisca_saida", query_fisca_saida),
    "nf_prestado": ("nf_prestado", query_nf_prestado),
    "nf_tomado": ("nf_tomado", query_nf_tomado),
    "faturamento": ("faturamento", query_faturamento),
    "admissoes": ("admissoes", query_admissoes),
    "demissoes": ("demissoes", query_demissoes),
    "vidas": ("vidas", query_vidas),
}


def _parse_indicadores_arg(arg: str | None) -> list[str] | None:
    """Retorna lista de chaves do payload a consultar, ou None para consultar todos."""
    if not arg or not str(arg).strip():
        return None
    parts = [p.strip().lower() for p in str(arg).split(",") if p.strip()]
    out = []
    for p in parts:
        if p in _INDICADORES_SCI:
            key = _INDICADORES_SCI[p][0]
            if key not in out:
                out.append(key)
    return out if out else None


def main():
    # args: datai dataf cnpj [indicadores opcional: lancamentos,nf_entrada,nf_saida,vidas,admissoes,demissoes]
    if len(sys.argv) < 4:
        sys.stderr.write("Uso: python sci_metrics.py <datai YYYY-MM-DD> <dataf YYYY-MM-DD> <cnpj> [indicadores]\n")
        sys.exit(1)

    datai = _validate_date_yyyy_mm_dd(sys.argv[1])
    dataf = _validate_date_yyyy_mm_dd(sys.argv[2])
    cnpj_digits = _clean_digits(sys.argv[3])
    if len(cnpj_digits) != 14:
        raise ValueError("CNPJ inválido (precisa ter 14 dígitos)")

    indicadores_keys = _parse_indicadores_arg(sys.argv[4] if len(sys.argv) > 4 else None)
    todas_as_chaves = ["admissoes", "demissoes", "lancamentos", "fisca_saida", "fisca_entrada", "nf_prestado", "nf_tomado", "faturamento", "vidas"]

    load_dotenv()
    raw_dsn = _env("SCI_DSN")
    dsn = normalize_dsn(raw_dsn or "") or raw_dsn or ""
    user = _env("SCI_USER")
    pw = _env("SCI_PASSWORD")
    charset = _env("SCI_CHARSET", "UTF8")

    if not dsn or not user or pw is None:
        sys.stderr.write("ERRO: Variáveis de ambiente SCI_DSN, SCI_USER e SCI_PASSWORD são obrigatórias.\n")
        sys.exit(3)

    con = None
    try:
        con = fdb.connect(dsn=dsn, user=user, password=pw, charset=charset)
        cur = con.cursor()
        run_keys = indicadores_keys if indicadores_keys else todas_as_chaves
        out = {"sucesso": True, "periodo": {"datai": datai, "dataf": dataf}, "cnpj": cnpj_digits}
        for key in todas_as_chaves:
            if key in run_keys:
                if key == "admissoes":
                    out["admissoes"] = query_admissoes(cur, datai, dataf, cnpj_digits)
                elif key == "demissoes":
                    out["demissoes"] = query_demissoes(cur, datai, dataf, cnpj_digits)
                elif key == "lancamentos":
                    out["lancamentos"] = query_lancamentos(cur, datai, dataf, cnpj_digits)
                elif key == "fisca_saida":
                    out["fisca_saida"] = query_fisca_saida(cur, datai, dataf, cnpj_digits)
                elif key == "fisca_entrada":
                    out["fisca_entrada"] = query_fisca_entrada(cur, datai, dataf, cnpj_digits)
                elif key == "nf_prestado":
                    out["nf_prestado"] = query_nf_prestado(cur, datai, dataf, cnpj_digits)
                elif key == "nf_tomado":
                    out["nf_tomado"] = query_nf_tomado(cur, datai, dataf, cnpj_digits)
                elif key == "faturamento":
                    out["faturamento"] = query_faturamento(cur, datai, dataf, cnpj_digits)
                elif key == "vidas":
                    out["vidas"] = query_vidas(cur, datai, dataf, cnpj_digits)
            else:
                out[key] = []
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


