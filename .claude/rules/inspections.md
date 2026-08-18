---
paths:
  - "lib/inspection/**"
  - "lib/inspections/**"
  - "lib/offline/**"
---

## INSPECTION PHOTO DISCIPLINE

Photos must be compressed **client-side** before upload. Never server-side.

- Canvas compression: 1920×1440 max, 70% JPEG quality, ~300KB target
- EXIF extraction (GPS coordinates + timestamp) happens BEFORE compression
- GPS and timestamp stored separately as tamper-evident metadata
- The compressed photo is what goes to Supabase Storage
- The original full-resolution photo is never uploaded

**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — nothing asserts (statically or in a test) that the upload path only ever receives a Canvas-compressed blob under the size/dimension target, or that EXIF extraction runs before compression in the call order — this is runtime client behaviour with no server-side signature distinguishing a compressed-client-side upload from a differently-compressed one. Sketch: a unit test on the compression module mocking the EXIF-extract and Canvas-compress calls and asserting invocation order, plus a branded `CompressedPhoto` type the upload function accepts (not a raw `File`) so an uncompressed upload fails to type-check.

This is non-negotiable for two reasons:
1. Storage cost — modern phone images at full resolution make inspection 
   storage untenable at scale
2. Legal — GPS/timestamp extracted from original EXIF before compression 
   are the evidence chain for Tribunal submissions. Post-compression 
   metadata cannot be trusted.

`sharp` (bundled via `next/image`) is a server-side safety net only — 
it should never be the primary compression path.
**UNENFORCEABLE** — MECHANISABLE (rung: check · blast: other) — a check could flag a server-side call into `sharp` from an inspection-photo upload handler that isn't clearly gated as a fallback, but distinguishing "safety net" usage from "primary path" usage requires reading intent, not just presence of a call. Sketch: same "provably intentional" allowlist pattern as the `gateway()`-on-write rule — require an inline allowlist comment/reason on any server-side `sharp(` call in this area; an unmarked call fails.

---

