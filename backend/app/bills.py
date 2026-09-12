"""Read a bill photo or PDF. Owner: Devansh.

POST /api/v1/bills/read   multipart: file (jpg/png/pdf), source (printed | handwritten)
  -> {fields, confidence, warnings, reader, seconds}

Sarvam Vision extract with our bill schema, then our own validators. Sarvam's own
confidence is meaningless (Phase 0: 0.99 on wrong values), so the confidence here is
ours: from the source (printed reads better), the GSTIN check digit, whether the date
parsed, and whether the items add up to the total. Nothing is saved yet; the app keeps
the draft and asks "Sahi hai?". Saving comes with the bills tables.
"""
import itertools
import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from .auth import get_current_user
from .shops import gstin_valid

router = APIRouter(prefix="/api/v1/bills", tags=["bills"])

SCHEMA = (Path(__file__).resolve().parent.parent / "tools" / "bill_schema.json").read_text(encoding="utf-8")
MAX_BYTES = 12 * 1024 * 1024
MIME_OK = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
DATE_FORMATS = ["%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y",
                "%d %b %Y", "%d %B %Y", "%d%b%y", "%d%b%Y", "%d %b %y", "%b %d, %Y", "%d/%m/%Y %H:%M:%S",
                "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"]


def parse_date(raw) -> str | None:
    """'16/2/24', '2026-07-10', '08May22', '26/08/2026 10:21:25 AM', '14:05 08May22' -> 'YYYY-MM-DD'."""
    if not raw:
        return None
    s = re.sub(r"\s*(AM|PM|am|pm)$", "", str(raw).strip())
    s = re.sub(r"(\d{1,2}/\d{1,2}/\d{2,4})\s+\d{1,2}:\d{2}.*$", r"\1", s)
    s = re.sub(r"^\d{1,2}:\d{2}(:\d{2})?\s+", "", s)  # time printed before the date
    for fmt in DATE_FORMATS:
        try:
            d = datetime.strptime(s, fmt)
            if d.year < 100:
                d = d.replace(year=d.year + 2000)
            if 2000 <= d.year <= 2100:
                return d.strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def paise(v) -> int | None:
    if v is None or v == "":
        return None
    try:
        return int(round(float(str(v).replace(",", "").replace("₹", "").strip()) * 100))
    except ValueError:
        return None


def text(v) -> str | None:
    """A printed string, or nothing. Sarvam sometimes sends a number for a code."""
    if v is None:
        return None
    out = str(v).strip()
    return out or None


def num(v) -> float | None:
    """A percentage or a loose quantity. '12%' and '12' both mean 12."""
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace("%", "").replace(",", "").strip())
    except ValueError:
        return None


EXPIRY_FORMATS = ["%m/%y", "%m-%y", "%m/%Y", "%m-%Y", "%b-%y", "%b %y", "%b-%Y", "%Y-%m"]


def parse_expiry(raw) -> str | None:
    """Batch expiry is printed to the month: '11/27', 'NOV-27' -> '2027-11'."""
    if not raw:
        return None
    s = str(raw).strip().upper().replace(".", "")
    for fmt in EXPIRY_FORMATS:
        try:
            d = datetime.strptime(s, fmt)
            year = d.year + 2000 if d.year < 100 else d.year
            if 2000 <= year <= 2100:
                return f"{year:04d}-{d.month:02d}"
        except ValueError:
            continue
    return None


REPAIR_GSTIN = True
GSTIN_SHAPE = "DDLLLLLDDDDLXZX"  # D digit, L letter, X either, Z the literal Z
# what OCR mixes up: across digit/letter, and within letters or within digits
CROSS = {"0": "ODQ", "O": "0", "Q": "0", "D": "0", "1": "IL", "I": "1", "L": "1", "2": "Z", "Z": "2",
         "5": "S", "S": "5", "8": "B", "B": "8", "6": "G", "G": "6"}
SAME = {"O": "QD", "Q": "OD", "D": "OQ", "I": "LT", "L": "IT", "T": "IL", "C": "G", "G": "C", "E": "F", "F": "E",
        "M": "N", "N": "M", "U": "V", "V": "U", "K": "X", "X": "K", "P": "R", "R": "P",
        "1": "7", "7": "1", "3": "8", "8": "36", "6": "85", "5": "6", "0": "8"}


def fits(ch: str, cls: str) -> bool:
    return (cls == "D" and ch.isdigit()) or (cls == "L" and ch.isalpha()) or (cls == "Z" and ch == "Z") or cls == "X"


