"""Generate CPython reference vectors for the engine's date, rounding, statistics and projection code.

The expected values come straight from the prototype (`add_workdays`, `workdays_between`,
`percentile`, `supplier_stats`, `project`, `analyse`) and from CPython itself (`date.weekday`,
`timedelta`, `round`), so `python-vectors.test.ts` checks the TypeScript ports against the real
thing instead of hand-written tables. Seeded, so reruns are byte-identical.

Run:  python3 packages/engine/scripts/generate-python-vectors.py
      pnpm exec prettier --write packages/engine/src/__fixtures__/python-vectors.json
"""
import json
import random
import struct
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "reference" / "python-prototype"))
import shortage_radar  # noqa: E402
from loaders import load_table  # noqa: E402
from shortage_radar import add_workdays, percentile, supplier_stats, workdays_between  # noqa: E402

OUT = ROOT / "packages" / "engine" / "src" / "__fixtures__" / "python-vectors.json"
rng = random.Random(20261005)
AS_OF = date(2026, 10, 5)

# Weekends, month/year boundaries, leap days (incl. century rules), the epoch, and the edges
# of the Python date range.
ANCHORS = [
    date(2026, 10, 9), date(2026, 10, 10), date(2026, 10, 11), date(2026, 10, 12),
    date(2026, 12, 31), date(2027, 1, 1), date(2027, 1, 2), date(2027, 1, 3),
    date(2028, 2, 28), date(2028, 2, 29), date(2028, 3, 1), date(2100, 2, 28),
    date(2000, 2, 29), date(1600, 2, 29), date(1969, 12, 31), date(1970, 1, 1),
    date(1, 1, 15), date(9999, 12, 17),
]


def realistic_date():
    return AS_OF + timedelta(days=rng.randint(-1500, 1500))


def any_date():
    # Stays 6000 days inside the Python date range so every shift below is representable.
    return date(1, 1, 1) + timedelta(days=rng.randint(6000, 3652058 - 6000))


def date_vectors():
    add_workdays_cases, between_cases, calendar_cases = [], [], []
    for d in ANCHORS:
        for n in (-6, -5, -1, 0, 1, 2, 5, 6):
            add_workdays_cases.append([d.isoformat(), n, add_workdays(d, n).isoformat()])
    for a in ANCHORS[:12]:
        for b in ANCHORS[:12]:
            between_cases.append([a.isoformat(), b.isoformat(), workdays_between(a, b)])
    for _ in range(150):
        d = realistic_date() if rng.random() < 0.7 else any_date()
        n = rng.randint(-120, 120)
        add_workdays_cases.append([d.isoformat(), n, add_workdays(d, n).isoformat()])
        e = d + timedelta(days=rng.randint(-200, 200))
        between_cases.append([d.isoformat(), e.isoformat(), workdays_between(d, e)])
    for _ in range(150):
        d, e, n = any_date(), any_date(), rng.randint(-3000, 3000)
        calendar_cases.append([d.isoformat(), d.weekday(), n, (d + timedelta(days=n)).isoformat(),
                               e.isoformat(), (e - d).days])
    return add_workdays_cases, between_cases, calendar_cases


def random_double():
    while True:
        x = struct.unpack("<d", struct.pack("<Q", rng.getrandbits(64)))[0]
        if x == x and abs(x) != float("inf"):
            return x


def rounding_inputs():
    xs = [2.675, 1.005, 0.125, 0.375, 2.5, 3.5, -2.5, -0.5, 0.5, 1.5, -0.0, 0.0, 5e-324,
          -5e-324, 1.7976931348623157e308, 2.0 ** 52 + 0.5, 2.0 ** 53, 4503599627370495.5,
          0.49999999999999994, 1e22, 123456789.125, 0.045, 0.055, 0.285, 1.115]
    xs += [i / 8 for i in range(-40, 41)] + [i / 20 for i in range(-40, 41)]
    for _ in range(100):
        xs.append(rng.uniform(-1e4, 1e4))  # score / stock magnitudes
    for _ in range(60):
        xs.append(round(rng.uniform(-1000, 1000), rng.randint(0, 3)) + 5 * 10.0 ** -rng.randint(1, 4))
    for _ in range(60):
        xs.append(rng.uniform(-1, 1) * 10.0 ** rng.randint(-20, 20))
    for _ in range(60):
        xs.append(random_double())
    return xs


