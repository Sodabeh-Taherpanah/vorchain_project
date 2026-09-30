"""Generate the CSV fixtures of `@vorchain/parsers` and record how the Python prototype reads them.

Writes:
  * `test/fixtures/csv/*.csv`: small synthetic files (never customer data) covering the backlog
    P1-07 test plan and AGENTS.md §6: UTF-8, UTF-8 BOM, Windows-1252 umlauts, `;` `,` tab, quoted
    delimiters, CRLF, blank lines, trailing delimiters, ragged rows, header only, empty file.
  * `test/fixtures/python-csv.json`: for each fixture and each prototype sample file, what the
    prototype's `_read_csv_rows` returns (encoding, delimiter, header, rows), with blank rows
    dropped and cells stripped the way `load_table` does, and row numbers as in `load_table`
    (`enumerate(rows, start=2)`). `parity: false` marks a documented, intended difference; the
    reason is in `deviation`.
  * `test/fixtures/python-sniff.json`: random quote-free samples and the delimiter the prototype
    picks (`csv.Sniffer`, then its `;`/`,` fallback), for `sniffDelimiter`.

Seeded, so reruns are byte-identical.

Run:  python3 packages/parsers/scripts/generate-python-fixtures.py
(The JSON is written one row per line and is excluded from Prettier, so reruns stay byte-identical.)
"""
import csv
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PROTOTYPE = ROOT / "reference" / "python-prototype"
sys.path.insert(0, str(PROTOTYPE))
import loaders  # noqa: E402

PACKAGE = ROOT / "packages" / "parsers"
FIXTURES = PACKAGE / "test" / "fixtures"
CSV_DIR = FIXTURES / "csv"
BOM = b"\xef\xbb\xbf"


def utf8(text):
    return text.encode("utf-8")


def cp1252(text):
    return text.encode("cp1252")


# name -> (bytes, deviation or None). Keep each file tiny and obviously synthetic.
FILES = {
    "utf8-semicolon.csv": (
        utf8("Artikelnummer;Bezeichnung;Lagerbestand;ME\nM0001;Schraube M5;1.234,5;Stk\n"
             "M0002;Größe XL;15,0;Stk\n"),
        None,
    ),
    "utf8-bom-crlf.csv": (
        BOM + utf8("Bestellnummer;Artikelnummer;Lieferant;Bestellmenge;Liefertermin\r\n"
                   "PO00001;M0001;S03;40,0;15.10.2026\r\nPO00002;M0002;S01;480,0;24.10.2026\r\n"),
        None,
    ),
    "cp1252-umlauts.csv": (
        cp1252("Lieferantennr;Name;Straße\r\nS01;Metallbau Krüger GmbH;Hauptstraße 1\r\n"
               "S02;Müller & Söhne KG;Größenweg 2\r\n"),
        None,
    ),
    "comma-quoted.csv": (
        utf8('supplier_id,name,city\nS01,"Weber, Elektronik AG",Berlin\n'
             'S02,"Krüger ""Metall"" GmbH",Köln\n'),
        None,
    ),
    "tab-decimal-comma.csv": (
        utf8("Artikel\tBestand\tSicherheitsbestand\nM0001\t15,0\t25,0\nM0002\t1.234,5\t0\n"),
        None,
    ),
    "semicolon-quoted.csv": (
        utf8('Artikelnummer;Bezeichnung;Menge\nM0001;"Rohr 1/2"" verzinkt; 2m";5\n'
             'M0002;"Kabel, 3-adrig";1,5\n'),
        None,
    ),
    "blank-lines.csv": (
        utf8("material_id;on_hand\n\nM0001;10\n   \n;\nM0002;20\n\n\n"),
        None,
    ),
    "whitespace-cells.csv": (
        utf8(" material_id ;\ton_hand \n M0001 ; 10\u00a0\nM0002 ;20 \n"),
        None,
    ),
    "mixed-line-endings.csv": (
        utf8("a;b\r\n1;2\n3;4\r5;6\r\n"),
        None,
    ),
    "trailing-delimiter.csv": (
        utf8("material_id;on_hand;\nM0001;10;\nM0002;20;\n"),
        None,
    ),
    "ragged.csv": (
        utf8("a;b;c\n1;2\n1;2;3;4\n1;2;3\n"),
        None,
    ),
    "header-only.csv": (utf8("material_id;on_hand\n"), None),
    "empty.csv": (b"", "EMPTY_FILE error; the prototype returns no headers and fails later on columns"),
    "bom-only.csv": (BOM, "EMPTY_FILE error; the prototype returns no headers and fails later on columns"),
    "leading-blank-line.csv": (
        utf8("\nmaterial_id;on_hand\nM0001;10\n"),
        "the header is the first non-blank line; the prototype takes the blank line 1 as header",
    ),
    "embedded-newline.csv": (
        utf8('id;note\n1;"zwei\nZeilen"\n2;x\n'),
        "keeps the line break and numbers rows by physical line; the prototype (splitlines) drops it",
    ),
    "unclosed-quote.csv": (
        utf8('id;note\n1;"offen\n2;x\n'),
        "UNCLOSED_QUOTE error; the prototype silently joins the rest of the file into one cell",
    ),
    "malformed-quote.csv": (
        utf8('id;note\n1;"12" Zoll";x\n2;y;z\n'),
        "MALFORMED_QUOTE error; the prototype keeps `12 Zoll\"` (papaparse would merge two records)",
    ),
    "wide-tab.csv": (
        utf8("\n".join("\t".join(f"c{r:02d}x{c:05d}" for c in range(60)) for r in range(12)) + "\n"),
        "tab detected; the prototype counts the line cut off at 4096 characters and falls back to ','",
    ),
}


