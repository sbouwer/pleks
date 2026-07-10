/**
 * lib/comms/templates/system-email.tsx — the central branded shell for ad-hoc system emails
 *
 * Data:   Branding is injected by sendEmail (org branding, else Pleks defaults) — never by the caller.
 * Notes:  Callers that don't have a bespoke React Email template pass an HTML FRAGMENT as
 *         sendEmail({ contentHtml }); sendEmail renders it through this component so every such email
 *         gets the same EmailLayout chrome, logo, accent colour and footer. Before this existed, ad-hoc
 *         senders hand-rolled bare <p> fragments or their own <!DOCTYPE> documents and shipped unbranded.
 *
 *         The fragment is caller-authored, never recipient-supplied — dangerouslySetInnerHTML is safe here
 *         and is the point: these bodies are composed in code, not from user input.
 */
import { EmailLayout, type OrgBranding } from "./layout"

export function SystemEmail({
  preview, branding, contentHtml,
}: Readonly<{ preview: string; branding: OrgBranding; contentHtml: string }>) {
  return (
    <EmailLayout preview={preview} branding={branding}>
      <div dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </EmailLayout>
  )
}
