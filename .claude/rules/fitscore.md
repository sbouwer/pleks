---
paths:
  - "lib/screening/**"
  - "lib/applications/**"
  - "app/(applicant)/**"
---

## FITSCORE PRIMITIVE PARITY — REQUIRED READING

**Before any work touching `lib/reports/screening/_pdf/primitives/` or `lib/reports/screening/_web/primitives/`, read §10.7 of `brief/build/_ADDENDUM/ADDENDUM_14H_FITSCORE_DELIVERY.md`.**

This is non-negotiable. The §10.7 doctrine defines the tribunal-match invariant (the agent-side dashboard surface is a parallel rendering of the same evidentiary content as the archived PDF report-of-record, not a summary of it) and the parity-atomic enforcement rule: any PR modifying a file under `_pdf/primitives/` must include a corresponding change to the matching file under `_web/primitives/` in the same change-set (and vice versa), modulo the paginated-chrome exclusion list (`DocumentShell`, `RunningHeader`, `PageFooter`, `Watermark`).

Same load-bearing pattern as D-TRUST-01 — codified-everywhere discipline, not case-by-case judgement. CI enforcement is deferred per §11.20 of the same addendum; until then, the discipline is code-review plus the F.2 acceptance checklist.

---

