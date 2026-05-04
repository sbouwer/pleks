/**
 * components/ui/actions/Modal.tsx — light modal that matches the page theme
 *
 * Notes:  Replaces direct shadcn <Dialog> usage with Pleks chrome (4px amber baseline,
 *         icon + title, close button). Renders its own backdrop — not a Portal — so it
 *         inherits the page theme instead of leaking dark styles from <html class="dark">.
 *         For complex dialogs, compose Modal.Body manually.
 *         Pair with ActionButton tone="destructive" for confirm-cancel flows.
 */
"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
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
  );
}
