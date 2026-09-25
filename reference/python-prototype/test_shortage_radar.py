"""Tests for Vorchain. Run:  python3 -m unittest -v test_shortage_radar"""
import csv
import tempfile
import unittest
from datetime import date
from pathlib import Path

from loaders import DataError, load_table, parse_date, parse_number
from shortage_radar import add_workdays, analyse, main, workdays_between

AS_OF = date(2026, 10, 5)  # a Monday


def write(folder, name, rows, delim=","):
    with open(Path(folder) / name, "w", newline="", encoding="utf-8") as f:
        csv.writer(f, delimiter=delim).writerows(rows)


def base_dataset(folder, promised="2026-10-09", supplier_delay_days=0):
    """One material: 100 on hand, uses 20/day on weekdays, PO of 200 promised Friday."""
    write(folder, "materials.csv", [["material_id", "description", "main_supplier_id", "on_hand", "safety_stock"],
                                    ["M1", "Bolt", "S1", 100, 0]])
    write(folder, "open_purchase_orders.csv", [["po_id", "material_id", "supplier_id", "qty", "promised_date"],
                                               ["P1", "M1", "S1", 200, promised]])
    rows = [["material_id", "date", "qty"]]
    for i in range(14):
        dd = date.fromordinal(AS_OF.toordinal() + i)
        if dd.weekday() < 5:
            rows.append(["M1", dd.isoformat(), 20])
    write(folder, "demand.csv", rows)
    hist = [["po_id", "supplier_id", "promised_date", "actual_date"]]
    for i in range(5):
        p = date(2026, 6, 1 + i * 7)  # Mondays
        hist.append([f"H{i}", "S1", p.isoformat(), add_workdays(p, supplier_delay_days).isoformat()])
    write(folder, "supplier_history.csv", hist)


class Helpers(unittest.TestCase):
    def test_numbers(self):
        self.assertEqual(parse_number("1.234,5"), 1234.5)
        self.assertEqual(parse_number("1,234.5"), 1234.5)
        self.assertEqual(parse_number("12,5"), 12.5)
        self.assertEqual(parse_number(""), 0.0)

    def test_dates(self):
        self.assertEqual(parse_date("05.10.2026"), AS_OF)
        self.assertEqual(parse_date("2026-10-05"), AS_OF)
        self.assertIsNone(parse_date(""))
        with self.assertRaises(DataError):
            parse_date("next week")

    def test_workdays(self):
        fri = date(2026, 10, 9)
        self.assertEqual(add_workdays(fri, 1), date(2026, 10, 12))  # -> Monday
        self.assertEqual(workdays_between(fri, date(2026, 10, 12)), 1)
        self.assertEqual(workdays_between(date(2026, 10, 12), fri), -1)


class Analysis(unittest.TestCase):
    def test_reliable_supplier_no_alert(self):
        with tempfile.TemporaryDirectory() as tmp:
            base_dataset(tmp, supplier_delay_days=0)
            results, *_ = analyse(Path(tmp), AS_OF, 10)
            self.assertEqual(results, [])

    def test_late_supplier_creates_hidden_risk(self):
        # stock 100 lasts Mon-Fri (5 x 20). PO promised Fri, but supplier is 3 workdays late
        with tempfile.TemporaryDirectory() as tmp:
            base_dataset(tmp, supplier_delay_days=3)
            results, *_ = analyse(Path(tmp), AS_OF, 10)
            self.assertEqual(len(results), 1)
            r = results[0]
            self.assertEqual(r["severity"], "CRITICAL")
            self.assertEqual(r["hidden_risk"], "yes")
            self.assertEqual(r["erp_view_date"], "none")
            self.assertIn("Expedite P1", r["next_action"])

    def test_german_semicolon_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            write(tmp, "artikel.csv", [["Artikelnummer", "Bezeichnung", "Lagerbestand", "Sicherheitsbestand"],
                                       ["M1", "Schraube", "1.000,0", "50"]], ";")
            rows = load_table(tmp, "materials")
            self.assertEqual(rows[0]["material_id"], "M1")
            self.assertEqual(rows[0]["on_hand"], 1000.0)

    def test_missing_column_message(self):
        with tempfile.TemporaryDirectory() as tmp:
            write(tmp, "materials.csv", [["Artikelnummer", "Farbe"], ["M1", "rot"]])
            with self.assertRaises(DataError) as ctx:
                load_table(tmp, "materials")
            self.assertIn("on_hand", str(ctx.exception))

    def test_xlsx_input(self):
        try:
            import openpyxl
        except ImportError:
            self.skipTest("openpyxl not installed")
        with tempfile.TemporaryDirectory() as tmp:
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.append(["Artikelnummer", "Lagerbestand"])
            ws.append(["M9", 42])
            wb.save(Path(tmp) / "artikel.xlsx")
            rows = load_table(tmp, "materials")
            self.assertEqual(rows[0]["on_hand"], 42.0)

    def test_cli_returns_2_on_bad_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(main([tmp]), 2)


if __name__ == "__main__":
    unittest.main()
