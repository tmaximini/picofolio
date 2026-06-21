import type { ReactNode } from "react";
import { Card } from "./Card";

type EmptyStateProps = {
  title: ReactNode;
  body?: ReactNode;
  /** Optional CTA(s) rendered under the body — e.g. a Button or two. */
  action?: ReactNode;
  /** Render without the surrounding Card (when the caller already provides one). */
  bare?: boolean;
};

/**
 * The standard "nothing here yet" panel — centered display title, muted body,
 * optional action. Reuses the `.emptyState` tokens already used across the app
 * so every empty view reads the same. Wrapped in a Card unless `bare`.
 */
export function EmptyState({ title, body, action, bare }: EmptyStateProps) {
  const inner = (
    <div className="emptyState">
      <div className="emptyState__title">{title}</div>
      {body && <div className="emptyState__body">{body}</div>}
      {action && <div className="emptyState__action">{action}</div>}
    </div>
  );
  return bare ? inner : <Card>{inner}</Card>;
}
