---
paths:
  - "**/*.tsx"
---

## ⚠ COMPONENT CANON — which component to use

**Before any UI work — especially restyling an "old" page — read `brief/design/DESIGN_LANGUAGE.md`.**
That doc is the SSOT for *how Pleks looks* (the "door style": square corners, hairline borders, amber-only
accent; the theme wrappers `.pleks-public`/`.pleks-portal`; the brand primitives `<Wordmark>` (NOT the
missing `/logo.svg`), `FocusBackdrop`, `.fs-panel`/`.fs-knob`, `.fs-cta`, `.stoep`, the DoorCard pattern;
the token vocabulary; and **which surfaces are reference vs old**). The table below says *which component*;
that doc says *what style it must carry*. Most detail pages + the old `/apply` flow are still old-style —
**do not copy a nearby page to infer the look; copy the reference surfaces (login, dashboard) per the doc.**

Reusing whatever component is nearby inherits its style — that's how the app drifted into two tab
systems, two header styles, and mixed radii. Before building UI, pick from this table. Reach for the
**Use** column; never the **Not** column without a reason.

| Building… | Use | Not |
|---|---|---|
| Detail / category page (an entity **or** a settings category) | `DetailPageLayout` + `DetailTabs` (`components/detail/`) | shadcn `ui/tabs`, ad-hoc `<h1>` headers |
| List / index resource page | `ResourcePageHeader` (`components/ui/resource-page-header`) | ad-hoc page headers |
| Settings overview (landing) | `SettingsPageHeader` (`components/settings/`) | — |
| Tabs on a detail page | `DetailTabs` (amber-underline) | shadcn `ui/tabs` (segmented) |
| Form fields (text / select / textarea) | `components/forms/fields` — `FieldGrid` · `TextField` · `SelectField` · `TextareaField` (the add-contact grammar) | raw `<input>`/`<Label>`/shadcn `Select`; the old `DetailsForm` `F`/`Sel` |
| Buttons / actions | `ActionButton` · `AddButton` · `DeleteButton` (`components/ui/actions`) | shadcn `Button` |
| Cards in a detail grid | `DetailCard` (`components/detail/DetailCard`) | ad-hoc bordered divs |
| Corner radius | `rounded-[var(--r-button)]` (3px square) | `rounded-md` / `rounded-lg` (pills → `rounded-full`) |

**Tabs:** URL-sync via `?tab=` so they deep-link; keep the tab set in a plain `tabs.ts` — **not** the
`"use client"` strip (a server page importing data from a client module gets a client *reference*, not
the value → `X.some is not a function`).

**Enforced:** `pleks/settings-use-detail-tabs` fails the build if a `/settings/**` file imports shadcn
`ui/tabs`. The rest is code-review against this table.

---

