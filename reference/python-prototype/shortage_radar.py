"""Vorchain: prototype v0.2

Reads ERP exports (CSV or Excel, German or English headers) and ranks the
materials most likely to run short.

Key idea: project stock twice:
  1. "ERP view"       -> incoming POs arrive on the PROMISED date
  2. "Realistic view" -> incoming POs arrive on promised date + the supplier's
                          historical delay (80th percentile, in WORKING days)
A material that looks fine in the ERP view but runs short in the realistic
view is a HIDDEN RISK.

Severity:
  CRITICAL -> projected stock goes below zero (production stop)
  WARNING  -> projected stock goes below safety stock, but not below zero

Run:
  python3 shortage_radar.py                       # sample data, English report
  python3 shortage_radar.py sample_data_de --lang de
  python3 shortage_radar.py /path/to/export --as-of 2026-10-05 --horizon 28 --top 10
Outputs: report.md and exceptions.csv in the data folder (or --out).
"""
import argparse
import csv
import sys
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

from loaders import DataError, load_table

# ---------------------------------------------------------------- helpers

def add_workdays(d, n):
    """Shift a date by n working days (Mon-Fri). Holidays are ignored in v0.2."""
    step = 1 if n >= 0 else -1
    while n != 0:
        d += timedelta(days=step)
        if d.weekday() < 5:
            n -= step
    return d


def workdays_between(a, b):
    """Signed number of working days from a to b."""
    if a == b:
        return 0
    sign, lo, hi = (1, a, b) if b > a else (-1, b, a)
    n, d = 0, lo
    while d < hi:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    return sign * n


def percentile(values, p):
    if not values:
        return 0
    v = sorted(values)
    k = (len(v) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(v) - 1)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def supplier_stats(history, min_n=3):
    delays = defaultdict(list)
    for r in history:
        if r["promised_date"] and r["actual_date"]:
            delays[r["supplier_id"]].append(workdays_between(r["promised_date"], r["actual_date"]))
    stats = {}
    for sid, v in delays.items():
        stats[sid] = {
            "mean": sum(v) / len(v),
            "p80": max(0, round(percentile(v, 0.8))),
            "on_time_rate": sum(1 for x in v if x <= 0) / len(v),
            "n": len(v),
            "reliable_stats": len(v) >= min_n,
        }
    return stats


def project(on_hand, demand_by_day, receipts, start, horizon, safety):
    """Day-by-day stock projection. Returns first stockout date, first
    below-safety date and the minimum projected stock."""
    stock, first_short, first_below_ss, min_stock = on_hand, None, None, on_hand
    for i in range(horizon):
        day = start + timedelta(days=i)
        stock += receipts.get(day, 0)
        stock -= demand_by_day.get(day, 0)
        min_stock = min(min_stock, stock)
        if stock < 0 and first_short is None:
            first_short = day
        if stock < safety and first_below_ss is None:
            first_below_ss = day
    return first_short, first_below_ss, min_stock

# ---------------------------------------------------------------- texts

