"""Mark any bill reader against the answer key (tools/bills/truth.json).

    backend/.venv/Scripts/python.exe tools/score_readers.py                    # sarvam extract vs gemini
    backend/.venv/Scripts/python.exe tools/score_readers.py extract --no-repair # one reader, GSTIN repair off
    backend/.venv/Scripts/python.exe tools/score_readers.py extract brain      # any results/<bill>.<name>.json with a "fields" dict

Each reader's raw fields go through app.bills.shape() first, so what is scored is what the
app would show, repairs included. "invented" counts fields the bill does not have but the
reader filled in; that is the worst kind of wrong.
"""
import json
import os
import re
import sys
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app import bills  # noqa: E402

HERE = Path(__file__).resolve().parent / "bills"
TRUTH = {k: v for k, v in json.loads((HERE / "truth.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
FIELDS = ["supplier", "gstin", "number", "date", "due_date", "total", "items", "buyer"]
SHOWN = {"supplier": "supplier_name", "buyer": "buyer_name", "total": "total_paise"}


def norm(s) -> str:
    return re.sub(r"[^a-z0-9ऀ-ॿ]", "", str(s or "").casefold())


def name_ok(got, want) -> bool:
    if want is None:
        return not got
    g = norm(got)
    return bool(g) and any(norm(w) in g or (len(g) >= 4 and g in norm(w)) for w in want)


def listify(v):
    return v if isinstance(v, list) else [v]


def check(field: str, fields: dict, t: dict):
    """-> 'ok' | 'wrong' | 'missing' | 'invented' | None (not scored)."""
    if field in ("supplier", "buyer"):
        got, want = fields[SHOWN[field]], t[field]
        ok = name_ok(got, want)
    elif field in ("gstin", "date", "due_date"):
        got, want = fields[field], t[field]
        ok = got == want
    elif field == "number":
        got, want = fields["number"], t["number"]
        ok = (not got and want is None) or (bool(got) and want is not None and norm(got) in [norm(w) for w in want])
    elif field == "total":
        got, want = fields["total_paise"], t["total"]
        ok = (got is None and want is None) or (got is not None and want is not None and got in [round(w * 100) for w in listify(want)])
    else:  # items
        want = t["items"]
        if want is None:
            return None
        got = len(fields["items"])
        ok = got == want
    if ok:
        return "ok"
    if want is None and got:
        return "invented"
    if not got and got != 0:
        return "missing"
    return "wrong"


def score(name: str, verbose: bool = True) -> dict:
    tally = {f: {"ok": 0, "wrong": 0, "missing": 0, "invented": 0, "n": 0} for f in FIELDS}
    misses = []
    for stem, t in TRUTH.items():
        p = HERE / "results" / f"{stem}.{name}.json"
        rec = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
        raw = rec.get("fields") or {}
        fields, _, _ = bills.shape(raw, "handwritten" if t["handwritten"] else "printed")
        for f in FIELDS:
            r = check(f, fields, t)
            if r is None:
                continue
            tally[f]["n"] += 1
            tally[f][r] += 1
            if r != "ok":
                got = len(fields["items"]) if f == "items" else fields.get(SHOWN.get(f, f))
                misses.append(f"  {stem[:28]:28} {f:9} {r:8} got={got!r} want={t[f]!r}")
    if verbose:
        print(f"== {name}")
        for f in FIELDS:
            c = tally[f]
            print(f"  {f:9} {c['ok']:2}/{c['n']:2} right   wrong {c['wrong']}  missing {c['missing']}  invented {c['invented']}")
        total_ok = sum(c["ok"] for c in tally.values())
        total_n = sum(c["n"] for c in tally.values())
        print(f"  {'ALL':9} {total_ok:2}/{total_n:2} right   invented {sum(c['invented'] for c in tally.values())}")
        print("\n".join(misses))
    return tally


if __name__ == "__main__":
    if "--no-repair" in sys.argv:
        bills.REPAIR_GSTIN = False
    names = [a for a in sys.argv[1:] if not a.startswith("--")] or ["extract", "gemini"]
    for n in names:
        score(n)
        print()
