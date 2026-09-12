"""SQLite schema + queries.  Owner: Divya.

Rule that never bends: every read/write is scoped by user_id.
SQLite now, same schema on Postgres/Supabase at deploy.
"""

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT,
    picture     TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Global, keyed by file content hash: identical files ingest once ever.
CREATE TABLE IF NOT EXISTS documents (
    hash         TEXT PRIMARY KEY,
    title        TEXT,
    filename     TEXT,
    summary      TEXT,
    outline_json TEXT,
    source       TEXT CHECK (source IN ('upload', 'online')),
    status       TEXT CHECK (status IN ('processing', 'ready', 'failed')),
    page_count   INTEGER,
    concepts_json TEXT,          -- the tutor's concept list, extracted on first ask
    ingested_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doc_pages (
    hash     TEXT NOT NULL REFERENCES documents(hash),
    page_no  INTEGER NOT NULL,
    text     TEXT,
    PRIMARY KEY (hash, page_no)
);

CREATE TABLE IF NOT EXISTS user_documents (
    user_id     TEXT NOT NULL REFERENCES users(id),
    hash        TEXT NOT NULL REFERENCES documents(hash),
    added_at    TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, hash)
);

CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id),
    doc_hash    TEXT REFERENCES documents(hash),
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id  TEXT NOT NULL REFERENCES conversations(id),
    role             TEXT NOT NULL,
    content          TEXT NOT NULL,
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP
);

-- What a learner has proven about a document's concepts: one row per graded
-- answer (or self-report), never a score. Mastery is a query over these.
CREATE TABLE IF NOT EXISTS evidence (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(id),
    doc_hash    TEXT NOT NULL REFERENCES documents(hash),
    concept     TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('explain', 'apply', 'transfer', 'teach', 'recall', 'self_report')),
    verdict     TEXT NOT NULL,        -- correct | partial | wrong | unverifiable | (self_report: claimed)
    diagnosis   TEXT,
    reason      TEXT,
    question    TEXT,
    answer      TEXT,
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Where a learner is in each document - the concept, step and exact question
-- they were on - so a new session can offer to pick up there. One row per
-- user and document; cleared when the document is proven through.
CREATE TABLE IF NOT EXISTS study_position (
    user_id     TEXT NOT NULL REFERENCES users(id),
    doc_hash    TEXT NOT NULL REFERENCES documents(hash),
    concept     TEXT NOT NULL,
    step        TEXT NOT NULL,        -- explain | apply
    question    TEXT,
    pages       TEXT,                 -- JSON list of page numbers, or null for the whole document
    quiz_only   INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, doc_hash)
);

-- Feature 4 grows inside this table (tiers, decay, importance) - keep it simple now.
CREATE TABLE IF NOT EXISTS memories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL REFERENCES users(id),
    type        TEXT,
    content     TEXT NOT NULL,
    confidence  REAL DEFAULT 1.0,
    updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


import os
import re
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "app.db"

# DATABASE_URL set (Supabase Postgres) -> every connection goes there. Empty -> SQLite file.
# The mobile modules (otp, shops, bills...) write SQL that runs on both. The desktop-only
# queries below still use SQLite idioms (INSERT OR REPLACE, julianday, datetime('now')) and
# only work with DATABASE_URL empty; the desktop app is not this product any more.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
IS_PG = DATABASE_URL.startswith("postgres")


class _Row(dict):
    """A row that answers both row["col"] and row[0], like sqlite3.Row."""

    def __init__(self, names, values):
        super().__init__(zip(names, values))
        self._values = tuple(values)

    def __getitem__(self, key):
        return self._values[key] if isinstance(key, int) else dict.__getitem__(self, key)


def _row_factory(cursor):
    names = [d.name for d in cursor.description] if cursor.description else []
    return lambda values: _Row(names, values)


_PG_DEFAULT_TS = "TEXT DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD\"T\"HH24:MI:SS')"


def pg_sql(sql: str) -> str:
    """The few SQLite spellings our SQL uses, in Postgres form."""
    sql = sql.replace("?", "%s")
    sql = sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY")
    sql = sql.replace("TEXT DEFAULT CURRENT_TIMESTAMP", _PG_DEFAULT_TS)
    if "INSERT OR IGNORE INTO" in sql:
        sql = sql.replace("INSERT OR IGNORE INTO", "INSERT INTO").rstrip().rstrip(";") + " ON CONFLICT DO NOTHING"
    return sql


