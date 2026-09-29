"""Generate CPython reference vectors for the engine's date and rounding helpers.

The expected values come straight from the prototype (`add_workdays`, `workdays_between`) and
from CPython itself (`date.weekday`, `timedelta`, `round`), so `python-vectors.test.ts` checks the
TypeScript ports against the real thing instead of hand-written tables. Seeded, so reruns are
byte-identical.

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
from shortage_radar import add_workdays, workdays_between  # noqa: E402

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


def main():
    add_workdays_cases, between_cases, calendar_cases = date_vectors()
    payload = {
        "generatedBy": "packages/engine/scripts/generate-python-vectors.py",
        "addWorkdays": add_workdays_cases,
        "workdaysBetween": between_cases,
        "calendar": calendar_cases,
        "round": rounding_vectors(),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {sum(len(v) for v in payload.values() if isinstance(v, list))} vectors")


if __name__ == "__main__":
    main()
