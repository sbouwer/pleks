---
paths:
  - "app/(public)/**"
  - "lib/marketing/**"
---

## MARKETING VOICE — REQUIRED READING

Pleks does not market benefits. Pleks markets **constraints**.

The public-facing surfaces work because they read like operational doctrine
leaking into public marketing — not because they sound exciting. Cold,
attested, infrastructural tone is the moat against the legacy-incumbent
register of trapped data, hidden fees, and silent retention.

This voice is project-level discipline, not Charter-specific. It applies to
every public-facing surface: homepage, feature pages, sales collateral,
email templates, the FIC compliance pitch when that becomes a marketing
surface, and every new public page added going forward.

**Anti-patterns — never apply to Pleks public surfaces:**
- Softening copy toward generic trust language ("we value your partnership",
  "customer-first", "built for you")
- Emotional escalation against competitors ("trap, squeeze, hostage") as
  attack vocabulary — only acceptable when describing what Pleks itself
  refuses to do
- Marketing-funnel-style anti-competitor confrontation
- "Startup-y" register — fresh, modern, smart, sleek, intuitive, seamless,
  effortless, etc.
- Generic SaaS virtue claims ("no silos", "all-in-one", "end-to-end")
- Aspirational architectural claims unsupported by linked substantiation
- Adding pricing/funnel content that breaks the operational-doctrine register

**UNENFORCEABLE** — tone/register judgement (does a phrase read "startup-y", is an escalation "an attack" vs "describing a refusal"). `check-marketing-consistency.mjs`'s Class 3 only catches non-canonical VARIANTS of specific phrases already named in `lib/marketing/canonical-phrases.ts` — it has no model of "voice" and would not flag a brand-new softening phrase that isn't a near-miss of an existing canonical one.

**Patterns to preserve:**
- Architectural irreversibility framing ("We removed the pipes")
- Specific, falsifiable claims with linked substantiation pages
- ATTESTED-style operational commitments rather than aspirational promises
- Fear-naming with restraint ("blacklist", "collateral", "hostage") used
  only to describe what Pleks refuses to do, never to attack competitors
  directly
- Quasi-legal artefacts (seals, charters, registers, attestations) backed
  by operational reality on the linked pages — the seal rhetoric must
  remain operationally defensible
- Counts and metrics that match their backing data sources exactly (drift
  between marketing copy and live data is a Tribunal-defensibility risk,
  not a typo) <!-- @enforced check:check-marketing-consistency -->

**UNENFORCEABLE** — the first four "patterns to preserve" bullets are voice/rhetoric judgement calls with the same gap as the anti-patterns above; only the last (counts/metrics) has a mechanical check, tagged above.

**The substantiation invariant (load-bearing):**

The moment public copy uses ATTESTED, regulator references, architectural
claims, retention guarantees, or operational constraints — the linked
substantiation pages become part of the product surface. The danger is
never that the marketing is too strong; it is that the marketing is
specific enough that inconsistency between the claim and the backing page
becomes discoverable. Every public claim ships with its substantiating
destination, and the two must match.

**UNENFORCEABLE** — PARTIAL. `check-marketing-consistency.mjs`'s Class 2 (dead-anchor check, same control tagged above as `check:check-marketing-consistency`) verifies a Charter card's `href` resolves to an existing `id=` anchor — a link-integrity check — but not that the anchor's CONTENT actually substantiates the claim. "The link isn't broken" and "the claim and the backing page match" are different properties; only the first is checked.

**The Truth Pipeline (load-bearing):**

Operational truth originates once, in domain-owned structured data; surfaces render from that source; CI defends the rendering. Counts, lists, retention periods, notification windows, sub-processor identities, and structured legal references are derived facts, not authored content. The pattern generalises the dates-on-homepage automation, the parity-atomic invariant (§11.20), and the D-TRUST-01 architectural invariant into a single class. Public-facing fact drift becomes impossible by construction once the source is unique and the consuming surface derives from it. See ADDENDUM_00J for the SSOT module structure, CI script, and migration sequence.

(Same control as `check:check-marketing-consistency`, tagged above for the counts/metrics bullet — the "CI defends the rendering" claim in this paragraph is that same check, not re-tagged here to avoid a double claim. It covers Classes 1–3; it does not defend retention periods or sub-processor identities specifically — see `check:check-retention-claims` for the retention-window half, tagged in `.claude/rules/legal-docs-jsx.md`... actually retention periods are covered by a DIFFERENT script than dead-anchor/canonical-phrase; see the standalone note below.)

**UNENFORCEABLE** — PARTIAL, noted precisely: retention-period claims specifically are defended by a SEPARATE script, `check-retention-claims.mts` (also in `npm run check`), not by `check-marketing-consistency.mjs`. Sub-processor identities and sub-processor lists have no equivalent CI defence found in this census; a new sub-processor added to prose without updating its backing structured data would not be caught by either script.

**The evidentiary-doctrine standard for Charter substantiation (load-bearing):**

Every Charter card that claims an architectural constraint must substantiate at the linked page with a four-layer evidentiary structure: Database (RLS or schema constraint), Application (invariant guard or gateway binding), Codebase (ESLint rule or code review requirement), Integration (what does not exist and cannot be compromised). A prose paragraph explaining what is enforced is not sufficient — the structure must make the claim falsifiable layer-by-layer. §01 (trust account, /for-agents/trust-account#architecture) and §07 (agency isolation, /popia-register#fitscore-isolation) are the reference implementations. Any future Charter commitment that claims architectural enforcement must add a substantiation section following the same structure before the card ships.
**UNENFORCEABLE** — verifying a linked page actually contains all four evidentiary layers, correctly described, is a reading-comprehension task; no check parses prose for "does this paragraph describe a real RLS/gateway/ESLint/integration guarantee."

**The Charter test:** if a proposed copy edit could appear in WeConnectU,
PropWorx, or RedRabbit's marketing without seeming out of place, it does
not belong on a Pleks public surface. The voice should be impossible to
confuse with legacy-incumbent register.
**UNENFORCEABLE** — a comparison against competitors' marketing register; purely a reviewer's judgement call.

Source: BUILD_66 Charter shipping + second-opinion review (2026-05-25).
Codified at project level so future public-surface decisions can be
evaluated against named principles rather than re-litigated each time.

---

