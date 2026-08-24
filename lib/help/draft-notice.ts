/**
 * lib/help/draft-notice.ts — the reader that makes HELP_CONTENT_DRAFT mean something
 *
 * Auth:   none — pure function over a compile-time constant
 * Data:   HELP_CONTENT_DRAFT from lib/help/help-data.ts
 * Notes:  M-077. `HELP_CONTENT_DRAFT` was a stated compliance gate with ZERO readers: the flag said
 *         the corpus had not passed Stéan's §7 content-compliance pass (D-HELP-20), and /help
 *         rendered every answer to every user regardless, because no code consulted it. The
 *         constant's existence was standing in for the enforcement it named.
 *
 *         WHY A FUNCTION AND NOT AN INLINE `if` IN THE COMPONENT. This repo's vitest runs in the
 *         `environment: 'node'` and has zero .tsx tests — no jsdom, no testing-library. Asserting a
 *         banner by rendering it would mean adding component-test infrastructure for one boolean,
 *         against the rule about not adding packages an existing one covers. Putting the decision
 *         and its copy here makes it directly unit-testable in the suite that already exists, and
 *         gives the wording one home rather than one per surface.
 *
 *         WHAT THIS IS NOT. A banner is a disclosure, not a sign-off. It tells a reader the answers
 *         are unverified; it does not verify them. M-077 closes when this flag goes false after the
 *         §7 pass — the banner is what makes the interim state honest instead of silent.
 */
import { HELP_CONTENT_DRAFT } from "./help-data"

export interface DraftNotice {
  title: string
  body: string
}

/**
 * The notice to show while the help corpus is unsigned, or `null` once it has been signed off.
 *
 * Deliberately returns the copy rather than a bare boolean: a caller that receives `true` still has
 * to invent the wording, and two surfaces inventing it separately is how the corpus grew two of
 * everything before D-HELP-01 forced one.
 */
export function helpDraftNotice(): DraftNotice | null {
  if (!HELP_CONTENT_DRAFT) return null
  return {
    title: "These answers are still being reviewed",
    body:
      "Our help content has not yet completed its compliance review, so an answer here may be " +
      "incomplete or out of date. Anything you plan to act on — deposits, notice periods, or " +
      "money — please confirm with the team first.",
  }
}
