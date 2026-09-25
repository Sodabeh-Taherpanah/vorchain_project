"""Export golden JSON outputs of the Python prototype for TS engine parity tests.

Run:  python3 reference/python-prototype/export_golden.py
Writes reference/python-prototype/golden/{sample_data,sample_data_de}.json
"""
import json
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from shortage_radar import analyse  # noqa: E402

AS_OF = date(2026, 10, 5)
HORIZON = 28

out_dir = HERE / "golden"
out_dir.mkdir(exist_ok=True)
for name in ("sample_data", "sample_data_de"):
    results, sstats, _ = analyse(HERE / name, AS_OF, HORIZON, "en")
    payload = {
        "asOf": AS_OF.isoformat(),
        "horizon": HORIZON,
        "exceptions": [
            {k: r[k] for k in ("material_id", "severity", "critical_date", "days_until",
                               "min_projected_stock", "hidden_risk", "erp_view_date", "score")}
            for r in results
        ],
        "suppliers": {
            sid: {"mean": round(s["mean"], 4), "p80": s["p80"], "on_time_rate": round(s["on_time_rate"], 4), "n": s["n"]}
            for sid, s in sorted(sstats.items())
        },
    }
    (out_dir / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"golden/{name}.json: {len(results)} exceptions")
