/**
 * components/onboarding/TransitionLoader.tsx — branded full-panel handoff loader
 *
 * Notes:  Covers a navigation hop's React teardown window (onboarding→welcome,
 *         welcome→dashboard) so the route's error boundary never flashes while the
 *         next page loads. Renders inside an .ob-panel; uses the .ob-transition*
 *         tokens in globals.css. Pure presentational — copy is caller-overridable so
 *         the whole signup→welcome→dashboard flow reads as one continuous branded moment.
 */
export function TransitionLoader({
  title = "Setting up your workspace",
  sub = "Creating your account and securing your space — just a moment.",
}: Readonly<{ title?: string; sub?: string }>) {
  return (
    <div className="ob-transition" role="status" aria-live="polite">
      <svg className="ob-transition-mark" width={48} height={48} viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M18 3 L31 7 L31 17 C31 24 26 30 18 33 C10 30 5 24 5 17 L5 7 Z"
          stroke="var(--ink)" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
        <circle cx="18" cy="17" r="1.6" fill="var(--amber)" />
        <line x1="18" y1="18.6" x2="18" y2="22.5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <p className="ob-transition-title">{title}</p>
      <p className="ob-transition-sub">{sub}</p>
      <div className="ob-transition-bar" aria-hidden="true" />
      <span className="sr-only">{title}, please wait</span>
    </div>
  )
}
