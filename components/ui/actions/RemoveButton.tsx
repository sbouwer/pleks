/**
 * components/ui/actions/RemoveButton.tsx — borderless trash, NO confirm
 *
 * Notes:  For light, in-form "remove a row" actions (a phone, an email, a list line) where the
 *         row is just dropped from local state and persisted on Save — a confirm modal would be
 *         heavy/wrong there. For destructive / already-persisted deletes (archive a supplier,
 *         delete a record), use DeleteButton instead (it has a built-in confirm). Borderless trash
 *         with a danger hover; icon mode (default) + label mode, mirroring EditButton.
 */
"use client";
import * as React from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  mode?: "icon" | "label";
  label?: string;
};

export const RemoveButton = React.forwardRef<HTMLButtonElement, Props>(
  function RemoveButton({ mode = "icon", label = "Remove", className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={mode === "icon" ? label : undefined}
        className={cn("pa-edit pa-remove", mode === "label" && "with-label", className)}
        {...rest}
      >
        <Trash2 aria-hidden />
        {mode === "label" ? <span>{label}</span> : null}
      </button>
    );
  }
);
