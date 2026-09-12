"""Apply backend/migrations/*.sql in name order, once each.

Applied names are recorded in schema_migrations, so re-running is safe.
Postgres (DATABASE_URL set): if a sibling `<name>.pg.sql` exists it is used instead of
`<name>.sql`, for the rare migration that needs different SQL there.
Runs at API start (main.py) and by hand: `python -m app.migrate`.
"""
from pathlib import Path

from . import db

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"


def run():
    with db.connect() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)"
        )
        done = {r[0] for r in conn.execute("SELECT name FROM schema_migrations").fetchall()}
    applied = []
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.name.endswith(".pg.sql") or path.name in done:
            continue
        pg_variant = path.with_name(path.name[:-4] + ".pg.sql")
        script = (pg_variant if db.IS_PG and pg_variant.exists() else path).read_text(encoding="utf-8")
        with db.connect() as conn:
            if not db.IS_PG:
                conn.execute("PRAGMA foreign_keys = OFF")  # the users rebuild needs this
            conn.executescript(script)
            conn.execute("INSERT INTO schema_migrations (name) VALUES (?)", (path.name,))
        applied.append(path.name)
    return applied


if __name__ == "__main__":
    db.init_db()
    print("database:", "postgres" if db.IS_PG else f"sqlite {db.DB_PATH}")
    print("applied:", run() or "nothing new")