class _PgConn:
    """psycopg connection with the sqlite3 surface the rest of this file expects."""

    def __init__(self, conn):
        self._c = conn

    def execute(self, sql, params=()):
        return self._c.execute(pg_sql(sql), params)

    def executescript(self, script):
        self._c.execute(pg_sql(script))

    def commit(self):
        self._c.commit()

    def __enter__(self):
        self._c.__enter__()
        return self

    def __exit__(self, *exc):
        return self._c.__exit__(*exc)   # commit or rollback, then close


def connect():
    if IS_PG:
        import psycopg
        # ponytail: one connection per call, about 0.4 s to Supabase Mumbai; psycopg_pool when that shows in latency
        return _PgConn(psycopg.connect(DATABASE_URL, row_factory=_row_factory, connect_timeout=15))
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    if IS_PG:
        return  # Supabase holds only the billing app's tables; they come from backend/migrations/
    with connect() as conn:
        conn.executescript(SCHEMA)
        # Databases made before a column existed.
        for column in ("filename TEXT", "concepts_json TEXT"):
            try:
                conn.execute(f"ALTER TABLE documents ADD COLUMN {column}")
            except sqlite3.OperationalError:
                pass   # already there


def get_user(user_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def find_document(doc_hash):
    with connect() as conn:
        row = conn.execute(
            "SELECT hash, title, summary, outline_json, source, status, page_count,"
            " concepts_json FROM documents WHERE hash = ?",
            (doc_hash,),
        ).fetchone()
    return dict(row) if row else None


def create_document(doc_hash, title, source):
    """`title` is the filename at this point; the read replaces it with a real
    title, but the filename is kept - it is what a window's title bar shows."""
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO documents (hash, title, filename, source, status)"
            " VALUES (?, ?, ?, ?, 'processing')",
            (doc_hash, title, title, source),
        )


def save_pages(doc_hash, pages):
    """pages: list of page text, index 0 = page 1."""
    with connect() as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO doc_pages (hash, page_no, text) VALUES (?, ?, ?)",
            [(doc_hash, i + 1, text) for i, text in enumerate(pages)],
        )


def finish_document(doc_hash, summary, outline_json, page_count):
    with connect() as conn:
        conn.execute(
            "UPDATE documents SET summary = ?, outline_json = ?, page_count = ?,"
            " status = 'ready' WHERE hash = ?",
            (summary, outline_json, page_count, doc_hash),
        )


def save_concepts(doc_hash, concepts_json):
    with connect() as conn:
        conn.execute("UPDATE documents SET concepts_json = ? WHERE hash = ?", (concepts_json, doc_hash))


