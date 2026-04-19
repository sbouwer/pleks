# ADDENDUM_00D — CI/CD, Version Control & Release Automation

> **Status:** Spec'd, not yet built
> **Type:** Infrastructure (cross-cutting)
> **Parent:** BUILD_00 (repository plumbing)
> **Sits alongside:** ADDENDUM_00A (encryption at rest / tier cookie fix), ADDENDUM_00B (operating hours), ADDENDUM_00C (settings sidebar)
> **Dependencies:** none structurally; Stéan must perform GitHub repo-settings toggles documented in §4.6 before the release workflow can commit back to `main`

**Touches:** `.github/workflows/ci.yml` (new), `.github/workflows/release.yml` (new), `.github/workflows/pr-title.yml` (new), `.github/dependabot.yml` (new), `.github/PULL_REQUEST_TEMPLATE.md` (new), `.releaserc.json` (new), `CHANGELOG.md` (new, seed), `package.json` (add `engines`, `release` devDependencies, `security:ci` script), `scripts/security/audit.mjs` (add `--ci` flag for localhost-free subset), `CLAUDE.md` / `CLAUDE_CODE_INSTRUCTIONS.md` (add conventional-commits standing instruction), `.gitignore` (no change — `.github/` is versioned).

**Scope:** stand up first-class CI/CD and version-control discipline for Pleks. Every PR runs lint, typecheck, build, security-scan, and dependency-CVE scan before merge is permitted. Every merge to `main` runs semantic-release: determines next version from conventional-commit messages since the last tag, writes `CHANGELOG.md`, creates a Git tag, publishes a GitHub Release with notes. Vercel continues to handle deployment unchanged — CI gates the merge, Vercel gates the deploy. Dependabot keeps dependencies current with grouped weekly PRs. PR titles are linted to conventional-commit format so squash-merged commits on `main` reliably drive release automation.

**Does not touch:** deployment (Vercel handles it), npm publishing (Pleks is not a package), test execution (no test harness yet — Tier 2 follow-on), cross-OS matrix (Vercel builds on Linux; macOS/Windows CI adds zero signal for a web app), SonarCloud paid features (deferred — `eslint-plugin-sonarjs` already gives us the high-value static checks locally).

---

## 1 · Problem statement

The Pleks repo has no `.github/` folder, no CI, no automated quality gates, no version tagging, and no release notes. Every merge to `main` is a leap of faith. Today the only quality gates are the ones a developer runs manually: `npm run check` before commit (per `CLAUDE_CODE_INSTRUCTIONS.md`) and `npm run security` before deploy. Both are excellent disciplines and both are only as reliable as human memory.

Current state risks as the codebase grows:

- **No version correlation.** Version in `package.json` is `0.1.0` and has never been bumped. "What version is in production?" and "what changed between two deploys?" are not answerable from Git.
- **No CI enforcement.** A PR with a failing typecheck, a lint error, or a broken build can be merged. Vercel will reject the deploy but the bad commit is already on `main`, polluting history and blocking the next merge.
- **No dependency hygiene.** Dependencies are updated manually when someone notices. No automated CVE scanning.
- **No release notes.** When a first production agency customer asks "what changed in this release?" there is no answer short of a manual `git log`.
- **No contribution path.** If Pleks ever takes on a second developer, there is no discoverable pattern for PR review, branch protection, or merge discipline.

This build closes all of those gaps using free GitHub infrastructure plus one open-source release tool (semantic-release). Zero recurring cost. Zero new vendors.

---

## 2 · Non-goals

Explicit list of things deliberately out of scope, with rationale so future sessions don't re-litigate:

- **Cross-OS matrix (ubuntu/windows/macos).** Pleks is a Vercel-hosted Next.js app. Vercel builds on Linux. Every production deploy is a Linux build. Windows and macOS CI runs add CI time and maintenance burden with zero production signal. Node-version matrix stays single-version for Tier 1.
- **Parallel deployment pipeline.** Vercel already deploys every PR to a preview URL and every `main` push to production. A CI job that also deploys duplicates work and conflicts with Vercel's built-in atomicity.
- **Deployment webhook / post-release trigger.** Vercel is the deployment mechanism. The release workflow creates a Git tag; Vercel's GitHub integration picks up the tag (and the `main` push that preceded it) and deploys. No webhook needed.
- **npm publishing.** Pleks is a private SaaS app, not a published package. `@semantic-release/npm` is deliberately NOT configured.
- **SonarCloud.** Paid for private repos beyond the free-tier limits. `eslint-plugin-sonarjs` is already in devDependencies and gives ~80% of the value locally. Revisit if a paid budget exists AND there is a second reviewer who would use the dashboards.
- **Test execution.** The repo has no test harness (vitest, jest, playwright). The spec includes a no-op test job stub that becomes real in Tier 2 (separate spec when vitest is stood up — see BUILD_60 open items).
- **Code coverage thresholds.** Follows from no-test-harness — there is nothing to measure coverage against yet.
- **Python generator / barrel-file steps.** No generators in Pleks. Irrelevant.
- **Force-release workflow dispatch inputs.** Semantic-release handles "nothing to release" cleanly on its own. A force-release toggle is premature complexity for a one-person team.

---

