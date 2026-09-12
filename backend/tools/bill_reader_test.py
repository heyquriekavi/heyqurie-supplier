"""Phase 0: run every image in tools/bills/ through Sarvam Vision (digitise) and save
what came back, so we can see how well it reads printed, handwritten, Hindi and mixed bills.

    backend/.venv/Scripts/python.exe tools/bill_reader_test.py            # digitise, all bills
    backend/.venv/Scripts/python.exe tools/bill_reader_test.py gh_example1 # one bill
    backend/.venv/Scripts/python.exe tools/bill_reader_test.py --extract   # schema extract (tools/bill_schema.json)
    backend/.venv/Scripts/python.exe tools/bill_reader_test.py --gemini    # same schema through Gemini 3.5 Flash

Writes tools/bills/results/<name>.json  (blocks, text, timing, usage)
and    tools/bills/results/<name>.md    (the markdown Sarvam produced)
and    tools/bills/results/<name>.extract.json (fields + per-field confidence, --extract)
Cost: Rs 0.50 per page. Already-done bills are skipped; delete the json to redo.
"""
import io, json, os, sys, time, zipfile
from pathlib import Path

from dotenv import load_dotenv
from sarvamai import SarvamAI
from sarvamai.core.api_error import ApiError

HERE = Path(__file__).resolve().parent
BILLS = HERE / "bills"
OUT = BILLS / "results"
load_dotenv(HERE.parent / ".env")
TERMINAL = {"completed", "partially_completed", "failed", "rejected"}


def call(fn, *a, **kw):
    """Sarvam allows 10 requests a minute; back off on 429 instead of dying."""
    for attempt in range(6):
        try:
            return fn(*a, **kw)
        except ApiError as e:
            if e.status_code != 429:
                raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("still rate limited after 6 tries")


