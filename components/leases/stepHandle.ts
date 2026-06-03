/**
 * components/leases/stepHandle.ts — the footer↔step adapter contract for the lease modal
 *
 * Notes:  Each content-only step registers a StepHandle with the LeaseWizardModal on every render
 *         (cheap — it only updates a ref). The footer's Continue button calls the current step's
 *         `submit()`; returning true (validation passed + state committed to context) advances the
 *         wizard. Steps that own a terminal action (the final Create step) drive their own buttons
 *         and register a no-op or omit submit. Mirrors the property wizard's footer-driven nav, but
 *         lets each lease step keep its transient form state local instead of hoisting it all to context.
 */
export interface StepHandle {
  /**
   * Validate the step + commit its state to context. Return true to allow the footer to advance.
   * The terminal Create step returns void (it navigates away on success and never advances).
   */
  submit: () => boolean | void | Promise<boolean | void>
}
