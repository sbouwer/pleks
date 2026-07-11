/**
 * eslint-rules/no-raw-content-hash.mjs — evidence-grade SHA-256 goes through lib/crypto
 *
 * When a Tribunal bundle or affidavit says "SHA-256 of the content", every such hash must be computed the
 * same way — same algorithm, same encoding — or the claim is only as trustworthy as the least careful call
 * site. `contentHash(content)` in lib/crypto is that one way. A raw `createHash("sha256")` elsewhere is
 * either an evidence hash (use contentHash) or a different operation (an IP-privacy hash, a device
 * fingerprint, a dedup lookup key, a cache key) that wants its own purpose-named helper in lib/crypto.
 *
 * Baselined sites are the current non-content hashes — they are NOT evidence and do not become contentHash;
 * they burn down as each gets a named helper. Baselines only shrink. Only "sha256" is matched (MD5
 * signatures and other algorithms are out of scope).
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-raw-content-hash.baseline.json"), "utf8")))

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "Evidence-grade SHA-256 goes through contentHash() in lib/crypto." },
    messages: {
      rawHash:
        "Do not compute a SHA-256 with a raw `createHash(\"sha256\")` here. If this is an evidence/content hash (a notice body, an export, a PDF, a ToS snapshot), use `contentHash()` from @/lib/crypto so an affidavit's \"SHA-256 of the content\" is provably uniform. If it is a different operation (IP hash, fingerprint, dedup key, cache key), give it a purpose-named helper in lib/crypto.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (file.startsWith("lib/crypto/") || file.includes("/lib/crypto/")) return {}   // the implementation + its siblings
    if (BASELINE.has(file)) return {}
    if (file.includes("/eslint-rules/")) return {}

    return {
      CallExpression(node) {
        const callee = node.callee
        const isCreateHash =
          (callee?.type === "Identifier" && callee.name === "createHash") ||
          (callee?.type === "MemberExpression" && callee.property?.name === "createHash")
        if (!isCreateHash) return
        const arg = node.arguments[0]
        if (arg?.type === "Literal" && arg.value === "sha256") {
          context.report({ node, messageId: "rawHash" })
        }
      },
    }
  },
}

export default rule
