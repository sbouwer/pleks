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

**UNENFORCEABLE** — mechanisable and not done: nothing asserts (statically or in a test) that the upload path only ever receives a Canvas-compressed blob under the size/dimension target, or that EXIF extraction runs before compression in the call order — this is runtime client behaviour with no server-side signature distinguishing a compressed-client-side upload from a differently-compressed one.

This is non-negotiable for two reasons:
1. Storage cost — modern phone images at full resolution make inspection 
   storage untenable at scale
2. Legal — GPS/timestamp extracted from original EXIF before compression 
   are the evidence chain for Tribunal submissions. Post-compression 
   metadata cannot be trusted.

`sharp` (bundled via `next/image`) is a server-side safety net only — 
it should never be the primary compression path.
**UNENFORCEABLE** — mechanisable and not done: a check could flag a server-side call into `sharp` from an inspection-photo upload handler that isn't clearly gated as a fallback, but distinguishing "safety net" usage from "primary path" usage requires reading intent, not just presence of a call.

---

