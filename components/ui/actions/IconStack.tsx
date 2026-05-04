/**
 * components/ui/actions/IconStack.tsx — 36×36 icon button + mono caps caption
 *
 * Notes:  Used on profile cards (landlord, tenant, contractor) for Call / Email /
 *         WhatsApp / More. Don't mix with bare IconButtons in the same row.
 */
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode;
  label: string;
};

export const IconStack = React.forwardRef<HTMLButtonElement, Props>(
  function IconStack({ icon, label, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn("pa-iconstack", className)}
        {...rest}
      >
        <span className="pa-iconstack-icon">{icon}</span>
        <span className="pa-iconstack-label">{label}</span>
      </button>
    );
  }
);
