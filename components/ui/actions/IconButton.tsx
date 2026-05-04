/**
 * components/ui/actions/IconButton.tsx — bare 32×32 icon-only action
 *
 * Notes:  For toolbars and table-row actions. Tooltip via aria-label + native title.
 *         When you need a label below the icon, use IconStack instead.
 */
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: React.ReactNode;
  label: string; // required: provides aria-label and tooltip
};

export const IconButton = React.forwardRef<HTMLButtonElement, Props>(
  function IconButton({ icon, label, className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn("pa-iconbtn", className)}
        {...rest}
      >
        {icon}
      </button>
    );
  }
);