def rounding_vectors():
    cases = []
    for x in rounding_inputs():
        for nd in (None, 0, 1, 2, rng.randint(-25, 25)):
            try:
                expected = round(x) if nd is None else round(x, nd)
            except OverflowError:
                continue  # covered by a dedicated unit test
            # Python ints beyond 2**53 are exact doubles here because x itself was a double.
            cases.append([x, nd, float(expected)])
    return cases


def percentile_vectors():
    cases = [[[], 0.8, percentile([], 0.8)], [[2, 3], 0.5, percentile([2, 3], 0.5)]]
    for _ in range(150):
        values = [rng.randint(-15, 40) for _ in range(rng.randint(1, 30))]
        p = rng.choice([0.0, 0.5, 0.8, 1.0, round(rng.random(), 3)])
        cases.append([values, p, float(percentile(values, p))])
    return cases


def history_row(supplier, promised, actual):
    return {"supplierId": supplier, "promisedDate": promised and promised.isoformat(),
            "actualDate": actual and actual.isoformat()}


def random_history():
    """History rows with weekend dates, early/late deliveries and missing dates."""
    suppliers = rng.sample(["S01", "S02", "S10", "S9", "A-7", "b", "\uffff", "\U0001f600"],
                           rng.randint(1, 5))
    rows = []
    for _ in range(rng.randint(0, 40)):
        promised = realistic_date()
        actual = promised + timedelta(days=rng.choice([0, 0, 1, 2, 3, 5, 9, -1, -3, 16]))
        if rng.random() < 0.1:
            promised = None
        if rng.random() < 0.1:
            actual = None
        rows.append(history_row(rng.choice(suppliers), promised, actual))
    return rows


def stats_payload(rows, min_n):
    history = [{"supplier_id": r["supplierId"],
                "promised_date": r["promisedDate"] and date.fromisoformat(r["promisedDate"]),
                "actual_date": r["actualDate"] and date.fromisoformat(r["actualDate"])}
               for r in rows]
    stats = supplier_stats(history, min_n)
    # Dict order is first appearance: the order the engine promises for supplierStats.
    return [{"supplierId": sid, "meanDelayDays": s["mean"], "p80DelayDays": s["p80"],
             "onTimeRate": s["on_time_rate"], "deliveries": s["n"],
             "reliable": s["reliable_stats"]} for sid, s in stats.items()]


def supplier_stats_vectors():
    cases = []
    for name in ("sample_data", "sample_data_de"):
        rows = [history_row(r["supplier_id"], r["promised_date"], r["actual_date"])
                for r in load_table(ROOT / "reference" / "python-prototype" / name,
                                    "supplier_history")]
        cases.append({"name": name, "minReliableDeliveries": 3, "history": rows,
                      "expected": stats_payload(rows, 3)})
    for i in range(60):
        rows = random_history()
        min_n = rng.choice([1, 3, 3, 3, 5])
        cases.append({"name": f"random-{i}", "minReliableDeliveries": min_n, "history": rows,
                      "expected": stats_payload(rows, min_n)})
    return cases


def iso(d):
    return d.isoformat() if d else None


def entries(by_day):
    """A {date: qty} dict as [[iso, qty], ...] in dict (insertion) order."""
    return [[d.isoformat(), q] for d, q in by_day.items()]


def random_qty():
    # Whole numbers and awkward decimals, so float accumulation order is exercised too.
    return rng.choice([float(rng.randint(1, 60)), round(rng.uniform(0.1, 40), rng.randint(1, 3))])


def random_by_day(start, horizon):
    """Quantities on days before, inside and after the window [start, start + horizon)."""
    days = [start + timedelta(days=rng.randint(-5, horizon + 5)) for _ in range(rng.randint(0, 25))]
    return {d: random_qty() for d in days}


