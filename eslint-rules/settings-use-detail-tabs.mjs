/**
 * eslint-rules/settings-use-detail-tabs.mjs — Component Canon: settings pages use DetailTabs
 *
 * Settings category pages render on the universal detail template (DetailPageLayout + DetailTabs, the
 * door-grammar amber-underline tabs) — NOT shadcn ui/tabs (segmented). Reusing whatever's nearby is how
 * the two tab systems kept getting mixed; this makes the wrong one fail in /settings. Scoped to settings
 * files only (shadcn ui/tabs stays valid elsewhere). Legacy sub-pages baseline with an inline disable
 * until they fold into their category page's tabs. See the Component Canon in CLAUDE.md.
 */

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Settings pages use DetailTabs (components/detail), not shadcn ui/tabs." },
    messages: {
      useDetailTabs:
        "Settings pages use DetailTabs (components/detail/DetailTabs) on the DetailPageLayout, not shadcn ui/tabs — see the Component Canon in CLAUDE.md. Legacy sub-page mid-migration? add `// eslint-disable-next-line pleks/settings-use-detail-tabs -- legacy; folds into the category page`.",
    },
    schema: [],
  },
  create(context) {
    // Scope to the settings ROUTE pages — not components/settings/* (preview/util components may use
    // shadcn tabs legitimately). The canon is about settings *category pages*.
    const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
    if (!file.includes("(dashboard)/settings/")) return {}
    return {
      ImportDeclaration(node) {
        if (node.source.value === "@/components/ui/tabs") {
          context.report({ node, messageId: "useDetailTabs" })
        }
      },
    }
  },
}

export default rule
