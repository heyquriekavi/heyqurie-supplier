"""Build one HTML page showing every bill next to what Sarvam Vision read from it.

    python tools/bill_dashboard.py            # system python (needs Pillow)
    -> tools/bills/results/dashboard.html
"""
import base64, html, io, json
from pathlib import Path
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
BILLS = HERE / "bills"
OUT = BILLS / "results"

# what each bill is: (label, kind, script, source)
META = {
    "gh_example1": ("GST invoice, WeWork India", "printed", "English", "GitHub OCR-invoice-Template"),
    "gh_example2": ("Cafe thermal bill, Quorum Club Gurugram (blurry)", "printed photo", "English", "GitHub OCR-invoice-Template"),
    "gh_example3": ("Restaurant cash memo, Wine Town Pune (thermal)", "printed photo", "English", "GitHub OCR-invoice-Template"),
    "gh_example4": ("Starbucks tax invoice, Mumbai (thermal, faint)", "printed photo", "English", "GitHub OCR-invoice-Template"),
    "gh_example5": ("Cafe bill, Providore Gurugram (thermal)", "printed photo", "English", "GitHub OCR-invoice-Template"),
    "ph_khaata_page_1": ("Khata ledger page 1, Sharma Kirana", "handwriting font", "Hindi + English", "GitHub PakkaHisaab (synthetic)"),
    "ph_khaata_page_2": ("Khata ledger page 2, Sharma Kirana", "handwriting font", "Hindi + English", "GitHub PakkaHisaab (synthetic)"),
    "ph_kumar_inv_232": ("Supplier invoice INV-232, Kumar Suppliers", "handwriting font", "Hindi + English", "GitHub PakkaHisaab (synthetic)"),
    "ph_kumar_inv_233": ("Supplier invoice INV-233, Kumar Suppliers", "handwriting font", "Hindi + English", "GitHub PakkaHisaab (synthetic)"),
    "ph_mehta_inv_231": ("Supplier invoice INV-231, Mehta Kirana", "handwriting font", "Hindi + English", "GitHub PakkaHisaab (synthetic)"),
    "wc_foodmessbillmarch_jpg": ("Mess receipt, Kota (form + pen)", "handwritten", "Hindi + English", "Wikimedia Commons, CC0"),
    "wc_kollam_prepaid_autorickshaw_receipt_dec_": ("Prepaid auto receipt, Kollam", "handwritten", "Malayalam + English", "Wikimedia Commons, CC BY-SA 4.0"),
    "wc_bill_for_popcorn_kg_cinemas_coimbatore_y": ("Cinema popcorn bill, Coimbatore", "printed photo", "English", "Wikimedia Commons, CC BY-SA 4.0"),
    "wc_receipt_of_registered_anchal_jpg": ("Post office registered receipt", "printed photo", "Malayalam + English", "Wikimedia Commons, CC BY-SA 3.0"),
    "wc_bill_in_a_local_restaurant_mysore_karnat": ("Blank cash bill form, Mysore (nothing written)", "printed photo", "English", "Wikimedia Commons, CC BY-SA 3.0"),
    "wc_cmdrf_receipt_jpg": ("CMDRF donation receipt", "printed photo", "English", "Wikimedia Commons, CC BY-SA 4.0"),
    "wc_medical_store_cash_memo_receipt_design_t": ("Medical store cash memo (template)", "printed", "English", "Wikimedia Commons, CC BY-SA 4.0"),
    "wc_temple_committee_man_member_writing_a_do": ("Temple donation receipt being written, Kathmandu", "handwritten", "Devanagari (Nepali)", "Wikimedia Commons, CC BY-SA 4.0"),
    "ed_01_tneb_bill": ("TNEB electricity bill", "printed photo", "Tamil + English", "GitHub edith-android demo"),
    "ed_02_water_bill_overdue": ("Water bill, overdue", "printed photo", "English", "GitHub edith-android demo"),
}


def thumb(path: Path, width=1100) -> str:
    im = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=78, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


