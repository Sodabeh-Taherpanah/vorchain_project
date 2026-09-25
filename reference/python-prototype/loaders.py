"""Tolerant loaders for real-world ERP exports (v0.2).

Handles what German Mittelstand exports usually look like:
  * CSV with ';' or ',' or tab delimiters, UTF-8 / UTF-8-BOM / Windows-1252
  * Excel .xlsx files (needs openpyxl; optional)
  * German or English column names (Artikelnummer, Bestand, Liefertermin ...)
  * Dates as 2026-10-05, 05.10.2026, 05.10.26 or Excel date cells
  * Numbers as 1234.5, 1.234,5 or 1,234.5
"""
import csv
import re
from datetime import date, datetime
from pathlib import Path

# logical table -> accepted file stems (without extension)
TABLE_FILES = {
    "materials": ["materials", "artikel", "materialstamm", "bestand"],
    "open_purchase_orders": ["open_purchase_orders", "bestellungen", "offene_bestellungen", "purchase_orders"],
    "demand": ["demand", "bedarf", "bedarfe", "fertigungsbedarf"],
    "supplier_history": ["supplier_history", "lieferhistorie", "wareneingaenge", "wareneingänge"],
    "suppliers": ["suppliers", "lieferanten"],
}

# canonical column -> accepted header spellings (compared lower-case, without spaces/_/-/.)
COLUMN_ALIASES = {
    "material_id": ["material_id", "material", "materialnr", "materialnummer", "artikel", "artikelnr", "artikelnummer", "teilenummer", "sku", "item", "item_no"],
    "description": ["description", "bezeichnung", "beschreibung", "artikelbezeichnung", "materialkurztext", "kurztext"],
    "main_supplier_id": ["main_supplier_id", "hauptlieferant", "lieferant", "lieferantennr", "supplier", "supplier_id", "kreditor"],
    "on_hand": ["on_hand", "bestand", "lagerbestand", "menge_lager", "stock", "frei_verwendbar", "freiverwendbar"],
    "safety_stock": ["safety_stock", "sicherheitsbestand", "mindestbestand", "min_stock"],
    "unit": ["unit", "einheit", "me", "mengeneinheit", "uom"],
    "po_id": ["po_id", "bestellung", "bestellnr", "bestellnummer", "einkaufsbeleg", "po", "po_number"],
    "supplier_id": ["supplier_id", "lieferant", "lieferantennr", "kreditor", "supplier"],
    "qty": ["qty", "menge", "bestellmenge", "offene_menge", "offenemenge", "quantity", "bedarfsmenge"],
    "promised_date": ["promised_date", "liefertermin", "bestaetigter_termin", "bestätigter_termin", "ab_termin", "wunschtermin", "due_date", "confirmed_date"],
    "actual_date": ["actual_date", "wareneingang", "eingangsdatum", "we_datum", "lieferdatum", "receipt_date"],
    "date": ["date", "datum", "bedarfsdatum", "bedarfstermin", "termin"],
    "name": ["name", "lieferantenname", "firma", "name1"],
}

REQUIRED = {
    "materials": ["material_id", "on_hand"],
    "open_purchase_orders": ["po_id", "material_id", "supplier_id", "qty", "promised_date"],
    "demand": ["material_id", "date", "qty"],
    "supplier_history": ["supplier_id", "promised_date", "actual_date"],
    "suppliers": ["supplier_id", "name"],
}


class DataError(Exception):
    pass


def _norm(h):
    return re.sub(r"[\s_\-.]", "", str(h or "").strip().lower())


def _find_file(data_dir, table):
    for stem in TABLE_FILES[table]:
        for ext in (".csv", ".xlsx", ".txt"):
            p = Path(data_dir) / f"{stem}{ext}"
            if p.exists():
                return p
    return None


def _read_csv_rows(path):
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1252"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t")
        delim = dialect.delimiter
    except csv.Error:
        delim = ";" if sample.count(";") > sample.count(",") else ","
    rows = list(csv.reader(text.splitlines(), delimiter=delim))
    return rows[0] if rows else [], rows[1:]


def _read_xlsx_rows(path):
    try:
        import openpyxl
    except ImportError as e:
        raise DataError(f"{path.name}: reading .xlsx needs 'pip install openpyxl' (or save the sheet as CSV)") from e
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    rows = [r for r in rows if any(c not in (None, "") for c in r)]
    return (rows[0] if rows else []), rows[1:]


def _map_headers(table, headers, path):
    normed = [_norm(h) for h in headers]
    mapping, wanted = {}, set(REQUIRED[table]) | {
        "materials": {"description", "main_supplier_id", "safety_stock", "unit"},
        "open_purchase_orders": set(), "demand": set(),
        "supplier_history": {"po_id"}, "suppliers": set(),
    }[table]
    for canon in wanted:
        for alias in COLUMN_ALIASES[canon]:
            a = _norm(alias)
            if a in normed and normed.index(a) not in mapping.values():
                mapping[canon] = normed.index(a)
                break
    missing = [c for c in REQUIRED[table] if c not in mapping]
    if missing:
        raise DataError(
            f"{path.name}: could not find column(s) {missing}. Found headers: {list(headers)}. "
            f"Rename them or add an alias in loaders.COLUMN_ALIASES."
        )
    return mapping


def parse_number(v):
    if v is None or v == "":
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(" ", "").replace(" ", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError as e:
        raise DataError(f"not a number: {v!r}") from e


def parse_date(v):
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise DataError(f"unknown date format: {v!r}")


def load_table(data_dir, table, optional=False):
    path = _find_file(data_dir, table)
    if path is None:
        if optional:
            return []
        raise DataError(f"missing file for '{table}'. Expected one of: "
                        + ", ".join(f"{s}.csv/.xlsx" for s in TABLE_FILES[table]))
    headers, rows = _read_xlsx_rows(path) if path.suffix == ".xlsx" else _read_csv_rows(path)
    mapping = _map_headers(table, headers, path)
    out = []
    for i, r in enumerate(rows, start=2):
        rec = {}
        for canon, idx in mapping.items():
            val = r[idx] if idx < len(r) else None
            rec[canon] = "" if val is None else (val if not isinstance(val, str) else val.strip())
        if not any(str(x) for x in rec.values()):
            continue
        rec["material_id"] = str(rec.get("material_id", "")).strip() if "material_id" in rec else None
        for key in ("supplier_id", "main_supplier_id", "po_id"):
            if key in rec:
                rec[key] = str(rec[key]).strip()
        try:
            for key in ("on_hand", "safety_stock", "qty"):
                if key in rec:
                    rec[key] = parse_number(rec[key])
            for key in ("promised_date", "actual_date", "date"):
                if key in rec:
                    rec[key] = parse_date(rec[key])
        except DataError as e:
            raise DataError(f"{path.name} row {i}: {e}") from e
        out.append(rec)
    return out