TXT = {
    "en": {
        "no_po": "no open purchase order covers the demand",
        "place": "Place an order now with {s}",
        "after": "{po} is promised for {p}, already AFTER the critical date",
        "pull": "Ask {s} to pull {po} forward before {d}, or source elsewhere",
        "late": "{po} promised {p}, but {s} is typically {n} working day(s) late (on-time rate {r:.0%})",
        "few": " (only {n} past deliveries, low confidence)",
        "expedite": "Expedite {po} / ask for partial delivery before {d}",
        "hidden": "ERP view (promised dates) shows {x}: hidden risk",
        "erp_later": "the problem only from {d}",
        "erp_none": "no problem at all",
        "default": "Increase order quantity or check the demand plan",
        "title": "Vorchain: report as of {d}",
        "summary": "**{c} critical** (stockout) and **{w} warnings** (below safety stock) in the next {h} days; **{hid}** of them are invisible in the ERP view.",
        "top": "Top {n} risks",
        "on": "Critical date", "in": "in {n} days", "gap": "lowest projected stock {x}",
        "sev": "Severity", "hid": "Hidden risk", "erpd": "ERP view date", "why": "Why", "act": "Next action",
        "sup": "Supplier reliability (history, working days)",
        "sup_head": "| Supplier | On-time | Mean delay | P80 delay | Deliveries |",
        "yes": "yes", "no": "no", "none": "none", "CRITICAL": "CRITICAL", "WARNING": "WARNING",
    },
    "de": {
        "no_po": "keine offene Bestellung deckt den Bedarf",
        "place": "Jetzt bei {s} bestellen",
        "after": "{po} ist für {p} bestätigt – bereits NACH dem kritischen Datum",
        "pull": "{s} bitten, {po} vor {d} vorzuziehen, oder alternativ beschaffen",
        "late": "{po} bestätigt für {p}, aber {s} liefert typischerweise {n} Arbeitstag(e) zu spät (Termintreue {r:.0%})",
        "few": " (nur {n} frühere Lieferungen, geringe Aussagekraft)",
        "expedite": "{po} nachfassen / Teillieferung vor {d} anfragen",
        "hidden": "ERP-Sicht (bestätigte Termine) zeigt {x}: verdecktes Risiko",
        "erp_later": "das Problem erst ab {d}",
        "erp_none": "gar kein Problem",
        "default": "Bestellmenge erhöhen oder Bedarfsplanung prüfen",
        "title": "Vorchain: Bericht zum {d}",
        "summary": "**{c} kritisch** (Fehlteil) und **{w} Warnungen** (unter Sicherheitsbestand) in den nächsten {h} Tagen; **{hid}** davon sind in der ERP-Sicht nicht sichtbar.",
        "top": "Top {n} Risiken",
        "on": "Kritisches Datum", "in": "in {n} Tagen", "gap": "niedrigster Planbestand {x}",
        "sev": "Schwere", "hid": "Verdecktes Risiko", "erpd": "Datum laut ERP", "why": "Warum", "act": "Nächster Schritt",
        "sup": "Lieferantentreue (Historie, Arbeitstage)",
        "sup_head": "| Lieferant | Pünktlich | Ø Verzug | P80 Verzug | Lieferungen |",
        "yes": "ja", "no": "nein", "none": "keins", "CRITICAL": "KRITISCH", "WARNING": "WARNUNG",
    },
}

# ---------------------------------------------------------------- core

def analyse(data_dir, as_of, horizon, lang="en"):
    t = TXT[lang]
    fd = (lambda x: x.strftime("%d.%m.%Y")) if lang == "de" else (lambda x: x.isoformat())
    materials = load_table(data_dir, "materials")
    pos = load_table(data_dir, "open_purchase_orders")
    demand = load_table(data_dir, "demand")
    history = load_table(data_dir, "supplier_history")
    suppliers = {r["supplier_id"]: r["name"] for r in load_table(data_dir, "suppliers", optional=True)}
    sstats = supplier_stats(history)
    sname = lambda sid: suppliers.get(sid, sid)  # noqa: E731

    dem = defaultdict(lambda: defaultdict(float))
    for r in demand:
        dem[r["material_id"]][r["date"]] += r["qty"]
    pos_by_mat = defaultdict(list)
    for r in pos:
        pos_by_mat[r["material_id"]].append(r)

    results = []
    for m in materials:
        mid, on_hand = m["material_id"], m["on_hand"]
        safety = m.get("safety_stock", 0.0) or 0.0
        erp_rec, real_rec, notes = defaultdict(float), defaultdict(float), []
        for p in pos_by_mat[mid]:
            promised = p["promised_date"]
            delay = sstats.get(p["supplier_id"], {}).get("p80", 0)
            realistic = add_workdays(promised, delay)
            erp_rec[promised] += p["qty"]
            real_rec[realistic] += p["qty"]
            notes.append((p, promised, realistic, delay))

        erp_short, erp_ss, _ = project(on_hand, dem[mid], erp_rec, as_of, horizon, safety)
        real_short, real_ss, real_min = project(on_hand, dem[mid], real_rec, as_of, horizon, safety)
        if real_short is None and real_ss is None:
            continue

        severity = "CRITICAL" if real_short else "WARNING"
        crit = real_short or real_ss
        erp_crit = erp_short if real_short else erp_ss
        days_left = (crit - as_of).days
        hidden = erp_crit is None or erp_crit > crit
        score = round(
            (horizon - days_left) * 3
            + min(max(safety - real_min, 0) / max(safety, 1) * 10, 30)
            + (15 if hidden else 0)
            + (25 if severity == "CRITICAL" else 0), 1)

        sup = m.get("main_supplier_id", "")
        why, action = [], []
        if not notes:
            why.append(t["no_po"])
            action.append(t["place"].format(s=sname(sup) or "?"))
        for p, promised, realistic, delay in notes:
            st = sstats.get(p["supplier_id"], {})
            if promised >= crit:
                why.append(t["after"].format(po=p["po_id"], p=fd(promised)))
                action.append(t["pull"].format(s=sname(p["supplier_id"]), po=p["po_id"], d=fd(crit)))
            elif delay > 0:
                txt = t["late"].format(po=p["po_id"], p=fd(promised), s=sname(p["supplier_id"]), n=delay, r=st.get("on_time_rate", 0))
                if not st.get("reliable_stats", True):
                    txt += t["few"].format(n=st.get("n", 0))
                why.append(txt)
                if realistic >= crit:
                    action.append(t["expedite"].format(po=p["po_id"], d=fd(crit)))
        if hidden:
            x = t["erp_later"].format(d=fd(erp_crit)) if erp_crit else t["erp_none"]
            why.append(t["hidden"].format(x=x))
        if not action:
            action.append(t["default"])

        results.append({
            "material_id": mid,
            "description": m.get("description", ""),
            "severity": severity,
            "critical_date": crit.isoformat(),
            "days_until": days_left,
            "min_projected_stock": round(real_min),
            "safety_stock": round(safety),
            "hidden_risk": "yes" if hidden else "no",
            "erp_view_date": erp_crit.isoformat() if erp_crit else "none",
            "score": score,
            "why": "; ".join(why),
            "next_action": "; ".join(action),
        })

    results.sort(key=lambda r: -r["score"])
    return results, sstats, suppliers


