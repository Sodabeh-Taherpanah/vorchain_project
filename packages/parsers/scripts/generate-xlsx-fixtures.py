"""Convert the prototype's sample CSVs to XLSX and prove the prototype reads them identically.

Writes `test/fixtures/xlsx/{sample_data,sample_data_de}/*.xlsx`: every sample file as a workbook
with typed cells, the way a user's "Save as Excel" produces them: number columns as numbers, date
columns as real date cells (`DD.MM.YYYY` for DE, `YYYY-MM-DD` for EN), IDs and text as strings.
Cells are converted with the prototype's own `parse_number` / `parse_date`.

It then runs the prototype (`shortage_radar.analyse`, which reads `.xlsx` through `loaders.py`
`_read_xlsx_rows` / openpyxl) on each generated folder and fails unless the exceptions equal
`reference/python-prototype/golden/*.json`. So the fixtures are golden-equivalent per the
prototype's own XLSX loader, and `test/python-tables.test.ts` can hold `parseFile` to the same bar.

Needs openpyxl (`pip install openpyxl`). Workbook metadata and ZIP timestamps are fixed, so
reruns are byte-identical.

Run:  python3 packages/parsers/scripts/generate-xlsx-fixtures.py
"""
import io
import json
import re
import sys
import zipfile
from datetime import date, datetime
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[3]
PROTOTYPE = ROOT / "reference" / "python-prototype"
sys.path.insert(0, str(PROTOTYPE))
import loaders  # noqa: E402
from shortage_radar import analyse  # noqa: E402

OUT = ROOT / "packages" / "parsers" / "test" / "fixtures" / "xlsx"
NUMBER_COLUMNS = {"on_hand", "safety_stock", "qty"}
DATE_COLUMNS = {"promised_date", "actual_date", "date"}
DATE_FORMATS = {"sample_data": "YYYY-MM-DD", "sample_data_de": "DD.MM.YYYY"}
FIXED_TIME = datetime(2026, 1, 1)


def table_of(path):
    return next(t for t, stems in loaders.TABLE_FILES.items() if path.stem in stems)


def typed(canon, value):
    if canon in NUMBER_COLUMNS:
        number = loaders.parse_number(value)
        return int(number) if number.is_integer() else number
    if canon in DATE_COLUMNS:
        return loaders.parse_date(value)
    return value


def to_xlsx(csv_path, date_format):
    headers, rows = loaders._read_csv_rows(csv_path)
    mapping = loaders._map_headers(table_of(csv_path), headers, csv_path)
    canon_of = {index: canon for canon, index in mapping.items()}
    wb = openpyxl.Workbook()
    wb.properties.created = wb.properties.modified = FIXED_TIME
    ws = wb.active
    ws.title = csv_path.stem
    ws.append(headers)
    for row in rows:
        ws.append([typed(canon_of.get(i), cell.strip()) for i, cell in enumerate(row)])
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, date):
                cell.number_format = date_format
    buffer = io.BytesIO()
    wb.save(buffer)
    return fixed_zip(buffer.getvalue())


def fixed_zip(data):
    """Re-packs the ZIP with fixed timestamps (openpyxl stamps the save time in entries and in
    `docProps/core.xml`)."""
    out = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as src, zipfile.ZipFile(out, "w") as dst:
        for info in src.infolist():
            entry = zipfile.ZipInfo(info.filename, date_time=FIXED_TIME.timetuple()[:6])
            content = src.read(info)
            if info.filename == "docProps/core.xml":
                stamp = rb"\g<1>2026-01-01T00:00:00Z"
                content = re.sub(rb"(<dcterms:modified[^>]*>)[^<]*", stamp, content)
            dst.writestr(entry, content, compress_type=zipfile.ZIP_DEFLATED)
    return out.getvalue()


def exceptions_of(folder):
    golden = json.loads((PROTOTYPE / "golden" / f"{folder.name}.json").read_text("utf-8"))
    as_of = date.fromisoformat(golden["asOf"])
    results, _, _ = analyse(folder, as_of, golden["horizon"], "en")
    keys = golden["exceptions"][0].keys()
    return [{k: r[k] for k in keys} for r in results], golden["exceptions"]


for name, date_format in DATE_FORMATS.items():
    out_dir = OUT / name
    out_dir.mkdir(parents=True, exist_ok=True)
    for csv_path in sorted((PROTOTYPE / name).glob("*.csv")):
        (out_dir / f"{csv_path.stem}.xlsx").write_bytes(to_xlsx(csv_path, date_format))
    actual, golden = exceptions_of(out_dir)
    if actual != golden:
        sys.exit(f"{name}: the prototype's XLSX loader does not reproduce the golden output")
    print(f"xlsx/{name}: {len(actual)} exceptions, equal to golden")
