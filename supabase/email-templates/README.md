# Pleks — Supabase auth email templates

Branded HTML for the Supabase **Authentication → Emails** templates. These are the platform
(Pleks-brand) auth emails — distinct from the org-branded transactional emails (`lib/comms/templates/`),
which inject each agency's logo/accent at send time.

## Where to paste

Supabase Dashboard → **Authentication → Emails** (per project: production + any staging). For each
template below, paste the HTML body and set the subject. Supabase renders Go template variables
(`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`, `{{ .NewEmail }}`) server-side.

| Supabase template      | File                   | Subject                          |
|------------------------|------------------------|----------------------------------|
| Magic Link             | `magic-link.html`      | `Your Pleks sign-in link`        |
| Confirm signup         | `confirm-signup.html`  | `Confirm your Pleks account`     |
| Invite user            | `invite.html`          | `You've been invited to Pleks`   |
| Reset Password         | `reset-password.html`  | `Reset your Pleks password`      |
| Change Email Address   | `change-email.html`    | `Confirm your new Pleks email`   |
| Reauthentication       | `reauthentication.html`| `Your Pleks verification code`   |

## Which actually fire today

- **Magic Link** — the live one. Used by both the login "email me a link" flow **and** the soft
  email-verification (`sendEmailVerification` → `signInWithOtp` → `/auth/callback?verify_email=1`). Copy is
  deliberately neutral ("access your account") so it reads correctly for both.
- **Confirm signup / Invite** — usually dormant: Pleks creates accounts via `admin.createUser({ email_confirm: true })`
  and runs its own invite flow (`lib/actions/invite.ts`). Branded anyway so nothing off-brand can slip out.
- **Reset Password / Change Email / Reauthentication** — fire on those Supabase-native actions.

## Redirect URLs (required for the links to work)

Supabase → **Authentication → URL Configuration → Redirect URLs** must allow the callback for every
environment, or the link errors / falls back to the Site URL:

```
http://localhost:3000/auth/callback
https://app.pleks.co.za/auth/callback
https://<vercel-preview>/auth/callback   (optional, for preview testing)
```

## Brand tokens (kept in sync with the app)

- Accent (top rule + wordmark): **`#E8A838`** — `--brand` / `--brand-rgb 232,168,56` in `app/globals.css`.
- Primary button: **dark `#18181b`** with white text — the app's "dark → amber-hover" primary. (White-on-amber
  fails contrast, so the amber is the accent, not the button fill. Swap the button `background` to `#E8A838`
  with `color:#18181b` if you ever want an amber button.)
- Body `#f4f4f5`, card `#ffffff` (radius 8, 600px), code chip on warm paper `#faf9f5`.
- System font stack only; no web fonts, no `oklch()` — must render on Gmail Go / Samsung Email.

Edit a token here → reflect it in `app/globals.css` (and vice-versa). These files are the source of record
for the auth-email look; paste into Supabase after any change.
