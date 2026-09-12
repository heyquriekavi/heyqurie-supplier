"""The ledger: shops and brands, bills with their lines and photo, payments. Owner: Divya.

Every query carries the shop_id from the login token. That is the rule that never bends:
a distributor can only ever see rows whose shop_id is theirs. Rows for another shop look
missing (404), never forbidden, so nothing leaks about their existence.

People    GET  /api/v1/people?kind=customer|supplier        POST /api/v1/people        PATCH /api/v1/people/{id}
          GET  /api/v1/people/{id}/ledger
Bills     POST /api/v1/bills          GET /api/v1/bills?kind=&person_id=&month=YYYY-MM     GET /api/v1/bills/{id}
          POST /api/v1/bills/{id}/image (multipart file)     GET /api/v1/bills/{id}/image (the bytes)
Payments  POST /api/v1/payments        DELETE /api/v1/payments/{id}
Deletes   DELETE /api/v1/bills/{id} (soft; blocked while payments exist)   DELETE /api/v1/people/{id} (blocked while bills exist)
Home      GET  /api/v1/home
"""
import mimetypes
import re
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel

from . import db, storage
from .auth import get_current_user
from .otp import audit

router = APIRouter(prefix="/api/v1", tags=["ledger"])

KINDS = {"customer", "supplier"}
FILLER = re.compile(r"\b(traders|and|agency|agencies|co|company|ltd|pvt|electricals?|electronics|stores?|hardware|medicos|medicals?)\b")


def normalize(name: str) -> str:
    s = re.sub(r"[^a-z0-9 ]", "", name.lower())
    return re.sub(r"\s+", " ", FILLER.sub("", s)).strip()


def shop_of(user: dict) -> str:
    shop_id = user.get("shop_id")
    if not shop_id:
        raise HTTPException(400, "Set up your business first.")
    return shop_id


def new_id() -> str:
    return str(uuid.uuid4())


def today() -> str:
    return date.today().isoformat()


# ---------------------------------------------------------------- people

class PersonIn(BaseModel):
    kind: str
    name: str
    phone: str | None = None
    gstin: str | None = None
    credit_days: int | None = None
    paired: bool = False
    beat: str | None = None


class PersonPatch(BaseModel):
    name: str | None = None
    phone: str | None = None
    gstin: str | None = None
    credit_days: int | None = None
    paired: bool | None = None
    beat: str | None = None