## 3 · Design decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| D-CI-01 | CI runs on every `push` to `main` and every `pull_request` targeting `main`. No per-branch filters. | Single active branch strategy; feature branches are short-lived. |
| D-CI-02 | Use `actions/setup-node@v4` with `cache: 'npm'` and `node-version-file: '.nvmrc'`. No hard-coded versions in workflow files. | Node version lives in one place (`.nvmrc` + `package.json engines.node`). Bumping Node is a single-file change. |
| D-CI-03 | Single Node version for Tier 1 (Node 20). Matrix deferred to Tier 2. | Vercel runs Node 20.x. Testing on 22 is speculative until we have a real test harness. |
| D-CI-04 | Ubuntu-only runners. | Production target is Linux. Revisited never unless Pleks gets a native-binary dependency. |
| D-CI-05 | No `build` job in CI. Vercel's preview deploy per PR is the authoritative build signal. | Running `next build` in CI duplicates Vercel's work, requires embedding real Supabase credentials (several pages prerender with live data), and adds 3–5 min per CI run. Vercel handles build validation; CI handles lint/typecheck/security/CVE. If CI-side build becomes desirable later (e.g. to not depend on Vercel's uptime), add it back with real secrets configured. |
| D-CI-06 | Squash-merge is the only merge strategy enabled on `main`. PR title becomes the merge commit message. | Guarantees every `main` commit is a single, reviewed, conventional-format message. Simplifies semantic-release. Keeps history readable. |
| D-CI-07 | PR title is linted to Conventional Commits format via `amannn/action-semantic-pull-request`. Non-conforming PRs cannot merge. Type list enforced; subject casing NOT enforced (Dependabot compat — its auto-generated "Bump X from Y to Z" subjects start with a capital letter that cannot be configured away). | Enforces commit discipline at the PR boundary on the load-bearing thing (the type). Subject casing is stylistic and best enforced by PR review; forcing it in CI blocks Dependabot PRs without meaningful value. |
| D-CI-08 | Semantic-release runs ONLY on `main` push, not on PR. | Prevents accidental version bumps from draft PRs. Version is a consequence of merging, not of proposing. |
| D-CI-09 | Semantic-release plugins used: `commit-analyzer`, `release-notes-generator`, `github`. NOT `changelog`, NOT `git`, NOT `npm`. | GitHub Releases page is the authoritative changelog. No commits pushed back to `main` means no bypass-list wrestling with GitHub's default `github-actions[bot]` identity (which is not a selectable bypass actor on personal repos). Git tags + GitHub Releases + search by version give everything an in-repo CHANGELOG would. Reversible later via PAT if a team member wants in-repo changelog. |
| D-CI-10 | Release workflow only creates tags and GitHub Releases. No pushes back to `main`. | Avoids the GitHub papercut where the default Actions token cannot be granted bypass rights on personal repos. Any emergency fix is a normal PR like everything else. |
| D-CI-11 | Initial semantic version: **`1.0.0`** on first release. | Pleks is shipping to real agency customers imminently. `0.x` signalling would misrepresent readiness. First release tagged `v1.0.0` and version field updated. |
| D-CI-12 | Security scan in CI uses a new `security:ci` script that runs only the subset of audit categories that do not require a running Next.js dev server (Cat 1, 2, 5, 7 — Supabase-direct checks). Full `security` remains as pre-deploy local discipline. | Running `next dev` in GitHub Actions is fragile and slow. Static Supabase-direct checks run in ~5s and cover the highest-risk RLS and cross-org categories. |
| D-CI-13 | Trivy filesystem scan runs on every PR and push, advisory-mode on feature branches and blocking on `main`. Ignores live in `.trivyignore` with mandatory justification header and `exp:YYYY-MM-DD` expiration. | Catches CVEs in lockfile dependencies that `npm audit` misses. Free. Fast (~30s). Suppressions carry a human-readable reason + architectural context + mitigation so future-Claude understands what's accepted risk vs oversight. Expiration forces annual re-review. |
| D-CI-14 | Dependabot grouped-updates: one PR per minor/patch cohort per ecosystem per week. Major-version bumps ungrouped (one PR per major bump). | A flood of ungrouped PRs is worse than no updates. Groups keep the review queue manageable. Majors need individual attention regardless. |
| D-CI-15 | PR template is markdown, not YAML issue form. | Markdown lets CC fill it in programmatically from commit messages; YAML forms require manual field selection. |
| D-CI-16 | Pull-request-target is **never** used. Workflows run as `pull_request`, meaning forked PR code runs with fork-level privileges (no secrets access). | Security boundary. `pull_request_target` is a known foot-gun. We accept the trade-off that forked PRs cannot use secrets — Pleks doesn't take external contributions so this is moot. |
| D-CI-17 | `GITHUB_TOKEN` is the only secret needed for Tier 1. No `NPM_TOKEN`, no `CODECOV_TOKEN`, no `SONAR_TOKEN`. | Minimum-viable secret surface. Fewer things to leak, fewer things to rotate. |
| D-CI-18 | `.nvmrc` pinned to `20` (LTS major). `package.json engines.node` set to `>=20.9.0`. | `.nvmrc` for local `nvm use`; `engines` as the authoritative requirement for npm and CI. Next.js 16 requires Node 20.9+. |
| D-CI-19 | All workflow files use `permissions:` blocks to restrict the default `GITHUB_TOKEN` scope per-job. Principle of least privilege. | Default Actions token has broad write scope. Explicit per-job permissions prevent accidental abuse if a dependency in the workflow is compromised. |
| D-CI-20 | `concurrency:` groups cancel superseded PR runs (keep latest only). `main` runs are never cancelled. | Saves Actions minutes on force-pushes. `main` runs complete because they determine release state. |

---

## 4 · Tier 1 scope — shippable now

### 4.1 Workflow files

Three workflow files cover the Tier 1 scope. All live in `.github/workflows/`.

#### 4.1.1 `.github/workflows/ci.yml`

Runs on every PR and every `main` push. Gates merging. Does not release.

```yaml
# .github/workflows/ci.yml
# Runs on every PR and every push to main. Gates merging.
# Does NOT release — that's release.yml.
# Does NOT build — Vercel's preview deploy handles build validation (D-CI-05).

name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref == 'refs/heads/main' && github.run_id || github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  quick-check:
    name: Lint & Typecheck
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --prefer-offline --no-audit

      - name: Typecheck + Lint (npm run check)
        run: npm run check

  # NOTE: No `build` job in CI (D-CI-05).
  # Vercel handles production and preview builds directly. Running `next build`
  # in CI would duplicate Vercel's work and require embedding real Supabase
  # credentials (several pages prerender with live data). The Vercel preview
  # deploy that fires on every PR is the authoritative build signal.

  security-scan:
    name: Security (static Supabase checks)
    needs: quick-check
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --prefer-offline --no-audit

      - name: Run security:ci (no-localhost subset)
        run: npm run security:ci
        env:
          SUPABASE_URL: ${{ secrets.CI_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.CI_SUPABASE_SERVICE_ROLE_KEY }}
        # These secrets are optional. If not set, security:ci should
        # short-circuit with a warning rather than failing the job.
        # The full security audit remains a pre-deploy local step.
        continue-on-error: false

  dependency-scan:
    name: Dependency CVE scan (Trivy)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy (strict on main, advisory on PR)
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          severity: 'HIGH,CRITICAL'
          exit-code: ${{ github.ref == 'refs/heads/main' && '1' || '0' }}
          ignore-unfixed: true

  pr-title:
    name: PR title (Conventional Commits)
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 3
    permissions:
      pull-requests: read
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            perf
            refactor
            chore
            docs
            test
            build
            ci
            style
            revert
          requireScope: false
          validateSingleCommit: false
          # No subjectPattern: Conventional Commits spec allows any subject
          # casing. Dependabot's auto-generated PR titles start with "Bump"
          # (capital B) which would fail a lowercase-only rule. The type
          # enforcement above is the load-bearing check; subject casing is
          # a stylistic preference best enforced by PR review, not CI.
```

#### 4.1.2 `.github/workflows/release.yml`

Runs ONLY on `main` push. Gated on CI success. Creates tag + release notes + CHANGELOG.

```yaml
# .github/workflows/release.yml
# Runs only on main pushes. Creates a semver tag, updates CHANGELOG.md,
# publishes a GitHub Release with notes. No npm publish.

name: Release

on:
  push:
    branches: [main]
  # Manual re-trigger in case a release workflow was skipped/failed.
  workflow_dispatch: {}

permissions:
  contents: write         # push CHANGELOG commit + create tag
  issues: write           # semantic-release may comment on related issues
  pull-requests: write    # semantic-release may comment on related PRs

concurrency:
  group: release-main
  cancel-in-progress: false

jobs:
  gate:
    name: Wait for CI
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: lewagon/wait-on-check-action@v1.3.4
        with:
          ref: ${{ github.sha }}
          check-regexp: '(Lint & Typecheck|Security|Dependency CVE scan)'
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          wait-interval: 10
          running-workflow-name: 'Release'

  release:
    name: Semantic Release
    needs: gate
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          persist-credentials: false

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci --prefer-offline --no-audit

      - name: Semantic Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Unset GIT_AUTHOR_* / GIT_COMMITTER_* — semantic-release
          # sets them from `@semantic-release/git` config.
        run: npx semantic-release
```

#### 4.1.3 `.github/workflows/pr-title.yml`

Redundant-looking with the `pr-title` job in `ci.yml`, but separated because PR titles can be edited on a PR that already has a passing CI run. This workflow re-runs when the title changes, independent of code changes.

```yaml
# .github/workflows/pr-title.yml
# Re-validates the PR title whenever it changes, even if no code has been pushed.
# The pr-title job in ci.yml handles the initial validation; this handles edits.

name: PR Title

on:
  pull_request_target:
    types: [opened, edited, reopened, synchronize]

permissions:
  pull-requests: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 3
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            perf
            refactor
            chore
            docs
            test
            build
            ci
            style
            revert
          requireScope: false
          # No subjectPattern — see ci.yml for rationale (Dependabot compat)
```

Note: `pull_request_target` is used here deliberately (the one exception to D-CI-16) because this workflow only reads the PR title — it does not check out or execute repo code. The security foot-gun with `pull_request_target` is running untrusted checkout code with privileged secrets; neither happens here.

### 4.2 Semantic-release configuration

#### 4.2.1 `.releaserc.json`

```json
{
  "branches": ["main"],
  "tagFormat": "v${version}",
  "plugins": [
    [
      "@semantic-release/commit-analyzer",
      {
        "preset": "conventionalcommits",
        "releaseRules": [
          { "type": "feat",     "release": "minor" },
          { "type": "fix",      "release": "patch" },
          { "type": "perf",     "release": "patch" },
          { "type": "refactor", "release": false   },
          { "type": "chore",    "release": false   },
          { "type": "docs",     "release": false   },
          { "type": "test",     "release": false   },
          { "type": "build",    "release": false   },
          { "type": "ci",       "release": false   },
          { "type": "style",    "release": false   },
          { "type": "revert",   "release": "patch" },
          { "breaking": true,   "release": "major" }
        ],
        "parserOpts": {
          "noteKeywords": ["BREAKING CHANGE", "BREAKING CHANGES", "BREAKING"]
        }
      }
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        "preset": "conventionalcommits",
        "presetConfig": {
          "types": [
            { "type": "feat",     "section": "Features" },
            { "type": "fix",      "section": "Bug Fixes" },
            { "type": "perf",     "section": "Performance" },
            { "type": "revert",   "section": "Reverts" },
            { "type": "refactor", "section": "Refactors",  "hidden": true  },
            { "type": "docs",     "section": "Docs",       "hidden": true  },
            { "type": "chore",    "section": "Chores",     "hidden": true  },
            { "type": "test",     "section": "Tests",      "hidden": true  },
            { "type": "build",    "section": "Build",      "hidden": true  },
            { "type": "ci",       "section": "CI",         "hidden": true  },
            { "type": "style",    "section": "Style",      "hidden": true  }
          ]
        }
      }
    ],
    [
      "@semantic-release/github",
      {
        "successComment": false,
        "failComment": false,
        "releasedLabels": false,
        "addReleases": "bottom"
      }
    ]
  ]
}
```

Notes on configuration choices:

- `"branches": ["main"]`: single-branch release strategy. No pre-release or beta tracks.
- `"tagFormat": "v${version}"`: creates tags as `v1.0.0`, `v1.1.0` etc. Vercel's "Deploy from tag" UX expects this prefix.
- `"preset": "conventionalcommits"`: standard Conventional Commits parser.
- `"chore": false`: `chore:` commits do NOT trigger a release.
- **No `@semantic-release/changelog` or `@semantic-release/git` plugins.** Per D-CI-09/10, semantic-release does not push back to `main`. The GitHub Releases page is the changelog. Each release is queryable at `github.com/sbouwer/pleks/releases/tag/v1.2.3` with full notes, compare-to-previous link, and artefacts. If an in-repo `CHANGELOG.md` becomes necessary later (team growth, SOC 2 evidence), it can be added back via a PAT-based release flow — non-breaking change.
- `"successComment": false`, `"failComment": false`: disables semantic-release's auto-comments on related issues/PRs. Keeps issue threads clean.

#### 4.2.2 `package.json` — dev dependencies added

Add to `devDependencies`:

```json
"semantic-release": "^24.2.0",
"@semantic-release/commit-analyzer": "^13.0.1",
"@semantic-release/github": "^11.0.1",
"@semantic-release/release-notes-generator": "^14.0.2",
"conventional-changelog-conventionalcommits": "^8.0.0"
```

Deliberately **not** added: `@semantic-release/changelog`, `@semantic-release/git`, `@semantic-release/npm` (D-CI-09).

And add `engines`:

```json
"engines": {
  "node": ">=20.9.0"
}
```

Also add a new script:

```json
"security:ci": "node scripts/security/audit.mjs --ci"
```

And set `version` to `1.0.0` (D-CI-11). Semantic-release will manage it from the first release onward; the initial seed just reflects the starting state.

### 4.3 `scripts/security/audit.mjs` — add `--ci` flag

CC extends the existing security audit script to support a `--ci` flag that runs only the categories that do NOT require a running Next.js dev server. From `CLAUDE_CODE_INSTRUCTIONS.md`:

> Prerequisites: `npm run dev` must be running (Categories 3, 4, 6, 8–12 test localhost)

Therefore the CI-safe subset is: **Categories 1, 2, 5, 7** — the Supabase-direct checks (unauthenticated table access, cross-org leakage, storage bucket access, RLS policy audit). Categories 10 (webhook signature verification) and 11 (secrets exposure) partially depend on localhost; leave them out of `--ci` for simplicity.

Behaviour of `--ci`:

- If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars are absent, print a warning and exit 0 (do not fail CI). Rationale: early on Stéan may not want to expose a CI-only service-role key; the workflow should not block merges on a secret nobody has set up yet. Once the secrets are configured, the script auto-engages.
- If env vars are present, run Categories 1, 2, 5, 7 and exit 1 on any CRITICAL finding.
- Output should be CI-friendly (single-pass summary, exit codes, no interactive prompts).

This also means a new CI secret surface (optional, Stéan's choice):

| Secret | Purpose | Optional? |
|--------|---------|-----------|
| `CI_SUPABASE_URL` | Points at the CI / dev project (NOT production) | Yes (warn + pass if absent) |
| `CI_SUPABASE_SERVICE_ROLE_KEY` | Service key for same project | Yes (warn + pass if absent) |

Recommendation: create a dedicated Supabase branch (or a second dev project) for CI. Do NOT point CI at production — a security test run could create test rows. Tier-2 follow-on: wire Supabase branching into the CI flow so each PR gets its own ephemeral database.

### 4.4 Dependabot configuration

`.github/dependabot.yml`:

```yaml
# .github/dependabot.yml
# Keeps npm and github-actions dependencies current.
# Grouped updates to keep review queue manageable.

version: 2
updates:
  # ─────────────────────────────────────────
  # npm dependencies (root package.json)
  # ─────────────────────────────────────────
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
      time: "04:00"
      timezone: "Africa/Johannesburg"
    open-pull-requests-limit: 5
    commit-message:
      prefix: "chore(deps)"
      include: "scope"
    labels:
      - "dependencies"
    groups:
      # All minor+patch bumps in a single weekly PR per cohort
      production-dependencies:
        dependency-type: "production"
        update-types: ["minor", "patch"]
      development-dependencies:
        dependency-type: "development"
        update-types: ["minor", "patch"]
      # React + Next ecosystem: group the big players so we don't
      # get partial upgrades that break type compatibility
      react-ecosystem:
        patterns:
          - "react"
          - "react-dom"
          - "@types/react"
          - "@types/react-dom"
          - "next"
          - "eslint-config-next"
      supabase-ecosystem:
        patterns:
          - "@supabase/*"
      tiptap-ecosystem:
        patterns:
          - "@tiptap/*"
      fullcalendar-ecosystem:
        patterns:
          - "@fullcalendar/*"
      tanstack-ecosystem:
        patterns:
          - "@tanstack/*"
      semantic-release-ecosystem:
        patterns:
          - "semantic-release"
          - "@semantic-release/*"
          - "conventional-changelog-*"
    # Major-version bumps are NOT grouped — each gets its own PR
    # so the reviewer can read release notes individually.
    # No group rule = default one-PR-per-dependency for majors.
    ignore:
      # Pin Node types to match engine version — don't auto-bump
      # to a major Node types version ahead of the runtime.
      - dependency-name: "@types/node"
        update-types: ["version-update:semver-major"]

  # ─────────────────────────────────────────
  # GitHub Actions workflow dependencies
  # ─────────────────────────────────────────
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "monthly"
    open-pull-requests-limit: 3
    commit-message:
      prefix: "chore(ci)"
    labels:
      - "ci"
      - "dependencies"
    groups:
      actions-minor-patch:
        update-types: ["minor", "patch"]
```

### 4.5 PR template

`.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
<!--
PR title MUST follow Conventional Commits format:
  feat: <something>          (minor release)
  fix: <something>           (patch release)
  perf: <something>          (patch release)
  refactor/chore/docs/test/build/ci/style: <something>  (no release)
  feat!: <something>         (major release — breaking)

Keep the subject lowercase, imperative, under 72 chars.
-->

## What

<!-- One-line summary of the change. Prose, not bullets. -->

## Why

<!-- Problem this solves, or value it adds. Link the spec or ticket. -->
<!-- Related spec: `brief/build/BUILD_XX_*.md` or `ADDENDUM_XXX_*.md` -->

## How

<!-- Key files touched, approach taken, any tradeoffs. Keep it brief. -->

## Testing

<!-- How you verified this. Screenshots for UI changes. -->

- [ ] `npm run check` passes locally
- [ ] `npm run build` succeeds locally
- [ ] `npm run security:quick` passes (if touching auth/RLS/webhooks)
- [ ] Tested on mobile viewport if UI-facing
- [ ] Preview deploy verified (Vercel link in PR comments)

## Security / Compliance

<!-- Check any that apply; leave blank if none. -->

- [ ] Touches RLS policies or adds new tables
- [ ] Touches auth, MFA, sessions, or account security
- [ ] Touches trust-account data or financial records
- [ ] Touches POPIA-sensitive fields (ID numbers, bank details, credit data)
- [ ] Adds or changes webhooks (signature verification confirmed)
- [ ] Adds or changes consent surfaces (`consent_log` entry written)

## Breaking changes

<!--
If none, delete this section.
If yes, PR title MUST include `!` (e.g. `feat!:`) and include
a BREAKING CHANGE: footer on the squash commit body, explaining
what users or agencies need to do to migrate.
-->
```

### 4.6 GitHub repository settings — Stéan's checklist

These are one-time toggles in the GitHub UI at `github.com/sbouwer/pleks`. CC cannot set them — they require repo-admin access. This is the only part of this build that is **not** CC-automatable.

**Settings → General → Pull Requests:**
- ☑ Allow squash merging
  - Default commit message: **Pull request title**
- ☐ Allow merge commits (disable)
- ☐ Allow rebase merging (disable)
- ☑ Always suggest updating pull request branches
- ☑ Automatically delete head branches

**Settings → Actions → General:**
- Workflow permissions: **Read and write permissions**
- ☑ Allow GitHub Actions to create and approve pull requests

**Settings → Branches → Branch protection rule for `main`:**

Under "Protect matching branches":
- ☑ Require a pull request before merging
  - ☑ Require approvals (set to **0** initially — single-developer; bump to 1 when a second developer joins)
  - ☑ Dismiss stale pull request approvals when new commits are pushed
  - ☐ Require review from Code Owners (defer until CODEOWNERS exists)
- ☑ Require status checks to pass before merging
  - ☑ Require branches to be up to date before merging
  - Required status checks (add these, exact names):
    - `Lint & Typecheck`
    - `Security (static Supabase checks)`
    - `Dependency CVE scan (Trivy)`
    - `PR title (Conventional Commits)`
- ☑ Require conversation resolution before merging
- ☑ Require linear history
- ☐ Require signed commits (defer — adds friction without clear Phase 1 benefit)
- ☑ Do not allow bypassing the above settings
  - **Bypass list:** add **Repository admin** (role-based) as an Always-bypass actor. This gives the human owner emergency-hotfix access if CI has an outage. **Do NOT attempt to add `github-actions[bot]`** — GitHub's default Actions identity is not a selectable bypass actor on personal repos. The release workflow does not need bypass rights because it never pushes to `main` (D-CI-10).

If the repo uses the newer Rulesets feature instead of classic branch protection, the equivalent is: create a ruleset targeting the default branch with the same rules and a single **Repository admin** bypass entry.

**Settings → Environments → Create `production`:**
- Create a `production` environment (referenced by `release.yml` `environment: production`).
- Initially leave it unprotected.
- Tier 3 (when a second developer joins): add "Required reviewers" on this environment so releases require approval.

**Settings → Secrets and variables → Actions:**

No required secrets for Tier 1. Optional secrets for `security:ci` to engage:

- `CI_SUPABASE_URL` — URL of a CI/dev Supabase project (NOT production)
- `CI_SUPABASE_SERVICE_ROLE_KEY` — service-role key for that project

If omitted, the security job prints a warning and passes. When added, it runs.

### 4.7 `.nvmrc`

Single-line file at repo root:

```
20
```

### 4.8 `.trivyignore` — accepted-risk CVE register

Some CVEs cannot be fixed by upgrading because the vulnerable package is retained for a documented architectural reason. Pleks has one such case today: `xlsx` is retained despite CVE-2023-30533 and CVE-2024-22363 because its low-level `XLSX.SSF.parse_date_code` is required for TPN GL import (BUILD_22) and no successor replicates it. Mitigation is file-type and file-size validation at the API route level.

Trivy reads `.trivyignore` from the repo root automatically via the `Dependency CVE scan` job.

Format:

```
# Header block — rationale + mitigation + re-evaluation trigger
CVE-YYYY-NNNNN exp:YYYY-MM-DD
```

Rules:

- Every entry MUST have a header block directly above it explaining (a) why the vulnerable dependency is retained, (b) what mitigation is in place, (c) what would cause re-evaluation.
- Every entry MUST have an `exp:YYYY-MM-DD` expiration set one year out. Trivy stops honouring the suppression after expiration, forcing re-review. Annual cadence.
- Adding a new entry is a `fix(deps): suppress CVE-XXXX-YYYYY` or `chore(deps):` commit, reviewed like any other change.
- Removing an entry (after upgrade or after re-evaluation) is a `fix(deps): remove <package> CVE suppression` commit.

The convention is deliberately public-facing. A security researcher reading the repo can see exactly which CVEs Pleks knows about and has decided to accept, with the operator's justification. Opaque suppression (flag-flipping in CI config without a documented reason) is actively rejected.

### 4.9 `CLAUDE.md` standing-instruction addition

Append to `CLAUDE.md` (or `CLAUDE_CODE_INSTRUCTIONS.md` — whichever is the canonical CC instruction file) a new section. Placement: after "MANDATORY: USE GATEWAY FOR ALL DB ACCESS" and before "MANDATORY: SECURITY AUDIT BEFORE DEPLOYMENT".

```markdown
## ⚠ MANDATORY: CONVENTIONAL COMMIT MESSAGES

Every commit to `main` drives semantic-release. Release notes and version bumps
are generated from commit messages. Format matters.

**PR titles** (which become the squash-merged commit on `main`) MUST follow:

  <type>(<scope>)?: <subject>

Allowed types and their release effect:

| Type       | Release        | Use for                                     |
|------------|----------------|---------------------------------------------|
| `feat`     | minor          | New user-visible feature                    |
| `fix`      | patch          | Bug fix                                     |
| `perf`     | patch          | Performance improvement                     |
| `refactor` | no release     | Code change without behaviour change        |
| `chore`    | no release     | Tooling, config, dependency updates         |
| `docs`     | no release     | Documentation only                          |
| `test`     | no release     | Adding or fixing tests                      |
| `build`    | no release     | Build system or external deps               |
| `ci`       | no release     | CI/CD configuration                         |
| `style`    | no release     | Code style (not CSS) — whitespace, linting  |
| `revert`   | patch          | Revert a previous commit                    |

Breaking changes: add `!` after type (e.g. `feat!: rename /portal to /tenant`)
AND a `BREAKING CHANGE:` footer in the commit body explaining the migration.

Subject line: imperative, under 72 chars, no trailing period. Lowercase preferred for human-authored commits but not enforced by CI (Dependabot's auto-generated "Bump X" subjects start with a capital).

Examples:
- `feat: add passkey enrolment to settings`
- `fix(auth): reject expired step-up challenges`
- `chore(deps): bump @supabase/ssr from 0.9.0 to 0.10.0`
- `feat!: move /portal URLs to /tenant`

The `pr-title` CI job rejects PRs whose titles don't match. PR titles can be
edited after opening — edit, don't force-push.
```

---

## 5 · Tier 2 scope — when vitest is stood up

Triggered by: BUILD_60 Phase 2 unit tests (noted deferred in INDEX), or any new test-bearing build.

Additions:

- New `test` job in `ci.yml`, downstream of `build`, runs `npm test` (or `npm run test:ci`).
- Matrix expansion: Node 20 × Node 22 on ubuntu-latest (still no macOS/Windows).
- Coverage upload to Codecov (free for public and private repos with project-level config). Adds `CODECOV_TOKEN` secret.
- Coverage threshold: initial 40% (low floor — doesn't fight the on-ramp). Ratchet up quarterly.
- `test:coverage` script in `package.json` that produces `coverage/lcov.info`.

Wiring note: when Tier 2 ships, add `Test` to the required status checks list on the `main` branch protection rule.

---

## 6 · Tier 3 scope — when team grows to 2+

Triggered by: hiring or contracting a second developer.

- `.github/CODEOWNERS` file: route code-review requests by directory (e.g. `brief/` → Stéan, `app/` → whole team).
- Branch protection: raise required-approvals from 0 to 1 (or 2 for changes under `supabase/migrations/` — schema changes get stricter review).
- Production environment: require one approval before the release workflow runs.
- SonarCloud: pay for the private-repo tier if budget permits. Adds `SONAR_TOKEN` secret and a `sonarcloud` job. Acts as an additional quality gate.
- `.github/ISSUE_TEMPLATE/` folder: bug report + feature request YAML forms so inbound issues are structured.

Not a Phase 1 concern, not a Phase 2 concern — park here and revisit.

---

## 7 · Conventional Commits reference (for Stéan)

Since this is the first time conventional commits are being enforced in the Pleks repo, here's the mental model:

Every PR title is either a feature (`feat`), a fix (`fix`), a performance improvement (`perf`), or something that doesn't warrant a release (`refactor`, `chore`, `docs`, `test`, `build`, `ci`, `style`). Those eight non-releasing types let you ship internal-only changes without bumping the version — useful for CI tweaks, dependency updates, doc edits.

When you break something on purpose (rename a URL, change a schema, remove a public API), add `!` after the type and write `BREAKING CHANGE: <migration instructions>` in the commit body. That triggers a major version bump and makes the migration notes prominent in the release.

Scope is optional and goes in parentheses: `feat(auth): add passkey enrolment`. Scopes help filter release notes by area. Useful but not required — skip it if unsure.

Common mistakes to avoid:

- **Past-tense subjects.** `fix: fixed bug in arrears` — wrong. Should be `fix: handle overdue-zero edge case in arrears`.
- **Capital first letter.** `Feat: add passkey` — rejected by pr-title job.
- **Subject too long.** Rule of thumb: fits on one terminal line.
- **Missing the colon.** `feat add passkey` — rejected.
- **Wrong type for the change.** "I refactored a bunch of code but also fixed a bug while I was there" — that's `fix`, not `refactor`. The commit type is about the user-facing outcome, not your internal motivation.

---

## 8 · Acceptance criteria

### 8.1 Pre-merge-to-main (local verification)

- [ ] `.nvmrc` at repo root with content `20`
- [ ] `package.json` `engines.node` set to `>=20.9.0`
- [ ] `package.json` `version` set to `1.0.0`
- [ ] `package.json` contains the semantic-release devDependencies listed in §4.2.2
- [ ] `package.json` contains `security:ci` script
- [ ] `npm run security:ci` runs without errors locally (prints "skipped: CI secrets absent" if secrets aren't set)
- [ ] `scripts/security/audit.mjs` recognises `--ci` flag and limits to categories 1, 2, 5, 7
- [ ] `.releaserc.json` at repo root matching §4.2.1 (plugins: commit-analyzer, release-notes-generator, github — NOT changelog, NOT git)
- [ ] `.github/workflows/ci.yml` matching §4.1.1
- [ ] `.github/workflows/release.yml` matching §4.1.2
- [ ] `.github/workflows/pr-title.yml` matching §4.1.3
- [ ] `.github/dependabot.yml` matching §4.4
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` matching §4.5
- [ ] `CLAUDE.md` (or the canonical CC instruction file) appended with the conventional-commits section
- [ ] `npm install` completes cleanly with the new devDependencies
- [ ] `npm run check` still passes
- [ ] `npm run build` still passes
- [ ] Repo is committed with title `chore(ci): add CI/CD, semantic-release, and dependency automation`

- [ ] `.trivyignore` at repo root if any CVE suppressions are required (see §4.8). On first-commit-to-main expect the bootstrap PR to be followed by a `fix(deps)` PR suppressing known-accepted CVEs — this is expected, not a spec deviation.

### 8.2 Post-merge-to-main (CI verification)

- [ ] A test PR against `main` from a branch opens and the CI workflow runs automatically
- [ ] All four PR jobs (`quick-check`, `build`, `security-scan`, `dependency-scan`, `pr-title`) complete and report status on the PR
- [ ] Branch protection is enabled per §4.6 — the test PR cannot merge until all checks pass
- [ ] Merging the test PR triggers the `release` workflow on `main`
- [ ] First release creates tag `v1.0.0` and a GitHub Release at `github.com/sbouwer/pleks/releases/tag/v1.0.0` with auto-generated notes
- [ ] No commits are pushed back to `main` by the release workflow (D-CI-10 — the workflow only tags)
- [ ] A subsequent no-op push to `main` (e.g. `chore: tidy comment`) does NOT produce a new release (chore = no-release per §4.2.1)

### 8.3 Post-merge weekly verification (Dependabot)

- [ ] Within 7 days of merge, Dependabot opens at least one grouped PR for npm dependencies
- [ ] The Dependabot PR passes CI (lint, typecheck, build, security:ci, trivy)
- [ ] The Dependabot PR title matches conventional commit format (`chore(deps): ...`)
- [ ] Merging a Dependabot PR does NOT trigger a release (because `chore` is configured as no-release in §4.2.1)

### 8.4 Rollback test

- [ ] Any tagged release can be rolled back in Vercel by pinning the production deployment to the previous tag's commit SHA (no extra spec work needed — this is Vercel-native)

---

## 9 · Rollback procedure

If CI/CD turns out to be more friction than value:

1. Disable the branch protection rule / ruleset on `main` (temporarily) via Settings → Rules or Settings → Branches.
2. Push a `chore(ci): disable auto-release` commit that deletes `.github/workflows/release.yml` (keeping `ci.yml` is still valuable for lint/typecheck gating).
3. Or, more radically: delete all of `.github/` with a single commit `chore(ci): remove automation`.

Nothing on the filesystem outside `.github/`, `.releaserc.json`, and `.nvmrc` is load-bearing on this system. Rollback is a 5-minute job.

Conventional commit discipline is a human habit and can be softened by relaxing the `pr-title` job's required-status-check entry without removing the workflow.

---

## 10 · Open decisions

1. **Initial semver.** Spec says `1.0.0` (D-CI-11). Alternative: stay `0.x` until first paying agency. Lean: ship as `1.0.0` — the product is production-intent from day one of BUILD_62 onward.
2. **CI security scan secrets.** `CI_SUPABASE_URL` / `CI_SUPABASE_SERVICE_ROLE_KEY` optional at Tier 1. If never set, the security job becomes a no-op pass. Lean: set them against a dedicated dev Supabase project within the first week post-merge, so the continuous static-RLS signal kicks in.
3. **Pre-commit hooks (Husky or lefthook).** Could run `npm run check` locally before every commit. Adds setup step for every new clone. Lean: skip for Tier 1 — the pr-title job plus branch protection catches everything at the PR boundary anyway. Revisit in Tier 3 if team grows.
4. **Vercel preview URL → full security audit.** Tier 2 extension: hit the Vercel preview URL per-PR with the full `security` audit (localhost-bound categories 3, 4, 6, 8, 9, 12). Gives continuous end-to-end coverage. Needs Vercel deployment-ready hook + preview URL extraction. Defer until Tier 2.
5. **Release candidate branches.** Adding a `next` or `rc` branch lets you cut beta releases. Zero current need. Lean: single-branch until real need appears.
6. **Code signing on releases.** Signed Git tags require GPG/SSH key on the runner. Low value at Phase 1. Defer indefinitely.
7. **Schema-drift check in CI.** The repo has a `schema-drift-report.md` at root — suggests there's been drift between live Supabase and migration files. A CI job that runs `supabase db diff` could catch this continuously. Separate spec; depends on Supabase CLI being configured in CI and a way to snapshot production schema safely. Not Tier 1.

---

## 11 · Files produced by this spec (inventory)

Files CC creates (all new):

| Path | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Per-PR lint, typecheck, build, security, dependency-CVE, pr-title |
| `.github/workflows/release.yml` | On main push: gate on CI, then semantic-release (tag + GitHub Release only, no pushes back) |
| `.github/workflows/pr-title.yml` | Re-validate PR title on edit |
| `.github/dependabot.yml` | Weekly npm + monthly actions updates, grouped |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR checklist + spec reference prompt |
| `.releaserc.json` | semantic-release plugin config (commit-analyzer, release-notes-generator, github) |
| `.trivyignore` | Accepted-risk CVE register with justification + expiration (created when first suppression is needed) |
| `.nvmrc` | Node version (`20`) |

Files CC modifies:

| Path | Change |
|------|--------|
| `package.json` | Add `engines.node`, bump `version` to `1.0.0`, add `security:ci` script, add semantic-release devDependencies |
| `package-lock.json` | Regenerated by `npm install` |
| `scripts/security/audit.mjs` | Add `--ci` flag for localhost-free category subset (cats 1, 2, 5, 7) |
| `CLAUDE.md` (or the canonical CC instruction file) | Append conventional-commits standing instruction (§4.9) |

Tasks that require GitHub UI access (Stéan, not CC):

- Settings → General → Pull Requests (enable squash-only, auto-delete branches)
- Settings → Actions → General (read/write permissions, allow PR creation)
- Settings → Branches (or Rulesets) → Branch protection on `main` per §4.6
- Settings → Environments → create `production`
- Settings → Secrets (optional) → `CI_SUPABASE_URL`, `CI_SUPABASE_SERVICE_ROLE_KEY`

---

## 12 · Follow-ons (referenced from open decisions)

- **ADDENDUM_00E — Test harness + test matrix.** Triggered by the first vitest-bearing build. Adds Tier 2 scope: `test` CI job, Codecov upload, Node 20×22 matrix.
- **ADDENDUM_00F — Preview-URL security scan.** Runs full `npm run security` against Vercel preview URLs per PR. Needs Vercel GitHub integration webhook or API to resolve the preview URL post-deploy.
- **ADDENDUM_00G — Schema drift CI check.** `supabase db diff` against a reference snapshot, flagged by the existing `schema-drift-report.md`.

---

*End of ADDENDUM_00D_CI_CD.md*

## 13 · Known gotchas

### 13.1 Claude Code worktree as phantom submodule

**Symptom:** `actions/checkout@v4`'s cleanup step runs `git submodule foreach --recursive`, which exits 128 with `fatal: No url found for submodule path '.claude/worktrees/<id>' in .gitmodules`. Every PR fails at the checkout step.

**Cause:** Claude Code creates a git worktree under `.claude/worktrees/` via `git worktree add`. Git's index auto-detects the nested `.git` file and records the path as a submodule-mode tree entry — but never writes a corresponding entry in `.gitmodules`. The result is a phantom submodule: tracked in the index, invisible to the user, explosive on CI.

**Fix applied (commit `54ecbf0`):**
1. `git rm --cached -rf .claude/worktrees/agent-*` — removes the phantom entry from the index.
2. `.claude/` added to `.gitignore` — prevents recurrence if CC creates a new worktree.

**Prevention for future repos:** add `.claude/` to `.gitignore` before the first commit. If CC is used in a repo that already has commits, run `git status --short` and look for entries with a lowercase `m` prefix — those are submodule-mode paths and should be treated with suspicion.
