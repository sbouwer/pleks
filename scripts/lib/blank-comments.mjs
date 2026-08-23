/**
 * scripts/lib/blank-comments.mjs — blank comments while preserving byte offsets
 *
 * Auth:   none — local/CI helper
 * Data:   none; a pure string transform
 * Notes:  Extracted 2026-08-23 from check-subscription-single-reads.mjs, which was its first
 *         caller, when check-invariant-has-callers needed it too. The extraction was forced rather
 *         than chosen: importing it from the other CHECK executed that check's module body — a
 *         top-level `--selftest` branch and a `git ls-files` scan — so the new script's probe run
 *         ran the old script's probes and exited 0 on them. A helper shared between two scripts
 *         belongs in neither of them.
 *
 *         Two checks now depend on this, and they depend on it for the same reason: this repo has
 *         been fooled three times by a check reading its own explanatory prose as code (the knip
 *         floor counting `@knipignore` written in a sentence; the first draft of the subscription
 *         check flagging the four sites it had just fixed; and the reader-count in
 *         check-invariant-has-callers, where a comment asserting a list is live would otherwise
 *         have satisfied the very check written because that prose made the gap invisible).
 */

/**
 * Blank out `//` and block comments, character by character, preserving length so byte offsets and
 * line numbers still line up. LINEAR AND REGEX-FREE ON PURPOSE — a comment-stripping regex was the
 * other candidate and this repo's super-linear-regex rule rejects that shape, correctly.
 *
 * Known limit, stated rather than discovered later: it does not track string or template literals,
 * so a `//` inside a string blanks the rest of that line. Both callers scan for identifiers and
 * call chains, where the failure direction is a missed match rather than a false one — the safe
 * direction for a check that must not cry wolf. A caller that needs string-accurate parsing wants
 * a real tokeniser, not this.
 */
export function blankComments(src) {
  let out = ""
  let i = 0
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++ }
    } else if (src[i] === "/" && src[i + 1] === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++ }
      out += "  "; i += 2
    } else {
      out += src[i]; i++
    }
  }
  return out
}
