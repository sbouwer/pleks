/**
 * components/layout/FocusBackdrop.tsx — 4-layer warm backdrop for focused auth surfaces
 *
 * Notes:  Renders the same static backdrop as the onboarding shell (gradient, amber glow,
 *         diagonal hatch, vignette). Absolute inset:0 — host element must be position:relative
 *         and overflow:hidden (use .fs-shell). Styles live in focus-shell.css; import it
 *         in the consuming layout/page.
 */
export function FocusBackdrop() {
  return (
    <>
      <div className="fs-bd-gradient" aria-hidden="true" />
      <div className="fs-bd-glow"     aria-hidden="true" />
      <div className="fs-bd-hatch"    aria-hidden="true" />
      <div className="fs-bd-vignette" aria-hidden="true" />
    </>
  )
}
