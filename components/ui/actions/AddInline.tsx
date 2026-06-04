/**
 * components/ui/actions/AddInline.tsx — canonical in-card "add a row" affordance
 *
 * Notes:  The lighter sibling of AddButton. AddButton (components/ui/add-button) is the prominent
 *         page / empty-state CTA (dark fill, amber hover); AddInline is the ghost "+ add another …"
 *         used INSIDE cards and form sections. It's a thin semantic wrapper over ActionButton
 *         tone="secondary" with a leading plus — so it inherits the ghost + amber-bracket-hover
 *         action-language look. Replaces the old bespoke dashed-border inline add buttons.
 */
"use client";
import * as React from "react";
import { Plus } from "lucide-react";
import { ActionButton } from "./Button";

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** the affordance text, e.g. "Add a person" */
  label: string;
  /** "md" (default) or "sm" for compact rows — forwarded to ActionButton. */
  size?: "sm" | "md";
};

export const AddInline = React.forwardRef<HTMLButtonElement, Props>(
  function AddInline({ label, size, ...rest }, ref) {
    return (
      <ActionButton ref={ref} type="button" tone="secondary" size={size} icon={<Plus />} {...rest}>
        {label}
      </ActionButton>
    );
  }
);
