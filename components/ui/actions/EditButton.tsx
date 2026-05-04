/**
 * components/ui/actions/EditButton.tsx — pencil-icon edit affordance
 *
 * Notes:  Two modes — `icon` (default, for card headers and list rows) and `label`
 *         (for action bars and detached modal triggers). Always a pencil. Never just text.
 */
"use client";
import * as React from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  mode?: "icon" | "label";
  label?: string;
};

export const EditButton = React.forwardRef<HTMLButtonElement, Props>(
  function EditButton({ mode = "icon", label = "Edit", className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={mode === "icon" ? label : undefined}
        className={cn("pa-edit", mode === "label" && "with-label", className)}
        {...rest}
      >
        <Pencil aria-hidden />
        {mode === "label" ? <span>{label}</span> : null}
      </button>
    );
  }
);
