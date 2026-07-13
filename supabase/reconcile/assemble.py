"""Assemble 01_reconcile.sql from the CANONICAL bodies in the domain migration file.

The two function bodies are NOT retyped here — they are lifted verbatim from
supabase/migrations/004_leases_financials.sql, which remains the SSOT. A reconciliation script that
hand-copies a money function is a second source of truth waiting to drift from the first.
"""
import io
import re

SRC = "supabase/migrations/004_leases_financials.sql"
OUT = "supabase/reconcile/01_reconcile.sql"


def grab(sql: str, name: str) -> str:
    """The LAST definition of a function in the file — that is what a replay leaves behind."""
    starts = [m.start() for m in re.finditer(r"CREATE OR REPLACE FUNCTION " + name + r"\s*\(", sql)]
    if not starts:
        raise SystemExit(f"assemble: {name} not found in {SRC}")
    i = starts[-1]
    j = sql.index("$$;", i) + 3
    return sql[i:j].strip()


sql = io.open(SRC, encoding="utf-8").read()
alloc = grab(sql, "allocate_payment_atomic")
rec = grab(sql, "record_payment_atomic")

if "allocate_payment_atomic(" not in rec:
    raise SystemExit(
        "assemble: record_payment_atomic does not call allocate_payment_atomic — the #134 fold is "
        "missing from the domain file, so this script would deploy the WRONG body."
    )

HEADER = io.open("supabase/reconcile/_header.sql", encoding="utf-8").read()
MIDDLE = io.open("supabase/reconcile/_middle.sql", encoding="utf-8").read()
FOOTER = io.open("supabase/reconcile/_footer.sql", encoding="utf-8").read()

io.open(OUT, "w", encoding="utf-8", newline="\n").write(
    HEADER + "\n" + alloc + "\n" + MIDDLE + "\n" + rec + "\n" + FOOTER
)
print(f"OK {OUT} assembled - allocate {len(alloc)} chars, record {len(rec)} chars")