def all_pages(doc_hash):
    """Every page's text, in order. The tutor reads the whole document once;
    ownership is checked by whoever asks for a user."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT text FROM doc_pages WHERE hash = ? ORDER BY page_no", (doc_hash,)
        ).fetchall()
    return [r["text"] or "" for r in rows]


def list_documents():
    with connect() as conn:
        rows = conn.execute(
            "SELECT hash, title, status, page_count FROM documents ORDER BY ingested_at"
        ).fetchall()
    return [dict(r) for r in rows]


def set_document_title(doc_hash, title):
    with connect() as conn:
        conn.execute("UPDATE documents SET title = ? WHERE hash = ?", (title, doc_hash))


# Longer than any honest read takes. A document seen "processing" past this
# was orphaned - the worker died, or a call hung - and is treated as failed
# so the next upload reads it again instead of joining a read that will
# never finish.
STUCK_AFTER_MINUTES = 10


def abandon_unfinished_reads():
    """Run at startup. A fresh process has no reads in flight, so anything
    still 'processing' was orphaned by a restart or a hang. Marked failed,
    the next upload reads it again instead of joining a read that will
    never finish."""
    if IS_PG:
        return 0  # desktop documents live only in SQLite
    with connect() as conn:
        count = conn.execute(
            "UPDATE documents SET status = 'failed' WHERE status = 'processing'"
        ).rowcount
    if count:
        print(f"[db] {count} unfinished read(s) from before the restart marked failed", flush=True)


def stale_processing(doc_hash):
    with connect() as conn:
        row = conn.execute(
            "SELECT (julianday('now') - julianday(ingested_at)) * 1440 AS minutes"
            " FROM documents WHERE hash = ? AND status = 'processing'",
            (doc_hash,),
        ).fetchone()
    return bool(row) and row["minutes"] > STUCK_AFTER_MINUTES


def fail_document(doc_hash):
    with connect() as conn:
        conn.execute("UPDATE documents SET status = 'failed' WHERE hash = ?", (doc_hash,))


def link_user_document(user_id, doc_hash):
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO user_documents (user_id, hash) VALUES (?, ?)",
            (user_id, doc_hash),
        )


def list_user_documents(user_id):
    with connect() as conn:
        rows = conn.execute(
            "SELECT d.hash, d.title, d.filename, d.summary, d.status, d.page_count, ud.added_at"
            " FROM documents d JOIN user_documents ud ON ud.hash = d.hash"
            " WHERE ud.user_id = ? ORDER BY ud.added_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def minutes_since_added(user_id, doc_hash):
    with connect() as conn:
        row = conn.execute(
            "SELECT (julianday('now') - julianday(added_at)) * 1440 AS minutes"
            " FROM user_documents WHERE user_id = ? AND hash = ?",
            (user_id, doc_hash),
        ).fetchone()
    return row["minutes"] if row else float("inf")


def read_pages(user_id, doc_hash, page_from, page_to):
    """Page text, but only if this user actually has the document."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT p.page_no, p.text FROM doc_pages p"
            " JOIN user_documents ud ON ud.hash = p.hash AND ud.user_id = ?"
            " WHERE p.hash = ? AND p.page_no BETWEEN ? AND ? ORDER BY p.page_no",
            (user_id, doc_hash, page_from, page_to),
        ).fetchall()
    return [dict(r) for r in rows]


def get_or_create_conversation(user_id, doc_hash):
    """One running conversation per person per document."""
    key = f"{user_id}:{doc_hash}"
    with connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO conversations (id, user_id, doc_hash) VALUES (?, ?, ?)",
            (key, user_id, doc_hash),
        )
    return key


# Which thread each user is talking in right now. Held here so the choice
# never depends on CURRENT_TIMESTAMP, which only resolves to the second.
_current = {}


def start_conversation(user_id):
    """A fresh thread for a new session. Last week's screen must not be this
    session's context - that is how she kept 'seeing' a page closed days ago."""
    key = f"{user_id}:{time.time_ns()}"
    with connect() as conn:
        conn.execute(
            "INSERT INTO conversations (id, user_id) VALUES (?, ?)",
            (key, user_id),
        )
    _current[user_id] = key
    return key


# Sessions before this change all shared one endless thread with this id.
# It holds the history that made her describe week-old screens: never reopen it.
def _legacy_thread(user_id):
    return f"{user_id}:None"


def latest_conversation(user_id):
    """The newest session thread, or None. Never creates one."""
    if user_id in _current:
        return _current[user_id]

    with connect() as conn:
        row = conn.execute(
            "SELECT id FROM conversations WHERE user_id = ? AND doc_hash IS NULL"
            " AND id <> ? ORDER BY created_at DESC LIMIT 1",
            (user_id, _legacy_thread(user_id)),
        ).fetchone()
    return row["id"] if row else None


def current_conversation(user_id):
    """The thread this session is using. Survives a dev reload, which happens
    on every save, without ever reaching back into the pre-session thread."""
    found = latest_conversation(user_id)
    if found:
        _current[user_id] = found
        return found
    return start_conversation(user_id)


def previous_messages(user_id, current_id, turns, hours=24):
    """The tail of the session before this one, if it spoke within `hours`.
    Start opens a fresh thread, but "you just told me about game theory,
    right?" five minutes later needs the last few turns of the old one."""
    with connect() as conn:
        row = conn.execute(
            "SELECT c.id FROM conversations c JOIN messages m ON m.conversation_id = c.id"
            " WHERE c.user_id = ? AND c.doc_hash IS NULL AND c.id <> ? AND c.id <> ?"
            " AND m.created_at >= datetime('now', ?)"
            " ORDER BY m.id DESC LIMIT 1",
            (user_id, current_id, _legacy_thread(user_id), f"-{int(hours)} hours"),
        ).fetchone()
    return recent_messages(row["id"], turns) if row else []


def add_message(conversation_id, role, content):
    with connect() as conn:
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)",
            (conversation_id, role, content),
        )


