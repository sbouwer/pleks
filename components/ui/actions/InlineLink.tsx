/**
 * components/ui/actions/InlineLink.tsx — amber forward-navigation link with arrow
 *
 * Notes:  For navigation only. If it commits to a server action, use ActionButton.
 *         Wraps next/link if `href` is internal — pass `external` to force <a target>.
 */
"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  href: string;
  children: React.ReactNode;
  withArrow?: boolean;
  external?: boolean;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

export function InlineLink({ href, children, withArrow = true, external, className, onClick }: Props) {
  const content = (
    <>
      <span>{children}</span>
      {withArrow ? (
        <span className="pa-link-arrow"><ArrowRight aria-hidden /></span>
      ) : null}
    </>
  );

  if (external) {
    return (
      <a className={cn("pa-link", className)} href={href} target="_blank" rel="noreferrer noopener" onClick={onClick}>
        {content}
      </a>
    );
  }
  return (
    <Link className={cn("pa-link", className)} href={href} onClick={onClick}>
      {content}
    </Link>
  );
}