KEYS = ["seller_name", "seller_gstin", "seller_phone", "buyer_name", "invoice_number", "bill_date",
        "due_date", "subtotal", "tax_amount", "total_amount", "is_handwritten"]


def conf_cls(c):
    if c is None: return ""
    return "c-hi" if c >= 0.9 else "c-mid" if c >= 0.6 else "c-lo"


def fmt(v):
    if v is None or v == "": return "<span class='none'>–</span>"
    if isinstance(v, float) and v.is_integer(): v = int(v)
    if isinstance(v, (int, float)): return f"₹{v:,}" if abs(v) >= 100 else str(v)
    return html.escape(str(v))


def fields_table(exr: dict, title: str = "Extract (schema)") -> str:
    if not exr:
        return f"<div class='fields'><div class='fhead'>{title}</div><p class='none'>not run</p></div>"
    if exr.get("error"):
        return f"<div class='fields'><div class='fhead'>{title}</div><p class='none'>error: {html.escape(str(exr['error'])[:160])}</p></div>"
    f, c = exr.get("fields") or {}, exr.get("confidence") or {}
    rows = "".join(f"<tr class='{conf_cls(c.get(k))}'><th>{k.replace('_', ' ')}</th><td>{fmt(f.get(k))}</td>"
                   f"<td class='conf'>{'' if c.get(k) is None else f'{c[k]:.2f}'}</td></tr>" for k in KEYS)
    items = f.get("items") or []
    irows = "".join(f"<tr><td>{fmt(i.get('description'))}</td><td>{fmt(i.get('qty'))}</td>"
                    f"<td>{fmt(i.get('rate'))}</td><td>{fmt(i.get('amount'))}</td></tr>" for i in items)
    itable = (f"<table class='items'><thead><tr><th>item</th><th>qty</th><th>rate</th><th>amount</th></tr></thead>"
              f"<tbody>{irows}</tbody></table>") if items else "<p class='none'>no line items returned</p>"
    return (f"<div class='fields'><div class='fhead'>{title} · {exr.get('seconds', '?')} s</div>"
            f"<table class='kv'><tbody>{rows}</tbody></table>{itable}</div>")


