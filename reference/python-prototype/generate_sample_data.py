"""Generate a small, fake but realistic dataset for the Vorchain prototype.

Run:  python3 generate_sample_data.py
Writes CSVs into ./sample_data. Uses only the Python standard library.
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)
OUT = Path(__file__).parent / "sample_data"
OUT.mkdir(exist_ok=True)
AS_OF = date(2026, 10, 5)  # the "today" of the dataset

# supplier_id -> (name, mean delay days, spread)
SUPPLIERS = {
    "S01": ("Metallbau Krüger GmbH", 0, 1),
    "S02": ("Elektronik Weber AG", 6, 4),      # chronically late
    "S03": ("Kunststoff Nord KG", 1, 2),
    "S04": ("Asia Components Ltd", 12, 6),     # long + unreliable
    "S05": ("Schrauben Meyer", 0, 0),
    "S06": ("Kabel & Draht GmbH", 3, 3),
}

def write(name, header, rows):
    with open(OUT / name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)

write("suppliers.csv", ["supplier_id", "name"], [[k, v[0]] for k, v in SUPPLIERS.items()])

# delivery history: last 12 months of receipts
hist = []
for sid, (_, mean, spread) in SUPPLIERS.items():
    for i in range(25):
        promised = AS_OF - timedelta(days=random.randint(10, 360))
        delay = max(-2, round(random.gauss(mean, spread)))
        hist.append([f"H{sid}{i:03d}", sid, promised.isoformat(), (promised + timedelta(days=delay)).isoformat()])
write("supplier_history.csv", ["po_id", "supplier_id", "promised_date", "actual_date"], hist)

materials, pos, demand = [], [], []
po_n = 1
for m in range(1, 31):
    mid = f"M{m:04d}"
    sid = random.choice(list(SUPPLIERS))
    daily = random.choice([5, 10, 20, 40, 80])
    on_hand = daily * random.randint(3, 25)
    safety = daily * random.randint(2, 5)
    materials.append([mid, f"Part {mid}", sid, on_hand, safety, "pcs"])
    # demand for next 28 working-ish days, with an occasional spike
    for d in range(28):
        day = AS_OF + timedelta(days=d)
        if day.weekday() >= 5:
            continue
        q = daily * (3 if random.random() < 0.05 else 1)
        demand.append([mid, day.isoformat(), q])
    # 0-2 open purchase orders
    for _ in range(random.choice([0, 1, 1, 2])):
        promised = AS_OF + timedelta(days=random.randint(2, 20))
        pos.append([f"PO{po_n:05d}", mid, sid, daily * random.randint(5, 20), promised.isoformat()])
        po_n += 1

write("materials.csv", ["material_id", "description", "main_supplier_id", "on_hand", "safety_stock", "unit"], materials)
write("open_purchase_orders.csv", ["po_id", "material_id", "supplier_id", "qty", "promised_date"], pos)
write("demand.csv", ["material_id", "date", "qty"], demand)
print(f"Sample data written to {OUT} (as-of date {AS_OF})")


# ---------------------------------------------------------------------------
# Same data again, but shaped like a typical German ERP CSV export:
# ';' delimiter, German headers, dd.mm.yyyy dates, decimal commas, BOM.
DE = Path(__file__).parent / "sample_data_de"
DE.mkdir(exist_ok=True)

def de_date(s):
    y, m, d_ = s.split("-")
    return f"{d_}.{m}.{y}"

def de_num(x):
    return f"{float(x):.1f}".replace(".", ",")

def write_de(name, header, rows):
    with open(DE / name, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(header)
        w.writerows(rows)

write_de("lieferanten.csv", ["Lieferantennr", "Name"], [[k, v[0]] for k, v in SUPPLIERS.items()])
write_de("lieferhistorie.csv", ["Bestellnummer", "Lieferant", "Liefertermin", "Wareneingang"],
         [[a, b, de_date(c), de_date(e)] for a, b, c, e in hist])
write_de("artikel.csv", ["Artikelnummer", "Bezeichnung", "Hauptlieferant", "Lagerbestand", "Sicherheitsbestand", "ME"],
         [[a, b, c, de_num(e), de_num(f), "Stk"] for a, b, c, e, f, _ in materials])
write_de("bestellungen.csv", ["Bestellnummer", "Artikelnummer", "Lieferant", "Bestellmenge", "Liefertermin"],
         [[a, b, c, de_num(e), de_date(f)] for a, b, c, e, f in pos])
write_de("bedarf.csv", ["Artikelnummer", "Bedarfsdatum", "Menge"],
         [[a, de_date(b), de_num(c)] for a, b, c in demand])
print(f"German-format copy written to {DE}")