def project_vectors():
    """Direct calls of `project` on random schedules (receipts first, strict `<`, window edges)."""
    cases = []
    for _ in range(150):
        start = realistic_date()
        horizon = rng.choice([0, 1, 7, 10, 28, rng.randint(0, 60)])
        on_hand = rng.choice([0.0, float(rng.randint(0, 300)), round(rng.uniform(0, 300), 2)])
        safety = rng.choice([0.0, 0.0, float(rng.randint(1, 120)), round(rng.uniform(0, 80), 1)])
        demand, receipts = random_by_day(start, horizon), random_by_day(start, horizon)
        first_short, first_below, min_stock = shortage_radar.project(
            on_hand, demand, receipts, start, horizon, safety)
        cases.append({"onHand": on_hand, "safetyStock": safety, "asOf": start.isoformat(),
                      "horizonDays": horizon, "demandByDay": entries(demand),
                      "receiptsByDay": entries(receipts),
                      "expected": [iso(first_short), iso(first_below), min_stock]})
    return cases


def daily_points(on_hand, demand_by_day, erp_rec, real_rec, start, horizon):
    """Per-day values for `projectionSeries`, written as the same loop as `project`. The caller
    checks the result against `project` itself, so this cannot drift from the prototype."""
    points, erp_stock, real_stock = [], on_hand, on_hand
    for i in range(horizon):
        day = start + timedelta(days=i)
        demand = demand_by_day.get(day, 0)
        erp_stock += erp_rec.get(day, 0)
        erp_stock -= demand
        real_stock += real_rec.get(day, 0)
        real_stock -= demand
        points.append([day.isoformat(), demand, erp_rec.get(day, 0), real_rec.get(day, 0),
                       erp_stock, real_stock])
    return points


def check_points(points, on_hand, safety, erp_result, real_result):
    for column, result in ((4, erp_result), (5, real_result)):
        stocks = [p[column] for p in points]
        first_short = next((p[0] for p in points if p[column] < 0), None)
        first_below = next((p[0] for p in points if p[column] < safety), None)
        min_stock = on_hand
        for x in stocks:
            min_stock = min(min_stock, x)
        assert [first_short, first_below, min_stock] == [iso(result[0]), iso(result[1]), result[2]]


def run_analyse(tables, as_of, horizon):
    """Runs the prototype's `analyse` on in-memory tables and records every `project` call it
    makes (ERP view first, then realistic view, once per material row)."""
    calls = []
    real_project, real_load = shortage_radar.project, shortage_radar.load_table

    def recording_project(on_hand, demand_by_day, receipts, start, h, safety):
        result = real_project(on_hand, demand_by_day, receipts, start, h, safety)
        calls.append((on_hand, dict(demand_by_day), dict(receipts), safety, result))
        return result

    shortage_radar.project = recording_project
    shortage_radar.load_table = lambda _dir, table, optional=False: tables.get(table, [])
    try:
        results, _, _ = shortage_radar.analyse(Path("."), as_of, horizon)
    finally:
        shortage_radar.project, shortage_radar.load_table = real_project, real_load

    expected = []
    for m, (erp, real) in zip(tables["materials"], zip(calls[0::2], calls[1::2])):
        on_hand, demand_by_day, erp_rec, _, erp_result = erp
        _, _, real_rec, safety, real_result = real
        points = daily_points(on_hand, demand_by_day, erp_rec, real_rec, as_of, horizon)
        check_points(points, on_hand, safety, erp_result, real_result)
        expected.append({
            "materialId": m["material_id"],
            "demandByDay": entries(demand_by_day),
            "erpReceipts": entries(erp_rec),
            "realisticReceipts": entries(real_rec),
            "erp": [iso(erp_result[0]), iso(erp_result[1]), erp_result[2]],
            "realistic": [iso(real_result[0]), iso(real_result[1]), real_result[2]],
            "points": points,
        })
    assert len(calls) == 2 * len(tables["materials"])
    # Sanity check against analyse's own output: every alert's date comes from the realistic view.
    for r in results:
        candidates = [e["realistic"][0] or e["realistic"][1] for e in expected
                      if e["materialId"] == r["material_id"]]
        assert r["critical_date"] in candidates
    return expected


def tables_payload(tables):
    return {
        "materials": [{"materialId": m["material_id"], "onHand": m["on_hand"],
                       "safetyStock": m.get("safety_stock", 0.0) or 0.0}
                      for m in tables["materials"]],
        "openPurchaseOrders": [{"poId": p["po_id"], "materialId": p["material_id"],
                                "supplierId": p["supplier_id"], "qty": p["qty"],
                                "promisedDate": p["promised_date"].isoformat()}
                               for p in tables["open_purchase_orders"]],
        "demand": [{"materialId": r["material_id"], "date": r["date"].isoformat(), "qty": r["qty"]}
                   for r in tables["demand"]],
        "supplierHistory": [history_row(r["supplier_id"], r["promised_date"], r["actual_date"])
                            for r in tables["supplier_history"]],
    }