def gstin_repair(g: str) -> str | None:
    """A misread GSTIN, fixed by the check digit. Characters sitting in the wrong class for their
    position (a 0 where a letter must be) are swapped for their look-alikes, all combinations; if
    the format was already fine, one look-alike swap anywhere. Only a single candidate that passes
    the check digit is returned, otherwise None: the owner is asked, nothing is guessed."""
    if len(g) != 15:
        return None
    wrong = [i for i, (ch, cls) in enumerate(zip(g, GSTIN_SHAPE)) if not fits(ch, cls)]
    if wrong:
        options = [[a for a in CROSS.get(g[i], "") if fits(a, GSTIN_SHAPE[i])] or (["Z"] if GSTIN_SHAPE[i] == "Z" else []) for i in wrong]
        if not all(options) or len(wrong) > 4:
            return None
        cands = []
        for combo in itertools.product(*options):
            s = list(g)
            for i, a in zip(wrong, combo):
                s[i] = a
            cands.append("".join(s))
    else:
        cands = [g[:i] + a + g[i + 1:] for i, ch in enumerate(g) for a in SAME.get(ch, "") + CROSS.get(ch, "")]
    good = [c for c in cands if gstin_valid(c)]
    return good[0] if len(good) == 1 else None


def extract(data: bytes, filename: str) -> dict:
    from sarvamai import SarvamAI
    key = os.getenv("SARVAM_API_KEY")
    if not key:
        raise HTTPException(500, "SARVAM_API_KEY is missing from backend/.env")
    c = SarvamAI(api_subscription_key=key)
    mime = "application/pdf" if filename.lower().endswith(".pdf") else "image/png" if filename.lower().endswith(".png") else "image/jpeg"
    try:
        job = c.doc_ai.extract(file=[(filename, data, mime)], schema=SCHEMA, language="hi-IN", output_format="json")
        for _ in range(60):
            st = c.doc_ai.get_status(job_id=job.job_id)
            if st.status.lower() in {"completed", "partially_completed", "failed", "rejected"}:
                break
            time.sleep(2)
        if st.status.lower() not in ("completed", "partially_completed"):
            raise HTTPException(502, f"Reader could not read this file ({st.status}).")
        res = c.doc_ai.get_results(job_id=job.job_id).model_dump()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Reader failed. {str(e)[:160]}")
    return res.get("result") or {}


