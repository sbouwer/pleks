/**
 * components/ui/actions/Modal.tsx — light modal that matches the page theme
 *
 * Notes:  Pleks chrome (amber baseline, card-grammar header, close button). Portals to
 *         document.body wrapped in a `.pleks-portal[data-theme]` shell (display:contents) so
 *         (a) the fixed backdrop escapes any ancestor containing-block (an ancestor with
 *         backdrop-filter/transform would otherwise trap it inside <main>, below the sticky
 *         header — leaving the header unblurred), and (b) it still inherits the portal theme
 *         instead of leaking the dark <html> styles. For complex dialogs, compose manually.
 *         Pair with ActionButton tone="destructive" for confirm-cancel flows.
 */
"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalTheme } from "@/components/layout/PortalThemeProvider";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function Modal({ open, onClose, title, icon, children, actions, className }: Props) {
  const { theme } = usePortalTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    // display:contents wrapper carries data-theme + inherited CSS vars to the portaled backdrop
    // without generating a box; the fixed backdrop is now a direct child of <body>.
    <div className="pleks-portal" data-theme={theme} style={{ display: "contents" }}>
      <div className="pa-modal-backdrop" onClick={onClose} role="presentation">
        <div
          className={cn("pa-modal", className)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pa-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pa-modal-head">
            {icon ?? null}
            <div className="pa-modal-title" id="pa-modal-title">{title}</div>
            <button className="pa-modal-close" onClick={onClose} aria-label="Close">
              <X aria-hidden />
            </button>
          </div>
          <div className="pa-modal-body">{children}</div>
          {actions ? <div className="pa-modal-actions">{actions}</div> : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