def main():
    rows, kinds = [], {}
    total_s, n_ok = 0.0, 0
    for path in sorted(p for p in BILLS.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")):
        j = OUT / (path.stem + ".json")
        rec = json.loads(j.read_text(encoding="utf-8")) if j.exists() else {"status": "not run"}
        label, kind, script, source = META.get(path.stem, (path.stem, "?", "?", "?"))
        kinds[kind] = kinds.get(kind, 0) + 1
        ok = str(rec.get("status", "")).lower() in ("completed", "partially_completed")
        if ok:
            total_s += rec.get("seconds", 0); n_ok += 1
        text = rec.get("markdown") or rec.get("error") or rec.get("status", "")
        ex = OUT / (path.stem + ".extract.json")
        exr = json.loads(ex.read_text(encoding="utf-8")) if ex.exists() else {}
        gm = OUT / (path.stem + ".gemini.json")
        gmr = json.loads(gm.read_text(encoding="utf-8")) if gm.exists() else {}
        fields_html = "<div class='side'>" + fields_table(exr, "Sarvam extract") + fields_table(gmr, "Gemini 3.5 Flash") + "</div>"
        nblocks = sum(len(p["blocks"]) for p in rec.get("pages", []))
        status_cls = "ok" if ok else "bad"
        rows.append(f"""
<article class="bill" data-kind="{html.escape(kind)}" id="{html.escape(path.stem)}">
  <header>
    <h2>{html.escape(label)}</h2>
    <div class="tags">
      <span class="tag kind">{html.escape(kind)}</span>
      <span class="tag">{html.escape(script)}</span>
      <span class="tag {status_cls}">{html.escape(str(rec.get('status', 'not run')))} · {rec.get('seconds', '–')} s · {nblocks} blocks · {len(text)} chars</span>
    </div>
    <p class="src">{html.escape(source)} · <code>{html.escape(path.name)}</code></p>
  </header>
  <div class="pair">
    <a class="img" href="{thumb(path)}" target="_blank" rel="noopener"><img src="{thumb(path, 700)}" alt="{html.escape(label)}" loading="lazy"></a>
    <div class="right">
      {fields_html}
      <details class="raw" open><summary>Full text (digitise)</summary><pre class="text">{html.escape(text)}</pre></details>
    </div>
  </div>
</article>""")

    chips = "".join(f'<button class="chip" data-kind="{html.escape(k)}">{html.escape(k)} <b>{v}</b></button>' for k, v in sorted(kinds.items()))
    avg = f"{total_s / n_ok:.1f}" if n_ok else "–"
    page = f"""<title>Sarvam Bill Reads</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;600;700&family=Noto+Sans+Devanagari:wght@400;600&display=swap">
<style>
:root {{
  --bg:#FBFAF6; --surface:#FFFFFF; --text:#1B2430; --muted:#5B6670; --border:#E1E4DE;
  --green:#1F7A4D; --red:#C43B2E; --amber:#B7791F; --blue:#2F5BEA; --chipbg:#F1F0EA;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg:#121816; --surface:#1B2320; --text:#E9EDE7; --muted:#A7B0A9; --border:#2A3430;
  --green:#4CAF7E; --red:#E8776C; --amber:#D9A441; --blue:#7C96FF; --chipbg:#222B27;
}} }}
:root[data-theme="dark"] {{
  --bg:#121816; --surface:#1B2320; --text:#E9EDE7; --muted:#A7B0A9; --border:#2A3430;
  --green:#4CAF7E; --red:#E8776C; --amber:#D9A441; --blue:#7C96FF; --chipbg:#222B27;
}}
* {{ box-sizing:border-box }}
body {{ background:var(--bg); color:var(--text); font:15px/1.5 "Noto Sans","Noto Sans Devanagari",system-ui,sans-serif; padding-block:28px 60px; padding-inline:clamp(16px,4vw,40px); max-width:1400px; margin:0 auto }}
h1 {{ font-size:26px; margin:0 0 4px; text-wrap:balance }}
.lede {{ color:var(--muted); margin:0 0 20px; max-width:70ch }}
.stats {{ display:flex; flex-wrap:wrap; gap:10px 28px; padding:14px 18px; border:1px solid var(--border); border-radius:12px; background:var(--surface); margin-bottom:18px; font-variant-numeric:tabular-nums }}
.stats div small {{ display:block; color:var(--muted); font-size:12px; letter-spacing:.04em; text-transform:uppercase }}
.stats div b {{ font-size:20px; font-weight:600 }}
.chips {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px }}
.chip {{ font:inherit; font-size:14px; padding:6px 14px; border-radius:24px; border:1px solid var(--border); background:var(--chipbg); color:var(--text); cursor:pointer }}
.chip b {{ font-weight:600; color:var(--muted) }}
.chip.on {{ background:var(--green); border-color:var(--green); color:#fff }} .chip.on b {{ color:#e6f4ec }}
.chip:focus-visible {{ outline:2px solid var(--blue); outline-offset:2px }}
.bill {{ background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:16px 18px; margin-bottom:18px }}
.bill[hidden] {{ display:none }}
.bill h2 {{ font-size:18px; margin:0 0 6px }}
.tags {{ display:flex; flex-wrap:wrap; gap:6px; margin-bottom:4px }}
.tag {{ font-size:12.5px; padding:2px 10px; border-radius:24px; background:var(--chipbg); color:var(--muted) }}
.tag.kind {{ color:var(--text); font-weight:600 }}
.tag.ok {{ color:var(--green) }} .tag.bad {{ color:var(--red) }}
.src {{ margin:0 0 12px; color:var(--muted); font-size:13px }} .src code {{ font-size:12px }}
.pair {{ display:grid; grid-template-columns:minmax(220px,2fr) 3fr; gap:16px; align-items:start }}
@media (max-width:760px) {{ .pair {{ grid-template-columns:1fr }} }}
.img img {{ width:100%; max-width:100%; height:auto; border:1px solid var(--border); border-radius:8px; display:block }}
.right {{ display:grid; gap:12px; min-width:0 }}
.side {{ display:grid; grid-template-columns:1fr 1fr; gap:12px }} @media (max-width:1100px) {{ .side {{ grid-template-columns:1fr }} }}
.fields {{ border:1px solid var(--border); border-radius:8px; overflow:hidden }}
.fhead {{ font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); padding:8px 12px; border-bottom:1px solid var(--border); background:var(--chipbg) }}
table {{ border-collapse:collapse; width:100%; font-size:14px; font-variant-numeric:tabular-nums }}
.kv th {{ text-align:left; font-weight:400; color:var(--muted); padding:5px 12px; width:34%; white-space:nowrap }}
.kv td {{ padding:5px 12px; overflow-wrap:anywhere }}
.kv td.conf {{ text-align:right; color:var(--muted); font-size:12.5px; width:14% }}
.kv tr {{ border-bottom:1px solid var(--border) }}
.kv tr.c-hi td.conf {{ color:var(--green) }} .kv tr.c-mid td.conf {{ color:var(--amber) }} .kv tr.c-lo td.conf {{ color:var(--red) }}
.kv tr.c-mid td, .kv tr.c-lo td {{ background:color-mix(in srgb, var(--amber) 10%, transparent) }}
.kv tr.c-lo td {{ background:color-mix(in srgb, var(--red) 12%, transparent) }}
.items {{ border-top:2px solid var(--border) }}
.items th {{ text-align:left; font-size:12px; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); padding:6px 12px; font-weight:600 }}
.items td {{ padding:5px 12px; border-top:1px solid var(--border) }}
.items td:nth-child(n+2), .items th:nth-child(n+2) {{ text-align:right; white-space:nowrap }}
.none {{ color:var(--muted); font-size:13px; margin:0; padding:6px 12px }}
.raw summary {{ cursor:pointer; color:var(--muted); font-size:13px; margin-bottom:6px }}
.text {{ margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font:13.5px/1.55 "Noto Sans","Noto Sans Devanagari",ui-monospace,monospace; background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:12px 14px; max-height:50vh; overflow:auto }}
.foot {{ color:var(--muted); font-size:13px; margin-top:28px; max-width:70ch }}
</style>
<h1>Sarvam Bill Reads</h1>
<p class="lede">Twenty bills from the web. For each: Sarvam Vision extract with our bill schema (Sarvam's own confidence, green ≥ 0.90, amber ≥ 0.60, red below) beside Gemini 3.5 Flash with the same schema (no confidence; one vision call, temperature 0), then Sarvam's full text. Click a picture for full size.</p>
<div class="stats">
  <div><small>Bills</small><b>{len(rows)}</b></div>
  <div><small>Read OK</small><b>{n_ok}</b></div>
  <div><small>Avg time</small><b>{avg} s</b></div>
  <div><small>Sarvam</small><b>₹0.50 / page</b></div>
  <div><small>Gemini</small><b>≈₹0.35 / bill</b></div>
  <div><small>Run</small><b>10 Sep 2026</b></div>
</div>
<div class="chips"><button class="chip on" data-kind="all">all <b>{len(rows)}</b></button>{chips}</div>
{''.join(rows)}
<p class="foot">Printed = born-digital or template. Printed photo = paper bill photographed. Handwritten = pen on paper. Handwriting font = synthetic page set in a script typeface, useful for Devanagari but easier than real pen. Sources and licences are on each card.</p>
<script>
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {{
  document.querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === c));
  const k = c.dataset.kind;
  document.querySelectorAll('.bill').forEach(b => b.hidden = k !== 'all' && b.dataset.kind !== k);
}}));
</script>
"""
    (OUT / "dashboard.html").write_text(page, encoding="utf-8")
    print("wrote", OUT / "dashboard.html", f"{(OUT / 'dashboard.html').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
