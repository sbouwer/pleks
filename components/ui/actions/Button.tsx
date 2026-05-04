/**
 * components/ui/actions/Button.tsx — Pleks action language: Primary / Secondary / Destructive
 *
 * Auth:   none — pure UI primitive
 * Notes:  Replaces shadcn <Button variant="default|outline|ghost|destructive">. The bar/icon
 *         rule is enforced by .has-icon — pass an icon and the 3px ink bar is hidden.
 */
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "secondary" | "destructive";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  icon?: React.ReactNode;
  asChild?: boolean;
};

const toneClass: Record<Tone, string> = {
  primary: "pa-primary",
  secondary: "pa-secondary",
  destructive: "pa-destructive",
};

export const ActionButton = React.forwardRef<HTMLButtonElement, Props>(
  function ActionButton({ tone = "secondary", icon, className, children, ...rest }, ref) {
    const hasIcon = !!icon;
    return (
      <button
        ref={ref}
        className={cn(toneClass[tone], hasIcon && tone === "primary" && "has-icon", className)}
        {...rest}
      >
        {icon ?? null}
        <span>{children}</span>
      </button>
    );
  }
);