def random_tables(as_of, horizon):
    """A small dataset with unknown suppliers, suppliers with too little history, weekend promise
    dates, POs and demand outside the window, duplicate material rows and orphan rows."""
    mats = rng.sample(["M1", "M2", "M3", "M10", "Ä-4"], rng.randint(1, 4))
    materials = [{"material_id": mid, "on_hand": rng.choice([0.0, float(rng.randint(0, 400))]),
                  "safety_stock": rng.choice([0.0, float(rng.randint(0, 150)), 12.5])}
                 for mid in mats]
    if rng.random() < 0.15:
        materials.append(dict(materials[0], on_hand=float(rng.randint(0, 400))))
    suppliers = ["S1", "S2", "S3", "SX"]  # SX never appears in the history: unknown supplier
    pos = [{"po_id": f"P{i}", "material_id": rng.choice(mats + ["M-orphan"]),
            "supplier_id": rng.choice(suppliers), "qty": random_qty(),
            "promised_date": as_of + timedelta(days=rng.randint(-10, horizon + 10))}
           for i in range(rng.randint(0, 12))]
    demand = [{"material_id": rng.choice(mats + ["M-orphan"]),
               "date": as_of + timedelta(days=rng.randint(-5, horizon + 5)), "qty": random_qty()}
              for _ in range(rng.randint(0, 60))]
    history = []
    for sid, n in (("S1", rng.randint(0, 8)), ("S2", rng.randint(1, 2)), ("S3", rng.randint(3, 8))):
        for _ in range(n):
            promised = realistic_date()
            actual = promised + timedelta(days=rng.choice([-2, 0, 0, 1, 3, 4, 7, 12]))
            history.append({"supplier_id": sid, "promised_date": promised, "actual_date": actual})
    rng.shuffle(history)
    return {"materials": materials, "open_purchase_orders": pos, "demand": demand,
            "supplier_history": history}


def projection_vectors():
    def load_sample(name):
        folder = ROOT / "reference" / "python-prototype" / name
        return {t: load_table(folder, t) for t in
                ("materials", "open_purchase_orders", "demand", "supplier_history")}

    # sample_data_de differs only in headers, formats and descriptions; the fields the projection
    # reads are the same, so embedding it again would double this section without new engine
    # coverage. Loader parity for the German files is the parsers' job (P1-09, P1-10).
    tables, tables_de = load_sample("sample_data"), load_sample("sample_data_de")
    expected = run_analyse(tables, AS_OF, 28)
    assert tables_payload(tables_de) == tables_payload(tables)
    assert run_analyse(tables_de, AS_OF, 28) == expected
    cases = [{"name": "sample_data", "asOf": AS_OF.isoformat(), "horizonDays": 28,
              "input": tables_payload(tables), "expected": expected}]
    for i in range(40):
        as_of = AS_OF + timedelta(days=rng.randint(0, 6))  # every weekday and weekend day
        horizon = rng.choice([1, 10, 28, rng.randint(0, 45)])
        tables = random_tables(as_of, horizon)
        cases.append({"name": f"random-{i}", "asOf": as_of.isoformat(), "horizonDays": horizon,
                      "input": tables_payload(tables),
                      "expected": run_analyse(tables, as_of, horizon)})
    return cases


def main():
    add_workdays_cases, between_cases, calendar_cases = date_vectors()
    payload = {
        "generatedBy": "packages/engine/scripts/generate-python-vectors.py",
        "addWorkdays": add_workdays_cases,
        "workdaysBetween": between_cases,
        "calendar": calendar_cases,
        "round": rounding_vectors(),
        "percentile": percentile_vectors(),
        "supplierStats": supplier_stats_vectors(),
        # Generated after the older sections so their seeded values stay byte-identical.
        "project": project_vectors(),
        "projection": projection_vectors(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {sum(len(v) for v in payload.values() if isinstance(v, list))} vectors")


if __name__ == "__main__":
    main()