def python_read(raw, name):
    """`loaders._read_csv_rows` step by step, recording the encoding and delimiter it picks."""
    text, encoding = None, None
    for enc in ("utf-8-sig", "cp1252"):
        try:
            text = raw.decode(enc)
            encoding = {"utf-8-sig": "utf-8", "cp1252": "windows-1252"}[enc]
            break
        except UnicodeDecodeError:
            continue
    sample = text[:4096]
    try:
        delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
    except csv.Error:
        delimiter = ";" if sample.count(";") > sample.count(",") else ","
    rows = list(csv.reader(text.splitlines(), delimiter=delimiter))
    headers, body = (rows[0] if rows else []), rows[1:]
    return encoding, delimiter, headers, body


def python_table(raw, path):
    encoding, delimiter, headers, body = python_read(raw, path.name)
    # Cross-check the step-by-step copy against the prototype function itself.
    assert (headers, body) == loaders._read_csv_rows(path), path
    rows = [
        {"rowNumber": number, "cells": [cell.strip() for cell in cells]}
        for number, cells in enumerate(body, start=2)
        if any(cell.strip() for cell in cells)
    ]
    return {
        "encoding": encoding,
        "delimiter": delimiter,
        "headers": [header.strip() for header in headers],
        "rows": rows,
    }


def csv_cases():
    CSV_DIR.mkdir(parents=True, exist_ok=True)
    cases = []
    for name, (raw, deviation) in FILES.items():
        path = CSV_DIR / name
        path.write_bytes(raw)
        case = {"file": f"csv/{name}", "parity": deviation is None, "python": python_table(raw, path)}
        if deviation is not None:
            case["deviation"] = deviation
        cases.append(case)
    for folder in ("sample_data", "sample_data_de"):
        for path in sorted((PROTOTYPE / folder).glob("*.csv")):
            cases.append({
                "file": f"reference/python-prototype/{folder}/{path.name}",
                "parity": True,
                "python": python_table(path.read_bytes(), path),
            })
    return cases


def sniff_cases(count=600):
    rng = random.Random(20261005)
    alphabet = ["a", "b", "1", "2", " ", ";", ",", "\t", ",5"]
    cases = []
    for _ in range(count):
        main = rng.choice([";", ",", "\t"])
        columns = rng.randint(1, 5)
        lines = []
        for _ in range(rng.randint(1, 30)):
            fields = columns + (rng.choice([-1, 1]) if rng.random() < 0.15 else 0)
            cells = ["".join(rng.choice(alphabet[:5] + ([",5"] if main == ";" else []))
                             for _ in range(rng.randint(0, 3))) for _ in range(max(fields, 1))]
            if rng.random() < 0.1:
                cells.append(rng.choice(alphabet[5:8]))
            lines.append(main.join(cells))
        text = "\n".join(lines) + rng.choice(["", "\n"])
        assert len(text) < 4096 and '"' not in text and "'" not in text
        sample = text[:4096]
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=";,\t").delimiter
        except csv.Error:
            delimiter = ";" if sample.count(";") > sample.count(",") else ","
        cases.append({"text": text, "delimiter": delimiter})
    return cases


def compact(value):
    return json.dumps(value, ensure_ascii=False)


def csv_case_lines(case):
    """One line per row, so a changed prototype sample shows up as a readable diff."""
    python = case["python"]
    head = {key: value for key, value in case.items() if key != "python"}
    table = {key: value for key, value in python.items() if key != "rows"}
    lines = [f"    {compact(head)[:-1]}, \"python\": {compact(table)[:-1]}, \"rows\": ["]
    lines += [f"      {compact(row)}," for row in python["rows"]]
    if python["rows"]:
        lines[-1] = lines[-1][:-1]
    lines.append("    ]}}")
    return lines


def write_json(path, cases, case_lines):
    """Writes `{ generator, cases }` compactly; `test/fixtures` is excluded from Prettier."""
    lines = ["{", f"  \"generator\": {compact(GENERATOR)},", "  \"cases\": ["]
    for index, case in enumerate(cases):
        block = case_lines(case)
        if index < len(cases) - 1:
            block[-1] += ","
        lines += block
    lines += ["  ]", "}"]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


GENERATOR = "packages/parsers/scripts/generate-python-fixtures.py"


def main():
    FIXTURES.mkdir(parents=True, exist_ok=True)
    write_json(FIXTURES / "python-csv.json", csv_cases(), csv_case_lines)
    write_json(FIXTURES / "python-sniff.json", sniff_cases(), lambda case: [f"    {compact(case)}"])


if __name__ == "__main__":
    main()
