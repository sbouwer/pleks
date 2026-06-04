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
type Size = "sm" | "md";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  /** "md" (default) is the standard action size; "sm" for compact inline contexts (form rows, dense toolbars). */
  size?: Size;
  icon?: React.ReactNode;
  asChild?: boolean;
};

const toneClass: Record<Tone, string> = {
  primary: "pa-primary",
  secondary: "pa-secondary",
  destructive: "pa-destructive",
};

export const ActionButton = React.forwardRef<HTMLButtonElement, Props>(
  function ActionButton({ tone = "secondary", size = "md", icon, asChild, className, children, ...rest }, ref) {
    const hasIcon = !!icon;
    const classes = cn(toneClass[tone], size === "sm" && "pa-sm", hasIcon && tone === "primary" && "has-icon", className);

    // asChild: render the single child element (e.g. a next/link <Link>) with the action-language
    // classes applied — for nav buttons that must be an <a>. The icon/<span> wrapper is skipped;
    // the child supplies its own content.
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<Record<string, unknown>>;
      return React.cloneElement(child, {
        ...rest,
        className: cn(classes, child.props.className as string | undefined),
      });
    }

    return (
      <button
        ref={ref}
        className={classes}
        {...rest}
      >
        {icon ?? null}
        <span>{children}</span>
      </button>
    );
  }
);
