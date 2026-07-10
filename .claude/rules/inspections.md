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

This is non-negotiable for two reasons:
1. Storage cost — modern phone images at full resolution make inspection 
   storage untenable at scale
2. Legal — GPS/timestamp extracted from original EXIF before compression 
   are the evidence chain for Tribunal submissions. Post-compression 
   metadata cannot be trusted.

`sharp` (bundled via `next/image`) is a server-side safety net only — 
it should never be the primary compression path.

---