def read_one(client, path: Path) -> dict:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    t0 = time.time()
    with open(path, "rb") as f:
        job = call(client.doc_ai.digitise, file=[(path.name, f, mime)],
                   language="hi-IN", output_format="md", content_type="mixed")
    while True:
        st = call(client.doc_ai.get_status, job_id=job.job_id)
        if st.status.lower() in TERMINAL:
            break
        time.sleep(3)
    seconds = round(time.time() - t0, 1)
    rec = {"file": path.name, "job_id": job.job_id, "status": st.status, "seconds": seconds,
           "usage": st.usage.model_dump() if st.usage else None, "pages": [], "markdown": ""}
    if st.status.lower() not in ("completed", "partially_completed"):
        return rec
    res = call(client.doc_ai.get_results, job_id=job.job_id)
    for doc in res.documents or []:
        for page in doc.pages or []:
            rec["pages"].append({"page": page.page_num, "width": page.image_width,
                                 "height": page.image_height, "blocks": page.blocks or []})
    # the markdown lives in the downloadable zip
    try:
        dl = call(client.doc_ai.get_download_url, job_id=job.job_id)
        import urllib.request
        data = urllib.request.urlopen(dl.url, timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            texts = [z.read(n).decode("utf-8", "replace") for n in z.namelist()
                     if n.lower().endswith((".md", ".txt", ".html"))]
        rec["markdown"] = "\n\n".join(texts)
    except Exception as e:  # keep the blocks even if the zip fails
        rec["download_error"] = str(e)[:200]
    if not rec["markdown"]:
        rec["markdown"] = "\n\n".join(b.get("text", "") for p in rec["pages"] for b in p["blocks"])
    return rec


def extract_one(client, path: Path, schema: str) -> dict:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    t0 = time.time()
    with open(path, "rb") as f:
        job = call(client.doc_ai.extract, file=[(path.name, f, mime)], schema=schema,
                   language="hi-IN", output_format="json")
    while True:
        st = call(client.doc_ai.get_status, job_id=job.job_id)
        if st.status.lower() in TERMINAL:
            break
        time.sleep(3)
    rec = {"file": path.name, "job_id": job.job_id, "status": st.status,
           "seconds": round(time.time() - t0, 1), "fields": {}, "confidence": {}}
    if st.status.lower() in ("completed", "partially_completed"):
        res = call(client.doc_ai.get_results, job_id=job.job_id).model_dump()
        rec["fields"] = res.get("result") or {}
        rec["confidence"] = {k: v.get("confidence") for k, v in (res.get("annotations") or {}).items()
                             if isinstance(v, dict)}
    return rec


GEMINI_MODEL = os.getenv("GEMINI_READER_MODEL", "gemini-3.5-flash")


def gemini_one(path: Path, schema: str) -> dict:
    """One vision call to Gemini through its OpenAI-compatible endpoint, same fields as the Sarvam schema."""
    import base64
    from openai import OpenAI
    client = OpenAI(api_key=os.environ["GEMINI_API_KEY"], base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    data = base64.b64encode(path.read_bytes()).decode()
    props = json.loads(schema)["properties"]
    want = "\n".join(f"- {k}: {v['description']}" for k, v in props.items() if k != "items")
    prompt = ("Read this Indian bill or receipt. Return ONLY a JSON object with these keys (null when not on the bill):\n"
              f"{want}\n- items: array of {{description, qty, rate, amount}} for each line item, [] if none.\n"
              "Amounts as plain numbers in rupees. Dates exactly as written. Do not guess.")
    t0 = time.time()
    r = client.chat.completions.create(
        model=GEMINI_MODEL,
        messages=[{"role": "user", "content": [{"type": "text", "text": prompt},
                                               {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}]}],
        response_format={"type": "json_object"},
        temperature=0,
    )
    text = r.choices[0].message.content or "{}"
    try:
        fields = json.loads(text)
    except ValueError:
        fields = {"_unparsed": text[:2000]}
    usage = r.usage.model_dump() if r.usage else {}
    return {"file": path.name, "status": "completed", "seconds": round(time.time() - t0, 1), "model": GEMINI_MODEL,
            "fields": fields, "usage": usage}


def main():
    gemini = "--gemini" in sys.argv
    extract = "--extract" in sys.argv or gemini
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    schema = (HERE / "bill_schema.json").read_text(encoding="utf-8") if extract else None
    client = None if gemini else SarvamAI(api_subscription_key=os.environ["SARVAM_API_KEY"])
    OUT.mkdir(exist_ok=True)
    files = sorted(p for p in BILLS.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    if only:
        files = [p for p in files if p.stem in only]
    for i, path in enumerate(files, 1):
        out = OUT / (path.stem + (".gemini.json" if gemini else ".extract.json" if extract else ".json"))
        if out.exists():
            print(f"[{i}/{len(files)}] {path.name}: done already")
            continue
        try:
            rec = gemini_one(path, schema) if gemini else extract_one(client, path, schema) if extract else read_one(client, path)
        except ApiError as e:
            rec = {"file": path.name, "status": f"error {e.status_code}", "error": str(e.body)[:500]}
        except Exception as e:  # Gemini side
            rec = {"file": path.name, "status": "error", "error": str(e)[:500], "fields": {}}
        out.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
        if extract:
            f = rec.get("fields", {})
            print(f"[{i}/{len(files)}] {path.name}: {rec['status']} {rec.get('seconds', '?')}s "
                  f"seller={f.get('seller_name')!r} total={f.get('total_amount')} items={len(f.get('items') or [])}")
        else:
            (OUT / (path.stem + ".md")).write_text(rec.get("markdown", ""), encoding="utf-8")
            nblocks = sum(len(p["blocks"]) for p in rec.get("pages", []))
            print(f"[{i}/{len(files)}] {path.name}: {rec['status']} {rec.get('seconds', '?')}s "
                  f"{nblocks} blocks {len(rec.get('markdown', ''))} chars")
        if not gemini:
            time.sleep(4)  # ponytail: crude pacing for Sarvam's 10/min limit; job batching if we ever do 100s


if __name__ == "__main__":
    main()