def write_outputs(out_dir, results, sstats, suppliers, as_of, horizon, top, lang="en"):
    t = TXT[lang]
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / "exceptions.csv", "w", newline="", encoding="utf-8-sig") as f:
        if results:
            w = csv.DictWriter(f, fieldnames=list(results[0].keys()), delimiter=";" if lang == "de" else ",")
            w.writeheader()
            w.writerows(results)

    crit = sum(r["severity"] == "CRITICAL" for r in results)
    hid = sum(r["hidden_risk"] == "yes" for r in results)
    fd = (lambda s: ".".join(reversed(s.split("-")))) if lang == "de" else (lambda s: s)
    yn = lambda v: t["yes"] if v == "yes" else t["no"]  # noqa: E731
    lines = [f"# {t['title'].format(d=fd(as_of.isoformat()))}", "",
             t["summary"].format(c=crit, w=len(results) - crit, h=horizon, hid=hid), "",
             f"## {t['top'].format(n=min(top, len(results)))}", ""]
    for i, r in enumerate(results[:top], 1):
        lines += [
            f"### {i}. [{t[r['severity']]}] {r['material_id']} – {r['description']} (score {r['score']})",
            f"- **{t['on']}:** {fd(r['critical_date'])} ({t['in'].format(n=r['days_until'])}), {t['gap'].format(x=r['min_projected_stock'])}",
            f"- **{t['hid']}:** {yn(r['hidden_risk'])} ({t['erpd']}: {fd(r['erp_view_date']) if r['erp_view_date'] != 'none' else t['none']})",
            f"- **{t['why']}:** {r['why']}",
            f"- **{t['act']}:** {r['next_action']}",
            "",
        ]
    lines += [f"## {t['sup']}", "", t["sup_head"], "|---|---|---|---|---|"]
    for sid, s in sorted(sstats.items(), key=lambda x: x[1]["on_time_rate"]):
        lines.append(f"| {suppliers.get(sid, sid)} | {s['on_time_rate']:.0%} | {s['mean']:.1f} | {s['p80']} | {s['n']} |")
    (out_dir / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv=None):
    ap = argparse.ArgumentParser(description="Vorchain prototype")
    ap.add_argument("data_dir", nargs="?", default=str(Path(__file__).parent / "sample_data"))
    ap.add_argument("--as-of", default="2026-10-05", help="'today' of the export (YYYY-MM-DD)")
    ap.add_argument("--horizon", type=int, default=28, help="days to look ahead")
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--lang", choices=["en", "de"], default="en")
    ap.add_argument("--out", help="output folder (default: data folder)")
    a = ap.parse_args(argv)
    data_dir, as_of = Path(a.data_dir), date.fromisoformat(a.as_of)
    try:
        results, sstats, suppliers = analyse(data_dir, as_of, a.horizon, a.lang)
    except DataError as e:
        print(f"Data problem: {e}", file=sys.stderr)
        return 2
    out = Path(a.out) if a.out else data_dir
    write_outputs(out, results, sstats, suppliers, as_of, a.horizon, a.top, a.lang)
    crit = sum(r["severity"] == "CRITICAL" for r in results)
    print(f"{crit} critical, {len(results) - crit} warnings -> {out / 'report.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
