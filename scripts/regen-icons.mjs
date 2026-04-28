/**
 * regen-icons.mjs
 *
 * Regenerate the PWA install icons (icon-192.png, icon-512.png) from
 * public/favicon.svg so they stay in sync with the favicon.
 *
 * Run after editing public/favicon.svg:
 *   node scripts/regen-icons.mjs
 *
 * Requires: sharp (already bundled by Next.js for next/image, no extra install).
 *
 * Output:
 *   public/icons/icon-192.png   (PWA install icon, Apple touch icon)
 *   public/icons/icon-512.png   (PWA splash, Android home screen)
 */

import sharp from "sharp"
import { readFileSync, mkdirSync, existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "..")
const SRC = resolve(ROOT, "public/favicon.svg")
const OUT_DIR = resolve(ROOT, "public/icons")

const TARGETS = [
  { size: 192, name: "icon-192.png" },
  { size: 512, name: "icon-512.png" },
]

async function main() {
  if (!existsSync(SRC)) {
    console.error(`✗ Source SVG not found at ${SRC}`)
    process.exit(1)
  }

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true })
  }

  const svg = readFileSync(SRC)

  for (const { size, name } of TARGETS) {
    const out = resolve(OUT_DIR, name)
    await sharp(svg, { density: Math.ceil(size * 4) })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toFile(out)
    console.log(`✓ ${name}  (${size}×${size})`)
  }

  console.log(`\nDone. Regenerated ${TARGETS.length} icon(s) from public/favicon.svg`)
}

main().catch((err) => {
  console.error("✗ Regen failed:", err)
  process.exit(1)
})