def shape(raw: dict, source: str) -> tuple[dict, dict, list[str]]:
    """Sarvam's fields -> our fields, our confidence, warnings."""
    base = 0.9 if source == "printed" else 0.7
    warnings: list[str] = []

    gstin = re.sub(r"[^0-9A-Z]", "", (raw.get("seller_gstin") or "").upper()) or None
    if gstin and len(gstin) != 15:  # "INPUT HERE", a PAN, half a line: not a GSTIN, and not a value to show
        warnings.append("gstin_unreadable")
        gstin = None
    gstin_ok = bool(gstin and gstin_valid(gstin))
    repaired = False
    if gstin and not gstin_ok and REPAIR_GSTIN:
        fixed = gstin_repair(gstin)
        if fixed:
            gstin, gstin_ok, repaired = fixed, True, True
            warnings.append("gstin_repaired")  # one look-alike character corrected by the check digit; the card asks the owner to confirm
    if gstin and not gstin_ok:
        warnings.append("gstin_checksum_failed")
    if not gstin:
        warnings.append("no_gstin")

    number = (str(raw.get("invoice_number") or "").strip()) or None
    if not number:
        warnings.append("no_number")

    date = parse_date(raw.get("bill_date"))
    due = parse_date(raw.get("due_date"))
    if raw.get("bill_date") and not date:
        warnings.append("date_unparsed")

    items = []
    for it in raw.get("items") or []:
        if not isinstance(it, dict):
            continue
        items.append({"description": (it.get("description") or "").strip() or None,
                      "pack": text(it.get("pack")), "hsn": text(it.get("hsn")), "batch": text(it.get("batch")),
                      "expiry": parse_expiry(it.get("expiry")), "expiry_text": text(it.get("expiry")),
                      "qty": it.get("qty"), "free_qty": num(it.get("free_qty")) or 0,
                      "mrp_paise": paise(it.get("mrp")), "rate_paise": paise(it.get("rate")),
                      "discount_pct": num(it.get("discount_pct")), "gst_pct": num(it.get("gst_pct")),
                      "amount_paise": paise(it.get("amount"))})
    items = [i for i in items if i["description"] or i["amount_paise"]]

    total = paise(raw.get("total_amount"))
    subtotal = paise(raw.get("subtotal"))
    tax = paise(raw.get("tax_amount"))
    cgst, sgst, igst = paise(raw.get("cgst_amount")), paise(raw.get("sgst_amount")), paise(raw.get("igst_amount"))
    cess = paise(raw.get("cess_amount"))
    discount = paise(raw.get("discount_amount"))
    round_off = paise(raw.get("round_off"))
    # A bill shows either CGST+SGST (same state) or IGST (interstate), never both.
    split = sum(x for x in (cgst, sgst, igst, cess) if x) or None
    if tax is None:
        tax = split                      # only the halves were printed
    elif split and abs(split - tax) > 100:
        warnings.append("tax_split_mismatch")
    if tax is None and subtotal is not None and total is not None and total > subtotal:
        tax = total - subtotal           # neither was printed, but the gap is the tax
    if cgst and igst:
        warnings.append("both_cgst_and_igst")
    items_sum = sum(i["amount_paise"] or 0 for i in items) if items else None
    adds_up = None
    if total is not None and items_sum:
        # items may equal the total, the subtotal, or the total before tax (items + tax = total)
        targets = [total] + ([subtotal] if subtotal is not None else []) + ([total - tax] if tax else [])
        adds_up = any(abs(items_sum - t) <= 100 for t in targets)
        if not adds_up:
            warnings.append("items_do_not_add_up")

    buyer_gstin = re.sub(r"[^0-9A-Z]", "", (raw.get("buyer_gstin") or "").upper()) or None
    if buyer_gstin and len(buyer_gstin) != 15:
        buyer_gstin = None
    elif buyer_gstin and not gstin_valid(buyer_gstin):
        warnings.append("buyer_gstin_checksum_failed")

    supplier = (raw.get("seller_name") or "").strip() or None
    fields = {
        "supplier_name": supplier, "gstin": gstin, "gstin_valid": gstin_ok, "phone": (raw.get("seller_phone") or None),
        "buyer_name": (raw.get("buyer_name") or None), "number": number, "date": date, "due_date": due,
        "buyer_gstin": buyer_gstin, "seller_licence": text(raw.get("seller_licence")),
        "buyer_licence": text(raw.get("buyer_licence")), "salesman": text(raw.get("salesman")),
        "order_number": text(raw.get("order_number")), "terms": text(raw.get("terms")),
        "amount_in_words": text(raw.get("amount_in_words")),
        "subtotal_paise": subtotal, "discount_paise": discount,
        "cgst_paise": cgst, "sgst_paise": sgst, "igst_paise": igst, "cess_paise": cess,
        "tax_paise": tax, "round_off_paise": round_off, "total_paise": total, "items": items,
        "handwritten": bool(raw.get("is_handwritten")) or source == "handwritten",
    }
    confidence = {
        "supplier": 0 if not supplier else round(min(0.97, base + 0.05), 2),
        "gstin": 0 if not gstin else (0.8 if repaired else 0.95 if gstin_ok else 0.3),
        "number": 0 if not number else base - 0.05,
        "date": 0 if not date else base,
        "total": 0 if total is None else (0.95 if adds_up else 0.6 if adds_up is False else base),
        "tax": 0 if tax is None else (0.95 if split and abs(split - tax) <= 100 else 0.7 if split else base - 0.1),
    }
    return fields, confidence, warnings


@router.post("/read")
async def read_bill(file: UploadFile = File(...), source: str = Form("printed"), user: dict = Depends(get_current_user)):
    if source not in ("printed", "handwritten"):
        raise HTTPException(400, "source must be printed or handwritten")
    data = await file.read()
    if len(data) < 1000:
        raise HTTPException(400, "That file is empty.")
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is too big. Keep it under 12 MB.")
    mime = (file.content_type or "").split(";")[0]
    name = file.filename or "bill.jpg"
    if mime and mime not in MIME_OK and not name.lower().endswith((".jpg", ".jpeg", ".png", ".pdf", ".webp")):
        raise HTTPException(415, "Send a JPG, PNG or PDF.")
    t0 = time.time()
    raw = extract(data, name)
    fields, confidence, warnings = shape(raw, source)  # no invented values: due_date stays null unless it is on the bill
    return {"fields": fields, "confidence": confidence, "warnings": warnings, "reader": "sarvam-extract",
            "seconds": round(time.time() - t0, 1), "raw": raw}