def table_for(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(400, "kind must be customer or supplier")
    return "customers" if kind == "customer" else "suppliers"


def person_out(row, kind: str) -> dict:
    d = dict(row)
    d["kind"] = kind
    d["paired"] = bool(d.get("paired")) if kind == "customer" else False
    return d


@router.get("/people")
def list_people(kind: str, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    table = table_for(kind)
    with db.connect() as conn:
        rows = conn.execute(f"SELECT * FROM {table} WHERE shop_id = ? ORDER BY name", (shop_id,)).fetchall()
    return [person_out(r, kind) for r in rows]


@router.post("/people")
def create_person(body: PersonIn, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    table = table_for(body.kind)
    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(400, "Enter the name.")
    key = normalize(name) or name.lower()
    pid = new_id()
    gstin = (body.gstin or "").strip().upper() or None
    credit = body.credit_days if body.credit_days is not None else (21 if body.kind == "customer" else 30)
    with db.connect() as conn:
        existing = conn.execute(f"SELECT * FROM {table} WHERE shop_id = ? AND name_normalized = ?", (shop_id, key)).fetchone()
        if existing:
            return person_out(existing, body.kind)   # same name already there: hand it back rather than duplicate
        if body.kind == "customer":
            conn.execute(
                "INSERT INTO customers (id, shop_id, name, name_normalized, phone, gstin, credit_days, paired, beat) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (pid, shop_id, name, key, body.phone, gstin, credit, 1 if body.paired else 0, body.beat),
            )
        else:
            conn.execute(
                "INSERT INTO suppliers (id, shop_id, name, name_normalized, phone, gstin, credit_days) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (pid, shop_id, name, key, body.phone, gstin, credit),
            )
        audit(conn, f"{body.kind}.create", user["id"], shop_id, pid)
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (pid,)).fetchone()
    return person_out(row, body.kind)


def find_person(conn, shop_id: str, pid: str):
    """(row, kind) for a person of this shop, or (None, None)."""
    for kind, table in (("customer", "customers"), ("supplier", "suppliers")):
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ? AND shop_id = ?", (pid, shop_id)).fetchone()
        if row:
            return row, kind
    return None, None


@router.patch("/people/{pid}")
def patch_person(pid: str, body: PersonPatch, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    with db.connect() as conn:
        row, kind = find_person(conn, shop_id, pid)
        if not row:
            raise HTTPException(404, "No such person.")
        table = table_for(kind)
        sets, vals = [], []
        for col in ("name", "phone", "gstin", "credit_days", "beat"):
            v = getattr(body, col)
            if v is not None and not (col == "beat" and kind == "supplier"):
                sets.append(f"{col} = ?")
                vals.append(v.strip().upper() if col == "gstin" else v)
                if col == "name":
                    sets.append("name_normalized = ?")
                    vals.append(normalize(v) or v.lower())
        if body.paired is not None and kind == "customer":
            sets.append("paired = ?")
            vals.append(1 if body.paired else 0)
        if sets:
            conn.execute(f"UPDATE {table} SET {', '.join(sets)} WHERE id = ? AND shop_id = ?", (*vals, pid, shop_id))
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (pid,)).fetchone()
    return person_out(row, kind)


# ---------------------------------------------------------------- bills

class ItemIn(BaseModel):
    product: str
    qty: float = 1
    free_qty: float = 0
    pack: str | None = None
    batch: str | None = None
    expiry: str | None = None
    hsn: str | None = None
    mrp_paise: int | None = None
    rate_paise: int | None = None
    discount_pct: float = 0
    sgst_pct: float = 0
    cgst_pct: float = 0
    igst_pct: float = 0
    amount_paise: int = 0


class BillIn(BaseModel):
    kind: str = "purchase"                       # purchase: a brand's bill to us. sale: our invoice to a shop.
    person_id: str                               # supplier for purchase, customer for sale
    number: str | None = None
    bill_date: str
    due_date: str | None = None
    salesman: str | None = None
    order_number: str | None = None
    seller_name: str | None = None
    seller_gstin: str | None = None
    seller_licence: str | None = None
    seller_phone: str | None = None
    buyer_name: str | None = None
    buyer_gstin: str | None = None
    buyer_licence: str | None = None
    subtotal_paise: int | None = None
    discount_paise: int = 0
    sgst_paise: int = 0
    cgst_paise: int = 0
    igst_paise: int = 0
    adjust_paise: int = 0
    total_paise: int
    source: str | None = None
    terms: str | None = None
    items: list[ItemIn] = []


def bill_out(conn, row) -> dict:
    b = dict(row)
    b["items"] = [dict(r) for r in conn.execute("SELECT * FROM bill_items WHERE bill_id = ? ORDER BY line_no", (b["id"],)).fetchall()]
    b["payments"] = [dict(r) for r in conn.execute("SELECT * FROM payments WHERE bill_id = ? ORDER BY paid_on", (b["id"],)).fetchall()]
    b["paid_paise"] = sum(p["amount_paise"] for p in b["payments"])
    b["has_image"] = bool(b.get("image_path"))
    return b


def own_bill(conn, shop_id: str, bill_id: str):
    row = conn.execute("SELECT * FROM bills WHERE id = ? AND shop_id = ? AND deleted_at IS NULL", (bill_id, shop_id)).fetchone()
    if not row:
        raise HTTPException(404, "No such bill.")
    return row


@router.post("/bills")
def create_bill(body: BillIn, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    if body.kind not in ("purchase", "sale"):
        raise HTTPException(400, "kind must be purchase or sale")
    if body.total_paise <= 0:
        raise HTTPException(400, "Total must be more than zero.")
    bid = new_id()
    with db.connect() as conn:
        person, kind = find_person(conn, shop_id, body.person_id)
        if not person or kind != ("supplier" if body.kind == "purchase" else "customer"):
            raise HTTPException(404, "No such supplier or customer.")
        conn.execute(
            "INSERT INTO bills (id, shop_id, kind, customer_id, supplier_id, seller_name, seller_gstin, seller_licence, seller_phone, "
            "buyer_name, buyer_gstin, buyer_licence, number, bill_date, due_date, salesman, order_number, subtotal_paise, discount_paise, "
            "sgst_paise, cgst_paise, igst_paise, adjust_paise, total_paise, status, payment_status, source, terms, confirmed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', 'unpaid', ?, ?, ?)",
            (bid, shop_id, body.kind, person["id"] if kind == "customer" else None, person["id"] if kind == "supplier" else None,
             body.seller_name, body.seller_gstin, body.seller_licence, body.seller_phone, body.buyer_name, body.buyer_gstin, body.buyer_licence,
             body.number, body.bill_date, body.due_date, body.salesman, body.order_number, body.subtotal_paise, body.discount_paise,
             body.sgst_paise, body.cgst_paise, body.igst_paise, body.adjust_paise, body.total_paise, body.source, body.terms, today()),
        )
        for n, it in enumerate(body.items, start=1):
            conn.execute(
                "INSERT INTO bill_items (id, shop_id, bill_id, line_no, qty, free_qty, pack, product, batch, expiry, hsn, mrp_paise, rate_paise, "
                "discount_pct, sgst_pct, cgst_pct, igst_pct, amount_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id(), shop_id, bid, n, it.qty, it.free_qty, it.pack, it.product, it.batch, it.expiry, it.hsn, it.mrp_paise, it.rate_paise,
                 it.discount_pct, it.sgst_pct, it.cgst_pct, it.igst_pct, it.amount_paise),
            )
        audit(conn, "bill.confirm", user["id"], shop_id, bid)
        return bill_out(conn, own_bill(conn, shop_id, bid))


@router.get("/bills")
def list_bills(kind: str | None = None, person_id: str | None = None, month: str | None = None, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    sql = "SELECT * FROM bills WHERE shop_id = ? AND deleted_at IS NULL"
    params: list = [shop_id]
    if kind:
        sql += " AND kind = ?"
        params.append(kind)
    if person_id:
        sql += " AND (customer_id = ? OR supplier_id = ?)"
        params += [person_id, person_id]
    if month:
        sql += " AND bill_date LIKE ?"
        params.append(f"{month}%")
    sql += " ORDER BY bill_date DESC, created_at DESC"
    with db.connect() as conn:
        rows = conn.execute(sql, tuple(params)).fetchall()
        return [bill_out(conn, r) for r in rows]


@router.get("/bills/{bill_id}")
def get_bill(bill_id: str, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    with db.connect() as conn:
        return bill_out(conn, own_bill(conn, shop_id, bill_id))


@router.post("/bills/{bill_id}/image")
async def put_bill_image(bill_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """The soft copy. One file per bill for now; a second upload replaces it."""
    shop_id = shop_of(user)
    data = await file.read()
    if not data:
        raise HTTPException(400, "Empty file.")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "Keep the photo under 25 MB.")
    mime = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    ext = "pdf" if "pdf" in mime else "png" if "png" in mime else "jpg"
    with db.connect() as conn:
        own_bill(conn, shop_id, bill_id)
        path = storage.put(f"bills/{shop_id}/{bill_id}/1.{ext}", data, mime)
        conn.execute("UPDATE bills SET image_path = ?, source = COALESCE(source, ?) WHERE id = ? AND shop_id = ?", (path, "photo", bill_id, shop_id))
    return {"ok": True, "image_path": path, "stored_in": storage.where()}


@router.get("/bills/{bill_id}/image")
def get_bill_image(bill_id: str, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    with db.connect() as conn:
        row = own_bill(conn, shop_id, bill_id)
    path = row["image_path"]
    if not path:
        raise HTTPException(404, "This bill has no photo.")
    data = storage.get(path)
    if data is None:
        raise HTTPException(404, "Photo file is missing.")
    mime = "application/pdf" if path.endswith(".pdf") else "image/png" if path.endswith(".png") else "image/jpeg"
    return Response(content=data, media_type=mime, headers={"Cache-Control": "private, max-age=300"})


# ---------------------------------------------------------------- payments

class PaymentIn(BaseModel):
    person_id: str
    bill_id: str | None = None
    amount_paise: int
    paid_on: str | None = None
    mode: str = "cash"
    reference: str | None = None
    note: str | None = None


def recompute(conn, shop_id: str, bill_id: str):
    total = conn.execute("SELECT total_paise FROM bills WHERE id = ? AND shop_id = ?", (bill_id, shop_id)).fetchone()
    if not total:
        return
    paid = conn.execute("SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE bill_id = ? AND shop_id = ?", (bill_id, shop_id)).fetchone()[0]
    status = "paid" if paid >= total[0] else "partial" if paid > 0 else "unpaid"
    conn.execute("UPDATE bills SET payment_status = ? WHERE id = ? AND shop_id = ?", (status, bill_id, shop_id))


@router.post("/payments")
def create_payment(body: PaymentIn, user: dict = Depends(get_current_user)):
    """Money in from a shop (direction in) or out to a brand (direction out), decided by who the person is.
    With a bill_id it settles that bill; without one it is spread across the person's unpaid bills, oldest first."""
    shop_id = shop_of(user)
    if body.amount_paise <= 0:
        raise HTTPException(400, "Amount must be more than zero.")
    if body.mode not in ("cash", "upi", "bank", "cheque", "other"):
        raise HTTPException(400, "mode must be cash, upi, bank, cheque or other")
    paid_on = body.paid_on or today()
    with db.connect() as conn:
        person, kind = find_person(conn, shop_id, body.person_id)
        if not person:
            raise HTTPException(404, "No such person.")
        direction = "in" if kind == "customer" else "out"
        col = "customer_id" if kind == "customer" else "supplier_id"
        made = []
        remaining = body.amount_paise
        targets: list[tuple[str | None, int]] = []
        if body.bill_id:
            own_bill(conn, shop_id, body.bill_id)
            targets = [(body.bill_id, remaining)]
        else:
            open_bills = conn.execute(
                f"SELECT id, total_paise FROM bills WHERE shop_id = ? AND {col} = ? AND deleted_at IS NULL AND payment_status != 'paid' ORDER BY bill_date",
                (shop_id, person["id"]),
            ).fetchall()
            for b in open_bills:
                if remaining <= 0:
                    break
                paid = conn.execute("SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE bill_id = ?", (b["id"],)).fetchone()[0]
                due = b["total_paise"] - paid
                if due <= 0:
                    continue
                part = min(due, remaining)
                targets.append((b["id"], part))
                remaining -= part
            if remaining > 0:
                targets.append((None, remaining))   # advance: nothing open to settle
        for bill_id, amount in targets:
            pid = new_id()
            conn.execute(
                "INSERT INTO payments (id, shop_id, bill_id, customer_id, supplier_id, direction, amount_paise, paid_on, mode, reference, note) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (pid, shop_id, bill_id, person["id"] if kind == "customer" else None, person["id"] if kind == "supplier" else None,
                 direction, amount, paid_on, body.mode, body.reference, body.note),
            )
            if bill_id:
                recompute(conn, shop_id, bill_id)
            made.append({"id": pid, "bill_id": bill_id, "amount_paise": amount})
        audit(conn, "payment.add", user["id"], shop_id, made[0]["id"] if made else None)
    return {"payments": made, "direction": direction}


# ---------------------------------------------------------------- deletes

@router.delete("/bills/{bill_id}")
def delete_bill(bill_id: str, user: dict = Depends(get_current_user)):
    """Soft delete: the row stays for the 72-month GST record, hidden from every list.
    Refused while payments hang off it, so money never disappears with a bill."""
    shop_id = shop_of(user)
    with db.connect() as conn:
        own_bill(conn, shop_id, bill_id)
        n = conn.execute("SELECT COUNT(*) FROM payments WHERE bill_id = ? AND shop_id = ?", (bill_id, shop_id)).fetchone()[0]
        if n:
            raise HTTPException(409, f"This bill has {n} payment{'s' if n > 1 else ''} against it. Delete those first.")
        conn.execute("UPDATE bills SET deleted_at = ? WHERE id = ? AND shop_id = ?", (today(), bill_id, shop_id))
        audit(conn, "bill.delete", user["id"], shop_id, bill_id)
    return {"ok": True}


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: str, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM payments WHERE id = ? AND shop_id = ?", (payment_id, shop_id)).fetchone()
        if not row:
            raise HTTPException(404, "No such payment.")
        conn.execute("DELETE FROM payments WHERE id = ? AND shop_id = ?", (payment_id, shop_id))
        if row["bill_id"]:
            recompute(conn, shop_id, row["bill_id"])
        audit(conn, "payment.delete", user["id"], shop_id, payment_id)
    return {"ok": True}


@router.delete("/people/{pid}")
def delete_person(pid: str, user: dict = Depends(get_current_user)):
    """Only a person with no bills can go; otherwise the ledger would lose its other side."""
    shop_id = shop_of(user)
    with db.connect() as conn:
        person, kind = find_person(conn, shop_id, pid)
        if not person:
            raise HTTPException(404, "No such person.")
        col = "customer_id" if kind == "customer" else "supplier_id"
        n = conn.execute(f"SELECT COUNT(*) FROM bills WHERE {col} = ? AND shop_id = ? AND deleted_at IS NULL", (pid, shop_id)).fetchone()[0]
        if n:
            raise HTTPException(409, f"{person['name']} has {n} bill{'s' if n > 1 else ''}. Delete those first.")
        conn.execute(f"DELETE FROM payments WHERE {col} = ? AND shop_id = ? AND bill_id IS NULL", (pid, shop_id))
        conn.execute(f"DELETE FROM {table_for(kind)} WHERE id = ? AND shop_id = ?", (pid, shop_id))
        audit(conn, f"{kind}.delete", user["id"], shop_id, pid)
    return {"ok": True}


# ---------------------------------------------------------------- ledger and home

@router.get("/people/{pid}/ledger")
def ledger(pid: str, user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    with db.connect() as conn:
        person, kind = find_person(conn, shop_id, pid)
        if not person:
            raise HTTPException(404, "No such person.")
        col = "customer_id" if kind == "customer" else "supplier_id"
        bills = [bill_out(conn, r) for r in conn.execute(
            f"SELECT * FROM bills WHERE shop_id = ? AND {col} = ? AND deleted_at IS NULL ORDER BY bill_date DESC", (shop_id, pid)).fetchall()]
        pays = [dict(r) for r in conn.execute(
            f"SELECT p.* FROM payments p LEFT JOIN bills b ON b.id = p.bill_id WHERE p.shop_id = ? AND p.{col} = ? "
            f"AND (p.bill_id IS NULL OR b.deleted_at IS NULL) ORDER BY p.paid_on DESC", (shop_id, pid)).fetchall()]
    total = sum(b["total_paise"] for b in bills)
    paid = sum(p["amount_paise"] for p in pays)
    return {"person": person_out(person, kind), "bills": bills, "payments": pays,
            "total_paise": total, "paid_paise": paid, "outstanding_paise": total - paid}


@router.get("/home")
def home(user: dict = Depends(get_current_user)):
    shop_id = shop_of(user)
    t = today()
    month = t[:7]
    with db.connect() as conn:
        billed = conn.execute("SELECT COALESCE(SUM(total_paise), 0), COUNT(*) FROM bills WHERE shop_id = ? AND kind = 'sale' AND deleted_at IS NULL AND bill_date LIKE ?",
                              (shop_id, f"{month}%")).fetchone()
        open_sales = conn.execute("SELECT id, total_paise, due_date FROM bills WHERE shop_id = ? AND kind = 'sale' AND deleted_at IS NULL AND payment_status != 'paid'",
                                  (shop_id,)).fetchall()
        to_collect = overdue = 0
        for b in open_sales:
            paid = conn.execute("SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE bill_id = ?", (b["id"],)).fetchone()[0]
            due = max(b["total_paise"] - paid, 0)
            to_collect += due
            if b["due_date"] and b["due_date"][:10] <= t:
                overdue += due
    return {"month": month, "billed_paise": billed[0], "billed_count": billed[1], "to_collect_paise": to_collect, "overdue_paise": overdue}