def recent_messages(conversation_id, turns):
    """The last few turns, oldest first, for context."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE conversation_id = ?"
            " ORDER BY id DESC LIMIT ?",
            (conversation_id, turns * 2),
        ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


# ------------------------------------------------------------- memories
# Durable facts about a person, extracted from their conversations every few
# exchanges. The whole list is replaced on each review - the model does the
# merging - so a fact that stops being true stops being stored.

def list_memories(user_id):
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, type, content, confidence FROM memories WHERE user_id = ?"
            " ORDER BY confidence DESC, updated_at DESC",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def replace_memories(user_id, facts):
    """facts: [{type, content, confidence}]"""
    with connect() as conn:
        conn.execute("DELETE FROM memories WHERE user_id = ?", (user_id,))
        conn.executemany(
            "INSERT INTO memories (user_id, type, content, confidence) VALUES (?, ?, ?, ?)",
            [(user_id, f.get("type"), f["content"], float(f.get("confidence", 1.0))) for f in facts],
        )


def forget_memories(user_id, ids):
    with connect() as conn:
        conn.executemany(
            "DELETE FROM memories WHERE user_id = ? AND id = ?", [(user_id, i) for i in ids]
        )


def count_messages(conversation_id):
    with connect() as conn:
        return conn.execute(
            "SELECT COUNT(*) FROM messages WHERE conversation_id = ?", (conversation_id,)
        ).fetchone()[0]


# ------------------------------------------------------------- evidence

def add_evidence(user_id, doc_hash, concept, kind, verdict, diagnosis=None, reason=None,
                 question=None, answer=None):
    with connect() as conn:
        conn.execute(
            "INSERT INTO evidence (user_id, doc_hash, concept, kind, verdict, diagnosis, reason,"
            " question, answer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, doc_hash, concept, kind, verdict, diagnosis, reason, question, answer),
        )


def latest_evidence(user_id, days=7):
    """The learner's most recent graded answer on any document, if it was
    within `days`; the document's title comes with it. Self-reports do not
    count - they are not somewhere we stopped."""
    with connect() as conn:
        row = conn.execute(
            "SELECT e.doc_hash, d.title, e.concept, e.verdict, e.diagnosis, e.reason, e.created_at"
            " FROM evidence e JOIN documents d ON d.hash = e.doc_hash"
            " WHERE e.user_id = ? AND e.kind <> 'self_report'"
            " AND e.created_at >= datetime('now', ?)"
            " ORDER BY e.id DESC LIMIT 1",
            (user_id, f"-{int(days)} days"),
        ).fetchone()
    return dict(row) if row else None


def evidence_for(user_id, doc_hash, concept=None):
    """Every row this learner has on the document, oldest first - the whole
    history, contradictions included."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT id, concept, kind, verdict, diagnosis, reason, question, answer, created_at"
            " FROM evidence WHERE user_id = ? AND doc_hash = ?"
            + (" AND concept = ?" if concept else "") + " ORDER BY id",
            (user_id, doc_hash) + ((concept,) if concept else ()),
        ).fetchall()
    return [dict(r) for r in rows]


# ---- where they are in a document

def save_position(user_id, doc_hash, concept, step, question, pages, quiz_only):
    with connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO study_position"
            " (user_id, doc_hash, concept, step, question, pages, quiz_only, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            (user_id, doc_hash, concept, step, question, pages, int(quiz_only)),
        )


def clear_position(user_id, doc_hash):
    with connect() as conn:
        conn.execute("DELETE FROM study_position WHERE user_id = ? AND doc_hash = ?", (user_id, doc_hash))


def study_position(user_id, doc_hash=None):
    """Where they are in that document - or in whichever they touched last -
    with its title; None if they have not studied."""
    with connect() as conn:
        row = conn.execute(
            "SELECT p.doc_hash, p.concept, p.step, p.question, p.pages, p.quiz_only, p.updated_at, d.title"
            " FROM study_position p JOIN documents d ON d.hash = p.doc_hash"
            " WHERE p.user_id = ?" + (" AND p.doc_hash = ?" if doc_hash else "")
            + " ORDER BY p.updated_at DESC, p.rowid DESC LIMIT 1",
            (user_id,) + ((doc_hash,) if doc_hash else ()),
        ).fetchone()
    return dict(row) if row else None
